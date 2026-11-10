import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runEngineConformanceChecks } from '@utexo/rgb-sdk-core/conformance';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { UTEXOWallet } from '../lib/index.js';
import { RgbLibWeb } from '../lib/adapters/rgb-lib-wasm/index.js';
import {
  ASSET_ID,
  KEYS,
  TXID,
  createFakeRuntime,
} from './fake-rgb-lib-wasm.mjs';

const expect = (actual) => ({
  toBe: (expected) => assert.equal(actual, expected),
  toContain: (expected) => assert.ok(actual.includes(expected)),
});

const ONLINE = {
  indexerUrl: 'http://127.0.0.1:3002',
  proxyEndpoint: 'rpc://127.0.0.1:3000/json-rpc',
};

function create({ params = {}, keys = KEYS.mnemonic, ...fake } = {}) {
  const runtime = createFakeRuntime(fake);
  const engine = new RgbLibWeb(
    { network: 'regtest', ...params },
    keys,
    runtime
  );
  return { engine, runtime, names: () => runtime.calls.map((c) => c.name) };
}

async function ready(options) {
  const env = create({ ...options, params: { ...ONLINE, ...options?.params } });
  await env.engine.init();
  return env;
}

async function rejects(promise, code, operation) {
  await assert.rejects(promise, (error) => {
    assert.ok(isEngineError(error, code), `${error?.code}: ${error?.message}`);
    if (operation) assert.equal(error.operation, operation);
    assert.equal(error.protocol, 'RGB_L1');
    return true;
  });
}

runEngineConformanceChecks({
  name: 'adapters/rgb-lib-wasm RgbLibWeb',
  engineClass: RgbLibWeb,
  createEngineSync: () => create().engine,
  extensions: [],
  describe,
  it,
  expect,
});

describe('RgbLibWeb construction', () => {
  it('validates arguments and calls nothing in the runtime', () => {
    const { names } = create({ params: ONLINE });
    assert.deepEqual(names(), []);
  });

  it('rejects a missing runtime, bad keys and an Electrum indexer', () => {
    assert.throws(
      () => new RgbLibWeb({ network: 'regtest' }, KEYS.mnemonic, undefined),
      (e) => isEngineError(e, 'INVALID_CONFIG')
    );
    assert.throws(
      () => create({ keys: '  ' }),
      (e) => isEngineError(e, 'INVALID_CONFIG')
    );
    assert.throws(
      () => create({ params: { indexerUrl: 'ssl://electrum:50002' } }),
      (e) => isEngineError(e, 'UNSUPPORTED_CAPABILITY')
    );
  });
});

describe('RgbLibWeb lifecycle', () => {
  it('init opens the wallet with the derived keys and the RN wallet ID', async () => {
    const { engine, runtime } = create();
    await engine.init();
    const created = runtime.calls.find((c) => c.name === 'create').args[0];
    assert.equal(created.bitcoinNetwork, 'Regtest');
    assert.equal(created.dataDir, ':memory:');
    assert.equal(created.accountXpubVanilla, KEYS.accountXpubVanilla);
    assert.equal(created.mnemonic, KEYS.mnemonic);
    // rgb-lib-wasm rejects an empty list ("no supported schemas").
    assert.deepEqual(created.supportedSchemas, ['Nia', 'Ifa', 'Bfa']);
    const expectedId = createHash('sha256')
      .update(
        `regtest:taproot:${KEYS.accountXpubVanilla}:${KEYS.accountXpubColored}`
      )
      .digest('hex');
    assert.deepEqual(await engine.getWalletIdentity(), {
      id: expectedId,
      network: 'regtest',
      protocol: 'RGB_L1',
    });
  });

  it('maps utexo to the WASM signet', async () => {
    const { engine, runtime } = create({
      params: { network: 'utexo' },
      keys: KEYS.mnemonic,
    });
    await engine.init();
    assert.equal(
      runtime.calls.find((c) => c.name === 'create').args[0].bitcoinNetwork,
      'Signet'
    );
    assert.deepEqual(
      runtime.calls.find((c) => c.name === 'restoreKeys').args[0],
      'signet'
    );
  });

  it('operations before init reject with WALLET_NOT_INITIALIZED', async () => {
    const { engine } = create();
    await rejects(engine.getAddress(), 'WALLET_NOT_INITIALIZED', 'getAddress');
  });

  it('regtest without connection settings rejects online work with WALLET_OFFLINE', async () => {
    const { engine, names } = create();
    await engine.init();
    await rejects(engine.getBtcBalance(), 'WALLET_OFFLINE', 'getBtcBalance');
    assert.ok(!names().includes('goOnline'));
    // skipSync: true reads stay offline.
    const balance = await engine.getBtcBalance({ skipSync: true });
    assert.deepEqual(balance.vanilla, { settled: 5, future: 5, spendable: 5 });
  });

  it('connects lazily once, with Esplora options', async () => {
    const { engine, runtime, names } = await ready();
    await Promise.all([engine.getBtcBalance(), engine.listUnspents()]);
    assert.equal(names().filter((n) => n === 'goOnline').length, 1);
    const options = runtime.calls.find((c) => c.name === 'goOnline').args[0];
    assert.deepEqual(options.indexerConfig, {
      Esplora: { url: ONLINE.indexerUrl },
    });
    assert.equal(options.skipConsistencyCheck, false);
    // Reads that sync call sync() first: the WASM reads never sync.
    assert.deepEqual(names().slice(-4), [
      'sync',
      'getBtcBalance',
      'sync',
      'listUnspents',
    ]);
  });

  it('unlock with a different config after connecting is WALLET_CONFIG_MISMATCH', async () => {
    const { engine } = await ready();
    await engine.unlock();
    await rejects(
      engine.unlock({ indexerUrl: 'http://other:3002' }),
      'WALLET_CONFIG_MISMATCH',
      'unlock'
    );
  });

  it('serializes overlapping calls (the WASM wallet cannot reenter)', async () => {
    const { engine } = await ready();
    await Promise.all([
      engine.syncWallet(),
      engine.refreshWallet(),
      engine.estimateFeeRate(1),
      engine.listTransactions(),
    ]);
  });

  it('destroy flushes, frees and then rejects new work', async () => {
    const { engine, names } = await ready();
    await engine.destroy();
    assert.deepEqual(names().slice(-2), ['flush', 'free']);
    assert.equal(engine.isDisposed(), true);
    await rejects(engine.getAddress(), 'WALLET_DISPOSED', 'getAddress');
    await engine.destroy();
  });

  it('a failed flush keeps the wallet so destroy can be retried', async () => {
    let fail = true;
    const { engine, names } = await ready({
      overrides: {
        flush: async () => {
          if (fail) throw 'IndexedDB write failed';
        },
      },
    });
    await rejects(engine.destroy(), 'NATIVE_ERROR', 'destroy');
    assert.ok(!names().includes('free'));
    fail = false;
    await engine.destroy();
    assert.equal(engine.isDisposed(), true);
  });
});

describe('RgbLibWeb mapping', () => {
  it('maps BigInt values exactly and rejects unsafe numbers', async () => {
    const { engine } = await ready();
    const unspents = await engine.listUnspents({ skipSync: true });
    assert.equal(unspents[0].utxo.btcAmount, 1000);
    assert.deepEqual(unspents[0].rgbAllocations[0].assignment, {
      type: 'Fungible',
      amountBaseUnits: '10',
      amount: 10,
    });
    const big = await ready({
      overrides: {
        getAssetBalance: () => ({
          settled: 2n ** 60n,
          future: 0n,
          spendable: 0n,
        }),
      },
    });
    await rejects(
      big.engine.getAssetBalance(ASSET_ID),
      'AMOUNT_OVERFLOW',
      'getAssetBalance'
    );
  });

  it('lists transfers of any asset and keeps the change UTXO', async () => {
    const { engine, runtime } = await ready();
    const [transfer] = await engine.listTransfers();
    assert.equal(
      runtime.calls.find((c) => c.name === 'listTransfers').args[0],
      'any'
    );
    assert.deepEqual(transfer.changeUtxos, [{ txid: TXID, vout: 1 }]);
    assert.equal(transfer.amountBaseUnits, '10');
    assert.equal(transfer.expiration, 1700003600);
    await engine.listTransfers(ASSET_ID);
    assert.deepEqual(runtime.calls.at(-1).args[0], { id: ASSET_ID });
  });

  it('lists assets into the contract buckets', async () => {
    const { engine } = await ready();
    const assets = await engine.listAssets();
    assert.equal(assets.nia[0].issuedSupply, 1000);
    assert.deepEqual(
      [assets.ifa, assets.cfa, assets.uda, assets.bfa],
      [[], [], [], []]
    );
  });

  it('maps the refresh Map with RGB_LIB_ failure names', async () => {
    const { engine } = await ready();
    const result = await engine.refresh();
    assert.deepEqual(result.transfers[1], {
      updatedStatus: 'Settled',
      failure: undefined,
    });
    assert.equal(result.transfers[2].failure.name, 'RGB_LIB_InvalidInvoice');
  });

  it('maps rgb-lib-wasm string rejections to codes', async () => {
    const { engine } = await ready({
      overrides: {
        sendBtcBegin: async () => {
          throw "Insufficient bitcoin funds: needed '10', available '1'";
        },
      },
    });
    await rejects(
      engine.sendBtc({ address: 'bcrt1q', amount: 10, feeRate: 1 }),
      'INSUFFICIENT_FUNDS',
      'sendBtc'
    );
  });
});

describe('RgbLibWeb operations', () => {
  it('createUtxos and sendBtc run begin, sign and end', async () => {
    const { engine, runtime, names } = await ready();
    assert.equal(await engine.createUtxos({ num: 2, feeRate: 3 }), 3);
    const begin = runtime.calls.find((c) => c.name === 'createUtxosBegin').args;
    assert.equal(begin[4], 3n);
    assert.deepEqual(names().slice(-3), [
      'createUtxosBegin',
      'signPsbt',
      'createUtxosEnd',
    ]);
    assert.equal(
      await engine.sendBtc({ address: 'bcrt1q', amount: 500, feeRate: 2 }),
      TXID
    );
    assert.equal(
      runtime.calls.find((c) => c.name === 'sendBtcEnd').args[1],
      'signed:psbt-btc'
    );
  });

  it('blindReceive sends the proxy, an expiry and a Fungible assignment', async () => {
    const { engine, runtime } = await ready();
    const before = Math.floor(Date.now() / 1000);
    const data = await engine.blindReceive({ assetId: ASSET_ID, amount: 10 });
    const args = runtime.calls.find((c) => c.name === 'blindReceive').args;
    assert.deepEqual(args[2], { Fungible: 10n });
    assert.ok(args[3] >= BigInt(before + 86400));
    assert.deepEqual(args[4], [ONLINE.proxyEndpoint]);
    assert.equal(data.batchTransferIdx, 4);
    assert.equal(typeof data.expirationTimestamp, 'number');
  });

  it('onchainSend checks the invoice and sends one recipient', async () => {
    const exp = BigInt(Math.floor(Date.now() / 1000) + 7200);
    const { engine, runtime, names } = await ready({
      invoice: {
        recipientId: 'utxob:recipient',
        assetSchema: 'Nia',
        assetId: ASSET_ID,
        assignment: 'Any',
        assignmentName: null,
        network: 'Regtest',
        expirationTimestamp: exp,
        transportEndpoints: ['rpc://proxy'],
        publicKey: 'pk',
        encryption: 'Required',
        unknownQueryParams: {},
      },
    });
    const result = await engine.onchainSend({
      invoice: 'rgb:invoice',
      amount: 10,
      feeRate: 2,
    });
    assert.deepEqual(result, { txid: TXID, batchTransferIdx: 9 });
    const begin = runtime.calls.find((c) => c.name === 'sendBegin').args;
    const recipient = begin[1][ASSET_ID][0];
    assert.deepEqual(recipient.assignment, { Fungible: 10n });
    assert.equal(recipient.expirationTimestamp, exp);
    assert.equal(begin[5], exp - 600n);
    assert.equal(begin[6], ONLINE.proxyEndpoint);
    assert.deepEqual(names().slice(-3), ['sendBegin', 'signPsbt', 'sendEnd']);
  });

  it('onchainSend refuses an invoice for another network', async () => {
    const { engine, names } = await ready({
      invoice: {
        recipientId: 'r',
        assetSchema: null,
        assetId: ASSET_ID,
        assignment: { Fungible: 10n },
        assignmentName: null,
        network: 'Mainnet',
        expirationTimestamp: null,
        transportEndpoints: [],
        publicKey: null,
        encryption: 'Required',
        unknownQueryParams: {},
      },
    });
    await rejects(
      engine.onchainSend({ invoice: 'rgb:x', feeRate: 1 }),
      'INVALID_PARAMS',
      'onchainSend'
    );
    assert.ok(!names().includes('sendBegin'));
  });

  it('decodeRGBInvoice maps the invoice data', async () => {
    const { engine } = await ready({
      invoice: {
        recipientId: 'r',
        assetSchema: 'Nia',
        assetId: ASSET_ID,
        assignment: { Fungible: 10n },
        assignmentName: null,
        network: 'Regtest',
        expirationTimestamp: 1700000000n,
        transportEndpoints: ['rpc://proxy'],
        publicKey: null,
        encryption: 'Optional',
        unknownQueryParams: { z: '1', a: '2' },
      },
    });
    const data = await engine.decodeRGBInvoice({ invoice: 'rgb:x' });
    assert.equal(data.network, 'regtest');
    assert.equal(data.expirationTimestamp, 1700000000);
    assert.deepEqual(data.unknownQueryParams, { a: '2', z: '1' });
  });

  it('issues NIA with BigInt amounts', async () => {
    const { engine, runtime } = await ready();
    const asset = await engine.issueAssetNia({
      ticker: 'T',
      name: 'N',
      precision: 0,
      amounts: [5, 6],
    });
    assert.deepEqual(
      runtime.calls.find((c) => c.name === 'issueAssetNia').args[3],
      [5n, 6n]
    );
    assert.equal(asset.issuedSupply, 11);
  });
});

describe('RgbLibWeb unsupported input (ADR-0001)', () => {
  it('a CFA or UDA filter rejects with UNSUPPORTED_CAPABILITY and no WASM call', async () => {
    const { engine, names } = await ready();
    const before = names().length;
    await rejects(
      engine.listAssets({ filterAssetSchemas: ['Cfa'] }),
      'UNSUPPORTED_CAPABILITY',
      'listAssets'
    );
    assert.equal(names().length, before);
  });

  it('an Electrum indexer on unlock rejects with UNSUPPORTED_CAPABILITY and no WASM call', async () => {
    const { engine, names } = create();
    await engine.init();
    const before = names().length;
    await rejects(
      engine.unlock({
        indexerUrl: 'ssl://electrum:50002',
        proxyEndpoint: ONLINE.proxyEndpoint,
      }),
      'UNSUPPORTED_CAPABILITY',
      'unlock'
    );
    assert.equal(names().length, before);
  });

  it('onchainSend with skipSync: true is refused before any call', async () => {
    const { engine, names } = await ready();
    const before = names().length;
    await rejects(
      engine.onchainSend({ invoice: 'rgb:x', feeRate: 1, skipSync: true }),
      'UNSUPPORTED_CAPABILITY',
      'onchainSend'
    );
    assert.equal(names().length, before);
  });

  it('a watch-only wallet refuses signing operations before any call', async () => {
    const { engine, names, runtime } = create({
      keys: {
        accountXpubVanilla: KEYS.accountXpubVanilla,
        accountXpubColored: KEYS.accountXpubColored,
        masterFingerprint: KEYS.masterFingerprint,
      },
      params: ONLINE,
    });
    assert.equal(engine.capabilities.canSignTransactions, false);
    await engine.init();
    assert.equal(
      runtime.calls.find((c) => c.name === 'create').args[0].mnemonic,
      null
    );
    const before = names().length;
    await rejects(
      engine.sendBtc({ address: 'a', amount: 1, feeRate: 1 }),
      'UNSUPPORTED_CAPABILITY',
      'sendBtc'
    );
    assert.equal(names().length, before);
  });
});

describe('RgbLibWeb behind UTEXOWallet', () => {
  it('the facade accepts the engine and forwards calls', async () => {
    const { engine } = create({ params: ONLINE });
    const wallet = new UTEXOWallet({ engine });
    await wallet.init();
    assert.equal(await wallet.getAddress(), 'bcrt1qfake');
    assert.equal(wallet.getNetwork(), 'regtest');
  });
});

describe('RgbLibWeb IFA', () => {
  it('issues IFA with BigInt amounts, no link right, and maps the supply', async () => {
    const { engine, runtime } = await ready();
    const asset = await engine.issueAssetIfa({
      ticker: 'IFA',
      name: 'Inflatable',
      precision: 2,
      amounts: [100],
      inflationAmounts: [50, 25],
      rejectListUrl: null,
    });
    const args = runtime.calls.find((c) => c.name === 'issueAssetIfa').args;
    assert.deepEqual(args, [
      'IFA',
      'Inflatable',
      2,
      [100n],
      [50n, 25n],
      null,
      false,
      null,
    ]);
    assert.equal(asset.initialSupply, 100);
    assert.equal(asset.maxSupply, 175);
    assert.equal(asset.knownCirculatingSupply, 100);
    assert.equal(asset.rejectListUrl, undefined);
  });

  it('inflate runs begin, sign and end with BigInt amounts', async () => {
    const { engine, runtime, names } = await ready();
    const result = await engine.inflate({
      assetId: ASSET_ID,
      inflationAmounts: [5, 6],
      feeRate: 3,
      minConfirmations: 2,
    });
    assert.deepEqual(result, { txid: TXID, batchTransferIdx: 2 });
    const begin = runtime.calls.find((c) => c.name === 'inflateBegin').args;
    assert.deepEqual(begin.slice(1), [ASSET_ID, [5n, 6n], 3n, 2]);
    assert.deepEqual(names().slice(-3), [
      'inflateBegin',
      'signPsbt',
      'inflateEnd',
    ]);
    assert.equal(runtime.calls.at(-1).args[1], 'signed:psbt-inflate');
  });
});

describe('RgbLibWeb persistence (sync mutations save in the background)', () => {
  /** flush() resolves only when the test commits it, or rejects on failure. */
  function delayedFlush() {
    const pending = [];
    return {
      pending,
      flush: () =>
        new Promise((resolve, reject) => pending.push({ resolve, reject })),
    };
  }

  for (const [name, call] of [
    ['getAddress', (e) => e.getAddress()],
    [
      'issueAssetNia',
      (e) =>
        e.issueAssetNia({ ticker: 'T', name: 'N', precision: 0, amounts: [1] }),
    ],
    [
      'issueAssetIfa',
      (e) =>
        e.issueAssetIfa({
          ticker: 'T',
          name: 'N',
          precision: 0,
          amounts: [1],
          inflationAmounts: [],
          rejectListUrl: null,
        }),
    ],
  ]) {
    it(`${name} resolves only after the IndexedDB commit`, async () => {
      const save = delayedFlush();
      const { engine } = await ready({ overrides: { flush: save.flush } });
      let settled = false;
      const result = call(engine).then((v) => ((settled = true), v));
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(settled, false);
      assert.equal(save.pending.length, 1);
      save.pending[0].resolve();
      await result;
      assert.equal(settled, true);
    });

    it(`${name} rejects when the save fails`, async () => {
      const { engine } = await ready({
        overrides: {
          flush: async () => {
            throw 'Persistence error: quota exceeded';
          },
        },
      });
      await rejects(call(engine), 'NATIVE_ERROR', name);
    });
  }
});

describe('RgbLibWeb concurrent destroy', () => {
  it('every caller gets an engine error; no free on failure; retry works', async () => {
    let fail = true;
    const { engine, names } = await ready({
      overrides: {
        flush: async () => {
          if (fail) throw 'IndexedDB write failed';
        },
      },
    });
    const first = engine.destroy();
    const second = engine.destroy();
    await rejects(first, 'NATIVE_ERROR', 'destroy');
    await rejects(second, 'NATIVE_ERROR', 'destroy');
    assert.ok(!names().includes('free'));
    assert.equal(engine.isDisposed(), false);
    fail = false;
    await engine.destroy();
    assert.equal(engine.isDisposed(), true);
    assert.equal(names().filter((n) => n === 'free').length, 1);
  });
});

describe('RgbLibWeb validation inside the queue', () => {
  for (const filterAssetSchemas of [['bogus'], 'Nia']) {
    it(`listAssets(${JSON.stringify(filterAssetSchemas)}) is INVALID_PARAMS with no WASM call`, async () => {
      const { engine, names } = await ready();
      const before = names().length;
      await rejects(
        engine.listAssets({ filterAssetSchemas }),
        'INVALID_PARAMS',
        'listAssets'
      );
      assert.equal(names().length, before);
    });
  }
});
