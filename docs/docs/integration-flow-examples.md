# Integration flow examples (customer-style requirements)

This page maps a typical **custody / fintech** request list to concrete flows with `UTEXOWallet`. Use it when you need a **story** for product or compliance: one user → one wallet, balances, moves between users, and a **USDT-like** RGB token.

For environment setup (testnet, faucet, parameters), start with [Getting Started](./getting-started).

## Requirement checklist → SDK approach

| Customer ask | How the SDK supports it |
|--------------|-------------------------|
| **1. Generate an address per user; need “private key” control** | One **BIP39 mnemonic per user** (and optional **account `xpriv`**) is the primary secret. All deposit addresses are derived from that HD tree. Call `getAddress()` when provisioning the user and **store that string** if you need a stable deposit address (see below). |
| **2. Fetch balances** | `syncWallet()` / `refreshWallet()`, then `getBtcBalance()` for BTC (vanilla vs colored), and `listAssets()` / `getAssetBalance(assetId)` for RGB. |
| **3. Transfer balance between addresses or wallets** | **RGB assets:** receiver builds an invoice (`blindReceive` / `witnessReceive`), sender calls `send(...)`. That is wallet-to-wallet in practice. **On-chain BTC** used to fund wallets is handled outside this flow (faucet in test; your custody rails in prod). Higher-level BTC bridge flows use the dedicated on-chain helpers in the main SDK docs when applicable. |
| **4. Same for USDT** | Treat **USDT-like** balances as an **RGB NIA** (`issueAssetNia` with `precision: 6`, or use a shared `assetId`). Then reuse the same receive / send flow as step 3. |

## Recommended model: one `UTEXOWallet` per end user

- **Provisioning:** `generateKeys(network)` → persist the **mnemonic** (or seed) keyed by your internal `userId` in secure storage (**never** in logs).
- **Isolation:** Pass a **`dataDir` per user** (e.g. `./wallet-data/{{userId}}`) so chain and RGB state do not collide on disk.
- **Lifecycle:** Construct `UTEXOWallet`, call `await wallet.initialize()`, then run sync/send/receive APIs, and `dispose()` when tearing down process-local instances.

### Reusable deposit address vs `new UTEXOWallet(..., { dataDir })`

Customers often assume **`dataDir` implies a reusable address**. It does **not**:

- **`dataDir`** only pins **wallet database paths** (`utexo` + `layer1` substores). Same user should keep the **same `dataDir`** whenever you reopen their wallet files.
- **`UTEXOWallet` options** exposed in `@utexo/rgb-sdk-core` (`ConfigOptions`) are **`network`**, **`dataDir`**, and **`vssServerUrl`**. There is **no** constructor flag such as **`reuseAddress`** in current published types—a reusable *display address* is an **application** concern.

Under the hood, **each call to `getAddress()` tends to derive a fresh receive address** ([Address behavior](./getting-started#address-behavior)).

**What to do instead:** when you onboard a user, call **`getAddress()` once**, store that string (**e.g. `users.deposit_btc_address`**) with your KMS-backed user row, and show **only the stored string** until the user expressly requests a rotation (then derive again and overwrite). On subsequent server restarts **do not call `getAddress()`** again just to paint the dashboard—load from DB. Fund that same persisted address forever until you deliberately rotate.

If a future `@utexo/rgb-sdk` release adds an explicit **`reuseAddress` (or similar)** option to `ConfigOptions`, follow the typings for that release; until then this persistence pattern is the supported way to get “one address per customer” UX.

## “Private key per address” vs HD mnemonic

Custody designs often phrase this as **one secret per address**. In RGB + this SDK:

- You normally custody **one mnemonic per user**; every address belongs to that **single HD wallet**.
- `getXprivFromMnemonic(network, mnemonic)` exposes **account-level** extended private material (still one secret hierarchy, not literally one WIF per address).
- **Signing** is typically **`signPsbt` / built-in sends** driven by that mnemonic-backed wallet—not manual per-key injection.

Use this explanation when aligning security reviews with UX (one mnemonic per user maps cleanly to “one wallet per customer”).

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

**Blinded receive (common default)**

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

**Witness receive** (sender must pass `witnessData`, e.g. `amountSat`):

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

## Minimal full sketch — two users, issuance, blind transfer

Expand with faucet funding / fee checks as in [Getting Started](./getting-started).

The helpers `loadStoredDepositAddress` / `saveStoredDepositAddress` are placeholders for your database (they are not exported by the SDK).

```ts
import { UTEXOWallet, generateKeys } from '@utexo/rgb-sdk';

const network = 'testnet';

// --- User A (issuer / sender) ---
const keysA = await generateKeys(network);
const userA = new UTEXOWallet(keysA.mnemonic, {
  network,
  dataDir: './data/user-a',
});
await userA.initialize();

// Reusable BTC deposit URL: persist this yourself (no `reuseAddress` on wallet options).
// First session: derive once → save `depositAddressA` to your DB keyed by user.
// Later sessions: read from DB; avoid calling `getAddress()` repeatedly if UI must stay fixed.
let depositAddressA = await loadStoredDepositAddress('user-a');
if (!depositAddressA) {
  depositAddressA = await userA.getAddress();
  await saveStoredDepositAddress('user-a', depositAddressA);
}

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
});
await userB.initialize();
let depositAddressB = await loadStoredDepositAddress('user-b');
if (!depositAddressB) {
  depositAddressB = await userB.getAddress();
  await saveStoredDepositAddress('user-b', depositAddressB);
}
await userB.syncWallet();
// Fund B with test BTC if they must hold spendable sats for receive paths

const recv = await userB.blindReceive({
  assetId,
  amount: 10_000,
  minConfirmations: 1,
  durationSeconds: 3600,
});

await userA.send({
  invoice: recv.invoice,
  assetId,
  amount: 10_000,
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
