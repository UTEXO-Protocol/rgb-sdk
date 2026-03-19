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

type ParallelSendsReport = {
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
  };
  phase1: {
    invoiceA: string;
    recipientIdA: string;
    invoiceB: string;
    recipientIdB: string;
    concurrentResults: Array<{
      label: 'A' | 'B';
      recipientId: string;
      txid?: string;
      error?: string;
      ack?: boolean;
      validated?: boolean;
      status?: string;
      retryRecipientId?: string;
      retryAttemptCount?: number;
      retryTxid?: string;
      retryError?: string;
      retryAck?: boolean;
      retryValidated?: boolean;
      retryStatus?: string;
    }>;
  };
  phase2: {
    receiverSettledAfter?: number;
    receiverDelta?: number;
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
  await proxyRpc<{ protocol_version: string; version: string }>(PROXY_HTTP_URL, 'server.info');

  const { WalletManager, generateKeys } = (await import('../../dist/index.mjs')) as {
    WalletManager: WalletManagerCtor;
    generateKeys: GenerateKeysFn;
  };

  const { wallet: sender } = await createRegtestWallet(WalletManager, generateKeys, 'sender');
  const { wallet: receiver } = await createRegtestWallet(WalletManager, generateKeys, 'receiver');
  state.sender = sender;
  state.receiver = receiver;

  state.senderAddress = (await fundWallet(sender)).address;
  const issuedAsset = await sender.issueAssetNia({
    ticker: `PS${Date.now().toString().slice(-4)}`,
    name: `ParallelSend${Date.now().toString().slice(-6)}`,
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
    (balance) => Number(balance.spendable ?? 0) >= TRANSFER_AMOUNT * 2,
    30_000,
    1_000,
    `Issued asset ${state.assetId} did not become spendable in time`,
  );

  state.receiverAddress = (await fundWallet(receiver)).address;
  await receiver.refreshWallet();
  const receiverBalance = await receiver.getAssetBalance(state.assetId).catch(() => ({ settled: 0 }));
  state.receiverSettledBefore = Number(receiverBalance.settled ?? 0);
});

afterAll(async () => {
  await state.sender?.dispose();
  await state.receiver?.dispose();
});

describe('Regtest parallel sends to same receiver', () => {
  it('keeps consistent state under concurrent sends and reaches the expected final delta', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: ParallelSendsReport = {
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
      },
      phase1: {
        invoiceA: '',
        recipientIdA: '',
        invoiceB: '',
        recipientIdB: '',
        concurrentResults: [],
      },
      phase2: {},
    };

    try {
      const [invoiceA, invoiceB] = await Promise.all([
        receiver.blindReceive({ amount: TRANSFER_AMOUNT, minConfirmations: 1 }),
        receiver.blindReceive({ amount: TRANSFER_AMOUNT, minConfirmations: 1 }),
      ]);
      report.phase1.invoiceA = invoiceA.invoice;
      report.phase1.recipientIdA = invoiceA.recipientId;
      report.phase1.invoiceB = invoiceB.invoice;
      report.phase1.recipientIdB = invoiceB.recipientId;
      expect(invoiceA.recipientId).not.toBe(invoiceB.recipientId);

      const attemptPlan = [
        { label: 'A' as const, invoice: invoiceA.invoice, recipientId: invoiceA.recipientId },
        { label: 'B' as const, invoice: invoiceB.invoice, recipientId: invoiceB.recipientId },
      ];
      const concurrentSends = await Promise.allSettled(
        attemptPlan.map((attempt) =>
          sender.send({
            invoice: attempt.invoice,
            assetId: state.assetId,
            amount: TRANSFER_AMOUNT,
            donation: true,
            feeRate: SEND_FEE_RATE,
            minConfirmations: 1,
          }),
        ),
      );

      await mine(1);

      for (let index = 0; index < concurrentSends.length; index += 1) {
        const attempt = attemptPlan[index];
        const sendResult = concurrentSends[index];
        const item: ParallelSendsReport['phase1']['concurrentResults'][number] = {
          label: attempt.label,
          recipientId: attempt.recipientId,
        };
        report.phase1.concurrentResults.push(item);

        if (sendResult.status === 'fulfilled') {
          item.txid = sendResult.value.txid;
          item.ack = await pollAck(PROXY_HTTP_URL, attempt.recipientId, 30_000, 1_000);
          item.validated = await pollValidated(PROXY_HTTP_URL, attempt.recipientId, 30_000, 1_000);
          const transfer = await pollTransferByRecipientId(
            async () => {
              await receiver.refreshWallet();
              return receiver.listTransfers(state.assetId);
            },
            attempt.recipientId,
            sendResult.value.txid,
            30_000,
            1_000,
          );
          item.status = transfer.status;
          expect(item.ack).toBe(true);
          expect(item.validated).toBe(true);
          expect(item.status).toBe('Settled');
          continue;
        }

        const serializedError = [String(sendResult.reason), (sendResult.reason as Error)?.message ?? '']
          .filter(Boolean)
          .join('\n');
        item.error = serializedError;
        expect(
          /FailedBroadcast|insufficient fee|rejecting replacement|mempool|conflict/i.test(
            serializedError,
          ),
        ).toBe(true);

        await pollCondition(
          async () => {
            await sender.refreshWallet();
            return sender.getAssetBalance(state.assetId);
          },
          (balance) => Number(balance.spendable ?? 0) >= TRANSFER_AMOUNT,
          30_000,
          1_000,
          `Sender did not recover spendable balance for retry after concurrent conflict (${attempt.label})`,
        );

        const retryInvoice = await receiver.blindReceive({
          amount: TRANSFER_AMOUNT,
          minConfirmations: 1,
        });
        item.retryRecipientId = retryInvoice.recipientId;

        let retrySend:
          | {
              txid: string;
            }
          | undefined;
        const retryErrors: string[] = [];
        for (let retryAttempt = 1; retryAttempt <= 3; retryAttempt += 1) {
          item.retryAttemptCount = retryAttempt;
          try {
            retrySend = await sender.send({
              invoice: retryInvoice.invoice,
              assetId: state.assetId,
              amount: TRANSFER_AMOUNT,
              donation: true,
              feeRate: SEND_FEE_RATE,
              minConfirmations: 1,
            });
            break;
          } catch (retryError) {
            const serializedRetryError = [String(retryError), (retryError as Error)?.message ?? '']
              .filter(Boolean)
              .join('\n');
            retryErrors.push(serializedRetryError);
            if (!/InsufficientAssignments/i.test(serializedRetryError) || retryAttempt === 3) {
              item.retryError = retryErrors.join('\n---\n');
              throw new Error(
                `Retry send failed for concurrent conflict (${attempt.label}): ${item.retryError}`,
              );
            }

            await mine(1);
            await pollCondition(
              async () => {
                await sender.refreshWallet();
                return sender.getAssetBalance(state.assetId);
              },
              (balance) => Number(balance.spendable ?? 0) >= TRANSFER_AMOUNT,
              30_000,
              1_000,
              `Sender spendable balance did not recover between retry attempts (${attempt.label})`,
            );
          }
        }
        if (!retrySend) {
          throw new Error(`Retry send produced no txid for concurrent conflict (${attempt.label})`);
        }
        item.retryTxid = retrySend.txid;
        await mine(1);

        item.retryAck = await pollAck(PROXY_HTTP_URL, retryInvoice.recipientId, 30_000, 1_000);
        item.retryValidated = await pollValidated(
          PROXY_HTTP_URL,
          retryInvoice.recipientId,
          30_000,
          1_000,
        );
        const retryTransfer = await pollTransferByRecipientId(
          async () => {
            await receiver.refreshWallet();
            return receiver.listTransfers(state.assetId);
          },
          retryInvoice.recipientId,
          retrySend.txid,
          30_000,
          1_000,
        );
        item.retryStatus = retryTransfer.status;
        expect(item.retryAck).toBe(true);
        expect(item.retryValidated).toBe(true);
        expect(item.retryStatus).toBe('Settled');
      }

      expect(report.phase1.concurrentResults.length).toBe(2);

      const receiverBalance = await receiver.getAssetBalance(state.assetId);
      const receiverSettledAfter = Number(receiverBalance.settled ?? 0);
      const receiverDelta = receiverSettledAfter - state.receiverSettledBefore;
      report.phase2.receiverSettledAfter = receiverSettledAfter;
      report.phase2.receiverDelta = receiverDelta;

      expect(receiverDelta).toBeGreaterThanOrEqual(TRANSFER_AMOUNT * 2);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-parallel-sends-same-receiver.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
