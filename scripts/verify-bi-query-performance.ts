import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseBiQuery } from "../src/lib/bi/contracts";

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1");
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
  const base = process.argv[2] || "888f5e2f939d235755d81f6236a721ac2f68260d";
  const out = resolve(process.argv[3] || "output/bi-performance-release47-20261021");
  mkdirSync(out, { recursive: true });
  const tag = randomUUID().replaceAll("-", "");
  const oldRepository = resolve(`src/lib/bi/.baseline-${tag}.ts`);
  const oldModels = resolve(`src/lib/bi/.models-${tag}.ts`);
  writeFileSync(oldRepository, execFileSync("git", ["show", `${base}:src/lib/bi/repository.ts`], {encoding:"utf8"}).replace('"./model-chain"', `"./.models-${tag}"`));
  writeFileSync(oldModels, execFileSync("git", ["show", `${base}:src/lib/bi/model-chain.ts`]));
  const { Pool } = await import("pg");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `bi_perf_${tag}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  process.env.SETTINGS_SECRET = "bi-performance-fixture-only-012345678901234567890123456789";
  const db = await import("../src/lib/db");
  const modified = await import("../src/lib/bi/repository");
  const baseline = await import(pathToFileURL(oldRepository).href);
  const pool = db.getPool();
  try {
    await modified.ensureBiSchema();
    await baseline.ensureBiSchema();
    await db.getOrCreateUser("alpha@example.test", "Alpha User");
    await db.getOrCreateUser("beta@example.test", "Beta User");
    await pool.query(`INSERT INTO app_bi_account_profiles(email,account_type,company,updated_by) VALUES('alpha@example.test','enterprise','Perf Company','fixture')`);
    // Real TOAST-sized snapshots and call histories, no supplier requests.
    await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,cost,reserved_cost,created_at,updated_at)
      SELECT 'perf-'||g,CASE WHEN g%3=0 THEN 'orphan@example.test' WHEN g%2=0 THEN 'alpha@example.test' ELSE 'beta@example.test' END,'generate',
        jsonb_build_object('status',CASE WHEN g%7=0 THEN 'error' ELSE 'done' END,'stage',CASE WHEN g%11=0 THEN 'checking' ELSE '' END,'error',CASE WHEN g%13=0 THEN '核查原因' ELSE '' END,
          'paidOperations',jsonb_build_object('op-'||g,jsonb_build_object('state','succeeded')),'padding',(SELECT string_agg(md5((g*1000+n)::text),'') FROM generate_series(1,200) n)),
        jsonb_build_object('p',jsonb_build_object('prompt','prompt-'||g,'model','fixture','resolution','1K')),true,6,0,
        '2026-10-20'::timestamptz+g*interval '1 second','2026-10-20'::timestamptz+g*interval '1 second'
      FROM generate_series(1,8000) g`);
    await pool.query(`INSERT INTO app_bi_model_calls(id,email,operation,operation_id,wire_model,state,duration_ms,created_at)
      SELECT 'call-'||g,email,'image',CASE WHEN g%2=0 THEN 'op-'||g ELSE id END,'wire','succeeded',10,created_at FROM app_image_jobs JOIN generate_series(1,8000) g ON id='perf-'||g`);
    await pool.query(`INSERT INTO app_canvas_image_tasks(id,email,source_artwork_id,status,created_at) VALUES('canvas-perf','alpha@example.test','source','completed','2026-10-20T08:00:00Z');
      INSERT INTO app_video_tasks(id,email,upstream_id,status,created_at) VALUES('video-perf','beta@example.test','fixture','failed','2026-10-20T08:01:00Z');
      INSERT INTO app_ledger(id,email,delta,kind,reason) VALUES('led-image-perf-8000','alpha@example.test',-6,'consume','fixture'); ANALYZE`);
    const clean = (v: any) => { const { generatedAt, ...rest } = v; return rest; };
    const cases: Record<string,string>[] = [
      {}, {email:"alpha@example.test"}, {email:"orphan@example.test"}, {q:"Alpha"}, {q:"Perf Company"}, {q:"orphan"},
      {accountType:"enterprise"}, {accountType:"unknown"}, {status:"review"}, {status:"error"}, {page:"2"}, {page:"10000"},
      {from:"2026-10-21",to:"2026-10-21"}, {section:"users",q:"Alpha"}, {section:"calls",email:"beta@example.test"},
    ];
    const results = [];
    for (const filters of cases) {
      const q = parseBiQuery(new URLSearchParams({section:"operations",from:"2026-10-20",to:"2026-10-20",size:"30",...filters}));
      const start = performance.now(); const old = await baseline.queryBi(q); const oldMs = performance.now()-start;
      const next = performance.now(); const current = await modified.queryBi(q); const newMs = performance.now()-next;
      assert.deepEqual(clean(current), clean(old), JSON.stringify(filters));
      results.push({filters, total:current.total, rows:current.rows.length, baselineMs:Math.round(oldMs),modifiedMs:Math.round(newMs)});
    }
    // Capture the actual generated SQL for bounded read-only production EXPLAIN.
    const captured: {sql:string;values:any[]}[]=[];
    const wrapped = new WeakSet();
    pool.on("acquire", client => {
      if(wrapped.has(client)) return; wrapped.add(client);
      const query = client.query.bind(client);
      (client as any).query = (...args:any[]) => {
        const [sql,values]=args;
        if(typeof sql==="string" && sql.includes("selected AS MATERIALIZED")) captured.push({sql,values});
        return (query as any)(...args);
      };
    });
    await modified.queryBi(parseBiQuery(new URLSearchParams({section:"operations",from:"2026-09-22",to:"2026-10-21"})));
    writeFileSync(resolve(out,"performance.json"),JSON.stringify(results,null,2));
    writeFileSync(resolve(out,"page-query.json"),JSON.stringify(captured[0],null,2));
    console.log(`BI_PERFORMANCE=PASS cases=${results.length} jobs=8000 calls=8000 equivalent=true supplierCalls=0`);
    console.log(JSON.stringify(results));
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
    unlinkSync(oldRepository);unlinkSync(oldModels);
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });

