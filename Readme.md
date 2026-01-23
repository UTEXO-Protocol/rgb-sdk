
# RGB SDK v2  Overview

This is the underlying SDK used by RGB client applications. It provides a complete set of TypeScript/Node.js bindings for managing RGB-based transfers using **rgb-protocol libraries**

> **RGB Protocol**: This SDK uses the [`rgb-lib`](https://github.com/RGB-Tools/rgb-lib) binding library to interact with the RGB protocol. All operations are performed locally, providing full control over wallet data and operations.
>
> **Migrating from v1?** If you're upgrading from RGB SDK v1 (using RGB Node server), see the [Migration Guide](./MIGRATION.md) for step-by-step instructions on moving your wallet state to local storage.

---

## 🧰 What You Can Do with This Library

With this SDK, developers can:

- Generate RGB invoices
- Create and manage UTXOs
- Sign PSBTs using local private keys or hardware signing flows
- Fetch asset balances, transfer status, and other RGB-related state

---

## ⚙️ Capabilities of `@utexo/rgb-sdk` (via `WalletManager`)

| Method | Description |
|--------|-------------|
| `generateKeys(network?)` | Generate new wallet keys (mnemonic, xpubs, master fingerprint) - top-level function |
| `restoreFromBackup(params)` | High-level function to restore wallet from backup - top-level function |
| `deriveKeysFromMnemonic(network, mnemonic)` | Derive wallet keys (xpub/xpriv) from existing mnemonic |
| `deriveKeysFromSeed(network, seed)` | Derive wallet keys (xpub/xpriv) directly from a BIP39 seed |
| `registerWallet()` | Register wallet (synchronous) |
| `getBtcBalance()` | Get on-chain BTC balance (synchronous) |
| `getAddress()` | Get a derived deposit address (synchronous) |
| `listUnspents()` | List unspent UTXOs |
| `listAssets()` | List RGB assets held (synchronous) |
| `getAssetBalance(assetId)` | Get balance for a specific asset |
| `createUtxosBegin({ upTo, num, size, feeRate })` | Start creating new UTXOs |
| `createUtxosEnd({ signedPsbt, skipSync? })` | Finalize UTXO creation with a signed PSBT |
| `blindReceive({ assetId, amount, minConfirmations?, durationSeconds? })` | Generate blinded UTXO for receiving |
| `witnessReceive({ assetId, amount, minConfirmations?, durationSeconds? })` | Generate witness UTXO for receiving |
| `issueAssetNia({...})` | Issue a new Non-Inflationary Asset |
| `signPsbt(psbt, mnemonic?)` | Sign PSBT using mnemonic and BDK (async) |
| `signMessage(message, options?)` | Produce a Schnorr signature for an arbitrary message |
| `verifyMessage(message, signature, options?)` | Verify Schnorr message signatures using wallet keys or provided public key |
| `refreshWallet()` | Sync and refresh wallet state |
| `syncWallet()` | Trigger wallet sync without additional refresh logic |
| `listTransactions()` | List BTC-level transactions (synchronous) |
| `listTransfers(assetId?)` | List RGB transfer history for asset (synchronous) |
| `failTransfers(params)` | Mark waiting transfers as failed |
| `deleteTransfers(params)` | Delete transfers from wallet |
| `sendBegin(...)` | Prepare a transfer (build unsigned PSBT) |
| `sendEnd({ signedPsbt, skipSync? })` | Submit signed PSBT to complete transfer |
| `sendBtcBegin(params)` | Begin Bitcoin send operation (returns PSBT) |
| `sendBtcEnd(params)` | Complete Bitcoin send operation with signed PSBT |
| `send(...)` | Complete send operation: begin → sign → end |
| `createBackup({ backupPath, password })` | Create an encrypted wallet backup (backupPath required, filename includes master fingerprint) |
| `restoreFromBackup({ backupFilePath, password, dataDir })` | Restore wallet state from a backup file (top-level function, call before creating wallet) |

---

## 🧩 Notes for Custom Integration

- All RGB operations are handled locally using the `RGBLibClient` class, which wraps the native `rgb-lib` library.
- The `signPsbt` method demonstrates how to integrate a signing flow using `bdk-wasm`. This can be replaced with your own HSM or hardware wallet integration if needed.
- By using this SDK, developers have full control over:
  - Transfer orchestration
  - UTXO selection
  - Invoice lifecycle
  - Signing policy
  - Wallet data storage (via `dataDir` parameter)

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

These defaults can be overridden by providing `transportEndpoint` and `indexerUrl` parameters when initializing `WalletManager`.

### Installation

```bash
npm install @utexo/rgb-sdk
```

### Browser Compatibility

This SDK is browser-compatible but requires polyfills for Node.js built-in modules. The SDK uses WebAssembly modules and dynamically loads dependencies based on the environment.

#### Required Polyfills

For React/Next.js applications, you'll need to configure webpack to polyfill Node.js modules. Install the required polyfills:

```bash
npm install --save-dev crypto-browserify stream-browserify buffer process path-browserify
```

#### CRACO Configuration (React with Create React App)

If you're using Create React App with CRACO, create a `craco.config.js` file:

```javascript
const path = require('path');
const webpack = require('webpack');

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src/"),
    },
    configure: (webpackConfig) => {
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback || {}),
        crypto: require.resolve('crypto-browserify'),
        'node:crypto': require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer'),
        process: require.resolve('process/browser'),
        path: require.resolve('path-browserify'),
        'node:path': require.resolve('path-browserify'),
        fs: false,
        module: false,
      };

      // WASM rule for .wasm files
      const wasmRule = { test: /\.wasm$/, type: 'webassembly/sync' };
      const oneOf = webpackConfig.module?.rules?.find(r => Array.isArray(r.oneOf))?.oneOf;
      if (oneOf) {
        const assetIdx = oneOf.findIndex(r => r.type === 'asset/resource');
        if (assetIdx >= 0) oneOf.splice(assetIdx, 0, wasmRule);
        else oneOf.unshift(wasmRule);
      } else {
        webpackConfig.module = webpackConfig.module || {};
        webpackConfig.module.rules = [wasmRule, ...(webpackConfig.module.rules || [])];
      }

      webpackConfig.experiments = {
        ...webpackConfig.experiments,
        asyncWebAssembly: true,
        topLevelAwait: true,
        syncWebAssembly: true,
        layers: true,
      };

      webpackConfig.plugins = (webpackConfig.plugins || []).concat([
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: ['process'],
        }),
      ]);

      return webpackConfig;
    },
  },
};
```

#### Dynamic Import in Browser

Use dynamic import to ensure WASM modules load correctly in browser environments:

```javascript
// Dynamic import ensures the WASM/glue load together
const sdk = await import('@utexo/rgb-sdk');

const { WalletManager, generateKeys } = sdk;

// Use the SDK normally
const keys = generateKeys('testnet');
const wallet = new WalletManager({
  xpubVan: keys.accountXpubVanilla,
  xpubCol: keys.accountXpubColored,
  masterFingerprint: keys.masterFingerprint,
  mnemonic: keys.mnemonic,
  network: 'testnet',
  transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
  indexerUrl: 'ssl://electrum.iriswallet.com:50013'
});
```

### Important: WASM Module Support

This SDK uses WebAssembly modules for cryptographic operations. When running scripts, you may need to use the `--experimental-wasm-modules` flag:

```bash
node --experimental-wasm-modules your-script.js
```

**Note**: All npm scripts in this project already include this flag automatically. For browser environments, see the Browser Compatibility section above.

### Basic Usage

```javascript
const { WalletManager, generateKeys } = require('@utexo/rgb-sdk');

// 1. Generate wallet keys (synchronous)
const keys = generateKeys('testnet');
console.log('Master Fingerprint:', keys.masterFingerprint);
console.log('Mnemonic:', keys.mnemonic); // Store securely!

// 2. Initialize wallet (constructor-based)
const wallet = new WalletManager({
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
    mnemonic: keys.mnemonic,
    network: 'testnet',
    transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
    indexerUrl: 'ssl://electrum.iriswallet.com:50013',
    dataDir: './wallet-data' // Optional: defaults to temp directory
});

// 3. Register wallet (synchronous)
const { address } = wallet.registerWallet();
console.log('Wallet address:', address);

// 4. Check balance (synchronous)
const balance = wallet.getBtcBalance();
console.log('BTC Balance:', balance);
```

---

## Core Workflows

### Wallet Initialization

```javascript
const { WalletManager, generateKeys, restoreFromBackup } = require('@utexo/rgb-sdk');

// Generate new wallet keys (synchronous)
const keys = generateKeys('testnet');

// Initialize wallet with keys (constructor-based - recommended)
const wallet = new WalletManager({
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
    mnemonic: keys.mnemonic,
    network: 'testnet', // 'mainnet', 'testnet', 'signet', or 'regtest'
    transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
    indexerUrl: 'ssl://electrum.iriswallet.com:50013',
    dataDir: './wallet-data' // Optional: defaults to temp directory
});

// Register wallet (synchronous)
wallet.registerWallet();

// Alternative: Restore wallet from backup (must be called before creating wallet)
restoreFromBackup({
    backupFilePath: './backup/abc123.backup',
    password: 'your-password',
    dataDir: './restored-wallet-data'
});

// Then create wallet pointing to restored directory
const restoredWallet = new WalletManager({
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
    mnemonic: keys.mnemonic,
    network: 'testnet',
    dataDir: './restored-wallet-data' // Point to restored directory
});
```

### UTXO Management

```javascript
// Step 1: Begin UTXO creation
const psbt = wallet.createUtxosBegin({
    upTo: true,
    num: 5,
    size: 1000,
    feeRate: 1
});

// Step 2: Sign the PSBT (async operation)
const signedPsbt = await wallet.signPsbt(psbt);

// Step 3: Finalize UTXO creation
const utxosCreated = wallet.createUtxosEnd({ signedPsbt });
console.log(`Created ${utxosCreated} UTXOs`);
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
// Create blind receive for receiving wallet
const receiveData = receiverWallet.blindReceive({
    assetId: assetId,
    amount: 100,
    minConfirmations: 3, // Optional, default: 3
    durationSeconds: 2000 // Optional, default: 2000
});

// Step 1: Begin asset transfer
const sendPsbt = senderWallet.sendBegin({
    invoice: receiveData.invoice,
    feeRate: 1,
    minConfirmations: 1
});

// Step 2: Sign the PSBT (async operation)
const signedSendPsbt = await senderWallet.signPsbt(sendPsbt);

// Step 3: Finalize transfer
const sendResult = senderWallet.sendEnd({ 
    signedPsbt: signedSendPsbt,
    skipSync: false // Optional, default: false
});

// Alternative: Complete send in one call
const sendResult2 = await senderWallet.send({
    invoice: receiveData.invoice,
    feeRate: 1,
    minConfirmations: 1
});

// Refresh both wallets to sync the transfer
senderWallet.refreshWallet();
receiverWallet.refreshWallet();
```

### Balance and Asset Management

```javascript
// Get BTC balance (synchronous)
const btcBalance = wallet.getBtcBalance();

// List all assets (synchronous)
const assets = wallet.listAssets();

// Get specific asset balance
const assetBalance = wallet.getAssetBalance(assetId);

// List unspent UTXOs
const unspents = wallet.listUnspents();

// List transactions (synchronous)
const transactions = wallet.listTransactions();

// List transfers for specific asset (synchronous)
const transfers = wallet.listTransfers(assetId);
```

---

## Setup wallet and issue asset

```javascript
const { WalletManager, generateKeys } = require('@utexo/rgb-sdk');

async function demo() {
    // 1. Generate and initialize wallet
    const keys = generateKeys('testnet');
    const wallet = new WalletManager({
        xpubVan: keys.accountXpubVanilla,
        xpubCol: keys.accountXpubColored,
        masterFingerprint: keys.masterFingerprint,
        mnemonic: keys.mnemonic,
        network: 'testnet',
        transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
        indexerUrl: 'ssl://electrum.iriswallet.com:50013'
    });

    // 2. Register wallet (synchronous)
    const { address } = wallet.registerWallet();

    // TODO: Send some BTC to this address for fees and UTXO creation
    const balance = wallet.getBtcBalance();

    // 4. Create UTXOs 
    const psbt = wallet.createUtxosBegin({
        upTo: true,
        num: 5,
        size: 1000,
        feeRate: 1
    });
    const signedPsbt = await wallet.signPsbt(psbt); // Async operation
    const utxosCreated = wallet.createUtxosEnd({ signedPsbt });

    // 5. Issue asset
    const asset = await wallet.issueAssetNia({
        ticker: "DEMO",
        name: "Demo Token",
        amounts: [1000],
        precision: 2
    });

    // 6. List assets and balances (synchronous)
    const assets = wallet.listAssets();
    const assetBalance = wallet.getAssetBalance(asset.asset?.assetId);

    // Wallet is ready to send/receive RGB assets
}
```

---

## Security

### Key Management

```javascript
const { generateKeys, deriveKeysFromMnemonic } = require('@utexo/rgb-sdk');

// Generate new wallet keys (synchronous)
const keys = generateKeys('testnet');
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

```javascript
const { WalletManager, restoreFromBackup, generateKeys } = require('@utexo/rgb-sdk');

// Create backup
const keys = generateKeys('testnet');
const wallet = new WalletManager({
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
    mnemonic: keys.mnemonic,
    network: 'testnet'
});

// Create backup (filename will be <masterFingerprint>.backup)
const backup = wallet.createBackup({
    backupPath: './backups', // Directory must exist
    password: 'secure-password'
});
console.log('Backup created at:', backup.backupPath);

// Restore wallet from backup (must be called before creating wallet)
restoreFromBackup({
    backupFilePath: './backups/abc123.backup',
    password: 'secure-password',
    dataDir: './restored-wallet'
});

// Create wallet pointing to restored directory
const restoredWallet = new WalletManager({
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    masterFingerprint: keys.masterFingerprint,
    mnemonic: keys.mnemonic,
    network: 'testnet',
    dataDir: './restored-wallet'
});
```

---

## Full Examples

For complete working examples demonstrating all features, see:

- `example-flow.js` - Complete RGB wallet workflow with two wallets, asset issuance, and transfers
- `example-basic-usage.js` - Basic wallet operations and asset management
