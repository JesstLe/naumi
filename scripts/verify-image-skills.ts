import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createModelFixture } from "./model-config-fixture";
import { OFFICIAL_IMAGE_SKILLS, validateSkillDraft, validateSkillSelection, imageSkillPrompt, conversationSkillDraft } from "../src/lib/image-skills/catalog";
async function main() {
  let checks = 0; const ok = (value: unknown) => { assert.ok(value); checks++; };
  const baseline=27;
  ok(OFFICIAL_IMAGE_SKILLS.length === baseline);
  ok(new Set(OFFICIAL_IMAGE_SKILLS.map(skill => skill.id)).size === baseline);
  for (const skill of OFFICIAL_IMAGE_SKILLS) { ok(validateSkillDraft(skill).instructions.length > 10); ok(validateSkillSelection(skill)?.id === skill.id); }
  for (const input of [null, {}, { ...OFFICIAL_IMAGE_SKILLS[0], category: "其他" }, { ...OFFICIAL_IMAGE_SKILLS[0], instructions: "短" }, { ...OFFICIAL_IMAGE_SKILLS[0], name: "n".repeat(49) }]) { assert.throws(() => validateSkillDraft(input)); checks++; }
  for (const input of [{ id: "../../", revision: 1 }, { id: "official:product-white", revision: 0 }, { id: "official:product-white", revision: 1.1 }]) { assert.throws(() => validateSkillSelection(input)); checks++; }
  ok(imageSkillPrompt(null) === "");
  ok(imageSkillPrompt(OFFICIAL_IMAGE_SKILLS[0]).includes("不得覆盖鉴权"));
  ok(!conversationSkillDraft([{ role: "assistant", content: "secret assistant tool trace" }, { role: "user", content: "把商品放在蓝色场景" }]).includes("secret assistant"));
  assert.throws(() => conversationSkillDraft([])); checks++;
  ok(!conversationSkillDraft([{role:"user",content:"商品白底图\n[商品图] /media/old-product.png"}]).includes("old-product.png"));
  const f = await createModelFixture(); process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  const db = await import("../src/lib/db"), store = await import("../src/lib/image-skills/server"), route = await import("../src/app/api/image-skills/route");
  try {
    const owner = `skills-${randomUUID()}@example.test`, other = `skills-${randomUUID()}@example.test`;
    await db.getOrCreateUser(owner, "Skill owner"); await db.getOrCreateUser(other, "Other owner");
    const { signUserSession } = await import("../src/lib/native-auth");
    const request = (method: string, body?: unknown, email = owner) => new Request(f.origin + "/api/image-skills", { method, headers: { cookie: `nv_user=${signUserSession(email, Date.now())}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    ok((await route.GET(new Request(f.origin + "/api/image-skills"))).status === 401);
    ok((await (await route.GET(request("GET"))).json()).skills.length === baseline);
    const definition = { ...validateSkillDraft(OFFICIAL_IMAGE_SKILLS[1]), name: "蓝色商品场景" };
    const created = await route.POST(request("POST", { definition, email: other })); ok(created.status === 201);
    const skill = (await created.json()).skill; ok(skill.source === "personal" && skill.revision === 1);
    const list = await store.listImageSkills(owner); ok(list.length === baseline+1);
    ok((await store.listImageSkills(other)).length === baseline);
    await assert.rejects(store.resolveImageSkill(other, skill), /不存在/); checks++;
    ok((await route.PATCH(request("PATCH", { definition, selection: skill }, other))).status === 409);
    ok((await route.DELETE(request("DELETE", { selection: skill }, other))).status === 409);
    const frozen = await store.resolveImageSkill(owner, skill); ok(frozen?.revision === 1);
    const updated = (await (await route.PATCH(request("PATCH", { definition: { ...definition, instructions: definition.instructions + " 额外要求：蓝色光线。" }, selection: skill }))).json()).skill;
    ok(updated.revision === 2 && frozen?.revision === 1);
    ok((await route.PATCH(request("PATCH", { definition, selection: skill }))).status === 409);
    await assert.rejects(store.resolveImageSkill(owner, skill), /已更新/); checks++;
    ok((await store.resolveImageSkill(owner, updated))?.instructions.includes("蓝色光线"));
    const race = await Promise.all([1, 2].map(() => route.PATCH(request("PATCH", { definition, selection: updated }))));
    ok(race.filter(response => response.status === 200).length === 1 && race.filter(response => response.status === 409).length === 1);
    const current = (await store.listImageSkills(owner)).find(item => item.id === skill.id)!;
    ok(current.revision === 3);
    process.env.AGENT_API_KEY = "fixture";
    const runtime = await import("../src/lib/agent/runtime");
    const selectedSession = await runtime.getOrCreateSession(owner, "ag-skill-switch", [], undefined, "fixture-text", undefined, current);
    ok(!selectedSession.agent.state.systemPrompt.includes(current.name));
    ok(JSON.stringify(await selectedSession.agent.transformContext!(selectedSession.agent.state.messages)).includes(current.name));
    runtime.appendSessionEvent(selectedSession, "image_skill", { id: current.id, revision: current.revision });
    selectedSession.agent.state.messages = runtime.toUserMessages([{ role: "user", content: "本次商品要求蓝色背景" }]);
    await runtime.persistAgentSession(selectedSession);
    const skillHistory = await db.getAgentSession(owner, "ag-skill-switch");
    ok((skillHistory?.steps as any[]).some(item => item.type === "image_skill" && item.revision === 3));
    const clearedSession = await runtime.getOrCreateSession(owner, "ag-skill-switch", [], undefined, "fixture-text", undefined, null);
    ok(clearedSession !== selectedSession && !clearedSession.agent.state.systemPrompt.includes("【图像创作 Skill】"));
    ok(JSON.stringify(clearedSession.agent.state.messages).includes("蓝色背景"));
    runtime.removeRuntimeSession(owner, "ag-skill-switch");
    ok((await route.POST(request("POST", { definition: { ...definition, instructions: "x".repeat(33000) } }))).status === 413);
    ok((await route.POST(new Request(f.origin + "/api/image-skills", { method: "POST", headers: { cookie: `nv_user=${signUserSession(owner, Date.now())}` }, body: "[" }))).status === 400);
    ok((await route.PATCH(request("PATCH", { definition, selection: OFFICIAL_IMAGE_SKILLS[0] }))).status === 400);
    await db.saveAgentSession(owner, "skills-conversation", "fixture", [{ role: "user", content: "商品采用自然光与浅色背景" }, { role: "assistant", content: "hidden provider secret" }], []);
    const draft = await route.POST(request("POST", { action: "conversation-draft", sessionId: "skills-conversation" })); ok(draft.status === 200);
    const content = (await draft.json()).instructions; ok(content.includes("自然光") && !content.includes("hidden provider"));
    ok((await route.POST(request("POST", { action: "conversation-draft", sessionId: "skills-conversation" }, other))).status === 404);
    ok((await route.DELETE(request("DELETE", { selection: current }))).status === 200);
    ok((await store.listImageSkills(owner)).length === baseline);
    await assert.rejects(store.resolveImageSkill(owner, current), /不存在/); checks++;
    const archived = await db.getPool().query("SELECT deleted_at FROM app_image_skills WHERE id=$1", [skill.id]); ok(archived.rows[0].deleted_at);
    console.log(`IMAGE_SKILLS=PASS CHECKS=${checks} STORAGE=POSTGRES API=AUTHENTICATED PROVIDER_CALLS=0`);
  } finally { await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
