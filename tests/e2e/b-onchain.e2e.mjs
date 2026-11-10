/**
 * Scenario B — on-chain: address → funding → balance → createUtxos →
 * listUnspents with parsed outpoints → listTransactions. Ported from
 * rgb-sdk-web (tests/e2e/b-onchain.spec.ts), plus sendBtc and fee estimation.
 */
import { test, expect } from '@playwright/test';
import {
  report,
  expectFields,
  expectEach,
  expectNoWireKeys,
  HEX_32,
} from '@utexo/rgb-sdk-core/conformance';
import {
  PageError,
  bootWallet,
  wcall,
  wcallError,
  wirePageLogging,
} from './client.mjs';
import { confirm, fund, mine } from './stand.mjs';

const side = { type: 'number', min: 0 };
const BALANCE = {
  'vanilla.settled': side,
  'vanilla.future': side,
  'vanilla.spendable': side,
  'colored.settled': side,
  'colored.future': side,
  'colored.spendable': side,
};

test('B: address, funding, balance, UTXOs, unspents, transactions', async ({
  page,
}) => {
  wirePageLogging(page);
  await bootWallet(page);

  const address = await wcall(page, 'getAddress');
  report('getAddress', address);
  expect(address.startsWith('bcrt1p'), `regtest taproot, got ${address}`).toBe(
    true
  );
  expect(await wcall(page, 'getAddress')).not.toBe(address);

  const before = await wcall(page, 'getBtcBalance');
  expectFields(before, BALANCE);
  expectNoWireKeys(before);
  expect(before.vanilla.settled).toBe(0);

  await fund(address);
  const after = await wcall(page, 'getBtcBalance');
  report('getBtcBalance (after funding)', after);
  expectFields(after, BALANCE);
  expect(after.vanilla.settled).toBe(100_000_000);

  // skipSync reads the stored state without touching the indexer.
  expect(
    (await wcall(page, 'getBtcBalance', { skipSync: true })).vanilla.settled
  ).toBe(100_000_000);

  const created = await wcall(page, 'createUtxos', {
    num: 5,
    size: 1000,
    feeRate: 2,
  });
  report('createUtxos', created);
  expect(created).toBe(5);
  await mine(1);

  const unspents = await wcall(page, 'listUnspents');
  report('listUnspents (count)', unspents.length);
  expectEach(unspents, {
    'utxo.outpoint.txid': { type: 'string', pattern: HEX_32 },
    'utxo.outpoint.vout': { type: 'number', min: 0 },
    'utxo.btcAmount': { type: 'number', min: 0 },
    'utxo.colorable': { type: 'boolean' },
    'rgbAllocations': { type: 'array' },
  });
  for (const u of unspents) expectNoWireKeys(u);
  const colorable = unspents.filter((u) => u.utxo.colorable);
  expect(colorable.length).toBe(5);
  expect(colorable.every((u) => u.utxo.btcAmount === 1000)).toBe(true);

  const txs = await wcall(page, 'listTransactions');
  report('listTransactions', txs);
  expectEach(txs, {
    transactionType: { type: 'string', nonEmpty: true },
    txid: { type: 'string', pattern: HEX_32 },
    received: { type: 'number', min: 0 },
    sent: { type: 'number', min: 0 },
    fee: { type: 'number', min: 0 },
  });
  for (const t of txs) expectNoWireKeys(t);
  expect(txs.length).toBe(2);
});

test('B: sendBtc pays another wallet', async ({ browser }) => {
  const senderCtx = await browser.newContext();
  const receiverCtx = await browser.newContext();
  const sender = await senderCtx.newPage();
  const receiver = await receiverCtx.newPage();
  try {
    wirePageLogging(sender);
    wirePageLogging(receiver);
    await bootWallet(sender);
    await bootWallet(receiver);
    await fund(await wcall(sender, 'getAddress'));

    const txid = await wcall(sender, 'sendBtc', {
      address: await wcall(receiver, 'getAddress'),
      amount: 10_000,
      feeRate: 2,
    });
    report('sendBtc', txid);
    expect(txid).toMatch(HEX_32);

    const pending = await wcall(receiver, 'getBtcBalance');
    expect(pending.vanilla.future).toBe(10_000);
    await confirm(txid);
    const settled = await wcall(receiver, 'getBtcBalance');
    expect(settled.vanilla.settled).toBe(10_000);

    const spent = await wcall(sender, 'getBtcBalance');
    expect(spent.vanilla.settled).toBeLessThan(100_000_000 - 10_000);
  } finally {
    await senderCtx.close();
    await receiverCtx.close();
  }
});

test('B: estimateFeeRate on regtest', async ({ page }) => {
  wirePageLogging(page);
  await bootWallet(page);
  // Esplora has fee data only after regtest blocks carried transactions; on a
  // fresh chain `/fee-estimates` is `{}` and rgb-lib rejects.
  let result;
  try {
    result = await wcall(page, 'estimateFeeRate', 1);
  } catch (e) {
    result = e;
  }
  report('estimateFeeRate', result.detail ?? result);
  if (result instanceof PageError) {
    expect(result.code).toBe('NATIVE_ERROR');
    expect(result.operation).toBe('estimateFeeRate');
    expect(result.detail.message).toMatch(/Cannot estimate fees/);
  } else {
    expectFields(result, { feeRate: { type: 'number', min: 1 } });
    expectNoWireKeys(result);
  }
  // Same code as rgb-lib-rn: its integer() check reports INVALID_CONFIG.
  expect((await wcallError(page, 'estimateFeeRate', 0)).code).toBe(
    'INVALID_CONFIG'
  );
});
