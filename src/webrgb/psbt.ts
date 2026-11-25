/**
 * What `signPsbt` reads from a PSBT (BIP-174 version 0): each input's
 * outpoint and signature entries, and each output's script, amount and
 * address. It never signs or changes anything.
 *
 * Signature entries are the partial signatures (`0x02`), the Taproot key and
 * script signatures (`0x13`, `0x14`) and the final script fields (`0x07`,
 * `0x08`). An input the wallet signed is one whose entries changed, which
 * also covers an input the signer finalized.
 */
import { base64, bech32, bech32m, createBase58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { BitcoinNetwork } from '@utexo/rgb-sdk-core';
import { WebRgbError } from './errors.js';

export interface PsbtInput {
  txid: string;
  vout: number;
  /** The signature entries, serialized key and value in hex, sorted. */
  signatures: string;
  /** The amount of `witness_utxo`, when the input carries one. */
  amount?: bigint;
}
export interface PsbtOutput {
  amount: number;
  script: string;
  /** `null` for scripts without an address, such as OP_RETURN. */
  address: string | null;
}
export interface ParsedPsbt {
  inputs: PsbtInput[];
  outputs: PsbtOutput[];
}

const MAGIC = [0x70, 0x73, 0x62, 0x74, 0xff];
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SIGNATURE_KEYS = new Set([0x02, 0x07, 0x08, 0x13, 0x14]);
const base58check = createBase58check(sha256);

function invalid(detail: string): never {
  throw new WebRgbError('INVALID_PARAMS', `Invalid PSBT: ${detail}`);
}

class Reader {
  offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.offset === this.bytes.length;
  }

  take(length: number): Uint8Array {
    const end = this.offset + length;
    if (end > this.bytes.length) invalid('it ends too early');
    const taken = this.bytes.subarray(this.offset, end);
    this.offset = end;
    return taken;
  }

  /** Bitcoin's CompactSize; sizes of 2^32 and above never fit a PSBT here. */
  size(): number {
    const first = this.take(1)[0]!;
    if (first < 0xfd) return first;
    if (first === 0xff) invalid('a size is too large');
    const wide = this.take(first === 0xfd ? 2 : 4);
    return wide.reduceRight((sum, byte) => sum * 256 + byte, 0);
  }

  u32(): number {
    return this.take(4).reduceRight((sum, byte) => sum * 256 + byte, 0);
  }

  /** A little-endian u64. */
  amount(): bigint {
    return this.take(8).reduceRight((sum, b) => sum * 256n + BigInt(b), 0n);
  }
}

interface Entry {
  key: Uint8Array;
  value: Uint8Array;
}

function readMap(reader: Reader): Entry[] {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (;;) {
    const keyLength = reader.size();
    if (keyLength === 0) return entries;
    const key = reader.take(keyLength);
    const value = reader.take(reader.size());
    const id = bytesToHex(key);
    if (seen.has(id)) invalid('a key is repeated');
    seen.add(id);
    entries.push({ key, value });
  }
}

function single(entries: Entry[], type: number): Uint8Array | undefined {
  return entries.find(
    (entry) => entry.key.length === 1 && entry.key[0] === type
  )?.value;
}

function decode(psbt: unknown): Uint8Array {
  if (typeof psbt !== 'string' || psbt.length === 0 || !BASE64.test(psbt))
    invalid('it must be a base64 string');
  const bytes = base64.decode(psbt);
  if (!MAGIC.every((byte, i) => bytes[i] === byte))
    invalid('the header is wrong');
  return bytes;
}

/** The address an output script pays, or `null` when it has none. */
export function scriptAddress(
  script: Uint8Array,
  network: BitcoinNetwork
): string | null {
  const mainnet = network === 'mainnet';
  const hrp = mainnet ? 'bc' : network === 'regtest' ? 'bcrt' : 'tb';
  const [op, push] = [script[0], script[1]];
  // Witness programs: OP_0 or OP_1..OP_16, then one push of 2 to 40 bytes.
  if (
    script.length >= 4 &&
    script.length <= 42 &&
    push === script.length - 2 &&
    (op === 0x00 || (op! >= 0x51 && op! <= 0x60))
  ) {
    const version = op === 0x00 ? 0 : op! - 0x50;
    const program = script.subarray(2);
    if (version === 0 && program.length !== 20 && program.length !== 32)
      return null;
    const words = [version, ...bech32.toWords(program)];
    return version === 0
      ? bech32.encode(hrp, words, 90)
      : bech32m.encode(hrp, words, 90);
  }
  if (
    script.length === 25 &&
    op === 0x76 &&
    push === 0xa9 &&
    script[2] === 0x14 &&
    script[23] === 0x88 &&
    script[24] === 0xac
  )
    return base58check.encode(
      Uint8Array.from([mainnet ? 0x00 : 0x6f, ...script.subarray(3, 23)])
    );
  if (
    script.length === 23 &&
    op === 0xa9 &&
    push === 0x14 &&
    script[22] === 0x87
  )
    return base58check.encode(
      Uint8Array.from([mainnet ? 0x05 : 0xc4, ...script.subarray(2, 22)])
    );
  return null;
}

export function parsePsbt(psbt: unknown, network: BitcoinNetwork): ParsedPsbt {
  const reader = new Reader(decode(psbt));
  reader.take(MAGIC.length);
  const global = readMap(reader);
  const unsigned = single(global, 0x00);
  if (!unsigned) invalid('it has no unsigned transaction');
  const version = single(global, 0xfb);
  if (version && version.some((byte) => byte !== 0))
    invalid('only PSBT version 0 is supported');

  const tx = new Reader(unsigned);
  tx.take(4);
  const inputCount = tx.size();
  if (inputCount === 0) invalid('the transaction has no inputs');
  const outpoints: Array<{ txid: string; vout: number }> = [];
  for (let i = 0; i < inputCount; i++) {
    const txid = bytesToHex(Uint8Array.from(tx.take(32)).reverse());
    const vout = tx.u32();
    if (tx.size() !== 0) invalid('the unsigned transaction has a scriptSig');
    tx.take(4);
    outpoints.push({ txid, vout });
  }
  const outputCount = tx.size();
  const outputs: PsbtOutput[] = [];
  for (let i = 0; i < outputCount; i++) {
    const amount = tx.amount();
    if (amount > BigInt(Number.MAX_SAFE_INTEGER))
      invalid('an output amount is out of range');
    const script = tx.take(tx.size());
    outputs.push({
      amount: Number(amount),
      script: bytesToHex(script),
      address: scriptAddress(script, network),
    });
  }
  tx.take(4);
  if (!tx.done) invalid('the transaction has trailing data');

  const inputs = outpoints.map((outpoint): PsbtInput => {
    const entries = readMap(reader);
    const utxo = single(entries, 0x01);
    const signatures = entries
      .filter((entry) => SIGNATURE_KEYS.has(entry.key[0]!))
      .map((entry) => `${bytesToHex(entry.key)}:${bytesToHex(entry.value)}`)
      .sort()
      .join(',');
    return {
      ...outpoint,
      signatures,
      ...(utxo && utxo.length >= 8 && { amount: new Reader(utxo).amount() }),
    };
  });
  for (let i = 0; i < outputCount; i++) readMap(reader);
  if (!reader.done) invalid('it has trailing data');
  return { inputs, outputs };
}

/** The inputs whose signature entries differ between two copies of a PSBT. */
export function changedInputs(before: ParsedPsbt, after: ParsedPsbt): number[] {
  if (
    before.inputs.length !== after.inputs.length ||
    before.inputs.some(
      (input, i) =>
        input.txid !== after.inputs[i]!.txid ||
        input.vout !== after.inputs[i]!.vout
    )
  )
    throw new WebRgbError(
      'INTERNAL_ERROR',
      'The signer returned a different transaction'
    );
  return before.inputs.flatMap((input, i) =>
    input.signatures === after.inputs[i]!.signatures ? [] : [i]
  );
}

/** The fee, when every input carries the amount it spends. */
export function psbtFee(psbt: ParsedPsbt): number | null {
  if (psbt.inputs.some((input) => input.amount === undefined)) return null;
  const spent = psbt.inputs.reduce((sum, input) => sum + input.amount!, 0n);
  const paid = psbt.outputs.reduce((sum, out) => sum + BigInt(out.amount), 0n);
  const fee = spent - paid;
  return fee >= 0n && fee <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(fee)
    : null;
}
