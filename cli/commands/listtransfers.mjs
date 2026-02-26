import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs) {
    const opts = parseFlags(flagArgs, { required: [], optional: ['assetId'] });
    await runWithWallet(walletName, async (wallet) => {
        const transfers = await wallet.listTransfers(opts.assetId);
        console.log(JSON.stringify(transfers, null, 2));
        console.log(`✅ Total: ${Array.isArray(transfers) ? transfers.length : 0} transfer(s)`);
    }, { quiet: true });
}
