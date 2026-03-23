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
  createRegtestWalletFromKeys,
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
  type RegtestKeys,
  type RegtestWallet,
  type WalletManagerCtor,
} from './helpers';

const PROXY_HTTP_URL = getRegtestProxyHttpUrl();
const TRANSFER_AMOUNT = 1;
const SEND_FEE_RATE = 2;

type TransferViewSnapshot = {
  unfilteredStatus?: string;
  filteredStatus?: string;
  filteredError?: string | null;
  unfilteredCount: number;
  filteredCount?: number;
};

type RestartMidFlowReport = {
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
    invoice: string;
    recipientId: string;
    txid?: string;
    ackBeforeRestart?: boolean | null;
    transferStatusBeforeRestart?: string;
  };
  phase2: {
    receiverRecreated?: boolean;
    transferStatusAfterRestartBeforeRefresh?: string;
    ackAfterRefresh?: boolean;
    validatedAfterRefresh?: boolean;
    transferStatusAfterRefresh?: string;
    filteredTransferStatusAfterRefresh?: string;
    filteredTransferErrorAfterRefresh?: string | null;
    postRefreshSnapshots?: TransferViewSnapshot[];
    currentTransferStatus?: string;
    currentTransferTxid?: string | null;
    txidMatch?: boolean;
    receiverSettledAfter?: number;
  };
};

type State = {
  walletManagerCtor: WalletManagerCtor | null;
  sender: RegtestWallet | null;
  receiver: RegtestWallet | null;
  receiverKeys: RegtestKeys | null;
  senderAddress: string;
  receiverAddress: string;
  assetId: string;
  receiverSettledBefore: number;
};

const state: State = {
  walletManagerCtor: null,
  sender: null,
  receiver: null,
  receiverKeys: null,
  senderAddress: '',
  receiverAddress: '',
  assetId: '',
  receiverSettledBefore: 0,
};

async function restartReceiver(): Promise<RegtestWallet> {
  const walletCtor = state.walletManagerCtor!;
  const receiverKeys = state.receiverKeys!;
  await state.receiver?.dispose();
  const receiver = await createRegtestWalletFromKeys(
    walletCtor,
    receiverKeys,
    'receiver',
    getRegtestBaseDir(),
  );
  state.receiver = receiver;
  return receiver;
}

async function snapshotTransferViews(
  wallet: RegtestWallet,
  recipientId: string,
  assetId: string,
): Promise<TransferViewSnapshot> {
  const unfilteredTransfers = await wallet.listTransfers();
  const unfilteredTransfer = unfilteredTransfers.find(
    (item) => item.recipientId === recipientId,
  );

  try {
    const filteredTransfers = await wallet.listTransfers(assetId);
    const filteredTransfer = filteredTransfers.find(
      (item) => item.recipientId === recipientId,
    );
    return {
      unfilteredStatus: unfilteredTransfer?.status,
      filteredStatus: filteredTransfer?.status,
      filteredError: null,
      unfilteredCount: unfilteredTransfers.length,
      filteredCount: filteredTransfers.length,
    };
  } catch (error) {
    return {
      unfilteredStatus: unfilteredTransfer?.status,
      filteredStatus: undefined,
      filteredError: String(error),
      unfilteredCount: unfilteredTransfers.length,
    };
  }
}

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
  state.walletManagerCtor = WalletManager;

  const { wallet: sender } = await createRegtestWallet(WalletManager, generateKeys, 'sender');
  const { wallet: receiver, keys: receiverKeys } = await createRegtestWallet(
    WalletManager,
    generateKeys,
    'receiver',
  );
  state.sender = sender;
  state.receiver = receiver;
  state.receiverKeys = receiverKeys;

  state.senderAddress = (await fundWallet(sender)).address;
  const issuedAsset = await sender.issueAssetNia({
    ticker: `RM${Date.now().toString().slice(-4)}`,
    name: `RestartMidFlow${Date.now().toString().slice(-6)}`,
    amounts: [10],
    precision: 0,
  });
  state.assetId = issuedAsset.assetId;

  await mine(1);
  await pollCondition(
    async () => {
      await sender.refreshWallet();
      return sender.getAssetBalance(state.assetId);
    },
    (balance) => Number(balance.spendable ?? 0) >= TRANSFER_AMOUNT,
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

describe('Regtest receiver restart mid-flow', () => {
  it('recreates receiver before the first refresh and still converges from WaitingCounterparty to Settled', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: RestartMidFlowReport = {
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
        invoice: '',
        recipientId: '',
      },
      phase2: {},
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

      const ackBeforeRestart = await proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
        recipient_id: invoiceData.recipientId,
      });
      report.phase1.ackBeforeRestart = ackBeforeRestart;

      const transferBeforeRestart = (await receiver.listTransfers()).find(
        (item) => item.recipientId === invoiceData.recipientId,
      );
      report.phase1.transferStatusBeforeRestart = transferBeforeRestart?.status;
      expect(transferBeforeRestart?.status).toBe('WaitingCounterparty');

      const restartedReceiver = await restartReceiver();
      report.phase2.receiverRecreated = true;

      const transferAfterRestartBeforeRefresh = (
        await restartedReceiver.listTransfers()
      ).find((item) => item.recipientId === invoiceData.recipientId);
      report.phase2.transferStatusAfterRestartBeforeRefresh =
        transferAfterRestartBeforeRefresh?.status;
      expect(transferAfterRestartBeforeRefresh?.status).toBe('WaitingCounterparty');

      await restartedReceiver.refreshWallet();

      const ackAfterRefresh = await pollAck(
        PROXY_HTTP_URL,
        invoiceData.recipientId,
        30_000,
        1_000
      );
      const validatedAfterRefresh = await pollValidated(
        PROXY_HTTP_URL,
        invoiceData.recipientId,
        30_000,
        1_000
      );
      report.phase2.ackAfterRefresh = ackAfterRefresh;
      report.phase2.validatedAfterRefresh = validatedAfterRefresh;
      expect(ackAfterRefresh).toBe(true);
      expect(validatedAfterRefresh).toBe(true);

      const postRefreshSnapshots: TransferViewSnapshot[] = [];
      let transferAfterRefresh: TransferViewSnapshot;
      try {
        transferAfterRefresh = await pollCondition(
          async () => {
            const snapshot = await snapshotTransferViews(
              restartedReceiver,
              invoiceData.recipientId,
              state.assetId,
            );
            postRefreshSnapshots.push(snapshot);
            if (postRefreshSnapshots.length > 12) {
              postRefreshSnapshots.shift();
            }
            return snapshot;
          },
          (snapshot) =>
            snapshot.unfilteredStatus === 'WaitingConfirmations' ||
            snapshot.filteredStatus === 'WaitingConfirmations',
          10_000,
          250,
          `Transfer for recipient_id=${invoiceData.recipientId} did not become visible in WaitingConfirmations after recreate+refresh`,
        );
      } catch (error) {
        report.phase2.postRefreshSnapshots = postRefreshSnapshots;
        throw new Error(
          `After recreate+refresh, transfer for recipient_id=${invoiceData.recipientId} was not visible in WaitingConfirmations.\nSnapshots=${JSON.stringify(
            postRefreshSnapshots,
            null,
            2,
          )}\nOriginal error=${String(error)}`
        );
      }

      report.phase2.postRefreshSnapshots = postRefreshSnapshots;
      report.phase2.transferStatusAfterRefresh = transferAfterRefresh.unfilteredStatus;
      report.phase2.filteredTransferStatusAfterRefresh = transferAfterRefresh.filteredStatus;
      report.phase2.filteredTransferErrorAfterRefresh = transferAfterRefresh.filteredError;
      expect(transferAfterRefresh.unfilteredStatus).toBe('WaitingConfirmations');
      expect(transferAfterRefresh.filteredStatus).toBe('WaitingConfirmations');

      await mine(1);

      const currentTransfer = await pollTransferByRecipientId(
        async () => {
          await restartedReceiver.refreshWallet();
          return restartedReceiver.listTransfers(state.assetId);
        },
        invoiceData.recipientId,
        sendResult.txid,
        30_000,
        1_000,
      );
      report.phase2.currentTransferStatus = currentTransfer.status;
      report.phase2.currentTransferTxid = currentTransfer.txid ?? null;
      report.phase2.txidMatch = currentTransfer.txid === sendResult.txid;

      const balance = await restartedReceiver.getAssetBalance(state.assetId);
      const receiverSettledAfter = Number(balance.settled ?? 0);
      report.phase2.receiverSettledAfter = receiverSettledAfter;

      expect(currentTransfer.status).toBe('Settled');
      expect(currentTransfer.txid).toBe(sendResult.txid);
      expect(receiverSettledAfter - state.receiverSettledBefore).toBe(
        TRANSFER_AMOUNT,
      );
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-restart-mid-flow.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
