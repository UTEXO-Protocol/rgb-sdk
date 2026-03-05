/**
 * On-chain bridge flow: onchainReceive + onchainSend.
 *
 * - Wallet B (receiver): onchainReceive → mainnet invoice.
 * - Wallet A (sender): onchainSend → pay that invoice from UTEXO.
 *
 * Usage (from repo root, after build):
 *   MNEMONIC_A="..." MNEMONIC_B="..." ASSET_ID="rgb:..." AMOUNT=10 node examples/onchain-flow.mjs
 * 
 */

import { UTEXOWallet } from '../dist/index.mjs';

const NETWORK = 'testnet';
const MNEMONIC_A =
    process.env.MNEMONIC_A ||
    'top reject between sugar rug pulse radar coffee kiss faculty pool vocal';
const MNEMONIC_B =
    process.env.MNEMONIC_B ||
    'famous hurt miss favorite pitch rich rude cricket fault hammer split guilt';

const ASSET_ID = process.env.ASSET_ID || 'rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0';
const AMOUNT = Number(process.env.AMOUNT || '10'); // in asset units

async function main() {
    console.log('--- Onchain bridge flow (2 wallets) ---');
    console.log('Network:', NETWORK);
    console.log('Asset ID:', ASSET_ID || '<required via ASSET_ID env>');
    console.log('Amount:', AMOUNT);

    if (!ASSET_ID) {
        console.error('ASSET_ID env var is required.');
        process.exit(1);
    }

    const walletA = new UTEXOWallet(MNEMONIC_A, { network: NETWORK });
    const walletB = new UTEXOWallet(MNEMONIC_B, { network: NETWORK });

    try {
        await walletA.initialize();
        await walletB.initialize();

        console.log('Wallet A address:', await walletA.getAddress());
        console.log('Wallet B address:', await walletB.getAddress());

        // 1) Wallet B: onchainReceive – get mainnet invoice
        const { invoice } = await walletB.onchainReceive({
            assetId: ASSET_ID,
            amount: AMOUNT,
        });
        console.log('\nMainnet invoice (Wallet B onchainReceive):');
        console.log(invoice);

        const status = await walletA.getOnchainSendStatus(invoice);
        console.log('\nOnchain send status (Wallet A getOnchainSendStatus):');
        console.log(status);

        // 2) Wallet A: onchainSend – pay that mainnet invoice from UTEXO
        const sendResult = await walletA.onchainSend({ invoice });
        console.log('\nOnchain send result (Wallet A onchainSend):');

        await walletA.refreshWallet();
        await walletB.refreshWallet();
        await new Promise(resolve => setTimeout(resolve, 10000));
        await walletA.refreshWallet();
        await walletB.refreshWallet();

        const status2 = await walletA.getOnchainSendStatus(invoice);
        console.log('\nOnchain send status2 (Wallet A getOnchainSendStatus):');
        console.log(status2);


        console.log(sendResult);
    } finally {
        await walletA.dispose();
        await walletB.dispose();
    }

    console.log('\nOnchain flow completed.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
