import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['invoice'], optional: ['assetId', 'amount', 'mnemonic'] }, { usage: options.usage });
    await runWithWallet(walletName, async (wallet, walletConfig) => {
        const mnemonic = opts.mnemonic || walletConfig.mnemonic;
        const request = { invoice: opts.invoice, ...(opts.assetId && { assetId: opts.assetId }), ...(opts.amount && { amount: parseInt(opts.amount, 10) }) };
        const result = await wallet.onchainSend(request, mnemonic);
        console.log(JSON.stringify(result, null, 2));
    }, { quiet: true });
}
