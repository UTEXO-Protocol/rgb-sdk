import { jest } from '@jest/globals';

import {
  pollCondition,
  pollTransferByRecipientId,
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
import { restoreStandardProxy, switchToRelayOnlyProxy } from './proxy-fixture';

const PROXY_HTTP_URL = getRegtestProxyHttpUrl();
const TRANSFER_AMOUNT = 1;
const SEND_FEE_RATE = 2;
const RELAY_ONLY_SUITE_TIMEOUT_MS = 60_000;
const ASSET_READY_TIMEOUT_MS = 15_000;
const ASSET_READY_INTERVAL_MS = 500;
const RELAY_TRANSFER_TIMEOUT_MS = 20_000;
const RELAY_TRANSFER_INTERVAL_MS = 1_000;

jest.setTimeout(RELAY_ONLY_SUITE_TIMEOUT_MS);

type RelayOnlyReport = {
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
    invoice: string;
    recipientId: string;
    txid?: string;
    ackBeforeManual?: boolean | null;
    validatedBeforeManual?: boolean;
    manualAckPosted?: boolean;
    ackAfterManual?: boolean | null;
  };
  phase2?: {
    assetId: string;
    invoice: string;
    recipientId: string;
    txid?: string;
    ackBeforeManual?: boolean | null;
    receiverSettledBefore: number;
    receiverSettledBeforeManualAck?: number;
    transferStatusBeforeManual?: string;
    ackAfterReceiverRefresh?: boolean | null;
    lateManualAckPosted?: boolean;
    ackAfterLateManual?: boolean | null;
    currentTransferStatus?: string;
    currentTransferTxid?: string | null;
    txidMatch?: boolean;
    receiverSettledAfterManualAck?: number;
    refreshChecks?: Array<{ cycle: number; settled: number }>;
    receiverSettledFinal?: number;
  };
};

type State = {
  sender: RegtestWallet | null;
  receiver: RegtestWallet | null;
  senderAddress: string;
  receiverAddress: string;
  assetId: string;
  phase2AssetId: string;
  composeFile: string;
};

const state: State = {
  sender: null,
  receiver: null,
  senderAddress: '',
  receiverAddress: '',
  assetId: '',
  phase2AssetId: '',
  composeFile: '',
};

beforeAll(async () => {
  env('REGTEST_PROXY_HTTP_URL');
  env('REGTEST_PROXY_RPC_URL');
  env('REGTEST_INDEXER_URL');
  env('REGTEST_BITCOIND_USER');
  env('REGTEST_BITCOIND_PASS');
  env('REGTEST_PLAYGROUND_COMPOSE_FILE');
  ensureBitcoindAccess();

  state.composeFile = env('REGTEST_PLAYGROUND_COMPOSE_FILE');
  await switchToRelayOnlyProxy(state.composeFile, PROXY_HTTP_URL);

  resetWalletDataDirs(getRegtestBaseDir());

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

  state.senderAddress = (await fundWallet(sender)).address;

  const issuedAsset = await sender.issueAssetNia({
    ticker: `L${Date.now().toString().slice(-5)}`,
    name: `Regtest RelayOnly Asset ${Date.now()}`,
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
    ASSET_READY_TIMEOUT_MS,
    ASSET_READY_INTERVAL_MS,
    `Issued relay-only asset ${state.assetId} did not become spendable in time`,
  );

  const phase2Asset = await sender.issueAssetNia({
    ticker: `M${Date.now().toString().slice(-5)}`,
    name: `RelayManual${Date.now().toString().slice(-5)}`,
    amounts: [10],
    precision: 0,
  });
  state.phase2AssetId = phase2Asset.assetId;

  await mine(1);
  await pollCondition(
    async () => {
      await sender.refreshWallet();
      return sender.getAssetBalance(state.phase2AssetId);
    },
    (balance) => Number(balance.spendable ?? 0) >= TRANSFER_AMOUNT,
    ASSET_READY_TIMEOUT_MS,
    ASSET_READY_INTERVAL_MS,
    `Issued relay-only manual-ack asset ${state.phase2AssetId} did not become spendable in time`,
  );

  state.receiverAddress = (await fundWallet(receiver)).address;
});

afterAll(async () => {
  await state.sender?.dispose();
  await state.receiver?.dispose();
  await restoreStandardProxy(state.composeFile, PROXY_HTTP_URL);
});

describe('Regtest relay-only mode', () => {
  it('no INDEXER_URL keeps ack null and still allows manual ACK on a real blind transfer', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: RelayOnlyReport = {
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
        invoice: '',
        recipientId: '',
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
      await sleep(2_000);

      const ackBeforeManual = await proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
        recipient_id: invoiceData.recipientId,
      });
      const consignmentBeforeManual = await proxyRpc<{ validated?: boolean }>(
        PROXY_HTTP_URL,
        'consignment.get',
        {
          recipient_id: invoiceData.recipientId,
        },
      );

      report.phase1.ackBeforeManual = ackBeforeManual;
      report.phase1.validatedBeforeManual = consignmentBeforeManual.validated;

      expect(ackBeforeManual).toBeNull();
      expect(consignmentBeforeManual.validated).toBeUndefined();

      const manualAckPosted = await proxyRpc<boolean>(PROXY_HTTP_URL, 'ack.post', {
        recipient_id: invoiceData.recipientId,
        ack: true,
      });
      report.phase1.manualAckPosted = manualAckPosted;
      expect(manualAckPosted).toBe(true);

      const ackAfterManual = await pollCondition(
        async () =>
          proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
            recipient_id: invoiceData.recipientId,
          }),
        (ack) => ack === true,
        5_000,
        500,
        `Manual ACK did not stick for recipient_id=${invoiceData.recipientId}`,
      );
      report.phase1.ackAfterManual = ackAfterManual;
      expect(ackAfterManual).toBe(true);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-relay-only-mode.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });

  it('receiver refresh imports the transfer and makes late manual ACK a no-op', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const phase2AssetId = state.phase2AssetId;
    const startedAt = Date.now();

    const beforeBalance = await receiver.getAssetBalance(phase2AssetId).catch(() => ({
      settled: 0,
    }));
    const receiverSettledBefore = Number(beforeBalance.settled ?? 0);
    const report: RelayOnlyReport = {
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
        invoice: '',
        recipientId: '',
      },
      phase2: {
        assetId: phase2AssetId,
        invoice: '',
        recipientId: '',
        receiverSettledBefore,
        refreshChecks: [],
      },
    };

    try {
      const invoiceData = await receiver.blindReceive({
        amount: TRANSFER_AMOUNT,
        minConfirmations: 1,
      });
      report.phase2!.invoice = invoiceData.invoice;
      report.phase2!.recipientId = invoiceData.recipientId;

      const sendResult = await sender.send({
        invoice: invoiceData.invoice,
        assetId: phase2AssetId,
        amount: TRANSFER_AMOUNT,
        donation: true,
        feeRate: SEND_FEE_RATE,
        minConfirmations: 1,
      });
      report.phase2!.txid = sendResult.txid;

      await mine(1);
      await sleep(2_000);

      const ackBeforeManual = await proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
        recipient_id: invoiceData.recipientId,
      });
      report.phase2!.ackBeforeManual = ackBeforeManual;
      expect(ackBeforeManual).toBeNull();

      await receiver.refreshWallet();
      const balanceBeforeManualAck = await receiver.getAssetBalance(phase2AssetId);
      const receiverSettledBeforeManualAck = Number(balanceBeforeManualAck.settled ?? 0);
      report.phase2!.receiverSettledBeforeManualAck = receiverSettledBeforeManualAck;
      expect(receiverSettledBeforeManualAck).toBe(receiverSettledBefore);

      const transferBeforeManual = (await receiver.listTransfers(phase2AssetId)).find(
        (item) => item.recipientId === invoiceData.recipientId,
      );
      report.phase2!.transferStatusBeforeManual = transferBeforeManual?.status;
      expect(transferBeforeManual?.status).toBe('WaitingConfirmations');

      const ackAfterReceiverRefresh = await pollCondition(
        async () =>
          proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
            recipient_id: invoiceData.recipientId,
          }),
        (ack) => ack === true,
        5_000,
        500,
        `Receiver refresh did not ACK recipient_id=${invoiceData.recipientId}`,
      );
      report.phase2!.ackAfterReceiverRefresh = ackAfterReceiverRefresh;
      expect(ackAfterReceiverRefresh).toBe(true);

      const lateManualAckPosted = await proxyRpc<boolean>(PROXY_HTTP_URL, 'ack.post', {
        recipient_id: invoiceData.recipientId,
        ack: true,
      });
      report.phase2!.lateManualAckPosted = lateManualAckPosted;
      expect(lateManualAckPosted).toBe(false);

      const ackAfterLateManual = await proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
        recipient_id: invoiceData.recipientId,
      });
      report.phase2!.ackAfterLateManual = ackAfterLateManual;
      expect(ackAfterLateManual).toBe(true);

      const currentTransfer = await pollTransferByRecipientId(
        async () => {
          await receiver.refreshWallet();
          return receiver.listTransfers(phase2AssetId);
        },
        invoiceData.recipientId,
        sendResult.txid,
        RELAY_TRANSFER_TIMEOUT_MS,
        RELAY_TRANSFER_INTERVAL_MS,
      );
      report.phase2!.currentTransferStatus = currentTransfer.status;
      report.phase2!.currentTransferTxid = currentTransfer.txid ?? null;
      report.phase2!.txidMatch = currentTransfer.txid === sendResult.txid;

      expect(currentTransfer.status).toBe('Settled');
      expect(currentTransfer.txid).toBe(sendResult.txid);

      const finalBalance = await receiver.getAssetBalance(phase2AssetId);
      const receiverSettledAfterManualAck = Number(finalBalance.settled ?? 0);
      report.phase2!.receiverSettledAfterManualAck = receiverSettledAfterManualAck;
      expect(receiverSettledAfterManualAck - receiverSettledBefore).toBeGreaterThanOrEqual(
        TRANSFER_AMOUNT,
      );

      for (let cycle = 1; cycle <= 2; cycle += 1) {
        await receiver.refreshWallet();
        const balance = await receiver.getAssetBalance(phase2AssetId);
        const settled = Number(balance.settled ?? 0);
        report.phase2!.refreshChecks!.push({ cycle, settled });
      }

      const finalSettledValues = report.phase2!.refreshChecks!.map(({ settled }) => settled);
      expect(new Set(finalSettledValues).size).toBe(1);
      report.phase2!.receiverSettledFinal = finalSettledValues.at(-1);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-relay-only-convergence.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
