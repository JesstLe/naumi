/** Explicit opt-in: real text provider, local isolated accounts only. Never use a production DB. */
import assert from "node:assert/strict";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {randomUUID, createHash} from "node:crypto";
import JSZip from "jszip";

async function main() {
  if (process.env.NAUMI_VERIFY_LIVE_PACKAGING !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw new Error("Explicit live packaging opt-in and isolated localhost DB required");
  const db = await import("../src/lib/db");
  const email = "packaging-acceptance@example.test", other = "packaging-other@example.test";
  await db.getOrCreateUser(email, "包装验收"); await db.getOrCreateUser(other, "独立账号");
  const {hashPassword} = await import("../src/lib/pw");
  await db.getPool().query("UPDATE app_users SET password_hash=$2,role='user' WHERE email=ANY($1)", [[email, other], hashPassword("PackagingLocal2026!")]);
  const {signUserSession} = await import("../src/lib/native-auth");
  const cookie = `nv_user=${signUserSession(email, Date.now())}`;
  const zip = new JSZip();
  for (const path of ["SKILL.md", "references/brief-schema.md", "references/output-format.md", "agents/openai.yaml"]) zip.file("brand-packaging-strategy/" + path, await readFile("skills/brand-packaging-strategy/" + path));
  const bytes = await zip.generateAsync({type: "uint8array", compression: "DEFLATE"});
  const dir = process.env.PACKAGING_EVIDENCE_DIR || "output/brand-packaging-live";
  await mkdir(dir, {recursive: true}); await writeFile(dir + "/brand-packaging-strategy.zip", bytes);
  const form = new FormData(); form.append("file", new File([Uint8Array.from(bytes)], "brand-packaging-strategy.zip", {type: "application/zip"}));
  const imported = await (await import("../src/app/api/image-skills/import/route")).POST(new Request("http://127.0.0.1:3616/api/image-skills/import", {method: "POST", headers: {cookie}, body: form}));
  assert.ok([200, 201].includes(imported.status), await imported.clone().text());
  const skill = (await imported.json()).skill;
  assert.ok(skill.instructions.includes("产品线规则"));
  const sessionId = "ag-" + randomUUID();
  const agent = await import("../src/app/api/agent/route");
  const invoke = async (message: string) => {
    const response = await agent.PUT(new Request("http://127.0.0.1:3616/api/agent", {method: "PUT", headers: {cookie, "content-type": "application/json"}, body: JSON.stringify({message, sessionId, skill: {id: skill.id, revision: skill.revision}})}));
    assert.equal(response.status, 200, await response.clone().text());
    const events = await response.text();
    const final = events.match(/event: final\ndata: ([^\n]+)/);
    assert.ok(final, events.slice(-1500)); const result = JSON.parse(final[1]);
    assert.ok(result.reply?.length > 20); assert.ok(!events.includes("event: tool_start"), "Text strategy must not invoke tools");
    return {events, reply: result.reply as string};
  };
  try {
    const missing = await invoke("我想做一个茶饮包装。先帮我收集最少的关键事实，最多问三个问题，现在不要生成策略或图片。");
    await writeFile(dir + "/agent-questions.txt", missing.reply);
    const complete = await invoke("品牌山间茶，低糖乌龙茶饮330ml铝罐，3种口味。新品上市，核心问题是货架上品类识别不清。主要面向20—35岁城市通勤者，午后购买，顾虑甜腻。购买理由是原料可追溯、真实茶香；低糖配方由客户提供但检测待确认，不作功效宣称。希望自然、清晰、轻盈。零售6元，中国大陆便利店和电商销售。竞品暂未调研，不猜数据。沿用铝罐和已有标志，普通印刷，无特殊工艺预算，未来扩展口味。请按所选 Skill 输出完整策略：三个战略不同的方向、唯一推荐、信息层级、SKU规则、渠道适配、执行风险及验证动作。只要文字，不生成图片，不调用工具。");
    await writeFile(dir + "/agent-strategy.md", complete.reply);
    assert.ok(complete.reply.includes("推荐")); assert.ok(complete.reply.includes("风险")); assert.ok(/SKU|口味|产品线/.test(complete.reply));
    const session = await db.getAgentSession(email, sessionId);
    assert.ok((Array.isArray(session?.messages) ? session.messages : []).some((message: any) => message.role === "assistant" && message.content?.includes("推荐")));
    const steps = session?.steps as any[] || [];
    assert.ok(steps.some(step => step.type === "image_skill" && step.id === skill.id));
    const {resolveImageSkill} = await import("../src/lib/image-skills/server");
    await assert.rejects(resolveImageSkill(other, skill));
    const evidence = {status: "PASS", provider: new URL(process.env.AGENT_BASE_URL || "https://invalid").host, model: process.env.AGENT_MODEL, sessionId, skillId: skill.id, skillRevision: skill.revision, importedWorkflowChars: skill.instructions.length, questionChars: missing.reply.length, strategyChars: complete.reply.length, strategySha256: createHash("sha256").update(complete.reply).digest("hex"), realTextCalls: 2, toolCalls: 0, imageCalls: 0, ownerIsolation: "PASS", persistedHistory: "PASS"};
    await writeFile(dir + "/live-agent-evidence.json", JSON.stringify(evidence, null, 2));
    console.log("PACKAGING_LIVE_AGENT=PASS IMPORT=ZIP_TO_ACCOUNT REFERENCES=FULL REAL_TEXT_CALLS=2 TOOLS=0 HISTORY=POSTGRES OWNER_ISOLATION=PASS");
  } finally { await db.getPool().end(); }
}
main().catch(error => {console.error("PACKAGING_LIVE_AGENT=FAILED", error instanceof Error ? error.message.slice(0, 250) : "unknown"); process.exitCode = 1;});
