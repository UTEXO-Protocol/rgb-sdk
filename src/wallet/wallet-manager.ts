import { NodeRgbLibBinding, restoreWallet } from '../binding/NodeRgbLibBinding';
import * as IWalletModel from '@utexo/rgb-sdk-core';
import { ValidationError, WalletError } from '@utexo/rgb-sdk-core';
import { BaseWalletManager } from '@utexo/rgb-sdk-core';
import type { WalletInitParams } from '@utexo/rgb-sdk-core';
import { generateKeys } from '@utexo/rgb-sdk-core';
import { NodeSigner } from '../signer/NodeSigner';
import path from 'path';

export type { WalletInitParams };

/**
 * Restore wallet from backup
 */
export const restoreFromBackup = (
  params: IWalletModel.RestoreWalletRequestModel
): IWalletModel.WalletRestoreResponse => {
  const { backupFilePath, password, dataDir } = params;

  if (!backupFilePath) {
    throw new ValidationError('backup file is required', 'backup');
  }
  if (!password) {
    throw new ValidationError('password is required', 'password');
  }
  if (!dataDir) {
    throw new ValidationError('restore directory is required', 'restoreDir');
  }

  return restoreWallet({ backupFilePath, password, dataDir });
};

/**
 * Generate a new wallet with keys
 */
export const createWallet = async (network: string = 'regtest') => {
  return await generateKeys(network);
};

/**
 * Wallet Manager — concrete Node SDK implementation of BaseWalletManager.
 *
 * Phase 14: NodeRgbLibBinding implements IRgbLibBinding directly — no wrapper layer.
 * NodeSigner implements ISigner. Both are injected into BaseWalletManager,
 * eliminating ~35 abstract method overrides. Only initialize() and goOnline()
 * remain as Node-specific implementations.
 */
export class WalletManager extends BaseWalletManager {
  private readonly client: NodeRgbLibBinding;

  constructor(params: WalletInitParams) {
    const dataDir =
      params.dataDir ??
      path.join(
        process.cwd(),
        '.rgb-wallet',
        String(params.network ?? 'regtest'),
        params.masterFingerprint
      );

    const client = new NodeRgbLibBinding({
      xpubVan: params.xpubVan,
      xpubCol: params.xpubCol,
      masterFingerprint: params.masterFingerprint,
      network: String(params.network ?? 'regtest'),
      transportEndpoint: params.transportEndpoint,
      indexerUrl: params.indexerUrl,
      dataDir,
      reuseAddresses: params.reuseAddresses,
      vanillaKeychain: params.vanillaKeychain,
      maxAllocationsPerUtxo: params.maxAllocationsPerUtxo,
    });

    super(params, client, new NodeSigner());
    this.client = client;
  }

  async initialize(): Promise<void> {
    // No-op for Node SDK — wallet is ready after construction.
  }

  async goOnline(
    _indexerUrl: string,
    _skipConsistencyCheck?: boolean
  ): Promise<void> {
    this.client.getOnline();
  }

  /**
   * Register wallet with the network — Node-specific convenience method.
   * Not part of IWalletManager; used directly by UTEXOWallet and callers
   * that need the initial address + balance snapshot.
   */
  registerWallet(): { address: string; btcBalance: IWalletModel.BtcBalance } {
    return this.client.registerWallet();
  }
}

/**
 * Factory function to create a WalletManager instance
 */
export function createWalletManager(params: WalletInitParams): WalletManager {
  return new WalletManager(params);
}

// Legacy singleton instance for backward compatibility
// @deprecated Use `new WalletManager(params)` or `createWalletManager(params)` instead
let _wallet: WalletManager | null = null;

export const wallet = new Proxy({} as WalletManager, {
  get(target, prop) {
    if (!_wallet) {
      throw new WalletError(
        'The legacy singleton wallet instance is deprecated. ' +
          'Please use `new WalletManager(params)` or `createWalletManager(params)` instead. ' +
          'Example: const wallet = new WalletManager({ xpubVan, xpubCol, masterFingerprint, network, transportEndpoint, indexerUrl })'
      );
    }
    const value = (_wallet as any)[prop];
    return typeof value === 'function' ? value.bind(_wallet) : value;
  },
});
