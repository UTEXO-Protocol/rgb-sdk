import {
  pollAck,
  pollCondition,
  pollTransferByRecipientId,
  pollValidated,
  proxyRpc,
  sleep,
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
const EXPIRY_SECONDS = 6;
const SEND_BEFORE_EXPIRY_SECONDS = 1;

type ExpiryRaceReport = {
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
    expirySeconds: number;
    sendBeforeExpirySeconds: number;
  };
  phase1: {
    invoice: string;
    recipientId: string;
    expirationTimestamp?: number | null;
    waitToBoundaryMs?: number;
    sendError?: string;
    sendTxid?: string;
    transferStatusAfterSend?: string;
    ackAfterSend?: boolean | null;
    validatedAfterSend?: boolean;
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
    ticker: `ER${Date.now().toString().slice(-4)}`,
    name: `ExpiryRace${Date.now().toString().slice(-6)}`,
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

describe('Regtest expiry race near boundary', () => {
  it('send near invoice expiry is coherent: either sender-side reject or terminal transfer outcome', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: ExpiryRaceReport = {
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
        expirySeconds: EXPIRY_SECONDS,
        sendBeforeExpirySeconds: SEND_BEFORE_EXPIRY_SECONDS,
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

      const expirationTimestamp = Number(
        (invoiceData as { expirationTimestamp?: number | null }).expirationTimestamp ?? 0,
      );
      report.phase1.expirationTimestamp = expirationTimestamp || null;
      if (expirationTimestamp > 0) {
        const targetBoundaryMs =
          expirationTimestamp * 1_000 - SEND_BEFORE_EXPIRY_SECONDS * 1_000;
        const waitToBoundaryMs = Math.max(targetBoundaryMs - Date.now(), 0);
        report.phase1.waitToBoundaryMs = waitToBoundaryMs;
        if (waitToBoundaryMs > 0) {
          await sleep(waitToBoundaryMs);
        }
      } else {
        console.warn(
          'expirationTimestamp not available — boundary timing skipped, testing early send only'
        );
      }

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

      const currentTransfer = await pollCondition(
        async () => {
          await receiver.refreshWallet();
          return receiver
            .listTransfers(state.assetId)
            .then((items) =>
              items.find((item) => item.recipientId === invoiceData.recipientId),
            );
        },
        (transfer) =>
          transfer?.status === 'Settled' ||
          transfer?.status === 'Failed',
        30_000,
        1_000,
        `Transfer for recipient_id=${invoiceData.recipientId} did not reach a terminal status`,
      );
      report.phase1.transferStatusAfterSend = currentTransfer?.status;
      expect(currentTransfer).toBeDefined();

      const receiverBalance = await receiver.getAssetBalance(state.assetId).catch(() => ({ settled: 0 }));
      const receiverSettledAfterSend = Number(receiverBalance.settled ?? 0);
      report.phase1.receiverSettledAfterSend = receiverSettledAfterSend;

      if (currentTransfer?.status === 'Settled') {
        const ack = await pollAck(PROXY_HTTP_URL, invoiceData.recipientId, 30_000, 1_000);
        const validated = await pollValidated(
          PROXY_HTTP_URL,
          invoiceData.recipientId,
          30_000,
          1_000,
        );
        report.phase1.ackAfterSend = ack;
        report.phase1.validatedAfterSend = validated;
        expect(ack).toBe(true);
        expect(validated).toBe(true);
        expect(receiverSettledAfterSend - state.receiverSettledBefore).toBeGreaterThanOrEqual(
          TRANSFER_AMOUNT,
        );
      } else {
        const ack = await proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
          recipient_id: invoiceData.recipientId,
        }).catch(() => null);
        const validated = await proxyRpc<{ validated?: boolean }>(
          PROXY_HTTP_URL,
          'consignment.get',
          { recipient_id: invoiceData.recipientId },
        )
          .then((consignment) => consignment.validated)
          .catch(() => undefined);
        report.phase1.ackAfterSend = ack;
        report.phase1.validatedAfterSend = validated;
        expect(receiverSettledAfterSend).toBe(state.receiverSettledBefore);
      }
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-expiry-race-near-boundary.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
