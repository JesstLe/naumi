/** Real Agent runtime/PUT/GET/CAS with isolated PostgreSQL. The model event
 * source is in-process synthetic data; no model or charged tool is submitted. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  let network = 0, failures = 0;
  const fixture = await createModelFixture((_req, res) => { network++; res.writeHead(500); res.end("Unexpected model request"); });
  Object.assign(process.env, { PGOPTIONS: `-c search_path=${fixture.schemaName}`, NAUMI_MULTI_USER: "1", NAUMI_RELEASE_RUNTIME: "0", AGENT_MODEL: "fixture-text", AGENT_API_KEY: "fixture-no-network", OPENAI_API_KEY: "fixture-no-network", AGENT_BASE_URL: fixture.origin + "/v1", INTERNAL_APP_ORIGIN: fixture.origin });
  const db = await import("../src/lib/db"), runtime = await import("../src/lib/agent/runtime"), api = await import("../src/app/api/agent/route");
  const { signUserSession } = await import("../src/lib/native-auth"), { createAssistantMessageEventStream } = await import("@earendil-works/pi-ai");
  const email = `streams-${randomUUID()}@example.test`, cookie = "nv_user=" + signUserSession(email, Date.now());
  const ids: string[] = [], release: (() => void)[] = [];
  const check = (ok: boolean, name: string, facts: object) => { console.log(JSON.stringify({ check: name, pass: ok, ...facts })); if (!ok) failures++; };
  const put = (id: string) => api.PUT(new Request(fixture.origin + "/api/agent", { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ sessionId: id, message: "请保留用户原文和既有参考，只回答文字，不调用工具" }) }));
  const waitFor = async (fn: () => boolean) => { const end = Date.now() + 10000; while (!fn()) { if (Date.now() > end) throw Error("Fixture wait timed out"); await new Promise(resolve => setTimeout(resolve, 5)); } };
  try {
    await db.getOrCreateUser(email, "Agent streams fixture");
    const id = "ag-" + randomUUID(); ids.push(id);
    const session = await runtime.getOrCreateSession(email, id, [], { cookie, authorization: "" }, "fixture-text");
    let started = 0, aborts = 0;
    session.agent.streamFunction = (model, _context, options) => {
      started++;
      const stream = createAssistantMessageEventStream();
      const message: any = { role: "assistant", api: model.api, provider: "fixture", model: model.id, content: [{ type: "text", text: "held synthetic response" }], stopReason: "aborted", timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      const onAbort = () => { aborts++; };
      options?.signal?.addEventListener("abort", onAbort, { once: true });
      stream.push({ type: "start", partial: message });
      release.push(() => { options?.signal?.removeEventListener("abort", onAbort); stream.push({ type: "error", reason: "aborted", error: message }); });
      return stream;
    };
    const response = await put(id); assert.equal(response.status, 200);
    await waitFor(() => started === 1);
    await response.body!.cancel();
    const pending = session.running;
    const retry = await put(id);
    check(pending && retry.status === 409 && started === 1 && aborts === 1, "actual-runtime-disconnect-admission", { runningAfterCancel: pending, retryStatus: retry.status, modelStarts: started, aborts });
    if (retry.status === 200) await retry.body!.cancel();
    for (const end of release) end();
    await waitFor(() => !session.agent.state.isStreaming && !session.running);
    await runtime.persistAgentSession(session);
    const saved = await db.getAgentSession(email, id);
    check(!!saved?.revision && session.persistedRevision === saved.revision && !session.onDelta, "actual-runtime-settles-with-CAS", { revisionMatches: session.persistedRevision === saved?.revision, running: session.running, callback: !!session.onDelta });

    const textId = "ag-" + randomUUID(); ids.push(textId);
    const textSession = await runtime.getOrCreateSession(email, textId, [], { cookie, authorization: "" }, "fixture-text");
    const text = "![".repeat(8192); // 16KiB; fixed and well below the existing 192KiB character cap.
    textSession.agent.streamFunction = model => {
      const stream = createAssistantMessageEventStream();
      const message: any = { role: "assistant", api: model.api, provider: "fixture", model: model.id, content: [{ type: "text", text }], stopReason: "stop", timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      queueMicrotask(() => { stream.push({ type: "start", partial: message }); stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message }); stream.push({ type: "done", reason: "stop", message }); });
      return stream;
    };
    const at = performance.now(), textResponse = await put(textId), wire = await textResponse.text();
    const elapsedMs = Math.round(performance.now() - at);
    await textSession.persistPending;
    const stored = await db.getAgentSession(email, textId);
    const frames = wire.split("\n\n").filter(frame => frame.startsWith("event:")).map(frame => ({ type: frame.split("\n")[0].slice(7), data: JSON.parse(frame.split("\ndata: ")[1]) }));
    const delta = frames.filter(frame => frame.type === "delta").map(frame => frame.data.text).join("");
    const final = frames.find(frame => frame.type === "final")?.data.reply;
    check(delta === text && final === text && (stored?.messages as any[])?.at(-1)?.content === text, "actual-runtime-markdown-to-SSE-and-persistence", { inputBytes: text.length, wireBytes: Buffer.byteLength(wire), deltaBytes: delta.length, finalBytes: final?.length, elapsedMs, persisted: (stored?.messages as any[])?.at(-1)?.content === text });
    check(network === 0, "no-provider-requests", { network });
  } finally {
    for (const end of release) end();
    for (const id of ids) { const session = runtime.getSession(email, id); await session?.persistPending?.catch(() => {}); if (session && !session.running) runtime.removeRuntimeSession(email, id); }
    await db.getPool().end(); await fixture.cleanup();
  }
  console.log(`CAPACITY_AGENT_RUNTIME failures=${failures} REAL_PG=1 REAL_RUNTIME=1 MODEL_SOURCE=SYNTHETIC SUPPLIER_CALLS=${network}`);
  process.exitCode = failures ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
