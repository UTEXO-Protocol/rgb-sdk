# Integration flow examples

These walkthroughs connect common integration tasks to **`UTEXOWallet`** APIs: provisioning a user wallet, syncing and reading balances, moving RGB assets between wallets, and working with token-like (**NIA**) assets such as USDT-style tickers.

For testnet setup, faucets, and parameters, see [Getting Started](./getting-started).

## Goals → SDK approach

| Goal | Approach with the SDK |
|--------------|-------------------------|
| **1. Generate an address per user; need “private key” control** | **Keys:** one **BIP39 mnemonic** per user (optional **`getXprivFromMnemonic`** for account `xpriv`). **`UTEXOWallet`** derives the key material rgb-lib expects and handles addresses for you. **Steady deposit string:** **`reuseAddresses: true`** makes **`getAddress()`** reuse the **same receive address** for UTEXO / RGB deposits (**not** plain-Bitcoin-route receives—see Stable deposit section). Call **`rotateVanillaAddress()` / `rotateColoredAddress()`** to advance deliberately. |
| **2. Fetch balances** | `syncWallet()` / `refreshWallet()`, then `getBtcBalance()` for BTC (vanilla vs colored), and `listAssets()` / `getAssetBalance(assetId)` for RGB. |
| **3. Transfer balance between addresses or wallets** | **RGB assets:** receiver builds an invoice (`blindReceive` / `witnessReceive`), sender calls `send(...)`. That is wallet-to-wallet in practice. **On-chain BTC** used to fund wallets is handled outside this flow (faucet in test; your custody rails in prod). Higher-level BTC bridge flows use the dedicated on-chain helpers in the main SDK docs when applicable. |
| **4. Same for USDT** | Treat **USDT-like** balances as an **RGB NIA** (`issueAssetNia` with `precision: 6`, or use a shared `assetId`). Then reuse the same receive / send flow as step 3. |

## Recommended model: one `UTEXOWallet` per end user

- **Provisioning:** `generateKeys(network)` → persist the **mnemonic** (or seed) keyed by your internal `userId` in secure storage (**never** in logs).
- **Isolation:** Pass a **`dataDir` per user** (e.g. `./wallet-data/{{userId}}`) so chain and RGB state do not collide on disk.
- **Lifecycle:** Construct `UTEXOWallet`, call `await wallet.initialize()`, then run sync/send/receive APIs, and `dispose()` when tearing down process-local instances.

### Stable deposit address: `reuseAddresses` vs `dataDir`

- **`dataDir`** — folder where that user’s wallet state lives. Keep **one persistent path per user** and always pass that same **`dataDir`** when reopening the wallet (login, cron, etc.).

- **`reuseAddresses`** — optional flag on **`UTEXOWallet` options (`{ ..., reuseAddresses: true }`)**:

  - **`true`** — **`getAddress()`** **keeps giving you the same receive address**, so screens can show “pay here” without you storing one copy in CRM first.
  - **Omit or `false` (usual default)** — **`getAddress()`** **usually hands back a new address each call**—better everyday privacy.

- **Scope:** **`UTEXOWallet`** covers both **plain Bitcoin** receives and **UTXO / RGB** receives. **`reuseAddresses` only changes how the UTEXO / RGB-route address is chosen** for **`getAddress()`**; the complementary **main Bitcoin-route** receive addresses are **not** governed by this toggle and keep normal rotation.

- With **`reuseAddresses: true`**, call **`rotateVanillaAddress()`** or **`rotateColoredAddress()`** when you purposely need the **next** receive address.

Optional: keep **`getAddress()`** in your logs/DB for reconciliation if your policy requires it.

See also [Address behavior](./getting-started#address-behavior) and `examples/rotate-address.mjs`.

## “Private key per address” vs HD mnemonic

Custody designs often phrase this as **one secret per address**. In RGB + this SDK:

- You normally custody **one mnemonic per user**; every address belongs to that **single HD wallet**.
- `getXprivFromMnemonic(network, mnemonic)` exposes **account-level** extended private material (still one secret hierarchy, not literally one WIF per address).
- **Signing** is typically **`signPsbt` / built-in sends** driven by that mnemonic-backed wallet—not manual per-key injection.

Use this explanation when aligning security reviews with UX (one mnemonic per user maps cleanly to “one wallet per customer”).

## Flow 1 — Generate keys for every user, derive account secrets, create `UTEXOWallet`

End-to-end **per-user onboarding** pattern: one identity ⇒ one mnemonic ⇒ one **`UTEXOWallet`** with isolated **`dataDir`**.

### Steps

1. **New user:** call **`generateKeys(networkPreset)`** with your product network (`'testnet'` or `'mainnet'` for `UTEXOWallet` presets). You get **`GeneratedKeys`**: mnemonic, **`xpriv`**, vanilla/colored **`accountXpub*`**, **`masterFingerprint`**, etc.
2. **Persist:** Store **mnemonic** (recommended) or **seed** encrypted in KMS/Vault keyed by **`userId`**. Treat **`GeneratedKeys.xpriv`** and **`getXprivFromMnemonic`** output like the mnemonic—they recover the same HD tree.
3. **Returning user:** Load mnemonic from KMS and optionally call **`deriveKeysFromMnemonic(network, mnemonic)`** to rehydrate the same publication material (or reconstruct keys only inside a short-lived process).
4. **Account `xpriv` (HSM / audit):** If policy needs explicit extended private key strings, **`await getXprivFromMnemonic(bitcoinNetwork, mnemonic)`** (use the same **`network`**/`BitcoinNetwork` you use elsewhere for that user, e.g. `'testnet'`). For UTEXO you often still keep **full mnemonic** nearby for **`signPsbt`** / **`send`** unless you offload signing.
5. **`UTEXOWallet`:** Use the **same constructor options** every time you open the same logical user—**first signup, login, restore from backup/VSS, workers**—especially **`dataDir`** and **`reuseAddresses`**. If you onboard with **`reuseAddresses: true`** but reopen **without** it, **`getAddress()`** switches back to rotating addresses and UX can diverge from what you stored.

```ts
import {
  UTEXOWallet,
  generateKeys,
  deriveKeysFromMnemonic,
  getXprivFromMnemonic,
} from '@utexo/rgb-sdk';

const networkPreset = 'testnet'; // UTEXOWallet: 'mainnet' | 'testnet'

/** Keep identical for onboard, reopen, and restore so address + DB behavior match. */
function utexoWalletOptions(userId: string) {
  return {
    network: networkPreset,
    dataDir: `./wallet-data/${userId}`,
    reuseAddresses: true, // omit here if you omitted on first run; do not mix per user
  };
}

// ── New signup (runs once per customer) ──
async function onboardNewUser(userId: string) {
  const keys = await generateKeys(networkPreset); // mnemonic + xpub pair + fingerprint, etc.

  // TODO: kms.put(`user:${userId}:mnemonic`, encrypt(keys.mnemonic))
  // Optional cold record (same sensitivity as mnemonic):
  // const xprivForRecords = await getXprivFromMnemonic('testnet', keys.mnemonic);

  const wallet = new UTEXOWallet(keys.mnemonic, utexoWalletOptions(userId));
  await wallet.initialize();

  const depositAddress = await wallet.getAddress();
  const pubs = wallet.getXpub(); // vanilla + colored account xpubs at runtime

  // TODO: save user row: encrypted mnemonic ref, pubs.xpubVan + pubs.xpubCol optional for display/backend

  await wallet.dispose();
  return { userId };
}

// ── Login / job worker (loads existing customer) ──
async function openWalletForUser(userId: string, mnemonicFromKms: string) {
  // Optional sanity check against stored xpub fingerprint:
  // const derived = await deriveKeysFromMnemonic('testnet', mnemonicFromKms);

  const wallet = new UTEXOWallet(mnemonicFromKms, utexoWalletOptions(userId));
  await wallet.initialize();
  return wallet;
}
```

### Signing and “private key per address”

- rgb-lib **`Wallet`** is fed **account-level xpubs + `masterFingerprint`** (see **`SinglesigKeys`** in the binding)—not raw per-address keys.
- This SDK **`UTEXOWallet`** keeps **mnemonic** (or seed) for **`signPsbt`**, **`send`**, **`createUtxos`**, etc. **Exporting arbitrary child private keys / WIF** is outside the everyday API; derive at **account**/mnemonic level with **`getXprivFromMnemonic`** or use **`signPsbt`** flows for transactions.

See also **`examples/new-wallet.mjs`**, **`Readme.md`** (key generation table), and [Mnemonic to private key](./getting-started#mnemonic-to-private-key).

## Flow 2 — Fetch balances

```ts
import { UTEXOWallet } from '@utexo/rgb-sdk';

await wallet.initialize();
await wallet.syncWallet(); // chain / UTXO / spendable BTC

const btc = await wallet.getBtcBalance();
console.log('BTC:', btc); // vanilla + colored breakdown

const assets = await wallet.listAssets();
// Assets are grouped by schema; NIA tokens (typical stablecoin-like assets) appear under assets.nia
for (const a of assets.nia ?? []) {
  console.log(a.assetId, a.ticker, a.balance);
}

// Use the wallet’s known `assetId` (from issuance or ops config)
await wallet.refreshWallet(); // refreshes RGB consignment state
const assetId = 'rgb:...'; // or from `issueAssetNia` / your DB
console.log(await wallet.listTransfers(assetId));
```

Use **`syncWallet`** after funding / `createUtxos`, and **`refreshWallet`** after `send` / receive operations so RGB state catches up.

## Flow 4 — USDT-like asset: prepare UTXOs, issue or join existing `assetId`

**Issuer / first holder (test)**

```ts
const created = await wallet.createUtxos({ num: 5, size: 1000 });
await wallet.syncWallet();

const issued = await wallet.issueAssetNia({
  ticker: 'USDT',
  name: 'Tether USD (Test)',
  amounts: [1_000_000],
  precision: 6,
});

const assetId = issued.assetId;
```

If your product uses a **shared** stablecoin `assetId` from operations, skip issuance and distribute that **`assetId`** to all services that quote “USDT”.

## Flow 3 — Move RGB balance between two users (two wallets)

**Blinded receive** — use when the receiver wallet already has suitable **RGB / spendable UTXOs** for the receive path (see [Getting Started](./getting-started#invoice-types-blinded-vs-witness)).

```ts
const receive = await receiver.blindReceive({
  assetId,
  amount: 5_000, // base units (respect precision)
  minConfirmations: 1,
  durationSeconds: 3600,
});

await sender.send({
  invoice: receive.invoice,
  assetId,
  amount: 5_000,
});

await sender.refreshWallet();
await receiver.refreshWallet();

console.log('Sender:', await sender.getAssetBalance(assetId));
console.log('Receiver:', await receiver.getAssetBalance(assetId));
```

**Witness receive** — often better for a **new receiver** who has **not** called `createUtxos` yet (sender must pass **`witnessData`**):

```ts
const witness = await receiver.witnessReceive({
  assetId,
  amount: 2_000,
  minConfirmations: 1,
  durationSeconds: 3600,
});

await sender.send({
  invoice: witness.invoice,
  assetId,
  amount: 2_000,
  witnessData: { amountSat: 1000 },
});

await sender.refreshWallet();
await receiver.refreshWallet();
```

## Minimal full sketch — two users, issuance, witness transfer

Expand with faucet funding / fee checks as in [Getting Started](./getting-started).

`blindReceive` typically expects the receiver to already have suitable **RGB / spendable UTXO structure**; a fresh user **B** often has none. Use **`witnessReceive`** here so **B** can obtain an invoice without having created UTXOs first. The sender must pass **`witnessData`** (e.g. **`amountSat`**) on **`send`**.

```ts
import { UTEXOWallet, generateKeys } from '@utexo/rgb-sdk';

const network = 'testnet';

// --- User A (issuer / sender) ---
const keysA = await generateKeys(network);
const userA = new UTEXOWallet(keysA.mnemonic, {
  network,
  dataDir: './data/user-a',
  reuseAddresses: true, // same `getAddress()` for UTEXO wallet until you rotate
});
await userA.initialize();

const depositAddressA = await userA.getAddress(); // stable across calls (utexo side); fund this in test

await userA.syncWallet();
// Fund depositAddressA with test BTC, then:
await userA.createUtxos({ num: 5, size: 1000 });
await userA.syncWallet();

const issued = await userA.issueAssetNia({
  ticker: 'USDT',
  name: 'Tether USD (Test)',
  amounts: [1_000_000],
  precision: 6,
});
const assetId = issued.assetId;

// --- User B (receiver) ---
const keysB = await generateKeys(network);
const userB = new UTEXOWallet(keysB.mnemonic, {
  network,
  dataDir: './data/user-b',
  reuseAddresses: true,
});
await userB.initialize();
const depositAddressB = await userB.getAddress();
await userB.syncWallet();
// Fund B with test BTC if your environment requires sats on the receiver for witness receive

const recv = await userB.witnessReceive({
  assetId,
  amount: 10_000,
  minConfirmations: 1,
  durationSeconds: 3600,
});

await userA.send({
  invoice: recv.invoice,
  assetId,
  amount: 10_000,
  witnessData: { amountSat: 1000 },
});

await userA.refreshWallet();
await userB.refreshWallet();

await userA.dispose();
await userB.dispose();
```

## Operations checklist (production-minded)

1. After **UTXO creation, issuance, or send**, run **backups** (`createBackup` / `vssBackup`) as in [Getting Started](./getting-started#backups-recommended-for-every-state-change).
2. Do **not** run multiple live wallet instances against the same mnemonic + VSS without coordination (see backup section in the main README).
3. Keep **`assetId`**, **mnemonic**, and **`xpriv`** out of logs and support tickets.

## See also

- [Getting Started](./getting-started) — full parameter detail, faucet, `syncWallet` vs `refreshWallet`
- [Full runnable example file](./getting-started-full-example)
- [Usage](./usage) and [RGB lib alignment](./rgb-lib-alignment)
