import {
  createBaseReport,
  createPreflightState,
  disposeSignetPreflight,
  finalizeTransferSnapshot,
  maybeSkipOrFail,
  PROXY_HTTP_URL,
  setupSignetPreflight,
  SMOKE_FEE_RATE,
  TRANSFER_AMOUNT,
} from './fixture';
import {
  pollAck,
  pollCondition,
  pollValidated,
  writeSmokeReport,
} from '../shared/helpers';

type TwoRefreshReport = ReturnType<typeof createBaseReport> & {
  phase1: ReturnType<typeof createBaseReport>['phase1'] & {
    senderTransferStatusBeforeReceiverRefresh?: string;
    receiverTransferStatusBeforeRefresh?: string;
    receiverSettledWhileOffline?: number;
  };
  phase2: ReturnType<typeof createBaseReport>['phase2'] & {
    delayedRefreshChecks: Array<{
      cycle: number;
      settled: number;
      currentTransferStatus?: string;
      currentTransferTxid?: string | null;
    }>;
  };
};

const state = createPreflightState();

beforeAll(async () => {
  await setupSignetPreflight(state);
});

afterAll(async () => {
  await disposeSignetPreflight(state);
});

describe('Signet offline receiver two-refresh convergence', () => {
  it('keeps receiver offline until sender settles, then reaches WaitingConfirmations and Settled in two refreshes', async () => {
    if (state.skipReason) {
      maybeSkipOrFail(state.skipReason);
      return;
    }

    const sender = state.sender!;
    const receiver = state.receiver!;
    const assetId = state.assetId;
    const receiverSettledBefore = Number(
      state.receiverBalanceBefore?.settled ?? 0
    );
    const startedAt = Date.now();
    const report = createBaseReport(state) as TwoRefreshReport;
    report.phase2.delayedRefreshChecks = [];

    try {
      const invoiceData = await receiver.blindReceive({
        amount: TRANSFER_AMOUNT,
        minConfirmations: 1,
      });
      report.phase1.invoice = invoiceData.invoice;
      report.phase1.recipientId = invoiceData.recipientId;

      const sendResult = await sender.send({
        invoice: invoiceData.invoice,
        assetId,
        amount: TRANSFER_AMOUNT,
        donation: true,
        feeRate: SMOKE_FEE_RATE,
        minConfirmations: 1,
      });
      report.phase1.txid = sendResult.txid;

      const ackStartedAt = Date.now();
      const ack = await pollAck(PROXY_HTTP_URL, invoiceData.recipientId);
      report.phase1.pollAckMs = Date.now() - ackStartedAt;

      const validated = await pollValidated(
        PROXY_HTTP_URL,
        invoiceData.recipientId
      );
      report.phase1.ack = ack;
      report.phase1.validated = validated;
      expect(ack).toBe(true);
      expect(validated).toBe(true);

      const senderTransfer = await pollCondition(
        async () => {
          await sender.refreshWallet();
          const transfers = await sender.listTransfers(assetId);
          return transfers.find((item) => item.txid === sendResult.txid);
        },
        (transfer) => transfer?.status === 'Settled',
        180_000,
        5_000,
        `Sender transfer txid=${sendResult.txid} did not reach Settled before receiver refresh`
      );
      report.phase1.senderTransferStatusBeforeReceiverRefresh =
        senderTransfer?.status;
      expect(senderTransfer?.status).toBe('Settled');

      const receiverBalanceWhileOffline = await receiver
        .getAssetBalance(assetId)
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          if (message.includes('AssetNotFound')) {
            return { settled: receiverSettledBefore };
          }
          throw error;
        });
      report.phase1.receiverSettledWhileOffline = Number(
        receiverBalanceWhileOffline.settled ?? 0
      );
      expect(report.phase1.receiverSettledWhileOffline).toBe(
        receiverSettledBefore
      );

      try {
        const preRefreshTransfers = await receiver.listTransfers(assetId);
        const preRefreshTransfer = preRefreshTransfers.find(
          (item) => item.recipientId === invoiceData.recipientId
        );
        report.phase1.receiverTransferStatusBeforeRefresh =
          preRefreshTransfer?.status;
      } catch (error) {
        report.phase1.receiverTransferStatusBeforeRefresh = `error: ${error instanceof Error ? error.message : String(error)}`;
      }

      for (let cycle = 1; cycle <= 2; cycle += 1) {
        await receiver.refreshWallet();
        const balance = await receiver.getAssetBalance(assetId);
        const transfers = await receiver.listTransfers(assetId);
        const currentTransfer = transfers.find(
          (item) => item.recipientId === invoiceData.recipientId
        );

        report.phase2.delayedRefreshChecks.push({
          cycle,
          settled: Number(balance.settled ?? 0),
          currentTransferStatus: currentTransfer?.status,
          currentTransferTxid: currentTransfer?.txid,
        });
      }

      const firstRefresh = report.phase2.delayedRefreshChecks[0];
      const secondRefresh = report.phase2.delayedRefreshChecks[1];

      expect(firstRefresh?.currentTransferStatus).toBe('WaitingConfirmations');
      expect(firstRefresh?.settled).toBe(receiverSettledBefore);
      expect(secondRefresh?.currentTransferStatus).toBe('Settled');
      expect(secondRefresh?.currentTransferTxid).toBe(sendResult.txid);
      expect(secondRefresh?.settled).toBe(
        receiverSettledBefore + TRANSFER_AMOUNT
      );

      report.phase1.currentTransferStatus =
        secondRefresh?.currentTransferStatus;
      report.phase1.currentTransferTxid = secondRefresh?.currentTransferTxid;
      report.phase1.txidMatch = Boolean(
        secondRefresh?.currentTransferTxid &&
        secondRefresh.currentTransferTxid === sendResult.txid
      );
      report.phase1.receiverSettledAfter = secondRefresh?.settled;
      report.phase1.pollSettledMs = Date.now() - ackStartedAt;

      await finalizeTransferSnapshot(
        receiver,
        assetId,
        invoiceData.recipientId,
        sendResult.txid,
        report
      );
    } catch (error) {
      report.note = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(
        report,
        'signet-offline-receiver-two-refresh-convergence.json'
      );
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
