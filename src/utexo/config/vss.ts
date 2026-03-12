/**
 * VSS (Versioned Storage Service) configuration defaults and helpers for UTEXO wallet backup/restore.
 */

import type { VssBackupConfig } from '../../types/wallet-model';

/** Default VSS server URL used when vssServerUrl is not set in config or restore params. */
export const DEFAULT_VSS_SERVER_URL = 'https://vss-server.utexo.com/vss';

/**
 * Split a base VSS config into layer1 and utexo configs (storeId_layer1, storeId_utexo).
 * Same convention used by UTEXOWallet backup and restore.
 */
export function getVssConfigs(config: VssBackupConfig): { layer1: VssBackupConfig; utexo: VssBackupConfig } {
    const base = { ...config };
    return {
        layer1: { ...base, storeId: `${config.storeId}_layer1` },
        utexo: { ...base, storeId: `${config.storeId}_utexo` },
    };
}
