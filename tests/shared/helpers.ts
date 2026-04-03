import fs from 'node:fs';
import path from 'node:path';

export type JsonRpcSuccess<T> = {
  jsonrpc: string;
  id: string | number;
  result: T;
};

export type TransferLike = {
  recipientId?: string;
  status?: string;
  txid?: string | null;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollCondition<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs: number,
  errorMessage: string
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await fn();
    if (predicate(value)) {
      return value;
    }
    await sleep(intervalMs);
  }

  throw new Error(errorMessage);
}

export async function proxyRpc<T>(
  proxyUrl: string,
  method: string,
  params: Record<string, unknown> | null = null
): Promise<T> {
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  const json = await response.json();
  if ('error' in json) {
    throw new Error(`${method} failed: ${JSON.stringify(json.error)}`);
  }

  return (json as JsonRpcSuccess<T>).result;
}

export async function pollAck(
  proxyUrl: string,
  recipientId: string,
  timeoutMs = 90_000,
  intervalMs = 2_000
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ack = await proxyRpc<boolean | null>(proxyUrl, 'ack.get', {
      recipient_id: recipientId,
    });
    if (ack !== null && ack !== undefined) {
      return ack;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ack on recipient_id=${recipientId}`);
}

export async function pollValidated(
  proxyUrl: string,
  recipientId: string,
  timeoutMs = 90_000,
  intervalMs = 2_000
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const consignment = await proxyRpc<{
      consignment: string;
      txid: string;
      validated?: boolean;
    }>(proxyUrl, 'consignment.get', {
      recipient_id: recipientId,
    });

    if (typeof consignment.validated === 'boolean') {
      return consignment.validated;
    }
    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for validated flag on recipient_id=${recipientId}`
  );
}

export async function pollSettledBalanceDelta(
  getAssetBalance: () => Promise<{ settled?: number | string }>,
  beforeSettled: number,
  expectedDelta: number,
  timeoutMs = 180_000,
  intervalMs = 5_000
): Promise<number> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const balance = await getAssetBalance();
    const settled = Number(balance.settled ?? 0);
    if (settled >= beforeSettled + expectedDelta) {
      return settled;
    }
    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out waiting for settled balance delta >= ${expectedDelta} (before=${beforeSettled})`
  );
}

export async function pollTransferByRecipientId<T extends TransferLike>(
  listTransfers: () => Promise<T[]>,
  recipientId: string,
  sendTxid?: string,
  timeoutMs = 120_000,
  intervalMs = 5_000
): Promise<T> {
  let lastStatus: string | undefined;

  const transfers = await pollCondition(
    async () => listTransfers(),
    (items) => {
      const transfer = items.find((item) => item.recipientId === recipientId);
      lastStatus = transfer?.status;
      return transfer?.status === 'Settled';
    },
    timeoutMs,
    intervalMs,
    `Transfer for recipientId ${recipientId} did not reach Settled within ${timeoutMs}ms (lastStatus=${lastStatus ?? 'missing'})`
  );

  const transfer = transfers.find((item) => item.recipientId === recipientId);
  if (!transfer) {
    throw new Error(
      `Transfer for recipientId ${recipientId} not found after polling`
    );
  }

  if (sendTxid && transfer.txid && transfer.txid !== sendTxid) {
    console.warn(
      `txid mismatch for recipientId ${recipientId}: expected ${sendTxid}, got ${transfer.txid}`
    );
  }

  return transfer;
}

export function writeSmokeReport(
  report: unknown,
  fileName = 'smoke-report.json'
): string {
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });

  const reportPath = path.join(artifactsDir, fileName);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}
