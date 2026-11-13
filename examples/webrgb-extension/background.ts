/**
 * Service worker (MV3, `"type": "module"`). Holds the only wallet and serves
 * one `WebRgbProvider` per dApp origin.
 *
 * - The origin comes from the browser (`sender.origin`), never from a message.
 * - Keys stay here: the page and the content script never see them.
 * - The worker can stop at any time; everything is created again on the next
 *   message, and the wallet state is in IndexedDB.
 */
import { UTEXOWallet } from '@utexo/rgb-sdk';
import { BurnOperations, WebRgbProvider } from '@utexo/rgb-sdk/webrgb';
import type {
  BurnOperationRecord,
  BurnOperationStore,
  WebRgbApproval,
} from '@utexo/rgb-sdk/webrgb';
import { RgbLibWeb } from '@utexo/rgb-sdk-web';
import { CHANNEL, isPageMethod } from './protocol.js';
import type {
  ApprovalAnswer,
  PageMethod,
  WalletReply,
  WalletRequest,
} from './protocol.js';

/**
 * Your vault: returns the mnemonic once the user has unlocked the extension
 * (for example, decrypted with the password typed in the popup), or `null`
 * while it is locked. Never send it to a page or a content script.
 */
declare function readMnemonic(): Promise<string | null>;

// ── Wallet ────────────────────────────────────────────────────────────────────

function createWallet() {
  return new UTEXOWallet({
    engine: new RgbLibWeb({
      network: 'utexo',
      dataDir: 'extension',
      keys: { getMnemonic: readMnemonic },
    }),
  });
}
type Wallet = ReturnType<typeof createWallet>;

let walletReady: Promise<Wallet> | undefined;
function wallet(): Promise<Wallet> {
  walletReady ??= (async () => {
    const created = createWallet();
    await created.init();
    return created;
  })().catch((error: unknown) => {
    walletReady = undefined; // locked or failed: try again on the next call
    throw error;
  });
  return walletReady;
}

// One burn journal per wallet, shared by every origin. Records must survive
// the worker, so they go to extension storage.
const burnStore: BurnOperationStore = {
  async readAll() {
    const { burns = {} } = await chrome.storage.local.get('burns');
    return Object.values(burns as Record<string, BurnOperationRecord>);
  },
  async write(record) {
    const { burns = {} } = await chrome.storage.local.get('burns');
    await chrome.storage.local.set({
      burns: { ...(burns as object), [record.id]: record },
    });
  },
};
let burnsReady: Promise<BurnOperations> | undefined;
const burnOperations = () =>
  (burnsReady ??= wallet().then((w) => new BurnOperations(w, burnStore)));

// ── Connected origins ─────────────────────────────────────────────────────────

async function approvedOrigins(): Promise<string[]> {
  const { origins = [] } = await chrome.storage.local.get('origins');
  return origins as string[];
}
async function rememberOrigin(origin: string) {
  const origins = await approvedOrigins();
  if (!origins.includes(origin))
    await chrome.storage.local.set({ origins: [...origins, origin] });
}

/** Call from your settings page when the user disconnects a site. */
export async function disconnect(origin: string) {
  await chrome.storage.local.set({
    origins: (await approvedOrigins()).filter((o) => o !== origin),
  });
  (await providers.get(origin))?.revoke();
  providers.delete(origin);
}

const providers = new Map<string, Promise<WebRgbProvider>>();
function providerFor(origin: string): Promise<WebRgbProvider> {
  let provider = providers.get(origin);
  if (!provider) {
    provider = (async () =>
      new WebRgbProvider(await wallet(), {
        origin,
        // Restores a connection approved before the worker restarted.
        sessionApproved: (await approvedOrigins()).includes(origin),
        confirm: askUser,
        burn: { operations: await burnOperations() },
      }))();
    provider.catch(() => providers.delete(origin));
    providers.set(origin, provider);
  }
  return provider;
}

// ── Confirmations ─────────────────────────────────────────────────────────────

const answers = new Map<string, (approved: boolean) => void>();

/**
 * Opens approve.html, which reads the request from session storage, shows it
 * and sends an `ApprovalAnswer`. No answer within five minutes is a no.
 */
async function askUser(request: WebRgbApproval): Promise<boolean> {
  const id = crypto.randomUUID();
  await chrome.storage.session.set({ [`approval:${id}`]: request });
  const answer = new Promise<boolean>((resolve) => {
    answers.set(id, resolve);
    setTimeout(() => resolve(false), 5 * 60_000);
  });
  await chrome.windows.create({
    url: chrome.runtime.getURL(`approve.html#${id}`),
    type: 'popup',
    width: 380,
    height: 600,
  });
  try {
    return await answer;
  } finally {
    answers.delete(id);
    await chrome.storage.session.remove(`approval:${id}`);
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────

const extensionOrigin = new URL(chrome.runtime.getURL('')).origin;

async function handle(
  origin: string,
  method: PageMethod,
  args: unknown[]
): Promise<WalletReply> {
  try {
    const provider = await providerFor(origin);
    const call = (
      provider as unknown as Record<
        PageMethod,
        (...a: unknown[]) => Promise<unknown>
      >
    )[method];
    const result = await call.apply(provider, args);
    if (method === 'enable') await rememberOrigin(origin);
    return { ok: true, result };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return {
      ok: false,
      error: {
        code: typeof code === 'string' ? code : 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Wallet error',
      },
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const data = message as
    | (Partial<Omit<WalletRequest, 'kind'> & Omit<ApprovalAnswer, 'kind'>> & {
        kind?: string;
      })
    | null;
  if (data?.channel !== CHANNEL) return false;

  // Answers come only from this extension's own pages.
  if (data.kind === 'approval') {
    if (sender.origin === extensionOrigin && typeof data.id === 'string')
      answers.get(data.id)?.(data.approved === true);
    return false;
  }

  // Requests come from content scripts; the browser sets sender.origin.
  const origin = sender.origin;
  if (
    data.kind !== 'request' ||
    !origin ||
    !origin.startsWith('https://') ||
    !isPageMethod(data.method) ||
    !Array.isArray(data.args)
  ) {
    sendResponse({
      ok: false,
      error: { code: 'INVALID_PARAMS', message: 'Invalid request' },
    } satisfies WalletReply);
    return false;
  }
  void handle(origin, data.method, data.args).then(sendResponse);
  return true; // the response is sent asynchronously
});
