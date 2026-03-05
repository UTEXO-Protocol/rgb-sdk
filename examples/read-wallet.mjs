/**
 * Read wallet info: initialize by mnemonic and call read-only functions.
 *
 * - getXpub, getNetwork, getAddress (no indexer)
 * - getBtcBalance, listAssets (require indexer/network)
 *
 *  node examples/read-wallet.mjs
 *  MNEMONIC="your mnemonic" node examples/read-wallet.mjs
 */

import { UTEXOWallet } from '../dist/index.mjs';

const NETWORK = 'testnet';
// const MNEMONIC = process.env.MNEMONIC || 'top reject between sugar rug pulse radar coffee kiss faculty pool vocal';
const MNEMONIC = process.env.MNEMONIC || 'famous hurt miss favorite pitch rich rude cricket fault hammer split guilt';

async function main() {
    console.log('--- Read wallet ---');
    console.log('Network:', NETWORK);

    const wallet = new UTEXOWallet(MNEMONIC, { network: NETWORK });
    try {
        await wallet.initialize();
        console.log('Syncing wallet...');
        await wallet.syncWallet();
        const xpub = wallet.getXpub();
        console.log('\ngetXpub:', xpub);

        const network = wallet.getNetwork();
        console.log('getNetwork:', network);

        const address = await wallet.getAddress();
        console.log('getAddress:', address);

        try {
            const balance = await wallet.getBtcBalance();
            console.log('getBtcBalance:', balance);
        } catch (e) {
            console.log('getBtcBalance: (indexer offline or no network)');
        }

        try {
            const assets = await wallet.listAssets();
            console.log('listAssets:', assets);
        } catch (e) {
            console.log('listAssets: (indexer offline or no network)');
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
