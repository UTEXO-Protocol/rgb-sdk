# UTEXO CLI

CLI for UTEXOWallet. All commands run via the single entrypoint.

**Usage:** `utexo <command> <wallet_name> [options]` or `npm run utexo -- <command> <wallet_name> [options]` or `node cli/run.mjs <command> <wallet_name> [options]`

**Exception:** `sign-psbt` has no wallet: `utexo sign-psbt --psbt "<psbt>" --network <net> --mnemonic "<mn>"`

## Structure

- **`run.mjs`** — Single entrypoint for all commands
- **`commands/`** — Command modules (each exports `run(walletName, flagArgs[, options])`)
- **`utils.mjs`** — Shared helpers (parseFlags, runWithWallet, wallet config load/save)
- **`data/`** — Wallet configs (`data/<wallet_name>.json`)
- **`generate_keys.mjs`** — Setup script to create a new wallet config (also: `utexo generate_keys <wallet> [network]`)

## Scripts

### generate_keys

Generates new wallet keys and saves them to a JSON file.

**Usage:**
```bash
utexo generate_keys <wallet_name> [network]
# or: node cli/generate_keys.mjs <wallet_name> [network]
```

**Examples:**
```bash
utexo generate_keys mywallet          # default: regtest
utexo generate_keys mywallet testnet
```

**Parameters:**
- `wallet_name` (required) - Name for the wallet configuration file
- `network` (optional) - Bitcoin network, defaults to `regtest` if not provided
  - Options: `mainnet`, `testnet`, `testnet4`, `regtest`, `utexo`

**Output:**
- Creates a JSON file in `cli/data/<wallet_name>.json` containing:
  - Wallet name
  - Network
  - Mnemonic (⚠️ keep secure!)
  - xpub, accountXpubVanilla, accountXpubColored
  - masterFingerprint
  - xpriv
  - Created timestamp

### address

Get wallet address.

**Usage:** `utexo address <wallet_name>`

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match a file in `data/<wallet_name>.json`)

**Output:**
- Displays the wallet address and wallet information

### btcbalance

Get BTC balance.

**Usage:** `utexo btcbalance <wallet_name>`

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match a file in `data/<wallet_name>.json`)

**Output:**
- Displays BTC balance information including:
  - Vanilla (Regular BTC) balance: settled, future, spendable
  - Colored (RGB Assets) balance: settled, future, spendable
  - Wallet information

### createutxos

Create UTXOs.

**Usage:** `utexo createutxos <wallet_name> [options]`

**Options:**
- `--num <number>` - Number of UTXOs to create (default: 5)
- `--size <number>` - Size of each UTXO in sats (default: 1000)
- `--feeRate <number>` - Fee rate in sat/vB (default: 1)
- `--upTo` - Create UTXOs up to the specified number (optional flag)

**Examples:**
```bash
utexo createutxos mywallet
utexo createutxos mywallet --num 10 --size 2000 --feeRate 2
utexo createutxos mywallet --num 20 --upTo
```

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match `data/<wallet_name>.json`)
- Options are optional and have sensible defaults

**Output:**
- Displays the number of UTXOs created
- Shows wallet information

**Note:** This command requires the wallet to have sufficient BTC balance to create UTXOs and pay fees.

### listassets

List RGB assets.

**Usage:** `utexo listassets <wallet_name> [--assetId <id>]`

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match `data/<wallet_name>.json`)

**Output:**
- Lists all assets by type: NIA (RGB20), UDA, CFA, IFA
- For each asset: ticker/name, asset ID, settled and spendable balance
- Total asset count
- Raw JSON response from `listAssets()`

### blindreceive

Create blind receive invoice.

**Usage:** `utexo blindreceive <wallet_name> --amount <number> [options]`

**Options:**
- `--amount <number>` (required) - Amount to receive
- `--assetId <string>` - Asset ID (optional)
- `--minConfirmations <n>` - Min confirmations (optional)
- `--durationSeconds <n>` - Invoice duration in seconds (optional)

**Examples:**
```bash
utexo blindreceive mywallet --amount 100
utexo blindreceive mywallet --amount 50 --assetId rgb:xxx... --durationSeconds 2000
```

**Output:**
- Raw JSON response from `blindReceive()`: invoice, recipientId, expirationTimestamp, batchTransferIdx
- Wallet info

### witnessreceive

Create witness receive invoice.

**Usage:** `utexo witnessreceive <wallet_name> --amount <number> [options]`

**Options:**
- `--amount <number>` (required) - Amount to receive
- `--assetId <string>` - Asset ID (optional)
- `--minConfirmations <n>` - Min confirmations (optional)
- `--durationSeconds <n>` - Invoice duration in seconds (optional)

**Examples:**
```bash
utexo witnessreceive mywallet --amount 100
utexo witnessreceive mywallet --amount 50 --assetId rgb:xxx... --durationSeconds 2000
```

**Output:**
- Raw JSON response from `witnessReceive()`: invoice, recipientId, expirationTimestamp, batchTransferIdx
- Wallet info

### decodergbinvoice

Decode an RGB invoice.

**Usage:** `utexo decodergbinvoice <wallet_name> --invoice "<invoice_string>"`

**Output:**
- Raw JSON response from `decodeRGBInvoice()`: invoice, recipientId, assetSchema, assetId, network, assignment, assignmentName, expirationTimestamp, transportEndpoints
- Wallet info

### refresh

Refresh wallet state.

**Usage:** `utexo refresh <wallet_name>`

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match `data/<wallet_name>.json`)

**Output:**
- Success message and wallet info

### listtransfers

List transfers.

**Usage:** `utexo listtransfers <wallet_name> [--assetId <asset_id>]`
- `--assetId <string>` (optional) - Filter transfers by asset ID

**Examples:**
```bash
utexo listtransfers mywallet
utexo listtransfers mywallet --assetId rgb:xxx...
```

**Output:**
- Raw JSON response from `listTransfers()` (array of transfers)
- Total transfer count
- Wallet info

### onchainreceive

Generate on-chain deposit invoice (mainnet → UTEXO).

**Usage:** `utexo onchainreceive <wallet_name> --amount <n> [--assetId <id>] [--minConfirmations <n>] [--durationSeconds <n>]`

**Output:** Mainnet invoice for depositing to UTEXO.

### onchainsendbegin

Begin on-chain send, returns unsigned PSBT.

**Usage:** `utexo onchainsendbegin <wallet_name> --invoice "<invoice_string>"`

### signpsbt

Sign PSBT (uses wallet; requires init/goOnline).

**Usage:** `utexo signpsbt <wallet_name> --psbt "<psbt_string>" [--mnemonic "<mnemonic>"]`

### sign-psbt

Sign PSBT standalone (no wallet). Use when signing without loading a wallet config.

**Usage:** `utexo sign-psbt --psbt "<psbt>" --network <regtest|testnet|mainnet> --mnemonic "<mnemonic>"`

### onchainsendend

Complete on-chain send with signed PSBT.

**Usage:** `utexo onchainsendend <wallet_name> --invoice "<invoice_string>" --signedPsbt "<signed_psbt>"`

### onchainsend

Complete on-chain send flow (begin + sign + end).

**Usage:** `utexo onchainsend <wallet_name> --invoice "<invoice_string>" [--mnemonic "<mnemonic>"]`

### send

Standard RGB send (blind/witness invoice).

**Usage:** `utexo send <wallet_name> --invoice "<inv>" [--assetId <id>] [--amount <n>] [--witnessData "<json>"] [--mnemonic "<mn>"] [--feeRate <n>] [--minConfirmations <n>]`

### listunspents

List unspent UTXOs.

**Usage:** `utexo listunspents <wallet_name>`

### getonchainsendstatus

Get on-chain send status.

**Usage:** `utexo getonchainsendstatus <wallet_name> --invoice "<invoice_string>"`

### createlightninginvoice

Create Lightning invoice.

**Usage:** `utexo createlightninginvoice <wallet_name> --assetId <id> --amount <n> [--amountSats <n>] [--expirySeconds <n>]`

### paylightninginvoicebegin

Begin Lightning payment, returns unsigned PSBT.

**Usage:** `utexo paylightninginvoicebegin <wallet_name> --lnInvoice "<ln_invoice>" [--maxFee <n>]`

### paylightninginvoice

Complete Lightning payment (begin + sign + end).

**Usage:** `utexo paylightninginvoice <wallet_name> --lnInvoice "<ln_invoice>" [--amount <n>] [--assetId <id>] [--maxFee <n>] [--mnemonic "<mn>"]`

### paylightninginvoiceend

Complete Lightning payment with signed PSBT.

**Usage:** `utexo paylightninginvoiceend <wallet_name> --lnInvoice "<ln_invoice>" --signedPsbt "<signed_psbt>"`

### getlightningsendrequest

Get Lightning send status.

**Usage:** `utexo getlightningsendrequest <wallet_name> --lnInvoice "<ln_invoice>"`

### getlightningreceiverequest

Get Lightning receive status.

**Usage:** `utexo getlightningreceiverequest <wallet_name> --lnInvoice "<ln_invoice>"`

## Example Workflow

```bash
# 1. Generate keys (default: regtest)
utexo generate_keys testwallet

# 2. Get address, balance, create UTXOs
utexo address testwallet
utexo btcbalance testwallet
utexo createutxos testwallet --num 10 --size 1500
utexo listassets testwallet

# 3. Receive invoices
utexo blindreceive testwallet --amount 100
utexo witnessreceive testwallet --amount 100

# 4. On-chain (UTEXO)
utexo onchainreceive testwallet --amount 100
utexo onchainsend testwallet --invoice "<mainnet_invoice>"
utexo getonchainsendstatus testwallet --invoice "<invoice>"

# 5. Lightning
utexo createlightninginvoice testwallet --assetId rgb:xxx... --amount 100
utexo paylightninginvoice testwallet --lnInvoice "lnbc..."

# 6. Standard RGB send
utexo send testwallet --invoice "<inv>" --assetId <id> --amount <n>
```

**WalletManager (standard RGB, same keys):** `utexo wm address|btcbalance|refresh|sync|createutxos|blindreceive|listassets|listtransfers|sendbatch|sendbtc <wallet> [options]`

## Security Warning

⚠️ **IMPORTANT**: The wallet configuration files contain sensitive information (mnemonic, private keys). 
- Never commit these files to version control
- Keep them secure and encrypted
- This folder is automatically ignored by git (see `.gitignore`)

## Data folder

Wallet config files and other test data live in **`cli/data/`**:
- `data/<wallet_name>.json` — wallet configs created by `generate_keys.mjs`
- `data/bridge.txt` — optional bridge-related data

Scripts read and write wallet configs under `data/` automatically.

## Notes

- All scripts use ES modules (`.mjs` extension)
- Scripts require the project to be built (`npm run build`) before use
- Wallet files are stored in `cli/data/` as `<wallet_name>.json`
- Wallet `network` from config (e.g. `regtest`, `utexo`, `testnet`) is mapped to UTEXOWallet presets `mainnet` or `testnet` automatically
