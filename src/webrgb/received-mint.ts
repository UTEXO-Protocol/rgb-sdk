/* eslint no-unused-vars: "off", "@typescript-eslint/no-unused-vars": "error" -- TypeScript signatures. */
import type { RgbReceivedMint } from '@utexo/webrgb';
import type { ReceivedMint, WalletTransfer } from '@utexo/rgb-sdk-core';
import { WebRgbError, walletCall } from './errors.js';
import type { WebRgbWallet } from './wallet.js';

const HEX64 = /^[0-9a-f]{64}$/;
const ASSET_ID = /^rgb:\S+$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,19})$/;
const U64_MAX = 18446744073709551615n;
const RECEIVE_KINDS: ReadonlySet<string> = new Set([
  'ReceiveBlind',
  'ReceiveWitness',
]);

/** The request is exactly `{ invoice }`, the complete invoice the wallet created. */
export function receivedMintInvoice(value: unknown): string {
  const args = value as Record<string, unknown> | null;
  if (
    !args ||
    typeof args !== 'object' ||
    Array.isArray(args) ||
    Object.keys(args).length !== 1 ||
    typeof args.invoice !== 'string' ||
    !args.invoice.startsWith('rgb:') ||
    args.invoice.length > 8192 ||
    // RGB invoices are printable ASCII: no whitespace or control characters.
    !/^[\x21-\x7e]+$/.test(args.invoice)
  ) {
    throw new WebRgbError(
      'INVALID_PARAMS',
      'getReceivedMint requires { invoice }: the complete invoice'
    );
  }
  return args.invoice;
}

function u64(value: string): boolean {
  return DECIMAL.test(value) && BigInt(value) <= U64_MAX;
}

/** Checks the engine result has the public commitment shape. */
function commitment(mint: ReceivedMint): ReceivedMint {
  if (
    (mint.assetId !== undefined && !ASSET_ID.test(mint.assetId)) ||
    !HEX64.test(mint.opid) ||
    !HEX64.test(mint.lockId) ||
    ![mint.amount, mint.beforeBlock, mint.evmChainId].every(u64) ||
    !ADDRESS.test(mint.bridgeContract.toLowerCase())
  ) {
    throw new WebRgbError(
      'INTERNAL_ERROR',
      'The wallet returned an invalid received mint'
    );
  }
  return { ...mint, bridgeContract: mint.bridgeContract.toLowerCase() };
}

/**
 * The receipt's asset. The engine's comes from the consignment it checked. An
 * engine without one can still answer for an invoice naming the asset, as
 * rgb-lib refuses a consignment for another asset; an any-asset invoice then
 * has nothing proving the asset.
 */
function receiptAsset(
  checked: string | undefined,
  invoiceAsset: string | null | undefined
): string {
  if (checked && invoiceAsset && checked !== invoiceAsset) {
    throw new WebRgbError(
      'INVALID_PARAMS',
      'The received mint is for another asset than the invoice'
    );
  }
  const assetId = checked ?? invoiceAsset;
  if (!assetId) {
    throw new WebRgbError(
      'INVALID_PARAMS',
      'This wallet cannot prove the asset of a mint for an any-asset invoice'
    );
  }
  return assetId;
}

type Receive = WalletTransfer & { recipientId: string };

/**
 * The one receive of this wallet the invoice was created for. The stored
 * invoice string must match exactly: a matching recipient ID alone does not
 * bind the public key, expiry, assignment or transport data.
 */
async function ownedReceive(
  wallet: WebRgbWallet,
  invoice: string,
  recipientId: string
): Promise<Receive> {
  const transfers = await walletCall(() => wallet.listTransfers());
  const matches = transfers.filter(
    (t): t is Receive =>
      t.recipientId === recipientId && RECEIVE_KINDS.has(t.kind)
  );
  if (matches.length !== 1 || matches[0]!.invoiceString !== invoice) {
    throw new WebRgbError(
      'INVALID_PARAMS',
      'The invoice was not created by this wallet'
    );
  }
  return matches[0]!;
}

/**
 * `getReceivedMint({ invoice })`: binds the engine's checked mint to an
 * invoice this wallet created. Refreshes incoming transfers only. `null`
 * only while no checked mint is ready; failures reject.
 *
 * rgb-lib checks the mint before its EVM lock is paid, but links the receive
 * to its asset and witness transaction only once the lock is found. So
 * `assetId` comes from the checked consignment, not the history, and `txid` is
 * present only once the history has it (`lockId` already commits to it).
 */
export async function getReceivedMint(
  wallet: WebRgbWallet,
  invoice: string,
  assertActive: () => void
): Promise<RgbReceivedMint | null> {
  const lookup = wallet.getReceivedMint?.bind(wallet);
  if (!lookup) {
    throw new WebRgbError(
      'METHOD_NOT_SUPPORTED',
      'This wallet cannot validate received mints'
    );
  }
  const network = wallet.getNetwork();
  const decoded = await walletCall(() => wallet.decodeRGBInvoice({ invoice }));
  if (decoded.network !== network) {
    throw new WebRgbError(
      'INVALID_PARAMS',
      'The invoice is for another network'
    );
  }
  const { recipientId, assetId: invoiceAsset } = decoded;
  await ownedReceive(wallet, invoice, recipientId);
  assertActive();

  const mint = await walletCall(() =>
    lookup(recipientId, { refreshIncoming: true })
  );
  assertActive();
  // Status after the refresh: a failed or expired receive rejects.
  const receive = await ownedReceive(wallet, invoice, recipientId);
  if (receive.status === 'Failed') {
    throw new WebRgbError(
      'INVALID_PARAMS',
      'The receive failed: the mint was refused or the invoice expired'
    );
  }
  if (!mint) {
    const expiry = decoded.expirationTimestamp;
    if (
      receive.status === 'WaitingCounterparty' &&
      expiry !== null &&
      expiry * 1000 <= Date.now()
    ) {
      throw new WebRgbError('INVALID_PARAMS', 'The invoice expired');
    }
    return null;
  }
  const checked = commitment(mint);
  const assetId = receiptAsset(checked.assetId, invoiceAsset);
  const { txid } = receive;
  if (txid && !HEX64.test(txid)) {
    throw new WebRgbError(
      'INTERNAL_ERROR',
      'The received mint has an invalid witness transaction ID'
    );
  }
  return {
    invoice,
    recipientId,
    assetId,
    network,
    ...(txid ? { txid } : {}),
    opid: checked.opid,
    lockId: checked.lockId,
    amount: checked.amount,
    beforeBlock: checked.beforeBlock,
    evmChainId: checked.evmChainId,
    bridgeContract: checked.bridgeContract,
  };
}
