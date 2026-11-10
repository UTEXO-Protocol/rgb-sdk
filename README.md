# @utexo/rgb-sdk

One wallet API over one RGB engine. `UTEXOWallet` wraps an engine the app created (for example `RgbLibWallet` from `@utexo/rgb-lib-rn`), checks its contract version, forwards the shared wallet API and exposes the engine's own extensions with their exact types.

> Version 2 replaces the archived Node SDK `1.0.0-beta.9` (see [Migration](#migration)).

The package has no React Native, Node or browser imports and no engine dependency. It runs wherever its engine runs.

## Install

```bash
npm install @utexo/rgb-sdk @utexo/rgb-sdk-core
# plus an engine, for example @utexo/rgb-lib-rn (see its README)
```

Peer dependencies: `@utexo/rgb-sdk-core`; `@utexo/webrgb` only for the `./webrgb` entry.

## Usage

```typescript
import { UTEXOWallet } from '@utexo/rgb-sdk';
import { RgbLibWallet } from '@utexo/rgb-lib-rn';

const wallet = new UTEXOWallet({
  engine: new RgbLibWallet({ network: 'utexo', storageDirPath }, mnemonic),
});

await wallet.init(); // opens local state
// RgbLibWallet connects lazily on the first online operation (rgb-lib goOnline);
// wallet.goOnline(params) connects explicitly.
const address = await wallet.getAddress();
await wallet.createBackup({ backupPath, password }); // rgb-lib extension, typed
await wallet.shutdown(); // rgb-lib extension: keeps data, reopen with init()
await wallet.destroy();
```

- **The app creates the engine.** The facade has no factory, no `protocol` option and no engine imports.
- **Contract check first.** The constructor first reads only `contractVersion` and `protocol`, and throws `ENGINE_CONTRACT_MISMATCH` (`EngineContractError`) unless the engine implements contract `'1'`. Only then does it read the 29 shared method names and the 21 extension names below. It never calls an engine method and opens no session. Getters or proxy traps on the engine still run during this inspection, so they must be free of side effects.
- **Shared API as is.** Every `SharedWalletApi` method forwards all its arguments to the engine and returns the engine's result, promise or error unchanged. Types are the engine's own (`E[K]`), overloads and generic signatures included. `protocol`, `contractVersion`, `capabilities`, `psbt` and `beginEnd` are read from the engine on every access.
- **Extensions.** `shutdown`, `reinit`, `createBackup`, `drainTo`, `deleteTransfers`, `getBfaCapabilities`, `burn`, `getConsignment`, `getConsignmentPath`, `backupNow`, `vssClearFence`, `signMessage`, `verifyMessage`, `checkIndexerUrl`, `getAssetMetadata`, `issueAssetCfa`, `issueAssetUda`, `listTransfersByTxid`, `listTransactionsByTxid`, `rotateVanillaAddress` and `goOnline` exist on the facade only when the engine has them, with the engine's signatures. Which extensions exist is decided once, at construction. Each call looks the method up on the engine again, so a method the engine replaces later is used, but a method added later never appears on the facade. Facade methods are read-only, and assigning one throws a `TypeError`. Other engine-specific methods are on `wallet.engine`.
- **Aliases.** `initialize()` calls `init()`, `dispose()` calls `destroy()`. `refreshWallet()` is `refresh()` without the result. `refresh()` and `refreshWallet()` (transfer state) and `syncWallet()` (chain state) stay distinct.
- **No subclassing.** A subclass cannot override shared methods (TS2425), and `class X<E> extends UTEXOWallet<E>` does not compile (TS2509). To add behaviour, wrap the engine or the facade. A subclass of a facade over a concrete engine may add new members.
- **Session ownership.** The facade owns the engine's session. `wallet.engine` is readable for engine-specific calls; do not init, unlock, stop or destroy it yourself.

## Errors

Engine errors pass through as the same objects; recognize them with `isEngineError(error, code?)` (re-exported from core), not `instanceof`.

The facade's own errors are `UTEXOWalletError`, also an `EngineError`:

| Code                       | When                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_CONFIG`           | `new UTEXOWallet()` without an options object or an engine object, or with an engine missing shared methods. `operation` is `undefined`. |
| `ENGINE_CONTRACT_MISMATCH` | (`EngineContractError` from core, `operation: 'contractCheck'`) the engine declares no or another contract version.                      |
| `UNSUPPORTED_CAPABILITY`   | `BurnOperations.execute()` on a wallet whose `getBfaCapabilities()` reports `burn: false` (`operation: 'burn'`).                         |

## WebRGB and burn journal (`@utexo/rgb-sdk/webrgb`)

`WebRgbProvider` serves a WebRGB dApp session over a `UTEXOWallet` or an engine; `BurnOperations` is the durable burn journal it uses for `burnAsset`. Install the optional peer `@utexo/webrgb` to use this entry. Burn is a regular provider method: the wallet must have `burn()`, `getConsignment()` and `getBfaCapabilities()`, and `burn: { operations }` is required (without it the constructor throws `INVALID_PARAMS`). `getInfo().methods` lists `burnAsset` and `getConsignment` only while the native wallet can serve them, for example not for a watch-only wallet; `WEBRGB_METHODS` lists every method the provider has. The app provides `crypto.getRandomValues` (burn operation IDs).

```typescript
import { BurnOperations, WebRgbProvider } from '@utexo/rgb-sdk/webrgb';

const operations = new BurnOperations(wallet, store); // one per wallet, shared across sessions
const provider = new WebRgbProvider(wallet, {
  origin,
  confirm,
  burn: { operations },
});
```

## Migration

From the combined React Native package **`@utexo/rgb-sdk-rn`**, whose `UTEXOWallet` selected the engine itself:

| Before (`@utexo/rgb-sdk-rn`)                                                                     | Now                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new UTEXOWallet({ protocol: 'RGB_L1', params, keys })`                                          | `new UTEXOWallet({ engine: new RgbLibWallet(params, keys) })` with `RgbLibWallet` from `@utexo/rgb-lib-rn`, given the same `params` and `keys` the old options took |
| `new UTEXOWallet({ protocol: 'RGB_LN', params, signer })`, or the legacy `(params, signer)` form | not yet: the RGB_LN engine comes in the RLN stage                                                                                                                   |
| `wallet.goOnline(unlockParams)` (RGB_L1)                                                         | unchanged for `RgbLibWallet` (and optional: it connects lazily); `wallet.unlock(params)` is the shared contract's name for the engine's connect step                |
| subclass overrides of capabilities                                                               | `capabilities` comes from the engine                                                                                                                                |
| `WebRgbProvider` from `@utexo/rgb-sdk-rn/webrgb`, `BurnOperations` from `@utexo/rgb-sdk-rn`      | `@utexo/rgb-sdk/webrgb`                                                                                                                                             |

From the interim engine-only build of `@utexo/rgb-lib-rn` (stage 2), which still had a `./webrgb` entry: import `WebRgbProvider` and `BurnOperations` from `@utexo/rgb-sdk/webrgb` instead. The rest of that API is unchanged.

From the archived Node SDK `@utexo/rgb-sdk@1.0.0-beta.9` (BDK and Node bindings, the `utexo` CLI) there is no compatibility layer. Its API, CLI and Node runtime dependencies are gone; use an engine package with this facade.

## Tests

In a checkout of the repository:

```bash
npm install
npm test
```

Type check (including compile-only type tests in `tests/types`), lint, facade tests with fake engines, core's engine conformance checks on the facade, WebRGB tests and an import-isolation check of the build. The real engine is exercised in the acceptance app.
