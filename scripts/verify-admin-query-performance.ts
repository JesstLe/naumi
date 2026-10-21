import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BI_SECTIONS, parseBiQuery } from "../src/lib/bi/contracts";
import { ADMIN_QUERY_INDEXES } from "../src/lib/bi/query-indexes";

async function main() {
  assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB, "1");
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
  const base=process.argv[2]||"48d1445e4f3076aa7bec8461707201c111fe2afc";
  const out=resolve(process.argv[3]||"output/admin-query-performance-20261021"); mkdirSync(out,{recursive:true});
  const tag=randomUUID().replaceAll("-","");
  const oldFile=resolve(`src/lib/bi/.admin-baseline-${tag}.ts`);
  writeFileSync(oldFile,execFileSync("git",["show",`${base}:src/lib/bi/repository.ts`]));
  const {Pool}=await import("pg");
  const admin=new Pool({connectionString:process.env.DATABASE_URL});
  const schema=`admin_perf_${tag}`; await admin.query(`CREATE SCHEMA ${schema}`);
  process.env.PGOPTIONS=`-c search_path=${schema}`;
  process.env.SETTINGS_SECRET="admin-performance-fixture-only-012345678901234567890123456789";
  const db=await import("../src/lib/db");
  const modified=await import("../src/lib/bi/repository");
  const baseline=await import(pathToFileURL(oldFile).href);
  const pool=db.getPool();
  let capture: {label:string;sql:string;values:unknown[];ms:number}[]|null=null;
  let label="";
  const wrapped=new WeakSet();
  pool.on("acquire",client=>{
    if(wrapped.has(client))return;wrapped.add(client);
    const query=client.query.bind(client);
    (client as any).query=(...args:any[])=>{
      const [sql,values]=args; const started=performance.now();const result=(query as any)(...args);
      if(capture&&typeof sql==="string"&&sql.startsWith("WITH query_window")){
        const entry={label,sql,values,ms:0};capture.push(entry);
        return result.then((r:any)=>{entry.ms=performance.now()-started;return r;});
      }
      return result;
    };
  });
  try {
    await modified.ensureBiSchema();await baseline.ensureBiSchema();
    await pool.query(`INSERT INTO app_users(email,name,plan,credits_total,credits_used,banned,joined_at,renews_at)
      SELECT 'user-'||g||'@example.test','User '||g,'free',1000,g%30,g%17=0,'2026-01-01'::timestamptz+g*interval '1 second','2027-01-01'::timestamptz FROM generate_series(1,450) g;
      INSERT INTO app_bi_account_profiles(email,account_type,company,updated_by)
      SELECT email,CASE WHEN name LIKE '%2%' THEN 'enterprise' ELSE 'personal' END,CASE WHEN name LIKE '%2%' THEN 'Perf Company' ELSE '' END,'fixture' FROM app_users;
      INSERT INTO app_credit_batches(id,email,amount,remaining,source,expires_at)
      SELECT 'credit-'||g,'user-'||(g%450+1)||'@example.test',100,CASE WHEN g%7=0 THEN 0 ELSE 80 END,'grant',now()+(CASE WHEN g%11=0 THEN -1 WHEN g%3=0 THEN 20 ELSE 60 END)*interval '1 day' FROM generate_series(1,1500) g;
      INSERT INTO app_ledger(id,email,delta,kind,reason,created_at)
      SELECT 'ledger-'||g,CASE WHEN g%23=0 THEN 'orphan@example.test' ELSE 'user-'||(g%450+1)||'@example.test' END,
      CASE WHEN g%5=0 THEN 4 ELSE -6 END,CASE WHEN g%5=0 THEN 'refund' ELSE 'consume' END,
      CASE WHEN g%17=0 THEN '管理员调整积分' ELSE 'fixture' END,'2026-10-20'::timestamptz+g*interval '1 second' FROM generate_series(1,12000) g`);
    await pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,cost,reserved_cost,created_at,updated_at)
      SELECT 'perf-'||g,CASE WHEN g%23=0 THEN 'orphan@example.test' ELSE 'user-'||(g%450+1)||'@example.test' END,'generate',
      jsonb_build_object('status',CASE WHEN g%7=0 THEN 'error' WHEN g%5=0 THEN 'needs_attention' ELSE 'done' END,
      'stage',CASE WHEN g%11=0 THEN 'checking' ELSE '' END,'error',CASE WHEN g%13=0 THEN '核查原因' ELSE '' END,
      'paidOperations',jsonb_build_object('op-'||g,jsonb_build_object('state','succeeded')),
      'padding',(SELECT string_agg(md5((g*1000+n)::text),'') FROM generate_series(1,200) n)),
      jsonb_build_object('p',jsonb_build_object('prompt','prompt-'||g,'model','fixture','resolution','1K','images',jsonb_build_array(jsonb_build_object('buf',jsonb_build_object('$imageJobBuffer','/private-media/input-'||g))))),
      true,6,0,'2026-10-20'::timestamptz+g*interval '1 second','2026-10-20'::timestamptz+g*interval '1 second' FROM generate_series(1,8000) g`);
    await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,batch_id,creation_provenance,created_at,deleted_at)
      SELECT 'art-'||g,CASE WHEN g%23=0 THEN 'orphan@example.test' ELSE 'user-'||(g%450+1)||'@example.test' END,'Title '||g,'fixture','Complete prompt '||g,'completed','/private-media/'||g,'',
      CASE WHEN g%3=0 THEN 'b-job-perf-'||g ELSE 'perf-'||g END,jsonb_build_object('operation',CASE WHEN g%7=0 THEN 'upload' ELSE 'generate' END,'ref','perf-'||g),
      '2026-10-20'::timestamptz+(g/2)*interval '1 second',CASE WHEN g%11=0 THEN now() ELSE NULL END FROM generate_series(1,10000) g;
      INSERT INTO app_canvas_image_tasks(id,email,source_artwork_id,result_artwork_id,status,error,created_at)
      SELECT 'canvas-'||g,'user-'||(g%450+1)||'@example.test','source','art-'||g,CASE WHEN g%2=0 THEN 'failed' ELSE 'completed' END,CASE WHEN g%3=0 THEN '核查' ELSE '' END,'2026-10-20T08:00:00Z'::timestamptz+g*interval '1 second' FROM generate_series(1,100) g;
      INSERT INTO app_video_tasks(id,email,upstream_id,artwork_id,status,created_at)
      SELECT 'video-'||g,'user-'||(g%450+1)||'@example.test','fixture','art-'||g,'failed','2026-10-20T08:01:00Z'::timestamptz+g*interval '1 second' FROM generate_series(1,100) g;
      INSERT INTO app_image_cost_audit(id,job_id,email,requested_quality,executed_quality,upstream,images,billed_credits,reason,created_at)
      SELECT 'cst-'||id||'-art-'||g,id,email,'high',CASE WHEN g%3=0 THEN 'low' ELSE 'high' END,'fixture',1,6,CASE WHEN g%3=0 THEN 'provider-fallback' ELSE '' END,created_at FROM app_image_jobs JOIN generate_series(1,8000) g ON id='perf-'||g;
      INSERT INTO app_bi_model_calls(id,email,operation,operation_id,wire_model,state,duration_ms,created_at)
      SELECT 'call-'||g,email,'image',id,'wire','succeeded',10,created_at FROM app_image_jobs JOIN generate_series(1,8000) g ON id='perf-'||g;
      INSERT INTO app_orders(id,email,kind,item_id,credits,amount,status,provider,paid_at,created_at)
      SELECT 'order-'||g,'user-'||(g%450+1)||'@example.test','pack','fixture',100,1000,CASE WHEN g%4=0 THEN 'pending' ELSE 'paid' END,CASE WHEN g%3=0 THEN 'mock' WHEN g%2=0 THEN 'wechat' ELSE 'alipay' END,'2026-10-20T08:00:00Z','2026-10-19T08:00:00Z' FROM generate_series(1,500) g;
      INSERT INTO app_agent_sessions(id,email,title,messages,created_at,updated_at) VALUES('session-a','user-2@example.test','fixture','[{"role":"user","content":"hello"}]','2026-10-19','2026-10-20');
      INSERT INTO app_genchat_sessions(id,email,title,turns,created_at,updated_at) VALUES('session-b','user-3@example.test','fixture','[{"you":"hi","line":"hello"}]','2026-10-19','2026-10-20');
      ANALYZE`);
    for(const index of ADMIN_QUERY_INDEXES)await pool.query(index.sql);
    await pool.query("VACUUM ANALYZE app_image_jobs");
    const clean=(v:any)=>{const {generatedAt,...rest}=v;return rest;};
    const results:any[]=[];const captured:any[]=[];
    const filters:Record<string,string>[]=[{}, {email:"user-2@example.test"},{email:"orphan@example.test"},{q:"User 2"},{q:"Perf Company"},{accountType:"unknown"},{accountType:"enterprise"},{page:"2"},{page:"10000"},{from:"2026-10-21",to:"2026-10-21"}];
    for(const section of BI_SECTIONS){
      const cases=[...filters];
      const statuses:Record<string,string[]>={users:["active","banned"],artworks:["deleted","all","invalid"],models:["fallback"],operations:["review","error"],orders:["paid","pending"],conversations:["agent","genchat"],ledger:["consume","refund"]};
      for(const status of statuses[section]||[])cases.push({status});
      if(section==="artworks")cases.push({id:"art-2",from:"2026-10-21",to:"2026-10-21"},{id:"art-2",email:"user-4@example.test"});
      for(const f of cases){
        const q=parseBiQuery(new URLSearchParams({section,from:"2026-10-20",to:"2026-10-20",size:"30",...f}));
        const times:number[]=[];const bodies:any[]=[];
        for(const [name,repo] of [["baseline",baseline],["modified",modified]] as const){
          label=`${section}:${name}`;capture=Object.keys(f).length?null:[];
          const started=performance.now();bodies.push(await repo.queryBi(q));times.push(performance.now()-started);
          if(capture)captured.push(...capture);capture=null;
        }
        assert.deepEqual(clean(bodies[1]),clean(bodies[0]),`${section} ${JSON.stringify(f)}`);
        if(f.id==="art-2")assert.equal(bodies[1].total,f.email?0:1,"Exact record bypasses date, never account authorization");
        results.push({section,filters:f,total:bodies[1].total,rows:bodies[1].rows.length,baselineMs:Math.round(times[0]),modifiedMs:Math.round(times[1])});
      }
    }
    // Authorized enterprise reuse must keep the exact same restricted row/count universe.
    const client=await pool.connect();
    try{await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      for(const allowedEmails of [[],["user-2@example.test"],["user-2@example.test","user-3@example.test"]]){
        for(const f of [{},{status:"all"},{id:"art-2"},{id:"art-3"},{page:"10000"}] as Record<string,string>[]){
          const q=parseBiQuery(new URLSearchParams({section:"artworks",from:"2026-10-20",to:"2026-10-20",...f}));
          assert.deepEqual(clean(await modified.queryBi(q,{client,allowedEmails})),clean(await baseline.queryBi(q,{client,allowedEmails}))); results.push({section:"scoped-artworks",allowedEmails,filters:f});
        }
      }
      await assert.rejects(modified.queryBi(parseBiQuery(new URLSearchParams({section:"users"})),{client,allowedEmails:[]}));
      await client.query("ROLLBACK");
    }finally{client.release();}
    // Partial indexes must follow live state transitions, including clearing review.
    for(const state of [{status:"error",stage:"",error:""},{status:"done",stage:"reviewing",error:"核查"},{status:"done",stage:"",error:""}]){
      await pool.query("UPDATE app_image_jobs SET snapshot=snapshot||$1::jsonb WHERE id='perf-1'",[JSON.stringify(state)]);
      const q=parseBiQuery(new URLSearchParams({section:"overview",from:"2026-10-20",to:"2026-10-20"}));
      assert.deepEqual(clean(await modified.queryBi(q)),clean(await baseline.queryBi(q)));results.push({section:"live-state-transition",state,equivalent:true});
    }
    const oldDb=execFileSync("git",["show",`${base}:src/lib/db.ts`],{encoding:"utf8"});
    const listSql=oldDb.slice(oldDb.indexOf("export async function listAllUsers"));
    const oldRows=(await pool.query(listSql.slice(listSql.indexOf("`SELECT")+1,listSql.indexOf("`\n  );")))).rows;
    const oldMapped=oldRows.map(r=>({email:r.email,name:r.name,plan:r.plan,role:r.role,creditsTotal:r.credits_total,creditsUsed:r.credits_used,artworks:Number(r.artworks),banned:r.banned===true,lastIp:r.last_ip??null,recent7:Number(r.consumed7d),note:r.note??""}));
    assert.deepEqual(await db.listAllUsers(),oldMapped);results.push({section:"legacy-users",total:oldRows.length,equivalent:true});
    writeFileSync(resolve(out,"PERFORMANCE.json"),JSON.stringify(results,null,2));
    writeFileSync(resolve(out,"SQL_PROFILE.json"),JSON.stringify(captured,null,2));
    console.log(`ADMIN_QUERY_PERFORMANCE=PASS cases=${results.length} users=450 jobs=8000 artworks=10000 ledger=12000 equivalent=true supplierCalls=0`);
    console.log(JSON.stringify(results.filter(r=>r.filters&&Object.keys(r.filters).length===0)));
  }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();unlinkSync(oldFile);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
