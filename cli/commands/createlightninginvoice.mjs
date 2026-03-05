import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['assetId', 'amount'], optional: ['amountSats', 'expirySeconds'] }, { usage: options.usage });
    const request = {
        asset: { assetId: opts.assetId, amount: parseInt(opts.amount, 10) },
        ...(opts.amountSats && { amountSats: parseInt(opts.amountSats, 10) }),
        ...(opts.expirySeconds && { expirySeconds: parseInt(opts.expirySeconds, 10) }),
    };
    await runWithWallet(walletName, async (wallet) => {
        const result = await wallet.createLightningInvoice(request);
        console.log(JSON.stringify(result, null, 2));
    }, { quiet: true });
}
