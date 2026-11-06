// Same rules as the checks of the same name in @utexo/rgb-lib-rn: WebRGB and
// the burn journal check a request before the engine sees it.
import { ValidationError } from '@utexo/rgb-sdk-core';
import type { BurnParams } from '@utexo/rgb-sdk-core';

export function validateBurnParams(params: BurnParams): void {
  if (
    !params ||
    typeof params.assetId !== 'string' ||
    !params.assetId.startsWith('rgb:') ||
    params.assetId.length > 256
  )
    throw new ValidationError('Invalid assetId', 'assetId');
  if (
    typeof params.amount !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(params.amount) ||
    BigInt(params.amount) > 18446744073709551615n
  )
    throw new ValidationError(
      'Burn amount must be a positive u64 decimal string',
      'amount'
    );
  if (
    params.burnRecipient !== undefined &&
    !/^[a-fA-F0-9]{64}$/.test(params.burnRecipient)
  )
    throw new ValidationError(
      'burnRecipient must be 32-byte hex without 0x',
      'burnRecipient'
    );
  if (!Number.isSafeInteger(params.feeRate) || params.feeRate < 1)
    throw new ValidationError(
      'feeRate must be a positive safe integer in sat/vB',
      'feeRate'
    );
  if (
    !Number.isInteger(params.minConfirmations) ||
    params.minConfirmations < 1 ||
    params.minConfirmations > 255
  )
    throw new ValidationError(
      'minConfirmations must be between 1 and 255',
      'minConfirmations'
    );
}

export function validateConsignmentLookup(assetId: string, txid: string): void {
  if (
    typeof assetId !== 'string' ||
    !assetId.startsWith('rgb:') ||
    assetId.length > 256
  )
    throw new ValidationError('Invalid assetId or txid', 'assetId');
  if (typeof txid !== 'string' || !/^[a-fA-F0-9]{64}$/.test(txid))
    throw new ValidationError('Invalid assetId or txid', 'txid');
}
