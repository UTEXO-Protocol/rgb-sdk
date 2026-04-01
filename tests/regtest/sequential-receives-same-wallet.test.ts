import {
  pollCondition,
  pollAck,
  pollTransferByRecipientId,
  pollValidated,
  proxyRpc,
  writeSmokeReport,
} from '../shared/helpers';
import {
  createRegtestWallet,
  env,
  ensureBitcoindAccess,
  fundWallet,
  getRegtestBaseDir,
  getRegtestIndexerUrl,
  getRegtestProxyHttpUrl,
  getRegtestProxyRpcUrl,
  mine,
  resetWalletDataDirs,
  type GenerateKeysFn,
  type RegtestWallet,
  type WalletManagerCtor,
} from './helpers';

const PROXY_HTTP_URL = getRegtestProxyHttpUrl();
const TRANSFER_AMOUNT = 1;
const SEND_FEE_RATE = 2;
const SEQUENTIAL_ITERATIONS = 3;

type SequentialReceivesReport = {
  timestamp: string;
  durationMs: number;
  preconditions: {
    proxyHttpUrl: string;
    proxyRpcUrl: string;
    indexerUrl: string;
    senderAddress: string;
    receiverAddress: string;
    assetId: string;
    receiverSettledBefore: number;
    iterations: number;
  };
  cycles: Array<{
    cycle: number;
    invoice: string;
    recipientId: string;
    senderSpendableBeforeSend?: number;
    sendAttempts?: number;
    sendError?: string;
    txid?: string;
    ack?: boolean;
    validated?: boolean;
    status?: string;
    receiverSettledAfterCycle?: number;
    senderSpendableAfterCycle?: number;
  }>;
  phase2: {
    finalSettled?: number;
    totalDelta?: number;
    postRefreshSettled?: number[];
  };
};

type State = {
  sender: RegtestWallet | null;
  receiver: RegtestWallet | null;
  senderAddress: string;
  receiverAddress: string;
  assetId: string;
  receiverSettledBefore: number;
};

const state: State = {
  sender: null,
  receiver: null,
  senderAddress: '',
  receiverAddress: '',
  assetId: '',
  receiverSettledBefore: 0,
};

beforeAll(async () => {
  env('REGTEST_PROXY_HTTP_URL');
  env('REGTEST_PROXY_RPC_URL');
  env('REGTEST_INDEXER_URL');
  env('REGTEST_BITCOIND_USER');
  env('REGTEST_BITCOIND_PASS');
  ensureBitcoindAccess();

  resetWalletDataDirs(getRegtestBaseDir());
  await proxyRpc<{ protocol_version: string; version: string }>(
    PROXY_HTTP_URL,
    'server.info'
  );

  const { WalletManager, generateKeys } =
    (await import('../../dist/index.mjs')) as {
      WalletManager: WalletManagerCtor;
      generateKeys: GenerateKeysFn;
    };

  const { wallet: sender } = await createRegtestWallet(
    WalletManager,
    generateKeys,
    'sender'
  );
  const { wallet: receiver } = await createRegtestWallet(
    WalletManager,
    generateKeys,
    'receiver'
  );
  state.sender = sender;
  state.receiver = receiver;

  state.senderAddress = (await fundWallet(sender)).address;
  const issuedAsset = await sender.issueAssetNia({
    ticker: `SQ${Date.now().toString().slice(-4)}`,
    name: `Sequential${Date.now().toString().slice(-6)}`,
    amounts: [20],
    precision: 0,
  });
  state.assetId = issuedAsset.assetId;

  await mine(1);
  await pollCondition(
    async () => {
      await sender.refreshWallet();
      return sender.getAssetBalance(state.assetId);
    },
    (balance) =>
      Number(balance.spendable ?? 0) >= SEQUENTIAL_ITERATIONS * TRANSFER_AMOUNT,
    30_000,
    1_000,
    `Issued asset ${state.assetId} did not become spendable in time`
  );

  state.receiverAddress = (await fundWallet(receiver)).address;
  await receiver.refreshWallet();
  const receiverBalance = await receiver
    .getAssetBalance(state.assetId)
    .catch(() => ({ settled: 0 }));
  state.receiverSettledBefore = Number(receiverBalance.settled ?? 0);
});

afterAll(async () => {
  await state.sender?.dispose();
  await state.receiver?.dispose();
});

describe('Regtest multiple sequential receives on same wallet state', () => {
  it('processes repeated receives without state drift or slot leakage', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: SequentialReceivesReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        proxyHttpUrl: PROXY_HTTP_URL,
        proxyRpcUrl: getRegtestProxyRpcUrl(),
        indexerUrl: getRegtestIndexerUrl(),
        senderAddress: state.senderAddress,
        receiverAddress: state.receiverAddress,
        assetId: state.assetId,
        receiverSettledBefore: state.receiverSettledBefore,
        iterations: SEQUENTIAL_ITERATIONS,
      },
      cycles: [],
      phase2: {},
    };

    try {
      let expectedSettledLowerBound = state.receiverSettledBefore;

      for (let cycle = 1; cycle <= SEQUENTIAL_ITERATIONS; cycle += 1) {
        const cycleReport: SequentialReceivesReport['cycles'][number] = {
          cycle,
          invoice: '',
          recipientId: '',
        };
        report.cycles.push(cycleReport);

        const senderBalanceBeforeSend = await pollCondition(
          async () => {
            await sender.refreshWallet();
            return sender
              .getAssetBalance(state.assetId)
              .catch(() => ({ spendable: 0 }));
          },
          (balance) => Number(balance.spendable ?? 0) >= TRANSFER_AMOUNT,
          30_000,
          1_000,
          `Sender spendable balance is not ready before cycle=${cycle}`
        );
        cycleReport.senderSpendableBeforeSend = Number(
          senderBalanceBeforeSend.spendable ?? 0
        );

        const invoiceData = await receiver.blindReceive({
          amount: TRANSFER_AMOUNT,
          minConfirmations: 1,
        });
        cycleReport.invoice = invoiceData.invoice;
        cycleReport.recipientId = invoiceData.recipientId;

        cycleReport.sendAttempts = 1;
        let sendResult: { txid: string };
        try {
          sendResult = await sender.send({
            invoice: invoiceData.invoice,
            assetId: state.assetId,
            amount: TRANSFER_AMOUNT,
            donation: true,
            feeRate: SEND_FEE_RATE,
            minConfirmations: 1,
          });
        } catch (error) {
          const serialized = [String(error), (error as Error)?.message ?? '']
            .filter(Boolean)
            .join('\n');
          cycleReport.sendError = serialized;
          if (/InsufficientAssignments/i.test(serialized)) {
            throw new Error(
              `Sequential receive failed at cycle=${cycle} with InsufficientAssignments. This indicates slot leakage or state drift in the sender path.\n${serialized}`
            );
          }
          throw error;
        }
        cycleReport.txid = sendResult.txid;

        await mine(1);

        const ack = await pollAck(
          PROXY_HTTP_URL,
          invoiceData.recipientId,
          30_000,
          1_000
        );
        const validated = await pollValidated(
          PROXY_HTTP_URL,
          invoiceData.recipientId,
          30_000,
          1_000
        );
        cycleReport.ack = ack;
        cycleReport.validated = validated;
        expect(ack).toBe(true);
        expect(validated).toBe(true);

        const transfer = await pollTransferByRecipientId(
          async () => {
            await receiver.refreshWallet();
            return receiver.listTransfers(state.assetId);
          },
          invoiceData.recipientId,
          sendResult.txid,
          30_000,
          1_000
        );
        cycleReport.status = transfer.status;
        expect(transfer.status).toBe('Settled');

        const balance = await receiver.getAssetBalance(state.assetId);
        const receiverSettledAfterCycle = Number(balance.settled ?? 0);
        cycleReport.receiverSettledAfterCycle = receiverSettledAfterCycle;
        expectedSettledLowerBound += TRANSFER_AMOUNT;
        expect(receiverSettledAfterCycle).toBe(expectedSettledLowerBound);

        // Last cycle: no next send depends on spendable recovery; capture observed value as-is.
        const senderBalanceAfterCycle = await pollCondition(
          async () => {
            await sender.refreshWallet();
            return sender
              .getAssetBalance(state.assetId)
              .catch(() => ({ spendable: 0 }));
          },
          (senderBalance) =>
            Number(senderBalance.spendable ?? 0) >= TRANSFER_AMOUNT ||
            cycle === SEQUENTIAL_ITERATIONS,
          30_000,
          1_000,
          `Sender spendable balance did not recover after cycle=${cycle}`
        );
        cycleReport.senderSpendableAfterCycle = Number(
          senderBalanceAfterCycle.spendable ?? 0
        );
      }

      const finalBalance = await receiver.getAssetBalance(state.assetId);
      const finalSettled = Number(finalBalance.settled ?? 0);
      const totalDelta = finalSettled - state.receiverSettledBefore;
      report.phase2.finalSettled = finalSettled;
      report.phase2.totalDelta = totalDelta;
      expect(totalDelta).toBe(SEQUENTIAL_ITERATIONS * TRANSFER_AMOUNT);

      const postRefreshSettled: number[] = [];
      for (let refreshCycle = 1; refreshCycle <= 2; refreshCycle += 1) {
        await receiver.refreshWallet();
        const balance = await receiver.getAssetBalance(state.assetId);
        postRefreshSettled.push(Number(balance.settled ?? 0));
      }
      report.phase2.postRefreshSettled = postRefreshSettled;
      expect(new Set(postRefreshSettled).size).toBe(1);
      expect(postRefreshSettled[0]).toBe(finalSettled);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(
        report,
        'regtest-sequential-receives-same-wallet.json'
      );
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
