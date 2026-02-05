import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WalletManager, createWallet } from './dist/index.mjs';

// Configuration
const RGB_MANAGER_ENDPOINT = "http://127.0.0.1:8000";
const BITCOIN_NODE_ENDPOINT = "http://18.119.98.232:5000/execute";
const TRANSPORT_ENDPOINT = "rpc://regtest.thunderstack.org:3000/json-rpc";
const INDEXER_URL = "tcp://regtest.thunderstack.org:50001";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Mine blocks using the Bitcoin node endpoint
 */
async function mine(numBlocks) {
    try {
        const response = await axios.post(BITCOIN_NODE_ENDPOINT, {
            args: `mine ${numBlocks}`
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log(`Mined ${numBlocks} blocks`);
        return response.data;
    } catch (error) {
        throw new Error(`Unable to mine: ${error.message}`);
    }
}

/**
 * Send Bitcoin to an address using the Bitcoin node endpoint
 */
async function sendToAddress(address, amount) {
    try {
        const response = await axios.post(BITCOIN_NODE_ENDPOINT, {
            args: `sendtoaddress ${address} ${amount}`
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const txid = response.data?.result || response.data;
        console.log(`Sent ${amount} BTC to ${address}, TXID: ${txid}`);
        return txid;
    } catch (error) {
        throw new Error(`Unable to send bitcoins: ${error.message}`);
    }
}

/**
 * Initialize a wallet with RGB SDK
 */

const sender_keys = {
    mnemonic: 'maximum infant drama seed family ensure true view infant suggest muscle chase',
    xpub: 'tpubD6NzVbkrYhZ4WiLr47UXxW8ry3SAQ4eZprUdQjhDmK8Kb42KmCQH9tKAvo6cpoAswLXmiyC8KtdvZNy3v5Zg5ugiiPoE8rLYRoRoPsWoKVX',
    accountXpubVanilla: 'tpubDDQdhAci2b6tUYLz3guDfkF8KkUaFHmQ39wm9kwZmGtFEbMnh8ZrXzpogY15czxcdaaKzF5Zf73jAAtsog63hHNVnqPwhAYiTe7TCKbcNUT',
    accountXpubColored: 'tpubDD6wJYTR8dqpH4kHevNxM4PGzi7y8kfvV7XckH1W2vTtxdwo9wDmThmm4dZVGE57wHmQerq7bY5TXEmmXTDvTBoqNvHrJ8DKaUHqEjyksi1',
    masterFingerprint: 'e3059eb4',
    xpriv: 'tprv8ZgxMBicQKsPdFK4ATowZ6UkQ1vEEjTfFYsr8DevM3KvkZmZ8oagyPhJkfuraQzWRmQo3YgvMH9sDpZEUpqGq839gp9kDX4BC9Abffr8uri'
}
const reciver_keys = {
    mnemonic: 'favorite chicken wealth waste awake champion afford misery please fetch shy believe',
    xpub: 'tpubD6NzVbkrYhZ4YNVmSHFij6bSByV4NLKaooQ5mBEf2wEYggCgGmdFkNSxzmxe9vUphZwJ5gykYgj4apnQAirTAd57dJKdsKQVShjxW7YwMsT',
    accountXpubVanilla: 'tpubDDgTpsGJNJtG27ey2n3vNGM3U5VAK4Uot2k8z1XX6mJEnMx5vbCtWFY4vHcuYFbDtQpKTx97vL9vDgaWfNQTuzJ4BH2X5A9JYBrZxhr8gNz',
    accountXpubColored: 'tpubDDZ8nouFqYMhNufYVt4YHeryC1RNewoerPwemPsrnF4HMoMscU8FS1cio8J19Lv1vPtB6p5Tzad5qTPG5k2vm1imbqNQyB83xf83F9KY85Z',
    masterFingerprint: '2f4de38a',
    xpriv: 'tprv8ZgxMBicQKsPeuTyYdb8KgwKcwy8D18gEVoJUfCMcfS9rBwueNofZsq6pfVULHAjDDapA857Pj6zp1zv9BqhrGgq3gQheSipDBWP4k3VnnM'
}
const bitcoinNetwork = 'regtest'; // Regtest network
async function initWallet(keys) {
    console.log("\nInitializing wallet with RGB SDK...");



    // Generate keys using the library
    // const keys = await createWallet(bitcoinNetwork);
    // const keys = {
    //     account_xpub_vanilla: 'tpubDDXmGYkFAqH94kgxcs1fqMbdffUm2mhjoVjhkcBzYJaXRvK4bziWubD5uy3pepvNySjXthPpqfRSeQLpujjGVfZ2yEr65vwDFxJmfxoZMJY',
    //     account_xpub_colored: 'tpubDCyE5hV4MiwR19jcY6mYm77Z5FDg9Swsv4EFoAKAfeqhf2mTLfEadaTHXdhzMenCqGvupoWyTetJyCoiVj168E7HPY8PMbVDp8WU3eZnTfa',
    //     master_fingerprint: '5eb2d564',
    //     mnemonic: 'pyramid gospel arch risk topple year wealth inch thing enemy inflict fiction'
    //   }


    // Restore keys to verify they match
    // const keys = await createWallet(bitcoinNetwork);
    // In the original example, they restore from mnemonic, but we'll skip that for now
    // since we just generated them
    console.log("Keys generated:", keys);
    // Initialize wallet manager
    const wallet = new WalletManager({
        xpubVan: keys.accountXpubVanilla,
        xpubCol: keys.accountXpubColored,
        masterFingerprint: keys.masterFingerprint,
        mnemonic: keys.mnemonic,
        network: bitcoinNetwork,
        rgb_node_endpoint: RGB_MANAGER_ENDPOINT,
        transportEndpoint: TRANSPORT_ENDPOINT,
        indexerUrl: INDEXER_URL
    });

    console.log("Wallet created");

    // Register wallet with RGB Node
    wallet.registerWallet();
    console.log("Wallet registered");

    // Get BTC balance
    const btcBalance = wallet.getBtcBalance();
    console.log("BTC balance:", btcBalance);

    // Get address
    const address = wallet.getAddress();
    return { wallet, keys };
    console.log("Address:", address);

    // Send some BTC to the address
    await sendToAddress(address, 1);
    await mine(3);
    // Wait a bit for the transaction to be processed
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get updated BTC balance
    const updatedBtcBalance = wallet.getBtcBalance();
    console.log("Updated BTC balance:", JSON.stringify(updatedBtcBalance));

    // Create UTXOs
    console.log("Creating UTXOs...");
    const psbt = wallet.createUtxosBegin({
        upTo: true,
        num: 20,
        size: 1500,
        feeRate: 1
    });
    console.log('psbt', psbt);
    const signedPsbt = await wallet.signPsbt(psbt);
    const utxosCreated = wallet.createUtxosEnd({ signedPsbt: signedPsbt });
    console.log(`Created UTXOs successfully`, utxosCreated);
    return { wallet, keys };
}

/**
 * Main execution function
 */
async function main() {
    console.log("Starting RGB SDK Wallet Example");
    console.log("=".repeat(50));
    // const test = await createWallet(bitcoinNetwork);
    // console.log("createWallet", test);
    // return

    try {
        // Initialize sender wallet
        // const { wallet: senderWallet, keys: senderKeys } = await initWallet(reciver_keys);
        //  const keys = await createWallet(bitcoinNetwork);
        const { wallet: senderWallet, keys: senderKeys } = await initWallet(sender_keys);

        const txss = await senderWallet.listTransfers();
        console.log("Transfers:", JSON.stringify(txss, null, 2));
        const senderWalletres = await senderWallet.blindReceive({
            // assetId: asset1.asset?.assetId || '',
            amount: 12
        });

        const invoiceData = await senderWallet.decodeRGBInvoice({ invoice: senderWalletres.invoice });
        console.log("Invoice data:", JSON.stringify(invoiceData, null, 2));
        console.log("Blind receive data:", senderWalletres);
        const txafter = await senderWallet.listTransfers();
        console.log("Transfers after blind receive:", JSON.stringify(txafter, null, 2));

        const ltransactions = await senderWallet.listTransactions();
        console.log("Transactions:", JSON.stringify(ltransactions, null, 2));

        return
        //  const { wallet: receiverWallet, keys: receiverKeys } = await initWallet(reciver_keys);
        // return
        // Issue NIA asset
        // console.log("\nIssuing NIA asset...");
        // const asset1 = senderWallet.issueAssetNia({
        //     ticker: "USDT",
        //     name: "Tether",
        //     amounts: [777, 66],
        //     precision: 0
        // });
        // console.log("Issued NIA asset:", JSON.stringify(asset1));

        // Issue CFA asset (if supported)
        // Note: CFA issuance might not be available in the current API
        // console.log("\nIssuing CFA asset...");
        // const asset2 = senderWallet.issueAssetCfa({
        //     ticker: "CFA",
        //     name: "Cfa",
        //     amounts: [777],
        //     precision: 2
        // });
        // console.log("Issued CFA asset:", JSON.stringify(asset2));
        const asset1 = {
            "assetId": "rgb:SovYOhF~-uCN8dS1-3sybTaH-D~uCxC9-AnNikLV-absJvWU",
            "ticker": "USDT",
            "name": "Tether",
            "details": null,
            "precision": 0,
            "issuedSupply": 843,
            "timestamp": 1769006491,
            "addedAt": 1769006491,
            "balance": {
                "settled": 843,
                "future": 843,
                "spendable": 843
            },
            "media": null
        }
        // List assets
        console.log("\nListing assets...");
        // const assets1 = senderWallet.listAssets();
        // console.log("Assets:", JSON.stringify(assets1, null, 2));

        const asset_balance = senderWallet.getAssetBalance(asset1.assetId);
        console.log("Asset balance:", JSON.stringify(asset_balance, null, 2));

        // Initialize receiving wallet
        console.log("\nInitializing receiving wallet...");
        const { wallet: receiverWallet } = await initWallet(reciver_keys);


        const btcAddress = receiverWallet.getAddress();
        console.log("BTC address:", btcAddress);
        receiverWallet.syncWallet();
        const btcBalance2 = receiverWallet.getBtcBalance();
        console.log("BTC balance:", JSON.stringify(btcBalance2));

        // Send BTC to the address
        const spsbt = senderWallet.sendBtcBegin({
            address: btcAddress,
            amount: 7000,
            feeRate: 1
        });
        console.log("PSBT:", spsbt);
        const signedSendPsbt = await senderWallet.signPsbt(spsbt);
        console.log("Signed PSBT:", signedSendPsbt);
        const btcEstimate = await senderWallet.estimateFee(signedSendPsbt);
        console.log("BTC send estimate:", btcEstimate);

        const sendBtcEndresult = senderWallet.sendBtcEnd({ signedPsbt: signedSendPsbt });
        console.log("Send BTC result:", sendBtcEndresult);
        mine(3);
        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));
        receiverWallet.syncWallet();
        senderWallet.syncWallet();

        const resultCombined = await senderWallet.sendBtc({
            address: btcAddress,
            amount: 7000,
            feeRate: 1
        });

        console.log("Send BTC result:", resultCombined);

        mine(1);
        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));
        receiverWallet.syncWallet();


        const btcBalance = receiverWallet.getBtcBalance();
        console.log("BTC balance:", JSON.stringify(btcBalance));
        // return;
        // Create blind receive
        console.log("\nCreating blind receive...");
        const receiveData1 = receiverWallet.blindReceive({
            // assetId: asset1.asset?.assetId || '',
            amount: 76
        });
        console.log("Blind receive data:", JSON.stringify(receiveData1, null, 2));


        // Send assets
        console.log("\nSending assets...", asset1);
        const psbt = senderWallet.sendBegin({
            assetId: asset1.assetId,
            amount: 76,
            invoice: receiveData1.invoice,
            feeRate: 1,
            minConfirmations: 1
        });
        console.log("PSBT:", psbt);
        const signedPsbt = await senderWallet.signPsbt(psbt);

        console.log("Signed PSBT:", signedPsbt);
        const sendResult = senderWallet.sendEnd({ signedPsbt: signedPsbt });
        // const sendResult = await senderWallet.send({
        //     assetId: asset1.assetId,
        //     amount: 76,
        //     invoice: receiveData1.invoice,
        //     minConfirmations: 1
        // });
        console.log("Send result:", sendResult);

        // Refresh wallets
        console.log("\nRefreshing wallets...");
        receiverWallet.refreshWallet();
        senderWallet.refreshWallet();

        // Mine a block to confirm the transaction
        console.log("\nMining block...");
        await mine(10);

        // Refresh wallets again after mining
        receiverWallet.refreshWallet();
        senderWallet.refreshWallet();

        // List assets in receiver wallet
        console.log("\nListing receiver assets...");
        const rcvAssets = receiverWallet.listAssets();
        console.log("Receiver assets:", JSON.stringify(rcvAssets, null, 2));

        // Get asset balance
        if (asset1.assetId) {
            console.log("\nGetting asset balance...");
            const rcvAssetBalance = receiverWallet.getAssetBalance(asset1.assetId);
            console.log("Receiver asset balance:", JSON.stringify(rcvAssetBalance, null, 2));
        }
        //   Create witness receive
        console.log("\nCreating witness receive...");
        const receiveData2 = receiverWallet.witnessReceive({
            // assetId: asset1.asset?.assetId || '',
            amount: 50
        });
        // Send assets
        console.log("\nSending assets...", asset1);
        const sendResult2 = await senderWallet.send({
            assetId: asset1.assetId,
            amount: 10,
            witnessData: {
                amountSat: 1000,
                blinding: null,
            },
            invoice: receiveData2.invoice,
            minConfirmations: 1
        });
        console.log("Send result:", sendResult2);
        console.log("Witness receive data:", JSON.stringify(receiveData2, null, 2));
        // Refresh wallets
        console.log("\nRefreshing wallets...");
        receiverWallet.refreshWallet();
        senderWallet.refreshWallet();

        // Mine a block to confirm the transaction
        console.log("\nMining block...");
        await mine(10);

        // Refresh wallets again after mining
        receiverWallet.refreshWallet();
        senderWallet.refreshWallet();

        // Sync wallet (if available)
        // senderWallet.sync();

        // List transfers
        if (asset1.assetId) {
            console.log("\nListing transfers...");
            const transfers = senderWallet.listTransfers(asset1.assetId);
            console.log("Transfers:", JSON.stringify(transfers, null, 2));
        }

        // List transactions
        console.log("\nListing transactions...");
        const transactions = senderWallet.listTransactions();
        console.log("Transactions:", JSON.stringify(transactions, null, 2));

        // List unspents
        console.log("\nListing unspents...");
        const unspents = receiverWallet.listUnspents();
        console.log("Unspents:", JSON.stringify(unspents, null, 2));

        // Send BTC (similar to sendBtc in original example)
        console.log("\nSending BTC...");
        const receiverAddress = receiverWallet.getAddress();
        const btcTxid = await sendToAddress(receiverAddress, 0.0007);
        console.log("Sent BTC, TXID:", btcTxid);

        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Refresh wallets
        senderWallet.refreshWallet();
        receiverWallet.refreshWallet();

        console.log("\nCreating wallet backup...");
        const backupPassword = "test-backup-password";
        const backupInfo = senderWallet.createBackup(backupPassword);
        console.log("Backup info:", backupInfo);

        console.log("Downloading backup file...");
        const backupBinary = senderWallet.downloadBackup();
        const backupBuffer = backupBinary instanceof ArrayBuffer ? Buffer.from(backupBinary) : backupBinary;
        const backupFileName = `${senderKeys.accountXpubVanilla}.backup`;
        const backupFilePath = path.join(__dirname, backupFileName);
        await fs.writeFile(backupFilePath, backupBuffer);
        console.log(`Backup saved to ${backupFilePath}`);

        console.log("\nRestoring wallet from backup...");
        const restoreResult = await senderWallet.restoreFromBackup({
            backup: backupBuffer,
            password: backupPassword,
            filename: backupFileName
        });
        console.log("Restore result:", restoreResult);

        console.log("\nExample completed successfully!");
        console.log("=".repeat(50));

    } catch (error) {
        console.error("Error in main execution:", error);
        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        }
        process.exit(1);
    }
}

// Run the example
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith('example-flow.mjs') ||
    process.argv[1]?.endsWith('example-flow.mjs');

if (isMainModule || process.argv[1]?.includes('example-flow.mjs')) {
    console.log("RGB SDK Wallet Complete Example");
    console.log("This example demonstrates:");
    console.log("- Wallet creation and initialization");
    console.log("- UTXO creation and management");
    console.log("- RGB asset issuance");
    console.log("- Asset transfers between wallets");
    console.log("- Transaction and transfer listing");
    console.log("");

    main()
        .then(() => {
            console.log("All operations completed successfully!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("Fatal error:", error);
            process.exit(1);
        });
}

export {
    main,
    initWallet,
    mine,
    sendToAddress
};

