# Full Getting Started File

Use this file as copy-paste runnable entrypoint:

- `examples/getting-started-asset-flow.mjs`

Run:

```bash
node examples/getting-started-asset-flow.mjs
```

The script includes:

- key generation
- wallet initialization
- faucet funding and spendable balance wait
- address and BTC balance checks
- mnemonic to `xpriv`
- local backup + restore
- create UTXOs, issue asset, send/receive, refresh balances

## Full file content

```javascript
import fs from 'fs';
import path from 'path';
import {
  UTEXOWallet,
  generateKeys,
  getXprivFromMnemonic,
  restoreUtxoWalletFromBackup,
} from '@utexo/rgb-sdk';

const FAUCET_URL =
  'https://node-api.thunderstack.org/c17bc5d0-80b1-7050-5af5-dfd8a67834f1/1e0cfe422f0e4306bebdab953a0b99f2/sendbtc';
const FAUCET_BEARER_TOKEN =
  'EnYKDBgDIggKBggGEgIYDRIkCAASIGuYoof1WC0FaPciGHzPinGmglHd_b3Lb-gokogoeL-aGkA_hc_eLZ05C1XaA9wrcqFh1Bozvi_sawa_QKNCcowZCsVRmrsxJYahtsMduWYGrOVT7JNVVvpcU4PrGu19GrYNIiIKIO5ajD4HcB-R-yadJQCA954KhC7DV2wHi4_piv9k1uYT';
const FUND_AMOUNT_SATS = 16900;
const FUND_FEE_RATE = 5;
const REQUIRED_SPENDABLE_SATS = 12000;
const REQUIRED_RECEIVER_SPENDABLE_SATS = 2000;
const BALANCE_WAIT_TIMEOUT_MS = 120000;
const BALANCE_POLL_INTERVAL_MS = 5000;

async function requestFaucetFunds(address) {
  const response = await fetch(FAUCET_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FAUCET_BEARER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: FUND_AMOUNT_SATS,
      address,
      fee_rate: FUND_FEE_RATE,
      skip_sync: true,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Faucet request failed (${response.status}): ${text}`);
  }
  console.log('Faucet response:', text);
}

async function waitForSpendableBalance(wallet, minimumSats) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < BALANCE_WAIT_TIMEOUT_MS) {
    await wallet.syncWallet();
    const balance = await wallet.getBtcBalance();
    const spendable = balance.vanilla.spendable;
    console.log('Current spendable sats:', spendable);
    if (spendable >= minimumSats) {
      return balance;
    }
    await new Promise((resolve) => setTimeout(resolve, BALANCE_POLL_INTERVAL_MS));
  }

  throw new Error(
    `Timed out waiting for spendable balance >= ${minimumSats} sats after faucet funding`
  );
}

/**
 * Full getting-started script.
 *
 * This script runs the complete asset flow:
 * - key generation
 * - wallet init
 * - faucet funding
 * - xpriv derivation
 * - file backup and restore
 * - create UTXOs
 * - issue asset
 * - send/receive asset
 */
async function main() {
  console.log('1) Generate keys');
  const senderKeys = await generateKeys('testnet');
  const receiverKeys = await generateKeys('testnet');
  console.log('Sender fingerprint:', senderKeys.masterFingerprint);
  console.log('Receiver fingerprint:', receiverKeys.masterFingerprint);

  console.log('2) Initialize wallets');
  const sender = new UTEXOWallet(senderKeys.mnemonic, { network: 'testnet' });
  const receiver = new UTEXOWallet(receiverKeys.mnemonic, { network: 'testnet' });
  await sender.initialize();
  await receiver.initialize();

  console.log('3) Read addresses and fund both wallets');
  const senderAddress = await sender.getAddress();
  const receiverAddress = await receiver.getAddress();
  console.log('Sender address:', senderAddress);
  console.log('Receiver address:', receiverAddress);
  console.log('Requesting faucet funds for sender...');
  await requestFaucetFunds(senderAddress);
  console.log('Requesting faucet funds for receiver...');
  await requestFaucetFunds(receiverAddress);
  const senderBtcBalance = await waitForSpendableBalance(
    sender,
    REQUIRED_SPENDABLE_SATS
  );
  const receiverBtcBalance = await waitForSpendableBalance(
    receiver,
    REQUIRED_RECEIVER_SPENDABLE_SATS
  );
  console.log('Sender BTC balance after funding:', senderBtcBalance);
  console.log('Receiver BTC balance after funding:', receiverBtcBalance);

  console.log('4) Mnemonic -> xpriv');
  const xpriv = await getXprivFromMnemonic('testnet', senderKeys.mnemonic);
  console.log('xpriv prefix:', xpriv.slice(0, 12) + '...');

  console.log('5) Local backup and restore');
  const backupPath = path.resolve(`./tmp-docs-backup-${senderKeys.masterFingerprint}`);
  const restoredPath = path.resolve(
    `./tmp-docs-restored-${senderKeys.masterFingerprint}`
  );
  fs.rmSync(backupPath, { recursive: true, force: true });
  fs.rmSync(restoredPath, { recursive: true, force: true });
  const backup = await sender.createBackup({
    backupPath,
    password: 'pass123',
  });
  console.log('Backup created:', backup.message);

  const restored = restoreUtxoWalletFromBackup({
    backupPath,
    password: 'pass123',
    targetDir: restoredPath,
  });
  console.log('Restored into:', restored.targetDir);

  console.log('6) Create RGB UTXOs on sender and receiver');
  const senderUtxosCreated = await sender.createUtxos({ num: 5, size: 1000 });
  const receiverUtxosCreated = await receiver.createUtxos({ num: 3, size: 1000 });
  await sender.syncWallet();
  await receiver.syncWallet();
  console.log('Sender UTXOs created:', senderUtxosCreated);
  console.log('Receiver UTXOs created:', receiverUtxosCreated);

  console.log('7) Issue test asset');
  const issued = await sender.issueAssetNia({
    ticker: 'USDT',
    name: 'Tether USD (Test)',
    amounts: [1_000_000],
    precision: 6,
  });
  const assetId = issued.assetId;
  console.log('Issued asset ID:', assetId);

  console.log('8) Receiver creates invoice');
  const receiveData = await receiver.blindReceive({
    assetId,
    amount: 5000,
    minConfirmations: 1,
    durationSeconds: 3600,
  });
  console.log('Invoice:', receiveData.invoice);

  console.log('9) Sender sends asset');
  await sender.send({
    invoice: receiveData.invoice,
    assetId,
    amount: 5000,
  });

  console.log('10) Refresh and read balances');
  await sender.refreshWallet();
  await receiver.refreshWallet();
  console.log('Sender asset balance:', await sender.getAssetBalance(assetId));
  console.log('Receiver asset balance:', await receiver.getAssetBalance(assetId));

  console.log('11) Cleanup');
  await sender.dispose();
  await receiver.dispose();
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
```
