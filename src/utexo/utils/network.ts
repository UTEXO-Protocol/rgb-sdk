/**
 * UTEXO network and asset mapping
 */

import type { Network } from '../../crypto/types';
// Import preset configurations from config file
import { testnetPreset, mainnetPreset } from '../config/utexo-presets';

/**
 * Network preset type - determines which configuration bundle to use
 */
export type UtxoNetworkPreset = 'mainnet' | 'testnet';

/**
 * Network map configuration - maps logical network names to Bitcoin network types
 */
export type UtxoNetworkMap = {
  mainnet: Network;
  utexo: Network;
};

/**
 * Network configuration for a single network (RGB, RGB Lightning, or UTEXO)
 */
type NetworkConfig = {
  networkName: string;
  networkId: number;
  assets: { assetId: string; tokenName: string; longName: string; precision: number; tokenId: number }[];
};

/**
 * Network ID map configuration - contains all network configs with asset lookup
 */
export type UtxoNetworkIdMap = {
  mainnet: NetworkConfig & { getAssetById(tokenId: number): NetworkConfig['assets'][number] | undefined };
  mainnetLightning: NetworkConfig & { getAssetById(tokenId: number): NetworkConfig['assets'][number] | undefined };
  utexo: NetworkConfig & { getAssetById(tokenId: number): NetworkConfig['assets'][number] | undefined };
};

/**
 * Complete network preset configuration bundle
 */
export type UtxoNetworkPresetConfig = {
  networkMap: UtxoNetworkMap;
  networkIdMap: UtxoNetworkIdMap;
};

/**
 * Network preset configurations map
 */
const NETWORK_PRESETS: Record<UtxoNetworkPreset, UtxoNetworkPresetConfig> = {
  mainnet: mainnetPreset,
  testnet: testnetPreset,
};

/**
 * Gets the network configuration for a given preset
 * @param preset - Network preset ('mainnet' or 'testnet')
 * @returns Network preset configuration bundle
 */
export function getUtxoNetworkConfig(preset: UtxoNetworkPreset): UtxoNetworkPresetConfig {
  return NETWORK_PRESETS[preset];
}

/**
 * Backward compatibility: Export testnet preset as default (current behavior)
 * @deprecated Use getUtxoNetworkConfig('testnet') or getUtxoNetworkConfig('mainnet') instead
 */
export const utexoNetworkMap: UtxoNetworkMap = testnetPreset.networkMap;

/**
 * Backward compatibility: Export testnet preset as default (current behavior)
 * @deprecated Use getUtxoNetworkConfig('testnet') or getUtxoNetworkConfig('mainnet') instead
 */
export const utexoNetworkIdMap: UtxoNetworkIdMap = testnetPreset.networkIdMap;

const networkConfigs = utexoNetworkIdMap;

export type NetworkAsset = (typeof networkConfigs)[keyof typeof networkConfigs]['assets'][number];

export type UtxoNetworkId = keyof typeof networkConfigs;

/**
 * Resolves the destination network's asset object from sender network, destination network, and sender asset ID.
 * Uses tokenId as the cross-network identifier (same tokenId = same logical asset).
 */
export function getDestinationAsset(
  senderNetwork: UtxoNetworkId,
  destinationNetwork: UtxoNetworkId,
  assetIdSender: string | null
): NetworkAsset | undefined {
  const destinationConfig = utexoNetworkIdMap[destinationNetwork];
  if (assetIdSender == null) return destinationConfig.assets[0];
  const senderConfig = utexoNetworkIdMap[senderNetwork];
  const senderAsset = senderConfig.assets.find((a) => a.assetId === assetIdSender);
  if (!senderAsset) return undefined;
  return destinationConfig.assets.find((a) => a.tokenId === senderAsset.tokenId);
}
