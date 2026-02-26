import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['lnInvoice'], optional: ['maxFee'] }, { usage: options.usage });
    const request = { lnInvoice: opts.lnInvoice, ...(opts.maxFee && { maxFee: parseInt(opts.maxFee, 10) }) };
    await runWithWallet(walletName, async (wallet) => {
        const psbt = await wallet.payLightningInvoiceBegin(request);
        console.log(psbt);
    }, { quiet: true });
}
