import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runEngineConformanceChecks,
  SHARED_WALLET_METHODS,
  ENGINE_EXTENSIONS,
} from '@utexo/rgb-sdk-core/conformance';
import { isEngineError } from '@utexo/rgb-sdk-core';
import {
  UTEXOWallet,
  UTEXOWalletError,
  FORWARDED_EXTENSION_METHODS,
  EngineContractError,
} from '../lib/index.js';
import { createFakeEngine, SYNC_METHODS } from './fake-engine.mjs';

const expect = (actual) => ({
  toBe: (expected) => assert.equal(actual, expected),
  toContain: (expected) => assert.ok(actual.includes(expected)),
});

const ALL_EXTENSION_METHODS = [
  ...new Set(Object.values(ENGINE_EXTENSIONS).flat()),
];

function withExtensions(names) {
  const extra = {};
  for (const name of names) {
    extra[name] = async function (...args) {
      this.calls.push({ name, args, self: this });
      return { from: name };
    };
  }
  return createFakeEngine(extra);
}

describe('construction', () => {
  it('rejects a missing options object or engine with INVALID_CONFIG', () => {
    for (const options of [
      undefined,
      null,
      1,
      {},
      { engine: null },
      { engine: 'x' },
    ]) {
      assert.throws(
        () => new UTEXOWallet(options),
        (e) =>
          e instanceof UTEXOWalletError &&
          e.code === 'INVALID_CONFIG' &&
          isEngineError(e, 'INVALID_CONFIG'),
        `options ${JSON.stringify(options)}`
      );
    }
  });

  it('checks the contract before anything else touches the engine', () => {
    const touched = [];
    const engine = new Proxy(createFakeEngine({ contractVersion: '2' }), {
      get(target, key, receiver) {
        touched.push(key);
        return Reflect.get(target, key, receiver);
      },
    });
    assert.throws(
      () => new UTEXOWallet({ engine }),
      (e) =>
        e instanceof EngineContractError &&
        e.code === 'ENGINE_CONTRACT_MISMATCH' &&
        e.operation === 'contractCheck' &&
        e.protocol === 'RGB_L1'
    );
    assert.deepEqual([...new Set(touched)].sort(), [
      'contractVersion',
      'protocol',
    ]);
  });

  it('rejects an engine without a contractVersion', () => {
    const engine = createFakeEngine();
    delete engine.contractVersion;
    assert.throws(
      () => new UTEXOWallet({ engine }),
      (e) => isEngineError(e, 'ENGINE_CONTRACT_MISMATCH')
    );
  });

  it('rejects an engine missing shared methods with INVALID_CONFIG', () => {
    const engine = createFakeEngine({ syncWallet: undefined, listAssets: 1 });
    assert.throws(
      () => new UTEXOWallet({ engine }),
      (e) =>
        e instanceof UTEXOWalletError &&
        e.code === 'INVALID_CONFIG' &&
        e.protocol === 'RGB_L1' &&
        /listAssets, syncWallet|syncWallet/.test(e.message)
    );
  });

  it('opens no session: the constructor calls no engine method', () => {
    const engine = withExtensions(ALL_EXTENSION_METHODS);
    new UTEXOWallet({ engine });
    assert.deepEqual(engine.calls, []);
  });
});

describe('shared API', () => {
  it('lists the same methods as core', () => {
    const wallet = new UTEXOWallet({ engine: createFakeEngine() });
    for (const name of SHARED_WALLET_METHODS) {
      assert.equal(typeof wallet[name], 'function', name);
    }
  });

  for (const name of SHARED_WALLET_METHODS) {
    it(`${name}() forwards its arguments and result unchanged`, async () => {
      const engine = createFakeEngine();
      const wallet = new UTEXOWallet({ engine });
      const args = [{ arg: name }, 7];
      const result = wallet[name](...args);
      const value = SYNC_METHODS.has(name) ? result : await result;
      assert.deepEqual(value, { from: name });
      assert.equal(engine.calls.length, 1);
      assert.equal(engine.calls[0].name, name);
      assert.deepEqual(engine.calls[0].args, args);
      assert.equal(engine.calls[0].self, engine, 'called on the engine');
    });
  }

  it('returns the engine promise itself', () => {
    const promise = Promise.resolve('txid');
    const engine = createFakeEngine({ sendBtc: () => promise });
    assert.equal(new UTEXOWallet({ engine }).sendBtc({}), promise);
  });

  it('passes rejections through as the same object', async () => {
    const error = {
      code: 'WALLET_OFFLINE',
      message: 'x',
      operation: 'sendBtc',
      protocol: 'RGB_L1',
    };
    const engine = createFakeEngine({ sendBtc: () => Promise.reject(error) });
    await assert.rejects(
      new UTEXOWallet({ engine }).sendBtc({}),
      (e) => e === error
    );
  });

  it('passes synchronous throws through as the same object', () => {
    const error = new Error('boom');
    const engine = createFakeEngine({
      getNetwork: () => {
        throw error;
      },
    });
    assert.throws(
      () => new UTEXOWallet({ engine }).getNetwork(),
      (e) => e === error
    );
  });

  it('refresh(), refreshWallet() and syncWallet() stay distinct', async () => {
    const engine = createFakeEngine();
    const wallet = new UTEXOWallet({ engine });
    const options = { skipSync: true };
    await wallet.refresh(options);
    await wallet.refreshWallet();
    await wallet.syncWallet();
    assert.deepEqual(
      engine.calls.map((c) => c.name),
      ['refresh', 'refreshWallet', 'syncWallet']
    );
    assert.deepEqual(engine.calls[0].args, [options]);
  });
});

describe('aliases', () => {
  it('initialize() calls init() and dispose() calls destroy()', async () => {
    const engine = createFakeEngine();
    const wallet = new UTEXOWallet({ engine });
    assert.deepEqual(await wallet.initialize(), { from: 'init' });
    assert.deepEqual(await wallet.dispose(), { from: 'destroy' });
    assert.deepEqual(
      engine.calls.map((c) => c.name),
      ['init', 'destroy']
    );
  });

  it('goOnline() exists only when the engine has it', async () => {
    assert.equal(
      'goOnline' in new UTEXOWallet({ engine: createFakeEngine() }),
      false
    );
    const engine = withExtensions(['goOnline']);
    const wallet = new UTEXOWallet({ engine });
    assert.deepEqual(await wallet.goOnline({ a: 1 }), { from: 'goOnline' });
    assert.deepEqual(engine.calls[0].args, [{ a: 1 }]);
  });
});

describe('engine properties', () => {
  it('protocol, contractVersion, capabilities, psbt and beginEnd come from the engine', () => {
    const psbt = { signPsbt() {}, estimateFee() {} };
    const engine = createFakeEngine({ protocol: 'RGB_LN', psbt });
    const wallet = new UTEXOWallet({ engine });
    assert.equal(wallet.protocol, 'RGB_LN');
    assert.equal(wallet.contractVersion, '1');
    assert.equal(wallet.psbt, psbt);
    assert.equal(wallet.beginEnd, undefined);
    assert.equal(wallet.engine, engine);
    // Read on every access, never stored.
    const next = {
      canSignTransactions: false,
      psbtSigning: true,
      beginEndFlows: false,
    };
    engine.capabilities = next;
    assert.equal(wallet.capabilities, next);
  });

  it('protocol cannot be assigned', () => {
    const wallet = new UTEXOWallet({ engine: createFakeEngine() });
    assert.throws(() => {
      wallet.protocol = 'RGB_LN';
    }, TypeError);
    assert.equal(wallet.protocol, 'RGB_L1');
  });

  it('the engine is not an own enumerable property', () => {
    const wallet = new UTEXOWallet({ engine: createFakeEngine() });
    assert.deepEqual(Object.keys(wallet), []);
  });
});

describe('extensions', () => {
  it('none appear for an engine without extensions', () => {
    const wallet = new UTEXOWallet({ engine: createFakeEngine() });
    for (const name of FORWARDED_EXTENSION_METHODS) {
      assert.equal(name in wallet, false, name);
    }
  });

  it('forwards every core extension method', () => {
    for (const name of ALL_EXTENSION_METHODS) {
      assert.ok(FORWARDED_EXTENSION_METHODS.includes(name), name);
    }
  });

  for (const name of FORWARDED_EXTENSION_METHODS) {
    it(`${name}() appears only with the engine method and forwards to it`, async () => {
      const engine = withExtensions([name]);
      const wallet = new UTEXOWallet({ engine });
      for (const other of FORWARDED_EXTENSION_METHODS) {
        if (other !== name) assert.equal(other in wallet, false, other);
      }
      assert.deepEqual(await wallet[name]('a', 2), { from: name });
      assert.deepEqual(engine.calls[0].args, ['a', 2]);
      assert.equal(engine.calls[0].self, engine);
    });
  }

  it('extension rejections pass through as the same object', async () => {
    const error = new Error('no burn');
    const engine = createFakeEngine({ burn: () => Promise.reject(error) });
    await assert.rejects(
      new UTEXOWallet({ engine }).burn({}),
      (e) => e === error
    );
  });

  it('ignores non-function engine members with extension names', () => {
    const wallet = new UTEXOWallet({
      engine: createFakeEngine({ burn: true }),
    });
    assert.equal('burn' in wallet, false);
  });

  it('extension methods cannot be replaced on the facade', () => {
    const wallet = new UTEXOWallet({ engine: withExtensions(['burn']) });
    assert.throws(() => {
      wallet.burn = () => {};
    }, TypeError);
  });
});

// The facade is itself a contract implementation: core's checks run on an
// instance (extensions are instance members, so the instance stands in for
// the prototype).
const rgbLibLike = [
  'restartable',
  'fileBackup',
  'maintenance',
  'burn',
  'consignment',
  'consignmentFile',
];
const fullFacade = () =>
  new UTEXOWallet({
    engine: withExtensions(rgbLibLike.flatMap((n) => ENGINE_EXTENSIONS[n])),
  });
runEngineConformanceChecks({
  name: 'UTEXOWallet over an rgb-lib-like engine',
  engineClass: { prototype: fullFacade() },
  createEngineSync: fullFacade,
  extensions: rgbLibLike,
  describe,
  it,
  expect,
});
runEngineConformanceChecks({
  name: 'UTEXOWallet over a bare engine',
  engineClass: { prototype: new UTEXOWallet({ engine: createFakeEngine() }) },
  createEngineSync: () => new UTEXOWallet({ engine: createFakeEngine() }),
  extensions: [],
  describe,
  it,
  expect,
});
