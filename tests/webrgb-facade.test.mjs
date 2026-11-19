// WebRGB over the facade: what used to be checked against RgbLibRn in
// @utexo/rgb-sdk-rn, now with a fake engine (the real one runs in the
// acceptance app).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UTEXOWallet } from '../lib/index.js';
import { BurnOperations, WebRgbProvider } from '../lib/webrgb/index.js';
import { createFakeEngine } from './fake-engine.mjs';

const memoryStore = () => {
  const records = new Map();
  return {
    readAll: async () => [...records.values()],
    write: async (record) => void records.set(record.id, record),
  };
};

// The journal does not touch the wallet until a burn runs.
const options = (extra = {}) => ({
  origin: 'https://example.com',
  sessionApproved: true,
  confirm: async () => true,
  burn: { operations: new BurnOperations(burnEngine(), memoryStore()) },
  ...extra,
});

function burnEngine(caps = { burn: true, consignment: true, bfa: true }) {
  return createFakeEngine({
    isDisposed: () => false,
    getNetwork: () => 'utexo',
    getBfaCapabilities: async () => caps,
    burn: async () => ({ txid: 'a'.repeat(64), batchTransferIdx: 1 }),
    getConsignment: async () => 'proof',
  });
}

test('WebRGB over an RGB_L1 facade advertises only verified capabilities', async () => {
  const wallet = new UTEXOWallet({ engine: burnEngine() });
  let prompts = 0;
  const provider = new WebRgbProvider(wallet, {
    ...options({
      confirm: async () => {
        prompts++;
        return true;
      },
    }),
    burn: {
      operations: new BurnOperations(wallet, memoryStore()),
      destinationRoutes: [{ chainId: 'eip155:42161', dstEid: 0 }],
    },
  });
  const info = await provider.getInfo();
  assert.equal(info.protocol, 'RGB_L1');
  assert.equal(info.network, 'utexo');
  assert.ok(!info.methods.includes('signMessage'));
  assert.ok(info.methods.includes('burnAsset'));
  assert.ok(info.methods.includes('getConsignment'));
  assert.deepEqual(info.burnRecipientNamespaces, ['eip155', 'tron']);
  assert.equal('burnDestinationVersion' in info, false);
  assert.equal('burnDestinationRoutes' in info, false);
  await assert.rejects(provider.signMessage('test'), {
    code: 'METHOD_NOT_SUPPORTED',
  });
  assert.equal(prompts, 0);
});

test('WebRGB does not advertise burn when the engine reports it cannot burn', async () => {
  const wallet = new UTEXOWallet({
    engine: burnEngine({ burn: false, consignment: true, bfa: true }),
  });
  const provider = new WebRgbProvider(wallet, {
    ...options(),
    burn: { operations: new BurnOperations(wallet, memoryStore()) },
  });
  const { methods } = await provider.getInfo();
  assert.ok(!methods.includes('burnAsset'));
  assert.ok(methods.includes('getConsignment'));
});

test('burn operations are required like the rest of the provider', () => {
  const wallet = new UTEXOWallet({ engine: burnEngine() });
  for (const burn of [undefined, {}]) {
    assert.throws(() => new WebRgbProvider(wallet, { ...options(), burn }), {
      code: 'INVALID_PARAMS',
      message: /burn\.operations is required/,
    });
  }
  assert.doesNotThrow(() => new WebRgbProvider(wallet, options()));
});

test('WebRGB read calls go through the facade to the engine', async () => {
  const engine = burnEngine();
  const wallet = new UTEXOWallet({ engine });
  const provider = new WebRgbProvider(wallet, options());
  engine.getAddress = async () => 'tb1qfacade';
  assert.deepEqual(await provider.getAddress(), { address: 'tb1qfacade' });
});
