import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64, bech32m } from '@scure/base';
import { runConformance, formatReport } from '@utexo/webrgb/conformance';
import { BurnOperations, WebRgbProvider } from '../lib/webrgb/index.js';

// ── A small BIP-174 v0 writer: P2TR inputs with witness_utxo ─────────────────

const MINE = 'a'.repeat(64);
const COLORED = 'b'.repeat(64);
const FOREIGN = 'f'.repeat(64);
const P2TR = (byte) => [0x51, 0x20, ...Array(32).fill(byte)];

function size(n) {
  if (n < 0xfd) return [n];
  return [0xfd, n & 0xff, n >> 8];
}
function u32(n) {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}
function u64(n) {
  const out = [];
  let v = BigInt(n);
  for (let i = 0; i < 8; i++) {
    out.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return out;
}
const hex = (s) => s.match(/../g).map((b) => parseInt(b, 16));
const entry = (key, value) => [
  ...size(key.length),
  ...key,
  ...size(value.length),
  ...value,
];

/** spec.inputs: { txid, vout, amount, signed? }; spec.outputs: { script, amount }. */
function build(spec) {
  const tx = [
    ...u32(2),
    ...size(spec.inputs.length),
    ...spec.inputs.flatMap((i) => [
      ...hex(i.txid).reverse(),
      ...u32(i.vout),
      0,
      ...u32(0xffffffff),
    ]),
    ...size(spec.outputs.length),
    ...spec.outputs.flatMap((o) => [
      ...u64(o.amount),
      ...size(o.script.length),
      ...o.script,
    ]),
    ...u32(0),
  ];
  const bytes = [
    0x70,
    0x73,
    0x62,
    0x74,
    0xff,
    ...entry([0x00], tx),
    0,
    ...spec.inputs.flatMap((i) => [
      ...entry([0x01], [...u64(i.amount), ...size(34), ...P2TR(1)]),
      // A finalized key spend: one 64-byte signature in the final witness.
      ...(i.signed ? entry([0x08], [1, 64, ...Array(64).fill(7)]) : []),
      0,
    ]),
    ...spec.outputs.flatMap(() => [0]),
  ];
  return base64.encode(Uint8Array.from(bytes));
}

const SPEC = {
  inputs: [
    { txid: MINE, vout: 0, amount: 10_000 },
    { txid: FOREIGN, vout: 1, amount: 5_000 },
  ],
  outputs: [
    { script: P2TR(2), amount: 14_000 },
    { script: [0x6a, 0x01, 0x00], amount: 0 },
  ],
};

// ── Fixture ──────────────────────────────────────────────────────────────────

function fixture({ approve = true, transfers, ...overrides } = {}) {
  const calls = [];
  const prompts = [];
  let history = transfers ?? [
    {
      idx: 1,
      batchTransferIdx: 7,
      kind: 'ReceiveBlind',
      status: 'WaitingCounterparty',
      recipientId: 'utxob:pending',
      amount: 5,
    },
    {
      idx: 2,
      batchTransferIdx: 8,
      kind: 'ReceiveWitness',
      status: 'WaitingConfirmations',
      recipientId: 'bcrt:moving',
    },
    {
      idx: 3,
      batchTransferIdx: 9,
      kind: 'Send',
      status: 'WaitingCounterparty',
      recipientId: 'utxob:send',
    },
  ];
  const wallet = {
    getNetwork: () => 'regtest',
    protocol: 'RGB_L1',
    isDisposed: () => false,
    getBfaCapabilities: async () => ({ burn: false, consignment: false }),
    burn: async () => {
      throw new Error('burn must not run');
    },
    getAddress: async () => 'bcrt1qexample',
    listAssets: async () => ({ nia: [], uda: [], cfa: [] }),
    getAssetBalance: async () => {
      throw Object.assign(new Error('unknown'), { code: 'ASSET_NOT_FOUND' });
    },
    listTransfers: async () => history,
    refreshWallet: async () => undefined,
    decodeRGBInvoice: async () => {
      throw Object.assign(new Error('bad'), { code: 'InvalidInvoice' });
    },
    blindReceive: async () => ({ invoice: 'rgb:b', recipientId: 'r' }),
    witnessReceive: async () => ({ invoice: 'rgb:w', recipientId: 'r' }),
    failTransfers: async (params) => {
      calls.push(['failTransfers', params]);
      return true;
    },
    psbt: {
      signPsbt: async (psbt, mnemonic) => {
        calls.push(['signPsbt', mnemonic]);
        assert.equal(psbt, build(SPEC));
        return build({
          ...SPEC,
          inputs: SPEC.inputs.map((i) => ({
            ...i,
            signed: i.txid !== FOREIGN,
          })),
        });
      },
      estimateFee: async () => {
        throw new Error('not used');
      },
    },
    listUnspents: async (options) => {
      calls.push(['listUnspents', options]);
      return [
        {
          utxo: {
            outpoint: { txid: MINE, vout: 0 },
            btcAmount: 10_000,
            colorable: false,
            exists: true,
          },
          rgbAllocations: [],
          pendingBlinded: 0,
        },
        {
          utxo: {
            outpoint: { txid: COLORED, vout: 0 },
            btcAmount: 1_000,
            colorable: true,
            exists: true,
          },
          rgbAllocations: [
            {
              assetId: 'rgb:a',
              assignment: { type: 'Fungible', amount: 1 },
              settled: false,
            },
          ],
          pendingBlinded: 0,
        },
      ];
    },
    signMessage: async (message) => `sig:${message}`,
    createUtxos: async (params) => {
      calls.push(['createUtxos', params]);
      return 2;
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
  return {
    provider,
    wallet,
    calls,
    prompts,
    setHistory: (next) => (history = next),
  };
}

// ── Contract shape ───────────────────────────────────────────────────────────

test('every RgbProvider method is defined and the 0.2 conformance suite passes', async () => {
  const { provider } = fixture();
  const report = await runConformance(provider);
  assert.ok(report.ok, formatReport(report));
  const bare = fixture({
    failTransfers: undefined,
    psbt: undefined,
    signMessage: undefined,
    createUtxos: undefined,
  });
  const bareReport = await runConformance(bare.provider);
  assert.ok(bareReport.ok, formatReport(bareReport));
});

test('cancelReceive and signPsbt are listed only when the wallet can serve them', async () => {
  const { methods } = await fixture().provider.getInfo();
  assert.ok(methods.includes('cancelReceive'));
  assert.ok(methods.includes('signPsbt'));
  for (const missing of [
    { failTransfers: undefined },
    { psbt: undefined },
    { listUnspents: undefined },
  ]) {
    const f = fixture(missing);
    const listed = (await f.provider.getInfo()).methods;
    const method = 'failTransfers' in missing ? 'cancelReceive' : 'signPsbt';
    assert.ok(!listed.includes(method), method);
    await assert.rejects(
      method === 'cancelReceive'
        ? f.provider.cancelReceive('utxob:pending')
        : f.provider.signPsbt(build(SPEC)),
      { code: 'METHOD_NOT_SUPPORTED' }
    );
  }
});

test('issueAsset, sendAsset and Lightning reject with METHOD_NOT_SUPPORTED; on/off take only known events', async () => {
  const { provider, prompts } = fixture();
  for (const call of [
    () =>
      provider.issueAsset({
        schema: 'nia',
        ticker: 'T',
        name: 'T',
        amounts: [1],
      }),
    () => provider.sendAsset({ invoice: 'rgb:x' }),
    () => provider.makeLnInvoice({ assetId: 'rgb:a', assetAmount: 1 }),
    () => provider.payLnInvoice('lnbc1'),
  ])
    await assert.rejects(call(), { code: 'METHOD_NOT_SUPPORTED' });
  assert.equal(prompts.length, 0);
  const listener = () => undefined;
  provider.on('transferReceived', listener);
  provider.off('transferSettled', listener);
  assert.throws(() => provider.on('nope', listener), {
    code: 'INVALID_PARAMS',
  });
});

// ── cancelReceive ────────────────────────────────────────────────────────────

test('cancelReceive prompts, then fails only the waiting receive', async () => {
  const { provider, calls, prompts } = fixture();
  assert.deepEqual(await provider.cancelReceive('utxob:pending'), {
    cancelled: true,
  });
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].method, 'cancelReceive');
  assert.deepEqual(prompts[0].params, {
    recipientId: 'utxob:pending',
    kind: 'ReceiveBlind',
    amount: 5,
  });
  assert.deepEqual(calls, [
    ['failTransfers', { batchTransferIdx: 7, noAssetOnly: false }],
  ]);
});

test('cancelReceive resolves false without a prompt for unknown, moving or sending transfers', async () => {
  for (const id of ['utxob:unknown', 'bcrt:moving', 'utxob:send']) {
    const { provider, calls, prompts } = fixture();
    assert.deepEqual(await provider.cancelReceive(id), { cancelled: false });
    assert.equal(prompts.length, 0, id);
    assert.equal(calls.length, 0, id);
  }
});

test('cancelReceive rejects a malformed recipientId and a declined prompt', async () => {
  for (const id of ['', ' x', 'a\nb', 42, undefined, 'x'.repeat(513)]) {
    const { provider, prompts } = fixture();
    await assert.rejects(provider.cancelReceive(id), {
      code: 'INVALID_PARAMS',
    });
    assert.equal(prompts.length, 0);
  }
  const declined = fixture({ approve: false });
  await assert.rejects(declined.provider.cancelReceive('utxob:pending'), {
    code: 'USER_REJECTED',
  });
  assert.equal(declined.calls.length, 0);
});

test('cancelReceive does nothing when the sender answered while the prompt was open', async () => {
  const f = fixture();
  f.provider.options.confirm = async () => {
    f.setHistory([
      {
        idx: 1,
        batchTransferIdx: 7,
        kind: 'ReceiveBlind',
        status: 'WaitingConfirmations',
        recipientId: 'utxob:pending',
      },
    ]);
    return true;
  };
  assert.deepEqual(await f.provider.cancelReceive('utxob:pending'), {
    cancelled: false,
  });
  assert.equal(f.calls.length, 0);
});

// ── signPsbt ─────────────────────────────────────────────────────────────────

test('signPsbt shows outputs, fee and inputs, then returns the signed PSBT', async () => {
  const { provider, prompts, calls } = fixture();
  const result = await provider.signPsbt(build(SPEC));
  assert.equal(result.signedInputs, 1);
  assert.equal(
    result.psbt,
    build({
      ...SPEC,
      inputs: [{ ...SPEC.inputs[0], signed: true }, SPEC.inputs[1]],
    })
  );
  assert.equal(prompts.length, 1);
  const { method, params } = prompts[0];
  assert.equal(method, 'signPsbt');
  assert.deepEqual(params, {
    outputs: [
      {
        amount: 14_000,
        script: '5120' + '02'.repeat(32),
        address: bech32m.encode('bcrt', [
          1,
          ...bech32m.toWords(Uint8Array.from(Array(32).fill(2))),
        ]),
      },
      { amount: 0, script: '6a0100', address: null },
    ],
    fee: 1_000,
    signedInputs: [0],
    finalize: false,
  });
  assert.ok(Object.isFrozen(params) && Object.isFrozen(params.outputs));
  assert.deepEqual(calls, [
    ['signPsbt', undefined],
    ['listUnspents', { skipSync: true }],
  ]);
});

test('signPsbt refuses an input holding RGB assets with UNSAFE_PSBT before the prompt', async () => {
  const spec = {
    ...SPEC,
    inputs: [{ txid: COLORED, vout: 0, amount: 1_000 }, ...SPEC.inputs],
  };
  const { provider, prompts } = fixture({
    psbt: {
      signPsbt: async () =>
        build({
          ...spec,
          inputs: spec.inputs.map((i) => ({
            ...i,
            signed: i.txid !== FOREIGN,
          })),
        }),
    },
  });
  await assert.rejects(provider.signPsbt(build(spec)), {
    code: 'UNSAFE_PSBT',
    message: /^Input 0 holds RGB assets/,
  });
  assert.equal(prompts.length, 0);
});

test('signPsbt rejects a PSBT with no wallet input, bad input and a declined prompt', async () => {
  const none = fixture({ psbt: { signPsbt: async (psbt) => psbt } });
  await assert.rejects(none.provider.signPsbt(build(SPEC)), {
    code: 'INVALID_PARAMS',
    message: /no input this wallet controls/,
  });
  assert.equal(none.prompts.length, 0);
  for (const [psbt, opts] of [
    ['', undefined],
    ['not base64!', undefined],
    [base64.encode(Uint8Array.from([1, 2, 3, 4, 5, 6])), undefined],
    [build(SPEC), { finalize: 'yes' }],
    [build(SPEC), { sighash: 1 }],
    [42, undefined],
  ]) {
    const { provider, prompts, calls } = fixture();
    await assert.rejects(provider.signPsbt(psbt, opts), {
      code: 'INVALID_PARAMS',
    });
    assert.equal(prompts.length, 0);
    assert.equal(calls.length, 0);
  }
  const declined = fixture({ approve: false });
  await assert.rejects(declined.provider.signPsbt(build(SPEC)), {
    code: 'USER_REJECTED',
  });
});

test('signPsbt refuses a signer that returns a different transaction', async () => {
  const { provider } = fixture({
    psbt: {
      signPsbt: async () =>
        build({
          ...SPEC,
          inputs: [
            { ...SPEC.inputs[0], vout: 5, signed: true },
            SPEC.inputs[1],
          ],
        }),
    },
  });
  await assert.rejects(provider.signPsbt(build(SPEC)), {
    code: 'INTERNAL_ERROR',
  });
});

// ── 0.2 parameter rules ──────────────────────────────────────────────────────

test('createUtxos rounds a fractional feeRate up and shows the rate used', async () => {
  const { provider, calls, prompts } = fixture();
  const result = await provider.createUtxos({ feeRate: 1.2 });
  assert.equal(result.feeRate, 2);
  assert.equal(prompts[0].params.feeRate, 2);
  assert.equal(calls[0][1].feeRate, 2);
});

test('signMessage rejects an empty message before the prompt', async () => {
  const { provider, prompts } = fixture({ protocol: 'RGB_LN' });
  await assert.rejects(provider.signMessage(''), { code: 'INVALID_PARAMS' });
  assert.equal(prompts.length, 0);
  assert.deepEqual(await provider.signMessage('hi'), { signature: 'sig:hi' });
});

// ── Events ───────────────────────────────────────────────────────────────────

test('on() delivers transferReceived and transferSettled from the transfer list', async () => {
  const f = fixture({ eventPollMs: 100_000 });
  const seen = [];
  const received = (t) => seen.push(['received', t.transferId, t.status]);
  const settled = (t) => seen.push(['settled', t.transferId, t.status]);
  f.provider.on('transferReceived', received);
  f.provider.on('transferSettled', settled);
  const events = f.provider.events;
  await events.poll(); // the first read only records the state
  assert.deepEqual(seen, []);
  f.setHistory([
    {
      idx: 1,
      batchTransferIdx: 7,
      kind: 'ReceiveBlind',
      status: 'WaitingConfirmations',
      recipientId: 'utxob:pending',
    },
    {
      idx: 2,
      batchTransferIdx: 8,
      kind: 'ReceiveWitness',
      status: 'Settled',
      recipientId: 'bcrt:moving',
    },
    {
      idx: 3,
      batchTransferIdx: 9,
      kind: 'Send',
      status: 'Settled',
      recipientId: 'utxob:send',
    },
  ]);
  await events.poll();
  assert.deepEqual(seen, [
    ['received', 1, 'WaitingConfirmations'],
    ['settled', 2, 'Settled'],
    ['settled', 3, 'Settled'],
  ]);
  await events.poll();
  assert.equal(seen.length, 3, 'no repeats');
  f.provider.off('transferReceived', received);
  f.provider.off('transferSettled', settled);
  assert.equal(events.timer, undefined, 'polling stops with the last listener');
  f.provider.on('transferSettled', settled);
  f.provider.revoke();
  assert.equal(events.timer, undefined, 'revoke stops polling');
  assert.throws(() => f.provider.on('transferSettled', settled), {
    code: 'NOT_ENABLED',
  });
});
