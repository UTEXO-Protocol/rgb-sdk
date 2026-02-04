import type { Readable } from 'stream';

export type RGBHTTPClientParams = {
  xpubVan: string;
  xpubCol: string;
  masterFingerprint: string;
  rgbEndpoint: string;
}

export interface FailTransfersRequest {
  batchTransferIdx?: number
  noAssetOnly?: boolean
  skipSync?: boolean
}

export interface WalletBackupResponse {
  message: string;
  backupPath: string;
}

export interface WalletRestoreResponse {
  message: string;
}

export interface RestoreWalletRequestModel {
  backupFilePath: string;
  password: string;
  dataDir: string;
}

export interface WitnessData {
  amountSat: number;
  blinding?: number;
}
export interface InvoiceRequest {
  amount: number;
  assetId?: string;
  minConfirmations?: number;
  durationSeconds?: number;
}
export interface Recipient {
  recipientId: string;
  witnessData?: WitnessData;
  amount: number;
  transportEndpoints: string[];
}
export interface IssueAssetNiaRequestModel { ticker: string; name: string; amounts: number[]; precision: number }

export interface IssueAssetIfaRequestModel {
  ticker: string;
  name: string;
  precision: number;
  amounts: number[];
  inflationAmounts: number[];
  replaceRightsNum: number;
  rejectListUrl: string | null;
}
export interface SendAssetBeginRequestModel {
  invoice: string;
  witnessData?: WitnessData;
  assetId?: string;
  amount?: number;
  // recipientMap: Record<string, Recipient[]>;
  // donation?: boolean;            // default: false
  feeRate?: number;             // default: 1
  minConfirmations?: number;    // default: 1
}

export interface SendAssetEndRequestModel {
  signedPsbt: string;
  skipSync?: boolean;
}

export interface SendResult {
  txid: string;
  batchTransferIdx: number;
}

export interface OperationResult {
  txid: string;
  batchTransferIdx: number;
}

export interface CreateUtxosBeginRequestModel {
  upTo?: boolean;
  num?: number;
  size?: number;
  feeRate?: number;
}

export interface CreateUtxosEndRequestModel {
  signedPsbt: string;
  skipSync?: boolean;
}

export interface InflateAssetIfaRequestModel {
  assetId: string;
  inflationAmounts: number[];
  feeRate?: number;
  minConfirmations?: number;
}

export interface InflateEndRequestModel {
  signedPsbt: string;
}

export interface SendBtcBeginRequestModel {
  address: string;
  amount: number;
  feeRate: number;
  skipSync?: boolean;
}
export interface SendBtcEndRequestModel {
  signedPsbt: string;
  skipSync?: boolean;
}

export interface GetFeeEstimationRequestModel {
  blocks: number;
}

export type GetFeeEstimationResponse = Record<string, number> | number;

export enum TransactionType {
  RGB_SEND = 0,
  DRAIN = 1,
  CREATE_UTXOS = 2,
  USER = 3,
}

export interface BlockTime {
  height: number;
  timestamp: number;
}

export interface Transaction {
  transactionType: TransactionType;
  txid: string;
  received: number;
  sent: number;
  fee: number;
  confirmationTime?: BlockTime;
}
enum TransferKind {
    ISSUANCE = 0,
    RECEIVE_BLIND = 1,
    RECEIVE_WITNESS = 2,
    SEND = 3,
    INFLATION = 4
  }
export interface RgbTransfer {
  idx: number;
  batchTransferIdx: number;
  createdAt: number;
  updatedAt: number;
  status: TransferStatus;
  amount: number;
  kind: TransferKind;
  txid: string | null;
  recipientId: string;
  receiveUtxo: { txid: string; vout: number };
  changeUtxo: { txid: string; vout: number } | null;
  expiration: number;
  transportEndpoints: {
    endpoint: string;
    transportType: number;
    used: boolean;
  }[];
}

export enum TransferStatus {
  WAITING_COUNTERPARTY = 0,
  WAITING_CONFIRMATIONS,
  SETTLED,
  FAILED,
}
export interface Unspent {
  utxo: Utxo;
  rgbAllocations: RgbAllocation[];
}
export interface Utxo {
  outpoint: {
    txid: string;
    vout: number;
  };
  btcAmount: number;
  colorable: boolean;
}

export interface RgbAllocation {
  assetId: string;
  amount: number;
  settled: boolean;
}

export interface Balance {
  settled: number
  future: number,
  spendable: number
}

export interface BtcBalance {
  vanilla: Balance,
  colored: Balance
}
export interface InvoiceReceiveData {
  invoice: string
  recipientId: string
  expirationTimestamp: number
  batchTransferIdx: number
}
export interface AssetNIA {

  /**
   * @type {string}
   * @memberof AssetNIA
   * @example rgb:2dkSTbr-jFhznbPmo-TQafzswCN-av4gTsJjX-ttx6CNou5-M98k8Zd
   */
  assetId: string;

  /**
   * @type {AssetIface}
   * @memberof AssetNIA
   */
  assetIface?: AssetIface;

  /**
   * @type {string}
   * @memberof AssetNIA
   * @example USDT
   */
  ticker: string;

  /**
   * @type {string}
   * @memberof AssetNIA
   * @example Tether
   */
  name: string;

  /**
   * @type {string}
   * @memberof AssetNIA
   * @example asset details
   */
  details?: string;

  /**
   * @type {number}
   * @memberof AssetNIA
   * @example 0
   */
  precision: number;

  /**
   * @type {number}
   * @memberof AssetNIA
   * @example 777
   */
  issuedSupply: number;

  /**
   * @type {number}
   * @memberof AssetNIA
   * @example 1691160565
   */
  timestamp: number;

  /**
   * @type {number}
   * @memberof AssetNIA
   * @example 1691161979
   */
  addedAt: number;

  /**
   * @type {Balance}
   * @memberof AssetNIA
   */
  balance: Balance;

  /**
   * @type {Media}
   * @memberof AssetNIA
   */
  media?: Media;
}

export interface AssetIfa {
  assetId: string;
  ticker: string;
  name: string;
  details?: string;
  precision: number;
  initialSupply: number;
  maxSupply: number;
  knownCirculatingSupply: number;
  timestamp: number;
  addedAt: number;
  balance: Balance;
  media?: Media;
  rejectListUrl?: string;
}

export interface Media {

  /**
   * @type {string}
   * @memberof Media
   * @example /path/to/media
   */
  filePath?: string;

  /**
   * @type {string}
   * @memberof Media
   * @example text/plain
   */
  mime?: string;
}

export enum AssetIface {
  RGB20 = 'RGB20',
  RGB21 = 'RGB21',
  RGB25 = 'RGB25'
}

export enum AssetSchema {
  Nia = 'Nia',
  Uda = 'Uda',
  Cfa = 'Cfa'
}

/**
 * 
 *
 * @export
 * @interface ListAssetsResponse
 */
export interface ListAssetsResponse {

  /**
   * @type {Array<AssetNIA>}
   * @memberof ListAssetsResponse
   */
  nia?: Array<AssetNIA>;

  /**
   * @type {Array<AssetNIA>}
   * @memberof ListAssetsResponse
   */
  uda?: Array<AssetNIA>;

  /**
   * @type {Array<AssetNIA>}
   * @memberof ListAssetsResponse
   */
  cfa?: Array<AssetNIA>;
}
export interface IssueAssetNIAResponse {

  /**
   * @type {AssetNIA}
   * @memberof IssueAssetNIAResponse
   */
  asset?: AssetNIA;
}

/**
 * 
 *
 * @export
 * @interface AssetBalanceResponse
 */
export interface AssetBalanceResponse {

  /**
   * @type {number}
   * @memberof AssetBalanceResponse
   * @example 777
   */
  settled?: number;

  /**
   * @type {number}
   * @memberof AssetBalanceResponse
   * @example 777
   */
  future?: number;

  /**
   * @type {number}
   * @memberof AssetBalanceResponse
   * @example 777
   */
  spendable?: number;

  /**
   * @type {number}
   * @memberof AssetBalanceResponse
   * @example 444
   */
  offchainOutbound?: number;

  /**
   * @type {number}
   * @memberof AssetBalanceResponse
   * @example 0
   */
  offchainInbound?: number;
}

export interface DecodeRgbInvoiceResponse {
  recipientId: string;
  assetSchema?: string;
  assetId?: string;
  network: string;
  assignment: Assignment;
  assignmentName?: string;
  expirationTimestamp?: number;
  transportEndpoints: string[];
}

export interface Assignment {
  [key: string]: any;
}