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
} from '@utexo/rgb-sdk-core';
export type {
  IUTEXOProtocol,
  ILightningProtocol,
  IOnchainProtocol,
} from '@utexo/rgb-sdk-core';
