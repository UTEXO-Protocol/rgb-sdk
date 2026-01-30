# Migration Guide: rgb-sdk to @utexo/rgb-sdk

This guide explains how to migrate from the `rgb-sdk` package to `@utexo/rgb-sdk`. The new package uses local `rgb-lib` instead of requiring an RGB Node server.

## 🔐 Privacy Recommendation (Important)

If you are migrating from `rgb-sdk` to `@utexo/rgb-sdk` or from `@utexo/wdk-wallet-rgb v1` to `@utexo/wdk-wallet-rgb v2`, it is important to understand the privacy implications of the legacy architecture.

Version 1 relied on an RGB Node server, which means that wallet metadata (such as extended public keys and transaction graph information) may have been exposed to the node operator. This exposure is permanent and cannot be reversed by upgrading software alone.

## Recommended approach (if privacy matters)

If wallet privacy is important to you, we strongly recommend:
Creating a brand new wallet with a new seed phrase in `@utexo/wdk-wallet-rgb v2` or `@utexo/rgb-sdk`
Migrating assets from the old wallet to the new wallet using standard RGB transfers
Discontinuing use of the old seed phrase and xpubs

This is the only way to fully eliminate historical metadata exposure.

## Alternative (state migration)
The migration steps below restore wallet state using the same seed phrase and preserve balances and history. This approach is safe from a funds perspective, but it does not remove prior privacy exposure.

Choose the approach that best matches your threat model.

## Overview

`@utexo/rgb-sdk` uses `rgb-lib` directly, eliminating the need for an RGB Node server. All wallet data is now stored locally. To migrate, you need to:

1. Create a backup of your wallet state using `rgb-sdk`
2. Restore the backup using `@utexo/rgb-sdk` to a local directory
3. Initialize your wallet in `@utexo/rgb-sdk` pointing to the restored directory

## Step 1: Backup Wallet State

First, create a backup of your wallet state using `rgb-sdk`:

```javascript
const { WalletManager } = require('rgb-sdk');

const wallet = new WalletManager({
    xpub_van: keys.account_xpub_vanilla,
    xpub_col: keys.account_xpub_colored,
    master_fingerprint: keys.master_fingerprint,
    mnemonic: keys.mnemonic,
    network: 'testnet',
    rgb_node_endpoint: 'http://127.0.0.1:8000' // RGB Node endpoint
});

// Create backup
const backupPassword = 'rgb-demo-password';
const backupResponse = await wallet.createBackup(backupPassword);

// backupResponse structure:
// {
//   message: string;
//   download_url: string;
// }

// Download and save the backup file
const fs = require('fs');
const https = require('https');
const path = require('path');

const backupDir = './data';
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

const backupFilePath = path.join(backupDir, 'wallet.backup');

// Download backup from download_url
const file = fs.createWriteStream(backupFilePath);
https.get(backupResponse.download_url, (response) => {
    response.pipe(file);
    file.on('finish', () => {
        file.close();
        console.log('Backup saved to:', backupFilePath);
    });
});
```

**Important**: Save the backup file securely.

## Step 2: Restore Wallet

Restore the backup using `@utexo/rgb-sdk`:

```javascript
const { WalletManager, restoreFromBackup } = require('@utexo/rgb-sdk');
const path = require('path');

const backupFilePath = './data/wallet.backup';
const password = 'rgb-demo-password';
const dataDir = path.resolve('./restored-wallet');

// Ensure restore directory exists
const fs = require('fs');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Restore wallet from backup
// This must be called BEFORE creating the WalletManager instance
const responseMsg = restoreFromBackup({
    backupFilePath,
    password,
    dataDir
});

console.log(responseMsg.message);
```

## Step 3: Initialize Wallet

After restoring, create your wallet instance pointing to the restored directory:

```javascript
// Note: Property names changed from snake_case to camelCase in v2
const walletV2 = new WalletManager({
    xpubVan: keys.accountXpubVanilla,        // was: xpub_van
    xpubCol: keys.accountXpubColored,        // was: xpub_col
    masterFingerprint: keys.masterFingerprint, // was: master_fingerprint
    mnemonic: keys.mnemonic,
    network: 'testnet',
    dataDir: './restored-wallet',            // Point to restored directory
    transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
    indexerUrl: 'ssl://electrum.iriswallet.com:50013'
});

// Register wallet (now synchronous in v2)
const { address } = walletV2.registerWallet();
console.log('Wallet address:', address);

// Your RGB state is now stored locally!
```

## Complete Migration Example

Here's a complete example showing the full migration process:

```javascript
const { WalletManager, restoreFromBackup } = require('@utexo/rgb-sdk');
const fs = require('fs');
const path = require('path');
const https = require('https');

async function migrateFromRgbSdkToUtexo() {
    // ============================================
    // STEP 1: Backup using rgb-sdk (run this first)
    // ============================================
    console.log('Step 1: Creating backup using rgb-sdk...');
    
    // Use rgb-sdk for this step
    const { WalletManager: WalletManagerOld } = require('rgb-sdk');
    
    const walletOld = new WalletManagerOld({
        xpub_van: keys.account_xpub_vanilla,
        xpub_col: keys.account_xpub_colored,
        master_fingerprint: keys.master_fingerprint,
        mnemonic: keys.mnemonic,
        network: 'testnet',
        rgb_node_endpoint: 'http://127.0.0.1:8000'
    });
    
    const backupPassword = 'rgb-demo-password';
    const backupResponse = await walletOld.createBackup(backupPassword);
    
    // Save backup file
    const backupDir = './data';
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupFilePath = path.join(backupDir, 'wallet.backup');
    
    // Download backup
    await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(backupFilePath);
        https.get(backupResponse.download_url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', reject);
    });
    
    console.log('Backup saved to:', backupFilePath);
    
    // ============================================
    // STEP 2: Restore using @utexo/rgb-sdk
    // ============================================
    console.log('Step 2: Restoring backup using @utexo/rgb-sdk...');
    
    const dataDir = path.resolve('./restored-wallet');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    restoreFromBackup({
        backupFilePath,
        password: backupPassword,
        dataDir
    });
    
    console.log('Wallet restored to:', dataDir);
    
    // ============================================
    // STEP 3: Initialize wallet using @utexo/rgb-sdk
    // ============================================
    console.log('Step 3: Initializing wallet using @utexo/rgb-sdk...');
    
    const wallet = new WalletManager({
        xpubVan: keys.accountXpubVanilla,
        xpubCol: keys.accountXpubColored,
        masterFingerprint: keys.masterFingerprint,
        mnemonic: keys.mnemonic,
        network: 'testnet',
        dataDir: dataDir,
        transportEndpoint: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
        indexerUrl: 'ssl://electrum.iriswallet.com:50013'
    });
    
    // Register wallet (synchronous)
    const { address, btcBalance } = wallet.registerWallet();
    console.log('Wallet address:', address);
    console.log('BTC Balance:', btcBalance);
    
    // List assets (synchronous)
    const assets = wallet.listAssets();
    console.log('Assets:', assets);
    
    console.log('Migration complete! Your RGB state is now stored locally.');
}

migrateFromRgbSdkToUtexo().catch(console.error);
```

## Key Changes Summary

### Breaking Changes

1. **Package Name**: Changed from `rgb-sdk` to `@utexo/rgb-sdk`

2. **Property Names**: Changed from `snake_case` to `camelCase`:
   - `xpub_van` → `xpubVan`
   - `xpub_col` → `xpubCol`
   - `master_fingerprint` → `masterFingerprint`
   - `rgb_node_endpoint` → removed (no longer needed)

3. **Method Signatures**: Many methods are now synchronous:
   - `registerWallet()` - no longer async
   - `getBtcBalance()` - no longer async
   - `listAssets()` - no longer async
   - `listTransactions()` - no longer async
   - `listTransfers()` - no longer async

4. **Backup/Restore**:
   - `createBackup()` now requires `backupPath` parameter
   - `restoreFromBackup()` is now a top-level function (must be called before creating wallet)
   - Backup filename automatically includes master fingerprint

5. **New Required Parameters**:
   - `transportEndpoint` - RGB transport endpoint
   - `indexerUrl` - Bitcoin indexer URL
   - `dataDir` - Local directory for wallet data (optional, defaults to temp directory)

### What Stays the Same

- Wallet keys (mnemonic, xpubs, master fingerprint) remain the same
- Asset balances and transfer history are preserved
- All RGB assets and allocations are maintained

## Troubleshooting

### Backup file not found
- Ensure you've downloaded the backup file from the `download_url` when using `rgb-sdk`
- Verify the file path is correct

### Restore directory doesn't exist
- Create the directory before calling `restoreFromBackup()`
- Ensure you have write permissions to the directory

### Wallet not found after restore
- Verify the `dataDir` in `WalletManager` matches the `dataDir` used in `restoreFromBackup()`
- Check that the restore completed successfully

## Next Steps

After migration:

1. Test your wallet by checking balances and listing assets
2. Verify all your RGB assets are present
3. Test a transfer to ensure everything works correctly
4. Remove the old RGB Node server dependency if no longer needed

For more information, see the [README.md](./Readme.md) and [CHANGELOG.md](./CHANGELOG.md).

