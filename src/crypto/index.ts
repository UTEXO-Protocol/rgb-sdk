/**
 * Crypto module exports
 */

export { signPsbt, signPsbtFromSeed, estimatePsbt } from './signer';
export type { SignPsbtOptions } from './signer';

export { signMessage, verifyMessage } from '@utexo/rgb-sdk-core';
export type { SignMessageParams, VerifyMessageParams } from '@utexo/rgb-sdk-core';

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
} from '@utexo/rgb-sdk-core';
export type { GeneratedKeys, AccountXpubs } from '@utexo/rgb-sdk-core';

export type { Network, PsbtType, NetworkVersions, Descriptors } from '@utexo/rgb-sdk-core';
