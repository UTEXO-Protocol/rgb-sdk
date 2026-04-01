import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { pollCondition } from '../shared/helpers';

export const REGTEST_NETWORK = 'regtest';
export const BTC_FUNDING_AMOUNT = 1;
export const MIN_WALLET_BTC_SAT = 50_000;
export const UTXO_PROFILE = {
  num: 5,
  size: 2_000,
  feeRate: 1,
} as const;

export type RegtestKeys = {
  mnemonic: string;
  accountXpubVanilla: string;
  accountXpubColored: string;
  masterFingerprint: string;
};

export type RegtestWallet = {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getAddress(): Promise<string>;
  getBtcBalance(): Promise<{
    vanilla: { settled: number | string; spendable: number | string };
  }>;
  createUtxos(params: {
    num?: number;
    size?: number;
    feeRate?: number;
  }): Promise<number>;
  issueAssetNia(params: {
    ticker: string;
    name: string;
    amounts: number[];
    precision: number;
  }): Promise<{ assetId: string }>;
  getAssetBalance(
    assetId: string
  ): Promise<{ settled?: number | string; spendable?: number | string }>;
  refreshWallet(): Promise<void>;
  blindReceive(params: {
    amount: number;
    minConfirmations: number;
    durationSeconds?: number;
  }): Promise<{
    invoice: string;
    recipientId: string;
  }>;
  witnessReceive(params: {
    amount: number;
    minConfirmations: number;
    durationSeconds?: number;
  }): Promise<{
    invoice: string;
    recipientId: string;
  }>;
  send(params: {
    invoice: string;
    assetId: string;
    amount: number;
    donation: boolean;
    feeRate: number;
    minConfirmations: number;
    witnessData?: { amountSat: number; blinding?: number | null };
  }): Promise<{ txid: string }>;
  sendBatch(params: {
    recipientMap: Record<
      string,
      Array<{
        recipientId: string;
        witnessData?: { amountSat: string; blinding?: number | null } | null;
        assignment: { Fungible: number };
        transportEndpoints: string[];
      }>
    >;
    donation: boolean;
    feeRate: number;
    minConfirmations: number;
  }): Promise<{ txid: string }>;
  sendBegin(params: {
    invoice: string;
    assetId: string;
    amount: number;
    donation: boolean;
    feeRate: number;
    minConfirmations: number;
    witnessData?: { amountSat: number; blinding?: number | null };
  }): Promise<string>;
  signPsbt(psbt: string): Promise<string>;
  sendEnd(params: { signedPsbt: string }): Promise<{ txid: string }>;
  listTransfers(
    assetId?: string
  ): Promise<
    Array<{ recipientId?: string; status?: string; txid?: string | null }>
  >;
  listUnspents(): Promise<
    Array<{
      utxo: { outpoint: { txid: string; vout: number } };
      rgbAllocations: Array<{ assetId?: string; settled: boolean }>;
      pendingBlinded: number;
    }>
  >;
};

export type JsonRpcLikeResponse<T = unknown> = {
  jsonrpc?: string;
  id?: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type WalletManagerCtor = new (params: {
  xpubVan: string;
  xpubCol: string;
  mnemonic: string;
  masterFingerprint: string;
  network: string;
  transportEndpoint: string;
  indexerUrl: string;
  dataDir: string;
}) => RegtestWallet;

export type GenerateKeysFn = (
  network: string
) => Promise<RegtestKeys> | RegtestKeys;

export function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getRegtestProxyHttpUrl(): string {
  return env('REGTEST_PROXY_HTTP_URL');
}

export function getRegtestProxyRpcUrl(): string {
  return env('REGTEST_PROXY_RPC_URL');
}

export function getRegtestIndexerUrl(): string {
  return env('REGTEST_INDEXER_URL');
}

export function getRegtestBaseDir(): string {
  return process.env.REGTEST_DATA_DIR || '/tmp/rgb-e2e';
}

export function getRegtestBitcoindContainer(): string | undefined {
  return process.env.REGTEST_BITCOIND_CONTAINER;
}

export function ensureBitcoindAccess(): void {
  if (process.env.REGTEST_BITCOIND_URL) {
    return;
  }
  if (process.env.REGTEST_BITCOIND_CONTAINER) {
    return;
  }
  throw new Error(
    'Missing bitcoind access: set REGTEST_BITCOIND_URL or REGTEST_BITCOIND_CONTAINER'
  );
}

export function ensureSafeBaseDir(baseDir = getRegtestBaseDir()): string {
  if (!baseDir || !path.isAbsolute(baseDir) || !baseDir.startsWith('/tmp/')) {
    throw new Error(
      `REGTEST_DATA_DIR must be an absolute path under /tmp/, got: ${baseDir}`
    );
  }
  fs.mkdirSync(baseDir, { recursive: true });
  return baseDir;
}

export function getWalletDataDir(
  name: 'sender' | 'receiver',
  baseDir = getRegtestBaseDir()
): string {
  return path.join(baseDir, name);
}

export function resetWalletDataDirs(baseDir = getRegtestBaseDir()): void {
  ensureSafeBaseDir(baseDir);
  fs.rmSync(getWalletDataDir('sender', baseDir), {
    recursive: true,
    force: true,
  });
  fs.rmSync(getWalletDataDir('receiver', baseDir), {
    recursive: true,
    force: true,
  });
}

export async function bitcoindRpc<T>(
  method: string,
  params: unknown[] = []
): Promise<T> {
  const bitcoindUser = env('REGTEST_BITCOIND_USER');
  const bitcoindPass = env('REGTEST_BITCOIND_PASS');
  const bitcoindUrl = process.env.REGTEST_BITCOIND_URL;

  if (!bitcoindUrl) {
    const container = env('REGTEST_BITCOIND_CONTAINER');
    const args = [
      'exec',
      container,
      'bitcoin-cli',
      '-regtest',
      `-rpcuser=${bitcoindUser}`,
      `-rpcpassword=${bitcoindPass}`,
      method,
      ...params.map((param) => String(param)),
    ];
    const stdout = execFileSync('docker', args, {
      encoding: 'utf8',
    }).trim();

    try {
      return JSON.parse(stdout) as T;
    } catch {
      return stdout as T;
    }
  }

  const response = await fetch(bitcoindUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${bitcoindUser}:${bitcoindPass}`).toString('base64')}`,
    },
    body: JSON.stringify({
      jsonrpc: '1.0',
      id: 'regtest-e2e',
      method,
      params,
    }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(`bitcoind ${method} failed: ${JSON.stringify(json.error)}`);
  }

  return json.result as T;
}

export async function mine(blocks = 1): Promise<string[]> {
  const address = await bitcoindRpc<string>('getnewaddress');
  return bitcoindRpc<string[]>('generatetoaddress', [blocks, address]);
}

export async function waitForBtcBalance(
  wallet: RegtestWallet,
  minSats = MIN_WALLET_BTC_SAT,
  timeoutMs = 15_000,
  intervalMs = 250
): Promise<{
  vanilla: { settled: number | string; spendable: number | string };
}> {
  return pollCondition(
    async () => {
      await wallet.refreshWallet();
      return wallet.getBtcBalance();
    },
    (balance) => Number(balance.vanilla.settled) >= minSats,
    timeoutMs,
    intervalMs,
    `Timed out waiting for BTC balance >= ${minSats}`
  );
}

export async function fundWallet(
  wallet: RegtestWallet
): Promise<{ address: string; createdUtxos: number }> {
  const address = await wallet.getAddress();
  await bitcoindRpc('sendtoaddress', [address, BTC_FUNDING_AMOUNT]);
  await mine(1);
  await waitForBtcBalance(wallet);

  const createdUtxos = await wallet.createUtxos({ ...UTXO_PROFILE });
  await mine(1);
  await waitForBtcBalance(wallet);
  await wallet.refreshWallet();

  return { address, createdUtxos };
}

export async function createRegtestWallet(
  ctor: WalletManagerCtor,
  generateKeys: GenerateKeysFn,
  name: 'sender' | 'receiver',
  baseDir = getRegtestBaseDir()
): Promise<{ wallet: RegtestWallet; keys: RegtestKeys }> {
  const keys = await generateKeys(REGTEST_NETWORK);
  const wallet = new ctor({
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    mnemonic: keys.mnemonic,
    masterFingerprint: keys.masterFingerprint,
    network: REGTEST_NETWORK,
    transportEndpoint: getRegtestProxyRpcUrl(),
    indexerUrl: getRegtestIndexerUrl(),
    dataDir: getWalletDataDir(name, baseDir),
  });

  await wallet.initialize();

  return { wallet, keys };
}

export async function createRegtestWalletFromKeys(
  ctor: WalletManagerCtor,
  keys: RegtestKeys,
  name: 'sender' | 'receiver',
  baseDir = getRegtestBaseDir()
): Promise<RegtestWallet> {
  const wallet = new ctor({
    xpubVan: keys.accountXpubVanilla,
    xpubCol: keys.accountXpubColored,
    mnemonic: keys.mnemonic,
    masterFingerprint: keys.masterFingerprint,
    network: REGTEST_NETWORK,
    transportEndpoint: getRegtestProxyRpcUrl(),
    indexerUrl: getRegtestIndexerUrl(),
    dataDir: getWalletDataDir(name, baseDir),
  });

  await wallet.initialize();

  return wallet;
}

export async function postConsignmentRaw<T = boolean>(params: {
  proxyHttpUrl?: string;
  recipientId: string;
  txid?: string;
  fileName?: string;
  content?: string;
  contentBytes?: Uint8Array;
}): Promise<JsonRpcLikeResponse<T>> {
  const form = new FormData();
  form.append('jsonrpc', '2.0');
  form.append('id', '1');
  form.append('method', 'consignment.post');
  form.append('params[recipient_id]', params.recipientId);
  form.append(
    'params[txid]',
    params.txid ??
      '0000000000000000000000000000000000000000000000000000000000000000'
  );
  form.append(
    'file',
    new Blob(
      [params.contentBytes ?? params.content ?? 'fake consignment payload'],
      {
        type: 'application/octet-stream',
      }
    ),
    params.fileName ?? 'bad.rgb'
  );

  const response = await fetch(
    params.proxyHttpUrl ?? getRegtestProxyHttpUrl(),
    {
      method: 'POST',
      body: form,
    }
  );

  return response.json();
}

export async function postFakeConsignment(params: {
  proxyHttpUrl?: string;
  recipientId: string;
  txid?: string;
  fileName?: string;
  content?: string;
}): Promise<boolean> {
  const json = await postConsignmentRaw<boolean>(params);
  if (json.error) {
    throw new Error(`consignment.post failed: ${JSON.stringify(json.error)}`);
  }

  return Boolean(json.result);
}
