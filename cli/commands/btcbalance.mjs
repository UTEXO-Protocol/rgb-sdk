import { parseFlags, runWithWallet } from '../utils.mjs';

export async function run(walletName, flagArgs) {
    parseFlags(flagArgs, { required: [], optional: [] });
    await runWithWallet(walletName, async (wallet) => {
        const balance = await wallet.getBtcBalance();
        console.log('✅ BTC balance:');
        console.log(`  Vanilla: settled ${balance.vanilla.settled}, spendable ${balance.vanilla.spendable} sats`);
        console.log(`  Colored: settled ${balance.colored.settled}, spendable ${balance.colored.spendable} sats`);
    }, { quiet: true });
}
