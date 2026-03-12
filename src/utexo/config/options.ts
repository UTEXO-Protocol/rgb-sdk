/**
 * UTEXOWallet constructor and runtime options.
 */

import type { UtxoNetworkPreset } from '../utils/network';

/**
 * Options for UTEXOWallet. When omitted, defaults apply (e.g. DEFAULT_VSS_SERVER_URL for VSS).
 */
export interface ConfigOptions {
    /**
     * Network preset: 'mainnet' (production) or 'testnet' (development).
     * Default: 'mainnet'.
     */
    network?: UtxoNetworkPreset;
    /**
     * Optional base directory for wallet data. When set, each wallet uses a subdir by network + fingerprint:
     * utexoRGBWallet → dataDir/{networkMap.utexo}/{masterFingerprint} (e.g. ./utexo/signet/3780bc30)
     * layer1RGBWallet → dataDir/{networkMap.mainnet}/{masterFingerprint} (e.g. ./utexo/testnet/3780bc30)
     * Same structure is used by restoreUtxoWalletFromVss so restored data can be loaded with this dataDir.
     */
    dataDir?: string;
    /**
     * Optional VSS server URL. When omitted, DEFAULT_VSS_SERVER_URL is used.
     * vssBackup() / vssBackupInfo() build config from mnemonic + this URL when config is not passed.
     */
    vssServerUrl?: string;
}
