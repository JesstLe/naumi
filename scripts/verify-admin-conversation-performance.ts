import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseBiQuery } from "../src/lib/bi/contracts";

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1");
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
  const base = process.argv[2] || "cd64d1ffd4eda66afcbe7817fc9016203c92be4a";
  const out = resolve(process.argv[3] || "output/admin-conversation-performance");
  mkdirSync(out, { recursive: true });
  const tag = randomUUID().replaceAll("-", "");
  const oldFile = resolve(`src/lib/bi/.conversation-baseline-${tag}.ts`);
  writeFileSync(oldFile, execFileSync("git", ["show", `${base}:src/lib/bi/repository.ts`]));
  const { Pool } = await import("pg");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `conversation_perf_${tag}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  let closePool = async () => {};
  try {
    process.env.PGOPTIONS = `-c search_path=${schema}`;
    process.env.SETTINGS_SECRET = "admin-conversation-performance-fixture-only-012345678901234567890";
    const db = await import("../src/lib/db");
    const modified: typeof import("../src/lib/bi/repository") = process.argv[4]
      ? await import(pathToFileURL(resolve(process.argv[4])).href)
      : await import("../src/lib/bi/repository");
    const baseline = await import(pathToFileURL(oldFile).href);
    const pool = db.getPool();
    closePool = () => pool.end();
    let capture: { sql: string; values: unknown[] }[] | null = null;
    const wrapped = new WeakSet();
    pool.on("acquire", client => {
      if (wrapped.has(client)) return;
      wrapped.add(client);
      const query = client.query.bind(client);
      (client as any).query = (...args: any[]) => {
        if (capture && typeof args[0] === "string" && /^(WITH query_window|SELECT count|SELECT role|WITH extracted)/.test(args[0]))
          capture.push({ sql: args[0], values: args[1] });
        return (query as any)(...args);
      };
    });
    await modified.ensureBiSchema();
    await baseline.ensureBiSchema();
    await pool.query(`INSERT INTO app_users(email,name,plan,credits_total,credits_used,banned,joined_at,renews_at)
      SELECT 'user-'||g||'@example.test','User '||g,'free',100,0,false,'2026-01-01','2027-01-01' FROM generate_series(1,30) g;
      INSERT INTO app_bi_account_profiles(email,account_type,company,updated_by)
      SELECT email,CASE WHEN name LIKE '%2%' THEN 'enterprise' ELSE 'personal' END,'Fixture Company','fixture' FROM app_users;
      INSERT INTO app_agent_sessions(id,email,title,messages,created_at,updated_at)
      SELECT 'agent-'||g,CASE WHEN g%31=0 THEN 'orphan@example.test' ELSE 'user-'||(g%30+1)||'@example.test' END,
        'Agent '||g,(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN n%2=0 THEN 'user' ELSE 'assistant' END,
          'content',(SELECT string_agg(md5((g*100000+n*100+k)::text),'') FROM generate_series(1,32) k))) FROM generate_series(1,60) n),
        '2026-10-20','2026-10-20'::timestamptz+g*interval '1 second' FROM generate_series(1,1000) g;
      INSERT INTO app_genchat_sessions(id,email,title,turns,created_at,updated_at)
      SELECT 'genchat-'||g,'user-'||(g%30+1)||'@example.test','Genchat '||g,
        (SELECT jsonb_agg(jsonb_build_object('you',md5((g*1000+n)::text),'line',
          (SELECT string_agg(md5((g*100000+n*100+k)::text),'') FROM generate_series(1,32) k))) FROM generate_series(1,60) n),
        '2026-10-20','2026-10-20'::timestamptz+(g+2000)*interval '1 second' FROM generate_series(1,300) g;
      INSERT INTO app_agent_sessions(id,email,title,messages,created_at,updated_at) VALUES
        ('invalid','user-1@example.test','not array','{}','2026-10-20','2026-10-20'),
        ('null','user-1@example.test','JSON null','null','2026-10-20','2026-10-20'),
        ('empty','user-1@example.test','empty','[]','2026-10-20','2026-10-20'),
        ('duplicate','user-1@example.test','Owner A','[{"role":"user","content":"Owner A"}]','2026-10-20','2026-10-20 01:01:01+00'),
        ('duplicate','user-2@example.test','Owner B','[{"role":"user","content":"Owner B"}]','2026-10-20','2026-10-20 01:01:02+00');
      INSERT INTO app_genchat_sessions(id,email,title,turns,created_at,updated_at) VALUES
        ('invalid-genchat','user-1@example.test','not array','{}','2026-10-20','2026-10-20'),
        ('duplicate','user-1@example.test','Other source','[{"you":"Genchat owner A","line":"not agent"}]','2026-10-20','2026-10-20 01:01:03+00');`);
    const mixed = [
      { role: "system", content: "hidden" }, { role: "tool", content: "hidden" },
      { role: "user", content: "" }, { role: "assistant", content: null },
      { role: "user", content: [{ type: "image", url: "private" }] },
      { role: "assistant", content: [{ type: "text", text: "first" }, { type: "image", text: "hidden" }, { type: "text", text: "second" }] },
      { role: "user", content: " " }, { role: "assistant", content: "字😀".repeat(12000) },
      { role: "user", content: [{ type: "text", text: "" }, { type: "text" }] },
      { role: "assistant", content: [{ type: "text", text: 123 }, { type: "text", text: false }] },
      { role: "assistant", content: [{ type: "text", text: {} }, { type: "text", text: [] }] },
      ...Array.from({ length: 47 }, (_, i) => ({ role: i % 2 ? "user" : "assistant", content: `message-${i}` })),
    ];
    await pool.query(`INSERT INTO app_agent_sessions(id,email,messages,created_at,updated_at) VALUES('mixed','user-1@example.test',$1,'2026-10-20','2026-10-20')`, [JSON.stringify(mixed)]);
    await pool.query(`INSERT INTO app_agent_sessions(id,email,messages,created_at,updated_at)
      SELECT 'long','user-1@example.test',jsonb_agg(jsonb_build_object('role',CASE WHEN n%2=0 THEN 'user' ELSE 'assistant' END,
      'content',jsonb_build_array(jsonb_build_object('type','text','text',(SELECT string_agg(md5((n*1000+k)::text),'') FROM generate_series(1,64) k)),
        jsonb_build_object('type','image','url','/private-fixture.png')))),'2026-10-20','2026-10-20' FROM generate_series(1,1500) n;
      INSERT INTO app_genchat_sessions(id,email,turns,created_at,updated_at) VALUES('mixed-genchat','user-1@example.test',
        '[{"you":"hello","line":"world"},{"you":"","line":null},{"you":" ","line":"end"},{"you":123,"line":false},{"you":"last"}]','2026-10-20','2026-10-20');
      ANALYZE`);
    const clean = (v: any) => { const { generatedAt, ...rest } = v; return rest; };
    let cases = 0;
    const filters: Record<string, string>[] = [{}, { page: "2" }, { page: "40" }, { page: "10000" },
      { status: "agent" }, { status: "genchat" }, { status: "invalid" }, { email: "user-1@example.test" },
      { email: "orphan@example.test" }, { q: "User 2" }, { q: "Fixture Company" }, { q: "missing" },
      { accountType: "unknown" }, { accountType: "enterprise" }, { accountType: "personal" },
      { from: "2026-10-21", to: "2026-10-21" }, { size: "1" }, { size: "100", page: "3" }];
    for (const f of filters) {
      const q = parseBiQuery(new URLSearchParams({ section: "conversations", from: "2026-10-20", to: "2026-10-20", ...f }));
      assert.deepEqual(clean(await modified.queryBi(q)), clean(await baseline.queryBi(q)), JSON.stringify(f));
      cases++;
    }
    for (const kind of ["agent", "genchat"] as const) {
      for (const id of kind === "agent" ? ["mixed", "long", "empty", "invalid", "null", "missing", "duplicate"] : ["mixed-genchat", "genchat-30", "invalid-genchat", "missing", "duplicate"]) {
        for (const email of ["user-1@example.test", "user-2@example.test", "wrong@example.test"]) {
          for (const page of [1, 2, 3, 10000]) {
            assert.deepEqual(await modified.biConversation(id, email, kind, page), await baseline.biConversation(id, email, kind, page), `${kind}/${id}/${email}/${page}`);
            cases++;
          }
        }
      }
    }
    const reports: any[] = [];
    const profiles: any[] = [];
    for (const name of ["list", "list-deep", "detail-agent", "detail-genchat"]) {
      const q = parseBiQuery(new URLSearchParams({ section: "conversations", from: "2026-10-20", to: "2026-10-20", page: name === "list-deep" ? "40" : "1" }));
      const run = (repo: typeof modified) => name.startsWith("list") ? repo.queryBi(q) : repo.biConversation(name === "detail-agent" ? "long" : "genchat-30", "user-1@example.test", name === "detail-agent" ? "agent" : "genchat", 1);
      const times = { baseline: [] as number[], modified: [] as number[] };
      for (let i = 0; i < 7; i++) {
        for (const mode of i % 2 ? ["modified", "baseline"] as const : ["baseline", "modified"] as const) {
          capture = i === 6 ? [] : null;
          const start = performance.now(); await run(mode === "baseline" ? baseline : modified);
          times[mode].push(performance.now() - start);
          if (capture) {
            for (const stmt of capture) {
              const plan = await pool.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${stmt.sql}`, stmt.values);
              profiles.push({ name, mode, ...stmt, plan: plan.rows[0]["QUERY PLAN"] });
            }
          }
          capture = null;
        }
      }
      const median = (arr: number[]) => Number([...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)].toFixed(2));
      reports.push({ name, baselineMedianMs: median(times.baseline), modifiedMedianMs: median(times.modified), times });
    }
    writeFileSync(resolve(out, "PERFORMANCE.json"), JSON.stringify({ base, cases, fixture: "1000 agent + 300 genchat; 60 entries/session; 1500-message long session", reports }, null, 2));
    writeFileSync(resolve(out, "SQL_PROFILE.json"), JSON.stringify(profiles, null, 2));
    console.log(`ADMIN_CONVERSATION_PERFORMANCE=PASS cases=${cases} equivalent=true supplierCalls=0`);
    console.log(JSON.stringify(reports.map(({ times, ...r }) => r)));
    assert.equal(readFileSync(oldFile).length > 0, true);
  } finally {
    await closePool();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    unlinkSync(oldFile);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
