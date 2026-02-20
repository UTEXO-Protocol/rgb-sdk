import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs) {
    parseFlags(flagArgs, { required: [], optional: [] });
    await runWithWallet(walletName, async (wallet) => {
        await wallet.refreshWallet();
        console.log('✅ Wallet refreshed');
    }, { quiet: true });
}
