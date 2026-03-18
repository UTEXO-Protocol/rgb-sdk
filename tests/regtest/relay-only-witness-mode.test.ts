import { jest } from '@jest/globals';

import {
  pollCondition,
  pollTransferByRecipientId,
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
import { restoreStandardProxy, switchToRelayOnlyProxy } from './proxy-fixture';

const PROXY_HTTP_URL = getRegtestProxyHttpUrl();
const TRANSFER_AMOUNT = 1;
const SEND_FEE_RATE = 2;
const WITNESS_AMOUNT_SAT = 1_000;
const RELAY_ONLY_WITNESS_TIMEOUT_MS = 60_000;

jest.setTimeout(RELAY_ONLY_WITNESS_TIMEOUT_MS);

type RelayOnlyWitnessReport = {
  timestamp: string;
  durationMs: number;
  preconditions: {
    proxyHttpUrl: string;
    proxyRpcUrl: string;
    indexerUrl: string;
    composeFile: string;
    assetId: string;
    senderAddress: string;
    receiverAddress: string;
  };
  phase1: {
    invoiceType: 'witness';
    witnessAmountSat: number;
    invoice: string;
    recipientId: string;
    txid?: string;
    ackBeforeRefresh?: boolean | null;
    validatedBeforeRefresh?: boolean;
    transferStatusAfterRefresh?: string;
    ackAfterReceiverRefresh?: boolean | null;
    lateManualAckPosted?: boolean;
    ackAfterLateManual?: boolean | null;
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
  composeFile: string;
};

const state: State = {
  sender: null,
  receiver: null,
  senderAddress: '',
  receiverAddress: '',
  assetId: '',
  composeFile: '',
};

beforeAll(async () => {
  env('REGTEST_PROXY_HTTP_URL');
  env('REGTEST_PROXY_RPC_URL');
  env('REGTEST_INDEXER_URL');
  env('REGTEST_BITCOIND_USER');
  env('REGTEST_BITCOIND_PASS');
  state.composeFile = env('REGTEST_PLAYGROUND_COMPOSE_FILE');
  ensureBitcoindAccess();

  await switchToRelayOnlyProxy(state.composeFile, PROXY_HTTP_URL);
  resetWalletDataDirs(getRegtestBaseDir());

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
    ticker: `Q${Date.now().toString().slice(-5)}`,
    name: `RelayWit${Date.now().toString().slice(-5)}`,
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
    15_000,
    500,
    `Issued relay-only witness asset ${state.assetId} did not become spendable in time`,
  );

  state.receiverAddress = (await fundWallet(receiver)).address;
});

afterAll(async () => {
  await state.sender?.dispose();
  await state.receiver?.dispose();
  await restoreStandardProxy(state.composeFile, PROXY_HTTP_URL);
});

describe('Regtest relay-only witness mode', () => {
  it('receiver refresh imports witness transfer and makes late manual ACK a no-op', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: RelayOnlyWitnessReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        proxyHttpUrl: PROXY_HTTP_URL,
        proxyRpcUrl: getRegtestProxyRpcUrl(),
        indexerUrl: getRegtestIndexerUrl(),
        composeFile: state.composeFile,
        assetId: state.assetId,
        senderAddress: state.senderAddress,
        receiverAddress: state.receiverAddress,
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
      await pollCondition(
        async () => {
          try {
            return await proxyRpc<{ validated?: boolean }>(PROXY_HTTP_URL, 'consignment.get', {
              recipient_id: invoiceData.recipientId,
            });
          } catch {
            return null;
          }
        },
        (consignment) => consignment !== null,
        5_000,
        250,
        `Consignment did not appear for witness recipient_id=${invoiceData.recipientId}`,
      );

      const ackBeforeRefresh = await proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
        recipient_id: invoiceData.recipientId,
      });
      const consignmentBeforeRefresh = await proxyRpc<{ validated?: boolean }>(
        PROXY_HTTP_URL,
        'consignment.get',
        { recipient_id: invoiceData.recipientId },
      );
      report.phase1.ackBeforeRefresh = ackBeforeRefresh;
      report.phase1.validatedBeforeRefresh = consignmentBeforeRefresh.validated;

      expect(ackBeforeRefresh).toBeNull();
      expect(consignmentBeforeRefresh.validated).toBeUndefined();

      await receiver.refreshWallet();
      const transferAfterRefresh = (await receiver.listTransfers(state.assetId)).find(
        (item) => item.recipientId === invoiceData.recipientId,
      );
      report.phase1.transferStatusAfterRefresh = transferAfterRefresh?.status;
      expect(transferAfterRefresh?.status).toBe('WaitingConfirmations');

      const ackAfterReceiverRefresh = await pollCondition(
        async () =>
          proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
            recipient_id: invoiceData.recipientId,
          }),
        (ack) => ack === true,
        5_000,
        500,
        `Receiver refresh did not ACK witness recipient_id=${invoiceData.recipientId}`,
      );
      report.phase1.ackAfterReceiverRefresh = ackAfterReceiverRefresh;
      expect(ackAfterReceiverRefresh).toBe(true);

      const lateManualAckPosted = await proxyRpc<boolean>(PROXY_HTTP_URL, 'ack.post', {
        recipient_id: invoiceData.recipientId,
        ack: true,
      });
      report.phase1.lateManualAckPosted = lateManualAckPosted;
      expect(lateManualAckPosted).toBe(false);

      const ackAfterLateManual = await proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
        recipient_id: invoiceData.recipientId,
      });
      report.phase1.ackAfterLateManual = ackAfterLateManual;
      expect(ackAfterLateManual).toBe(true);

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
      report.phase1.currentTransferStatus = currentTransfer.status;
      report.phase1.currentTransferTxid = currentTransfer.txid ?? null;
      report.phase1.txidMatch = currentTransfer.txid === sendResult.txid;

      const balance = await receiver.getAssetBalance(state.assetId);
      report.phase1.receiverSettledAfter = Number(balance.settled ?? 0);

      expect(currentTransfer.status).toBe('Settled');
      expect(currentTransfer.txid).toBe(sendResult.txid);
      expect(report.phase1.receiverSettledAfter).toBeGreaterThanOrEqual(TRANSFER_AMOUNT);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-relay-only-witness-mode.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
