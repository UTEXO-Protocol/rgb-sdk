import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs) {
    parseFlags(flagArgs, { required: [], optional: [] });
    await runWithWallet(walletName, async (wallet) => {
        const unspents = await wallet.listUnspents();
        console.log(JSON.stringify(unspents, null, 2));
        console.log(`✅ Total: ${Array.isArray(unspents) ? unspents.length : 0} unspent(s)`);
    }, { quiet: true });
}
