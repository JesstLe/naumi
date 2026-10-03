export function microsToDecimal(value: string): string { const digits = value.replace(/^0+(?=\d)/, "").padStart(7, "0"), whole = digits.slice(0, -6), fraction = digits.slice(-6).replace(/0+$/, ""); return fraction ? `${whole}.${fraction}` : whole; }
export function decimalToMicros(value: string): string | null { if (!/^\d{1,24}(\.\d{0,6})?$/.test(value))
    return null; const [whole, fraction = ""] = value.split("."); return (whole + fraction.padEnd(6, "0")).replace(/^0+(?=\d)/, ""); }
export function yuanToFen(value: string): number | null {
    if (!/^\d{1,10}(\.\d{0,2})?$/.test(value)) return null;
    const [whole, decimal = ""] = value.split(".");
    const fen = Number(BigInt(whole) * BigInt(100) + BigInt(decimal.padEnd(2, "0")));
    return fen <= 2147483647 ? fen : null;
}
