import { RgbLibWebError, WasmRejection } from './errors.js';

// Ported from `@utexo/rgb-lib-rn` (`rgb-lib/key-provider.ts`); the same key
// forms are accepted on both platforms.

type MaybePromise<T> = T | Promise<T>;

/** `null`, `undefined` or a blank string mean "unavailable". */
export type RgbLibWebMnemonicResult = string | null | undefined;
export type RgbLibWebMnemonicReader =
  () => MaybePromise<RgbLibWebMnemonicResult>;

export interface IRgbLibWebKeyProvider {
  getMnemonic(): MaybePromise<RgbLibWebMnemonicResult>;
}

/** Account-level public keys, as rgb-lib's `generateKeys()` returns them. */
export interface RgbLibWebPublicKeys {
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
}

/**
 * Wallet keys: a mnemonic string, a function or `{ getMnemonic }` that reads
 * it on `init()`, either of them with public keys that must match, or public
 * keys alone (watch-only: no signing).
 */
export type RgbLibWebKeys =
  | string
  | RgbLibWebMnemonicReader
  | IRgbLibWebKeyProvider
  | (Partial<RgbLibWebPublicKeys> & { mnemonic: string; getMnemonic?: never })
  | (Partial<RgbLibWebPublicKeys> & {
      getMnemonic(): MaybePromise<RgbLibWebMnemonicResult>;
      mnemonic?: never;
    })
  | (RgbLibWebPublicKeys & { mnemonic?: never; getMnemonic?: never });

export interface ResolvedKeys {
  readonly readMnemonic?: () => MaybePromise<unknown>;
  readonly publicKeys?: Readonly<RgbLibWebPublicKeys>;
}

const PUBLIC_KEY_FIELDS = [
  'accountXpubVanilla',
  'accountXpubColored',
  'masterFingerprint',
] as const;

function invalidKeys(message: string): never {
  throw new RgbLibWebError('INVALID_CONFIG', message);
}

const isBlank = (value: string) => value.trim().length === 0;

function resolvePublicKeys(
  keys: Record<string, unknown>,
  network: string
): RgbLibWebPublicKeys | undefined {
  const present = PUBLIC_KEY_FIELDS.filter((f) => keys[f] !== undefined);
  if (present.length === 0) return undefined;
  const missing = PUBLIC_KEY_FIELDS.filter((f) => keys[f] === undefined);
  if (missing.length > 0) {
    invalidKeys(
      `RGB_L1 public keys are incomplete; missing ${missing.join(', ')}`
    );
  }
  for (const field of PUBLIC_KEY_FIELDS) {
    const value = keys[field];
    if (typeof value !== 'string' || isBlank(value)) {
      invalidKeys(`RGB_L1 keys.${field} must be a non-empty string`);
    }
  }
  const fingerprint = (keys.masterFingerprint as string).toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(fingerprint)) {
    invalidKeys('RGB_L1 keys.masterFingerprint must be 8 hex characters');
  }
  // rgb-lib-wasm decodes the keys itself on init(); nothing is stored before.
  const prefix = network === 'mainnet' ? 'xpub' : 'tpub';
  for (const field of ['accountXpubVanilla', 'accountXpubColored'] as const) {
    if (!(keys[field] as string).startsWith(prefix)) {
      invalidKeys(
        `RGB_L1 keys.${field} must be a ${prefix} for network ${network}`
      );
    }
  }
  return {
    accountXpubVanilla: keys.accountXpubVanilla as string,
    accountXpubColored: keys.accountXpubColored as string,
    masterFingerprint: fingerprint,
  };
}

/** Validates the `keys` argument once, at construction. */
export function resolveKeys(keys: unknown, network: string): ResolvedKeys {
  if (typeof keys === 'string') {
    if (isBlank(keys)) invalidKeys('The RGB_L1 mnemonic must not be empty');
    return { readMnemonic: () => keys };
  }
  if (typeof keys === 'function') {
    return { readMnemonic: keys as () => unknown };
  }
  if (!keys || typeof keys !== 'object') {
    invalidKeys(
      'RGB_L1 keys must be a mnemonic, a function that returns it, or an object with getMnemonic or public keys'
    );
  }
  const object = keys as Record<string, unknown>;
  if (object.mnemonic !== undefined && object.getMnemonic !== undefined) {
    invalidKeys('Pass either keys.mnemonic or keys.getMnemonic, not both');
  }
  let readMnemonic: (() => unknown) | undefined;
  if (object.mnemonic !== undefined) {
    const mnemonic = object.mnemonic;
    if (typeof mnemonic !== 'string' || isBlank(mnemonic)) {
      invalidKeys('RGB_L1 keys.mnemonic must be a non-empty string');
    }
    readMnemonic = () => mnemonic;
  } else if (object.getMnemonic !== undefined) {
    if (typeof object.getMnemonic !== 'function') {
      invalidKeys('RGB_L1 keys.getMnemonic must be a function');
    }
    // Call through the object so service classes keep `this`.
    const provider = object as unknown as IRgbLibWebKeyProvider;
    readMnemonic = () => provider.getMnemonic();
  }
  const publicKeys = resolvePublicKeys(object, network);
  if (!readMnemonic && !publicKeys) {
    invalidKeys(
      'RGB_L1 keys need a mnemonic (mnemonic or getMnemonic), or accountXpubVanilla, accountXpubColored and masterFingerprint'
    );
  }
  return {
    ...(readMnemonic ? { readMnemonic } : {}),
    ...(publicKeys ? { publicKeys: Object.freeze(publicKeys) } : {}),
  };
}

/** Calls the mnemonic source; only this call is wrapped as KEYS_UNAVAILABLE. */
export async function readMnemonic(
  read: () => MaybePromise<unknown>,
  operation: string
): Promise<string> {
  let value: unknown;
  try {
    value = await read();
  } catch (error) {
    throw new RgbLibWebError(
      'KEYS_UNAVAILABLE',
      'Could not read the RGB_L1 mnemonic',
      operation,
      error === undefined || error instanceof Error
        ? error
        : new WasmRejection(error)
    );
  }
  if (value == null || (typeof value === 'string' && isBlank(value))) {
    throw new RgbLibWebError(
      'KEYS_UNAVAILABLE',
      'RGB_L1 keys returned no mnemonic',
      operation
    );
  }
  if (typeof value !== 'string') {
    invalidKeys('RGB_L1 keys must return the mnemonic as a string');
  }
  return value;
}
