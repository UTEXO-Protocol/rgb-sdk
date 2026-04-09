/**
 * Address rotation for the UTEXO RGB wallet (rgb-lib).
 *
 * - `reuseAddresses: false` — do not reuse the same receive addresses (rotation ON; SDK default).
 *   Set `reuseAddresses: true` to reuse addresses (rotation OFF).
 * - `rotateVanillaAddress()` / `rotateColoredAddress()` — manually advance vanilla or colored
 *   receive derivation (see rgb-lib).
 *
 * Only the utexo wallet instance reads `reuseAddresses`; layer1 is unchanged.
 *
 *  node examples/rotate-address.mjs
 *  MNEMONIC="..." ROTATION=true node examples/rotate-address.mjs
 */

import { UTEXOWallet } from '../dist/index.mjs';

const NETWORK = process.env.NETWORK || 'testnet';
const MNEMONIC =
    process.env.MNEMONIC ||
    'hybrid fame undo length tennis field cruel income media memory embrace reason';

/** When true, pass `reuseAddresses: false` (derive new addresses instead of reusing). */
const ROTATION =
    process.env.ROTATION === undefined ? true : process.env.ROTATION === 'true';

async function main() {
    console.log('--- Rotate address (UTXO RGB wallet) ---');
    console.log('Network:', NETWORK);
    console.log('Address rotation ON (reuseAddresses: false):', ROTATION);

    const wallet = new UTEXOWallet(MNEMONIC, {
        network: NETWORK,
        reuseAddresses: true,
    });

    try {
        await wallet.initialize();

        for (let i = 0; i < 5; i++) {
        let addr0 = await wallet.getAddress();
        console.log('getAddress (current):', addr0);
        }

        const vanilla = await wallet.rotateVanillaAddress();
        console.log('rotateVanillaAddress →', vanilla);

        const colored = await wallet.rotateColoredAddress();
        console.log('rotateColoredAddress →', colored);

        for (let i = 0; i < 5; i++) {
            let addr0 = await wallet.getAddress();
            console.log('getAddress (current):', addr0);
            }
    

        try {
            await wallet.syncWallet();
            console.log('syncWallet: ok');
            const balance = await wallet.getBtcBalance();
            console.log('balance →',balance);
        } catch (e) {
            console.log('error →', JSON.stringify(e, null, 2));
            console.log('syncWallet: skipped (indexer unavailable or invalid URL)');
        }
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
