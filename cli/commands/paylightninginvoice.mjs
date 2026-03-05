import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['lnInvoice'], optional: ['amount', 'assetId', 'maxFee', 'mnemonic'] }, { usage: options.usage });
    await runWithWallet(walletName, async (wallet, walletConfig) => {
        const mnemonic = opts.mnemonic || walletConfig.mnemonic;
        const request = { lnInvoice: opts.lnInvoice, ...(opts.amount && { amount: parseInt(opts.amount, 10) }), ...(opts.assetId && { assetId: opts.assetId }), ...(opts.maxFee && { maxFee: parseInt(opts.maxFee, 10) }) };
        const result = await wallet.payLightningInvoice(request, mnemonic);
        console.log(JSON.stringify(result, null, 2));
    }, { quiet: true });
}
