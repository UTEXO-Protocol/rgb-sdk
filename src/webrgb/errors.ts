/* eslint no-unused-vars: "off", "@typescript-eslint/no-unused-vars": "error" -- TypeScript signatures. */
import { isProviderError } from '@utexo/webrgb';
import type { ProviderErrorCode } from '@utexo/webrgb';

export class WebRgbError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'WebRgbError';
  }
}

/**
 * rgb-lib's `InsufficientAllocationSlots` ("Insufficient allocations"): no
 * output can take another allocation. Both engines report it as
 * `INSUFFICIENT_FUNDS` and keep the native error as the cause.
 */
function noAllocationSlot(error: unknown): boolean {
  const failure = error as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown };
  } | null;
  return (
    failure?.code === 'INSUFFICIENT_FUNDS' &&
    (failure.cause?.code === 'RGB_LIB_InsufficientAllocationSlots' ||
      failure.message === 'Insufficient allocations' ||
      failure.cause?.message === 'Insufficient allocations')
  );
}

/** The wallet lacks the bitcoin a spend needs (rgb-lib `InsufficientBitcoins`). */
function noBitcoin(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    (code === 'INSUFFICIENT_FUNDS' || code === 'InsufficientBitcoins') &&
    !noAllocationSlot(error)
  );
}

/**
 * Native errors are implementation details; expose only the WebRGB contract.
 * `shortfall` replaces the message when the wallet lacks bitcoin, for
 * methods whose contract asks the message to say so.
 */
export async function walletCall<T>(
  action: () => Promise<T>,
  shortfall?: string
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isProviderError(error)) throw error;
    if (shortfall && noBitcoin(error)) {
      const detail = (error as { message?: unknown }).message;
      throw new WebRgbError(
        'INTERNAL_ERROR',
        typeof detail === 'string' && detail
          ? `${shortfall}: ${detail}`
          : shortfall
      );
    }
    const native = error as {
      code?: string | { type?: string };
      message?: string;
    } | null;
    const code =
      typeof native?.code === 'string' ? native.code : native?.code?.type;
    let mapped: ProviderErrorCode = 'INTERNAL_ERROR';
    // RLN codes, then WalletBackendError codes (rgb-lib errors are normalized to these).
    if (
      code === 'AssetNotFound' ||
      code === 'UnknownAsset' ||
      code === 'ASSET_NOT_FOUND'
    )
      mapped = 'ASSET_NOT_FOUND';
    else if (
      code === 'InvalidAssetId' ||
      code === 'InvalidInvoice' ||
      code === 'InvalidAmount' ||
      code === 'INVALID_PARAMS' ||
      code === 'INVALID_AMOUNT' ||
      code === 'AMOUNT_OVERFLOW' ||
      code === 'FEE_RATE_UNSUPPORTED'
    )
      mapped = 'INVALID_PARAMS';
    else if (
      code === 'NoAvailableUtxos' ||
      code === 'NO_AVAILABLE_UTXOS' ||
      noAllocationSlot(error)
    )
      mapped = 'NO_AVAILABLE_UTXOS';
    else if (
      code === 'METHOD_NOT_SUPPORTED' ||
      code === 'UnsupportedInExternalSignerMode' ||
      code === 'UNSUPPORTED_CAPABILITY'
    )
      mapped = 'METHOD_NOT_SUPPORTED';
    throw new WebRgbError(mapped, native?.message ?? 'Wallet operation failed');
  }
}
