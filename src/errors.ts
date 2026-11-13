/**
 * Errors the facade raises itself. Engine errors pass through unchanged.
 *
 * Shaped as an `EngineError` (own `code`, `operation`, `protocol`), so
 * `isEngineError()` from core recognizes it across package copies.
 */

import { SDKError } from '@utexo/rgb-sdk-core';
import type { EngineError, WalletProtocol } from '@utexo/rgb-sdk-core';

export type UTEXOWalletErrorCode =
  /** `new UTEXOWallet()` got no usable engine. */
  | 'INVALID_CONFIG'
  /** The wallet cannot perform this operation (e.g. a burn on a watch-only wallet). */
  | 'UNSUPPORTED_CAPABILITY';

export interface UTEXOWalletErrorOptions {
  /** Public operation name; omitted for construction errors. */
  operation?: string;
  /** Kept only when it is a known protocol. */
  protocol?: unknown;
  cause?: Error;
}

export class UTEXOWalletError extends SDKError implements EngineError {
  declare readonly code: UTEXOWalletErrorCode;
  readonly operation: string | undefined;
  readonly protocol: WalletProtocol | undefined;

  constructor(
    code: UTEXOWalletErrorCode,
    message: string,
    options: UTEXOWalletErrorOptions = {}
  ) {
    super(message, code, undefined, options.cause);
    this.name = 'UTEXOWalletError';
    this.operation = options.operation;
    this.protocol =
      options.protocol === 'RGB_L1' || options.protocol === 'RGB_LN'
        ? options.protocol
        : undefined;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
