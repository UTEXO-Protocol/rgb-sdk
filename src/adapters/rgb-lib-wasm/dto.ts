/**
 * The values the session hands the mappers: the same shapes as the
 * `@utexo/rgb-lib-rn` native bridge (`NativeRgbLib.ts`), so both engines map
 * them with the same code. u64 values are decimal strings; missing values are
 * `null`.
 */
export type DtoBalance = { settled: string; future: string; spendable: string };
export type DtoAssignment = { type: string; amount: string | null };
export type DtoOutpoint = { txid: string; vout: number };
export type DtoMedia = { filePath: string; mime: string; digest: string };
export type DtoAsset = {
  schema: string;
  assetId: string;
  ticker: string | null;
  name: string;
  details: string | null;
  precision: number;
  issuedSupply: string | null;
  initialSupply: string | null;
  maxSupply: string | null;
  knownCirculatingSupply: string | null;
  timestamp: string;
  addedAt: string;
  balance: DtoBalance;
  media: DtoMedia | null;
  rejectListUrl: string | null;
};
export type DtoTransfer = {
  idx: number;
  batchTransferIdx: number;
  createdAt: string;
  updatedAt: string;
  status: string;
  requestedAssignment: DtoAssignment | null;
  assignments: DtoAssignment[];
  kind: string;
  txid: string | null;
  recipientId: string | null;
  receiveUtxo: DtoOutpoint | null;
  changeUtxos: DtoOutpoint[];
  expiration: string | null;
  transportEndpoints: {
    endpoint: string;
    transportType: string;
    used: boolean;
  }[];
  invoiceString: string | null;
  consignmentPath: string | null;
};
export type DtoTransaction = {
  transactionType: string;
  txid: string;
  received: string;
  sent: string;
  fee: string;
  confirmationTime: { height: number; timestamp: string } | null;
};
export type DtoUnspent = {
  utxo: {
    outpoint: DtoOutpoint;
    btcAmount: string;
    colorable: boolean;
    exists: boolean;
  };
  rgbAllocations: {
    assetId: string | null;
    assignment: DtoAssignment;
    settled: boolean;
  }[];
  pendingBlinded: number;
};
export type DtoReceive = {
  invoice: string;
  recipientId: string;
  expirationTimestamp: string;
  batchTransferIdx: number;
  publicKey: string;
};
export type DtoInvoice = {
  recipientId: string;
  assetSchema: string | null;
  assetId: string | null;
  assignment: DtoAssignment;
  assignmentName: string | null;
  /** SDK network name (lower case). */
  network: string;
  expirationTimestamp: string | null;
  transportEndpoints: string[];
  publicKey: string | null;
  encryption: string;
  unknownQueryParams: { key: string; value: string }[];
};
export type DtoOperation = {
  txid: string;
  batchTransferIdx: number;
  entropy: string;
};
export type DtoRefreshed = {
  batchTransferIdx: number;
  updatedStatus: string | null;
  failure: { name: string; message: string } | null;
};
