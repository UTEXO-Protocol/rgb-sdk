// A fake @utexo/rgb-lib-wasm module for RgbLibWeb tests. No WASM, no network.
// Values come back the way serde-wasm-bindgen builds them: u64 as BigInt,
// enums externally tagged, the refresh result as a Map.

export const KEYS = {
  mnemonic: 'abandon '.repeat(11) + 'about',
  accountXpubVanilla: 'tpubVanillaFake',
  accountXpubColored: 'tpubColoredFake',
  masterFingerprint: 'a1b2c3d4',
};

export const ASSET_ID = 'rgb:fake-asset';
export const TXID = 'ab'.repeat(32);

const balance = (n = 10n) => ({ settled: n, future: n, spendable: n });

/**
 * `overrides` replaces wallet methods by name; `invoice` sets what
 * `WasmInvoice#invoiceData()` returns.
 */
export function createFakeRuntime({ overrides = {}, invoice } = {}) {
  const calls = [];
  let busy = false;
  const record = (name, args) => calls.push({ name, args });

  const methods = {
    free: () => undefined,
    flush: async () => undefined,
    goOnline: async () => ({ id: 1n, indexerUrl: 'http://esplora' }),
    sync: async () => undefined,
    getAddress: () => 'bcrt1qfake',
    getBtcBalance: () => ({ vanilla: balance(5n), colored: balance(7n) }),
    getAssetBalance: () => balance(),
    listAssets: () => ({
      nia: [
        {
          assetId: ASSET_ID,
          ticker: 'FAKE',
          name: 'Fake',
          details: null,
          precision: 0,
          issuedSupply: 1000n,
          timestamp: 1700000000n,
          addedAt: 1700000001n,
          balance: balance(1000n),
          media: null,
        },
      ],
      ifa: null,
      bfa: [],
    }),
    listUnspents: () => [
      {
        utxo: {
          outpoint: { txid: TXID, vout: 0 },
          btcAmount: 1000n,
          colorable: true,
          exists: true,
        },
        rgbAllocations: [
          { assetId: ASSET_ID, assignment: { Fungible: 10n }, settled: true },
        ],
        pendingBlinded: 0,
      },
    ],
    listTransactions: () => [
      {
        transactionType: 'CreateUtxos',
        txid: TXID,
        received: 1n,
        sent: 2n,
        fee: 3n,
        confirmationTime: { height: 100, timestamp: 1700000000n },
        pending: false,
      },
    ],
    listTransfers: () => [
      {
        idx: 1,
        batchTransferIdx: 1,
        createdAt: 1700000000n,
        updatedAt: 1700000001n,
        status: 'Settled',
        requestedAssignment: { Fungible: 10n },
        assignments: [{ Fungible: 10n }],
        kind: 'Send',
        txid: TXID,
        recipientId: null,
        receiveUtxo: null,
        changeUtxo: { txid: TXID, vout: 1 },
        expirationTimestamp: 1700003600n,
        transportEndpoints: [
          { endpoint: 'rpc://proxy', transportType: 'JsonRpc', used: true },
        ],
        senderTransportEndpoint: null,
        invoiceString: null,
        consignmentPath: null,
        burnReason: null,
      },
    ],
    issueAssetNia: (ticker, name, precision, amounts) => ({
      assetId: ASSET_ID,
      ticker,
      name,
      details: null,
      precision,
      issuedSupply: amounts.reduce((a, b) => a + b, 0n),
      timestamp: 1n,
      addedAt: 1n,
      balance: balance(),
      media: null,
    }),
    issueAssetIfa: (
      ticker,
      name,
      precision,
      amounts,
      inflationAmounts,
      rejectListUrl
    ) => {
      const initial = amounts.reduce((a, b) => a + b, 0n);
      return {
        assetId: ASSET_ID,
        ticker,
        name,
        details: null,
        precision,
        initialSupply: initial,
        maxSupply: initial + inflationAmounts.reduce((a, b) => a + b, 0n),
        knownCirculatingSupply: initial,
        timestamp: 1n,
        addedAt: 1n,
        balance: balance(initial),
        media: null,
        rejectListUrl: rejectListUrl ?? null,
      };
    },
    blindReceive: async (...args) => ({
      invoice: 'rgb:invoice',
      recipientId: 'utxob:fake',
      expirationTimestamp: args[3],
      batchTransferIdx: 4,
      publicKey: 'pk',
    }),
    witnessReceive: async (...args) => ({
      invoice: 'rgb:invoice',
      recipientId: 'bcrt:fake',
      expirationTimestamp: args[3],
      batchTransferIdx: 5,
      publicKey: 'pk',
    }),
    createUtxosBegin: async () => 'psbt-utxos',
    createUtxosEnd: async () => 3,
    sendBtcBegin: async () => 'psbt-btc',
    sendBtcEnd: async () => TXID,
    sendBegin: async () => ({
      psbt: 'psbt-send',
      batchTransferIdx: 9,
      details: {},
    }),
    sendEnd: async () => ({ txid: TXID, batchTransferIdx: 9, entropy: 7n }),
    inflateBegin: async () => 'psbt-inflate',
    inflateEnd: async () => ({ txid: TXID, batchTransferIdx: 2, entropy: 1n }),
    signPsbt: (psbt) => `signed:${psbt}`,
    refresh: async () =>
      new Map([
        [1, { updatedStatus: 'Settled', failure: null }],
        [
          2,
          {
            updatedStatus: null,
            failure: { InvalidInvoice: { details: 'x' } },
          },
        ],
      ]),
    failTransfers: async () => true,
    getFeeEstimation: async () => 1.2,
    ...overrides,
  };

  const wallet = {};
  for (const [name, fn] of Object.entries(methods)) {
    wallet[name] = (...args) => {
      record(name, args);
      // The real wallet panics on overlapping calls (RefCell); so does this one.
      if (busy) throw new Error(`overlapping call: ${name}`);
      const result = fn(...args);
      if (result instanceof Promise) {
        busy = true;
        return result.finally(() => {
          busy = false;
        });
      }
      return result;
    };
  }

  const runtime = {
    calls,
    wallet,
    WasmWallet: {
      create: async (json) => {
        record('create', [JSON.parse(json)]);
        return wallet;
      },
    },
    WasmInvoice: class {
      constructor(value) {
        record('WasmInvoice', [value]);
        this.value = value;
      }
      invoiceData() {
        return invoice;
      }
      free() {}
    },
    restoreKeys: (network, mnemonic) => {
      record('restoreKeys', [network, mnemonic]);
      return { ...KEYS, mnemonic };
    },
  };
  return runtime;
}
