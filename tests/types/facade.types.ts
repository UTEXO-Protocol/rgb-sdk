// Type tests: checked by `npm run typecheck`, never run.
import { UTEXOWallet, UTEXOWalletError } from '../../src/index.js';
import type { AnyEngine } from '../../src/index.js';
import type {
  BurnApi,
  FileBackupApi,
  RestartableWalletApi,
  SharedWalletApi,
  Transaction,
  TxidLookupApi,
  WalletBackupResponse,
  WalletTransfer,
} from '@utexo/rgb-sdk-core';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
const assertType = <T extends true>(value: T) => value;

interface Unlock {
  indexerUrl: string;
}

declare const rgbLike: SharedWalletApi<Unlock> &
  RestartableWalletApi<Unlock> &
  FileBackupApi &
  BurnApi &
  TxidLookupApi & {
    listOnchainTransfers(assetId?: string): Promise<WalletTransfer[]>;
  };
declare const bare: SharedWalletApi<void>;
declare const legacy: SharedWalletApi<void> & {
  goOnline(params: { url: string }): Promise<void>;
};

const wallet = new UTEXOWallet({ engine: rgbLike });

// unlock() takes the engine's own parameters.
void wallet.unlock({ indexerUrl: 'tcp://x' });
// @ts-expect-error wrong unlock parameters
void wallet.unlock({ url: 'x' });
void wallet.reinit();
void wallet.reinit({ indexerUrl: 'tcp://x' });

// Extensions with their exact types.
assertType<
  Equal<ReturnType<typeof wallet.createBackup>, Promise<WalletBackupResponse>>
>(true);
assertType<Equal<typeof wallet.burn, BurnApi['burn']>>(true);
void wallet.shutdown();

assertType<
  Equal<
    ReturnType<typeof wallet.listTransactionsByTxid>,
    Promise<Transaction[]>
  >
>(true);
void wallet.listTransactionsByTxid('t', { skipSync: true });
// @ts-expect-error not an extension of this engine
void wallet.rotateVanillaAddress();
// refresh() is shared: every engine has it.
void wallet.refresh({ skipSync: true });

// Not an extension: only through wallet.engine.
// @ts-expect-error engine-specific method, not forwarded
void wallet.listOnchainTransfers();
void wallet.engine.listOnchainTransfers();
assertType<Equal<typeof wallet.engine, typeof rgbLike>>(true);

// An engine without extensions has none on the facade.
const plain = new UTEXOWallet({ engine: bare });
void plain.unlock();
// @ts-expect-error no FileBackupApi
void plain.createBackup({ backupPath: '/b', password: 'p' });
// @ts-expect-error no RestartableWalletApi
void plain.shutdown();
// @ts-expect-error no goOnline
void plain.goOnline();
// @ts-expect-error no TxidLookupApi
void plain.listTransfersByTxid('t');

// goOnline only when the engine has it, with its own signature.
const old = new UTEXOWallet({ engine: legacy });
void old.goOnline({ url: 'x' });
// @ts-expect-error wrong goOnline parameters
void old.goOnline();

// Aliases and read-only properties.
void wallet.initialize();
void wallet.dispose();
// @ts-expect-error protocol is read-only
wallet.protocol = 'RGB_LN';
// @ts-expect-error capabilities is read-only
wallet.capabilities = rgbLike.capabilities;

// The facade itself satisfies the shared contract.
const asContract: SharedWalletApi<Unlock> = wallet;
void asContract;

// @ts-expect-error an engine is required
new UTEXOWallet({});

assertType<
  Equal<UTEXOWalletError['code'], 'INVALID_CONFIG' | 'UNSUPPORTED_CAPABILITY'>
>(true);
declare const unknownValue: unknown;
if (unknownValue instanceof UTEXOWallet) {
  void unknownValue.init();
}

// ── Exact engine signatures (review: Parameters/ReturnType lost these) ──────

interface OverloadedEngine extends SharedWalletApi<string> {
  unlock(params: string): Promise<void>;
  unlock(params: { url: string }): Promise<void>;
  listTransfers<T extends string>(assetId?: T): Promise<WalletTransfer[]>;
  getNetwork(): 'regtest';
}
declare const overloaded: OverloadedEngine;
const over = new UTEXOWallet({ engine: overloaded });
void over.unlock('tcp://x');
void over.unlock({ url: 'x' });
// @ts-expect-error neither overload
void over.unlock(1);
assertType<Equal<typeof over.unlock, OverloadedEngine['unlock']>>(true);
assertType<Equal<typeof over.listTransfers, OverloadedEngine['listTransfers']>>(
  true
);
assertType<Equal<ReturnType<typeof over.getNetwork>, 'regtest'>>(true);
assertType<Equal<typeof over.initialize, OverloadedEngine['init']>>(true);

// Methods are read-only on the facade (extensions are non-writable at runtime).
// @ts-expect-error extension is read-only
wallet.burn = rgbLike.burn;
// @ts-expect-error shared method is read-only
wallet.getAddress = rgbLike.getAddress;

// ── Subclassing: not supported beyond adding members to a concrete facade ──

class Named extends UTEXOWallet<typeof rgbLike> {
  readonly label = 'main';
}
const named = new Named({ engine: rgbLike });
void named.createBackup({ backupPath: '/b', password: 'p' });
void named.label;

class Overriding extends UTEXOWallet<typeof rgbLike> {
  // @ts-expect-error TS2425: shared methods cannot be overridden
  init() {
    return Promise.resolve();
  }
}
void Overriding;

// @ts-expect-error TS2509: a generic subclass has no statically known base
class GenericSub<E extends AnyEngine> extends UTEXOWallet<E> {}
void GenericSub;
