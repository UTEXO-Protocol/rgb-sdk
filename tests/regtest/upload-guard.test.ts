import { writeSmokeReport } from '../shared/helpers';
import {
  createRegtestWallet,
  env,
  ensureBitcoindAccess,
  fundWallet,
  getRegtestBaseDir,
  getRegtestIndexerUrl,
  getRegtestProxyHttpUrl,
  getRegtestProxyRpcUrl,
  postConsignmentRaw,
  resetWalletDataDirs,
  type GenerateKeysFn,
  type RegtestWallet,
  type WalletManagerCtor,
} from './helpers';

const PROXY_HTTP_URL = getRegtestProxyHttpUrl();

type UploadGuardReport = {
  timestamp: string;
  durationMs: number;
  preconditions: {
    proxyHttpUrl: string;
    proxyRpcUrl: string;
    indexerUrl: string;
    receiverAddress: string;
  };
  duplicateSameFile: {
    recipientId?: string;
    firstResult?: boolean;
    secondResult?: boolean;
  };
  changedFile: {
    recipientId?: string;
    firstResult?: boolean;
    errorCode?: number;
    errorMessage?: string;
  };
};

type State = {
  receiver: RegtestWallet | null;
  receiverAddress: string;
};

const state: State = {
  receiver: null,
  receiverAddress: '',
};

beforeAll(async () => {
  env('REGTEST_PROXY_HTTP_URL');
  env('REGTEST_PROXY_RPC_URL');
  env('REGTEST_INDEXER_URL');
  env('REGTEST_BITCOIND_USER');
  env('REGTEST_BITCOIND_PASS');
  ensureBitcoindAccess();

  resetWalletDataDirs(getRegtestBaseDir());

  const { WalletManager, generateKeys } = (await import('../../dist/index.mjs')) as {
    WalletManager: WalletManagerCtor;
    generateKeys: GenerateKeysFn;
  };

  const { wallet: receiver } = await createRegtestWallet(
    WalletManager,
    generateKeys,
    'receiver',
  );
  state.receiver = receiver;
  state.receiverAddress = (await fundWallet(receiver)).address;
});

afterAll(async () => {
  await state.receiver?.dispose();
});

describe('Regtest upload guard semantics', () => {
  // These cases intentionally reuse the same receiver wallet state in a single run.
  it('duplicate consignment.post with the same file returns false on second upload', async () => {
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: UploadGuardReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        proxyHttpUrl: PROXY_HTTP_URL,
        proxyRpcUrl: getRegtestProxyRpcUrl(),
        indexerUrl: getRegtestIndexerUrl(),
        receiverAddress: state.receiverAddress,
      },
      duplicateSameFile: {},
      changedFile: {},
    };

    try {
      const invoiceData = await receiver.blindReceive({
        amount: 1,
        minConfirmations: 1,
      });
      report.duplicateSameFile.recipientId = invoiceData.recipientId;

      const first = await postConsignmentRaw<boolean>({
        recipientId: invoiceData.recipientId,
        txid: '0000000000000000000000000000000000000000000000000000000000000011',
        fileName: 'same-a.rgbc',
        content: 'same-consignment-content',
      });
      const second = await postConsignmentRaw<boolean>({
        recipientId: invoiceData.recipientId,
        txid: '0000000000000000000000000000000000000000000000000000000000000011',
        fileName: 'same-b.rgbc',
        content: 'same-consignment-content',
      });

      report.duplicateSameFile.firstResult = Boolean(first.result);
      report.duplicateSameFile.secondResult = Boolean(second.result);

      expect(first.error).toBeUndefined();
      expect(first.result).toBe(true);
      expect(second.error).toBeUndefined();
      expect(second.result).toBe(false);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-upload-guard-duplicate.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });

  it('consignment.post with a changed file for the same recipient fails with CannotChangeUploadedFile', async () => {
    const receiver = state.receiver!;
    const startedAt = Date.now();
    const report: UploadGuardReport = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      preconditions: {
        proxyHttpUrl: PROXY_HTTP_URL,
        proxyRpcUrl: getRegtestProxyRpcUrl(),
        indexerUrl: getRegtestIndexerUrl(),
        receiverAddress: state.receiverAddress,
      },
      duplicateSameFile: {},
      changedFile: {},
    };

    try {
      const invoiceData = await receiver.blindReceive({
        amount: 1,
        minConfirmations: 1,
      });
      report.changedFile.recipientId = invoiceData.recipientId;

      const first = await postConsignmentRaw<boolean>({
        recipientId: invoiceData.recipientId,
        txid: '0000000000000000000000000000000000000000000000000000000000000022',
        fileName: 'change-a.rgbc',
        content: 'original-consignment-content',
      });
      report.changedFile.firstResult = Boolean(first.result);

      const second = await postConsignmentRaw<boolean>({
        recipientId: invoiceData.recipientId,
        txid: '0000000000000000000000000000000000000000000000000000000000000022',
        fileName: 'change-b.rgbc',
        content: 'changed-consignment-content',
      });

      report.changedFile.errorCode = second.error?.code;
      report.changedFile.errorMessage = second.error?.message;

      expect(first.error).toBeUndefined();
      expect(first.result).toBe(true);
      expect(second.result).toBeUndefined();
      expect(second.error?.code).toBe(-101);
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report, 'regtest-upload-guard-changed-file.json');
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
