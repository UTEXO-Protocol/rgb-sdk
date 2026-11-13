/**
 * Messages between the page provider (inpage.ts), the content script
 * (content.ts) and the service worker (background.ts).
 *
 * A request never carries an origin: the service worker reads the dApp's
 * origin from the browser (`sender.origin`), not from the page.
 */

/** Tags this wallet's messages; use your own reverse-DNS name. */
export const CHANNEL = 'com.example.rgb-wallet';

/** The WebRGB methods `WebRgbProvider` serves. Others stay METHOD_NOT_SUPPORTED. */
export const PAGE_METHODS = [
  'enable',
  'getInfo',
  'getAddress',
  'signMessage',
  'blindReceive',
  'witnessReceive',
  'listAssets',
  'getAssetBalance',
  'listTransfers',
  'getTransferStatus',
  'decodeRgbInvoice',
  'burnAsset',
  'getConsignment',
] as const;
export type PageMethod = (typeof PAGE_METHODS)[number];

export const isPageMethod = (value: unknown): value is PageMethod =>
  typeof value === 'string' &&
  (PAGE_METHODS as readonly string[]).includes(value);

export interface WalletRequest {
  channel: typeof CHANNEL;
  kind: 'request';
  id: string;
  method: PageMethod;
  args: unknown[];
}

export type WalletReply =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } };

export type WalletResponse = WalletReply & {
  channel: typeof CHANNEL;
  kind: 'response';
  id: string;
};

/** An extension page (the approval popup) answering a confirmation. */
export interface ApprovalAnswer {
  channel: typeof CHANNEL;
  kind: 'approval';
  id: string;
  approved: boolean;
}
