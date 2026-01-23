import { Wallet } from './../../bdk-wasm/pkg/bitcoindevkit.d';
/**
 * RGB Lib Client - Local client using rgb-lib directly instead of HTTP server
 * 
 * This client provides the same interface as RGBClient but uses rgb-lib locally
 * without requiring an RGB Node server.
 */
import * as path from 'path';

import * as fs from 'fs';
import type { Readable } from 'stream';

/**
 * Default transport endpoint for RGB protocol
 */
const DEFAULT_TRANSPORT_ENDPOINT = 'rpcs://proxy.iriswallet.com/0.2/json-rpc';
import {
  AssetBalanceResponse,
  BtcBalance,
  CreateUtxosBeginRequestModel,
  CreateUtxosEndRequestModel,
  FailTransfersRequest,
  InvoiceReceiveData,
  InvoiceRequest,
  IssueAssetNIAResponse,
  ListAssetsResponse,
  RGBHTTPClientParams,
  RgbTransfer,
  SendAssetBeginRequestModel,
  SendAssetEndRequestModel,
  SendResult,
  Transaction,
  Unspent,
  WalletBackupResponse,
  WalletRestoreResponse,
  RestoreWalletRequestModel,
  SendBtcBeginRequestModel,
  SendBtcEndRequestModel,
  GetFeeEstimationRequestModel,
  GetFeeEstimationResponse,
  AssetNIA,
  IssueAssetIfaRequestModel,
  AssetIfa,
  InflateAssetIfaRequestModel,
  InflateEndRequestModel,
  OperationResult,
  DecodeRgbInvoiceResponse,
  WitnessData
} from '../types/rgb-model';
import { ValidationError, WalletError, CryptoError } from '../errors';
import { normalizeNetwork } from '../utils/validation';
import type { Network } from '../crypto/types';
// Use default import for CommonJS compatibility in ESM
import rgblib from '@utexo/rgb-lib';
/**
 * Map network from client format to rgb-lib format
 */
function mapNetworkToRgbLib(network: string): string {
  const networkMap: Record<string, string> = {
    'mainnet': 'Mainnet',
    'testnet': 'Testnet',
    'testnet4': 'Testnet4',
    'signet': 'Signet',
    'regtest': 'Regtest',
  };
  const networkStr = String(network).toLowerCase();
  return networkMap[networkStr] || 'Regtest';
}

export interface RgbLibGeneratedKeys {
  mnemonic: string;
  xpub: string;
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
}

export const generateKeys = (network: string = 'regtest'): RgbLibGeneratedKeys => {
  return rgblib.generateKeys(mapNetworkToRgbLib(network));
}

export const restoreWallet = (params: { backupFilePath: string; password: string; dataDir: string }): WalletRestoreResponse => {
  const { backupFilePath, password, dataDir } = params;
  
  if (!fs.existsSync(backupFilePath)) {
    throw new ValidationError('Backup file not found', 'backup');
  }
  
  if (!fs.existsSync(dataDir)) {
    throw new ValidationError(`Restore directory does not exist: ${dataDir}`, 'restoreDir');
  }
  
  rgblib.restoreBackup(backupFilePath, password, dataDir);
  
  return {
    message: 'Wallet restored successfully',
  };
}

/**
 * RGB Lib Client class - Local implementation using rgb-lib
 */
export class RGBLibClient {
  private wallet: any;
  private online: any | null = null;
  private readonly xpubVan: string;
  private readonly xpubCol: string;
  private readonly masterFingerprint: string;
  private readonly network: Network;
  private readonly originalNetwork: string; // Preserve original input for rgb-lib mapping
  private readonly dataDir: string;
  private readonly transportEndpoint: string;
  private readonly indexerUrl: string;

  constructor(params: {
    xpubVan: string;
    xpubCol: string;
    masterFingerprint: string;
    dataDir: string;
    network: string;
    transportEndpoint?: string;
    indexerUrl?: string;
  }) {
    this.xpubVan = params.xpubVan;
    this.xpubCol = params.xpubCol;
    this.masterFingerprint = params.masterFingerprint;
    this.originalNetwork = params.network;
    this.network = normalizeNetwork(this.originalNetwork);
    
    this.dataDir = params.dataDir;
    this.transportEndpoint = params.transportEndpoint || DEFAULT_TRANSPORT_ENDPOINT;
    
    if (params.indexerUrl) {
      this.indexerUrl = params.indexerUrl;
    } else {
      const defaultIndexerUrls: Record<Network, string> = {
        'mainnet': 'ssl://electrum.iriswallet.com:50003',
        'testnet': 'ssl://electrum.iriswallet.com:50013',
        'testnet4': 'ssl://electrum.iriswallet.com:50053',
        'signet': 'tcp://46.224.75.237:50001',
        'regtest': 'tcp://regtest.thunderstack.org:50001',
      };
      this.indexerUrl = defaultIndexerUrls[this.network] || defaultIndexerUrls['regtest'];
    }

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    const walletData = {
      dataDir: this.dataDir,
      bitcoinNetwork: mapNetworkToRgbLib(this.originalNetwork),
      databaseType: rgblib.DatabaseType.Sqlite,
      accountXpubVanilla: this.xpubVan,
      accountXpubColored: this.xpubCol,
      masterFingerprint: this.masterFingerprint,
      maxAllocationsPerUtxo: '1',
      vanillaKeychain: "1",
      supportedSchemas: [
        rgblib.AssetSchema.Cfa,
        rgblib.AssetSchema.Nia,
        rgblib.AssetSchema.Uda,
      ],
    };

    try {
      this.wallet = new rgblib.Wallet(new rgblib.WalletData(walletData));
    } catch (error) {
      throw new WalletError('Failed to initialize rgb-lib wallet', undefined, error as Error);
    }
  }

  /**
   * Ensure online connection is established
   */
  private ensureOnline(): void {
    if (this.online) {
      return;
    }

    try {
      console.log('indexerUrl', this.indexerUrl);
      this.online = this.wallet.goOnline(false, this.indexerUrl);
    } catch (error) {
      throw new WalletError('Failed to establish online connection', undefined, error as Error);
    }
  }

  /**
   * Get online object, creating it if needed
   */
  private getOnline(): any {
    this.ensureOnline();
    return this.online;
  }

  registerWallet(): { address: string; btcBalance: BtcBalance } {
    const online = this.getOnline();
    const address = this.wallet.getAddress();
    const btcBalance = this.wallet.getBtcBalance(online, false);
    return {
      address,
      btcBalance,
    };
  }

  getBtcBalance(): BtcBalance {
    const online = this.getOnline();
    return this.wallet.getBtcBalance(online, false);
  }

  getAddress(): string {
    return this.wallet.getAddress();
  }

  listUnspents(): Unspent[] {
    const online = this.getOnline();
    return this.wallet.listUnspents(online, false, false);
  }

  createUtxosBegin(params: CreateUtxosBeginRequestModel): string {
    const online = this.getOnline();
    const upTo = params.upTo ?? false;
    const num = params.num !== undefined ? String(params.num) : null;
    const size = params.size !== undefined ? String(params.size) : null;
    const feeRate = params.feeRate ? String(params.feeRate) : '1';
    const skipSync = false;

    return this.wallet.createUtxosBegin(online, upTo, num, size, feeRate, skipSync);
  }

  createUtxosEnd(params: CreateUtxosEndRequestModel): number {
    const online = this.getOnline();
    const signedPsbt = params.signedPsbt;
    const skipSync = params.skipSync ?? false;

    return this.wallet.createUtxosEnd(online, signedPsbt, skipSync);
  }

  sendBegin(params: SendAssetBeginRequestModel): string {
    const online = this.getOnline();
    console.log('sendBegin params', params);
    
    const feeRate = String(params.feeRate ?? 1);
    const minConfirmations = String(params.minConfirmations ?? 1);
    const donation = false;

    let assetId: string | undefined = params.assetId;
    let amount: number | undefined = params.amount;
    let recipientId: string | undefined;
    let transportEndpoints: string[] = [];
    let witnessData: { amountSat: string, blinding?: number | null } | null = null;
    if (params.witnessData && params.witnessData.amountSat) {
      witnessData = {
        amountSat: String(params.witnessData.amountSat),
        blinding: params.witnessData.blinding ? Number(params.witnessData.blinding) : null,
      };
    }
    if (params.invoice) {
      const invoiceStr = params.invoice;
      const invoiceData = this.decodeRGBInvoice({ invoice: invoiceStr });
      recipientId = invoiceData.recipientId;
      transportEndpoints = invoiceData.transportEndpoints;
    }

    if (transportEndpoints.length === 0) {
      transportEndpoints = [this.transportEndpoint];
    }

    if (!assetId) {
      throw new ValidationError('asset_id is required for send operation', 'asset_id');
    }

    if (!recipientId) {
      throw new ValidationError('Could not extract recipient_id from invoice', 'invoice');
    }

    if (!amount) {
      throw new ValidationError('amount is required for send operation', 'amount');
    }

    const assignment = { Fungible: amount };
    const recipientMap: Record<string, any[]> = {
      [assetId]: [{
        recipientId: recipientId,
        witnessData: witnessData,
        assignment: assignment,
        transportEndpoints: transportEndpoints,
      }],
    };
    const psbt = this.wallet.sendBegin(
      online,
      recipientMap,
      donation,
      feeRate,
      minConfirmations
    );

    return psbt;
  }

  sendEnd(params: SendAssetEndRequestModel): SendResult {
    const online = this.getOnline();
    const signedPsbt = params.signedPsbt;
    const skipSync = params.skipSync ?? false;

    return this.wallet.sendEnd(online, signedPsbt, skipSync);
  }

  sendBtcBegin(params: SendBtcBeginRequestModel): string {
    const online = this.getOnline();
    const address = params.address;
    const amount = String(params.amount);
    const feeRate = String(params.feeRate);
    const skipSync = params.skipSync ?? false;

    return this.wallet.sendBtcBegin(online, address, amount, feeRate, skipSync);
  }

  sendBtcEnd(params: SendBtcEndRequestModel): string {
    const online = this.getOnline();
    const signedPsbt = params.signedPsbt;
    const skipSync = params.skipSync ?? false;

    return this.wallet.sendBtcEnd(online, signedPsbt, skipSync);
  }

  getFeeEstimation(params: GetFeeEstimationRequestModel): GetFeeEstimationResponse {
    const online = this.getOnline();
    const blocks = String(params.blocks);
    try {
    const result = this.wallet.getFeeEstimation(online, blocks);
    if (typeof result === 'string') {
      try {
        return JSON.parse(result);
      } catch {
        return result as unknown as GetFeeEstimationResponse;
      }
    }
    return result;
    }catch(error) {
      console.warn('rgb-lib estimation fee are not available, using default fee rate 2');
     return 2 as GetFeeEstimationResponse; // return default fee rate 4 when lib estimation fee error
    }
    
   
  }

  blindReceive(params: InvoiceRequest): InvoiceReceiveData {
    const assetId = params.assetId || null;
    const assignment = `{"Fungible":${params.amount}}`;
    const durationSeconds = String(params.durationSeconds ?? 2000);
    const transportEndpoints: string[] = [this.transportEndpoint];
    const minConfirmations = String(params.minConfirmations ?? 3);

    return this.wallet.blindReceive(
      assetId,
      assignment,
      durationSeconds,
      transportEndpoints,
      minConfirmations
    );
  }

  witnessReceive(params: InvoiceRequest): InvoiceReceiveData {
    const assetId = params.assetId || null;
    const assignment = `{"Fungible":${params.amount}}`;
    const durationSeconds = String(params.durationSeconds ?? 2000);
    const transportEndpoints: string[] = [this.transportEndpoint];
    const minConfirmations = String(params.minConfirmations ?? 3);

    return this.wallet.witnessReceive(
      assetId,
      assignment,
      durationSeconds,
      transportEndpoints,
      minConfirmations
    );
  }

  getAssetBalance(asset_id: string): AssetBalanceResponse {
    return this.wallet.getAssetBalance(asset_id);
  }

  issueAssetNia(params: { ticker: string; name: string; amounts: number[]; precision: number }): AssetNIA {
    const ticker = params.ticker;
    const name = params.name;
    const precision = String(params.precision);
    const amounts = params.amounts.map(a => String(a));

    return this.wallet.issueAssetNIA(ticker, name, precision, amounts);
  }

  issueAssetIfa(params: IssueAssetIfaRequestModel): AssetIfa {
    throw new ValidationError('issueAssetIfa is not fully supported in rgb-lib. Use RGB Node server for IFA assets.', 'asset');
  }

  inflateBegin(params: InflateAssetIfaRequestModel): string {
    throw new ValidationError('inflateBegin is not fully supported in rgb-lib. Use RGB Node server for inflation operations.', 'asset');
  }

  inflateEnd(params: InflateEndRequestModel): OperationResult {
    throw new ValidationError('inflateEnd is not fully supported in rgb-lib. Use RGB Node server for inflation operations.', 'asset');
  }

  listAssets(): ListAssetsResponse {
    const filterAssetSchemas: string[] = [];
    return this.wallet.listAssets(filterAssetSchemas);
  }

   decodeRGBInvoice(params: { invoice: string }): DecodeRgbInvoiceResponse{
    const invoiceString = params.invoice;
    
    const invoice = new rgblib.Invoice(invoiceString);
    
    try {
      return invoice.invoiceData();
    } finally {
      invoice.drop();
    }
  }

  refreshWallet(): void {
    const online = this.getOnline();
    const assetId = null;
    const filter: string[] = [];
    const skipSync = false;

    this.wallet.refresh(online, assetId, filter, skipSync);
  }

  dropWallet(): void {
    if (this.online) {
      rgblib.dropOnline(this.online);
      this.online = null;
    }
    if (this.wallet) {
      this.wallet.drop();
      this.wallet = null;
    }
  }

  listTransactions(): Transaction[] {
    const online = this.getOnline();
    const skipSync = false;
    return this.wallet.listTransactions(online, skipSync);
  }

  listTransfers(asset_id?: string): RgbTransfer[] {
    return this.wallet.listTransfers(asset_id?asset_id:null);
  }

  failTransfers(params: FailTransfersRequest): boolean {
    const online = this.getOnline();
    const batchTransferIdx = params.batchTransferIdx !== undefined ? params.batchTransferIdx : null;
    const noAssetOnly = params.noAssetOnly ?? false;
    const skipSync = params.skipSync ?? false;

    return this.wallet.failTransfers(online, batchTransferIdx, noAssetOnly, skipSync);
  }

  deleteTransfers(params: { batchTransferIdx?: number; noAssetOnly?: boolean }): boolean {
    const batchTransferIdx = params.batchTransferIdx !== undefined ? params.batchTransferIdx : null;
    const noAssetOnly = params.noAssetOnly ?? false;

    return this.wallet.deleteTransfers(batchTransferIdx, noAssetOnly);
  }

  syncWallet(): void {
    const online = this.getOnline();
    this.wallet.sync(online);
  }

  createBackup(params: {backupPath:string, password: string }): WalletBackupResponse {
   
    if(!params.backupPath) {
      throw new ValidationError('backupPath is required', 'backupPath');
    }
    if(!params.password) {
      throw new ValidationError('password is required', 'password');
    }
    
    if (!fs.existsSync(params.backupPath)) {
      throw new ValidationError(`Backup directory does not exist: ${params.backupPath}`, 'backupPath');
    }
    
    const fullBackupPath = path.join(params.backupPath, `${this.masterFingerprint}.backup`);
    this.wallet.backup(fullBackupPath, params.password);
        
    return {
      message: 'Backup created successfully',
      backupPath: fullBackupPath,
    };
  }
  /**
   * Cleanup resources
   */
  dispose(): void {
    this.dropWallet();
  }
}

