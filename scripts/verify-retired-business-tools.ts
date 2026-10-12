import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { readFileSync } from "node:fs";

async function main() {
  const baseline = process.argv.includes("--baseline");
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1");
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
  const schema = `retired_tools_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  await admin.query(`CREATE SCHEMA ${schema}`);
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  process.env.SETTINGS_SECRET = "retired-tools-isolated-fixture-signing-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Network calls forbidden in retirement verification"); };
  let db: typeof import("../src/lib/db") | undefined;
  try {
    db = await import("../src/lib/db");
    const { createNaumiTools, describeNaumiTools, AGENT_SYSTEM_PROMPT } = await import("../src/lib/agent/naumi-tools");
    const retired = ["yutang_summary", "yutang_list_tasks", "yutang_get_task", "yutang_create_task", "yutang_update_task", "review_history", "review_demo", "scm_preflight", "scm_doctor"];
    const request = new Request("http://127.0.0.1:3000/api/agent");
    const workbench = createNaumiTools(request, "retirement@local.test");
    const canvas = createNaumiTools(request, "retirement@local.test", undefined, undefined, { anchorId: "", imageUrls: [], ratio: "1:1", resolution: "1K", quality: "medium" });
    const names = workbench.map(tool => tool.name);
    assert.deepEqual(names, canvas.map(tool => tool.name));
    assert.equal(new Set(names).size, names.length);
    assert.deepEqual(retired.filter(name => names.includes(name)), baseline ? retired : []);
    for (const name of retired) assert.equal(AGENT_SYSTEM_PROMPT.includes(name), baseline);
    for (const name of ["generate_image", "cutout_image", "generate_aplus", "review_aplus_source", "list_comfy_workflows", "generate_video", "list_agent_tools", "analyze_competitor"]) assert(names.includes(name), name);
    const catalog = await workbench.find(tool => tool.name === "list_agent_tools")!.execute("retirement-catalog", {});
    const catalogText = catalog.content.filter(item => item.type === "text").map(item => "text" in item ? item.text : "").join("");
    for (const name of retired) assert.equal(catalogText.includes(`"${name}"`), baseline);
    assert.equal(describeNaumiTools(workbench).find(tool => tool.name === "list_agent_tools")!.write, false);
    await db.seedProjects();
    const slugs = ["yutang", "scm", "review-monitor"];
    const seeded = await db.listProjects(false);
    assert.deepEqual(slugs.filter(slug => seeded.some(row => row.slug === slug)), baseline ? slugs : []);
    for (const [index, slug] of slugs.entries()) await db.getPool().query(
      "INSERT INTO app_projects (slug,name,visible,agent_tool) VALUES ($1,$2,$3,true) ON CONFLICT(slug) DO UPDATE SET visible=EXCLUDED.visible",
      [slug, `Historical retired fixture ${slug}`, index !== 1],
    );
    await db.upsertProject({ slug: "retirement-active-fixture", name: "Preserved custom project", visible: true });
    for (const visible of [true, false]) {
      const projects = await db.listProjects(visible);
      assert(projects.some(row => row.slug === "retirement-active-fixture"));
      for (const slug of slugs) assert.equal(projects.some(row => row.slug === slug), baseline && (!visible || slug !== "scm"));
    }
    for (const slug of slugs) {
      if (baseline) await db.upsertProject({ slug, name: "Baseline editable project" });
      else await assert.rejects(db.upsertProject({ slug, name: "Should remain retired" }), /已废弃/);
    }
    assert.equal(Number((await db.getPool().query("SELECT count(*) FROM app_projects WHERE slug=ANY($1::text[])", [slugs])).rows[0].count), 3);
    const { signUserSession } = await import("../src/lib/native-auth");
    const api = await import("../src/app/api/hub/projects/route");
    const email = "retirement@local.test";
    await db.getOrCreateUser(email, "Retirement fixture");
    const cookie = `nv_user=${signUserSession(email, Date.now())}`;
    const apiRequest = (suffix = "", method = "GET", body?: unknown) => new Request(`http://127.0.0.1:3000/api/hub/projects${suffix}`, {
      method, headers: { cookie, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const suffix of ["", "?all=1"]) {
      const response = await api.GET(apiRequest(suffix));
      assert.equal(response.status, 200);
      const payload = await response.json();
      for (const slug of slugs) assert.equal(payload.projects.some((row: {slug: string}) => row.slug === slug), baseline);
      assert(payload.projects.some((row: {slug: string}) => row.slug === "retirement-active-fixture"));
    }
    for (const slug of slugs) assert.equal((await api.POST(apiRequest("", "POST", { slug: ` ${slug.toUpperCase()} `, name: "Blocked retired project" }))).status, baseline ? 200 : 410);
    assert.equal((await api.POST(apiRequest("", "POST", { slug: "active-api-fixture", name: "Active API project" }))).status, 200);
    if (!baseline) {
      for (const file of ["src/lib/agent/naumi-tools.ts", "docker-compose.yml", "scripts/staging/prepare-app-config.py", "scripts/staging/inspect-private-dependencies.mjs"]) {
        assert(!/YUTANG_|REVIEW_MONITOR_BASE|SCM_LISTING_BASE|yutang_|review_history|review_demo|scm_preflight|scm_doctor/.test(readFileSync(file, "utf8")), file);
      }
    }
    assert.equal(requests, 0);
    console.log(`RETIRED_BUSINESS_${baseline ? "BASELINE" : "MODIFIED"}=PASS tools=${names.length} retired=${baseline ? 9 : 0} registry_history_preserved=3 network_calls=0`);
    console.log(`HUB_RETIREMENT_API=PASS mode=${baseline ? "baseline" : "modified"} get=200 retired_post=${baseline ? 200 : 410} active_post=200`);
  } finally {
    globalThis.fetch = originalFetch;
    if (db) await db.getPool().end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
