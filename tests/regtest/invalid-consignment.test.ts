import {
  pollCondition,
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
  postFakeConsignment,
  resetWalletDataDirs,
  type GenerateKeysFn,
  type RegtestWallet,
  type WalletManagerCtor,
} from './helpers';

const PROXY_HTTP_URL = getRegtestProxyHttpUrl();

type InvalidConsignmentReport = {
  timestamp: string;
  durationMs: number;
  preconditions: {
    proxyHttpUrl: string;
    proxyRpcUrl: string;
    indexerUrl: string;
  };
  phase1: {
    invoice: string;
    recipientId: string;
    postAccepted?: boolean;
    ack?: boolean | null;
    validated?: boolean | undefined;
    transferStatusAfterRefresh?: string;
  };
};

type State = {
  receiver: RegtestWallet | null;
};

const state: State = {
  receiver: null,
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

  const { wallet: receiver } = await createRegtestWallet(
    WalletManager,
    generateKeys,
    'receiver'
  );

  state.receiver = receiver;

  await fundWallet(receiver);
});

afterAll(async () => {
  await state.receiver?.dispose();
});

describe('Regtest invalid consignment', () => {
  it('R-03: malformed consignment triggers validation path (auto-NACK or relay-only fallback)', async () => {
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: InvalidConsignmentReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        proxyHttpUrl: PROXY_HTTP_URL,
        proxyRpcUrl: getRegtestProxyRpcUrl(),
        indexerUrl: getRegtestIndexerUrl(),
      },
      phase1: {
        invoice: '',
        recipientId: '',
      },
    };

    try {
      const invoiceData = await receiver.blindReceive({
        amount: 1,
        minConfirmations: 1,
      });
      report.phase1.invoice = invoiceData.invoice;
      report.phase1.recipientId = invoiceData.recipientId;

      const postAccepted = await postFakeConsignment({
        recipientId: invoiceData.recipientId,
      });
      report.phase1.postAccepted = postAccepted;
      expect(postAccepted).toBe(true);

      // Playground validation is asynchronous; this wait covers the expected validation window.
      await sleep(12_000);

      const ack = await proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
        recipient_id: invoiceData.recipientId,
      });
      const consignment = await proxyRpc<{ validated?: boolean }>(
        PROXY_HTTP_URL,
        'consignment.get',
        {
          recipient_id: invoiceData.recipientId,
        }
      );
      const validated = consignment.validated;
      report.phase1.ack = ack;
      report.phase1.validated = validated;

      expect(
        (ack === false && validated === false) ||
          (ack === null && validated === undefined)
      ).toBe(true);

      await receiver.refreshWallet();
      const transfers = await receiver.listTransfers();
      const currentTransfer = transfers.find(
        (item) => item.recipientId === invoiceData.recipientId
      );

      report.phase1.transferStatusAfterRefresh = currentTransfer?.status;

      expect(currentTransfer?.status).not.toBe('Settled');
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(
        report,
        'regtest-invalid-consignment.json'
      );
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });

  it('manual ACK is preserved against late validation', async () => {
    const receiver = state.receiver!;
    // Intentional proxy-level case: recipient_id is synthetic (not from SDK invoice generation),
    // but unique per run to avoid collisions with persisted proxy state.
    const recipientId = `regtest.manual-ack-preserved.${Date.now()}`;
    const syntheticTxid = Date.now().toString(16).padStart(64, '0');
    const postAccepted = await postFakeConsignment({
      recipientId,
      content: `manual-ack-${Date.now()}`,
      txid: syntheticTxid,
    });

    expect(postAccepted).toBe(true);

    const ackPosted = await proxyRpc<boolean>(PROXY_HTTP_URL, 'ack.post', {
      recipient_id: recipientId,
      ack: true,
    });
    expect(ackPosted).toBe(true);

    // Playground validation is asynchronous; this wait covers the expected validation window.
    await sleep(12_000);

    const finalAck = await pollCondition(
      async () =>
        proxyRpc<boolean | null>(PROXY_HTTP_URL, 'ack.get', {
          recipient_id: recipientId,
        }),
      (ack) => ack === true,
      5_000,
      500,
      `Manual ACK was not preserved for recipient_id=${recipientId}`
    );

    expect(finalAck).toBe(true);

    const currentTransfer = (await receiver.listTransfers()).find(
      (item) => item.recipientId === recipientId
    );
    expect(currentTransfer?.status).not.toBe('Settled');
  });
});
