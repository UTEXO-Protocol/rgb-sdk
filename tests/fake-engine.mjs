// Fake engines for facade tests. No native code, no network.
import { SHARED_WALLET_METHODS } from '@utexo/rgb-sdk-core/conformance';

export const SYNC_METHODS = new Set(['isDisposed', 'getNetwork']);

/**
 * An engine whose every shared method records its call and returns a unique
 * value. `extra` adds or overrides members.
 */
export function createFakeEngine(extra = {}) {
  const calls = [];
  const engine = {
    protocol: 'RGB_L1',
    contractVersion: '1',
    capabilities: {
      canSignTransactions: true,
      psbtSigning: false,
      beginEndFlows: false,
    },
    psbt: undefined,
    beginEnd: undefined,
    calls,
  };
  for (const name of SHARED_WALLET_METHODS) {
    engine[name] = function (...args) {
      calls.push({ name, args, self: this });
      const value = { from: name };
      return SYNC_METHODS.has(name) ? value : Promise.resolve(value);
    };
  }
  return Object.assign(engine, extra);
}
