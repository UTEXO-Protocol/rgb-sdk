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
  type TransferRecord,
} from './fixture';
import {
  pollAck,
  pollTransferByRecipientId,
  pollValidated,
  writeSmokeReport,
} from '../shared/helpers';

type ConvergenceReport = ReturnType<typeof createBaseReport> & {
  phase1: ReturnType<typeof createBaseReport>['phase1'] & {
    invoiceType?: 'witness';
    witnessAmountSat?: number;
    preRefreshTransferStatus?: string;
  };
  phase2: ReturnType<typeof createBaseReport>['phase2'] & {
    delayedRefreshChecks: Array<{
      cycle: number;
      settled: number;
      currentTransferStatus?: string;
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

describe('Signet offline receiver refresh convergence', () => {
  it('receiver catches up to Settled after delayed refreshes', async () => {
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
    const report = createBaseReport(state) as ConvergenceReport;
    report.phase2.delayedRefreshChecks = [];

    try {
      const invoiceData = await receiver.witnessReceive({
        amount: TRANSFER_AMOUNT,
        minConfirmations: 1,
      });
      report.phase1.invoice = invoiceData.invoice;
      report.phase1.recipientId = invoiceData.recipientId;
      report.phase1.invoiceType = 'witness';
      report.phase1.witnessAmountSat = 1000;

      let sendResult;
      try {
        sendResult = await sender.send({
          invoice: invoiceData.invoice,
          assetId,
          amount: TRANSFER_AMOUNT,
          donation: true,
          feeRate: SMOKE_FEE_RATE,
          minConfirmations: 1,
          witnessData: { amountSat: 1000 },
        });
      } catch (error) {
        const serialized = [
          String(error),
          error instanceof Error ? error.message : '',
          error instanceof Error && error.stack ? error.stack : '',
        ].join(' ');
        if (
          serialized.includes('InsufficientAllocationSlots') ||
          serialized.includes('AllocationSlots')
        ) {
          throw new Error(
            'Receiver has no free allocation slots for witness receive. Run `node cli/run.mjs createutxos stage2-receiver --num 5 --size 2000 --feeRate 2` and then `node cli/run.mjs refresh stage2-receiver` before rerunning this convergence test.'
          );
        }
        throw error;
      }
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

      try {
        const preRefreshTransfers = await receiver.listTransfers(assetId);
        const preRefreshTransfer = preRefreshTransfers.find(
          (item) => item.recipientId === invoiceData.recipientId
        );
        report.phase1.preRefreshTransferStatus = preRefreshTransfer?.status;
      } catch (error) {
        report.phase1.preRefreshTransferStatus = `error: ${error instanceof Error ? error.message : String(error)}`;
      }

      for (let cycle = 1; cycle <= 2; cycle += 1) {
        await receiver.refreshWallet();
        const balance = await receiver.getAssetBalance(assetId);
        let currentTransferStatus: string | undefined;
        try {
          const transfers = await receiver.listTransfers(assetId);
          currentTransferStatus = transfers.find(
            (item) => item.recipientId === invoiceData.recipientId
          )?.status;
        } catch {
          currentTransferStatus = undefined;
        }
        report.phase2.delayedRefreshChecks.push({
          cycle,
          settled: Number(balance.settled ?? 0),
          currentTransferStatus,
        });
      }

      const transferStartedAt = Date.now();
      const currentTransfer = await pollTransferByRecipientId<TransferRecord>(
        async () => {
          await receiver.refreshWallet();
          return receiver.listTransfers(assetId);
        },
        invoiceData.recipientId,
        sendResult.txid,
        60_000,
        5_000
      );
      report.phase1.pollTransferMs = Date.now() - transferStartedAt;
      report.phase1.currentTransferStatus = currentTransfer.status;
      report.phase1.currentTransferTxid = currentTransfer.txid;
      report.phase1.txidMatch = Boolean(
        currentTransfer.txid && currentTransfer.txid === sendResult.txid
      );

      const settledStartedAt = Date.now();
      const finalBalance = await receiver.getAssetBalance(assetId);
      const receiverSettledAfter = Number(finalBalance.settled ?? 0);
      report.phase1.pollSettledMs = Date.now() - settledStartedAt;
      report.phase1.receiverSettledAfter = receiverSettledAfter;

      expect(currentTransfer.status).toBe('Settled');
      expect(
        receiverSettledAfter - receiverSettledBefore
      ).toBeGreaterThanOrEqual(TRANSFER_AMOUNT);

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
        'signet-offline-receiver-refresh-convergence.json'
      );
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
