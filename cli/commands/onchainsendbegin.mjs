import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['invoice'], optional: [] }, { usage: options.usage });
    await runWithWallet(walletName, async (wallet) => {
        const psbt = await wallet.onchainSendBegin({ invoice: opts.invoice });
        console.log(psbt);
    }, { quiet: true });
}
