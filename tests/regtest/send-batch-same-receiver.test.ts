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
const PROXY_RPC_URL = getRegtestProxyRpcUrl();
const TRANSFER_AMOUNT = 1;
const SEND_FEE_RATE = 2;

type SendBatchReport = {
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
    batchTxid?: string;
    ackA?: boolean;
    ackB?: boolean;
    validatedA?: boolean;
    validatedB?: boolean;
    transferStatusA?: string;
    transferStatusB?: string;
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
    ticker: `SB${Date.now().toString().slice(-4)}`,
    name: `SendBatch${Date.now().toString().slice(-6)}`,
    amounts: [10, 10],
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

describe('Regtest sendBatch to same receiver', () => {
  it('settles two invoices in one batch transaction', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: SendBatchReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        proxyHttpUrl: PROXY_HTTP_URL,
        proxyRpcUrl: PROXY_RPC_URL,
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

      const sendResult = await sender.sendBatch({
        recipientMap: {
          [state.assetId]: [
            {
              recipientId: invoiceA.recipientId,
              witnessData: null,
              assignment: { Fungible: TRANSFER_AMOUNT },
              transportEndpoints: [PROXY_RPC_URL],
            },
            {
              recipientId: invoiceB.recipientId,
              witnessData: null,
              assignment: { Fungible: TRANSFER_AMOUNT },
              transportEndpoints: [PROXY_RPC_URL],
            },
          ],
        },
        donation: true,
        feeRate: SEND_FEE_RATE,
        minConfirmations: 1,
      });
      report.phase1.batchTxid = sendResult.txid;

      await mine(1);

      report.phase1.ackA = await pollAck(
        PROXY_HTTP_URL,
        invoiceA.recipientId,
        30_000,
        1_000
      );
      report.phase1.ackB = await pollAck(
        PROXY_HTTP_URL,
        invoiceB.recipientId,
        30_000,
        1_000
      );
      report.phase1.validatedA = await pollValidated(
        PROXY_HTTP_URL,
        invoiceA.recipientId,
        30_000,
        1_000
      );
      report.phase1.validatedB = await pollValidated(
        PROXY_HTTP_URL,
        invoiceB.recipientId,
        30_000,
        1_000
      );

      const transferA = await pollTransferByRecipientId(
        async () => {
          await receiver.refreshWallet();
          return receiver.listTransfers(state.assetId);
        },
        invoiceA.recipientId,
        sendResult.txid,
        30_000,
        1_000
      );
      const transferB = await pollTransferByRecipientId(
        async () => {
          await receiver.refreshWallet();
          return receiver.listTransfers(state.assetId);
        },
        invoiceB.recipientId,
        sendResult.txid,
        30_000,
        1_000
      );
      report.phase1.transferStatusA = transferA.status;
      report.phase1.transferStatusB = transferB.status;

      expect(report.phase1.ackA).toBe(true);
      expect(report.phase1.ackB).toBe(true);
      expect(report.phase1.validatedA).toBe(true);
      expect(report.phase1.validatedB).toBe(true);
      expect(report.phase1.transferStatusA).toBe('Settled');
      expect(report.phase1.transferStatusB).toBe('Settled');

      const receiverBalance = await receiver.getAssetBalance(state.assetId);
      const receiverSettledAfter = Number(receiverBalance.settled ?? 0);
      const receiverDelta = receiverSettledAfter - state.receiverSettledBefore;
      report.phase2.receiverSettledAfter = receiverSettledAfter;
      report.phase2.receiverDelta = receiverDelta;

      expect(receiverDelta).toBe(TRANSFER_AMOUNT * 2);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(
        report,
        'regtest-send-batch-same-receiver.json'
      );
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
