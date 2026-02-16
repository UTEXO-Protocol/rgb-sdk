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
import { getDestinationAsset, utexoNetworkIdMap, utexoNetworkMap } from "../constants";
import { WalletManager } from "../wallet/wallet-manager";
import { ValidationError, WalletError } from "../errors";
import type { IWalletManager } from "../wallet/IWalletManager";
import type { IUTEXOProtocol } from "./IUTEXOProtocol";
import { UTEXOProtocol } from "./utexo-protocol";

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
import { fromUnitsNumber, toUnitsNumber } from "./utils/helpers";

export interface ConfigOptions {
    // Optional configuration options
    // To be extended in the future
    network?: Network
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
    private layer1Keys: PublicKeys | null = null;
    private utexoKeys: PublicKeys | null = null;
    private layer1RGBWallet: WalletManager | null = null;
    private utexoRGBWallet: WalletManager | null = null;

    /**
     * Creates a new UTEXOWallet instance
     * @param mnemonicOrSeed - Either a mnemonic phrase (string) or seed (Uint8Array)
     * @param options - Optional configuration options (defaults to empty object)
     */
    constructor(mnemonicOrSeed: string | Uint8Array, options: ConfigOptions = {}) {
        super();
        console.log('mnemonicOrSeed', mnemonicOrSeed);
        this.mnemonicOrSeed = mnemonicOrSeed;
        this.options = options;
    }

    async initialize(): Promise<void> {
        this.layer1Keys = await this.derivePublicKeys(utexoNetworkMap.mainnet);
        this.utexoKeys = await this.derivePublicKeys(utexoNetworkMap.utexo);
        this.utexoRGBWallet = new WalletManager({
            xpubVan: this.utexoKeys.accountXpubVanilla,
            xpubCol: this.utexoKeys.accountXpubColored,
            masterFingerprint: this.utexoKeys.masterFingerprint,
            network: utexoNetworkMap.utexo,
            mnemonic: this.mnemonicOrSeed as string,
        });
        this.layer1RGBWallet = new WalletManager({
            xpubVan: this.layer1Keys.accountXpubVanilla,
            xpubCol: this.layer1Keys.accountXpubVanilla,
            masterFingerprint: this.layer1Keys.masterFingerprint,
            network: utexoNetworkMap.mainnet,
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
     * IUTEXOProtocol Implementation
     */
    // All UTEXO protocol method implementations go here in UTEXOWallet
    // because they need access to layer1RGBWallet and utexoRGBWallet instances.
    // The base class (UTEXOProtocol) provides stub implementations for interface compliance.
    // Override methods here as they are implemented.


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
            assetId:'', //invoice can receive any asset
            amount: params.amount,
            minConfirmations: params.minConfirmations,
            durationSeconds: params.durationSeconds,
        });

        const bridgeTransfer = await bridgeAPI.getBridgeInSignature({
            sender: {
                address: 'rgb-address',
                networkName: utexoNetworkIdMap.mainnet.networkName,
                networkId: utexoNetworkIdMap.mainnet.networkId,
            },
            tokenId: destinationAsset.tokenId,
            amount: params.amount.toString(),
            destination: {
                address: destinationInvoice.invoice,
                networkName: utexoNetworkIdMap.utexo.networkName,
                networkId: utexoNetworkIdMap.utexo.networkId,
            },
            additionalAddresses: [],
        });

        const hexInvoice = bridgeTransfer.signature;
        const UTXO_PATH_INDEX = 2;
        const hex = hexInvoice.startsWith('0x')
            ? hexInvoice.slice(UTXO_PATH_INDEX)
            : hexInvoice;
        const decodedInvoice = Buffer.from(hex, 'hex').toString('utf-8');

        return {
            invoice: decodedInvoice,
        };
    }

    async onchainSendBegin(params: OnchainSendRequestModel): Promise<string> {
        this.ensureInitialized();
        /** Get the bridge RGB utexo invoice by tempRequestId should be by invoice */
        const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(params.invoice, utexoNetworkIdMap.mainnet.networkId);
        if(!bridgeTransfer) {
            
            // TODO: there should be bridge out flow UTEXO to Mainnet
            const invoiceData = await this.decodeRGBInvoice({ invoice: params.invoice })
            if(!params.assetId&&!invoiceData.assetId) {
                throw new ValidationError('Asset ID is required for external invoice', 'assetId');
            }
            const assetId = params.assetId ?? invoiceData.assetId;
            const destinationAsset = getDestinationAsset('utexo', 'mainnet', assetId??null);
            if(!destinationAsset) {
                throw new ValidationError('Destination asset is not supported', 'assetId');
            }

            if(!params.amount&&!invoiceData.assignment.amount) {
                throw new ValidationError('Amount is required for external invoice', 'amount');
            }
            
            let amount: number;
            if(params.amount) {
                amount = params.amount;
            } else if(invoiceData.assignment.amount) {
                amount = fromUnitsNumber(invoiceData.assignment.amount, destinationAsset.precision);
            } else {
                throw new ValidationError('Amount is required', 'amount');
            }

            const bridgeOutTransfer = await bridgeAPI.getBridgeInSignature({
                sender: {
                    address: 'rgb-address',
                    networkName: utexoNetworkIdMap.utexo.networkName,
                    networkId: utexoNetworkIdMap.utexo.networkId,
                },
                tokenId: destinationAsset.tokenId,
                amount: amount.toString(),
                destination: {
                    address:  params.invoice,
                    networkName: utexoNetworkIdMap.mainnet.networkName,
                    networkId: utexoNetworkIdMap.mainnet.networkId,
                },
                additionalAddresses: [],
            });
            const hexInvoice = bridgeOutTransfer.signature;
            const UTXO_PATH_INDEX = 2;
            const hex = hexInvoice.startsWith('0x')
                ? hexInvoice.slice(UTXO_PATH_INDEX)
                : hexInvoice;
            const decodedInvoice = Buffer.from(hex, 'hex').toString('utf-8');
            const isWitness = decodedInvoice.includes("wvout:");

            const psbt = await this.utexoRGBWallet!.sendBegin({
                invoice: decodedInvoice,
                amount: Number(bridgeOutTransfer.amount),
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
        const utexoInvoice = bridgeTransfer.recipient.address;
        const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice })
        // const amount = invoiceData.assignment.amount;
        const bridgeAmount = bridgeTransfer.recipientAmount;
        const destinationAsset =utexoNetworkIdMap.utexo.getAssetById(bridgeTransfer.recipientToken.id);
        if(!destinationAsset) {
            throw new ValidationError('Destination asset is not supported', 'assetId');
        }
     
        const amount = toUnitsNumber(bridgeAmount, destinationAsset.precision);
        
        const isWitness = invoiceData.recipientId.includes("wvout:");

        const assetBalance = await this.getAssetBalance(destinationAsset.assetId);

        if (!assetBalance || !assetBalance.spendable) {
            throw new ValidationError('Asset balance is not found', 'assetBalance');
        }
        if (assetBalance.spendable < amount) {
            throw new ValidationError(`Insufficient balance ${assetBalance.spendable} < ${amount}`, 'amount');
        }

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
        // TODO: Need func that returns destinationInvoice by mainnet invoice
        /** Get the bridge RGB utexo invoice by tempRequestId should be by invoice */
        const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(invoice, utexoNetworkIdMap.mainnet.networkId);
        if(!bridgeTransfer) {
            // TODO: there should be bridge out flow UTEXO to Mainnet
            throw new ValidationError('Bridge transfer is not found', 'invoice');
        }
        const utexoInvoice = bridgeTransfer.recipient.address;
        const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice })
        const destinationAsset =utexoNetworkIdMap.utexo.getAssetById(bridgeTransfer.recipientToken.id);
        const transfers = await this.utexoRGBWallet!.listTransfers(destinationAsset?.assetId);
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

       const destinationAsset = getDestinationAsset('mainnet','utexo', asset.assetId);
       if(!destinationAsset) {
        throw new ValidationError('Destination asset is not supported', 'assetId');
       }

        const destinationInvoice = await this.utexoRGBWallet!.witnessReceive({
            assetId: '', //invoice can receive any asset
            amount: asset.amount,
        });

        const bridgeTransfer = await bridgeAPI.getBridgeInSignature({
            sender: {
                address: 'rgb-address',
                networkName: utexoNetworkIdMap.mainnetLightning.networkName,
                networkId: utexoNetworkIdMap.mainnetLightning.networkId,
            },
            tokenId: destinationAsset.tokenId,
            amount: asset.amount.toString(),
            destination: {
                address: destinationInvoice.invoice,
                networkName: utexoNetworkIdMap.utexo.networkName,
                networkId: utexoNetworkIdMap.utexo.networkId,
            },
            additionalAddresses: [],
        });

        const hexInvoice = bridgeTransfer.signature;
        const UTXO_PATH_INDEX = 2;
        const hex = hexInvoice.startsWith('0x')
            ? hexInvoice.slice(UTXO_PATH_INDEX)
            : hexInvoice;
        const decodedLnInvoice = Buffer.from(hex, 'hex').toString('utf-8');

        return {
            lnInvoice: decodedLnInvoice,
        };
    }
    async payLightningInvoiceBegin(params: PayLightningInvoiceRequestModel): Promise<string> {
        this.ensureInitialized();

        const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(params.lnInvoice, utexoNetworkIdMap.mainnetLightning.networkId);
       if(!bridgeTransfer) {
        // TODO: there should be bridge out flow UTEXO to Mainnet Lightning
        // TODO: need func to decode ln invoice
        // const invoiceData = await this.decodeRGBInvoice({ invoice: params.invoice })

        if(!params.assetId) {
            throw new ValidationError('Asset ID is required for external invoice', 'assetId');
        }
        const assetId = params.assetId ;
        const destinationAsset = getDestinationAsset('utexo', 'mainnetLightning', assetId??null);
        if(!destinationAsset) {
            throw new ValidationError('Destination asset is not supported', 'assetId');
        }

        if(!params.amount) {
            throw new ValidationError('Amount is required for external invoice', 'amount');
        }

        const amount = params.amount;
        
        const bridgeOutTransfer = await bridgeAPI.getBridgeInSignature({
            sender: {
                address: 'rgb-address',
                networkName: utexoNetworkIdMap.utexo.networkName,
                networkId: utexoNetworkIdMap.utexo.networkId,
            },
            tokenId: destinationAsset.tokenId,
            amount: amount.toString(),
            destination: {
                address:  params.lnInvoice,
                networkName: utexoNetworkIdMap.mainnetLightning.networkName,
                networkId: utexoNetworkIdMap.mainnetLightning.networkId,
            },
            additionalAddresses: [],
        });
        const hexInvoice = bridgeOutTransfer.signature;
        const UTXO_PATH_INDEX = 2;
        const hex = hexInvoice.startsWith('0x')
            ? hexInvoice.slice(UTXO_PATH_INDEX)
            : hexInvoice;
        const decodedInvoice = Buffer.from(hex, 'hex').toString('utf-8');
        const isWitness = decodedInvoice.includes("wvout:");

        const psbt = await this.utexoRGBWallet!.sendBegin({
            invoice: decodedInvoice,
            amount: Number(bridgeOutTransfer.amount),
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
       
        const bridgeAmount = bridgeTransfer.recipientAmount;
        const utexoInvoice = bridgeTransfer.recipient.address;
  
        const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice })
        const destinationAsset = utexoNetworkIdMap.utexo.getAssetById(bridgeTransfer.recipientToken.id);
        if(!destinationAsset) {
            throw new ValidationError('Destination asset is not supported', 'assetId');
        }
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
        const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(lnInvoice, utexoNetworkIdMap.mainnetLightning.networkId);
        if(!bridgeTransfer) {
            throw new ValidationError('Bridge transfer is not found', 'lnInvoice');
        }
        const utexoInvoice = bridgeTransfer.recipient.address;
        const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice })
        const destinationAsset =utexoNetworkIdMap.utexo.getAssetById(bridgeTransfer.recipientToken.id);
        const transfers = await this.utexoRGBWallet!.listTransfers(destinationAsset?.assetId);
        return transfers.length > 0 ? transfers.find(transfer => transfer.recipientId === invoiceData.recipientId)?.status ?? null : null;
    }
    async getLightningReceiveRequest(lnInvoice: string): Promise<TransferStatus | null> {
        this.ensureInitialized();
        const bridgeTransfer = await bridgeAPI.getTransferByMainnetInvoice(lnInvoice, utexoNetworkIdMap.mainnetLightning.networkId);
        if(!bridgeTransfer) {
            throw new ValidationError('Bridge transfer is not found', 'lnInvoice');
        }
        const utexoInvoice = bridgeTransfer.recipient.address;
        const invoiceData = await this.decodeRGBInvoice({ invoice: utexoInvoice })
        const destinationAsset =utexoNetworkIdMap.utexo.getAssetById(bridgeTransfer.recipientToken.id);
        const transfers = await this.utexoRGBWallet!.listTransfers(destinationAsset?.assetId);
        return transfers.length > 0 ? transfers.find(transfer => transfer.recipientId === invoiceData.recipientId)?.status ?? null : null;
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
