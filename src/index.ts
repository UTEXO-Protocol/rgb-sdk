/**
 * @utexo/rgb-sdk — the shared wallet facade.
 *
 * Platform-independent: no React Native, Node or browser imports. The app
 * installs an engine package (for example `@utexo/rgb-sdk-rn`), creates the
 * engine and passes it in:
 *
 * ```ts
 * const wallet = new UTEXOWallet({ engine: new RgbLibWallet(params, keys) });
 * ```
 */

export {
  UTEXOWallet,
  ACCEPTED_CONTRACT_VERSIONS,
  FORWARDED_EXTENSION_METHODS,
} from './utexo-wallet.js';
export type {
  AnyEngine,
  EngineExtensions,
  EngineSharedMethods,
  ForwardedExtensionMethod,
  UnlockParamsOf,
  UTEXOWalletConstructor,
  UTEXOWalletOptions,
} from './utexo-wallet.js';
export { UTEXOWalletError } from './errors.js';
export type { UTEXOWalletErrorCode } from './errors.js';

// Re-exported so apps need not import core for the common checks.
export {
  isEngineError,
  assertEngineContract,
  EngineContractError,
} from '@utexo/rgb-sdk-core';
export type {
  EngineError,
  SharedEngineErrorCode,
  SharedWalletApi,
  EngineCapabilities,
} from '@utexo/rgb-sdk-core';
