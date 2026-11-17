import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BurnOperations, WebRgbProvider } from '../lib/webrgb/index.js';

const OPTIONAL = [
  'createUtxos',
  'getBtcBalance',
  'refresh',
  'getAssetMetadata',
];

function unspent(colorable, allocations = 0, pendingBlinded = 0) {
  return {
    utxo: {
      outpoint: { txid: 'c'.repeat(64), vout: 0 },
      btcAmount: 1000,
      colorable,
      exists: true,
    },
    rgbAllocations: Array.from({ length: allocations }, () => ({
      assetId: 'rgb:a',
      assignment: { type: 'Fungible', amount: 1 },
      settled: true,
    })),
    pendingBlinded,
  };
}

function fixture({ approve = true, ...overrides } = {}) {
  const calls = [];
  const prompts = [];
  const wallet = {
    getNetwork: () => 'regtest',
    isDisposed: () => false,
    getBfaCapabilities: async () => ({ burn: false, consignment: false }),
    burn: async () => {
      throw new Error('burn must not run');
    },
    witnessReceive: async () => ({ invoice: 'rgb:i', recipientId: 'r' }),
    blindReceive: async () => {
      throw Object.assign(new Error('Insufficient allocations'), {
        code: 'INSUFFICIENT_FUNDS',
        cause: Object.assign(new Error('Insufficient allocations'), {
          code: 'RGB_LIB_InsufficientAllocationSlots',
        }),
      });
    },
    createUtxos: async (params) => {
      calls.push(['createUtxos', params]);
      return 3;
    },
    getBtcBalance: async () => ({
      vanilla: { settled: 5000, future: 6000, spendable: 6000 },
      colored: { settled: 3000, future: 3000, spendable: 3000 },
    }),
    listUnspents: async (options) => {
      calls.push(['listUnspents', options]);
      return [
        unspent(true),
        unspent(true),
        unspent(true, 1),
        unspent(true, 0, 1),
        unspent(false),
      ];
    },
    refresh: async () => {
      calls.push(['refresh']);
      return {
        transfers: {
          1: { updatedStatus: 'Settled' },
          2: { failure: { name: 'InvalidConsignment', message: 'bad proof' } },
        },
      };
    },
    listTransfers: async (assetId) =>
      assetId === 'rgb:a'
        ? [{ idx: 10, batchTransferIdx: 1, kind: 'ReceiveWitness' }]
        : [],
    getAssetMetadata: async (assetId) => {
      calls.push(['getAssetMetadata', assetId]);
      return {
        assetSchema: 'Bfa',
        name: 'Bridged',
        precision: 6,
        ticker: 'BUSD',
        timestamp: 1_700_000_000,
        initialSupply: '18446744073709551615',
        maxSupply: '18446744073709551615',
        knownCirculatingSupply: '0',
      };
    },
    ...overrides,
  };
  const provider = new WebRgbProvider(wallet, {
    origin: 'https://dapp.example',
    sessionApproved: true,
    burn: {
      operations: new BurnOperations(wallet, {
        readAll: async () => [],
        write: async () => undefined,
      }),
    },
    confirm: async (request) => {
      prompts.push(request);
      return approve;
    },
  });
  return { provider, wallet, calls, prompts };
}

test('optional methods are listed only when the wallet has them', async () => {
  const { provider } = fixture();
  const { methods } = await provider.getInfo();
  for (const method of OPTIONAL) assert.ok(methods.includes(method), method);
  const bare = fixture({
    createUtxos: undefined,
    getBtcBalance: undefined,
    refresh: undefined,
    getAssetMetadata: undefined,
  });
  const listed = (await bare.provider.getInfo()).methods;
  for (const method of OPTIONAL) {
    assert.ok(!listed.includes(method), method);
    await assert.rejects(
      bare.provider[method](
        method === 'getAssetMetadata' ? 'rgb:a' : undefined
      ),
      { code: 'METHOD_NOT_SUPPORTED' }
    );
  }
});

test('createUtxos asks first, shows the values used and never uses up-to mode', async () => {
  const { provider, calls, prompts } = fixture();
  assert.deepEqual(await provider.createUtxos(), {
    created: 3,
    size: 1000,
    feeRate: 2,
  });
  assert.deepEqual(prompts[0], {
    origin: 'https://dapp.example',
    method: 'createUtxos',
    params: { num: 5, size: 1000, feeRate: 2 },
  });
  assert.deepEqual(calls[0], [
    'createUtxos',
    { num: 5, size: 1000, feeRate: 2, upTo: false },
  ]);
  const result = await provider.createUtxos({ num: 2, size: 2500, feeRate: 7 });
  assert.deepEqual(result, { created: 3, size: 2500, feeRate: 7 });
});

test('createUtxos rejects bad parameters before the prompt and a declined prompt spends nothing', async () => {
  for (const args of [
    { num: 0 },
    { num: 256 },
    { size: 0 },
    { size: 2 ** 32 },
    { feeRate: 0 },
    { feeRate: 1.5 },
    { upTo: true },
    [],
  ]) {
    const { provider, calls, prompts } = fixture();
    await assert.rejects(provider.createUtxos(args), {
      code: 'INVALID_PARAMS',
    });
    assert.equal(prompts.length, 0);
    assert.equal(calls.length, 0);
  }
  const declined = fixture({ approve: false });
  await assert.rejects(declined.provider.createUtxos(), {
    code: 'USER_REJECTED',
  });
  assert.equal(declined.calls.length, 0);
});

test('a native failure of createUtxos rejects once without a retry', async () => {
  let attempts = 0;
  const { provider } = fixture({
    createUtxos: async () => {
      attempts += 1;
      throw Object.assign(new Error('Insufficient bitcoin funds'), {
        code: 'INSUFFICIENT_FUNDS',
      });
    },
  });
  await assert.rejects(provider.createUtxos(), { code: 'INTERNAL_ERROR' });
  assert.equal(attempts, 1);
});

test('getBtcBalance returns aggregates and a count of free colorable UTXOs, never outpoints', async () => {
  const { provider, calls, prompts } = fixture();
  const balance = await provider.getBtcBalance();
  assert.deepEqual(balance, {
    vanilla: { settled: 5000, future: 6000, spendable: 6000 },
    colored: { settled: 3000, future: 3000, spendable: 3000 },
    freeColorableUtxos: 2,
  });
  assert.ok(!JSON.stringify(balance).includes('c'.repeat(64)));
  assert.deepEqual(calls, [['listUnspents', { skipSync: true }]]);
  assert.equal(prompts.length, 0);
  const unknown = fixture({ listUnspents: undefined });
  assert.equal(
    (await unknown.provider.getBtcBalance()).freeColorableUtxos,
    null
  );
  const broken = fixture({
    getBtcBalance: async () => ({
      vanilla: { settled: -1, future: 0, spendable: 0 },
      colored: { settled: 0, future: 0, spendable: 0 },
    }),
  });
  await assert.rejects(broken.provider.getBtcBalance(), {
    code: 'INTERNAL_ERROR',
  });
});

test('refresh rejects on a per-transfer failure in scope and ignores failures outside it', async () => {
  const { provider, prompts } = fixture();
  await assert.rejects(provider.refresh(), {
    code: 'INTERNAL_ERROR',
    message: /InvalidConsignment: bad proof/,
  });
  // rgb:a owns batch 1 only: batch 2's failure is out of scope.
  assert.deepEqual(await provider.refresh('rgb:a'), { refreshed: true });
  const quiet = fixture({ refresh: async () => ({ transfers: {} }) });
  assert.deepEqual(await quiet.provider.refresh(), { refreshed: false });
  await assert.rejects(provider.refresh('not-an-asset'), {
    code: 'INVALID_PARAMS',
  });
  assert.equal(prompts.length, 0);
});

test('getAssetMetadata keeps the initial supply as an exact decimal string', async () => {
  const { provider, prompts } = fixture();
  assert.deepEqual(await provider.getAssetMetadata('rgb:a'), {
    assetId: 'rgb:a',
    schema: 'bfa',
    ticker: 'BUSD',
    name: 'Bridged',
    details: null,
    precision: 6,
    issuedSupply: '18446744073709551615',
    timestamp: 1_700_000_000,
    media: null,
  });
  assert.equal(prompts.length, 0);
  await assert.rejects(provider.getAssetMetadata(), { code: 'INVALID_PARAMS' });
  for (const initialSupply of ['18446744073709551616', '01', 5, '-1']) {
    const broken = fixture({
      getAssetMetadata: async () => ({
        assetSchema: 'Nia',
        name: 'x',
        precision: 0,
        timestamp: 1,
        initialSupply,
      }),
    });
    await assert.rejects(broken.provider.getAssetMetadata('rgb:a'), {
      code: 'INTERNAL_ERROR',
    });
  }
  const missing = fixture({
    getAssetMetadata: async () => {
      throw Object.assign(new Error('Asset not found'), {
        code: 'ASSET_NOT_FOUND',
      });
    },
  });
  await assert.rejects(missing.provider.getAssetMetadata('rgb:a'), {
    code: 'ASSET_NOT_FOUND',
  });
});

test('a receive without a free allocation slot rejects with NO_AVAILABLE_UTXOS', async () => {
  const { provider } = fixture();
  await assert.rejects(provider.blindReceive({}), {
    code: 'NO_AVAILABLE_UTXOS',
  });
  // Any other shortage keeps its usual code.
  const other = fixture({
    blindReceive: async () => {
      throw Object.assign(new Error('Insufficient bitcoin funds'), {
        code: 'INSUFFICIENT_FUNDS',
      });
    },
  });
  await assert.rejects(other.provider.blindReceive({}), {
    code: 'INTERNAL_ERROR',
  });
});
