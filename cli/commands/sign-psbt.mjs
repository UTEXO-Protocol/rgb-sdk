/**
 * Sign a PSBT with mnemonic + network only. No wallet, no goOnline.
 * Usage: utexo sign-psbt --psbt "<base64>" --network <testnet|mainnet|signet|regtest> --mnemonic "<words>"
 */
import { parseFlags } from '../utils.mjs';
import { signPsbt } from '../../dist/index.mjs';

export async function run(walletName, flagArgs, options = {}) {
    const opts = parseFlags(flagArgs, { required: ['psbt', 'network', 'mnemonic'], optional: [] }, { usage: options.usage });
    const signed = await signPsbt(opts.mnemonic, opts.psbt, opts.network);
    console.log(signed);
}
