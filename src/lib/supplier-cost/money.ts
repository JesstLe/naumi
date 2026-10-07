/** Six decimal fixed-point amounts. All accounting arithmetic uses BigInt. */
export const MICRO = BigInt(1_000_000);
export function decimalMicros(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  const m = /^(\d{1,24})(?:\.(\d{0,24}))?(?:[eE]([+-]?\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const fraction = m[2] || "", exponent = Number(m[3] || 0);
  const shift = 6 + exponent - fraction.length;
  let amount = BigInt(m[1] + fraction);
  if (shift >= 0) amount *= BigInt("1" + "0".repeat(shift));
  else { const den = BigInt("1" + "0".repeat(-shift)); amount = (amount + den / BigInt(2)) / den; }
  return amount.toString().length <= 30 ? amount.toString() : null;
}
export function fixed(value: string | null | undefined) {
  if (value == null) return "待确认";
  const negative = value.startsWith("-");
  const digits = value.replace(/^-/, "").padStart(7, "0");
  const f = digits.slice(-6).replace(/0+$/, "");
  return `${negative ? "-" : ""}${digits.slice(0, -6)}${f ? "." + f : ""}`;
}
export function multiplyMicros(a: string, b: string) { return ((BigInt(a) * BigInt(b) + MICRO / BigInt(2)) / MICRO).toString(); }
export function abs(v: bigint) { return v < BigInt(0) ? -v : v; }

/** Preserve JSON numeric lexemes for money; never round raw provider amounts through IEEE floats. */
export function parseReceiptJson(text: string): any {
  let out = "", i = 0;
  while (i < text.length) {
    if (text[i] === '"') { const start = i++; while (i < text.length) { if (text[i] === "\\") { i += 2; continue; } if (text[i++] === '"') break; } out += text.slice(start, i); }
    else if (text[i] === "-" || /\d/.test(text[i])) { const m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i)); if (!m) throw new Error("invalid receipt JSON"); out += JSON.stringify(m[0]); i += m[0].length; }
    else out += text[i++];
  }
  return JSON.parse(out);
}
