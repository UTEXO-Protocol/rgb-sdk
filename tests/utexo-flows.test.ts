/**
 * UTEXOWallet flow structure tests.
 * Verifies that UTEXOWallet exposes onchain and lightning flow methods.
 * These tests do NOT require network/bridge – they validate API shape only.
 */
import { UTEXOWallet } from '../dist/index.mjs';

describe('UTEXOWallet flows', () => {

  describe('onchain flow API', () => {
    it('UTEXOWallet should have onchainReceive method', () => {
      expect(typeof UTEXOWallet.prototype.onchainReceive).toBe('function');
    });

    it('UTEXOWallet should have onchainSend method', () => {
      expect(typeof UTEXOWallet.prototype.onchainSend).toBe('function');
    });

    it('UTEXOWallet should have onchainSendBegin method', () => {
      expect(typeof UTEXOWallet.prototype.onchainSendBegin).toBe('function');
    });

    it('UTEXOWallet should have onchainSendEnd method', () => {
      expect(typeof UTEXOWallet.prototype.onchainSendEnd).toBe('function');
    });

    it('UTEXOWallet should have getOnchainSendStatus method', () => {
      expect(typeof UTEXOWallet.prototype.getOnchainSendStatus).toBe('function');
    });
  });

  describe('lightning flow API', () => {
    it('UTEXOWallet should have createLightningInvoice method', () => {
      expect(typeof UTEXOWallet.prototype.createLightningInvoice).toBe('function');
    });

    it('UTEXOWallet should have payLightningInvoice method', () => {
      expect(typeof UTEXOWallet.prototype.payLightningInvoice).toBe('function');
    });

    it('UTEXOWallet should have payLightningInvoiceBegin method', () => {
      expect(typeof UTEXOWallet.prototype.payLightningInvoiceBegin).toBe('function');
    });

    it('UTEXOWallet should have payLightningInvoiceEnd method', () => {
      expect(typeof UTEXOWallet.prototype.payLightningInvoiceEnd).toBe('function');
    });

    it('UTEXOWallet should have getLightningSendRequest method', () => {
      expect(typeof UTEXOWallet.prototype.getLightningSendRequest).toBe('function');
    });

    it('UTEXOWallet should have getLightningReceiveRequest method', () => {
      expect(typeof UTEXOWallet.prototype.getLightningReceiveRequest).toBe('function');
    });
  });

});
