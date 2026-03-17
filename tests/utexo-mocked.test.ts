/**
 * Restore flow tests with mocked restoreWallet.
 * Uses jest.unstable_mockModule for ESM compatibility.
 */
import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import os from 'os';

await jest.unstable_mockModule('../src/binding/NodeRgbLibBinding', () => ({
  restoreWallet: () => undefined,
  restoreFromVss: () => {},
  generateKeys: () => {},
  NodeRgbLibBinding: () => {},
}));

const {
  restoreUtxoWalletFromBackup,
  LAYER1_BACKUP_SUFFIX,
  UTEXO_BACKUP_SUFFIX,
} = await import('../src/utexo/restore');

describe('restoreUtxoWalletFromBackup with mocked restoreWallet', () => {
  let backupDir: string;
  let targetDir: string;
  const fp = 'a66bffef';
  const password = 'test-password';

  beforeEach(() => {
    backupDir = path.join(os.tmpdir(), `restore-mock-${Date.now()}`);
    targetDir = path.join(os.tmpdir(), `restore-target-${Date.now()}`);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.join(backupDir, `wallet_${fp}${LAYER1_BACKUP_SUFFIX}`),
      'mock-layer1'
    );
    fs.writeFileSync(
      path.join(backupDir, `wallet_${fp}${UTEXO_BACKUP_SUFFIX}`),
      'mock-utexo'
    );
  });

  afterEach(() => {
    fs.rmSync(backupDir, { recursive: true, force: true });
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  it('should return layer1Path, utexoPath, targetDir when backup structure is valid', () => {
    const result = restoreUtxoWalletFromBackup({
      backupPath: backupDir,
      password,
      targetDir,
    });

    expect(result).toHaveProperty('layer1Path');
    expect(result).toHaveProperty('utexoPath');
    expect(result).toHaveProperty('targetDir');
    expect(result.targetDir).toBe(targetDir);
    expect(result.layer1Path).toContain(fp);
    expect(result.utexoPath).toContain(fp);
    expect(fs.existsSync(result.layer1Path)).toBe(true);
    expect(fs.existsSync(result.utexoPath)).toBe(true);
  });

  it('should create target dirs with network structure for testnet preset', () => {
    const result = restoreUtxoWalletFromBackup({
      backupPath: backupDir,
      password,
      targetDir,
      networkPreset: 'testnet',
    });

    // testnet preset: layer1=testnet, utexo=signet
    expect(result.layer1Path).toContain(fp);
    expect(result.utexoPath).toContain(fp);
    expect(result.layer1Path).not.toBe(result.utexoPath);
  });
});
