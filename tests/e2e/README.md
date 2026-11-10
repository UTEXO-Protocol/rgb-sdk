# RgbLibWeb e2e suite

Browser tests for `@utexo/rgb-sdk/adapters/rgb-lib-wasm` (`RgbLibWeb`) over the real
`@utexo/rgb-lib-wasm`, against a local regtest stand. The unit suite (`npm test`)
checks the adapter against a fake runtime; this suite checks the values a real
wallet returns, field by field. It is ported from rgb-sdk-web `tests/e2e`
(specs a, b, c) without Lightning.

## Running

1. Start the stand. The steps are in [`docs/e2e-local-stand.md`](../../../docs/e2e-local-stand.md):
   bitcoind, esplora, **RGB proxy 0.4.0 or newer** and the regtest helper from
   `rgb-lib-wasm/tests/docker-compose.ci.yml`, then mine 111 blocks.
2. Run:

   ```bash
   npm run test:e2e
   ```

   This builds `lib/`, bundles the harness page with esbuild and serves it on port
   5180, then runs Playwright in headless Chromium. `RGB_E2E_QUIET=1` hides the
   `report()` output.

The global setup checks the stand first. It fails at once when the helper or
esplora is down, or when the proxy speaks a protocol other than 1.0.

Environment overrides: `RGB_E2E_INDEXER` (default `http://127.0.0.1:8094/regtest/api`),
`RGB_E2E_PROXY` (`rpc://127.0.0.1:3002/json-rpc`), `RGB_E2E_HELPER`
(`http://127.0.0.1:8080`), `RGB_E2E_PORT` (`5180`).

## How it works

- `harness/main.mjs` is the page. It imports the built facade from `lib/`, and
  exposes `window.harness` with `boot` / `call` / `get`. Results cross the page
  boundary as JSON `{ ok, value | error }`, and errors keep `code` and `operation`.
- `client.mjs` drives the page from the specs: `bootWallet`, `wcall`, `wcallError`,
  `fundAndCreateUtxos`, and `settle` (mine and refresh until a condition holds).
- `stand.mjs` funds and mines through the regtest helper from Node, and waits until
  esplora has indexed each block.
- Two wallets run in two browser contexts, so each has its own IndexedDB.

## Scenarios

| Spec | Covers |
|---|---|
| `a-lifecycle` | init → unlock → network info → identity (stable per mnemonic) → capabilities → destroy → `WALLET_DISPOSED` |
| `b-onchain` | address → funding → balance (incl. `skipSync`) → createUtxos → listUnspents with parsed outpoints → listTransactions; sendBtc between two wallets; estimateFeeRate on regtest |
| `c-assets` | NIA: issue, listAssets (with filter), balance, `ASSET_NOT_FOUND`, onchainReceive witness and blinded, decode, listTransfers, failTransfers. IFA: issue, listAssets (a `test.fixme` in rgb-sdk-web), inflate, inflation beyond the rights. Issuing with no UTXOs |
| `d-transfers` | onchainSend to blinded, witness and donation invoices between two wallets, each settled on both sides; a named invoice after the first transfer; rejections for a blank invoice with no `assetId` and a witness invoice with no `witnessData` |
| `e-persistence` | state survives `destroy` and a page reload (IndexedDB); the same mnemonic in an empty profile starts empty |

Not covered: rgb-sdk-web specs f (psbt / beginEnd carriers; RgbLibWeb has neither),
g and h (VSS backup and restore), and i and j (Lightning). Backup and VSS are engine
extensions that RgbLibWeb does not implement yet.
