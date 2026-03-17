/**
 * UTEXOWallet — Node SDK concrete implementation of UTEXOWalletCore.
 *
 * Extends UTEXOWalletCore from @utexo/rgb-sdk-core, overriding:
 *   - initialize(): creates Node WalletManager instances
 *   - createBackup(): dual backup (layer1 + utexo files)
 */

import { UTEXOWalletCore } from '@utexo/rgb-sdk-core';
import { WalletManager } from '../wallet/wallet-manager';
import type { WalletBackupResponse } from '@utexo/rgb-sdk-core';
import { ValidationError } from '@utexo/rgb-sdk-core';
import path from 'path';
import { prepareUtxoBackupDirs, finalizeUtxoBackupPaths } from './restore';

export { UTEXOProtocol } from '@utexo/rgb-sdk-core';
export type { IUTEXOProtocol } from '@utexo/rgb-sdk-core';

export class UTEXOWallet extends UTEXOWalletCore {
  private _masterFingerprint: string | null = null;

  async initialize(): Promise<void> {
    const layer1Keys = await this.derivePublicKeys(this.networkMap.mainnet);
    const utexoKeys = await this.derivePublicKeys(this.networkMap.utexo);
    this._masterFingerprint = utexoKeys.masterFingerprint;
    const fp = utexoKeys.masterFingerprint;
    const dataDir = this.options.dataDir;

    this.utexoWallet = new WalletManager({
      xpubVan: utexoKeys.accountXpubVanilla,
      xpubCol: utexoKeys.accountXpubColored,
      masterFingerprint: utexoKeys.masterFingerprint,
      network: this.networkMap.utexo,
      mnemonic: this.mnemonicOrSeed as string,
      dataDir: dataDir
        ? path.join(dataDir, String(this.networkMap.utexo), fp)
        : undefined,
    });

    this.layer1Wallet = new WalletManager({
      xpubVan: layer1Keys.accountXpubVanilla,
      xpubCol: layer1Keys.accountXpubColored,
      masterFingerprint: layer1Keys.masterFingerprint,
      network: this.networkMap.mainnet,
      mnemonic: this.mnemonicOrSeed as string,
      dataDir: dataDir
        ? path.join(dataDir, String(this.networkMap.mainnet), fp)
        : undefined,
    });
  }

  /**
   * Create backup for both layer1 and utexo stores in one folder.
   * Writes backupPath/wallet_{masterFingerprint}_layer1.backup and
   * backupPath/wallet_{masterFingerprint}_utexo.backup
   */
  override async createBackup(params: {
    backupPath: string;
    password: string;
  }): Promise<WalletBackupResponse & { layer1BackupPath: string; utexoBackupPath: string }> {
    this.ensureInitialized();
    const { backupPath, password } = params;
    if (!backupPath || !password) {
      throw new ValidationError(
        'backupPath and password are required',
        'createBackup'
      );
    }
    const fp = this._masterFingerprint!;
    const { layer1TmpDir, utexoTmpDir, layer1FinalPath, utexoFinalPath } =
      prepareUtxoBackupDirs(backupPath, fp);
    const layer1Result = await this.layer1Wallet!.createBackup({
      backupPath: layer1TmpDir,
      password,
    });
    const utexoResult = await this.utexoWallet!.createBackup({
      backupPath: utexoTmpDir,
      password,
    });
    finalizeUtxoBackupPaths({
      layer1BackupPath: layer1Result.backupPath,
      utexoBackupPath: utexoResult.backupPath,
      layer1FinalPath,
      utexoFinalPath,
      layer1TmpDir,
      utexoTmpDir,
    });
    return {
      message: 'Backup created successfully (layer1 + utexo)',
      backupPath,
      layer1BackupPath: layer1FinalPath,
      utexoBackupPath: utexoFinalPath,
    };
  }
}
