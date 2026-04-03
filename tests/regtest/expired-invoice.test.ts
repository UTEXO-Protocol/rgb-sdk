import { proxyRpc, sleep, writeSmokeReport } from '../shared/helpers';
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
const EXPIRY_SECONDS = 1;

type ExpiredInvoiceReport = {
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
    expirationTimestamp?: number | null;
    sendError?: string;
    sendTxid?: string;
    ackAfterSend?: boolean | null;
    validatedAfterSend?: boolean;
    transferStatusAfterSend?: string;
    receiverSettledAfterSend?: number;
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
    ticker: `X${Date.now().toString().slice(-5)}`,
    name: `Expire${Date.now().toString().slice(-5)}`,
    amounts: [10],
    precision: 0,
  });
  state.assetId = issuedAsset.assetId;

  await mine(1);
  await sender.refreshWallet();

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

describe('Regtest expired invoice', () => {
  it('does not allow an expired blind invoice to become a normal settled transfer', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: ExpiredInvoiceReport = {
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
    };

    try {
      const invoiceData = await receiver.blindReceive({
        amount: TRANSFER_AMOUNT,
        minConfirmations: 1,
        durationSeconds: EXPIRY_SECONDS,
      });
      report.phase1.invoice = invoiceData.invoice;
      report.phase1.recipientId = invoiceData.recipientId;
      report.phase1.expirationTimestamp = invoiceData.expirationTimestamp;

      await sleep((EXPIRY_SECONDS + 1) * 1_000);

      try {
        const sendResult = await sender.send({
          invoice: invoiceData.invoice,
          assetId: state.assetId,
          amount: TRANSFER_AMOUNT,
          donation: true,
          feeRate: SEND_FEE_RATE,
          minConfirmations: 1,
        });
        report.phase1.sendTxid = sendResult.txid;
      } catch (error) {
        report.phase1.sendError = String(error);
      }

      if (!report.phase1.sendTxid) {
        expect(report.phase1.sendError).toBeDefined();
        return;
      }

      await mine(1);
      await receiver.refreshWallet();

      const ackAfterSend = await proxyRpc<boolean | null>(
        PROXY_HTTP_URL,
        'ack.get',
        {
          recipient_id: invoiceData.recipientId,
        }
      ).catch(() => null);
      const consignmentAfterSend = await proxyRpc<{ validated?: boolean }>(
        PROXY_HTTP_URL,
        'consignment.get',
        { recipient_id: invoiceData.recipientId }
      ).catch(() => ({ validated: undefined }));
      const transferAfterSend = (
        await receiver.listTransfers(state.assetId)
      ).find((item) => item.recipientId === invoiceData.recipientId);
      const receiverBalance = await receiver
        .getAssetBalance(state.assetId)
        .catch(() => ({ settled: 0 }));
      const receiverSettledAfterSend = Number(receiverBalance.settled ?? 0);

      report.phase1.ackAfterSend = ackAfterSend;
      report.phase1.validatedAfterSend = consignmentAfterSend.validated;
      report.phase1.transferStatusAfterSend = transferAfterSend?.status;
      report.phase1.receiverSettledAfterSend = receiverSettledAfterSend;

      const fullSuccess =
        ackAfterSend === true &&
        consignmentAfterSend.validated === true &&
        transferAfterSend?.status === 'Settled' &&
        receiverSettledAfterSend >=
          state.receiverSettledBefore + TRANSFER_AMOUNT;
      expect(fullSuccess).toBe(false);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(
        report,
        'regtest-expired-invoice.json'
      );
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
