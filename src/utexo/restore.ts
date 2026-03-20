/**
 * UTEXO wallet restore: VSS and file backup restore helpers.
 *
 * Pure crypto helpers (getBackupStoreId, buildVssConfigFromMnemonic) are
 * re-exported from @utexo/rgb-sdk-core. Node-specific (fs/path) helpers
 * stay here.
 */

import path from 'path';
import fs from 'fs';
import { getUtxoNetworkConfig, type UtxoNetworkPreset, DEFAULT_VSS_SERVER_URL } from '@utexo/rgb-sdk-core';
import { restoreFromVss, restoreWallet } from '../binding/NodeRgbLibBinding';
import { ValidationError } from '@utexo/rgb-sdk-core';
import type { VssBackupConfig } from '@utexo/rgb-sdk-core';
import {
  getBackupStoreId,
  buildVssConfigFromMnemonic,
} from '@utexo/rgb-sdk-core';

export { getBackupStoreId, buildVssConfigFromMnemonic };

/** Backup file extension; used by createBackup and restore. */
export const BACKUP_FILE_SUFFIX = '.backup';
/** Same naming as VSS: wallet_<fp>_layer1, wallet_<fp>_utexo */
export const LAYER1_BACKUP_SUFFIX = '_layer1.backup';
export const UTEXO_BACKUP_SUFFIX = '_utexo.backup';

const UTEXO_BACKUP_TMP_LAYER1 = '.layer1';
const UTEXO_BACKUP_TMP_UTEXO = '.utexo';

export interface PrepareUtxoBackupDirsResult {
  storeId: string;
  layer1TmpDir: string;
  utexoTmpDir: string;
  layer1FinalPath: string;
  utexoFinalPath: string;
}

/**
 * Prepare backup directory and temp dirs for UTEXO createBackup.
 */
export function prepareUtxoBackupDirs(
  backupPath: string,
  masterFingerprint: string
): PrepareUtxoBackupDirsResult {
  const storeId = getBackupStoreId(masterFingerprint);
  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
  }
  const layer1TmpDir = path.join(backupPath, UTEXO_BACKUP_TMP_LAYER1);
  const utexoTmpDir = path.join(backupPath, UTEXO_BACKUP_TMP_UTEXO);
  fs.mkdirSync(layer1TmpDir, { recursive: true });
  fs.mkdirSync(utexoTmpDir, { recursive: true });
  return {
    storeId,
    layer1TmpDir,
    utexoTmpDir,
    layer1FinalPath: path.join(
      backupPath,
      `${storeId}_layer1${BACKUP_FILE_SUFFIX}`
    ),
    utexoFinalPath: path.join(
      backupPath,
      `${storeId}_utexo${BACKUP_FILE_SUFFIX}`
    ),
  };
}

/**
 * Move backup files from temp dirs to final paths and remove temp dirs.
 */
export function finalizeUtxoBackupPaths(params: {
  layer1BackupPath: string;
  utexoBackupPath: string;
  layer1FinalPath: string;
  utexoFinalPath: string;
  layer1TmpDir: string;
  utexoTmpDir: string;
}): void {
  const {
    layer1BackupPath,
    utexoBackupPath,
    layer1FinalPath,
    utexoFinalPath,
    layer1TmpDir,
    utexoTmpDir,
  } = params;
  fs.renameSync(layer1BackupPath, layer1FinalPath);
  fs.renameSync(utexoBackupPath, utexoFinalPath);
  fs.rmdirSync(layer1TmpDir);
  fs.rmdirSync(utexoTmpDir);
}

/**
 * Restore a UTEXOWallet from VSS by restoring both layer1 and utexo stores.
 */
export async function restoreUtxoWalletFromVss(params: {
  mnemonic: string;
  targetDir: string;
  config?: VssBackupConfig;
  networkPreset?: UtxoNetworkPreset;
  vssServerUrl?: string;
}): Promise<{ layer1Path: string; utexoPath: string; targetDir: string }> {
  const {
    mnemonic,
    targetDir,
    config: providedConfig,
    networkPreset = 'testnet',
    vssServerUrl,
  } = params;
  if (!mnemonic || !mnemonic.trim()) {
    throw new ValidationError('mnemonic is required', 'mnemonic');
  }
  if (!targetDir) {
    throw new ValidationError('targetDir is required', 'targetDir');
  }
  const serverUrl = vssServerUrl ?? DEFAULT_VSS_SERVER_URL;
  const config =
    providedConfig ??
    (await buildVssConfigFromMnemonic(mnemonic.trim(), serverUrl, networkPreset));
  const presetConfig = getUtxoNetworkConfig(networkPreset);
  const layer1Network = String(presetConfig.networkMap.mainnet);
  const utexoNetwork = String(presetConfig.networkMap.utexo);
  const masterFingerprint =
    config.storeId.replace(/^wallet_/, '') || config.storeId;
  const layer1Config: VssBackupConfig = {
    ...config,
    storeId: `${config.storeId}_layer1`,
  };
  const utexoConfig: VssBackupConfig = {
    ...config,
    storeId: `${config.storeId}_utexo`,
  };
  const { walletPath: layer1Path } = restoreFromVss({
    config: layer1Config,
    targetDir: path.join(targetDir, layer1Network, masterFingerprint),
  });
  const { walletPath: utexoPath } = restoreFromVss({
    config: utexoConfig,
    targetDir: path.join(targetDir, utexoNetwork, masterFingerprint),
  });
  return { layer1Path, utexoPath, targetDir };
}

/**
 * Restore a UTEXOWallet from a regular (file) backup created by UTEXOWallet.createBackup.
 */
export function restoreUtxoWalletFromBackup(params: {
  backupPath: string;
  password: string;
  targetDir: string;
  networkPreset?: UtxoNetworkPreset;
}): { layer1Path: string; utexoPath: string; targetDir: string } {
  const { backupPath, password, targetDir, networkPreset = 'testnet' } = params;
  if (!backupPath || !password || !targetDir) {
    throw new ValidationError(
      'backupPath, password, and targetDir are required',
      'restoreUtxoWalletFromBackup'
    );
  }
  if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isDirectory()) {
    throw new ValidationError(
      'backupPath must be an existing directory',
      'backupPath'
    );
  }
  const files = fs.readdirSync(backupPath);
  const layer1File = files.find((f) => f.endsWith(LAYER1_BACKUP_SUFFIX));
  const utexoFile = files.find((f) => f.endsWith(UTEXO_BACKUP_SUFFIX));
  if (!layer1File || !utexoFile) {
    throw new ValidationError(
      `backupPath must contain wallet_<fp>_layer1.backup and wallet_<fp>_utexo.backup (from createBackup)`,
      'backupPath'
    );
  }
  const masterFingerprint = layer1File
    .slice(0, -LAYER1_BACKUP_SUFFIX.length)
    .replace(/^wallet_/, '');
  const expectedUtexoFile = `wallet_${masterFingerprint}${UTEXO_BACKUP_SUFFIX}`;
  if (utexoFile !== expectedUtexoFile) {
    throw new ValidationError(
      `Layer1 and utexo backup filenames must share the same wallet id (expected ${expectedUtexoFile})`,
      'backupPath'
    );
  }
  const layer1BackupFile = path.join(backupPath, layer1File);
  const utexoBackupFile = path.join(backupPath, utexoFile);
  if (!fs.existsSync(layer1BackupFile) || !fs.existsSync(utexoBackupFile)) {
    throw new ValidationError('Backup files not found', 'backupPath');
  }
  const presetConfig = getUtxoNetworkConfig(networkPreset);
  const layer1Network = String(presetConfig.networkMap.mainnet);
  const utexoNetwork = String(presetConfig.networkMap.utexo);
  const layer1DataDir = path.join(targetDir, layer1Network, masterFingerprint);
  const utexoDataDir = path.join(targetDir, utexoNetwork, masterFingerprint);
  for (const dir of [layer1DataDir, utexoDataDir]) {
    if (!fs.existsSync(path.dirname(dir))) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  restoreWallet({
    backupFilePath: layer1BackupFile,
    password,
    dataDir: layer1DataDir,
  });
  restoreWallet({
    backupFilePath: utexoBackupFile,
    password,
    dataDir: utexoDataDir,
  });
  return {
    layer1Path: layer1DataDir,
    utexoPath: utexoDataDir,
    targetDir,
  };
}
