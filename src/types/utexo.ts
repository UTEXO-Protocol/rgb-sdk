import { SendAssetEndRequestModel, Transfer } from './wallet-model';

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

export interface CreateLightningInvoiceRequestModel {
    amount: number;
    assetId?: string;
    description?: string;
    expiry?: number;
}

export interface LightningReceiveRequest {
    id: string;
    invoice: string;
    status: string;
    amount?: number;
    assetId?: string;
    createdAt: number;
    expiresAt?: number;
}

export interface LightningSendRequest {
    id: string;
    invoice: string;
    status: string;
    amount?: number;
    assetId?: string;
    fee?: number;
    createdAt: number;
    completedAt?: number;
}

export interface GetLightningSendFeeEstimateRequestModel {
    invoice: string;
    assetId?: string;
}

export interface PayLightningInvoiceRequestModel {
    invoice: string;
    maxFee?: number;
    assetId?: string;
}

/**
 * Onchain API Types
 */

export interface OnchainSendRequestModel {
    address: string;
    amount: number;
    assetId?: string;
    feeRate?: number;
}

export interface OnchainSendResponse {
    sendId: string;
    txid?: string;
    status: string;
    amount: number;
    assetId?: string;
    fee?: number;
    createdAt: number;
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
