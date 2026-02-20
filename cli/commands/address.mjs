#!/usr/bin/env node

/**
 * address command: get wallet address
 */

import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs) {
    parseFlags(flagArgs, { required: [], optional: [] });

    await runWithWallet(walletName, async (wallet) => {
        const address = await wallet.getAddress();
        console.log(`✅ Address: ${address}`);
    }, { quiet: true });
}
