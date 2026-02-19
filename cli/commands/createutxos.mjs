import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs) {
    const opts = parseFlags(flagArgs, { required: [], optional: ['num', 'size', 'feeRate'] });
    const upTo = flagArgs.includes('--upTo');
    const num = opts.num ? parseInt(opts.num, 10) : 5;
    const size = opts.size ? parseInt(opts.size, 10) : 1000;
    const feeRate = opts.feeRate ? parseInt(opts.feeRate, 10) : 1;
    await runWithWallet(walletName, async (wallet) => {
        const count = await wallet.createUtxos({ num, size, feeRate, upTo: upTo || undefined });
        console.log(`✅ Created ${count} UTXO(s)`);
    }, { quiet: true });
}
