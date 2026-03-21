import * as node_crypto from 'node:crypto';

/**
 * RGB Crypto module types
 *
 * Type definitions for RGB-specific cryptographic operations including
 * PSBT signing and key derivation for RGB protocol
 */
/**
 * Bitcoin network type
 */
type Network = 'mainnet' | 'testnet' | 'testnet4' | 'signet' | 'regtest';
/**
 * PSBT type (create_utxo or send)
 */
type PsbtType = 'create_utxo' | 'send';
/**
 * Network versions for BIP32
 */
interface NetworkVersions {
    bip32: {
        public: number;
        private: number;
    };
    wif: number;
}
/**
 * Descriptors for wallet derivation
 */
interface Descriptors {
    external: string;
    internal: string;
}

declare global {
    var __nodeCrypto: typeof node_crypto | undefined;
}

interface SignPsbtOptions {
    preprocess?: boolean;
}
/**
 * Sign a PSBT using BDK
 *
 * Note: This function is async due to dependency loading and crypto operations.
 *
 * @param mnemonic - BIP39 mnemonic phrase (12 or 24 words)
 * @param psbtBase64 - Base64 encoded PSBT string
 * @param network - Bitcoin network ('mainnet' | 'testnet' | 'signet' | 'regtest')
 * @param options - Optional signing options
 * @param options.signOptions - BDK sign options (defaults used if not provided)
 * @param options.preprocess - Force preprocessing (auto-detected by default)
 * @returns Base64 encoded signed PSBT
 * @throws {ValidationError} If mnemonic or PSBT format is invalid
 * @throws {CryptoError} If signing fails
 *
 * @example
 * ```typescript
 * const signedPsbt = signPsbt(
 *   'abandon abandon abandon...',
 *   'cHNidP8BAIkBAAAAA...',
 *   'testnet'
 * );
 * ```
 */
declare function signPsbt(mnemonic: string, psbtBase64: string, network?: Network, options?: SignPsbtOptions): Promise<string>;
/**
 * Legacy sync-named wrapper (still async under the hood).
 */
declare function signPsbtSync(mnemonic: string, psbtBase64: string, network?: Network, options?: SignPsbtOptions): Promise<string>;
/**
 * Sign a PSBT using a raw BIP39 seed (hex string or Uint8Array)
 */
declare function signPsbtFromSeed(seed: string | Uint8Array, psbtBase64: string, network?: Network, options?: SignPsbtOptions): Promise<string>;
interface SignMessageParams {
    message: string | Uint8Array;
    seed: string | Uint8Array;
    network?: Network;
}
interface VerifyMessageParams {
    message: string | Uint8Array;
    signature: string;
    accountXpub: string;
    network?: Network;
}
interface EstimateFeeResult {
    fee: number;
    vbytes: number;
    feeRate: number;
}
declare function signMessage(params: SignMessageParams): Promise<string>;
declare function verifyMessage(params: VerifyMessageParams): Promise<boolean>;

interface GeneratedKeys {
    mnemonic: string;
    xpub: string;
    accountXpubVanilla: string;
    accountXpubColored: string;
    masterFingerprint: string;
    xpriv: string;
}
interface AccountXpubs {
    account_xpub_vanilla: string;
    account_xpub_colored: string;
}
/**
 * Generate new wallet keys with a random mnemonic
 * Mirrors rgb_lib::generate_keys (creates new 12-word mnemonic)
 *
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @returns Promise resolving to generated keys including mnemonic, xpubs, and master fingerprint
 * @throws {CryptoError} If key generation fails
 *
 * @example
 * ```typescript
 * const keys = await generateKeys('testnet');
 * console.log('Mnemonic:', keys.mnemonic);
 * console.log('Master Fingerprint:', keys.master_fingerprint);
 * ```
 */
declare function generateKeys(bitcoinNetwork?: string | number): Promise<GeneratedKeys>;
/**
 * Derive wallet keys from existing mnemonic
 * Takes a mnemonic phrase and derives all keys (xpubs, master fingerprint)
 *
 * This function is the counterpart to `generateKeys()` - instead of generating
 * a new mnemonic, it derives keys from an existing one.
 *
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @param mnemonic - BIP39 mnemonic phrase
 * @returns Promise resolving to derived keys including mnemonic, xpubs, and master fingerprint
 * @throws {ValidationError} If mnemonic is invalid
 * @throws {CryptoError} If key derivation fails
 *
 * @example
 * ```typescript
 * const keys = await deriveKeysFromMnemonic('testnet', 'abandon abandon abandon...');
 * console.log('Account XPub:', keys.account_xpub_vanilla);
 * ```
 */
declare function deriveKeysFromMnemonic(bitcoinNetwork: string | number | undefined, mnemonic: string): Promise<GeneratedKeys>;
/**
 * Derive wallet keys directly from a BIP39 seed (hex string or Uint8Array)
 */
declare function deriveKeysFromSeed(bitcoinNetwork: string | number | undefined, seed: string | Uint8Array): Promise<GeneratedKeys>;
/**
 * Derive wallet keys from either a mnemonic phrase or seed
 * Automatically detects the input type and uses the appropriate derivation method
 *
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @param mnemonicOrSeed - Either a BIP39 mnemonic phrase (string) or seed (Uint8Array | string)
 * @returns Promise resolving to derived keys including mnemonic, xpubs, and master fingerprint
 * @throws {ValidationError} If mnemonic is invalid
 * @throws {CryptoError} If key derivation fails
 *
 * @example
 * ```typescript
 * // With mnemonic
 * const keys1 = await deriveKeysFromMnemonicOrSeed('testnet', 'abandon abandon abandon...');
 *
 * // With seed (Uint8Array)
 * const seed = new Uint8Array([...]);
 * const keys2 = await deriveKeysFromMnemonicOrSeed('testnet', seed);
 * ```
 */
declare function deriveKeysFromMnemonicOrSeed(bitcoinNetwork: string | number | undefined, mnemonicOrSeed: string | Uint8Array): Promise<GeneratedKeys>;
/**
 * Restore wallet keys from existing mnemonic (backward compatibility alias)
 * @deprecated Use `deriveKeysFromMnemonic()` instead. This alias will be removed in a future version.
 * @see deriveKeysFromMnemonic
 */
declare function restoreKeys(bitcoinNetwork: string | number | undefined, mnemonic: string): Promise<GeneratedKeys>;
/**
 * Get account xpubs from mnemonic (convenience function)
 *
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @param mnemonic - BIP39 mnemonic phrase
 * @returns Promise resolving to account xpubs for vanilla and colored keychains
 * @throws {ValidationError} If mnemonic is invalid
 * @throws {CryptoError} If key derivation fails
 *
 * @example
 * ```typescript
 * const xpubs = await accountXpubsFromMnemonic('testnet', 'abandon abandon abandon...');
 * console.log('Vanilla XPub:', xpubs.account_xpub_vanilla);
 * console.log('Colored XPub:', xpubs.account_xpub_colored);
 * ```
 */
/**
 * Get master extended private key (xpriv) from mnemonic
 *
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @param mnemonic - BIP39 mnemonic phrase (12 or 24 words)
 * @returns Promise resolving to master xpriv (extended private key)
 * @throws {ValidationError} If mnemonic is invalid
 * @throws {CryptoError} If key derivation fails
 *
 * @example
 * ```typescript
 * const xpriv = await getXprivFromMnemonic('testnet', 'your mnemonic phrase here');
 * console.log('Master xpriv:', xpriv);
 * ```
 */
declare function getXprivFromMnemonic(bitcoinNetwork: string | number | undefined, mnemonic: string): Promise<string>;
/**
 * Get extended public key (xpub) from extended private key (xpriv)
 *
 * @param xpriv - Extended private key (base58 encoded)
 * @returns Promise resolving to xpub (extended public key)
 * @throws {CryptoError} If xpriv is invalid or derivation fails
 *
 * @example
 * ```typescript
 * const xpub = await getXpubFromXpriv('xprv...');
 * console.log('xpub:', xpub);
 * ```
 */
declare function getXpubFromXpriv(xpriv: string, bitcoinNetwork?: string | number): Promise<string>;
/**
 * Derive wallet keys from extended private key (xpriv)
 * Similar to deriveKeysFromMnemonic but starts from xpriv instead of mnemonic
 *
 * @param bitcoinNetwork - Network string or number (default: 'regtest')
 * @param xpriv - Extended private key (base58 encoded)
 * @returns Promise resolving to generated keys (without mnemonic)
 * @throws {ValidationError} If xpriv is invalid
 * @throws {CryptoError} If key derivation fails
 *
 * @example
 * ```typescript
 * const keys = await deriveKeysFromXpriv('testnet', 'xprv...');
 * console.log('Master Fingerprint:', keys.master_fingerprint);
 * console.log('Account xpub vanilla:', keys.account_xpub_vanilla);
 * ```
 */
declare function deriveKeysFromXpriv(bitcoinNetwork: string | number | undefined, xpriv: string): Promise<GeneratedKeys>;
declare function accountXpubsFromMnemonic(bitcoinNetwork: string | number | undefined, mnemonic: string): Promise<AccountXpubs>;

/**
 * VSS (Versioned Storage Service) backup key derivation.
 *
 * Derives a 32-byte signing key from a BIP39 mnemonic for use with rgb-lib's
 * VssBackupClient (server_url, store_id, signing_key). rgb-lib does not define
 * mnemonic → signing_key; this SDK uses HMAC-SHA256 with the same domain string
 * as rgb-lib's HKDF so backup/restore stay deterministic per wallet.
 *
 * Derivation: HMAC-SHA256(key = "rgb-lib-vss-backup-encryption-v1", message = mnemonic),
 * output as 64-char hex (32 bytes).
 */
/**
 * Derive the VSS backup signing key from a BIP39 mnemonic.
 * The result is a 64-character hex string (32 bytes) suitable for
 * VssBackupConfig.signingKey. Must match rgb-lib's Rust derivation.
 *
 * @param mnemonic - BIP39 mnemonic phrase (12 or 24 words)
 * @returns 32-byte signing key as hex string (same mnemonic always yields same key for backup/restore)
 */
declare function deriveVssSigningKeyFromMnemonic(mnemonic: string): string;

type BitcoinNetwork = 'mainnet' | 'testnet' | 'testnet4' | 'regtest' | 'signet';
interface FailTransfersRequest {
    batchTransferIdx?: number;
    noAssetOnly?: boolean;
    skipSync?: boolean;
}
interface WalletBackupResponse {
    message: string;
    backupPath: string;
}
interface WalletRestoreResponse {
    message: string;
}
interface RestoreWalletRequestModel {
    backupFilePath: string;
    password: string;
    dataDir: string;
}
interface WitnessData {
    amountSat: number;
    blinding?: number;
}
interface InvoiceRequest {
    amount?: number;
    assetId?: string;
    minConfirmations?: number;
    durationSeconds?: number;
}
type BatchRecipient = {
    recipientId: string;
    witnessData?: {
        amountSat: string;
        blinding?: number | null;
    } | null;
    assignment: {
        Fungible: number;
    };
    transportEndpoints: string[];
};
type RecipientMap = Record<string, BatchRecipient[]>;
/**
 * VSS backup mode: Async (fire-and-forget) or Blocking (wait for upload).
 */
type VssBackupMode = 'Async' | 'Blocking';
/**
 * VSS backup configuration for cloud backup.
 *
 * serverUrl, storeId and signingKey are required; other fields are optional
 * and default to the underlying rgb-lib defaults when omitted:
 * - encryptionEnabled: true
 * - autoBackup: false
 * - backupMode: 'Async'
 */
interface VssBackupConfig {
    serverUrl: string;
    storeId: string;
    /**
     * Signing key as a hex-encoded 32-byte secret key string.
     */
    signingKey: string;
    encryptionEnabled?: boolean;
    autoBackup?: boolean;
    backupMode?: VssBackupMode;
}
/**
 * Information about the current VSS backup status for a wallet.
 */
interface VssBackupInfo {
    backupExists: boolean;
    serverVersion?: number | null;
    backupRequired: boolean;
}
interface IssueAssetNiaRequestModel {
    ticker: string;
    name: string;
    amounts: number[];
    precision: number;
}
interface IssueAssetIfaRequestModel {
    ticker: string;
    name: string;
    precision: number;
    amounts: number[];
    inflationAmounts: number[];
    replaceRightsNum: number;
    rejectListUrl: string | null;
}
interface SendAssetBeginRequestModel {
    invoice: string;
    witnessData?: WitnessData;
    assetId?: string;
    amount?: number;
    donation?: boolean;
    feeRate?: number;
    minConfirmations?: number;
}
interface SendAssetEndRequestModel {
    signedPsbt: string;
    skipSync?: boolean;
}
interface SendResult {
    txid: string;
    batchTransferIdx: number;
}
interface OperationResult {
    txid: string;
    batchTransferIdx: number;
}
interface CreateUtxosBeginRequestModel {
    upTo?: boolean;
    num?: number;
    size?: number;
    feeRate?: number;
}
interface CreateUtxosEndRequestModel {
    signedPsbt: string;
    skipSync?: boolean;
}
interface InflateAssetIfaRequestModel {
    assetId: string;
    inflationAmounts: number[];
    feeRate?: number;
    minConfirmations?: number;
}
interface InflateEndRequestModel {
    signedPsbt: string;
}
interface SendBtcBeginRequestModel {
    address: string;
    amount: number;
    feeRate: number;
    skipSync?: boolean;
}
interface SendBtcEndRequestModel {
    signedPsbt: string;
    skipSync?: boolean;
}
type GetFeeEstimationResponse = Record<string, number> | number;
type TransactionType = 'RgbSend' | 'Drain' | 'CreateUtxos' | 'User';
interface BlockTime {
    height: number;
    timestamp: number;
}
interface Transaction {
    transactionType: TransactionType;
    txid: string;
    received: number;
    sent: number;
    fee: number;
    confirmationTime?: BlockTime;
}
type TransferKind = 'Issuance' | 'ReceiveBlind' | 'ReceiveWitness' | 'Send' | 'Inflation';
type Outpoint = {
    txid: string;
    vout: number;
};
interface Transfer {
    idx: number;
    batchTransferIdx: number;
    createdAt: number;
    updatedAt: number;
    status: TransferStatus;
    requestedAssignment?: Assignment;
    assignments: Assignment[];
    kind: TransferKind;
    txid?: string;
    recipientId?: string;
    receiveUtxo?: Outpoint;
    changeUtxo?: Outpoint;
    expiration?: number;
    transportEndpoints: {
        endpoint: string;
        transportType: string;
        used: boolean;
    }[];
    invoiceString?: string;
    consignmentPath?: string;
}
type TransferStatus = 'WaitingCounterparty' | 'WaitingConfirmations' | 'Settled' | 'Failed';
/** Bridge transfer statuses (from UTEXO bridge API) */
type BridgeTransferStatus = 'Unspecified' | 'Confirming' | 'Canceled' | 'Finished' | 'Waiting' | 'Cancelling' | 'Failed' | 'Fetching';
/** Unified status for on-chain operations (from RGB wallet or bridge) */
type OnchainSendStatus = TransferStatus | BridgeTransferStatus;
interface Unspent$1 {
    utxo: Utxo$1;
    rgbAllocations: RgbAllocation$1[];
    pendingBlinded: number;
}
interface Utxo$1 {
    outpoint: {
        txid: string;
        vout: number;
    };
    btcAmount: number;
    colorable: boolean;
    exists: boolean;
}
interface RgbAllocation$1 {
    assetId?: string;
    assignment: Assignment;
    settled: boolean;
}
interface Balance {
    settled: number;
    future: number;
    spendable: number;
}
interface BtcBalance {
    vanilla: Balance;
    colored: Balance;
}
interface InvoiceReceiveData {
    invoice: string;
    recipientId: string;
    expirationTimestamp: number | null;
    batchTransferIdx: number;
}
interface AssetNIA {
    /**
     * @type {string}
     * @memberof AssetNIA
     * @example rgb:2dkSTbr-jFhznbPmo-TQafzswCN-av4gTsJjX-ttx6CNou5-M98k8Zd
     */
    assetId: string;
    /**
     * @type {AssetIface}
     * @memberof AssetNIA
     */
    assetIface?: AssetIface;
    /**
     * @type {string}
     * @memberof AssetNIA
     * @example USDT
     */
    ticker: string;
    /**
     * @type {string}
     * @memberof AssetNIA
     * @example Tether
     */
    name: string;
    /**
     * @type {string | null}
     * @memberof AssetNIA
     * @example asset details (API may return null)
     */
    details?: string | null;
    /**
     * @type {number}
     * @memberof AssetNIA
     * @example 0
     */
    precision: number;
    /**
     * @type {number}
     * @memberof AssetNIA
     * @example 777
     */
    issuedSupply: number;
    /**
     * @type {number}
     * @memberof AssetNIA
     * @example 1691160565
     */
    timestamp: number;
    /**
     * @type {number}
     * @memberof AssetNIA
     * @example 1691161979
     */
    addedAt: number;
    /**
     * @type {Balance}
     * @memberof AssetNIA
     */
    balance: Balance;
    /**
     * @type {Media | null}
     * @memberof AssetNIA
     * @example API may return null
     */
    media?: Media | null;
}
interface AssetIfa {
    assetId: string;
    ticker: string;
    name: string;
    details?: string;
    precision: number;
    initialSupply: number;
    maxSupply: number;
    knownCirculatingSupply: number;
    timestamp: number;
    addedAt: number;
    balance: Balance;
    media?: Media;
    rejectListUrl?: string;
}
interface Media {
    /**
     * @type {string}
     * @memberof Media
     * @example /path/to/media
     */
    filePath?: string;
    /**
     * @type {string}
     * @memberof Media
     * @example text/plain
     */
    mime?: string;
}
declare enum AssetIface {
    RGB20 = "RGB20",
    RGB21 = "RGB21",
    RGB25 = "RGB25"
}
declare enum AssetSchema {
    Nia = "Nia",
    Uda = "Uda",
    Cfa = "Cfa"
}
type ListAssets = {
    nia: AssetNIA[];
    uda: AssetUDA[];
    cfa: AssetCFA[];
    ifa: AssetIfa[];
};
type AssetUDA = {
    assetId: string;
    ticker: string;
    name: string;
    details?: string;
    precision: number;
    timestamp: number;
    addedAt: number;
    balance: Balance;
    token?: {
        index: number;
        ticker?: string;
        name?: string;
        details?: string;
        embeddedMedia: boolean;
        media?: Media;
        attachments: Array<{
            key: number;
            filePath: string;
            mime: string;
            digest: string;
        }>;
        reserves: boolean;
    };
};
type AssetCFA = {
    assetId: string;
    name: string;
    details?: string;
    precision: number;
    issuedSupply: number;
    timestamp: number;
    addedAt: number;
    balance: Balance;
    media?: Media;
};
/**
 *
 *
 * @export
 * @interface AssetBalance
 */
interface AssetBalance {
    /**
     * @type {number}
     * @memberof AssetBalance
     * @example 777
     */
    settled?: number;
    /**
     * @type {number}
     * @memberof AssetBalance
     * @example 777
     */
    future?: number;
    /**
     * @type {number}
     * @memberof AssetBalance
     * @example 777
     */
    spendable?: number;
    /**
     * @type {number}
     * @memberof AssetBalance
     * @example 444
     */
    offchainOutbound?: number;
    /**
     * @type {number}
     * @memberof AssetBalance
     * @example 0
     */
    offchainInbound?: number;
}
interface InvoiceData {
    invoice: string;
    recipientId: string;
    assetSchema?: AssetSchema;
    assetId?: string;
    network: BitcoinNetwork;
    assignment: Assignment;
    assignmentName?: string;
    expirationTimestamp: number | null;
    transportEndpoints: string[];
}
type AssignmentType = 'Fungible' | 'NonFungible' | 'InflationRight' | 'ReplaceRight' | 'Any';
type Assignment = {
    type: AssignmentType;
    amount?: number;
};

/**
 * IWalletManager - Unified interface for WalletManager implementations
 *
 * This interface defines the contract that all WalletManager implementations must follow
 * for cross-platform compatibility.
 *
 * All methods are async to support native module requirements.
 * Synchronous implementations should wrap operations in Promise.resolve().
 *
 * Type Standards:
 * - All enum-like types use PascalCase: 'RgbSend', 'WaitingCounterparty', 'Nia', etc.
 * - Network identifiers use lowercase: 'mainnet', 'testnet', 'regtest', 'signet', 'testnet4'
 * - Transaction types: 'RgbSend' | 'Drain' | 'CreateUtxos' | 'User'
 * - Transfer status: 'WaitingCounterparty' | 'WaitingConfirmations' | 'Settled' | 'Failed'
 * - Transfer kind: 'Issuance' | 'ReceiveBlind' | 'ReceiveWitness' | 'Send' | 'Inflation'
 * - Asset schemas: 'Nia' | 'Uda' | 'Cfa' | 'Ifa'
 * - Assignment types: 'Fungible' | 'NonFungible' | 'InflationRight' | 'ReplaceRight' | 'Any'
 */

/**
 * Unified WalletManager interface for cross-platform compatibility
 *
 * This interface ensures all implementations provide the same API surface,
 * allowing clients to switch between implementations based on environment.
 */
interface IWalletManager {
    /**
     * Initialize the wallet and establish online connection
     * Must be called before performing operations that require network access.
     *
     * @returns Promise that resolves when initialization is complete
     * @throws {WalletError} if initialization fails
     *
     * NOTE: Some implementations require this method to be called explicitly,
     *       while others may initialize automatically in the constructor.
     */
    initialize(): Promise<void>;
    /**
     * Connect the wallet to an online indexer service for syncing and transaction operations.
     * Must be called before performing operations that require network connectivity.
     *
     * @param indexerUrl - The URL of the RGB indexer service to connect to
     * @param skipConsistencyCheck - If true, skips the consistency check with the indexer (default: false)
     * @returns Promise that resolves when the wallet is successfully connected online
     * @throws {WalletError} if connection fails
     */
    goOnline(indexerUrl: string, skipConsistencyCheck?: boolean): Promise<void>;
    /**
     * Get wallet's extended public keys
     * @returns Object containing vanilla and colored extended public keys
     */
    getXpub(): {
        xpubVan: string;
        xpubCol: string;
    };
    /**
     * Get wallet's network
     * @returns Network identifier
     */
    getNetwork(): Network;
    /**
     * Dispose of sensitive wallet data
     * Clears mnemonic and seed from memory, closes connections
     * Idempotent - safe to call multiple times
     *
     * @returns Promise that resolves when disposal is complete
     */
    dispose(): Promise<void>;
    /**
     * Check if wallet has been disposed
     * @returns true if wallet has been disposed, false otherwise
     */
    isDisposed(): boolean;
    /**
     * Register wallet and get initial address and balance
     * This is typically called once after wallet creation
     *
     * @returns Promise resolving to address and BTC balance
     */
    /**
     * Get current BTC balance
     * @returns Promise resolving to BTC balance information
     */
    getBtcBalance(): Promise<BtcBalance>;
    /**
     * Get wallet's receiving address
     * @returns Promise resolving to Bitcoin address string
     */
    getAddress(): Promise<string>;
    /**
     * List all unspent transaction outputs (UTXOs)
     * @returns Promise resolving to array of unspent outputs
     */
    listUnspents(): Promise<Unspent$1[]>;
    /**
     * Begin creating UTXOs (first step of two-step process)
     * @param params - UTXO creation parameters
     * @returns Promise resolving to base64-encoded PSBT that needs to be signed
     */
    createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string>;
    /**
     * Complete UTXO creation (second step after signing)
     * @param params - Signed PSBT from createUtxosBegin
     * @returns Promise resolving to number of UTXOs created
     */
    createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number>;
    /**
     * Complete UTXO creation flow: begin → sign → end
     * Convenience method that combines createUtxosBegin, signing, and createUtxosEnd
     *
     * @param params - UTXO creation parameters
     * @returns Promise resolving to number of UTXOs created
     */
    createUtxos(params: {
        upTo?: boolean;
        num?: number;
        size?: number;
        feeRate?: number;
    }): Promise<number>;
    /**
     * List all assets in the wallet
     * Returns assets grouped by schema (NIA, UDA, CFA, IFA)
     * @returns Promise resolving to assets information grouped by schema
     */
    listAssets(): Promise<ListAssets>;
    /**
     * Get balance for a specific asset
     * @param asset_id - Asset identifier
     * @returns Promise resolving to asset balance information
     */
    getAssetBalance(asset_id: string): Promise<AssetBalance>;
    /**
     * Issue a new NIA (Non-Inflatable Asset)
     * @param params - Asset issuance parameters
     * @returns Promise resolving to issued asset information
     */
    issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA>;
    /**
     * Issue a new IFA (Inflatable Fungible Asset)
     * @param params - Asset issuance parameters
     * @returns Promise resolving to issued asset information
     */
    issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<any>;
    /**
     * Begin asset inflation (first step of two-step process)
     * @param params - Inflation parameters
     * @returns Promise resolving to base64-encoded PSBT that needs to be signed
     */
    inflateBegin(params: InflateAssetIfaRequestModel): Promise<string>;
    /**
     * Complete asset inflation (second step after signing)
     * @param params - Signed PSBT from inflateBegin
     * @returns Promise resolving to operation result
     */
    inflateEnd(params: InflateEndRequestModel): Promise<OperationResult>;
    /**
     * Complete inflation flow: begin → sign → end
     * Convenience method that combines inflateBegin, signing, and inflateEnd
     *
     * @param params - Inflation parameters
     * @param mnemonic - Optional mnemonic for signing (uses wallet's mnemonic if not provided)
     * @returns Promise resolving to operation result
     */
    inflate(params: InflateAssetIfaRequestModel, mnemonic?: string): Promise<OperationResult>;
    /**
     * Begin sending assets (first step of two-step process)
     * @param params - Send parameters including invoice
     * @returns Promise resolving to base64-encoded PSBT that needs to be signed
     */
    sendBegin(params: SendAssetBeginRequestModel): Promise<string>;
    /**
     * Complete sending assets (second step after signing)
     * @param params - Signed PSBT from sendBegin
     * @returns Promise resolving to send result with txid
     */
    sendEnd(params: SendAssetEndRequestModel): Promise<SendResult>;
    /**
     * Complete send flow: begin → sign → end
     * Convenience method that combines sendBegin, signing, and sendEnd
     *
     * @param invoiceTransfer - Send parameters including invoice
     * @param mnemonic - Optional mnemonic for signing (uses wallet's mnemonic if not provided)
     * @returns Promise resolving to send result with txid
     */
    send(invoiceTransfer: SendAssetBeginRequestModel, mnemonic?: string): Promise<SendResult>;
    /**
     * Begin sending BTC (first step of two-step process)
     * @param params - Send BTC parameters
     * @returns Promise resolving to base64-encoded PSBT that needs to be signed
     */
    sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string>;
    /**
     * Complete sending BTC (second step after signing)
     * @param params - Signed PSBT from sendBtcBegin
     * @returns Promise resolving to transaction ID
     */
    sendBtcEnd(params: SendBtcEndRequestModel): Promise<string>;
    /**
     * Complete BTC send flow: begin → sign → end
     * Convenience method that combines sendBtcBegin, signing, and sendBtcEnd
     *
     * @param params - Send BTC parameters
     * @returns Promise resolving to transaction ID
     */
    sendBtc(params: SendBtcBeginRequestModel): Promise<string>;
    /**
     * Generate blind receive invoice
     * Creates an invoice for receiving assets without revealing the amount
     *
     * @param params - Invoice generation parameters including assignment type
     *                 Assignment types: 'Fungible' | 'NonFungible' | 'InflationRight' | 'ReplaceRight' | 'Any'
     * @returns Promise resolving to invoice data including invoice string
     */
    blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData>;
    /**
     * Generate witness receive invoice
     * Creates an invoice for receiving assets with amount visible
     *
     * @param params - Invoice generation parameters including assignment type
     *                 Assignment types: 'Fungible' | 'NonFungible' | 'InflationRight' | 'ReplaceRight' | 'Any'
     * @returns Promise resolving to invoice data including invoice string
     */
    witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData>;
    /**
     * Decode RGB invoice
     * Extracts information from an RGB invoice string
     *
     * @param params - Invoice string to decode
     * @returns Promise resolving to decoded invoice data including recipientId, assetSchema, assignment, etc.
     */
    decodeRGBInvoice(params: {
        invoice: string;
    }): Promise<InvoiceData>;
    /**
     * List all transactions
     * @returns Promise resolving to array of transactions
     * Each transaction includes transactionType ('RgbSend' | 'Drain' | 'CreateUtxos' | 'User'),
     * txid, received/sent amounts, fee, and optional confirmationTime
     */
    listTransactions(): Promise<Transaction[]>;
    /**
     * List transfers for a specific asset or all assets
     * @param asset_id - Optional asset identifier (lists all if not provided)
     * @returns Promise resolving to array of transfers
     * Each transfer includes status ('WaitingCounterparty' | 'WaitingConfirmations' | 'Settled' | 'Failed'),
     * kind ('Issuance' | 'ReceiveBlind' | 'ReceiveWitness' | 'Send' | 'Inflation'),
     * assignments, and transport endpoints
     */
    listTransfers(asset_id?: string): Promise<Transfer[]>;
    /**
     * Mark transfers as failed
     * @param params - Transfer failure parameters
     * @returns Promise resolving to boolean indicating success
     */
    failTransfers(params: FailTransfersRequest): Promise<boolean>;
    /**
     * Refresh wallet state
     * Syncs wallet with the network and updates internal state
     *
     * @returns Promise that resolves when refresh is complete
     */
    refreshWallet(): Promise<void>;
    /**
     * Sync wallet with network
     * Performs a full synchronization with the indexer
     *
     * @returns Promise that resolves when sync is complete
     */
    syncWallet(): Promise<void>;
    /**
     * Configure VSS (Versioned Storage Service) cloud backup for this wallet.
     * When configured with autoBackup enabled, the wallet will perform automatic
     * backups after state-changing operations according to the underlying rgb-lib behavior.
     */
    configureVssBackup(config: VssBackupConfig): Promise<void>;
    /**
     * Disable automatic VSS backup for this wallet.
     */
    disableVssAutoBackup(): Promise<void>;
    /**
     * Trigger a VSS backup immediately and return the server version of the stored backup.
     */
    vssBackup(config: VssBackupConfig): Promise<number>;
    /**
     * Get VSS backup status information for this wallet.
     */
    vssBackupInfo(config: VssBackupConfig): Promise<VssBackupInfo>;
    /**
     * Estimate fee rate for a given number of blocks
     * @param blocks - Number of blocks for fee estimation
     * @returns Promise resolving to fee estimation response
     */
    estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse>;
    /**
     * Estimate fee for a specific PSBT
     * @param psbtBase64 - Base64-encoded PSBT
     * @returns Promise resolving to fee estimation result
     */
    estimateFee(psbtBase64: string): Promise<EstimateFeeResult>;
    /**
     * Create wallet backup
     * @param params - Backup parameters including path and password
     * @returns Promise resolving to backup response
     */
    createBackup(params: {
        backupPath: string;
        password: string;
    }): Promise<WalletBackupResponse>;
    /**
     * Sign a PSBT using the wallet's mnemonic or a provided mnemonic
     * @param psbt - Base64 encoded PSBT
     * @param mnemonic - Optional mnemonic (uses wallet's mnemonic if not provided)
     * @returns Promise resolving to signed PSBT (base64-encoded)
     */
    signPsbt(psbt: string, mnemonic?: string): Promise<string>;
    /**
     * Sign a message using Schnorr signature
     * @param message - Message to sign
     * @returns Promise resolving to signature string
     */
    signMessage(message: string): Promise<string>;
    /**
     * Verify a Schnorr message signature
     * @param message - Original message
     * @param signature - Signature to verify
     * @param accountXpub - Optional account xpub (uses wallet's xpubVan if not provided)
     * @returns Promise resolving to boolean indicating if signature is valid
     */
    verifyMessage(message: string, signature: string, accountXpub?: string): Promise<boolean>;
}

/**
 * Restore wallet from backup
 * This should be called before creating a WalletManager instance
 * @param params - Restore parameters including backup file path, password, and restore directory
 * @returns Wallet restore response
 */
declare const restoreFromBackup: (params: RestoreWalletRequestModel) => Promise<WalletRestoreResponse>;
/**
 * Generate a new wallet with keys
 * @param network - Network string (default: 'regtest')
 * @returns Generated keys including mnemonic, xpubs, and master fingerprint
 */
declare const createWallet: (network?: string) => Promise<GeneratedKeys>;
type WalletInitParams = {
    xpubVan: string;
    xpubCol: string;
    mnemonic?: string;
    seed?: Uint8Array;
    network?: string | number;
    xpub?: string;
    masterFingerprint: string;
    transportEndpoint?: string;
    indexerUrl?: string;
    dataDir?: string;
};
/**
 * Wallet Manager - High-level wallet interface combining RGB API client and cryptographic operations
 *
 * This class provides a unified interface for:
 * - RGB operations (via RGBLibClient - local rgb-lib)
 * - PSBT signing operations
 * - Wallet state management
 *
 * @example
 * ```typescript
 * const keys = generateKeys('testnet');
 * const wallet = new WalletManager({
 *   xpubVan: keys.accountXpubVanilla,
 *   xpubCol: keys.accountXpubColored,
 *   masterFingerprint: keys.masterFingerprint,
 *   mnemonic: keys.mnemonic,
 *   network: 'testnet',
 *   transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
 *   indexerUrl: 'ssl://electrum.iriswallet.com:50013'
 * });
 *
 * const balance = await wallet.getBtcBalance();
 * ```
 */
declare class WalletManager implements IWalletManager {
    private client;
    private readonly xpub;
    private readonly xpubVan;
    private readonly xpubCol;
    private mnemonic;
    private seed;
    private readonly network;
    private readonly masterFingerprint;
    private disposed;
    private readonly dataDir;
    constructor(params: WalletInitParams);
    private _initParams;
    initialize(): Promise<void>;
    goOnline(): Promise<void>;
    /**
     * Get wallet's extended public keys
     */
    getXpub(): {
        xpubVan: string;
        xpubCol: string;
    };
    /**
     * Get wallet's network
     */
    getNetwork(): Network;
    /**
     * Dispose of sensitive wallet data
     * Clears mnemonic and seed from memory
     * Idempotent - safe to call multiple times
     */
    dispose(): Promise<void>;
    /**
     * Check if wallet has been disposed
     */
    isDisposed(): boolean;
    /**
     * Guard method to ensure wallet has not been disposed
     * @throws {WalletError} if wallet has been disposed
     */
    private ensureNotDisposed;
    registerWallet(): {
        address: string;
        btcBalance: BtcBalance;
    };
    getBtcBalance(): Promise<BtcBalance>;
    getAddress(): Promise<string>;
    listUnspents(): Promise<Unspent$1[]>;
    listAssets(): Promise<ListAssets>;
    getAssetBalance(asset_id: string): Promise<AssetBalance>;
    createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string>;
    createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number>;
    sendBegin(params: SendAssetBeginRequestModel): Promise<string>;
    /**
     * Batch send begin: accepts already-built recipientMap.
     * Returns unsigned PSBT (use signPsbt then sendEnd to complete).
     */
    sendBeginBatch(params: {
        recipientMap: RecipientMap;
        feeRate?: number;
        minConfirmations?: number;
        donation?: boolean;
    }): Promise<string>;
    /**
     * Complete batch send: sendBeginBatch → sign PSBT → sendEnd.
     */
    sendBatch(params: {
        recipientMap: RecipientMap;
        feeRate?: number;
        minConfirmations?: number;
        donation?: boolean;
    }, mnemonic?: string): Promise<SendResult>;
    sendEnd(params: SendAssetEndRequestModel): Promise<SendResult>;
    sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string>;
    sendBtcEnd(params: SendBtcEndRequestModel): Promise<string>;
    estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse>;
    estimateFee(psbtBase64: string): Promise<EstimateFeeResult>;
    sendBtc(params: SendBtcBeginRequestModel): Promise<string>;
    blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData>;
    witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData>;
    decodeRGBInvoice(params: {
        invoice: string;
    }): Promise<InvoiceData>;
    issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA>;
    issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<AssetIfa>;
    inflateBegin(params: InflateAssetIfaRequestModel): Promise<string>;
    inflateEnd(params: InflateEndRequestModel): Promise<OperationResult>;
    /**
     * Complete inflate operation: begin → sign → end
     * @param params - Inflate parameters
     * @param mnemonic - Optional mnemonic for signing
     */
    inflate(params: InflateAssetIfaRequestModel, mnemonic?: string): Promise<OperationResult>;
    refreshWallet(): Promise<void>;
    listTransactions(): Promise<Transaction[]>;
    listTransfers(asset_id?: string): Promise<Transfer[]>;
    failTransfers(params: FailTransfersRequest): Promise<boolean>;
    createBackup(params: {
        backupPath: string;
        password: string;
    }): Promise<WalletBackupResponse>;
    /**
     * Configure VSS cloud backup for this wallet.
     */
    configureVssBackup(config: VssBackupConfig): Promise<void>;
    /**
     * Disable automatic VSS backup.
     */
    disableVssAutoBackup(): Promise<void>;
    /**
     * Trigger a VSS backup immediately and return the server version.
     */
    vssBackup(config: VssBackupConfig): Promise<number>;
    /**
     * Get VSS backup info for this wallet.
     */
    vssBackupInfo(config: VssBackupConfig): Promise<VssBackupInfo>;
    /**
     * Sign a PSBT using the wallet's mnemonic or a provided mnemonic
     * @param psbt - Base64 encoded PSBT
     * @param mnemonic - Optional mnemonic (uses wallet's mnemonic if not provided)
     */
    signPsbt(psbt: string, mnemonic?: string): Promise<string>;
    /**
     * Complete send operation: begin → sign → end
     * @param invoiceTransfer - Transfer invoice parameters
     * @param mnemonic - Optional mnemonic for signing
     */
    send(invoiceTransfer: SendAssetBeginRequestModel, mnemonic?: string): Promise<SendResult>;
    createUtxos({ upTo, num, size, feeRate, }: {
        upTo?: boolean;
        num?: number;
        size?: number;
        feeRate?: number;
    }): Promise<number>;
    syncWallet(): Promise<void>;
    signMessage(message: string): Promise<string>;
    verifyMessage(message: string, signature: string, accountXpub?: string): Promise<boolean>;
}
/**
 * Factory function to create a WalletManager instance
 * Provides a cleaner API than direct constructor
 *
 * @example
 * ```typescript
 * const keys = generateKeys('testnet');
 * const wallet = createWalletManager({
 *   xpubVan: keys.accountXpubVanilla,
 *   xpubCol: keys.accountXpubColored,
 *   masterFingerprint: keys.masterFingerprint,
 *   mnemonic: keys.mnemonic,
 *   network: 'testnet',
 *   transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
 *   indexerUrl: 'ssl://electrum.iriswallet.com:50013'
 * });
 * ```
 */
declare function createWalletManager(params: WalletInitParams): WalletManager;
declare const wallet: WalletManager;

/**
 * UTEXO Protocol Types
 */
type PublicKeys = {
    xpub: string;
    accountXpubVanilla: string;
    accountXpubColored: string;
    masterFingerprint: string;
};
/**
 * Lightning API Types
 */
interface LightningAsset {
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
interface CreateLightningInvoiceRequestModel {
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
interface LightningReceiveRequest {
    lnInvoice: string;
    expiresAt?: number;
}
interface LightningSendRequest extends SendResult {
}
interface GetLightningSendFeeEstimateRequestModel {
    invoice: string;
    assetId?: string;
}
interface PayLightningInvoiceRequestModel {
    lnInvoice: string;
    amount?: number;
    assetId?: string;
    maxFee?: number;
}
interface PayLightningInvoiceEndRequestModel {
    signedPsbt: string;
    lnInvoice: string;
}
/**
 * Onchain API Types
 */
interface OnchainReceiveRequestModel extends InvoiceRequest {
    amount: number;
    assetId: string;
}
interface OnchainReceiveResponse {
    /** Mainnet invoice */
    invoice: string;
}
interface OnchainSendRequestModel {
    /** Mainnet invoice */
    invoice: string;
    assetId?: string;
    amount?: number;
}
interface OnchainSendEndRequestModel {
    /** Mainnet invoice */
    invoice: string;
    signedPsbt: string;
}
interface OnchainSendResponse extends SendResult {
}
interface ListLightningPaymentsResponse {
    payments: LightningSendRequest[];
}

/**
 * UTEXO Protocol Interfaces
 *
 * These interfaces define the contract for UTEXO-specific operations.
 * They are separated by concern (Lightning vs Onchain) and combined into IUTEXOProtocol.
 */

/**
 * Lightning Protocol Interface
 *
 * Defines methods for Lightning Network operations including
 * invoice creation, payments, and fee estimation.
 */
interface ILightningProtocol {
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
    getLightningReceiveRequest(id: string): Promise<TransferStatus | null>;
    /**
     * Returns the current status of a Lightning payment initiated with payLightningInvoice.
     * Works for both BTC and asset payments.
     *
     * @param id - The request ID of the Lightning send request
     * @returns Promise resolving to Lightning send request response or null if not found
     */
    getLightningSendRequest(id: string): Promise<TransferStatus | null>;
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
interface IOnchainProtocol {
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
    getOnchainSendStatus(send_id: string): Promise<OnchainSendStatus | null>;
    /**
     * Lists on-chain transfers for a specific asset.
     *
     * @param asset_id - The asset ID to list transfers for
     * @returns Promise resolving to array of on-chain transfers
     */
    listOnchainTransfers(asset_id?: string): Promise<Transfer[]>;
}
/**
 * UTEXO Protocol Interface
 *
 * Combines Lightning and Onchain protocol interfaces.
 * This is the main interface that UTEXOWallet implements.
 */
interface IUTEXOProtocol extends ILightningProtocol, IOnchainProtocol {
}

/**
 * UTEXO Protocol Base Implementations
 *
 * These classes provide empty implementations for UTEXO-specific operations.
 * They should be extended or used as mixins for concrete implementations.
 */

/**
 * Lightning Protocol Base Class
 *
 * Provides empty implementations for all Lightning protocol methods.
 * Concrete implementations should override these methods.
 */
declare class LightningProtocol implements ILightningProtocol {
    createLightningInvoice(_params: CreateLightningInvoiceRequestModel): Promise<LightningReceiveRequest>;
    getLightningReceiveRequest(_id: string): Promise<TransferStatus | null>;
    getLightningSendRequest(_id: string): Promise<TransferStatus | null>;
    getLightningSendFeeEstimate(_params: GetLightningSendFeeEstimateRequestModel): Promise<number>;
    payLightningInvoiceBegin(_params: PayLightningInvoiceRequestModel): Promise<string>;
    payLightningInvoiceEnd(_params: SendAssetEndRequestModel): Promise<LightningSendRequest>;
    payLightningInvoice(_params: PayLightningInvoiceRequestModel, _mnemonic?: string): Promise<LightningSendRequest>;
    listLightningPayments(): Promise<ListLightningPaymentsResponse>;
}
/**
 * Onchain Protocol Base Class
 *
 * Provides empty implementations for all onchain protocol methods.
 * Concrete implementations should override these methods.
 */
declare class OnchainProtocol implements IOnchainProtocol {
    onchainReceive(_params: OnchainReceiveRequestModel): Promise<OnchainReceiveResponse>;
    onchainSendBegin(_params: OnchainSendRequestModel): Promise<string>;
    onchainSendEnd(_params: SendAssetEndRequestModel): Promise<OnchainSendResponse>;
    onchainSend(_params: OnchainSendRequestModel, _mnemonic?: string): Promise<OnchainSendResponse>;
    getOnchainSendStatus(_send_id: string): Promise<OnchainSendStatus | null>;
    listOnchainTransfers(_asset_id?: string): Promise<Transfer[]>;
}
/**
 * UTEXO Protocol Base Class
 *
 * Combines Lightning and Onchain protocol implementations.
 * Provides empty implementations for all UTEXO protocol methods.
 * Concrete implementations should override these methods.
 */
declare class UTEXOProtocol extends LightningProtocol implements IUTEXOProtocol {
    private onchainProtocol;
    onchainReceive(params: OnchainReceiveRequestModel): Promise<OnchainReceiveResponse>;
    onchainSendBegin(params: OnchainSendRequestModel): Promise<string>;
    onchainSendEnd(params: SendAssetEndRequestModel): Promise<OnchainSendResponse>;
    onchainSend(params: OnchainSendRequestModel, mnemonic?: string): Promise<OnchainSendResponse>;
    getOnchainSendStatus(send_id: string): Promise<OnchainSendStatus | null>;
    listOnchainTransfers(asset_id?: string): Promise<Transfer[]>;
}

/**
 * UTEXO network and asset mapping
 */

/**
 * Network preset type - determines which configuration bundle to use
 */
type UtxoNetworkPreset = 'mainnet' | 'testnet';
/**
 * Network map configuration - maps logical network names to Bitcoin network types
 */
type UtxoNetworkMap = {
    mainnet: Network;
    utexo: Network;
};
/**
 * Network configuration for a single network (RGB, RGB Lightning, or UTEXO)
 */
type NetworkConfig = {
    networkName: string;
    networkId: number;
    assets: {
        assetId: string;
        tokenName: string;
        longName: string;
        precision: number;
        tokenId: number;
    }[];
};
/**
 * Network ID map configuration - contains all network configs with asset lookup
 */
type UtxoNetworkIdMap = {
    mainnet: NetworkConfig & {
        getAssetById(tokenId: number): NetworkConfig['assets'][number] | undefined;
    };
    mainnetLightning: NetworkConfig & {
        getAssetById(tokenId: number): NetworkConfig['assets'][number] | undefined;
    };
    utexo: NetworkConfig & {
        getAssetById(tokenId: number): NetworkConfig['assets'][number] | undefined;
    };
};
/**
 * Complete network preset configuration bundle
 */
type UtxoNetworkPresetConfig = {
    networkMap: UtxoNetworkMap;
    networkIdMap: UtxoNetworkIdMap;
};
/**
 * Gets the network configuration for a given preset
 * @param preset - Network preset ('mainnet' or 'testnet')
 * @returns Network preset configuration bundle
 */
declare function getUtxoNetworkConfig(preset: UtxoNetworkPreset): UtxoNetworkPresetConfig;
/**
 * Backward compatibility: Export testnet preset as default (current behavior)
 * @deprecated Use getUtxoNetworkConfig('testnet') or getUtxoNetworkConfig('mainnet') instead
 */
declare const utexoNetworkMap: UtxoNetworkMap;
/**
 * Backward compatibility: Export testnet preset as default (current behavior)
 * @deprecated Use getUtxoNetworkConfig('testnet') or getUtxoNetworkConfig('mainnet') instead
 */
declare const utexoNetworkIdMap: UtxoNetworkIdMap;
type NetworkAsset = (typeof utexoNetworkIdMap)[keyof typeof utexoNetworkIdMap]['assets'][number];
type UtxoNetworkId = keyof typeof utexoNetworkIdMap;
/**
 * Resolves the destination network's asset object from sender network, destination network, and sender asset ID.
 * Uses tokenId as the cross-network identifier (same tokenId = same logical asset).
 *
 * @param networkIdMap - Optional. When provided (e.g. from wallet's preset), uses this config. Otherwise uses deprecated testnet preset.
 */
declare function getDestinationAsset(senderNetwork: UtxoNetworkId, destinationNetwork: UtxoNetworkId, assetIdSender: string | null, networkIdMap?: UtxoNetworkIdMap): NetworkAsset | undefined;

/**
 * UTEXOWallet constructor and runtime options.
 */

/**
 * Options for UTEXOWallet. When omitted, defaults apply (e.g. DEFAULT_VSS_SERVER_URL for VSS).
 */
interface ConfigOptions {
    /**
     * Network preset: 'mainnet' (production) or 'testnet' (development).
     * Default: 'mainnet'.
     */
    network?: UtxoNetworkPreset;
    /**
     * Optional base directory for wallet data. When set, each wallet uses a subdir by network + fingerprint:
     * utexoRGBWallet → dataDir/{networkMap.utexo}/{masterFingerprint} (e.g. ./utexo/signet/3780bc30)
     * layer1RGBWallet → dataDir/{networkMap.mainnet}/{masterFingerprint} (e.g. ./utexo/testnet/3780bc30)
     * Same structure is used by restoreUtxoWalletFromVss so restored data can be loaded with this dataDir.
     */
    dataDir?: string;
    /**
     * Optional VSS server URL. When omitted, DEFAULT_VSS_SERVER_URL is used.
     * vssBackup() / vssBackupInfo() build config from mnemonic + this URL when config is not passed.
     */
    vssServerUrl?: string;
}

/**
 * UTEXOWallet - Wallet class for UTEXO operations
 *
 * This class provides a wallet interface that accepts either a mnemonic or seed
 * for initialization. It implements both IWalletManager (standard RGB operations)
 * and IUTEXOProtocol (UTEXO-specific Lightning and on-chain operations).
 */

/**
 * UTEXOWallet - Combines standard RGB wallet operations with UTEXO protocol features
 *
 * Architecture:
 * - Implements IWalletManager for standard RGB operations (via WalletManager delegation)
 * - Implements IUTEXOProtocol for UTEXO-specific operations (Lightning, on-chain sends)
 * - Manages two WalletManager instances: layer1 (Bitcoin) and utexo (UTEXO network)
 */
declare class UTEXOWallet extends UTEXOProtocol implements IWalletManager, IUTEXOProtocol {
    private readonly mnemonicOrSeed;
    private readonly options;
    private readonly networkMap;
    private readonly networkIdMap;
    private readonly bridge;
    private layer1Keys;
    private utexoKeys;
    private layer1RGBWallet;
    private utexoRGBWallet;
    /**
     * Creates a new UTEXOWallet instance
     * @param mnemonicOrSeed - Either a mnemonic phrase (string) or seed (Uint8Array)
     * @param options - Optional configuration options (defaults to { network: 'mainnet' })
     */
    constructor(mnemonicOrSeed: string | Uint8Array, options?: ConfigOptions);
    initialize(): Promise<void>;
    /**
     * Derive public keys from mnemonic or seed
     * @param network - BitcoinNetwork identifier
     * @returns Promise resolving to PublicKeys containing xpub, accountXpubVanilla, accountXpubColored, and masterFingerprint
     * @throws {ValidationError} If mnemonic is invalid
     */
    derivePublicKeys(network: BitcoinNetwork): Promise<PublicKeys>;
    getPubKeys(): Promise<PublicKeys>;
    /**
     * Guard method to ensure wallet is initialized
     * @throws {WalletError} if wallet is not initialized
     */
    private ensureInitialized;
    goOnline(): Promise<void>;
    getXpub(): {
        xpubVan: string;
        xpubCol: string;
    };
    getNetwork(): Network;
    dispose(): Promise<void>;
    isDisposed(): boolean;
    getBtcBalance(): Promise<BtcBalance>;
    getAddress(): Promise<string>;
    listUnspents(): Promise<Unspent$1[]>;
    createUtxosBegin(params: CreateUtxosBeginRequestModel): Promise<string>;
    createUtxosEnd(params: CreateUtxosEndRequestModel): Promise<number>;
    createUtxos(params: {
        upTo?: boolean;
        num?: number;
        size?: number;
        feeRate?: number;
    }): Promise<number>;
    listAssets(): Promise<ListAssets>;
    getAssetBalance(asset_id: string): Promise<AssetBalance>;
    issueAssetNia(params: IssueAssetNiaRequestModel): Promise<AssetNIA>;
    issueAssetIfa(params: IssueAssetIfaRequestModel): Promise<any>;
    inflateBegin(params: InflateAssetIfaRequestModel): Promise<string>;
    inflateEnd(params: InflateEndRequestModel): Promise<OperationResult>;
    inflate(params: InflateAssetIfaRequestModel, mnemonic?: string): Promise<OperationResult>;
    sendBegin(params: SendAssetBeginRequestModel): Promise<string>;
    sendEnd(params: SendAssetEndRequestModel): Promise<SendResult>;
    send(invoiceTransfer: SendAssetBeginRequestModel, mnemonic?: string): Promise<SendResult>;
    sendBtcBegin(params: SendBtcBeginRequestModel): Promise<string>;
    sendBtcEnd(params: SendBtcEndRequestModel): Promise<string>;
    sendBtc(params: SendBtcBeginRequestModel): Promise<string>;
    blindReceive(params: InvoiceRequest): Promise<InvoiceReceiveData>;
    witnessReceive(params: InvoiceRequest): Promise<InvoiceReceiveData>;
    decodeRGBInvoice(params: {
        invoice: string;
    }): Promise<InvoiceData>;
    listTransactions(): Promise<Transaction[]>;
    listTransfers(asset_id?: string): Promise<Transfer[]>;
    failTransfers(params: FailTransfersRequest): Promise<boolean>;
    refreshWallet(): Promise<void>;
    syncWallet(): Promise<void>;
    estimateFeeRate(blocks: number): Promise<GetFeeEstimationResponse>;
    estimateFee(psbtBase64: string): Promise<EstimateFeeResult>;
    /**
     * Create backup for both layer1 and utexo stores in one folder.
     * Writes backupPath/wallet_{masterFingerprint}_layer1.backup and backupPath/wallet_{masterFingerprint}_utexo.backup
     * (same naming convention as VSS: storeId_layer1, storeId_utexo with storeId = wallet_<fp>).
     * Use restoreUtxoWalletFromBackup with the same backupPath to restore both.
     */
    createBackup(params: {
        backupPath: string;
        password: string;
    }): Promise<WalletBackupResponse & {
        layer1BackupPath: string;
        utexoBackupPath: string;
    }>;
    configureVssBackup(config: VssBackupConfig): Promise<void>;
    disableVssAutoBackup(): Promise<void>;
    /**
     * Run VSS backup for both layer1 and utexo stores.
     * Config is optional: when omitted, builds config from mnemonic (option param or wallet mnemonic)
     * and options.vssServerUrl (or DEFAULT_VSS_SERVER_URL if not set).
     *
     * @param config - Optional; when omitted, built from mnemonic and vssServerUrl
     * @param mnemonic - Optional; when omitted, uses wallet mnemonic (only if wallet was created with mnemonic string)
     */
    vssBackup(config?: VssBackupConfig, mnemonic?: string): Promise<number>;
    /**
     * Get VSS backup info. Config is optional; when omitted, built from mnemonic (param or wallet)
     * and options.vssServerUrl (or DEFAULT_VSS_SERVER_URL if not set).
     */
    vssBackupInfo(config?: VssBackupConfig, mnemonic?: string): Promise<VssBackupInfo>;
    signPsbt(psbt: string, mnemonic?: string): Promise<string>;
    signMessage(message: string): Promise<string>;
    verifyMessage(message: string, signature: string, accountXpub?: string): Promise<boolean>;
    /**
     * Validates that the wallet has sufficient spendable balance for the given asset and amount.
     * @param assetId - Asset ID to check balance for
     * @param amount - Required amount (in asset units)
     * @throws {ValidationError} If balance is not found or insufficient
     */
    validateBalance(assetId: string, amount: number): Promise<void>;
    /**
     * Extracts invoice data and destination asset from a bridge transfer.
     *
     * @param bridgeTransfer - Bridge transfer response containing recipient invoice and token info
     * @returns Object containing invoice string, decoded invoice data, and destination asset
     * @throws {ValidationError} If destination asset is not supported
     */
    private extractInvoiceAndAsset;
    /**
     * IUTEXOProtocol Implementation
     */
    onchainReceive(params: OnchainReceiveRequestModel): Promise<OnchainReceiveResponse>;
    onchainSendBegin(params: OnchainSendRequestModel): Promise<string>;
    onchainSendEnd(params: OnchainSendEndRequestModel): Promise<OnchainSendResponse>;
    onchainSend(params: OnchainSendRequestModel, mnemonic?: string): Promise<OnchainSendResponse>;
    getOnchainSendStatus(invoice: string): Promise<OnchainSendStatus | null>;
    listOnchainTransfers(asset_id?: string): Promise<Transfer[]>;
    createLightningInvoice(params: CreateLightningInvoiceRequestModel): Promise<LightningReceiveRequest>;
    payLightningInvoiceBegin(params: PayLightningInvoiceRequestModel): Promise<string>;
    payLightningInvoiceEnd(params: PayLightningInvoiceEndRequestModel): Promise<SendResult>;
    payLightningInvoice(params: PayLightningInvoiceRequestModel, mnemonic?: string): Promise<LightningSendRequest>;
    getLightningSendRequest(lnInvoice: string): Promise<TransferStatus | null>;
    getLightningReceiveRequest(lnInvoice: string): Promise<TransferStatus | null>;
    private UTEXOToMainnetRGB;
    private UtexoToMainnetLightning;
}

/**
 * VSS (Versioned Storage Service) configuration defaults and helpers for UTEXO wallet backup/restore.
 */

/** Default VSS server URL used when vssServerUrl is not set in config or restore params. */
declare const DEFAULT_VSS_SERVER_URL = "https://vss-server.utexo.com/vss";

/**
 * UTEXO wallet restore: VSS and file backup restore helpers.
 */

/**
 * Restore a UTEXOWallet from VSS by restoring both layer1 and utexo stores.
 * Mnemonic is required; config is optional (built from mnemonic when omitted; vssServerUrl uses DEFAULT_VSS_SERVER_URL if omitted).
 * Uses the same storeId suffix convention as UTEXOWallet VSS backup (storeId_layer1, storeId_utexo).
 * Restored data is written to targetDir/{layer1Network}/{masterFingerprint} and
 * targetDir/{utexoNetwork}/{masterFingerprint} (same layout as when using dataDir on UTEXOWallet).
 */
declare function restoreUtxoWalletFromVss(params: {
    mnemonic: string;
    targetDir: string;
    /** Optional; when omitted, config is built from mnemonic (vssServerUrl defaults to DEFAULT_VSS_SERVER_URL). */
    config?: VssBackupConfig;
    /** Preset to derive layer1/utexo network names; defaults to 'testnet'. */
    networkPreset?: UtxoNetworkPreset;
    /** Optional; when omitted and config not passed, DEFAULT_VSS_SERVER_URL is used. */
    vssServerUrl?: string;
}): Promise<{
    layer1Path: string;
    utexoPath: string;
    targetDir: string;
}>;
/**
 * Restore a UTEXOWallet from a regular (file) backup created by UTEXOWallet.createBackup.
 * Expects one folder with wallet_<masterFingerprint>_layer1.backup and wallet_<masterFingerprint>_utexo.backup
 * (same naming convention as VSS: storeId_layer1, storeId_utexo with storeId = wallet_<fp>).
 * Restores into targetDir (same layout as VSS restore).
 */
declare function restoreUtxoWalletFromBackup(params: {
    backupPath: string;
    password: string;
    targetDir: string;
    networkPreset?: UtxoNetworkPreset;
}): {
    layer1Path: string;
    utexoPath: string;
    targetDir: string;
};

interface Unspent {
    utxo: Utxo;
    rgbAllocations: RgbAllocation[];
}
interface Utxo {
    outpoint: {
        txid: string;
        vout: number;
    };
    btcAmount: number;
    colorable: boolean;
    exists: boolean;
    pendingBlinded: number;
}
interface RgbAllocation {
    assetId: string;
    assignment: BindingAssignment;
    settled: boolean;
}
interface DecodeRgbInvoiceResponse {
    recipientId: string;
    assetSchema?: string;
    assetId?: string;
    network: string;
    assignment: BindingAssignment;
    assignmentName?: string;
    expirationTimestamp?: number;
    transportEndpoints: string[];
}
interface BindingAssignment {
    [key: string]: number;
}

/**
 * Restore a wallet from a VSS backup into a target directory.
 * Returns a message indicating the restored wallet path.
 */
declare const restoreFromVss: (params: {
    config: VssBackupConfig;
    targetDir: string;
}) => Promise<WalletRestoreResponse & {
    walletPath: string;
}>;

/**
 * Custom error classes for the RGB SDK
 */
/**
 * Base SDK error class with error codes and context
 */
declare class SDKError extends Error {
    readonly code: string;
    readonly statusCode?: number;
    readonly cause?: Error;
    constructor(message: string, code: string, statusCode?: number, cause?: Error);
    /**
     * Convert error to JSON for logging
     */
    toJSON(): {
        name: string;
        message: string;
        code: string;
        statusCode: number | undefined;
        cause: string | undefined;
        stack: string | undefined;
    };
}
/**
 * Network-related errors (API calls, connectivity)
 */
declare class NetworkError extends SDKError {
    constructor(message: string, statusCode?: number, cause?: Error);
}
/**
 * Validation errors (invalid input parameters)
 */
declare class ValidationError extends SDKError {
    readonly field?: string;
    constructor(message: string, field?: string);
}
/**
 * Wallet-related errors (initialization, operations)
 */
declare class WalletError extends SDKError {
    constructor(message: string, code?: string, cause?: Error);
}
/**
 * Cryptographic errors (signing, key derivation)
 */
declare class CryptoError extends SDKError {
    constructor(message: string, cause?: Error);
}
/**
 * Configuration errors (missing or invalid configuration)
 */
declare class ConfigurationError extends SDKError {
    constructor(message: string, _field?: string);
}
/**
 * Bad request errors (400) - Invalid request parameters or data
 */
declare class BadRequestError extends SDKError {
    constructor(message: string, cause?: Error);
}
/**
 * Not found errors (404) - Resource not found
 */
declare class NotFoundError extends SDKError {
    constructor(message: string, cause?: Error);
}
/**
 * Conflict errors (409) - Resource conflict (e.g., wallet state already exists)
 */
declare class ConflictError extends SDKError {
    constructor(message: string, cause?: Error);
}
/**
 * RGB Node errors (500, 502, 503, 504) - RGB Node server errors
 */
declare class RgbNodeError extends SDKError {
    constructor(message: string, statusCode: number, cause?: Error);
}

/**
 * Logger utility for the SDK
 * Provides structured logging with configurable log levels
 */
declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}
declare class Logger {
    private level;
    /**
     * Set the log level
     */
    setLevel(level: LogLevel): void;
    /**
     * Get the current log level
     */
    getLevel(): LogLevel;
    /**
     * Log debug messages
     */
    debug(...args: unknown[]): void;
    /**
     * Log info messages
     */
    info(...args: unknown[]): void;
    /**
     * Log warning messages
     */
    warn(...args: unknown[]): void;
    /**
     * Log error messages
     */
    error(...args: unknown[]): void;
}
declare const logger: Logger;
/**
 * Configure SDK logging
 */
declare function configureLogging(level: LogLevel): void;

declare function isNode(): boolean;
declare function isBrowser(): boolean;
type Environment = 'node' | 'browser' | 'unknown';
declare function getEnvironment(): Environment;

declare function validateNetwork(network: string | number): asserts network is Network;
declare function normalizeNetwork(network: string | number): Network;
declare function validateMnemonic(mnemonic: unknown, field?: string): asserts mnemonic is string;
declare function validateBase64(base64: unknown, field?: string): asserts base64 is string;
declare function validatePsbt(psbt: unknown, field?: string): asserts psbt is string;
declare function validateHex(hex: unknown, field?: string): asserts hex is string;
declare function validateRequired<T>(value: T | null | undefined, field: string): asserts value is T;
declare function validateString(value: unknown, field: string): asserts value is string;

/**
 * BIP32 derivation path constants
 */
/**
 * BIP86 (Taproot) purpose value
 */
declare const DERIVATION_PURPOSE = 86;
/**
 * Account index (account 0')
 */
declare const DERIVATION_ACCOUNT = 0;
/**
 * RGB keychain index
 */
declare const KEYCHAIN_RGB = 0;
/**
 * Bitcoin keychain index
 */
declare const KEYCHAIN_BTC = 0;

/**
 * Network-related constants
 */

/**
 * Coin type constants
 */
declare const COIN_RGB_MAINNET = 827166;
declare const COIN_RGB_TESTNET = 827167;
declare const COIN_BITCOIN_MAINNET = 0;
declare const COIN_BITCOIN_TESTNET = 1;
/**
 * Network string/number to Network type mapping
 */
declare const NETWORK_MAP: {
    readonly '0': "mainnet";
    readonly '1': "testnet";
    readonly '2': "testnet";
    readonly '3': "regtest";
    readonly signet: "signet";
    readonly mainnet: "mainnet";
    readonly testnet: "testnet";
    readonly testnet4: "testnet4";
    readonly regtest: "regtest";
};
/**
 * BIP32 network version constants
 * Note: testnet4 uses the same versions as testnet
 */
declare const BIP32_VERSIONS: {
    readonly mainnet: {
        readonly public: 76067358;
        readonly private: 76066276;
    };
    readonly testnet: {
        readonly public: 70617039;
        readonly private: 70615956;
    };
    readonly testnet4: {
        readonly public: 70617039;
        readonly private: 70615956;
    };
    readonly signet: {
        readonly public: 70617039;
        readonly private: 70615956;
    };
    readonly regtest: {
        readonly public: 70617039;
        readonly private: 70615956;
    };
};

/**
 * Default configuration values
 */
/**
 * Default network to use
 */
declare const DEFAULT_NETWORK: "regtest";
/**
 * Default API request timeout in milliseconds
 */
declare const DEFAULT_API_TIMEOUT = 120000;
/**
 * Default maximum number of retries for failed requests
 */
declare const DEFAULT_MAX_RETRIES = 3;
/**
 * Default log level
 */
declare const DEFAULT_LOG_LEVEL = 3;

export { type AccountXpubs, BIP32_VERSIONS, BadRequestError, type BindingAssignment, type BridgeTransferStatus, COIN_BITCOIN_MAINNET, COIN_BITCOIN_TESTNET, COIN_RGB_MAINNET, COIN_RGB_TESTNET, type ConfigOptions, ConfigurationError, ConflictError, CryptoError, DEFAULT_API_TIMEOUT, DEFAULT_LOG_LEVEL, DEFAULT_MAX_RETRIES, DEFAULT_NETWORK, DEFAULT_VSS_SERVER_URL, DERIVATION_ACCOUNT, DERIVATION_PURPOSE, type DecodeRgbInvoiceResponse, type Descriptors, type Environment, type GeneratedKeys, type ILightningProtocol, type IOnchainProtocol, type IUTEXOProtocol, KEYCHAIN_BTC, KEYCHAIN_RGB, LightningProtocol, LogLevel, NETWORK_MAP, type Network, type NetworkAsset, NetworkError, type NetworkVersions, NotFoundError, OnchainProtocol, type OnchainSendStatus, type PsbtType, type RgbAllocation, RgbNodeError, SDKError, type SignPsbtOptions, type TransferStatus, UTEXOProtocol, UTEXOWallet, type Unspent, type Utxo, type UtxoNetworkId, type UtxoNetworkIdMap, type UtxoNetworkMap, type UtxoNetworkPreset, type UtxoNetworkPresetConfig, ValidationError, WalletError, type WalletInitParams, WalletManager, accountXpubsFromMnemonic, configureLogging, createWallet, createWalletManager, deriveKeysFromMnemonic, deriveKeysFromMnemonicOrSeed, deriveKeysFromSeed, deriveKeysFromXpriv, deriveVssSigningKeyFromMnemonic, generateKeys, getDestinationAsset, getEnvironment, getUtxoNetworkConfig, getXprivFromMnemonic, getXpubFromXpriv, isBrowser, isNode, logger, normalizeNetwork, restoreFromBackup, restoreFromVss, restoreKeys, restoreUtxoWalletFromBackup, restoreUtxoWalletFromVss, signMessage, signPsbt, signPsbtFromSeed, signPsbtSync, utexoNetworkIdMap, utexoNetworkMap, validateBase64, validateHex, validateMnemonic, validateNetwork, validatePsbt, validateRequired, validateString, verifyMessage, wallet };
