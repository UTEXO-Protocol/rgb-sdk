import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BurnOperations, WebRgbProvider } from '../lib/webrgb/index.js';

const INVOICE = 'rgb:rgb:bfa/~/bcrt:utxob:owned?expiry=4102444800';
const ANY_INVOICE = 'rgb:~/~/bcrt:utxob:any?expiry=4102444800';
const MINT = {
  opid: 'a'.repeat(64),
  lockId: 'b'.repeat(64),
  amount: '18446744073709551615',
  beforeBlock: '9007199254740993',
  evmChainId: '42161',
  bridgeContract: `0x${'C'.repeat(40)}`,
};

function receive(recipientId, invoiceString, extra = {}) {
  return {
    idx: 1,
    status: 'WaitingConfirmations',
    kind: 'ReceiveWitness',
    txid: 'f'.repeat(64),
    recipientId,
    invoiceString,
    assignments: [],
    ...extra,
  };
}

function fixture({
  mint = MINT,
  transfers,
  decoded,
  lookup = true,
  network = 'regtest',
} = {}) {
  const calls = [];
  const prompts = [];
  const all = transfers ?? [
    receive('bcrt:utxob:owned', INVOICE),
    receive('bcrt:utxob:any', ANY_INVOICE),
  ];
  const wallet = {
    getNetwork: () => network,
    isDisposed: () => false,
    listTransfers: async (assetId) => {
      calls.push(['listTransfers', assetId]);
      if (assetId === undefined) return all;
      if (assetId === 'rgb:bfa') return all;
      return [];
    },
    decodeRGBInvoice: async ({ invoice }) =>
      decoded ?? {
        network: 'regtest',
        recipientId:
          invoice === ANY_INVOICE ? 'bcrt:utxob:any' : 'bcrt:utxob:owned',
        assetId: invoice === ANY_INVOICE ? undefined : 'rgb:bfa',
        expirationTimestamp: 4102444800,
        assignment: { type: 'Fungible', amount: 10 },
      },
    getBfaCapabilities: async () => ({ burn: false, consignment: false }),
    burn: async () => {
      throw new Error('burn must not run');
    },
    refreshWallet: async () => {
      throw new Error('a full refresh must not run');
    },
  };
  if (lookup) {
    wallet.getReceivedMint = async (recipientId, options) => {
      calls.push(['getReceivedMint', recipientId, options]);
      return typeof mint === 'function' ? mint() : mint;
    };
  }
  const provider = new WebRgbProvider(wallet, {
    origin: 'https://mint.example',
    sessionApproved: true,
    burn: {
      operations: new BurnOperations(wallet, {
        readAll: async () => [],
        write: async () => undefined,
      }),
    },
    confirm: async (request) => {
      prompts.push(request);
      return true;
    },
  });
  return { provider, calls, prompts, wallet };
}

test('getReceivedMint is advertised only when the wallet has it', async () => {
  const without = fixture({ lookup: false });
  assert.ok(
    !(await without.provider.getInfo()).methods.includes('getReceivedMint')
  );
  await assert.rejects(without.provider.getReceivedMint({ invoice: INVOICE }), {
    code: 'METHOD_NOT_SUPPORTED',
  });
  const { provider } = fixture();
  assert.ok((await provider.getInfo()).methods.includes('getReceivedMint'));
  assert.equal(
    'receivedMintVerificationVersion' in (await provider.getInfo()),
    false
  );
});

test('returns the commitment bound to the owned invoice, without a prompt', async () => {
  const { provider, calls, prompts } = fixture();
  const result = await provider.getReceivedMint({ invoice: INVOICE });
  assert.deepEqual(result, {
    invoice: INVOICE,
    recipientId: 'bcrt:utxob:owned',
    assetId: 'rgb:bfa',
    network: 'regtest',
    txid: 'f'.repeat(64),
    ...MINT,
    bridgeContract: `0x${'c'.repeat(40)}`,
  });
  assert.equal(BigInt(result.amount), 2n ** 64n - 1n);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.equal(prompts.length, 0);
  assert.deepEqual(
    calls.find((c) => c[0] === 'getReceivedMint'),
    ['getReceivedMint', 'bcrt:utxob:owned', { refreshIncoming: true }]
  );
});

test('before the lock is paid the receive has no txid: the result omits it', async () => {
  // rgb-lib saves the checked mint but sets the txid (and, for an any-asset
  // invoice, the asset) only once the EVM lock is found.
  const { provider } = fixture({
    transfers: [
      receive('bcrt:utxob:owned', INVOICE, {
        status: 'WaitingCounterparty',
        txid: null,
      }),
    ],
  });
  const result = await provider.getReceivedMint({ invoice: INVOICE });
  assert.equal('txid' in result, false);
  assert.equal(result.assetId, 'rgb:bfa');
  assert.equal(result.lockId, MINT.lockId);
});

test('an invalid txid in the history rejects', async () => {
  const { provider } = fixture({
    transfers: [receive('bcrt:utxob:owned', INVOICE, { txid: 'nothex' })],
  });
  await assert.rejects(provider.getReceivedMint({ invoice: INVOICE }), {
    code: 'INTERNAL_ERROR',
  });
});

test('an any-asset invoice takes the asset of the checked consignment', async () => {
  const { provider } = fixture({ mint: { ...MINT, assetId: 'rgb:first' } });
  const result = await provider.getReceivedMint({ invoice: ANY_INVOICE });
  assert.equal(result.assetId, 'rgb:first');
  assert.equal(result.invoice, ANY_INVOICE);
  assert.equal(result.recipientId, 'bcrt:utxob:any');
});

test('an any-asset invoice rejects when the engine cannot prove the asset', async () => {
  const { provider } = fixture();
  await assert.rejects(provider.getReceivedMint({ invoice: ANY_INVOICE }), {
    code: 'INVALID_PARAMS',
  });
});

test('an any-asset invoice stays pending until a mint is checked', async () => {
  const { provider } = fixture({ mint: null });
  assert.equal(await provider.getReceivedMint({ invoice: ANY_INVOICE }), null);
});

test('the consignment asset has to match an invoice naming one', async () => {
  const same = fixture({ mint: { ...MINT, assetId: 'rgb:bfa' } });
  assert.equal(
    (await same.provider.getReceivedMint({ invoice: INVOICE })).assetId,
    'rgb:bfa'
  );
  const other = fixture({ mint: { ...MINT, assetId: 'rgb:other' } });
  await assert.rejects(other.provider.getReceivedMint({ invoice: INVOICE }), {
    code: 'INVALID_PARAMS',
  });
});

test('an invalid engine asset rejects', async () => {
  const { provider } = fixture({ mint: { ...MINT, assetId: 'not-an-asset' } });
  await assert.rejects(provider.getReceivedMint({ invoice: ANY_INVOICE }), {
    code: 'INTERNAL_ERROR',
  });
});

test('null only while no checked mint is ready', async () => {
  const { provider } = fixture({ mint: null });
  assert.equal(await provider.getReceivedMint({ invoice: INVOICE }), null);
});

test('a failed or expired receive rejects instead of returning null', async () => {
  const failed = fixture({
    mint: null,
    transfers: [receive('bcrt:utxob:owned', INVOICE, { status: 'Failed' })],
  });
  await assert.rejects(failed.provider.getReceivedMint({ invoice: INVOICE }), {
    code: 'INVALID_PARAMS',
  });
  const expired = fixture({
    mint: null,
    transfers: [
      receive('bcrt:utxob:owned', INVOICE, { status: 'WaitingCounterparty' }),
    ],
    decoded: {
      network: 'regtest',
      recipientId: 'bcrt:utxob:owned',
      assetId: 'rgb:bfa',
      expirationTimestamp: 1,
    },
  });
  await assert.rejects(expired.provider.getReceivedMint({ invoice: INVOICE }), {
    code: 'INVALID_PARAMS',
  });
});

test('a foreign or altered invoice rejects before the engine lookup', async () => {
  for (const transfers of [
    [],
    [receive('bcrt:utxob:owned', `${INVOICE}&endpoints=rpc://evil`)],
    [
      receive('bcrt:utxob:owned', INVOICE),
      receive('bcrt:utxob:owned', INVOICE),
    ],
    [receive('bcrt:utxob:owned', INVOICE, { kind: 'Send' })],
  ]) {
    const { provider, calls } = fixture({ transfers });
    await assert.rejects(provider.getReceivedMint({ invoice: INVOICE }), {
      code: 'INVALID_PARAMS',
    });
    assert.equal(
      calls.some((c) => c[0] === 'getReceivedMint'),
      false
    );
  }
  const other = fixture({
    decoded: { network: 'mainnet', recipientId: 'bcrt:utxob:owned' },
  });
  await assert.rejects(other.provider.getReceivedMint({ invoice: INVOICE }), {
    code: 'INVALID_PARAMS',
  });
});

test('a utexo wallet accepts its invoices, which rgb-lib decodes as signet', async () => {
  const owned = { recipientId: 'bcrt:utxob:owned', assetId: 'rgb:bfa' };
  const { provider } = fixture({
    network: 'utexo',
    decoded: { ...owned, network: 'signet' },
  });
  const result = await provider.getReceivedMint({ invoice: INVOICE });
  assert.equal(result.network, 'utexo');

  const other = fixture({
    network: 'utexo',
    decoded: { ...owned, network: 'mainnet' },
  });
  await assert.rejects(other.provider.getReceivedMint({ invoice: INVOICE }), {
    code: 'INVALID_PARAMS',
  });
});

test('only { invoice } is accepted', async () => {
  const { provider, calls } = fixture();
  for (const args of [
    INVOICE,
    { recipientId: 'bcrt:utxob:owned' },
    { invoice: INVOICE, recipientId: 'bcrt:utxob:owned' },
    { invoice: `${INVOICE} ` },
    { invoice: 'bcrt:utxob:owned' },
    null,
  ]) {
    await assert.rejects(provider.getReceivedMint(args), {
      code: 'INVALID_PARAMS',
    });
  }
  assert.equal(calls.length, 0);
});

test('an invalid engine commitment rejects', async () => {
  const { provider } = fixture({ mint: { ...MINT, lockId: 'xyz' } });
  await assert.rejects(provider.getReceivedMint({ invoice: INVOICE }), {
    code: 'INTERNAL_ERROR',
  });
});

test('a revoked session does not return a result', async () => {
  let provider;
  const env = fixture({
    mint: () => {
      provider.revoke();
      return MINT;
    },
  });
  provider = env.provider;
  await assert.rejects(provider.getReceivedMint({ invoice: INVOICE }), {
    code: 'NOT_ENABLED',
  });
});
