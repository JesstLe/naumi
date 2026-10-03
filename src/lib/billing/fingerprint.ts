import { createHash } from "node:crypto";
export function stableJson(value: unknown): string {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(x => stableJson(x) ?? "null").join(",")}]`;
    return `{${Object.keys(value).sort().filter(k => (value as Record<string, unknown>)[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
}
export function fingerprint(value: unknown): string { return createHash("sha256").update(stableJson(value)).digest("hex"); }
