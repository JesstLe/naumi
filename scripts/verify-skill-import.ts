import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { parseSkillImport, skillDefinitionHash, SKILL_IMPORT_MAX_BYTES, SKILL_IMPORT_MAX_REQUEST_BYTES } from "../src/lib/image-skills/import";
import { validateSkillDraft, SkillError } from "../src/lib/image-skills/catalog";
import { requestRequirement } from "../src/lib/feature-access/catalog";

const markdown = "---\nname: packaging-fixture\ndescription: 账号隔离的包装策略测试\n---\n\n# 包装策略测试\n\n根据简报生成三条不同策略，不虚构事实。\n";
const bytes = (value: string) => Buffer.from(value);
async function archive(entries: Record<string, string>, options: Record<string, unknown> = {}) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", ...options });
}
async function main() {
  let checks = 0;
  const ok = (value: unknown) => { assert.ok(value); checks++; };
  const reject = (name: string, content: Uint8Array, status?: number) => {
    assert.throws(() => parseSkillImport(name, content), error => error instanceof SkillError && (!status || error.status === status)); checks++;
  };
  const md = parseSkillImport("SKILL.md", bytes(markdown));
  ok(md.definition.name === "包装策略测试" && md.definition.instructions === markdown.trim());
  ok(md.definition.category === "创作");
  const json = bytes(JSON.stringify({ format: "naumi-image-skill", version: 1, definition: { ...md.definition, owner: "forged@example.test" } }));
  ok(skillDefinitionHash(parseSkillImport("skill.json", json).definition) === skillDefinitionHash(md.definition));
  ok(skillDefinitionHash({ ...md.definition, name: ` ${md.definition.name} ` }) === skillDefinitionHash(md.definition));
  const zip = await archive({ "packaging/SKILL.md": markdown, "packaging/references/brief.md": "简报全文：消费者与渠道。", "packaging/references/output.md": "输出全文：唯一推荐与风险。", "packaging/agents/openai.yaml": 'interface:\n  display_name: "品牌包装创意策略"\n', "packaging/.DS_Store": "metadata", "__MACOSX/._SKILL.md": "metadata" });
  const parsed = parseSkillImport("packaging.zip", zip);
  ok(parsed.definition.name === "品牌包装创意策略");
  ok(parsed.definition.instructions.includes(markdown) && parsed.definition.instructions.includes("简报全文：消费者与渠道。") && parsed.definition.instructions.includes("输出全文：唯一推荐与风险。"));
  ok(parsed.warnings.length === 1);
  ok(parseSkillImport("root.zip", await archive({ "SKILL.md": markdown })).definition.name === md.definition.name);
  ok(parseSkillImport("block.md", bytes(markdown.replace("description: 账号隔离的包装策略测试", "description: >\n  第一行描述\n  第二行描述"))).definition.description === "第一行描述 第二行描述");
  reject("bad.txt", bytes(markdown)); reject("SKILL.md", bytes("no metadata")); reject("SKILL.md", Buffer.from([0xff]));
  reject("empty.md", bytes("")); reject("binary.md", bytes(markdown + "\0")); reject("skill.json", bytes("{"));
  reject("skill.json", bytes(JSON.stringify({ format: "naumi-image-skill", version: 2, definition: md.definition })));
  reject("skill.md", bytes(markdown + "中".repeat(6000)), 413);
  reject("large.md", Buffer.alloc(SKILL_IMPORT_MAX_BYTES + 1), 413);
  reject("skill.md", bytes(markdown.replace("name: packaging-fixture", "name: packaging-fixture\nname: duplicate")));
  reject("skill.md", bytes(markdown.replace("name: packaging-fixture", "name: !!js/function danger")));
  reject("skill.md", bytes(markdown.replace("description: 账号隔离的包装策略测试", "description: " + "中".repeat(141))));
  for (const path of ["../SKILL.md", "/SKILL.md", "C:/SKILL.md", "bad\\SKILL.md", "folder/../SKILL.md"]) reject("bad.zip", await archive({ [path]: markdown }));
  reject("two.zip", await archive({ "one/SKILL.md": markdown, "two/SKILL.md": markdown }));
  reject("none.zip", await archive({ "references/brief.md": "missing skill" }));
  reject("outside.zip", await archive({ "one/SKILL.md": markdown, "elsewhere/extra.md": "outside" }));
  reject("script.zip", await archive({ "SKILL.md": markdown, "scripts/run.sh": "echo forbidden" }));
  reject("binary.zip", await archive({ "SKILL.md": markdown, "references/data.md": "\0binary" }));
  reject("long.zip", await archive({ "SKILL.md": markdown, "references/long.md": Array.from({ length: 6200 }, (_, i) => String.fromCharCode(0x4e00 + i % 1900)).join("") }), 413);
  reject("bomb.zip", await archive({ "SKILL.md": markdown, "references/bomb.md": "a".repeat(60000) }), 413);
  const many = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`references/${i}.md`, "entry"]));
  reject("many.zip", await archive({ "SKILL.md": markdown, ...many }), 413);
  for (const permissions of [0o120777, 0o100755]) {
    const linked = new JSZip(); linked.file("SKILL.md", markdown, { unixPermissions: permissions });
    reject("link.zip", await linked.generateAsync({ type: "nodebuffer", platform: "UNIX" }));
  }
  const corrupt = Buffer.from(await archive({ "SKILL.md": markdown })); corrupt[35] ^= 1; reject("corrupt.zip", corrupt);
  const traversalZip = new JSZip(); traversalZip.file("SKILL.md", markdown); traversalZip.file("skill.md", markdown);
  reject("duplicate.zip", await traversalZip.generateAsync({ type: "nodebuffer" }));
  ok(JSON.stringify(requestRequirement("/api/image-skills/import", "POST")) === JSON.stringify({ all: ["agent"] }));
  if (process.env.NAUMI_SKILL_IMPORT_SOURCE) {
    const source = process.env.NAUMI_SKILL_IMPORT_SOURCE.replace(/[\\/]$/, "");
    const skill = await readFile(source + "/SKILL.md", "utf8"), brief = await readFile(source + "/references/brief-schema.md", "utf8"), output = await readFile(source + "/references/output-format.md", "utf8"), metadata = await readFile(source + "/agents/openai.yaml", "utf8");
    const original = parseSkillImport("brand.zip", await archive({ "brand/SKILL.md": skill, "brand/references/brief-schema.md": brief, "brand/references/output-format.md": output, "brand/agents/openai.yaml": metadata }));
    ok(original.definition.name === "品牌包装创意策略生成器");
    ok(original.definition.instructions.includes(skill.replace(/\r\n?/g, "\n").trim()) && original.definition.instructions.includes(brief.replace(/\r\n?/g, "\n").trim()) && original.definition.instructions.includes(output.replace(/\r\n?/g, "\n").trim()));
    console.log(`SOURCE_SKILL=PASS NAME=${original.definition.name} CHARACTERS=${original.definition.instructions.length} FULL_REFERENCES=YES`);
  }
  if (process.argv.includes("--parser-only")) { console.log(`SKILL_IMPORT=PASS CHECKS=${checks} PARSER=PASS DATABASE=NOT_RUN PROVIDER_CALLS=0`); return; }
  const { createModelFixture } = await import("./model-config-fixture");
  const f = await createModelFixture(); process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  const db = await import("../src/lib/db"), store = await import("../src/lib/image-skills/server"), route = await import("../src/app/api/image-skills/import/route"), crud = await import("../src/app/api/image-skills/route");
  try {
    const owner = `import-${randomUUID()}@example.test`, other = `import-${randomUUID()}@example.test`;
    await db.getOrCreateUser(owner, "Import owner"); await db.getOrCreateUser(other, "Other owner");
    const { signUserSession } = await import("../src/lib/native-auth");
    const request = (file: Uint8Array = bytes(markdown), name = "SKILL.md", email = owner) => {
      const form = new FormData(); form.set("file", new Blob([file]), name); form.set("email", other); form.set("owner", other);
      return new Request(f.origin + "/api/image-skills/import", { method: "POST", headers: { cookie: `nv_user=${signUserSession(email, Date.now())}` }, body: form });
    };
    ok((await route.POST(new Request(f.origin + "/api/image-skills/import", { method: "POST" }))).status === 401);
    const created = await route.POST(request()); ok(created.status === 201);
    const first = await created.json(); ok(!first.duplicate && first.skill.source === "personal");
    const duplicate = await route.POST(request(json, "export.json")); ok(duplicate.status === 200 && (await duplicate.json()).skill.id === first.skill.id);
    const cross = await route.POST(request(bytes(markdown), "SKILL.md", other)); ok(cross.status === 201 && (await cross.json()).skill.id !== first.skill.id);
    const row = await db.getPool().query("SELECT email FROM app_image_skills WHERE id=$1", [first.skill.id]); ok(row.rows[0].email === owner);
    const raceMd = bytes(markdown.replace("不虚构事实", "保持事实边界并检查渠道"));
    const race = await Promise.all([1, 2, 3, 4].map(() => route.POST(request(raceMd))));
    ok(race.filter(response => response.status === 201).length === 1 && race.filter(response => response.status === 200).length === 3);
    const raceBodies = await Promise.all(race.map(response => response.json())); ok(new Set(raceBodies.map(body => body.skill.id)).size === 1);
    const count = await db.getPool().query("SELECT count(*)::int n FROM app_image_skills WHERE email=$1", [owner]); ok(count.rows[0].n === 2);
    const importedZip = await route.POST(request(zip, "package.zip")); ok(importedZip.status === 201 && (await importedZip.json()).warnings.length === 1);
    ok((await route.POST(request(bytes("invalid"), "SKILL.md"))).status === 400);
    ok((await route.POST(request(Buffer.alloc(SKILL_IMPORT_MAX_BYTES + 1), "SKILL.md"))).status === 413);
    const chunked = new Request(f.origin + "/api/image-skills/import", { method: "POST", headers: { cookie: `nv_user=${signUserSession(owner, Date.now())}`, "content-type": "multipart/form-data; boundary=x" }, body: Buffer.alloc(SKILL_IMPORT_MAX_REQUEST_BYTES + 1) });
    ok((await route.POST(chunked)).status === 413);
    const noFile = new FormData(); noFile.set("owner", other);
    ok((await route.POST(new Request(f.origin + "/api/image-skills/import", { method: "POST", headers: { cookie: `nv_user=${signUserSession(owner, Date.now())}` }, body: noFile }))).status === 400);
    const patch = (revision: number) => new Request(f.origin + "/api/image-skills", { method: "PATCH", headers: { cookie: `nv_user=${signUserSession(owner, Date.now())}`, "content-type": "application/json" }, body: JSON.stringify({ selection: { id: first.skill.id, revision }, definition: { ...md.definition, instructions: md.definition.instructions + "\n补充品牌统一规则。" } }) });
    ok((await crud.PATCH(patch(1))).status === 200 && (await crud.PATCH(patch(1))).status === 409);
    const reimport = await route.POST(request()); ok(reimport.status === 201); // Changed revision is never silently overwritten.
    const archivedSkill = (await reimport.json()).skill; await store.archiveImageSkill(owner, archivedSkill);
    ok((await route.POST(request())).status === 201);
    await assert.rejects(store.resolveImageSkill(other, first.skill), /不存在/); checks++;
    console.log(`SKILL_IMPORT=PASS CHECKS=${checks} PARSER=PASS STORAGE=POSTGRES API=AUTHENTICATED OWNER_ISOLATION=PASS CONCURRENT_IDEMPOTENCY=PASS CAS=PASS PROVIDER_CALLS=0`);
  } finally { await db.getPool().end(); await f.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
