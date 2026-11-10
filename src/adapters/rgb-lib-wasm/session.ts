import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Network } from '@utexo/rgb-sdk-core';
import type { ResolvedRgbLibWebConfig } from './config.js';
import type {
  DtoAsset,
  DtoAssignment,
  DtoBalance,
  DtoInvoice,
  DtoOperation,
  DtoOutpoint,
  DtoReceive,
  DtoRefreshed,
  DtoTransaction,
  DtoTransfer,
  DtoUnspent,
} from './dto.js';
import { RgbLibWebError } from './errors.js';
import type { RgbLibWebPublicKeys } from './keys.js';
import type { RgbLibWasmRuntime, RgbLibWasmWallet } from './runtime.js';

/**
 * One open rgb-lib-wasm wallet. It plays the part of the React Native bridge
 * (`RgbLibSessionStore.kt`): same operations, same rules, and it returns the
 * bridge's value shapes (`dto.ts`). Calls must be serialized by the caller:
 * the WASM wallet panics on overlapping calls.
 */

/** rgb-lib-wasm's `BitcoinNetwork` serde names. `utexo` is a signet. */
const WASM_NETWORKS: Readonly<Record<Network, string>> = {
  mainnet: 'Mainnet',
  testnet: 'Testnet',
  testnet4: 'Testnet4',
  signet: 'Signet',
  utexo: 'Signet',
  regtest: 'Regtest',
};

/** The network names the React Native bridge uses, also in the wallet ID. */
const BRIDGE_NETWORKS: Readonly<Record<Network, string>> = {
  mainnet: 'mainnet',
  testnet: 'testnet',
  testnet4: 'testnet4',
  signet: 'signet',
  utexo: 'signet',
  regtest: 'regtest',
};

const INVOICE_NETWORKS: Readonly<Record<string, string>> = {
  Mainnet: 'mainnet',
  Testnet: 'testnet',
  Testnet4: 'testnet4',
  Signet: 'signet',
  Regtest: 'regtest',
};

/** rgb-lib's own default: invoices without `exp` get one hour. */
const DEFAULT_SEND_EXPIRY_SECONDS = 3600n;
/** Time left to detect the ACK and broadcast before the invoice expires. */
const SEND_EXPIRY_MARGIN_SECONDS = 600n;

export interface SessionOptions {
  network: Network;
  dataDir: string;
  maxAllocationsPerUtxo: number;
  reuseAddresses: boolean;
}

// ── wire readers ────────────────────────────────────────────────────────────

function invalid(field: string): never {
  throw new RgbLibWebError(
    'INVALID_NATIVE_RESPONSE',
    `Invalid rgb-lib-wasm ${field}`
  );
}
/** A JS object; serde-wasm-bindgen gives `Map`s for Rust maps. */
function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(field);
  return value as Record<string, unknown>;
}
function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalid(field);
  return value;
}
function str(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(field);
  return value;
}
function optStr(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : str(value, field);
}
function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(field);
  return value;
}
/** u8 / u32 / i32 fields, which arrive as numbers. */
function int(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalid(field);
  return value;
}
/** u64 / i64 fields arrive as BigInt; the exact value becomes a decimal string. */
function dec(value: unknown, field: string, signed = false): string {
  if (typeof value === 'bigint') {
    if (!signed && value < 0n) invalid(field);
    return value.toString();
  }
  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    (signed || value >= 0)
  )
    return String(value);
  return invalid(field);
}
function optDec(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : dec(value, field);
}

/** Externally tagged `Assignment`: `"NonFungible"` or `{ Fungible: 10n }`. */
function assignment(value: unknown): DtoAssignment {
  if (typeof value === 'string') return { type: value, amount: null };
  const entries = Object.entries(record(value, 'assignment'));
  if (entries.length !== 1) invalid('assignment');
  const [type, amount] = entries[0]!;
  return { type, amount: dec(amount, 'assignment amount') };
}
function optAssignment(value: unknown): DtoAssignment | null {
  return value === null || value === undefined ? null : assignment(value);
}
function outpoint(value: unknown): DtoOutpoint {
  const v = record(value, 'outpoint');
  return { txid: str(v.txid, 'outpoint txid'), vout: int(v.vout, 'vout') };
}
function balance(value: unknown): DtoBalance {
  const v = record(value, 'balance');
  return {
    settled: dec(v.settled, 'settled balance'),
    future: dec(v.future, 'future balance'),
    spendable: dec(v.spendable, 'spendable balance'),
  };
}
function asset(value: unknown, schema: 'Nia' | 'Ifa' | 'Bfa'): DtoAsset {
  const v = record(value, 'asset');
  const media =
    v.media === null || v.media === undefined
      ? null
      : (() => {
          const m = record(v.media, 'media');
          return {
            filePath: str(m.filePath, 'media path'),
            digest: str(m.digest, 'media digest'),
            mime: str(m.mime, 'media mime'),
          };
        })();
  return {
    schema,
    assetId: str(v.assetId, 'asset ID'),
    ticker: optStr(v.ticker, 'ticker'),
    name: str(v.name, 'asset name'),
    details: optStr(v.details, 'details'),
    precision: int(v.precision, 'precision'),
    issuedSupply: optDec(v.issuedSupply, 'issued supply'),
    initialSupply: optDec(v.initialSupply, 'initial supply'),
    maxSupply: optDec(v.maxSupply, 'max supply'),
    knownCirculatingSupply: optDec(
      v.knownCirculatingSupply,
      'circulating supply'
    ),
    timestamp: dec(v.timestamp, 'timestamp', true),
    addedAt: dec(v.addedAt, 'addedAt', true),
    balance: balance(v.balance),
    media,
    rejectListUrl: optStr(v.rejectListUrl, 'reject list URL'),
  };
}
function transfer(value: unknown): DtoTransfer {
  const v = record(value, 'transfer');
  return {
    idx: int(v.idx, 'transfer idx'),
    batchTransferIdx: int(v.batchTransferIdx, 'batch transfer idx'),
    createdAt: dec(v.createdAt, 'createdAt', true),
    updatedAt: dec(v.updatedAt, 'updatedAt', true),
    status: str(v.status, 'transfer status'),
    requestedAssignment: optAssignment(v.requestedAssignment),
    assignments: list(v.assignments, 'assignments').map(assignment),
    kind: str(v.kind, 'transfer kind'),
    txid: optStr(v.txid, 'txid'),
    recipientId: optStr(v.recipientId, 'recipient ID'),
    receiveUtxo:
      v.receiveUtxo === null || v.receiveUtxo === undefined
        ? null
        : outpoint(v.receiveUtxo),
    // This rgb-lib reports one change UTXO.
    changeUtxos:
      v.changeUtxo === null || v.changeUtxo === undefined
        ? []
        : [outpoint(v.changeUtxo)],
    expiration: optDec(v.expirationTimestamp, 'expiration'),
    transportEndpoints: list(v.transportEndpoints, 'transport endpoints').map(
      (item) => {
        const e = record(item, 'transport endpoint');
        return {
          endpoint: str(e.endpoint, 'endpoint'),
          transportType: str(e.transportType, 'transport type'),
          used: bool(e.used, 'endpoint used'),
        };
      }
    ),
    invoiceString: optStr(v.invoiceString, 'invoice string'),
    consignmentPath: optStr(v.consignmentPath, 'consignment path'),
  };
}
function transaction(value: unknown): DtoTransaction {
  const v = record(value, 'transaction');
  const time =
    v.confirmationTime === null || v.confirmationTime === undefined
      ? null
      : record(v.confirmationTime, 'confirmation time');
  return {
    transactionType: str(v.transactionType, 'transaction type'),
    txid: str(v.txid, 'txid'),
    received: dec(v.received, 'received'),
    sent: dec(v.sent, 'sent'),
    fee: dec(v.fee, 'fee'),
    confirmationTime: time
      ? {
          height: int(time.height, 'height'),
          timestamp: dec(time.timestamp, 'confirmation timestamp'),
        }
      : null,
  };
}
function unspent(value: unknown): DtoUnspent {
  const v = record(value, 'unspent');
  const utxo = record(v.utxo, 'utxo');
  return {
    utxo: {
      outpoint: outpoint(utxo.outpoint),
      btcAmount: dec(utxo.btcAmount, 'btcAmount'),
      colorable: bool(utxo.colorable, 'colorable'),
      exists: bool(utxo.exists, 'exists'),
    },
    rgbAllocations: list(v.rgbAllocations, 'allocations').map((item) => {
      const a = record(item, 'allocation');
      return {
        assetId: optStr(a.assetId, 'allocation asset ID'),
        assignment: assignment(a.assignment),
        settled: bool(a.settled, 'settled'),
      };
    }),
    pendingBlinded: int(v.pendingBlinded, 'pending blinded'),
  };
}
function receive(value: unknown): DtoReceive {
  const v = record(value, 'receive data');
  return {
    invoice: str(v.invoice, 'invoice'),
    recipientId: str(v.recipientId, 'recipient ID'),
    expirationTimestamp: dec(v.expirationTimestamp, 'expiration'),
    batchTransferIdx: int(v.batchTransferIdx, 'batch transfer idx'),
    publicKey: str(v.publicKey, 'public key'),
  };
}
function operation(value: unknown): DtoOperation {
  const v = record(value, 'operation result');
  return {
    txid: str(v.txid, 'txid'),
    batchTransferIdx: int(v.batchTransferIdx, 'batch transfer idx'),
    entropy: dec(v.entropy, 'entropy'),
  };
}
/** Raw invoice data; u64 values still BigInt, as `send()` needs them. */
function invoiceData(value: unknown) {
  const v = record(value, 'invoice data');
  const params =
    v.unknownQueryParams instanceof Map
      ? Object.fromEntries(v.unknownQueryParams)
      : record(v.unknownQueryParams ?? {}, 'query params');
  const expiration = optDec(v.expirationTimestamp, 'invoice expiration');
  const wasmNetwork = str(v.network, 'invoice network');
  const dto: DtoInvoice = {
    recipientId: str(v.recipientId, 'recipient ID'),
    assetSchema: optStr(v.assetSchema, 'asset schema'),
    assetId: optStr(v.assetId, 'asset ID'),
    assignment: assignment(v.assignment),
    assignmentName: optStr(v.assignmentName, 'assignment name'),
    network: INVOICE_NETWORKS[wasmNetwork] ?? invalid('invoice network'),
    expirationTimestamp: expiration,
    transportEndpoints: list(v.transportEndpoints, 'transport endpoints').map(
      (e) => str(e, 'transport endpoint')
    ),
    publicKey: optStr(v.publicKey, 'public key'),
    encryption: str(v.encryption, 'encryption'),
    unknownQueryParams: Object.entries(params)
      .map(([key, item]) => ({ key, value: str(item, 'query param') }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  };
  return { dto, wasmNetwork, raw: v };
}
/** A refresh failure (`Error`, externally tagged) named like the RN bridge. */
function refreshFailure(value: unknown): { name: string; message: string } {
  if (typeof value === 'string')
    return { name: `RGB_LIB_${value}`, message: value };
  const entries = Object.entries(record(value, 'refresh failure'));
  if (entries.length !== 1) invalid('refresh failure');
  const [variant, fields] = entries[0]!;
  const details =
    fields !== null && typeof fields === 'object'
      ? Object.entries(fields)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(', ')
      : fields === null || fields === undefined
        ? ''
        : String(fields);
  return {
    name: `RGB_LIB_${variant}`,
    message: details ? `${variant} (${details})` : variant,
  };
}

function fail(message: string): never {
  throw new RgbLibWebError('INVALID_PARAMS', message);
}

// ── session ─────────────────────────────────────────────────────────────────

export class WasmSession {
  private online?: unknown;

  private constructor(
    private readonly runtime: RgbLibWasmRuntime,
    private readonly wallet: RgbLibWasmWallet,
    private readonly wasmNetwork: string,
    readonly identity: { id: string; network: string }
  ) {}

  /**
   * Derives the public keys from the mnemonic (checking given ones against
   * them) or opens watch-only from public keys, then opens the wallet and
   * restores its IndexedDB state.
   */
  static async open(
    runtime: RgbLibWasmRuntime,
    options: SessionOptions,
    mnemonic: string | null,
    given: Readonly<RgbLibWebPublicKeys> | undefined
  ): Promise<WasmSession> {
    const bridgeNetwork = BRIDGE_NETWORKS[options.network];
    const wasmNetwork = WASM_NETWORKS[options.network];
    let keys: RgbLibWebPublicKeys | undefined;
    if (mnemonic !== null) {
      const derived = record(
        runtime.restoreKeys(bridgeNetwork, mnemonic),
        'keys'
      );
      keys = {
        accountXpubVanilla: str(derived.accountXpubVanilla, 'vanilla xpub'),
        accountXpubColored: str(derived.accountXpubColored, 'colored xpub'),
        masterFingerprint: str(derived.masterFingerprint, 'fingerprint'),
      };
      if (
        given &&
        (given.accountXpubVanilla !== keys.accountXpubVanilla ||
          given.accountXpubColored !== keys.accountXpubColored ||
          given.masterFingerprint.toLowerCase() !==
            keys.masterFingerprint.toLowerCase())
      )
        throw new RgbLibWebError(
          'INVALID_CONFIG',
          'The public keys do not match the mnemonic'
        );
    } else {
      keys = given ? { ...given } : undefined;
    }
    if (!keys)
      throw new RgbLibWebError(
        'INVALID_CONFIG',
        'A mnemonic or public keys are required'
      );
    // The same ID as the React Native engine for the same keys and network.
    const id = bytesToHex(
      sha256(
        utf8ToBytes(
          `${bridgeNetwork}:taproot:${keys.accountXpubVanilla}:${keys.accountXpubColored}`
        )
      )
    );
    const wallet = await runtime.WasmWallet.create(
      JSON.stringify({
        dataDir: options.dataDir,
        bitcoinNetwork: wasmNetwork,
        databaseType: 'Sqlite',
        maxAllocationsPerUtxo: options.maxAllocationsPerUtxo,
        accountXpubVanilla: keys.accountXpubVanilla,
        accountXpubColored: keys.accountXpubColored,
        mnemonic,
        masterFingerprint: keys.masterFingerprint,
        vanillaKeychain: null,
        // Every schema this rgb-lib has; it rejects an empty list.
        supportedSchemas: ['Nia', 'Ifa', 'Bfa'],
        reuseAddresses: options.reuseAddresses,
      })
    );
    return new WasmSession(runtime, wallet, wasmNetwork, {
      id,
      network: bridgeNetwork,
    });
  }

  /** Writes pending state to IndexedDB, then releases the WASM wallet. */
  async close(): Promise<void> {
    await this.wallet.flush();
    this.online = undefined;
    this.wallet.free();
  }

  private connected(): unknown {
    if (this.online === undefined)
      throw new RgbLibWebError(
        'WALLET_OFFLINE',
        'Call unlock() before this operation'
      );
    return this.online;
  }

  /** Reads that sync first: the WASM reads themselves never sync. */
  private async syncFirst(skipSync: boolean) {
    if (!skipSync) await this.wallet.sync(this.connected());
  }

  async goOnline(config: ResolvedRgbLibWebConfig): Promise<void> {
    const ids = Object.keys(config.evmRpcUrls);
    this.online = await this.wallet.goOnline({
      indexerConfig: { Esplora: { url: config.indexer.url } },
      skipConsistencyCheck: false,
      proxyAuthKeys: { ...config.proxyAuthKeys },
      evmChains: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            rpcUrl: config.evmRpcUrls[id]!,
            minMintLockBlocks: BigInt(config.evmMintLockBlocks[id]!.min),
            maxMintLockBlocks: BigInt(config.evmMintLockBlocks[id]!.max),
          },
        ])
      ),
    });
  }

  /**
   * Synchronous WASM mutations queue their IndexedDB save and return before
   * it commits; success is reported only once the state is stored.
   */
  private async persisted<T>(value: T): Promise<T> {
    await this.wallet.flush();
    return value;
  }

  async getAddress(): Promise<string> {
    return this.persisted(str(this.wallet.getAddress(), 'address'));
  }

  async getBtcBalance(skipSync: boolean) {
    await this.syncFirst(skipSync);
    const v = record(this.wallet.getBtcBalance(), 'BTC balance');
    return { vanilla: balance(v.vanilla), colored: balance(v.colored) };
  }

  async getAssetBalance(assetId: string): Promise<DtoBalance> {
    return balance(this.wallet.getAssetBalance(assetId));
  }

  async listAssets(schemas: string[]): Promise<DtoAsset[]> {
    const v = record(this.wallet.listAssets(schemas), 'assets');
    const bucket = (items: unknown, schema: 'Nia' | 'Ifa' | 'Bfa') =>
      items === null || items === undefined
        ? []
        : list(items, 'assets').map((item) => asset(item, schema));
    return [
      ...bucket(v.nia, 'Nia'),
      ...bucket(v.ifa, 'Ifa'),
      ...bucket(v.bfa, 'Bfa'),
    ];
  }

  async listUnspents(skipSync: boolean): Promise<DtoUnspent[]> {
    await this.syncFirst(skipSync);
    return list(this.wallet.listUnspents(false), 'unspents').map(unspent);
  }

  async listTransactions(skipSync: boolean): Promise<DtoTransaction[]> {
    await this.syncFirst(skipSync);
    return list(this.wallet.listTransactions(), 'transactions').map(
      transaction
    );
  }

  async listTransfers(assetId: string | null): Promise<DtoTransfer[]> {
    // AssetFilter is camelCase in this build: "any" or { id }.
    const filter = assetId === null ? 'any' : { id: assetId };
    return list(this.wallet.listTransfers(filter, null), 'transfers').map(
      transfer
    );
  }

  /** Begin, sign with the wallet keys, end. */
  async createUtxos(
    upTo: boolean,
    num: number | null,
    size: number | null,
    feeRate: string,
    skipSync: boolean
  ): Promise<number> {
    const online = this.connected();
    const psbt = await this.wallet.createUtxosBegin(
      online,
      upTo,
      num,
      size,
      BigInt(feeRate),
      skipSync
    );
    const signed = this.wallet.signPsbt(psbt);
    return int(
      await this.wallet.createUtxosEnd(online, signed, skipSync),
      'created UTXOs'
    );
  }

  async sendBtc(
    address: string,
    amount: string,
    feeRate: string,
    skipSync: boolean
  ): Promise<string> {
    const online = this.connected();
    const psbt = await this.wallet.sendBtcBegin(
      online,
      address,
      BigInt(amount),
      BigInt(feeRate),
      skipSync
    );
    const signed = this.wallet.signPsbt(psbt);
    return str(await this.wallet.sendBtcEnd(online, signed, skipSync), 'txid');
  }

  async receive(
    witness: boolean,
    assetId: string | null,
    kind: string,
    amount: string | null,
    expirationTimestamp: string,
    transportEndpoints: string[],
    minConfirmations: number
  ): Promise<DtoReceive> {
    const wireAssignment =
      kind === 'Fungible' || kind === 'InflationRight'
        ? { [kind]: BigInt(amount ?? fail(`${kind} receive requires amount`)) }
        : kind;
    const args = [
      this.connected(),
      assetId,
      wireAssignment,
      BigInt(expirationTimestamp),
      transportEndpoints,
      minConfirmations,
      null,
    ] as const;
    return receive(
      await (witness
        ? this.wallet.witnessReceive(...args)
        : this.wallet.blindReceive(...args))
    );
  }

  private parseInvoice(invoice: string) {
    const parsed = new this.runtime.WasmInvoice(invoice);
    try {
      return invoiceData(parsed.invoiceData());
    } finally {
      parsed.free();
    }
  }

  async decodeInvoice(invoice: string): Promise<DtoInvoice> {
    return this.parseInvoice(invoice).dto;
  }

  /** The Kotlin bridge's `send()`: invoice checks, then begin, sign, end. */
  async send(
    invoice: string,
    assetId: string | null,
    amount: string | null,
    witnessAmountSat: string | null,
    witnessBlinding: string | null,
    donation: boolean,
    feeRate: string,
    minConfirmations: number,
    senderTransportEndpoint: string
  ): Promise<DtoOperation> {
    const online = this.connected();
    const { dto, wasmNetwork, raw } = this.parseInvoice(invoice);
    if (wasmNetwork !== this.wasmNetwork)
      fail('Invoice network does not match wallet');
    if (assetId !== null && dto.assetId !== null && assetId !== dto.assetId)
      fail('Asset override does not match invoice');
    const asset = dto.assetId ?? assetId ?? fail('Asset ID is required');
    const n = amount === null ? null : BigInt(amount);
    let wireAssignment: unknown;
    if (dto.assignment.type === 'Any') {
      if (n === null || n === 0n) fail('Amount is required');
      wireAssignment = { Fungible: n };
    } else if (dto.assignment.type === 'Fungible') {
      if (n !== null && n !== BigInt(dto.assignment.amount!))
        fail('Amount override does not match invoice');
      wireAssignment = raw.assignment;
    } else {
      if (n !== null) fail('Amount override is incompatible with invoice');
      wireAssignment = raw.assignment;
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    const invoiceExpiry =
      dto.expirationTimestamp === null ? null : BigInt(dto.expirationTimestamp);
    let expiry: bigint;
    if (invoiceExpiry === null) expiry = now + DEFAULT_SEND_EXPIRY_SECONDS;
    else if (invoiceExpiry <= now + SEND_EXPIRY_MARGIN_SECONDS)
      fail('Invoice expires too soon');
    else expiry = invoiceExpiry - SEND_EXPIRY_MARGIN_SECONDS;
    const recipient = {
      recipientId: dto.recipientId,
      witnessData:
        witnessAmountSat === null
          ? null
          : { amountSat: witnessAmountSat, blinding: witnessBlinding },
      assignment: wireAssignment,
      transportEndpoints: dto.transportEndpoints,
      publicKey: dto.publicKey,
      encryption: dto.encryption,
      expirationTimestamp: invoiceExpiry,
    };
    const begun = record(
      await this.wallet.sendBegin(
        online,
        { [asset]: [recipient] },
        donation,
        BigInt(feeRate),
        minConfirmations,
        expiry,
        senderTransportEndpoint,
        null,
        false
      ),
      'send begin result'
    );
    const signed = this.wallet.signPsbt(str(begun.psbt, 'PSBT'));
    return operation(await this.wallet.sendEnd(online, signed, false));
  }

  async issueAssetNia(
    ticker: string,
    name: string,
    precision: number,
    amounts: string[]
  ): Promise<DtoAsset> {
    return this.persisted(
      asset(
        this.wallet.issueAssetNia(
          ticker,
          name,
          precision,
          amounts.map((n) => BigInt(n))
        ),
        'Nia'
      )
    );
  }

  async issueAssetIfa(
    ticker: string,
    name: string,
    precision: number,
    amounts: string[],
    inflationAmounts: string[],
    rejectListUrl: string | null
  ): Promise<DtoAsset> {
    return this.persisted(
      asset(
        this.wallet.issueAssetIfa(
          ticker,
          name,
          precision,
          amounts.map((n) => BigInt(n)),
          inflationAmounts.map((n) => BigInt(n)),
          rejectListUrl,
          // As on React Native: no link right, not linked from a contract.
          false,
          null
        ),
        'Ifa'
      )
    );
  }

  async inflate(
    assetId: string,
    amounts: string[],
    feeRate: string,
    minConfirmations: number
  ): Promise<DtoOperation> {
    const online = this.connected();
    const psbt = await this.wallet.inflateBegin(
      online,
      assetId,
      amounts.map((n) => BigInt(n)),
      BigInt(feeRate),
      minConfirmations
    );
    const signed = this.wallet.signPsbt(psbt);
    return operation(await this.wallet.inflateEnd(online, signed));
  }

  async failTransfers(
    batchTransferIdx: number | null,
    noAssetOnly: boolean,
    skipSync: boolean
  ): Promise<boolean> {
    return bool(
      await this.wallet.failTransfers(
        this.connected(),
        batchTransferIdx,
        noAssetOnly,
        skipSync
      ),
      'fail transfers result'
    );
  }

  async refresh(skipSync: boolean): Promise<DtoRefreshed[]> {
    const result = await this.wallet.refresh(
      this.connected(),
      null,
      [],
      skipSync
    );
    const entries =
      result instanceof Map
        ? [...result.entries()]
        : Object.entries(record(result, 'refresh result'));
    return entries.map(([key, item]) => {
      const idx = typeof key === 'number' ? key : Number(key);
      const v = record(item, 'refreshed transfer');
      return {
        batchTransferIdx: int(idx, 'batch transfer idx'),
        updatedStatus: optStr(v.updatedStatus, 'updated status'),
        failure:
          v.failure === null || v.failure === undefined
            ? null
            : refreshFailure(v.failure),
      };
    });
  }

  async sync(): Promise<void> {
    await this.wallet.sync(this.connected());
  }

  async estimateFeeRate(blocks: number): Promise<number> {
    return this.wallet.getFeeEstimation(this.connected(), blocks);
  }
}
