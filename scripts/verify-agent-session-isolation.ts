import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";

/** Real handlers, PostgreSQL and runtime instances; no model/tool requests. */
async function main() {
  const baseline = process.argv.includes("--baseline");
  let upstreamCalls = 0;
  Object.assign(process.env, { NAUMI_MULTI_USER: "1", OPENAI_API_KEY: "fixture", AGENT_API_KEY: "fixture" });
  const fixture = await createModelFixture((_req, res) => { upstreamCalls++; res.writeHead(500); res.end("No provider requests allowed"); });
  process.env.PGOPTIONS = `-c search_path=${fixture.schemaName}`;
  process.env.AGENT_BASE_URL = fixture.origin + "/v1";
  process.env.INTERNAL_APP_ORIGIN = fixture.origin;
  delete process.env.NAUMI_ROUTER_MANAGEMENT_URL;
  const db = await import("../src/lib/db");
  const runtime = await import("../src/lib/agent/runtime");
  const workbench = await import("../src/app/api/agent/session/route");
  const control = await import("../src/app/api/agent/route");
  const canvasControl = await import("../src/app/api/canvas/assistant/control/route");
  const { canvasAgentHistory, canvasProjectSessionPrefix } = await import("../src/lib/agent/canvas-history");
  const { signUserSession } = await import("../src/lib/native-auth");
  const email = `session-isolation-${randomUUID()}@example.test`, other = `other-${randomUUID()}@example.test`;
  const wbId = "ag-" + randomUUID(), project = "tree:isolation-" + randomUUID(), otherProject = "tree:other-" + randomUUID();
  const cvId = canvasProjectSessionPrefix(project) + randomUUID(), cvOther = canvasProjectSessionPrefix(otherProject) + randomUUID();
  const cookie = "nv_user=" + signUserSession(email, Date.now()), otherCookie = "nv_user=" + signUserSession(other, Date.now());
  const messages = (name: string) => [{ role: "user", content: name + "用户消息" }, { role: "assistant", content: name + "独立回复" }];
  const request = (path: string, method = "GET", body?: unknown, auth = cookie) => new Request(fixture.origin + path, { method, headers: { cookie: auth, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const path = (id: string) => "/api/agent/session?id=" + encodeURIComponent(id);
  const canvasPath = (id: string, scope = project) => "/api/canvas/assistant?projectKey=" + encodeURIComponent(scope) + "&id=" + encodeURIComponent(id);
  try {
    await db.getOrCreateUser(email, "Isolation fixture");
    await db.getOrCreateUser(other, "Other isolation fixture");
    const seedCanvas = () => db.saveAgentSession(email, cvId, "画布独立历史", messages("画布"), [{ type: "canvas_turn", projectKey: project, anchorId: "", message: "画布用户消息", messageIndex: 0 }, { type: "agent_end" }, { type: "canvas_terminal", status: "completed" }]);
    await db.saveAgentSession(email, wbId, "工作台独立历史", messages("工作台"), []);
    await seedCanvas();
    await db.saveAgentSession(email, cvOther, "另一画布", messages("另一画布"), []);
    const listed = await (await workbench.GET(request("/api/agent/session"))).json();
    assert.deepEqual(listed.sessions.map((s: any) => s.id), [wbId]);
    assert.equal((await workbench.GET(request(path(cvId)))).status, 400);
    assert.equal((await workbench.POST(request("/api/agent/session", "POST", { id: cvId, messages: [] }))).status, 400);
    assert.equal((await workbench.PATCH(request("/api/agent/session", "PATCH", { id: cvId, title: "错误跨入口改名" }))).status, 400);
    const deletion = await workbench.DELETE(request(path(cvId), "DELETE"));
    assert.equal(deletion.status, baseline ? 200 : 400);
    assert.equal(!!await db.getAgentSession(email, cvId), !baseline);
    if (baseline) await seedCanvas(); // Restore only this disposable fixture record.
    for (const method of ["GET", "PATCH", "DELETE"]) {
      assert.equal((await canvasAgentHistory(request(canvasPath(wbId), method, method === "PATCH" ? { title: "错误入口" } : undefined))).status, 404);
      assert.equal((await canvasAgentHistory(request(canvasPath(cvOther), method, method === "PATCH" ? { title: "错误项目" } : undefined))).status, 404);
      // DELETE is idempotent even for a missing record owned by this account.
      assert.equal((await canvasAgentHistory(request(canvasPath(cvId), method, method === "PATCH" ? { title: "错误账号" } : undefined, otherCookie))).status, method === "DELETE" ? 200 : 404);
      assert.equal((await db.getAgentSession(email, cvId))?.title, "画布独立历史");
    }
    assert.equal((await workbench.GET(request(path(wbId), "GET", undefined, otherCookie))).status, 404);
    const wb = await runtime.getOrCreateSession(email, wbId, [], { cookie, authorization: "" }, "fixture-text");
    const cv = await runtime.getOrCreateSession(email, cvId, [], { cookie, authorization: "" }, "fixture-text");
    assert.notEqual(wb, cv); assert.notEqual(wb.agent, cv.agent); assert.notEqual(wb.events, cv.events);
    assert.notEqual(wb.agent.state.messages, cv.agent.state.messages);
    assert.equal((wb.agent.state.messages[0] as any).content, "工作台用户消息");
    assert.equal((cv.agent.state.messages[0] as any).content, "画布用户消息");
    assert.equal(runtime.getSession(other, wbId), null);
    wb.running = true; cv.running = true;
    assert.equal((await control.PATCH(request("/api/agent", "PATCH", { sessionId: wbId, message: "只调整工作台" }))).status, 200);
    assert.equal(wb.agent.hasQueuedMessages(), true); assert.equal(cv.agent.hasQueuedMessages(), false);
    wb.agent.clearAllQueues();
    assert.equal((await control.PATCH(request("/api/agent", "PATCH", { sessionId: cvId, message: "只调整画布" }))).status, 400);
    assert.equal((await canvasControl.POST(request("/api/canvas/assistant/control", "POST", { sessionId: cvId, projectKey:project, action:"steer", message: "只调整画布" }))).status, 200);
    assert.equal(cv.agent.hasQueuedMessages(), true); assert.equal(wb.agent.hasQueuedMessages(), false);
    cv.agent.clearAllQueues();
    let wbAborts = 0, cvAborts = 0;
    // Spy on cancel dispatch; no supplier stream is started by this test.
    wb.agent.abort = () => { wbAborts++; wb.running = false; };
    cv.agent.abort = () => { cvAborts++; cv.running = false; };
    assert.equal((await control.DELETE(request("/api/agent?sessionId=" + wbId, "DELETE", undefined, otherCookie))).status, 404);
    assert.equal((await control.DELETE(request("/api/agent?sessionId=" + wbId, "DELETE"))).status, 200);
    assert.equal(wbAborts, 1); assert.equal(cvAborts, 0); assert.equal(cv.running, true);
    assert.equal((await control.DELETE(request("/api/agent?sessionId=" + cvId, "DELETE"))).status, 400);
    assert.equal((await canvasControl.POST(request("/api/canvas/assistant/control", "POST", {sessionId:cvId,projectKey:project,action:"stop"}))).status,200);
    assert.equal(wbAborts, 1); assert.equal(cvAborts, 1);
    assert.equal((await workbench.PATCH(request("/api/agent/session", "PATCH", { id: wbId, title: "工作台改名" }))).status, 200);
    assert.equal((await db.getAgentSession(email, cvId))?.title, "画布独立历史");
    assert.equal((await canvasAgentHistory(request(canvasPath(cvId), "PATCH", { title: "画布改名" }))).status, 200);
    assert.equal((await db.getAgentSession(email, wbId))?.title, "工作台改名");
    assert.equal((await canvasAgentHistory(request(canvasPath(cvId), "DELETE"))).status, 200);
    assert.equal(await db.getAgentSession(email, cvId), null); assert.ok(await db.getAgentSession(email, wbId));
    assert.ok(await db.getAgentSession(email, cvOther)); assert.equal(runtime.getSession(email, wbId), wb);
    assert.equal((await workbench.DELETE(request(path(wbId), "DELETE"))).status, 200);
    assert.equal(await db.getAgentSession(email, wbId), null); assert.ok(await db.getAgentSession(email, cvOther));
    assert.equal(upstreamCalls, 0);
    console.log(baseline
      ? "BASELINE=PASS CROSS_ENTRY_DELETE=REPRODUCED STATUS=200 RUNTIME_INSTANCES=INDEPENDENT PROVIDER_CALLS=0"
      : "MODIFIED=PASS CROSS_ENTRY_DELETE=BLOCKED STATUS=400 HISTORY_CRUD=ISOLATED STEERING=ISOLATED STOP_DISPATCH=ISOLATED PROJECTS=ISOLATED ACCOUNTS=ISOLATED PROVIDER_CALLS=0");
  } finally {
    for (const id of [wbId, cvId]) { const s = runtime.getSession(email, id); if (s) s.running = false; runtime.removeRuntimeSession(email, id); }
    await db.getPool().end(); await fixture.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
