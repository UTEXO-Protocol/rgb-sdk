/**
 * UTEXOWallet – regular (file) backup and restore only
 *
 * - Backup: create wallet, initialize, createBackup({ backupPath, password }) → one folder, wallet_<fp>_layer1.backup + wallet_<fp>_utexo.backup
 * - Restore: restoreUtxoWalletFromBackup({ backupPath, password, targetDir }), then wallet with dataDir
 *
 * Run (from repo root, after build): node examples/utexo-file-backup-restore.mjs
 */

import path from 'path';
import fs from 'fs/promises';
import { UTEXOWallet, restoreUtxoWalletFromBackup } from '../dist/index.mjs';

const MNEMONIC = 'top reject between sugar rug pulse radar coffee kiss faculty pool vocal';
const BACKUP_DIR = path.join(process.cwd(), 'backup-utexo-file');
const TARGET_DIR = path.join(process.cwd(), 'restored-utexo-file');
const PASSWORD = 'example-password';

async function runFileBackup() {
    console.log('--- File backup ---');
    const wallet = new UTEXOWallet(MNEMONIC,{network:'testnet'});
    try {
        await wallet.initialize();
        const address = await wallet.getAddress();
        console.log('Deposit address:', address);
        const balance = await wallet.getBtcBalance();
        console.log('BTC balance:', balance);

        await fs.mkdir(BACKUP_DIR, { recursive: true });
        const result = await wallet.createBackup({ backupPath: BACKUP_DIR, password: PASSWORD });
        console.log('File backup done:', result.layer1BackupPath, result.utexoBackupPath);
    } finally {
        await wallet.dispose();
        console.log('Wallet disposed.');
    }
}

async function runFileRestore() {
    console.log('--- File restore ---');
    const { layer1Path, utexoPath, targetDir: restoredDir } = restoreUtxoWalletFromBackup({
        backupPath: BACKUP_DIR,
        password: PASSWORD,
        targetDir: TARGET_DIR,
    });
    console.log('Restored layer1 to:', layer1Path);
    console.log('Restored utexo to:', utexoPath);

    const wallet = new UTEXOWallet(MNEMONIC, { dataDir: restoredDir, network:'testnet' });
    try {
        await wallet.initialize();
        const address = await wallet.getAddress();
        console.log('Restored wallet address:', address);
        const balance = await wallet.getBtcBalance();
        console.log('BTC balance:', balance);
    } finally {
        await wallet.dispose();
    }
}

const runRestore = true; // true = run file restore instead of backup
const main = runRestore ? runFileRestore : runFileBackup;

main()
    .then(() => {
        console.log('File backup/restore example completed.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
