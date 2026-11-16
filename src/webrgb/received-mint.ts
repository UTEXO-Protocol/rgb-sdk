/* eslint no-unused-vars: "off", "@typescript-eslint/no-unused-vars": "error" -- TypeScript signatures. */
import type { RgbReceivedMint } from '@utexo/webrgb';
import type { ReceivedMint, WalletTransfer } from '@utexo/rgb-sdk-core';
import { WebRgbError, walletCall } from './errors.js';
import type { WebRgbWallet } from './wallet.js';

const HEX64 = /^[0-9a-f]{64}$/;
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
 * The asset the receive belongs to: the invoice's own asset, or, for an
 * any-asset invoice, the BFA asset whose transfers include the receive.
 */
async function receiveAsset(
  wallet: WebRgbWallet,
  recipientId: string,
  invoiceAsset: string | undefined
): Promise<string> {
  const assets = await walletCall(() => wallet.listAssets());
  const candidates = invoiceAsset
    ? [invoiceAsset]
    : (assets.bfa ?? []).map((asset) => asset.assetId);
  for (const assetId of candidates) {
    const transfers = await walletCall(() => wallet.listTransfers(assetId));
    if (transfers.some((t) => t.recipientId === recipientId)) return assetId;
  }
  throw new WebRgbError(
    'INTERNAL_ERROR',
    'The received mint is not linked to a wallet asset'
  );
}

/**
 * `getReceivedMint({ invoice })`: binds the engine's checked mint to an
 * invoice this wallet created. Refreshes incoming transfers only. `null`
 * only while no checked mint is ready; failures reject.
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
  const { recipientId } = decoded;
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
  const txid = receive.txid;
  if (!txid || !HEX64.test(txid)) {
    throw new WebRgbError(
      'INTERNAL_ERROR',
      'The received mint has no witness transaction'
    );
  }
  const assetId = await receiveAsset(wallet, recipientId, decoded.assetId);
  assertActive();
  return {
    invoice,
    recipientId,
    assetId,
    network,
    txid,
    opid: checked.opid,
    lockId: checked.lockId,
    amount: checked.amount,
    beforeBlock: checked.beforeBlock,
    evmChainId: checked.evmChainId,
    bridgeContract: checked.bridgeContract,
  };
}
