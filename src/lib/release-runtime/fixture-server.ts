/** Local-only no-supplier integration adapter. Never imported by the app. */
import http from "node:http";
import { releaseIdentity, accountKey, releaseError } from "./identity";
import { routeAgentToOwner, observeReleaseRequest } from "./http";
import { startAgentActivity, endAgentActivity, type AgentActivity } from "./agent-activity";
import { releasePool, releaseStatus } from "./store";
import { GET as status } from "../../app/api/internal/release/status/route";
import { POST as control } from "../../app/api/internal/release/control/route";
import { detachBackgroundActivity, bindBackgroundClaim } from "./background-activity";

const runs = new Map<string, { activity: AgentActivity; steer: number }>();
const background = new Map<string, () => void>();
async function dispatch(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/internal/release/status") return status(request);
  if (url.pathname === "/api/internal/release/control") return control(request);
  return observeReleaseRequest(request, async () => {
    const token = request.headers.get("authorization");
    const email = token === "Bearer fixture-a" ? "a@example.test" : token === "Bearer fixture-b" ? "b@example.test" : null;
    if (!email) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const body = ["POST", "PUT", "PATCH"].includes(request.method) ? await request.json() : undefined;
    if (url.pathname === "/api/background") {
      const key = body?.key || url.searchParams.get("key");
      if (request.method === "POST") {
        await detachBackgroundActivity("reference-text", key, "claim", async () => {
          await bindBackgroundClaim(key, "original-business-lease-token");
          await new Promise<void>((done) => background.set(key, done));
          background.delete(key);
        });
        return Response.json({ tickReturned: true });
      }
      if (request.method === "DELETE") background.get(key)?.();
      return Response.json({ pending: background.has(key) });
    }
    const session = body?.sessionId || url.searchParams.get("sessionId");
    const newRun = ["POST", "PUT"].includes(request.method);
    const forwarded = await routeAgentToOwner(request, email, session, "workbench", newRun, body);
    if (forwarded) return forwarded;
    const key = accountKey(email) + ":" + session;
    const current = runs.get(key);
    if (newRun) {
      if (current) return Response.json({ error: "RUNNING" }, { status: 409 });
      const activity = await startAgentActivity(email, session, false);
      if (!activity) throw Error("FIXTURE_RUNTIME_REQUIRED");
      runs.set(key, { activity, steer: 0 });
      if (request.method === "POST") return Response.json({ started: true, owner: releaseIdentity() });
      const encoder = new TextEncoder(); let timer: ReturnType<typeof setInterval>;
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode(`event: open\ndata: ${JSON.stringify({ owner: releaseIdentity() })}\n\n`)); timer = setInterval(() => { if (runs.has(key)) controller.enqueue(encoder.encode("event: delta\ndata: fixture\n\n")); else { clearInterval(timer); controller.close(); } }, 80); }, cancel() { clearInterval(timer); } });
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
    }
    if (!current) return Response.json({ error: "MISSING" }, { status: 404 });
    if (request.method === "DELETE") { await endAgentActivity(current.activity, true); runs.delete(key); return Response.json({ stopped: true, owner: releaseIdentity() }); }
    if (request.method === "PATCH") current.steer++;
    if (url.searchParams.get("stream") === "1") {
      const encoder = new TextEncoder(); let timer: ReturnType<typeof setInterval>;
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode("event: owner\ndata: fixture\n\n")); timer = setInterval(() => controller.enqueue(encoder.encode("event: delta\ndata: fixture\n\n")), 100); }, cancel() { clearInterval(timer); } }), { headers: { "content-type": "text/event-stream" } });
    }
    return Response.json({ running: true, steer: current.steer, owner: releaseIdentity() }, { headers: { "x-fixture-forward": request.headers.get("x-naumi-release-forward") || "", "x-fixture-signature": request.headers.get("x-naumi-release-signature") || "" } });
  });
}

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const controller = new AbortController();
  const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
  const request = new Request(`http://127.0.0.1:${process.env.PORT}${req.url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, signal: controller.signal });
  let response: Response; try { response = await dispatch(request); } catch (e) { response = releaseError(e); }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) { res.end(); return; }
  const reader = response.body.getReader(); let ended = false;
  res.on("close", () => { if (!ended) { controller.abort(); void reader.cancel().catch(() => undefined); } });
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); } } catch { /* disconnected fixture client */ }
  ended = true; res.end();
});
server.listen(Number(process.env.PORT), "127.0.0.1", async () => { await releaseStatus(); console.log(`FIXTURE_READY=${releaseIdentity().instanceId}`); });
process.on("SIGTERM", () => { server.close(); void releasePool().end().finally(() => process.exit(0)); });
