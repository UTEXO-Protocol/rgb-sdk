import {
  createPreflightState,
  disposeSignetPreflight,
  setupSignetPreflight,
  runSignetReceiveSmoke,
  TRANSFER_AMOUNT,
  SMOKE_FEE_RATE,
} from './fixture';

const state = createPreflightState();

beforeAll(async () => {
  await setupSignetPreflight(state);
});

afterAll(async () => {
  await disposeSignetPreflight(state);
});

describe('Signet witness receiver smoke', () => {
  it('auto-ACKs witness receive, settles, and refresh is idempotent', async () => {
    await runSignetReceiveSmoke({
      state,
      reportFileName: 'signet-witness-receiver-smoke.json',
      phase1Metadata: {
        invoiceType: 'witness',
        witnessAmountSat: 1000,
      },
      receiveInvoice: async (receiver) => {
        try {
          return await receiver.witnessReceive({
            amount: TRANSFER_AMOUNT,
            minConfirmations: 1,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('InsufficientAllocationSlots')) {
            throw new Error(
              'Receiver has no free allocation slots for witnessReceive. Run `node cli/run.mjs createutxos stage2-receiver --num 5 --size 2000 --feeRate 2` and then `node cli/run.mjs refresh stage2-receiver` before rerunning this smoke.',
            );
          }
          throw error;
        }
      },
      buildSendParams: ({ invoice, assetId }) => ({
        invoice,
        assetId,
        amount: TRANSFER_AMOUNT,
        donation: true,
        feeRate: SMOKE_FEE_RATE,
        minConfirmations: 1,
        witnessData: { amountSat: 1000 },
      }),
      strictMode: {
        exactDelta: true,
        strictTransferCheck: true,
      },
    });
  });
});
