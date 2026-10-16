import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fixtureModelConfig } from "./model-config-unit-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
import { modelConfigDigest } from "../src/lib/model-config/repository";
import { modelChainPresentation } from "../src/lib/bi/model-chain";
import { frontendModelSelection } from "../src/lib/model-config/frontend-selection";

const mode = process.argv[2] || "MODIFIED", output = resolve(process.argv[3] || "output/bi-model-chain-20261016");
async function main() {
  if (mode !== "MODIFIED") {
    const root = resolve(output, mode === "BASELINE" ? "baseline" : "rollback-copy");
    const observer = readFileSync(resolve(root, "src/lib/bi/model-observer.ts"), "utf8");
    assert.ok(!observer.includes("frontendModel")); assert.ok(!observer.includes("withObservedCallId"));
    console.log(`${mode}=PASS FRONTEND_LABEL=ABSENT EXACT_ATTEMPT_LINK=ABSENT EXIT=0`); return;
  }
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw Error("Isolated loopback PostgreSQL required");
  process.env.SETTINGS_SECRET = "bi-model-chain-isolated-fixture-012345678901234567890123456789";
  const { Pool } = await import("pg"); const admin = new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
  const schema="bi_model_"+randomUUID().replace(/-/g,"");await admin.query(`CREATE SCHEMA ${schema}`);await admin.end();process.env.PGOPTIONS=`-c search_path=${schema}`;
  const db = await import("../src/lib/db"), bi = await import("../src/lib/bi/repository");
  const { observeOpenAI, withBiModelContext, observeModelCall, modelExecutionTelemetry } = await import("../src/lib/bi/model-observer");
  const { modelAwareOpenAI } = await import("../src/lib/model-config/clients");
  const { createModelExecutor } = await import("../src/lib/model-config/execution");
  const { currentObservedCallId } = await import("../src/lib/bi/call-scope");
  const { parseBiQuery } = await import("../src/lib/bi/contracts");
  await bi.ensureBiSchema();
  const sql = db.getPool(), email = "model-chain-fixture@example.test", other = "model-chain-other@example.test";
  const requests: { model: string; stream: boolean }[] = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push({ model: body.model, stream: !!body.stream });
    const model = body.model === "wire-text-b" ? "reported-text-b" : "reported-text-a";
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const raw = `data: ${JSON.stringify({ id: "receipt-one", model, choices: [{ index: 0, delta: { content: "你好" }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "receipt-one", model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })}\n\ndata: [DONE]\n\n`;
      const bytes = Buffer.from(raw); res.write(bytes.subarray(0, 13)); res.end(bytes.subarray(13));
    } else {
      res.writeHead(200, { "content-type": "application/json" });res.end(JSON.stringify({ id: "receipt-one", model, choices: [{ message: { role: "assistant", content: "fixture only" }, index: 0, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2 } }));
    }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`, credential = randomUUID();
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS=origin;
  const config = fixtureModelConfig(origin + "/v1", credential);
  config.providers.push({ ...config.providers[0], id: "text-provider", protocol: "openai-chat" });
  for (const suffix of ["a", "b"]) {
    config.upstreamModels.push({ ...config.upstreamModels[0], id: `text-${suffix}`, providerId: "text-provider", model: `wire-text-${suffix}`, modality: "text", capabilities: { ...config.upstreamModels[0].capabilities, generate: true, edit: false, vision: true } });
    config.publicModels.push({ id: `front-${suffix}`, label: suffix === "a" ? "前端创作 A" : "前端创作 B", modality: "text", enabled: true, visible: true, target: { type: "upstream", id: `text-${suffix}` } });
  }
  config.bindings["text.generate"] = "front-a"; config.bindings["agent.text"] = "front-a";
  const snapshot = { version: 1, config, digest: modelConfigDigest(config) }, billing = { version: 1, config: fixtureConfig() };
  // Integrated live-channel guards require an authoritative active fixture revision.
  await (await import("../src/lib/model-config/schema")).ensureModelSchema(sql);
  await sql.query("INSERT INTO app_model_config_versions(operation_id,actor,reason,config,digest) VALUES($1,'fixture','BI integration fixture',$2,$3)",[randomUUID(),JSON.stringify(config),snapshot.digest]);
  await sql.query("INSERT INTO app_model_config_state(singleton,active_version) VALUES(true,1)");

  const executor = createModelExecutor({ runtime: { byVersion: async () => structuredClone(snapshot), prepareExecution: async () => { throw Error("Unexpected gateway projection"); } }, credentials: { read: async () => "PRIVATE_FIXTURE_KEY" } as any, trustedOrigins: [origin], gateway: () => { throw Error("Unexpected gateway call"); } });
  const frozen = await executor.resolve({ requestedModelId: "front-a", snapshot, billing, binding: "text.generate" });
  assert.ok(!JSON.stringify(frozen).includes("frontendModel"),"Frozen execution shape remains rollback compatible");
  const recovered = await executor.describe(JSON.parse(JSON.stringify(frozen)));assert.equal(recovered.frontendModel?.label, "前端创作 A");
  const family = structuredClone(snapshot); family.config.publicModels = ["portrait", "landscape"].map(suffix => ({ ...config.publicModels[0], id: `gemini-3-pro-image-${suffix}`, label: `gemini-3-pro-image-${suffix}` }));
  assert.equal(frontendModelSelection(family, "image", "gemini-3-pro-image-portrait")?.label, "gemini-3-pro-image");
  const client = observeOpenAI(modelAwareOpenAI({ apiKey: "PRIVATE_FIXTURE_KEY", baseURL: origin + "/v1" }));
  const run = async (suffix: string, operation: string, stream = false) => {
    const model = await executor.resolve({ requestedModelId: `front-${suffix}`, snapshot, billing, binding: "text.generate" });
    return executor.run(model, () => withBiModelContext(email, "fixture", operation, async () => {
      if (stream) { let content = ""; const response = await client.chat.completions.create({ model: `front-${suffix}`, messages: [{ role: "user", content: "fixture" }], stream: true }); for await (const chunk of response) content += chunk.choices[0]?.delta.content || ""; return content; }
      return client.chat.completions.create({ model: `front-${suffix}`, messages: [{ role: "user", content: "fixture" }] });
    }));
  };
  try {
    await run("a", "job-chain-one");
    await Promise.all([run("a", "shared-session"), run("b", "shared-session")]);
    assert.equal(await run("b", "stream-session", true), "你好");
    const { supplierCostFetch } = await import("../src/lib/supplier-cost/collect");
    const scope = await executor.describe(frozen);
    await withBiModelContext(email,"fixture","fallback-session",()=>observeModelCall("platform-alias",async()=>{
      let answer: any;
      for(const [index,wire] of ["wire-rejected","wire-final"].entries()) {
        const fetcher = supplierCostFetch(async()=>Response.json(index===0?{error:{code:"not_charged"}}:{model:"reported-final",usage:{prompt_tokens:1}},{status:index===0?400:200}),{providerId:"fallback-fixture",baseUrl:origin+"/v1",apiKey:"PRIVATE_FIXTURE_KEY",wireModel:wire,costScope:scope});
        const response=await fetcher(new Request(origin+"/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:wire})}));answer=await response.json();
      }
      return answer;
    },modelExecutionTelemetry(scope)));
    const callRows = (await sql.query("SELECT * FROM app_bi_model_calls WHERE email=$1 ORDER BY created_at", [email])).rows;
    assert.equal(callRows.length, 5);assert.equal(callRows[0].frontend_model_label, "前端创作 A");assert.equal(callRows[0].wire_model, "wire-text-a");
    const supplier = (await sql.query("SELECT * FROM app_supplier_calls WHERE user_email=$1", [email])).rows;
    assert.equal(supplier.length, 6);assert.ok(supplier.every(row => row.bi_call_id && callRows.some(call => call.id === row.bi_call_id)));
    assert.ok(supplier.some(row => row.actual_model === "reported-text-b" && row.state === "stream-completed"));
    assert.ok(callRows.some(row => row.response_model === "reported-text-b" && row.state === "stream-completed" && row.input_tokens === 3));
    const current = new Date(), from = new Date(current.getTime() - 86400000).toISOString().slice(0, 10), to = new Date(current.getTime() + 86400000).toISOString().slice(0, 10);
    const query = (section: string) => parseBiQuery(new URLSearchParams({ section, email, from, to, size: "100" }));
    const calls = await bi.queryBi(query("calls"));assert.equal(calls.rows.length, 5);
    for (const row of calls.rows) {assert.equal(JSON.parse(String(row.model_attempts)).length, row.operation_id === "fallback-session" ? 2 : 1);assert.ok(String(row.actual_request_model).startsWith("wire-"));assert.ok(String(row.actual_executed_model).startsWith("reported-"));}
    const fallback=calls.rows.find(row=>row.operation_id==="fallback-session")!;assert.equal(fallback.actual_request_model,"wire-rejected / wire-final");assert.equal(fallback.actual_executed_model,"reported-final");assert.match(String(fallback.model_evidence),/部分尝试/);
    assert.ok(calls.rows.filter(row => row.operation_id === "shared-session").every(row => String(row.frontend_model_id).endsWith(String(row.actual_request_model).slice(-1))));
    const wireBefore = callRows[0].frontend_model_label;config.publicModels.find(m => m.id === "front-a")!.label = "新名称不覆盖历史";
    assert.equal((await bi.queryBi(query("calls"))).rows.find(row => row.id === callRows[0].id)!.frontend_model_label, wireBefore);
    await sql.query("INSERT INTO app_supplier_calls(id,operation_id,user_email,feature,attempt_id,account_id,provider_id,model,actual_model,phase,bi_call_id) SELECT $1,operation_id,$2,feature,$3,account_id,provider_id,'WRONG_OWNER','WRONG_OWNER',phase,bi_call_id FROM app_supplier_calls WHERE id=$4", [randomUUID(), other, randomUUID(), supplier[0].id]);
    assert.ok(!JSON.stringify(await bi.queryBi(query("calls"))).includes("WRONG_OWNER"));
    await sql.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES('job-chain-one',$1,'generate','{}','{}',false)", [email]);
    const operations = await bi.queryBi(query("operations"));assert.equal(operations.rows[0].frontend_model_label, "前端创作 A");assert.equal(operations.rows[0].actual_request_model, "wire-text-a");
    const unknown = modelChainPresentation([{ id: "old", email, operation_id: "old", wire_model: "alias-only" }]);assert.equal(unknown.actual_executed_model, "未确认");assert.equal(unknown.frontend_model_label, "未记录");
    let transport = 0;
    await assert.rejects(withBiModelContext(email, "fixture", "failed-once", () => observeModelCall("wire-unknown", async () => { transport++;throw Error("Fixture unknown response"); }, modelExecutionTelemetry(recovered))));assert.equal(transport,1);
    assert.equal(currentObservedCallId(), undefined);
    assert.ok(!JSON.stringify(await bi.queryBi(query("calls"))).includes("PRIVATE_FIXTURE_KEY"));assert.equal(requests.length,4);
    console.log("MODIFIED=PASS FRONTEND_SNAPSHOT=PASS FREEZE_RECOVERY=PASS FAMILY_LABEL=PASS ACTUAL_WIRE=PASS RESPONSE_MODEL=PASS SSE=PASS CONCURRENT_EXACT_LINK=PASS OWNER_SCOPE=PASS TASK_SUMMARY=PASS LEGACY_UNKNOWN=PASS FALLBACK_PAIRS=PASS NO_RETRY=PASS HTTP_POSTS=4 REAL_SUPPLIER=0 EXIT=0");
  } finally { await new Promise<void>(r => server.close(() => r())); await sql.end(); }
}
main().catch(error => { console.error(error);process.exitCode=1; });
