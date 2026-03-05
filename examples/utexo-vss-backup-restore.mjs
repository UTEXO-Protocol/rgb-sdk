/**
 * UTEXOWallet – VSS backup and restore only
 *
 * - Backup: create wallet (vssServerUrl optional; SDK uses DEFAULT_VSS_SERVER_URL), initialize, vssBackup(), vssBackupInfo()
 * - Restore: restoreUtxoWalletFromVss({ mnemonic, targetDir }), then wallet with dataDir
 *
 * Run (from repo root, after build): node examples/utexo-vss-backup-restore.mjs
 */

import path from 'path';
import { UTEXOWallet, restoreUtxoWalletFromVss } from '../dist/index.mjs';

const MNEMONIC = 'top reject between sugar rug pulse radar coffee kiss faculty pool vocal';
const TARGET_DIR = path.join(process.cwd(), 'restored-utexo-vss');

async function runVssBackup() {
    console.log('--- VSS backup ---');
    const wallet = new UTEXOWallet(MNEMONIC, { network: 'testnet' });
    try {
        await wallet.initialize();
        const address = await wallet.getAddress();
        console.log('Deposit address:', address);
        const balance = await wallet.getBtcBalance();
        console.log('BTC balance:', balance);

        const version = await wallet.vssBackup();
        console.log('VSS backup done, server version:', version);
        const info = await wallet.vssBackupInfo();
        console.log('VSS backup info:', info);
    } finally {
        await wallet.dispose();
        console.log('Wallet disposed.');
    }
}

async function runVssRestore() {
    console.log('--- VSS restore ---');
    const { targetDir: restoredDir } = await restoreUtxoWalletFromVss({
        mnemonic: MNEMONIC,
        targetDir: TARGET_DIR,
    });
    console.log('Restored directory:', restoredDir);

    // const wallet = new UTEXOWallet(MNEMONIC, { dataDir: restoredDir, network: 'testnet' });
    // try {
    //     await wallet.initialize();
    //     const address = await wallet.getAddress();
    //     console.log('Restored wallet address:', address);
    //     const balance = await wallet.getBtcBalance();
    //     console.log('BTC balance:', balance);
    // } finally {
    //     await wallet.dispose();
    // }
}

const runRestore = true; // true = run VSS restore instead of backup
const main = runRestore ? runVssRestore : runVssBackup;

main()
    .then(() => {
        console.log('VSS example completed.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
