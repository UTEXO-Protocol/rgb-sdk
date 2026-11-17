export {
  WebRgbProvider,
  WEBRGB_METHODS,
  WEBRGB_READ_METHODS,
  WEBRGB_WALLET_METHODS,
} from './provider.js';
export type { WebRgbOptions, WebRgbApproval, WebRgbInfo } from './provider.js';
export type {
  WebRgbBurnOptions,
  WebRgbBurnAssetArgs,
  WebRgbBurnAssetResult,
} from './burn.js';
export {
  burnDestinationHash,
  burnDestinationReason,
  burnDestinationPreimage,
  normalizeBurnDestination,
  normalizeBurnRoutes,
  isBurnRoute,
} from './burn-destination.js';
export type {
  BurnDestinationRoute,
  BurnDestinationPreimage,
} from './burn-destination.js';
export type { LegacyBurnPayout, LegacyBurnDestinationV1 } from './recipient.js';
export { WebRgbError } from './errors.js';
export { BurnOperations, normalizeBurnRecord } from './burn-operations.js';
export type {
  AnyBurnOperationRecord,
  BurnOperationMetadata,
  BurnOperationRecord,
  BurnOperationStore,
  LegacyBurnOperationMetadata,
  LegacyBurnOperationRecord,
} from './burn-operations.js';
export type { WebRgbWallet, WebRgbBurnWallet } from './wallet.js';
