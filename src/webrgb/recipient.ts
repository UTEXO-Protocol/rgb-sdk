/**
 * Read-only support for burns saved by earlier SDK releases. New burns always
 * commit a `burnDestination` (burn-destination.ts); nothing here creates one.
 */
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { burnCommitment, burnDestinationPreimage } from './burn-destination.js';

/** The payout chain and native address of an older journal record. */
export interface LegacyBurnPayout {
  chainId: string;
  address: string;
}

/** The V1 destination object earlier releases stored next to `payout`. */
export interface LegacyBurnDestinationV1 {
  version: 1;
  destinationChainId: number;
  dstEid: number;
  recipient: `0x${string}`;
}

/**
 * The value an older record committed as `burn_reason`: the V1 commitment
 * when it stored a V1 destination, otherwise the padded account (12 zero
 * bytes and the 20 account bytes; Tron without its version byte and checksum).
 */
export function legacyBurnReason(
  payout: LegacyBurnPayout,
  destination?: LegacyBurnDestinationV1
): string {
  // Validates the chain ID and native address; dstEid is checked below.
  const { destinationChainId, recipientBytes } = burnDestinationPreimage({
    ...payout,
    dstEid: destination?.dstEid ?? 0,
  });
  if (!destination)
    return bytesToHex(recipientBytes.slice(-20)).padStart(64, '0');
  if (
    destination.version !== 1 ||
    typeof destination.recipient !== 'string' ||
    !/^0x(?:[\da-f]{2}){1,32}$/i.test(destination.recipient) ||
    BigInt(destination.destinationChainId) !== destinationChainId ||
    destination.recipient.slice(2).toLowerCase() !== bytesToHex(recipientBytes)
  )
    throw new Error(
      'Burn destination does not match the payout chain and address'
    );
  return burnCommitment({
    destinationChainId,
    dstEid: destination.dstEid,
    recipientBytes: hexToBytes(destination.recipient.slice(2)),
  });
}
