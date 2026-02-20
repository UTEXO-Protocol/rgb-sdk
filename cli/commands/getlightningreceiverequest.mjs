import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['lnInvoice'], optional: [] }, { usage: options.usage });
    await runWithWallet(walletName, async (wallet) => {
        const status = await wallet.getLightningReceiveRequest(opts.lnInvoice);
        console.log(status === null ? '✅ No transfer found' : `✅ Status: ${status}`);
        if (status !== null) console.log(JSON.stringify(status, null, 2));
    }, { quiet: true });
}
