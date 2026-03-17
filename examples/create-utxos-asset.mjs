/**
 * Create UTXOs and issue a NIA asset for a UTEXO wallet.
 *
 * - createUtxos({ num, size })
 * - issueAssetNia({ ticker, name, amounts, precision })
 * - Requires indexer/network. Set MNEMONIC env to use your own wallet.
 *
 *  node examples/create-utxos-asset.mjs
 *  MNEMONIC="..." node examples/create-utxos-asset.mjs
 */

import { UTEXOWallet } from '../dist/index.mjs';

const NETWORK = 'testnet';
const MNEMONIC = "public oblige hour armor start bundle animal aerobic alien chaos excite measure";
// drastic vacuum age family between general melody elbow ball very require pulp
// const MNEMONIC = process.env.MNEMONIC || 'apple deposit job second wear metal zebra target filter chunk pill dynamic';
// const MNEMONIC = process.env.MNEMONIC || 'famous hurt miss favorite pitch rich rude cricket fault hammer split guilt';

async function main() {
    console.log('--- Create UTXOs and issue NIA asset ---');
    console.log('Network:', NETWORK);

    const wallet = new UTEXOWallet(MNEMONIC, { network: NETWORK });
    try {
        await wallet.initialize();
        const address = await wallet.getAddress();
        console.log('Wallet address:', address);

        const count = await wallet.createUtxos({ num: 20, size: 1000 });
        await wallet.syncWallet();
        console.log('Created %d UTXO(s)', count);

        // const asset = await wallet.issueAssetNia({
        //     ticker: 'DEMO',
        //     name: 'Demo NIA Asset',
        //     amounts: [1000,1000,1000,1000,1000,1000],
        //     precision: 0,
        // });
        // console.log('Issued NIA asset:', asset.assetId, asset.ticker, asset.name);
    } finally {
        await wallet.dispose();
    }

    console.log('Done.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
