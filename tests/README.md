# Test Suite

This directory contains unit tests for the SDK. Run from repo root after `npm run build`.

## Running Tests

```bash
npm test
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

Structure tests for UTEXOWallet onchain and lightning flows:

- Verifies `onchainReceive`, `onchainSend`, `onchainSendBegin`, `onchainSendEnd`, `getOnchainSendStatus` exist
- Verifies `createLightningInvoice`, `payLightningInvoice`, `payLightningInvoiceBegin`, `payLightningInvoiceEnd`, `getLightningSendRequest`, `getLightningReceiveRequest` exist
- Does NOT require network or bridge (API shape only)

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
