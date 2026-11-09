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
const burn = { operations: new BurnOperations(burnEngine, null!) };
const options = {
  origin: 'https://example.com',
  confirm: async () => true,
  burn,
};

// Over a facade, and over an engine directly.
new WebRgbProvider(new UTEXOWallet({ engine: burnEngine }), options);
new WebRgbProvider(burnEngine, options);
// Burn is a regular method: a wallet without burn() is not a WebRGB wallet.
// @ts-expect-error WebRgbWallet needs burn() and getConsignment()
new WebRgbProvider(new UTEXOWallet({ engine: bareEngine }), options);
// @ts-expect-error burn options are required
new WebRgbProvider(burnEngine, {
  origin: options.origin,
  confirm: options.confirm,
});
// @ts-expect-error BurnOperations needs burn()
new BurnOperations(new UTEXOWallet({ engine: bareEngine }), null!);
