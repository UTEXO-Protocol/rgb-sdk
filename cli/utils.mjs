#!/usr/bin/env node

/**
 * Shared utilities for UTEXO test scripts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { UTEXOWallet, createWalletManager } from '../dist/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Directory name for wallet config files (relative to cli) */
const WALLET_DATA_DIR = 'data';

/**
 * Map wallet network (e.g. from generate_keys) to UTEXOWallet preset.
 * UTEXOWallet only supports 'mainnet' | 'testnet'; regtest/signet/testnet4 map to 'testnet'.
 * @param {string} network - Network from wallet config (mainnet, testnet, regtest, signet, testnet4)
 * @returns {'mainnet'|'testnet'}
 */
export function getNetworkPreset(network) {
    return network === 'mainnet' ? 'mainnet' : 'testnet';
}

/**
 * Get the directory path for wallet config files (cli/data)
 */
export function getWalletDir() {
    return path.join(__dirname, WALLET_DATA_DIR);
}

/**
 * Get the full path to a wallet config file
 * @param {string} walletName - Name of the wallet
 * @returns {string} Full path to the wallet config file
 */
export function getWalletPath(walletName) {
    const filename = `${walletName}.json`;
    return path.join(getWalletDir(), filename);
}

/**
 * Load wallet configuration from file
 * @param {string} walletName - Name of the wallet
 * @returns {object} Wallet configuration object
 * @throws {Error} If wallet file doesn't exist or is invalid
 */
export function loadWalletConfig(walletName) {
    const filepath = getWalletPath(walletName);
    
    if (!fs.existsSync(filepath)) {
        throw new Error(`Wallet config not found: ${filepath}`);
    }
    
    const configContent = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(configContent);
}

/**
 * Save wallet configuration to file
 * @param {string} walletName - Name of the wallet
 * @param {object} config - Wallet configuration object
 */
export function saveWalletConfig(walletName, config) {
    const dir = getWalletDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filepath = getWalletPath(walletName);
    fs.writeFileSync(filepath, JSON.stringify(config, null, 2));
    return filepath;
}

/**
 * Check if wallet config exists
 * @param {string} walletName - Name of the wallet
 * @returns {boolean} True if wallet config exists
 */
export function walletExists(walletName) {
    return fs.existsSync(getWalletPath(walletName));
}

/**
 * Handle script errors with consistent formatting
 * @param {Error} error - Error object
 * @param {string} action - Action that failed (e.g., "generating keys", "getting address")
 */
export function handleError(error, action) {
    console.error(`❌ Error ${action}:`, error.message);
    if (error.stack) {
        console.error(error.stack);
    }
    process.exit(1);
}

/**
 * Parse flag args (e.g. after command and wallet name) into an options object.
 * Flags are --key value (next arg). Does not include wallet name.
 * @param {string[]} flagArgs - Args to parse (e.g. process.argv.slice(2) for rest after wallet)
 * @param {{ required?: string[], optional?: string[] }} spec - Flag names (without --). required = must be present.
 * @param {{ usage?: string }} options - If usage is set and validation fails, print it and exit
 * @returns {{ [k: string]: string }} Parsed options (e.g. { invoice: 'rgb:...', assetId: '...' })
 */
export function parseFlags(flagArgs, spec = {}, options = {}) {
    const required = spec.required ?? [];
    const optional = spec.optional ?? [];
    const allNames = [...new Set([...required, ...optional])];
    const result = {};

    for (let i = 0; i < flagArgs.length; i++) {
        const arg = flagArgs[i];
        if (!arg.startsWith('--')) continue;
        const name = arg.slice(2);
        if (!allNames.includes(name)) continue;
        const value = flagArgs[i + 1];
        if (value === undefined || value.startsWith('--')) {
            if (options.usage) {
                console.error(options.usage);
                process.exit(1);
            }
            throw new Error(`Missing value for --${name}`);
        }
        result[name] = value;
        i++;
    }

    for (const name of required) {
        if (result[name] === undefined || result[name] === '') {
            if (options.usage) {
                console.error(options.usage);
                process.exit(1);
            }
            throw new Error(`Missing required --${name}`);
        }
    }
    return result;
}

/**
 * Load wallet, create UTEXOWallet, initialize, call action, then dispose. Central error handling.
 * @param {string} walletName - Name of the wallet (must exist in data/)
 * @param {(wallet: UTEXOWallet, walletConfig: object) => Promise<void>} action - Async callback; receives initialized wallet and config
 * @param {{ actionName?: string, quiet?: boolean }} options - actionName for errors; quiet=true skips loading/init logs
 */
export async function runWithWallet(walletName, action, options = {}) {
    if (!walletName) {
        console.error('❌ Missing wallet name');
        process.exit(1);
    }
    if (!walletExists(walletName)) {
        console.error(`❌ Wallet config not found: ${walletName}.json`);
        console.error(`   Please generate keys first: npm run generate_keys -- ${walletName}`);
        process.exit(1);
    }

    const walletConfig = loadWalletConfig(walletName);
    const wallet = new UTEXOWallet(walletConfig.mnemonic, {
        network: getNetworkPreset(walletConfig.network),
    });

    try {
        if (!options.quiet) {
            console.log(`Loading wallet: ${walletConfig.walletName}`);
            console.log(`Network: ${walletConfig.network}`);
            console.log('Initializing wallet...');
        }
        await wallet.initialize();
        await action(wallet, walletConfig);
    } finally {
        await wallet.dispose();
    }
}

/**
 * Load wallet config, create WalletManager (from stored generate_keys JSON), run action, then dispose.
 * Same flow as runWithWallet but for standard RGB WalletManager instead of UTEXOWallet.
 * @param {string} walletName - Name of the wallet (must exist in data/)
 * @param {(wallet: import('../dist/index.mjs').WalletManager, walletConfig: object) => Promise<void>} action
 * @param {{ actionName?: string, quiet?: boolean, indexerUrl?: string, transportEndpoint?: string, dataDir?: string }} options
 */
export async function runWithWalletManager(walletName, action, options = {}) {
    if (!walletName) {
        console.error('❌ Missing wallet name');
        process.exit(1);
    }
    if (!walletExists(walletName)) {
        console.error(`❌ Wallet config not found: ${walletName}.json`);
        console.error(`   Please generate keys first: node run.mjs generate_keys ${walletName} [network]`);
        process.exit(1);
    }

    const walletConfig = loadWalletConfig(walletName);
    const dataDir = options.dataDir ?? path.join(process.cwd(), '.rgb-wallet', String(walletConfig.network), walletConfig.masterFingerprint);
    const wallet = createWalletManager({
        xpubVan: walletConfig.accountXpubVanilla,
        xpubCol: walletConfig.accountXpubColored,
        masterFingerprint: walletConfig.masterFingerprint,
        mnemonic: walletConfig.mnemonic,
        network: walletConfig.network,
        dataDir,
        transportEndpoint: options.transportEndpoint ?? process.env.RGB_TRANSPORT_ENDPOINT,
        indexerUrl: options.indexerUrl ?? process.env.RGB_INDEXER_URL,
    });

    try {
        if (!options.quiet) {
            console.log(`Loading wallet (WalletManager): ${walletConfig.walletName ?? walletName}`);
            console.log(`Network: ${walletConfig.network}`);
        }
        if (options.indexerUrl ?? process.env.RGB_INDEXER_URL) {
            await wallet.goOnline(options.indexerUrl ?? process.env.RGB_INDEXER_URL);
        }
        await action(wallet, walletConfig);
    } finally {
        await wallet.dispose();
    }
}
