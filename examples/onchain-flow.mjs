/**
 * On-chain bridge flow: onchainReceive + onchainSend.
 *
 * - Receiver: onchainReceive → mainnet invoice.
 * - Sender: onchainSend → pay that invoice from UTEXO.
 *
 * Usage (from repo root, after build):
 *   MNEMONIC_A="..." MNEMONIC_B="..." ASSET_ID="rgb:..." AMOUNT=10 node examples/onchain-flow.mjs
 * 
 */

import { UTEXOWallet } from '../dist/index.mjs';

const NETWORK = 'testnet';
const MNEMONIC_A =
  process.env.MNEMONIC_A ||
  'drastic vacuum age family between general melody elbow ball very require pulp';
const MNEMONIC_B =
  process.env.MNEMONIC_B ||
  'public oblige hour armor start bundle animal aerobic alien chaos excite measure';

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

    const receiver = new UTEXOWallet(MNEMONIC_A, { network: NETWORK });
    const sender = new UTEXOWallet(MNEMONIC_B, { network: NETWORK });

    try {
        await receiver.initialize();
        await sender.initialize();

        console.log('Receiver address:', await receiver.getAddress());
        console.log('Sender address:', await sender.getAddress());

        // 1) Receiver: onchainReceive – get mainnet invoice
        const { invoice } = await receiver.onchainReceive({
            assetId: ASSET_ID,
            amount: AMOUNT,
        });
        console.log('\nMainnet invoice (Receiver onchainReceive):');
        console.log(invoice);

        const status = await sender.getOnchainSendStatus(invoice);
        console.log('\nOnchain send status (Sender getOnchainSendStatus):');
        console.log(status);

        // 2) Sender: onchainSend – pay that mainnet invoice from UTEXO
        const sendResult = await sender.onchainSend({ invoice });
        console.log('\nOnchain send result (Sender onchainSend):');

        await sender.refreshWallet();
        await receiver.refreshWallet();
        await new Promise(resolve => setTimeout(resolve, 10000));
        await sender.refreshWallet();
        await receiver.refreshWallet();

        const status2 = await sender.getOnchainSendStatus(invoice);
        console.log('\nOnchain send status2 (Sender getOnchainSendStatus):');
        console.log(status2);


        console.log(sendResult);
    } finally {
        await sender.dispose();
        await receiver.dispose();
    }

    console.log('\nOnchain flow completed.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
