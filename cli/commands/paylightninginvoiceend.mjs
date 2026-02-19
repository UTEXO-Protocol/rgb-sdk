import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['lnInvoice', 'signedPsbt'], optional: [] }, { usage: options.usage });
    await runWithWallet(walletName, async (wallet) => {
        const result = await wallet.payLightningInvoiceEnd({ lnInvoice: opts.lnInvoice, signedPsbt: opts.signedPsbt });
        console.log(JSON.stringify(result, null, 2));
    }, { quiet: true });
}
