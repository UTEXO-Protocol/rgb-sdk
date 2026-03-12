/**
 * UTEXO Protocol Base Implementations
 *
 * These classes provide empty implementations for UTEXO-specific operations.
 * They should be extended or used as mixins for concrete implementations.
 */

import type {
  ILightningProtocol,
  IOnchainProtocol,
  IUTEXOProtocol,
} from './IUTEXOProtocol';
import type {
  CreateLightningInvoiceRequestModel,
  LightningReceiveRequest,
  LightningSendRequest,
  GetLightningSendFeeEstimateRequestModel,
  PayLightningInvoiceRequestModel,
  OnchainSendRequestModel,
  OnchainSendResponse,
  ListLightningPaymentsResponse,
  OnchainReceiveRequestModel,
  OnchainReceiveResponse,
} from '../types/utexo';
import type {
  SendAssetEndRequestModel,
  Transfer,
  TransferStatus,
  OnchainSendStatus,
} from '../types/wallet-model';

/**
 * Lightning Protocol Base Class
 *
 * Provides empty implementations for all Lightning protocol methods.
 * Concrete implementations should override these methods.
 */
export class LightningProtocol implements ILightningProtocol {
  async createLightningInvoice(
    _params: CreateLightningInvoiceRequestModel
  ): Promise<LightningReceiveRequest> {
    throw new Error('createLightningInvoice not implemented');
  }

  async getLightningReceiveRequest(
    _id: string
  ): Promise<TransferStatus | null> {
    throw new Error('getLightningReceiveRequest not implemented');
  }

  async getLightningSendRequest(_id: string): Promise<TransferStatus | null> {
    throw new Error('getLightningSendRequest not implemented');
  }

  async getLightningSendFeeEstimate(
    _params: GetLightningSendFeeEstimateRequestModel
  ): Promise<number> {
    throw new Error('getLightningSendFeeEstimate not implemented');
  }

  async payLightningInvoiceBegin(
    _params: PayLightningInvoiceRequestModel
  ): Promise<string> {
    throw new Error('payLightningInvoiceBegin not implemented');
  }

  async payLightningInvoiceEnd(
    _params: SendAssetEndRequestModel
  ): Promise<LightningSendRequest> {
    throw new Error('payLightningInvoiceEnd not implemented');
  }

  async payLightningInvoice(
    _params: PayLightningInvoiceRequestModel,
    _mnemonic?: string
  ): Promise<LightningSendRequest> {
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
  async onchainReceive(
    _params: OnchainReceiveRequestModel
  ): Promise<OnchainReceiveResponse> {
    throw new Error('onchainReceive not implemented');
  }
  async onchainSendBegin(_params: OnchainSendRequestModel): Promise<string> {
    throw new Error('onchainSendBegin not implemented');
  }

  async onchainSendEnd(
    _params: SendAssetEndRequestModel
  ): Promise<OnchainSendResponse> {
    throw new Error('onchainSendEnd not implemented');
  }

  async onchainSend(
    _params: OnchainSendRequestModel,
    _mnemonic?: string
  ): Promise<OnchainSendResponse> {
    throw new Error('onchainSend not implemented');
  }

  async getOnchainSendStatus(
    _send_id: string
  ): Promise<OnchainSendStatus | null> {
    throw new Error('getOnchainSendStatus not implemented');
  }

  async listOnchainTransfers(_asset_id?: string): Promise<Transfer[]> {
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

  async onchainReceive(
    params: OnchainReceiveRequestModel
  ): Promise<OnchainReceiveResponse> {
    return this.onchainProtocol.onchainReceive(params);
  }
  async onchainSendBegin(params: OnchainSendRequestModel): Promise<string> {
    return this.onchainProtocol.onchainSendBegin(params);
  }

  async onchainSendEnd(
    params: SendAssetEndRequestModel
  ): Promise<OnchainSendResponse> {
    return this.onchainProtocol.onchainSendEnd(params);
  }

  async onchainSend(
    params: OnchainSendRequestModel,
    mnemonic?: string
  ): Promise<OnchainSendResponse> {
    return this.onchainProtocol.onchainSend(params, mnemonic);
  }

  async getOnchainSendStatus(
    send_id: string
  ): Promise<OnchainSendStatus | null> {
    return this.onchainProtocol.getOnchainSendStatus(send_id);
  }

  async listOnchainTransfers(asset_id?: string): Promise<Transfer[]> {
    return this.onchainProtocol.listOnchainTransfers(asset_id);
  }
}
