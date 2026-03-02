# UTEXOWallet examples

Run from repo root after `npm run build`.

## Create a new wallet

- **`new-wallet.mjs`** – Generate new keys and create a UTEXOWallet.
  - Calls `generateKeys(network)` to get a new mnemonic, then `new UTEXOWallet(mnemonic, { network })`, `initialize()`, and prints address + balance.
  - Reminds to back up the mnemonic.

```bash
node examples/new-wallet.mjs
```

## Create UTXOs and issue NIA asset

- **`create-utxos-asset.mjs`** – Create UTXOs and issue a NIA asset.
  - Calls `createUtxos({ num, size })` then `issueAssetNia({ ticker, name, amounts, precision })`.
  - Only `MNEMONIC` can be passed (env); createUtxos and NIA params are fixed in script. Requires indexer/network.

```bash
node examples/create-utxos-asset.mjs
MNEMONIC="your mnemonic" node examples/create-utxos-asset.mjs
```

## Read wallet

- **`read-wallet.mjs`** – Initialize by mnemonic and call read-only functions.
  - getXpub, getNetwork, getAddress (no indexer); getBtcBalance, listAssets (require indexer).
  - Set `MNEMONIC` env to use your own wallet.

```bash
node examples/read-wallet.mjs
MNEMONIC="your mnemonic" node examples/read-wallet.mjs
```

## Transfer (2 wallets, witness + blind receive)

- **`transfer.mjs`** – Two wallets (2 mnemonics): 1 witness receive + 1 blind receive, refresh, listTransfers. Assumes UTXOs and asset already exist (e.g. from create-utxos-asset.mjs); wallets must be funded.
  - Env: `ASSET_ID` (required), `MNEMONIC_A`, `MNEMONIC_B` (optional). Requires indexer/network.

```bash
ASSET_ID="rgb:..." node examples/transfer.mjs
ASSET_ID="rgb:..." MNEMONIC_A="..." MNEMONIC_B="..." node examples/transfer.mjs
```

## On-chain bridge (receive + send)

- **`onchain-flow.mjs`** – Two wallets (2 mnemonics): Wallet B calls `onchainReceive` to obtain a mainnet invoice; Wallet A calls `onchainSend` to pay that invoice from UTEXO.
  - Env: `ASSET_ID` (required), `MNEMONIC_A`, `MNEMONIC_B` (optional), `AMOUNT` (optional; default 10). Requires bridge backend + indexer/network.

```bash
MNEMONIC_A="..." MNEMONIC_B="..." ASSET_ID="rgb:..." AMOUNT=10 node examples/onchain-flow.mjs
```

## VSS backup and restore

- **`utexo-vss-backup-restore.mjs`** – VSS only (no file backup).
  - Backup: wallet with `vssServerUrl` → `vssBackup()` / `vssBackupInfo()`.
  - Restore: `restoreUtxoWalletFromVss({ mnemonic, targetDir, vssServerUrl })` → wallet with `dataDir`.
  - Toggle: set `runRestore = true` to run restore instead of backup.

```bash
node examples/utexo-vss-backup-restore.mjs
```

## File backup and restore

- **`utexo-file-backup-restore.mjs`** – Regular file backup only (no VSS).
  - Backup: wallet → `createBackup({ backupPath, password })` (one folder: `wallet_<fp>_layer1.backup`, `wallet_<fp>_utexo.backup`).
  - Restore: `restoreUtxoWalletFromBackup({ backupPath, password, targetDir })` → wallet with `dataDir`.
  - Toggle: set `runRestore = true` to run restore instead of backup.

```bash
node examples/utexo-file-backup-restore.mjs
```
