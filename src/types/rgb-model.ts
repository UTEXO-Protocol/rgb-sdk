
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
  exists: boolean;
  pendingBlinded: number;
}

export interface RgbAllocation {
  assetId: string;
  assignment: BindingAssignment;
  settled: boolean;
}


export interface DecodeRgbInvoiceResponse {
  recipientId: string;
  assetSchema?: string;
  assetId?: string;
  network: string;
  assignment: BindingAssignment;
  assignmentName?: string;
  expirationTimestamp?: number;
  transportEndpoints: string[];
}

export interface BindingAssignment {
  [key: string]: number;
}