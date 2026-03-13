import { UTEXOWallet } from '../../src/index';
import type { AssetBalance } from '../../src/types/wallet-model';
import { pollAck, pollCondition, pollTransferSettled, pollValidated, proxyRpc, writeSmokeReport } from './helpers';

const PROXY_HTTP_URL = process.env.SIGNET_PROXY_HTTP_URL || 'https://rgb-proxy-utexo.utexo.com/json-rpc';
const NETWORK = 'testnet';
const TRANSFER_AMOUNT = 1;
const MIN_RECEIVER_BTC_SAT = 2_000;
const PRECONDITION_TIMEOUT_MS = 180_000;
const PRECONDITION_POLL_MS = 5_000;

type PreflightState = {
  sender: InstanceType<typeof UTEXOWallet> | null;
  receiver: InstanceType<typeof UTEXOWallet> | null;
  senderAddress: string;
  receiverAddress: string;
  assetId: string;
  senderBalanceBefore: AssetBalance | null;
  receiverBalanceBefore: AssetBalance | null;
  skipReason: string | null;
};

const state: PreflightState = {
  sender: null,
  receiver: null,
  senderAddress: '',
  receiverAddress: '',
  assetId: '',
  senderBalanceBefore: null,
  receiverBalanceBefore: null,
  skipReason: null,
};

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function maybeSkipOrFail(reason: string): never | void {
  if (process.env.CI === 'true') {
    throw new Error(reason);
  }

  const pendingFn = (globalThis as { pending?: (message?: string) => void }).pending;
  if (typeof pendingFn === 'function') {
    console.warn(`SKIPPED: ${reason}`);
    pendingFn(reason);
    return;
  }

  throw new Error(`SKIPPED: ${reason}`);
}

beforeAll(async () => {
  env('MNEMONIC_A');
  env('MNEMONIC_B');
  env('ASSET_ID');

  await proxyRpc<{ protocol_version: string; version: string }>(PROXY_HTTP_URL, 'server.info');

  const sender = new UTEXOWallet(env('MNEMONIC_A'), { network: NETWORK });
  const receiver = new UTEXOWallet(env('MNEMONIC_B'), { network: NETWORK });

  await sender.initialize();
  await receiver.initialize();

  state.sender = sender;
  state.receiver = receiver;
  state.senderAddress = await sender.getAddress();
  state.receiverAddress = await receiver.getAddress();

  const assetId = env('ASSET_ID');
  state.assetId = assetId;
  state.senderBalanceBefore = await pollCondition(
    async () => {
      await sender.refreshWallet();
      return sender.getAssetBalance(assetId);
    },
    (balance) => Number(balance.spendable) >= TRANSFER_AMOUNT,
    PRECONDITION_TIMEOUT_MS,
    PRECONDITION_POLL_MS,
    `Sender asset did not become spendable within ${PRECONDITION_TIMEOUT_MS}ms for ${assetId}`,
  ).catch((error) => {
    state.skipReason = error instanceof Error ? error.message : String(error);
    return sender.getAssetBalance(assetId);
  });
  state.receiverBalanceBefore = await receiver
    .getAssetBalance(assetId)
    .then((balance) => balance)
    .catch(() => ({
      settled: 0,
      future: 0,
      spendable: 0,
      offchainOutbound: 0,
      offchainInbound: 0,
    }));

  const receiverBtcBalance = await pollCondition(
    async () => {
      await receiver.refreshWallet();
      return receiver.getBtcBalance();
    },
    (balance) => Number(balance.vanilla.spendable) >= MIN_RECEIVER_BTC_SAT,
    PRECONDITION_TIMEOUT_MS,
    PRECONDITION_POLL_MS,
    `Receiver BTC balance did not reach ${MIN_RECEIVER_BTC_SAT} sats within ${PRECONDITION_TIMEOUT_MS}ms`,
  ).catch((error) => {
    state.skipReason = error instanceof Error ? error.message : String(error);
    return receiver.getBtcBalance();
  });

  if (!state.skipReason && Number(state.senderBalanceBefore.spendable) < TRANSFER_AMOUNT) {
    state.skipReason = `Sender asset is not spendable enough: need ${TRANSFER_AMOUNT}, got ${state.senderBalanceBefore.spendable}`;
  }

  if (!state.skipReason && Number(receiverBtcBalance.vanilla.spendable) < MIN_RECEIVER_BTC_SAT) {
    state.skipReason = `Receiver BTC balance is insufficient for blindReceive: need ${MIN_RECEIVER_BTC_SAT}, got ${receiverBtcBalance.vanilla.spendable}`;
  }
});

afterAll(async () => {
  await state.sender?.dispose();
  await state.receiver?.dispose();
});

describe('Signet offline receiver smoke', () => {
  it('auto-ACKs valid offline receive and settles on receiver', async () => {
    if (state.skipReason) {
      maybeSkipOrFail(state.skipReason);
      return;
    }

    const sender = state.sender!;
    const receiver = state.receiver!;
    const assetId = state.assetId;
    const startedAt = Date.now();
    const report = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      assetId,
      senderAddress: state.senderAddress,
      receiverAddress: state.receiverAddress,
      invoice: '',
      recipientId: '',
      txid: undefined as string | undefined,
      ack: undefined as boolean | null | undefined,
      validated: undefined as boolean | null | undefined,
      finalStatus: undefined as string | undefined,
      senderSpendableBefore: Number(state.senderBalanceBefore?.spendable ?? 0),
      receiverSettledBefore: Number(state.receiverBalanceBefore?.settled ?? 0),
      receiverSettledAfter: undefined as number | undefined,
      note: undefined as string | undefined,
    };

    try {
      // TODO: migrate to WalletManager with explicit transportEndpoint.
      // UTEXOWallet is acceptable for Signet smoke but not ideal for local regtest CI.
      const invoiceData = await receiver.blindReceive({
        amount: TRANSFER_AMOUNT,
        minConfirmations: 1,
      });
      report.invoice = invoiceData.invoice;
      report.recipientId = invoiceData.recipientId;

      const sendResult = await sender.send({
        invoice: invoiceData.invoice,
        assetId,
        amount: TRANSFER_AMOUNT,
        donation: true,
        feeRate: 2,
        minConfirmations: 1,
      });
      report.txid = sendResult.txid;

      const ack = await pollAck(PROXY_HTTP_URL, invoiceData.recipientId);
      const validated = await pollValidated(PROXY_HTTP_URL, invoiceData.recipientId);
      report.ack = ack;
      report.validated = validated;

      expect(ack).toBe(true);
      expect(validated).toBe(true);

      const transfer = await pollTransferSettled(
        () => receiver.refreshWallet(),
        (assetIdForList) => receiver.listTransfers(assetIdForList),
        assetId,
        invoiceData.recipientId,
      );
      report.finalStatus = transfer.status;

      const receiverBalanceAfter = await receiver.getAssetBalance(assetId);
      report.receiverSettledAfter = Number(receiverBalanceAfter.settled);

      expect(transfer.status).toBe('Settled');
      expect(Number(receiverBalanceAfter.settled)).toBeGreaterThanOrEqual(
        Number(state.receiverBalanceBefore?.settled ?? 0) + TRANSFER_AMOUNT,
      );
    } catch (error) {
      report.note = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      report.durationMs = Date.now() - startedAt;
      const reportPath = writeSmokeReport(report);
      console.log(`smoke report: ${reportPath}`);
      console.log(JSON.stringify(report, null, 2));
    }
  });
});
