// RGB PSBT Signer — BDK-based signing for rgb-lib PSBTs.
// Handles both create_utxo_begin and send_begin PSBT types.

import { Psbt } from 'bitcoinjs-lib';
import * as bdkNode from '@bitcoindevkit/bdk-wallet-node';
import {
  ValidationError,
  CryptoError,
  validateMnemonic,
  validatePsbt,
  normalizeNetwork,
  calculateMasterFingerprint,
  getNetworkVersions,
  normalizeSeedBuffer,
  normalizeSeedInput,
  bip39,
  bip32Factory,
  detectPsbtType,
  deriveDescriptors,
} from '@utexo/rgb-sdk-core';
import type { Network, PsbtType, BIP32Interface } from '@utexo/rgb-sdk-core';
import type { BDKWallet, BDKPsbt, BDKNetwork, BDKSignOptions } from './types';
import type { EstimateFeeResult } from '@utexo/rgb-sdk-core';

export type {
  Network,
  PsbtType,
  NetworkVersions,
  Descriptors,
} from '@utexo/rgb-sdk-core';

const bdk = bdkNode as unknown as import('./types').BDKModule;

export interface SignPsbtOptions {
  signOptions?: BDKSignOptions;
}

async function signPsbtFromSeedInternal(
  seed: Buffer | Uint8Array,
  psbtBase64: string,
  network: Network,
  options: SignPsbtOptions
): Promise<string> {
  validatePsbt(psbtBase64, 'psbtBase64');

  let rootNode: BIP32Interface;
  try {
    rootNode = bip32Factory().fromSeed(
      normalizeSeedBuffer(seed),
      getNetworkVersions(network)
    );
  } catch (error) {
    throw new CryptoError(
      'Failed to derive root node from seed',
      error as Error
    );
  }

  const fp = await calculateMasterFingerprint(rootNode);
  const psbtType = detectPsbtType(psbtBase64);

  // Try signing with the detected descriptor type; fall back to the other if it fails.
  // No PSBT preprocessing needed — rgb-lib PSBTs already carry correct metadata.
  const trySign = (type: PsbtType): BDKPsbt => {
    const { external, internal } = deriveDescriptors(
      rootNode,
      fp,
      network,
      type
    );
    let wallet: BDKWallet;
    try {
      wallet = bdk.Wallet.create(network as BDKNetwork, external, internal);
    } catch (error) {
      throw new CryptoError('Failed to create BDK wallet', error as Error);
    }
    const pstb = bdk.Psbt.from_string(psbtBase64.trim());
    wallet.sign(pstb, options.signOptions || new bdk.SignOptions());
    return pstb;
  };

  let pstb: BDKPsbt;
  try {
    pstb = trySign(psbtType);
  } catch {
    const fallback: PsbtType =
      psbtType === 'create_utxo' ? 'send' : 'create_utxo';
    try {
      pstb = trySign(fallback);
    } catch (error) {
      throw new CryptoError(
        'Failed to sign PSBT — both descriptor types failed',
        error as Error
      );
    }
  }

  return pstb.toString().trim();
}

export async function signPsbt(
  mnemonic: string,
  psbtBase64: string,
  network: Network = 'testnet',
  options: SignPsbtOptions = {}
): Promise<string> {
  try {
    validateMnemonic(mnemonic, 'mnemonic');
    let seed: Uint8Array;
    try {
      seed = bip39.mnemonicToSeedSync(mnemonic);
    } catch {
      throw new ValidationError('Invalid mnemonic format', 'mnemonic');
    }
    const normalizedNetwork = normalizeNetwork(network);
    return await signPsbtFromSeedInternal(
      seed,
      psbtBase64,
      normalizedNetwork,
      options
    );
  } catch (error) {
    if (error instanceof ValidationError || error instanceof CryptoError)
      throw error;
    throw new CryptoError(
      'Unexpected error during PSBT signing',
      error as Error
    );
  }
}

export async function signPsbtFromSeed(
  seed: string | Uint8Array,
  psbtBase64: string,
  network: Network = 'testnet',
  options: SignPsbtOptions = {}
): Promise<string> {
  const normalizedSeed = normalizeSeedInput(seed);
  const normalizedNetwork = normalizeNetwork(network);
  return signPsbtFromSeedInternal(
    normalizedSeed,
    psbtBase64,
    normalizedNetwork,
    options
  );
}

export async function estimatePsbt(
  psbtBase64: string
): Promise<EstimateFeeResult> {
  if (!psbtBase64) throw new ValidationError('psbt is required', 'psbt');
  try {
    const psbt = Psbt.fromBase64(psbtBase64.trim());
    return {
      fee: psbt.getFee(),
      feeRate: psbt.getFeeRate(),
      vbytes: psbt.extractTransaction().virtualSize(),
    };
  } catch {
    throw new ValidationError('Invalid PSBT provided', 'psbt');
  }
}
