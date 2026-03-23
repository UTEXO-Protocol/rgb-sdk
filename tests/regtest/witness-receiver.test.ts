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
const IDEMPOTENT_REFRESH_COUNT = 3;
const SEND_FEE_RATE = 2;
const WITNESS_AMOUNT_SAT = 1_000;

type WitnessReceiverReport = {
  timestamp: string;
  durationMs: number;
  preconditions: {
    proxyHttpUrl: string;
    proxyRpcUrl: string;
    indexerUrl: string;
    senderAddress: string;
    receiverAddress: string;
    assetId: string;
    senderSpendableBefore: number;
    receiverSettledBefore: number;
  };
  phase1: {
    invoiceType: 'witness';
    witnessAmountSat: number;
    invoice: string;
    recipientId: string;
    txid?: string;
    ack?: boolean;
    validated?: boolean;
    currentTransferStatus?: string;
    currentTransferTxid?: string | null;
    txidMatch?: boolean;
    receiverSettledAfter?: number;
  };
  phase2: {
    refreshChecks: Array<{ cycle: number; settled: number }>;
    receiverSettledFinal?: number;
  };
};

type WitnessMissingDataReport = {
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
    invoiceType: 'witness';
    invoice: string;
    recipientId: string;
    sendError?: string;
    ackAfterFailure?: boolean | null;
    transferStatusAfterFailure?: string;
    receiverSettledAfter?: number;
  };
};

type State = {
  sender: RegtestWallet | null;
  receiver: RegtestWallet | null;
  senderAddress: string;
  receiverAddress: string;
  assetId: string;
  senderSpendableBefore: number;
  receiverSettledBefore: number;
};

const state: State = {
  sender: null,
  receiver: null,
  senderAddress: '',
  receiverAddress: '',
  assetId: '',
  senderSpendableBefore: 0,
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
    'server.info',
  );

  const { WalletManager, generateKeys } = (await import('../../dist/index.mjs')) as {
    WalletManager: WalletManagerCtor;
    generateKeys: GenerateKeysFn;
  };

  const { wallet: sender } = await createRegtestWallet(WalletManager, generateKeys, 'sender');
  const { wallet: receiver } = await createRegtestWallet(
    WalletManager,
    generateKeys,
    'receiver',
  );

  state.sender = sender;
  state.receiver = receiver;

  const senderFunding = await fundWallet(sender);
  state.senderAddress = senderFunding.address;

  const issuedAsset = await sender.issueAssetNia({
    ticker: `W${Date.now().toString().slice(-5)}`,
    name: `Regtest Witness Asset ${Date.now()}`,
    amounts: [10],
    precision: 0,
  });
  state.assetId = issuedAsset.assetId;

  await mine(1);
  const senderBalance = await pollCondition(
    async () => {
      await sender.refreshWallet();
      return sender.getAssetBalance(state.assetId);
    },
    (balance) => Number(balance.spendable ?? 0) >= TRANSFER_AMOUNT,
    30_000,
    1_000,
    `Issued witness asset ${state.assetId} did not become spendable in time`,
  );
  state.senderSpendableBefore = Number(senderBalance.spendable ?? 0);

  const receiverFunding = await fundWallet(receiver);
  state.receiverAddress = receiverFunding.address;
  await receiver.refreshWallet();
  const receiverBalance = await receiver.getAssetBalance(state.assetId).catch(() => ({
    settled: 0,
  }));
  state.receiverSettledBefore = Number(receiverBalance.settled ?? 0);
});

afterAll(async () => {
  await state.sender?.dispose();
  await state.receiver?.dispose();
});

describe('Regtest witness receiver', () => {
  it('witness receive offline -> auto-ACK -> Settled, refresh is idempotent', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: WitnessReceiverReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        proxyHttpUrl: PROXY_HTTP_URL,
        proxyRpcUrl: getRegtestProxyRpcUrl(),
        indexerUrl: getRegtestIndexerUrl(),
        senderAddress: state.senderAddress,
        receiverAddress: state.receiverAddress,
        assetId: state.assetId,
        senderSpendableBefore: state.senderSpendableBefore,
        receiverSettledBefore: state.receiverSettledBefore,
      },
      phase1: {
        invoiceType: 'witness',
        witnessAmountSat: WITNESS_AMOUNT_SAT,
        invoice: '',
        recipientId: '',
      },
      phase2: {
        refreshChecks: [],
      },
    };

    try {
      const invoiceData = await receiver.witnessReceive({
        amount: TRANSFER_AMOUNT,
        minConfirmations: 1,
      });
      report.phase1.invoice = invoiceData.invoice;
      report.phase1.recipientId = invoiceData.recipientId;

      const sendResult = await sender.send({
        invoice: invoiceData.invoice,
        assetId: state.assetId,
        amount: TRANSFER_AMOUNT,
        donation: true,
        feeRate: SEND_FEE_RATE,
        minConfirmations: 1,
        witnessData: { amountSat: WITNESS_AMOUNT_SAT },
      });
      report.phase1.txid = sendResult.txid;

      await mine(1);

      const ack = await pollAck(PROXY_HTTP_URL, invoiceData.recipientId, 30_000, 1_000);
      const validated = await pollValidated(
        PROXY_HTTP_URL,
        invoiceData.recipientId,
        30_000,
        1_000,
      );

      report.phase1.ack = ack;
      report.phase1.validated = validated;
      expect(ack).toBe(true);
      expect(validated).toBe(true);

      const currentTransfer = await pollTransferByRecipientId(
        async () => {
          await receiver.refreshWallet();
          return receiver.listTransfers(state.assetId);
        },
        invoiceData.recipientId,
        sendResult.txid,
        30_000,
        1_000,
      );
      report.phase1.currentTransferStatus = currentTransfer.status;
      report.phase1.currentTransferTxid = currentTransfer.txid;
      report.phase1.txidMatch = Boolean(
        currentTransfer.txid && currentTransfer.txid === sendResult.txid,
      );

      const balance = await receiver.getAssetBalance(state.assetId);
      const receiverSettledAfter = Number(balance.settled ?? 0);
      report.phase1.receiverSettledAfter = receiverSettledAfter;

      expect(currentTransfer.status).toBe('Settled');
      expect(receiverSettledAfter - state.receiverSettledBefore).toBe(
        TRANSFER_AMOUNT,
      );

      for (let cycle = 1; cycle <= IDEMPOTENT_REFRESH_COUNT; cycle += 1) {
        await receiver.refreshWallet();
        const refreshedBalance = await receiver.getAssetBalance(state.assetId);
        report.phase2.refreshChecks.push({
          cycle,
          settled: Number(refreshedBalance.settled ?? 0),
        });
      }

      const allSettled = report.phase2.refreshChecks.map((item) => item.settled);
      expect(new Set(allSettled).size).toBe(1);
      report.phase2.receiverSettledFinal = report.phase2.refreshChecks.at(-1)?.settled;
      expect(report.phase2.receiverSettledFinal).toBe(receiverSettledAfter);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-witness-receiver.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });

  it('witness send without witnessData fails and does not credit receiver', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const beforeBalance = await receiver.getAssetBalance(state.assetId).catch(() => ({ settled: 0 }));
    const receiverSettledBefore = Number(beforeBalance.settled ?? 0);
    const report: WitnessMissingDataReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        proxyHttpUrl: PROXY_HTTP_URL,
        proxyRpcUrl: getRegtestProxyRpcUrl(),
        indexerUrl: getRegtestIndexerUrl(),
        senderAddress: state.senderAddress,
        receiverAddress: state.receiverAddress,
        assetId: state.assetId,
        receiverSettledBefore,
      },
      phase1: {
        invoiceType: 'witness',
        invoice: '',
        recipientId: '',
      },
    };

    try {
      const invoiceData = await receiver.witnessReceive({
        amount: TRANSFER_AMOUNT,
        minConfirmations: 1,
      });
      report.phase1.invoice = invoiceData.invoice;
      report.phase1.recipientId = invoiceData.recipientId;

      let sendFailed = false;
      try {
        await sender.send({
          invoice: invoiceData.invoice,
          assetId: state.assetId,
          amount: TRANSFER_AMOUNT,
          donation: true,
          feeRate: SEND_FEE_RATE,
          minConfirmations: 1,
        });
      } catch (error) {
        sendFailed = true;
        report.phase1.sendError = [String(error), (error as Error)?.message ?? '']
          .filter(Boolean)
          .join('\n');
      }

      expect(sendFailed).toBe(true);
      expect(report.phase1.sendError).toBeDefined();

      await receiver.refreshWallet();
      const transferAfterFailure = (await receiver.listTransfers(state.assetId)).find(
        (item) => item.recipientId === invoiceData.recipientId,
      );
      report.phase1.transferStatusAfterFailure = transferAfterFailure?.status;
      expect(transferAfterFailure?.status).not.toBe('Settled');

      const ackAfterFailure = await proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
        recipient_id: invoiceData.recipientId,
      }).catch(() => null);
      report.phase1.ackAfterFailure = ackAfterFailure;
      expect(ackAfterFailure).not.toBe(true);

      const afterBalance = await receiver.getAssetBalance(state.assetId);
      const receiverSettledAfter = Number(afterBalance.settled ?? 0);
      report.phase1.receiverSettledAfter = receiverSettledAfter;
      expect(receiverSettledAfter).toBe(receiverSettledBefore);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-witness-missing-witness-data.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
