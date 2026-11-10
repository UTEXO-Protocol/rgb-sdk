/**
 * Scenario E — persistence in the browser: the wallet state lives in
 * IndexedDB under (dataDir, fingerprint, network). Reopening the same wallet
 * in the same browser profile sees its assets and UTXOs; the same mnemonic in
 * an empty profile does not (restoring that needs a backup, which the WASM
 * adapter does not implement yet).
 */
import { test, expect } from '@playwright/test';
import { report } from '@utexo/rgb-sdk-core/conformance';
import {
  bootWallet,
  fundAndCreateUtxos,
  wcall,
  wirePageLogging,
} from './client.mjs';

test('E: state survives destroy and a page reload; an empty profile starts empty', async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const fresh = await browser.newContext();
  try {
    const page = await ctx.newPage();
    wirePageLogging(page);
    const boot = await bootWallet(page);
    await fundAndCreateUtxos(page, 3);
    const { assetId } = await wcall(page, 'issueAssetNia', {
      ticker: 'E2EP',
      name: 'E2E Persisted',
      precision: 0,
      amounts: [42],
    });
    const lastAddress = await wcall(page, 'getAddress');
    await wcall(page, 'destroy');

    // Same profile: reload the page, open the same wallet.
    await page.reload();
    await bootWallet(page, {
      mnemonic: boot.mnemonic,
      dataDir: boot.dataDir,
      unlock: false,
    });
    const assets = await wcall(page, 'listAssets');
    report('reopened: listAssets', assets);
    expect((assets.nia ?? []).map((a) => a.assetId)).toContain(assetId);
    expect((await wcall(page, 'getAssetBalance', assetId)).settled).toBe(42);
    const unspents = await wcall(page, 'listUnspents', { skipSync: true });
    expect(
      unspents.filter((u) => u.utxo.colorable).length
    ).toBeGreaterThanOrEqual(3);
    // The address index was persisted too: no address is handed out twice.
    expect(await wcall(page, 'getAddress')).not.toBe(lastAddress);
    await wcall(page, 'destroy');

    // Empty profile, same mnemonic and dataDir: nothing local to read.
    const other = await fresh.newPage();
    wirePageLogging(other);
    await bootWallet(other, {
      mnemonic: boot.mnemonic,
      dataDir: boot.dataDir,
      unlock: false,
    });
    const empty = await wcall(other, 'listAssets');
    report('empty profile: listAssets', empty);
    expect((empty.nia ?? []).length).toBe(0);
  } finally {
    await ctx.close();
    await fresh.close();
  }
});
