import {
  createPreflightState,
  disposeSignetPreflight,
  maybeSkipOrFail,
  PROXY_HTTP_URL,
  setupSignetPreflight,
  SMOKE_FEE_RATE,
  TRANSFER_AMOUNT,
} from './fixture';
import {
  pollAck,
  pollCondition,
  pollTransferByRecipientId,
  pollValidated,
  writeSmokeReport,
} from '../shared/helpers';

const SEQUENTIAL_ITERATIONS = 2;
const ACK_TIMEOUT_MS = 60_000;
const ACK_INTERVAL_MS = 2_000;
const TRANSFER_TIMEOUT_MS = 120_000;
const TRANSFER_INTERVAL_MS = 5_000;
const IDEMPOTENT_REFRESH_COUNT = 2;

type SequentialCycle = {
  cycle: number;
  recipientId: string;
  invoice: string;
  txid?: string;
  ack?: boolean;
  validated?: boolean;
  status?: string;
  receiverSettledAfterCycle?: number;
  senderSpendableAfterCycle?: number;
};

type SequentialReport = {
  timestamp: string;
  durationMs: number;
  preconditions: {
    assetId: string;
    senderAddress: string;
    receiverAddress: string;
    senderSpendableBefore: number;
    receiverSettledBefore: number;
    iterations: number;
  };
  cycles: SequentialCycle[];
  phase2: {
    totalDelta?: number;
    postRefreshSettled?: number[];
  };
  note?: string;
};

const state = createPreflightState();

beforeAll(async () => {
  await setupSignetPreflight(state);
});

afterAll(async () => {
  await disposeSignetPreflight(state);
});

describe('Signet sequential receives smoke', () => {
  it('sequential blind receives on same wallet state converge without slot leakage', async () => {
    if (state.skipReason) {
      maybeSkipOrFail(state.skipReason);
      return;
    }

    const sender = state.sender!;
    const receiver = state.receiver!;
    const assetId = state.assetId;
    const receiverSettledBefore = Number(state.receiverBalanceBefore?.settled ?? 0);
    const startedAt = Date.now();
    const report: SequentialReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        assetId,
        senderAddress: state.senderAddress,
        receiverAddress: state.receiverAddress,
        senderSpendableBefore: Number(state.senderBalanceBefore?.spendable ?? 0),
        receiverSettledBefore,
        iterations: SEQUENTIAL_ITERATIONS,
      },
      cycles: [],
      phase2: {},
    };

    try {
      await pollCondition(
        async () => {
          await sender.refreshWallet();
          return sender.getAssetBalance(assetId);
        },
        (balance) =>
          Number(balance.spendable ?? 0) >= SEQUENTIAL_ITERATIONS * TRANSFER_AMOUNT,
        180_000,
        5_000,
        `Sender asset did not reach spendable >= ${SEQUENTIAL_ITERATIONS * TRANSFER_AMOUNT} before sequential test`,
      );

      let expectedSettledLowerBound = receiverSettledBefore;
      for (let cycle = 1; cycle <= SEQUENTIAL_ITERATIONS; cycle += 1) {
        await pollCondition(
          async () => {
            await sender.refreshWallet();
            return sender.getAssetBalance(assetId);
          },
          (balance) => Number(balance.spendable ?? 0) >= TRANSFER_AMOUNT,
          120_000,
          5_000,
          `Sender spendable did not recover before cycle=${cycle}`,
        );

        let invoiceData;
        try {
          invoiceData = await receiver.blindReceive({
            amount: TRANSFER_AMOUNT,
            minConfirmations: 1,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('InsufficientAllocationSlots')) {
            throw new Error(
              `Receiver has no free allocation slots for cycle=${cycle}. Run \`node cli/run.mjs createutxos stage2-receiver --num 10 --size 2000 --feeRate 2\` and then \`node cli/run.mjs refresh stage2-receiver\` before rerunning this sequential smoke.`,
            );
          }
          throw error;
        }

        const cycleReport: SequentialCycle = {
          cycle,
          recipientId: invoiceData.recipientId,
          invoice: invoiceData.invoice,
        };
        report.cycles.push(cycleReport);

        const sendResult = await sender.send({
          invoice: invoiceData.invoice,
          assetId,
          amount: TRANSFER_AMOUNT,
          donation: true,
          feeRate: SMOKE_FEE_RATE,
          minConfirmations: 1,
        });
        cycleReport.txid = sendResult.txid;

        const ack = await pollAck(
          PROXY_HTTP_URL,
          invoiceData.recipientId,
          ACK_TIMEOUT_MS,
          ACK_INTERVAL_MS,
        );
        const validated = await pollValidated(
          PROXY_HTTP_URL,
          invoiceData.recipientId,
          ACK_TIMEOUT_MS,
          ACK_INTERVAL_MS,
        );
        cycleReport.ack = ack;
        cycleReport.validated = validated;
        expect(ack).toBe(true);
        expect(validated).toBe(true);

        const transfer = await pollTransferByRecipientId(
          async () => {
            await receiver.refreshWallet();
            return receiver.listTransfers(assetId);
          },
          invoiceData.recipientId,
          sendResult.txid,
          TRANSFER_TIMEOUT_MS,
          TRANSFER_INTERVAL_MS,
        );
        cycleReport.status = transfer.status;
        expect(transfer.status).toBe('Settled');

        const receiverBalanceAfterCycle = await receiver.getAssetBalance(assetId);
        const receiverSettledAfterCycle = Number(receiverBalanceAfterCycle.settled ?? 0);
        cycleReport.receiverSettledAfterCycle = receiverSettledAfterCycle;
        expectedSettledLowerBound += TRANSFER_AMOUNT;
        expect(receiverSettledAfterCycle).toBeGreaterThanOrEqual(
          expectedSettledLowerBound,
        );

        await sender.refreshWallet();
        const senderBalanceAfterCycle = await sender.getAssetBalance(assetId);
        cycleReport.senderSpendableAfterCycle = Number(
          senderBalanceAfterCycle.spendable ?? 0,
        );
      }

      const finalReceiverBalance = await receiver.getAssetBalance(assetId);
      const finalSettled = Number(finalReceiverBalance.settled ?? 0);
      const totalDelta = finalSettled - receiverSettledBefore;
      report.phase2.totalDelta = totalDelta;
      expect(totalDelta).toBeGreaterThanOrEqual(
        SEQUENTIAL_ITERATIONS * TRANSFER_AMOUNT,
      );

      const postRefreshSettled: number[] = [];
      for (
        let refreshCycle = 1;
        refreshCycle <= IDEMPOTENT_REFRESH_COUNT;
        refreshCycle += 1
      ) {
        await receiver.refreshWallet();
        const balance = await receiver.getAssetBalance(assetId);
        postRefreshSettled.push(Number(balance.settled ?? 0));
      }
      report.phase2.postRefreshSettled = postRefreshSettled;
      expect(new Set(postRefreshSettled).size).toBe(1);
    } catch (error) {
      report.note = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'signet-sequential-receives.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
