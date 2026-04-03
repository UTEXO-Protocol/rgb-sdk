import type { AssetBalance } from '../../src/types/wallet-model';
import {
  pollAck,
  pollCondition,
  pollSettledBalanceDelta,
  pollTransferByRecipientId,
  pollValidated,
  proxyRpc,
  type TransferLike,
  writeSmokeReport,
} from '../shared/helpers';

export const PROXY_HTTP_URL =
  process.env.SIGNET_PROXY_HTTP_URL ||
  'https://rgb-proxy-utexo.utexo.com/json-rpc';
export const NETWORK = 'testnet';
export const TRANSFER_AMOUNT = 1;
export const MIN_RECEIVER_BTC_SAT = 2_000;
export const PRECONDITION_TIMEOUT_MS = 180_000;
export const PRECONDITION_POLL_MS = 5_000;
export const IDEMPOTENT_REFRESH_COUNT = 3;
export const SMOKE_FEE_RATE = 2;

export type TransferRecord = TransferLike & {
  idx?: number;
  batchTransferIdx?: number;
  createdAt?: number;
  updatedAt?: number;
  requestedAssignment?: unknown;
  assignments?: unknown[];
  kind?: string;
  receiveUtxo?: unknown;
  changeUtxo?: unknown;
  expiration?: number;
  transportEndpoints?: unknown[];
  invoiceString?: string;
  consignmentPath?: string | null;
};

export type InvoiceData = {
  invoice: string;
  recipientId: string;
};

export type SendParams = {
  invoice: string;
  assetId: string;
  amount: number;
  donation: boolean;
  feeRate: number;
  minConfirmations: number;
  witnessData?: { amountSat: number; blinding?: number | null };
};

export type UTEXOWalletType = {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  getAddress(): Promise<string>;
  refreshWallet(): Promise<void>;
  getAssetBalance(assetId: string): Promise<AssetBalance>;
  getBtcBalance(): Promise<{ vanilla: { spendable: number | string } }>;
  blindReceive(params: {
    amount: number;
    minConfirmations: number;
  }): Promise<InvoiceData>;
  witnessReceive(params: {
    amount: number;
    minConfirmations: number;
  }): Promise<InvoiceData>;
  send(params: SendParams): Promise<{ txid: string }>;
  listTransfers(assetId?: string): Promise<TransferRecord[]>;
};

export type UTEXOWalletCtor = new (
  mnemonicOrSeed: string,
  options: { network: string }
) => UTEXOWalletType;

export type PreflightState = {
  sender: UTEXOWalletType | null;
  receiver: UTEXOWalletType | null;
  senderAddress: string;
  receiverAddress: string;
  assetId: string;
  senderBalanceBefore: AssetBalance | null;
  receiverBalanceBefore: AssetBalance | null;
  skipReason: string | null;
};

export function createPreflightState(): PreflightState {
  return {
    sender: null,
    receiver: null,
    senderAddress: '',
    receiverAddress: '',
    assetId: '',
    senderBalanceBefore: null,
    receiverBalanceBefore: null,
    skipReason: null,
  };
}

export function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function isInsufficientAllocationSlotsError(error: unknown): boolean {
  const serialized = [
    String(error),
    error instanceof Error ? error.message : '',
    error instanceof Error ? error.stack : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    serialized.includes('InsufficientAllocationSlots') ||
    serialized.includes('AllocationSlots')
  );
}

export function maybeSkipOrFail(reason: string): never | void {
  if (process.env.CI === 'true') {
    throw new Error(reason);
  }

  const pendingFn = (globalThis as { pending?: (message?: string) => void })
    .pending;
  if (typeof pendingFn === 'function') {
    console.warn(`SKIPPED: ${reason}`);
    pendingFn(reason);
    return;
  }

  throw new Error(`SKIPPED: ${reason}`);
}

export async function setupSignetPreflight(
  state: PreflightState
): Promise<void> {
  env('MNEMONIC_A');
  env('MNEMONIC_B');
  env('ASSET_ID');

  await proxyRpc<{ protocol_version: string; version: string }>(
    PROXY_HTTP_URL,
    'server.info'
  );

  const { UTEXOWallet } = (await import('../../dist/index.mjs')) as {
    UTEXOWallet: UTEXOWalletCtor;
  };
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
    `Sender asset did not become spendable within ${PRECONDITION_TIMEOUT_MS}ms for ${assetId}`
  ).catch((error) => {
    state.skipReason = error instanceof Error ? error.message : String(error);
    return sender.getAssetBalance(assetId);
  });

  state.receiverBalanceBefore = await receiver
    .getAssetBalance(assetId)
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
    `Receiver BTC balance did not reach ${MIN_RECEIVER_BTC_SAT} sats within ${PRECONDITION_TIMEOUT_MS}ms`
  ).catch((error) => {
    state.skipReason = error instanceof Error ? error.message : String(error);
    return receiver.getBtcBalance();
  });

  if (
    !state.skipReason &&
    Number(state.senderBalanceBefore.spendable) < TRANSFER_AMOUNT
  ) {
    state.skipReason = `Sender asset is not spendable enough: need ${TRANSFER_AMOUNT}, got ${state.senderBalanceBefore.spendable}`;
  }

  if (
    !state.skipReason &&
    Number(receiverBtcBalance.vanilla.spendable) < MIN_RECEIVER_BTC_SAT
  ) {
    state.skipReason = `Receiver BTC balance is insufficient for receive flow: need ${MIN_RECEIVER_BTC_SAT}, got ${receiverBtcBalance.vanilla.spendable}`;
  }
}

export async function disposeSignetPreflight(
  state: PreflightState
): Promise<void> {
  await state.sender?.dispose();
  await state.receiver?.dispose();
}

export function createBaseReport(state: PreflightState) {
  const receiverSettledBefore = Number(
    state.receiverBalanceBefore?.settled ?? 0
  );

  return {
    timestamp: new Date().toISOString(),
    durationMs: 0,
    preconditions: {
      assetId: state.assetId,
      senderAddress: state.senderAddress,
      receiverAddress: state.receiverAddress,
      senderSpendableBefore: Number(state.senderBalanceBefore?.spendable ?? 0),
      receiverSettledBefore,
      receiverMinBtcSat: MIN_RECEIVER_BTC_SAT,
    },
    phase1: {
      invoiceType: undefined as 'witness' | 'blind' | undefined,
      witnessAmountSat: undefined as number | undefined,
      invoice: '',
      recipientId: '',
      txid: undefined as string | undefined,
      ack: undefined as boolean | null | undefined,
      validated: undefined as boolean | null | undefined,
      senderTransferStatusBeforeReceiverRefresh: undefined as
        | string
        | undefined,
      receiverSettledWhileOffline: undefined as number | undefined,
      receiverSettledAfter: undefined as number | undefined,
      currentTransferStatus: undefined as string | undefined,
      currentTransferTxid: undefined as string | null | undefined,
      txidMatch: undefined as boolean | undefined,
      warning: undefined as string | undefined,
      pollAckMs: undefined as number | undefined,
      pollSettledMs: undefined as number | undefined,
      pollTransferMs: undefined as number | undefined,
    },
    phase2: {
      refreshChecks: [] as Array<{ cycle: number; settled: number }>,
      receiverSettledFinal: undefined as number | undefined,
      listTransfersSnapshot: undefined as unknown,
    },
    note: undefined as string | undefined,
  };
}

export async function finalizeTransferSnapshot(
  receiver: UTEXOWalletType,
  assetId: string,
  recipientId: string,
  sendTxid: string,
  report: ReturnType<typeof createBaseReport>
): Promise<void> {
  try {
    report.phase2.listTransfersSnapshot = await receiver.listTransfers(assetId);

    const currentTransferFromSnapshot = Array.isArray(
      report.phase2.listTransfersSnapshot
    )
      ? report.phase2.listTransfersSnapshot.find(
          (item) => item.recipientId === recipientId
        )
      : undefined;

    if (currentTransferFromSnapshot) {
      report.phase1.currentTransferStatus = currentTransferFromSnapshot.status;
      report.phase1.currentTransferTxid = currentTransferFromSnapshot.txid;
      report.phase1.txidMatch = Boolean(
        currentTransferFromSnapshot.txid &&
        currentTransferFromSnapshot.txid === sendTxid
      );

      if (currentTransferFromSnapshot.status === 'Settled') {
        report.phase1.warning = undefined;
      }
    }
  } catch (error) {
    report.phase2.listTransfersSnapshot = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runSignetReceiveSmoke(params: {
  state: PreflightState;
  reportFileName: string;
  receiveInvoice: (receiver: UTEXOWalletType) => Promise<InvoiceData>;
  buildSendParams: (args: { invoice: string; assetId: string }) => SendParams;
  strictMode?: {
    exactDelta?: boolean;
    strictTransferCheck?: boolean;
    senderSettlesBeforeReceiverRefresh?: boolean;
  };
  phase1Metadata?: {
    invoiceType?: 'witness' | 'blind';
    witnessAmountSat?: number;
  };
}): Promise<void> {
  const {
    state,
    reportFileName,
    receiveInvoice,
    buildSendParams,
    strictMode,
    phase1Metadata,
  } = params;

  if (state.skipReason) {
    maybeSkipOrFail(state.skipReason);
    return;
  }

  const sender = state.sender!;
  const receiver = state.receiver!;
  const assetId = state.assetId;
  const receiverSettledBefore = Number(
    state.receiverBalanceBefore?.settled ?? 0
  );
  const startedAt = Date.now();
  const report = createBaseReport(state);
  if (phase1Metadata) {
    Object.assign(report.phase1, phase1Metadata);
  }

  try {
    const invoiceData = await receiveInvoice(receiver);
    report.phase1.invoice = invoiceData.invoice;
    report.phase1.recipientId = invoiceData.recipientId;

    let sendResult;
    try {
      sendResult = await sender.send(
        buildSendParams({ invoice: invoiceData.invoice, assetId })
      );
    } catch (error) {
      if (isInsufficientAllocationSlotsError(error)) {
        throw new Error(
          'Insufficient allocation slots during send. Top up both wallets and refresh before rerunning: `node cli/run.mjs createutxos stage2-sender --num 10 --size 2000 --feeRate 2 && node cli/run.mjs refresh stage2-sender && node cli/run.mjs createutxos stage2-receiver --num 10 --size 2000 --feeRate 2 && node cli/run.mjs refresh stage2-receiver`.'
        );
      }
      throw error;
    }
    report.phase1.txid = sendResult.txid;

    const ackStartedAt = Date.now();
    const ack = await pollAck(PROXY_HTTP_URL, invoiceData.recipientId);
    report.phase1.pollAckMs = Date.now() - ackStartedAt;

    const validated = await pollValidated(
      PROXY_HTTP_URL,
      invoiceData.recipientId
    );
    report.phase1.ack = ack;
    report.phase1.validated = validated;

    expect(ack).toBe(true);
    expect(validated).toBe(true);

    if (strictMode?.senderSettlesBeforeReceiverRefresh) {
      const senderTransfer = await pollCondition(
        async () => {
          await sender.refreshWallet();
          const transfers = await sender.listTransfers(assetId);
          return transfers.find((item) => item.txid === sendResult.txid);
        },
        (transfer) => transfer?.status === 'Settled',
        120_000,
        5_000,
        `Sender transfer txid=${sendResult.txid} did not reach Settled before receiver refresh`
      );
      report.phase1.senderTransferStatusBeforeReceiverRefresh =
        senderTransfer?.status;
      expect(senderTransfer?.status).toBe('Settled');
    }

    const offlineBalance = await receiver
      .getAssetBalance(assetId)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('AssetNotFound')) {
          return { settled: receiverSettledBefore };
        }
        throw error;
      });
    const receiverSettledWhileOffline = Number(offlineBalance.settled ?? 0);
    report.phase1.receiverSettledWhileOffline = receiverSettledWhileOffline;
    expect(receiverSettledWhileOffline).toBe(receiverSettledBefore);

    const settledStartedAt = Date.now();
    const receiverSettledAfter = await pollSettledBalanceDelta(
      async () => {
        await receiver.refreshWallet();
        return receiver.getAssetBalance(assetId);
      },
      receiverSettledBefore,
      TRANSFER_AMOUNT
    );
    report.phase1.pollSettledMs = Date.now() - settledStartedAt;
    report.phase1.receiverSettledAfter = receiverSettledAfter;

    if (strictMode?.exactDelta) {
      expect(receiverSettledAfter - receiverSettledBefore).toBe(
        TRANSFER_AMOUNT
      );
    } else {
      expect(
        receiverSettledAfter - receiverSettledBefore
      ).toBeGreaterThanOrEqual(TRANSFER_AMOUNT);
    }

    const transferStartedAt = Date.now();
    try {
      const currentTransfer = await pollTransferByRecipientId(
        async () => {
          await receiver.refreshWallet();
          return receiver.listTransfers(
            strictMode?.strictTransferCheck ? assetId : undefined
          );
        },
        invoiceData.recipientId,
        sendResult.txid,
        30_000,
        5_000
      );
      report.phase1.pollTransferMs = Date.now() - transferStartedAt;
      report.phase1.currentTransferStatus = currentTransfer.status;
      report.phase1.currentTransferTxid = currentTransfer.txid;
      report.phase1.txidMatch = Boolean(
        currentTransfer.txid && currentTransfer.txid === sendResult.txid
      );

      if (strictMode?.strictTransferCheck) {
        expect(currentTransfer.status).toBe('Settled');
        expect(currentTransfer.txid).toBe(sendResult.txid);
      } else if (
        currentTransfer.txid &&
        currentTransfer.txid !== sendResult.txid
      ) {
        report.phase1.warning = `Balance delta was observed, but current transfer txid mismatched: expected ${sendResult.txid}, got ${currentTransfer.txid}`;
      }
    } catch (error) {
      report.phase1.pollTransferMs = Date.now() - transferStartedAt;
      if (strictMode?.strictTransferCheck) {
        throw error;
      }
      report.phase1.warning =
        error instanceof Error ? error.message : String(error);
    }

    for (let cycle = 1; cycle <= IDEMPOTENT_REFRESH_COUNT; cycle += 1) {
      await receiver.refreshWallet();
      const balance = await receiver.getAssetBalance(assetId);
      report.phase2.refreshChecks.push({
        cycle,
        settled: Number(balance.settled),
      });
    }

    const allSettled = report.phase2.refreshChecks.map((item) => item.settled);
    expect(new Set(allSettled).size).toBe(1);

    const receiverSettledFinal =
      report.phase2.refreshChecks.at(-1)?.settled ?? receiverSettledAfter;
    report.phase2.receiverSettledFinal = receiverSettledFinal;
    expect(receiverSettledFinal).toBe(receiverSettledAfter);

    await finalizeTransferSnapshot(
      receiver,
      assetId,
      invoiceData.recipientId,
      sendResult.txid,
      report
    );
  } catch (error) {
    report.note = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.durationMs = Date.now() - startedAt;
    const reportPath = writeSmokeReport(report, reportFileName);
    console.log(`smoke report: ${reportPath}`);
    console.log(JSON.stringify(report, null, 2));
  }
}
