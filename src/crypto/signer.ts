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
import type { Psbt as BitcoinJsPsbt, Network as BitcoinJsNetwork } from 'bitcoinjs-lib';
import { ValidationError, CryptoError } from '../errors';
import { validateMnemonic, validatePsbt, normalizeNetwork } from '../utils/validation';
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
  BDKWallet,
  BDKPsbt,
  BDKNetwork,
  BDKSignOptions
} from './types';
import { calculateMasterFingerprint } from '../utils/fingerprint';
import { getNetworkVersions as getBIP32NetworkVersions, normalizeSeedBuffer } from '../utils/bip32-helpers';
import { accountDerivationPath, normalizeSeedInput } from './keys';
import { sha256 } from '../utils/crypto-browser';
import { ensureBaseDependencies, ensureSignerDependencies, type SignerDependencies } from './dependencies';

// Re-export types from types module
export type { Network, PsbtType, NetworkVersions, Descriptors } from './types';

export interface SignPsbtOptions {
  signOptions?: BDKSignOptions;
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
    return path.map(p => {
      if (typeof p === 'number') {
        return p >= 0x80000000 ? `${(p & 0x7fffffff)}'` : `${p}`;
      }
      return String(p);
    }).join('/');
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
  const bjsNet: BitcoinJsNetwork = network === 'mainnet' ? networks.bitcoin : networks.testnet;
  
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
          const pubkeyBuffer = pubkey instanceof Buffer ? pubkey : Buffer.from(pubkey);
          const xOnly = toXOnly(pubkeyBuffer);
          const p2tr = payments.p2tr({ internalPubkey: xOnly, network: bjsNet });
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
        } catch (e) {
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
function detectPsbtType(psbtBase64: string, deps: SignerDependencies): PsbtType {
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
  } catch (e) {
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
      internal: `tr(${origin}${accountXprv}/1/*)`
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
      internal: `tr(${btcOrigin}${btcKeychainXprv}/*)`
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

async function signPsbtFromSeedInternal(
  seed: Buffer | Uint8Array,
  psbtBase64: string,
  network: Network,
  options: SignPsbtOptions = {},
  deps: SignerDependencies
): Promise<string> {
  validatePsbt(psbtBase64, 'psbtBase64');
  const { ecc, factory, bdk } = deps;
  const bip32 = factory(ecc);
  const seedBuffer = normalizeSeedBuffer(seed);
  const versions = getNetworkVersions(network);

  let rootNode: BIP32Interface;
  try {
    rootNode = bip32.fromSeed(seedBuffer, versions);
  } catch (error) {
    throw new CryptoError('Failed to derive root node from seed', error as Error);
  }

  const fp = await getMasterFingerprint(rootNode);
  const psbtType = detectPsbtType(psbtBase64, deps);
  const needsPreprocessing = psbtType === 'send';
  const { external, internal } = deriveDescriptors(rootNode, fp, network, psbtType);

  let wallet: BDKWallet;
  try {
    wallet = bdk.Wallet.create(network as BDKNetwork, external, internal);
  } catch (error) {
    throw new CryptoError('Failed to create BDK wallet', error as Error);
  }

  let processedPsbt = psbtBase64.trim();
  if (needsPreprocessing || options.preprocess) {
    try {
      processedPsbt = preprocessPsbtForBDK(psbtBase64, rootNode, fp, network, deps);
    } catch (error) {
      throw new CryptoError('Failed to preprocess PSBT', error as Error);
    }
  }

  let pstb: BDKPsbt;
  try {
    pstb = bdk.Psbt.from_string(processedPsbt);
  } catch (error) {
    throw new CryptoError('Failed to parse PSBT', error as Error);
  }

  const signOptions = options.signOptions || new bdk.SignOptions();
  try {
    wallet.sign(pstb, signOptions);
  } catch (error) {
    throw new CryptoError('Failed to sign PSBT', error as Error);
  }

  return pstb.toString().trim();
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
    } catch (error) {
      throw new ValidationError('Invalid mnemonic format', 'mnemonic');
    }

    const normalizedNetwork = normalizeNetwork(network);
    const deps = await ensureSignerDependencies();
    return await signPsbtFromSeedInternal(seed, psbtBase64, normalizedNetwork, options, deps);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError('Unexpected error during PSBT signing', error as Error);
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
  return signPsbtFromSeedInternal(normalizedSeed, psbtBase64, normalizedNetwork, options, deps);
}

function ensureDerivationPath(path: string): string {
  if (!path || typeof path !== 'string') {
    throw new ValidationError('derivationPath must be a non-empty string', 'derivationPath');
  }
  if (!path.startsWith('m/')) {
    throw new ValidationError('derivationPath must start with "m/"', 'derivationPath');
  }
  return path;
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
  throw new ValidationError('message must be a string or Uint8Array', 'message');
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
    throw new CryptoError('Failed to create BIP32 root node from seed', error as Error);
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
  const signature = Buffer.from(ecc.signSchnorr(messageHash, privateKey)).toString('base64');
  // const accountXpub = accountNode.neutered().toBase58();
  return signature;
}

export async function verifyMessage(params: VerifyMessageParams): Promise<boolean> {
  const { message, signature, accountXpub } = params;
  const messageBytes = ensureMessageInput(message);
  const relativePath = DEFAULT_RELATIVE_PATH;
  // const signatureBytes = decodeSignatureBase64(signature);
  const signatureBytes = Buffer.from(signature, 'base64');

  const normalizedNetwork = normalizeNetwork(params.network ?? 'regtest');
  const versions = getNetworkVersions(normalizedNetwork);
  const { ecc, factory } = await ensureBaseDependencies();

  if (!ecc || typeof ecc.verifySchnorr !== 'function' || typeof ecc.xOnlyPointFromPoint !== 'function') {
    throw new CryptoError('Schnorr verification not supported by ECC module');
  }

  let accountNode: BIP32Interface;
  try {
    accountNode = factory(ecc).fromBase58(accountXpub, versions);
  } catch (error) {
    throw new ValidationError('Invalid account xpub provided', 'accountXpub');
  }

  const child = accountNode.derivePath(relativePath);
  const pubkeyBuffer = child.publicKey instanceof Buffer ? child.publicKey : Buffer.from(child.publicKey);
  const xOnlyPubkey = ecc.xOnlyPointFromPoint(pubkeyBuffer);

  const messageHash = await sha256(messageBytes);

  try {
    return ecc.verifySchnorr(messageHash, xOnlyPubkey, signatureBytes);
  } catch {
    return false;
  }
}

export async function estimatePsbt(psbtBase64: string): Promise<EstimateFeeResult> {
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







