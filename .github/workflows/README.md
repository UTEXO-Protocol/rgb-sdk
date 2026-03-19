# Workflows

## publish.yml — Publish to npm

Builds and publishes `@utexo/rgb-sdk` to npm.

- **Trigger**: manual
- **What it does**: builds the package with `tsup` and runs `npm publish --access public`

## regtest-e2e.yml — Regtest E2E Tests

Runs the full offline-receiver test suite (18 tests) against a local regtest environment.

- **Trigger**: manual (`workflow_dispatch`)
- **What it does**:
  1. Clones `dcorral/test-rgb-proxy-playground` (Docker stack: bitcoind + electrs + rgb-proxy)
  2. Starts the stack on `localhost` (proxy :3000, electrs :50001)
  3. Runs `npm run test:regtest` — Jest tests from `tests/regtest/`
  4. On failure, uploads `artifacts/` (JSON smoke reports) for debugging
  5. Tears down the Docker stack
- **No secrets needed** — all credentials are hardcoded defaults from the playground
- **Test coverage**: blind/witness receive, relay-only mode, ACK guards, parallel sends, proxy restarts, expiry, donation paths
