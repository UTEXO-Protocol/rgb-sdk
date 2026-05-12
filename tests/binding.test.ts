/**
 * Unit tests for NodeRgbLibBinding.
 *
 * Tests cover the three breaking changes introduced to align with the new
 * rgb-lib wrapper.js:
 *   1. Wallet constructor split — walletData + SinglesigKeys passed separately.
 *   2. PSBT extraction — sendBegin/sendBeginBatch return {"psbt":"<base64>"},
 *      createUtxosBegin returns a plain base64 string.
 *   3. Expiration timestamp — blindReceive/witnessReceive convert durationSeconds
 *      to an absolute unix timestamp before passing to rgb-lib.
 */
// @ts-nocheck - Jest mock types don't fully align with dynamic imports
import { jest } from '@jest/globals';

// ─── Shared mock wallet instance ──────────────────────────────────────────────

const mockWallet = {
  goOnline: jest.fn().mockReturnValue({ id: 'online' }),
  getAddress: jest.fn().mockReturnValue('tb1ptest'),
  rotateVanillaAddress: jest.fn().mockReturnValue('tb1pnew'),
  rotateColoredAddress: jest.fn().mockReturnValue('tb1pnewcol'),
  getBtcBalance: jest.fn().mockReturnValue({ vanilla: {}, colored: {} }),
  listUnspents: jest.fn().mockReturnValue([]),
  createUtxosBegin: jest.fn(),
  createUtxosEnd: jest.fn().mockReturnValue(1),
  sendBegin: jest.fn(),
  sendEnd: jest.fn().mockReturnValue({ txid: 'abc', batchTransferIdx: 0 }),
  blindReceive: jest.fn(),
  witnessReceive: jest.fn(),
  getAssetBalance: jest
    .fn()
    .mockReturnValue({ settled: 0, future: 0, spendable: 0 }),
  listAssets: jest.fn().mockReturnValue({ nia: [], uda: [], cfa: [], ifa: [] }),
  listTransactions: jest.fn().mockReturnValue([]),
  listTransfers: jest.fn().mockReturnValue([]),
  failTransfers: jest.fn().mockReturnValue(true),
  deleteTransfers: jest.fn().mockReturnValue(true),
  refresh: jest.fn(),
  sync: jest.fn(),
  backup: jest.fn(),
  drop: jest.fn(),
  issueAssetNIA: jest.fn(),
};

const MockWalletClass = jest.fn().mockImplementation(() => mockWallet);
const MockWalletData = jest.fn().mockImplementation((d) => d);
const MockSinglesigKeys = jest.fn().mockImplementation((k) => k);
const MockInvoice = jest.fn().mockImplementation(() => ({
  invoiceData: jest
    .fn()
    .mockReturnValue({ recipientId: 'r1', transportEndpoints: [] }),
  drop: jest.fn(),
}));

await jest.unstable_mockModule('@utexo/rgb-lib', () => ({
  default: {
    DatabaseType: { Sqlite: 'Sqlite' },
    AssetSchema: { Cfa: 'Cfa', Nia: 'Nia', Uda: 'Uda' },
    BitcoinNetwork: {
      Mainnet: 'Mainnet',
      Testnet: 'Testnet',
      Testnet4: 'Testnet4',
      Signet: 'Signet',
      Regtest: 'Regtest',
    },
    Wallet: MockWalletClass,
    WalletData: MockWalletData,
    SinglesigKeys: MockSinglesigKeys,
    Invoice: MockInvoice,
    dropOnline: jest.fn(),
  },
}));

await jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
  },
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

const { NodeRgbLibBinding } = await import('../src/binding/NodeRgbLibBinding');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLAIN_PSBT =
  'cHNidP8BAP01AQIAAAABlMj9TfomLhMCT7H5tYcY0WkzknYqH+33Lr0ZlXUr+iEAAAAAAP3///8L6AMAAAAAAAAiUSA=';

const WRAPPED_PSBT = JSON.stringify({ psbt: PLAIN_PSBT });

const defaultParams = {
  xpubVan: 'tpubVAN',
  xpubCol: 'tpubCOL',
  masterFingerprint: 'aabbccdd',
  dataDir: '/tmp/test-wallet',
  network: 'testnet',
};

function makeBinding(overrides: Partial<typeof defaultParams> = {}) {
  return new NodeRgbLibBinding({ ...defaultParams, ...overrides });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NodeRgbLibBinding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply defaults after clearAllMocks
    mockWallet.goOnline.mockReturnValue({ id: 'online' });
    MockWalletClass.mockImplementation(() => mockWallet);
    MockWalletData.mockImplementation((d) => d);
    MockSinglesigKeys.mockImplementation((k) => k);
  });

  // ─── 1. Constructor — walletData / SinglesigKeys split ──────────────────────

  describe('constructor: WalletData and SinglesigKeys split', () => {
    it('passes only data fields to WalletData (no xpubs or fingerprint)', () => {
      makeBinding();

      const walletDataArg = MockWalletData.mock.calls[0][0];
      expect(walletDataArg).toHaveProperty('dataDir');
      expect(walletDataArg).toHaveProperty('bitcoinNetwork');
      expect(walletDataArg).toHaveProperty('databaseType');
      expect(walletDataArg).toHaveProperty('maxAllocationsPerUtxo');
      expect(walletDataArg).toHaveProperty('supportedSchemas');

      // These must NOT appear in walletData anymore
      expect(walletDataArg).not.toHaveProperty('accountXpubVanilla');
      expect(walletDataArg).not.toHaveProperty('accountXpubColored');
      expect(walletDataArg).not.toHaveProperty('masterFingerprint');
      expect(walletDataArg).not.toHaveProperty('vanillaKeychain');
    });

    it('passes key fields to SinglesigKeys', () => {
      makeBinding({ vanillaKeychain: 1 } as any);

      const keysArg = MockSinglesigKeys.mock.calls[0][0];
      expect(keysArg).toHaveProperty('accountXpubVanilla', 'tpubVAN');
      expect(keysArg).toHaveProperty('accountXpubColored', 'tpubCOL');
      expect(keysArg).toHaveProperty('masterFingerprint', 'aabbccdd');
      expect(keysArg).toHaveProperty('vanillaKeychain', '1');
    });

    it('passes Wallet constructor both walletData and singlesigKeys', () => {
      makeBinding();

      expect(MockWalletClass).toHaveBeenCalledTimes(1);
      expect(MockWalletClass.mock.calls[0]).toHaveLength(2);
    });

    it('defaults vanillaKeychain to "0" when not provided', () => {
      makeBinding();

      const keysArg = MockSinglesigKeys.mock.calls[0][0];
      expect(keysArg.vanillaKeychain).toBe('0');
    });

    it('passes null for vanillaKeychain when explicitly set to null', () => {
      makeBinding({ vanillaKeychain: null } as any);

      const keysArg = MockSinglesigKeys.mock.calls[0][0];
      expect(keysArg.vanillaKeychain).toBeNull();
    });

    it('includes reuseAddresses: true in walletData when set', () => {
      makeBinding({ reuseAddresses: true } as any);

      const walletDataArg = MockWalletData.mock.calls[0][0];
      expect(walletDataArg.reuseAddresses).toBe(true);
    });

    it('defaults reuseAddresses to false in walletData', () => {
      makeBinding();

      const walletDataArg = MockWalletData.mock.calls[0][0];
      expect(walletDataArg.reuseAddresses).toBe(false);
    });
  });

  // ─── reuseAddresses: rotate address methods ──────────────────────────────────

  describe('rotateVanillaAddress', () => {
    it('delegates to wallet.rotateVanillaAddress and returns the new address', async () => {
      mockWallet.rotateVanillaAddress.mockReturnValue('tb1pnewvanilla');

      const binding = makeBinding();
      const address = await binding.rotateVanillaAddress();

      expect(mockWallet.rotateVanillaAddress).toHaveBeenCalledTimes(1);
      expect(address).toBe('tb1pnewvanilla');
    });

    it('returns a different address each call (simulates rotation)', async () => {
      mockWallet.rotateVanillaAddress
        .mockReturnValueOnce('tb1pfirst')
        .mockReturnValueOnce('tb1psecond');

      const binding = makeBinding();
      const first = await binding.rotateVanillaAddress();
      const second = await binding.rotateVanillaAddress();

      expect(first).toBe('tb1pfirst');
      expect(second).toBe('tb1psecond');
      expect(first).not.toBe(second);
    });
  });

  describe('rotateColoredAddress', () => {
    it('delegates to wallet.rotateColoredAddress and returns the new address', async () => {
      mockWallet.rotateColoredAddress.mockReturnValue('tb1pnewcolored');

      const binding = makeBinding();
      const address = await binding.rotateColoredAddress();

      expect(mockWallet.rotateColoredAddress).toHaveBeenCalledTimes(1);
      expect(address).toBe('tb1pnewcolored');
    });

    it('does not call rotateVanillaAddress when rotating colored', async () => {
      const binding = makeBinding();
      await binding.rotateColoredAddress();

      expect(mockWallet.rotateVanillaAddress).not.toHaveBeenCalled();
    });
  });

  // ─── 2. PSBT extraction ────────────────────────────────────────────────────

  describe('createUtxosBegin: handles plain base64 PSBT', () => {
    it('returns the plain base64 string directly', async () => {
      mockWallet.goOnline.mockReturnValue({ id: 'online' });
      mockWallet.createUtxosBegin.mockReturnValue(PLAIN_PSBT);

      const binding = makeBinding();
      const result = await binding.createUtxosBegin({ feeRate: 2 });

      expect(result).toBe(PLAIN_PSBT);
    });

    it('still extracts psbt from JSON-wrapped result if rgb-lib changes behaviour', async () => {
      mockWallet.goOnline.mockReturnValue({ id: 'online' });
      mockWallet.createUtxosBegin.mockReturnValue(WRAPPED_PSBT);

      const binding = makeBinding();
      const result = await binding.createUtxosBegin({ feeRate: 2 });

      expect(result).toBe(PLAIN_PSBT);
    });
  });

  describe('sendBegin: extracts psbt from JSON-wrapped result', () => {
    beforeEach(() => {
      mockWallet.goOnline.mockReturnValue({ id: 'online' });
      MockInvoice.mockImplementation(() => ({
        invoiceData: jest.fn().mockReturnValue({
          recipientId: 'sb:wvout:abc',
          transportEndpoints: ['rpcs://rgb-proxy.example.com/json-rpc'],
        }),
        drop: jest.fn(),
      }));
    });

    it('returns the inner base64 psbt when rgb-lib wraps result in JSON', async () => {
      mockWallet.sendBegin.mockReturnValue(WRAPPED_PSBT);

      const binding = makeBinding();
      const result = await binding.sendBegin({
        invoice: 'rgb:~/~/abc',
        assetId: 'rgb:asset1',
        amount: 10,
      });

      expect(result).toBe(PLAIN_PSBT);
    });

    it('returns the plain base64 unchanged when rgb-lib returns it directly', async () => {
      mockWallet.sendBegin.mockReturnValue(PLAIN_PSBT);

      const binding = makeBinding();
      const result = await binding.sendBegin({
        invoice: 'rgb:~/~/abc',
        assetId: 'rgb:asset1',
        amount: 10,
      });

      expect(result).toBe(PLAIN_PSBT);
    });

    it('passes null and false as expirationTimestamp and dryRun', async () => {
      mockWallet.sendBegin.mockReturnValue(PLAIN_PSBT);

      const binding = makeBinding();
      await binding.sendBegin({
        invoice: 'rgb:~/~/abc',
        assetId: 'rgb:asset1',
        amount: 10,
        feeRate: 3,
        minConfirmations: 1,
      });

      const args = mockWallet.sendBegin.mock.calls[0];
      // sendBegin(online, recipientMap, donation, feeRate, minConfirmations, expirationTimestamp, dryRun)
      expect(args[5]).toBeNull(); // expirationTimestamp
      expect(args[6]).toBe(false); // dryRun
    });
  });

  describe('sendBeginBatch: extracts psbt from JSON-wrapped result', () => {
    const recipientMap = {
      'rgb:asset1': [
        {
          recipientId: 'sb:wvout:abc',
          witnessData: null,
          assignment: { Fungible: 10 },
          transportEndpoints: ['rpcs://rgb-proxy.example.com/json-rpc'],
        },
      ],
    };

    it('returns the inner base64 psbt when rgb-lib wraps result in JSON', async () => {
      mockWallet.goOnline.mockReturnValue({ id: 'online' });
      mockWallet.sendBegin.mockReturnValue(WRAPPED_PSBT);

      const binding = makeBinding();
      const result = await binding.sendBeginBatch({ recipientMap });

      expect(result).toBe(PLAIN_PSBT);
    });

    it('passes null and false as expirationTimestamp and dryRun', async () => {
      mockWallet.goOnline.mockReturnValue({ id: 'online' });
      mockWallet.sendBegin.mockReturnValue(PLAIN_PSBT);

      const binding = makeBinding();
      await binding.sendBeginBatch({ recipientMap, feeRate: 5 });

      const args = mockWallet.sendBegin.mock.calls[0];
      expect(args[5]).toBeNull();
      expect(args[6]).toBe(false);
    });
  });

  // ─── 3. Expiration timestamp in blindReceive / witnessReceive ───────────────

  describe('blindReceive: passes absolute expiration timestamp', () => {
    beforeEach(() => {
      mockWallet.goOnline.mockReturnValue({ id: 'online' });
      mockWallet.blindReceive.mockReturnValue({
        invoice: 'rgb:~/~/inv',
        recipientId: 'r1',
        expirationTimestamp: 9999,
        batchTransferIdx: 0,
      });
    });

    it('converts durationSeconds to an absolute unix timestamp', async () => {
      const before = Math.floor(Date.now() / 1000);

      const binding = makeBinding();
      await binding.blindReceive({ amount: 10, durationSeconds: 3600 });

      const after = Math.floor(Date.now() / 1000);
      const passedExpiry = Number(mockWallet.blindReceive.mock.calls[0][2]);

      expect(passedExpiry).toBeGreaterThanOrEqual(before + 3600);
      expect(passedExpiry).toBeLessThanOrEqual(after + 3600);
    });

    it('defaults durationSeconds to 2000 when not provided', async () => {
      const before = Math.floor(Date.now() / 1000);

      const binding = makeBinding();
      await binding.blindReceive({ amount: 10 });

      const after = Math.floor(Date.now() / 1000);
      const passedExpiry = Number(mockWallet.blindReceive.mock.calls[0][2]);

      expect(passedExpiry).toBeGreaterThanOrEqual(before + 2000);
      expect(passedExpiry).toBeLessThanOrEqual(after + 2000);
    });

    it('passes expiration as a string (rgb-lib u64 convention)', async () => {
      const binding = makeBinding();
      await binding.blindReceive({ amount: 10, durationSeconds: 1000 });

      const passedExpiry = mockWallet.blindReceive.mock.calls[0][2];
      expect(typeof passedExpiry).toBe('string');
    });

    it('returns invoice data from the raw result', async () => {
      const binding = makeBinding();
      const result = await binding.blindReceive({ amount: 10 });

      expect(result.invoice).toBe('rgb:~/~/inv');
      expect(result.recipientId).toBe('r1');
      expect(result.expirationTimestamp).toBe(9999);
    });
  });

  describe('witnessReceive: passes absolute expiration timestamp', () => {
    beforeEach(() => {
      mockWallet.goOnline.mockReturnValue({ id: 'online' });
      mockWallet.witnessReceive.mockReturnValue({
        invoice: 'rgb:~/~/witness-inv',
        recipientId: 'r2',
        expirationTimestamp: 8888,
        batchTransferIdx: 1,
      });
    });

    it('converts durationSeconds to an absolute unix timestamp', async () => {
      const before = Math.floor(Date.now() / 1000);

      const binding = makeBinding();
      await binding.witnessReceive({ amount: 5, durationSeconds: 7200 });

      const after = Math.floor(Date.now() / 1000);
      const passedExpiry = Number(mockWallet.witnessReceive.mock.calls[0][2]);

      expect(passedExpiry).toBeGreaterThanOrEqual(before + 7200);
      expect(passedExpiry).toBeLessThanOrEqual(after + 7200);
    });

    it('defaults durationSeconds to 2000 when not provided', async () => {
      const before = Math.floor(Date.now() / 1000);

      const binding = makeBinding();
      await binding.witnessReceive({ amount: 5 });

      const after = Math.floor(Date.now() / 1000);
      const passedExpiry = Number(mockWallet.witnessReceive.mock.calls[0][2]);

      expect(passedExpiry).toBeGreaterThanOrEqual(before + 2000);
      expect(passedExpiry).toBeLessThanOrEqual(after + 2000);
    });

    it('passes expiration as a string (rgb-lib u64 convention)', async () => {
      const binding = makeBinding();
      await binding.witnessReceive({ amount: 5, durationSeconds: 1000 });

      const passedExpiry = mockWallet.witnessReceive.mock.calls[0][2];
      expect(typeof passedExpiry).toBe('string');
    });

    it('returns invoice data from the raw result', async () => {
      const binding = makeBinding();
      const result = await binding.witnessReceive({ amount: 5 });

      expect(result.invoice).toBe('rgb:~/~/witness-inv');
      expect(result.recipientId).toBe('r2');
      expect(result.expirationTimestamp).toBe(8888);
    });
  });
});
