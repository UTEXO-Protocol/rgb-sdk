import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, {
        required: ['invoice'],
        optional: ['assetId', 'amount', 'mnemonic', 'feeRate', 'minConfirmations', 'witnessData'],
    }, { usage: options.usage });
    await runWithWallet(walletName, async (wallet, walletConfig) => {
        const mnemonic = opts.mnemonic || walletConfig.mnemonic;
        let witnessData;
        if (opts.witnessData) {
            try {
                witnessData = JSON.parse(opts.witnessData);
                if (typeof witnessData.amountSat !== 'number') witnessData.amountSat = parseInt(witnessData.amountSat, 10);
                if (witnessData.blinding != null && typeof witnessData.blinding !== 'number') witnessData.blinding = parseInt(witnessData.blinding, 10);
            } catch (e) {
                throw new Error('--witnessData must be valid JSON, e.g. \'{"amountSat":1000,"blinding":123}\'');
            }
        }
        const request = {
            invoice: opts.invoice,
            ...(opts.assetId && { assetId: opts.assetId }),
            ...(opts.amount && { amount: parseInt(opts.amount, 10) }),
            ...(opts.feeRate && { feeRate: parseInt(opts.feeRate, 10) }),
            ...(opts.minConfirmations && { minConfirmations: parseInt(opts.minConfirmations, 10) }),
            ...(witnessData && { witnessData }),
        };
        const result = await wallet.send(request, mnemonic);
        console.log(JSON.stringify(result, null, 2));
    }, { quiet: true });
}
