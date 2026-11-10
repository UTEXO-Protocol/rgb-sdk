import { isEngineError, SDKError } from '@utexo/rgb-sdk-core';
import type { EngineError, WalletProtocol } from '@utexo/rgb-sdk-core';

/** Ported from `@utexo/rgb-lib-rn` (`wallet-errors.ts`, `rgb-lib/errors.ts`). */
export type RgbLibWebErrorCode =
  | 'WALLET_NOT_INITIALIZED'
  | 'WALLET_OFFLINE'
  | 'WALLET_STOPPING'
  | 'WALLET_INVALID_STATE'
  | 'WALLET_DISPOSED'
  | 'WALLET_CONFIG_MISMATCH'
  | 'INVALID_CONFIG'
  | 'KEYS_UNAVAILABLE'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_OVERFLOW'
  | 'FEE_RATE_UNSUPPORTED'
  | 'INVALID_NATIVE_RESPONSE'
  | 'UNSUPPORTED_CAPABILITY'
  | 'ASSET_NOT_FOUND'
  | 'INVALID_PARAMS'
  | 'INSUFFICIENT_FUNDS'
  | 'NATIVE_ERROR';

const PROTOCOL = 'RGB_L1';

/**
 * Errors are recognized by shape with core's `isEngineError()`, never by
 * class: `instanceof` fails across duplicated SDK copies.
 */
export class RgbLibWebError extends SDKError implements EngineError {
  // Always own properties, even when undefined: isEngineError() checks them.
  readonly operation: string | undefined;
  readonly protocol: WalletProtocol | undefined;

  constructor(
    readonly code: RgbLibWebErrorCode,
    message: string,
    operation?: string,
    cause?: Error
  ) {
    super(message, code, undefined, cause);
    this.operation = operation;
    this.protocol = PROTOCOL;
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'RgbLibWebError';
  }
}

/** A rejection value that is not an `Error` (rgb-lib-wasm throws strings), kept whole. */
export class WasmRejection extends Error {
  constructor(readonly rejection: unknown) {
    super(typeof rejection === 'string' ? rejection : messageOf(rejection));
    this.name = 'WasmRejection';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function messageOf(value: unknown): string {
  const message = (value as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(value);
}

export function asCause(value: unknown): Error | undefined {
  if (value === undefined) return undefined;
  return value instanceof Error ? value : new WasmRejection(value);
}

/**
 * rgb-lib-wasm rejects with the error's display string, without the variant
 * name, so the code comes from the message. The texts are rgb-lib's
 * `#[error(...)]` strings.
 */
export function rgbLibWasmErrorCode(message: string): RgbLibWebErrorCode {
  if (/^Asset with id \S+ not found$/.test(message)) return 'ASSET_NOT_FOUND';
  if (message === 'Operation not allowed on watch only wallet')
    return 'UNSUPPORTED_CAPABILITY';
  if (message.startsWith('Wallet is offline')) return 'WALLET_OFFLINE';
  if (message.startsWith('Invalid') || message.startsWith('Amount 0'))
    return 'INVALID_PARAMS';
  if (message.startsWith('Insufficient')) return 'INSUFFICIENT_FUNDS';
  return 'NATIVE_ERROR';
}

/** A WASM rejection as an engine error; engine errors pass through. */
export function toBackendError(error: unknown, operation: string): EngineError {
  if (isEngineError(error)) return error;
  const message = messageOf(error);
  const code = rgbLibWasmErrorCode(message);
  return new RgbLibWebError(
    code,
    code === 'UNSUPPORTED_CAPABILITY'
      ? `${operation} needs the mnemonic; this RGB_L1 wallet was opened watch-only from public keys`
      : message || 'RGB Lib operation failed',
    operation,
    asCause(error)
  );
}

/** An engine error under the public operation name; the original is not mutated. */
export function withOperation(
  error: EngineError,
  operation: string
): EngineError {
  if (error.operation === operation && error.protocol === PROTOCOL)
    return error;
  const cause =
    error instanceof RgbLibWebError && error.cause instanceof Error
      ? error.cause
      : asCause(error);
  return new RgbLibWebError(
    // A code from another copy is kept even if this copy does not list it.
    error.code as RgbLibWebErrorCode,
    error.message,
    operation,
    cause
  );
}

/**
 * The error a public operation rejects with, applied once at the public
 * boundary: engine errors get the operation name, core `ValidationError`s
 * become `INVALID_PARAMS`, anything else is mapped like a WASM rejection.
 */
export function toPublicError(error: unknown, operation: string): EngineError {
  if (isEngineError(error)) return withOperation(error, operation);
  const value = error as { code?: unknown; message?: unknown } | null;
  if (value?.code === 'VALIDATION_ERROR' && typeof value.message === 'string') {
    return new RgbLibWebError(
      'INVALID_PARAMS',
      value.message,
      operation,
      asCause(error)
    );
  }
  return toBackendError(error, operation);
}

/**
 * A synchronous throw while a public operation reads its arguments, before
 * admission. Errors without a code (a `TypeError`, a throwing getter) are
 * `INVALID_PARAMS` with the original as cause.
 */
export function toArgumentError(
  error: unknown,
  operation: string
): EngineError {
  const value = error as { code?: unknown } | null;
  if (isEngineError(error) || value?.code === 'VALIDATION_ERROR')
    return toPublicError(error, operation);
  return new RgbLibWebError(
    'INVALID_PARAMS',
    `Invalid arguments for ${operation}`,
    operation,
    asCause(error)
  );
}

/** Rejects `operation` because this runtime cannot perform it (ADR-0001). */
export function unsupported(
  operation: string,
  detail?: string
): RgbLibWebError {
  return new RgbLibWebError(
    'UNSUPPORTED_CAPABILITY',
    `${operation} is not supported by the rgb-lib-wasm engine${detail ? `: ${detail}` : ''}`,
    operation
  );
}
