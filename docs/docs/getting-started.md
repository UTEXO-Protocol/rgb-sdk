# Getting Started

This guide is written for developers who are new to Bitcoin and RGB and is focused on a practical asset flow.

## Install

```bash
npm install @utexo/rgb-sdk
```

## Network and environment

For development, use:

- `network: 'testnet'` in the SDK
- UTEXO signet-backed infrastructure for test BTC and indexing/routing

This lets you test full asset flows without using real mainnet funds.

## Core concepts (non-Bitcoin quick intro)

### What is a UTXO?

A UTXO is a spendable Bitcoin output (like a coin chunk).  
RGB assets are attached to specific UTXOs.

### Why `createUtxos()` is required

Before issuing or receiving RGB assets, you usually prepare wallet UTXOs with `createUtxos(...)`.  
This creates suitable output structure so RGB allocations can be tracked and transferred cleanly.

### Colored vs vanilla BTC balances

- `vanilla`: regular BTC balance not carrying RGB state
- `colored`: BTC outputs involved in RGB allocations/operations

`getBtcBalance()` returns both, each with:

- `settled`: confirmed final balance
- `future`: expected balance after pending operations confirm
- `spendable`: currently usable amount for new operations

### Transfer status basics

Common RGB transfer states:

- `WaitingCounterparty`
- `WaitingConfirmations`
- `Settled`
- `Failed`

Use `listTransfers(...)` and `refreshWallet()` to track progress.

### Invoice types: blinded vs witness

RGB receive flow supports two invoice styles:

- **Blinded invoice** (`blindReceive`): most common flow. Receiver creates a blinded recipient endpoint; sender pays invoice directly.
- **Witness invoice** (`witnessReceive`): receiver binds transfer to witness data. Sender must provide `witnessData` in `send(...)` (at least `amountSat`).

Rule of thumb:

- use **blinded** for normal app-to-app RGB transfers
- use **witness** when your integration explicitly requires witness-bound receive semantics

Default parameter behavior follows the underlying `rgb-lib` implementation used by the SDK.  
If you omit optional fields like `minConfirmations` or `durationSeconds`, rgb-lib defaults are applied.

Parameter clarity:

- `minConfirmations`: minimum Bitcoin confirmation depth required by the operation.
- `durationSeconds`: invoice lifetime in seconds before expiry.

### `syncWallet()` vs `refreshWallet()` during payment

Use both, but for different reasons:

- `syncWallet()` updates chain/UTXO state (funding, confirmations, spendable BTC)
- `refreshWallet()` updates RGB transfer state (consignments and transfer status progression)

For sender/receiver payment flow:

1. After faucet funding or UTXO creation: call `syncWallet()` on sender/receiver.
2. After `send(...)`: call `refreshWallet()` on **both** sender and receiver.
3. If status is still pending (`WaitingCounterparty` / `WaitingConfirmations`), run `refreshWallet()` again after a delay.

## How to get test tokens

You need two assets to run RGB flows:

- **Test BTC (sats)**: pays Bitcoin fees and funds UTXO creation.
- **RGB test token** (for example test `USDT`): the asset you send/receive.

### 1) Get test BTC from faucet

Use the UTEXO faucet API shown in this guide (`sendbtc`) to fund wallet addresses.

- Fund **sender wallet** first (required for `createUtxos` and `issueAssetNia`).
- Fund **receiver wallet** too (receiver also needs sats to prepare RGB receive allocations).

### 2) Get RGB test tokens

Two common options:

- **Issue your own token** (recommended for local testing):  
  call `issueAssetNia(...)` after creating UTXOs, then use returned `assetId`.
- **Receive existing token** from another wallet:  
  request invoice via `blindReceive(...)`/`witnessReceive(...)`, then have funded sender transfer that `assetId`.

### 3) Verify you received tokens

After transfer:

```ts
await receiver.refreshWallet();
console.log(await receiver.getAssetBalance(assetId));
console.log(await receiver.listTransfers(assetId));
```

If `assetId` balance is positive and transfer status reaches `Settled`, token receipt is complete.

## Quick start (verified local snippet)

This snippet was verified against the current SDK build.

```ts
import { UTEXOWallet, generateKeys } from '@utexo/rgb-sdk';

const senderKeys = await generateKeys('testnet');
const sender = new UTEXOWallet(senderKeys.mnemonic, { network: 'testnet' });
await sender.initialize();
const senderAddress = await sender.getAddress();
const senderBalance = await sender.getBtcBalance();
console.log({ senderAddress, senderBalance });

await sender.dispose();
```

## End-to-end asset flow

### 1) Create sender and receiver wallets

```ts
import { UTEXOWallet, generateKeys } from '@utexo/rgb-sdk';

const senderKeys = await generateKeys('testnet');
const receiverKeys = await generateKeys('testnet');

const sender = new UTEXOWallet(senderKeys.mnemonic, { network: 'testnet' });
const receiver = new UTEXOWallet(receiverKeys.mnemonic, { network: 'testnet' });

await sender.initialize();
await receiver.initialize();
```

### 2) Fund sender wallet with test BTC (UTEXO signet faucet style)

```bash
curl -H "Authorization: Bearer EnYKDBgDIggKBggGEgIYDRIkCAASIGuYoof1WC0FaPciGHzPinGmglHd_b3Lb-gokogoeL-aGkA_hc_eLZ05C1XaA9wrcqFh1Bozvi_sawa_QKNCcowZCsVRmrsxJYahtsMduWYGrOVT7JNVVvpcU4PrGu19GrYNIiIKIO5ajD4HcB-R-yadJQCA954KhC7DV2wHi4_piv9k1uYT" \
  "https://node-api.thunderstack.org/c17bc5d0-80b1-7050-5af5-dfd8a67834f1/1e0cfe422f0e4306bebdab953a0b99f2/sendbtc" \
  -d '{
    "amount": 16900,
    "address": "bcrt1qwxht5tut39dws8tjcf649tp908r8fr2j75c94k",
    "fee_rate": 5,
    "skip_sync": true
  }'
```

Use the address from `await sender.getAddress()`, then sync:

```ts
await sender.syncWallet();
console.log(await sender.getBtcBalance());
```

### 3) Prepare RGB UTXOs

```ts
const created = await sender.createUtxos({ num: 5, size: 1000 });
await sender.syncWallet();
console.log('UTXOs created:', created);
```

### 4) Issue test asset (for example USDT-like demo token)

```ts
const issued = await sender.issueAssetNia({
  ticker: 'USDT',
  name: 'Tether USD (Test)',
  amounts: [1000000],
  precision: 6,
});

const assetId = issued.assetId;
console.log('Issued asset ID:', assetId);
```

### 5) Receiver creates invoice, sender sends asset (blinded example)

```ts
const receiveData = await receiver.blindReceive({
  assetId,
  amount: 5000, // RGB asset base units
  minConfirmations: 1, // require at least 1 conf for relevant UTXOs
  durationSeconds: 3600, // invoice expires after 1 hour
});

await sender.send({
  invoice: receiveData.invoice,
  assetId,
  amount: 5000,
});
```

### 6) Receiver creates invoice, sender sends asset (witness example)

```ts
const witnessInvoice = await receiver.witnessReceive({
  assetId,
  amount: 2000, // RGB asset base units
  minConfirmations: 1, // confirmation threshold
  durationSeconds: 3600, // invoice lifetime
});

await sender.send({
  invoice: witnessInvoice.invoice,
  assetId,
  amount: 2000,
  witnessData: {
    amountSat: 1000,
  },
});
```

### 7) Refresh and verify balances/transfers

```ts
await sender.refreshWallet();
await receiver.refreshWallet();

const senderAssetBalance = await sender.getAssetBalance(assetId);
const receiverAssetBalance = await receiver.getAssetBalance(assetId);

console.log('Sender asset balance:', senderAssetBalance);
console.log('Receiver asset balance:', receiverAssetBalance);

console.log('Sender transfers:', await sender.listTransfers(assetId));
console.log('Receiver transfers:', await receiver.listTransfers(assetId));
```

If transfer status is still pending, wait and refresh again:

```ts
await new Promise((r) => setTimeout(r, 8000));
await sender.refreshWallet();
await receiver.refreshWallet();
```

## Backups (recommended for every state change)

After important operations (UTXO creation, issuance, send), create backups.

### File backup

```ts
await sender.createBackup({
  backupPath: './backups',
  password: 'strong-password',
});
```

### VSS backup

```ts
await sender.vssBackup();
```

### VSS backup export/import flow

Think about VSS as remote backup storage:

- **export backup to VSS**: `wallet.vssBackup(...)`
- **check backup status/version**: `wallet.vssBackupInfo(...)`
- **import/restore from VSS**: `restoreUtxoWalletFromVss(...)`

Example:

```ts
import {
  restoreUtxoWalletFromVss,
  UTEXOWallet,
} from '@utexo/rgb-sdk';

// Get deterministic VSS config derived from mnemonic + defaults
const vssConfig = await sender.getDefaultVssConfig();

// Export (upload) latest wallet state to VSS
await sender.vssBackup(vssConfig);

// Optional: check if server has backup and whether a new one is required
const info = await sender.vssBackupInfo(vssConfig);
console.log(info); // { backupExists, serverVersion, backupRequired }

// Import (restore) into a fresh local directory
const restored = await restoreUtxoWalletFromVss({
  mnemonic: senderKeys.mnemonic,
  targetDir: './restored-from-vss',
  config: vssConfig,
  networkPreset: 'testnet',
});

// Re-open wallet from restored data
const restoredWallet = new UTEXOWallet(senderKeys.mnemonic, {
  network: 'testnet',
  dataDir: restored.targetDir,
});
await restoredWallet.initialize();
```

## Address behavior

By default, each call to `getAddress()` rotates to a new receive address (new derivation index).

- improves privacy (harder to correlate incoming payments)
- reduces address reuse risk in operational flows
- matches HD wallet best practices

If your app requires showing the same deposit address, persist one generated address and reuse that value in your UI/service.

## Mnemonic to private key

The SDK exposes conversion from mnemonic to extended private key (`xpriv`), which is the account root private key material.

```ts
import { getXprivFromMnemonic } from '@utexo/rgb-sdk';

const xpriv = await getXprivFromMnemonic('testnet', senderKeys.mnemonic);
console.log('xpriv:', xpriv);
```

Notes:

- `xpriv` is highly sensitive (treat like your mnemonic)
- from `xpriv`, all child private/public keys can be derived
- do not log or transmit this in production systems

## Full runnable file

A complete script is available at:

- `examples/getting-started-asset-flow.mjs`

The script runs the full flow by default, including faucet funding and asset transfer steps.

Docs subpage:

- [Full Getting Started File](./getting-started-full-example)

## Practical lifecycle checklist

1. Generate/restore mnemonic
2. Initialize wallet
3. Fund with test BTC (UTEXO signet environment)
4. `createUtxos(...)`
5. `issueAssetNia(...)`
6. Receiver creates invoice (`blindReceive(...)` or `witnessReceive(...)`)
7. Sender calls `send(...)` (with `witnessData` for witness invoices)
8. `refreshWallet()` and check transfers/balances
9. Backup (`createBackup` or `vssBackup`)
