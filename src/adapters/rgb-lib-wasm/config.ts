import {
  DEFAULT_INDEXER_URLS as CORE_DEFAULT_INDEXER_URLS,
  DEFAULT_TRANSPORT_ENDPOINTS as CORE_DEFAULT_TRANSPORT_ENDPOINTS,
} from '@utexo/rgb-sdk-core';
import type { Network } from '@utexo/rgb-sdk-core';
import { RgbLibWebError, unsupported } from './errors.js';

// Ported from `@utexo/rgb-lib-rn` (`rgb-lib/config.ts`, `network-endpoints.ts`).
// rgb-lib-wasm is built with Esplora only: Electrum and bitcoind indexers are
// rejected with UNSUPPORTED_CAPABILITY.

/** Settings fixed for the wallet's lifetime. */
export interface RgbLibWebOptions {
  network: Network;
  /**
   * Prefix of the IndexedDB key; the wallet stores its state under
   * `<dataDir>/<masterFingerprint>/<network>`. Default `':memory:'`.
   */
  dataDir?: string;
  maxAllocationsPerUtxo?: number;
  /** Return one pinned address instead of a new one on each call. */
  reuseAddresses?: boolean;
}

/** Mint lock bounds in blocks; `min` must not exceed `max`. */
export interface RgbLibWebMintLockBlocks {
  min: number;
  max: number;
}

export type RgbLibWebIndexer = { type: 'esplora'; url: string };

type RgbLibWebOnlineConfig = {
  /** Defaults to the SDK proxy of the network (protocol 1.0). */
  proxyEndpoint?: string;
  /** EVM JSON-RPC endpoints for BFA mint locks, keyed by EVM chain ID (decimal). */
  evmRpcUrls?: Readonly<Record<string, string>>;
  /** Mint lock window per EVM chain; a chain without one uses the default. */
  evmMintLockBlocks?: Readonly<Record<string, RgbLibWebMintLockBlocks>>;
  proxyAuthKeys?: Readonly<Record<string, string>>;
};

/**
 * Connection settings of `unlock(params)` / `goOnline(params)`. Omit both
 * `indexer` and `indexerUrl` to use the network's default Esplora server.
 */
export type RgbLibWebUnlockParams = RgbLibWebOnlineConfig &
  (
    | { indexer: RgbLibWebIndexer; indexerUrl?: never }
    | { indexerUrl?: string; indexer?: never }
  );

/**
 * Wallet settings plus the connection settings used when the wallet connects
 * without explicit parameters. Stored only: construction makes no network call.
 */
export type RgbLibWebParams = RgbLibWebOptions & RgbLibWebUnlockParams;

export interface ResolvedRgbLibWebConfig {
  indexer: RgbLibWebIndexer;
  proxyEndpoint: string;
  evmRpcUrls: Readonly<Record<string, string>>;
  evmMintLockBlocks: Readonly<Record<string, RgbLibWebMintLockBlocks>>;
  proxyAuthKeys: Readonly<Record<string, string>>;
}

export const DEFAULT_EVM_MINT_LOCK_BLOCKS: Readonly<RgbLibWebMintLockBlocks> =
  Object.freeze({ min: 1200, max: 28800 });

/** The `@utexo/rgb-lib-rn` defaults; only Esplora (HTTP) indexers apply here. */
const SDK_INDEXER_URLS: Readonly<Record<Network, string>> = Object.freeze({
  ...CORE_DEFAULT_INDEXER_URLS,
  mainnet: 'ssl://electrs-01.utexo.com:50002',
  utexo: 'https://dev.esplora-01.mint.utexo.com',
});
const SDK_TRANSPORT_ENDPOINTS: Readonly<Record<Network, string>> =
  Object.freeze({
    ...CORE_DEFAULT_TRANSPORT_ENDPOINTS,
    mainnet: 'rpcs://rgb-proxy.utexo.com/json-rpc',
    utexo: 'rpcs://dev.rgb-proxy.utexo.com/json-rpc',
    signet: 'rpcs://staging.rgb-proxy.utexo.com/json-rpc',
  });

function networkDefaults(network: string) {
  if (!Object.prototype.hasOwnProperty.call(SDK_INDEXER_URLS, network))
    return undefined;
  const indexerUrl = SDK_INDEXER_URLS[network as Network];
  return {
    // Electrum defaults (mainnet, signet) do not work in the browser.
    indexerUrl: /^https?:\/\//.test(indexerUrl) ? indexerUrl : undefined,
    proxyEndpoint: SDK_TRANSPORT_ENDPOINTS[network as Network],
  };
}

const CONNECTION_KEYS = [
  'indexer',
  'indexerUrl',
  'proxyEndpoint',
  'evmRpcUrls',
  'evmMintLockBlocks',
  'proxyAuthKeys',
] as const;

/** Splits constructor params; `connection` is undefined when none is set. */
export function splitWalletParams(params: RgbLibWebParams): {
  options: RgbLibWebOptions;
  connection?: RgbLibWebUnlockParams;
} {
  const options: Record<string, unknown> = { ...params };
  const connection: Record<string, unknown> = {};
  for (const key of CONNECTION_KEYS) {
    if (options[key] !== undefined) connection[key] = options[key];
    delete options[key];
  }
  return {
    options: options as unknown as RgbLibWebOptions,
    connection: Object.keys(connection).length
      ? (connection as RgbLibWebUnlockParams)
      : undefined,
  };
}

const NETWORKS: readonly string[] = [
  'mainnet',
  'testnet',
  'testnet4',
  'regtest',
  'signet',
  'utexo',
];

export function invalidConfig(message: string): never {
  throw new RgbLibWebError('INVALID_CONFIG', message);
}

export function integer(
  value: number,
  field: string,
  min: number,
  max: number
) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    invalidConfig(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function validateWalletParams(params: RgbLibWebParams) {
  if (!params || typeof params !== 'object')
    invalidConfig('RgbLibWeb needs a params object');
  if (!NETWORKS.includes(params.network)) invalidConfig('Unsupported network');
  if (
    params.dataDir !== undefined &&
    (typeof params.dataDir !== 'string' ||
      params.dataDir.length === 0 ||
      params.dataDir.includes('\0'))
  ) {
    invalidConfig('dataDir must be a non-empty string');
  }
  integer(
    params.maxAllocationsPerUtxo ?? 5,
    'maxAllocationsPerUtxo',
    1,
    0xffffffff
  );
  if (
    params.reuseAddresses !== undefined &&
    typeof params.reuseAddresses !== 'boolean'
  ) {
    invalidConfig('reuseAddresses must be a boolean');
  }
}

function url(value: string, protocols: readonly string[], field: string) {
  if (
    typeof value !== 'string' ||
    !protocols.some((p) => value.startsWith(p))
  ) {
    invalidConfig(`${field} has an unsupported URL scheme`);
  }
  const parsed =
    /^[a-z]+:\/\/(?:[^/@\s?#\\]+@)?(\[[0-9a-fA-F:.]+\]|[^:/@\s?#\\]+)(?::(\d{1,5}))?(?:[/?][^\s#\\]*)?$/.exec(
      value
    );
  if (
    !parsed ||
    (parsed[2] !== undefined &&
      (Number(parsed[2]) < 1 || Number(parsed[2]) > 65535))
  ) {
    invalidConfig(`Invalid ${field}`);
  }
  return value;
}

function proxyEndpoint(value: string) {
  url(value, ['https://', 'http://', 'rpcs://', 'rpc://'], 'proxyEndpoint');
  return value.replace(/^https:/, 'rpcs:').replace(/^http:/, 'rpc:');
}

/**
 * Validates online parameters. With `network`, a missing indexer or proxy
 * falls back to the network defaults.
 */
export function resolveConfig(
  params: RgbLibWebUnlockParams,
  network?: string,
  operation = 'unlock'
): ResolvedRgbLibWebConfig {
  if (
    !params ||
    typeof params !== 'object' ||
    (params.indexer !== undefined && params.indexerUrl !== undefined)
  ) {
    invalidConfig('Provide either indexer or indexerUrl');
  }
  const defaults = network === undefined ? undefined : networkDefaults(network);
  let indexer: { type: string; url: string } | undefined = params.indexer;
  if (!indexer) {
    const endpoint = params.indexerUrl ?? defaults?.indexerUrl;
    if (!endpoint) invalidConfig('An Esplora indexer is required');
    indexer = {
      type: /^(ssl|tcp):\/\//.test(endpoint) ? 'electrum' : 'esplora',
      url: endpoint,
    };
  }
  if (indexer.type === 'electrum' || indexer.type === 'bitcoind') {
    throw unsupported(
      operation,
      `the ${indexer.type} indexer is not available in the browser; use an Esplora URL`
    );
  }
  if (indexer.type !== 'esplora') invalidConfig('Unsupported indexer type');
  url(indexer.url, ['https://', 'http://'], 'indexer');
  const requestedProxy = params.proxyEndpoint ?? defaults?.proxyEndpoint;
  if (!requestedProxy) invalidConfig('A proxy endpoint is required');
  const proxy = proxyEndpoint(requestedProxy);
  const evmRpcUrls: Record<string, string> = {};
  const evmMintLockBlocks: Record<string, RgbLibWebMintLockBlocks> = {};
  for (const [chainId, endpoint] of Object.entries(params.evmRpcUrls ?? {})) {
    if (
      !/^[1-9]\d{0,19}$/.test(chainId) ||
      BigInt(chainId) > 0xffffffffffffffffn
    ) {
      invalidConfig('EVM chain IDs must be positive u64 decimal strings');
    }
    url(endpoint, ['https://', 'http://'], 'EVM RPC');
    evmRpcUrls[chainId] = endpoint;
    const bounds =
      params.evmMintLockBlocks?.[chainId] ?? DEFAULT_EVM_MINT_LOCK_BLOCKS;
    if (!bounds || typeof bounds !== 'object') {
      invalidConfig(`EVM chain ${chainId}: mint lock bounds need min and max`);
    }
    const min = integer(
      bounds.min,
      `EVM chain ${chainId}: min mint lock blocks`,
      0,
      Number.MAX_SAFE_INTEGER
    );
    const max = integer(
      bounds.max,
      `EVM chain ${chainId}: max mint lock blocks`,
      0,
      Number.MAX_SAFE_INTEGER
    );
    if (min > max) {
      invalidConfig(
        `EVM chain ${chainId}: min mint lock blocks exceed max mint lock blocks`
      );
    }
    evmMintLockBlocks[chainId] = { min, max };
  }
  for (const chainId of Object.keys(params.evmMintLockBlocks ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(evmRpcUrls, chainId)) {
      invalidConfig(
        `EVM chain ${chainId}: mint lock bounds need a matching evmRpcUrls entry`
      );
    }
  }
  const proxyAuthKeys: Record<string, string> = {};
  for (const [endpoint, key] of Object.entries(params.proxyAuthKeys ?? {})) {
    const normalized = proxyEndpoint(endpoint);
    if (typeof key !== 'string' || !/^[a-fA-F0-9]{64}$/.test(key)) {
      invalidConfig('Proxy authentication keys must be 32-byte hex strings');
    }
    if (proxyAuthKeys[normalized] && proxyAuthKeys[normalized] !== key) {
      invalidConfig('Conflicting proxy authentication keys');
    }
    proxyAuthKeys[normalized] = key;
  }
  return {
    indexer: { type: 'esplora', url: indexer.url },
    proxyEndpoint: proxy,
    evmRpcUrls,
    evmMintLockBlocks,
    proxyAuthKeys,
  };
}

export function configEquals(
  a: ResolvedRgbLibWebConfig,
  b: ResolvedRgbLibWebConfig
) {
  const entries = (value: object) =>
    JSON.stringify(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([x], [y]) => x.localeCompare(y))
    );
  return (
    a.indexer.url === b.indexer.url &&
    a.proxyEndpoint === b.proxyEndpoint &&
    entries(a.evmRpcUrls) === entries(b.evmRpcUrls) &&
    entries(a.evmMintLockBlocks) === entries(b.evmMintLockBlocks) &&
    entries(a.proxyAuthKeys) === entries(b.proxyAuthKeys)
  );
}
