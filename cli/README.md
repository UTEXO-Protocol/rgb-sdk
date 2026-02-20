# UTEXO CLI

This folder contains the CLI and utility scripts for UTEXOWallet.

## Structure

- **`run.mjs`** — Single entrypoint. Run via `utexo <command> <wallet_name> [options]` or `node cli/run.mjs <command> <wallet_name> [options]`.
- **`commands/`** — Command modules (e.g. `address.mjs`, `getonchainsendstatus.mjs`). Each exports a `run(walletName, flagArgs[, options])` function.
- **`utils.mjs`** — Shared helpers (parseFlags, runWithWallet, wallet config load/save).
- **`data/`** — Wallet configs and other test data (e.g. `data/<wallet_name>.json`).
- **`generate_keys.mjs`** — Setup script to create a new wallet config.
- Standalone scripts (e.g. `btcbalance.mjs`, `listassets.mjs`) remain for commands not yet in `run.mjs`.

## Scripts

### generate_keys.mjs

Generates new wallet keys and saves them to a JSON file.

**Usage (npm):**
```bash
npm run generate_keys -- <wallet_name>
npm run generate_keys -- <wallet_name> [network]
```

**Usage (direct):**
```bash
node cli/generate_keys.mjs <wallet_name>
node cli/generate_keys.mjs <wallet_name> [network]
```

**Examples:**
```bash
# Generate keys with default network (regtest)
npm run generate_keys -- mywallet

# Generate keys with specific network
npm run generate_keys -- mywallet testnet
```

**Parameters:**
- `wallet_name` (required) - Name for the wallet configuration file
- `network` (optional) - Bitcoin network, defaults to `regtest` if not provided
  - Options: `mainnet`, `testnet`, `testnet4`, `regtest`, `signet`

**Output:**
- Creates a JSON file in `cli/data/<wallet_name>.json` containing:
  - Wallet name
  - Network
  - Mnemonic (⚠️ keep secure!)
  - xpub, accountXpubVanilla, accountXpubColored
  - masterFingerprint
  - xpriv
  - Created timestamp

### address.mjs

Loads a wallet configuration and retrieves the address using UTEXOWallet.

**Usage (npm):**
```bash
npm run address -- <wallet_name>
```

**Usage (direct):**
```bash
node cli/address.mjs <wallet_name>
```

**Example:**
```bash
npm run address -- mywallet
# or
node cli/address.mjs mywallet
```

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match a file in `data/<wallet_name>.json`)

**Output:**
- Displays the wallet address and wallet information

### btcbalance.mjs

Loads a wallet configuration and retrieves the BTC balance using UTEXOWallet.

**Usage (npm):**
```bash
npm run btcbalance -- <wallet_name>
```

**Usage (direct):**
```bash
node cli/btcbalance.mjs <wallet_name>
```

**Example:**
```bash
npm run btcbalance -- mywallet
# or
node cli/btcbalance.mjs mywallet
```

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match a file in `data/<wallet_name>.json`)

**Output:**
- Displays BTC balance information including:
  - Vanilla (Regular BTC) balance: settled, future, spendable
  - Colored (RGB Assets) balance: settled, future, spendable
  - Wallet information

### createutxos.mjs

Loads a wallet configuration and creates UTXOs using UTEXOWallet.

**Usage (npm):**
```bash
npm run createutxos -- <wallet_name> [options]
```

**Usage (direct):**
```bash
node cli/createutxos.mjs <wallet_name> [options]
```

**Options:**
- `--num <number>` - Number of UTXOs to create (default: 5)
- `--size <number>` - Size of each UTXO in sats (default: 1000)
- `--feeRate <number>` - Fee rate in sat/vB (default: 1)
- `--upTo` - Create UTXOs up to the specified number (optional flag)

**Examples:**
```bash
# Create UTXOs with default parameters (5 UTXOs, 1000 sats each, fee rate 1)
npm run createutxos -- mywallet

# Create 10 UTXOs with custom size and fee rate
npm run createutxos -- mywallet --num 10 --size 2000 --feeRate 2

# Create UTXOs up to the specified number
npm run createutxos -- mywallet --num 20 --upTo
```

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match `data/<wallet_name>.json`)
- Options are optional and have sensible defaults

**Output:**
- Displays the number of UTXOs created
- Shows wallet information

**Note:** This command requires the wallet to have sufficient BTC balance to create UTXOs and pay fees.

### listassets.mjs

Loads a wallet configuration and lists RGB assets using UTEXOWallet.

**Usage (npm):**
```bash
npm run listassets -- <wallet_name>
```

**Usage (direct):**
```bash
node cli/listassets.mjs <wallet_name>
```

**Example:**
```bash
npm run listassets -- mywallet
# or
node cli/listassets.mjs mywallet
```

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match `data/<wallet_name>.json`)

**Output:**
- Lists all assets by type: NIA (RGB20), UDA, CFA, IFA
- For each asset: ticker/name, asset ID, settled and spendable balance
- Total asset count
- Raw JSON response from `listAssets()`

### blindreceive.mjs

Creates a blind receive invoice using UTEXOWallet.blindReceive().

**Usage (npm):**
```bash
npm run blindreceive -- <wallet_name> --amount <number> [options]
```

**Usage (direct):**
```bash
node cli/blindreceive.mjs <wallet_name> --amount <number> [options]
```

**Options:**
- `--amount <number>` (required) - Amount to receive
- `--assetId <string>` - Asset ID (optional)
- `--minConfirmations <n>` - Min confirmations (optional)
- `--durationSeconds <n>` - Invoice duration in seconds (optional)

**Examples:**
```bash
# Create blind receive invoice for 100 units
npm run blindreceive -- mywallet --amount 100

# With asset ID and duration
npm run blindreceive -- mywallet --amount 50 --assetId rgb:xxx... --durationSeconds 2000
```

**Output:**
- Raw JSON response from `blindReceive()`: invoice, recipientId, expirationTimestamp, batchTransferIdx
- Wallet info

### witnessreceive.mjs

Creates a witness receive invoice using UTEXOWallet.witnessReceive().

**Usage (npm):**
```bash
npm run witnessreceive -- <wallet_name> --amount <number> [options]
```

**Usage (direct):**
```bash
node cli/witnessreceive.mjs <wallet_name> --amount <number> [options]
```

**Options:**
- `--amount <number>` (required) - Amount to receive
- `--assetId <string>` - Asset ID (optional)
- `--minConfirmations <n>` - Min confirmations (optional)
- `--durationSeconds <n>` - Invoice duration in seconds (optional)

**Examples:**
```bash
# Create witness receive invoice for 100 units
npm run witnessreceive -- mywallet --amount 100

# With asset ID and duration
npm run witnessreceive -- mywallet --amount 50 --assetId rgb:xxx... --durationSeconds 2000
```

**Output:**
- Raw JSON response from `witnessReceive()`: invoice, recipientId, expirationTimestamp, batchTransferIdx
- Wallet info

### decodergbinvoice.mjs

Decodes an RGB invoice using UTEXOWallet.decodeRGBInvoice().

**Usage (npm):**
```bash
npm run decodergbinvoice -- <wallet_name> --invoice "<invoice_string>"
```

**Usage (direct):**
```bash
node cli/decodergbinvoice.mjs <wallet_name> --invoice "<invoice_string>"
```

**Options:**
- `--invoice <string>` (required) - RGB invoice string to decode

**Examples:**
```bash
npm run decodergbinvoice -- mywallet --invoice "rgb:~/~/BF/sb:wvout:BSfzP7Eu-..."
```

**Output:**
- Raw JSON response from `decodeRGBInvoice()`: invoice, recipientId, assetSchema, assetId, network, assignment, assignmentName, expirationTimestamp, transportEndpoints
- Wallet info

### refresh.mjs

Refreshes wallet state using UTEXOWallet.refreshWallet().

**Usage (npm):**
```bash
npm run refresh -- <wallet_name>
```

**Usage (direct):**
```bash
node cli/refresh.mjs <wallet_name>
```

**Example:**
```bash
npm run refresh -- mywallet
```

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match `data/<wallet_name>.json`)

**Output:**
- Success message and wallet info

### listtransfers.mjs

Lists transfers using UTEXOWallet.listTransfers().

**Usage (npm):**
```bash
npm run listtransfers -- <wallet_name> [--assetId <asset_id>]
```

**Usage (direct):**
```bash
node cli/listtransfers.mjs <wallet_name> [--assetId <asset_id>]
```

**Options:**
- `--assetId <string>` (optional) - Filter transfers by asset ID

**Examples:**
```bash
# List all transfers
npm run listtransfers -- mywallet

# List transfers for a specific asset
npm run listtransfers -- mywallet --assetId rgb:xxx...
```

**Output:**
- Raw JSON response from `listTransfers()` (array of transfers)
- Total transfer count
- Wallet info

### onchainsendbegin.mjs

Begins an onchain send and returns a PSBT using UTEXOWallet.onchainSendBegin().

**Usage (npm):**
```bash
npm run onchainsendbegin -- <wallet_name> --invoice "<invoice_string>"
```

**Usage (direct):**
```bash
node cli/onchainsendbegin.mjs <wallet_name> --invoice "<invoice_string>"
```

**Options:**
- `--invoice <string>` (required) - Mainnet invoice

**Example:**
```bash
npm run onchainsendbegin -- mywallet --invoice "rgb:..."
```

**Output:**
- PSBT string from `onchainSendBegin()`
- Wallet info

### signpsbt.mjs

Signs a PSBT using UTEXOWallet.signPsbt().

**Usage (npm):**
```bash
npm run signpsbt -- <wallet_name> --psbt "<psbt_string>" [--mnemonic "<mnemonic>"]
```

**Usage (direct):**
```bash
node cli/signpsbt.mjs <wallet_name> --psbt "<psbt_string>" [--mnemonic "<mnemonic>"]
```

**Options:**
- `--psbt <string>` (required) - PSBT to sign
- `--mnemonic <string>` (optional) - Mnemonic for signing (uses wallet mnemonic if not provided)

**Example:**
```bash
npm run signpsbt -- mywallet --psbt "cHNidP8BAIkB..."
```

**Output:**
- Signed PSBT string
- Wallet info

### onchainsendend.mjs

Completes an onchain send with signed PSBT using UTEXOWallet.onchainSendEnd().

**Usage (npm):**
```bash
npm run onchainsendend -- <wallet_name> --invoice "<invoice_string>" --signedPsbt "<signed_psbt>"
```

**Usage (direct):**
```bash
node cli/onchainsendend.mjs <wallet_name> --invoice "<invoice_string>" --signedPsbt "<signed_psbt>"
```

**Options:**
- `--invoice <string>` (required) - Mainnet invoice
- `--signedPsbt <string>` (required) - Signed PSBT

**Example:**
```bash
npm run onchainsendend -- mywallet --invoice "rgb:..." --signedPsbt "cHNidP8BAIkB..."
```

**Output:**
- Raw JSON response from `onchainSendEnd()`: txid, batchTransferIdx
- Wallet info

### onchainsend.mjs

Performs complete onchain send flow (begin + sign + end) using UTEXOWallet.onchainSend().

**Usage (npm):**
```bash
npm run onchainsend -- <wallet_name> --invoice "<invoice_string>" [--mnemonic "<mnemonic>"]
```

**Usage (direct):**
```bash
node cli/onchainsend.mjs <wallet_name> --invoice "<invoice_string>" [--mnemonic "<mnemonic>"]
```

**Options:**
- `--invoice <string>` (required) - Mainnet invoice
- `--mnemonic <string>` (optional) - Mnemonic for signing (uses wallet mnemonic if not provided)

**Example:**
```bash
npm run onchainsend -- mywallet --invoice "rgb:..."
```

**Output:**
- Raw JSON response from `onchainSend()`: txid, batchTransferIdx
- Wallet info

### listunspents.mjs

Lists unspent UTXOs using UTEXOWallet.listUnspents().

**Usage (npm):**
```bash
npm run listunspents -- <wallet_name>
```

**Usage (direct):**
```bash
node cli/listunspents.mjs <wallet_name>
```

**Example:**
```bash
npm run listunspents -- mywallet
```

**Parameters:**
- `wallet_name` (required) - Name of the wallet (must match `data/<wallet_name>.json`)

**Output:**
- Raw JSON response from `listUnspents()` (array of unspent UTXOs with utxo and rgbAllocations)
- Total unspent count
- Wallet info

### getonchainsendstatus.mjs

Gets the status of an onchain send using UTEXOWallet.getOnchainSendStatus().

**Usage (npm):**
```bash
npm run getonchainsendstatus -- <wallet_name> --invoice "<invoice_string>"
```

**Usage (direct):**
```bash
node cli/getonchainsendstatus.mjs <wallet_name> --invoice "<invoice_string>"
```

**Options:**
- `--invoice <string>` (required) - Invoice to check status for

**Example:**
```bash
npm run getonchainsendstatus -- mywallet --invoice "rgb:..."
```

**Output:**
- TransferStatus from `getOnchainSendStatus()`: 'WaitingCounterparty', 'WaitingConfirmations', 'Settled', 'Failed', or null if not found
- Wallet info

### createlightninginvoice.mjs

Creates a Lightning invoice using UTEXOWallet.createLightningInvoice().

**Usage (npm):**
```bash
npm run createlightninginvoice -- <wallet_name> --assetId <asset_id> --amount <number> [options]
```

**Usage (direct):**
```bash
node cli/createlightninginvoice.mjs <wallet_name> --assetId <asset_id> --amount <number> [options]
```

**Options:**
- `--assetId <string>` (required) - Asset ID
- `--amount <number>` (required) - Amount
- `--amountSats <number>` (optional) - Amount in satoshis
- `--expirySeconds <n>` (optional) - Invoice expiry in seconds

**Examples:**
```bash
# Create Lightning invoice for asset
npm run createlightninginvoice -- mywallet --assetId rgb:xxx... --amount 100

# With expiry
npm run createlightninginvoice -- mywallet --assetId rgb:xxx... --amount 100 --expirySeconds 3600
```

**Output:**
- Raw JSON response from `createLightningInvoice()`: lnInvoice, expiresAt, tempRequestId
- Wallet info

### paylightninginvoicebegin.mjs

Begins a Lightning invoice payment and returns a PSBT using UTEXOWallet.payLightningInvoiceBegin().

**Usage (npm):**
```bash
npm run paylightninginvoicebegin -- <wallet_name> --lnInvoice "<ln_invoice>" [--maxFee <number>]
```

**Usage (direct):**
```bash
node cli/paylightninginvoicebegin.mjs <wallet_name> --lnInvoice "<ln_invoice>" [--maxFee <number>]
```

**Options:**
- `--lnInvoice <string>` (required) - Lightning invoice
- `--maxFee <number>` (optional) - Maximum fee

**Example:**
```bash
npm run paylightninginvoicebegin -- mywallet --lnInvoice "lnbc..."
```

**Output:**
- PSBT string from `payLightningInvoiceBegin()`
- Wallet info

### paylightninginvoice.mjs

Performs a complete Lightning invoice payment (begin + sign + end) using UTEXOWallet.payLightningInvoice().

**Usage (npm):**
```bash
npm run paylightninginvoice -- <wallet_name> --lnInvoice "<ln_invoice>" [--amount <number>] [--assetId <string>] [--maxFee <number>] [--mnemonic "<mnemonic>"]
```

**Usage (direct):**
```bash
node cli/paylightninginvoice.mjs <wallet_name> --lnInvoice "<ln_invoice>" [--amount <number>] [--assetId <string>] [--maxFee <number>] [--mnemonic "<mnemonic>"]
```

**Options:**
- `--lnInvoice <string>` (required) - Lightning invoice
- `--amount <number>` (optional) - Amount
- `--assetId <string>` (optional) - Asset ID
- `--maxFee <number>` (optional) - Maximum fee
- `--mnemonic <string>` (optional) - Mnemonic for signing (uses wallet mnemonic if not provided)

**Example:**
```bash
npm run paylightninginvoice -- mywallet --lnInvoice "lnbc..."
```

**Output:**
- Raw JSON response from `payLightningInvoice()`: txid, batchTransferIdx, etc.
- Wallet info

### paylightninginvoiceend.mjs

Completes a Lightning invoice payment with signed PSBT using UTEXOWallet.payLightningInvoiceEnd().

**Usage (npm):**
```bash
npm run paylightninginvoiceend -- <wallet_name> --lnInvoice "<ln_invoice>" --signedPsbt "<signed_psbt>"
```

**Usage (direct):**
```bash
node cli/paylightninginvoiceend.mjs <wallet_name> --lnInvoice "<ln_invoice>" --signedPsbt "<signed_psbt>"
```

**Options:**
- `--lnInvoice <string>` (required) - Lightning invoice
- `--signedPsbt <string>` (required) - Signed PSBT

**Example:**
```bash
npm run paylightninginvoiceend -- mywallet --lnInvoice "lnbc..." --signedPsbt "cHNidP8BAIkB..."
```

**Output:**
- Raw JSON response from `payLightningInvoiceEnd()`: txid, batchTransferIdx
- Wallet info

### getlightningsendrequest.mjs

Gets the status of a Lightning send request using UTEXOWallet.getLightningSendRequest().

**Usage (npm):**
```bash
npm run getlightningsendrequest -- <wallet_name> --lnInvoice "<ln_invoice>"
```

**Usage (direct):**
```bash
node cli/getlightningsendrequest.mjs <wallet_name> --lnInvoice "<ln_invoice>"
```

**Options:**
- `--lnInvoice <string>` (required) - Lightning invoice to check status for

**Example:**
```bash
npm run getlightningsendrequest -- mywallet --lnInvoice "lnbc..."
```

**Output:**
- TransferStatus from `getLightningSendRequest()`: 'WaitingCounterparty', 'WaitingConfirmations', 'Settled', 'Failed', or null if not found
- Wallet info

### getlightningreceiverequest.mjs

Gets the status of a Lightning receive request using UTEXOWallet.getLightningReceiveRequest().

**Usage (npm):**
```bash
npm run getlightningreceiverequest -- <wallet_name> --lnInvoice "<ln_invoice>"
```

**Usage (direct):**
```bash
node cli/getlightningreceiverequest.mjs <wallet_name> --lnInvoice "<ln_invoice>"
```

**Options:**
- `--lnInvoice <string>` (required) - Lightning invoice to check status for

**Example:**
```bash
npm run getlightningreceiverequest -- mywallet --lnInvoice "lnbc..."
```

**Output:**
- TransferStatus from `getLightningReceiveRequest()`: 'WaitingCounterparty', 'WaitingConfirmations', 'Settled', 'Failed', or null if not found
- Wallet info

## Example Workflow

1. Generate keys for a new wallet (uses default network: regtest):
   ```bash
   npm run generate_keys -- testwallet
   ```

2. Get the address for the wallet:
   ```bash
   npm run address -- testwallet
   ```

3. Get the BTC balance for the wallet:
   ```bash
   npm run btcbalance -- testwallet
   ```

4. Create UTXOs for the wallet:
   ```bash
   npm run createutxos -- testwallet --num 10 --size 1500
   ```

5. List assets in the wallet:
   ```bash
   npm run listassets -- testwallet
   ```

6. Create a blind receive invoice:
   ```bash
   npm run blindreceive -- testwallet --amount 100
   ```

7. Create a witness receive invoice:
   ```bash
   npm run witnessreceive -- testwallet --amount 100
   ```

8. Decode an RGB invoice:
   ```bash
   npm run decodergbinvoice -- testwallet --invoice "<invoice_string>"
   ```

9. Refresh wallet state:
   ```bash
   npm run refresh -- testwallet
   ```

10. List transfers:
   ```bash
   npm run listtransfers -- testwallet
   npm run listtransfers -- testwallet --assetId rgb:xxx...
   ```

11. Onchain send (complete flow):
   ```bash
   npm run onchainsend -- testwallet --invoice "<invoice_string>"
   ```

12. Onchain send (step by step):
   ```bash
   # Step 1: Begin
   npm run onchainsendbegin -- testwallet --invoice "<invoice_string>"
   
   # Step 2: Sign PSBT
   npm run signpsbt -- testwallet --psbt "<psbt_from_step1>"
   
   # Step 3: End
   npm run onchainsendend -- testwallet --invoice "<invoice_string>" --signedPsbt "<signed_psbt_from_step2>"
   ```

13. List unspent UTXOs:
   ```bash
   npm run listunspents -- testwallet
   ```

14. Get onchain send status:
   ```bash
   npm run getonchainsendstatus -- testwallet --invoice "<invoice_string>"
   ```

15. Create Lightning invoice:
   ```bash
   npm run createlightninginvoice -- testwallet --assetId rgb:xxx... --amount 100
   ```

16. Pay Lightning invoice (complete flow):
   ```bash
   npm run paylightninginvoice -- testwallet --lnInvoice "lnbc..."
   ```

17. Pay Lightning invoice (step by step):
   ```bash
   # Step 1: Begin
   npm run paylightninginvoicebegin -- testwallet --lnInvoice "lnbc..."
   
   # Step 2: Sign PSBT
   npm run signpsbt -- testwallet --psbt "<psbt_from_step1>"
   
   # Step 3: End
   npm run paylightninginvoiceend -- testwallet --lnInvoice "lnbc..." --signedPsbt "<signed_psbt_from_step2>"
   ```

18. Get Lightning send/receive request status:
   ```bash
   npm run getlightningsendrequest -- testwallet --lnInvoice "lnbc..."
   npm run getlightningreceiverequest -- testwallet --lnInvoice "lnbc..."
   ```

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
- Wallet `network` from config (e.g. `regtest`, `signet`, `testnet`) is mapped to UTEXOWallet presets `mainnet` or `testnet` automatically
