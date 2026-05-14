/**
 * Per-user mnemonic + UTEXOWallet mapping (reuseAddresses + stable dataDir).
 *
 * - onboard: ONCE per user — generateKeys, persist mnemonic yourself, prints address
 * - balance (default): reopen with MNEMONIC + USER_ID — sync, BTC + NIA list, optional listTransfers
 * - reopen: initialize only, print address twice (shows reuseAddresses when disk state stable)
 *
 * From repo root after `npm run build`:
 *
 *   ACTION=onboard USER_ID=myuser node examples/per-user-onboard-reopen.mjs
 *   ACTION=balance USER_ID=myuser MNEMONIC="your twelve words ..." node examples/per-user-onboard-reopen.mjs
 *   ASSET_ID="rgb:..." ACTION=balance USER_ID=myuser MNEMONIC="..." node examples/per-user-onboard-reopen.mjs
 *   ACTION=reopen USER_ID=myuser MNEMONIC="..." node examples/per-user-onboard-reopen.mjs
 */

import { UTEXOWallet, generateKeys } from '../dist/index.mjs';

const networkPreset = 'testnet';

const USER_ID = process.env.USER_ID || 'demo-user';

/** Same options every time for this USER_ID */
function utexoWalletOptions(userId) {
  return {
    network: networkPreset,
    dataDir: `./wallet-data/${userId}`,
    reuseAddresses: true,
  };
}

async function onboardNewUser(userId) {
  const keys = await generateKeys(networkPreset);
  console.log('--- Save mnemonic (once) ---\n', keys.mnemonic, '\n');
  console.log(
    '(Optional) KMS: encrypt and store keyed by userId; do not log in production.'
  );

  const wallet = new UTEXOWallet(keys.mnemonic, utexoWalletOptions(userId));
  try {
    await wallet.initialize();
    const depositAddress = await wallet.getAddress();
    console.log('Deposit address:', depositAddress);
    const pubs = wallet.getXpub();
    console.log('xpub van:', pubs.xpubVan.slice(0, 16) + '…');
    console.log('xpub col:', pubs.xpubCol.slice(0, 16) + '…');
  } finally {
    await wallet.dispose();
  }
}

async function openWalletForUser(userId, mnemonic) {
  const wallet = new UTEXOWallet(mnemonic, utexoWalletOptions(userId));
  await wallet.initialize();
  return wallet;
}

async function walletBalance(userId, mnemonic) {
  const wallet = await openWalletForUser(userId, mnemonic);
  try {
    await wallet.syncWallet();
    const btc = await wallet.getBtcBalance();
    console.log('BTC:', btc);
    const assets = await wallet.listAssets();
    console.log('\nNIA assets:');
    for (const a of assets.nia ?? []) {
      console.log(a.assetId, a.ticker, a.balance);
    }
    await wallet.refreshWallet();
    const assetId = process.env.ASSET_ID;
    if (assetId && assetId !== 'rgb:...') {
      console.log('\nTransfers for', assetId);
      console.log(await wallet.listTransfers(assetId));
    } else if (process.env.ASSET_ID) {
      console.log('\nSet ASSET_ID to a real rgb:… id for listTransfers');
    }
  } finally {
    await wallet.dispose();
  }
}

async function reopenDemo(userId, mnemonic) {
  const wallet = await openWalletForUser(userId, mnemonic);
  try {
    const a1 = await wallet.getAddress();
    const a2 = await wallet.getAddress();
    console.log('getAddress 1:', a1);
    console.log('getAddress 2:', a2);
    console.log('Same string:', a1 === a2);
  } finally {
    await wallet.dispose();
  }
}

async function main() {
  const action = (process.env.ACTION || 'balance').toLowerCase();
  const mnemonic = process.env.MNEMONIC || '';

  console.log('Network:', networkPreset);
  console.log('USER_ID:', USER_ID);
  console.log('ACTION:', action);

  if (action === 'onboard') {
    await onboardNewUser(USER_ID);
  } else if (action === 'reopen') {
    if (!mnemonic) {
      console.error('Set MNEMONIC for reopen');
      process.exit(1);
    }
    await reopenDemo(USER_ID, mnemonic);
  } else if (action === 'balance') {
    if (!mnemonic) {
      console.error(
        'Set MNEMONIC (same user must use same mnemonic as onboard). Example:\n  ACTION=balance USER_ID=demo MNEMONIC="word word ..." node examples/per-user-onboard-reopen.mjs'
      );
      process.exit(1);
    }
    await walletBalance(USER_ID, mnemonic);
  } else {
    console.error('ACTION must be onboard | balance | reopen');
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
