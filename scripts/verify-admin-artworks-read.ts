import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Client,type PoolClient} from 'pg';
import {signalFromNodeResponse} from 'next/dist/server/web/spec-extension/adapters/next-request';

async function until<T>(read:()=>Promise<T|undefined>,message:string){
 const end=Date.now()+2800;
 do{const value=await read();if(value!==undefined)return value;await delay(15);}while(Date.now()<end);
 throw new Error(message);
}

async function main(){
 const uri=new URL(process.env.DATABASE_URL??'http://invalid'),baseline=process.argv.includes('--baseline');
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(uri.hostname,'127.0.0.1');assert.match(uri.pathname,/fixture/);
 const schema='admin_artworks_'+randomUUID().replaceAll('-','');
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,PGPOOL_MAX:'5',NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'admin-artworks-fixture-0123456789abcdef'});
 const {getPool,closeDatabasePools}=await import('../src/platform/db/pool');
 const {getOrCreateUser}=await import('../src/lib/db');
 const {createTemplate}=await import('../src/lib/templates/repository');
 const {signUserSession}=await import('../src/lib/native-auth');
 const {GET}=await import('../src/app/api/admin/artworks/route');
 const pool=getPool(),db=new Client({connectionString:uri.toString()}),lock=new Client({connectionString:uri.toString()});
 await db.connect();await lock.connect();
 const admin='admin@artworks.fixture',member='member@artworks.fixture',banned='banned@artworks.fixture';
 const headers=(email=admin)=>({cookie:'nv_user='+signUserSession(email,Date.now())});
 const calls:{sql:string;params:unknown[]}[]=[];
 const patched=new Map<PoolClient,PoolClient['query']>();
 const trace=(tx:PoolClient)=>{if(patched.has(tx))return;const original=tx.query;patched.set(tx,original);tx.query=((sql:unknown,...args:unknown[])=>{
  if(typeof sql==='string'&&/FROM app_artworks\b/.test(sql))calls.push({sql,params:args[0] as unknown[]??[]});
  return Reflect.apply(original,tx,[sql,...args]);
 }) as typeof tx.query;};
 const reports=new Map<string,number>();
 let host='';
 const app=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,host),key=url.searchParams.get('probe')!;
   const result=await GET(new Request(url,{headers:headers(),signal:signalFromNodeResponse(res)}));reports.set(key,result.status);
   if(!res.destroyed)res.writeHead(result.status,Object.fromEntries(result.headers)).end(Buffer.from(await result.arrayBuffer()));
  }catch{if(!res.destroyed)res.writeHead(500).end();}
 });
 const requests:{abort:AbortController;done:Promise<Response|undefined>}[]=[];
 async function plan(sql:string,params:unknown[]){
  const json=(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql,params)).rows[0]['QUERY PLAN'][0].Plan;
  const walk=(x:any):any[]=>[x,...(x.Plans??[]).flatMap(walk)];
  const sorts=walk(json).filter(n=>n['Node Type']==='Sort');
  const largeSorts=sorts.filter(n=>Number(n['Actual Rows'])>100);
  return {largeSortWidth:Math.max(0,...largeSorts.map(n=>n['Plan Width'] as number)),tempBlocks:(json['Temp Read Blocks']??0)+(json['Temp Written Blocks']??0)};
 }
 try{
  await db.query(`CREATE SCHEMA ${schema}; SET search_path=${schema}; SET work_mem='1MB'`);
  for(const email of [admin,member,banned])await getOrCreateUser(email);
  await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[admin]);
  await pool.query('UPDATE app_users SET banned=true WHERE email=$1',[banned]);
  await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,created_at,source_url,deleted_at)
   SELECT 'art-'||i,CASE WHEN i%2=0 THEN $1 ELSE $2 END,'Fixture '||i,'main',repeat(md5(i::text),22),'completed',
   '/media/'||i||'.png','','2026-01-01'::timestamptz+i*interval '1 second','/media/source-'||i||'.png',CASE WHEN i=40000 THEN now() END
   FROM generate_series(1,40000)i`,[member,banned]);
  await createTemplate({id:'tpl-art-art-40000',title:'Fixture',category:'Fixture',industry:'Fixture',description:'',prompt:'',tags:[],image:'/media/template.png',gradient:'',popular:false});
  await db.query('ANALYZE app_artworks');
  const direct=(query:string,email=admin)=>GET(new Request('http://fixture.invalid/api/admin/artworks?'+query,{headers:headers(email)}));
  assert.equal((await direct('',member)).status,403);
  pool.on('acquire',trace);
  const first=await direct('page=0&pageSize=3');assert.equal(first.status,200);
  const data=await first.json();
  assert.equal(data.total,40000);assert.equal(data.page,0);assert.equal(data.pageSize,3);
  assert.deepEqual(data.artworks.map((a:{id:string})=>a.id),['art-40000','art-39999','art-39998']);
  assert.equal(data.artworks[0].source,'/media/source-40000.png');
  assert.deepEqual(data.importedIds,['art-40000']);assert.deepEqual(data.bannedEmails,[banned]);
  calls.length=0;
  const deep=await direct('page=390&pageSize=100');assert.equal(deep.status,200);
  const deepData=await deep.json();
  assert.equal(deepData.total,40000);assert.equal(deepData.artworks[0].id,'art-1000');assert.equal(deepData.artworks.at(-1).id,'art-901');
  const query=calls.find(row=>row.sql.includes('OFFSET'));assert.ok(query);
  const measured=await plan(query.sql,query.params);
  calls.length=0;
  const empty=await direct('page=400&pageSize=100');assert.equal(empty.status,200);
  assert.deepEqual(await empty.json(),{artworks:[],total:40000,page:400,pageSize:100,importedIds:[],bannedEmails:[]});
  const emptyScans=calls.length;
  pool.off('acquire',trace);for(const [tx,original] of patched)tx.query=original;
  await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));host=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
  const lockerPid=(await lock.query('SELECT pg_backend_pid() AS n')).rows[0].n;
  await lock.query(`BEGIN; LOCK TABLE ${schema}.app_artworks IN ACCESS EXCLUSIVE MODE`);
  const active=async()=>Number((await db.query("SELECT count(*) FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%app_artworks%'",[lockerPid])).rows[0].count);
  const start=(key:string)=>{
   const abort=new AbortController();
   const done=fetch(host+'/api/admin/artworks?probe='+key,{signal:abort.signal}).catch(error=>{if(!abort.signal.aborted)throw error;return undefined;});
   const entry={abort,done};requests.push(entry);return entry;
  };
  const one=start('first');
  const firstBlocked=baseline?2:1;
  await until(async()=>await active()===firstBlocked?true:undefined,'first list did not reach artwork lock');
  const second=start('second'),third=start('third');
  const peak=baseline?5:2;
  await until(async()=>await active()===peak?true:undefined,'three lists did not reach expected pool pressure');
  one.abort.abort();
  if(baseline){
   await delay(120);
   assert.equal(await active(),5);assert.equal(reports.has('first'),false);
   assert.equal(emptyScans,2);assert.ok(measured.largeSortWidth>100&&measured.tempBlocks>0);
   console.log('ADMIN_ARTWORKS_BASELINE=PASS '+JSON.stringify({measured,peak,emptyScans,abandonedStillWaiting:true}));
  }else{
   await until(async()=>reports.get('first')===499?true:undefined,'request did not cancel behind the lock');
   await until(async()=>await active()===2?true:undefined,'queued work was not admitted after cancel');
   assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok,1);
   const waiting=await start('wait-timeout').done;
   assert.equal(waiting?.status,503);assert.equal(waiting?.headers.get('retry-after'),'1');
   await waiting?.arrayBuffer();
   assert.equal(await active(),2);
   await lock.query('ROLLBACK');
   for(const request of [second,third]){
    const reply=await request.done;assert.equal(reply?.status,200);assert.equal((await reply!.json()).total,40000);
   }
   assert.equal(emptyScans,1);assert.ok(measured.largeSortWidth<=100);
   assert.match(first.headers.get('cache-control')??'',/private.*no-store/);
   await pool.query("UPDATE app_artworks SET created_at=(SELECT created_at FROM app_artworks WHERE id='art-40000') WHERE id='art-39999'");
   const firstTwo=await Promise.all([direct('page=0&pageSize=1'),direct('page=1&pageSize=1')]);
   assert.deepEqual(await Promise.all(firstTwo.map(r=>r.json().then(data=>data.artworks[0].id))),['art-40000','art-39999']);
   const clipped=await direct('page=-1&pageSize=300');
   const clamped=await clipped.json();assert.equal(clamped.page,0);assert.equal(clamped.pageSize,100);assert.equal(clamped.artworks.length,100);
   assert.equal((await direct('page=Infinity')).status,400);
   console.log('ADMIN_ARTWORKS_READ=PASS '+JSON.stringify({measured,peak,emptyScans,abandonedSlotReleased:true})+' RETRY_503=1 STABLE_TIES=1');
  }
 }finally{
  pool.off('acquire',trace);for(const [tx,original] of patched)tx.query=original;
  for(const r of requests)r.abort.abort();
  await lock.query('ROLLBACK');await lock.end();await Promise.allSettled(requests.map(r=>r.done));
  if(app.listening){app.closeAllConnections();await new Promise<void>(r=>app.close(()=>r()));}
  await closeDatabasePools();try{await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}finally{await db.end();}
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
