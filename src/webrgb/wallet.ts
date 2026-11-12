import type {
  BurnApi,
  ConsignmentApi,
  SharedWalletApi,
  WalletProtocol,
} from '@utexo/rgb-sdk-core';

/**
 * What WebRGB reads from a wallet: a `UTEXOWallet` or an engine.
 * `getConsignment` is optional: without it (e.g. `RgbLibWeb`), `getInfo()`
 * lists neither `burnAsset` nor `getConsignment`, and both reject with
 * `METHOD_NOT_SUPPORTED`, since a WebRGB burn always shares its proof.
 */
export type WebRgbWallet = Pick<
  SharedWalletApi<unknown>,
  | 'getNetwork'
  | 'getNetworkInfo'
  | 'isDisposed'
  | 'getAddress'
  | 'blindReceive'
  | 'witnessReceive'
  | 'listAssets'
  | 'getAssetBalance'
  | 'listTransfers'
  | 'listTransactions'
  | 'refreshWallet'
  | 'decodeRGBInvoice'
> & {
  readonly protocol?: WalletProtocol;
  signMessage?: (message: string) => Promise<string>;
} & BurnApi &
  Partial<Pick<ConsignmentApi, 'getConsignment'>>;

/** @deprecated Every `WebRgbWallet` has `burn()` now; use `WebRgbWallet`. */
export type WebRgbBurnWallet = WebRgbWallet;
