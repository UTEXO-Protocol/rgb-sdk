/**
 * UTEXOWallet - Wallet class for UTEXO operations
 * 
 * This class provides a wallet interface that accepts either a mnemonic or seed
 * for initialization. It implements both IWalletManager (standard RGB operations)
 * and IUTEXOProtocol (UTEXO-specific Lightning and on-chain operations).
 */

import { PublicKeys } from "../types/utexo";
import { deriveKeysFromMnemonicOrSeed } from '../crypto';
import type { Network, EstimateFeeResult } from '../crypto';
import { BitcoinNetwork } from "../types/wallet-model";
import { getDestinationAsset } from "../constants";
import { WalletManager } from "../wallet/wallet-manager";
import { ValidationError, WalletError } from "../errors";
import type { IWalletManager } from "../wallet/IWalletManager";
import type { IUTEXOProtocol } from "./IUTEXOProtocol";
import { UTEXOProtocol } from "./utexo-protocol";
import { getUtxoNetworkConfig, type UtxoNetworkPreset, type UtxoNetworkMap, type UtxoNetworkIdMap } from "./utils/network";

// Re-export for convenience
export { UTEXOProtocol } from "./utexo-protocol";
export type { IUTEXOProtocol } from "./IUTEXOProtocol";
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
    OnchainReceiveRequestModel,
    OnchainReceiveResponse,
    OnchainSendEndRequestModel,
    PayLightningInvoiceEndRequestModel,
} from '../types/utexo';
import type {
    CreateUtxosBeginRequestModel,
    CreateUtxosEndRequestModel,
    FailTransfersRequest,
    InvoiceRequest,
    InvoiceReceiveData,
    IssueAssetNiaRequestModel,
    IssueAssetIfaRequestModel,
    SendAssetBeginRequestModel,
    SendAssetEndRequestModel,
    SendResult,
    BtcBalance,
    Unspent,
    WalletBackupResponse,
    SendBtcBeginRequestModel,
    SendBtcEndRequestModel,
    GetFeeEstimationResponse,
    InflateAssetIfaRequestModel,
    InflateEndRequestModel,
    OperationResult,
    AssetNIA,
    AssetBalance,
    ListAssets,
    Transaction,
    Transfer,
    InvoiceData,
    TransferStatus,
} from '../types/wallet-model';
import { bridgeAPI } from "./bridge";
import { TransferByMainnetInvoiceResponse } from "./bridge/types";
import { NetworkAsset } from "./utils/network";
import { decodeBridgeInvoice, fromUnitsNumber, toUnitsNumber } from "./utils/helpers";

export interface ConfigOptions {
    /**
     * Network preset: 'mainnet' (production) or 'testnet' (development).
     * Default: 'mainnet'.
     */
    network?: UtxoNetworkPreset;
}

/**
 * UTEXOWallet - Combines standard RGB wallet operations with UTEXO protocol features
 * 
 * Architecture:
 * - Implements IWalletManager for standard RGB operations (via WalletManager delegation)
 * - Implements IUTEXOProtocol for UTEXO-specific operations (Lightning, on-chain sends)
 * - Manages two WalletManager instances: layer1 (Bitcoin) and utexo (UTEXO network)
 */
export class UTEXOWallet extends UTEXOProtocol implements IWalletManager, IUTEXOProtocol {
    private readonly mnemonicOrSeed: string | Uint8Array;
    private readonly options: ConfigOptions;
    private readonly networkMap: UtxoNetworkMap;
    private readonly networkIdMap: UtxoNetworkIdMap;
    private layer1Keys: PublicKeys | null = null;
    private utexoKeys: PublicKeys | null = null;
    private layer1RGBWallet: WalletManager | null = null;
    private utexoRGBWallet: WalletManager | null = null;

    /**
     * Creates a new UTEXOWallet instance
     * @param mnemonicOrSeed - Either a mnemonic phrase (string) or seed (Uint8Array)
     * @param options - Optional configuration options (defaults to { network: 'mainnet' })
     */
    constructor(mnemonicOrSeed: string | Uint8Array, options: ConfigOptions = {}) {
        super();
        this.mnemonicOrSeed = mnemonicOrSeed;
        this.options = options;

        // Initialize network configuration based on preset (default: 'mainnet')
        const preset: UtxoNetworkPreset = options.network ?? 'mainnet';

        const networkConfig = getUtxoNetworkConfig(preset);
        this.networkMap = networkConfig.networkMap;
        this.networkIdMap = networkConfig.networkIdMap;
    }

    async initialize(): Promise<void> {
        this.layer1Keys = await this.derivePublicKeys(this.networkMap.mainnet);
        this.utexoKeys = await this.derivePublicKeys(this.networkMap.utexo);
        this.utexoRGBWallet = new WalletManager({
            xpubVan: this.utexoKeys.accountXpubVanilla,
            xpubCol: this.utexoKeys.accountXpubColored,
            masterFingerprint: this.utexoKeys.masterFingerprint,
            network: this.networkMap.utexo,

            mnemonic: this.mnemonicOrSeed as string,
        });
        this.layer1RGBWallet = new WalletManager({
            xpubVan: this.layer1Keys.accountXpubVanilla,
            xpubCol: this.layer1Keys.accountXpubVanilla,
            masterFingerprint: this.layer1Keys.masterFingerprint,
            network: this.networkMap.mainnet,
            mnemonic: this.mnemonicOrSeed as string,
        });
    }

    /**
     * Derive public keys from mnemonic or seed
     * @param network - BitcoinNetwork identifier 
     * @returns Promise resolving to PublicKeys containing xpub, accountXpubVanilla, accountXpubColored, and masterFingerprint
     * @throws {ValidationError} If mnemonic is invalid
     */
    async derivePublicKeys(network: BitcoinNetwork): Promise<PublicKeys> {
        const generatedKeys = await deriveKeysFromMnemonicOrSeed(network, this.mnemonicOrSeed);
        const { xpub, accountXpubVanilla, accountXpubColored, masterFingerprint } = generatedKeys;
        return { xpub, accountXpubVanilla, accountXpubColored, masterFingerprint };
    }

    async getPubKeys(): Promise<PublicKeys> {
        if (!this.layer1Keys) {
            throw new ValidationError('Public keys are not set', 'publicKeys');
        }
        return this.layer1Keys;
    }

    /**
     * Guard method to ensure wallet is initialized
     * @throws {WalletError} if wallet is not initialized
     */
    private ensureInitialized(): void {
        if (!this.utexoRGBWallet) {
            throw new WalletError('Wallet not initialized. Call initialize() first.');
        }
    }

    // ==========================================
    // IWalletManager Implementation
    // ==========================================

    async goOnline(indexerUrl: string, skipConsistencyCheck?: boolean): Promise<void> {
        this.ensureInitialized();
        // TODO: Implement goOnline for UTEXO wallet
        throw new Error('goOnline not implemented');
    }

    getXpub(): { xpubVan: string; xpubCol: string } {
        this.ensureInitialized();
        return this.utexoRGBWallet!.getXpub();
    }

    getNetwork(): Network {
        this.ensureInitialized();
        return this.utexoRGBWallet!.getNetwork();
    }

    async dispose(): Promise<void> {
        if (this.layer1RGBWallet) {
            await this.layer1RGBWallet.dispose();
        }
        if (this.utexoRGBWallet) {
            await this.utexoRGBWallet.dispose();
        }
    }

    isDisposed(): boolean {
        if (!this.utexoRGBWallet) {
            return false;
        }
        return this.utexoRGBWallet.isDisposed();
    }

    async getBtcBalance(): Promise<BtcBalance> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.getBtcBalance();
    }

    async getAddress(): Promise<string> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.getAddress();
    }

    async listUnspents(): Promise<Unspent[]> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.listUnspents();
    }

    async createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.createUtxosBegin(params);
    }

    async createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.createUtxosEnd(params);
    }

    async createUtxos(params: { upTo?: boolean; num?: number; size?: number; feeRate?: number }): Promise<number> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.createUtxos(params);
    }

    async listAssets(): Promise<ListAssets> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.listAssets();
    }

    async getAssetBalance(asset_id: string): Promise<AssetBalance> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.getAssetBalance(asset_id);
    }

    /**
     * Validates that the wallet has sufficient spendable balance for the given asset and amount.
     * @param assetId - Asset ID to check balance for
     * @param amount - Required amount (in asset units)
     * @throws {ValidationError} If balance is not found or insufficient
     */
    async validateBalance(assetId: string, amount: number): Promise<void> {
        const assetBalance = await this.getAssetBalance(assetId);
        if (!assetBalance || !assetBalance.spendable) {
            throw new ValidationError('Asset balance is not found', 'assetBalance');
        }
        if (assetBalance.spendable < amount) {
            throw new ValidationError(`Insufficient balance ${assetBalance.spendable} < ${amount}`, 'amount');
        }
    }

    async issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.issueAssetNia(params);
    }

    async issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<any> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.issueAssetIfa(params);
    }

    async inflateBegin(params: InflateAssetIfaRequestModel): Promise<string> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.inflateBegin(params);
    }

    async inflateEnd(params: InflateEndRequestModel): Promise<OperationResult> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.inflateEnd(params);
    }

    async inflate(params: InflateAssetIfaRequestModel, mnemonic?: string): Promise<OperationResult> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.inflate(params, mnemonic);
    }

    async sendBegin(params: SendAssetBeginRequestModel): Promise<string> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.sendBegin(params);
    }

    async sendEnd(params: SendAssetEndRequestModel): Promise<SendResult> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.sendEnd(params);
    }

    async send(invoiceTransfer: SendAssetBeginRequestModel, mnemonic?: string): Promise<SendResult> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.send(invoiceTransfer, mnemonic);
    }

    async sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.sendBtcBegin(params);
    }

    async sendBtcEnd(params: SendBtcEndRequestModel): Promise<string> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.sendBtcEnd(params);
    }

    async sendBtc(params: SendBtcBeginRequestModel): Promise<string> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.sendBtc(params);
    }

    async blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.blindReceive(params);
    }

    async witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.witnessReceive(params);
    }

    async decodeRGBInvoice(params: { invoice: string }): Promise<InvoiceData> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.decodeRGBInvoice(params);
    }

    async listTransactions(): Promise<Transaction[]> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.listTransactions();
    }

    async listTransfers(asset_id?: string): Promise<Transfer[]> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.listTransfers(asset_id);
    }

    async failTransfers(params: FailTransfersRequest): Promise<boolean> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.failTransfers(params);
    }

    async refreshWallet(): Promise<void> {
        this.ensureInitialized();
        this.utexoRGBWallet!.refreshWallet();
    }

    async syncWallet(): Promise<void> {
        this.ensureInitialized();
        this.utexoRGBWallet!.syncWallet();
    }

    async estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.estimateFeeRate(blocks);
    }

    async estimateFee(psbtBase64: string): Promise<EstimateFeeResult> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.estimateFee(psbtBase64);
    }

    async createBackup(params: { backupPath: string; password: string }): Promise<WalletBackupResponse> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.createBackup(params);
    }

    async signPsbt(psbt: string, mnemonic?: string): Promise<string> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.signPsbt(psbt, mnemonic);
    }

    async signMessage(message: string): Promise<string> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.signMessage(message);
    }

    async verifyMessage(message: string, signature: string, accountXpub?: string): Promise<boolean> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.verifyMessage(message, signature, accountXpub);
    }

    /**
     * Extracts invoice data and destination asset from a bridge transfer.
     * 
     * @param bridgeTransfer - Bridge transfer response containing recipient invoice and token info
     * @returns Object containing invoice string, decoded invoice data, and destination asset
     * @throws {ValidationError} If destination asset is not supported
     */
    private async extractInvoiceAndAsset(
        bridgeTransfer: TransferByMainnetInvoiceResponse
    ): Promise<{ utexoInvoice: string; invoiceData: InvoiceData; destinationAsset: NetworkAsset }> {
        const utexoInvoice = bridgeTransfer.recipient.address;
        const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice });
        const destinationAsset = this.networkIdMap.utexo.getAssetById(bridgeTransfer.recipientToken.id);

        if (!destinationAsset) {
            throw new ValidationError('Destination asset is not supported', 'assetId');
        }

        return { utexoInvoice, invoiceData, destinationAsset };
    }

    /**
     * IUTEXOProtocol Implementation
     */


    async onchainReceive(params: OnchainReceiveRequestModel): Promise<OnchainReceiveResponse> {
        this.ensureInitialized();

        const destinationAsset = getDestinationAsset('mainnet', 'utexo', params.assetId ?? null);
        if (!destinationAsset) {
            throw new ValidationError('Destination asset is not supported', 'assetId');
        }

        if (!params.amount) {
            throw new ValidationError('Amount is required', 'amount');
        }

        const destinationInvoice = await this.utexoRGBWallet!.witnessReceive({
            assetId: '', //invoice can receive any asset
            amount: params.amount,
            minConfirmations: params.minConfirmations,
            durationSeconds: params.durationSeconds,
        });

        const bridgeTransfer = await bridgeAPI.getBridgeInSignature({
            sender: {
                address: 'rgb-address',
                networkName: this.networkIdMap.mainnet.networkName,
                networkId: this.networkIdMap.mainnet.networkId,
            },
            tokenId: destinationAsset.tokenId,
            amount: params.amount.toString(),
            destination: {
                address: destinationInvoice.invoice,
                networkName: this.networkIdMap.utexo.networkName,
                networkId: this.networkIdMap.utexo.networkId,
            },
            additionalAddresses: [],
        });

        const decodedInvoice = decodeBridgeInvoice(bridgeTransfer.signature);

        return {
            invoice: decodedInvoice,
        };
    }

    async onchainSendBegin(params: OnchainSendRequestModel): Promise<string> {
        this.ensureInitialized();
        /** Get the bridge RGB utexo invoice by tempRequestId should be by invoice */
        const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(params.invoice, this.networkIdMap.mainnet.networkId);
        if (!bridgeTransfer) {
            console.warn('External invoice UTEXO -> Mainnet initiated');
            return this.UTEXOToMainnetRGB(params);
        }
        const utexoInvoice = bridgeTransfer.recipient.address;
        const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice })
        console.log('invoiceData', invoiceData);
        const bridgeAmount = bridgeTransfer.recipientAmount;
        const destinationAsset = this.networkIdMap.utexo.getAssetById(bridgeTransfer.recipientToken.id);
        if (!destinationAsset) {
            throw new ValidationError('Destination asset is not supported', 'assetId');
        }
        // const amount = invoiceData.assignment.amount;
        const amount = toUnitsNumber(bridgeAmount, destinationAsset.precision);

        const isWitness = invoiceData.recipientId.includes("wvout:");

        await this.validateBalance(destinationAsset.assetId, amount);

        const psbt = await this.utexoRGBWallet!.sendBegin({
            invoice: utexoInvoice,
            amount: amount,
            assetId: destinationAsset.assetId,
            donation: true,
            ...(isWitness && {
                witnessData: {
                    amountSat: 1000,
                    blinding: 0,
                }
            }),
        });

        return psbt;
    }

    async onchainSendEnd(params: OnchainSendEndRequestModel): Promise<OnchainSendResponse> {
        this.ensureInitialized();
        const sendResult = await this.utexoRGBWallet!.sendEnd({ signedPsbt: params.signedPsbt });

        // TODO: there should be func that allow to cancel or mark as paid Tricorn Bridge Transfer
        // Best-effort finalize bridge transfer (complete/cancel/status) via BridgeClient (depending on Tricorn semantics)

        return sendResult;
    }

    async onchainSend(params: OnchainSendRequestModel, mnemonic?: string): Promise<OnchainSendResponse> {
        this.ensureInitialized();
        const psbt = await this.onchainSendBegin(params);
        const signed_psbt = await this.utexoRGBWallet!.signPsbt(psbt, mnemonic);
        return await this.onchainSendEnd({ signedPsbt: signed_psbt, invoice: params.invoice });
    }

    async getOnchainSendStatus(invoice: string): Promise<TransferStatus | null> {
        const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(invoice, this.networkIdMap.mainnet.networkId);
        if (!bridgeTransfer) {
            const withdrawTransfer = await bridgeAPI.getWithdrawTransfer(invoice, this.networkIdMap.utexo.networkId);
            if (!withdrawTransfer) {
                return null;
            }
            return withdrawTransfer.status as TransferStatus;
        }
        const { invoiceData, destinationAsset } = await this.extractInvoiceAndAsset(bridgeTransfer);
        const transfers = await this.utexoRGBWallet!.listTransfers(destinationAsset.assetId);
        return transfers.length > 0 ? transfers.find(transfer => transfer.recipientId === invoiceData.recipientId)?.status ?? null : null;
    }

    async listOnchainTransfers(asset_id?: string): Promise<Transfer[]> {
        this.ensureInitialized();
        return this.utexoRGBWallet!.listTransfers(asset_id);
    }



    async createLightningInvoice(params: CreateLightningInvoiceRequestModel): Promise<LightningReceiveRequest> {
        this.ensureInitialized();

        const asset = params.asset;
        if (!asset) {
            throw new ValidationError('Asset is required', 'asset');
        }

        if (!asset.assetId) {
            throw new ValidationError('Asset ID is required', 'assetId');
        }
        if (!asset.amount) {
            throw new ValidationError('Amount is required', 'amount');
        }

        const destinationAsset = getDestinationAsset('mainnet', 'utexo', asset.assetId);
        if (!destinationAsset) {
            throw new ValidationError('Destination asset is not supported', 'assetId');
        }

        const destinationInvoice = await this.utexoRGBWallet!.witnessReceive({
            assetId: '', //invoice can receive any asset
            amount: asset.amount,
        });

        const bridgeTransfer = await bridgeAPI.getBridgeInSignature({
            sender: {
                address: 'rgb-address',
                networkName: this.networkIdMap.mainnetLightning.networkName,
                networkId: this.networkIdMap.mainnetLightning.networkId,
            },
            tokenId: destinationAsset.tokenId,
            amount: asset.amount.toString(),
            destination: {
                address: destinationInvoice.invoice,
                networkName: this.networkIdMap.utexo.networkName,
                networkId: this.networkIdMap.utexo.networkId,
            },
            additionalAddresses: [],
        });

        const decodedLnInvoice = decodeBridgeInvoice(bridgeTransfer.signature);

        return {
            lnInvoice: decodedLnInvoice,
        };
    }



    async payLightningInvoiceBegin(params: PayLightningInvoiceRequestModel): Promise<string> {
        this.ensureInitialized();

        const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(params.lnInvoice, this.networkIdMap.mainnetLightning.networkId);
        if (!bridgeTransfer) {
            console.log('External invoice UTEXO -> Mainnet Lightning initiated');
            return this.UtexoToMainnetLightning(params);
        }

        const bridgeAmount = bridgeTransfer.recipientAmount;
        const { utexoInvoice, invoiceData, destinationAsset } = await this.extractInvoiceAndAsset(bridgeTransfer);
        const amount = toUnitsNumber(bridgeAmount, destinationAsset.precision);

        const isWitness = invoiceData.recipientId.includes("wvout:");

        const psbt = await this.utexoRGBWallet!.sendBegin({
            invoice: utexoInvoice,
            amount: amount,
            assetId: destinationAsset.assetId,
            donation: true,
            ...(isWitness && {
                witnessData: {
                    amountSat: 1000,
                    blinding: 0,
                }
            }),
        });

        return psbt;
    }

    async payLightningInvoiceEnd(params: PayLightningInvoiceEndRequestModel): Promise<SendResult> {
        this.ensureInitialized();
        const sendResult = await this.utexoRGBWallet!.sendEnd({ signedPsbt: params.signedPsbt });
        // TODO: there should be func that allow to cancel or mark as paid Tricorn Bridge Transfer
        // Best-effort finalize bridge transfer (complete/cancel/status) via BridgeClient (depending on Tricorn semantics)

        return sendResult;
    }

    async payLightningInvoice(params: PayLightningInvoiceRequestModel, mnemonic?: string): Promise<LightningSendRequest> {
        this.ensureInitialized();
        const psbt = await this.payLightningInvoiceBegin(params);
        const signed_psbt = await this.utexoRGBWallet!.signPsbt(psbt, mnemonic);
        return await this.payLightningInvoiceEnd({ signedPsbt: signed_psbt, lnInvoice: params.lnInvoice });
    }

    async getLightningSendRequest(lnInvoice: string): Promise<TransferStatus | null> {
        this.ensureInitialized();
        const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(lnInvoice, this.networkIdMap.mainnetLightning.networkId);
        if (!bridgeTransfer) {
            const withdrawTransfer = await bridgeAPI.getWithdrawTransfer(lnInvoice, this.networkIdMap.utexo.networkId);
            if (!withdrawTransfer) {
                return null;
            }
            return withdrawTransfer.status as TransferStatus;
        }
        const { invoiceData, destinationAsset } = await this.extractInvoiceAndAsset(bridgeTransfer);
        const transfers = await this.utexoRGBWallet!.listTransfers(destinationAsset.assetId);
        return transfers.length > 0 ? transfers.find(transfer => transfer.recipientId === invoiceData.recipientId)?.status ?? null : null;
    }
    async getLightningReceiveRequest(lnInvoice: string): Promise<TransferStatus | null> {
        this.ensureInitialized();
        const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(lnInvoice, this.networkIdMap.mainnetLightning.networkId);
        if (!bridgeTransfer) {
            const withdrawTransfer = await bridgeAPI.getWithdrawTransfer(lnInvoice, this.networkIdMap.utexo.networkId);
            if (!withdrawTransfer) {
                return null;
            }
            return withdrawTransfer.status as TransferStatus;
        }
        const { invoiceData, destinationAsset } = await this.extractInvoiceAndAsset(bridgeTransfer);
        const transfers = await this.utexoRGBWallet!.listTransfers(destinationAsset.assetId);
        return transfers.length > 0 ? transfers.find(transfer => transfer.recipientId === invoiceData.recipientId)?.status ?? null : null;
    }

    private async UTEXOToMainnetRGB(params: OnchainSendRequestModel): Promise<string> {
        this.ensureInitialized();
        const invoiceData = await this.decodeRGBInvoice({ invoice: params.invoice })
        if (!params.assetId && !invoiceData.assetId) {
            throw new ValidationError('Asset ID is required for external invoice', 'assetId');
        }
        const assetId = params.assetId ?? invoiceData.assetId;
        const utexoAsset = getDestinationAsset('mainnet', 'utexo', assetId ?? null);
        if (!utexoAsset) {
            throw new ValidationError('UTEXO asset is not supported', 'assetId');
        }

        const destinationAsset = this.networkIdMap.mainnet.getAssetById(utexoAsset?.tokenId ?? 0);
        // return;
        if (!destinationAsset) {
            throw new ValidationError('Destination asset is not supported', 'assetId');
        }

        if (!params.amount && !invoiceData.assignment.amount) {
            throw new ValidationError('Amount is required for external invoice', 'amount');
        }

        let amount: number;
        if (params.amount) {
            amount = params.amount;
        } else if (invoiceData.assignment.amount) {
            amount = fromUnitsNumber(invoiceData.assignment.amount, destinationAsset.precision);
        } else {
            throw new ValidationError('Amount is required', 'amount');
        }

        await this.validateBalance(utexoAsset.assetId, toUnitsNumber(amount.toString(), utexoAsset.precision));

        const payload = {
            sender: {
                address: 'rgb-address',
                networkName: this.networkIdMap.utexo.networkName,
                networkId: this.networkIdMap.utexo.networkId,
            },
            tokenId: destinationAsset.tokenId,
            amount: amount.toString(),
            destination: {
                address: params.invoice,
                networkName: this.networkIdMap.mainnet.networkName,
                networkId: this.networkIdMap.mainnet.networkId,
            },
            additionalAddresses: [],
        }

        const bridgeOutTransfer = await bridgeAPI.getBridgeInSignature(payload);
        const decodedInvoice = decodeBridgeInvoice(bridgeOutTransfer.signature);
        const isWitness = decodedInvoice.includes("wvout:");

        const psbt = await this.utexoRGBWallet!.sendBegin({
            invoice: decodedInvoice,
            amount: Number(bridgeOutTransfer.amount),
            assetId: utexoAsset.assetId,
            donation: true,
            ...(isWitness && {
                witnessData: {
                    amountSat: 1000,
                    blinding: 0,
                }
            }),
        });

        return psbt;
    }

    private async UtexoToMainnetLightning(params: PayLightningInvoiceRequestModel): Promise<string> {
        this.ensureInitialized();
        if (!params.assetId) {
            throw new ValidationError('Asset ID is required for external invoice', 'assetId');
        }
        const assetId = params.assetId;
        const utexoAsset = getDestinationAsset('mainnet', 'utexo', assetId ?? null);
        const destinationAsset = this.networkIdMap.mainnet.getAssetById(utexoAsset?.tokenId ?? 0);

        if (!destinationAsset) {
            throw new ValidationError('Destination asset is not supported', 'assetId');
        }
        if (!utexoAsset) {
            throw new ValidationError('Destination asset is not supported', 'assetId');
        }

        if (!params.amount) {
            throw new ValidationError('Amount is required for external invoice', 'amount');
        }

        const amount = params.amount;


        await this.validateBalance(utexoAsset.assetId, toUnitsNumber(amount.toString(), utexoAsset.precision));

        const bridgeOutTransfer = await bridgeAPI.getBridgeInSignature({
            sender: {
                address: 'rgb-address',
                networkName: this.networkIdMap.utexo.networkName,
                networkId: this.networkIdMap.utexo.networkId,
            },
            tokenId: destinationAsset.tokenId,
            amount: amount.toString(),
            destination: {
                address: params.lnInvoice,
                networkName: this.networkIdMap.mainnetLightning.networkName,
                networkId: this.networkIdMap.mainnetLightning.networkId,
            },
            additionalAddresses: [],
        });
        const decodedInvoice = decodeBridgeInvoice(bridgeOutTransfer.signature);
        const isWitness = decodedInvoice.includes("wvout:");

        const psbt = await this.utexoRGBWallet!.sendBegin({
            invoice: decodedInvoice,
            amount: Number(bridgeOutTransfer.amount),
            assetId: utexoAsset.assetId,
            donation: true,
            ...(isWitness && {
                witnessData: {
                    amountSat: 1000,
                    blinding: 0,
                }
            }),
        });

        return psbt;
    }
    // TODO: Implement remaining methods as needed:
    // - createLightningInvoice() - will use utexoRGBWallet
    // - getLightningReceiveRequest() - will use utexoRGBWallet
    // - getLightningSendRequest() - will use utexoRGBWallet
    // - getLightningSendFeeEstimate() - will use utexoRGBWallet
    // - payLightningInvoiceBegin() - will use utexoRGBWallet
    // - payLightningInvoiceEnd() - will use utexoRGBWallet
    // - onchainSendBegin() - will use layer1RGBWallet or utexoRGBWallet
    // - onchainSendEnd() - will use layer1RGBWallet or utexoRGBWallet
    // - getOnchainSendStatus() - will use layer1RGBWallet or utexoRGBWallet
    // - listOnchainTransfers() - will use layer1RGBWallet or utexoRGBWallet
    // - listLightningPayments() - will use utexoRGBWallet
}
