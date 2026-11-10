/**
 * Scenario A — lifecycle: init → unlock → network info → identity →
 * capabilities → destroy, every field named. Ported from rgb-sdk-web
 * (tests/e2e/a-lifecycle.spec.ts) without the Lightning node.
 */
import { test, expect } from '@playwright/test';
import {
  report,
  expectFields,
  expectNoWireKeys,
  HEX_32,
} from '@utexo/rgb-sdk-core/conformance';
import {
  bootWallet,
  wcall,
  wcallError,
  wget,
  wirePageLogging,
} from './client.mjs';

test('A: lifecycle, network info, identity, capabilities, destroy', async ({
  page,
}) => {
  wirePageLogging(page);
  const boot = await bootWallet(page);
  expect(boot.mnemonic.split(' ').length).toBeGreaterThanOrEqual(12);

  expect(await wcall(page, 'getNetwork')).toBe('regtest');

  const caps = await wget(page, 'capabilities');
  report('capabilities', caps);
  // The WASM adapter has neither the psbt nor the beginEnd carrier.
  expect(caps).toEqual({
    psbtSigning: false,
    beginEndFlows: false,
    canSignTransactions: true,
  });

  const net = await wcall(page, 'getNetworkInfo');
  report('getNetworkInfo', net);
  expectFields(net, {
    network: { oneOf: ['regtest'] },
    // Optional in the contract. rgb-lib-rn reads it from the native wallet;
    // rgb-lib-wasm has no source for it, so RgbLibWeb leaves it out.
    blockHeight: { type: 'number', min: 101, optional: true },
  });
  expectNoWireKeys(net);

  const id = await wcall(page, 'getWalletIdentity');
  report('getWalletIdentity', id);
  expectFields(id, {
    id: { type: 'string', pattern: HEX_32 },
    protocol: { oneOf: ['RGB_L1'] },
    network: { oneOf: ['regtest'] },
  });
  // The identity is derived from the keys: stable for the same wallet.
  expect((await wcall(page, 'getWalletIdentity')).id).toBe(id.id);

  expect(await wcall(page, 'isDisposed')).toBe(false);
  await wcall(page, 'destroy');
  expect(await wcall(page, 'isDisposed')).toBe(true);
  const after = await wcallError(page, 'getAddress');
  expect(after.code).toBe('WALLET_DISPOSED');
});

test('A: the same mnemonic gives the same identity in another wallet', async ({
  page,
}) => {
  wirePageLogging(page);
  const first = await bootWallet(page, { unlock: false });
  const id = (await wcall(page, 'getWalletIdentity')).id;
  await wcall(page, 'destroy');
  await bootWallet(page, { unlock: false, mnemonic: first.mnemonic });
  expect((await wcall(page, 'getWalletIdentity')).id).toBe(id);
});
