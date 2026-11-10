// Type tests: checked by `npm run typecheck`, never run.
import type * as RgbLibWasm from '@utexo/rgb-lib-wasm';
import { UTEXOWallet } from '../../src/index.js';
import { RgbLibWeb } from '../../src/adapters/rgb-lib-wasm/index.js';
import type { RgbLibWasmRuntime } from '../../src/adapters/rgb-lib-wasm/index.js';

// The real module matches the shape the adapter calls.
declare const runtime: typeof RgbLibWasm;
const asRuntime: RgbLibWasmRuntime = runtime;

const engine = new RgbLibWeb({ network: 'utexo' }, 'mnemonic', asRuntime);
const wallet = new UTEXOWallet({ engine });
void wallet.unlock({ indexerUrl: 'https://esplora.example' });

// @ts-expect-error watch-only keys need all three public keys
new RgbLibWeb({ network: 'regtest' }, { accountXpubVanilla: 'tpub' }, runtime);
