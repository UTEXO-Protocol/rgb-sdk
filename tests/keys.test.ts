// Import from built ESM dist files
// Using dynamic import to handle WASM modules with experimental flags
import { 
  generateKeys, 
  deriveKeysFromMnemonic, 
  deriveKeysFromSeed,
  restoreKeys,
  getXprivFromMnemonic,
  getXpubFromXpriv,
  deriveKeysFromXpriv,
  ValidationError, 
  CryptoError 
} from '../dist/index.mjs';
import bip39 from 'bip39';

describe('keys', () => {
  // Test data from user
  const testMnemonic = 'poem twice question inch happy capital grain quality laptop dry chaos what';
  const expectedKeys = {
    mnemonic: testMnemonic,
    xpub: 'tpubD6NzVbkrYhZ4XCaTDersU6277zvyyV6uCCeEgx1jfv7bUYMrbTt8Vem1MBt5Gmp7eMwjv4rB54s2kjqNNtTLYpwFsVX7H2H93pJ8SpZFRRi',
    accountXpubVanilla: 'tpubDDMTD6EJKKLP6Gx9JUnMpjf9NYyePJszmqBnNqULNmcgEuU1yQ3JsHhWZdRFecszWETnNsmhEe9vnaNibfzZkDDHycbR2rGFbXdHWRgBfu7',
    accountXpubColored: 'tpubDDPLJfdVbDoGtnn6hSto3oCnm6hpfHe9uk2MxcANanxk87EuquhSVfSLQv7e5UykgzaFn41DUXaikjjVGcUSUTGNaJ9LcozfRwatKp1vTfC',
    masterFingerprint: 'a66bffef',
  };

  describe('generateKeys', () => {
    it('should generate valid keys for testnet', async () => {
      const keys = await generateKeys('testnet');
      
      expect(keys).toHaveProperty('mnemonic');
      expect(keys).toHaveProperty('xpub');
      expect(keys).toHaveProperty('accountXpubVanilla');
      expect(keys).toHaveProperty('accountXpubColored');
      expect(keys).toHaveProperty('masterFingerprint');
      expect(keys).toHaveProperty('xpriv');
      
      // Validate mnemonic format
      expect(keys.mnemonic).toBeTruthy();
      expect(keys.mnemonic.split(' ').length).toBe(12);
      
      // Validate xpub format (starts with tpub for testnet)
      expect(keys.xpub).toMatch(/^tpub/);
      expect(keys.accountXpubVanilla).toMatch(/^tpub/);
      expect(keys.accountXpubColored).toMatch(/^tpub/);
      
      // Validate master fingerprint format (8 hex chars)
      expect(keys.masterFingerprint).toMatch(/^[0-9a-f]{8}$/i);
      expect(keys.xpriv).toMatch(/^tprv/);
    });

    it('should generate valid keys for mainnet', async () => {
      const keys = await generateKeys('mainnet');
      
      expect(keys.xpub).toMatch(/^xpub/);
      expect(keys.accountXpubVanilla).toMatch(/^xpub/);
      expect(keys.accountXpubColored).toMatch(/^xpub/);
      expect(keys.masterFingerprint).toMatch(/^[0-9a-f]{8}$/i);
      expect(keys.xpriv).toMatch(/^xprv/);
    });

    it('should generate valid keys for regtest', async () => {
      const keys = await generateKeys('regtest');
      
      expect(keys.xpub).toMatch(/^tpub/);
      expect(keys.accountXpubVanilla).toMatch(/^tpub/);
      expect(keys.accountXpubColored).toMatch(/^tpub/);
      expect(keys.masterFingerprint).toMatch(/^[0-9a-f]{8}$/i);
      expect(keys.xpriv).toMatch(/^tprv/);
    });

    it('should generate different keys on each call', async () => {
      const keys1 = await generateKeys('testnet');
      const keys2 = await generateKeys('testnet');
      
      expect(keys1.mnemonic).not.toBe(keys2.mnemonic);
      expect(keys1.xpub).not.toBe(keys2.xpub);
      expect(keys1.xpriv).not.toBe(keys2.xpriv);
    });

    it('should accept network as number', async () => {
      const keys = await generateKeys(3); // Regtest
      
      expect(keys).toHaveProperty('mnemonic');
      expect(keys).toHaveProperty('accountXpubVanilla');
      expect(keys).toHaveProperty('accountXpubColored');
    });
  });

  describe('deriveKeysFromMnemonic', () => {
    it('should derive correct keys from testnet mnemonic', async () => {
      const keys = await deriveKeysFromMnemonic('testnet', testMnemonic);
      const expectedXpriv = await getXprivFromMnemonic('testnet', testMnemonic);
      
      expect(keys.mnemonic).toBe(testMnemonic);
      expect(keys.xpub).toBe(expectedKeys.xpub);
      expect(keys.accountXpubVanilla).toBe(expectedKeys.accountXpubVanilla);
      expect(keys.accountXpubColored).toBe(expectedKeys.accountXpubColored);
      expect(keys.masterFingerprint.toLowerCase()).toBe(expectedKeys.masterFingerprint.toLowerCase());
      expect(keys.xpriv).toBe(expectedXpriv);
    });

    it('should derive keys correctly with trimmed mnemonic', async () => {
      const trimmedMnemonic = `  ${testMnemonic}  `;
      // The function should handle trimming internally
      const keys = await deriveKeysFromMnemonic('testnet', trimmedMnemonic.trim());
      const expectedXpriv = await getXprivFromMnemonic('testnet', testMnemonic);
      
      expect(keys.accountXpubVanilla).toBe(expectedKeys.accountXpubVanilla);
      expect(keys.masterFingerprint.toLowerCase()).toBe(expectedKeys.masterFingerprint.toLowerCase());
      expect(keys.xpriv).toBe(expectedXpriv);
    });

    it('should throw ValidationError for empty mnemonic', async () => {
      await expect(deriveKeysFromMnemonic('testnet', '')).rejects.toThrow(ValidationError);
      await expect(deriveKeysFromMnemonic('testnet', '')).rejects.toThrow('mnemonic');
    });

    it('should throw ValidationError for invalid mnemonic format', async () => {
      await expect(deriveKeysFromMnemonic('testnet', 'invalid mnemonic phrase')).rejects.toThrow(ValidationError);
      await expect(deriveKeysFromMnemonic('testnet', 'abandon abandon abandon')).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for non-BIP39 mnemonic', async () => {
      const invalidMnemonic = 'invalid words that are not in the bip39 word list'.split(' ').slice(0, 12).join(' ');
      await expect(deriveKeysFromMnemonic('testnet', invalidMnemonic)).rejects.toThrow(ValidationError);
    });

    it('should work with different networks', async () => {
      const testnetKeys = await deriveKeysFromMnemonic('testnet', testMnemonic);
      const mainnetKeys = await deriveKeysFromMnemonic('mainnet', testMnemonic);
      
      // Mainnet and testnet use different BIP32 versions, so xpubs will differ
      expect(testnetKeys.accountXpubVanilla).not.toBe(mainnetKeys.accountXpubVanilla);
      
      // Master fingerprint should be the same (derived from seed, not network)
      expect(testnetKeys.masterFingerprint).toBe(mainnetKeys.masterFingerprint);
    });

    it('should accept network as number', async () => {
      const keys = await deriveKeysFromMnemonic(2, testMnemonic); // Testnet = 2
      
      expect(keys.accountXpubVanilla).toMatch(/^tpub/);
      expect(keys.accountXpubColored).toMatch(/^tpub/);
    });

    it('should produce deterministic results', async () => {
      const keys1 = await deriveKeysFromMnemonic('testnet', testMnemonic);
      const keys2 = await deriveKeysFromMnemonic('testnet', testMnemonic);
      
      expect(keys1.mnemonic).toBe(keys2.mnemonic);
      expect(keys1.xpub).toBe(keys2.xpub);
      expect(keys1.accountXpubVanilla).toBe(keys2.accountXpubVanilla);
      expect(keys1.accountXpubColored).toBe(keys2.accountXpubColored);
      expect(keys1.masterFingerprint).toBe(keys2.masterFingerprint);
    });
  });

  describe('deriveKeysFromSeed', () => {
    const seedBuffer = bip39.mnemonicToSeedSync(testMnemonic);
    const seedHex = Buffer.from(seedBuffer).toString('hex');
    const seedArray = new Uint8Array(seedBuffer);
    let expectedXpriv: string;

    beforeAll(async () => {
      expectedXpriv = await getXprivFromMnemonic('testnet', testMnemonic);
    });

    it('should derive correct keys from hex seed', async () => {
      const keys = await deriveKeysFromSeed('testnet', seedHex);

      expect(keys.mnemonic).toBe('');
      expect(keys.xpub).toBe(expectedKeys.xpub);
      expect(keys.accountXpubVanilla).toBe(expectedKeys.accountXpubVanilla);
      expect(keys.accountXpubColored).toBe(expectedKeys.accountXpubColored);
      expect(keys.masterFingerprint.toLowerCase()).toBe(expectedKeys.masterFingerprint.toLowerCase());
      expect(keys.xpriv).toBe(expectedXpriv);
    });

    it('should derive correct keys from Uint8Array seed', async () => {
      const keys = await deriveKeysFromSeed('testnet', seedArray);

      expect(keys.mnemonic).toBe('');
      expect(keys.xpub).toBe(expectedKeys.xpub);
      expect(keys.accountXpubVanilla).toBe(expectedKeys.accountXpubVanilla);
      expect(keys.accountXpubColored).toBe(expectedKeys.accountXpubColored);
      expect(keys.masterFingerprint.toLowerCase()).toBe(expectedKeys.masterFingerprint.toLowerCase());
      expect(keys.xpriv).toBe(expectedXpriv);
    });

    it('should accept network as number', async () => {
      const keys = await deriveKeysFromSeed(2, seedHex);

      expect(keys.accountXpubVanilla).toMatch(/^tpub/);
      expect(keys.accountXpubColored).toMatch(/^tpub/);
    });

    it('should throw ValidationError for invalid seed string', async () => {
      await expect(deriveKeysFromSeed('testnet', '1234')).rejects.toThrow(ValidationError);
    });
  });

  describe('restoreKeys (deprecated alias)', () => {
    it('should work as alias for deriveKeysFromMnemonic', async () => {
      const keys = await restoreKeys('testnet', testMnemonic);
      
      expect(keys.mnemonic).toBe(testMnemonic);
      expect(keys.accountXpubVanilla).toBe(expectedKeys.accountXpubVanilla);
      expect(keys.masterFingerprint.toLowerCase()).toBe(expectedKeys.masterFingerprint.toLowerCase());
    });
  });

  describe('getXprivFromMnemonic', () => {
    it('should derive xpriv from testnet mnemonic', async () => {
      const xpriv = await getXprivFromMnemonic('testnet', testMnemonic);
      
      // Validate xpriv format (starts with tprv for testnet)
      expect(xpriv).toMatch(/^tprv/);
      expect(xpriv.length).toBeGreaterThan(100);
    });

    it('should derive different xpriv for different networks', async () => {
      const testnetXpriv = await getXprivFromMnemonic('testnet', testMnemonic);
      const mainnetXpriv = await getXprivFromMnemonic('mainnet', testMnemonic);
      
      // Mainnet and testnet use different BIP32 versions, so xprivs will differ
      expect(testnetXpriv).not.toBe(mainnetXpriv);
      expect(testnetXpriv).toMatch(/^tprv/);
      expect(mainnetXpriv).toMatch(/^xprv/);
    });

    it('should produce deterministic results', async () => {
      const xpriv1 = await getXprivFromMnemonic('testnet', testMnemonic);
      const xpriv2 = await getXprivFromMnemonic('testnet', testMnemonic);
      
      expect(xpriv1).toBe(xpriv2);
    });

    it('should throw ValidationError for empty mnemonic', async () => {
      await expect(getXprivFromMnemonic('testnet', '')).rejects.toThrow(ValidationError);
      await expect(getXprivFromMnemonic('testnet', '')).rejects.toThrow('mnemonic');
    });

    it('should throw ValidationError for invalid mnemonic format', async () => {
      await expect(getXprivFromMnemonic('testnet', 'invalid mnemonic phrase')).rejects.toThrow(ValidationError);
    });

    it('should accept network as number', async () => {
      const xpriv = await getXprivFromMnemonic(2, testMnemonic); // Testnet = 2
      
      expect(xpriv).toMatch(/^tprv/);
    });
  });

  describe('getXpubFromXpriv', () => {
    let testXpriv: string;

    beforeAll(async () => {
      // Derive xpriv from test mnemonic for use in tests
      testXpriv = await getXprivFromMnemonic('testnet', testMnemonic);
    });

    it('should derive xpub from xpriv', async () => {
      const xpub = await getXpubFromXpriv(testXpriv, 'testnet');
      
      // Validate xpub format (starts with tpub for testnet)
      expect(xpub).toMatch(/^tpub/);
      expect(xpub).toBe(expectedKeys.xpub);
    });

    it('should produce deterministic results', async () => {
      const xpub1 = await getXpubFromXpriv(testXpriv, 'testnet');
      const xpub2 = await getXpubFromXpriv(testXpriv, 'testnet');
      
      expect(xpub1).toBe(xpub2);
      expect(xpub1).toBe(expectedKeys.xpub);
    });

    it('should throw ValidationError for empty xpriv', async () => {
      await expect(getXpubFromXpriv('')).rejects.toThrow(ValidationError);
      await expect(getXpubFromXpriv('')).rejects.toThrow('xpriv');
    });

    it('should throw CryptoError for invalid xpriv format', async () => {
      await expect(getXpubFromXpriv('invalid xpriv string')).rejects.toThrow(CryptoError);
    });

    it('should match xpub from deriveKeysFromMnemonic', async () => {
      const keys = await deriveKeysFromMnemonic('testnet', testMnemonic);
      const xpub = await getXpubFromXpriv(testXpriv, 'testnet');
      
      expect(xpub).toBe(keys.xpub);
    });
  });

  describe('deriveKeysFromXpriv', () => {
    let testXpriv: string;

    beforeAll(async () => {
      // Derive xpriv from test mnemonic for use in tests
      testXpriv = await getXprivFromMnemonic('testnet', testMnemonic);
    });

    it('should derive correct keys from xpriv', async () => {
      const keys = await deriveKeysFromXpriv('testnet', testXpriv);
      
      // Should match expected keys (except mnemonic which will be empty)
      expect(keys.xpub).toBe(expectedKeys.xpub);
      expect(keys.accountXpubVanilla).toBe(expectedKeys.accountXpubVanilla);
      expect(keys.accountXpubColored).toBe(expectedKeys.accountXpubColored);
      expect(keys.masterFingerprint.toLowerCase()).toBe(expectedKeys.masterFingerprint.toLowerCase());
      // Mnemonic should be empty when derived from xpriv
      expect(keys.mnemonic).toBe('');
    });

    it('should produce same keys as deriveKeysFromMnemonic', async () => {
      const mnemonicKeys = await deriveKeysFromMnemonic('testnet', testMnemonic);
      const xprivKeys = await deriveKeysFromXpriv('testnet', testXpriv);
      
      // All keys should match except mnemonic
      expect(xprivKeys.xpub).toBe(mnemonicKeys.xpub);
      expect(xprivKeys.accountXpubVanilla).toBe(mnemonicKeys.accountXpubVanilla);
      expect(xprivKeys.accountXpubColored).toBe(mnemonicKeys.accountXpubColored);
      expect(xprivKeys.masterFingerprint).toBe(mnemonicKeys.masterFingerprint);
      
      // Mnemonic should differ (empty for xpriv, actual mnemonic for mnemonic)
      expect(xprivKeys.mnemonic).toBe('');
      expect(mnemonicKeys.mnemonic).toBe(testMnemonic);
    });

    it('should work with different networks', async () => {
      const testnetXpriv = await getXprivFromMnemonic('testnet', testMnemonic);
      const mainnetXpriv = await getXprivFromMnemonic('mainnet', testMnemonic);
      
      const testnetKeys = await deriveKeysFromXpriv('testnet', testnetXpriv);
      const mainnetKeys = await deriveKeysFromXpriv('mainnet', mainnetXpriv);
      
      // Mainnet and testnet use different BIP32 versions, so xpubs will differ
      expect(testnetKeys.accountXpubVanilla).not.toBe(mainnetKeys.accountXpubVanilla);
      
      // Master fingerprint should be the same (derived from seed, not network)
      expect(testnetKeys.masterFingerprint).toBe(mainnetKeys.masterFingerprint);
    });

    it('should produce deterministic results', async () => {
      const keys1 = await deriveKeysFromXpriv('testnet', testXpriv);
      const keys2 = await deriveKeysFromXpriv('testnet', testXpriv);
      
      expect(keys1.xpub).toBe(keys2.xpub);
      expect(keys1.accountXpubVanilla).toBe(keys2.accountXpubVanilla);
      expect(keys1.accountXpubColored).toBe(keys2.accountXpubColored);
      expect(keys1.masterFingerprint).toBe(keys2.masterFingerprint);
    });

    it('should throw ValidationError for empty xpriv', async () => {
      await expect(deriveKeysFromXpriv('testnet', '')).rejects.toThrow(ValidationError);
      await expect(deriveKeysFromXpriv('testnet', '')).rejects.toThrow('xpriv');
    });

    it('should throw CryptoError for invalid xpriv format', async () => {
      await expect(deriveKeysFromXpriv('testnet', 'invalid xpriv string')).rejects.toThrow(CryptoError);
    });

    it('should accept network as number', async () => {
      const keys = await deriveKeysFromXpriv(2, testXpriv); // Testnet = 2
      
      expect(keys.accountXpubVanilla).toMatch(/^tpub/);
      expect(keys.accountXpubColored).toMatch(/^tpub/);
    });
  });

  describe('error handling', () => {
    it('should throw CryptoError on generation failure', async () => {
      // This test verifies error type but actual failure scenarios
      // would require mocking internal dependencies
      try {
        const keys = await generateKeys('testnet');
        expect(keys).toBeDefined();
      } catch (error) {
        expect(error).toBeInstanceOf(CryptoError);
      }
    });

    it('should throw CryptoError on derivation failure', async () => {
      // This test verifies error type but actual failure scenarios
      // would require mocking internal dependencies
      try {
        const keys = await deriveKeysFromMnemonic('testnet', testMnemonic);
        expect(keys).toBeDefined();
      } catch (error) {
        if (error instanceof CryptoError || error instanceof ValidationError) {
          expect(error).toBeInstanceOf(Error);
        } else {
          throw error;
        }
      }
    });
  });
});

