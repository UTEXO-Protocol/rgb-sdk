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
import { parseFlags, runWithWalletManager } from './utils.mjs';

const args = process.argv.slice(2);
let command = args[0];
let walletName = args[1];
let flagArgs = args.slice(2);

// WalletManager subcommands: utexo wm <subcommand> <wallet_name> [flags]
if (command === 'wm') {
    const wmSubcommand = args[1];
    walletName = args[2];
    flagArgs = args.slice(3);
    if (!wmSubcommand || !['address', 'btcbalance', 'refresh', 'sync', 'createutxos', 'blindreceive', 'listassets', 'listtransfers', 'sendbatch'].includes(wmSubcommand)) {
        console.error('Usage: utexo wm <address|btcbalance|refresh|sync|createutxos|blindreceive|listassets|listtransfers|sendbatch> <wallet_name> [options...]');
        process.exit(1);
    }
    command = `wm_${wmSubcommand}`;
}

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
  utexo generate_keys <wallet_name> [network]   # network: regtest (default), testnet, mainnet

WalletManager (same keys file, standard RGB wallet):
  utexo wm address <wallet>
  utexo wm btcbalance <wallet>
  utexo wm refresh <wallet>
  utexo wm sync <wallet>
  utexo wm createutxos <wallet> [--num <n>] [--size <n>] [--feeRate <n>] [--upTo]
  utexo wm blindreceive <wallet> --amount <n> [--assetId <id>] [--minConfirmations <n>] [--durationSeconds <n>]
  utexo wm listassets <wallet>   # list assets and BTC balance
  utexo wm listtransfers <wallet> [--assetId <id>]
  utexo wm sendbatch <wallet> --assetId <id> --amount <n> --invoices "<inv1>,<inv2>,..." [--feeRate <n>] [--minConfirmations <n>]

  Or run script with hardcoded params: node cli/scripts/send-batch-wm.mjs`;

function printUsage() {
    console.error(USAGE);
}

const withUsage = (fn) => (walletName, flagArgs) => fn(walletName, flagArgs, { usage: USAGE });

async function runWmAddress(walletName, flagArgs) {
    parseFlags(flagArgs, { required: [], optional: [] });
    await runWithWalletManager(walletName, async (wallet) => {
        const address = await wallet.getAddress();
        console.log(`✅ Address: ${address}`);
    }, { quiet: true });
}

async function runWmBtcbalance(walletName, flagArgs) {
    parseFlags(flagArgs, { required: [], optional: [] });
    await runWithWalletManager(walletName, async (wallet) => {
        const balance = await wallet.getBtcBalance();
        console.log('✅ BTC balance:');
        console.log(`  Vanilla: settled ${balance.vanilla.settled}, spendable ${balance.vanilla.spendable} sats`);
        console.log(`  Colored: settled ${balance.colored.settled}, spendable ${balance.colored.spendable} sats`);
    }, { quiet: true });
}

async function runWmRefresh(walletName, flagArgs) {
    parseFlags(flagArgs, { required: [], optional: [] });
    await runWithWalletManager(walletName, async (wallet) => {
        await wallet.refreshWallet();
        console.log('✅ Wallet refreshed');
    }, { quiet: true });
}

async function runWmSync(walletName, flagArgs) {
    parseFlags(flagArgs, { required: [], optional: [] });
    await runWithWalletManager(walletName, async (wallet) => {
        await wallet.syncWallet();
        console.log('✅ Wallet synced');
    }, { quiet: true });
}

async function runWmCreateutxos(walletName, flagArgs) {
    const opts = parseFlags(flagArgs, { required: [], optional: ['num', 'size', 'feeRate'] });
    const upTo = flagArgs.includes('--upTo');
    const num = opts.num ? parseInt(opts.num, 10) : 5;
    const size = opts.size ? parseInt(opts.size, 10) : 1000;
    const feeRate = opts.feeRate ? parseInt(opts.feeRate, 10) : 1;
    await runWithWalletManager(walletName, async (wallet) => {
        const count = await wallet.createUtxos({ num, size, feeRate, upTo: upTo || undefined });
        console.log(`✅ Created ${count} UTXO(s)`);
    }, { quiet: true });
}

async function runWmBlindreceive(walletName, flagArgs) {
    const opts = parseFlags(flagArgs, { required: ['amount'], optional: ['assetId', 'minConfirmations', 'durationSeconds'] }, { usage: USAGE });
    const request = {
        amount: parseInt(opts.amount, 10),
        ...(opts.assetId && { assetId: opts.assetId }),
        ...(opts.minConfirmations && { minConfirmations: parseInt(opts.minConfirmations, 10) }),
        ...(opts.durationSeconds && { durationSeconds: parseInt(opts.durationSeconds, 10) }),
    };
    await runWithWalletManager(walletName, async (wallet) => {
        const result = await wallet.blindReceive(request);
        console.log(JSON.stringify(result, null, 2));
    }, { quiet: true });
}

async function runWmListassets(walletName, flagArgs) {
    parseFlags(flagArgs, { required: [], optional: [] });
    await runWithWalletManager(walletName, async (wallet) => {
        const [assets, btcBalance] = await Promise.all([wallet.listAssets(), wallet.getBtcBalance()]);
        console.log('BTC balance:');
        console.log(`  Vanilla: settled ${btcBalance.vanilla.settled}, spendable ${btcBalance.vanilla.spendable} sats`);
        console.log(`  Colored: settled ${btcBalance.colored.settled}, spendable ${btcBalance.colored.spendable} sats`);
        console.log('\nAssets:');
        console.log(JSON.stringify(assets, null, 2));
        const n = (assets.nia?.length || 0) + (assets.uda?.length || 0) + (assets.cfa?.length || 0) + (assets.ifa?.length || 0);
        console.log(`\n✅ Total: ${n} asset(s)`);
    }, { quiet: true });
}

async function runWmListtransfers(walletName, flagArgs) {
    const opts = parseFlags(flagArgs, { required: [], optional: ['assetId'] });
    await runWithWalletManager(walletName, async (wallet) => {
        const transfers = await wallet.listTransfers(opts.assetId);
        console.log(JSON.stringify(transfers, null, 2));
        console.log(`✅ Total: ${Array.isArray(transfers) ? transfers.length : 0} transfer(s)`);
    }, { quiet: true });
}

const DEFAULT_TRANSPORT = 'rpcs://proxy.iriswallet.com/0.2/json-rpc';

async function buildRecipientMap(wallet, assetId, amount, invoices) {
    const recipients = [];
    for (const invoiceStr of invoices) {
        const invoiceData = await wallet.decodeRGBInvoice({ invoice: invoiceStr });
        const transportEndpoints =
            invoiceData.transportEndpoints?.length > 0
                ? invoiceData.transportEndpoints
                : [DEFAULT_TRANSPORT];
        recipients.push({
            recipientId: invoiceData.recipientId,
            witnessData: null,
            assignment: { Fungible: amount },
            transportEndpoints,
        });
    }
    return { [assetId]: recipients };
}

async function runWmSendbatch(walletName, flagArgs) {
    const opts = parseFlags(flagArgs, {
        required: ['assetId', 'amount', 'invoices'],
        optional: ['feeRate', 'minConfirmations'],
    }, { usage: USAGE });
    const invoices = opts.invoices.split(',').map((s) => s.trim()).filter(Boolean);
    if (invoices.length === 0) {
        console.error('--invoices must contain at least one invoice (comma-separated)');
        process.exit(1);
    }
    const assetId = opts.assetId;
    const amount = parseInt(opts.amount, 10);
    await runWithWalletManager(walletName, async (wallet) => {
        const recipientMap = await buildRecipientMap(wallet, assetId, amount, invoices);
        const result = await wallet.sendBatch({
            recipientMap,
            ...(opts.feeRate && { feeRate: parseInt(opts.feeRate, 10) }),
            ...(opts.minConfirmations && { minConfirmations: parseInt(opts.minConfirmations, 10) }),
        });
        console.log(JSON.stringify(result, null, 2));
        console.log('✅ Batch send completed');
    }, { quiet: true });
}

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
    wm_address: runWmAddress,
    wm_btcbalance: runWmBtcbalance,
    wm_refresh: runWmRefresh,
    wm_sync: runWmSync,
    wm_createutxos: runWmCreateutxos,
    wm_blindreceive: runWmBlindreceive,
    wm_listassets: runWmListassets,
    wm_listtransfers: runWmListtransfers,
    wm_sendbatch: runWmSendbatch,
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
