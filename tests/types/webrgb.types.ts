// Type tests for ./webrgb: checked by `npm run typecheck`, never run.
import type { RgbInfo } from '@utexo/webrgb';
import type {
  BurnApi,
  ConsignmentApi,
  SharedWalletApi,
  WalletProtocol,
} from '@utexo/rgb-sdk-core';
import { UTEXOWallet } from '../../src/index.js';
import { BurnOperations, WebRgbProvider } from '../../src/webrgb/index.js';

// The facade's protocol vocabulary is WebRGB's.
const protocol: WalletProtocol = 'RGB_L1';
const webRgbProtocol: RgbInfo['protocol'] = protocol;
void webRgbProtocol;

declare const burnEngine: SharedWalletApi<void> & BurnApi & ConsignmentApi;
declare const bareEngine: SharedWalletApi<void>;
const options = { origin: 'https://example.com', confirm: async () => true };

// Over a facade, and over an engine directly.
const wallet = new UTEXOWallet({ engine: burnEngine });
new WebRgbProvider(wallet, {
  ...options,
  burn: { operations: new BurnOperations(wallet, null!) },
});
new WebRgbProvider(burnEngine, options);
// Read-only WebRGB needs no burn extension.
new WebRgbProvider(new UTEXOWallet({ engine: bareEngine }), options);
// @ts-expect-error BurnOperations needs burn()
new BurnOperations(new UTEXOWallet({ engine: bareEngine }), null!);
