import axios, { AxiosInstance } from 'axios';
import { BridgeInSignatureRequest, BridgeInSignatureResponse, ReceiverInvoiceResponse, SubmitTransactionRequest, SubmitTransactionResponse, TransferByMainnetInvoiceResponse, VerifyBridgeInRequest } from './types';

/**
 * Utexo Bridge API Client
 * 
 * Client for interacting with the utexo bridge API endpoints.
 * All endpoints are prefixed with `/v1/utexo/bridge`.
 */
class UtexoBridgeApiClient {
    private axios: AxiosInstance;
    private basePath: string;

    /**
     * Creates a new UtexoBridgeApiClient instance
     * 
     * @param axiosInstance - Axios instance to use for HTTP requests (required)
     * @param basePath - Base path for API endpoints (defaults to '/v1/utexo/bridge')
     * 
     * @example
     * ```typescript
     * import axios from 'axios';
     * import { UtexoBridgeApiClient } from './utexoBridge';
     * 
     * const axiosInstance = axios.create({
     *   baseURL: 'https://api.example.com'
     * });
     * 
     * const client = new UtexoBridgeApiClient(axiosInstance);
     * ```
     */
    constructor(axiosInstance: AxiosInstance, basePath: string = '/v1/utexo/bridge') {
        this.axios = axiosInstance;
        this.basePath = basePath;
    }

    /**
     * Gets bridge-in signature for a transfer
     * 
     * @param request - Bridge-in signature request data
     * @returns Promise resolving to bridge-in signature response
     * @throws {ApiError} If the request fails
     */
    async getBridgeInSignature(
        request: BridgeInSignatureRequest,
    ): Promise<BridgeInSignatureResponse> {
        const { data } = await this.axios.post<BridgeInSignatureResponse>(
            `${this.basePath}/bridge-in-signature`,
            request,
        );
        return data;
    }

    /**
     * Submits a signed transaction to the blockchain
     * 
     * @param request - Submit transaction request data
     * @returns Promise resolving to transaction hash
     * @throws {ApiError} If the request fails
     */
    async submitTransaction(request: SubmitTransactionRequest): Promise<string> {
        const { data } = await this.axios.post<SubmitTransactionResponse>(
            `${this.basePath}/submit-transaction`,
            request,
        );
        return data.txHash;
    }

    /**
     * Verifies a bridge-in transaction after it has been sent
     * 
     * @param request - Verify bridge-in request data
     * @returns Promise that resolves when verification is complete
     * @throws {ApiError} If the request fails
     */
    async verifyBridgeIn(request: VerifyBridgeInRequest): Promise<void> {
        await this.axios.post(`${this.basePath}/verify-bridge-in`, request);
    }

    /**
     * Gets receiver invoice by transfer ID and network ID
     * 
     * @param transferId - Transfer ID
     * @param networkId - Network ID
     * @returns Promise resolving to invoice string
     * @throws {ApiError} If the request fails
     */
    async getReceiverInvoice(transferId: number, networkId: number): Promise<string> {
        const { data } = await this.axios.get<ReceiverInvoiceResponse>(
            `${this.basePath}/receiver-invoice/${transferId}/${networkId}`,
        );
        return data.invoice;
    }

    /**
     * Gets transfer information by mainnet invoice
     * 
     * @param mainnetInvoice - Mainnet invoice string
     * @param networkId - Network ID
     * @returns Promise resolving to transfer information
     * @throws {ApiError} If the request fails
     */
    async getTransferByMainnetInvoice(mainnetInvoice: string, networkId: number): Promise<TransferByMainnetInvoiceResponse|null> {
        const { data } = await this.axios.get<TransferByMainnetInvoiceResponse>(
            `${this.basePath}/transfer-by-mainnet-invoice`,
            {
                params: {
                    mainnet_invoice: mainnetInvoice,
                    network_id: networkId,
                },
            },
        );
        return data;
    }
}

/**
 * Singleton axios instance for UTEXO Bridge API
 */
const utexoBridgeAxios: AxiosInstance = axios.create({
    baseURL: 'http://localhost:8081/',
});

/**
 * Pre-configured UTEXO Bridge API client instance
 */
const utexoBridgeClient = new UtexoBridgeApiClient(utexoBridgeAxios);

/**
 * Singleton UTEXO Bridge API instance
 * 
 */
export const bridgeAPI = utexoBridgeClient;
