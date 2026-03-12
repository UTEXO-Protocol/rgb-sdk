/**
 * UTEXO Network Preset Configurations
 *
 * This file contains the network preset configurations for different environments.
 * Each preset defines the Bitcoin network types and RGB/UTEXO network IDs and assets.
 */

import type { UtxoNetworkPresetConfig } from '../utils/network';

/**
 * Network configuration for a single network (RGB, RGB Lightning, or UTEXO)
 */
type NetworkConfig = {
  networkName: string;
  networkId: number;
  assets: { assetId: string; tokenName: string; longName: string; precision: number; tokenId: number }[];
};

/**
 * Helper function to add getAssetById method to network config
 */
function withGetAssetById<T extends NetworkConfig>(
  config: T
): T & { getAssetById(tokenId: number): T['assets'][number] | undefined } {
  return {
    ...config,
    getAssetById(tokenId: number) {
      return config.assets.find((a) => a.tokenId === tokenId);
    },
  };
}

/**
 * Testnet preset configuration (development)
 * Uses testnet/signet for Bitcoin networks
 */
export const testnetPreset: UtxoNetworkPresetConfig = {
  networkMap: {
    mainnet: 'testnet',
    utexo: 'signet',
  },
  networkIdMap: {
    mainnet: withGetAssetById({
      networkName: 'RGB',
      networkId: 36,
      assets: [
        {
          assetId: 'rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0',
          tokenName: 'tUSD',
          longName: 'USDT',
          precision: 6,
          tokenId: 4,
        },
      ],
    }),
    mainnetLightning: withGetAssetById({
      networkName: 'RGB Lightning',
      networkId: 94,
      assets: [
        {
          assetId: 'rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0',
          tokenName: 'tUSD',
          longName: 'USDT',
          precision: 6,
          tokenId: 4,
        },
      ],
    }),
    utexo: withGetAssetById({
      networkName: 'UTEXO',
      networkId: 96,
      assets: [
        {
          assetId: 'rgb:yJW4k8si-~8JdNfl-nM91qFu-r5rH_HS-1hM7jpi-L~lBf90',
          tokenName: 'tUSD',
          longName: 'USDT',
          precision: 6,
          tokenId: 4,
        },
      ],
    }),
  },
};

/**
 * Mainnet preset configuration (production)
 * Uses mainnet for Bitcoin networks
 * TODO: Update asset IDs and network IDs for production when available
 */
export const mainnetPreset: UtxoNetworkPresetConfig = {
  networkMap: {
    mainnet: 'mainnet',
    utexo: 'signet',
  },
  networkIdMap: {
    mainnet: withGetAssetById({
      networkName: 'RGB',
      networkId: 36, // TODO: Update to production network ID
      assets: [
        {
          assetId: 'rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0', // TODO: Update to production asset ID
          tokenName: 'tUSD',
          longName: 'USDT',
          precision: 6,
          tokenId: 4,
        },
      ],
    }),
    mainnetLightning: withGetAssetById({
      networkName: 'RGB Lightning',
      networkId: 94, // TODO: Update to production network ID
      assets: [
        {
          assetId: 'rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0', // TODO: Update to production asset ID
          tokenName: 'tUSD',
          longName: 'USDT',
          precision: 6,
          tokenId: 4,
        },
      ],
    }),
    utexo: withGetAssetById({
      networkName: 'UTEXO',
      networkId: 96, // TODO: Update to production network ID
      assets: [
        {
          assetId: 'rgb:yJW4k8si-~8JdNfl-nM91qFu-r5rH_HS-1hM7jpi-L~lBf90', // TODO: Update to production asset ID
          tokenName: 'tUSD',
          longName: 'USDT',
          precision: 6,
          tokenId: 4,
        },
      ],
    }),
  },
};
