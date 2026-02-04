import { RGBLibClient, restoreWallet } from '../client/index';
import * as IWalletModel from '../types/wallet-model';
import { signPsbt, signPsbtFromSeed, signMessage as signSchnorrMessage, verifyMessage as verifySchnorrMessage, estimatePsbt } from '../crypto';
import type { EstimateFeeResult, Network } from '../crypto';
import { generateKeys } from '../crypto';
import { normalizeNetwork } from '../utils/validation';
import { ValidationError, WalletError, CryptoError } from '../errors';
import type { Readable } from 'stream';
import path from 'path';
import * as os from 'os';
import type { IWalletManager } from './IWalletManager';
import { FailTransfersRequest } from '../types/rgb-model';
/**
 * Restore wallet from backup
 * This should be called before creating a WalletManager instance
 * @param params - Restore parameters including backup file path, password, and restore directory
 * @returns Wallet restore response
 */
export const restoreFromBackup = (params: IWalletModel.RestoreWalletRequestModel): IWalletModel.WalletRestoreResponse => {
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
export class WalletManager implements IWalletManager {
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

  public async initialize(): Promise<void> {
    console.log('initializing is not reqire');
  }

  public async goOnline(indexerUrl: string, skipConsistencyCheck?: boolean): Promise<void> {
    this.client.getOnline();
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
  public async dispose(): Promise<void> {
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

  public registerWallet(): { address: string; btcBalance: IWalletModel.BtcBalance } {
    return this.client.registerWallet();
  }

  public async getBtcBalance(): Promise<IWalletModel.BtcBalance> {
    return this.client.getBtcBalance();
  }

  public async getAddress(): Promise<string> {
    return this.client.getAddress();
  }

  public async listUnspents(): Promise<IWalletModel.Unspent[]> {
    const unspents = this.client.listUnspents();
    return unspents.map(unspent => ({
      utxo: {
        ...unspent.utxo,
        exists: (unspent.utxo as any).exists ?? true,
      },
      rgbAllocations: unspent.rgbAllocations.map(allocation => ({
        assetId: allocation.assetId,
        assignment: { type: 'Fungible' as const, amount: allocation.amount },
        settled: allocation.settled,
      })),
      pendingBlinded: (unspent as any).pendingBlinded ?? 0,
    }));
  }

  public async listAssets():Promise<IWalletModel.ListAssets>{
    const assets = this.client.listAssets();
    return {
      nia: (assets.nia ?? []) as unknown as IWalletModel.AssetNIA[],
      uda: (assets.uda ?? []) as unknown as IWalletModel.AssetUDA[],
      cfa: (assets.cfa ?? []) as unknown as IWalletModel.AssetCFA[],
      ifa: [],
    };
  }

  public async getAssetBalance(asset_id: string): Promise<IWalletModel.AssetBalance> {
    const balance = this.client.getAssetBalance(asset_id);
    return {
      settled: balance.settled ?? 0,
      future: balance.future ?? 0,
      spendable: balance.spendable ?? 0,
      offchainOutbound: balance.offchainOutbound ?? 0,
      offchainInbound: balance.offchainInbound ?? 0,
    };
  }

  public async createUtxosBegin(params: IWalletModel.CreateUtxosBeginRequestModel): Promise<string> {
    return this.client.createUtxosBegin(params);
  }

  public async createUtxosEnd(params: IWalletModel.CreateUtxosEndRequestModel): Promise<number> {
    return this.client.createUtxosEnd(params);
  }

  public async sendBegin(params: IWalletModel.SendAssetBeginRequestModel): Promise<string> {
    return this.client.sendBegin(params);
  }

  public async sendEnd(params: IWalletModel.SendAssetEndRequestModel): Promise<IWalletModel.SendResult> {
    return this.client.sendEnd(params);
  } 

  public async sendBtcBegin(params: IWalletModel.SendBtcBeginRequestModel): Promise<string> {
    return this.client.sendBtcBegin(params);
  }

  public async sendBtcEnd(params: IWalletModel.SendBtcEndRequestModel): Promise<string> {
    return this.client.sendBtcEnd(params);
  }

  public async estimateFeeRate(blocks: number): Promise<IWalletModel.GetFeeEstimationResponse> {
    if (!Number.isFinite(blocks)) {
      throw new ValidationError('blocks must be a finite number', 'blocks');
    }
    if (!Number.isInteger(blocks) || blocks <= 0) {
      throw new ValidationError('blocks must be a positive integer', 'blocks');
    }

    const feeEstimation = await this.client.getFeeEstimation({ blocks });
    return feeEstimation as unknown as IWalletModel.GetFeeEstimationResponse;
  }

  public async estimateFee(psbtBase64: string): Promise<EstimateFeeResult> {
     return await estimatePsbt(psbtBase64);
  }

  public async sendBtc(params: IWalletModel.SendBtcBeginRequestModel): Promise<string> {
    this.ensureNotDisposed();
    const psbt = await this.sendBtcBegin(params);
    const signed = await this.signPsbt(psbt);
    return await this.sendBtcEnd({ signedPsbt: signed });
  }

  public async blindReceive(params: IWalletModel.InvoiceRequest): Promise<IWalletModel.InvoiceReceiveData> {
    const invoice = await this.client.blindReceive({
      ...params,
      assetId: params.assetId ?? '',
    });
    return {
      invoice: invoice.invoice,
      recipientId: invoice.recipientId,
      expirationTimestamp: invoice.expirationTimestamp ?? null,
      batchTransferIdx: invoice.batchTransferIdx,
    };
  }

  public async witnessReceive(params: IWalletModel.InvoiceRequest): Promise<IWalletModel.InvoiceReceiveData> {
    const invoice = await this.client.witnessReceive({
      ...params,
      assetId: params.assetId ?? '',
    });
    return {
      invoice: invoice.invoice,
      recipientId: invoice.recipientId,
      expirationTimestamp: invoice.expirationTimestamp ?? null,
      batchTransferIdx: invoice.batchTransferIdx,
    };
  }
  public async decodeRGBInvoice(params: { invoice: string }): Promise<IWalletModel.InvoiceData> {
    const invoiceData = await this.client.decodeRGBInvoice(params);
    // Transform assignment from { [key: string]: any } to { type: AssignmentType, amount?: number }
    const assignmentKeys = Object.keys(invoiceData.assignment);
    const assignmentType = assignmentKeys[0] as IWalletModel.AssignmentType | undefined;
    const assignment: IWalletModel.Assignment = {
      type: assignmentType ?? 'Any',
      amount: assignmentType && invoiceData.assignment[assignmentType] ? Number(invoiceData.assignment[assignmentType]) : undefined,
    };
    
    return {
      invoice: params.invoice,
      recipientId: invoiceData.recipientId,
      assetSchema: invoiceData.assetSchema as IWalletModel.AssetSchema | undefined,
      assetId: invoiceData.assetId,
      network: invoiceData.network as IWalletModel.BitcoinNetwork,
      assignment,
      assignmentName: invoiceData.assignmentName,
      expirationTimestamp: invoiceData.expirationTimestamp ?? null,
      transportEndpoints: invoiceData.transportEndpoints,
    };
  }
  public async issueAssetNia(params: IWalletModel.IssueAssetNiaRequestModel): Promise<IWalletModel.AssetNIA> {
    const asset = await this.client.issueAssetNia(params);
    return asset;
  }

  public async issueAssetIfa(params: IWalletModel.IssueAssetIfaRequestModel): Promise<IWalletModel.AssetIfa> {
    const asset = await this.client.issueAssetIfa(params);
    return asset
  }
  public async inflateBegin(params: IWalletModel.InflateAssetIfaRequestModel): Promise<string> {
    return this.client.inflateBegin(params);
  }
  public async inflateEnd(params: IWalletModel.InflateEndRequestModel): Promise<IWalletModel.OperationResult> {
    return this.client.inflateEnd(params);
  }
  /**
   * Complete inflate operation: begin → sign → end
   * @param params - Inflate parameters
   * @param mnemonic - Optional mnemonic for signing
   */
  public async inflate(params: IWalletModel.InflateAssetIfaRequestModel, mnemonic?: string): Promise<IWalletModel.OperationResult> {
    this.ensureNotDisposed();
    const psbt = await this.inflateBegin(params);
    const signedPsbt = await this.signPsbt(psbt, mnemonic);
    return await this.inflateEnd({
      signedPsbt
    });
  }

  public async refreshWallet(): Promise<void> {
    this.client.refreshWallet();
  }

  public async listTransactions(): Promise<IWalletModel.Transaction[]> {
    const transactions = this.client.listTransactions();
    const transactionTypeMap: Record<number, IWalletModel.TransactionType> = {
      0: 'RgbSend',
      1: 'Drain',
      2: 'CreateUtxos',
      3: 'User',
    };
    
    return transactions.map(tx => ({
      transactionType: transactionTypeMap[tx.transactionType as number] ?? 'User',
      txid: tx.txid,
      received: tx.received,
      sent: tx.sent,
      fee: tx.fee,
      confirmationTime: tx.confirmationTime,
    }));
  }

  public async listTransfers(asset_id?: string): Promise<IWalletModel.Transfer[]> {
    const transfers = this.client.listTransfers(asset_id);
    
    // Map TransferKind enum to string union
    const kindMap: Record<number, IWalletModel.TransferKind> = {
      0: 'Issuance',
      1: 'ReceiveBlind',
      2: 'ReceiveWitness',
      3: 'Send',
      4: 'Inflation',
    };
    
    // Map TransferStatus enum to string union
    const statusMap: Record<number, IWalletModel.TransferStatus> = {
      0: 'WaitingCounterparty',
      1: 'WaitingConfirmations',
      2: 'Settled',
      3: 'Failed',
    };
    
    return transfers.map(transfer => ({
      ...transfer,
      status: statusMap[transfer.status as number] ?? 'Failed',
      assignments: [{
        type: 'Fungible' as const,
        amount: transfer.amount,
      }],
      kind: kindMap[transfer.kind as number] ?? 'Send',
      txid: transfer.txid ?? undefined,
  
      changeUtxo: transfer.changeUtxo ?? undefined,
      transportEndpoints: transfer.transportEndpoints.map(ep => ({
        endpoint: ep.endpoint,
        transportType: String(ep.transportType),
        used: ep.used,
      })),
    }));
  }

  public async failTransfers(params: IWalletModel.FailTransfersRequest): Promise<boolean> {
    return this.client.failTransfers(params);
  }


  public async createBackup(params: { backupPath: string, password: string }): Promise<IWalletModel.WalletBackupResponse> {
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
  public async send(invoiceTransfer: IWalletModel.SendAssetBeginRequestModel, mnemonic?: string): Promise<IWalletModel.SendResult> {
    this.ensureNotDisposed();
    const psbt = await this.sendBegin(invoiceTransfer);
    const signedPsbt = await this.signPsbt(psbt, mnemonic);
    console.log('send signedPsbt', signedPsbt);
    return await this.sendEnd({ signedPsbt });
  }

  public async createUtxos({ upTo, num, size, feeRate }: { upTo?: boolean, num?: number, size?: number, feeRate?: number }): Promise<number> {
    this.ensureNotDisposed();   
    const psbt = await this.createUtxosBegin({ upTo, num, size, feeRate });
    const signedPsbt = await this.signPsbt(psbt);
    return this.createUtxosEnd({ signedPsbt });
  }

  public async syncWallet(): Promise<void> {
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
