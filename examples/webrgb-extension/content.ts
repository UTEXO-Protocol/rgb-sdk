/**
 * Content script (isolated world). Relays page requests to the service
 * worker and its answers back. It forwards only well-formed requests for
 * known methods, and never adds an origin.
 */
import { CHANNEL, isPageMethod } from './protocol.js';
import type { WalletReply, WalletRequest, WalletResponse } from './protocol.js';

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin)
    return;
  const data = event.data as Partial<WalletRequest> | null;
  if (
    data?.channel !== CHANNEL ||
    data.kind !== 'request' ||
    typeof data.id !== 'string' ||
    !isPageMethod(data.method) ||
    !Array.isArray(data.args)
  )
    return;
  const request: WalletRequest = {
    channel: CHANNEL,
    kind: 'request',
    id: data.id,
    method: data.method,
    args: data.args,
  };
  void chrome.runtime
    .sendMessage<WalletRequest, WalletReply>(request)
    .catch((): WalletReply => ({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'The wallet is not available' },
    }))
    .then((reply) => {
      const response: WalletResponse = {
        ...reply,
        channel: CHANNEL,
        kind: 'response',
        id: request.id,
      };
      window.postMessage(response, window.location.origin);
    });
});
