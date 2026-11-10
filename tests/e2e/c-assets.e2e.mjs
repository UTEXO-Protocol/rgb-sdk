/**
 * Scenario C — assets in one wallet: issue NIA and IFA, list them, balances,
 * receive invoices (witness and blinded), decode, transfers, inflation.
 * Ported from rgb-sdk-web (tests/e2e/c-assets.spec.ts, first two tests).
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
  bootWallet,
  fundAndCreateUtxos,
  settle,
  wcall,
  wcallError,
  wirePageLogging,
} from './client.mjs';
import { TRANSFER_FIELDS } from './vocab.mjs';

test('C: issue NIA, balances, onchainReceive (witness + blinded), decode, transfers', async ({
  page,
}) => {
  wirePageLogging(page);
  await bootWallet(page);
  await fundAndCreateUtxos(page);

  const issued = await wcall(page, 'issueAssetNia', {
    ticker: 'E2ET',
    name: 'E2E Test Asset',
    precision: 0,
    amounts: [1000],
  });
  report('issueAssetNia', issued);
  expectFields(issued, {
    'assetId': { type: 'string', pattern: /^rgb:/ },
    'ticker': { oneOf: ['E2ET'] },
    'name': { oneOf: ['E2E Test Asset'] },
    'precision': { oneOf: [0] },
    'issuedSupply': { type: 'number', min: 1000, max: 1000 },
    'balance.settled': { type: 'number', min: 1000, max: 1000 },
    'balance.future': { type: 'number', min: 1000, max: 1000 },
    'balance.spendable': { type: 'number', min: 1000, max: 1000 },
  });
  expectNoWireKeys(issued);
  const { assetId } = issued;

  const assets = await wcall(page, 'listAssets');
  expect((assets.nia ?? []).some((a) => a.assetId === assetId)).toBe(true);
  const filtered = await wcall(page, 'listAssets', {
    filterAssetSchemas: ['Ifa'],
  });
  expect((filtered.nia ?? []).length).toBe(0);

  const balance = await wcall(page, 'getAssetBalance', assetId);
  expectFields(balance, {
    settled: { type: 'number', min: 1000, max: 1000 },
    future: { type: 'number', min: 1000, max: 1000 },
    spendable: { type: 'number', min: 1000, max: 1000 },
  });

  const missing = await wcallError(
    page,
    'getAssetBalance',
    'rgb:unknown-asset-id'
  );
  expect(missing.code).toBe('ASSET_NOT_FOUND');

  const receives = {};
  for (const witness of [true, false]) {
    const receive = await wcall(page, 'onchainReceive', {
      assetId,
      amount: 1,
      minConfirmations: 1,
      durationSeconds: 3600,
      witness,
    });
    report(`onchainReceive — ${witness ? 'witness' : 'blinded'}`, receive);
    expectFields(receive, {
      invoice: { type: 'string', nonEmpty: true },
      recipientId: { type: 'string', nonEmpty: true },
      batchTransferIdx: { type: 'number' },
      expirationTimestamp: {
        type: 'number',
        min: Math.floor(Date.now() / 1000),
      },
    });
    expectNoWireKeys(receive);
    expect(receive.recipientId).toContain(witness ? 'wvout:' : 'utxob:');

    const decoded = await wcall(page, 'decodeRGBInvoice', {
      invoice: receive.invoice,
    });
    report('decodeRGBInvoice', decoded);
    expectFields(decoded, {
      recipientId: { type: 'string', nonEmpty: true },
      assetId: { type: 'string' },
      network: { oneOf: ['regtest'] },
      transportEndpoints: { type: 'array', nonEmpty: true },
    });
    expect(decoded.assetId).toBe(assetId);
    expect(decoded.recipientId).toBe(receive.recipientId);
    expectNoWireKeys(decoded);
    receives[witness ? 'witness' : 'blind'] = receive;
  }
  expect(receives.witness.recipientId).not.toBe(receives.blind.recipientId);

  const transfers = await wcall(page, 'listTransfers', assetId);
  report('listTransfers', transfers);
  expectEach(transfers, TRANSFER_FIELDS);
  for (const t of transfers) expectNoWireKeys(t);
  expect(transfers.map((t) => t.kind).sort()).toEqual(
    ['Issuance', 'ReceiveBlind', 'ReceiveWitness'].sort()
  );
  expect(transfers.find((t) => t.kind === 'Issuance').status).toBe('Settled');
  for (const kind of ['ReceiveBlind', 'ReceiveWitness']) {
    expect(transfers.find((t) => t.kind === kind).status).toBe(
      'WaitingCounterparty'
    );
  }

  // Both receives can be failed: nobody has paid them.
  expect(
    await wcall(page, 'failTransfers', {
      batchTransferIdx: receives.blind.batchTransferIdx,
    })
  ).toBe(true);
  const failed = (await wcall(page, 'listTransfers', assetId)).find(
    (t) => t.batchTransferIdx === receives.blind.batchTransferIdx
  );
  expect(failed.status).toBe('Failed');
});

test('C: issueAssetIfa issues a real IFA, listed, and inflate mints more', async ({
  page,
}) => {
  wirePageLogging(page);
  await bootWallet(page);
  await fundAndCreateUtxos(page);

  const issued = await wcall(page, 'issueAssetIfa', {
    ticker: 'E2EI',
    name: 'E2E Inflatable',
    precision: 0,
    amounts: [500],
    inflationAmounts: [500],
    rejectListUrl: null,
  });
  report('issueAssetIfa', issued);
  expectFields(issued, {
    assetId: { type: 'string', pattern: /^rgb:/ },
    ticker: { oneOf: ['E2EI'] },
    name: { oneOf: ['E2E Inflatable'] },
    precision: { oneOf: [0] },
    initialSupply: { type: 'number', min: 500, max: 500 },
    maxSupply: { type: 'number', min: 1000, max: 1000 },
    knownCirculatingSupply: { type: 'number', min: 500, max: 500 },
  });
  expectNoWireKeys(issued);
  const { assetId } = issued;

  // rgb-sdk-web has this as test.fixme (upstream gap); it works here.
  const assets = await wcall(page, 'listAssets');
  report('listAssets (ifa)', assets.ifa);
  expect((assets.ifa ?? []).some((a) => a.assetId === assetId)).toBe(true);

  const inflated = await wcall(page, 'inflate', {
    assetId,
    inflationAmounts: [200],
    feeRate: 2,
  });
  report('inflate', inflated);
  expectFields(inflated, {
    txid: { type: 'string', pattern: HEX_32 },
    batchTransferIdx: { type: 'number' },
  });
  expectNoWireKeys(inflated);
  // Right after the inflation tx confirms, one refresh can still leave it
  // WaitingConfirmations (the rgb-lib Rust test accepts `future` too), so
  // mine and refresh until it settles.
  await settle([page], async () =>
    (await wcall(page, 'listTransfers', assetId)).some(
      (t) => t.kind === 'Inflation' && t.status === 'Settled'
    )
  );
  expect((await wcall(page, 'getAssetBalance', assetId)).settled).toBe(700);
  const transfers = await wcall(page, 'listTransfers', assetId);
  report('listTransfers (ifa)', transfers);
  const inflation = transfers.find((t) => t.kind === 'Inflation');
  expect(inflation?.status).toBe('Settled');
  expect(inflation?.txid).toBe(inflated.txid);

  // Only 300 inflation rights remain.
  const tooMuch = await wcallError(page, 'inflate', {
    assetId,
    inflationAmounts: [301],
    feeRate: 2,
  });
  report('inflate beyond rights', tooMuch.detail);
  expect(tooMuch.operation).toBe('inflate');
});

test('C: issuing without colorable UTXOs is a clear error', async ({
  page,
}) => {
  wirePageLogging(page);
  await bootWallet(page);
  const error = await wcallError(page, 'issueAssetNia', {
    ticker: 'NOPE',
    name: 'No UTXOs',
    precision: 0,
    amounts: [1],
  });
  report('issueAssetNia without UTXOs', error.detail);
  expect(error.operation).toBe('issueAssetNia');
  expect(error.code).toBe('INSUFFICIENT_FUNDS');
});
