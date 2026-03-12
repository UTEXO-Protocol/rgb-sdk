/**
 * UTEXO module exports
 *
 * This module provides the UTEXOWallet class and UTEXO protocol interfaces
 * for managing UTEXO-specific operations including Lightning Network and on-chain withdrawals.
 */

export { UTEXOWallet } from './utexo-wallet';
export type { ConfigOptions } from './config';
export { DEFAULT_VSS_SERVER_URL } from './config';
export {
  restoreUtxoWalletFromVss,
  restoreUtxoWalletFromBackup,
} from './restore';
export {
  UTEXOProtocol,
  LightningProtocol,
  OnchainProtocol,
} from './utexo-protocol';
export type {
  IUTEXOProtocol,
  ILightningProtocol,
  IOnchainProtocol,
} from './IUTEXOProtocol';
