import { RGBLibClient, restoreWallet } from '../client/index';
import {
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  FailTransfersRequest,
  InvoiceRequest,
  InvoiceReceiveData,
  IssueAssetNiaRequestModel,
  IssueAssetNIAResponse,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendResult,
  AssetBalanceResponse,
  BtcBalance,
  ListAssetsResponse,
  Transaction,
  Unspent,
  RgbTransfer,
  WalletBackupResponse,
  WalletRestoreResponse,
  RestoreWalletRequestModel,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  GetFeeEstimationResponse,
  AssetNIA,
  IssueAssetIfaRequestModel,
  AssetIfa,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  OperationResult,
  DecodeRgbInvoiceResponse
} from '../types/rgb-model';
import { signPsbt, signPsbtFromSeed, signMessage as signSchnorrMessage, verifyMessage as verifySchnorrMessage, estimatePsbt } from '../crypto';
import type { EstimateFeeResult, Network } from '../crypto';
import { generateKeys } from '../crypto';
import { normalizeNetwork } from '../utils/validation';
import { ValidationError, WalletError, CryptoError } from '../errors';
import type { Readable } from 'stream';
import path from 'path';
import * as os from 'os';

/**
 * Restore wallet from backup
 * This should be called before creating a WalletManager instance
 * @param params - Restore parameters including backup file path, password, and restore directory
 * @returns Wallet restore response
 */
export const restoreFromBackup = (params: RestoreWalletRequestModel): WalletRestoreResponse => {
  const {
    backupFilePath,
    password,
    dataDir,
  } = params;

  if (!backupFilePath) {
    throw new ValidationError('backup file is required', 'backup');
  }
  if (!password) {
    throw new ValidationError('password is required', 'password');
  }
  if (!dataDir) {
    throw new ValidationError('restore directory is required', 'restoreDir');
  }

  return restoreWallet({
    backupFilePath,
    password,
    dataDir,
  });
};

/**
 * Generate a new wallet with keys
 * @param network - Network string (default: 'regtest')
 * @returns Generated keys including mnemonic, xpubs, and master fingerprint
 */
export const createWallet =  async (network: string = 'regtest') => {
  // return await generateKeys(network);
  return await generateKeys(network);
}

export type WalletInitParams = {

  xpubVan: string;
  xpubCol: string;
  mnemonic?: string;
  seed?: Uint8Array;
  network?: string | number;
  xpub?: string;
  masterFingerprint: string;
  transportEndpoint?: string;
  indexerUrl?: string;
  dataDir?: string;
}

/**
 * Wallet Manager - High-level wallet interface combining RGB API client and cryptographic operations
 * 
 * This class provides a unified interface for:
 * - RGB operations (via RGBLibClient - local rgb-lib)
 * - PSBT signing operations
 * - Wallet state management
 * 
 * @example
 * ```typescript
 * const keys = generateKeys('testnet');
 * const wallet = new WalletManager({
 *   xpubVan: keys.accountXpubVanilla,
 *   xpubCol: keys.accountXpubColored,
 *   masterFingerprint: keys.masterFingerprint,
 *   mnemonic: keys.mnemonic,
 *   network: 'testnet',
 *   transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
 *   indexerUrl: 'ssl://electrum.iriswallet.com:50013'
 * });
 * 
 * const balance = await wallet.getBtcBalance();
 * ```
 */
export class WalletManager {
  private readonly client: RGBLibClient;
  private readonly xpub: string | null;
  private readonly xpubVan: string;
  private readonly xpubCol: string;
  private mnemonic: string | null;
  private seed: Uint8Array | null;
  private readonly network: Network;
  private readonly masterFingerprint: string;
  private disposed: boolean = false;
  private readonly dataDir: string;
  constructor(params: WalletInitParams) {
    if (!params.xpubVan) {
      throw new ValidationError('xpubVan is required', 'xpubVan');
    }
    if (!params.xpubCol) {
      throw new ValidationError('xpubCol is required', 'xpubCol');
    }
    if (!params.masterFingerprint) {
      throw new ValidationError('masterFingerprint is required', 'masterFingerprint');
    }

    this.network = normalizeNetwork(params.network ?? 'regtest');


    this.xpubVan = params.xpubVan;
    this.xpubCol = params.xpubCol;
    this.seed = params.seed ?? null;
    this.mnemonic = params.mnemonic ?? null;
    this.xpub = params.xpub ?? null;
    this.masterFingerprint = params.masterFingerprint;
    this.dataDir = params.dataDir ?? path.join(os.tmpdir(), 'rgb-wallet', this.masterFingerprint);

    this.client = new RGBLibClient({
      xpubVan: params.xpubVan,
      xpubCol: params.xpubCol,
      masterFingerprint: params.masterFingerprint,
      network: this.network,
      transportEndpoint: params.transportEndpoint,
      indexerUrl: params.indexerUrl,
      dataDir: params.dataDir ?? this.dataDir,
    });
  }

  /**
   * Get wallet's extended public keys
   */
  public getXpub(): { xpubVan: string; xpubCol: string } {
    return {
      xpubVan: this.xpubVan,
      xpubCol: this.xpubCol
    };
  }

  /**
   * Get wallet's network
   */
  public getNetwork(): Network {
    return this.network;
  }

  /**
   * Dispose of sensitive wallet data
   * Clears mnemonic and seed from memory
   * Idempotent - safe to call multiple times
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    
    if (this.mnemonic !== null) {
      this.mnemonic = null;
    }

    if (this.seed !== null && this.seed.length > 0) {
      this.seed.fill(0);
      this.seed = null;
    }
    this.client.dropWallet();

    this.disposed = true;
  }

  /**
   * Check if wallet has been disposed
   */
  public isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Guard method to ensure wallet has not been disposed
   * @throws {WalletError} if wallet has been disposed
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new WalletError('Wallet has been disposed');
    }
  }

  public registerWallet(): { address: string; btcBalance: BtcBalance } {
    return this.client.registerWallet();
  }

  public getBtcBalance(): BtcBalance {
    return this.client.getBtcBalance();
  }

  public getAddress(): string {
    return this.client.getAddress();
  }

  public listUnspents(): Unspent[] {
    return this.client.listUnspents();
  }

  public listAssets(): ListAssetsResponse {
    return this.client.listAssets();
  }

  public getAssetBalance(asset_id: string): AssetBalanceResponse {
    return this.client.getAssetBalance(asset_id);
  }

  public createUtxosBegin(params: CreateUtxosBeginRequestModel): string {
    return this.client.createUtxosBegin(params);
  }

  public createUtxosEnd(params: CreateUtxosEndRequestModel): number {
    return this.client.createUtxosEnd(params);
  }

  public sendBegin(params: SendAssetBeginRequestModel): string {
    return this.client.sendBegin(params);
  }

  public sendEnd(params: SendAssetEndRequestModel): SendResult {
    return this.client.sendEnd(params);
  }

  public sendBtcBegin(params: SendBtcBeginRequestModel): string {
    return this.client.sendBtcBegin(params);
  }

  public sendBtcEnd(params: SendBtcEndRequestModel): string {
    return this.client.sendBtcEnd(params);
  }

  public estimateFeeRate(blocks: number): GetFeeEstimationResponse {
    if (!Number.isFinite(blocks)) {
      throw new ValidationError('blocks must be a finite number', 'blocks');
    }
    if (!Number.isInteger(blocks) || blocks <= 0) {
      throw new ValidationError('blocks must be a positive integer', 'blocks');
    }

    return this.client.getFeeEstimation({ blocks });
  }

  public async estimateFee(psbtBase64: string): Promise<EstimateFeeResult> {
     return await estimatePsbt(psbtBase64);
  }

  public async sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
    this.ensureNotDisposed();
    const psbt = this.sendBtcBegin(params);
    const signed = await this.signPsbt(psbt);
    return this.sendBtcEnd({ signedPsbt: signed });
  }

  public blindReceive(params: InvoiceRequest): InvoiceReceiveData {
    return this.client.blindReceive(params);
  }

  public witnessReceive(params: InvoiceRequest): InvoiceReceiveData {
    return this.client.witnessReceive(params);
  }

  public issueAssetNia(params: IssueAssetNiaRequestModel): AssetNIA {
    return this.client.issueAssetNia(params);
  }

  public issueAssetIfa(params: IssueAssetIfaRequestModel): AssetIfa {
    return this.client.issueAssetIfa(params);
  }

  public inflateBegin(params: InflateAssetIfaRequestModel): string {
    return this.client.inflateBegin(params);
  }

  public inflateEnd(params: InflateEndRequestModel): OperationResult {
    return this.client.inflateEnd(params);
  }

  /**
   * Complete inflate operation: begin → sign → end
   * @param params - Inflate parameters
   * @param mnemonic - Optional mnemonic for signing
   */
  public async inflate(params: InflateAssetIfaRequestModel, mnemonic?: string): Promise<OperationResult> {
    this.ensureNotDisposed();
    const psbt = await this.inflateBegin(params);
    const signedPsbt = await this.signPsbt(psbt, mnemonic);
    return await this.inflateEnd({
      signedPsbt
    });
  }

  public refreshWallet(): void {
    this.client.refreshWallet();
  }

  public listTransactions(): Transaction[] {
    return this.client.listTransactions();
  }

  public listTransfers(asset_id?: string): RgbTransfer[] {
    return this.client.listTransfers(asset_id);
  }

  public failTransfers(params: FailTransfersRequest): boolean {
    return this.client.failTransfers(params);
  }

  public decodeRGBInvoice(params: { invoice: string }): DecodeRgbInvoiceResponse {
    return this.client.decodeRGBInvoice(params);
  }

  public createBackup(params: { backupPath: string, password: string }): WalletBackupResponse {
    return this.client.createBackup(params);
  }

  /**
   * Sign a PSBT using the wallet's mnemonic or a provided mnemonic
   * @param psbt - Base64 encoded PSBT
   * @param mnemonic - Optional mnemonic (uses wallet's mnemonic if not provided)
   */
  public async signPsbt(psbt: string, mnemonic?: string): Promise<string> {
    this.ensureNotDisposed();
    const mnemonicToUse = mnemonic ?? this.mnemonic;

    if (mnemonicToUse) {
      return await signPsbt(mnemonicToUse, psbt, this.network);
    }
    if (this.seed) {
      return await signPsbtFromSeed(this.seed, psbt, this.network);
    }

    throw new WalletError('mnemonic is required. Provide it as parameter or initialize wallet with mnemonic.');
  }

  /**
   * Complete send operation: begin → sign → end
   * @param invoiceTransfer - Transfer invoice parameters
   * @param mnemonic - Optional mnemonic for signing
   */
  public async send(invoiceTransfer: SendAssetBeginRequestModel, mnemonic?: string): Promise<SendResult> {
    this.ensureNotDisposed();
    const psbt = await this.sendBegin(invoiceTransfer);
    const signedPsbt = await this.signPsbt(psbt, mnemonic);
    console.log('send signedPsbt', signedPsbt);
    return await this.sendEnd({ signedPsbt });
  }

  public async createUtxos({ upTo, num, size, feeRate }: { upTo?: boolean, num?: number, size?: number, feeRate?: number }): Promise<number> {
    this.ensureNotDisposed();
    const psbt = this.createUtxosBegin({ upTo, num, size, feeRate });
    const signedPsbt = await this.signPsbt(psbt);
    return this.createUtxosEnd({ signedPsbt });
  }

  public syncWallet(): void {
    this.client.syncWallet();
  }

  public async signMessage(message: string): Promise<string> {
    this.ensureNotDisposed();
    if (!message) {
      throw new ValidationError('message is required', 'message');
    }

    if (!this.seed) {
      throw new WalletError('Wallet seed is required for message signing. Initialize the wallet with a seed.');
    }

    return signSchnorrMessage({
      message,
      seed: this.seed,
      network: this.network,
    });
  }

  public async verifyMessage(message: string, signature: string, accountXpub?: string): Promise<boolean> {
    if (!message) {
      throw new ValidationError('message is required', 'message');
    }
    if (!signature) {
      throw new ValidationError('signature is required', 'signature');
    }

    return verifySchnorrMessage({
      message,
      signature,
      accountXpub: this.xpubVan,
      network: this.network,
    });
  }

}

/**
 * Factory function to create a WalletManager instance
 * Provides a cleaner API than direct constructor
 * 
 * @example
 * ```typescript
 * const keys = generateKeys('testnet');
 * const wallet = createWalletManager({
 *   xpubVan: keys.accountXpubVanilla,
 *   xpubCol: keys.accountXpubColored,
 *   masterFingerprint: keys.masterFingerprint,
 *   mnemonic: keys.mnemonic,
 *   network: 'testnet',
 *   transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
 *   indexerUrl: 'ssl://electrum.iriswallet.com:50013'
 * });
 * ```
 */
export function createWalletManager(params: WalletInitParams): WalletManager {
  return new WalletManager(params);
}

// Legacy singleton instance for backward compatibility
// @deprecated Use `new WalletManager(params)` or `createWalletManager(params)` instead
// This singleton will throw an error when accessed, requiring proper initialization
let _wallet: WalletManager | null = null;

export const wallet = new Proxy({} as WalletManager, {
  get(target, prop) {
    if (!_wallet) {
      throw new WalletError(
        'The legacy singleton wallet instance is deprecated. ' +
        'Please use `new WalletManager(params)` or `createWalletManager(params)` instead. ' +
        'Example: const wallet = new WalletManager({ xpubVan, xpubCol, masterFingerprint, network, transportEndpoint, indexerUrl })'
      );
    }
    const value = (_wallet as any)[prop];
    return typeof value === 'function' ? value.bind(_wallet) : value;
  },
});
