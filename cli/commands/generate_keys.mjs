/**
 * Generate new wallet keys and save to cli/data/<wallet_name>.json
 * Usage: utexo generate_keys <wallet_name> [network]
 *   network: regtest (default), testnet, mainnet
 */

import { generateKeys } from '../../dist/index.mjs';
import { saveWalletConfig } from '../utils.mjs';

export async function run(walletName, flagArgs, { usage } = {}) {
    if (!walletName) {
        console.error('Usage: utexo generate_keys <wallet_name> [network]');
        if (usage) console.error(usage);
        process.exit(1);
    }

    const network = flagArgs[0] || 'regtest';
    const keys = await generateKeys(network);

    const walletConfig = {
        walletName,
        network,
        mnemonic: keys.mnemonic,
        xpub: keys.xpub,
        accountXpubVanilla: keys.accountXpubVanilla,
        accountXpubColored: keys.accountXpubColored,
        masterFingerprint: keys.masterFingerprint,
        xpriv: keys.xpriv,
        createdAt: new Date().toISOString(),
    };

    const filepath = saveWalletConfig(walletName, walletConfig);
    console.log(`✅ Keys saved to ${filepath}`);
    console.log(`   Network: ${network}`);
}
