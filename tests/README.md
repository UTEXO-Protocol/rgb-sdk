# Test Suite

This directory contains unit tests for the SDK. Run from repo root after `npm run build`.

## Running Tests

```bash
npm test
```

Integration suites:

```bash
npm run test:signet
npm run test:regtest
```

Or with watch mode:

```bash
npm run test:watch
```

## Test Files

### `keys.test.ts`

Tests for key generation and derivation:

- `generateKeys` – generates valid keys for testnet, mainnet, regtest
- `deriveKeysFromMnemonic` – derives keys from mnemonic
- `deriveKeysFromSeed` – derives keys from hex/Uint8Array seed
- `deriveKeysFromXpriv` – derives keys from xpriv
- `getXprivFromMnemonic`, `getXpubFromXpriv`
- `restoreKeys` (deprecated alias)
- Validation and error handling

### `signer.test.ts`

Tests for PSBT signing and message signing:

- `signPsbt` – signs UTXO creation and send PSBTs
- `signPsbtFromSeed` – signs using seed (hex or Uint8Array)
- `signMessage` / `verifyMessage` – Schnorr message signing
- `estimatePsbt` – fee estimation
- Validation and edge cases

### `utexo-flows.test.ts`

Structure tests for UTEXOWallet – verifies all methods exist (core, keys, balance, UTXO, assets, transfer, sync, fee, backup, signing, onchain, lightning). Does NOT require network or bridge.

### `restore.test.ts`

Unit tests for restore utilities:

- `getBackupStoreId` – returns `wallet_<fp>` format
- `prepareUtxoBackupDirs` – creates backup dirs and returns paths
- `restoreUtxoWalletFromBackup` validation – throws on missing params, invalid path, missing/mismatched backup files

### `utexo-mocked.test.ts`

Restore flow tests with mocked `restoreWallet` (uses `jest.unstable_mockModule` for ESM):

- Tests full `restoreUtxoWalletFromBackup` path with valid backup structure
- No real backup files needed – mock avoids native rgb-lib calls

### `utexo-wallet-mocked.test.ts`

UTEXOWallet tests with mocked `WalletManager` (uses `jest.unstable_mockModule` for ESM):

- Tests `getAddress`, `getBtcBalance`, `listAssets`, `listTransfers`, `listTransactions`, `listUnspents`
- Tests `getAssetBalance`, `blindReceive`, `witnessReceive`
- Tests `getXpub`, `getNetwork`
- No network or native rgb-lib – mock returns predefined responses

## Onchain and Lightning Flow Integration Tests

Full end-to-end flows require a running bridge backend and indexer. Use the examples instead:

- **Onchain flow**: `examples/onchain-flow.mjs` – `onchainReceive` → `onchainSend`
- **Lightning flow**: `examples/lightning-flow.mjs` – `createLightningInvoice` → `payLightningInvoice`

```bash
# Onchain (requires ASSET_ID, bridge, indexer)
MNEMONIC_A="..." MNEMONIC_B="..." ASSET_ID="rgb:..." AMOUNT=10 node examples/onchain-flow.mjs

# Lightning (requires ASSET_ID, bridge, indexer)
MNEMONIC_A="..." MNEMONIC_B="..." ASSET_ID="rgb:..." AMOUNT=10 node examples/lightning-flow.mjs
```

See [examples/README.md](../examples/README.md) for full documentation.

## Integration Test Suites

- `tests/signet/README.md` — current UTEXO manual/integration baseline
- `tests/regtest/README.md` — current regtest e2e baseline
