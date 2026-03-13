import fs from 'node:fs';
import path from 'node:path';

import type { Transfer } from '../../src/types/wallet-model';

export type JsonRpcSuccess<T> = {
  jsonrpc: string;
  id: string | number;
  result: T;
};

export type SmokeReport = {
  timestamp: string;
  durationMs: number;
  assetId: string;
  senderAddress: string;
  receiverAddress: string;
  invoice: string;
  recipientId: string;
  txid?: string;
  ack?: boolean | null;
  validated?: boolean | null;
  finalStatus?: string;
  senderSpendableBefore?: number;
  receiverSettledBefore?: number;
  receiverSettledAfter?: number;
  note?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollCondition<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs: number,
  errorMessage: string,
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
  params: Record<string, unknown> | null = null,
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
  intervalMs = 2_000,
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
  intervalMs = 2_000,
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

  throw new Error(`Timed out waiting for validated flag on recipient_id=${recipientId}`);
}

export async function pollTransferSettled(
  refreshWallet: () => Promise<void>,
  listTransfers: (assetId?: string) => Promise<Transfer[]>,
  assetId: string,
  recipientId: string,
  timeoutMs = 180_000,
  intervalMs = 5_000,
): Promise<Transfer> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await refreshWallet();
    const transfers = await listTransfers(assetId);
    const transfer = transfers.find((item) => item.recipientId === recipientId);
    if (transfer?.status === 'Settled') {
      return transfer;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for Settled transfer on recipient_id=${recipientId}`);
}

export function writeSmokeReport(report: SmokeReport): string {
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });

  const reportPath = path.join(artifactsDir, 'signet-offline-receiver-smoke.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}
