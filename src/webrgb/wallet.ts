import type {
  AssetMetadataApi,
  IPsbtSigning,
  BurnApi,
  ConsignmentApi,
  ReceivedMintApi,
  SharedWalletApi,
  WalletProtocol,
} from '@utexo/rgb-sdk-core';

/**
 * What WebRGB reads from a wallet: a `UTEXOWallet` or an engine.
 * `getReceivedMint` is optional: without it, `getInfo()` does not list it.
 * `getConsignment` is optional: without it, `getInfo()` lists neither
 * `burnAsset` nor `getConsignment`, and both reject with
 * `METHOD_NOT_SUPPORTED`, since a WebRGB burn always shares its proof.
 * `createUtxos`, `getBtcBalance`, `refresh` and `getAssetMetadata` are listed
 * only when the wallet has the matching method; `listUnspents` adds the count
 * of free colorable UTXOs to `getBtcBalance`. `cancelReceive` is listed
 * only with `failTransfers`, and `signPsbt` only with `psbt` and
 * `listUnspents`, which it needs to refuse inputs holding RGB assets.
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
  Partial<
    Pick<
      SharedWalletApi<unknown>,
      | 'createUtxos'
      | 'getBtcBalance'
      | 'listUnspents'
      | 'refresh'
      | 'failTransfers'
    >
  > & {
    readonly psbt?: IPsbtSigning;
  } & Partial<Pick<ConsignmentApi, 'getConsignment'>> &
  Partial<ReceivedMintApi> &
  Partial<AssetMetadataApi>;

/** @deprecated Every `WebRgbWallet` has `burn()` now; use `WebRgbWallet`. */
export type WebRgbBurnWallet = WebRgbWallet;
