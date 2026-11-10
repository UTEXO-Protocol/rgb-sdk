import { RgbLibWebError } from './errors.js';

// Ported from `@utexo/rgb-lib-rn` (`rgb-lib/amounts.ts`). Exact amounts stay
// decimal strings until a checked conversion; no u64 is ever rounded.

const U64_MAX = 0xffffffffffffffffn;

export function u64(
  value: number | bigint | string,
  field: string,
  positive = false
): string {
  if (
    (typeof value === 'number' &&
      (!Number.isSafeInteger(value) || value < 0)) ||
    (typeof value !== 'number' &&
      typeof value !== 'bigint' &&
      typeof value !== 'string') ||
    !/^(0|[1-9]\d{0,19})$/.test(String(value))
  ) {
    throw new RgbLibWebError(
      'INVALID_AMOUNT',
      `${field} must be an exact unsigned integer`
    );
  }
  const n = BigInt(value);
  if (n > U64_MAX || (positive && n === 0n)) {
    throw new RgbLibWebError(
      'INVALID_AMOUNT',
      `${field} is outside the supported u64 range`
    );
  }
  return n.toString();
}

/**
 * Converts issuance allocations and checks, before any WASM call, that the
 * supply (and max supply including inflation) fits the numeric public asset
 * model. Balances never exceed the max supply, so this bounds them too.
 */
export function issuanceAmounts(
  amounts: readonly (number | bigint | string)[],
  inflationAmounts: readonly (number | bigint | string)[] = []
): { amounts: string[]; inflationAmounts: string[] } {
  const exact = amounts.map((n) => u64(n, 'amount', true));
  const inflation = inflationAmounts.map((n) =>
    u64(n, 'inflationAmount', true)
  );
  const total = [...exact, ...inflation].reduce(
    (sum, n) => sum + BigInt(n),
    0n
  );
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RgbLibWebError(
      'AMOUNT_OVERFLOW',
      'Total issued and inflatable supply cannot be represented by the numeric SDK fields'
    );
  }
  return { amounts: exact, inflationAmounts: inflation };
}

export function safeNumber(value: string, field: string): number {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d*)$/.test(value)) {
    throw new RgbLibWebError('INVALID_NATIVE_RESPONSE', `Invalid ${field}`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RgbLibWebError(
      'AMOUNT_OVERFLOW',
      `${field} cannot be represented by the numeric SDK field`
    );
  }
  return number;
}

export function safeAmount(value: string, field: string): number {
  u64(value, field);
  return safeNumber(value, field);
}

/** A positive integer sat/vB, as a decimal string. */
export function feeRate(value: number = 2): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RgbLibWebError(
      'FEE_RATE_UNSUPPORTED',
      'RGB Lib requires a positive integer feeRate in sat/vB'
    );
  }
  return String(value);
}
