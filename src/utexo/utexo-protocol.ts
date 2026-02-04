/**
 * UTEXO Protocol Base Implementations
 * 
 * These classes provide empty implementations for UTEXO-specific operations.
 * They should be extended or used as mixins for concrete implementations.
 */

import type { ILightningProtocol, IOnchainProtocol, IUTEXOProtocol } from './IUTEXOProtocol';
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
 * Lightning Protocol Base Class
 * 
 * Provides empty implementations for all Lightning protocol methods.
 * Concrete implementations should override these methods.
 */
export class LightningProtocol implements ILightningProtocol {
    async createLightningInvoice(params: CreateLightningInvoiceRequestModel): Promise<LightningReceiveRequest> {
        throw new Error('createLightningInvoice not implemented');
    }

    async getLightningReceiveRequest(id: string): Promise<LightningReceiveRequest | null> {
        throw new Error('getLightningReceiveRequest not implemented');
    }

    async getLightningSendRequest(id: string): Promise<LightningSendRequest | null> {
        throw new Error('getLightningSendRequest not implemented');
    }

    async getLightningSendFeeEstimate(params: GetLightningSendFeeEstimateRequestModel): Promise<number> {
        throw new Error('getLightningSendFeeEstimate not implemented');
    }

    async payLightningInvoiceBegin(params: PayLightningInvoiceRequestModel): Promise<string> {
        throw new Error('payLightningInvoiceBegin not implemented');
    }

    async payLightningInvoiceEnd(params: SendAssetEndRequestModel): Promise<LightningSendRequest> {
        throw new Error('payLightningInvoiceEnd not implemented');
    }

    async payLightningInvoice(params: PayLightningInvoiceRequestModel, mnemonic?: string): Promise<LightningSendRequest> {
        throw new Error('payLightningInvoice not implemented');
    }

    async listLightningPayments(): Promise<ListLightningPaymentsResponse> {
        throw new Error('listLightningPayments not implemented');
    }
}

/**
 * Onchain Protocol Base Class
 * 
 * Provides empty implementations for all onchain protocol methods.
 * Concrete implementations should override these methods.
 */
export class OnchainProtocol implements IOnchainProtocol {
    async onchainSendBegin(params: OnchainSendRequestModel): Promise<string> {
        throw new Error('onchainSendBegin not implemented');
    }

    async onchainSendEnd(params: SendAssetEndRequestModel): Promise<OnchainSendResponse> {
        throw new Error('onchainSendEnd not implemented');
    }

    async onchainSend(params: OnchainSendRequestModel, mnemonic?: string): Promise<OnchainSendResponse> {
        throw new Error('onchainSend not implemented');
    }

    async getOnchainSendStatus(send_id: string): Promise<GetOnchainSendResponse> {
        throw new Error('getOnchainSendStatus not implemented');
    }

    async listOnchainTransfers(asset_id: string): Promise<Transfer[]> {
        throw new Error('listOnchainTransfers not implemented');
    }
}

/**
 * UTEXO Protocol Base Class
 * 
 * Combines Lightning and Onchain protocol implementations.
 * Provides empty implementations for all UTEXO protocol methods.
 * Concrete implementations should override these methods.
 */
export class UTEXOProtocol extends LightningProtocol implements IUTEXOProtocol {
    private onchainProtocol = new OnchainProtocol();

    async onchainSendBegin(params: OnchainSendRequestModel): Promise<string> {
        return this.onchainProtocol.onchainSendBegin(params);
    }

    async onchainSendEnd(params: SendAssetEndRequestModel): Promise<OnchainSendResponse> {
        return this.onchainProtocol.onchainSendEnd(params);
    }

    async onchainSend(params: OnchainSendRequestModel, mnemonic?: string): Promise<OnchainSendResponse> {
        return this.onchainProtocol.onchainSend(params, mnemonic);
    }

    async getOnchainSendStatus(send_id: string): Promise<GetOnchainSendResponse> {
        return this.onchainProtocol.getOnchainSendStatus(send_id);
    }

    async listOnchainTransfers(asset_id: string): Promise<Transfer[]> {
        return this.onchainProtocol.listOnchainTransfers(asset_id);
    }
}
