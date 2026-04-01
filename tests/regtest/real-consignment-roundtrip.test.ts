import {
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
  postConsignmentRaw,
  resetWalletDataDirs,
  type GenerateKeysFn,
  type RegtestWallet,
  type WalletManagerCtor,
} from './helpers';

const PROXY_HTTP_URL = getRegtestProxyHttpUrl();
const TRANSFER_AMOUNT = 1;
const SEND_FEE_RATE = 2;

type ConsignmentRoundtripReport = {
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
    consignmentTxid?: string;
    consignmentValidated?: boolean;
    consignmentBytes?: number;
    duplicateUploadResult?: boolean;
    duplicateConsignmentTxid?: string;
    duplicateConsignmentValidated?: boolean;
  };
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
    ticker: `C${Date.now().toString().slice(-5)}`,
    name: `Roundtrip${Date.now().toString().slice(-5)}`,
    amounts: [10],
    precision: 0,
  });
  state.assetId = issuedAsset.assetId;

  await mine(1);
  await sender.refreshWallet();
  state.receiverAddress = (await fundWallet(receiver)).address;
});

afterAll(async () => {
  await state.sender?.dispose();
  await state.receiver?.dispose();
});

describe('Regtest real consignment roundtrip', () => {
  it('returns a valid base64 consignment and rejects duplicate re-upload of the same real file', async () => {
    const sender = state.sender!;
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: ConsignmentRoundtripReport = {
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

      const ack = await pollAck(PROXY_HTTP_URL, invoiceData.recipientId, 15_000, 500);
      const validated = await pollValidated(PROXY_HTTP_URL, invoiceData.recipientId, 15_000, 500);
      report.phase1.ack = ack;
      report.phase1.validated = validated;
      expect(ack).toBe(true);
      expect(validated).toBe(true);

      const consignment = await proxyRpc<{
        consignment: string;
        txid: string;
        validated?: boolean;
      }>(PROXY_HTTP_URL, 'consignment.get', {
        recipient_id: invoiceData.recipientId,
      });
      report.phase1.consignmentTxid = consignment.txid;
      report.phase1.consignmentValidated = consignment.validated;

      const consignmentBytes = Buffer.from(consignment.consignment, 'base64');
      report.phase1.consignmentBytes = consignmentBytes.length;

      expect(consignment.txid).toBe(sendResult.txid);
      expect(consignment.validated).toBe(true);
      expect(consignmentBytes.length).toBeGreaterThan(0);

      const duplicateUpload = await postConsignmentRaw<boolean>({
        proxyHttpUrl: PROXY_HTTP_URL,
        recipientId: invoiceData.recipientId,
        txid: sendResult.txid,
        fileName: 'real-consignment.rgbc',
        contentBytes: consignmentBytes,
      });
      report.phase1.duplicateUploadResult = Boolean(duplicateUpload.result);
      expect(duplicateUpload.error).toBeUndefined();
      expect(duplicateUpload.result).toBe(false);

      const consignmentAfterDuplicate = await proxyRpc<{
        txid: string;
        validated?: boolean;
      }>(PROXY_HTTP_URL, 'consignment.get', {
        recipient_id: invoiceData.recipientId,
      });
      report.phase1.duplicateConsignmentTxid = consignmentAfterDuplicate.txid;
      report.phase1.duplicateConsignmentValidated = consignmentAfterDuplicate.validated;
      expect(consignmentAfterDuplicate.txid).toBe(sendResult.txid);
      expect(consignmentAfterDuplicate.validated).toBe(true);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-real-consignment-roundtrip.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
