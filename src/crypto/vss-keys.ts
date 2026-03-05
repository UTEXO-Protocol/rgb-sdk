/**
 * VSS (Versioned Storage Service) backup key derivation.
 *
 * Derives a 32-byte signing key from a BIP39 mnemonic for use with rgb-lib's
 * VssBackupClient (server_url, store_id, signing_key). rgb-lib does not define
 * mnemonic → signing_key; this SDK uses HMAC-SHA256 with the same domain string
 * as rgb-lib's HKDF so backup/restore stay deterministic per wallet.
 *
 * Derivation: HMAC-SHA256(key = "rgb-lib-vss-backup-encryption-v1", message = mnemonic),
 * output as 64-char hex (32 bytes).
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { validateMnemonic } from '../utils/validation';

const VSS_SIGNING_KEY_DOMAIN = 'rgb-lib-vss-backup-encryption-v1';

/**
 * Derive the VSS backup signing key from a BIP39 mnemonic.
 * The result is a 64-character hex string (32 bytes) suitable for
 * VssBackupConfig.signingKey. Must match rgb-lib's Rust derivation.
 *
 * @param mnemonic - BIP39 mnemonic phrase (12 or 24 words)
 * @returns 32-byte signing key as hex string (same mnemonic always yields same key for backup/restore)
 */
export function deriveVssSigningKeyFromMnemonic(mnemonic: string): string {
    validateMnemonic(mnemonic, 'mnemonic');
    const keyBytes = new TextEncoder().encode(VSS_SIGNING_KEY_DOMAIN);
    const messageBytes = new TextEncoder().encode(mnemonic.trim());
    const digest = hmac(sha256, keyBytes, messageBytes);
    return Array.from(digest)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
