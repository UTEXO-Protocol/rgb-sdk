// Main wallet exports
export { wallet, createWallet, WalletManager, createWalletManager, restoreFromBackup } from './wallet/index';
export type { WalletInitParams } from './wallet/index';

// UTEXO wallet exports
export { UTEXOWallet, UTEXOProtocol, LightningProtocol, OnchainProtocol } from './utexo';
export type { ConfigOptions, IUTEXOProtocol, ILightningProtocol, IOnchainProtocol } from './utexo';


// Type exports
export * from './types/rgb-model';
export type { Network, PsbtType, SignPsbtOptions, NetworkVersions, Descriptors } from './crypto';
export type { GeneratedKeys, AccountXpubs } from './crypto';

// Function exports
export { signPsbt, signPsbtSync, signPsbtFromSeed, signMessage, verifyMessage } from './crypto';
export { 
  generateKeys, 
  deriveKeysFromMnemonic, 
  deriveKeysFromSeed,
  deriveKeysFromMnemonicOrSeed,
  restoreKeys, 
  accountXpubsFromMnemonic,
  getXprivFromMnemonic,
  getXpubFromXpriv,
  deriveKeysFromXpriv
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
} from './errors';

// Utility exports
export { logger, configureLogging, LogLevel } from './utils/logger';
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
} from './utils/validation';
// normalizeNetwork is exported from validation.ts above
// network.ts is kept for backward compatibility but normalizeNetwork from validation.ts is preferred

// Constants exports
export * from './constants';