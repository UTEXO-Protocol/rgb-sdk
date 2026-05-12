# Usage

This page is a practical API reference for `@utexo/rgb-sdk` with deep parameter details: expected format, units, optional behavior, and when to use each field.

## Common Parameter Semantics

These fields appear in multiple methods and follow the same meaning.

### `minConfirmations`

- **Type:** integer (`u8` in underlying rgb-lib binding)
- **Meaning:** minimum Bitcoin confirmation depth required when selecting/accepting UTXOs for the operation.
- **Where used:** receive (`blindReceive`, `witnessReceive`) and send flows.
- **Practical effect:** higher value increases safety/finality threshold, lower value increases speed.
- **If omitted:** SDK forwards no explicit override and rgb-lib default behavior applies.

### `durationSeconds`

- **Type:** optional integer (`u32` in underlying rgb-lib binding)
- **Meaning:** invoice validity window in seconds (expiry horizon).
- **Where used:** receive invoice generation (`blindReceive`, `witnessReceive`).
- **Practical effect:** after expiry, sender may no longer be able to complete payment against that invoice.
- **If omitted:** SDK forwards no explicit override and rgb-lib default expiry behavior applies.

### `feeRate`

- **Type:** number (sat/vbyte)
- **Meaning:** miner fee rate used to build Bitcoin transactions (UTXO creation/send).
- **Practical effect:** higher fee rate usually confirms faster.

### `skipSync`

- **Type:** boolean
- **Meaning:** skip automatic sync step after operation finalization.
- **Use when:** caller orchestrates explicit `syncWallet()`/`refreshWallet()` manually.

### `amount` and `amountSat`

- `amount`: RGB asset amount in asset base units (respect `precision`).
- `amountSat`: Bitcoin satoshi amount used in witness-data binding.

### `upTo`

- **Type:** boolean
- **Meaning:** UTXO top-up mode; create only enough new UTXOs to reach target shape/count.

## Utility Functions

### `generateKeys(network?)`

Generates a new wallet identity from a fresh mnemonic.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| `network` | `string \| number` | Bitcoin network namespace used for derivation and version bytes. Common values: `mainnet`, `testnet`, `testnet4`, `signet`, `regtest`, `utexo`. |

**Returns:** `Promise<GeneratedKeys>`

`GeneratedKeys` contains:

- `mnemonic` (BIP39 seed phrase)
- `xpriv` (extended private key)
- `xpub` (master extended public key)
- `accountXpubVanilla` (BTC path)
- `accountXpubColored` (RGB path)
- `masterFingerprint` (wallet identifier)

### `deriveKeysFromMnemonic(network, mnemonic)`

Derives wallet keys from an existing BIP39 mnemonic.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| `network` | `string \| number` | Network namespace used for derivation versions and coin type mapping. |
| `mnemonic` | `string` | 12/24-word BIP39 phrase. Words must be valid in order and checksum must pass. |

**Returns:** `Promise<GeneratedKeys>`

### `deriveKeysFromSeed(network, seed)`

Derives wallet keys directly from a BIP39 seed.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| `network` | `string \| number` | Network used for descriptor and xpub version mapping. |
| `seed` | `string \| Uint8Array` | Raw BIP39 seed as bytes or hex string (no `0x` prefix expected). |

**Returns:** `Promise<GeneratedKeys>`

### `deriveKeysFromMnemonicOrSeed(network, mnemonicOrSeed)`

Derives keys by auto-detecting whether input is mnemonic or seed.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| `network` | `string \| number` | Network used for derivation. |
| `mnemonicOrSeed` | `string \| Uint8Array` | Auto-detected input: mnemonic phrase, hex seed string, or raw seed bytes. |

**Returns:** `Promise<GeneratedKeys>`

### `restoreKeys(network, mnemonic)` (legacy alias)

Backward-compatible alias for `deriveKeysFromMnemonic`.

### `signPsbt(psbt, mnemonic?)`

Signs a PSBT using wallet mnemonic (or explicit mnemonic override).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| `psbt` | `string` | Base64 PSBT string. Must be valid for the wallet/network derivation scheme. |
| `mnemonic` | `string` | Optional override; if omitted, wallet/default mnemonic context is used. |

**Returns:** `Promise<string>` (signed PSBT)

### `getXprivFromMnemonic(network, mnemonic)`

Converts mnemonic to extended private key (`xpriv`/`tprv`) for the selected network.

| Name | Type | Description |
| --- | --- | --- |
| `network` | `string \| number` | Network controls version bytes in resulting key encoding. |
| `mnemonic` | `string` | Valid BIP39 mnemonic. |

**Returns:** `Promise<string>`

---

## `UTEXOWallet` Constructor

```ts
new UTEXOWallet(mnemonicOrSeed, options?)
```

### `mnemonicOrSeed`

- `string`: mnemonic phrase
- `Uint8Array`: seed bytes

### `options` (`ConfigOptions`)

| Field | Type | Description |
| --- | --- | --- |
| `network` | `'mainnet' \| 'testnet'` | Chooses UTEXO preset mapping for layer1/utexo routing and bridge network IDs. |
| `dataDir` | `string` | Base directory for persisted wallet data. SDK stores wallets under network/fingerprint structure. |
| `vssServerUrl` | `string` | Optional VSS server override used by default VSS config helpers. |
| `reuseAddresses` | `boolean` | **`true`** = **`getAddress()`** keeps reusing the **same** receive string for **`UTEXOWallet`’s UTEXO / RGB deposit path**. Omit or **`false`** = **`getAddress()`** usually yields a **new** address each time (**privacy default**). Does **not** apply to **`UTEXOWallet`’s plain-Bitcoin-route receives**. |

Notes:

- `mnemonicOrSeed` can be mnemonic string or seed bytes.
- Always call `await wallet.initialize()` before using wallet methods.

---

## Wallet Lifecycle Methods

### `initialize()`

Initializes internal **layer1** and **UTEXO** rgb-lib wallet state behind **`UTEXOWallet`**.

### `dispose()`

Releases wallet resources and closes underlying clients.

### `refreshWallet()`

Refreshes wallet state and transfer statuses.

Use after send/receive operations to pull latest transfer progression on both counterparties.

During sender/receiver flow:

- call on **sender** after send to update outbound transfer status
- call on **receiver** to ingest/advance inbound transfer status
- repeat until status reaches `Settled`/`Failed`

Relationship with `syncWallet()`:

- `syncWallet()` is chain/indexer state
- `refreshWallet()` is RGB transfer lifecycle progression
- in real payment flow, you often use both

### `syncWallet()`

Runs indexer synchronization for current wallet state.

Use when you mainly need UTXO/transaction state refresh.

Typical use:

- right after faucet funding
- after UTXO creation
- before operations that depend on spendable BTC

---

## Read Methods

### `getAddress()`

Returns a receive address for the wallet context.

Without **`reuseAddresses`**, **`getAddress()`** typically steps to a **new** derivation each time (**default**). With **`reuseAddresses: true`**, it **reuses** one address for **`getAddress()`** calls on the **UTXO / RGB-facing** side of **`UTEXOWallet`** until you call **`rotateVanillaAddress()`** or **`rotateColoredAddress()`**.

### `rotateVanillaAddress()`

Async. Advances the **vanilla (BTC)** receive keychain and returns the new address.

### `rotateColoredAddress()`

Async. Advances the **colored (RGB)** receive keychain and returns the new address.

### `getBtcBalance()`

Returns BTC balances split by wallet type:

- `vanilla` (regular BTC path)
- `colored` (RGB-related path)

Each includes:

- `settled` (confirmed)
- `future` (pending expected)
- `spendable` (currently selectable)

### `listUnspents()`

Lists UTXOs with RGB allocations.

### `listAssets()`

Lists known RGB assets grouped by schema.

### `getAssetBalance(assetId)`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| `assetId` | `string` | Canonical RGB asset id string (for example `rgb:...`). |

Returns settled/future/spendable balances for the asset.

### `listTransactions()`

Lists BTC transaction history.

### `listTransfers(assetId?)`

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| `assetId` | `string` | Optional filter for one asset; omit to fetch all transfer records. |

Lists RGB transfer history.

---

## Issuance Methods

### `issueAssetNia(params)`

Issues a non-inflationary RGB asset.

**Parameters** (`IssueAssetNiaRequestModel`)

| Field | Type | Description |
| --- | --- | --- |
| `ticker` | `string` | Short symbol (for example `USDT`). Keep stable for integrations/UI. |
| `name` | `string` | Full asset display name. |
| `amounts` | `number[]` | Issuance chunks. Each number is an on-chain RGB allocation unit. |
| `precision` | `number` | Decimal places for display conversion (token units). |

Guidance:

- Use integer `amounts`; represent fractions via `precision`.
- Example: with `precision: 6`, `1_000_000` base units = `1.000000` token.

---

## Receive Methods

### `blindReceive(params)`

Creates a **blinded invoice** for RGB receive.

How it works:

- receiver creates blinded recipient data
- invoice can be shared with sender without exposing a plain receive address model
- sender can pay using standard `send(...)`

### `witnessReceive(params)`

Creates a **witness invoice** for RGB receive.

How it works:

- receiver requests witness-based receive binding
- sender must include `witnessData` when calling `send(...)`
- typical minimum is `witnessData.amountSat`

**Parameters for both** (`InvoiceRequest`)

| Field | Type | Description |
| --- | --- | --- |
| `assetId` | `string` | Asset to receive. Omit only when designing broad/agnostic invoice flows. |
| `amount` | `number` | Requested amount in asset base units. Omit for amount-agnostic request. |
| `minConfirmations` | `number` | Minimum confirmations required before transfer is treated as confirmed. |
| `durationSeconds` | `number` | Invoice lifetime in seconds before expiry handling applies. |

Defaults:

- optional parameter defaults are inherited from rgb-lib behavior in the SDK core layer
- if not provided, SDK forwards request without overriding those defaults
- see `Common Parameter Semantics` for exact interpretation of `minConfirmations` and `durationSeconds`

When to use:

- `blindReceive`: standard private RGB receive flow.
- `witnessReceive`: receive flow requiring witness data on sender side.

### Blinded receive example

```ts
const blind = await receiver.blindReceive({
  assetId,
  amount: 5000,
  minConfirmations: 1,
  durationSeconds: 3600,
});

await sender.send({
  invoice: blind.invoice,
  assetId,
  amount: 5000,
});
```

### Witness receive example

```ts
const witness = await receiver.witnessReceive({
  assetId,
  amount: 2000,
  minConfirmations: 1,
  durationSeconds: 3600,
});

await sender.send({
  invoice: witness.invoice,
  assetId,
  amount: 2000,
  witnessData: {
    amountSat: 1000,
  },
});
```

---

## Send Methods

### `sendBegin(params)`

Builds unsigned PSBT for RGB send.

### `sendEnd(params)`

Finalizes signed PSBT and broadcasts send transaction.

### `send(params, mnemonic?)`

One-shot send (`sendBegin` -> sign -> `sendEnd`).

**Begin/send parameters** (`SendAssetBeginRequestModel`)

| Field | Type | Description |
| --- | --- | --- |
| `invoice` | `string` | Recipient invoice produced by `blindReceive`/`witnessReceive`. |
| `witnessData` | `{ amountSat: number; blinding?: number }` | Required for witness invoices. `amountSat` is sats binding for witness transfer. |
| `assetId` | `string` | Optional explicit asset when invoice payload does not fully constrain selection. |
| `amount` | `number` | Optional explicit transfer amount in base units. |
| `donation` | `boolean` | Optional send strategy used by underlying transfer engine in constrained selection cases. |
| `feeRate` | `number` | Miner fee rate in sat/vbyte. Higher values generally confirm faster. |
| `minConfirmations` | `number` | Input selection filter by minimum confirmation depth. |

**End parameters** (`SendAssetEndRequestModel`)

| Field | Type | Description |
| --- | --- | --- |
| `signedPsbt` | `string` | Signed PSBT base64 to finalize. |
| `skipSync` | `boolean` | If true, skips automatic sync after finalization (manual sync expected). |

Flow choice:

- Use `send(...)` for simple integrated signing.
- Use `sendBegin(...)` + external signer + `sendEnd(...)` for HSM/hardware flows.
- If invoice came from `witnessReceive(...)`, include `witnessData`.

---

## UTXO Methods

### `createUtxosBegin(params)`

Creates unsigned PSBT for UTXO creation.

### `createUtxosEnd(params)`

Finalizes signed PSBT for UTXO creation.

### `createUtxos(params)`

One-shot UTXO creation.

**Begin/create parameters** (`CreateUtxosBeginRequestModel`)

| Field | Type | Description |
| --- | --- | --- |
| `upTo` | `boolean` | Top-up mode. Creates only enough UTXOs to reach target shape/count. |
| `num` | `number` | Target number of UTXOs to create. |
| `size` | `number` | Target value per UTXO in satoshis. |
| `feeRate` | `number` | Fee rate in sat/vbyte for the creation transaction. |

**End parameters** (`CreateUtxosEndRequestModel`)

| Field | Type | Description |
| --- | --- | --- |
| `signedPsbt` | `string` | Signed PSBT to finalize. |
| `skipSync` | `boolean` | Skip post-finalization sync if your orchestration syncs separately. |

Recommended:

- Run UTXO creation before issuance and before heavy receive activity.
- Call `syncWallet()` afterward unless you intentionally defer sync.

---

## Backup and Restore

### `createBackup({ backupPath, password })`

Creates dual backup files (`layer1` and `utexo`) in one backup directory.

| Field | Type | Description |
| --- | --- | --- |
| `backupPath` | `string` | Target directory for backup artifacts. |
| `password` | `string` | Password for backup encryption; required again during restore. |

### `vssBackup(config?, mnemonic?)`

Pushes wallet backup state to VSS.

`config` is optional; SDK can derive defaults from mnemonic and wallet options.

### `vssBackupInfo(config?, mnemonic?)`

Reads current VSS backup status.

Returns `backupExists`, `serverVersion`, `backupRequired`.

### `restoreUtxoWalletFromBackup({ backupPath, password, targetDir })`

Restores wallet files from local backup directory.

Parameter guidance:

- `backupPath`: folder containing `wallet_<fp>_layer1.backup` and `wallet_<fp>_utexo.backup`
- `password`: same password used at backup time
- `targetDir`: destination root for restored data

### `restoreUtxoWalletFromVss({ mnemonic, targetDir, config?, vssServerUrl? })`

Restores wallet files from VSS store derived from mnemonic/config.

Parameter guidance:

- `mnemonic`: wallet recovery phrase
- `targetDir`: destination root for restored wallet files
- `config`: explicit VSS config (`serverUrl`, `storeId`, `signingKey`)
- `vssServerUrl`: server override used when config is auto-built

