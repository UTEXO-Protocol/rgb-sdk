/**
 * `UTEXOWallet` — one wallet API over one engine the app created.
 *
 * The facade does not pick, import or construct engines. It checks the
 * engine's contract version, forwards the shared API, and exposes the
 * engine's own extensions (with their exact types) only when the engine has
 * them. Errors pass through unchanged: engines already normalize them.
 */

import { assertEngineContract } from '@utexo/rgb-sdk-core';
import type {
  BurnApi,
  ConsignmentApi,
  ConsignmentFileApi,
  EngineCapabilities,
  FileBackupApi,
  MessageSigningApi,
  RestartableWalletApi,
  SharedWalletApi,
  VssBackupApi,
  VssFenceApi,
  WalletMaintenanceApi,
} from '@utexo/rgb-sdk-core';
import { UTEXOWalletError } from './errors.js';

/** Contract versions this facade accepts. */
export const ACCEPTED_CONTRACT_VERSIONS = ['1'] as const;

/** Any engine that implements the shared contract. */
// The unlock parameters are engine-specific; `any` lets each engine's own type through.
export type AnyEngine = SharedWalletApi<any>;

/**
 * The parameters of `engine.unlock()`. For an overloaded `unlock` this is
 * the last overload only; the facade's own `unlock` keeps all of them.
 */
export type UnlockParamsOf<E extends AnyEngine> = Parameters<E['unlock']>[0];

/**
 * Methods the facade forwards when, and only when, the engine has them:
 * the core extensions plus `goOnline` (architecture §2.6).
 */
export const FORWARDED_EXTENSION_METHODS = [
  // RestartableWalletApi
  'shutdown',
  'reinit',
  // FileBackupApi
  'createBackup',
  // WalletMaintenanceApi
  'drainTo',
  'deleteTransfers',
  // BurnApi, ConsignmentApi
  'getBfaCapabilities',
  'burn',
  'getConsignment',
  // ConsignmentFileApi
  'getConsignmentPath',
  // VssBackupApi, VssFenceApi
  'backupNow',
  'vssClearFence',
  // MessageSigningApi
  'signMessage',
  'verifyMessage',
  // Older engines connect with goOnline(); forwarded as is.
  'goOnline',
] as const;

export type ForwardedExtensionMethod =
  (typeof FORWARDED_EXTENSION_METHODS)[number];

// Every method of every core extension must be in the list above.
type AllExtensionMethods = keyof (RestartableWalletApi<unknown> &
  FileBackupApi &
  WalletMaintenanceApi &
  BurnApi &
  ConsignmentApi &
  ConsignmentFileApi &
  VssBackupApi &
  VssFenceApi &
  MessageSigningApi);
type MissingExtensionMethods = Exclude<
  AllExtensionMethods,
  ForwardedExtensionMethod
>;
const extensionListIsComplete: [MissingExtensionMethods] extends [never]
  ? true
  : MissingExtensionMethods = true;
void extensionListIsComplete;

/**
 * The extension methods engine `E` has, with the engine's own signatures.
 * Read-only: the facade defines them as non-writable properties.
 */
export type EngineExtensions<E> = {
  readonly [
    K in Extract<keyof E, ForwardedExtensionMethod> as E[K] extends (
      ...args: never[]
    ) => unknown
      ? K
      : never
  ]: E[K];
};

/** Methods of the shared contract, as data. Checked against the type below. */
const SHARED_METHODS = [
  'init',
  'unlock',
  'destroy',
  'isDisposed',
  'getNetwork',
  'getNetworkInfo',
  'getWalletIdentity',
  'getAddress',
  'getBtcBalance',
  'listUnspents',
  'sendBtc',
  'createUtxos',
  'estimateFeeRate',
  'listAssets',
  'getAssetBalance',
  'issueAssetNia',
  'issueAssetIfa',
  'inflate',
  'blindReceive',
  'witnessReceive',
  'decodeRGBInvoice',
  'failTransfers',
  'onchainReceive',
  'onchainSend',
  'listTransfers',
  'listTransactions',
  'refreshWallet',
  'syncWallet',
] as const satisfies readonly (keyof AnyEngine)[];

type SharedMethodKeys = {
  [K in keyof AnyEngine]-?: AnyEngine[K] extends (...args: never[]) => unknown
    ? K
    : never;
}[keyof AnyEngine];
type MissingSharedMethods = Exclude<
  SharedMethodKeys,
  (typeof SHARED_METHODS)[number]
>;
const sharedListIsComplete: [MissingSharedMethods] extends [never]
  ? true
  : MissingSharedMethods = true;
void sharedListIsComplete;

export interface UTEXOWalletOptions<E extends AnyEngine> {
  /**
   * The engine, created by the app (for example `new RgbLibWallet(...)`).
   * The facade owns its session from here on.
   */
  engine: E;
}

/**
 * Calls `engine[name]` with every argument, on the engine, and returns its
 * result (or throws its error) unchanged.
 */
// The caller's own signature states the result type.
type Forwarded = any;

function forward(engine: object, name: string, args: unknown[]): Forwarded {
  const method = (engine as Record<string, unknown>)[name] as (
    ...a: unknown[]
  ) => unknown;
  return method.apply(engine, args);
}

class UTEXOWalletBase<E extends AnyEngine> {
  readonly #engine: E;

  constructor(options: UTEXOWalletOptions<E>) {
    if (typeof options !== 'object' || options === null) {
      throw new UTEXOWalletError(
        'INVALID_CONFIG',
        'UTEXOWallet needs an options object: new UTEXOWallet({ engine })'
      );
    }
    const engine: unknown = options.engine;
    if (typeof engine !== 'object' || engine === null) {
      throw new UTEXOWalletError(
        'INVALID_CONFIG',
        'UTEXOWallet needs an engine: new UTEXOWallet({ engine })'
      );
    }
    // Before anything else touches the engine: reads only contractVersion
    // and protocol.
    assertEngineContract(engine, ACCEPTED_CONTRACT_VERSIONS);
    const record = engine as Record<string, unknown>;
    const missing = SHARED_METHODS.filter(
      (name) => typeof record[name] !== 'function'
    );
    if (missing.length > 0) {
      throw new UTEXOWalletError(
        'INVALID_CONFIG',
        `The engine is missing shared methods: ${missing.join(', ')}`,
        { protocol: record.protocol }
      );
    }
    this.#engine = engine as E;

    for (const name of FORWARDED_EXTENSION_METHODS) {
      if (typeof record[name] !== 'function') continue;
      Object.defineProperty(this, name, {
        value: (...args: unknown[]) => forward(engine, name, args),
        enumerable: false,
        writable: false,
        configurable: false,
      });
    }
  }

  /**
   * The wrapped engine. Readable for engine-specific calls; do not init,
   * unlock, stop or destroy it yourself, the facade owns its session.
   */
  get engine(): E {
    return this.#engine;
  }

  get protocol(): E['protocol'] {
    return this.#engine.protocol;
  }

  get contractVersion(): E['contractVersion'] {
    return this.#engine.contractVersion;
  }

  get capabilities(): EngineCapabilities {
    return this.#engine.capabilities;
  }

  get psbt(): E['psbt'] {
    return this.#engine.psbt;
  }

  get beginEnd(): E['beginEnd'] {
    return this.#engine.beginEnd;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  init(...args: Parameters<E['init']>): ReturnType<E['init']> {
    return forward(this.#engine, 'init', args);
  }

  /** Alias of `init()`. */
  initialize(...args: Parameters<E['init']>): ReturnType<E['init']> {
    return this.init(...args);
  }

  unlock(...args: Parameters<E['unlock']>): ReturnType<E['unlock']> {
    return forward(this.#engine, 'unlock', args);
  }

  destroy(...args: Parameters<E['destroy']>): ReturnType<E['destroy']> {
    return forward(this.#engine, 'destroy', args);
  }

  /** Alias of `destroy()`. */
  dispose(...args: Parameters<E['destroy']>): ReturnType<E['destroy']> {
    return this.destroy(...args);
  }

  isDisposed(
    ...args: Parameters<E['isDisposed']>
  ): ReturnType<E['isDisposed']> {
    return forward(this.#engine, 'isDisposed', args);
  }

  // ── Network ───────────────────────────────────────────────────────────────────

  getNetwork(
    ...args: Parameters<E['getNetwork']>
  ): ReturnType<E['getNetwork']> {
    return forward(this.#engine, 'getNetwork', args);
  }

  getNetworkInfo(
    ...args: Parameters<E['getNetworkInfo']>
  ): ReturnType<E['getNetworkInfo']> {
    return forward(this.#engine, 'getNetworkInfo', args);
  }

  getWalletIdentity(
    ...args: Parameters<E['getWalletIdentity']>
  ): ReturnType<E['getWalletIdentity']> {
    return forward(this.#engine, 'getWalletIdentity', args);
  }

  // ── Bitcoin ───────────────────────────────────────────────────────────────────

  getAddress(
    ...args: Parameters<E['getAddress']>
  ): ReturnType<E['getAddress']> {
    return forward(this.#engine, 'getAddress', args);
  }

  getBtcBalance(
    ...args: Parameters<E['getBtcBalance']>
  ): ReturnType<E['getBtcBalance']> {
    return forward(this.#engine, 'getBtcBalance', args);
  }

  listUnspents(
    ...args: Parameters<E['listUnspents']>
  ): ReturnType<E['listUnspents']> {
    return forward(this.#engine, 'listUnspents', args);
  }

  sendBtc(...args: Parameters<E['sendBtc']>): ReturnType<E['sendBtc']> {
    return forward(this.#engine, 'sendBtc', args);
  }

  createUtxos(
    ...args: Parameters<E['createUtxos']>
  ): ReturnType<E['createUtxos']> {
    return forward(this.#engine, 'createUtxos', args);
  }

  estimateFeeRate(
    ...args: Parameters<E['estimateFeeRate']>
  ): ReturnType<E['estimateFeeRate']> {
    return forward(this.#engine, 'estimateFeeRate', args);
  }

  // ── RGB assets ────────────────────────────────────────────────────────────────

  listAssets(
    ...args: Parameters<E['listAssets']>
  ): ReturnType<E['listAssets']> {
    return forward(this.#engine, 'listAssets', args);
  }

  getAssetBalance(
    ...args: Parameters<E['getAssetBalance']>
  ): ReturnType<E['getAssetBalance']> {
    return forward(this.#engine, 'getAssetBalance', args);
  }

  issueAssetNia(
    ...args: Parameters<E['issueAssetNia']>
  ): ReturnType<E['issueAssetNia']> {
    return forward(this.#engine, 'issueAssetNia', args);
  }

  issueAssetIfa(
    ...args: Parameters<E['issueAssetIfa']>
  ): ReturnType<E['issueAssetIfa']> {
    return forward(this.#engine, 'issueAssetIfa', args);
  }

  inflate(...args: Parameters<E['inflate']>): ReturnType<E['inflate']> {
    return forward(this.#engine, 'inflate', args);
  }

  blindReceive(
    ...args: Parameters<E['blindReceive']>
  ): ReturnType<E['blindReceive']> {
    return forward(this.#engine, 'blindReceive', args);
  }

  witnessReceive(
    ...args: Parameters<E['witnessReceive']>
  ): ReturnType<E['witnessReceive']> {
    return forward(this.#engine, 'witnessReceive', args);
  }

  decodeRGBInvoice(
    ...args: Parameters<E['decodeRGBInvoice']>
  ): ReturnType<E['decodeRGBInvoice']> {
    return forward(this.#engine, 'decodeRGBInvoice', args);
  }

  failTransfers(
    ...args: Parameters<E['failTransfers']>
  ): ReturnType<E['failTransfers']> {
    return forward(this.#engine, 'failTransfers', args);
  }

  // ── On-chain ──────────────────────────────────────────────────────────────────

  onchainReceive(
    ...args: Parameters<E['onchainReceive']>
  ): ReturnType<E['onchainReceive']> {
    return forward(this.#engine, 'onchainReceive', args);
  }

  onchainSend(
    ...args: Parameters<E['onchainSend']>
  ): ReturnType<E['onchainSend']> {
    return forward(this.#engine, 'onchainSend', args);
  }

  // ── History ───────────────────────────────────────────────────────────────────

  listTransfers(
    ...args: Parameters<E['listTransfers']>
  ): ReturnType<E['listTransfers']> {
    return forward(this.#engine, 'listTransfers', args);
  }

  listTransactions(
    ...args: Parameters<E['listTransactions']>
  ): ReturnType<E['listTransactions']> {
    return forward(this.#engine, 'listTransactions', args);
  }

  /** Refreshes transfer state. Not the same as `syncWallet()`. */
  refreshWallet(
    ...args: Parameters<E['refreshWallet']>
  ): ReturnType<E['refreshWallet']> {
    return forward(this.#engine, 'refreshWallet', args);
  }

  /** Syncs chain and wallet state. Not the same as `refreshWallet()`. */
  syncWallet(
    ...args: Parameters<E['syncWallet']>
  ): ReturnType<E['syncWallet']> {
    return forward(this.#engine, 'syncWallet', args);
  }
}

type SharedMethodName = (typeof SHARED_METHODS)[number];

/**
 * The shared methods with the engine's exact types: `E[K]` keeps overloads
 * and generic signatures, which `Parameters`/`ReturnType` would collapse.
 */
export type EngineSharedMethods<E extends AnyEngine> = {
  readonly [K in SharedMethodName]: E[K];
};

/**
 * A facade over engine `E`: the shared API and the aliases with `E`'s exact
 * types, the engine properties, and `E`'s own extensions.
 *
 * Not designed for subclassing: overriding a shared method in a subclass
 * does not type-check (TS2425), and a generic `class X<E> extends
 * UTEXOWallet<E>` is rejected (TS2509). Wrap the engine or the facade
 * instead. A subclass of a facade over a concrete engine may add members.
 */
export type UTEXOWallet<E extends AnyEngine = AnyEngine> = Omit<
  UTEXOWalletBase<E>,
  SharedMethodName | 'initialize' | 'dispose'
> &
  EngineSharedMethods<E> & {
    /** Alias of `init()`. */
    readonly initialize: E['init'];
    /** Alias of `destroy()`. */
    readonly dispose: E['destroy'];
  } & EngineExtensions<E>;

export interface UTEXOWalletConstructor {
  new <E extends AnyEngine>(options: UTEXOWalletOptions<E>): UTEXOWallet<E>;
  readonly prototype: UTEXOWallet;
}

export const UTEXOWallet = UTEXOWalletBase as unknown as UTEXOWalletConstructor;
