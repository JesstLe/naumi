import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import process from "node:process";

export class ReleaseRuntimeError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code); }
}
export const releaseRuntimeEnabled = () => process.env.NAUMI_RELEASE_RUNTIME === "1";
export type ReleaseIdentity = { instanceId: string; bootId: string; commit: string; startedAt: string; bootSource: "preload" | "process-fallback" };
type ProcessRegistry = { identity: ReleaseIdentity; runtimeId: string; sessions: Map<string, unknown>; creating: Map<string, unknown> };
const registryKey = Symbol.for("naumi.release.agent-process-registry.v1");
const host = process as typeof process & { [registryKey]?: ProcessRegistry };

/** node:process rather than a route-module/globalThis singleton. DB leases remain
 * authoritative even if a Next worker/VM has a separate process registry. */
export function releaseProcessRegistry(): ProcessRegistry {
  if (!host[registryKey]) {
    const primary = (process.env.NAUMI_INSTANCE_ID || "").trim();
    const alias = (process.env.NAUMI_RELEASE_INSTANCE_ID || "").trim();
    const source = (process.env.SOURCE_COMMIT || "").trim();
    const release = (process.env.NAUMI_RELEASE_COMMIT || "").trim();
    if (releaseRuntimeEnabled() && (primary && alias && primary !== alias || source && release && source !== release)) throw new ReleaseRuntimeError("RELEASE_IDENTITY_CONFLICT");
    const instanceId = primary || alias || "unconfigured";
    const commit = source || release || "unknown";
    if (releaseRuntimeEnabled() && (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(instanceId) || instanceId === "unconfigured" || !/^[a-f0-9]{40}$/.test(commit))) throw new ReleaseRuntimeError("RELEASE_IDENTITY_INVALID");
    const supplied = process.env.NAUMI_RELEASE_BOOT_ID || "";
    const bootSource = supplied && process.env.NAUMI_RELEASE_BOOT_SOURCE === "preload" ? "preload" : "process-fallback";
    // A fixed environment UUID is not restart-safe. Trust only the preload's
    // explicit marker; fallback generates a fresh process identity and stays partial.
    const bootId = bootSource === "preload" ? supplied : randomUUID();
    if (!/^[a-f0-9-]{36}$/i.test(bootId)) throw new ReleaseRuntimeError("RELEASE_BOOT_ID_INVALID");
    host[registryKey] = { identity: { instanceId, bootId, commit, startedAt: new Date().toISOString(), bootSource }, runtimeId: randomUUID(), sessions: new Map(), creating: new Map() };
  }
  return host[registryKey]!;
}
export const releaseIdentity = () => releaseProcessRegistry().identity;
export const accountKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
export function releaseSecret(): string {
  const secret = process.env.RELEASE_CONTROL_SECRET || "";
  if (Buffer.byteLength(secret) < 32) throw new ReleaseRuntimeError("RELEASE_SECRET_UNCONFIGURED");
  return secret;
}
export function releaseControlAuthorized(request: Request): boolean {
  try {
    const expected = Buffer.from(releaseSecret()), supplied = Buffer.from(request.headers.get("x-release-control-secret") || request.headers.get("x-naumi-release-secret") || "");
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  } catch { return false; }
}
export function releaseError(error: unknown): Response {
  return Response.json({ error: error instanceof ReleaseRuntimeError ? error.code : "RELEASE_OBSERVATION_UNAVAILABLE", observation: "unknown" }, { status: error instanceof ReleaseRuntimeError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
