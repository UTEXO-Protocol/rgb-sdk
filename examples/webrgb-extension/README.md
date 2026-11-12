# WebRGB browser extension

A sketch of an MV3 extension wallet that serves dApps through WebRGB, with
`RgbLibWeb` behind `UTEXOWallet`. It type-checks (`npm test`) but is not a
complete extension: you add the vault (`readMnemonic`), the approval page
(`approve.html`) and a bundler.

| File            | Runs in                      | Job                                                                  |
| --------------- | ---------------------------- | -------------------------------------------------------------------- |
| `inpage.ts`     | the page (`"world": "MAIN"`) | installs `window.rgb`, announces it, forwards every call             |
| `content.ts`    | content script (isolated)    | relays between the page and the service worker                       |
| `background.ts` | service worker               | the only wallet, one `WebRgbProvider` per origin, approvals, storage |
| `protocol.ts`   | shared                       | message shapes and the allowed methods                               |
| `dapp.ts`       | the dApp                     | uses only `@utexo/webrgb`: connect, `witnessReceive`, poll           |
| `manifest.json` | —                            | MV3 manifest; the CSP allows `wasm-unsafe-eval` for the WASM runtime |

## Rules it follows

- **Keys stay in the service worker.** The page and the content script never
  see the mnemonic or the wallet.
- **The origin comes from the browser.** `background.ts` uses
  `sender.origin`, never a field of the message, and serves only `https://`
  pages.
- **One provider per origin.** Each `WebRgbProvider` holds one site's
  session; `disconnect(origin)` calls `revoke()`.
- **One `BurnOperations` per wallet.** Its journal is in
  `chrome.storage.local`, so a burn outcome survives a worker restart.
- **The worker can stop at any time.** Everything is created again on the
  next message: the wallet state is in IndexedDB, connected origins and
  burn records are in extension storage.
- **Approvals come only from the extension's own pages.** `askUser` opens
  `approve.html`; no answer in five minutes is a no.

## Burn over this engine

`RgbLibWeb` burns (`wallet.burn()`), but `@utexo/rgb-lib-wasm` 1.0.0-beta.4
has no consignment export. A WebRGB burn always shares its proof, so this
wallet's `getInfo().methods` lists neither `burnAsset` nor `getConsignment`,
and both reject with `METHOD_NOT_SUPPORTED`. They appear once the runtime
exports consignments; no code here changes.

## Build

Bundle `background.ts`, `content.ts` and `inpage.ts` to `.js` files next to
`manifest.json` (for example with esbuild, `format: 'esm'` for the worker and
`'iife'` for the two content scripts), then load the folder as an unpacked
extension.
