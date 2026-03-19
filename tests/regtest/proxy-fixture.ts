import { execFileSync } from 'node:child_process';

import { pollCondition, proxyRpc } from '../shared/helpers';

const RELAY_ONLY_CONTAINER_NAME = 'proxy-no-indexer';
const PROXY_SERVICE_NAME = 'proxy';

function dockerCompose(composeFile: string, args: string[]): string {
  return execFileSync('docker', ['compose', '-f', composeFile, ...args], {
    encoding: 'utf8',
  }).trim();
}

function dockerRmForce(containerName: string): void {
  try {
    execFileSync('docker', ['rm', '-f', containerName], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch {}
}

export async function waitForProxyReady(
  proxyHttpUrl: string,
  timeoutMs = 15_000,
  intervalMs = 500,
): Promise<void> {
  await pollCondition(
    async () => {
      try {
        return await proxyRpc<{ protocol_version: string; version: string }>(
          proxyHttpUrl,
          'server.info',
        );
      } catch {
        return null;
      }
    },
    (info) => Boolean(info?.version),
    timeoutMs,
    intervalMs,
    'Proxy did not become ready in time',
  );
}

export async function switchToRelayOnlyProxy(
  composeFile: string,
  proxyHttpUrl: string,
): Promise<void> {
  dockerCompose(composeFile, ['stop', PROXY_SERVICE_NAME]);
  dockerRmForce(RELAY_ONLY_CONTAINER_NAME);
  dockerCompose(composeFile, [
    'run',
    '-d',
    '--name',
    RELAY_ONLY_CONTAINER_NAME,
    '-e',
    'INDEXER_URL=',
    '-e',
    'BITCOIN_NETWORK=regtest',
    '-p',
    '3000:3000',
    PROXY_SERVICE_NAME,
  ]);
  await waitForProxyReady(proxyHttpUrl);
}

export async function restoreStandardProxy(
  composeFile: string,
  proxyHttpUrl: string,
): Promise<void> {
  dockerRmForce(RELAY_ONLY_CONTAINER_NAME);
  dockerCompose(composeFile, ['up', '-d', PROXY_SERVICE_NAME]);
  await waitForProxyReady(proxyHttpUrl);
}
