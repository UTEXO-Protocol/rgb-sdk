/**
 * UTEXO Bridge gateway configuration by network.
 */

import type { UtxoNetworkPreset } from '../utils/network';

export const DEFAULT_GATEWAY_BASE_URLS: Record<UtxoNetworkPreset, string> = {
  mainnet: 'https://gateway.utexo.tricorn.network/',
  testnet: 'https://dev.gateway.utexo.tricorn.network/',
};
