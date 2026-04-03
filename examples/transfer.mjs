/**
 * Transfer example: 2 wallets (2 mnemonics), 1 witness receive + 1 blind receive, refresh, listTransfers.
 *
 * Assumes UTXOs and asset already exist (e.g. from create-utxos-asset.mjs); wallets must be funded.
 * - Wallet A (sender): init, send to B (witness + blind).
 * - Wallet B (receiver): init, witnessReceive + blindReceive (invoices).
 * - Both: refreshWallet(), listTransfers(assetId).
 *
 *  ASSET_ID="rgb:..." MNEMONIC_A="..." MNEMONIC_B="..." node examples/transfer.mjs
 */

import { UTEXOWallet } from '../dist/index.mjs';

const NETWORK = 'testnet';
const MNEMONIC_A = process.env.MNEMONIC_A || 'paddle smooth humble inherit reason basic brave clerk absorb later text that';
const MNEMONIC_B = process.env.MNEMONIC_B || 'tobacco dinner advice together repeat digital need cancel lift near blind cute';
const ASSET_ID = process.env.ASSET_ID||'rgb:4PhQDg98-kFPjSKO-HdbJOXo-IWt6P~a-HeVZA8L-A~tvBNU';
if (!ASSET_ID) {
    console.error('ASSET_ID is required (e.g. from create-utxos-asset.mjs output)');
    process.exit(1);
}

async function main() {
    console.log('--- Transfer: 2 wallets, witness + blind receive ---');
    console.log('Network:', NETWORK);
    console.log('Asset:', ASSET_ID);

    const walletA = new UTEXOWallet(MNEMONIC_A, { network: NETWORK });
    const walletB = new UTEXOWallet(MNEMONIC_B, { network: NETWORK });

    try {
        await walletA.initialize();
        await walletB.initialize();

        await walletB.refreshWallet();
        await walletA.refreshWallet();

        console.log('Wallet A address:', await walletA.getAddress());
        console.log('Wallet B address:', await walletB.getAddress());

        const amountWitness = 10;
        const amountBlind = 20;

        const invWitness = await walletB.witnessReceive({ amount: amountWitness });
        console.log('Wallet B witness invoice created');
        const sendWitness = await walletA.send({
            invoice: invWitness.invoice,
            assetId: ASSET_ID,
            amount: amountWitness,
            witnessData: { amountSat: 1000 },
        });
        console.log('Witness transfer sent:', sendWitness);

        const invBlind = await walletB.blindReceive({ amount: amountBlind });
        console.log('Wallet B blind invoice created');
        const sendBlind = await walletA.send({
            invoice: invBlind.invoice,
            assetId: ASSET_ID,
            amount: amountBlind,
        });
        console.log('Blind transfer sent:', sendBlind);
        await walletB.refreshWallet();
        // // delay for 10 seconds
        await new Promise(resolve => setTimeout(resolve, 120000));
        console.log('wait 3 confirmations');

        await walletB.refreshWallet();
        await walletA.refreshWallet();

        // const transfersA = await walletA.listTransfers(ASSET_ID); // sent stansfer should be settled
        // const transfersB = await walletB.listTransfers(ASSET_ID); // received transfer should be settled
        // console.log('Wallet A listTransfers:', transfersA.length, transfersA);
        // console.log('allet B listTransfers:', transfersB.length, transfersB);
    } finally {
        await walletA.dispose();
        await walletB.dispose();
    }

    console.log('Done.');
}
main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
