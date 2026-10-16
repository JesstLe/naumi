import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { accountKey, releaseError, releaseIdentity, releaseProcessRegistry, releaseRuntimeEnabled, releaseSecret, ReleaseRuntimeError } from "./identity";
import { beginObservedActivity, checkAdmission, consumeForwardNonce, finishActivity, heartbeatActivity, sessionOwner, unknownActivity } from "./store";

const FORWARDED = "x-naumi-release-forward";
const SIGNATURE = "x-naumi-release-signature";
const ALLOWED_PATHS = new Set(["/api/agent", "/api/canvas/assistant", "/api/canvas/assistant/control"]);
type ForwardClaim = { source: string; target: string; boot: string; account: string; session: string; kind: "canvas" | "workbench"; method: string; path: string; bodyHash: string; at: number; nonce: string };
function bodyBytes(body?: unknown) { return body === undefined ? "" : JSON.stringify(body); }
function bodyHash(body?: unknown) { return createHash("sha256").update(bodyBytes(body)).digest("hex"); }

export function releasePeers(): Map<string, URL> {
  let object: unknown;
  try { object = JSON.parse(process.env.NAUMI_RELEASE_PEERS || "{}"); } catch { throw new ReleaseRuntimeError("RELEASE_PEERS_INVALID"); }
  if (!object || Array.isArray(object) || typeof object !== "object") throw new ReleaseRuntimeError("RELEASE_PEERS_INVALID");
  const peers = new Map<string, URL>();
  for (const [id, value] of Object.entries(object)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(id) || typeof value !== "string") throw new ReleaseRuntimeError("RELEASE_PEERS_INVALID");
    let url: URL; try { url = new URL(value); } catch { throw new ReleaseRuntimeError("RELEASE_PEERS_INVALID"); }
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const privateIp = isIP(host) === 4 && /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) || host === "::1";
    const containerName = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(host) && !isIP(host);
    if (url.protocol !== "http:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !(privateIp || containerName)) throw new ReleaseRuntimeError("RELEASE_PEERS_NOT_PRIVATE");
    peers.set(id, url);
  }
  return peers;
}
function signature(encoded: string) { return createHmac("sha256", releaseSecret()).update(encoded).digest("hex"); }
async function verifyForward(request: Request, email: string, session: string, kind: "canvas" | "workbench", body?: unknown): Promise<boolean> {
  const encoded = request.headers.get(FORWARDED), supplied = request.headers.get(SIGNATURE);
  if (!encoded && !supplied) return false;
  if (!encoded || !supplied || encoded.length > 4096 || !/^[a-f0-9]{64}$/.test(supplied)) throw new ReleaseRuntimeError("RELEASE_FORWARD_FORGED", 403);
  const expected = signature(encoded);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) throw new ReleaseRuntimeError("RELEASE_FORWARD_FORGED", 403);
  let claim: ForwardClaim; try { claim = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw new ReleaseRuntimeError("RELEASE_FORWARD_INVALID", 400); }
  const identity = releaseIdentity(), url = new URL(request.url);
  if (!claim || claim.target !== identity.instanceId || !releasePeers().has(claim.source) || claim.source === identity.instanceId || claim.account !== accountKey(email) || claim.session !== session || claim.kind !== kind || claim.method !== request.method || claim.path !== url.pathname + url.search || claim.bodyHash !== bodyHash(body) || !Number.isSafeInteger(claim.at) || Math.abs(Date.now() - claim.at) > 30000 || !/^[a-f0-9-]{36}$/i.test(claim.nonce)) throw new ReleaseRuntimeError("RELEASE_FORWARD_INVALID", 403);
  if (claim.boot !== identity.bootId) throw new ReleaseRuntimeError("AGENT_OWNER_BOOT_UNAVAILABLE", 409);
  await consumeForwardNonce(claim.nonce);
  return true;
}

/** Called only after normal account/project authorization. Owner comes from PG,
 * never a client header; an unreachable owner never falls back to a new run. */
export async function routeAgentToOwner(request: Request, email: string, session: string, kind: "canvas" | "workbench", newRun: boolean, body?: unknown): Promise<Response | null> {
  if (!releaseRuntimeEnabled()) return null;
  try {
    const identity = releaseIdentity(), url = new URL(request.url);
    if (!ALLOWED_PATHS.has(url.pathname)) throw new ReleaseRuntimeError("RELEASE_FORWARD_PATH_INVALID", 400);
    const forwarded = await verifyForward(request, email, session, kind, body);
    const owner = await sessionOwner(email, session, kind);
    if (owner?.state === "unknown") throw new ReleaseRuntimeError("AGENT_OWNER_UNKNOWN", 409);
    // New turns may migrate an idle session using its already persisted history;
    // controls and retries for active work remain pinned to the original owner.
    const pinned = owner && (owner.state === "running" || !newRun);
    if (pinned && (owner.instance_id !== identity.instanceId || owner.boot_id !== identity.bootId)) {
      if (forwarded || owner.instance_id === identity.instanceId) throw new ReleaseRuntimeError("AGENT_OWNER_BOOT_UNAVAILABLE", 409);
      const peer = releasePeers().get(owner.instance_id);
      if (!peer) throw new ReleaseRuntimeError("AGENT_OWNER_NOT_ALLOWLISTED", 503);
      const claim: ForwardClaim = { source: identity.instanceId, target: owner.instance_id, boot: owner.boot_id, account: accountKey(email), session, kind, method: request.method, path: url.pathname + url.search, bodyHash: bodyHash(body), at: Date.now(), nonce: randomUUID() };
      const encoded = Buffer.from(JSON.stringify(claim)).toString("base64url"), headers = new Headers(request.headers);
      for (const name of ["host", "content-length", "connection", "transfer-encoding", "x-naumi-release-secret", "x-release-control-secret"]) headers.delete(name);
      headers.set(FORWARDED, encoded); headers.set(SIGNATURE, signature(encoded));
      if (body !== undefined) headers.set("content-type", "application/json");
      const target = new URL(claim.path, peer);
      // Exactly one dispatch: fetch errors/unknown acceptance are surfaced, not retried.
      const connection = new AbortController();
      const abort = () => connection.abort(request.signal.reason);
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) abort();
      const timeout = setTimeout(() => connection.abort(new Error("AGENT_OWNER_RESPONSE_TIMEOUT")), 15000); timeout.unref?.();
      let response: Response;
      try { response = await fetch(target, { method: request.method, headers, body: body === undefined ? undefined : bodyBytes(body), redirect: "manual", signal: connection.signal, cache: "no-store" }); }
      finally { clearTimeout(timeout); request.signal.removeEventListener("abort", abort); }
      // Keep downstream cancellation attached for the lifetime of the stream.
      if (request.signal.aborted) connection.abort(request.signal.reason);
      else request.signal.addEventListener("abort", () => connection.abort(request.signal.reason), { once: true });
      const output = new Headers(response.headers);
      for (const name of ["connection", "transfer-encoding", "content-length", "content-encoding"]) output.delete(name);
      output.set("Cache-Control", "no-store, no-transform"); output.set("X-Accel-Buffering", "no");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: output });
    }
    if (forwarded && (!owner || owner.boot_id !== identity.bootId || owner.instance_id !== identity.instanceId)) throw new ReleaseRuntimeError("RELEASE_FORWARD_OWNER_CHANGED", 409);
    if (pinned && owner.runtime_id !== releaseProcessRegistry().runtimeId) throw new ReleaseRuntimeError("AGENT_OWNER_RUNTIME_UNREACHABLE", 503);
    if (newRun) await checkAdmission();
    return null;
  } catch (error) { return releaseError(error); }
}

/** Durable route-local request observations, explicitly not application-wide.
 * Body completion/cancel closes request lease, not its background Agent lease. */
export async function observeReleaseRequest(request: Request, handler: () => Promise<Response>): Promise<Response> {
  if (!releaseRuntimeEnabled()) return handler();
  let id: string;
  try { id = await beginObservedActivity("request", `${request.method} ${new URL(request.url).pathname}`); }
  catch (e) { return releaseError(e); }
  let finished = false;
  const timer = setInterval(() => { void heartbeatActivity(id).catch(() => undefined); }, 10000); timer.unref?.();
  const finish = async (outcome: string) => {
    if (finished) return; finished = true; clearInterval(timer);
    await finishActivity(id, outcome).catch(() => unknownActivity(id, "request-finish-unconfirmed").catch(() => undefined));
  };
  try {
    const response = await handler();
    if (!response.body) { await finish("response-empty"); return response; }
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try { const part = await reader.read(); if (part.done) { await finish("response-complete"); controller.close(); } else controller.enqueue(part.value); }
        catch (e) { await finish("response-error"); controller.error(e); }
      },
      async cancel(reason) { try { await reader.cancel(reason); } finally { await finish("response-cancelled"); } },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (e) { await finish("handler-error"); if (e instanceof ReleaseRuntimeError) return releaseError(e); throw e; }
}

export async function transportObservation() {
  const identity = releaseIdentity();
  try {
    const response = await fetch("http://127.0.0.1:3002/status", { headers: { "x-release-control-secret": releaseSecret() }, signal: AbortSignal.timeout(1500), cache: "no-store", redirect: "error" });
    if (!response.ok) return { verified: false as const, reason: "preload-unavailable" };
    const data = await response.json();
    if (data.identity?.instanceId !== identity.instanceId || data.identity?.bootId !== identity.bootId || data.identity?.commit !== identity.commit || data.transport?.completeFromProcessStart !== true || data.transport?.accountingFault !== null && data.transport?.accountingFault !== false && data.transport?.accountingFault !== 0 || !Number.isSafeInteger(data.transport?.activeRequests) || data.transport.activeRequests < 0) return { verified: false as const, reason: "preload-identity-or-coverage-mismatch" };
    return { verified: true as const, transport: data.transport };
  } catch { return { verified: false as const, reason: "preload-unreachable" }; }
}
