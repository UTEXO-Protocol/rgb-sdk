/**
 * The local regtest stand (see README.md): esplora, RGB proxy 0.4.0+ and the
 * regtest helper. Funding and mining go through the helper from Node.
 */
const env = process.env;

export const STAND = Object.freeze({
  indexerUrl: env.RGB_E2E_INDEXER ?? 'http://127.0.0.1:8094/regtest/api',
  proxyEndpoint: env.RGB_E2E_PROXY ?? 'rpc://127.0.0.1:3002/json-rpc',
  helperUrl: env.RGB_E2E_HELPER ?? 'http://127.0.0.1:8080',
});

/** rgb-lib-wasm 1.0.0-beta.4 speaks proxy protocol 1.0 (proxy 0.4.0+). */
export const PROXY_PROTOCOL = '1.0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const r = await fetch(STAND.helperUrl + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok)
    throw new Error(`helper ${path} → HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function tipHeight() {
  const r = await fetch(`${STAND.indexerUrl}/blocks/tip/height`);
  const text = await r.text();
  return /^\d+$/.test(text) ? Number(text) : 0;
}

export async function waitForIndexer(height, timeoutMs = 60_000) {
  const t0 = Date.now();
  for (;;) {
    const h = await tipHeight().catch(() => 0);
    if (h >= height) return h;
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(`esplora stuck at ${h}, expected ${height}`);
    }
    await sleep(500);
  }
}

async function mempoolCount() {
  const r = await fetch(`${STAND.indexerUrl}/mempool`);
  return r.ok ? (await r.json()).count : 0;
}

/**
 * Mines and waits until esplora indexed the blocks, then mines again while
 * esplora still has unconfirmed transactions: a broadcast goes through
 * esplora's node and can reach the mining bitcoind after the block was made.
 */
export async function mine(blocks = 1, rounds = 5) {
  let height = 0;
  for (let i = 0; i < rounds; i++) {
    await sleep(i === 0 ? 1000 : 2000);
    ({ height } = await post('/mine', { blocks: i === 0 ? blocks : 1 }));
    await waitForIndexer(height);
    if ((await mempoolCount().catch(() => 0)) === 0) return height;
  }
  return height;
}

/** Send BTC to an address; the helper mines one block. */
export async function fund(address, amount = '1.0') {
  const { txid, height } = await post('/fund', { address, amount });
  await waitForIndexer(height);
  return txid;
}

/** Fails fast with a useful message when the stand is down or outdated. */
export async function checkStand() {
  await fetch(`${STAND.helperUrl}/status`).catch(() => {
    throw new Error(`regtest helper not reachable at ${STAND.helperUrl}`);
  });
  if ((await tipHeight().catch(() => 0)) < 101) {
    throw new Error(
      `esplora at ${STAND.indexerUrl} is down or below height 101 (mine 111 blocks first)`
    );
  }
  const proxyUrl = STAND.proxyEndpoint.replace(/^rpc:\/\//, 'http://');
  const info = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'server.info',
      params: null,
    }),
  })
    .then((r) => r.json())
    .catch(() => {
      throw new Error(`RGB proxy not reachable at ${proxyUrl}`);
    });
  const version = info?.result?.protocol_version;
  if (version !== PROXY_PROTOCOL) {
    throw new Error(
      `RGB proxy at ${proxyUrl} speaks protocol ${version}; rgb-lib-wasm needs ${PROXY_PROTOCOL} ` +
        '(ghcr.io/rgb-tools/rgb-proxy-server:0.4.0 or newer)'
    );
  }
}

/** Mines until esplora reports `txid` confirmed (a broadcast may lag). */
export async function confirm(txid, rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await mine(1);
    const status = await fetch(`${STAND.indexerUrl}/tx/${txid}/status`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (status?.confirmed) return status.block_height;
  }
  throw new Error(`${txid} not confirmed after ${rounds} blocks`);
}
