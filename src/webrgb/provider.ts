/* eslint no-unused-vars: "off", "@typescript-eslint/no-unused-vars": "error" -- TypeScript signatures. */
import type {
  RgbProvider,
  RgbInfo,
  RgbAssetBalance,
  RgbTransferStatusResult,
  RgbBlindReceiveArgs,
  RgbBlindReceiveResult,
  RgbWitnessReceiveArgs,
  RgbWitnessReceiveResult,
  RgbSignMessageResult,
  RgbGetConsignmentArgs,
  RgbGetReceivedMintArgs,
  RgbReceivedMint,
  RgbBurnAssetArgs,
  RgbCreateUtxosArgs,
  RgbCreateUtxosResult,
  RgbBtcBalance,
  RgbBtcBalanceSide,
  RgbAssetMetadata,
  RgbSignPsbtOptions,
  RgbSignPsbtResult,
  RgbIssueAssetResult,
  RgbSendAssetResult,
  RgbMakeLnInvoiceResult,
  RgbPayLnInvoiceResult,
  RgbEvent,
  RgbTransfer,
} from '@utexo/webrgb';
import { WebRgbError, walletCall } from './errors.js';
import { WebRgbBurnController, type WebRgbBurnOptions } from './burn.js';
import type { WebRgbWallet } from './wallet.js';
import { getReceivedMint, receivedMintInvoice } from './received-mint.js';
import { changedInputs, parsePsbt, psbtFee } from './psbt.js';
import { feeRateOf } from './fee-rate.js';
import { TransferEvents } from './events.js';

export const WEBRGB_READ_METHODS = [
  'enable',
  'getInfo',
  'getAddress',
  'blindReceive',
  'witnessReceive',
  'listAssets',
  'getAssetBalance',
  'listTransfers',
  'getTransferStatus',
  'decodeRgbInvoice',
  'on',
  'off',
] as const;
/** Optional methods, listed only when the wallet has the native method. */
export const WEBRGB_WALLET_METHODS = [
  'createUtxos',
  'getBtcBalance',
  'refresh',
  'getAssetMetadata',
  'cancelReceive',
  'signPsbt',
] as const;
/**
 * Every method the provider serves: the read methods, the optional wallet
 * methods, burn, proof export and mint validation. The provider also defines
 * `issueAsset`, `sendAsset`, `makeLnInvoice` and `payLnInvoice`, which
 * always reject with `METHOD_NOT_SUPPORTED`.
 */
export const WEBRGB_METHODS = [
  ...WEBRGB_READ_METHODS,
  ...WEBRGB_WALLET_METHODS,
  'burnAsset',
  'getConsignment',
  'getReceivedMint',
] as const;
const U64_MAX = 18446744073709551615n;
/** rgb-lib defaults, resolved here so the prompt and result show the values used. */
const UTXO_NUM = 5;
const UTXO_SIZE = 1000;
const FEE_RATE = 2;
/** Recipient IDs are printable ASCII: blinded UTXOs or witness scripts. */
const RECIPIENT_ID = /^[\x21-\x7e]{1,512}$/;

export interface WebRgbApproval {
  origin: string;
  method:
    | 'enable'
    | 'blindReceive'
    | 'witnessReceive'
    | 'signMessage'
    | 'createUtxos'
    | 'burnAsset'
    | 'getConsignment'
    | 'cancelReceive'
    | 'signPsbt';
  params: Readonly<Record<string, unknown>>;
}
export interface WebRgbOptions {
  /** Taken from the approved transport session, never from request parameters. */
  origin: string;
  confirm: (request: WebRgbApproval) => Promise<boolean>;
  /** The host may set this ONLY after approving/restoring the transport session. */
  sessionApproved?: boolean;
  /** Recheck transport authorization after async prompts and before native calls. */
  assertAuthorized?: () => void;
  minConfirmations?: number;
  /** How often `on()` listeners are served from the transfer list. Default 10 s. */
  eventPollMs?: number;
  /** The wallet's shared burn operation service and payout routes. */
  burn: WebRgbBurnOptions;
}
/** @deprecated Use `RgbInfo`: payout routes are no longer advertised. */
export type WebRgbInfo = RgbInfo;
function integer(
  value: unknown,
  name: string,
  min = 1,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new WebRgbError(
      'INVALID_PARAMS',
      `${name} must be an integer between ${min} and ${max}`
    );
  }
  return value;
}
function unsupported(method: string): never {
  throw new WebRgbError(
    'METHOD_NOT_SUPPORTED',
    `This wallet does not serve ${method}`
  );
}
function optionalAsset(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !value.startsWith('rgb:') ||
    value.length > 256
  ) {
    throw new WebRgbError('INVALID_PARAMS', 'Invalid assetId');
  }
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WebRgbError('INVALID_PARAMS', 'Expected an object');
  }
  return value as Record<string, unknown>;
}

/**
 * WebRGB receiving, signing, burn and read API for an individual dApp session.
 * No React Native or WalletConnect runtime dependency. getInfo() lists burn
 * methods only while the native build and signer can serve them.
 */
export class WebRgbProvider implements RgbProvider {
  private authorized: boolean;
  private revision = 0;
  private enabling?: Promise<void>;
  private readonly floor: number;
  private readonly burnController: WebRgbBurnController;
  private readonly events: TransferEvents;

  constructor(
    private readonly wallet: WebRgbWallet,
    private readonly options: WebRgbOptions
  ) {
    if (!/^https?:\/\/[^\s]+$/.test(options.origin)) {
      throw new WebRgbError('INVALID_PARAMS', 'A session origin is required');
    }
    this.authorized = options.sessionApproved === true;
    if (!options.burn?.operations) {
      throw new WebRgbError(
        'INVALID_PARAMS',
        'burn.operations is required: share one BurnOperations per wallet'
      );
    }
    this.burnController = new WebRgbBurnController(
      wallet,
      {
        origin: options.origin,
        enabled: () => {
          options.assertAuthorized?.();
          return this.enabled;
        },
        confirm: (method, params) =>
          options.confirm({ origin: options.origin, method, params }),
      },
      options.burn
    );
    this.events = new TransferEvents(
      () => this.listTransfers(),
      () => this.enabled,
      integer(options.eventPollMs ?? 10_000, 'eventPollMs', 100)
    );
    this.floor = Math.max(
      3,
      integer(options.minConfirmations ?? 3, 'minConfirmations', 0, 255)
    );
  }

  get enabled(): boolean {
    return this.authorized && !this.wallet.isDisposed();
  }

  revoke(): void {
    this.authorized = false;
    this.burnController.revoke();
    this.events.clear();
    this.revision += 1;
  }

  async enable(): Promise<void> {
    if (this.enabled) return;
    if (this.enabling) return this.enabling;
    const revision = this.revision;
    this.enabling = (async () => {
      if (
        !(await this.options.confirm({
          origin: this.options.origin,
          method: 'enable',
          params: {},
        }))
      ) {
        throw new WebRgbError('USER_REJECTED', 'Connection declined');
      }
      if (revision !== this.revision || this.wallet.isDisposed()) {
        throw new WebRgbError('NOT_ENABLED', 'Session is no longer active');
      }
      this.authorized = true;
    })();
    try {
      await this.enabling;
    } finally {
      this.enabling = undefined;
    }
  }

  /** Whether the wallet has what an optional method needs. */
  private serves(method: (typeof WEBRGB_WALLET_METHODS)[number]): boolean {
    if (method === 'cancelReceive')
      return typeof this.wallet.failTransfers === 'function';
    if (method === 'signPsbt')
      return (
        typeof this.wallet.psbt?.signPsbt === 'function' &&
        typeof this.wallet.listUnspents === 'function'
      );
    return typeof this.wallet[method] === 'function';
  }

  private requireEnabled(): void {
    this.options.assertAuthorized?.();
    if (!this.enabled)
      throw new WebRgbError('NOT_ENABLED', 'Connect the wallet first');
  }

  async burnAsset(args: RgbBurnAssetArgs) {
    this.requireEnabled();
    return walletCall(() => this.burnController.burnAsset(args));
  }
  async getConsignment(args: RgbGetConsignmentArgs) {
    this.requireEnabled();
    return walletCall(() => this.burnController.getConsignment(args));
  }

  /**
   * The checked BFA mint paying an invoice this wallet created, or `null`
   * while none is ready. No prompt; refreshes incoming transfers only.
   */
  async getReceivedMint(
    args: RgbGetReceivedMintArgs
  ): Promise<RgbReceivedMint | null> {
    this.requireEnabled();
    const invoice = receivedMintInvoice(args);
    const revision = this.revision;
    return getReceivedMint(this.wallet, invoice, () => {
      this.requireEnabled();
      if (revision !== this.revision)
        throw new WebRgbError('NOT_ENABLED', 'Session changed');
    });
  }

  async getInfo(): Promise<WebRgbInfo> {
    this.requireEnabled();
    const burnMethods = await this.burnController.methods();
    return {
      ready: true,
      network: this.wallet.getNetwork(),
      protocol: this.wallet.protocol ?? 'RGB_LN',
      ...(burnMethods.includes('burnAsset') && {
        burnRecipientNamespaces: ['eip155', 'tron'],
      }),
      methods: [
        ...WEBRGB_READ_METHODS,
        ...WEBRGB_WALLET_METHODS.filter((method) => this.serves(method)),
        ...(this.wallet.protocol !== 'RGB_L1' && this.wallet.signMessage
          ? ['signMessage']
          : []),
        ...burnMethods,
        ...(this.wallet.getReceivedMint ? ['getReceivedMint' as const] : []),
      ],
    };
  }
  async getAddress() {
    this.requireEnabled();
    return { address: await walletCall(() => this.wallet.getAddress()) };
  }
  async signMessage(message: string): Promise<RgbSignMessageResult> {
    this.requireEnabled();
    const sign =
      this.wallet.protocol === 'RGB_L1'
        ? undefined
        : this.wallet.signMessage?.bind(this.wallet);
    if (!sign) {
      throw new WebRgbError(
        'METHOD_NOT_SUPPORTED',
        'This wallet does not support message signing'
      );
    }
    if (
      typeof message !== 'string' ||
      message === '' ||
      /[\uD800-\uDFFF]/u.test(message)
    )
      throw new WebRgbError(
        'INVALID_PARAMS',
        'Expected a non-empty, well-formed Unicode message string'
      );
    const revision = this.revision;
    if (
      !(await this.options.confirm({
        origin: this.options.origin,
        method: 'signMessage',
        params: Object.freeze({ message }),
      }))
    ) {
      throw new WebRgbError('USER_REJECTED', 'Message signing declined');
    }
    this.requireEnabled();
    if (revision !== this.revision)
      throw new WebRgbError('NOT_ENABLED', 'Session changed');
    return {
      signature: await walletCall(() => sign(message)),
    };
  }
  async blindReceive(
    args: RgbBlindReceiveArgs = {}
  ): Promise<RgbBlindReceiveResult> {
    return this.receive('blindReceive', args);
  }
  async witnessReceive(
    args: RgbWitnessReceiveArgs = {}
  ): Promise<RgbWitnessReceiveResult> {
    return this.receive('witnessReceive', args);
  }
  private async receive(
    method: 'blindReceive' | 'witnessReceive',
    args: RgbBlindReceiveArgs
  ): Promise<RgbBlindReceiveResult> {
    this.requireEnabled();
    const raw = object(args);
    const params = {
      assetId: optionalAsset(raw.assetId),
      amount:
        raw.amount === undefined ? undefined : integer(raw.amount, 'amount'),
      durationSeconds: integer(
        raw.durationSeconds ?? 3600,
        'durationSeconds',
        1,
        2_592_000
      ),
      minConfirmations: Math.max(
        this.floor,
        integer(raw.minConfirmations ?? this.floor, 'minConfirmations', 0, 255)
      ),
    };
    // Checked before the prompt: a dApp falling back to an any-asset invoice
    // must not make the user approve twice.
    if (
      params.assetId !== undefined &&
      !(await this.listAssets()).some((asset) => asset.id === params.assetId)
    ) {
      throw new WebRgbError(
        'ASSET_NOT_FOUND',
        'This wallet does not know the asset'
      );
    }
    const revision = this.revision;
    if (
      !(await this.options.confirm({
        origin: this.options.origin,
        method,
        params: Object.freeze({ ...params }),
      }))
    ) {
      throw new WebRgbError('USER_REJECTED', 'Invoice request declined');
    }
    this.requireEnabled();
    if (revision !== this.revision)
      throw new WebRgbError('NOT_ENABLED', 'Session changed');
    const result = await walletCall(() => this.wallet[method](params));
    return {
      invoice: result.invoice,
      recipientId: result.recipientId,
      expirationTimestamp: result.expirationTimestamp ?? undefined,
      minConfirmations: params.minConfirmations,
    };
  }
  async createUtxos(
    args: RgbCreateUtxosArgs = {}
  ): Promise<RgbCreateUtxosResult> {
    this.requireEnabled();
    const create = this.wallet.createUtxos?.bind(this.wallet);
    if (!create)
      throw new WebRgbError(
        'METHOD_NOT_SUPPORTED',
        'This wallet cannot create UTXOs'
      );
    const raw = object(args);
    const extra = Object.keys(raw).find(
      (key) => !['num', 'size', 'feeRate'].includes(key)
    );
    if (extra)
      throw new WebRgbError(
        'INVALID_PARAMS',
        `Unsupported parameter: ${extra}`
      );
    const params = {
      num: integer(raw.num ?? UTXO_NUM, 'num', 1, 255),
      size: integer(raw.size ?? UTXO_SIZE, 'size', 1, 0xffffffff),
      feeRate: feeRateOf(raw.feeRate ?? FEE_RATE),
    };
    const revision = this.revision;
    if (
      !(await this.options.confirm({
        origin: this.options.origin,
        method: 'createUtxos',
        params: Object.freeze({ ...params }),
      }))
    )
      throw new WebRgbError('USER_REJECTED', 'UTXO creation declined');
    this.requireEnabled();
    if (revision !== this.revision)
      throw new WebRgbError('NOT_ENABLED', 'Session changed');
    // Spends bitcoin: one attempt, never retried here.
    const created = await walletCall(
      () => create({ ...params, upTo: false }),
      'Not enough bitcoin to create the UTXOs'
    );
    return { created, size: params.size, feeRate: params.feeRate };
  }
  async getBtcBalance(): Promise<RgbBtcBalance> {
    this.requireEnabled();
    const read = this.wallet.getBtcBalance?.bind(this.wallet);
    if (!read)
      throw new WebRgbError(
        'METHOD_NOT_SUPPORTED',
        'This wallet cannot report its bitcoin balance'
      );
    const balance = await walletCall(() => read());
    const side = (value: RgbBtcBalanceSide): RgbBtcBalanceSide => {
      const result = {
        settled: value?.settled,
        future: value?.future,
        spendable: value?.spendable,
      };
      if (
        !Object.values(result).every(
          (sats) => Number.isSafeInteger(sats) && sats >= 0
        )
      )
        throw new WebRgbError('INTERNAL_ERROR', 'Invalid bitcoin balance');
      return result;
    };
    let freeColorableUtxos: number | null = null;
    if (this.wallet.listUnspents) {
      // The local state the balance read just synced; only a count leaves here.
      const unspents = await walletCall(() =>
        this.wallet.listUnspents!({ skipSync: true })
      );
      freeColorableUtxos = unspents.filter(
        (unspent) =>
          unspent.utxo.colorable &&
          unspent.utxo.exists &&
          unspent.rgbAllocations.length === 0 &&
          unspent.pendingBlinded === 0
      ).length;
    }
    return {
      vanilla: side(balance.vanilla),
      colored: side(balance.colored),
      freeColorableUtxos,
    };
  }
  async refresh(assetId?: string): Promise<{ refreshed: boolean }> {
    this.requireEnabled();
    const run = this.wallet.refresh?.bind(this.wallet);
    if (!run)
      throw new WebRgbError(
        'METHOD_NOT_SUPPORTED',
        'This wallet cannot refresh transfers'
      );
    optionalAsset(assetId);
    const { transfers } = await walletCall(() => run());
    // Refresh reports a failed transfer in its result, not as an error.
    let scope: Set<number> | undefined;
    if (assetId !== undefined) {
      const history = await walletCall(() =>
        this.wallet.listTransfers(assetId)
      );
      scope = new Set(history.map((transfer) => transfer.batchTransferIdx));
    }
    let refreshed = false;
    for (const [idx, transfer] of Object.entries(transfers)) {
      if (scope && !scope.has(Number(idx))) continue;
      if (transfer.failure)
        throw new WebRgbError(
          'INTERNAL_ERROR',
          `Transfer ${idx} failed to refresh: ${transfer.failure.name}: ${transfer.failure.message}`
        );
      if (transfer.updatedStatus !== undefined) refreshed = true;
    }
    return { refreshed };
  }
  async getAssetMetadata(assetId: string): Promise<RgbAssetMetadata> {
    this.requireEnabled();
    const read = this.wallet.getAssetMetadata?.bind(this.wallet);
    if (!read)
      throw new WebRgbError(
        'METHOD_NOT_SUPPORTED',
        'This wallet cannot read asset metadata'
      );
    if (!optionalAsset(assetId))
      throw new WebRgbError('INVALID_PARAMS', 'assetId is required');
    const metadata = await walletCall(() => read(assetId));
    const supply = metadata.initialSupply;
    if (
      typeof supply !== 'string' ||
      !/^(0|[1-9][0-9]{0,19})$/.test(supply) ||
      BigInt(supply) > U64_MAX ||
      !Number.isSafeInteger(metadata.timestamp) ||
      !Number.isSafeInteger(metadata.precision)
    )
      throw new WebRgbError('INTERNAL_ERROR', 'Invalid asset metadata');
    return {
      assetId,
      schema: metadata.assetSchema.toLowerCase() as RgbAssetMetadata['schema'],
      ticker: metadata.ticker ?? null,
      name: metadata.name,
      details: metadata.details ?? null,
      precision: metadata.precision,
      issuedSupply: supply,
      timestamp: metadata.timestamp,
      // The engines expose no public media digest: never a local path.
      media: null,
    };
  }
  /**
   * Fails a receive this wallet created while it still waits for the sender.
   * Unknown or already moving receives resolve `{ cancelled: false }` with no
   * prompt.
   */
  async cancelReceive(recipientId: string): Promise<{ cancelled: boolean }> {
    this.requireEnabled();
    const fail = this.wallet.failTransfers?.bind(this.wallet);
    if (!fail) unsupported('cancelReceive');
    if (typeof recipientId !== 'string' || !RECIPIENT_ID.test(recipientId))
      throw new WebRgbError('INVALID_PARAMS', 'Invalid recipientId');
    const pending = async () =>
      (await walletCall(() => this.wallet.listTransfers())).find(
        (transfer) =>
          transfer.recipientId === recipientId &&
          (transfer.kind === 'ReceiveBlind' ||
            transfer.kind === 'ReceiveWitness') &&
          transfer.status === 'WaitingCounterparty'
      );
    const transfer = await pending();
    if (!transfer) return { cancelled: false };
    const revision = this.revision;
    if (
      !(await this.options.confirm({
        origin: this.options.origin,
        method: 'cancelReceive',
        params: Object.freeze({
          recipientId,
          kind: transfer.kind,
          amount: transfer.amount ?? null,
        }),
      }))
    )
      throw new WebRgbError('USER_REJECTED', 'Cancelling the receive declined');
    this.requireEnabled();
    if (revision !== this.revision)
      throw new WebRgbError('NOT_ENABLED', 'Session changed');
    // The sender may have answered while the prompt was open.
    const current = await pending();
    if (current?.batchTransferIdx !== transfer.batchTransferIdx)
      return { cancelled: false };
    const cancelled = await walletCall(() =>
      fail({ batchTransferIdx: transfer.batchTransferIdx, noAssetOnly: false })
    );
    return { cancelled: cancelled === true };
  }

  /**
   * Signs the bitcoin-only inputs this wallet controls. The PSBT is signed
   * first, which changes nothing in the wallet, to learn which inputs are
   * the wallet's; one holding an RGB allocation refuses the request before
   * the prompt. rgb-lib finalizes every input it signs fully, so the result
   * is finalized whatever `finalize` says.
   */
  async signPsbt(
    psbt: string,
    opts: RgbSignPsbtOptions = {}
  ): Promise<RgbSignPsbtResult> {
    this.requireEnabled();
    const signer = this.wallet.psbt;
    const unspents = this.wallet.listUnspents?.bind(this.wallet);
    if (!signer || !unspents) unsupported('signPsbt');
    const options = object(opts);
    const extra = Object.keys(options).find((key) => key !== 'finalize');
    if (extra)
      throw new WebRgbError('INVALID_PARAMS', `Unsupported option: ${extra}`);
    if (options.finalize !== undefined && typeof options.finalize !== 'boolean')
      throw new WebRgbError('INVALID_PARAMS', 'finalize must be a boolean');
    if (typeof psbt !== 'string' || psbt.length > 4_000_000)
      throw new WebRgbError('INVALID_PARAMS', 'Expected a base64 PSBT');
    const network = this.wallet.getNetwork();
    const before = parsePsbt(psbt, network);
    const signed = await walletCall(() => signer.signPsbt(psbt));
    const after = parsePsbt(signed, network);
    const inputs = changedInputs(before, after);
    if (inputs.length === 0)
      throw new WebRgbError(
        'INVALID_PARAMS',
        'The PSBT has no input this wallet controls'
      );
    const owned = await walletCall(() => unspents({ skipSync: true }));
    const colored = inputs.find((i) => {
      const { txid, vout } = before.inputs[i]!;
      return owned.some(
        (unspent) =>
          unspent.utxo.outpoint.txid === txid &&
          unspent.utxo.outpoint.vout === vout &&
          (unspent.rgbAllocations.length > 0 || unspent.pendingBlinded > 0)
      );
    });
    if (colored !== undefined)
      throw new WebRgbError(
        'UNSAFE_PSBT',
        `Input ${colored} holds RGB assets, which a plain PSBT would destroy`
      );
    const revision = this.revision;
    if (
      !(await this.options.confirm({
        origin: this.options.origin,
        method: 'signPsbt',
        params: Object.freeze({
          outputs: Object.freeze(
            before.outputs.map((output) => Object.freeze({ ...output }))
          ),
          fee: psbtFee(before),
          signedInputs: Object.freeze(inputs),
          finalize: options.finalize === true,
        }),
      }))
    )
      throw new WebRgbError('USER_REJECTED', 'Signing declined');
    this.requireEnabled();
    if (revision !== this.revision)
      throw new WebRgbError('NOT_ENABLED', 'Session changed');
    return { psbt: signed, signedInputs: inputs.length };
  }

  async issueAsset(): Promise<RgbIssueAssetResult> {
    this.requireEnabled();
    return unsupported('issueAsset');
  }
  async sendAsset(): Promise<RgbSendAssetResult> {
    this.requireEnabled();
    return unsupported('sendAsset');
  }
  async makeLnInvoice(): Promise<RgbMakeLnInvoiceResult> {
    this.requireEnabled();
    return unsupported('makeLnInvoice');
  }
  async payLnInvoice(): Promise<RgbPayLnInvoiceResult> {
    this.requireEnabled();
    return unsupported('payLnInvoice');
  }
  /**
   * `transferReceived` fires when a receive leaves `WaitingCounterparty`,
   * `transferSettled` when a transfer reaches `Settled`. Served from the
   * local transfer list while a listener is attached; no prompt.
   */
  on(event: RgbEvent, listener: (transfer: RgbTransfer) => void): void {
    this.requireEnabled();
    this.events.on(event, listener);
  }
  off(event: RgbEvent, listener: (transfer: RgbTransfer) => void): void {
    this.events.off(event, listener);
  }

  async listAssets() {
    this.requireEnabled();
    const assets = await walletCall(() => this.wallet.listAssets());
    return Object.entries(assets).flatMap(([schema, group]) =>
      Array.isArray(group)
        ? group.map((asset) => ({
            id: asset.assetId,
            schema,
            ticker: 'ticker' in asset ? asset.ticker : undefined,
            name: asset.name,
            precision: asset.precision,
          }))
        : []
    );
  }
  async getAssetBalance(assetId: string): Promise<RgbAssetBalance> {
    this.requireEnabled();
    if (!optionalAsset(assetId))
      throw new WebRgbError('INVALID_PARAMS', 'assetId is required');
    const raw = await walletCall(() => this.wallet.getAssetBalance(assetId));
    if (!Number.isSafeInteger(raw.spendable))
      throw new WebRgbError(
        'INTERNAL_ERROR',
        'Asset balance exceeds the supported exact integer range'
      );
    return { assetId, balance: raw.spendable!, raw };
  }
  async listTransfers(assetId?: string) {
    this.requireEnabled();
    optionalAsset(assetId);
    const transfers = await walletCall(() =>
      this.wallet.listTransfers(assetId)
    );
    return transfers.map((transfer) => {
      return {
        assetId,
        transferId: transfer.idx,
        status: transfer.status,
        kind: transfer.kind,
        amount: transfer.amount,
        amountBaseUnits: transfer.amountBaseUnits,
        recipientId: transfer.recipientId,
        txid: transfer.txid,
      };
    });
  }
  async getTransferStatus(
    transferId: string | number,
    assetId?: string
  ): Promise<RgbTransferStatusResult> {
    this.requireEnabled();
    if (
      (typeof transferId !== 'string' && typeof transferId !== 'number') ||
      String(transferId).length === 0
    ) {
      throw new WebRgbError('INVALID_PARAMS', 'transferId is required');
    }
    optionalAsset(assetId);
    const burn = await walletCall(() =>
      this.burnController.getTransferStatus(transferId, assetId)
    );
    if (burn) return burn;
    await walletCall(() => this.wallet.refreshWallet());
    const transfer = (await this.listTransfers(assetId)).find(
      (item) =>
        String(item.transferId) === String(transferId) ||
        item.txid === transferId ||
        item.recipientId === transferId
    );
    return {
      found: Boolean(transfer),
      status: transfer?.status ?? null,
      transfer: transfer ?? null,
    };
  }
  async decodeRgbInvoice(args: { invoice: string } | string) {
    this.requireEnabled();
    const invoice = typeof args === 'string' ? args : object(args).invoice;
    if (
      typeof invoice !== 'string' ||
      !invoice.startsWith('rgb:') ||
      invoice.length > 16_384
    ) {
      throw new WebRgbError('INVALID_PARAMS', 'Invalid RGB invoice');
    }
    const raw = await walletCall(() =>
      this.wallet.decodeRGBInvoice({ invoice })
    );
    if (
      raw.assignment.type === 'Fungible' &&
      raw.assignment.amount === undefined
    ) {
      throw new WebRgbError(
        'INTERNAL_ERROR',
        'Invoice amount exceeds the supported exact integer range'
      );
    }
    const amount =
      raw.assignment.type === 'Fungible' && raw.assignment.amount
        ? integer(raw.assignment.amount, 'invoice amount')
        : null;
    return {
      assetId: raw.assetId,
      amount,
      recipientId: raw.recipientId,
      expirationTimestamp: raw.expirationTimestamp ?? undefined,
      network: raw.network,
      transportEndpoints: raw.transportEndpoints,
    };
  }
}
