import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs) {
    parseFlags(flagArgs, { required: [], optional: [] });
    await runWithWallet(walletName, async (wallet) => {
        const assets = await wallet.listAssets();
        console.log(JSON.stringify(assets, null, 2));
        const n = (assets.nia?.length || 0) + (assets.uda?.length || 0) + (assets.cfa?.length || 0) + (assets.ifa?.length || 0);
        console.log(`✅ Total: ${n} asset(s)`);
    }, { quiet: true });
}
