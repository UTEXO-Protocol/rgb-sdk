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
} & Partial<BurnApi & ConsignmentApi>;

/** Burn additionally needs `BurnApi` and `ConsignmentApi`. */
export type WebRgbBurnWallet = WebRgbWallet & BurnApi & ConsignmentApi;

export function isBurnWallet(wallet: WebRgbWallet): wallet is WebRgbBurnWallet {
  return (
    typeof wallet.getBfaCapabilities === 'function' &&
    typeof wallet.burn === 'function' &&
    typeof wallet.getConsignment === 'function'
  );
}
