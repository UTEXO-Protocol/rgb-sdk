/**
 * UTEXOWallet tests with mocked WalletManager.
 * Tests getAddress, getBtcBalance, listAssets, listTransfers, listTransactions
 * without network or native rgb-lib.
 */
// @ts-nocheck - Jest mock types infer 'never' for mockResolvedValue
import { jest } from '@jest/globals';

const mockBtcBalance = {
  vanilla: { settled: 10000, future: 0, spendable: 10000 },
  colored: { settled: 0, future: 0, spendable: 0 },
};

const mockListAssets = {
  nia: [
    {
      assetId: 'rgb:asset-id',
      ticker: 'TESTUSD',
      name: 'Test-USD',
      details: null,
      precision: 6,
      issuedSupply: 5000000000000000000,
      timestamp: 1771235321,
      addedAt: 1771434165,
      balance: { settled: 492372854, future: 492372854, spendable: 492372854 },
      media: null,
    },
  ],
  uda: [],
  cfa: [],
  ifa: [],
};

const mockTransfers = [
  {
    idx: 1,
    batchTransferIdx: 1,
    createdAt: 1700000000,
    updatedAt: 1700000100,
    status: 'Settled' as const,
    kind: 'ReceiveBlind' as const,
    txid: 'tx123',
    recipientId: 'tb1precipient',
    requestedAssignment: { Fungible: 50 },
    assignments: [{ Fungible: 50 }],
  },
];

const mockTransactions = [
  {
    transactionType: 'User' as const,
    txid: 'tx456',
    received: 10000,
    sent: 0,
    fee: 100,
    confirmationTime: { height: 100, timestamp: 1700000000 },
  },
];

const createMockWalletManager = () =>
  ({
    getAddress: jest
      .fn()
      .mockResolvedValue('tb1ptest1234567890abcdefghijklmnopqrstuvwxyz' as any),
    rotateVanillaAddress: jest.fn().mockResolvedValue('tb1pnewvanilla'),
    rotateColoredAddress: jest.fn().mockResolvedValue('tb1pnewcolored'),
    getBtcBalance: jest.fn().mockResolvedValue(mockBtcBalance),
    listUnspents: jest.fn().mockResolvedValue([]),
    listAssets: jest.fn().mockResolvedValue(mockListAssets),
    getAssetBalance: jest
      .fn()
      .mockResolvedValue({ settled: 100, future: 0, spendable: 100 } as any),
    listTransfers: jest.fn().mockResolvedValue(mockTransfers),
    listTransactions: jest.fn().mockResolvedValue(mockTransactions),
    getXpub: jest
      .fn()
      .mockReturnValue({ xpubVan: 'tpub...', xpubCol: 'tpub...' }),
    getNetwork: jest.fn().mockReturnValue('testnet'),
    isDisposed: jest.fn().mockReturnValue(false),
    dispose: jest.fn().mockResolvedValue(undefined),
    refreshWallet: jest.fn().mockResolvedValue(undefined),
    syncWallet: jest.fn().mockResolvedValue(undefined),
    createUtxosBegin: jest.fn().mockResolvedValue('cHNidP8...'),
    createUtxosEnd: jest.fn().mockResolvedValue(1),
    createUtxos: jest.fn().mockResolvedValue(1),
    issueAssetNia: jest.fn().mockResolvedValue({ assetId: 'rgb:new-asset' }),
    issueAssetIfa: jest.fn().mockResolvedValue({}),
    inflateBegin: jest.fn().mockResolvedValue('psbt'),
    inflateEnd: jest.fn().mockResolvedValue({}),
    inflate: jest.fn().mockResolvedValue({}),
    sendBegin: jest.fn().mockResolvedValue('psbt'),
    sendEnd: jest
      .fn()
      .mockResolvedValue({ txid: 'tx789', batchTransferIdx: 0 }),
    send: jest.fn().mockResolvedValue({ txid: 'tx789', batchTransferIdx: 0 }),
    sendBtcBegin: jest.fn().mockResolvedValue('psbt'),
    sendBtcEnd: jest.fn().mockResolvedValue('txid'),
    sendBtc: jest.fn().mockResolvedValue('txid'),
    blindReceive: jest.fn().mockResolvedValue({
      invoice: 'rgb:inv...',
      recipientId: 'r',
      expirationTimestamp: 0,
      batchTransferIdx: 0,
    }),
    witnessReceive: jest.fn().mockResolvedValue({
      invoice: 'rgb:inv...',
      recipientId: 'r',
      expirationTimestamp: 0,
      batchTransferIdx: 0,
    }),
    decodeRGBInvoice: jest.fn().mockResolvedValue({
      recipientId: 'r',
      network: 'testnet',
      assignment: {},
      transportEndpoints: [],
    }),
    failTransfers: jest.fn().mockResolvedValue(true),
    estimateFeeRate: jest.fn().mockResolvedValue({ feeRate: 5 }),
    estimateFee: jest.fn().mockResolvedValue({ vbytes: 200, feeRate: 5 }),
    createBackup: jest
      .fn()
      .mockResolvedValue({ message: 'ok', backupPath: '/tmp/backup' }),
    configureVssBackup: jest.fn().mockResolvedValue(undefined),
    disableVssAutoBackup: jest.fn().mockResolvedValue(undefined),
    vssBackup: jest.fn().mockResolvedValue(1),
    vssBackupInfo: jest
      .fn()
      .mockResolvedValue({ backupExists: false, backupRequired: false }),
    signPsbt: jest.fn().mockResolvedValue('signed-psbt'),
    signMessage: jest.fn().mockResolvedValue('signature'),
    verifyMessage: jest.fn().mockResolvedValue(true),
  }) as any;

const WalletManagerMock = jest
  .fn()
  .mockImplementation(() => createMockWalletManager());

await jest.unstable_mockModule('../src/wallet/wallet-manager', () => {
  const mockInstance = createMockWalletManager();
  return {
    WalletManager: WalletManagerMock,
    createWalletManager: jest.fn().mockImplementation(() => mockInstance),
    createWallet: jest.fn(),
    restoreFromBackup: jest.fn(),
    wallet: {},
  };
});

// Import from src so WalletManager mock is used (dist is a bundle with inlined deps)
const { UTEXOWallet } = await import('../src/utexo/utexo-wallet');

describe('UTEXOWallet with mocked WalletManager', () => {
  const MNEMONIC =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  let wallet: InstanceType<typeof UTEXOWallet>;

  beforeAll(async () => {
    wallet = new UTEXOWallet(MNEMONIC, { network: 'testnet' });
    await wallet.initialize();
  });

  afterAll(async () => {
    await wallet.dispose();
  });

  it('should return mock address from getAddress', async () => {
    const address = await wallet.getAddress();
    expect(address).toBe('tb1ptest1234567890abcdefghijklmnopqrstuvwxyz');
    expect(address).toMatch(/^tb1p/);
  });

  it('should return mock BTC balance from getBtcBalance', async () => {
    const balance = await wallet.getBtcBalance();
    expect(balance).toEqual(mockBtcBalance);
    expect(balance.vanilla.settled).toBe(10000);
  });

  it('should return mock assets from listAssets', async () => {
    const assets = await wallet.listAssets();
    expect(assets.nia).toHaveLength(1);
    expect(assets.nia[0].ticker).toBe('TESTUSD');
    expect(assets.nia[0].balance.settled).toBe(492372854);
    expect(assets.ifa).toEqual([]);
  });

  it('should return mock transfers from listTransfers', async () => {
    const transfers = await wallet.listTransfers();
    expect(transfers).toHaveLength(1);
    expect(transfers[0].status).toBe('Settled');
    expect(transfers[0].kind).toBe('ReceiveBlind');
  });

  it('should return mock transfers when filtered by assetId', async () => {
    const transfers = await wallet.listTransfers(
      'rgb:yJW4k8si-~8JdNfl-nM91qFu-r5rH_HS-1hM7jpi-L~lBf90'
    );
    expect(Array.isArray(transfers)).toBe(true);
  });

  it('should return mock transactions from listTransactions', async () => {
    const txns = await wallet.listTransactions();
    expect(txns).toHaveLength(1);
    expect(txns[0].txid).toBe('tx456');
    expect(txns[0].transactionType).toBe('User');
  });

  it('should return mock unspents from listUnspents', async () => {
    const unspents = await wallet.listUnspents();
    expect(unspents).toEqual([]);
  });

  it('should return xpub from getXpub', () => {
    const xpub = wallet.getXpub();
    expect(xpub).toHaveProperty('xpubVan');
    expect(xpub).toHaveProperty('xpubCol');
  });

  it('should return network from getNetwork', () => {
    const network = wallet.getNetwork();
    expect(network).toBe('testnet');
  });

  it('should return mock asset balance from getAssetBalance', async () => {
    const balance = await wallet.getAssetBalance('rgb:test-asset-id');
    expect(balance).toEqual({ settled: 100, future: 0, spendable: 100 });
  });

  it('should return mock invoice from blindReceive', async () => {
    const result = await wallet.blindReceive({
      assetId: 'rgb:test',
      amount: 10,
    });
    expect(result.invoice).toMatch(/^rgb:/);
    expect(result).toHaveProperty('recipientId');
  });

  it('should return mock invoice from witnessReceive', async () => {
    const result = await wallet.witnessReceive({
      assetId: 'rgb:test',
      amount: 10,
    });
    expect(result.invoice).toMatch(/^rgb:/);
  });

  it('should call rotateVanillaAddress and return result', async () => {
    const result = await wallet.rotateVanillaAddress();
    expect(result).toBeDefined();
  });

  it('should call rotateColoredAddress and return result', async () => {
    const result = await wallet.rotateColoredAddress();
    expect(result).toBeDefined();
  });

  describe('reuseAddresses propagation', () => {
    it('passes reuseAddresses: true only to the utexo wallet, not layer1', async () => {
      WalletManagerMock.mockClear();
      const w = new UTEXOWallet(MNEMONIC, {
        network: 'testnet',
        reuseAddresses: true,
      } as any);
      await w.initialize();

      // WalletManager is called twice: utexoWallet first, then layer1Wallet
      expect(WalletManagerMock).toHaveBeenCalledTimes(2);
      const [utexoCall, layer1Call] = WalletManagerMock.mock.calls;
      expect(utexoCall[0].reuseAddresses).toBe(true);
      expect(layer1Call[0].reuseAddresses).toBeUndefined();

      await w.dispose();
    });

    it('passes reuseAddresses: false when option is false', async () => {
      WalletManagerMock.mockClear();
      const w = new UTEXOWallet(MNEMONIC, {
        network: 'testnet',
        reuseAddresses: false,
      } as any);
      await w.initialize();

      const [utexoCall] = WalletManagerMock.mock.calls;
      expect(utexoCall[0].reuseAddresses).toBe(false);

      await w.dispose();
    });

    it('omits reuseAddresses when not provided in options', async () => {
      WalletManagerMock.mockClear();
      const w = new UTEXOWallet(MNEMONIC, { network: 'testnet' });
      await w.initialize();

      const [utexoCall] = WalletManagerMock.mock.calls;
      expect(utexoCall[0].reuseAddresses).toBeUndefined();

      await w.dispose();
    });
  });

  describe('async methods return Promises', () => {
    it('getAddress should return a Promise', () => {
      expect(wallet.getAddress()).toBeInstanceOf(Promise);
    });
    it('getBtcBalance should return a Promise', () => {
      expect(wallet.getBtcBalance()).toBeInstanceOf(Promise);
    });
    it('listUnspents should return a Promise', () => {
      expect(wallet.listUnspents()).toBeInstanceOf(Promise);
    });
    it('listAssets should return a Promise', () => {
      expect(wallet.listAssets()).toBeInstanceOf(Promise);
    });
    it('getAssetBalance should return a Promise', () => {
      expect(wallet.getAssetBalance('rgb:x')).toBeInstanceOf(Promise);
    });
    it('listTransfers should return a Promise', () => {
      expect(wallet.listTransfers()).toBeInstanceOf(Promise);
    });
    it('listTransactions should return a Promise', () => {
      expect(wallet.listTransactions()).toBeInstanceOf(Promise);
    });
    it('blindReceive should return a Promise', () => {
      expect(
        wallet.blindReceive({ assetId: 'rgb:x', amount: 1 })
      ).toBeInstanceOf(Promise);
    });
    it('witnessReceive should return a Promise', () => {
      expect(
        wallet.witnessReceive({ assetId: 'rgb:x', amount: 1 })
      ).toBeInstanceOf(Promise);
    });
    it('refreshWallet should return a Promise', () => {
      expect(wallet.refreshWallet()).toBeInstanceOf(Promise);
    });
    it('syncWallet should return a Promise', () => {
      expect(wallet.syncWallet()).toBeInstanceOf(Promise);
    });
    it('dispose should return a Promise', () => {
      expect(wallet.dispose()).toBeInstanceOf(Promise);
    });
  });
});
