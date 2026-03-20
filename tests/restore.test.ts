/**
 * Restore utility tests.
 * Tests restoreUtxoWalletFromBackup validation and pure helpers.
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  restoreUtxoWalletFromBackup,
  getBackupStoreId,
  prepareUtxoBackupDirs,
  LAYER1_BACKUP_SUFFIX,
  UTEXO_BACKUP_SUFFIX,
} from '../src/utexo/restore';
import { ValidationError } from '@utexo/rgb-sdk-core';

describe('restore utilities', () => {
  describe('getBackupStoreId', () => {
    it('should return wallet_<fp> format', () => {
      expect(getBackupStoreId('a66bffef')).toBe('wallet_a66bffef');
      expect(getBackupStoreId('dd80d908')).toBe('wallet_dd80d908');
    });
  });

  describe('prepareUtxoBackupDirs', () => {
    it('should create dirs and return correct paths', () => {
      const tmpDir = path.join(os.tmpdir(), `restore-test-${Date.now()}`);
      const fp = 'a66bffef';

      const result = prepareUtxoBackupDirs(tmpDir, fp);

      expect(result.storeId).toBe('wallet_a66bffef');
      expect(result.layer1TmpDir).toContain('.layer1');
      expect(result.utexoTmpDir).toContain('.utexo');
      expect(result.layer1FinalPath).toContain('wallet_a66bffef_layer1.backup');
      expect(result.utexoFinalPath).toContain('wallet_a66bffef_utexo.backup');
      expect(fs.existsSync(result.layer1TmpDir)).toBe(true);
      expect(fs.existsSync(result.utexoTmpDir)).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should create backupPath if it does not exist', () => {
      const tmpDir = path.join(os.tmpdir(), `restore-test-new-${Date.now()}`);
      const fp = '12345678';

      prepareUtxoBackupDirs(tmpDir, fp);

      expect(fs.existsSync(tmpDir)).toBe(true);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe('restoreUtxoWalletFromBackup validation', () => {
    let emptyBackupDir: string;

    beforeEach(() => {
      emptyBackupDir = path.join(
        os.tmpdir(),
        `restore-validation-${Date.now()}`
      );
      fs.mkdirSync(emptyBackupDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(emptyBackupDir, { recursive: true, force: true });
    });

    it('should throw when backupPath is missing', () => {
      expect(() =>
        restoreUtxoWalletFromBackup({
          backupPath: '',
          password: 'pass',
          targetDir: '/tmp/out',
        })
      ).toThrow(ValidationError);
      expect(() =>
        restoreUtxoWalletFromBackup({
          backupPath: '',
          password: 'pass',
          targetDir: '/tmp/out',
        })
      ).toThrow('backupPath, password, and targetDir are required');
    });

    it('should throw when password is missing', () => {
      expect(() =>
        restoreUtxoWalletFromBackup({
          backupPath: emptyBackupDir,
          password: '',
          targetDir: '/tmp/out',
        })
      ).toThrow(ValidationError);
    });

    it('should throw when targetDir is missing', () => {
      expect(() =>
        restoreUtxoWalletFromBackup({
          backupPath: emptyBackupDir,
          password: 'pass',
          targetDir: '',
        })
      ).toThrow(ValidationError);
    });

    it('should throw when backupPath does not exist', () => {
      expect(() =>
        restoreUtxoWalletFromBackup({
          backupPath: '/nonexistent/path/12345',
          password: 'pass',
          targetDir: '/tmp/out',
        })
      ).toThrow(ValidationError);
      expect(() =>
        restoreUtxoWalletFromBackup({
          backupPath: '/nonexistent/path/12345',
          password: 'pass',
          targetDir: '/tmp/out',
        })
      ).toThrow('backupPath must be an existing directory');
    });

    it('should throw when backupPath has no layer1/utexo files', () => {
      expect(() =>
        restoreUtxoWalletFromBackup({
          backupPath: emptyBackupDir,
          password: 'pass',
          targetDir: path.join(os.tmpdir(), 'restore-out'),
        })
      ).toThrow(ValidationError);
      expect(() =>
        restoreUtxoWalletFromBackup({
          backupPath: emptyBackupDir,
          password: 'pass',
          targetDir: path.join(os.tmpdir(), 'restore-out'),
        })
      ).toThrow('wallet_<fp>_layer1.backup and wallet_<fp>_utexo.backup');
    });

    it('should throw when layer1 and utexo filenames mismatch', () => {
      const fp1 = 'a66bffef';
      const fp2 = 'dd80d908';
      fs.writeFileSync(
        path.join(emptyBackupDir, `wallet_${fp1}${LAYER1_BACKUP_SUFFIX}`),
        'fake'
      );
      fs.writeFileSync(
        path.join(emptyBackupDir, `wallet_${fp2}${UTEXO_BACKUP_SUFFIX}`),
        'fake'
      );

      expect(() =>
        restoreUtxoWalletFromBackup({
          backupPath: emptyBackupDir,
          password: 'pass',
          targetDir: path.join(os.tmpdir(), 'restore-out'),
        })
      ).toThrow(ValidationError);
      expect(() =>
        restoreUtxoWalletFromBackup({
          backupPath: emptyBackupDir,
          password: 'pass',
          targetDir: path.join(os.tmpdir(), 'restore-out'),
        })
      ).toThrow(
        'Layer1 and utexo backup filenames must share the same wallet id'
      );
    });
  });
});
