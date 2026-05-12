/**
 * Create a new UTEXO wallet from freshly generated keys.
 *
 * - Generates a new mnemonic via generateKeys(network)
 * - Creates UTEXOWallet with the mnemonic, initializes it
 * - Prints deposit address and reminds to back up the mnemonic
 *
 *  node examples/new-wallet.mjs
 */

import { generateKeys, UTEXOWallet } from '../dist/index.mjs';

const NETWORK = 'testnet';

async function main() {
    console.log('--- Create new wallet ---');
    console.log('Network:', NETWORK);

    const keys = await generateKeys(NETWORK);
    
    console.log('Mnemonic:', keys.mnemonic);

    const wallet = new UTEXOWallet(keys.mnemonic, { network: NETWORK, reuseAddresses: true });
    try {
        await wallet.initialize();
        const address = await wallet.getAddress();

        console.log('\nWallet ready:');
        console.log('Deposit address:', address);
        try {
            const balance = await wallet.getBtcBalance();
            console.log('BTC balance:', balance);
        } catch (e) {
            console.log('Error getting BTC balance');
        }
    } finally {
        await wallet.dispose();
    }

    console.log('\nDone.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
