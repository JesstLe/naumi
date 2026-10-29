import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import pg from 'pg';
import esbuild from 'esbuild';

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const url=new URL(process.env.DATABASE_URL||'http://invalid');assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const mode=process.argv[2]||'modified';assert.ok(['baseline','modified'].includes(mode));
 const admin=new pg.Pool({connectionString:url.toString(),max:2}),schema='bi_pool_'+randomUUID().replaceAll('-','');await admin.query(`CREATE SCHEMA ${schema}`);
 process.env.PGOPTIONS=`-c search_path=${schema}`;process.env.SETTINGS_SECRET='fixture-bi-pool-deadlock-0123456789abcdef';
 const db=await import('../src/lib/db'),bi=await import('../src/lib/bi/repository');await bi.ensureBiSchema();const pool=db.getPool();assert.equal(pool.options.max,5);
 const owner='owner@pool.fixture',other='outsider@pool.fixture';await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
 for(const [id,email] of [['pool-job',owner],['foreign-job',other]])await pool.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,cost,metered) VALUES($1,$2,'generate','{\"status\":\"error\"}','{}',0,false)",[id,email]);
 const baseline=process.env.BI_POOL_BASELINE_FILE;
 const entry=mode==='baseline'?baseline!:path.resolve('src/lib/bi/repository.ts');assert.ok(fs.existsSync(entry));
 // Execute real repository SQL; only its getPool infrastructure port points to this same isolated 5-connection pool.
 const built=await esbuild.build({stdin:{contents:fs.readFileSync(entry,'utf8'),resolveDir:path.resolve('src/lib/bi'),sourcefile:entry,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',tsconfig:path.resolve('tsconfig.json'),plugins:[{name:'pool-port',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));b.onResolve({filter:/^@\/lib\/db$/},()=>({path:'db',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='db'?'module.exports=globalThis.__biFixtureDb;':''}));}}]});
 (globalThis as any).__biFixtureDb={getPool:()=>pool,ensureSchema:db.ensureSchema};const module={exports:{} as any};new Function('module','exports','require',built.outputFiles[0].text)(module,module.exports,createRequire(path.resolve('package.json')));const actual=module.exports;
 await actual.ensureBiSchema();const {parseBiQuery}=await import('../src/lib/bi/contracts');const q=parseBiQuery(new URLSearchParams({section:'operations',size:'25'}));
 const tx=await pool.connect();await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await tx.query('SELECT email FROM app_users WHERE email=$1 FOR SHARE',[owner]);
 const waiters=await Promise.all(Array.from({length:4},()=>pool.connect()));const pids=[] as number[],pending=[] as Promise<unknown>[];
 for(const waiter of waiters){await waiter.query('BEGIN');pids.push((await waiter.query('SELECT pg_backend_pid() pid')).rows[0].pid);pending.push(waiter.query('SELECT email FROM app_users WHERE email=$1 FOR UPDATE',[owner]).catch(()=>{}).finally(async()=>{await waiter.query('ROLLBACK');waiter.release();}));}
 let done=false;const start=Date.now();const task=actual.queryBi(q,{client:tx,allowedEmails:[owner]}).then((v:any)=>{done=true;return v});
 await new Promise(r=>setTimeout(r,1000));const observed={completedWhileAllFiveClientsHeld:done,poolWaiters:pool.waitingCount};
 assert.equal(done,mode==='modified');assert.equal(pool.waitingCount,mode==='baseline'?1:0);
 if(mode==='baseline'){await admin.query('SELECT pg_cancel_backend($1)',[pids[0]]);}
 const response=await Promise.race([task,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('fixture deadline')),10000))]);assert.equal(response.total,1);assert.equal(response.rows[0].id,'pool-job');
 await tx.query('COMMIT');tx.release();await Promise.all(pending);assert.equal(pool.waitingCount,0);
 const acquired=await pool.connect();await acquired.query('BEGIN');try{await assert.rejects(actual.queryBi(parseBiQuery(new URLSearchParams({section:'users'})),{client:acquired,allowedEmails:[owner]}));}finally{await acquired.query('ROLLBACK');acquired.release();}
 console.log('BI_SCOPED_POOL_'+mode.toUpperCase()+'='+JSON.stringify({...observed,realPostgres:true,poolMax:5,checks:7,tenantIsolation:true,globalSectionDenied:true,completedAfterRelease:true,elapsedMs:Date.now()-start,supplierCalls:0}));
 await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});

