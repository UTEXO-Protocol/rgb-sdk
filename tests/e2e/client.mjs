// `window` appears only inside page.evaluate callbacks, which run in the page.
/* global window */
/** Spec-side driver for the harness page (harness/main.mjs). */
import { STAND, fund, mine } from './stand.mjs';

/** A wallet error that crossed the page boundary; keeps code and operation. */
export class PageError extends Error {
  constructor(what, error) {
    super(`${what}: ${error.code ?? error.name}: ${error.message}`);
    this.code = error.code;
    this.operation = error.operation;
    this.detail = error;
  }
}

function unwrap(json, what) {
  const env = JSON.parse(json);
  if (!env.ok) throw new PageError(what, env.error);
  return env.value;
}

/** Pipe page errors and warnings into the test output. */
export function wirePageLogging(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[page:error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.log(`[pageerror] ${err.message}`));
}

/**
 * Opens the harness and boots a wallet: init, then unlock against the stand
 * unless `unlock: false`. Pass `mnemonic` and `dataDir` to reopen a wallet.
 */
export async function bootWallet(page, opts = {}) {
  await page.goto('/');
  await page.waitForFunction(() => window.harness?.ready === true, undefined, {
    timeout: 60_000,
  });
  const cfg = {
    indexerUrl: STAND.indexerUrl,
    proxyEndpoint: STAND.proxyEndpoint,
    ...opts,
  };
  const res = await page.evaluate(
    (c) => window.harness.boot(c),
    JSON.stringify(cfg)
  );
  return unwrap(res, 'boot');
}

/** Calls a wallet method in the page. */
export async function wcall(page, method, ...args) {
  const res = await page.evaluate(
    ([m, a]) => window.harness.call(m, a),
    [method, JSON.stringify(args)]
  );
  return unwrap(res, method);
}

/** Calls a wallet method that must reject; returns the error. */
export async function wcallError(page, method, ...args) {
  try {
    const value = await wcall(page, method, ...args);
    throw new Error(
      `${method} resolved, expected a rejection: ${JSON.stringify(value)}`
    );
  } catch (e) {
    if (e instanceof PageError) return e;
    throw e;
  }
}

/** Reads a wallet property in the page. */
export async function wget(page, property) {
  const res = await page.evaluate((p) => window.harness.get(p), property);
  return unwrap(res, property);
}

/** Funds the wallet with 1 BTC and creates `num` colorable UTXOs, confirmed. */
export async function fundAndCreateUtxos(page, num = 5) {
  await fund(await wcall(page, 'getAddress'));
  const created = await wcall(page, 'createUtxos', { num, feeRate: 2 });
  await mine(1);
  return created;
}

/**
 * Mines and refreshes the given wallets until `done()` returns a truthy value.
 * A transfer needs a receiver refresh, a sender refresh and confirmations.
 */
export async function settle(pages, done, rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await mine(1);
    for (const page of pages) await wcall(page, 'refresh');
    const value = await done();
    if (value) return value;
  }
  throw new Error(`not settled after ${rounds} rounds`);
}
