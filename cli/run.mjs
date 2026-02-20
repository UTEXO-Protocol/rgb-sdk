#!/usr/bin/env node

/**
 * Single entrypoint for UTEXO CLI commands.
 * Usage: utexo <command> <wallet_name> [options...]
 */

import { handleError } from './utils.mjs';
import { run as runAddress } from './commands/address.mjs';
import { run as runBtcbalance } from './commands/btcbalance.mjs';
import { run as runListassets } from './commands/listassets.mjs';
import { run as runListtransfers } from './commands/listtransfers.mjs';
import { run as runRefresh } from './commands/refresh.mjs';
import { run as runListunspents } from './commands/listunspents.mjs';
import { run as runGetOnchainSendStatus } from './commands/getonchainsendstatus.mjs';
import { run as runDecodergbinvoice } from './commands/decodergbinvoice.mjs';
import { run as runBlindreceive } from './commands/blindreceive.mjs';
import { run as runWitnessreceive } from './commands/witnessreceive.mjs';
import { run as runOnchainreceive } from './commands/onchainreceive.mjs';
import { run as runCreateutxos } from './commands/createutxos.mjs';
import { run as runOnchainsendbegin } from './commands/onchainsendbegin.mjs';
import { run as runSignpsbt } from './commands/signpsbt.mjs';
import { run as runOnchainsendend } from './commands/onchainsendend.mjs';
import { run as runOnchainsend } from './commands/onchainsend.mjs';
import { run as runSend } from './commands/send.mjs';
import { run as runCreatelightninginvoice } from './commands/createlightninginvoice.mjs';
import { run as runPaylightninginvoicebegin } from './commands/paylightninginvoicebegin.mjs';
import { run as runPaylightninginvoice } from './commands/paylightninginvoice.mjs';
import { run as runPaylightninginvoiceend } from './commands/paylightninginvoiceend.mjs';
import { run as runGetlightningsendrequest } from './commands/getlightningsendrequest.mjs';
import { run as runGetlightningreceiverequest } from './commands/getlightningreceiverequest.mjs';
import { run as runGenerateKeys } from './commands/generate_keys.mjs';

const args = process.argv.slice(2);
const command = args[0];
const walletName = args[1];
const flagArgs = args.slice(2);

export const USAGE = `Usage: utexo <command> <wallet_name> [options...]

Commands (no extra flags): address, btcbalance, listassets, listtransfers, refresh, listunspents
  utexo address <wallet>
  utexo btcbalance <wallet>
  utexo listassets <wallet> [--assetId <id>]
  utexo listtransfers <wallet> [--assetId <id>]
  utexo refresh <wallet>
  utexo listunspents <wallet>

Onchain: getonchainsendstatus, onchainreceive, onchainsendbegin, onchainsendend, onchainsend, send
  utexo getonchainsendstatus <wallet> --invoice "<inv>"
  utexo onchainreceive <wallet> --amount <n> [--assetId <id>] [--minConfirmations <n>] [--durationSeconds <n>]
  utexo onchainsendbegin <wallet> --invoice "<inv>"
  utexo onchainsendend <wallet> --invoice "<inv>" --signedPsbt "<psbt>"
  utexo onchainsend <wallet> --invoice "<inv>" [--mnemonic "<mn>"]
  utexo send <wallet> --invoice "<inv>" [--assetId <id>] [--amount <n>] [--witnessData "<json>"] [--mnemonic "<mn>"] [--feeRate <n>] [--minConfirmations <n>]

Receive invoices: blindreceive, witnessreceive
  utexo blindreceive <wallet> --amount <n> [--assetId <id>] [--minConfirmations <n>] [--durationSeconds <n>]
  utexo witnessreceive <wallet> --amount <n> [--assetId <id>] [--minConfirmations <n>] [--durationSeconds <n>]

Lightning: createlightninginvoice, paylightninginvoicebegin, paylightninginvoice, paylightninginvoiceend, getlightningsendrequest, getlightningreceiverequest
  utexo createlightninginvoice <wallet> --assetId <id> --amount <n> [--amountSats <n>] [--expirySeconds <n>]
  utexo paylightninginvoicebegin <wallet> --lnInvoice "<inv>" [--maxFee <n>]
  utexo paylightninginvoice <wallet> --lnInvoice "<inv>" [--amount <n>] [--assetId <id>] [--maxFee <n>] [--mnemonic "<mn>"]
  utexo paylightninginvoiceend <wallet> --lnInvoice "<inv>" --signedPsbt "<psbt>"
  utexo getlightningsendrequest <wallet> --lnInvoice "<inv>"
  utexo getlightningreceiverequest <wallet> --lnInvoice "<inv>"

Other: decodergbinvoice, createutxos, signpsbt, generate_keys
  utexo decodergbinvoice <wallet> --invoice "<inv>"
  utexo createutxos <wallet> [--num <n>] [--size <n>] [--feeRate <n>] [--upTo]
  utexo signpsbt <wallet> --psbt "<psbt>" [--mnemonic "<mn>"]
  utexo generate_keys <wallet_name> [network]   # network: regtest (default), testnet, mainnet`;

function printUsage() {
    console.error(USAGE);
}

const withUsage = (fn) => (walletName, flagArgs) => fn(walletName, flagArgs, { usage: USAGE });

const commands = {
    address: runAddress,
    btcbalance: runBtcbalance,
    listassets: runListassets,
    listtransfers: runListtransfers,
    refresh: runRefresh,
    listunspents: runListunspents,
    getonchainsendstatus: withUsage(runGetOnchainSendStatus),
    decodergbinvoice: withUsage(runDecodergbinvoice),
    blindreceive: withUsage(runBlindreceive),
    witnessreceive: withUsage(runWitnessreceive),
    onchainreceive: withUsage(runOnchainreceive),
    createutxos: runCreateutxos,
    onchainsendbegin: withUsage(runOnchainsendbegin),
    signpsbt: withUsage(runSignpsbt),
    onchainsendend: withUsage(runOnchainsendend),
    onchainsend: withUsage(runOnchainsend),
    send: withUsage(runSend),
    createlightninginvoice: withUsage(runCreatelightninginvoice),
    paylightninginvoicebegin: withUsage(runPaylightninginvoicebegin),
    paylightninginvoice: withUsage(runPaylightninginvoice),
    paylightninginvoiceend: withUsage(runPaylightninginvoiceend),
    getlightningsendrequest: withUsage(runGetlightningsendrequest),
    getlightningreceiverequest: withUsage(runGetlightningreceiverequest),
    generate_keys: runGenerateKeys,
};

async function main() {
    if (!command || !commands[command]) {
        printUsage();
        process.exit(1);
    }

    try {
        await commands[command](walletName, flagArgs);
    } catch (error) {
        handleError(error, `running command '${command}'`);
    }
}

main();
