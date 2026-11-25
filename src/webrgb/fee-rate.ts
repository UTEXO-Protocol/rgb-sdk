import { WebRgbError } from './errors.js';

/**
 * A positive finite sat/vB rate, rounded up to the whole sat/vB rgb-lib
 * takes; the prompt and the result show the rounded rate.
 */
export function feeRateOf(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    Math.ceil(value) > Number.MAX_SAFE_INTEGER
  )
    throw new WebRgbError(
      'INVALID_PARAMS',
      'feeRate must be a positive number of sat/vB'
    );
  return Math.ceil(value);
}
