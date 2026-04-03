import { execFileSync } from 'node:child_process';

import { jest } from '@jest/globals';

import { pollCondition, proxyRpc, writeSmokeReport } from '../shared/helpers';
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
const SUITE_TIMEOUT_MS = 60_000;

jest.setTimeout(SUITE_TIMEOUT_MS);

type ProxyDownReport = {
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
    receiverSettledBefore: number;
  };
  phase1: {
    invoice: string;
    recipientId: string;
    sendError?: string;
    sendErrorKind?: 'network' | 'transport' | 'other';
    ackAfterRecovery?: boolean | null;
    transferStatusAfterRecovery?: string;
    receiverSettledAfterRecovery?: number;
  };
};

type State = {
  sender: RegtestWallet | null;
  receiver: RegtestWallet | null;
  senderAddress: string;
  receiverAddress: string;
  assetId: string;
  receiverSettledBefore: number;
  composeFile: string;
};

const state: State = {
  sender: null,
  receiver: null,
  senderAddress: '',
  receiverAddress: '',
  assetId: '',
  receiverSettledBefore: 0,
  composeFile: '',
};

function dockerCompose(args: string[]): string {
  return execFileSync('docker', ['compose', '-f', state.composeFile, ...args], {
    encoding: 'utf8',
  }).trim();
}

async function waitForProxyReady(): Promise<void> {
  await pollCondition(
    async () => {
      try {
        return await proxyRpc<{ version: string }>(
          PROXY_HTTP_URL,
          'server.info'
        );
      } catch {
        return null;
      }
    },
    (info) => Boolean(info?.version),
    15_000,
    500,
    'Proxy did not become ready in time'
  );
}

async function stopProxy(): Promise<void> {
  dockerCompose(['stop', 'proxy']);
}

async function startProxy(): Promise<void> {
  dockerCompose(['up', '-d', 'proxy']);
  await waitForProxyReady();
}

beforeAll(async () => {
  env('REGTEST_PROXY_HTTP_URL');
  env('REGTEST_PROXY_RPC_URL');
  env('REGTEST_INDEXER_URL');
  env('REGTEST_BITCOIND_USER');
  env('REGTEST_BITCOIND_PASS');
  state.composeFile = env('REGTEST_PLAYGROUND_COMPOSE_FILE');
  ensureBitcoindAccess();

  resetWalletDataDirs(getRegtestBaseDir());
  await waitForProxyReady();

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
    ticker: `N${Date.now().toString().slice(-5)}`,
    name: `ProxyDown${Date.now().toString().slice(-5)}`,
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
  try {
    await startProxy();
  } finally {
    await state.sender?.dispose();
    await state.receiver?.dispose();
  }
});

describe('Regtest proxy down during send', () => {
  it('returns a clear send error and leaves the receiver in a non-settled state after recovery', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: ProxyDownReport = {
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
      });
      report.phase1.invoice = invoiceData.invoice;
      report.phase1.recipientId = invoiceData.recipientId;

      await stopProxy();

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
        const serialized = [
          String(error),
          (error as Error)?.message ?? '',
          (error as Error)?.stack ?? '',
        ]
          .filter(Boolean)
          .join('\n');
        report.phase1.sendError = serialized;
        report.phase1.sendErrorKind =
          /fetch failed|ECONNREFUSED|SocketError|connect/i.test(serialized)
            ? 'network'
            : /InvalidTransportEndpoints|no valid transport endpoints/i.test(
                  serialized
                )
              ? 'transport'
              : 'other';
      } finally {
        await startProxy();
      }

      expect(report.phase1.sendError).toBeDefined();
      expect(['network', 'transport']).toContain(report.phase1.sendErrorKind);

      await receiver.refreshWallet();
      const ackAfterRecovery = await proxyRpc<boolean | null>(
        PROXY_HTTP_URL,
        'ack.get',
        {
          recipient_id: invoiceData.recipientId,
        }
      ).catch(() => null);
      report.phase1.ackAfterRecovery = ackAfterRecovery;

      const transferAfterRecovery = await receiver
        .listTransfers(state.assetId)
        .then((items) =>
          items.find((item) => item.recipientId === invoiceData.recipientId)
        )
        .catch(() => undefined);
      report.phase1.transferStatusAfterRecovery = transferAfterRecovery?.status;

      const receiverBalance = await receiver
        .getAssetBalance(state.assetId)
        .catch(() => ({ settled: 0 }));
      const receiverSettledAfterRecovery = Number(receiverBalance.settled ?? 0);
      report.phase1.receiverSettledAfterRecovery = receiverSettledAfterRecovery;

      expect(transferAfterRecovery?.status).not.toBe('Settled');
      expect(receiverSettledAfterRecovery).toBe(state.receiverSettledBefore);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(
        report,
        'regtest-proxy-down-during-send.json'
      );
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
