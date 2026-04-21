/**
 * Generate keys, init with reuseAddresses, print deposit address + witness invoice.
 *
 *   node examples/witness-invoice-reuse.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import {
    generateKeys,
    deriveKeysFromMnemonic,
    UTEXOWallet,
    WalletManager,
} from '../dist/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NETWORK = 'testnet';
const WITNESS_AMOUNT = 100;
const dataDirRoot = path.join(__dirname, '..', '.example-witness-reuse');

async function runUtexoWallet() {
    const keys = await generateKeys(NETWORK);
    const wallet = new UTEXOWallet(keys.mnemonic, {
        network: NETWORK,
        reuseAddresses: true,
        dataDir: path.join(dataDirRoot, 'utexowallet'),
    });
    try {
        await wallet.initialize();
        const address = await wallet.getAddress();
        const witness = await wallet.witnessReceive({ amount: WITNESS_AMOUNT });

        console.log('--- UTEXOWallet (reuseAddresses: true) ---');
        console.log('Address:', address);
        console.log('Witness invoice:', witness.invoice);
        console.log('Witness receive (full):', JSON.stringify(witness, null, 2));
    } finally {
        await wallet.dispose();
    }
}

async function runWalletManager() {
    const keys = await generateKeys(NETWORK);
    const utexoKeys = await deriveKeysFromMnemonic('utexo', keys.mnemonic);

    const wm = new WalletManager({
        xpubVan: utexoKeys.accountXpubVanilla,
        xpubCol: utexoKeys.accountXpubColored,
        masterFingerprint: utexoKeys.masterFingerprint,
        mnemonic: keys.mnemonic,
        network: 'utexo',
        reuseAddresses: true,
        dataDir: path.join(
            dataDirRoot,
            'walletmanager',
            utexoKeys.masterFingerprint
        ),
    });

    try {
        await wm.initialize();
        const address = await wm.getAddress();
        const witness = await wm.witnessReceive({ amount: WITNESS_AMOUNT });

        console.log('--- WalletManager (network: utexo, reuseAddresses: true) ---');
        console.log('Address:', address);
        console.log('Witness invoice:', witness.invoice);
        console.log('Witness receive (full):', JSON.stringify(witness, null, 2));
    } finally {
        await wm.dispose();
    }
}

async function main() {
    console.log('Network (UTEXOWallet preset):', NETWORK);
    console.log('Witness amount:', WITNESS_AMOUNT);
    console.log('');

    await runUtexoWallet();
    console.log('');
    await runWalletManager();
    console.log('Done.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
