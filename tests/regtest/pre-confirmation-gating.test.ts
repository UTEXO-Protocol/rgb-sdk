import {
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

type PreConfirmationReport = {
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
    invoice: string;
    recipientId: string;
    txid?: string;
    ackBeforeMine?: boolean | null;
    validatedBeforeMine?: boolean;
    transferStatusBeforeMine?: string;
    receiverSettledBeforeMine?: number;
  };
  phase2: {
    ackAfterMine?: boolean;
    validatedAfterMine?: boolean;
    currentTransferStatus?: string;
    currentTransferTxid?: string | null;
    txidMatch?: boolean;
    receiverSettledAfterMine?: number;
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
    ticker: `P${Date.now().toString().slice(-5)}`,
    name: `PreConfirm${Date.now().toString().slice(-5)}`,
    amounts: [10],
    precision: 0,
  });
  state.assetId = issuedAsset.assetId;

  await mine(1);
  await sender.refreshWallet();

  state.receiverAddress = (await fundWallet(receiver)).address;
  await receiver.refreshWallet();
  const receiverBalance = await receiver.getAssetBalance(state.assetId).catch(() => ({ settled: 0 }));
  state.receiverSettledBefore = Number(receiverBalance.settled ?? 0);
});

afterAll(async () => {
  await state.sender?.dispose();
  await state.receiver?.dispose();
});

describe('Regtest pre-confirmation gating', () => {
  it('does not let the receiver settle before the transfer is mined', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: PreConfirmationReport = {
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

      const ackBeforeMine = await proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
        recipient_id: invoiceData.recipientId,
      });
      const consignmentBeforeMine = await proxyRpc<{ validated?: boolean }>(
        PROXY_HTTP_URL,
        'consignment.get',
        { recipient_id: invoiceData.recipientId },
      );
      report.phase1.ackBeforeMine = ackBeforeMine;
      report.phase1.validatedBeforeMine = consignmentBeforeMine.validated;
      expect(ackBeforeMine).toBe(true);
      expect(consignmentBeforeMine.validated).toBe(true);

      await receiver.refreshWallet();
      const transferBeforeMine = (await receiver.listTransfers(state.assetId)).find(
        (item) => item.recipientId === invoiceData.recipientId,
      );
      report.phase1.transferStatusBeforeMine = transferBeforeMine?.status;
      expect(transferBeforeMine?.status).toBe('WaitingConfirmations');

      const balanceBeforeMine = await receiver.getAssetBalance(state.assetId).catch(() => ({ settled: 0 }));
      const receiverSettledBeforeMine = Number(balanceBeforeMine.settled ?? 0);
      report.phase1.receiverSettledBeforeMine = receiverSettledBeforeMine;
      expect(receiverSettledBeforeMine).toBe(state.receiverSettledBefore);

      await mine(1);

      const ackAfterMine = await pollAck(PROXY_HTTP_URL, invoiceData.recipientId, 15_000, 500);
      const validatedAfterMine = await pollValidated(
        PROXY_HTTP_URL,
        invoiceData.recipientId,
        15_000,
        500,
      );
      report.phase2.ackAfterMine = ackAfterMine;
      report.phase2.validatedAfterMine = validatedAfterMine;

      const currentTransfer = await pollTransferByRecipientId(
        async () => {
          await receiver.refreshWallet();
          return receiver.listTransfers(state.assetId);
        },
        invoiceData.recipientId,
        sendResult.txid,
        20_000,
        1_000,
      );
      report.phase2.currentTransferStatus = currentTransfer.status;
      report.phase2.currentTransferTxid = currentTransfer.txid ?? null;
      report.phase2.txidMatch = currentTransfer.txid === sendResult.txid;

      const balanceAfterMine = await receiver.getAssetBalance(state.assetId);
      const receiverSettledAfterMine = Number(balanceAfterMine.settled ?? 0);
      report.phase2.receiverSettledAfterMine = receiverSettledAfterMine;

      expect(ackAfterMine).toBe(true);
      expect(validatedAfterMine).toBe(true);
      expect(currentTransfer.status).toBe('Settled');
      expect(receiverSettledAfterMine - state.receiverSettledBefore).toBe(
        TRANSFER_AMOUNT,
      );
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-pre-confirmation-gating.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
