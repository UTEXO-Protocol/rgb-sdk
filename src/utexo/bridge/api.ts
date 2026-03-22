/**
 * UTEXO Bridge API Client
 *
 * Uses the global `fetch` API instead of axios for compatibility with:
 * - Bare worklet runtime (no Node.js http2)
 * - Node.js 18+ (built-in fetch)
 * - React Native (built-in fetch)
 * - Browsers (built-in fetch)
 *
 * This change removes the axios dependency entirely from rgb-sdk.
 */
import type { UtxoNetworkPreset } from '../utils/network';
import { DEFAULT_GATEWAY_BASE_URLS } from '../config/gateway';
import {
  BridgeInSignatureRequest,
  BridgeInSignatureResponse,
  ReceiverInvoiceResponse,
  SubmitTransactionRequest,
  SubmitTransactionResponse,
  TransferByMainnetInvoiceResponse,
  TransferStatuses,
  VerifyBridgeInRequest,
} from './types';

export const encodeTransferStatus = (transferStatus: string): number => {
  const textEncoder = new TextEncoder();

  return textEncoder.encode(transferStatus.toString())[0];
};

/**
 * Minimal HTTP client wrapping fetch, matching the subset of axios API
 * that UtexoBridgeApiClient uses (get, post with baseURL).
 */
class FetchClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL.replace(/\/+$/, '');
  }

  async post<T>(path: string, body?: unknown): Promise<{ data: T }> {
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const error: any = new Error(errorBody || `HTTP ${res.status}`);
      error.response = { status: res.status, data: errorBody };
      throw error;
    }
    const data = (await res.json()) as T;
    return { data };
  }

  async get<T>(
    path: string,
    options?: { params?: Record<string, string | number> }
  ): Promise<{ data: T }> {
    let url = `${this.baseURL}${path}`;
    if (options?.params) {
      const qs = new URLSearchParams(
        Object.entries(options.params).map(([k, v]) => [k, String(v)])
      ).toString();
      url += `?${qs}`;
    }
    const res = await fetch(url);
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const error: any = new Error(errorBody || `HTTP ${res.status}`);
      error.response = { status: res.status, data: errorBody };
      throw error;
    }
    const data = (await res.json()) as T;
    return { data };
  }
}

/**
 * Utexo Bridge API Client
 *
 * Client for interacting with the utexo bridge API endpoints.
 * All endpoints are prefixed with `/v1/utexo/bridge`.
 */
class UtexoBridgeApiClient {
  private http: FetchClient;
  private basePath: string;

  /**
   * Creates a new UtexoBridgeApiClient instance
   *
   * @param httpClient - FetchClient instance to use for HTTP requests
   * @param basePath - Base path for API endpoints (defaults to '/v1/utexo/bridge')
   *
   * @example
   * ```typescript
   * import { getBridgeAPI } from './api';
   *
   * const client = getBridgeAPI('testnet');
   * const signature = await client.getBridgeInSignature(request);
   * ```
   */
  constructor(
    httpClient: FetchClient,
    basePath: string = '/v1/utexo/bridge'
  ) {
    this.http = httpClient;
    this.basePath = basePath;
  }

  /**
   * Gets bridge-in signature for a transfer
   *
   * @param request - Bridge-in signature request data
   * @returns Promise resolving to bridge-in signature response
   * @throws {Error} If the request fails
   */
  async getBridgeInSignature(
    request: BridgeInSignatureRequest
  ): Promise<BridgeInSignatureResponse> {
    try {
      const { data } = await this.http.post<BridgeInSignatureResponse>(
        `${this.basePath}/bridge-in-signature`,
        request
      );
      return data;
    } catch (error: any) {
      const responseData = error?.response?.data;
      if (responseData !== undefined) {
        const message =
          typeof responseData === 'string'
            ? responseData
            : JSON.stringify(responseData);
        throw new Error(message);
      }
      throw error;
    }
  }

  /**
   * Submits a signed transaction to the blockchain
   *
   * @param request - Submit transaction request data
   * @returns Promise resolving to transaction hash
   * @throws {Error} If the request fails
   */
  async submitTransaction(request: SubmitTransactionRequest): Promise<string> {
    const { data } = await this.http.post<SubmitTransactionResponse>(
      `${this.basePath}/submit-transaction`,
      request
    );
    return data.txHash;
  }

  /**
   * Verifies a bridge-in transaction after it has been sent
   *
   * @param request - Verify bridge-in request data
   * @returns Promise that resolves when verification is complete
   * @throws {Error} If the request fails
   */
  async verifyBridgeIn(request: VerifyBridgeInRequest): Promise<void> {
    await this.http.post(`${this.basePath}/verify-bridge-in`, request);
  }

  /**
   * Gets receiver invoice by transfer ID and network ID
   *
   * @param transferId - Transfer ID
   * @param networkId - Network ID
   * @returns Promise resolving to invoice string
   * @throws {Error} If the request fails
   */
  async getReceiverInvoice(
    transferId: number,
    networkId: number
  ): Promise<string> {
    const { data } = await this.http.get<ReceiverInvoiceResponse>(
      `${this.basePath}/receiver-invoice/${transferId}/${networkId}`
    );
    return data.invoice;
  }

  async getWithdrawTransfer(
    invoice: string,
    networkId: number
  ): Promise<TransferByMainnetInvoiceResponse | null> {
    const { data } = await this.http.get<{
      transfers: TransferByMainnetInvoiceResponse[];
    }>(`${this.basePath}/transfers/history`, {
      params: {
        network_id: String(networkId),
        offset: String(0),
        limit: String(10),
        address: 'rgb-address',
      },
    });

    if (data.transfers.length === 0) {
      return null;
    }

    const withdrawTransfer = data.transfers
      .map((transfer) => ({
        ...transfer,
        status: TransferStatuses[encodeTransferStatus(transfer.status)],
      }))
      .find((transfer) => transfer.recipient.address === invoice);
    if (!withdrawTransfer) {
      return null;
    }

    return withdrawTransfer;
  }

  /**
   * Gets transfer information by mainnet invoice
   *
   * @param mainnetInvoice - Mainnet invoice string
   * @param networkId - Network ID
   * @returns Promise resolving to transfer information
   * @throws {Error} If the request fails
   */
  async getTransferByMainnetInvoice(
    mainnetInvoice: string,
    networkId: number
  ): Promise<TransferByMainnetInvoiceResponse | null> {
    try {
      const { data } = await this.http.get<TransferByMainnetInvoiceResponse>(
        `${this.basePath}/transfer-by-mainnet-invoice`,
        {
          params: {
            mainnet_invoice: mainnetInvoice,
            network_id: networkId,
          },
        }
      );
      if (data) {
        return {
          ...data,
          status: TransferStatuses[encodeTransferStatus(data.status)],
        };
      }
      return data;
    } catch (_error) {
      console.log('Mainnet invoice not found');
      return null;
    }
  }
}

/**
 * Returns a UTEXO Bridge API client for network.
 *
 * @param network - 'mainnet' | 'testnet'
 */
export function getBridgeAPI(
  network: UtxoNetworkPreset = 'mainnet'
): UtexoBridgeApiClient {
  const httpClient = new FetchClient(DEFAULT_GATEWAY_BASE_URLS[network]);
  return new UtexoBridgeApiClient(httpClient);
}
