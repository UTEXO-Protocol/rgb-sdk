import { ValidationError } from '@utexo/rgb-sdk-core';
import type {
  FailTransfersRequest,
  InflateAssetIfaRequestModel,
  IssueAssetIfaRequestModel,
  IssueAssetNiaRequestModel,
  ListAssetsOptions,
  Network,
  OnchainReceiveParams,
  OnchainSendRequestModel,
  ReadOptions,
  ReceiveAssignmentKind,
  ReceiveParams,
  RefreshTransfersResult,
  SendBtcBeginRequestModel,
  WalletIdentity,
} from '@utexo/rgb-sdk-core';
import { feeRate, issuanceAmounts, u64 } from './amounts.js';
import {
  configEquals,
  integer,
  resolveConfig,
  splitWalletParams,
  validateWalletParams,
} from './config.js';
import type {
  ResolvedRgbLibWebConfig,
  RgbLibWebOptions,
  RgbLibWebParams,
  RgbLibWebUnlockParams,
} from './config.js';
import {
  RgbLibWebError,
  toArgumentError,
  toBackendError,
  toPublicError,
} from './errors.js';
import { readMnemonic, resolveKeys } from './keys.js';
import type { ResolvedKeys, RgbLibWebKeys } from './keys.js';
import * as map from './mappers.js';
import type { RgbLibWasmRuntime } from './runtime.js';
import { WasmSession } from './session.js';

// Ported from `@utexo/rgb-lib-rn` (`rgb-lib/backend.ts`): the same admission,
// queue, lazy connect and validation rules, over a WasmSession instead of the
// native bridge. Only the 29 SharedWalletApi methods are here.

/** A failed command must not poison the queue. */
class SerialExecutor {
  private tail: Promise<void> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

/** Owns queued inputs so later caller mutations cannot alter a pending call. */
function snapshot<T>(value: T): T {
  if (Array.isArray(value)) return value.map(snapshot) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, snapshot(item)])
    ) as T;
  }
  return value;
}

/** Omitted or null is `false`; anything but a boolean is INVALID_PARAMS. */
function skipSyncOf(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean')
    throw new ValidationError('skipSync must be a boolean', 'skipSync');
  return value;
}
/** Reads that sync first need a connection; `skipSync: true` reads work offline. */
const syncs = (options: { skipSync?: boolean } | null | undefined) =>
  !skipSyncOf(options?.skipSync);

function definedOnly<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

const RECEIVE_KINDS: Record<ReceiveAssignmentKind, 'amount' | 'none'> = {
  Fungible: 'amount',
  InflationRight: 'amount',
  NonFungible: 'none',
  MintRight: 'none',
  Any: 'none',
};

/** The invoice assignment for a receive; the same rules as React Native. */
function resolveReceiveAssignment(
  kind: ReceiveAssignmentKind | undefined,
  amount: number | undefined
): ReceiveAssignmentKind {
  const resolved = kind ?? (amount === undefined ? 'Any' : 'Fungible');
  const rule = RECEIVE_KINDS[resolved];
  if (rule === undefined)
    throw new ValidationError(
      `Unknown assignmentKind: ${String(kind)}`,
      'assignmentKind'
    );
  if (rule === 'amount' && amount === undefined)
    throw new ValidationError(`${resolved} receive requires amount`, 'amount');
  if (rule === 'none' && amount !== undefined)
    throw new ValidationError(`${resolved} receive takes no amount`, 'amount');
  return resolved;
}

/** rgb-lib-wasm has NIA, IFA and BFA; CFA and UDA filters are unsupported input. */
const WASM_SCHEMAS = ['Nia', 'Ifa', 'Bfa'];
function validateAssetSchemas(schemas: unknown): string[] {
  if (schemas === undefined) return [];
  if (!Array.isArray(schemas))
    throw new ValidationError(
      'filterAssetSchemas must be an array',
      'filterAssetSchemas'
    );
  for (const schema of schemas) {
    if (schema === 'Cfa' || schema === 'Uda')
      throw new RgbLibWebError(
        'UNSUPPORTED_CAPABILITY',
        `listAssets: the ${schema} schema is not supported by the rgb-lib-wasm engine`,
        'listAssets'
      );
    if (!WASM_SCHEMAS.includes(schema))
      throw new ValidationError(
        `Unknown asset schema: ${String(schema)}`,
        'filterAssetSchemas'
      );
  }
  return [...schemas];
}

/** One backend owns one WASM wallet, one queue and one wallet profile. */
export class RgbLibWebBackend {
  private readonly queue = new SerialExecutor();
  private readonly params: Readonly<RgbLibWebOptions>;
  private readonly configuredOnline?: Readonly<RgbLibWebUnlockParams>;
  private readonly keys: ResolvedKeys;
  private session?: WasmSession;
  private online?: ResolvedRgbLibWebConfig;
  private identity?: WalletIdentity;
  private opening?: Promise<void>;
  private connecting?: {
    config: ResolvedRgbLibWebConfig;
    promise: Promise<void>;
  };
  private stopping?: Promise<void>;
  /** Accepted, unsettled operations; destroy() waits for all of them. */
  private readonly accepted = new Set<Promise<unknown>>();
  private disposeRequested = false;
  private disposed = false;

  constructor(
    params: RgbLibWebParams,
    keys: RgbLibWebKeys,
    private readonly runtime: RgbLibWasmRuntime
  ) {
    validateWalletParams(params);
    if (
      !runtime ||
      typeof runtime.WasmWallet?.create !== 'function' ||
      typeof runtime.WasmInvoice !== 'function' ||
      typeof runtime.restoreKeys !== 'function'
    ) {
      throw new RgbLibWebError(
        'INVALID_CONFIG',
        'Pass the @utexo/rgb-lib-wasm module (import * as rgbLibWasm from "@utexo/rgb-lib-wasm") as the third argument'
      );
    }
    this.keys = resolveKeys(keys, params.network);
    const { options, connection } = splitWalletParams(params);
    this.params = Object.freeze(options);
    if (connection) {
      const owned = Object.freeze(snapshot(connection));
      // Invalid endpoints fail here, not on the first online operation.
      resolveConfig(owned, params.network, 'constructor');
      this.configuredOnline = owned;
    }
  }

  private get watchOnly(): boolean {
    return !this.keys.readMnemonic;
  }

  get canSignTransactions(): boolean {
    return !this.watchOnly;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get network(): Network {
    return this.params.network;
  }

  private assertAccepting() {
    if (this.disposeRequested || this.disposed) {
      throw new RgbLibWebError(
        'WALLET_DISPOSED',
        'This wallet session is disposed'
      );
    }
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.accepted.add(promise);
    const settle = () => {
      this.accepted.delete(promise);
    };
    void promise.then(settle, settle);
    return promise;
  }

  /** A synchronous throw while reading arguments becomes a rejection. */
  guarded<T>(operation: string, call: () => Promise<T>): Promise<T> {
    try {
      return call();
    } catch (error) {
      return Promise.reject(toArgumentError(error, operation));
    }
  }

  private publicly<T>(operation: string, promise: Promise<T>): Promise<T> {
    return promise.catch((error: unknown) => {
      throw toPublicError(error, operation);
    });
  }

  /** Public entry: admission check, then the tracked operation. */
  private run<T>(
    operation: string,
    requiresOnline: boolean,
    action: (session: WasmSession) => Promise<T>
  ): Promise<T> {
    try {
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(toPublicError(error, operation));
    }
    return this.publicly(
      operation,
      this.track(this.execute(operation, requiresOnline, action))
    );
  }

  private execute<T>(
    operation: string,
    requiresOnline: boolean,
    action: (session: WasmSession) => Promise<T>
  ): Promise<T> {
    // Connect before entering the queue: the connect step queues its own call.
    const ready = requiresOnline
      ? this.connectLazily(operation)
      : Promise.resolve();
    return ready.then(() =>
      this.queue.run(async () => {
        if (!this.session) {
          throw new RgbLibWebError(
            'WALLET_NOT_INITIALIZED',
            'Call init() before this operation',
            operation
          );
        }
        if (requiresOnline && !this.online) {
          throw new RgbLibWebError(
            'WALLET_OFFLINE',
            'Call unlock() before this operation',
            operation
          );
        }
        try {
          return await action(this.session);
        } catch (error) {
          // toPublicError keeps core ValidationErrors as INVALID_PARAMS.
          throw toPublicError(error, operation);
        }
      })
    );
  }

  /**
   * The first operation that needs a connection makes one with the
   * constructor's connection settings, then the network defaults. Regtest is
   * never guessed.
   */
  private async connectLazily(operation: string): Promise<void> {
    const pending = () => this.connecting?.promise;
    if (this.online) return;
    if (pending()) return pending();
    if (this.opening) await this.opening.catch(() => undefined);
    if (this.online || !this.session) return;
    if (pending()) return pending();
    let defaults: ResolvedRgbLibWebConfig | undefined;
    if (this.configuredOnline) {
      defaults = resolveConfig(
        this.configuredOnline,
        this.params.network,
        operation
      );
    } else if (this.params.network !== 'regtest') {
      try {
        defaults = resolveConfig({}, this.params.network, operation);
      } catch {
        defaults = undefined;
      }
    }
    if (!defaults) {
      throw new RgbLibWebError(
        'WALLET_OFFLINE',
        `${operation} needs a connection; on ${this.params.network} call unlock(params) with an Esplora indexer and a proxy first, or pass them to the constructor`,
        operation
      );
    }
    return this.connect(defaults);
  }

  private withOptions<O, T>(
    operation: string,
    requiresOnline: boolean | ((owned: O | undefined) => boolean),
    options: O | undefined,
    action: (session: WasmSession, owned: O | undefined) => Promise<T>
  ): Promise<T> {
    if (options != null && typeof options !== 'object')
      throw new ValidationError(
        `${operation} options must be an object`,
        'options'
      );
    const owned = snapshot(options);
    const online =
      typeof requiresOnline === 'function'
        ? requiresOnline(owned)
        : requiresOnline;
    return this.run(operation, online, (session) => action(session, owned));
  }

  /**
   * A public operation with a params object. Before admission, and so before
   * any connect or WASM call: the params are owned, a signing operation on a
   * watch-only wallet is refused, and `prepare` validates them once.
   */
  private checked<P, T, R = undefined>(
    operation: string,
    requiresOnline: boolean,
    params: P,
    rules: { signs?: boolean; prepare?: (owned: P) => R },
    action: (session: WasmSession, owned: P, prepared: R) => Promise<T>
  ): Promise<T> {
    if (typeof params !== 'object' || params === null)
      throw new ValidationError(`${operation} needs a params object`, 'params');
    const owned = snapshot(params);
    skipSyncOf((owned as { skipSync?: unknown }).skipSync);
    if (rules.signs && this.watchOnly)
      throw new RgbLibWebError(
        'UNSUPPORTED_CAPABILITY',
        `${operation} needs the mnemonic; this RGB_L1 wallet was opened watch-only from public keys`,
        operation
      );
    const prepared = rules.prepare?.(owned) as R;
    return this.run(operation, requiresOnline, (session) =>
      action(session, owned, prepared)
    );
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  init(): Promise<void> {
    try {
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(toPublicError(error, 'init'));
    }
    return this.publicly('init', this.track(this.open()));
  }

  private open(): Promise<void> {
    if (this.opening) return this.opening;
    if (this.session) return Promise.resolve();
    const opening = this.queue.run(async () => {
      let mnemonic: string | null = this.keys.readMnemonic
        ? await readMnemonic(this.keys.readMnemonic, 'init')
        : null;
      try {
        this.session = await WasmSession.open(
          this.runtime,
          {
            network: this.params.network,
            dataDir: this.params.dataDir ?? ':memory:',
            maxAllocationsPerUtxo: this.params.maxAllocationsPerUtxo ?? 5,
            reuseAddresses: this.params.reuseAddresses ?? false,
          },
          mnemonic,
          this.keys.publicKeys
        );
      } catch (error) {
        throw toBackendError(error, 'init');
      } finally {
        mnemonic = null;
      }
      this.identity = {
        id: this.session.identity.id,
        network: this.params.network,
        protocol: 'RGB_L1',
      };
    });
    this.opening = opening;
    const clear = () => {
      if (this.opening === opening) this.opening = undefined;
    };
    void opening.then(clear, clear);
    return opening;
  }

  /** rgb-lib's goOnline; the contract's unlock() is the same call. */
  unlock(
    params: RgbLibWebUnlockParams | undefined,
    operation: 'unlock' | 'goOnline'
  ): Promise<void> {
    let config: ResolvedRgbLibWebConfig;
    try {
      config = this.readConfig(params, operation);
      this.assertAccepting();
    } catch (error) {
      return Promise.reject(toPublicError(error, operation));
    }
    return this.publicly(operation, this.track(this.connect(config)));
  }

  private readConfig(
    params: RgbLibWebUnlockParams | undefined,
    operation: string
  ): ResolvedRgbLibWebConfig {
    try {
      return resolveConfig(
        this.withConfigured(params === undefined ? {} : snapshot(params)),
        this.params.network,
        operation
      );
    } catch (error) {
      throw toArgumentError(error, operation);
    }
  }

  /** Explicit fields override the constructor's connection settings one by one. */
  private withConfigured(owned: RgbLibWebUnlockParams): RgbLibWebUnlockParams {
    if (!this.configuredOnline || owned === null) return owned;
    const explicit = definedOnly(owned);
    const base: Record<string, unknown> = { ...this.configuredOnline };
    if ('indexer' in explicit || 'indexerUrl' in explicit) {
      delete base.indexer;
      delete base.indexerUrl;
    }
    return { ...base, ...explicit } as RgbLibWebUnlockParams;
  }

  private connect(config: ResolvedRgbLibWebConfig): Promise<void> {
    if (this.connecting) {
      return configEquals(this.connecting.config, config)
        ? this.connecting.promise
        : Promise.reject(
            new RgbLibWebError(
              'WALLET_CONFIG_MISMATCH',
              'A different online configuration is already connecting'
            )
          );
    }
    if (this.online) {
      return configEquals(this.online, config)
        ? Promise.resolve()
        : Promise.reject(
            new RgbLibWebError(
              'WALLET_CONFIG_MISMATCH',
              'Destroy and recreate the wallet to change its online configuration'
            )
          );
    }
    const connecting = this.execute('unlock', false, async (session) => {
      await session.goOnline(config);
      this.online = config;
    });
    this.connecting = { config, promise: connecting };
    const clear = () => {
      if (this.connecting?.promise === connecting) this.connecting = undefined;
    };
    void connecting.then(clear, clear);
    return connecting;
  }

  /** Terminal. Waits for accepted work, then flushes and frees the wallet. */
  destroy(): Promise<void> {
    this.disposeRequested = true;
    if (this.disposed) return Promise.resolve();
    if (this.stopping) return this.publicly('destroy', this.stopping);
    const accepted = [...this.accepted];
    const stopping = Promise.allSettled(accepted).then(() =>
      this.queue.run(async () => {
        // A failed flush keeps the wallet, so a retry can flush again.
        if (this.session) await this.session.close();
        this.session = undefined;
        this.identity = undefined;
        this.online = undefined;
        this.disposed = true;
      })
    );
    this.stopping = stopping;
    const clear = () => {
      if (this.stopping === stopping) this.stopping = undefined;
    };
    void stopping.then(clear, clear);
    return this.publicly('destroy', stopping);
  }

  // ── network ───────────────────────────────────────────────────────────────

  getWalletIdentity(): Promise<WalletIdentity> {
    return this.run('getWalletIdentity', false, async () => ({
      ...this.identity!,
    }));
  }

  /** rgb-lib-wasm has no block-height call: `blockHeight` is left out, as on React Native. */
  getNetworkInfo() {
    return this.run('getNetworkInfo', true, async () => ({
      network: this.params.network,
    }));
  }

  // ── bitcoin ───────────────────────────────────────────────────────────────

  getAddress(): Promise<string> {
    return this.run('getAddress', false, (s) => s.getAddress());
  }

  getBtcBalance(options?: ReadOptions) {
    return this.withOptions(
      'getBtcBalance',
      syncs,
      options,
      async (s, owned) => {
        const value = await s.getBtcBalance(skipSyncOf(owned?.skipSync));
        return {
          vanilla: map.balance(value.vanilla),
          colored: map.balance(value.colored),
        };
      }
    );
  }

  listUnspents(options?: ReadOptions) {
    return this.withOptions('listUnspents', syncs, options, async (s, owned) =>
      (await s.listUnspents(skipSyncOf(owned?.skipSync))).map(map.unspent)
    );
  }

  createUtxos(
    params: {
      upTo?: boolean;
      num?: number;
      size?: number;
      feeRate?: number;
    } & ReadOptions
  ): Promise<number> {
    return this.checked(
      'createUtxos',
      true,
      params,
      {
        signs: true,
        prepare: (p) => ({
          num: p.num === undefined ? null : integer(p.num, 'num', 1, 255),
          size:
            p.size === undefined
              ? null
              : integer(p.size, 'size', 1, 0xffffffff),
          feeRate: feeRate(p.feeRate),
        }),
      },
      (s, p, v) =>
        s.createUtxos(
          p.upTo ?? true,
          v.num,
          v.size,
          v.feeRate,
          skipSyncOf(p.skipSync)
        )
    );
  }

  sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    return this.checked(
      'sendBtc',
      true,
      params,
      {
        signs: true,
        prepare: (p) => ({
          amount: u64(p.amount, 'amount', true),
          feeRate: feeRate(p.feeRate),
        }),
      },
      (s, p, v) =>
        s.sendBtc(p.address, v.amount, v.feeRate, skipSyncOf(p.skipSync))
    );
  }

  estimateFeeRate(blocks: number) {
    const checked = integer(blocks, 'blocks', 1, 0xffff);
    return this.run('estimateFeeRate', true, async (s) => {
      const estimate = await s.estimateFeeRate(checked);
      if (
        typeof estimate !== 'number' ||
        !Number.isFinite(estimate) ||
        estimate <= 0 ||
        estimate > Number.MAX_SAFE_INTEGER
      ) {
        throw new RgbLibWebError(
          'INVALID_NATIVE_RESPONSE',
          'Invalid fee estimation'
        );
      }
      // A recommendation; explicit send inputs are never rounded.
      return { feeRate: Math.ceil(estimate) };
    });
  }

  // ── rgb assets ────────────────────────────────────────────────────────────

  listAssets(options?: ListAssetsOptions) {
    return this.withOptions('listAssets', false, options, async (s, owned) => {
      // Validated in the queue, as on React Native; nothing has run yet.
      const schemas = validateAssetSchemas(owned?.filterAssetSchemas);
      return map.assets(await s.listAssets(schemas));
    });
  }

  getAssetBalance(assetId: string) {
    return this.run('getAssetBalance', false, async (s) =>
      map.balance(await s.getAssetBalance(assetId))
    );
  }

  issueAssetNia(params: IssueAssetNiaRequestModel) {
    return this.checked(
      'issueAssetNia',
      false,
      params,
      {
        prepare: (p) => ({
          amounts: issuanceAmounts(p.amounts).amounts,
          precision: integer(p.precision, 'precision', 0, 18),
        }),
      },
      async (s, p, v) =>
        map.nia(await s.issueAssetNia(p.ticker, p.name, v.precision, v.amounts))
    );
  }

  issueAssetIfa(params: IssueAssetIfaRequestModel) {
    return this.checked(
      'issueAssetIfa',
      false,
      params,
      {
        prepare: (p) => ({
          ...issuanceAmounts(p.amounts, p.inflationAmounts),
          precision: integer(p.precision, 'precision', 0, 18),
        }),
      },
      async (s, p, v) =>
        map.ifa(
          await s.issueAssetIfa(
            p.ticker,
            p.name,
            v.precision,
            v.amounts,
            v.inflationAmounts,
            p.rejectListUrl ?? null
          )
        )
    );
  }

  inflate(params: InflateAssetIfaRequestModel) {
    return this.checked(
      'inflate',
      true,
      params,
      {
        signs: true,
        prepare: (p) => ({
          amounts: p.inflationAmounts.map((n) =>
            u64(n, 'inflationAmount', true)
          ),
          feeRate: feeRate(p.feeRate),
          minConfirmations: integer(
            p.minConfirmations ?? 1,
            'minConfirmations',
            1,
            255
          ),
        }),
      },
      async (s, p, v) =>
        map.operation(
          await s.inflate(p.assetId, v.amounts, v.feeRate, v.minConfirmations)
        )
    );
  }

  receive(
    operation: 'blindReceive' | 'witnessReceive' | 'onchainReceive',
    witness: boolean | undefined,
    params: ReceiveParams & { witness?: boolean }
  ) {
    return this.checked(
      operation,
      true,
      params,
      {
        prepare: (p) => ({
          witness: witness ?? p.witness ?? true,
          duration: integer(
            p.durationSeconds ?? 86400,
            'durationSeconds',
            1,
            0xffffffff
          ),
          assignmentKind: resolveReceiveAssignment(p.assignmentKind, p.amount),
          amount: p.amount === undefined ? null : u64(p.amount, 'amount', true),
          minConfirmations: integer(
            p.minConfirmations ?? 0,
            'minConfirmations',
            0,
            255
          ),
        }),
      },
      async (s, p, v) =>
        map.receive(
          await s.receive(
            v.witness,
            p.assetId ?? null,
            v.assignmentKind,
            v.amount,
            // The expiry starts when the invoice is made.
            u64(
              Math.floor(Date.now() / 1000) + v.duration,
              'expirationTimestamp'
            ),
            [this.online!.proxyEndpoint],
            v.minConfirmations
          )
        )
    );
  }

  onchainReceive(params: OnchainReceiveParams) {
    return this.receive('onchainReceive', undefined, params);
  }

  decodeRGBInvoice(params: { invoice: string }) {
    if (typeof params !== 'object' || params === null)
      throw new ValidationError(
        'decodeRGBInvoice needs a params object',
        'params'
      );
    const { invoice } = params;
    if (typeof invoice !== 'string' || invoice.length === 0)
      throw new ValidationError(
        'invoice must be a non-empty string',
        'invoice'
      );
    return this.run('decodeRGBInvoice', false, async (s) =>
      map.invoice(await s.decodeInvoice(invoice), invoice)
    );
  }

  onchainSend(params: OnchainSendRequestModel) {
    return this.checked(
      'onchainSend',
      true,
      params,
      {
        signs: true,
        prepare: (p) => {
          // The send always syncs; skipSync: true is refused, not ignored.
          if (p.skipSync === true)
            throw new RgbLibWebError(
              'UNSUPPORTED_CAPABILITY',
              'onchainSend always syncs on RGB_L1; skipSync: true is not supported',
              'onchainSend'
            );
          return {
            amount:
              p.amount === undefined ? null : u64(p.amount, 'amount', true),
            witnessAmount: p.witnessData
              ? u64(p.witnessData.amountSat, 'witness amount', true)
              : null,
            blinding:
              p.witnessData?.blinding === undefined
                ? null
                : u64(p.witnessData.blinding, 'blinding'),
            feeRate: feeRate(p.feeRate),
            minConfirmations: integer(
              p.minConfirmations ?? 1,
              'minConfirmations',
              1,
              255
            ),
          };
        },
      },
      async (s, p, v) =>
        map.operation(
          await s.send(
            p.invoice,
            p.assetId ?? null,
            v.amount,
            v.witnessAmount,
            v.blinding,
            p.donation ?? false,
            v.feeRate,
            v.minConfirmations,
            this.online!.proxyEndpoint
          )
        )
    );
  }

  failTransfers(params: FailTransfersRequest) {
    return this.checked(
      'failTransfers',
      true,
      params,
      {
        prepare: (p) =>
          p.batchTransferIdx === undefined
            ? null
            : integer(p.batchTransferIdx, 'batchTransferIdx', 1, 0x7fffffff),
      },
      (s, p, batchTransferIdx) =>
        s.failTransfers(
          batchTransferIdx,
          p.noAssetOnly ?? false,
          skipSyncOf(p.skipSync)
        )
    );
  }

  // ── history ───────────────────────────────────────────────────────────────

  listTransfers(assetId?: string) {
    if (assetId !== undefined && typeof assetId !== 'string')
      throw new ValidationError('assetId must be a string', 'assetId');
    return this.run('listTransfers', false, async (s) =>
      (await s.listTransfers(assetId ?? null)).map(map.transfer)
    );
  }

  listTransactions(options?: ReadOptions) {
    return this.withOptions(
      'listTransactions',
      syncs,
      options,
      async (s, owned) =>
        (await s.listTransactions(skipSyncOf(owned?.skipSync))).map(
          map.transaction
        )
    );
  }

  private async refreshed(
    s: WasmSession,
    skipSync: boolean
  ): Promise<RefreshTransfersResult> {
    return {
      transfers: Object.fromEntries(
        (await s.refresh(skipSync)).map((item) => [
          item.batchTransferIdx,
          {
            updatedStatus:
              item.updatedStatus === null
                ? undefined
                : map.transferStatus(item.updatedStatus),
            failure:
              item.failure === null
                ? undefined
                : map.refreshFailure(item.failure),
          },
        ])
      ),
    };
  }

  refresh(options?: ReadOptions) {
    return this.withOptions(
      'refresh',
      // Always online; the flag is checked here, before any connect.
      (owned) => (skipSyncOf(owned?.skipSync), true),
      options,
      (s, owned) => this.refreshed(s, skipSyncOf(owned?.skipSync))
    );
  }

  refreshWallet(): Promise<void> {
    return this.run('refreshWallet', true, (s) =>
      this.refreshed(s, false)
    ).then(() => undefined);
  }

  syncWallet(): Promise<void> {
    return this.run('syncWallet', true, (s) => s.sync());
  }
}
