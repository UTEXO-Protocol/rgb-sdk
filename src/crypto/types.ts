/**
 * RGB Crypto module types — shared types re-exported from core, BDK types kept local.
 */

// Shared types now live in core
export type {
  Network,
  PsbtType,
  NetworkVersions,
  Descriptors,
  BufferLike,
  BIP32Interface,
} from '@utexo/rgb-sdk-core';

// BDK-specific types (Node SDK only)
export type BDKNetwork = string | number;

export interface BDKWallet {
  sign(psbt: BDKPsbt, signOptions: BDKSignOptions): BDKPsbt;
}

export interface BDKPsbt {
  extract_tx(): string;
}

export interface BDKSignOptions {}

export interface BDKModule {
  Wallet: {
    create: (network: BDKNetwork, external: string, internal: string) => BDKWallet;
  };
  Psbt: {
    from_string: (psbt: string) => BDKPsbt;
  };
  SignOptions: new () => BDKSignOptions;
  Network?: { [key: string]: BDKNetwork };
}

export type BDKInit = unknown;
