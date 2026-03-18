# Signet Tests

This directory contains the manual Signet integration tests for offline receiver flows.

## Current working configuration

- Wallets:
  - `stage2-sender`
  - `stage2-receiver`
- Reusable asset:
  - `rgb:VnwMJ~Yh-i9zzuQz-PsocvCb-1j83mQ1-Uv4Zb6w-Ud8dsqk`
- Proxy HTTP endpoint:
  - `https://rgb-proxy-utexo.utexo.com/json-rpc`

Do not use the older wallets (`sender` / `receiver`, `stage-sender` / `stage-receiver`) for this smoke.

## Local wallet files (not committed)

`cli/data/stage2-sender.json` and `cli/data/stage2-receiver.json` must stay local-only (they contain secrets and are ignored by git).

Use the example templates in repo:

```bash
cd /path/to/rgb-sdk
cp cli/data/stage2-sender.example.json cli/data/stage2-sender.json
cp cli/data/stage2-receiver.example.json cli/data/stage2-receiver.json
```

Then replace placeholder values with your real wallet data (or regenerate files with `node cli/generate_keys.mjs <wallet_name> signet`).

## Run

```bash
cd /path/to/rgb-sdk
SIGNET_PROXY_HTTP_URL="https://rgb-proxy-utexo.utexo.com/json-rpc" \
MNEMONIC_A="$(node -p "require('./cli/data/stage2-sender.json').mnemonic")" \
MNEMONIC_B="$(node -p "require('./cli/data/stage2-receiver.json').mnemonic")" \
ASSET_ID="rgb:VnwMJ~Yh-i9zzuQz-PsocvCb-1j83mQ1-Uv4Zb6w-Ud8dsqk" \
npm run test:signet
```

Run individual tests:

```bash
cd /path/to/rgb-sdk
SIGNET_PROXY_HTTP_URL="https://rgb-proxy-utexo.utexo.com/json-rpc" \
MNEMONIC_A="$(node -p "require('./cli/data/stage2-sender.json').mnemonic")" \
MNEMONIC_B="$(node -p "require('./cli/data/stage2-receiver.json').mnemonic")" \
ASSET_ID="rgb:VnwMJ~Yh-i9zzuQz-PsocvCb-1j83mQ1-Uv4Zb6w-Ud8dsqk" \
npm run test:signet:smoke

cd /path/to/rgb-sdk
SIGNET_PROXY_HTTP_URL="https://rgb-proxy-utexo.utexo.com/json-rpc" \
MNEMONIC_A="$(node -p "require('./cli/data/stage2-sender.json').mnemonic")" \
MNEMONIC_B="$(node -p "require('./cli/data/stage2-receiver.json').mnemonic")" \
ASSET_ID="rgb:VnwMJ~Yh-i9zzuQz-PsocvCb-1j83mQ1-Uv4Zb6w-Ud8dsqk" \
npm run test:signet:witness

cd /path/to/rgb-sdk
SIGNET_PROXY_HTTP_URL="https://rgb-proxy-utexo.utexo.com/json-rpc" \
MNEMONIC_A="$(node -p "require('./cli/data/stage2-sender.json').mnemonic")" \
MNEMONIC_B="$(node -p "require('./cli/data/stage2-receiver.json').mnemonic")" \
ASSET_ID="rgb:VnwMJ~Yh-i9zzuQz-PsocvCb-1j83mQ1-Uv4Zb6w-Ud8dsqk" \
npm run test:signet:convergence

cd /path/to/rgb-sdk
SIGNET_PROXY_HTTP_URL="https://rgb-proxy-utexo.utexo.com/json-rpc" \
MNEMONIC_A="$(node -p "require('./cli/data/stage2-sender.json').mnemonic")" \
MNEMONIC_B="$(node -p "require('./cli/data/stage2-receiver.json').mnemonic")" \
ASSET_ID="rgb:VnwMJ~Yh-i9zzuQz-PsocvCb-1j83mQ1-Uv4Zb6w-Ud8dsqk" \
npm run test:signet:sequential
```

## Before running sequential test

Ensure `stage2-receiver` has enough allocation slots for multiple receives in one run:

```bash
cd /path/to/rgb-sdk
node cli/run.mjs createutxos stage2-receiver --num 10 --size 2000 --feeRate 2
node cli/run.mjs refresh stage2-receiver
```

Minimum recommendation: 2 free receiver slots (one per sequential iteration).


## Operational note

If a Signet test fails with `InsufficientAllocationSlots`, create additional UTXOs and refresh the affected wallet. In practice the most common maintenance step is `stage2-receiver`:

```bash
cd /path/to/rgb-sdk
node cli/run.mjs createutxos stage2-receiver --num 5 --size 2000 --feeRate 2
node cli/run.mjs refresh stage2-receiver
```

If the convergence test still fails after that, top up both wallets:

```bash
cd /path/to/rgb-sdk
node cli/run.mjs createutxos stage2-sender --num 10 --size 2000 --feeRate 2
node cli/run.mjs refresh stage2-sender

node cli/run.mjs createutxos stage2-receiver --num 10 --size 2000 --feeRate 2
node cli/run.mjs refresh stage2-receiver
```
