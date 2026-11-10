/* global document, window */
/**
 * E2E harness page: the BUILT facade (`lib/`) and the RgbLibWeb adapter over
 * the real `@utexo/rgb-lib-wasm`, exposed on `window.harness`.
 *
 *   boot(cfgJson)        — init wasm → new RgbLibWeb → UTEXOWallet → init → unlock
 *   call(method, args)   — call a wallet method
 *   get(property)        — read a wallet property ('capabilities')
 *
 * Results cross the page boundary as JSON `{ ok, value | error }`; an error
 * keeps `code` and `operation`, so specs can assert engine error codes.
 */
import init, * as rgbLibWasm from '@utexo/rgb-lib-wasm';
import { UTEXOWallet } from '../../../lib/index.js';
import { RgbLibWeb } from '../../../lib/adapters/rgb-lib-wasm/index.js';

let wallet = null;
let wasmReady = null;
const statusEl = document.getElementById('status');

const enc = (v) =>
  JSON.stringify(v ?? null, (_k, x) =>
    typeof x === 'bigint' ? x.toString() : x
  );

async function run(fn) {
  try {
    return enc({ ok: true, value: await fn() });
  } catch (e) {
    return enc({
      ok: false,
      error: {
        name: e?.name,
        code: e?.code,
        operation: e?.operation,
        message: e?.message ?? String(e),
        cause: e?.cause?.message,
      },
    });
  }
}

function live() {
  if (!wallet) throw new Error('harness.boot() first');
  return wallet;
}

window.harness = {
  ready: false,

  /**
   * cfg: { indexerUrl, proxyEndpoint, mnemonic?, dataDir?, unlock? }.
   * A fresh dataDir per boot unless the spec passes one (persistence specs).
   */
  boot: (cfgJson) =>
    run(async () => {
      const cfg = JSON.parse(cfgJson);
      wasmReady ??= init({ module_or_path: './rgb_lib_wasm_bindings_bg.wasm' });
      await wasmReady;
      const mnemonic =
        cfg.mnemonic ?? rgbLibWasm.generateKeys('regtest').mnemonic;
      const dataDir = cfg.dataDir ?? `e2e-${Date.now().toString(16)}`;
      const engine = new RgbLibWeb(
        { network: 'regtest', dataDir },
        mnemonic,
        rgbLibWasm
      );
      wallet = new UTEXOWallet({ engine });
      await wallet.init();
      if (cfg.unlock !== false) {
        await wallet.unlock({
          indexerUrl: cfg.indexerUrl,
          proxyEndpoint: cfg.proxyEndpoint,
        });
      }
      statusEl.textContent = `wallet booted (${dataDir})`;
      return { mnemonic, dataDir };
    }),

  call: (method, argsJson) =>
    run(async () => {
      const w = live();
      const fn = w[method];
      if (typeof fn !== 'function') {
        throw new Error(`harness.call: ${method} is not a wallet method`);
      }
      return await fn.apply(w, JSON.parse(argsJson));
    }),

  get: (property) => run(() => live()[property]),
};

window.harness.ready = true;
statusEl.textContent = 'harness ready';
