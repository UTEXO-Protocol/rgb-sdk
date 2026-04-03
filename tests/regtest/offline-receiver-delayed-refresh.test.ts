import {
  pollAck,
  pollCondition,
  pollValidated,
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
const RECEIVER_REFRESH_COUNT = 2;

type DelayedRefreshReport = {
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
    invoice: string;
    recipientId: string;
    txid?: string;
    ack?: boolean;
    validated?: boolean;
    senderTransferStatusBeforeReceiverRefresh?: string;
    receiverSettledWhileOffline?: number;
  };
  phase2: {
    receiverRefreshChecks: Array<{
      cycle: number;
      settled: number;
      currentTransferStatus?: string;
      currentTransferTxid?: string | null;
    }>;
    receiverSettledAfter?: number;
    finalTransferStatus?: string;
    finalTransferTxid?: string | null;
    txidMatch?: boolean;
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

  const senderFunding = await fundWallet(sender);
  state.senderAddress = senderFunding.address;

  const assetSuffix = Date.now().toString().slice(-6);
  const issuedAsset = await sender.issueAssetNia({
    ticker: `R${assetSuffix.slice(-5)}`,
    name: `Delayed ${assetSuffix}`,
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
    `Issued asset ${state.assetId} did not become spendable in time`
  );
  state.senderSpendableBefore = Number(senderBalance.spendable ?? 0);

  const receiverFunding = await fundWallet(receiver);
  state.receiverAddress = receiverFunding.address;
  await receiver.refreshWallet();
  const receiverBalance = await receiver
    .getAssetBalance(state.assetId)
    .catch(() => ({
      settled: 0,
    }));
  state.receiverSettledBefore = Number(receiverBalance.settled ?? 0);
});

afterAll(async () => {
  await state.sender?.dispose();
  await state.receiver?.dispose();
});

describe('Regtest offline receiver delayed refresh', () => {
  it('keeps receiver offline until sender settles, then reaches Settled after two receiver refreshes', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: DelayedRefreshReport = {
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
        invoice: '',
        recipientId: '',
      },
      phase2: {
        receiverRefreshChecks: [],
      },
    };

    try {
      const invoiceData = await receiver.blindReceive({
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
      });
      report.phase1.txid = sendResult.txid;

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
      report.phase1.ack = ack;
      report.phase1.validated = validated;
      expect(ack).toBe(true);
      expect(validated).toBe(true);

      const senderTransfer = await pollCondition(
        async () => {
          await sender.refreshWallet();
          const transfers = await sender.listTransfers(state.assetId);
          return transfers.find((item) => item.txid === sendResult.txid);
        },
        (transfer) => transfer?.status === 'Settled',
        30_000,
        1_000,
        `Sender transfer txid=${sendResult.txid} did not reach Settled before receiver refresh`
      );
      report.phase1.senderTransferStatusBeforeReceiverRefresh =
        senderTransfer?.status;

      const receiverBalanceWhileOffline = await receiver
        .getAssetBalance(state.assetId)
        .catch(() => ({
          settled: 0,
        }));
      report.phase1.receiverSettledWhileOffline = Number(
        receiverBalanceWhileOffline.settled ?? 0
      );
      expect(report.phase1.receiverSettledWhileOffline).toBe(
        state.receiverSettledBefore
      );

      for (let cycle = 1; cycle <= RECEIVER_REFRESH_COUNT; cycle += 1) {
        await receiver.refreshWallet();
        const balance = await receiver.getAssetBalance(state.assetId);
        const transfers = await receiver.listTransfers(state.assetId);
        const currentTransfer = transfers.find(
          (item) => item.recipientId === invoiceData.recipientId
        );

        report.phase2.receiverRefreshChecks.push({
          cycle,
          settled: Number(balance.settled ?? 0),
          currentTransferStatus: currentTransfer?.status,
          currentTransferTxid: currentTransfer?.txid,
        });
      }

      const finalTransfer = await pollCondition(
        async () => {
          const transfers = await receiver.listTransfers(state.assetId);
          return transfers.find(
            (item) => item.recipientId === invoiceData.recipientId
          );
        },
        (transfer) => transfer?.status === 'Settled',
        10_000,
        500,
        `Receiver transfer recipientId=${invoiceData.recipientId} did not reach Settled after ${RECEIVER_REFRESH_COUNT} refreshes`
      );

      const finalBalance = await receiver.getAssetBalance(state.assetId);
      const receiverSettledAfter = Number(finalBalance.settled ?? 0);
      report.phase2.receiverSettledAfter = receiverSettledAfter;
      report.phase2.finalTransferStatus = finalTransfer?.status;
      report.phase2.finalTransferTxid = finalTransfer?.txid;
      report.phase2.txidMatch = Boolean(
        finalTransfer?.txid && finalTransfer.txid === sendResult.txid
      );

      expect(finalTransfer?.status).toBe('Settled');
      expect(finalTransfer?.txid).toBe(sendResult.txid);
      expect(receiverSettledAfter - state.receiverSettledBefore).toBe(
        TRANSFER_AMOUNT
      );
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(
        report,
        'regtest-offline-receiver-delayed-refresh.json'
      );
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
