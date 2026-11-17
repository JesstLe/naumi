import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {unlinkSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Client,type PoolClient} from 'pg';

type Statement={sql:string;params:unknown[]};
type Plan={['Node Type']:string;['Relation Name']?:string;['CTE Name']?:string;['Temp Read Blocks']?:number;['Temp Written Blocks']?:number;Plans?:Plan[]};
const nodes=(plan:Plan):Plan[]=>[plan,...(plan.Plans??[]).flatMap(nodes)];
const baselineSha='e0017aa2021206cf51fc54646acb21b758c04e34';

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
  const url=new URL(process.env.DATABASE_URL??'http://invalid');
  assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
  const suffix=randomUUID().replaceAll('-',''), schema='analytics_window_'+suffix;
  process.env.PGOPTIONS=`-c search_path=${schema}`;
  process.env.SETTINGS_SECRET='fixture-analytics-comparison-window-0123456789';
  const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
  const {getOrCreateUser}=await import('../src/lib/db');
  const enterprise=await import('../src/lib/enterprise/server');
  const current=await import('../src/lib/enterprise/analytics');
  const pool=getPool(),fixture=new Client({connectionString:url.toString()});
  const oldFile=resolve(`src/lib/enterprise/.analytics-window-baseline-${suffix}.ts`);
  let baselineCreated=false;
  await fixture.connect();
  try {
    await fixture.query(`CREATE SCHEMA ${schema}`);
    await enterprise.ensureEnterpriseSchema();
    const id=randomUUID(),owner='owner@window.fixture',director='director@window.fixture',outsider='outside@window.fixture';
    for(const email of [owner,director,outsider])await getOrCreateUser(email);
    await pool.query(`INSERT INTO app_users(email,name,renews_at)
      SELECT 'w'||i||'@window.fixture','Member '||i,now()+interval '30 days' FROM generate_series(0,47)i`);
    await pool.query("INSERT INTO app_team_access_grants(email,scope,starts_at,created_by,updated_by) VALUES($1,'owned',now()-interval '1 day','fixture','fixture')",[owner]);
    await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Window fixture',$2,now()+interval '3 days')",[id,owner]);
    await pool.query(`INSERT INTO app_account_team_members(email,team_id) SELECT email,$1 FROM app_users WHERE email=$2 OR email LIKE 'w%@window.fixture'`,[id,director]);
    await enterprise.activateEnterprise({email:'fixture-admin',admin:true,consoleAdmin:true},id,director,[]);
    await pool.query(`INSERT INTO app_ledger(id,email,kind,reason,delta,created_at)
      SELECT 'lw-'||i,'w'||(i%48)||'@window.fixture',CASE i%7 WHEN 1 THEN 'refund' WHEN 2 THEN 'grant' WHEN 3 THEN 'expire' ELSE 'consume' END,
       CASE i%6 WHEN 1 THEN '生成 1 张图' WHEN 2 THEN '画布扩图' WHEN 3 THEN '管理员调整积分' ELSE '原始内部记账' END,
       CASE i%7 WHEN 1 THEN 3 WHEN 2 THEN 15 ELSE -2 END,'2015-01-01T16:00:00Z'::timestamptz+(i%4000)*interval '1 day'
       FROM generate_series(1,72000)i`);
    await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient,created_at,deleted_at)
      SELECT 'aw-'||i,'w'||(i%48)||'@window.fixture','Fixture','image','','','','2016-01-01T16:00:00Z'::timestamptz+(i%3600)*interval '1 day',
       CASE WHEN i%13=0 THEN now() ELSE NULL END FROM generate_series(1,30000)i`);
    await pool.query("INSERT INTO app_ledger(id,email,kind,reason,delta,created_at) VALUES('foreign',$1,'consume','生成 1 张图',-999999,'2023-01-01')",[outsider]);
    await pool.query('ANALYZE app_ledger; ANALYZE app_artworks; ANALYZE app_users');
    const actor={email:owner,admin:false};
    const q=current.analyticsQuerySchema.parse({enterpriseId:id,from:'2018-01-01',to:'2025-12-31',group:'month'});
    const capture=async(read:()=>Promise<unknown>)=>{
      const statements:Statement[]=[];
      const patched=new Map<PoolClient,PoolClient['query']>();
      const onAcquire=(client:PoolClient)=>{
        if(patched.has(client))return;
        const original=client.query;patched.set(client,original);
        client.query=((sql:string,params:unknown[],...rest:unknown[])=>{
          if(typeof sql==='string'&&(/^WITH ledger_input/.test(sql)||/^SELECT email,count\(\*\)::int AS n FROM app_artworks/.test(sql)))statements.push({sql,params});
          return Reflect.apply(original,client,[sql,params,...rest]);
        }) as typeof client.query;
      };
      pool.on('acquire',onAcquire);
      try {return {data:await read(),statements};}
      finally {pool.off('acquire',onAcquire);for(const [client,original] of patched)client.query=original;}
    };
    const inspect=async(statements:Statement[])=>{
      const plans:Plan[]=[];
      for(const s of statements)plans.push((await fixture.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+s.sql,s.params)).rows[0]['QUERY PLAN'][0].Plan as Plan);
      const all=plans.flatMap(nodes);
      return {factScans:all.filter(n=>n['CTE Name']==='ledger').length,artworkScans:all.filter(n=>n['Relation Name']==='app_artworks').length,
        tempBlocks:plans.reduce((sum,n)=>sum+(n['Temp Read Blocks']??0)+(n['Temp Written Blocks']??0),0)};
    };
    if(process.argv.includes('--baseline')) {
      const observed=await capture(()=>current.enterpriseAnalytics(actor,q));
      const plan=await inspect(observed.statements);
      assert.equal(plan.factScans,6);assert.equal(plan.artworkScans,2);
      await fixture.query('BEGIN');
      try {
        await fixture.query('LOCK TABLE app_artworks IN ACCESS EXCLUSIVE MODE');
        await assert.rejects(current.enterpriseAnalytics(actor,{...q,purpose:'image.generate'}),{status:503});
      }finally{await fixture.query('ROLLBACK');}
      console.log('ANALYTICS_WINDOW_BASELINE=PASS '+JSON.stringify(plan)+' PURPOSE_REPORT_BLOCKED=1');
      return;
    }
    writeFileSync(oldFile,execFileSync('git',['show',`${baselineSha}:src/lib/enterprise/analytics.ts`]),{flag:'wx'});
    baselineCreated=true;
    const baseline:typeof current=await import(pathToFileURL(oldFile).href);
    const clean=(data:unknown)=>{const {generatedAt,...rest}=data as {generatedAt:string};assert.ok(Date.parse(generatedAt));return rest;};
    const old=await capture(()=>baseline.enterpriseAnalytics(actor,q)), actual=await capture(()=>current.enterpriseAnalytics(actor,q));
    assert.deepEqual(clean(actual.data),clean(old.data));
    const plans={before:await inspect(old.statements),after:await inspect(actual.statements)};
    assert.equal(plans.before.factScans,6);assert.equal(plans.after.factScans,2);
    assert.equal(plans.before.artworkScans,2);assert.equal(plans.after.artworkScans,1);
    const cases:Partial<typeof q>[]=[{group:'week',kind:'refund',page:2},{group:'day',email:'w21@window.fixture',page:99999},
      {purpose:'image.generate',page:4},{purpose:'canvas.expand',kind:'adjust'},{team:director,group:'month'},
      {from:'2002-01-01',to:'2002-01-10',group:'day'},{from:'2020-12-31',to:'2021-01-02',group:'week'}];
    for(const patch of cases)assert.deepEqual(clean(await current.enterpriseAnalytics(actor,{...q,...patch})),clean(await baseline.enterpriseAnalytics(actor,{...q,...patch})));
    await fixture.query('BEGIN');
    try {
      await fixture.query('LOCK TABLE app_artworks IN ACCESS EXCLUSIVE MODE');
      const result=await current.enterpriseAnalytics(actor,{...q,purpose:'image.generate'});
      assert.equal(result.summary.artworks,0);assert.equal(result.summary.creditsPerArtwork,null);
      assert.ok(result.summary.events>0);assert.ok(result.trend.every(row=>row.artworks===0));
    }finally{await fixture.query('ROLLBACK');}
    console.log('ANALYTICS_WINDOW=PASS '+JSON.stringify(plans)+' EQUIVALENT=8 PURPOSE_UNRELATED_LOCK_AVOIDED=1');
  } finally {
    await closeDatabasePools();
    try{await fixture.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}finally{await fixture.end();if(baselineCreated)unlinkSync(oldFile);}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
