import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";
import {commandSchema, parsePackagingResult, packagingMessages} from "../src/lib/packaging-strategy/contract";
import {PACKAGING_SKILL} from "../src/lib/image-skills/brand-packaging-strategy";

async function main() {
  let calls = 0, invalid = false, hold = false, release: (() => void) | undefined;
  const strategy = "## 一、策略结论\n以真实成分建立识别。\n## 二、核心表达\n面向通勤人群。\n## 三、包装正面信息层级\n品牌、品类、口味依次识别。\n## 四、三个差异化创意方向\n方向一产品证据；方向二消费场景；方向三品牌文化。\n## 五、推荐方向\n推荐产品证据，风险为文字拥挤。\n## 六、产品线规则\n主标统一，口味用色区分。\n## 七、渠道适配\n电商缩略图优先品牌与品类。\n## 八、风险与验证\n待确认配方，先做识别测试。";
  const fixture = await createModelFixture(async (req, res) => {
    if (!req.url?.endsWith("/chat/completions")) { res.statusCode = 404; return res.end("{}"); }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()); calls++;
    assert.equal(body.model, "wire-packaging"); assert.equal(body.tools, undefined);
    assert.ok(body.messages[0].content.includes("references/output-format.md"));
    assert.ok(body.messages[0].content.includes("三个创意方向必须基于不同的战略切入点"));
    const input = JSON.parse(body.messages[1].content);
    if (hold) await new Promise<void>(resolve => { release = resolve; });
    const content = invalid ? "not valid json" : JSON.stringify(input.allowDraft || input.answers || input.feedback || input.brief.audience
      ? {kind: "strategy", content: strategy + (input.feedback ? "\n已据反馈调整：" + input.feedback : "")}
      : {kind: "questions", questions: ["主要消费者与使用场景是什么？", "产品有何真实购买理由？", "价格、渠道与包装限制是什么？"]});
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({id: randomUUID(), object: "chat.completion", model: body.model, choices: [{index: 0, message: {role: "assistant", content}, finish_reason: "stop"}], usage: {prompt_tokens: 100, completion_tokens: 100}}));
  });
  Object.assign(process.env, {PGOPTIONS: `-c search_path=${fixture.schemaName}`, OPENAI_API_KEY: "fixture", AGENT_API_KEY: "fixture", AGENT_BASE_URL: fixture.origin + "/v1", NAUMI_MULTI_USER: "1", NAUMI_ROUTER_MANAGEMENT_URL: fixture.origin, NAUMI_ROUTER_MANAGEMENT_TOKEN: "fixture-router-management-secret", MODEL_CONFIG_ENVELOPE_SECRET: "fixture-model-config-envelope", MODEL_CONFIG_TRUSTED_ORIGINS: fixture.origin});
  const db = await import("../src/lib/db");
  try {
    const credential = await fixture.credentials.importPlain({providerId: "text", plain: "fixture-packaging-secret", actor: "fixture"});
    fixture.config.providers.push({...fixture.config.providers[0], id: "text", name: "Text fixture", protocol: "openai-chat", credentialRef: credential.id});
    fixture.config.upstreamModels.push({...structuredClone(fixture.config.upstreamModels[0]), id: "packaging-text", providerId: "text", model: "wire-packaging", modality: "text", parameterMap: {}});
    fixture.config.publicModels.push({id: "text-packaging", label: "Packaging text", enabled: true, visible: true, modality: "text", target: {type: "upstream", id: "packaging-text"}});
    Object.assign(fixture.config.bindings, {"text.generate": "text-packaging", "agent.text": "text-packaging"});
    (await import("../src/lib/model-config/schema")).validateModelConfig(fixture.config, {trustedOrigins: [fixture.origin]});
    await fixture.repo.current(); await db.ensureSchema();
    const owner = `packaging-${randomUUID()}@example.test`, other = `other-${randomUUID()}@example.test`;
    await db.getOrCreateUser(owner, "Packaging owner"); await db.getOrCreateUser(other, "Other user");
    const {signUserSession} = await import("../src/lib/native-auth"), route = await import("../src/app/api/packaging-strategy/route");
    const cookie = (email = owner) => `nv_user=${signUserSession(email, Date.now())}`;
    const request = (method: string, body?: unknown, email = owner, suffix = "") => new Request(fixture.origin + "/api/packaging-strategy" + suffix, {method, headers: {cookie: cookie(email), "content-type": "application/json"}, ...(body ? {body: JSON.stringify(body)} : {})});
    const brief = {brand: "山间茶饮，330ml铝罐，3口味", task: "新品上市", audience: "", reasons: "", impression: "自然、清晰、轻盈", priceChannels: "", competition: "暂不确定", constraints: ""};
    assert.equal((await route.GET(new Request(fixture.origin + "/api/packaging-strategy"))).status, 401);
    assert.equal((await route.POST(request("POST", {action: "generate", brief: {...brief, brand: 1}}))).status, 400);
    assert.equal((await route.POST(request("POST", {action: "save", brief, owner: other}))).status, 400);
    assert.equal((await route.POST(request("POST", {action: "save", brief: {...brief, task: "x".repeat(70000)}}))).status, 413);
    let response = await route.POST(request("POST", {action: "save", brief})); assert.equal(response.status, 200, await response.clone().text());
    let project = (await response.json()).project; assert.equal(project.revision, 1); assert.equal(calls, 0);
    const id = project.id;
    assert.equal((await (await route.GET(request("GET"))).json()).projects[0].id, id);
    assert.equal((await (await route.GET(request("GET", undefined, other))).json()).projects.length, 0);
    assert.equal((await route.GET(request("GET", undefined, other, `?id=${id}`))).status, 404);
    assert.equal((await route.POST(request("POST", {action: "save", brief, projectId: id, expectedRevision: 1}, other))).status, 404);
    const post = (action: string, extra: any = {}) => route.POST(request("POST", {action, brief, projectId: id, expectedRevision: project.revision, ...extra}));
    response = await post("generate"); assert.equal(response.status, 200, await response.clone().text()); project = (await response.json()).project;
    assert.equal(project.result.kind, "questions"); assert.equal(project.result.questions.length, 3); assert.equal(calls, 1);
    response = await post("generate", {answers: "20-35岁通勤人群；茶叶原料可追溯；6元，电商，已有铝罐结构不可改"}); assert.equal(response.status, 200, await response.clone().text()); project = (await response.json()).project;
    assert.equal(project.result.kind, "strategy");
    response = await post("refine", {feedback: "减少装饰图形，强化品类识别"}); assert.equal(response.status, 200, await response.clone().text()); project = (await response.json()).project;
    assert.match(project.result.content, /减少装饰图形/);
    response = await route.POST(request("POST", {action: "save", brief, projectId: id, expectedRevision: 1})); assert.equal(response.status, 409);
    invalid = true; response = await post("generate"); assert.equal(response.status, 502); project = (await response.json()).project; assert.equal(project.result.kind, "strategy"); invalid = false;
    hold = true; const pending = post("generate");
    while (!release) await new Promise(resolve => setTimeout(resolve, 10));
    const inFlight = (await (await route.GET(request("GET", undefined, owner, `?id=${id}`))).json()).project;
    assert.equal((await route.POST(request("POST", {action: "generate", brief, projectId: id, expectedRevision: inFlight.revision}))).status, 409);
    release(); hold = false; response = await pending; assert.equal(response.status, 200); project = (await response.json()).project;
    response = await post("save", {brief: {...brief, brand: "新版茶饮"}}); assert.equal(response.status, 200); project = (await response.json()).project; assert.equal(project.result, null);
    const {saveFeaturePolicy} = await import("../src/lib/feature-access/server");
    await saveFeaturePolicy("fixture", {id: randomUUID(), email: other, mode: "custom", allowed: [], expectedVersion: 0});
    assert.equal((await route.GET(request("GET", undefined, other))).status, 403);
    assert.equal((await route.POST(request("POST", {action: "save", brief}, other))).status, 403);
    assert.throws(() => parsePackagingResult('{"kind":"questions","questions":["one","two","three","four"]}'));
    assert.throws(() => parsePackagingResult('{"kind":"questions","questions":["question"]}', true));
    const command = commandSchema.parse({action: "generate", brief, allowDraft: true});
    assert.ok(packagingMessages(command, null)[0].content.includes(PACKAGING_SKILL.instructions.slice(0, 15)));
    console.log(`PACKAGING_STRATEGY=PASS AUTH=PASS OWNER_ISOLATION=PASS QUESTION_ANSWER_REFINE=PASS SAVE_INVALIDATES_STALE_RESULT=PASS REVISION_CAS=PASS RUN_LEASE=PASS FAILURE_RETRY=PASS MANAGED_TEXT_ROUTING=PASS MODEL_CALLS=${calls} PAID_IMAGE_CALLS=0`);
  } finally { await db.getPool().end(); await fixture.cleanup(); }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
