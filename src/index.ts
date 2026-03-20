// Main wallet exports
export {
  wallet,
  createWallet,
  WalletManager,
  createWalletManager,
  restoreFromBackup,
} from './wallet/wallet-manager';
export type { WalletInitParams } from './wallet/wallet-manager';

// UTEXO wallet exports
export { UTEXOWallet } from './utexo/utexo-wallet';
export {
  restoreUtxoWalletFromVss,
  restoreUtxoWalletFromBackup,
} from './utexo/restore';
export {
  UTEXOProtocol,
  LightningProtocol,
  OnchainProtocol,
  DEFAULT_VSS_SERVER_URL,
} from '@utexo/rgb-sdk-core';
export type {
  ConfigOptions,
  IUTEXOProtocol,
  ILightningProtocol,
  IOnchainProtocol,
} from '@utexo/rgb-sdk-core';

// VSS backup exports (single-wallet restore; use restoreUtxoWalletFromVss for UTEXOWallet)
export { restoreFromVss } from './binding/NodeRgbLibBinding';

// Type exports
export * from './types/rgb-model';
export type {
  TransferStatus,
  BridgeTransferStatus,
  OnchainSendStatus,
} from '@utexo/rgb-sdk-core';
export type {
  Network,
  PsbtType,
  SignPsbtOptions,
  NetworkVersions,
  Descriptors,
} from './crypto/signer';
export type { GeneratedKeys, AccountXpubs } from '@utexo/rgb-sdk-core';

// Function exports
export { signPsbt, signPsbtFromSeed, estimatePsbt } from './crypto/signer';
export {
  signMessage,
  verifyMessage,
  generateKeys,
  deriveKeysFromMnemonic,
  deriveKeysFromSeed,
  deriveKeysFromMnemonicOrSeed,
  restoreKeys,
  accountXpubsFromMnemonic,
  getXprivFromMnemonic,
  getXpubFromXpriv,
  deriveKeysFromXpriv,
  deriveVssSigningKeyFromMnemonic,
  bip39,
} from '@utexo/rgb-sdk-core';

// Error exports
export {
  SDKError,
  NetworkError,
  ValidationError,
  WalletError,
  CryptoError,
  ConfigurationError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  RgbNodeError,
} from '@utexo/rgb-sdk-core';

// Utility exports
export { logger, configureLogging, LogLevel } from '@utexo/rgb-sdk-core';
export { isNode } from './utils/environment';
export {
  validateNetwork,
  normalizeNetwork,
  validateMnemonic,
  validatePsbt,
  validateBase64,
  validateHex,
  validateRequired,
  validateString,
  isNetwork,
} from '@utexo/rgb-sdk-core';

// Constants
export {
  DEFAULT_NETWORK,
  DEFAULT_API_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_LOG_LEVEL,
  DERIVATION_PURPOSE,
  DERIVATION_ACCOUNT,
  KEYCHAIN_RGB,
  KEYCHAIN_BTC,
  COIN_RGB_MAINNET,
  COIN_RGB_TESTNET,
  COIN_BITCOIN_MAINNET,
  COIN_BITCOIN_TESTNET,
  NETWORK_MAP,
  BIP32_VERSIONS,
  utexoNetworkMap,
  utexoNetworkIdMap,
  getDestinationAsset,
  getUtxoNetworkConfig,
} from '@utexo/rgb-sdk-core';
export type {
  NetworkAsset,
  UtxoNetworkId,
  UtxoNetworkPreset,
  UtxoNetworkMap,
  UtxoNetworkIdMap,
  UtxoNetworkPresetConfig,
} from '@utexo/rgb-sdk-core';
