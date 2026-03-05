
# @utexo/rgb-sdk Overview

This is the underlying SDK used by RGB client applications. It provides a complete set of TypeScript/Node.js bindings for managing RGB-based transfers using **rgb-protocol libraries**

> **RGB Protocol**: This SDK uses the [`rgb-lib`](https://github.com/RGB-Tools/rgb-lib) binding library to interact with the RGB protocol. All operations are performed locally, providing full control over wallet data and operations.
>
> **Migrating from rgb-sdk previuous?** If you're upgrading from RGB SDK rgb-sdk (using RGB Node server) to @utexo/rgb-sdk, see the [Migration Guide](./MIGRATION.md) for step-by-step instructions on moving your wallet state to local storage.

---

## 🧰 What You Can Do with This Library

With this SDK, developers can:

- Generate RGB invoices
- Create and manage UTXOs
- Sign PSBTs using local private keys or hardware signing flows
- Fetch asset balances, transfer status, and other RGB-related state

---

## ⚙️ Capabilities of `@utexo/rgb-sdk` (via `UTEXOWallet`)

The primary wallet class is **`UTEXOWallet`**: initialize with a mnemonic (or seed) and optional `{ network, dataDir }`, then call `await wallet.initialize()` before use. It combines standard RGB operations with UTEXO features (Lightning, on-chain deposit/withdrawal).

| Method / Function | Description |
|-------------------|-------------|
| `generateKeys(network?)` | Generate new wallet keys (mnemonic, xpubs, master fingerprint) – top-level function |
| `restoreUtxoWalletFromBackup({ backupPath, password, targetDir })` | Restore UTEXO wallet from file backup (layer1 + utexo) – top-level function |
| `restoreUtxoWalletFromVss({ mnemonic, targetDir, config?, vssServerUrl? })` | Restore UTEXO wallet from VSS cloud backup – top-level function |
| `deriveKeysFromMnemonic(network, mnemonic)` | Derive wallet keys from existing mnemonic |
| `deriveKeysFromSeed(network, seed)` | Derive wallet keys from BIP39 seed |
| `getAddress()` | Get deposit address (async) |
| `getBtcBalance()` | Get on-chain BTC balance (async) |
| `getXpub()` | Get vanilla and colored xpubs |
| `getNetwork()` | Get current network |
| `listUnspents()` | List unspent UTXOs |
| `listAssets()` | List RGB assets held |
| `getAssetBalance(assetId)` | Get balance for a specific asset |
| `createUtxos({ num?, size?, upTo? })` | Create UTXOs (async; combines begin, sign, end; feeRate defaults to 1) |
| `createUtxosBegin({ upTo?, num?, size? })` | Start creating UTXOs (returns unsigned PSBT) |
| `createUtxosEnd({ signedPsbt, skipSync? })` | Finalize UTXO creation with signed PSBT |
| `blindReceive({ assetId, amount, minConfirmations?, durationSeconds? })` | Generate blinded UTXO for receiving |
| `witnessReceive({ assetId, amount, minConfirmations?, durationSeconds? })` | Generate witness UTXO for receiving |
| `issueAssetNia({ ticker, name, amounts, precision })` | Issue a new Non-Inflationary Asset |
| `send({ invoice, assetId, amount, witnessData? })` | Complete send (begin → sign → end; use `witnessData` for witness invoices; feeRate defaults to 1) |
| `sendBegin({ invoice, assetId, amount, witnessData?, ... })` | Prepare transfer (returns unsigned PSBT) |
| `sendEnd({ signedPsbt, skipSync? })` | Complete transfer with signed PSBT |
| `signPsbt(psbt, mnemonic?)` | Sign PSBT using wallet mnemonic (async) |
| `refreshWallet()` | Sync and refresh wallet state |
| `syncWallet()` | Trigger wallet sync |
| `listTransactions()` | List BTC-level transactions |
| `listTransfers(assetId?)` | List RGB transfer history for asset |
| `failTransfers(params)` | Mark waiting transfers as failed |
| `createBackup({ backupPath, password })` | Create encrypted backup (layer1 + utexo in one folder) |
| `vssBackup(config?, mnemonic?)` | Backup to VSS (config optional; built from mnemonic + default server URL) |
| `vssBackupInfo(config?, mnemonic?)` | Get VSS backup info |
| *On-chain* | |
| `onchainReceive(params)` | Generate invoice for depositing from mainnet to UTEXO |
| `onchainSendBegin(params)` | Start on-chain withdraw (returns unsigned PSBT) |
| `onchainSendEnd(params)` | Finalize on-chain withdraw with signed PSBT |
| `onchainSend(params, mnemonic?)` | Complete on-chain withdraw (begin → sign → end) |
| `getOnchainSendStatus(invoice)` | Get status of on-chain withdraw |
| *Lightning* | |
| `createLightningInvoice(params)` | Create Lightning invoice for receiving |
| `payLightningInvoiceBegin(params)` | Start Lightning payment (returns unsigned PSBT) |
| `payLightningInvoiceEnd(params)` | Finalize Lightning payment with signed PSBT |
| `payLightningInvoice(params, mnemonic?)` | Complete Lightning payment (begin → sign → end) |
| `getLightningSendRequest(lnInvoice)` | Get status of Lightning send |
| `getLightningReceiveRequest(lnInvoice)` | Get status of Lightning receive |
| `listLightningPayments()` | List Lightning payments |

**Examples:** [examples/](./examples/). **CLI (dev tools):** [cli/](./cli/).

```javascript
const { UTEXOWallet } = require('@utexo/rgb-sdk');

const wallet = new UTEXOWallet('your twelve word mnemonic phrase here ...', { network: 'testnet' });
await wallet.initialize();

const address = await wallet.getAddress();
const balance = await wallet.getBtcBalance();
const assets = await wallet.listAssets();
// ... onchainReceive(), onchainSend(), createLightningInvoice(), payLightningInvoice(), etc.

await wallet.dispose();
```

---

## 🧩 Notes for Custom Integration

- All RGB operations are handled locally; `RGBLibClient` wraps the native `rgb-lib` library via internal clients.
- The `signPsbt` method uses the wallet mnemonic for signing; it can be replaced with your own HSM or hardware wallet flow if needed.
- By using this SDK with `UTEXOWallet`, you have full control over:
  - Transfer orchestration (send, witnessReceive, blindReceive)
  - UTXO creation and sync
  - Invoice lifecycle
  - Wallet data storage (via `dataDir` in options)

This pattern enables advanced use cases, such as:

- Integrating with third-party identity/auth layers
- Applying custom fee logic or batching
- Implementing compliance and audit tracking
- Full local wallet management without external server dependencies

---

## Getting Started

### Prerequisites

This SDK uses `rgb-protocol libraries`. All operations are performed locally.

### Default Endpoints

The SDK uses default endpoints for RGB transport and Bitcoin indexing. These are automatically used if not specified:

**Transport Endpoint** (RGB protocol communication):

- Default: `rpcs://proxy.iriswallet.com/0.2/json-rpc`

**Indexer URLs** (Bitcoin blockchain data):

- **Mainnet**: `ssl://electrum.iriswallet.com:50003`
- **Testnet**: `ssl://electrum.iriswallet.com:50013`
- **Testnet4**: `ssl://electrum.iriswallet.com:50053`
- **Signet**: `tcp://46.224.75.237:50001`
- **Regtest**: `tcp://regtest.thunderstack.org:50001`

UTEXOWallet uses network (`testnet` / `mainnet`) that define indexer and transport endpoints internally.

### Installation

```bash
npm install @utexo/rgb-sdk
```

### Node.js only

This SDK is designed for **Node.js** and is not browser-compatible. Use it in Node.js applications, scripts, and backends.

### Basic Usage

```javascript
const { UTEXOWallet, generateKeys } = require('@utexo/rgb-sdk');

// 1. Generate wallet keys (async)
const keys = await generateKeys('testnet');
console.log('Mnemonic:', keys.mnemonic); // Store securely!

// 2. Create and initialize UTEXO wallet
const wallet = new UTEXOWallet(keys.mnemonic, { network: 'testnet' });
await wallet.initialize();

// 3. Get address and balance
const address = await wallet.getAddress();
console.log('Wallet address:', address);
const balance = await wallet.getBtcBalance();
console.log('BTC balance:', balance);

await wallet.dispose();
```

---

## Core Workflows

### Wallet Initialization

```javascript
const { UTEXOWallet, generateKeys, restoreUtxoWalletFromBackup, restoreUtxoWalletFromVss } = require('@utexo/rgb-sdk');

// Generate new wallet keys (async)
const keys = await generateKeys('testnet');

// Initialize UTEXO wallet with mnemonic
const wallet = new UTEXOWallet(keys.mnemonic, { network: 'testnet' });
await wallet.initialize();

// Optional: use dataDir for persistent storage (same layout as restore)
const walletWithDir = new UTEXOWallet(keys.mnemonic, { network: 'testnet', dataDir: './wallet-data' });
await walletWithDir.initialize();

// Restore from file backup (layer1 + utexo in one folder)
const { targetDir } = restoreUtxoWalletFromBackup({
    backupPath: './backup-folder',
    password: 'your-password',
    targetDir: './restored-wallet',
});
const restoredWallet = new UTEXOWallet(keys.mnemonic, { dataDir: targetDir, network: 'testnet' });
await restoredWallet.initialize();

// Restore from VSS (mnemonic required; vssServerUrl optional, uses default)
const { targetDir: vssDir } = await restoreUtxoWalletFromVss({
    mnemonic: keys.mnemonic,
    targetDir: './restored-from-vss',
});
const fromVss = new UTEXOWallet(keys.mnemonic, { dataDir: vssDir, network: 'testnet' });
await fromVss.initialize();
```

### UTXO Management

```javascript
// Option 1: Create UTXOs in one call (begin → sign → end)
const count = await wallet.createUtxos({ num: 5, size: 1000 });
await wallet.syncWallet();
console.log(`Created ${count} UTXOs`);

// Option 2: Begin/end flow for custom signing
const psbt = await wallet.createUtxosBegin({ num: 5, size: 1000 });
const signedPsbt = await wallet.signPsbt(psbt);
const utxosCreated = await wallet.createUtxosEnd({ signedPsbt });
await wallet.syncWallet();
```

### Asset Issuance

```javascript
// Issue a new NIA
const asset = await wallet.issueAssetNia({
    ticker: "USDT",
    name: "Tether USD",
    amounts: [1000, 500],
    precision: 6
});

console.log('Asset issued:', asset.asset?.assetId);
```

### Asset Transfers

```javascript
// Receiver: create blind or witness invoice
const receiveData = receiverWallet.blindReceive({
    assetId: assetId,
    amount: 100,
    minConfirmations: 3,
    durationSeconds: 2000
});
// For witness invoices, sender must pass witnessData when sending
const witnessData = await receiverWallet.witnessReceive({ assetId, amount: 50 });

// Sender: Option 1 – complete send in one call
const sendResult = await senderWallet.send({
    invoice: receiveData.invoice,
    assetId,
    amount: 100
});
// For witness invoice:
await senderWallet.send({
    invoice: witnessData.invoice,
    assetId,
    amount: 50,
    witnessData: { amountSat: 1000 }
});

// Sender: Option 2 – begin/end flow for custom signing
const sendPsbt = await senderWallet.sendBegin({
    invoice: receiveData.invoice,
    assetId,
    amount: 100
});
const signedSendPsbt = await senderWallet.signPsbt(sendPsbt);
await senderWallet.sendEnd({ signedPsbt: signedSendPsbt });

// Refresh both wallets and list transfers
await senderWallet.refreshWallet();
await receiverWallet.refreshWallet();
const transfers = await receiverWallet.listTransfers(assetId);
```

### On-chain receive/send

```javascript
const { UTEXOWallet } = require('@utexo/rgb-sdk');

  const sender = new UTEXOWallet("test mnemonic sender", { network: 'testnet' });
  const receiver = new UTEXOWallet("test mnemonic receiver", { network: 'testnet' });
  await sender.initialize();
  await receiver.initialize();

  // 1) Receiver: onchainReceive – create mainnet invoice for deposit
  const { invoice } = await receiver.onchainReceive({
    assetId: "rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0",
    amount: 5,
  });

  // 2) Sender: onchainSend – pay that mainnet invoice from UTEXO
  const sendResult = await sender.onchainSend({ invoice });
  console.log('Onchain send result:', sendResult);

  await receiver.refreshWallet()
  await sender.refreshWallet()

  // wait 3 confirmation blocks

  await receiver.refreshWallet()
  await sender.refreshWallet()

  const status = await receiver.getOnchainSendStatus(invoice)
  console.log(status)

```

### Lightning receive/send

```javascript
const { UTEXOWallet } = require('@utexo/rgb-sdk');

const sender = new UTEXOWallet("test mnemonic sender", { network: 'testnet' });
const receiver = new UTEXOWallet("test mnemonic receiver", { network: 'testnet' });
await sender.initialize();
await receiver.initialize();

// 1) Receiver: createLightningInvoice – create Lightning invoice for receiving
const assetId = "rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0";
const { lnInvoice } = await receiver.createLightningInvoice({
  asset: { assetId, amount: 5 },
});

// 2) Sender: payLightningInvoice – pay that Lightning invoice from UTEXO
const sendResult = await sender.payLightningInvoice({ lnInvoice, assetId, amount: 5 });
console.log('Lightning send result:', sendResult);

await receiver.refreshWallet();
await sender.refreshWallet();

const status = await sender.getLightningSendRequest(lnInvoice);
console.log(status);
```

### Balance and Asset Management

```javascript
// Get BTC balance (async)
const btcBalance = await wallet.getBtcBalance();

// List all assets
const assets = await wallet.listAssets();

// Get specific asset balance
const assetBalance = await wallet.getAssetBalance(assetId);

// List unspent UTXOs
const unspents = await wallet.listUnspents();

// List transactions
const transactions = await wallet.listTransactions();

// List transfers for specific asset
const transfers = await wallet.listTransfers(assetId);
```

---

## Setup wallet and issue asset

```javascript
const { UTEXOWallet, generateKeys } = require('@utexo/rgb-sdk');

async function demo() {
    const keys = await generateKeys('testnet');
    const wallet = new UTEXOWallet(keys.mnemonic, { network: 'testnet' });
    await wallet.initialize();

    const address = await wallet.getAddress();
    const balance = await wallet.getBtcBalance();

    // Create UTXOs and issue asset
    const count = await wallet.createUtxos({ num: 5, size: 1000 });
    await wallet.syncWallet();

    const asset = await wallet.issueAssetNia({
        ticker: 'DEMO',
        name: 'Demo Token',
        amounts: [1000],
        precision: 2
    });

    const assets = await wallet.listAssets();
    const assetBalance = await wallet.getAssetBalance(asset.assetId);

    await wallet.dispose();
}
```

---

## Security

### Key Management

```javascript
const { generateKeys, deriveKeysFromMnemonic } = require('@utexo/rgb-sdk');

// Generate new wallet keys (async)
const keys = await generateKeys('testnet');
const mnemonic = keys.mnemonic; // Sensitive - protect at rest

// Store mnemonic securely for later restoration
// Use environment variables for production
const storedMnemonic = process.env.WALLET_MNEMONIC;

// Restore keys from mnemonic
const restoredKeys = await deriveKeysFromMnemonic('testnet', storedMnemonic);

// Sign and verify arbitrary messages (Schnorr signatures)
const seedHex = process.env.WALLET_SEED_HEX; // 64-byte hex string
const { signature, accountXpub } = await signMessage({
  message: 'Hello RGB!',
  seed: seedHex,
  network: 'testnet',
});
const isValid = await verifyMessage({
  message: 'Hello RGB!',
  signature,
  accountXpub,
  network: 'testnet',
});
```

### Backup and Restore

> **Backup modes:** UTEXOWallet supports **local (file) backups** (encrypted files on disk) and **VSS backups** (state persisted to a remote Versioned Storage Service). The recommended strategy is to use VSS and invoke `vssBackup()` after any state-changing operation (e.g. UTXO creation, asset issuance, transfers) to ensure the latest state is recoverable;
>
> **Concurrency constraint:** Do **not** run restores while any wallet instance is online. At most one instance of a given wallet should ever be connected to the indexer/VSS; before calling any restore function, ensure all instances for that wallet are offline.

```javascript
const { UTEXOWallet, restoreUtxoWalletFromBackup, restoreUtxoWalletFromVss, generateKeys } = require('@utexo/rgb-sdk');

const keys = await generateKeys('testnet');
const wallet = new UTEXOWallet(keys.mnemonic, { network: 'testnet' });
await wallet.initialize();

// File backup (layer1 + utexo in one folder: wallet_<fp>_layer1.backup, wallet_<fp>_utexo.backup)
const backup = await wallet.createBackup({
    backupPath: './backups',
    password: 'secure-password'
});
console.log('Backup created:', backup.layer1BackupPath, backup.utexoBackupPath);

// Restore from file backup
const { targetDir } = restoreUtxoWalletFromBackup({
    backupPath: './backups',
    password: 'secure-password',
    targetDir: './restored-wallet'
});
const restoredWallet = new UTEXOWallet(keys.mnemonic, { dataDir: targetDir, network: 'testnet' });
await restoredWallet.initialize();

// VSS backup (config optional; built from mnemonic + DEFAULT_VSS_SERVER_URL)
await wallet.vssBackup();
// Restore from VSS
const { targetDir: vssDir } = await restoreUtxoWalletFromVss({
    mnemonic: keys.mnemonic,
    targetDir: './restored-from-vss'
});
```

---

## Full Examples

- [new-wallet](examples/new-wallet.mjs) – Generate keys and create a new UTEXO wallet
- [read-wallet](examples/read-wallet.mjs) – Initialize by mnemonic and call getXpub, getNetwork, getAddress, getBtcBalance, listAssets
- [create-utxos-asset](examples/create-utxos-asset.mjs) – Create UTXOs and issue a NIA asset
- [transfer](examples/transfer.mjs) – Two wallets: witness + blind receive, refresh, listTransfers (requires ASSET_ID and funded wallets)
- [onchain-flow](examples/onchain-flow.mjs) – On-chain transfer: receive + send
- [lightning-flow](examples/lightning-flow.mjs) – Lightning transfer: createLightningInvoice + payLightningInvoice
- [utexo-vss-backup-restore](examples/utexo-vss-backup-restore.mjs) – VSS backup and restore
- [utexo-file-backup-restore](examples/utexo-file-backup-restore.mjs) – File backup and restore

See [examples/README.md](examples/README.md) for run commands. CLI: [cli/](cli/). 
