import { AssetSchema } from '@utexo/rgb-sdk-core';
import type {
  AssetIfa,
  AssetNIA,
  BitcoinNetwork,
  Transaction,
  TransactionType,
  TransferStatus,
  WalletAssignment,
  WalletInvoiceData,
  WalletListAssets,
  WalletTransfer,
  WalletUnspent,
} from '@utexo/rgb-sdk-core';
import { safeAmount, safeNumber, u64 } from './amounts.js';
import type {
  DtoAsset,
  DtoAssignment,
  DtoBalance,
  DtoInvoice,
  DtoOperation,
  DtoReceive,
  DtoTransaction,
  DtoTransfer,
  DtoUnspent,
} from './dto.js';
import { RgbLibWebError } from './errors.js';

// Ported from `@utexo/rgb-lib-rn` (`rgb-lib/mappers.ts`). rgb-lib-wasm has no
// CFA or UDA schema, so those mappers are left out.

function invalid(message: string): never {
  throw new RgbLibWebError('INVALID_NATIVE_RESPONSE', message);
}

export function known<T extends string>(
  value: string,
  values: readonly T[],
  field: string
): T {
  if (!values.includes(value as T)) invalid(`Unknown rgb-lib-wasm ${field}`);
  return value as T;
}

export function balance(value: DtoBalance) {
  return {
    settled: safeAmount(value.settled, 'settled'),
    future: safeAmount(value.future, 'future'),
    spendable: safeAmount(value.spendable, 'spendable'),
  };
}

export function assignment(value: DtoAssignment): WalletAssignment {
  const type = known(
    value.type,
    [
      'Fungible',
      'NonFungible',
      'InflationRight',
      'MintRight',
      'LinkRight',
      'Any',
    ] as const,
    'assignment'
  );
  if (type === 'Fungible' || type === 'InflationRight') {
    if (value.amount === null) invalid('Missing assignment amount');
    const amountBaseUnits = u64(value.amount, 'assignment');
    return {
      type,
      amountBaseUnits,
      ...(BigInt(amountBaseUnits) <= BigInt(Number.MAX_SAFE_INTEGER) && {
        amount: Number(amountBaseUnits),
      }),
    };
  }
  if (value.amount !== null) invalid('Unexpected assignment amount');
  return { type };
}

export function transferStatus(value: string): TransferStatus {
  return known(
    value,
    [
      'Initiated',
      'WaitingCounterparty',
      'WaitingSafeHeight',
      'WaitingBroadcast',
      'WaitingConfirmations',
      'Settled',
      'Failed',
    ] as const,
    'transfer status'
  );
}

export function transfer(value: DtoTransfer): WalletTransfer {
  const assignments = value.assignments.map(assignment);
  const requestedAssignment = value.requestedAssignment
    ? assignment(value.requestedAssignment)
    : undefined;
  const amounts = assignments
    .filter((a) => a.type === 'Fungible')
    .map((a) => BigInt(a.amountBaseUnits!));
  const total = amounts.length
    ? amounts.reduce((sum, amount) => sum + amount, 0n)
    : requestedAssignment?.type === 'Fungible'
      ? BigInt(requestedAssignment.amountBaseUnits!)
      : undefined;
  return {
    idx: value.idx,
    batchTransferIdx: value.batchTransferIdx,
    createdAt: safeNumber(value.createdAt, 'createdAt'),
    updatedAt: safeNumber(value.updatedAt, 'updatedAt'),
    status: transferStatus(value.status),
    kind: known(
      value.kind,
      [
        'Issuance',
        'ReceiveBlind',
        'ReceiveWitness',
        'Send',
        'Inflation',
        'Burn',
        'Mint',
        'Link',
      ] as const,
      'transfer kind'
    ),
    requestedAssignment,
    assignments,
    ...(total !== undefined && {
      amountBaseUnits: total.toString(),
      ...(total <= BigInt(Number.MAX_SAFE_INTEGER) && {
        amount: Number(total),
      }),
    }),
    txid: value.txid ?? undefined,
    recipientId: value.recipientId ?? undefined,
    receiveUtxo: value.receiveUtxo ?? undefined,
    changeUtxos: value.changeUtxos,
    changeUtxo: value.changeUtxos[0],
    expiration:
      value.expiration === null
        ? undefined
        : safeAmount(value.expiration, 'expiration'),
    transportEndpoints: value.transportEndpoints,
    invoiceString: value.invoiceString ?? undefined,
    consignmentPath: value.consignmentPath ?? undefined,
  };
}

export function transaction(value: DtoTransaction): Transaction {
  return {
    txid: value.txid,
    transactionType: known<TransactionType>(
      value.transactionType,
      ['RgbSend', 'Drain', 'CreateUtxos', 'SendBtc', 'Incoming'],
      'transaction type'
    ),
    received: safeAmount(value.received, 'received'),
    sent: safeAmount(value.sent, 'sent'),
    fee: safeAmount(value.fee, 'fee'),
    confirmationTime: value.confirmationTime
      ? {
          height: value.confirmationTime.height,
          timestamp: safeAmount(
            value.confirmationTime.timestamp,
            'confirmation timestamp'
          ),
        }
      : undefined,
  };
}

export function unspent(value: DtoUnspent): WalletUnspent {
  return {
    utxo: {
      ...value.utxo,
      btcAmount: safeAmount(value.utxo.btcAmount, 'btcAmount'),
    },
    pendingBlinded: value.pendingBlinded,
    rgbAllocations: value.rgbAllocations.map((a) => ({
      assetId: a.assetId ?? undefined,
      assignment: assignment(a.assignment),
      settled: a.settled,
    })),
  };
}

function baseAsset(value: DtoAsset) {
  return {
    assetId: value.assetId,
    name: value.name,
    details: value.details ?? undefined,
    precision: value.precision,
    timestamp: safeNumber(value.timestamp, 'timestamp'),
    addedAt: safeNumber(value.addedAt, 'addedAt'),
    balance: balance(value.balance),
    media: value.media ?? undefined,
  };
}

function required<T>(value: T | null, name: string): T {
  if (value === null) invalid(`Missing ${name}`);
  return value;
}

export function nia(value: DtoAsset): AssetNIA {
  known(value.schema, ['Nia'], 'asset schema');
  return {
    ...baseAsset(value),
    ticker: required(value.ticker, 'ticker'),
    issuedSupply: safeAmount(
      required(value.issuedSupply, 'issuedSupply'),
      'issuedSupply'
    ),
  };
}

export function ifa(value: DtoAsset): AssetIfa {
  known(value.schema, ['Ifa'], 'asset schema');
  return {
    ...baseAsset(value),
    ticker: required(value.ticker, 'ticker'),
    initialSupply: safeAmount(
      required(value.initialSupply, 'initialSupply'),
      'initialSupply'
    ),
    maxSupply: safeAmount(required(value.maxSupply, 'maxSupply'), 'maxSupply'),
    knownCirculatingSupply: safeAmount(
      required(value.knownCirculatingSupply, 'knownCirculatingSupply'),
      'knownCirculatingSupply'
    ),
    rejectListUrl: value.rejectListUrl ?? undefined,
  };
}

export function assets(values: DtoAsset[]): WalletListAssets {
  const result: WalletListAssets = {
    nia: [],
    ifa: [],
    cfa: [],
    uda: [],
    bfa: [],
  };
  for (const value of values) {
    const schema = known(
      value.schema,
      ['Nia', 'Ifa', 'Bfa'] as const,
      'asset schema'
    );
    switch (schema) {
      case 'Nia':
        result.nia.push(nia(value));
        break;
      case 'Ifa':
        result.ifa.push(ifa(value));
        break;
      case 'Bfa':
        result.bfa.push({
          ...baseAsset(value),
          ticker: required(value.ticker, 'ticker'),
          initialSupply: safeAmount(
            required(value.initialSupply, 'initialSupply'),
            'initialSupply'
          ),
          // rgb-lib-wasm reports no circulating supply for BFA assets.
          ...(value.knownCirculatingSupply !== null && {
            knownCirculatingSupply: safeAmount(
              value.knownCirculatingSupply,
              'knownCirculatingSupply'
            ),
          }),
          rejectListUrl: value.rejectListUrl ?? undefined,
        });
        break;
    }
  }
  return result;
}

/** A failed transfer is named `RGB_LIB_<Variant>`, as on React Native. */
export function refreshFailure(value: { name: string; message: string }) {
  if (
    typeof value?.name !== 'string' ||
    !/^RGB_LIB_[A-Z][A-Za-z0-9]*$/.test(value.name) ||
    typeof value.message !== 'string'
  ) {
    invalid('Invalid refresh failure');
  }
  return { name: value.name, message: value.message };
}

/** Public result of a broadcast operation; the entropy stays internal. */
export function operation(value: DtoOperation) {
  if (
    typeof value?.txid !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.txid) ||
    !Number.isSafeInteger(value.batchTransferIdx) ||
    value.batchTransferIdx < 0
  ) {
    invalid('Invalid operation result');
  }
  return { txid: value.txid, batchTransferIdx: value.batchTransferIdx };
}

export function receive(value: DtoReceive) {
  return {
    ...value,
    expirationTimestamp: safeAmount(
      value.expirationTimestamp,
      'expirationTimestamp'
    ),
  };
}

export function invoice(value: DtoInvoice, encoded: string): WalletInvoiceData {
  const schema =
    value.assetSchema === null
      ? undefined
      : known(
          value.assetSchema,
          [AssetSchema.Nia, AssetSchema.Ifa, 'Bfa'] as const,
          'invoice schema'
        );
  const network = known<BitcoinNetwork>(
    value.network,
    ['mainnet', 'testnet', 'testnet4', 'regtest', 'signet', 'utexo'],
    'invoice network'
  );
  return {
    invoice: encoded,
    recipientId: value.recipientId,
    assetId: value.assetId ?? undefined,
    assetSchema: schema,
    assignment: assignment(value.assignment),
    assignmentName: value.assignmentName ?? undefined,
    network,
    expirationTimestamp:
      value.expirationTimestamp === null
        ? null
        : safeAmount(value.expirationTimestamp, 'expirationTimestamp'),
    transportEndpoints: value.transportEndpoints,
    publicKey: value.publicKey ?? undefined,
    encryption: known(
      value.encryption,
      ['Required', 'Unsupported', 'Optional'] as const,
      'encryption'
    ),
    unknownQueryParams: Object.fromEntries(
      value.unknownQueryParams.map(({ key, value: item }) => [key, item])
    ),
  };
}
