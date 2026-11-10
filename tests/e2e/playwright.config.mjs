import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.RGB_E2E_PORT ?? 5180);

/**
 * E2E for the RgbLibWeb adapter against the local regtest stand (README.md).
 * One worker: the specs share one regtest chain.
 */
export default defineConfig({
  testDir: here,
  testMatch: '**/*.e2e.mjs',
  globalSetup: path.join(here, 'global-setup.mjs'),
  timeout: 240_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    trace: 'retain-on-failure',
  },
  outputDir: path.join(here, '.results'),
  webServer: {
    command: 'node tests/e2e/serve.mjs',
    cwd: path.resolve(here, '../..'),
    url: `http://127.0.0.1:${port}/`,
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
