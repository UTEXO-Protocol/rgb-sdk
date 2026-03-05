#!/usr/bin/env node

/**
 * Generate Keys Script
 * 
 * Generates new wallet keys and saves them to a JSON file.
 * 
 * Usage:
 *   node generate_keys.mjs <wallet_name> [network]
 * 
 * Examples:
 *   node generate_keys.mjs mywallet          # Uses default network (regtest)
 *   node generate_keys.mjs mywallet testnet  # Uses testnet
 */

import { generateKeys } from '../dist/index.mjs';
import { saveWalletConfig, handleError } from './utils.mjs';

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: node generate_keys.mjs <wallet_name> [network]');
        console.error('Example: node generate_keys.mjs mywallet');
        console.error('Example: node generate_keys.mjs mywallet testnet');
        process.exit(1);
    }

    const walletName = args[0];
    const network = args[1] || 'regtest';

    console.log(`Generating keys for wallet: ${walletName}`);
    console.log(`Network: ${network}`);

    try {
        // Generate keys
        const keys = await generateKeys(network);
        
        // Create wallet config object
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

        // Save to JSON file
        const filepath = saveWalletConfig(walletName, walletConfig);
        
        console.log(`\n✅ Keys generated successfully!`);
        console.log(`📁 Saved to: ${filepath}`);
        console.log(`\n⚠️  IMPORTANT: Keep your mnemonic safe and secure!`);
        console.log(`   Mnemonic: ${keys.mnemonic}`);
        console.log(`\nYou can now use this wallet with: node getaddress.mjs ${walletName}`);
        
    } catch (error) {
        handleError(error, 'generating keys');
    }
}

main();
