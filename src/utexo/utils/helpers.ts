const UTXO_PATH_INDEX = 2;

export function toUnitsNumber(value: string, precision: number) {
    const s = String(value).trim();
    const neg = s.startsWith("-");
    const [iRaw, fRaw = ""] = (neg ? s.slice(1) : s).split(".");
    const frac = (fRaw + "0".repeat(precision)).slice(0, precision);
  
    const unitsStr = (iRaw || "0") + frac;
    const units = Number(unitsStr);
  
    if (!Number.isSafeInteger(units)) {
      throw new Error(
        `Amount exceeds MAX_SAFE_INTEGER. Use BigInt instead. got=${unitsStr}`
      );
    }
  
    return neg ? -units : units;
  }

  export function fromUnitsNumber(units: number, precision: number) {
    const neg = units < 0;
    const base = 10 ** precision;
  
    const value = Math.abs(units) / base;
    return neg ? -value : value;
  }

  /**
   * Decodes a hex invoice from bridge transfer signature.
   * Handles hex strings that may start with '0x' prefix.
   * 
   * @param hexInvoice - Hex string from bridge transfer signature
   * @returns Decoded UTF-8 string invoice
   */
  export function decodeBridgeInvoice(hexInvoice: string): string {
    const hex = hexInvoice.startsWith('0x')
      ? hexInvoice.slice(UTXO_PATH_INDEX)
      : hexInvoice;
    return Buffer.from(hex, 'hex').toString('utf-8');
  }