/**
 * The dApp side: it imports only @utexo/webrgb, never a wallet SDK. The same
 * code works with any WebRGB wallet, this extension included.
 */
import {
  isProviderError,
  requestProvider,
  supports,
  toTransferArray,
} from '@utexo/webrgb';

export async function receiveFromBridge(assetId: string, amount: number) {
  try {
    // Waits for the wallet, then asks the user to connect this site.
    const rgb = await requestProvider({ enable: true });

    const info = await rgb.getInfo();
    if (info.protocol !== 'RGB_L1' || !supports(info, 'witnessReceive'))
      throw new Error('This wallet cannot receive on-chain RGB');

    // The wallet asks the user to confirm the invoice.
    const { invoice, recipientId } = await rgb.witnessReceive({
      assetId,
      amount,
    });
    await sendInvoiceToBridge(invoice);

    // Read-only calls raise no prompt, so polling is fine.
    for (;;) {
      const transfer = toTransferArray(await rgb.listTransfers(assetId)).find(
        (t) => t.recipientId === recipientId
      );
      if (transfer?.status === 'Settled') return transfer;
      if (transfer?.status === 'Failed') throw new Error('Transfer failed');
      await new Promise((resolve) => setTimeout(resolve, 15_000));
    }
  } catch (error) {
    if (isProviderError(error) && error.code === 'USER_REJECTED') return null;
    throw error;
  }
}

/** Your backend call: the bridge or faucet pays the invoice. */
declare function sendInvoiceToBridge(invoice: string): Promise<void>;
