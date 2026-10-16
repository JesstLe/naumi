/** Local HTTP supplier + real Agent/PUT/POST/DB. No real model, image or paid-tool requests. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  let checks = 0, calls = 0, unexpected = 0;
  let mode: "questions" | "strategy" | "http-error" | "sse-error" = "questions";
  const providerRequests: any[] = [], serverErrors: Error[] = [], sessions: string[] = [];
  const questionText = "请补充三个关键事实：1. 品牌和茶饮产品是什么？2. 谁购买以及通过什么渠道购买？3. 价格与包装生产限制是什么？";
  const strategyText = "# 品牌包装创意策略\n\n一句话结论：让山间茶先被识别为低糖乌龙茶饮，再通过轻盈自然的品牌语言完成选择。\n\n## 信息层级\n正面先展示品牌与乌龙茶品类，第二层为口味，第三层为待确认的低糖表述。不得虚构检测、认证或市场结论。\n\n## 三个创意方向\n1. 茶源可溯：用原料来源信息建立信任。2. 通勤轻盈：用易读留白回应午后购买。3. 茶香直觉：用清晰风味标识强化口味辨识。\n\n## 唯一推荐与风险\n推荐通勤轻盈方向；执行风险是过度留白可能降低货架识别，需保持品类字号。\n\n## SKU 产品线规则\n统一品牌标志和信息网格，以口味名称及辅助色区分三种口味，未来增加口味时沿用结构。\n\n## 渠道适配\n便利店优先远距离品类识别，电商优先缩略图文字清晰。\n\n## 待确认与验证动作\n低糖检测待确认，不作功效卖点。使用实际尺寸打印和电商缩略图进行低成本识别测试。";
  const fixtureKey = "fixture-packaging-agent-key-0123456789abcdef";
  Object.assign(process.env, { NAUMI_MULTI_USER: "1", AGENT_MODEL: "fixture-packaging-text", AGENT_API_KEY: fixtureKey, OPENAI_API_KEY: fixtureKey, SETTINGS_SECRET: "fixture-packaging-settings-0123456789abcdef", MODEL_CONFIG_ENVELOPE_SECRET: "fixture-packaging-envelope-0123456789abcdef" });
  // This fixture deliberately tests legacy OpenAI-compatible transport. Never inherit a live router.
  delete process.env.NAUMI_ROUTER_MANAGEMENT_URL;
  delete process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN;
  const f = await createModelFixture(async (req, res) => {
    try {
      if (req.url !== "/v1/chat/completions" || req.method !== "POST") { unexpected++; res.writeHead(500); res.end("Unexpected fixture request"); return; }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); calls++; providerRequests.push(body);
      assert.equal(body.model, "fixture-packaging-text"); assert.equal(body.stream, true);
      assert.equal(body.messages.some((message: any) => Array.isArray(message.content) && message.content.some((part: any) => part.type === "image_url")), false);
      if (mode === "http-error") { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message: "fixture invalid request", type: "invalid_request_error" } })); return; }
      const frame = (delta: unknown, finish_reason: string | null = null) => "data: " + JSON.stringify({ id: "fixture-" + randomUUID(), object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] }) + "\n\n";
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(frame({ role: "assistant" }));
      if (mode === "sse-error") res.write(frame({}, "content_filter"));
      else { res.write(frame({ content: mode === "questions" ? questionText : strategyText })); res.write(frame({}, "stop")); }
      res.end("data: [DONE]\n\n");
    } catch (error) { serverErrors.push(error as Error); if (!res.headersSent) res.writeHead(500); res.end("Fixture assertion failed"); }
  });
  Object.assign(process.env, { PGOPTIONS: `-c search_path=${f.schemaName}`, AGENT_BASE_URL: f.origin + "/v1", INTERNAL_APP_ORIGIN: f.origin });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, f.origin, "Fixture may only contact its local mock supplier");
    return originalFetch(input, init);
  };
  const db = await import("../src/lib/db"), runtime = await import("../src/lib/agent/runtime"), agent = await import("../src/app/api/agent/route");
  const is = (value: unknown, expected: unknown) => { assert.equal(value, expected); checks++; };
  const ok = (value: unknown) => { assert.ok(value); checks++; };
  const owner = `packaging-agent-${randomUUID()}@example.test`, other = `packaging-agent-other-${randomUUID()}@example.test`;
  try {
    await db.getOrCreateUser(owner, "Packaging fixture"); await db.getOrCreateUser(other, "Other fixture");
    const { signUserSession } = await import("../src/lib/native-auth");
    const cookie = "nv_user=" + signUserSession(owner, Date.now());
    const source = process.env.NAUMI_SKILL_IMPORT_SOURCE || "skills/brand-packaging-strategy";
    const zip = new JSZip(), originals = new Map<string, string>();
    for (const path of ["SKILL.md", "references/brief-schema.md", "references/output-format.md", "agents/openai.yaml"]) {
      const content = await readFile(source + "/" + path, "utf8"); originals.set(path, content.replace(/\r\n?/g, "\n").trim()); zip.file("brand-packaging-strategy/" + path, content);
    }
    const form = new FormData(); form.set("file", new Blob([await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })]), "brand-packaging-strategy.zip");
    const imported = await (await import("../src/app/api/image-skills/import/route")).POST(new Request(f.origin + "/api/image-skills/import", { method: "POST", headers: { cookie }, body: form }));
    is(imported.status, 201); const skill = (await imported.json()).skill;
    is(skill.source, "personal"); is(skill.name, "品牌包装创意策略生成器");
    for (const path of ["SKILL.md", "references/brief-schema.md", "references/output-format.md"]) ok(skill.instructions.includes(originals.get(path)!));
    const selection = { id: skill.id, revision: skill.revision };
    const request = (method: string, id: string, message: string) => new Request(f.origin + "/api/agent", { method, headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ sessionId: id, message, skill: selection }) });
    const id = "ag-" + randomUUID(); sessions.push(id);
    const events = (raw: string) => [...raw.matchAll(/event: ([^\n]+)\ndata: ([^\n]+)/g)].map(match => ({ type: match[1], data: JSON.parse(match[2]) }));
    const runPut = async (sessionId: string, message: string) => {
      const response = await agent.PUT(request("PUT", sessionId, message)); is(response.status, 200);
      const result = events(await response.text());
      is(result.some(event => event.type === "tool_start"), false);
      const session = runtime.getSession(owner, sessionId); ok(session); if (session) await runtime.persistAgentSession(session);
      return result;
    };
    const incomplete = await runPut(id, "我想做茶饮包装。只收集最少关键事实，最多三个问题，不生成图片，不调用工具。");
    const missingFinal = incomplete.find(event => event.type === "final"); is(missingFinal?.data.reply, questionText);
    is(incomplete.some(event => event.type === "error"), false);
    const current = runtime.getSession(owner, id)!;
    const plan = current.events.find(event => event.type === "plan")?.data.items;
    ok(Array.isArray(plan) && !JSON.stringify(plan).includes("商品图") && !JSON.stringify(plan).includes("图片生成工具"));
    const prompt = JSON.stringify(providerRequests[0].messages);
    ok(prompt.includes("UNTRUSTED_DATA"));
    // Skill workflow is JSON-quoted inert data in the prompt, not elevated system instructions.
    for (const path of ["SKILL.md", "references/brief-schema.md", "references/output-format.md"]) {
      let expected = originals.get(path)!, found = false;
      for (let layer = 0; layer < 6; layer++) { if (prompt.includes(expected)) { found = true; break; } expected = JSON.stringify(expected).slice(1, -1); }
      ok(found);
    }
    mode = "strategy";
    const complete = await runPut(id, "品牌山间茶，330ml乌龙茶铝罐，三口味；20—35岁通勤人群；售价6元，便利店及电商；保持原标志、普通印刷。事实不足明确待确认。按所选 Skill 输出三个不同方向、唯一推荐、风险和SKU规则。仅文字，不生成图片。");
    is(complete.find(event => event.type === "final")?.data.reply, strategyText);
    const saved = await db.getAgentSession(owner, id); ok((Array.isArray(saved?.messages) ? saved.messages : []).some((message: any) => message.role === "assistant" && message.content.includes("唯一推荐")));
    ok((saved?.steps as any[]).some(step => step.type === "image_skill" && step.id === skill.id));
    await assert.rejects((await import("../src/lib/image-skills/server")).resolveImageSkill(other, selection)); checks++;
    const once = "ag-" + randomUUID(); sessions.push(once);
    const post = await agent.POST(request("POST", once, "完整包装简报，仅文字策略，不调用工具。")); is(post.status, 200); is((await post.json()).reply, strategyText);
    for (const failureMode of ["http-error", "sse-error"] as const) {
      mode = failureMode;
      for (const method of ["PUT", "POST"]) {
        const failedId = "ag-" + randomUUID(); sessions.push(failedId); const before = calls;
        if (method === "PUT") {
          const failed = await runPut(failedId, "只制定包装文字策略，不调用工具。");
          ok(failed.some(event => event.type === "error")); is(failed.some(event => event.type === "final"), false);
        } else {
          const failed = await agent.POST(request("POST", failedId, "只制定包装文字策略，不调用工具。"));
          is(failed.status, 502); ok((await failed.json()).error);
        }
        is(calls - before, 1); // pi-ai error must not trigger hidden retries.
        const failedSession = runtime.getSession(owner, failedId)!; await runtime.persistAgentSession(failedSession);
        const last = failedSession.agent.state.messages.findLast(message => message.role === "assistant");
        is(last?.stopReason, "error"); ok(last?.errorMessage || failedSession.agent.state.errorMessage);
        const stored = await db.getAgentSession(owner, failedId); ok((stored?.steps as any[]).some(step => step.type === "error"));
      }
    }
    is(unexpected, 0); is(serverErrors.length, 0); is(calls, 7);
    for (const sessionId of sessions) is(runtime.getSession(owner, sessionId)?.events.some(event => event.type === "tool_start"), false);
    console.log(`PACKAGING_AGENT=PASS CHECKS=${checks} IMPORT=REAL_ZIP REFERENCES=FULL TRANSPORT=LOCAL_HTTP_SSE PUT=PASS POST=PASS PI_ERROR_SURFACING=PASS HISTORY=POSTGRES OWNER_ISOLATION=PASS MOCK_TEXT_CALLS=${calls} REAL_MODEL_CALLS=0 TOOLS=0 IMAGES=0`);
  } finally {
    globalThis.fetch = originalFetch;
    for (const id of sessions) { const session = runtime.getSession(owner, id); if (session) { session.running = false; runtime.removeRuntimeSession(owner, id); } }
    await db.getPool().end(); await f.cleanup();
  }
}
main().catch(error => { console.error("PACKAGING_AGENT=FAILED", error instanceof Error ? error.message : "unknown"); process.exitCode = 1; });
