import {
  pollCondition,
  pollAck,
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

type AckGuardReport = {
  timestamp: string;
  durationMs: number;
  preconditions: {
    proxyHttpUrl: string;
    proxyRpcUrl: string;
    indexerUrl: string;
    assetId: string;
    senderAddress: string;
    receiverAddress: string;
  };
  phase1: {
    invoice: string;
    recipientId: string;
    txid?: string;
    ack?: boolean;
    validated?: boolean;
    ackPostErrorCode?: number;
    ackPostErrorMessage?: string;
    ackAfterAttempt?: boolean | null;
  };
};

type JsonRpcErrorResponse = {
  jsonrpc: string;
  id: string | number;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  result?: unknown;
};

type State = {
  sender: RegtestWallet | null;
  receiver: RegtestWallet | null;
  senderAddress: string;
  receiverAddress: string;
  assetId: string;
};

const state: State = {
  sender: null,
  receiver: null,
  senderAddress: '',
  receiverAddress: '',
  assetId: '',
};

async function ackPostRaw(
  recipientId: string,
  ack: boolean
): Promise<JsonRpcErrorResponse> {
  const response = await fetch(PROXY_HTTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'ack.post',
      params: {
        recipient_id: recipientId,
        ack,
      },
    }),
  });

  return response.json();
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
    ticker: `A${Date.now().toString().slice(-5)}`,
    name: `Regtest Ack Guard Asset ${Date.now()}`,
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
    `Issued ack-guard asset ${state.assetId} did not become spendable in time`
  );

  state.receiverAddress = (await fundWallet(receiver)).address;
});

afterAll(async () => {
  await state.sender?.dispose();
  await state.receiver?.dispose();
});

describe('Regtest ACK guard', () => {
  it('auto-ACK cannot be changed by receiver', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: AckGuardReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        proxyHttpUrl: PROXY_HTTP_URL,
        proxyRpcUrl: getRegtestProxyRpcUrl(),
        indexerUrl: getRegtestIndexerUrl(),
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

      const ack = await pollAck(
        PROXY_HTTP_URL,
        invoiceData.recipientId,
        30_000,
        1_000
      );
      const validated = await pollValidated(
        PROXY_HTTP_URL,
        invoiceData.recipientId,
        30_000,
        1_000
      );
      report.phase1.ack = ack;
      report.phase1.validated = validated;

      expect(ack).toBe(true);
      expect(validated).toBe(true);

      const ackPostResponse = await ackPostRaw(invoiceData.recipientId, false);
      report.phase1.ackPostErrorCode = ackPostResponse.error?.code;
      report.phase1.ackPostErrorMessage = ackPostResponse.error?.message;

      expect(ackPostResponse.error?.code).toBe(-100);

      const ackAfterAttempt = await proxyRpc<boolean | null>(
        PROXY_HTTP_URL,
        'ack.get',
        {
          recipient_id: invoiceData.recipientId,
        }
      );
      report.phase1.ackAfterAttempt = ackAfterAttempt;
      expect(ackAfterAttempt).toBe(true);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-ack-guard.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
