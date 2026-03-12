import { isBare, isNode } from './environment';
import { convertToArrayBuffer } from './crypto-helpers';
import * as noble from "@noble/hashes/legacy.js";

export async function sha256(data: Uint8Array | Buffer): Promise<Uint8Array> {
  if (isNode() || isBare()) {
    // String concatenation prevents bundlers from analyzing the import
    const nodeCrypto = 'node:' + 'crypto';
    const { createHash } = await import(nodeCrypto);
    return createHash('sha256').update(data as any).digest();
  }
  else {
    if (!data) {
      throw new Error('sha256: data is undefined or null');
    }
    const arrayBuffer = convertToArrayBuffer(data);
    return new Uint8Array(await crypto.subtle.digest('SHA-256', arrayBuffer));
  }
}

/**
 * RIPEMD160 hash - uses polyfill in browser (Web Crypto API doesn't support it)
 */
export async function ripemd160(data: Uint8Array): Promise<Uint8Array> {
  if (isNode()) {
    const nodeCrypto = 'node:' + 'crypto';
    const { createHash } = await import(nodeCrypto);
    return createHash('ripemd160').update(data).digest();
  } else if (isBare()) {
    return new Uint8Array(await noble.ripemd160(data));
  } else {
    // @ts-ignore - ripemd160 doesn't have type definitions
    const ripemd160Module = await import('ripemd160');
    const RIPEMD160 = ripemd160Module.default || ripemd160Module;
    const BufferPolyfill = (globalThis as any).Buffer || (await import('buffer')).Buffer;
    const hasher = new (RIPEMD160 as any)();
    hasher.update(BufferPolyfill.from(data));
    return new Uint8Array(hasher.digest());
  }
}

let nodeCrypto: typeof import('node:crypto') | null = null;

async function getNodeCrypto() {
  if (!isNode()) {
    throw new Error('Node.js crypto is only available in Node.js environment');
  }
  if (!nodeCrypto) {
    const nodeCryptoPath = 'node:' + 'crypto';
    nodeCrypto = await import(nodeCryptoPath);
  }
  return nodeCrypto;
}

export async function sha256Sync(data: Uint8Array | Buffer): Promise<Uint8Array> {
  if (!isNode()) {
    return sha256(data);
  }
  if (!data) {
    throw new Error('sha256Sync: data is undefined');
  }
  const crypto = await getNodeCrypto();
  if (!crypto) {
    throw new Error('Node.js crypto is not available');
  }
  return crypto.createHash('sha256').update(data as any).digest();
}

export const ripemd160Sync: (data: Uint8Array | Buffer) => Promise<Uint8Array> = async (data: Uint8Array | Buffer): Promise<Uint8Array> => {
  if (!isNode()) {
    return ripemd160(data);
  }
  if (!data) {
    throw new Error('ripemd160Sync: data is undefined');
  }
  const crypto = await getNodeCrypto();
  if (!crypto) {
    throw new Error('Node.js crypto is not available');
  }
  return crypto.createHash('ripemd160').update(data as any).digest();
};

