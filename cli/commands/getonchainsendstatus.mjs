#!/usr/bin/env node

/**
 * getonchainsendstatus command: get onchain send status for an invoice
 */

import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const { usage } = options;
    const opts = parseFlags(flagArgs, { required: ['invoice'], optional: [] }, {
        usage: usage ? `❌ --invoice "<invoice_string>" is required\n\n${usage}` : undefined,
    });

    await runWithWallet(walletName, async (wallet) => {
        const status = await wallet.getOnchainSendStatus(opts.invoice);
        console.log(status === null ? '✅ No transfer found for this invoice' : `✅ Status: ${status}`);
        if (status !== null) console.log(JSON.stringify(status, null, 2));
    }, { quiet: true });
}
