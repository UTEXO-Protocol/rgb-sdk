# @utexo/rgb-sdk

[![npm](https://img.shields.io/npm/v/@utexo/rgb-sdk)](https://www.npmjs.com/package/@utexo/rgb-sdk)
[![license](https://img.shields.io/npm/l/@utexo/rgb-sdk)](LICENCE)

One wallet API for RGB on Bitcoin, over the engine of your choice. `UTEXOWallet` wraps an engine, checks that it implements the shared wallet contract, and gives your app one typed API for balances, invoices, transfers and backups. The `/webrgb` entry lets dApps use the wallet through WebRGB.

The package has no React Native, Node or browser imports. It runs wherever its engine runs.

## Engines

| Engine                                                                              | Platform                    | Protocol                |
| ----------------------------------------------------------------------------------- | --------------------------- | ----------------------- |
| [`@utexo/rgb-sdk-rn`](https://github.com/UTEXO-Protocol/rgb-sdk-rn) (`RgbLibRn`)    | React Native (iOS, Android) | RGB on-chain (`RGB_L1`) |
| [`@utexo/rgb-sdk-web`](https://github.com/UTEXO-Protocol/rgb-sdk-web) (`RgbLibWeb`) | Browser                     | RGB on-chain (`RGB_L1`) |

## Installation

Not released yet. Once it is:

```bash
npm install @utexo/rgb-sdk @utexo/rgb-sdk-core@1.0.0-beta.10

# React Native
npm install @utexo/rgb-sdk-rn@1.0.0-beta.41

# Browser
npm install @utexo/rgb-sdk-web@1.0.0-beta.13
```

## Quick start

```ts
import { UTEXOWallet } from '@utexo/rgb-sdk';
import { RgbLibRn } from '@utexo/rgb-sdk-rn';

// 1. Create the engine, then wrap it.
const wallet = new UTEXOWallet({
  engine: new RgbLibRn({ network: 'utexo', storageDirPath }, mnemonic),
});

// 2. Open it.
await wallet.init();

// 3. Use it.
const address = await wallet.getAddress();
const balance = await wallet.getBtcBalance();
const { invoice } = await wallet.onchainReceive({ minConfirmations: 1 }); // witness invoice: needs no free UTXOs

// 4. Close it.
await wallet.destroy();
```

The same in the browser, with `@utexo/rgb-sdk-web`:

```ts
import { RgbLibWeb } from '@utexo/rgb-sdk-web';

const wallet = new UTEXOWallet({
  engine: new RgbLibWeb({ network: 'utexo', mnemonic, dataDir: 'my-app' }),
});
```

The engine connects to the network by itself on the first online call. Engine-specific calls are typed too: with `RgbLibRn`, `wallet.exportBackupToFile()`, `wallet.burn()` or `wallet.goOnline()` are available with the engine's own signatures.

## How it works

- **The app creates the engine.** `UTEXOWallet` has no factory and no engine dependency, so you only bundle the engine you use.
- **Contract check.** The constructor throws `ENGINE_CONTRACT_MISMATCH` if the engine does not implement the shared contract version this facade supports. It makes no engine call and opens no session.
- **Shared API.** Every shared method forwards to the engine and returns its result or error unchanged, with the engine's own types.
- **Extensions.** Optional engine methods (backup, burn, consignments, message signing and others) appear on the facade only if the engine has them. Anything else is on `wallet.engine`.
- **One owner.** The facade owns the engine session: do not call `init()` or `destroy()` on `wallet.engine` yourself.

## Wallet API

Every engine has these methods, with the same names and types:

| Group     | Methods                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Lifecycle | `init()`, `unlock()`, `destroy()`, `isDisposed()`                                                          |
| Network   | `getNetwork()`, `getNetworkInfo()`, `getWalletIdentity()`, `estimateFeeRate()`                             |
| Bitcoin   | `getAddress()`, `getBtcBalance()`, `listUnspents()`, `createUtxos()`, `sendBtc()`                          |
| Assets    | `listAssets()`, `getAssetBalance()`, `issueAssetNia()`, `issueAssetIfa()`, `inflate()`                     |
| Invoices  | `onchainReceive()`, `witnessReceive()`, `blindReceive()`, `decodeRGBInvoice()`, `onchainSend()`            |
| Transfers | `listTransfers()`, `listTransactions()`, `refresh()`, `refreshWallet()`, `syncWallet()`, `failTransfers()` |

Amounts are in the asset's smallest units, fee rates in sat/vB.

## Engine extensions

Optional methods, present on the facade only when the engine has them:

| Methods                                                     | `RgbLibRn` | `RgbLibWeb`                |
| ----------------------------------------------------------- | ---------- | -------------------------- |
| `burn()`, `getBfaCapabilities()`                            | yes        | yes                        |
| `getConsignment()`, `getConsignmentPath()`                  | yes        | no (not in the WASM build) |
| `getReceivedMint()`                                         | yes        | yes                        |
| `exportBackup()`                                            | yes        | yes                        |
| `restoreBackup()`                                           | no         | yes                        |
| `exportBackupToFile()`                                      | yes        | no                         |
| `backupToVss()`, `restoreFromVss()`, `getVssBackupInfo()`   | no         | yes                        |
| `shutdown()`, `reinit()`                                    | yes        | no                         |
| `drainTo()`, `deleteTransfers()`                            | yes        | no                         |
| `issueAssetCfa()`, `issueAssetUda()`, `getAssetMetadata()`  | yes        | no                         |
| `listTransfersByTxid()`, `listTransactionsByTxid()`         | yes        | no                         |
| `checkIndexerUrl()`, `rotateVanillaAddress()`, `goOnline()` | yes        | `goOnline()` only          |

On React Native a backup restores with `restoreBackupFromFile()` from `@utexo/rgb-sdk-rn`, before the wallet is created.

## Error handling

Engine errors pass through unchanged. Each has a stable `code`, the `operation` and the `protocol`:

```ts
import { isEngineError } from '@utexo/rgb-sdk';

try {
  await wallet.onchainSend({ invoice, amount: 100, feeRate: 2 });
} catch (error) {
  if (isEngineError(error, 'INSUFFICIENT_FUNDS')) {
    // fund the wallet
  } else if (isEngineError(error)) {
    console.warn(error.code, error.operation);
  } else {
    throw error;
  }
}
```

The facade's own errors are `UTEXOWalletError`:

| Code                       | When                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| `INVALID_CONFIG`           | `new UTEXOWallet()` without an engine, or with one missing shared methods |
| `ENGINE_CONTRACT_MISMATCH` | The engine implements another contract version (`EngineContractError`)    |
| `UNSUPPORTED_CAPABILITY`   | A burn on a wallet that cannot burn, for example a watch-only wallet      |

The engine's README lists its error codes.

## WebRGB for dApps

WebRGB connects a dApp to a wallet. The two sides use different packages:

| You build                            | Use                     | Imports                                                             |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------- |
| a dApp                               | `@utexo/webrgb` only    | `requestProvider`, `supports`, `toTransferArray`, `isProviderError` |
| a wallet (extension, in-app browser) | `@utexo/rgb-sdk/webrgb` | `WebRgbProvider`, `BurnOperations`                                  |

A dApp never imports a wallet SDK, so it works with any WebRGB wallet. Install the optional peer in the wallet:

```bash
npm install @utexo/webrgb
```

### The wallet side

```ts
import { BurnOperations, WebRgbProvider } from '@utexo/rgb-sdk/webrgb';

// One burn journal per wallet, shared by all sessions. `store` saves records durably.
const operations = new BurnOperations(wallet, store);

// One provider per dApp origin.
const provider = new WebRgbProvider(wallet, {
  origin: 'https://dapp.example.com',
  confirm: async ({ origin, method, params }) =>
    askUser(origin, method, params),
  // The chain and endpoint pairs your bridge deployment pays out on.
  burn: {
    operations,
    destinationRoutes: [{ chainId: 'eip155:42161', dstEid: 0 }],
  },
});
```

- Take `origin` from the browser (for an extension, `sender.origin`), never from the dApp's message.
- Keep keys where the dApp cannot reach them: in an extension, in the service worker, not in the page or the content script.
- `confirm` is called before every action that needs the user's approval; return `true` to allow it.
- `sessionApproved: true` restores a connection the user approved earlier; `revoke()` ends it when the user disconnects the site.
- `store` implements `BurnOperationStore`: `readAll()` and `write(record)`, which resolves only after the record is saved. Use storage that survives a restart.
- `getInfo().methods` lists the methods this wallet can serve. `burnAsset` and `getConsignment` are listed only when the engine can burn and export consignments: a WebRGB burn always shares its proof. `RgbLibWeb` burns but has no consignment export yet, so over it they are not listed and reject with `METHOD_NOT_SUPPORTED`. `burnAsset` also needs `destinationRoutes`.
- `burnAsset` takes one `burnDestination: { chainId, address, dstEid }` with a native address. The wallet accepts only an exact `chainId` and `dstEid` pair from `destinationRoutes`, validates the address, amount, fee rate and confirmations, and only then asks the user. It passes the SPEC §4.1 commitment to the engine as `burn_reason` (64 hex characters without `0x`; `burnDestinationReason()`), and the result carries the same `burnDestination`. A request with `burnRecipient` or any other extra field rejects with `INVALID_PARAMS`; there is no address-only fallback. Routes are not advertised in `getInfo()`. Burns saved by earlier releases keep their commitment and stay readable.
- `createUtxos`, `getBtcBalance`, `refresh` and `getAssetMetadata` are listed when the engine has the method. `createUtxos` asks the user and shows the count, size and fee rate it will use; it never retries. `getBtcBalance` returns totals and a count of free colorable UTXOs, never outpoints. `refresh(assetId?)` rejects when a transfer in its scope failed to refresh. `getAssetMetadata` returns `issuedSupply`, the initial supply, as an exact decimal string.
- A receive with no free allocation slot rejects with `NO_AVAILABLE_UTXOS`: offer `createUtxos` or `witnessReceive`.
- `getReceivedMint({ invoice })` is listed when the engine has `getReceivedMint()`. It does not prompt. It accepts only an invoice this wallet created (the stored invoice must match exactly) that names an asset, refreshes incoming transfers only, and returns the checked mint with the asset and network, or `null` while none is ready. `txid` is added once the wallet links the receive to its witness transaction, which can be only after the lock is paid; `lockId` already commits to it. A refresh failure of this receive rejects. A failed or expired receive, a foreign invoice and an invalid result reject. The engine needs the chain's `evmRpcUrls` entry to check a mint.
- The app provides `crypto.getRandomValues` (used for burn operation IDs).

A complete extension sketch (service worker, content script, page script, manifest) is in [`examples/webrgb-extension/`](examples/webrgb-extension/README.md).

### The dApp side

```ts
import { isProviderError, requestProvider, supports } from '@utexo/webrgb';

export async function askForInvoice(assetId: string) {
  try {
    const rgb = await requestProvider({ enable: true }); // asks the user to connect
    const info = await rgb.getInfo();
    if (!supports(info, 'witnessReceive'))
      throw new Error('This wallet cannot receive');
    const { invoice } = await rgb.witnessReceive({ assetId, amount: 100 });
    return invoice;
  } catch (error) {
    if (isProviderError(error) && error.code === 'USER_REJECTED') return null;
    throw error;
  }
}
```

- Check `getInfo().methods` (or `supports()`) before a call: wallets serve different methods.
- Read-only calls (`listAssets`, `listTransfers`, `getAssetBalance`) raise no prompt, so polling them is fine.

## Related packages

- [`@utexo/rgb-sdk-rn`](https://github.com/UTEXO-Protocol/rgb-sdk-rn): the React Native engine.
- [`@utexo/rgb-sdk-web`](https://github.com/UTEXO-Protocol/rgb-sdk-web): the browser engine.
- [`@utexo/rgb-sdk-core`](https://github.com/UTEXO-Protocol/rgb-sdk-core): shared types, errors, key helpers and the engine contract.

## License

[Apache-2.0](LICENCE)
