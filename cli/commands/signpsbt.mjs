import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['psbt'], optional: ['mnemonic'] }, { usage: options.usage });
    await runWithWallet(walletName, async (wallet, walletConfig) => {
        const mnemonic = opts.mnemonic || walletConfig.mnemonic;
        const signed = await wallet.signPsbt(opts.psbt, mnemonic);
        console.log(signed);
    }, { quiet: true });
}
