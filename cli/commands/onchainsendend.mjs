import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['invoice', 'signedPsbt'], optional: [] }, { usage: options.usage });
    await runWithWallet(walletName, async (wallet) => {
        const result = await wallet.onchainSendEnd({ invoice: opts.invoice, signedPsbt: opts.signedPsbt });
        console.log(JSON.stringify(result, null, 2));
    }, { quiet: true });
}
