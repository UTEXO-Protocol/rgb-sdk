import { InvoiceRequest, SendAssetEndRequestModel, SendResult, Transfer } from './wallet-model';

/**
 * UTEXO Protocol Types
 */

export type PublicKeys = {
    xpub: string;
    accountXpubVanilla: string;
    accountXpubColored: string;
    masterFingerprint: string;
}

/**
 * Lightning API Types
 */
export interface LightningAsset {
    /**
     * @type {string}
     * @memberof LightningAsset
     */
    assetId: string;
  
    /**
     * @type {number}
     * @memberof LightningAsset
     */
    amount: number;
  }
/**
 * Request model for creating Lightning invoice.
 *
 * @export
 * @interface CreateLightningInvoiceRequestModel
 */
export interface CreateLightningInvoiceRequestModel {
    /**
     * @type {number}
     * @memberof CreateLightningInvoiceRequestModel
     */
    amountSats?: number;
  
    /**
     * @type {LightningAsset}
     * @memberof CreateLightningInvoiceRequestModel
     */
    asset: LightningAsset;
  
    /**
     * @type {number}
     * @memberof CreateLightningInvoiceRequestModel
     */
    expirySeconds?: number;
  }

export interface LightningReceiveRequest {
    lnInvoice: string;
    expiresAt?: number;
    tempRequestId: number;
}

export interface LightningSendRequest extends SendResult {

}

export interface GetLightningSendFeeEstimateRequestModel {
    invoice: string;
    assetId?: string;
}

export interface PayLightningInvoiceRequestModel {
    lnInvoice: string;
    maxFee?: number;

    tempRequestId: number;
}

export interface PayLightningInvoiceEndRequestModel {
    signedPsbt: string;
    tempRequestId: number;
    lnInvoice: string;
}

/**
 * Onchain API Types
 */

export interface OnchainReceiveRequestModel extends InvoiceRequest {
    amount: number;
    assetId: string;
}

export interface OnchainReceiveResponse {
    /** Mainnet invoice */
    invoice: string;

    /** Temporary request ID for the bridge transfer */
    tempRequestId: number;
}

export interface OnchainSendRequestModel {
    /** Temporary request ID for the bridge transfer */
    tempRequestId: number;

    /** Mainnet invoice */
    invoice: string;
}

export interface OnchainSendEndRequestModel {
    /** Temporary request ID for the bridge transfer */
    tempRequestId: number;

    /** Mainnet invoice */
    invoice: string;
    signedPsbt: string;
}

export interface OnchainSendResponse extends SendResult {
 
}

export interface GetOnchainSendResponse {
    sendId: string;
    txid?: string;
    status: string;
    amount: number;
    assetId?: string;
    fee?: number;
    createdAt: number;
    completedAt?: number;
}

export interface ListLightningPaymentsResponse {
    payments: LightningSendRequest[];
}
