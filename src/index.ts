// Main wallet exports
export {
  wallet,
  createWallet,
  WalletManager,
  createWalletManager,
  restoreFromBackup,
} from './wallet/index';
export type { WalletInitParams } from './wallet/index';

// UTEXO wallet exports
export {
  UTEXOWallet,
  UTEXOProtocol,
  LightningProtocol,
  OnchainProtocol,
  restoreUtxoWalletFromVss,
  restoreUtxoWalletFromBackup,
  DEFAULT_VSS_SERVER_URL,
} from './utexo';
export type {
  ConfigOptions,
  IUTEXOProtocol,
  ILightningProtocol,
  IOnchainProtocol,
} from './utexo';

// VSS backup exports (single-wallet restore; use restoreUtxoWalletFromVss for UTEXOWallet)
export { restoreFromVss } from './binding/index';

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
} from './crypto';
export type { GeneratedKeys, AccountXpubs } from './crypto';

// Function exports
export {
  signPsbt,
  signPsbtFromSeed,
  signMessage,
  verifyMessage,
} from './crypto';
export {
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
} from './crypto';

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
export { isNode, isBrowser, getEnvironment } from './utils/environment';
export type { Environment } from './utils/environment';
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

// Constants exports
export * from './constants';
