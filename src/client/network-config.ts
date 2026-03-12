import type { Network } from '../crypto/types';

export const DEFAULT_TRANSPORT_ENDPOINTS: Record<Network, string> = {
  mainnet: 'rpcs://rgb-proxy-mainnet.utexo.com/json-rpc',
  testnet: 'rpcs://rgb-proxy-testnet3.utexo.com/json-rpc',
  testnet4: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
  signet: 'rpcs://rgb-proxy-utexo.utexo.com/json-rpc',
  regtest: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
};

export const DEFAULT_INDEXER_URLS: Record<Network, string> = {
  mainnet: 'ssl://electrum.iriswallet.com:50003',
  testnet: 'ssl://electrum.iriswallet.com:50013',
  testnet4: 'ssl://electrum.iriswallet.com:50053',
  signet: 'https://esplora-api.utexo.com',
  regtest: 'tcp://regtest.thunderstack.org:50001',
};

