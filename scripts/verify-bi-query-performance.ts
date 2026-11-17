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
    // Overview equivalence needs real mixed facts, spanning an Asia/Shanghai day boundary.
    await pool.query(`INSERT INTO app_ledger(id,email,delta,kind,reason,created_at) VALUES
       ('first','alpha@example.test',-23,'consume','fixture','2026-10-19T16:00:00Z'),
       ('next','alpha@example.test',-31,'consume','fixture','2026-10-20T16:00:00Z'),
       ('adjust','beta@example.test',-100,'consume','管理员调整积分','2026-10-20T01:00:00Z'),
       ('refund-only','beta@example.test',7,'refund','fixture','2026-10-20T02:00:00Z'),
       ('orphan','orphan@example.test',-3,'consume','fixture','2026-10-20T03:00:00Z'),
       ('outside','alpha@example.test',-99,'consume','fixture','2026-10-21T16:00:00Z');
      INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,created_at,deleted_at) VALUES
       ('live','alpha@example.test','fixture','','','','','2026-10-20T09:00:00Z',NULL),
       ('trashed','beta@example.test','fixture','','','','','2026-10-20T09:00:00Z','2026-10-29T00:00Z'),
       ('orphan','orphan@example.test','fixture','','','','','2026-10-20T16:00:00Z',NULL);
      INSERT INTO app_orders(id,email,kind,item_id,amount,status,provider,paid_at) VALUES
       ('wechat','alpha@example.test','pack','fixture',123,'paid','wechat','2026-10-19T16:00:00Z'),
       ('mock','beta@example.test','pack','fixture',777,'paid','mock','2026-10-20T16:00:00Z'),
       ('alipay','orphan@example.test','pack','fixture',456,'paid','alipay','2026-10-20T16:00:00Z'),
       ('unpaid','alpha@example.test','pack','fixture',999,'pending','alipay',NULL)`);
    const clean = (v: any) => { const { generatedAt, ...rest } = v; return rest; };
    const cases: Record<string,string>[] = [
      {}, {email:"alpha@example.test"}, {email:"orphan@example.test"}, {q:"Alpha"}, {q:"Perf Company"}, {q:"orphan"},
      {accountType:"enterprise"}, {accountType:"unknown"}, {status:"review"}, {status:"error"}, {page:"2"}, {page:"10000"},
      {from:"2026-10-21",to:"2026-10-21"}, {section:"users",q:"Alpha"}, {section:"calls",email:"beta@example.test"},
      {section:'overview',to:'2026-10-21'}, {section:'overview',to:'2026-10-21',email:'alpha@example.test'},
      {section:'overview',to:'2026-10-21',q:'orphan',accountType:'unknown'}, {section:'overview',accountType:'enterprise'},
      {section:'overview',from:'2026-10-22',to:'2026-10-22'},
    ];
    const results = [];
    const overviewStatements: string[] = [];
    const counted = new WeakSet();
    pool.on('acquire',client=>{
      if(counted.has(client))return;counted.add(client);
      const query=client.query.bind(client);
      (client as any).query=(...args:any[])=>{
        if(typeof args[0]==='string'&&args[0].startsWith('WITH query_window'))overviewStatements.push(args[0]);
        return (query as any)(...args);
      };
    });
    for (const filters of cases) {
      const q = parseBiQuery(new URLSearchParams({section:"operations",from:"2026-10-20",to:"2026-10-20",size:"30",...filters}));
      overviewStatements.length=0;
      const start = performance.now(); const old = await baseline.queryBi(q); const oldMs = performance.now()-start;
      const legacySql=overviewStatements.splice(0);
      const next = performance.now(); const current = await modified.queryBi(q); const newMs = performance.now()-next;
      assert.deepEqual(clean(current), clean(old), JSON.stringify(filters));
      if(filters.section==='overview'&&!filters.email&&!filters.q&&!filters.accountType&&filters.to==='2026-10-21'){
        const v=current.overview!;
        assert.deepEqual([v.consumed,v.refunded,v.activeUsers,v.artworks,v.deletedArtworks,v.receivedCents,v.mockCents],[57,7,2,2,1,579,777]);
        assert.deepEqual(v.daily.map(d=>[d.date,d.consumed,d.artworks,d.receivedCents]),[['2026-10-20',26,1,123],['2026-10-21',31,1,456]]);
      }
      const queries=q.section==='overview'?{baseline:legacySql.length,modified:overviewStatements.length}:undefined;
      if(queries&&base=== 'dbdbc2ed96a890668da5c037cc9f67218f3cc1e3'){
        assert.deepEqual(queries,{baseline:9,modified:6});
        for(const table of ['app_ledger','app_artworks','app_orders']){
          assert.equal(legacySql.filter(sql=>sql.includes(`FROM ${table} `)).length,2);
          assert.equal(overviewStatements.filter(sql=>sql.includes(`FROM ${table} `)).length,1);
        }
      }
      results.push({filters, total:current.total, rows:current.rows.length, baselineMs:Math.round(oldMs),modifiedMs:Math.round(newMs),queries});
    }
    // Scale the three activity fact tables independently so a reduction in
    // round trips is not mistaken for a reduction in underlying row scans.
    let overviewPlans:unknown;
    if(base==='dbdbc2ed96a890668da5c037cc9f67218f3cc1e3'){
      await pool.query(`INSERT INTO app_ledger(id,email,delta,kind,reason,created_at)
        SELECT 'ledger-scale-'||g,'ledger-'||(g%4096)||'@fixture.test',CASE WHEN g%9=0 THEN 2 ELSE -3 END,
          CASE WHEN g%9=0 THEN 'refund' ELSE 'consume' END,'fixture','2026-10-19T16:00Z'::timestamptz+(g%2)*interval '1 day'+(g%3600)*interval '1 second'
        FROM generate_series(1,100000) g;
        INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,created_at,deleted_at)
        SELECT 'art-scale-'||g,'ledger-'||(g%4096)||'@fixture.test','fixture','','','','',
          '2026-10-19T16:00Z'::timestamptz+(g%2)*interval '1 day',CASE WHEN g%7=0 THEN '2026-11-01T00:00Z'::timestamptz END
        FROM generate_series(1,100000) g;
        INSERT INTO app_orders(id,email,kind,item_id,amount,status,provider,paid_at)
        SELECT 'order-scale-'||g,'ledger-'||(g%4096)||'@fixture.test','pack','fixture',g%100+1,'paid',CASE WHEN g%5=0 THEN 'mock' ELSE 'wechat' END,
          '2026-10-19T16:00Z'::timestamptz+(g%2)*interval '1 day'
        FROM generate_series(1,100000) g;
        ANALYZE app_ledger; ANALYZE app_artworks; ANALYZE app_orders;`);
      const q=parseBiQuery(new URLSearchParams({section:'overview',from:'2026-10-20',to:'2026-10-21'}));
      const args=[q.start,q.end,q.email,q.q,q.accountType],selected=(sql:string)=>/FROM app_(ledger|artworks|orders) /.test(sql);
      overviewStatements.length=0;const old=await baseline.queryBi(q),legacySql=overviewStatements.splice(0).filter(selected);
      const next=await modified.queryBi(q),currentSql=overviewStatements.splice(0).filter(selected);
      assert.deepEqual(clean(next),clean(old));assert.equal(legacySql.length,4);assert.equal(currentSql.length,1);
      const measure=async(sql:string[])=>{
        let buffers=0,ms=0;
        for(const statement of sql){
          const plan=(await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+statement,args)).rows[0]['QUERY PLAN'][0];
          buffers+=(plan.Plan['Shared Hit Blocks']??0)+(plan.Plan['Shared Read Blocks']??0);
          ms+=plan['Execution Time'];
        }
        return {buffers,ms};
      };
      const baselinePlan=await measure(legacySql),currentPlan=await measure(currentSql);
      assert(currentPlan.buffers<baselinePlan.buffers);
      overviewPlans={rows:300000,baseline:baselinePlan,modified:currentPlan};
      console.log('BI_OVERVIEW_FACT_PLANS',JSON.stringify(overviewPlans));
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
    if(overviewPlans)writeFileSync(resolve(out,'overview-activity-plans.json'),JSON.stringify(overviewPlans,null,2));
    console.log(`BI_PERFORMANCE=PASS cases=${results.length} jobs=8000 calls=8000 equivalent=true supplierCalls=0`);
    console.log(JSON.stringify(results));
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
    unlinkSync(oldRepository);unlinkSync(oldModels);
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });

