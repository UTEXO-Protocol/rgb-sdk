/**
 * UTEXO wallet restore: VSS and file backup restore helpers.
 */

import path from 'path';
import fs from 'fs';
import {
  deriveKeysFromMnemonic,
  deriveVssSigningKeyFromMnemonic,
} from '../crypto';
import { getUtxoNetworkConfig, type UtxoNetworkPreset } from './utils/network';
import { restoreFromVss, restoreWallet } from '../client/rgb-lib-client';
import { ValidationError } from '../errors';
import type { VssBackupConfig } from '../types/wallet-model';
import { DEFAULT_VSS_SERVER_URL } from './config/vss';

/** Backup file extension; used by createBackup and restore. */
export const BACKUP_FILE_SUFFIX = '.backup';
/** Same naming as VSS: wallet_<fp>_layer1, wallet_<fp>_utexo */
export const LAYER1_BACKUP_SUFFIX = '_layer1.backup';
export const UTEXO_BACKUP_SUFFIX = '_utexo.backup';

const UTEXO_BACKUP_TMP_LAYER1 = '.layer1';
const UTEXO_BACKUP_TMP_UTEXO = '.utexo';

/** Store id for backup/restore (same convention as VSS: wallet_<masterFingerprint>). */
export function getBackupStoreId(masterFingerprint: string): string {
  return `wallet_${masterFingerprint}`;
}

export interface PrepareUtxoBackupDirsResult {
  storeId: string;
  layer1TmpDir: string;
  utexoTmpDir: string;
  layer1FinalPath: string;
  utexoFinalPath: string;
}

/**
 * Prepare backup directory and temp dirs for UTEXO createBackup.
 * Creates backupPath if needed and .layer1/.utexo temp subdirs; returns paths for createBackup and final filenames.
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
 * Move backup files from temp dirs to final paths and remove temp dirs. Call after createBackup into layer1TmpDir/utexoTmpDir.
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
 * Build VSS config from mnemonic (storeId = wallet_<masterFingerprint>, signingKey derived).
 * Used when config is not passed to vssBackup or restoreUtxoWalletFromVss.
 */
export async function buildVssConfigFromMnemonic(
  mnemonic: string,
  serverUrl: string,
  networkPreset: UtxoNetworkPreset = 'testnet'
): Promise<VssBackupConfig> {
  const keys = await deriveKeysFromMnemonic(networkPreset, mnemonic.trim());
  return {
    serverUrl,
    storeId: `wallet_${keys.masterFingerprint}`,
    signingKey: deriveVssSigningKeyFromMnemonic(mnemonic.trim()),
    backupMode: 'Blocking',
  };
}

/**
 * Restore a UTEXOWallet from VSS by restoring both layer1 and utexo stores.
 * Mnemonic is required; config is optional (built from mnemonic when omitted; vssServerUrl uses DEFAULT_VSS_SERVER_URL if omitted).
 * Uses the same storeId suffix convention as UTEXOWallet VSS backup (storeId_layer1, storeId_utexo).
 * Restored data is written to targetDir/{layer1Network}/{masterFingerprint} and
 * targetDir/{utexoNetwork}/{masterFingerprint} (same layout as when using dataDir on UTEXOWallet).
 */
export async function restoreUtxoWalletFromVss(params: {
  mnemonic: string;
  targetDir: string;
  /** Optional; when omitted, config is built from mnemonic (vssServerUrl defaults to DEFAULT_VSS_SERVER_URL). */
  config?: VssBackupConfig;
  /** Preset to derive layer1/utexo network names; defaults to 'testnet'. */
  networkPreset?: UtxoNetworkPreset;
  /** Optional; when omitted and config not passed, DEFAULT_VSS_SERVER_URL is used. */
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
    (await buildVssConfigFromMnemonic(
      mnemonic.trim(),
      serverUrl,
      networkPreset
    ));
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
  const { walletPath: layer1Path } = await restoreFromVss({
    config: layer1Config,
    targetDir: path.join(targetDir, layer1Network, masterFingerprint),
  });
  const { walletPath: utexoPath } = await restoreFromVss({
    config: utexoConfig,
    targetDir: path.join(targetDir, utexoNetwork, masterFingerprint),
  });
  return { layer1Path, utexoPath, targetDir };
}

/**
 * Restore a UTEXOWallet from a regular (file) backup created by UTEXOWallet.createBackup.
 * Expects one folder with wallet_<masterFingerprint>_layer1.backup and wallet_<masterFingerprint>_utexo.backup
 * (same naming convention as VSS: storeId_layer1, storeId_utexo with storeId = wallet_<fp>).
 * Restores into targetDir (same layout as VSS restore).
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
