import type {
  BurnApi,
  ConsignmentApi,
  SharedWalletApi,
  WalletProtocol,
} from '@utexo/rgb-sdk-core';

/** What WebRGB reads from a wallet: a `UTEXOWallet` or an engine. */
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
  ConsignmentApi;

/** @deprecated Every `WebRgbWallet` burns now; use `WebRgbWallet`. */
export type WebRgbBurnWallet = WebRgbWallet;
