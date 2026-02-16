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