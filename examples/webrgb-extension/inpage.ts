/**
 * Runs in the page (content script with `"world": "MAIN"`). Installs
 * `window.rgb` and announces it; every call goes to the content script and
 * on to the service worker. This file holds no keys and no wallet.
 */
import { announceProvider } from '@utexo/webrgb';
import type { RgbProvider } from '@utexo/webrgb';
import { CHANNEL } from './protocol.js';
import type { PageMethod, WalletRequest, WalletResponse } from './protocol.js';

const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: unknown) => void }
>();

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as WalletResponse | null;
  if (data?.channel !== CHANNEL || data.kind !== 'response') return;
  const call = pending.get(data.id);
  if (!call) return;
  pending.delete(data.id);
  if (data.ok) call.resolve(data.result);
  else
    call.reject(
      Object.assign(new Error(data.error.message), { code: data.error.code })
    );
});

function forward<M extends PageMethod>(method: M) {
  return ((...args: unknown[]) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      pending.set(id, { resolve, reject });
      const request: WalletRequest = {
        channel: CHANNEL,
        kind: 'request',
        id,
        method,
        args,
      };
      window.postMessage(request, window.location.origin);
    })) as unknown as NonNullable<RgbProvider[M]>;
}

const notServed = (method: string) => () =>
  Promise.reject(
    Object.assign(new Error(`${method} is not served by this wallet`), {
      code: 'METHOD_NOT_SUPPORTED',
    })
  );

let enabled = false;
const enable = forward('enable');
const provider: RgbProvider = {
  get enabled() {
    return enabled;
  },
  enable: async () => {
    await enable();
    enabled = true;
  },
  getInfo: forward('getInfo'),
  getAddress: forward('getAddress'),
  signMessage: forward('signMessage'),
  blindReceive: forward('blindReceive'),
  witnessReceive: forward('witnessReceive'),
  listAssets: forward('listAssets'),
  getAssetBalance: forward('getAssetBalance'),
  listTransfers: forward('listTransfers'),
  getTransferStatus: forward('getTransferStatus'),
  decodeRgbInvoice: forward('decodeRgbInvoice'),
  burnAsset: forward('burnAsset'),
  getConsignment: forward('getConsignment'),
  issueAsset: notServed('issueAsset'),
  sendAsset: notServed('sendAsset'),
  makeLnInvoice: notServed('makeLnInvoice'),
  payLnInvoice: notServed('payLnInvoice'),
  // This provider sends no events; dApps poll getTransferStatus().
  on: () => undefined,
  off: () => undefined,
};

// window.rgb is one slot: take it only when no other wallet did.
if (!window.rgb) {
  window.rgb = provider;
  window.dispatchEvent(
    new CustomEvent('rgb:ready', { detail: { version: '1.0.0' } })
  );
}
announceProvider({
  info: {
    uuid: crypto.randomUUID(),
    name: 'Example RGB Wallet',
    rdns: 'com.example.rgb-wallet',
  },
  provider,
});
