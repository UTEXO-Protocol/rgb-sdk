/**
 * UTEXOWallet API structure tests.
 * Verifies that UTEXOWallet exposes all expected methods.
 */
import { UTEXOWallet } from '../dist/index.mjs';

const hasMethod = (name: string) =>
  it(`UTEXOWallet should have ${name} method`, () => {
    expect(typeof (UTEXOWallet.prototype as any)[name]).toBe('function');
  });

const hasAsyncMethod = (name: string) =>
  it(`UTEXOWallet ${name} should be async (return Promise)`, () => {
    const fn = (UTEXOWallet.prototype as any)[name];
    expect(typeof fn).toBe('function');
    expect(fn.constructor?.name).toBe('AsyncFunction');
  });

describe('UTEXOWallet API', () => {
  describe('core', () => {
    hasMethod('initialize');
    hasAsyncMethod('initialize');
    hasMethod('dispose');
    hasAsyncMethod('dispose');
    hasMethod('isDisposed');
    hasMethod('goOnline');
    hasAsyncMethod('goOnline');
  });

  describe('keys & network', () => {
    hasMethod('derivePublicKeys');
    hasMethod('getPubKeys');
    hasMethod('getXpub');
    hasMethod('getNetwork');
  });

  describe('balance & address', () => {
    hasMethod('getAddress');
    hasAsyncMethod('getAddress');
    hasMethod('getBtcBalance');
    hasAsyncMethod('getBtcBalance');
    hasMethod('listUnspents');
    hasAsyncMethod('listUnspents');
  });

  describe('UTXO management', () => {
    hasMethod('createUtxosBegin');
    hasMethod('createUtxosEnd');
    hasMethod('createUtxos');
  });

  describe('assets', () => {
    hasMethod('listAssets');
    hasMethod('getAssetBalance');
    hasMethod('issueAssetNia');
    hasMethod('issueAssetIfa');
    hasMethod('inflateBegin');
    hasMethod('inflateEnd');
    hasMethod('inflate');
  });

  describe('transfer', () => {
    hasMethod('sendBegin');
    hasAsyncMethod('sendBegin');
    hasMethod('sendEnd');
    hasMethod('send');
    hasMethod('sendBtcBegin');
    hasMethod('sendBtcEnd');
    hasMethod('sendBtc');
    hasMethod('blindReceive');
    hasAsyncMethod('blindReceive');
    hasMethod('witnessReceive');
    hasAsyncMethod('witnessReceive');
    hasMethod('decodeRGBInvoice');
    hasMethod('listTransfers');
    hasAsyncMethod('listTransfers');
    hasMethod('failTransfers');
  });

  describe('sync & transactions', () => {
    hasMethod('refreshWallet');
    hasAsyncMethod('refreshWallet');
    hasMethod('syncWallet');
    hasAsyncMethod('syncWallet');
    hasMethod('listTransactions');
    hasAsyncMethod('listTransactions');
  });

  describe('fee estimation', () => {
    hasMethod('estimateFeeRate');
    hasMethod('estimateFee');
  });

  describe('backup', () => {
    hasMethod('createBackup');
    hasMethod('configureVssBackup');
    hasMethod('disableVssAutoBackup');
    hasMethod('vssBackup');
    hasMethod('vssBackupInfo');
  });

  describe('signing', () => {
    hasMethod('signPsbt');
    hasMethod('signMessage');
    hasMethod('verifyMessage');
  });

  describe('onchain', () => {
    hasMethod('onchainReceive');
    hasMethod('onchainSendBegin');
    hasMethod('onchainSendEnd');
    hasMethod('onchainSend');
    hasMethod('getOnchainSendStatus');
    hasMethod('listOnchainTransfers');
  });

  describe('lightning', () => {
    hasMethod('createLightningInvoice');
    hasMethod('payLightningInvoiceBegin');
    hasMethod('payLightningInvoiceEnd');
    hasMethod('payLightningInvoice');
    hasMethod('getLightningSendRequest');
    hasMethod('getLightningReceiveRequest');
    hasMethod('listLightningPayments');
  });

  describe('other', () => {
    hasMethod('validateBalance');
  });
});
