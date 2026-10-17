import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createModelFixture } from "./model-config-fixture";

async function main() {
  let mode: "stream" | "denied" | "quote" | "confirmed" = "stream", modelFinished = false, modelCalls = 0, imagePosts = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const png = await readFile("public/demos/suite-demo/suppl-src.png");
  const media = "output/canvas-agent-stream-fixture/media";
  await mkdir(media, { recursive: true }); await writeFile(media + "/anchor.png", png);
  Object.assign(process.env, { STORAGE_DRIVER: "local", MEDIA_DIR: media, NAUMI_MULTI_USER: "1", OPENAI_API_KEY: "fixture-local-only", AGENT_API_KEY: "fixture-local-only" });
  const f = await createModelFixture(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    if (req.url?.startsWith("/media/")) { res.setHeader("content-type", "image/png"); res.end(png); return; }
    if (req.url?.endsWith("/images/edits") || req.url?.endsWith("/images/generations")) { imagePosts++; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]})); return; }
    if (!req.url?.endsWith("/chat/completions")) { if (req.method === "POST") imagePosts++; res.statusCode = 500; res.end("No image submission permitted"); return; }
    modelCalls++; const body = JSON.parse(Buffer.concat(chunks).toString()); assert.equal(body.model, "wire-text");
    const frame = (delta: unknown, finish: string | null = null) => "data: " + JSON.stringify({ id: "fixture-stream", object: "chat.completion.chunk", model: "wire-text", choices: [{ index: 0, delta, finish_reason: finish }] }) + "\n\n";
    res.setHeader("content-type", "text/event-stream"); res.write(frame({ role: "assistant" }));
    if (mode === "stream") {
      res.write(frame({ content: "首段文字已实时显示。" })); await gate;
      res.write(frame({ content: "后段随后到达，不依赖换行。" })); res.write(frame({}, "stop"));
    } else if (mode === "confirmed" && body.messages.at(-1)?.role === "tool") {
      res.write(frame({ content: "换色结果已交付。" })); res.write(frame({}, "stop"));
    } else {
      res.write(frame({ content: "马上执行换色。" }));
      res.write(frame({ tool_calls: [{ index: 0, id: "call-recolor", type: "function", function: { name: "recolor_product", arguments: JSON.stringify({ image_url: f.origin + "/media/anchor.png", color: "#2E6FE0", strength: 100, confirm: true }) } }] }));
      res.write(frame({}, "tool_calls"));
    }
    modelFinished = true; res.end("data: [DONE]\n\n");
  });
  Object.assign(process.env, { PGOPTIONS: `-c search_path=${f.schemaName}`, INTERNAL_APP_ORIGIN: f.origin, NAUMI_ROUTER_MANAGEMENT_URL: f.origin, NAUMI_ROUTER_MANAGEMENT_TOKEN: "fixture-private-router-token-stream-20261017", MODEL_CONFIG_ENVELOPE_SECRET: "fixture-independent-envelope-key-stream-20261017", MODEL_CONFIG_TRUSTED_ORIGINS: f.origin });
  const db = await import("../src/lib/db");
  const email = `stream-${randomUUID()}@fixture.test`;
  try {
    f.config.upstreamModels[0].capabilities.preserveIdentity = true;
    const cred = await f.credentials.importPlain({ providerId: "text", plain: "fixture-local-text-key", actor: "fixture" });
    f.config.providers.push({ ...f.config.providers[0], id: "text", name: "text fixture", protocol: "openai-chat", credentialRef: cred.id });
    f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: "text", providerId: "text", model: "wire-text", modality: "text", parameterMap: {}, capabilities: { ...f.config.upstreamModels[0].capabilities, vision: true } });
    f.config.publicModels[0].toolScope = { features: ["canvas.image"], systems: ["canvas"], defaultFor: [] };
    f.config.publicModels.push({ id: "text-family", label: "Fixture text", modality: "text", enabled: true, visible: true, target: { type: "upstream", id: "text" }, toolScope: { features: ["canvas.assistant"], defaultFor: [] } });
    Object.assign(f.config.bindings, { "agent.text": "text-family", "vision.reference": "text-family" }); await f.repo.current();
    await db.ensureSchema(); await db.getOrCreateUser(email, "Stream fixture");
    const { createBillingService, withBillingTransaction } = await import("../src/lib/billing/service");
    await withBillingTransaction(db.getPool(), tx => createBillingService().grantTx(tx, { id: randomUUID(), email, amount: 100, source: "admin", reason: "fixture", expiry: { unit: "years", value: 1 }, ledgerId: randomUUID(), fingerprint: randomUUID(), actor: "fixture" }));
    const { getBillingRuntime } = await import("../src/lib/billing/server"), billing = await getBillingRuntime(), previous = await billing.config.current(), config = structuredClone(previous.config);
    config.switches.metering = "on"; config.features["canvas.assistant"].pricing = { mode: "fixed", credits: 0 }; config.features["canvas.image"].pricing = { mode: "fixed", credits: 4 }; config.thresholds.agentConfirmCredits = 1;
    const price = await billing.config.publish({ id: randomUUID(), expectedVersion: previous.version, config, actor: "fixture", reason: "Streaming and quote isolation" });
    await db.addArtworks(email, [{ id: "anchor", title: "换色参考", category: "main", prompt: "fixture", status: "completed", image: "/media/anchor.png", gradient: "", origin: "canvas" }], "fixture");
    const cookie = "nv_user=" + (await import("../src/lib/native-auth")).signUserSession(email, Date.now());
    const api = await import("../src/app/api/canvas/assistant/route");
    const send = (message: string, anchor = "", sessionId = randomUUID(), operationId = randomUUID(), turnId = randomUUID()) => api.POST(new Request(f.origin + "/api/canvas/assistant", { method: "POST", headers: { cookie, "content-type": "application/json", "x-naumi-feature-model": "text-family", "x-naumi-billing-operation-id": operationId, "x-naumi-billing-version": String(price.version), "x-naumi-billing-credits": "0" }, body: JSON.stringify({ mode: "agent", sessionId, turnId, projectKey: "workspace", anchorId: anchor, contextIds: anchor ? [anchor] : [], messages: [{ role: "user", content: message }], imageModelId: "image-a", ratio: "1:1", resolution: "1K", quality: "medium" }) }));
    const response = await send("请只用文字回答"); assert.equal(response.status, 200); assert.equal(response.headers.get("x-accel-buffering"), "no");
    const reader = response.body!.getReader(), decoder = new TextDecoder(); let text = "";
    const timeout = setTimeout(() => release(), 8000);
    try { while (!text.includes("首段文字")) { const chunk = await reader.read(); assert(!chunk.done); text += decoder.decode(chunk.value); } assert.equal(modelFinished, false, "First delta must arrive before model finishes"); }
    finally { clearTimeout(timeout); release(); }
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; text += decoder.decode(chunk.value); }
    assert(text.includes("event: done")); assert(text.includes("后段随后到达"));
    console.log("CANVAS_REAL_SSE=PASS FIRST_DELTA_BEFORE_MODEL_END=1 NO_NEWLINE=1 PROXY_BUFFERING=OFF");
    const parse = (stream: string) => stream.split("\n\n").filter(x => x.startsWith("event:")).map(x => ({ type: x.split("\n")[0].slice(7), data: JSON.parse(x.split("\ndata: ")[1]) }));
    mode = "denied";
    const denied = parse(await (await send("只分析图片，不要换色", "anchor")).text());
    const blocked = denied.find(e => e.type === "attention"); assert.equal(blocked?.data.code, "INTENT_REQUIRED"); assert(blocked?.data.id);
    const final = denied.find(e => e.type === "final")!; assert.equal(final.data.reply, blocked?.data.message); assert(!final.data.reply.includes("马上执行"));
    const saved = await db.getAgentSession(email, final.data.sessionId); assert.equal((saved!.messages as { content: string }[]).at(-1)!.content, blocked?.data.message); assert(!JSON.stringify(saved!.messages).includes("马上执行"));
    assert.equal(imagePosts, 0);
    console.log("CANVAS_RESTRICTION=PASS REAL_CODE=INTENT_REQUIRED FINAL_AND_HISTORY=AUTHORITATIVE IMAGE_SUBMISSIONS=0");
    mode = "quote";
    const quoted = parse(await (await send("瓶子换成蓝色", "anchor")).text());
    assert(!quoted.some(e => e.type === "attention" && e.data.kind === "restricted"), JSON.stringify(quoted));
    const waiting = quoted.find(e => e.type === "attention" && e.data.kind === "waiting"); assert(waiting, JSON.stringify(quoted));
    assert.match(waiting.data.message, /积分/); assert.equal(imagePosts, 0); assert.equal(modelCalls, 3);
    const quotedFinal = quoted.find(e => e.type === "final")!;
    mode = "confirmed";
    const confirmationOperation = randomUUID(), confirmationTurn = randomUUID();
    const confirmed = parse(await (await send("确认执行", "anchor", quotedFinal.data.sessionId, confirmationOperation, confirmationTurn)).text());
    assert(confirmed.some(e => e.type === "artifacts" && e.data.artifacts.length > 0), JSON.stringify(confirmed));
    assert(!confirmed.some(e => e.type === "attention" && ["waiting","restricted"].includes(e.data.kind)), JSON.stringify(confirmed));
    assert.equal(imagePosts, 1); assert.equal(modelCalls, 5);
    const debit = (await db.getPool().query("SELECT count(*)::int AS n FROM app_ledger WHERE email=$1 AND delta<0", [email])).rows[0]; assert.equal(debit.n, 1);
    const replayed = parse(await (await send("确认执行", "anchor", quotedFinal.data.sessionId, confirmationOperation, confirmationTurn)).text());
    assert(replayed.some(e => e.type === "artifacts"), JSON.stringify(replayed)); assert.equal(imagePosts, 1); assert.equal(modelCalls, 5);
    console.log("CANVAS_REPLAY=PASS SAME_OPERATION=REUSED IMAGE_FIXTURE_POSTS=1 MODEL_CALLS_UNCHANGED=1");
    console.log("CANVAS_CONFIRMED=PASS AUTHENTIC_USER_CONFIRMATION=1 IMAGE_FIXTURE_POSTS=1 ARTIFACTS=DELIVERED CHARGE_COUNT=1 REAL_SUPPLIER_CALLS=0");
    console.log("CANVAS_INTENT_QUOTE=PASS ORIGINAL_USER_PHRASE=ACCEPTED FORGED_CONFIRM_TRUE=BLOCKED WAITING_QUOTE=VISIBLE IMAGE_SUBMISSIONS=0 REAL_SUPPLIER_CALLS=0");
  } finally { release(); await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
