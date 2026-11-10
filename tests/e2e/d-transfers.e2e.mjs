/**
 * Scenario D — asset transfers between two wallets in two browser contexts:
 * onchainSend to blinded, witness and donation invoices, each settled on both
 * sides; then the input checks. Ported from rgb-sdk-web
 * (tests/e2e/c-assets.spec.ts, onchainSend tests) with a wasm counterparty
 * instead of the native Faucet node.
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

const SEND_AMOUNT = 5;

async function twoWallets(browser) {
  const contexts = [await browser.newContext(), await browser.newContext()];
  const [sender, receiver] = await Promise.all(
    contexts.map((c) => c.newPage())
  );
  wirePageLogging(sender);
  wirePageLogging(receiver);
  await bootWallet(sender);
  await bootWallet(receiver);
  return {
    sender,
    receiver,
    close: () => Promise.all(contexts.map((c) => c.close())),
  };
}

test('D: onchainSend pays blinded, witness and donation invoices', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const { sender, receiver, close } = await twoWallets(browser);
  try {
    await fundAndCreateUtxos(sender, 8);
    await fundAndCreateUtxos(receiver, 8);
    const { assetId } = await wcall(sender, 'issueAssetNia', {
      ticker: 'E2ES',
      name: 'E2E Send Asset',
      precision: 0,
      amounts: [1000],
    });

    const variations = [
      { label: 'blinded', witness: false, donation: false },
      { label: 'witness', witness: true, donation: false },
      { label: 'donation', witness: false, donation: true },
    ];
    let paid = 0;
    for (const v of variations) {
      // The receiver does not know the asset yet, so the invoice is blank and
      // the sender names the asset (rgb-lib refuses an unknown assetId).
      const inv = await wcall(receiver, 'onchainReceive', {
        minConfirmations: 1,
        durationSeconds: 3600,
        witness: v.witness,
      });
      report(`receiver: onchainReceive — ${v.label}`, inv);

      const sent = await wcall(sender, 'onchainSend', {
        invoice: inv.invoice,
        assetId,
        amount: SEND_AMOUNT,
        feeRate: 2,
        donation: v.donation,
        ...(v.witness ? { witnessData: { amountSat: 1000 } } : {}),
      });
      report(`sender: onchainSend — ${v.label}`, sent);
      expectFields(sent, {
        txid: { type: 'string', pattern: HEX_32 },
        batchTransferIdx: { type: 'number' },
      });
      expectNoWireKeys(sent);
      paid += SEND_AMOUNT;

      await settle([receiver, sender], async () => {
        const ts = await wcall(sender, 'listTransfers', assetId);
        const out = ts.find((t) => t.txid === sent.txid);
        const rs = await wcall(receiver, 'listTransfers', assetId).catch(
          () => []
        );
        const recv = rs.find((t) => t.recipientId === inv.recipientId);
        return out?.status === 'Settled' && recv?.status === 'Settled';
      });

      const recvBalance = await wcall(receiver, 'getAssetBalance', assetId);
      report(`receiver: balance after ${v.label}`, recvBalance);
      expect(recvBalance.settled).toBe(paid);
      expect((await wcall(sender, 'getAssetBalance', assetId)).settled).toBe(
        1000 - paid
      );
    }

    const senderTransfers = await wcall(sender, 'listTransfers', assetId);
    expectEach(senderTransfers, TRANSFER_FIELDS);
    expect(senderTransfers.filter((t) => t.kind === 'Send').length).toBe(3);
    const receiverTransfers = await wcall(receiver, 'listTransfers', assetId);
    report('receiver: listTransfers', receiverTransfers);
    expectEach(receiverTransfers, TRANSFER_FIELDS);
    expect(
      receiverTransfers.filter((t) => t.kind === 'ReceiveBlind').length
    ).toBe(2);
    expect(
      receiverTransfers.filter((t) => t.kind === 'ReceiveWitness').length
    ).toBe(1);

    // Now the receiver knows the asset and can name it in an invoice.
    const named = await wcall(receiver, 'witnessReceive', {
      assetId,
      amount: 7,
    });
    const decoded = await wcall(sender, 'decodeRGBInvoice', {
      invoice: named.invoice,
    });
    expect(decoded.assetId).toBe(assetId);
    expect(decoded.assignment).toMatchObject({ type: 'Fungible', amount: 7 });
  } finally {
    await close();
  }
});

test('D: onchainSend rejects a blank invoice with no assetId and a witness invoice with no witnessData', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { sender, receiver, close } = await twoWallets(browser);
  try {
    await fundAndCreateUtxos(receiver, 4);
    await fundAndCreateUtxos(sender, 4);
    const { assetId } = await wcall(sender, 'issueAssetNia', {
      ticker: 'E2ER',
      name: 'E2E Reject',
      precision: 0,
      amounts: [100],
    });

    const blinded = await wcall(receiver, 'onchainReceive', {
      durationSeconds: 3600,
      witness: false,
    });
    expect(blinded.recipientId).toContain('utxob:');
    const noAsset = await wcallError(sender, 'onchainSend', {
      invoice: blinded.invoice,
      amount: SEND_AMOUNT,
      feeRate: 2,
    });
    report('blank invoice, no assetId', noAsset.detail);
    expect(noAsset.code).toBe('INVALID_PARAMS');
    expect(noAsset.detail.message).toMatch(/asset/i);

    const witness = await wcall(receiver, 'onchainReceive', {
      durationSeconds: 3600,
      witness: true,
    });
    expect(witness.recipientId).toContain('wvout:');
    const noWitnessData = await wcallError(sender, 'onchainSend', {
      invoice: witness.invoice,
      assetId,
      amount: SEND_AMOUNT,
      feeRate: 2,
    });
    report('witness invoice, no witnessData', noWitnessData.detail);
    expect(noWitnessData.operation).toBe('onchainSend');

    // Nothing was sent: the whole supply is still with the issuer.
    expect((await wcall(sender, 'getAssetBalance', assetId)).settled).toBe(100);
  } finally {
    await close();
  }
});
