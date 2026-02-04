/**
 * UTEXO Protocol Interfaces
 * 
 * These interfaces define the contract for UTEXO-specific operations.
 * They are separated by concern (Lightning vs Onchain) and combined into IUTEXOProtocol.
 */

import type {
    CreateLightningInvoiceRequestModel,
    LightningReceiveRequest,
    LightningSendRequest,
    GetLightningSendFeeEstimateRequestModel,
    PayLightningInvoiceRequestModel,
    OnchainSendRequestModel,
    OnchainSendResponse,
    GetOnchainSendResponse,
    ListLightningPaymentsResponse,
} from '../types/utexo';
import type { SendAssetEndRequestModel, Transfer } from '../types/wallet-model';

/**
 * Lightning Protocol Interface
 * 
 * Defines methods for Lightning Network operations including
 * invoice creation, payments, and fee estimation.
 */
export interface ILightningProtocol {
    /**
     * Creates a Lightning invoice for receiving BTC or asset payments.
     *
     * @param params - Request parameters for creating the Lightning invoice
     * @returns Promise resolving to Lightning invoice response
     */
    createLightningInvoice(params: CreateLightningInvoiceRequestModel): Promise<LightningReceiveRequest>;

    /**
     * Returns the status of a Lightning invoice created with createLightningInvoice.
     * Supports both BTC and asset invoices.
     *
     * @param id - The request ID of the Lightning invoice
     * @returns Promise resolving to Lightning invoice response or null if not found
     */
    getLightningReceiveRequest(id: string): Promise<LightningReceiveRequest | null>;

    /**
     * Returns the current status of a Lightning payment initiated with payLightningInvoice.
     * Works for both BTC and asset payments.
     *
     * @param id - The request ID of the Lightning send request
     * @returns Promise resolving to Lightning send request response or null if not found
     */
    getLightningSendRequest(id: string): Promise<LightningSendRequest | null>;

    /**
     * Estimates the routing fee required to pay a Lightning invoice.
     * For asset payments, the returned fee is always denominated in satoshis.
     *
     * @param params - Request parameters containing the invoice and optional asset
     * @returns Promise resolving to estimated fee in satoshis
     */
    getLightningSendFeeEstimate(params: GetLightningSendFeeEstimateRequestModel): Promise<number>;

    /**
     * Begins a Lightning invoice payment process.
     * Returns the invoice string as a mock PSBT (later will be constructed base64 PSBT).
     *
     * @param params - Request parameters containing the invoice and max fee
     * @returns Promise resolving to PSBT string (currently returns invoice, later will be base64 PSBT)
     */
    payLightningInvoiceBegin(params: PayLightningInvoiceRequestModel): Promise<string>;

    /**
     * Completes a Lightning invoice payment using signed PSBT.
     * Works the same as pay-invoice but uses signed_psbt instead of invoice.
     *
     * @param params - Request parameters containing the signed PSBT
     * @returns Promise resolving to Lightning send request response
     */
    payLightningInvoiceEnd(params: SendAssetEndRequestModel): Promise<LightningSendRequest>;

    /**
     * Pays a Lightning invoice using the UTEXOWallet.
     * This method supports BTC Lightning payments and asset-based Lightning payments.
     * 
     * This is a convenience method that combines:
     * 1. payLightningInvoiceBegin - to get the PSBT
     * 2. signPsbt - to sign the PSBT (mock for now)
     * 3. payLightningInvoiceEnd - to complete the payment
     *
     * @param params - Request parameters containing the invoice and max fee
     * @param mnemonic - Optional mnemonic for signing (uses wallet's mnemonic if not provided)
     * @returns Promise resolving to Lightning send request response
     */
    payLightningInvoice(params: PayLightningInvoiceRequestModel, mnemonic?: string): Promise<LightningSendRequest>;

    /**
     * Lists Lightning payments.
     *
     * @returns Promise resolving to response containing array of Lightning payments
     */
    listLightningPayments(): Promise<ListLightningPaymentsResponse>;
}

/**
 * Onchain Protocol Interface
 * 
 * Defines methods for on-chain withdrawal operations from UTEXO layer.
 */
export interface IOnchainProtocol {
    /**
     * Begins an on-chain send process from UTEXO.
     * Returns the request encoded as base64 (mock PSBT).
     * Later this should construct and return a real base64 PSBT.
     *
     * @param params - Request parameters for on-chain send
     * @returns Promise resolving to PSBT string (currently returns encoded request, later will be base64 PSBT)
     */
    onchainSendBegin(params: OnchainSendRequestModel): Promise<string>;

    /**
     * Completes an on-chain send from UTEXO using signed PSBT.
     *
     * @param params - Request parameters containing the signed PSBT
     * @returns Promise resolving to on-chain send response
     */
    onchainSendEnd(params: SendAssetEndRequestModel): Promise<OnchainSendResponse>;

    /**
     * Sends BTC or assets on-chain from the UTEXO layer.
     * This operation creates a Bitcoin transaction that releases funds from UTEXO to a specified on-chain address.
     * 
     * This is a convenience method that combines:
     * 1. onchainSendBegin - to get the PSBT
     * 2. signPsbt - to sign the PSBT (mock for now)
     * 3. onchainSendEnd - to complete the on-chain send
     *
     * @param params - Request parameters for on-chain send
     * @param mnemonic - Optional mnemonic for signing (uses wallet's mnemonic if not provided)
     * @returns Promise resolving to on-chain send response
     */
    onchainSend(params: OnchainSendRequestModel, mnemonic?: string): Promise<OnchainSendResponse>;

    /**
     * Gets the status of an on-chain send by send ID.
     *
     * @param send_id - The on-chain send ID
     * @returns Promise resolving to on-chain send status response
     */
    getOnchainSendStatus(send_id: string): Promise<GetOnchainSendResponse>;

    /**
     * Lists on-chain transfers for a specific asset.
     *
     * @param asset_id - The asset ID to list transfers for
     * @returns Promise resolving to array of on-chain transfers
     */
    listOnchainTransfers(asset_id: string): Promise<Transfer[]>;
}

/**
 * UTEXO Protocol Interface
 * 
 * Combines Lightning and Onchain protocol interfaces.
 * This is the main interface that UTEXOWallet implements.
 */
export interface IUTEXOProtocol extends ILightningProtocol, IOnchainProtocol {}
