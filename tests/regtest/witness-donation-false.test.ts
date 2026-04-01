import {
  pollCondition,
  pollTransferByRecipientId,
  proxyRpc,
  writeSmokeReport,
} from '../shared/helpers';
import {
  bitcoindRpc,
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
const WITNESS_AMOUNT_SAT = 1_000;

type WitnessDonationFalseReport = {
  timestamp: string;
  durationMs: number;
  preconditions: {
    proxyHttpUrl: string;
    proxyRpcUrl: string;
    indexerUrl: string;
    assetId: string;
    senderAddress: string;
    receiverAddress: string;
    receiverSettledBefore: number;
  };
  phase1: {
    invoiceType: 'witness';
    witnessAmountSat: number;
    invoice: string;
    recipientId: string;
    unsignedPsbtLength?: number;
    txid?: string;
    ackBeforeRefresh?: boolean | null;
    txKnownBeforeRefresh?: boolean;
    transferStatusAfterRefresh?: string;
    receiverSettledAfterRefresh?: number;
    ackAfterRefresh?: boolean | null;
    lateManualAckPosted?: boolean;
    txKnownAfterReceiverRefresh?: boolean;
    txKnownAfterSenderRefresh?: boolean;
    currentTransferStatus?: string;
    currentTransferTxid?: string | null;
    txidMatch?: boolean;
    receiverSettledAfter?: number;
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

async function isTransactionKnown(txid: string): Promise<boolean> {
  try {
    await bitcoindRpc('getrawtransaction', [txid]);
    return true;
  } catch {
    return false;
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
    ticker: `WD${Date.now().toString().slice(-4)}`,
    name: `WitDonate${Date.now().toString().slice(-6)}`,
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

describe('Regtest witness donation=false flow', () => {
  it('broadcasts witness transfer only after receiver ACK path and sender refresh run', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: WitnessDonationFalseReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        proxyHttpUrl: PROXY_HTTP_URL,
        proxyRpcUrl: getRegtestProxyRpcUrl(),
        indexerUrl: getRegtestIndexerUrl(),
        assetId: state.assetId,
        senderAddress: state.senderAddress,
        receiverAddress: state.receiverAddress,
        receiverSettledBefore: state.receiverSettledBefore,
      },
      phase1: {
        invoiceType: 'witness',
        witnessAmountSat: WITNESS_AMOUNT_SAT,
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

      const unsignedPsbt = await sender.sendBegin({
        invoice: invoiceData.invoice,
        assetId: state.assetId,
        amount: TRANSFER_AMOUNT,
        donation: false,
        feeRate: SEND_FEE_RATE,
        minConfirmations: 1,
        witnessData: { amountSat: WITNESS_AMOUNT_SAT },
      });
      report.phase1.unsignedPsbtLength = unsignedPsbt.length;
      expect(unsignedPsbt.length).toBeGreaterThan(0);

      const signedPsbt = await sender.signPsbt(unsignedPsbt);
      const sendResult = await sender.sendEnd({ signedPsbt });
      report.phase1.txid = sendResult.txid;

      const ackBeforeRefresh = await proxyRpc<boolean | null>(
        PROXY_HTTP_URL,
        'ack.get',
        {
          recipient_id: invoiceData.recipientId,
        }
      );
      report.phase1.ackBeforeRefresh = ackBeforeRefresh;
      expect([null, true]).toContain(ackBeforeRefresh);

      const txKnownBeforeRefresh = await isTransactionKnown(sendResult.txid);
      report.phase1.txKnownBeforeRefresh = txKnownBeforeRefresh;
      expect(txKnownBeforeRefresh).toBe(false);

      await receiver.refreshWallet();
      const transferAfterRefresh = (
        await receiver.listTransfers(state.assetId)
      ).find((item) => item.recipientId === invoiceData.recipientId);
      report.phase1.transferStatusAfterRefresh = transferAfterRefresh?.status;
      const receiverBalanceAfterRefresh = await receiver.getAssetBalance(
        state.assetId
      );
      const receiverSettledAfterRefresh = Number(
        receiverBalanceAfterRefresh.settled ?? 0
      );
      report.phase1.receiverSettledAfterRefresh = receiverSettledAfterRefresh;
      expect(transferAfterRefresh?.status).toBe('WaitingConfirmations');
      expect(receiverSettledAfterRefresh).toBe(state.receiverSettledBefore);

      const ackAfterRefresh = await pollCondition(
        async () =>
          proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
            recipient_id: invoiceData.recipientId,
          }),
        (ack) => ack === true,
        10_000,
        500,
        `Receiver-side witness ACK did not appear for recipient_id=${invoiceData.recipientId}`
      );
      report.phase1.ackAfterRefresh = ackAfterRefresh;
      expect(ackAfterRefresh).toBe(true);

      const lateManualAckPosted = await proxyRpc<boolean>(
        PROXY_HTTP_URL,
        'ack.post',
        {
          recipient_id: invoiceData.recipientId,
          ack: true,
        }
      );
      report.phase1.lateManualAckPosted = lateManualAckPosted;
      expect(lateManualAckPosted).toBe(false);

      const txKnownAfterReceiverRefresh = await isTransactionKnown(
        sendResult.txid
      );
      report.phase1.txKnownAfterReceiverRefresh = txKnownAfterReceiverRefresh;
      expect(txKnownAfterReceiverRefresh).toBe(false);

      const txKnownAfterSenderRefresh = await pollCondition(
        async () => {
          await sender.refreshWallet();
          return isTransactionKnown(sendResult.txid);
        },
        (known) => known === true,
        10_000,
        500,
        `witness donation=false tx ${sendResult.txid} did not reach mempool/chain after sender refresh`
      );
      report.phase1.txKnownAfterSenderRefresh = txKnownAfterSenderRefresh;
      expect(txKnownAfterSenderRefresh).toBe(true);

      await mine(1);

      const currentTransfer = await pollTransferByRecipientId(
        async () => {
          await receiver.refreshWallet();
          return receiver.listTransfers(state.assetId);
        },
        invoiceData.recipientId,
        sendResult.txid,
        20_000,
        1_000
      );
      report.phase1.currentTransferStatus = currentTransfer.status;
      report.phase1.currentTransferTxid = currentTransfer.txid ?? null;
      report.phase1.txidMatch = currentTransfer.txid === sendResult.txid;

      const receiverBalance = await receiver.getAssetBalance(state.assetId);
      const receiverSettledAfter = Number(receiverBalance.settled ?? 0);
      report.phase1.receiverSettledAfter = receiverSettledAfter;

      expect(currentTransfer.status).toBe('Settled');
      expect(currentTransfer.txid).toBe(sendResult.txid);
      expect(receiverSettledAfter - state.receiverSettledBefore).toBe(
        TRANSFER_AMOUNT
      );
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(
        report,
        'regtest-witness-donation-false.json'
      );
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
