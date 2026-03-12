/**
 * RGB Crypto module types
 * 
 * Type definitions for RGB-specific cryptographic operations including
 * PSBT signing and key derivation for RGB protocol
 */

/**
 * Bitcoin network type
 */
export type Network = 'mainnet' | 'testnet' | 'testnet4' | 'signet' | 'regtest';

/**
 * PSBT type (create_utxo or send)
 */
export type PsbtType = 'create_utxo' | 'send';

/**
 * Network versions for BIP32
 */
export interface NetworkVersions {
  bip32: {
    public: number;
    private: number;
  };
  wif: number;
}

/**
 * Descriptors for wallet derivation
 */
export interface Descriptors {
  external: string;
  internal: string;
}

/**
 * Buffer-like object that can be converted to Buffer or Uint8Array
 */
export type BufferLike = Buffer | Uint8Array | ArrayBuffer | {
  buffer?: ArrayBuffer;
  byteOffset?: number;
  byteLength?: number;
  length?: number;
} | number[];

/**
 * BDK Network type (from bdk-wasm)
 */
export type BDKNetwork = string | number;

/**
 * BDK Wallet instance
 */
export interface BDKWallet {
  sign(psbt: BDKPsbt, signOptions: BDKSignOptions): BDKPsbt;
}

/**
 * BDK PSBT instance
 */
export interface BDKPsbt {
  extract_tx(): string;
}

/**
 * BDK SignOptions
 */
export interface BDKSignOptions {
  // BDK SignOptions properties
}

/**
 * BDK Module interface
 */
export interface BDKModule {
  Wallet: {
    create: (network: BDKNetwork, external: string, internal: string) => BDKWallet;
  };
  Psbt: {
    from_string: (psbt: string) => BDKPsbt;
  };
  SignOptions: new () => BDKSignOptions;
  Network?: {
    [key: string]: BDKNetwork;
  };
}

/**
 * BDK Init function
 */
export type BDKInit = unknown;

/**
 * BIP39 module interface
 */
export interface BIP39Module {
  mnemonicToSeedSync: (mnemonic: string) => Buffer;
  validateMnemonic: (mnemonic: string, wordlist?: string[]) => boolean;
  setDefaultWordlist?: (wordlist: string) => void;
  generateMnemonic?: (strength?: number, rng?: (size: number) => Buffer, wordlist?: string[]) => string;
  [key: string]: unknown;
}

/**
 * ECC module interface (from @bitcoinerlab/secp256k1)
 * Note: This is a simplified interface that matches the actual ECC module
 */
export interface ECCModule {
  signSchnorr: (message: Uint8Array, privateKey: Uint8Array, auxRand?: Uint8Array) => Uint8Array;
  verifySchnorr: (message: Uint8Array, publicKey: Uint8Array, signature: Uint8Array) => boolean;
  xOnlyPointFromPoint: (point: Uint8Array) => Uint8Array;
  [key: string]: unknown;
}

/**
 * BIP32 Factory function type
 */
export type BIP32Factory = (ecc: unknown) => {
  fromSeed: (seed: Buffer | Uint8Array, versions?: NetworkVersions) => import('bip32').BIP32Interface;
  fromBase58: (base58: string, versions?: NetworkVersions) => import('bip32').BIP32Interface;
};

/**
 * BitcoinJS Payments module
 */
export interface BitcoinJsPayments {
  p2tr: (options: {
    internalPubkey: Buffer;
    network: import('bitcoinjs-lib').Network;
  }) => {
    output?: Buffer;
    address?: string;
  };
}

/**
 * BitcoinJS Networks module
 */
export interface BitcoinJsNetworks {
  bitcoin: import('bitcoinjs-lib').Network;
  testnet: import('bitcoinjs-lib').Network;
  regtest?: import('bitcoinjs-lib').Network;
  signet?: import('bitcoinjs-lib').Network;
}

/**
 * BIP341 module interface
 */
export interface BIP341Module {
  toXOnly?: (pubkey: Buffer) => Buffer;
  [key: string]: unknown;
}

