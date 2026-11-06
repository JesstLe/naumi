/** Hot-path indexes and keyed UNION lookups against an isolated local Postgres
 * (DB name must contain "fixture"). Seeds production-shaped volume, captures plans
 * before/after scripts/ops/hot-path-indexes.ts --apply, and proves the two
 * rewritten creation lookups return exactly the former OR results.
 * Run: NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=postgres://...@127.0.0.1:<port>/<x>_fixture \
 *      npx tsx --conditions react-server scripts/verify-hot-path-indexes.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const source = (file: string, start: string, end: string) => { const text = readFileSync(file, "utf8"), i = text.indexOf(start); assert.ok(i >= 0, `${file}: ${start}`); const j = text.indexOf(end, i + start.length); return text.slice(i, j).trim(); };
// The committed SQL, read from source so the test cannot drift from the code.
const outcomeUnion = source("src/lib/saas/creation-writer.ts", "SELECT id FROM app_creation_records WHERE actor_email=$3", "`,[kind");
const billingUnion = source("src/lib/billing/synchronous-operation.ts", "SELECT scope_kind,tenant_id FROM app_creation_records WHERE actor_email=$2", "`,[id");
const outcomeOr = `SELECT DISTINCT c.id FROM app_creation_records c LEFT JOIN app_creation_links l ON l.creation_id=c.id
  WHERE c.actor_email=$3 AND ((c.source_kind=$1 AND c.source_id=$2) OR (l.target_type=$1 AND l.target_id=$2 AND l.actor_email=$3))`;
const billingOr = `SELECT DISTINCT c.scope_kind,c.tenant_id FROM app_creation_records c LEFT JOIN app_creation_links l ON l.creation_id=c.id
  WHERE c.actor_email=$2 AND ((c.source_kind=$3 AND c.source_id=$1) OR (l.target_type='billing' AND l.target_id=$1 AND l.actor_email=$2))`;

// Hot statements as written in code (file:line in docs/changes/2026-11-07-optimize-batch2.md).
const HOT = {
  releaseStatus: { sql: `SELECT activity_kind,state,count(*) FROM app_release_activities WHERE instance_id='i-current' AND state<>'finished' GROUP BY activity_kind,state`, index: "app_release_activities_open" },
  claim: { sql: `SELECT 1 FROM app_release_activities WHERE activity_kind='accepted-work' AND work_scope='scope-1' AND admission_key='k77' AND state IN ('active','unknown') LIMIT 1`, index: "app_release_background_open" },
  retention: { sql: `SELECT id,finished_at FROM app_release_activities WHERE state='finished' AND activity_kind='request' AND finished_at<now()-interval '15 minutes' ORDER BY finished_at LIMIT 100`, index: "app_release_activities_finished_kind", explainOnly: true },
  ledger: { sql: `SELECT -sum(delta) FROM app_ledger WHERE email='u7@x.test' AND kind='consume' AND delta<0`, index: "app_ledger_email_created" },
  imageLinks: { sql: `SELECT c.id,c.actor_email FROM app_creation_records c JOIN app_creation_links l ON l.creation_id=c.id WHERE l.target_id='t-img-5' AND l.target_type LIKE 'image:%'`, index: "app_creation_link_target_id" },
  dueJobs: { sql: `SELECT id,kind,updated_at FROM app_image_jobs WHERE (lease_until IS NULL OR lease_until<now()) AND (snapshot->>'status'='pending' OR (kind='imagegen' AND snapshot->>'status'='running') OR snapshot->'sources' @> '[{"status":"redoing"}]'::jsonb)`, index: "app_image_jobs_due_v2" },
  failedParents: { sql: `SELECT id,email FROM app_image_jobs WHERE kind='imagegen' AND snapshot->>'status' IN ('error','needs_attention') AND lease_token IS NULL AND (snapshot->>'deliveryRecoveryRequested'='true' OR (created_at>now()-interval '7 days' AND updated_at<now()-interval '20 seconds' AND COALESCE((snapshot->>'deliveryRecoveryAttempts')::int,0)<5)) ORDER BY updated_at DESC,id LIMIT 16`, index: "app_image_jobs_imagegen_failed" },
  openParent: { sql: `SELECT parent.id FROM app_image_jobs parent CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(parent.snapshot->'children')='object' THEN parent.snapshot->'children' ELSE '{}'::jsonb END) link JOIN app_image_jobs child ON child.id=link.value->>'jobId' AND child.kind='generate' AND child.email=parent.email WHERE child.id='job-open-child' AND parent.kind='imagegen' AND parent.snapshot->>'status' IN ('pending','running') AND (parent.lease_token IS NULL OR parent.lease_until<now()) AND link.value->>'state'='submitted' AND child.snapshot->>'status' IN ('done','error','needs_attention') AND child.lease_token IS NULL`, index: "app_image_jobs_imagegen_open" },
} as const;

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1");
  const target = new URL(process.env.DATABASE_URL!); assert.equal(target.hostname, "127.0.0.1"); assert.match(target.pathname, /fixture/);
  process.env.SETTINGS_SECRET ||= "hot-path-settings-fixture-012345678901234567890";
  process.env.VIDEO_WORKER_SECRET ||= "hot-path-worker-fixture-012345678901234567890";
  const db = await import("../src/lib/db"), release = await import("../src/lib/release-runtime/store"), creation = await import("../src/lib/saas/creation-schema");
  const pool = db.getPool(); let checks = 0; const ok = (v: unknown, m: string) => { assert.ok(v, m); checks++; };
  try {
    await db.ensureSchema(); await release.ensureReleaseSchema(); await creation.ensureCreationSchema();
    // ---- production-shaped volume ----
    await pool.query(`INSERT INTO app_release_activities(id,instance_id,boot_id,runtime_id,activity_kind,state,started_at,heartbeat_at,finished_at,work_scope,work_key,admission_key)
      SELECT gen_random_uuid(),'i-current','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','accepted-work','finished',now()-interval '1 day',now(),now()-(g||' seconds')::interval,'scope-'||(g%5),'k'||g,'k'||g FROM generate_series(1,150000) g`);
    await pool.query(`INSERT INTO app_release_activities(id,instance_id,boot_id,runtime_id,activity_kind,state,work_scope,work_key,admission_key)
      SELECT gen_random_uuid(),'i-current','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','accepted-work','active','scope-1','k-live'||g,'k-live'||g FROM generate_series(1,3) g`);
    await pool.query(`INSERT INTO app_ledger(id,email,delta,reason,kind,created_at) SELECT 'led-'||g,'u'||(g%40)||'@x.test',-(g%9)-1,'fixture',CASE WHEN g%2=0 THEN 'consume' ELSE 'grant' END,now()-(g||' minutes')::interval FROM generate_series(1,30000) g`);
    await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id) SELECT 'cr-'||g,'u'||(g%40)||'@x.test','personal','image','s'||g FROM generate_series(1,20000) g`);
    await pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) SELECT 'cr-'||(g%20000+1),(ARRAY['image:generate','video','billing'])[g%3+1],'t-'||g,'u'||((g%20000+1)%40)||'@x.test' FROM generate_series(1,110000) g`);
    await pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES ('cr-5','image:generate','t-img-5','u5@x.test')`);
    // ~10KB of poorly compressible snapshot per job, like stored image checkpoints.
    await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,created_at,updated_at)
      SELECT 'job-'||g,'u'||(g%40)||'@x.test',CASE WHEN g%3=0 THEN 'imagegen' ELSE 'generate' END,
        jsonb_build_object('status',CASE WHEN g%25=0 THEN 'error' ELSE 'done' END,'checkpoint',(SELECT string_agg(md5(random()::text||g||x),'') FROM generate_series(1,320) x)),'{}'::jsonb,false,now()-(g||' minutes')::interval,now()-(g||' minutes')::interval
      FROM generate_series(1,8000) g`);
    await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES
      ('job-pending','u1@x.test','generate','{"status":"pending"}','{}',false),
      ('job-open-child','u2@x.test','generate','{"status":"done"}','{}',false),
      ('job-open-parent','u2@x.test','imagegen','{"status":"running","children":{"0":{"jobId":"job-open-child","state":"submitted"}}}','{}',false)`);
    await pool.query("ANALYZE");
    const explain = async (sql: string, analyze = true) => (await pool.query(`EXPLAIN (${analyze ? "ANALYZE," : ""}COSTS OFF${analyze ? ",TIMING OFF,SUMMARY ON" : ""}) ${sql}`)).rows.map(r => r["QUERY PLAN"]).join("\n");
    const ms = (plan: string) => Number(/Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? NaN);
    const before: Record<string, string> = {};
    for (const [name, q] of Object.entries(HOT)) before[name] = await explain(q.sql, !("explainOnly" in q));
    for (const name of ["releaseStatus", "dueJobs", "ledger", "imageLinks"]) ok(!before[name].includes((HOT as any)[name].index), `${name} has no hot-path index before apply`);
    // ---- the actual ops runner ----
    const run = (args: string[]) => spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/ops/hot-path-indexes.ts", ...args], { encoding: "utf8", env: { ...process.env, NAUMI_DEPLOY_THREE_LOCKS_HELD: "1" } });
    const applied = run(["--apply"]); ok(applied.status === 0 && /HOT_PATH_INDEXES=PASS/.test(applied.stdout), `ops --apply: ${applied.stderr.slice(-400)}`);
    const verified = run(["--verify"]); ok(verified.status === 0 && (verified.stdout.match(/=VALID /g) || []).length === Object.keys(HOT).length, "ops --verify lists every index VALID");
    await pool.query("ANALYZE");
    const timings: Record<string, string> = {};
    for (const [name, q] of Object.entries(HOT)) {
      const plan = await explain(q.sql, !("explainOnly" in q));
      ok(plan.includes(q.index), `${name} uses ${q.index}:\n${plan}`);
      if (!("explainOnly" in q)) timings[name] = `${ms(before[name]).toFixed(2)}ms -> ${ms(plan).toFixed(2)}ms`;
    }
    // ---- keyed UNION == former OR ----
    const ids = (rows: { id: string }[]) => rows.map(r => r.id).sort();
    const cases: [string, string, string][] = [["image", "s5", "u5@x.test"], ["image:generate", "t-img-5", "u5@x.test"], ["video", "t-1", "u2@x.test"], ["billing", "t-2", "u3@x.test"], ["image", "s5", "u6@x.test"], ["image", "missing", "u5@x.test"]];
    await pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id) VALUES ('cr-both','u9@x.test','personal','video','dual')`);
    await pool.query(`INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES ('cr-both','video','dual','u9@x.test'),('cr-9','video','dual','u9@x.test')`);
    cases.push(["video", "dual", "u9@x.test"]);
    for (const params of cases) assert.deepEqual(ids((await pool.query(outcomeUnion, params)).rows), ids((await pool.query(outcomeOr, params)).rows), `outcome ${params}`);
    checks++;
    const scopes = (rows: { scope_kind: string; tenant_id: string | null }[]) => rows.map(r => `${r.scope_kind}:${r.tenant_id}`).sort();
    for (const [, id, email] of cases) for (const feature of ["image", "video", "billing"]) assert.deepEqual(scopes((await pool.query(billingUnion, [id, email, feature])).rows), scopes((await pool.query(billingOr, [id, email, feature])).rows), `billing ${id} ${email} ${feature}`);
    checks++;
    const unionPlan = await explain(outcomeUnion.replaceAll("$1", "'video'").replaceAll("$2", "'dual'").replaceAll("$3", "'u9@x.test'"));
    ok(!/Seq Scan on app_creation_links/.test(unionPlan), `UNION lookup does not scan every link:\n${unionPlan}`);
    console.log(JSON.stringify(timings));
    console.log(`HOT_PATH_INDEXES_VERIFY=PASS CHECKS=${checks}`);
  } finally { await pool.end().catch(() => {}); await (release as any).closeReleasePool?.().catch?.(() => {}); }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
