/**
 * Lightning bridge flow: createLightningInvoice + payLightningInvoice.
 *
 * - Wallet B (receiver): createLightningInvoice → Lightning invoice for receiving.
 * - Wallet A (sender): payLightningInvoice → pay that Lightning invoice from UTEXO.
 *
 * Usage (from repo root, after build):
 *   MNEMONIC_A="..." MNEMONIC_B="..." ASSET_ID="rgb:..." AMOUNT=10 node examples/lightning-flow.mjs
 *
 * For external Lightning invoices (pay to any LN invoice), use:
 *   MNEMONIC_A="..." LN_INVOICE="lnbc..." ASSET_ID="rgb:..." AMOUNT=10 node examples/lightning-flow.mjs
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
const LN_INVOICE = process.env.LN_INVOICE; // optional: external Lightning invoice to pay

async function main() {
    console.log('--- Lightning bridge flow (2 wallets) ---');
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

        let lnInvoice;

        if (LN_INVOICE) {
            // Pay external Lightning invoice (Wallet A -> any LN address)
            lnInvoice = LN_INVOICE;
            console.log('\nUsing external Lightning invoice:', lnInvoice.substring(0, 50) + '...');
        } else {
            // 1) Wallet B: createLightningInvoice – get Lightning invoice for receiving
            const { lnInvoice: inv } = await walletB.createLightningInvoice({
                asset: { assetId: ASSET_ID, amount: AMOUNT },
            });
            lnInvoice = inv;
            console.log('\nLightning invoice (Wallet B createLightningInvoice):');
            console.log(lnInvoice);
        }

        // 2) Wallet A: payLightningInvoice – pay that Lightning invoice from UTEXO
        const sendResult = await walletA.payLightningInvoice({
            lnInvoice,
            amount: AMOUNT,
            assetId: ASSET_ID,
        });

        console.log('\nLightning send result (Wallet A payLightningInvoice):');
        console.log(sendResult);

        await walletA.refreshWallet();
        await walletB.refreshWallet();

        const status = await walletA.getLightningSendRequest(lnInvoice);
        console.log('\nLightning send status (Wallet A getLightningSendRequest):');
        console.log(status);
    } finally {
        await walletA.dispose();
        await walletB.dispose();
    }

    console.log('\nLightning flow completed.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
