import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['invoice'], optional: [] }, { usage: options.usage });
    await runWithWallet(walletName, async (wallet) => {
        const result = await wallet.decodeRGBInvoice({ invoice: opts.invoice });
        console.log(JSON.stringify(result, null, 2));
    }, { quiet: true });
}
