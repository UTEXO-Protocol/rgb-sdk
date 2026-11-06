export { WebRgbProvider, WEBRGB_READ_METHODS } from './provider.js';
export type { WebRgbOptions, WebRgbApproval, WebRgbInfo } from './provider.js';
export type {
  WebRgbBurnOptions,
  WebRgbBurnAssetArgs,
  WebRgbBurnAssetResult,
} from './burn.js';
export {
  createBurnDestination,
  burnDestinationHash,
} from './burn-destination.js';
export type {
  BurnDestination,
  BurnDestinationRoute,
} from './burn-destination.js';
export { WebRgbError } from './errors.js';
export {
  encodeEvmBurnRecipient,
  encodeTronBurnRecipient,
  encodeBurnRecipient,
  normalizeBurnRecipient,
} from './recipient.js';
export { BurnOperations, normalizeBurnRecord } from './burn-operations.js';
export type {
  BurnOperationMetadata,
  BurnOperationRecord,
  BurnOperationStore,
} from './burn-operations.js';
export type { WebRgbWallet, WebRgbBurnWallet } from './wallet.js';
