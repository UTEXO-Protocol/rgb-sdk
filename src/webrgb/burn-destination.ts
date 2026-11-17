import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { RgbBurnDestination } from '@utexo/webrgb';

const tronBase58 = base58check(sha256);
const U64_MAX = 18446744073709551615n;
const U32_MAX = 0xffffffff;
const CHAIN_ID = /^(eip155|tron):([1-9][0-9]{0,19})$/;
const TYPE_HASH = keccak_256(
  utf8ToBytes(
    'UtexoBurnDestinationV1(uint64 destinationChainId,uint32 dstEid,bytes recipient)'
  )
);

/** A payout route this wallet's bridge deployment serves; never taken from a dApp. */
export interface BurnDestinationRoute {
  /** CAIP-2 chain ID, e.g. `eip155:42161` or `tron:728126428`. */
  chainId: string;
  /** LayerZero endpoint ID; `0` is a direct payout on an EVM chain. */
  dstEid: number;
}

/** The SPEC §4.1 preimage of a destination commitment. */
export interface BurnDestinationPreimage {
  destinationChainId: bigint;
  dstEid: number;
  recipientBytes: Uint8Array;
}

function evmBytes(address: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/i.test(address))
    throw new Error('A nonzero 20-byte EVM payout address is required');
  const hex = address.slice(2);
  // Mixed case is an EIP-55 checksum, so it has to be valid.
  if (hex !== hex.toLowerCase() && hex !== hex.toUpperCase()) {
    const digest = bytesToHex(keccak_256(utf8ToBytes(hex.toLowerCase())));
    for (let i = 0; i < 40; i += 1) {
      const upper = parseInt(digest[i]!, 16) >= 8;
      if (
        /[a-f]/i.test(hex[i]!) &&
        (hex[i] === hex[i]!.toUpperCase()) !== upper
      )
        throw new Error('The EVM payout address has an invalid checksum');
    }
  }
  return hexToBytes(hex.toLowerCase());
}

/** The 21-byte Base58Check payload, `0x41` prefix included, checksum excluded. */
function tronBytes(address: string): Uint8Array {
  if (
    typeof address !== 'string' ||
    !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
  )
    throw new Error('A Tron Base58Check payout address is required');
  let payload: Uint8Array;
  try {
    payload = tronBase58.decode(address);
  } catch {
    throw new Error('The Tron payout address has an invalid checksum');
  }
  if (
    payload.length !== 21 ||
    payload[0] !== 0x41 ||
    payload.subarray(1).every((byte) => byte === 0)
  )
    throw new Error('A nonzero Tron payout address is required');
  return payload;
}

function chainReference(chainId: unknown): {
  namespace: 'eip155' | 'tron';
  reference: bigint;
} {
  const match = typeof chainId === 'string' ? CHAIN_ID.exec(chainId) : null;
  if (!match || BigInt(match[2]!) > U64_MAX)
    throw new Error('Unsupported or noncanonical payout chain ID');
  return {
    namespace: match[1] as 'eip155' | 'tron',
    reference: BigInt(match[2]!),
  };
}

function endpoint(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > U32_MAX
  )
    throw new Error('dstEid must be a u32 integer');
  return value;
}

/**
 * Validates `{ version: 1, chainId, address, dstEid }` exactly: no other field,
 * a native address for the chain's namespace. Returns a copy with the same values.
 */
export function normalizeBurnDestination(value: unknown): RgbBurnDestination {
  const record = value as Record<string, unknown> | null;
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    Object.keys(record).sort().join() !== 'address,chainId,dstEid,version'
  )
    throw new Error(
      'burnDestination must be exactly { version, chainId, address, dstEid }'
    );
  burnDestinationPreimage(record as unknown as RgbBurnDestination);
  return {
    version: 1,
    chainId: record.chainId as string,
    address: record.address as string,
    dstEid: record.dstEid as number,
  };
}

/**
 * The SPEC §4.1 preimage; validates the version, chain ID, address and endpoint.
 * `version: 1` selects the `UtexoBurnDestinationV1` type string; no default.
 */
export function burnDestinationPreimage(
  destination: RgbBurnDestination
): BurnDestinationPreimage {
  if (destination?.version !== 1)
    throw new Error('Unsupported burn destination version');
  const { namespace, reference } = chainReference(destination?.chainId);
  const dstEid = endpoint(destination.dstEid);
  if (typeof destination.address !== 'string')
    throw new Error('A native payout address is required');
  return {
    destinationChainId: reference,
    dstEid,
    recipientBytes:
      namespace === 'eip155'
        ? evmBytes(destination.address)
        : tronBytes(destination.address),
  };
}

/** keccak256(abi.encode(typeHash, uint64 chain, uint32 eid, keccak256(recipient))). */
export function burnCommitment(preimage: BurnDestinationPreimage): string {
  const encoded = new Uint8Array(128);
  encoded.set(TYPE_HASH);
  const view = new DataView(encoded.buffer);
  view.setBigUint64(56, preimage.destinationChainId);
  view.setUint32(92, preimage.dstEid);
  encoded.set(keccak_256(preimage.recipientBytes), 96);
  return bytesToHex(keccak_256(encoded));
}

/** The 32-byte commitment as `0x` hex. */
export function burnDestinationHash(
  destination: RgbBurnDestination
): `0x${string}` {
  return `0x${burnCommitment(burnDestinationPreimage(destination))}`;
}

/** The commitment as rgb-lib's `burn_reason`: 64 lowercase hex characters, no `0x`. */
export function burnDestinationReason(destination: RgbBurnDestination): string {
  return burnCommitment(burnDestinationPreimage(destination));
}

/** Validates deployment routes: canonical chain IDs, u32 endpoints, no duplicates. */
export function normalizeBurnRoutes(
  routes: readonly BurnDestinationRoute[]
): BurnDestinationRoute[] {
  const seen = new Set<string>();
  const result = routes.map(({ chainId, dstEid }) => {
    try {
      chainReference(chainId);
      endpoint(dstEid);
    } catch {
      throw new Error('Invalid payout route');
    }
    const key = `${chainId}#${dstEid}`;
    // A direct payout (dstEid 0) exists only on EVM chains.
    if (seen.has(key) || (chainId.startsWith('tron:') && dstEid === 0))
      throw new Error('Invalid or duplicate payout route');
    seen.add(key);
    return { chainId, dstEid };
  });
  if (!result.length) throw new Error('Payout routes cannot be empty');
  return result;
}

/** Whether the exact chain and endpoint pair is a configured route. */
export function isBurnRoute(
  destination: RgbBurnDestination,
  routes: readonly BurnDestinationRoute[]
): boolean {
  return routes.some(
    (route) =>
      route.chainId === destination.chainId &&
      route.dstEid === destination.dstEid
  );
}
