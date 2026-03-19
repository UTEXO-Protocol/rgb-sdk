# Regtest Tests

This directory contains the regtest end-to-end tests for offline receiver flows and proxy behavior.

## Current baseline

The current regtest baseline covers:

- `offline-receiver.test.ts`
  - blind offline receiver happy-path
  - `ack=true`
  - `validated=true`
  - current transfer reaches `Settled`
  - receiver balance increases
  - repeated `refreshWallet()` is idempotent

- `restart-mid-flow.test.ts`
  - receiver is disposed/recreated in the same `dataDir` during an active transfer
  - persisted state still converges to `Settled` after restart

- `parallel-sends-same-receiver.test.ts`
  - two blind invoices are sent concurrently to one receiver wallet
  - test tolerates mempool replacement race on concurrent broadcast and verifies recovery path
  - final receiver settled delta still includes both amounts

- `restart-after-ack-before-settled.test.ts`
  - transfer is ACKed first, receiver observes pre-settled status, then restarts
  - post-restart refresh still converges that same transfer to `Settled`

- `witness-receiver.test.ts`
  - witness offline receiver happy-path
  - `ack=true`
  - `validated=true`
  - current transfer reaches `Settled`
  - receiver balance increases
  - repeated `refreshWallet()` is idempotent
  - negative path: witness invoice + `send()` without `witnessData` must fail and not credit receiver

- `invalid-consignment.test.ts`
  - malformed consignment triggers validation path
  - current playground behavior is either:
    - `ack=false` with `validated=false`
    - or relay-only fallback with `ack=null`
  - manual ACK is preserved against late validation

- `ack-guard.test.ts`
  - auto-ACK cannot be changed afterward
  - `ack.post(false)` returns JSON-RPC error `-100`

- `relay-only-mode.test.ts`
  - proxy restarted without `INDEXER_URL`
  - `ack` starts as `null`
  - `validated` stays unset
  - manual ACK works on a real blind transfer
  - second scenario runs on a dedicated pre-issued asset for deterministic timing
  - receiver refresh imports the transfer in relay-only mode
  - a late manual ACK becomes a no-op while the transfer still converges to `Settled`

- `upload-guard.test.ts`
  - tests intentionally share one receiver wallet state in a single run
  - duplicate upload of the same consignment returns `false`
  - changed file for the same `recipientId` fails with JSON-RPC error `-101`

- `pre-confirmation-gating.test.ts`
  - proxy may already ACK/validate before mining
  - receiver still does not settle before confirmation
  - after mining, receiver converges to `Settled`

- `relay-only-witness-mode.test.ts`
  - relay-only witness receive path
  - receiver refresh imports witness transfer
  - late manual ACK becomes a no-op

- `real-consignment-roundtrip.test.ts`
  - `consignment.get` returns a real base64 payload for a valid transfer
  - returned payload is non-empty and matches the transfer `txid`
  - duplicate re-upload of the same real consignment returns `false`
  - duplicate upload does not reset `validated` and keeps the same `txid`

- `expired-invoice.test.ts`
  - send after invoice expiry must not become a normal `Settled` transfer
  - allows either sender-side rejection or non-settling proxy/receiver behavior

- `expiry-race-near-boundary.test.ts`
  - sends near `expiry` boundary (`~1s` before timeout)
  - validates coherent outcome: sender-side reject or terminal transfer semantics without partial credit

- `donation-false.test.ts`
  - covers the `donation: false` send path
  - tx does not reach the network before the receiver-side ACK path runs
  - receiver refresh imports and ACKs the transfer
  - sender refresh then makes the tx visible and the transfer settles

- `witness-donation-false.test.ts`
  - same deferred-broadcast contract as `donation-false`, but for witness receive/send path
  - includes `witnessData` and validates tx appears on-chain only after receiver ACK path + sender refresh

- `sequential-receives-same-wallet.test.ts`
  - executes multiple blind receives sequentially on one long-lived wallet state
  - validates no state drift/slot leakage across cycles and stable post-refresh settled balance

- `proxy-down-during-send.test.ts`
  - proxy is unavailable during `send()`
  - sender gets a clear network- or transport-style error
  - after recovery the receiver stays non-settled and does not receive phantom balance

## Prerequisites

The tests assume the regtest playground stack is already running.

Current playground source:

- `/path/to/test-rgb-proxy-playground`

Start it with:

```bash
cd /path/to/test-rgb-proxy-playground
./regtest.sh start
```

## Env vars

Required for normal regtest runs:

- `REGTEST_PROXY_HTTP_URL`
- `REGTEST_PROXY_RPC_URL`
- `REGTEST_BITCOIND_USER`
- `REGTEST_BITCOIND_PASS`
- `REGTEST_INDEXER_URL`
- `REGTEST_DATA_DIR`

For bitcoind access, use one of:

- `REGTEST_BITCOIND_URL`
- `REGTEST_BITCOIND_CONTAINER`

Current working local setup uses:

- `REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc"`
- `REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc"`
- `REGTEST_BITCOIND_CONTAINER="bitcoind"`
- `REGTEST_BITCOIND_USER="user"`
- `REGTEST_BITCOIND_PASS="password"`
- `REGTEST_INDEXER_URL="tcp://localhost:50001"`
- `REGTEST_DATA_DIR="/tmp/rgb-e2e"`

Required env for relay-only and proxy-down tests:

- `REGTEST_PLAYGROUND_COMPOSE_FILE="/path/to/test-rgb-proxy-playground/docker-compose.yaml"`

## Run

Run the whole regtest suite:

```bash
cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest
```

Run individual tests:

```bash
cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:smoke

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:witness

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:nack

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:ack-guard

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:upload-guard

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:restart-mid

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:parallel-sends

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:restart-after-ack

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:expiry-race

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:witness-donation-false

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
npm run test:regtest:sequential-receives

cd /path/to/rgb-sdk
REGTEST_PROXY_HTTP_URL="http://localhost:3000/json-rpc" \
REGTEST_PROXY_RPC_URL="rpc://localhost:3000/json-rpc" \
REGTEST_BITCOIND_CONTAINER="bitcoind" \
REGTEST_BITCOIND_USER="user" \
REGTEST_BITCOIND_PASS="password" \
REGTEST_INDEXER_URL="tcp://localhost:50001" \
REGTEST_DATA_DIR="/tmp/rgb-e2e" \
REGTEST_PLAYGROUND_COMPOSE_FILE="/path/to/test-rgb-proxy-playground/docker-compose.yaml" \
npm run test:regtest:relay-only
```
