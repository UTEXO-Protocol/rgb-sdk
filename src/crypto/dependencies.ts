import { isNode } from '../utils/environment';
import type { BDKModule, BDKInit } from './types';

export type SignerDependencies = {
  Psbt: typeof import('bitcoinjs-lib').Psbt;
  bdk: BDKModule;
  init: BDKInit;
};

let signerDeps: SignerDependencies | null = null;
let signerPromise: Promise<SignerDependencies> | null = null;

async function loadSignerDependencies(): Promise<SignerDependencies> {
  if (isNode()) {
    const bdkNode = await import('@bitcoindevkit/bdk-wallet-node');
    const init =
      ((bdkNode as { default?: unknown }).default as BDKInit) ||
      ((bdkNode as { init?: unknown }).init as BDKInit) ||
      (bdkNode as unknown as BDKInit);
    const bdk = bdkNode as unknown as BDKModule;

    const nodeModule = 'node:' + 'module';
    const { createRequire } = await import(nodeModule);
    // @ts-ignore
    const requireFromModule = createRequire(import.meta.url);
    const bitcoinjs = requireFromModule('bitcoinjs-lib') as { Psbt: typeof import('bitcoinjs-lib').Psbt };

    return { Psbt: bitcoinjs.Psbt, bdk, init };
  }

  const bdkWeb = await import('@bitcoindevkit/bdk-wallet-web');
  const init =
    ((bdkWeb as { default?: unknown }).default as BDKInit) ||
    ((bdkWeb as { init?: unknown }).init as BDKInit) ||
    (bdkWeb as unknown as BDKInit);
  const bdk = bdkWeb as unknown as BDKModule;

  const bitcoinModule = (await import('bitcoinjs-lib')) as { Psbt: typeof import('bitcoinjs-lib').Psbt };

  return { Psbt: bitcoinModule.Psbt, bdk, init };
}

export async function ensureSignerDependencies(): Promise<SignerDependencies> {
  if (signerDeps) return signerDeps;
  if (!signerPromise) {
    signerPromise = loadSignerDependencies()
      .then((deps) => { signerDeps = deps; signerPromise = null; return deps; })
      .catch((error) => { signerPromise = null; throw error; });
  }
  return signerPromise;
}
