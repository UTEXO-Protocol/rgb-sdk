import { isNode } from '../utils/environment';
import type {
  BIP39Module,
  ECCModule,
  BIP32Factory,
  BitcoinJsPayments,
  BitcoinJsNetworks,
  BIP341Module,
  BDKModule,
  BDKInit,
} from './types';

type BaseDependencies = {
  bip39: BIP39Module;
  ecc: ECCModule;
  factory: BIP32Factory;
};

export type SignerDependencies = BaseDependencies & {
  Psbt: typeof import('bitcoinjs-lib').Psbt;
  payments: BitcoinJsPayments;
  networks: BitcoinJsNetworks;
  toXOnly: (pubkey: Buffer) => Buffer;
  bdk: BDKModule;
  init: BDKInit;
};

let baseDeps: BaseDependencies | null = null;
let basePromise: Promise<BaseDependencies> | null = null;

async function loadBaseDependencies(): Promise<BaseDependencies> {
  if (isNode()) {
    const nodeModule = 'node:' + 'module';
    const { createRequire } = await import(nodeModule);
    // @ts-ignore - import.meta.url not available in CJS build context
    const requireFromModule = createRequire(import.meta.url);

    const bip39 = requireFromModule('bip39') as unknown as BIP39Module;
    const eccModule = requireFromModule('@bitcoinerlab/secp256k1') as unknown as { default?: unknown };
    const ecc =
      (eccModule && typeof eccModule === 'object' && 'default' in eccModule
        ? (eccModule.default as ECCModule)
        : (eccModule as unknown as ECCModule));
    const bip32 = requireFromModule('bip32') as unknown as { BIP32Factory: BIP32Factory };

    return {
      bip39,
      ecc,
      factory: bip32.BIP32Factory,
    };
  }

  const bip39Module = await import('bip39');
  const bip39 = (bip39Module.default as BIP39Module) || (bip39Module as unknown as BIP39Module);

  const eccModule = await import('@bitcoinerlab/secp256k1');
  const ecc =
    (eccModule.default as ECCModule) ||
    (eccModule as unknown as ECCModule);

  const bip32 = (await import('bip32')) as unknown as { BIP32Factory: BIP32Factory };

  return {
    bip39,
    ecc,
    factory: bip32.BIP32Factory,
  };
}

export async function ensureBaseDependencies(): Promise<BaseDependencies> {
  if (baseDeps) {
    return baseDeps;
  }
  if (!basePromise) {
    basePromise = loadBaseDependencies().then((deps) => {
      baseDeps = deps;
      basePromise = null;
      return deps;
    }).catch((error) => {
      basePromise = null;
      throw error;
    });
  }
  return basePromise;
}

let signerDeps: SignerDependencies | null = null;
let signerPromise: Promise<SignerDependencies> | null = null;

async function loadSignerDependencies(): Promise<SignerDependencies> {
  const base = await ensureBaseDependencies();

  if (isNode()) {
    const bdkNode = await import('@bitcoindevkit/bdk-wallet-node');
    const init =
      ((bdkNode as { default?: unknown }).default as BDKInit) ||
      ((bdkNode as { init?: unknown }).init as BDKInit) ||
      (bdkNode as unknown as BDKInit);
    const bdk = bdkNode as unknown as BDKModule;

    const nodeModule = 'node:' + 'module';
    const { createRequire } = await import(nodeModule);
    // @ts-ignore - import.meta.url not available in CJS build context
    const requireFromModule = createRequire(import.meta.url);

    const bitcoinjs = requireFromModule('bitcoinjs-lib') as unknown as {
      Psbt: typeof import('bitcoinjs-lib').Psbt;
      payments: BitcoinJsPayments;
      networks: BitcoinJsNetworks;
    };
    const Psbt = bitcoinjs.Psbt;
    const payments = bitcoinjs.payments;
    const networks = bitcoinjs.networks;

    const bip341 = requireFromModule('bitcoinjs-lib/src/payments/bip341.js') as unknown as BIP341Module;
    const toXOnly =
      bip341.toXOnly || ((pubkey: Buffer) => Buffer.from(pubkey.slice(1)));

    return {
      ...base,
      Psbt,
      payments,
      networks,
      toXOnly,
      bdk,
      init,
    };
  }

  const bdkWeb = await import('@bitcoindevkit/bdk-wallet-web');
  const init =
    ((bdkWeb as { default?: unknown }).default as BDKInit) ||
    ((bdkWeb as { init?: unknown }).init as BDKInit) ||
    (bdkWeb as unknown as BDKInit);
  const bdk = bdkWeb as unknown as BDKModule;

  const bitcoinModule = (await import('bitcoinjs-lib')) as unknown as {
    Psbt: typeof import('bitcoinjs-lib').Psbt;
    payments: BitcoinJsPayments;
    networks: BitcoinJsNetworks;
  };
  const Psbt = bitcoinModule.Psbt;
  const payments = bitcoinModule.payments;
  const networks = bitcoinModule.networks;

  const bip341 = (await import('bitcoinjs-lib/src/payments/bip341.js')) as unknown as BIP341Module;
  const toXOnly =
    bip341.toXOnly || ((pubkey: Buffer) => Buffer.from(pubkey.slice(1)));

  return {
    ...base,
    Psbt,
    payments,
    networks,
    toXOnly,
    bdk,
    init,
  };
}

export async function ensureSignerDependencies(): Promise<SignerDependencies> {
  if (signerDeps) {
    return signerDeps;
  }
  if (!signerPromise) {
    signerPromise = loadSignerDependencies().then((deps) => {
      signerDeps = deps;
      signerPromise = null;
      return deps;
    }).catch((error) => {
      signerPromise = null;
      throw error;
    });
  }
  return signerPromise;
}

