// RGB PSBT Signer Library using bdk-wasm
// Signs both create_utxo_begin and send_begin PSBTs from rgb-lib
//
// This module provides RGB-specific PSBT signing functionality for:
// - create_utxo_begin PSBTs: Creating UTXOs for RGB wallet operations
// - send_begin PSBTs: Signing RGB asset transfer transactions
//
// Usage:
//   import { signPsbt, signPsbtSync } from './signer';
//   const signedPsbt = signPsbt(mnemonic, psbtBase64, 'testnet');

import type { BIP32Interface } from 'bip32';
import type {
  Psbt as BitcoinJsPsbt,
  Network as BitcoinJsNetwork,
} from 'bitcoinjs-lib';
import { ValidationError, CryptoError } from '../errors';
import {
  validateMnemonic,
  validatePsbt,
  normalizeNetwork,
} from '../utils/validation';
import {
  DERIVATION_PURPOSE,
  DERIVATION_ACCOUNT,
  KEYCHAIN_RGB,
  KEYCHAIN_BTC,
  COIN_RGB_TESTNET,
  COIN_RGB_MAINNET,
  COIN_BITCOIN_MAINNET,
  COIN_BITCOIN_TESTNET,
} from '../constants';
import type {
  Network,
  PsbtType,
  NetworkVersions,
  Descriptors,
} from './types';

// Global augmentation for cached Node.js crypto module
declare global {
  // eslint-disable-next-line no-var
  var __nodeCrypto: typeof import('node:crypto') | undefined;
}
import { calculateMasterFingerprint } from '../utils/fingerprint';
import {
  getNetworkVersions as getBIP32NetworkVersions,
  normalizeSeedBuffer,
} from '../utils/bip32-helpers';
import { accountDerivationPath, normalizeSeedInput } from './keys';
import { sha256 } from '../utils/crypto-browser';
import {
  ensureBaseDependencies,
  ensureSignerDependencies,
  type SignerDependencies,
} from './dependencies';

// Re-export types from types module
export type { Network, PsbtType, NetworkVersions, Descriptors } from './types';

export interface SignPsbtOptions {
  preprocess?: boolean;
}

type DerivationPath = string | number[];

/**
 * Normalize derivation path string
 */
function normalizePath(path: DerivationPath): DerivationPath {
  if (typeof path === 'string') {
    // Remove duplicate m/ prefixes
    if (path.startsWith('m/m/')) {
      return path.replace(/^m\/m\//, 'm/');
    }
    return path;
  } else if (Array.isArray(path)) {
    // Remove leading 0 if it represents duplicate m/ prefix
    if (path.length > 0 && path[0] === 0 && path.length > 1) {
      const second = path[1];
      if (typeof second === 'number' && second >= 0x80000000) {
        return path.slice(1);
      }
    }
    return path;
  }
  return path;
}

/**
 * Convert derivation path to string format
 */
function pathToString(path: DerivationPath): string {
  if (typeof path === 'string') {
    return path;
  } else if (Array.isArray(path)) {
    return path
      .map((p) => {
        if (typeof p === 'number') {
          return p >= 0x80000000 ? `${p & 0x7fffffff}'` : `${p}`;
        }
        return String(p);
      })
      .join('/');
  }
  return '';
}

/**
 * Preprocessing for send_begin PSBTs: Update RGB PSBT metadata to BDK can match inputs.
 */
function preprocessPsbtForBDK(
  psbtBase64: string,
  rootNode: BIP32Interface,
  fp: string,
  network: Network,
  deps: SignerDependencies
): string {
  const { Psbt, networks, payments, toXOnly } = deps;
  if (!Psbt || !networks || !payments || !toXOnly) {
    throw new CryptoError('BitcoinJS modules not loaded');
  }
  const psbt = Psbt.fromBase64(psbtBase64.trim()) as BitcoinJsPsbt;
  const bjsNet: BitcoinJsNetwork =
    network === 'mainnet' ? networks.bitcoin : networks.testnet;

  for (let i = 0; i < psbt.inputCount; i++) {
    const input = psbt.data.inputs[i];

    if (input.tapBip32Derivation && input.tapBip32Derivation.length > 0) {
      input.tapBip32Derivation.forEach((deriv) => {
        const normalizedPath = normalizePath(deriv.path as DerivationPath);
        deriv.path = pathToString(normalizedPath);
        let pathStr = pathToString(normalizedPath);

        if (!pathStr.startsWith('m/')) {
          pathStr = 'm/' + pathStr;
        }

        try {
          const derivedNode = rootNode.derivePath(pathStr);
          const pubkey = derivedNode.publicKey;
          if (!pubkey) {
            return;
          }
          const pubkeyBuffer =
            pubkey instanceof Buffer ? pubkey : Buffer.from(pubkey);
          const xOnly = toXOnly(pubkeyBuffer);
          const p2tr = payments.p2tr({
            internalPubkey: xOnly,
            network: bjsNet,
          });
          const expectedScript = p2tr.output;

          if (!expectedScript) {
            return;
          }

          // Update witness_utxo.script if it doesn't match
          if (input.witnessUtxo && expectedScript) {
            const currentScript = input.witnessUtxo.script;
            if (!currentScript.equals(expectedScript)) {
              input.witnessUtxo.script = expectedScript;
            }
          }

          // Update tapInternalKey to match derivation
          if (xOnly) {
            if (!input.tapInternalKey || !input.tapInternalKey.equals(xOnly)) {
              input.tapInternalKey = xOnly;
            }
          }

          // Update master fingerprint
          const fingerprintBuf = Buffer.from(fp, 'hex');
          if (!deriv.masterFingerprint) {
            deriv.masterFingerprint = fingerprintBuf;
          } else {
            const currentFp = Buffer.from(deriv.masterFingerprint);
            if (!currentFp.equals(fingerprintBuf)) {
              deriv.masterFingerprint = fingerprintBuf;
            }
          }

          // Update pubkey in derivation
          if (!deriv.pubkey || !deriv.pubkey.equals(xOnly)) {
            deriv.pubkey = xOnly;
          }
        } catch (_e) {
          // Skip this derivation if it can't be derived from path
        }
      });
    }

    // Update legacy bip32Derivation if needed
    if (input.bip32Derivation && input.bip32Derivation.length > 0) {
      input.bip32Derivation.forEach((deriv) => {
        const normalizedPath = normalizePath(deriv.path as DerivationPath);
        deriv.path = pathToString(normalizedPath);
      });
    }
  }

  return psbt.toBase64();
}

/**
 * Detect PSBT type by examining derivation paths
 * @returns {'create_utxo'|'send'} PSBT type
 */
function detectPsbtType(
  psbtBase64: string,
  deps: SignerDependencies
): PsbtType {
  const { Psbt } = deps;
  if (!Psbt) {
    throw new CryptoError('BitcoinJS Psbt module not loaded');
  }
  try {
    const psbt = Psbt.fromBase64(psbtBase64.trim()) as BitcoinJsPsbt;
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (input.tapBip32Derivation && input.tapBip32Derivation.length > 0) {
        for (const deriv of input.tapBip32Derivation) {
          const pathStr = pathToString(deriv.path as DerivationPath);
          // Check if path contains RGB coin type - indicates send_begin PSBT
          if (pathStr.includes("827167'") || pathStr.includes("827166'")) {
            return 'send';
          }
        }
      }
    }
    return 'create_utxo';
  } catch (_e) {
    return 'create_utxo'; // Default to simpler structure
  }
}

/**
 * Derive descriptors based on PSBT type
 */
function deriveDescriptors(
  rootNode: BIP32Interface,
  fp: string,
  network: Network,
  psbtType: PsbtType
): Descriptors {
  const isMainnet = network === 'mainnet';
  const coinTypeBtc = isMainnet ? COIN_BITCOIN_MAINNET : COIN_BITCOIN_TESTNET;
  const coinTypeRgb = isMainnet ? COIN_RGB_MAINNET : COIN_RGB_TESTNET;

  if (psbtType === 'create_utxo') {
    // For create_utxo_begin: Use account-level xprv structure
    const accountPath = `m/${DERIVATION_PURPOSE}'/${coinTypeBtc}'/${DERIVATION_ACCOUNT}'`;
    const accountNode = rootNode.derivePath(accountPath);
    const accountXprv = accountNode.toBase58();
    const origin = `[${fp}/${DERIVATION_PURPOSE}'/${coinTypeBtc}'/${DERIVATION_ACCOUNT}']`;
    return {
      external: `tr(${origin}${accountXprv}/0/*)`,
      internal: `tr(${origin}${accountXprv}/1/*)`,
    };
  } else {
    // For send_begin: Use RGB descriptor structure
    const rgbAccountPath = `m/${DERIVATION_PURPOSE}'/${coinTypeRgb}'/${DERIVATION_ACCOUNT}'`;
    const rgbAccountNode = rootNode.derivePath(rgbAccountPath);
    const rgbKeychainNode = rgbAccountNode.derive(KEYCHAIN_RGB);
    const rgbKeychainXprv = rgbKeychainNode.toBase58();
    const rgbOrigin = `[${fp}/${DERIVATION_PURPOSE}'/${coinTypeRgb}'/${DERIVATION_ACCOUNT}'/${KEYCHAIN_RGB}]`;

    const btcAccountPath = `m/${DERIVATION_PURPOSE}'/${coinTypeBtc}'/${DERIVATION_ACCOUNT}'`;
    const btcAccountNode = rootNode.derivePath(btcAccountPath);
    const btcKeychainNode = btcAccountNode.derive(KEYCHAIN_BTC);
    const btcKeychainXprv = btcKeychainNode.toBase58();
    const btcOrigin = `[${fp}/${DERIVATION_PURPOSE}'/${coinTypeBtc}'/${DERIVATION_ACCOUNT}'/${KEYCHAIN_BTC}]`;

    return {
      external: `tr(${rgbOrigin}${rgbKeychainXprv}/*)`,
      internal: `tr(${btcOrigin}${btcKeychainXprv}/*)`,
    };
  }
}

/**
 * Get network versions for BIP32
 * Alias for shared network versions utility
 */
function getNetworkVersions(network: Network): NetworkVersions {
  return getBIP32NetworkVersions(network);
}

/**
 * Calculate master fingerprint from root node
 * Alias for shared fingerprint calculation utility
 */
async function getMasterFingerprint(rootNode: BIP32Interface): Promise<string> {
  return calculateMasterFingerprint(rootNode);
}

/**
 * Compute BIP340 tagged hash for TapTweak: SHA256(SHA256("TapTweak") || SHA256("TapTweak") || msg)
 * Uses synchronous Node.js crypto (available in Node.js & bare runtime)
 */
function tapTweakHash(pubkey: Buffer): Buffer {
  // Use dynamic import workaround for Node.js crypto to avoid ESM issues
  const nodeCrypto = globalThis.__nodeCrypto as typeof import('node:crypto') | undefined;
  if (!nodeCrypto) {
    throw new CryptoError('Node.js crypto not initialized for tapTweakHash');
  }
  const tagBuf = Buffer.from('TapTweak', 'utf8');
  const tagHash = nodeCrypto.createHash('sha256').update(tagBuf).digest();
  return nodeCrypto.createHash('sha256')
    .update(Buffer.concat([tagHash, tagHash, pubkey]))
    .digest();
}

/**
 * Tweak a private key for BIP341 Taproot key-path spending.
 * If the corresponding public key has odd Y, negate first.
 * Then add tweak = tagged_hash("TapTweak", xOnlyPubkey).
 */
function tweakPrivateKey(
  ecc: any,  // ECCModule
  privKey: Buffer,
  xOnlyPubkey: Buffer
): Buffer {
  const fullPub = ecc.pointFromScalar(privKey) as Uint8Array | null;
  if (!fullPub) throw new CryptoError('Invalid private key for taproot tweaking');

  let effectivePriv: Buffer = privKey;
  // Negate if Y is odd (0x03 prefix on compressed pubkey)
  if (fullPub.length === 33 && fullPub[0] === 0x03) {
    if (typeof ecc.privateNegate === 'function') {
      effectivePriv = Buffer.from(ecc.privateNegate(privKey));
    }
  }

  const tweak = tapTweakHash(xOnlyPubkey);
  const tweaked = ecc.privateAdd(effectivePriv, tweak);
  if (!tweaked) throw new CryptoError('Tweaked private key is invalid (zero)');
  return Buffer.from(tweaked);
}

async function signPsbtFromSeedInternal(
  seed: Buffer | Uint8Array,
  psbtBase64: string,
  network: Network,
  options: SignPsbtOptions = {},
  deps: SignerDependencies
): Promise<string> {
  validatePsbt(psbtBase64, 'psbtBase64');
  const { ecc, factory, Psbt, networks, toXOnly } = deps;
  const bip32 = factory(ecc);
  const seedBuffer = normalizeSeedBuffer(seed);
  const versions = getNetworkVersions(network);

  let rootNode: BIP32Interface;
  try {
    rootNode = bip32.fromSeed(seedBuffer, versions);
  } catch (error) {
    throw new CryptoError(
      'Failed to derive root node from seed',
      error as Error
    );
  }

  // Ensure Node.js crypto is available for tapTweakHash
  if (!globalThis.__nodeCrypto) {
    try {
      const nodeCryptoPath = 'node:' + 'crypto';
      globalThis.__nodeCrypto = await import(nodeCryptoPath);
    } catch {
      // Will fail later in tapTweakHash if needed
    }
  }

  const fp = await getMasterFingerprint(rootNode);
  const psbtType = detectPsbtType(psbtBase64, deps);
  const needsPreprocessing = psbtType === 'send';

  let processedPsbt = psbtBase64.trim();
  if (needsPreprocessing || options.preprocess) {
    try {
      processedPsbt = preprocessPsbtForBDK(
        psbtBase64,
        rootNode,
        fp,
        network,
        deps
      );
    } catch (error) {
      throw new CryptoError('Failed to preprocess PSBT', error as Error);
    }
  }

  if (!Psbt || !networks) {
    throw new CryptoError('BitcoinJS modules not loaded');
  }

  const bjsNet =
    network === 'mainnet' ? networks.bitcoin : networks.testnet;

  let psbt: BitcoinJsPsbt;
  try {
    psbt = Psbt.fromBase64(processedPsbt, { network: bjsNet }) as BitcoinJsPsbt;
  } catch (error) {
    throw new CryptoError('Failed to parse PSBT', error as Error);
  }

  // Sign each Taproot input using derivation paths
  const fingerprintBuf = Buffer.from(fp, 'hex');
  const auxRand = Buffer.alloc(32, 0); // deterministic nonce (matches libsecp256k1/BDK)
  let signed = false;

  try {
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];

      if (input.tapBip32Derivation && input.tapBip32Derivation.length > 0) {
        for (const deriv of input.tapBip32Derivation) {
          const derivFp = Buffer.from(deriv.masterFingerprint);
          if (!derivFp.equals(fingerprintBuf)) continue;

          let pathStr = pathToString(normalizePath(deriv.path as DerivationPath));
          if (!pathStr.startsWith('m/')) pathStr = 'm/' + pathStr;

          try {
            const derivedNode = rootNode.derivePath(pathStr);
            const privKey = derivedNode.privateKey;
            if (!privKey) continue;

            const privKeyBuf =
              privKey instanceof Buffer ? privKey : Buffer.from(privKey);
            const pubkeyBuf =
              derivedNode.publicKey instanceof Buffer
                ? derivedNode.publicKey
                : Buffer.from(derivedNode.publicKey);
            const xOnlyPubkey = toXOnly(pubkeyBuf);

            // Tweak private key for BIP341 key-path spend
            const tweakedPrivKey = tweakPrivateKey(ecc, privKeyBuf, xOnlyPubkey);

            // Get tweaked x-only public key (output key)
            const tweakedPub = (ecc as any).pointFromScalar(tweakedPrivKey) as Uint8Array;
            const tweakedXOnly = tweakedPub.length === 33
              ? Buffer.from(tweakedPub.slice(1))
              : Buffer.from(tweakedPub);

            // Create Schnorr signer with the tweaked (output) key
            const signer = {
              publicKey: tweakedXOnly,
              signSchnorr: (hash: Buffer): Buffer => {
                return Buffer.from(
                  (ecc as any).signSchnorr(hash, tweakedPrivKey, auxRand)
                );
              },
            };

            psbt.signTaprootInput(i, signer as any);
            signed = true;
          } catch (_e) {
            // Input may already be signed or path doesn't match — skip
          }
          break; // Only need one successful signing per input
        }
      }
    }

    if (!signed) {
      // If no inputs could be signed, the PSBT may already be finalized.
      // Check if any input has finalScriptWitness — if so, return as-is.
      const alreadyFinalized = Array.from({ length: psbt.inputCount }, (_, i) =>
        psbt.data.inputs[i]
      ).some((inp: any) => inp.finalScriptWitness);

      if (alreadyFinalized) {
        return psbt.toBase64().trim();
      }
      throw new Error('No inputs were signed — derivation paths did not match');
    }

    // Finalize all inputs (creates finalScriptWitness)
    psbt.finalizeAllInputs();

    // Post-signing cleanup (matching BDK behavior):
    // 1. Strip tapBip32Derivation from all outputs
    // 2. Update OPRET proprietary key values in OP_RETURN outputs
    for (let oi = 0; oi < psbt.data.outputs.length; oi++) {
      const output = psbt.data.outputs[oi];

      if (output.tapBip32Derivation) {
        delete output.tapBip32Derivation;
      }

      // Fix OPRET proprietary key: set value to OP_RETURN data from tx output
      if (output.unknownKeyVals) {
        const txOutput = psbt.txOutputs[oi];
        const script = txOutput?.script;
        // OP_RETURN: 0x6a <push_byte> <data>
        if (script && script[0] === 0x6a && script.length >= 34) {
          const opReturnData = script.subarray(2, 34);
          for (const kv of output.unknownKeyVals) {
            const keyHex = Buffer.from(kv.key).toString('hex');
            // OPRET proprietary key prefix: fc054f505245 (OPRET)
            if (keyHex.startsWith('fc054f505245')) {
              kv.value = opReturnData;
            }
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof CryptoError) throw error;
    throw new CryptoError('Failed to sign PSBT', error as Error);
  }

  return psbt.toBase64().trim();
}

/**
 * Sign a PSBT using BDK
 *
 * Note: This function is async due to dependency loading and crypto operations.
 *
 * @param mnemonic - BIP39 mnemonic phrase (12 or 24 words)
 * @param psbtBase64 - Base64 encoded PSBT string
 * @param network - Bitcoin network ('mainnet' | 'testnet' | 'signet' | 'regtest')
 * @param options - Optional signing options
 * @param options.signOptions - BDK sign options (defaults used if not provided)
 * @param options.preprocess - Force preprocessing (auto-detected by default)
 * @returns Base64 encoded signed PSBT
 * @throws {ValidationError} If mnemonic or PSBT format is invalid
 * @throws {CryptoError} If signing fails
 *
 * @example
 * ```typescript
 * const signedPsbt = signPsbt(
 *   'abandon abandon abandon...',
 *   'cHNidP8BAIkBAAAAA...',
 *   'testnet'
 * );
 * ```
 */
export async function signPsbt(
  mnemonic: string,
  psbtBase64: string,
  network: Network = 'testnet',
  options: SignPsbtOptions = {}
): Promise<string> {
  try {
    // Validate inputs
    validateMnemonic(mnemonic, 'mnemonic');
    const { bip39 } = await ensureBaseDependencies();
    if (!bip39 || typeof bip39.mnemonicToSeedSync !== 'function') {
      throw new CryptoError('bip39 module not loaded correctly');
    }

    let seed: Buffer;
    try {
      seed = bip39.mnemonicToSeedSync(mnemonic);
    } catch (_error) {
      throw new ValidationError('Invalid mnemonic format', 'mnemonic');
    }

    const normalizedNetwork = normalizeNetwork(network);
    const deps = await ensureSignerDependencies();
    return await signPsbtFromSeedInternal(
      seed,
      psbtBase64,
      normalizedNetwork,
      options,
      deps
    );
  } catch (error) {
    if (error instanceof ValidationError || error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError(
      'Unexpected error during PSBT signing',
      error as Error
    );
  }
}

/**
 * Legacy sync-named wrapper (still async under the hood).
 */
export async function signPsbtSync(
  mnemonic: string,
  psbtBase64: string,
  network: Network = 'testnet',
  options: SignPsbtOptions = {}
): Promise<string> {
  return signPsbt(mnemonic, psbtBase64, network, options);
}

/**
 * Sign a PSBT using a raw BIP39 seed (hex string or Uint8Array)
 */
export async function signPsbtFromSeed(
  seed: string | Uint8Array,
  psbtBase64: string,
  network: Network = 'testnet',
  options: SignPsbtOptions = {}
): Promise<string> {
  const normalizedSeed = normalizeSeedInput(seed);
  const normalizedNetwork = normalizeNetwork(network);
  const deps = await ensureSignerDependencies();
  return signPsbtFromSeedInternal(
    normalizedSeed,
    psbtBase64,
    normalizedNetwork,
    options,
    deps
  );
}

function ensureMessageInput(message: string | Uint8Array): Uint8Array {
  if (typeof message === 'string') {
    if (!message.length) {
      throw new ValidationError('message must not be empty', 'message');
    }
    return Buffer.from(message, 'utf8');
  }
  if (message instanceof Uint8Array) {
    if (!message.length) {
      throw new ValidationError('message must not be empty', 'message');
    }
    return Buffer.from(message);
  }
  throw new ValidationError(
    'message must be a string or Uint8Array',
    'message'
  );
}

async function deriveRootFromSeedInput(
  seed: string | Uint8Array,
  network: Network
): Promise<BIP32Interface> {
  const { ecc, factory } = await ensureBaseDependencies();
  const normalizedSeed = normalizeSeedInput(seed, 'seed');
  const versions = getNetworkVersions(network);
  const bip32 = factory(ecc);
  try {
    return bip32.fromSeed(normalizedSeed, versions);
  } catch (error) {
    throw new CryptoError(
      'Failed to create BIP32 root node from seed',
      error as Error
    );
  }
}

const DEFAULT_RELATIVE_PATH = '0/0';

export interface SignMessageParams {
  message: string | Uint8Array;
  seed: string | Uint8Array;
  network?: Network;
}

export interface SignMessageResult {
  signature: string;
  accountXpub: string;
}

export interface VerifyMessageParams {
  message: string | Uint8Array;
  signature: string;
  accountXpub: string;
  network?: Network;
}

export interface EstimateFeeResult {
  fee: number;
  vbytes: number;
  feeRate: number;
}
export async function signMessage(params: SignMessageParams): Promise<string> {
  const { message, seed } = params;
  if (!seed) {
    throw new ValidationError('seed is required', 'seed');
  }
  const normalizedNetwork = normalizeNetwork(params.network ?? 'regtest');
  const relativePath = DEFAULT_RELATIVE_PATH;
  const accountPath = accountDerivationPath(normalizedNetwork, false);

  const messageBytes = ensureMessageInput(message);
  const { ecc } = await ensureBaseDependencies();
  const root = await deriveRootFromSeedInput(seed, normalizedNetwork);
  const accountNode = root.derivePath(accountPath);
  const child = accountNode.derivePath(relativePath);
  const privateKey = child.privateKey;

  if (!privateKey) {
    throw new CryptoError('Derived node does not contain a private key');
  }
  if (!ecc || typeof ecc.signSchnorr !== 'function') {
    throw new CryptoError('Schnorr signing not supported by ECC module');
  }

  const messageHash = await sha256(messageBytes);
  const signature = Buffer.from(
    ecc.signSchnorr(messageHash, privateKey)
  ).toString('base64');
  // const accountXpub = accountNode.neutered().toBase58();
  return signature;
}

export async function verifyMessage(
  params: VerifyMessageParams
): Promise<boolean> {
  const { message, signature, accountXpub } = params;
  const messageBytes = ensureMessageInput(message);
  const relativePath = DEFAULT_RELATIVE_PATH;
  // const signatureBytes = decodeSignatureBase64(signature);
  const signatureBytes = Buffer.from(signature, 'base64');

  const normalizedNetwork = normalizeNetwork(params.network ?? 'regtest');
  const versions = getNetworkVersions(normalizedNetwork);
  const { ecc, factory } = await ensureBaseDependencies();

  if (
    !ecc ||
    typeof ecc.verifySchnorr !== 'function' ||
    typeof ecc.xOnlyPointFromPoint !== 'function'
  ) {
    throw new CryptoError('Schnorr verification not supported by ECC module');
  }

  let accountNode: BIP32Interface;
  try {
    accountNode = factory(ecc).fromBase58(accountXpub, versions);
  } catch (_error) {
    throw new ValidationError('Invalid account xpub provided', 'accountXpub');
  }

  const child = accountNode.derivePath(relativePath);
  const pubkeyBuffer =
    child.publicKey instanceof Buffer
      ? child.publicKey
      : Buffer.from(child.publicKey);
  const xOnlyPubkey = ecc.xOnlyPointFromPoint(pubkeyBuffer);

  const messageHash = await sha256(messageBytes);

  try {
    return ecc.verifySchnorr(messageHash, xOnlyPubkey, signatureBytes);
  } catch {
    return false;
  }
}

export async function estimatePsbt(
  psbtBase64: string
): Promise<EstimateFeeResult> {
  if (!psbtBase64) {
    throw new ValidationError('psbt is required', 'psbt');
  }

  const { Psbt } = await ensureSignerDependencies();
  if (!Psbt) {
    throw new CryptoError('BitcoinJS Psbt module not loaded');
  }

  let psbt: BitcoinJsPsbt;
  try {
    psbt = Psbt.fromBase64(psbtBase64.trim()) as BitcoinJsPsbt;
    return {
      fee: psbt.getFee(),
      feeRate: psbt.getFeeRate(),
      vbytes: psbt.extractTransaction().virtualSize(),
    };
  } catch (error) {
    console.log('error', error);
    throw new ValidationError('Invalid PSBT provided', 'psbt');
  }
}
