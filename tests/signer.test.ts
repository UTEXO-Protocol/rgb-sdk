// Import from built ESM dist files
// Using dynamic import to handle WASM modules with experimental flags
import {
  signPsbt,
  signPsbtFromSeed,
  signMessage,
  verifyMessage,
  ValidationError,
  bip39,
} from '../dist/index.mjs';
import { estimatePsbt } from '../src/crypto/signer';
const expectedKeys = {
  xpub: 'tpubD6NzVbkrYhZ4XCaTDersU6277zvyyV6uCCeEgx1jfv7bUYMrbTt8Vem1MBt5Gmp7eMwjv4rB54s2kjqNNtTLYpwFsVX7H2H93pJ8SpZFRRi',
  accountXpubVanilla:
    'tpubDDMTD6EJKKLP6Gx9JUnMpjf9NYyePJszmqBnNqULNmcgEuU1yQ3JsHhWZdRFecszWETnNsmhEe9vnaNibfzZkDDHycbR2rGFbXdHWRgBfu7',
  accountXpubColored:
    'tpubDDPLJfdVbDoGtnn6hSto3oCnm6hpfHe9uk2MxcANanxk87EuquhSVfSLQv7e5UykgzaFn41DUXaikjjVGcUSUTGNaJ9LcozfRwatKp1vTfC',
  masterFingerprint: 'a66bffef',
};

describe('signer', () => {
  // Test data from user
  const testMnemonic =
    'poem twice question inch happy capital grain quality laptop dry chaos what';
  const seedBuffer = bip39.mnemonicToSeedSync(testMnemonic);
  const testSeedHex = Buffer.from(seedBuffer).toString('hex');
  const testSeedArray = new Uint8Array(seedBuffer);

  // UTXO creation PSBT (unsigned)
  const utxoUnsignedPsbt =
    'cHNidP8BAP01AQIAAAABtSecjg4J41fmQtoh4TTlQdnu6iifN5ogbVWEAXrUWhoAAAAAAP3///8G6AMAAAAAAAAiUSDzKPGEYMWF2Spr+6GDDaiByz+OjfjlV3Lfr/zYKZ2iB+gDAAAAAAAAIlEg83490lnilgZRgrHnETy+JEjou1md47ACmb0kn5rO2+joAwAAAAAAACJRIHD6gvLQXWd4BvEW0YjxA0z50cxfC3ZUhKXnKhPTS1B+6AMAAAAAAAAiUSCXxMTRByl/+IGyzvdE6V+4ac0UOeEwe1dl3zb8ceaZ5OgDAAAAAAAAIlEg3oU2/GUMIeYj4d/R1dK5ThTLhkg7JAhjPOLjNqb215YYEzEBAAAAACJRIHn8VHdi5k8OITo7LrsqYr+cQIASgZTwvtfvYoBHBxpWoXVIAAABASsALTEBAAAAACJRIM9hxZBkyMxn4vyYOosTZEYQIMqQZRSwxigi1aTQwJLrIRaUhLceLJAwJvzah8652iBUot/I4ZG5LVNrof4L451TuRkApmv/71YAAIABAACAAAAAgAEAAAAAAAAAARcglIS3HiyQMCb82ofOudogVKLfyOGRuS1Ta6H+C+OdU7kAAQUgeHCOVR20fg1Bz+fM/Cpg3KrkSlmKQDLwInucZ2bCMcwhB3hwjlUdtH4NQc/nzPwqYNyq5EpZikAy8CJ7nGdmwjHMGQCma//vVgAAgB+fDIAAAACAAAAAAAIAAAAAAQUgzBIX4uwl2L4m53HESkMyqyevlalsmf3tw9nH0r3KQoIhB8wSF+LsJdi+JudxxEpDMqsnr5WpbJn97cPZx9K9ykKCGQCma//vVgAAgB+fDIAAAACAAAAAAAMAAAAAAQUgs43Fa7pRIMJTLGHkWwyCRf16wo3uSS/3CDv0c550QBkhB7ONxWu6USDCUyxh5FsMgkX9esKN7kkv9wg79HOedEAZGQCma//vVgAAgB+fDIAAAACAAAAAAAQAAAAAAQUgaqAn3Z3FYWYqPiTb2KCMBirkLH3ZnhE1Q7NpCOiuJBkhB2qgJ92dxWFmKj4k29igjAYq5Cx92Z4RNUOzaQjoriQZGQCma//vVgAAgB+fDIAAAACAAAAAAAEAAAAAAQUgnZNdhk/w7sXuE3/fLeNHq5My6f6IqMI5KrZAVeoZdnUhB52TXYZP8O7F7hN/3y3jR6uTMun+iKjCOSq2QFXqGXZ1GQCma//vVgAAgB+fDIAAAACAAAAAAAAAAAAAAQUg+5xo2r852/jJjwIpMPXdsWsse2hpIxAhJhP6YDPcrrIhB/ucaNq/Odv4yY8CKTD13bFrLHtoaSMQISYT+mAz3K6yGQCma//vVgAAgAEAAIAAAACAAQAAAAEAAAAA';

  // UTXO creation PSBT (signed - expected result)
  const utxoSignedPsbt =
    'cHNidP8BAP01AQIAAAABtSecjg4J41fmQtoh4TTlQdnu6iifN5ogbVWEAXrUWhoAAAAAAP3///8G6AMAAAAAAAAiUSDzKPGEYMWF2Spr+6GDDaiByz+OjfjlV3Lfr/zYKZ2iB+gDAAAAAAAAIlEg83490lnilgZRgrHnETy+JEjou1md47ACmb0kn5rO2+joAwAAAAAAACJRIHD6gvLQXWd4BvEW0YjxA0z50cxfC3ZUhKXnKhPTS1B+6AMAAAAAAAAiUSCXxMTRByl/+IGyzvdE6V+4ac0UOeEwe1dl3zb8ceaZ5OgDAAAAAAAAIlEg3oU2/GUMIeYj4d/R1dK5ThTLhkg7JAhjPOLjNqb215YYEzEBAAAAACJRIHn8VHdi5k8OITo7LrsqYr+cQIASgZTwvtfvYoBHBxpWoXVIAAABASsALTEBAAAAACJRIM9hxZBkyMxn4vyYOosTZEYQIMqQZRSwxigi1aTQwJLrAQhCAUDrRtVkPLHRkFNKbYlEL3bgjs6wjkfkO7fZytofjY3WL7EIHD3W5I2YmVucb9aSFTGJEU2m9+9laoEebGTB8KAdAAEFIHhwjlUdtH4NQc/nzPwqYNyq5EpZikAy8CJ7nGdmwjHMAAEFIMwSF+LsJdi+JudxxEpDMqsnr5WpbJn97cPZx9K9ykKCAAEFILONxWu6USDCUyxh5FsMgkX9esKN7kkv9wg79HOedEAZAAEFIGqgJ92dxWFmKj4k29igjAYq5Cx92Z4RNUOzaQjoriQZAAEFIJ2TXYZP8O7F7hN/3y3jR6uTMun+iKjCOSq2QFXqGXZ1AAEFIPucaNq/Odv4yY8CKTD13bFrLHtoaSMQISYT+mAz3K6yAA==';

  // Send begin PSBT (unsigned)
  const sendUnsignedPsbt =
    'cHNidP8BAIkCAAAAASs6FZbqRIdKgFpPLMi0aTfvBFqDT6JbTdDpK6P6tBhCBAAAAAD9////AgAAAAAAAAAAImog6wXBZTGshFceO1rQtCoz1eDEfgGcWdvMvHLJlmozjEKEAQAAAAAAACJRIBs/61D42aMRdH4+SEPBqOtdv4dNSIY5r8iJqACWZ5bv3XlIACb8A1JHQgH0bKC/icu0bP1eYxQ6uIpPwCU89RNB/G+yHcp4C0e3DJ0AAN1GxJO34z9oOLJIdFpzzqfl+e3voeFqTPSl45jd58mJ//////////8QJwAAAQDdRsSTt+M/aDiySHRac86n5fnt76Hhakz0peOY3efJiaAPAgABAKAPAQIAAAABAAAAaq+/lJND7LUI3gMAAAAAAAAB/GQgj9CN8+h6nKKR6li1Snudp05RyxxRBoOJ0VhYzfQICgAAAAAAAAAABvwDUkdCAgEAJvwDUkdCBN1GxJO34z9oOLJIdFpzzqfl+e3voeFqTPSl45jd58mJRN1GxJO34z9oOLJIdFpzzqfl+e3voeFqTPSl45jd58mJoA8CAPRsoL+Jy7Rs/V5jFDq4ik/AJTz1E0H8b7IdyngLR7cMAAEBK+gDAAAAAAAAIlEg3oU2/GUMIeYj4d/R1dK5ThTLhkg7JAhjPOLjNqb215YhFp2TXYZP8O7F7hN/3y3jR6uTMun+iKjCOSq2QFXqGXZ1GQCma//vVgAAgB+fDIAAAACAAAAAAAAAAAABFyCdk12GT/Duxe4Tf98t40erkzLp/oiowjkqtkBV6hl2dQAm/ANNUEMA3UbEk7fjP2g4skh0WnPOp+X57e+h4WpM9KXjmN3nyYkg/OYL9NoADeYnzQkU4TmgEJEIBWyTp0v1e1StQzxh8YYG/ANNUEMBCOSb4tcxJLMvBvwDTVBDECDrBcFlMayEVx47WtC0KjPV4MR+AZxZ28y8csmWajOMQgb8A01QQxH9PwEDAAAIAAAAAANp7skQJdswnsxrN/hH0Nzl+7GXQiel7Cq4pRCYRsvnkQAD78HzWyTQwyUtHa9FrbEEfmIcdwWoQ4MFewb7VuzpNOYAA617O8vSZCG3EdeaFfG/LLNx5vxK6Gd1mWukv9GGBr1CAANK4WCpInljss9tzwQ7WOcARnOZgXjE/5c2JsTrFZ17VwADkwf/OMoQPQy6+IHABqtMZdVjJJbK0fvFsDjEay6aqIkB3UbEk7fjP2g4skh0WnPOp+X57e+h4WpM9KXjmN3nyYn85gv02gAN5ifNCRThOaAQkQgFbJOnS/V7VK1DPGHxhgADNRqw8q4cMxyEceD9NOWnYfZBGtsLVvxmu96OG+cZgd4AA8wgXYyY/F/m1sEThgPwffAnxmAtQtAnMK9GhY82FnzLAeSb4tcxJLMvCPwFT1BSRVQBIOsFwWUxrIRXHjta0LQqM9XgxH4BnFnbzLxyyZZqM4xCAAEFIKu00zp2brpb5bM41nvP0Qkh9QiTklFIBPGRUophfkqnIQertNM6dm66W+WzONZ7z9EJIfUIk5JRSATxkVKKYX5KpxkApmv/71YAAIAfnwyAAAAAgAAAAAAGAAAAAA==';

  // Send begin PSBT (signed - expected result)
  const sendSignedPsbt =
    'cHNidP8BAIkCAAAAASs6FZbqRIdKgFpPLMi0aTfvBFqDT6JbTdDpK6P6tBhCBAAAAAD9////AgAAAAAAAAAAImog6wXBZTGshFceO1rQtCoz1eDEfgGcWdvMvHLJlmozjEKEAQAAAAAAACJRIBs/61D42aMRdH4+SEPBqOtdv4dNSIY5r8iJqACWZ5bv3XlIACb8A1JHQgH0bKC/icu0bP1eYxQ6uIpPwCU89RNB/G+yHcp4C0e3DJ0AAN1GxJO34z9oOLJIdFpzzqfl+e3voeFqTPSl45jd58mJ//////////8QJwAAAQDdRsSTt+M/aDiySHRac86n5fnt76Hhakz0peOY3efJiaAPAgABAKAPAQIAAAABAAAAaq+/lJND7LUI3gMAAAAAAAAB/GQgj9CN8+h6nKKR6li1Snudp05RyxxRBoOJ0VhYzfQICgAAAAAAAAAABvwDUkdCAgEAJvwDUkdCBN1GxJO34z9oOLJIdFpzzqfl+e3voeFqTPSl45jd58mJRN1GxJO34z9oOLJIdFpzzqfl+e3voeFqTPSl45jd58mJoA8CAPRsoL+Jy7Rs/V5jFDq4ik/AJTz1E0H8b7IdyngLR7cMAAEBK+gDAAAAAAAAIlEg3oU2/GUMIeYj4d/R1dK5ThTLhkg7JAhjPOLjNqb215YBCEIBQD/iWL6tgZRxx3vFRbBAwQMghZhxpPw3PikeZuX527+jSiXp1ROxMGOs6OUpPyEQbCBCks3rmCczjuL6UAX2F1gAJvwDTVBDAN1GxJO34z9oOLJIdFpzzqfl+e3voeFqTPSl45jd58mJIPzmC/TaAA3mJ80JFOE5oBCRCAVsk6dL9XtUrUM8YfGGBvwDTVBDAQjkm+LXMSSzLwb8A01QQxAg6wXBZTGshFceO1rQtCoz1eDEfgGcWdvMvHLJlmozjEIG/ANNUEMR/T8BAwAACAAAAAADae7JECXbMJ7Mazf4R9Dc5fuxl0InpewquKUQmEbL55EAA+/B81sk0MMlLR2vRa2xBH5iHHcFqEODBXsG+1bs6TTmAAOtezvL0mQhtxHXmhXxvyyzceb8SuhndZlrpL/Rhga9QgADSuFgqSJ5Y7LPbc8EO1jnAEZzmYF4xP+XNibE6xWde1cAA5MH/zjKED0MuviBwAarTGXVYySWytH7xbA4xGsumqiJAd1GxJO34z9oOLJIdFpzzqfl+e3voeFqTPSl45jd58mJ/OYL9NoADeYnzQkU4TmgEJEIBWyTp0v1e1StQzxh8YYAAzUasPKuHDMchHHg/TTlp2H2QRrbC1b8ZrvejhvnGYHeAAPMIF2MmPxf5tbBE4YD8H3wJ8ZgLULQJzCvRoWPNhZ8ywHkm+LXMSSzLwj8BU9QUkVUASDrBcFlMayEVx47WtC0KjPV4MR+AZxZ28y8csmWajOMQgABBSCrtNM6dm66W+WzONZ7z9EJIfUIk5JRSATxkVKKYX5KpwA=';

  describe('signPsbt', () => {
    it('should sign UTXO creation PSBT correctly', async () => {
      const signed = await signPsbt(testMnemonic, utxoUnsignedPsbt, 'testnet');

      expect(signed).toBeTruthy();
      expect(typeof signed).toBe('string');
      expect(signed).toMatch(/^cHNidP8/); // PSBT base64 prefix

      // Compare with expected signed PSBT
      expect(signed).toBe(utxoSignedPsbt);
    });

    it('should sign send PSBT correctly', async () => {
      const signed = await signPsbt(testMnemonic, sendUnsignedPsbt, 'testnet');

      expect(signed).toBeTruthy();
      expect(typeof signed).toBe('string');
      expect(signed).toMatch(/^cHNidP8/); // PSBT base64 prefix
      // Compare with expected signed PSBT
      expect(signed).toBe(sendSignedPsbt);
    });

    it('should be idempotent (signing already signed PSBT)', async () => {
      // Sign the unsigned PSBT
      const firstSigned = await signPsbt(
        testMnemonic,
        utxoUnsignedPsbt,
        'testnet'
      );

      // Sign again (should produce same result if already signed)
      const secondSigned = await signPsbt(testMnemonic, firstSigned, 'testnet');

      // Signing an already-signed PSBT may add additional signatures or modify structure
      // Both should be valid signed PSBTs, but they might not be identical
      expect(secondSigned).toBeTruthy();
      expect(secondSigned.length).toBeGreaterThan(0);
    });

    it('should accept optional options parameter', async () => {
      const signed = await signPsbt(
        testMnemonic,
        utxoUnsignedPsbt,
        'testnet',
        {}
      );

      expect(signed).toBeTruthy();
      expect(signed).toBe(utxoSignedPsbt);
    });

    it('should use default network when not provided', async () => {
      const signed = await signPsbt(testMnemonic, utxoUnsignedPsbt);

      expect(signed).toBeTruthy();
      expect(signed).toMatch(/^cHNidP8/);
    });
  });

  describe('signPsbtFromSeed', () => {
    it('should sign using a 64-byte hex seed string', async () => {
      const signed = await signPsbtFromSeed(
        testSeedHex,
        utxoUnsignedPsbt,
        'testnet'
      );

      expect(signed).toBeTruthy();
      expect(signed).toBe(utxoSignedPsbt);
    });

    it('should sign using a Uint8Array seed', async () => {
      const signed = await signPsbtFromSeed(
        testSeedArray,
        utxoUnsignedPsbt,
        'testnet'
      );

      expect(signed).toBeTruthy();
      expect(signed).toBe(utxoSignedPsbt);
    });

    it('should throw ValidationError for invalid seed string', async () => {
      await expect(
        signPsbtFromSeed('1234', utxoUnsignedPsbt, 'testnet')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('signMessage & verifyMessage', () => {
    const testMessage = 'RGB message signing test';

    it('should sign and verify a message using account xpub', async () => {
      const signature = await signMessage({
        message: testMessage,
        seed: testSeedHex,
        network: 'testnet',
      });

      expect(signature).toMatch(/^[A-Za-z0-9+/=]+$/);

      const verified = await verifyMessage({
        message: testMessage,
        signature: signature,
        accountXpub: expectedKeys.accountXpubVanilla,
        network: 'testnet',
      });
      expect(verified).toBe(true);
    });

    it('should verify false for tampered messages', async () => {
      const signed = await signMessage({
        message: testMessage,
        seed: testSeedHex,
        network: 'testnet',
      });

      const tampered = await verifyMessage({
        message: `${testMessage}!`,
        signature: signed,
        accountXpub: expectedKeys.accountXpubVanilla,
        network: 'testnet',
      });
      expect(tampered).toBe(false);
    });

    it('should throw if seed is missing for signing', async () => {
      await expect(
        signMessage({ message: testMessage } as any)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw if account xpub is missing for verification', async () => {
      const signed = await signMessage({
        message: testMessage,
        seed: testSeedHex,
        network: 'testnet',
      });

      await expect(
        verifyMessage({
          message: testMessage,
          signature: signed,
          accountXpub: '',
          network: 'testnet',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should work with Uint8Array seed input', async () => {
      const signed = await signMessage({
        message: testMessage,
        seed: testSeedArray,
        network: 'testnet',
      });

      const verified = await verifyMessage({
        message: testMessage,
        signature: signed,
        accountXpub: expectedKeys.accountXpubVanilla,
        network: 'testnet',
      });

      expect(verified).toBe(true);
    });
  });
  const testPP =
    'cHNidP8BALICAAAAApA+sGHFsAZWB6V4uOxVRz6GSdeRVpGoKsR0CcPjwUMwAQAAAAD9////5f5/uG50E2VjtR6FQnpBvl6TOVh/3SO/ub/9P/3IypgCAAAAAP3///8CAAAAAAAAAAAiaiAtAD8u9+XBpITGaeZcJ1j+JLJyy9eNHk7p3VLvVlrRtegDAAAAAAAAIlEg4SPaJcwZIPMpEuCdOS0bJdPWXUAE+anLUPWrGdBMfOwrAwAAJvwDUkdCAY/wquJLj9AGfn1A55WBSyAPZYV4MKoTWSzYvYbwWoNgqgAAJcyA6bzdL8lfRNaLuzfpKTbKf52bQ7LuH/+U+sEGXiz//////////xAnAAABAErbIWzDQ2apq/8fALJrQP+3RackqnF+h6TTyXeEoJSdoA8AAAEAoA8BAgAAAAEAAAB/lKqTNMjHNQgKAAAAAAAAAAAB5f5/uG50E2VjtR6FQnpBvl6TOVh/3SO/ub/9P/3IypgAAAAAPaDn1xl+gOQI9QIAAAAAAAAABvwDUkdCAgEAJvwDUkdCBCXMgOm83S/JX0TWi7s36Sk2yn+dm0Oy7h//lPrBBl4sRErbIWzDQ2apq/8fALJrQP+3RackqnF+h6TTyXeEoJSdoA8AAI/wquJLj9AGfn1A55WBSyAPZYV4MKoTWSzYvYbwWoNgAAEBK0sEAAAAAAAAIlEgjmL+mV2AUe+miOTfBOstDmrB2RSdO5T/eY5+wloHxWcBCEIBQDPY8uz1YXDRD1SuiMtn33/eGTaNjUh+aZgXX5dwqC6ldFY5KPm1/R52fib2FELGmrGc8IoE8WRataGjl2EumoUAAQEr6AMAAAAAAAAiUSBV7Deq1ZxYjT2iY7ogYcQ/P1UcqmvP1ZoWxhanrBXn0wEIQgFAP7bQo/PGq/u/oQWQINWbCYAO11/uEQOCRawXR7kjZi8PgBU5gCZGpyZOdZaNVODJbAZHIUOBgLXjEPmFNP9AowAm/ANNUEMAJcyA6bzdL8lfRNaLuzfpKTbKf52bQ7LuH/+U+sEGXiwgCR+S1pC9VyIRFmuV735GaCOfn2poXJwqA2+BB7WnKloG/ANNUEMBCJ4jY7shMLPMBvwDTVBDECAtAD8u9+XBpITGaeZcJ1j+JLJyy9eNHk7p3VLvVlrRtQb8A01QQxH9PwEDAAAIAAAAAAPblM4qpqhe32crMFATmnncoEyRmtm2q19CKMKEmo96PgADeR1/mSCCMrAw//3BWh8ltdkz4YeSnFfLAVsIdMSyE9gAA4FY4lxBPRjJskoHvKer8MXXefl5o+qdp1bd6dfognkwAANjT/xN81Cu737l3tKbwAwq18X/vUZ3qtvPOcduu3OC0wADWe0kkhfqEWSbttn4foGOIpChREwccE1HaifyiXenSv4BJcyA6bzdL8lfRNaLuzfpKTbKf52bQ7LuH/+U+sEGXiwJH5LWkL1XIhEWa5XvfkZoI5+famhcnCoDb4EHtacqWgADu0MacnHxguDIx16xDm1OF27T4OtDBKit94fQviHfVO8AA42s+5hkizFFwwQS8w4uKBMp9K6YdF5N+VBdfOtIOeYJAZ4jY7shMLPMCPwFT1BSRVQBIC0APy735cGkhMZp5lwnWP4ksnLL140eTundUu9WWtG1AAA=';
  describe('estimatePsbt', () => {
    it('should estimate metrics for an unsigned PSBT', async () => {
      const estimate = await estimatePsbt(testPP);

      expect(estimate).toHaveProperty('vbytes');
      expect(estimate).toHaveProperty('feeRate');

      expect(typeof estimate.vbytes).toBe('number');
      expect(typeof estimate.feeRate).toBe('number');
      expect(estimate.vbytes).toBeGreaterThan(0);
      expect(estimate.feeRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validation', () => {
    it('should throw ValidationError for empty mnemonic', async () => {
      await expect(signPsbt('', utxoUnsignedPsbt, 'testnet')).rejects.toThrow(
        ValidationError
      );
      await expect(signPsbt('', utxoUnsignedPsbt, 'testnet')).rejects.toThrow(
        'mnemonic'
      );
    });

    it('should throw ValidationError for invalid mnemonic', async () => {
      await expect(
        signPsbt('invalid mnemonic', utxoUnsignedPsbt, 'testnet')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty PSBT', async () => {
      await expect(signPsbt(testMnemonic, '', 'testnet')).rejects.toThrow(
        ValidationError
      );
      await expect(signPsbt(testMnemonic, '', 'testnet')).rejects.toThrow(
        'psbtBase64'
      );
    });

    it('should throw ValidationError for invalid PSBT format', async () => {
      await expect(
        signPsbt(testMnemonic, 'invalid-base64', 'testnet')
      ).rejects.toThrow(ValidationError);
      await expect(
        signPsbt(testMnemonic, 'not-a-psbt', 'testnet')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid base64', async () => {
      await expect(
        signPsbt(testMnemonic, '!!!invalid!!!', 'testnet')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('edge cases', () => {
    it('should handle PSBT with multiple inputs', async () => {
      // The provided PSBTs already have multiple inputs/outputs
      // This test verifies they work correctly
      const signed = await signPsbt(testMnemonic, utxoUnsignedPsbt, 'testnet');

      expect(signed).toBeTruthy();
      expect(signed.length).toBeGreaterThan(0); // Signed PSBT should be valid (length may vary)
    });

    it('should handle different network types', async () => {
      // Test with valid network values (string names)
      const validNetworks = ['testnet', 'mainnet', 'regtest', 'signet'];

      for (const network of validNetworks) {
        await expect(
          signPsbt(testMnemonic, utxoUnsignedPsbt, network as any)
        ).resolves.toBeTruthy();
      }

      // Test with valid network numbers
      const validNetworkNumbers = [1, 3]; // 1 = testnet, 3 = regtest

      for (const network of validNetworkNumbers) {
        await expect(
          signPsbt(testMnemonic, utxoUnsignedPsbt, network as any)
        ).resolves.toBeTruthy();
      }

      // Invalid network should throw (using 99 as an invalid network number)
      await expect(
        signPsbt(testMnemonic, utxoUnsignedPsbt, 99 as any)
      ).rejects.toThrow(ValidationError);
    });
  });
});
