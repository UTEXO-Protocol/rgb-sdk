import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWalletConnectProvider } from '@utexo/webrgb-walletconnect';
import { base64 } from '@scure/base';
import { isEngineError } from '@utexo/rgb-sdk-core';
import { WebRgbBurnController } from '../lib/webrgb/burn.js';
import { WebRgbProvider } from '../lib/webrgb/index.js';
import { validateBurnParams } from '@utexo/rgb-sdk-core';
import {
  burnDestinationHash,
  burnDestinationReason,
} from '../lib/webrgb/index.js';
import {
  BurnOperations,
  normalizeBurnRecord,
} from '../lib/webrgb/burn-operations.js';

const txid = 'ab'.repeat(32);
const evmAddress = `0x${'12'.repeat(20)}`;
const ROUTES = [
  { chainId: 'eip155:42161', dstEid: 0 },
  { chainId: 'eip155:1', dstEid: 30101 },
  { chainId: 'tron:728126428', dstEid: 30420 },
];
const destination = () => ({
  version: 1,
  chainId: 'eip155:42161',
  address: evmAddress,
  dstEid: 0,
});
const args = () => ({
  network: 'utexo',
  assetId: 'rgb:asset',
  amount: '18446744073709551615',
  burnDestination: destination(),
  feeRate: 2,
  minConfirmations: 3,
});
const nativeParams = (amount = '1') => ({
  assetId: 'rgb:asset',
  amount,
  burnRecipient: burnDestinationReason(destination()),
  feeRate: 2,
  minConfirmations: 3,
});
const metadata = () => ({
  origin: 'https://mint.example',
  network: 'utexo',
  burnDestination: destination(),
});
function fixture(destinationRoutes = ROUTES) {
  let records = [],
    enabled = true,
    approve = true;
  const calls = [],
    prompts = [];
  const proof = new Uint8Array(48 * 1024 + 7).fill(51);
  const store = {
    readAll: async () => structuredClone(records),
    write: async (record) => {
      records = [
        ...records.filter(
          (item) =>
            (item.id ?? item.request.requestId) !==
            (record.id ?? record.request.requestId)
        ),
        structuredClone(record),
      ];
    },
  };
  const wallet = {
    isDisposed: () => false,
    getNetwork: () => 'utexo',
    getBfaCapabilities: async () => ({
      burn: true,
      consignment: true,
      bfa: true,
    }),
    listAssets: async () => ({ bfa: [{ assetId: 'rgb:asset' }] }),
    burn: async (params) => {
      calls.push(params);
      assert.equal(records.at(-1).state, 'pending');
      return { txid, batchTransferIdx: 42 };
    },
    listTransfers: async () => [
      { txid, idx: 9, kind: 'Burn', status: 'Settled' },
    ],
    listTransactions: async () => [{ txid, confirmationTime: { height: 100 } }],
    getNetworkInfo: async () => ({ blockHeight: 102 }),
    refreshWallet: async () => {},
    getConsignment: async () => base64.encode(proof),
  };
  const operations = new BurnOperations(wallet, store);
  const controller = (origin = 'https://mint.example') =>
    new WebRgbBurnController(
      wallet,
      {
        origin,
        enabled: () => enabled,
        confirm: async (method, params) => {
          prompts.push({ method, params });
          return approve;
        },
      },
      { operations, destinationRoutes }
    );
  return {
    wallet,
    calls,
    prompts,
    proof,
    store,
    operations,
    controller,
    approve: (value) => {
      approve = value;
    },
    revoke: () => {
      enabled = false;
    },
  };
}
test('u64 burn precision and the destination commitment never use JS numbers', async () => {
  const params = nativeParams(args().amount);
  assert.match(params.burnRecipient, /^[0-9a-f]{64}$/);
  validateBurnParams(params);
  for (const amount of ['18446744073709551616', 1, '01', '0', '-1'])
    assert.throws(() => validateBurnParams({ ...params, amount }));
  assert.throws(() => validateBurnParams({ ...params, feeRate: 1.5 }));
  for (const amount of ['18446744073709551616', 1, '01', '0', '-1', '1e3']) {
    const f = fixture();
    await assert.rejects(f.controller().burnAsset({ ...args(), amount }), {
      code: 'INVALID_PARAMS',
    });
    assert.equal(f.prompts.length, 0);
  }
  for (const feeRate of [0, 1.5, '2']) {
    const f = fixture();
    await assert.rejects(f.controller().burnAsset({ ...args(), feeRate }), {
      code: 'INVALID_PARAMS',
    });
  }
});
test('SDK generates a private journal ID before native burn and returns no ID', async () => {
  const f = fixture();
  const request = {
    ...args(),
    burnDestination: {
      version: 1,
      chainId: 'eip155:1',
      address: evmAddress,
      dstEid: 30101,
    },
  };
  const result = await f.controller().burnAsset(request);
  const [record] = await f.store.readAll();
  assert.deepEqual(result.burnDestination, request.burnDestination);
  assert.equal(result.burnRecipient, undefined);
  assert.equal('version' in record, false);
  assert.deepEqual(record.metadata, {
    origin: 'https://mint.example',
    network: 'utexo',
    burnDestination: request.burnDestination,
  });
  assert.deepEqual(
    f.prompts[0].params.burnDestination,
    request.burnDestination
  );
  assert.equal(
    f.calls[0].burnRecipient,
    burnDestinationReason(request.burnDestination)
  );
  assert.match(record.id, /^[0-9a-f]{32}$/);
  assert.equal(record.state, 'complete');
  assert.equal(result.requestId, undefined);
  assert.equal(record.result.requestId, undefined);
  assert.equal(f.calls[0].requestId, undefined);
  assert.equal(f.prompts[0].params.requestId, undefined);
  assert.equal(f.calls[0].amount, args().amount);
  assert.equal(f.prompts[0].params.getConsignment, true);
  assert.equal(f.prompts.length, 1);
});
test('each new approved burn has a unique wallet-generated ID, even with identical arguments', async () => {
  const f = fixture();
  await assert.rejects(
    f.controller().burnAsset({ ...args(), requestId: 'caller-controlled-id' }),
    { code: 'INVALID_PARAMS' }
  );
  await Promise.all([
    f.controller().burnAsset(args()),
    f.controller().burnAsset(args()),
  ]);
  const records = await f.store.readAll();
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map((r) => r.id)).size, 2);
  assert.equal(f.calls.length, 2);
  assert.equal(f.prompts.length, 2);
});
test('an ambiguous native failure blocks queued and restarted burns', async () => {
  const f = fixture();
  let calls = 0;
  f.wallet.burn = async () => {
    calls++;
    throw new Error('Lost native response');
  };
  const [first, second] = await Promise.allSettled([
    f.controller().burnAsset(args()),
    f.controller().burnAsset(args()),
  ]);
  assert.equal(first.status, 'rejected');
  assert.match(first.reason.message, /Lost native response/);
  assert.equal(second.status, 'rejected');
  assert.match(second.reason.message, /unresolved outcome/);
  await assert.rejects(f.controller().burnAsset(args()), /unresolved outcome/);
  const [record] = await f.store.readAll();
  assert.equal(record.state, 'pending');
  assert.equal(await f.controller().getTransferStatus(record.id), null);
  assert.equal(calls, 1);
});
test('journal write failures never cause an automatic native retry', async () => {
  const before = fixture();
  before.store.write = async () => {
    throw new Error('Storage unavailable');
  };
  await assert.rejects(
    before.controller().burnAsset(args()),
    /Storage unavailable/
  );
  assert.equal(before.calls.length, 0);

  const after = fixture();
  const write = after.store.write;
  after.store.write = async (record) => {
    if (record.state === 'complete') throw new Error('Result save failed');
    await write(record);
  };
  await assert.rejects(
    after.controller().burnAsset(args()),
    /Result save failed/
  );
  await assert.rejects(
    after.controller().burnAsset(args()),
    /Result save failed/
  );
  after.store.write = write;
  await after.operations.retryPersistence();
  assert.equal(
    (await after.controller().getTransferStatus(txid)).status,
    'Settled'
  );
  assert.equal(after.calls.length, 1);
});
test('refusal, malformed chain and revoked session do not burn', async () => {
  const f = fixture();
  f.approve(false);
  await assert.rejects(f.controller().burnAsset(args()), {
    code: 'USER_REJECTED',
  });
  await assert.rejects(
    f.controller().burnAsset({
      ...args(),
      burnDestination: { ...destination(), chainId: 'eip155:0' },
    }),
    { code: 'INVALID_PARAMS' }
  );
  f.revoke();
  await assert.rejects(f.controller().burnAsset(args()), {
    code: 'NOT_ENABLED',
  });
  assert.equal(f.calls.length, 0);
  assert.equal((await f.store.readAll()).length, 0);
});
test('status uses the actual anchor height and remains scoped to the approving origin', async () => {
  const f = fixture();
  await f.controller().burnAsset(args());
  const status = await f.controller().getTransferStatus(txid);
  assert.equal(status.transfer.blockHeight, 100);
  assert.equal(status.transfer.confirmations, 3);
  assert.equal(status.transfer.transferId, 9);
  assert.equal(status.transfer.batchTransferIdx, 42);
  assert.equal(status.transfer.requestId, undefined);
  assert.equal(f.calls.length, 1);
  assert.equal(
    await f.controller('https://other.example').getTransferStatus(txid),
    null
  );
  f.wallet.listTransactions = async () => [{ txid }];
  const reorg = await f.controller().getTransferStatus(txid);
  assert.equal(reorg.transfer.blockHeight, null);
  assert.equal(reorg.transfer.confirmations, 0);
});
test('getConsignment returns the full saved proof; other origins require fresh consent', async () => {
  const f = fixture();
  const controller = f.controller();
  await controller.burnAsset(args());
  const proof = await controller.getConsignment({
    assetId: args().assetId,
    txid,
  });
  assert.equal(proof.byteLength, f.proof.length);
  assert.equal(proof.offset, undefined);
  assert.equal(proof.nextOffset, undefined);
  assert.equal(proof.digest.algorithm, 'keccak256');
  assert.deepEqual(base64.decode(proof.data), f.proof);
  assert.equal(f.prompts.length, 1);
  assert.equal(f.calls.length, 1);
  f.approve(false);
  await assert.rejects(
    f
      .controller('https://other.example')
      .getConsignment({ assetId: args().assetId, txid }),
    { code: 'USER_REJECTED' }
  );
  assert.equal(f.prompts.at(-1).method, 'getConsignment');
  f.wallet.listTransfers = async () => [{ txid, kind: 'Send' }];
  await assert.rejects(
    controller.getConsignment({ assetId: args().assetId, txid }),
    /Only a saved burn/
  );
});
test('provider advertises and dispatches getConsignment with complete Base64 data', async () => {
  const f = fixture();
  const provider = new WebRgbProvider(f.wallet, {
    origin: 'https://mint.example',
    sessionApproved: true,
    confirm: async () => true,
    burn: { operations: f.operations, destinationRoutes: ROUTES },
  });
  const methods = (await provider.getInfo()).methods;
  assert.ok(methods.includes('getConsignment'));
  assert.ok(!methods.includes('exportConsignment'));
  assert.equal(provider.exportConsignment, undefined);
  const result = await provider.burnAsset(args());
  assert.equal(result.requestId, undefined);
  const proof = await provider.getConsignment({
    assetId: args().assetId,
    txid,
  });
  assert.deepEqual(base64.decode(proof.data), f.proof);
  assert.equal(proof.nextOffset, undefined);
  assert.equal(provider.request, undefined);
});
test('unsupported native build does not advertise or execute burn', async () => {
  const f = fixture();
  f.wallet.getBfaCapabilities = async () => ({
    burn: false,
    consignment: false,
  });
  assert.deepEqual(await f.controller().methods(), []);
  await assert.rejects(f.controller().burnAsset(args()), {
    code: 'METHOD_NOT_SUPPORTED',
  });
  assert.equal(f.calls.length, 0);
});

test('full proof reads keep their own bytes when concurrent lookups share a controller', async () => {
  const f = fixture();
  const otherTxid = 'cd'.repeat(32);
  f.wallet.listTransfers = async () =>
    [txid, otherTxid].map((id) => ({ txid: id, kind: 'Burn' }));
  f.wallet.getConsignment = async (_assetId, id) =>
    base64.encode(id === txid ? f.proof : new Uint8Array([7, 8, 9]));
  const controller = f.controller();
  const [first, second] = await Promise.all([
    controller.getConsignment({ assetId: args().assetId, txid }),
    controller.getConsignment({ assetId: args().assetId, txid: otherTxid }),
  ]);
  assert.deepEqual(base64.decode(first.data), f.proof);
  assert.deepEqual(base64.decode(second.data), new Uint8Array([7, 8, 9]));
  assert.equal(first.offset, undefined);
  assert.equal(first.nextOffset, undefined);
});

test('revocation during either journal write cancels before native invocation', async () => {
  for (const phase of ['prepared', 'pending']) {
    const f = fixture();
    const write = f.store.write;
    f.store.write = async (record) => {
      await write(record);
      if (record.state === phase) f.revoke();
    };
    await assert.rejects(f.controller().burnAsset(args()), {
      code: 'NOT_ENABLED',
    });
    assert.equal(f.calls.length, 0);
    assert.equal((await f.operations.records())[0].state, 'cancelled');
    // Reconnect with a new authorization context on the same wallet/store.
    await f.operations.execute(nativeParams(), metadata(), () => {});
    assert.equal(f.calls.length, 1);
  }
});
test('pre-broadcast funding errors cancel the burn instead of leaving it pending', async () => {
  for (const code of [
    'InsufficientFunds',
    'NoAvailableUtxos',
    'INSUFFICIENT_FUNDS',
  ]) {
    const f = fixture();
    f.wallet.burn = async () => {
      throw Object.assign(new Error('InsufficientAllocationSlots'), { code });
    };
    await assert.rejects(
      f.controller().burnAsset(args()),
      /InsufficientAllocationSlots/
    );
    const [record] = await f.operations.records();
    assert.equal(record.state, 'cancelled', code);
    assert.equal(record.error, 'InsufficientAllocationSlots');
  }
  // An unknown native failure after invocation stays unresolved.
  const f = fixture();
  f.wallet.burn = async () => {
    throw Object.assign(new Error('broadcast failed'), {
      code: 'NATIVE_ERROR',
    });
  };
  await assert.rejects(f.controller().burnAsset(args()));
  assert.equal((await f.operations.records())[0].state, 'pending');
});
test('a capability refusal from burn cancels the record and does not block the next burn', async () => {
  const f = fixture();
  const burn = f.wallet.burn;
  // e.g. an RGB_L1 wallet opened watch-only: rgb-lib refuses before signing.
  f.wallet.burn = async () => {
    throw Object.assign(new Error('burn needs the mnemonic'), {
      code: 'UNSUPPORTED_CAPABILITY',
    });
  };
  await assert.rejects(f.controller().burnAsset(args()), /needs the mnemonic/);
  const [record] = await f.operations.records();
  assert.equal(record.state, 'cancelled');
  f.wallet.burn = burn;
  await f.controller().burnAsset(args());
  assert.equal(f.calls.length, 1);
});
test('BurnOperations refuses a wallet without burn before writing a record', async () => {
  const f = fixture();
  f.wallet.getBfaCapabilities = async () => ({
    burn: false,
    consignment: true,
    bfa: true,
  });
  await assert.rejects(
    f.operations.execute(nativeParams(), metadata(), () => {}),
    (e) => isEngineError(e, 'UNSUPPORTED_CAPABILITY') && e.operation === 'burn'
  );
  assert.deepEqual(await f.operations.records(), []);
  assert.equal(f.calls.length, 0);
});
const pendingRecord = () => ({
  id: 'pending-id',
  params: nativeParams(args().amount),
  metadata: metadata(),
  state: 'pending',
});
test('reconciliation requires a matching burn and independently verified proof', async () => {
  const f = fixture();
  await f.store.write(pendingRecord());
  const result = { txid, batchTransferIdx: 42 };
  await assert.rejects(
    f.operations.reconcile('pending-id', result, async () => false),
    /does not match/
  );
  assert.equal((await f.operations.records())[0].state, 'pending');
  await f.operations.reconcile(
    'pending-id',
    result,
    async (record, native, proof) => {
      assert.equal(record.params.amount, args().amount);
      assert.equal(native.txid, txid);
      assert.deepEqual(base64.decode(proof), f.proof);
      return true;
    }
  );
  assert.equal((await f.operations.records())[0].state, 'complete');
  assert.equal(f.calls.length, 0);
  assert.equal(
    (await f.controller().getTransferStatus(txid)).status,
    'Settled'
  );
});
test('invalid journal records fail closed instead of losing unresolved burns', () => {
  for (const record of [
    null,
    {},
    { version: 2, id: 'x', state: 'complete' },
    {
      id: 'x',
      state: 'pending',
      params: nativeParams(),
      metadata: {
        ...metadata(),
        burnDestination: { ...destination(), dstEid: 1 },
      },
    },
    {
      id: 'x',
      state: 'pending',
      params: nativeParams(),
      metadata: {
        ...metadata(),
        burnDestination: { ...destination(), version: 2 },
      },
    },
  ])
    assert.throws(() => normalizeBurnRecord(record));
});
const tronAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const tronAccount = 'a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const tronArgs = () => ({
  ...args(),
  burnDestination: {
    version: 1,
    chainId: 'tron:728126428',
    address: tronAddress,
    dstEid: 30420,
  },
});
test('Tron burn preserves the native address in approval/result/journal and commits the 21-byte payload', async () => {
  const f = fixture();
  const result = await f.controller().burnAsset(tronArgs());
  assert.deepEqual(result.burnDestination, tronArgs().burnDestination);
  assert.deepEqual(
    f.prompts[0].params.burnDestination,
    tronArgs().burnDestination
  );
  assert.equal(
    f.calls[0].burnRecipient,
    burnDestinationReason(tronArgs().burnDestination)
  );
  const [record] = await f.operations.records();
  assert.deepEqual(record.metadata.burnDestination, tronArgs().burnDestination);
  assert.equal(record.state, 'complete');
  // A new operation service/provider can read the same durable journal without reburning.
  const restarted = new BurnOperations(f.wallet, f.store);
  assert.deepEqual(await restarted.records(), [record]);
  const status = await f.controller().getTransferStatus(txid);
  assert.deepEqual(status.transfer.burnDestination, tronArgs().burnDestination);
  assert.equal(
    (await f.controller().getConsignment({ assetId: 'rgb:asset', txid }))
      .encoding,
    'base64'
  );
  assert.equal(f.calls.length, 1);
});
test('Tron validates checksum, case, version, nonzero account and chain before prompting or burning', async () => {
  const { base58check } = await import('@scure/base');
  const { sha256 } = await import('@noble/hashes/sha2.js');
  const codec = base58check(sha256);
  const zero = codec.encode(new Uint8Array([0x41, ...new Uint8Array(20)]));
  const wrongVersion = codec.encode(
    new Uint8Array([0x42, ...new Uint8Array(20).fill(1)])
  );
  const recipients = [
    { chainId: 'tron:728126428', address: tronAddress.toLowerCase() },
    { chainId: 'tron:728126428', address: tronAddress.slice(0, -1) + 'a' },
    { chainId: 'tron:728126428', address: zero },
    { chainId: 'tron:728126428', address: wrongVersion },
    { chainId: 'tron:728126428', address: '0x' + tronAccount },
    { chainId: 'tron:728126428', address: '41' + tronAccount },
    { chainId: 'tron:0728126428', address: tronAddress },
    { chainId: 'tron:0x2b6653dc', address: tronAddress },
    { chainId: 'eip155:1', address: tronAddress },
    { chainId: 'cosmos:cosmoshub-4', address: tronAddress },
  ];
  for (const recipient of recipients) {
    // Route the chain when it is routable, so only the address can fail.
    const f = fixture(
      /^(eip155|tron):[1-9][0-9]*$/.test(recipient.chainId)
        ? [...ROUTES, { chainId: recipient.chainId, dstEid: 1 }]
        : ROUTES
    );
    await assert.rejects(
      f.controller().burnAsset({
        ...args(),
        burnDestination: { version: 1, ...recipient, dstEid: 1 },
      }),
      { code: 'INVALID_PARAMS' }
    );
    assert.equal(f.prompts.length, 0);
    assert.equal(f.calls.length, 0);
    assert.equal((await f.store.readAll()).length, 0);
  }
});
test('a burn needs the exact configured chain and endpoint pair', async () => {
  // Tron testnets are served only when the deployment lists them.
  for (const chainId of ['tron:2494104990', 'tron:3448148188']) {
    const unlisted = fixture();
    await assert.rejects(
      unlisted.controller().burnAsset({
        ...args(),
        burnDestination: {
          version: 1,
          chainId,
          address: tronAddress,
          dstEid: 30420,
        },
      }),
      { code: 'INVALID_PARAMS' }
    );
    assert.equal(unlisted.prompts.length, 0);
    const f = fixture([{ chainId, dstEid: 40420 }]);
    const result = await f.controller().burnAsset({
      ...args(),
      burnDestination: {
        version: 1,
        chainId,
        address: tronAddress,
        dstEid: 40420,
      },
    });
    assert.equal(result.burnDestination.chainId, chainId);
  }
  for (const changed of [
    { ...destination(), dstEid: 30101 },
    { ...destination(), chainId: 'eip155:137' },
    { version: 1, chainId: 'eip155:1', address: evmAddress, dstEid: 0 },
  ]) {
    const f = fixture();
    await assert.rejects(
      f.controller().burnAsset({ ...args(), burnDestination: changed }),
      { code: 'INVALID_PARAMS' }
    );
    assert.equal(f.prompts.length, 0);
    assert.equal(f.calls.length, 0);
  }
});
test('Tron journal rejects mismatched or corrupted recipient metadata', async () => {
  const f = fixture();
  await f.controller().burnAsset(tronArgs());
  const [record] = await f.operations.records();
  assert.throws(
    () =>
      normalizeBurnRecord({
        ...record,
        params: { ...record.params, burnRecipient: '1'.repeat(64) },
      }),
    /does not match/
  );
  assert.throws(() =>
    normalizeBurnRecord({
      ...record,
      metadata: {
        ...record.metadata,
        burnDestination: {
          ...record.metadata.burnDestination,
          address: tronAddress.toLowerCase(),
        },
      },
    })
  );
});
test('ambiguous Tron burn remains pending after restart and cannot burn again', async () => {
  const f = fixture();
  let calls = 0;
  f.wallet.burn = async () => {
    calls++;
    throw new Error('Lost native response');
  };
  await assert.rejects(
    f.controller().burnAsset(tronArgs()),
    /Lost native response/
  );
  await assert.rejects(
    f.controller().burnAsset(tronArgs()),
    /unresolved outcome/
  );
  assert.equal(
    (await new BurnOperations(f.wallet, f.store).records())[0].state,
    'pending'
  );
  assert.equal(calls, 1);
});
test('provider advertises Tron only while native burn works', async () => {
  const f = fixture();
  const provider = new WebRgbProvider(f.wallet, {
    origin: 'https://mint.example',
    sessionApproved: true,
    confirm: async () => true,
    burn: { operations: f.operations, destinationRoutes: ROUTES },
  });
  assert.deepEqual((await provider.getInfo()).burnRecipientNamespaces, [
    'eip155',
    'tron',
  ]);
  f.wallet.getBfaCapabilities = async () => ({
    burn: false,
    consignment: true,
  });
  assert.equal((await provider.getInfo()).burnRecipientNamespaces, undefined);
});

test('WalletConnect exposes recipient namespaces and carries the Tron destination unchanged', async (t) => {
  const f = fixture();
  const provider = new WebRgbProvider(f.wallet, {
    origin: 'https://mint.example',
    sessionApproved: true,
    confirm: async () => true,
    burn: { operations: f.operations, destinationRoutes: ROUTES },
  });
  const session = {
    topic: 'burn-session',
    expiry: Math.floor(Date.now() / 1000) + 3600,
    sessionProperties: { webrgb: 'webrgb:1' },
    peer: { metadata: { url: 'https://wallet.example' } },
    namespaces: {
      rgb: {
        accounts: ['rgb:utexo:test-wallet'],
        methods: ['rgb_enable', 'rgb_getInfo', 'rgb_burnAsset'],
        events: [],
      },
    },
  };
  const client = Object.assign(new EventEmitter(), {
    core: { relayer: new EventEmitter() },
    session: { get: () => session },
    request: async ({ topic, chainId, request }) => {
      assert.equal(topic, session.topic);
      assert.equal(chainId, 'rgb:utexo');
      return provider[request.method.slice(4)](...request.params);
    },
  });
  const remote = createWalletConnectProvider({
    client,
    topic: session.topic,
    network: 'utexo',
  });
  t.after(() => remote.dispose());
  await remote.enable();
  assert.deepEqual((await remote.getInfo()).burnRecipientNamespaces, [
    'eip155',
    'tron',
  ]);
  const result = await remote.burnAsset(tronArgs());
  assert.deepEqual(result.burnDestination, tronArgs().burnDestination);
  assert.equal(f.calls.length, 1);
  assert.equal(
    f.calls[0].burnRecipient,
    burnDestinationReason(tronArgs().burnDestination)
  );
});

test('the commitment is unchanged: go-ethereum ABI vectors from utexo-bridge-fe and the SPEC example', async () => {
  const { base58check } = await import('@scure/base');
  const { sha256 } = await import('@noble/hashes/sha2.js');
  const { hexToBytes } = await import('@noble/hashes/utils.js');
  const { vectors } = JSON.parse(
    readFileSync(
      new URL('./fixtures/burn-destination-vectors.json', import.meta.url)
    )
  );
  let checked = 0;
  for (const vector of vectors) {
    const bytes = hexToBytes(vector.recipient.slice(2));
    // Only native EVM (20 bytes) and Tron (0x41 + 20 bytes) payouts have an address.
    const native =
      bytes.length === 20
        ? {
            version: 1,
            chainId: `eip155:${vector.destinationChainId}`,
            address: vector.recipient,
          }
        : bytes.length === 21 && bytes[0] === 0x41
          ? {
              version: 1,
              chainId: `tron:${vector.destinationChainId}`,
              address: base58check(sha256).encode(bytes),
            }
          : undefined;
    if (!native) continue;
    checked += 1;
    assert.equal(
      burnDestinationHash({ ...native, dstEid: vector.dstEid }),
      vector.hash,
      vector.name
    );
  }
  assert.equal(checked, 3);
  assert.equal(
    burnDestinationHash({
      version: 1,
      chainId: 'eip155:137',
      address: '0x1111111111111111111111111111111111111111',
      dstEid: 30109,
    }),
    '0x7234950dd3dc71ccd10bc2b721230f7393ef7782176c1b296669cfda97850a6b'
  );
  for (const invalid of [
    null,
    {},
    { ...destination(), dstEid: -1 },
    { ...destination(), dstEid: 2 ** 32 },
    { ...destination(), dstEid: 1.5 },
    { ...destination(), chainId: 'eip155:18446744073709551616' },
    { ...destination(), chainId: 'eip155:01' },
    { ...destination(), address: '0x123' },
    { ...destination(), address: `0x${'0'.repeat(40)}` },
  ])
    assert.throws(() => burnDestinationHash(invalid));
});
test('RGB_L1 lists burn without route fields, commits the approved hash and recovers the destination after restart', async () => {
  const f = fixture();
  f.wallet.protocol = 'RGB_L1';
  const provider = new WebRgbProvider(f.wallet, {
    origin: 'https://mint.example',
    sessionApproved: true,
    confirm: async () => true,
    burn: { operations: f.operations, destinationRoutes: ROUTES },
  });
  const info = await provider.getInfo();
  assert.equal(info.protocol, 'RGB_L1');
  assert.equal('burnDestinationVersion' in info, false);
  assert.equal('burnDestinationRoutes' in info, false);
  assert.ok(info.methods.includes('burnAsset'));
  assert.ok(info.methods.includes('getConsignment'));
  assert.ok(!info.methods.includes('signMessage'));
  const result = await provider.burnAsset(args());
  assert.deepEqual(result.burnDestination, destination());
  assert.equal(f.calls[0].burnRecipient, burnDestinationReason(destination()));
  const [record] = await new BurnOperations(f.wallet, f.store).records();
  assert.deepEqual(record.metadata.burnDestination, destination());
  assert.deepEqual(normalizeBurnRecord(record), record);
  const status = await f.controller().getTransferStatus(txid, args().assetId);
  assert.deepEqual(status.transfer.burnDestination, destination());
  const altered = structuredClone(record);
  altered.metadata.burnDestination.dstEid++;
  assert.throws(() => normalizeBurnRecord(altered));
  await provider.getConsignment({ assetId: args().assetId, txid });
  assert.equal(
    f.calls.length,
    1,
    'Recovery and proof reads never repeat the burn'
  );
});
const withoutDestination = () => {
  const request = args();
  delete request.burnDestination;
  return request;
};
test('a missing or unsupported destination version rejects before approval', async () => {
  const { version, ...unversioned } = destination();
  assert.equal(version, 1);
  for (const burnDestination of [
    unversioned,
    ...[undefined, null, '1', 0, 2, 1.5, true].map((value) => ({
      ...destination(),
      version: value,
    })),
  ]) {
    const f = fixture();
    await assert.rejects(
      f.controller().burnAsset({ ...args(), burnDestination }),
      { code: 'INVALID_PARAMS' }
    );
    assert.equal(f.prompts.length, 0);
    assert.equal(f.calls.length, 0);
    assert.throws(() => burnDestinationHash(burnDestination));
  }
});
test('legacy or mixed destination fields reject before approval, and there is no address-only fallback', async () => {
  const legacyV1 = {
    version: 1,
    destinationChainId: 42161,
    dstEid: 0,
    recipient: evmAddress,
  };
  for (const request of [
    { ...args(), burnDestination: undefined },
    withoutDestination(),
    {
      ...withoutDestination(),
      burnRecipient: { chainId: 'eip155:42161', address: evmAddress },
    },
    {
      ...args(),
      burnRecipient: { chainId: 'eip155:42161', address: evmAddress },
    },
    { ...args(), burnDestination: legacyV1 },
    { ...args(), burnDestination: { ...destination(), recipient: evmAddress } },
    {
      ...args(),
      burnDestination: {
        chainId: 'eip155:42161',
        address: evmAddress,
        dstEid: 0,
      },
    },
    { ...args(), burnDestination: { ...destination(), dstEid: '0' } },
    {
      ...args(),
      burnDestination: { ...destination(), address: '1'.repeat(64) },
    },
  ]) {
    const f = fixture();
    await assert.rejects(f.controller().burnAsset(request), {
      code: 'INVALID_PARAMS',
    });
    assert.equal(f.prompts.length, 0);
    assert.equal(f.calls.length, 0);
  }
  // Without configured routes the wallet cannot serve burnAsset at all.
  const unrouted = fixture(null);
  assert.deepEqual(await unrouted.controller().methods(), ['getConsignment']);
  await assert.rejects(unrouted.controller().burnAsset(args()), {
    code: 'METHOD_NOT_SUPPORTED',
  });
  assert.equal(unrouted.calls.length, 0);
  assert.throws(() => fixture([]).controller(), /routes/);
  assert.throws(
    () => fixture([ROUTES[0], ROUTES[0]]).controller(),
    /duplicate/
  );
  assert.throws(
    () => fixture([{ chainId: 'tron:728126428', dstEid: 0 }]).controller(),
    /route/
  );
});
test('EVM addresses keep their case; a mixed-case address must be a valid EIP-55 checksum', async () => {
  const checksummed = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
  const f = fixture();
  const result = await f.controller().burnAsset({
    ...args(),
    burnDestination: { ...destination(), address: checksummed },
  });
  assert.equal(result.burnDestination.address, checksummed);
  assert.equal(
    f.calls[0].burnRecipient,
    burnDestinationReason({
      ...destination(),
      address: checksummed.toLowerCase(),
    })
  );
  const broken = fixture();
  await assert.rejects(
    broken.controller().burnAsset({
      ...args(),
      burnDestination: {
        ...destination(),
        address: '0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      },
    }),
    { code: 'INVALID_PARAMS' }
  );
  assert.equal(broken.prompts.length, 0);
});
test('records in an earlier SDK format are not read: the journal fails closed', async () => {
  const legacy = [
    {
      origin: 'https://mint.example',
      state: 'pending',
      request: {
        requestId: 'old',
        network: 'utexo',
        assetId: 'rgb:asset',
        amount: '5',
        burnRecipient: { chainId: 'eip155:42161', address: evmAddress },
      },
    },
    {
      version: 2,
      id: 'old',
      params: nativeParams(),
      metadata: {
        origin: 'https://mint.example',
        network: 'utexo',
        payout: { chainId: 'eip155:42161', address: evmAddress },
      },
      state: 'complete',
      result: { txid, batchTransferIdx: 42 },
    },
  ];
  for (const record of legacy) {
    assert.throws(() => normalizeBurnRecord(record));
    const f = fixture();
    await f.store.write({ ...record, id: 'old' });
    await assert.rejects(f.controller().burnAsset(args()));
    assert.equal(f.calls.length, 0);
  }
});
test('a local burn exposes recovery metadata only after successful proof-sharing consent', async () => {
  const f = fixture();
  const result = await f.controller('local:wallet').burnAsset(args());
  const bridge = f.controller();
  assert.equal(await bridge.getTransferStatus(txid, args().assetId), null);
  f.approve(false);
  await assert.rejects(
    bridge.getConsignment({ assetId: args().assetId, txid }),
    { code: 'USER_REJECTED' }
  );
  assert.equal(await bridge.getTransferStatus(txid, args().assetId), null);
  f.approve(true);
  const proof = await bridge.getConsignment({ assetId: args().assetId, txid });
  assert.deepEqual(base64.decode(proof.data), f.proof);
  const status = await bridge.getTransferStatus(txid, args().assetId);
  assert.deepEqual(status.transfer.burnDestination, result.burnDestination);
  bridge.revoke();
  assert.equal(await bridge.getTransferStatus(txid, args().assetId), null);
  assert.equal(f.calls.length, 1);
});
test('a wallet without getConsignment serves neither burnAsset nor getConsignment', async () => {
  // e.g. RgbLibWeb: it burns, but rgb-lib-wasm beta.4 exports no consignment.
  const f = fixture();
  delete f.wallet.getConsignment;
  f.wallet.getBfaCapabilities = async () => ({
    burn: true,
    consignment: false,
    bfa: true,
  });
  const controller = f.controller();
  assert.deepEqual(await controller.methods(), []);
  await assert.rejects(controller.burnAsset(args()), {
    code: 'METHOD_NOT_SUPPORTED',
  });
  await assert.rejects(
    controller.getConsignment({ assetId: args().assetId, txid }),
    { code: 'METHOD_NOT_SUPPORTED' }
  );
  // Capabilities alone do not list getConsignment without the method.
  f.wallet.getBfaCapabilities = async () => ({
    burn: true,
    consignment: true,
    bfa: true,
  });
  assert.deepEqual(await controller.methods(), []);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.prompts, []);
});
test('reconciliation without getConsignment is refused and stays pending', async () => {
  const f = fixture();
  delete f.wallet.getConsignment;
  await f.store.write(pendingRecord());
  await assert.rejects(
    f.operations.reconcile(
      'pending-id',
      { txid, batchTransferIdx: 42 },
      async () => true
    ),
    (e) =>
      isEngineError(e, 'UNSUPPORTED_CAPABILITY') &&
      e.operation === 'getConsignment'
  );
  assert.equal((await f.operations.records())[0].state, 'pending');
});
