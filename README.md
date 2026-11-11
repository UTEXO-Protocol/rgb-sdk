# @utexo/rgb-sdk

[![npm](https://img.shields.io/npm/v/@utexo/rgb-sdk)](https://www.npmjs.com/package/@utexo/rgb-sdk)
[![license](https://img.shields.io/npm/l/@utexo/rgb-sdk)](LICENCE)

One wallet API for RGB on Bitcoin, over the engine of your choice. `UTEXOWallet` wraps an engine, checks that it implements the shared wallet contract, and gives your app one typed API for balances, invoices, transfers and backups. The `/webrgb` entry lets dApps use the wallet through WebRGB.

The package has no React Native, Node or browser imports. It runs wherever its engine runs.

## Engines

| Engine                                                                                  | Platform                    | Protocol                |
| --------------------------------------------------------------------------------------- | --------------------------- | ----------------------- |
| [`@utexo/rgb-lib-rn`](https://www.npmjs.com/package/@utexo/rgb-lib-rn) (`RgbLibWallet`) | React Native (iOS, Android) | RGB on-chain (`RGB_L1`) |

## Installation

```bash
npm install @utexo/rgb-sdk @utexo/rgb-sdk-core
npm install @utexo/rgb-lib-rn # an engine; follow its README for native setup
```

## Quick start

```ts
import { UTEXOWallet } from '@utexo/rgb-sdk';
import { RgbLibWallet } from '@utexo/rgb-lib-rn';

// 1. Create the engine, then wrap it.
const wallet = new UTEXOWallet({
  engine: new RgbLibWallet({ network: 'signet', storageDirPath }, mnemonic),
});

// 2. Open it.
await wallet.init();

// 3. Use it.
const address = await wallet.getAddress();
const balance = await wallet.getBtcBalance();
const { invoice } = await wallet.blindReceive({ minConfirmations: 1 });

// 4. Close it.
await wallet.destroy();
```

The engine connects to the network by itself on the first online call. Engine-specific calls are typed too: with `RgbLibWallet`, `wallet.exportBackupToFile()`, `wallet.burn()` or `wallet.goOnline()` are available with the engine's own signatures.

## How it works

- **The app creates the engine.** `UTEXOWallet` has no factory and no engine dependency, so you only bundle the engine you use.
- **Contract check.** The constructor throws `ENGINE_CONTRACT_MISMATCH` if the engine does not implement the shared contract version this facade supports. It makes no engine call and opens no session.
- **Shared API.** Every shared method forwards to the engine and returns its result or error unchanged, with the engine's own types.
- **Extensions.** Optional engine methods (backup, burn, consignments, message signing and others) appear on the facade only if the engine has them. Anything else is on `wallet.engine`.
- **One owner.** The facade owns the engine session: do not call `init()` or `destroy()` on `wallet.engine` yourself.

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

`@utexo/rgb-sdk/webrgb` serves a WebRGB session for one dApp origin over a `UTEXOWallet`. Install the optional peer first:

```bash
npm install @utexo/webrgb
```

```ts
import { BurnOperations, WebRgbProvider } from '@utexo/rgb-sdk/webrgb';

// One burn journal per wallet, shared by all sessions. `store` saves records durably.
const operations = new BurnOperations(wallet, store);

const provider = new WebRgbProvider(wallet, {
  origin: 'https://dapp.example.com',
  confirm: async ({ origin, method, params }) =>
    askUser(origin, method, params),
  burn: { operations },
});
```

- `confirm` is called before every action that needs the user's approval; return `true` to allow it.
- `store` implements `BurnOperationStore`: `readAll()` and `write(record)`, which resolves only after the record is saved.
- `getInfo().methods` lists the methods this wallet can serve. Burn methods are listed only when the engine can burn.
- The app provides `crypto.getRandomValues` (used for burn operation IDs).

## Related packages

- [`@utexo/rgb-lib-rn`](https://www.npmjs.com/package/@utexo/rgb-lib-rn): the React Native engine.
- [`@utexo/rgb-sdk-core`](https://www.npmjs.com/package/@utexo/rgb-sdk-core): shared types, errors, key helpers and the engine contract.

## License

[Apache-2.0](LICENCE)
