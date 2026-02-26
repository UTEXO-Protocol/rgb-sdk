import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['amount'], optional: ['assetId', 'minConfirmations', 'durationSeconds'] }, { usage: options.usage });
    const request = {
        amount: parseInt(opts.amount, 10),
        ...(opts.assetId && { assetId: opts.assetId }),
        ...(opts.minConfirmations && { minConfirmations: parseInt(opts.minConfirmations, 10) }),
        ...(opts.durationSeconds && { durationSeconds: parseInt(opts.durationSeconds, 10) }),
    };
    await runWithWallet(walletName, async (wallet) => {
        const result = await wallet.onchainReceive(request);
        console.log(JSON.stringify(result, null, 2));
        if (result?.invoice) console.log('\nMainnet invoice:', result.invoice);
    }, { quiet: true });
}
