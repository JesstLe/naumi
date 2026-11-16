import {Pool} from 'pg';
import {readFileSync,openSync,writeSync,fsyncSync,closeSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {storageConfiguration} from '../../src/lib/object-storage/config';
import {createObjectStorage} from '../../src/lib/object-storage/adapter';
import {backfillOne,type Store,type Item} from './nas47_backfill';

async function main(){
 const input=JSON.parse(readFileSync(0,'utf8'));
 if(!/^pass-[a-z0-9-]+$/.test(input.pass)||!Number.isInteger(input.seconds)||input.seconds<1||input.seconds>210||!Number.isInteger(input.limit)||input.limit<1)throw Error('FINITE_PASS_REQUIRED');
 const config=storageConfiguration(process.env);
 if(config.driver!=='s3'||!config.privateMedia||config.accessMode!=='proxy'||config.mediaDir!=='/media')throw Error('EXACT_NAS_MEDIA_MOUNT_REQUIRED');
 const manifest=JSON.parse(readFileSync('/work/BASELINE_PENDING_LOCAL.private.json','utf8')) as Item[];
 const selection=input.keys?new Set<string>(input.keys):null;
 let items=manifest.filter(x=>!selection||selection.has(x.key));
 // Immutable baseline ordering, largest first releases pressure early.
 items.sort((a,b)=>b.bytes-a.bytes||a.key.localeCompare(b.key));
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:2,connectionTimeoutMillis:8000,statement_timeout:15000,application_name:'nas47-finite-backfill'});
 const due=await pool.query('SELECT key,sha256,bytes::text FROM app_media_assets WHERE NOT remote_ready AND retry_after<=now() AND key=ANY($1::text[])',[items.map(x=>x.key)]);
 const dueRows=new Map(due.rows.map(x=>[x.key,x]));items=items.filter(x=>{const live=dueRows.get(x.key);return live?.sha256===x.sha256&&Number(live.bytes)===x.bytes;});
 pool.on('error',()=>{fatal=true;});
 const log=openSync('/work/'+input.pass+'-ACKS.private.jsonl','wx',0o600);
 const counts:Record<string,number>={processed:0,uploaded:0,uploadedBytes:0,evicted:0,evictedBytes:0,errors:0};let fatal=false,cursor=0,stopRequested=false;
 const stop=()=>{stopRequested=true;};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 const emit=(r:Record<string,unknown>)=>{writeSync(log,JSON.stringify({...r,at:new Date().toISOString()})+'\n');fsyncSync(log);};
 const store:Store={
  async claim(item){
   const r=await pool.query(`UPDATE app_media_assets SET retry_after=now()+interval '30 minutes'
    WHERE key=$1 AND sha256=$2 AND bytes=$3 AND NOT remote_ready AND retry_after<=now()
    RETURNING key,sha256,bytes::float8,content_type,retry_after::text AS claim`,[item.key,item.sha256,item.bytes]);return r.rows[0]||null;
  },
  async publish(item){
   const r=await pool.query(`UPDATE app_media_assets SET remote_ready=true,local_evict_after=now()+interval '30 minutes'
    WHERE key=$1 AND sha256=$2 AND bytes=$3 AND retry_after=$4::timestamptz AND NOT remote_ready
    RETURNING local_evict_after::text AS claim`,[item.key,item.sha256,item.bytes,item.claim]);return r.rows[0]?.claim||null;
  },
  async evict(item,claim,remove){
   const c=await pool.connect();try{
    await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s'");
    const r=await c.query(`SELECT key FROM app_media_assets WHERE key=$1 AND sha256=$2 AND bytes=$3 AND remote_ready AND local_evict_after=$4::timestamptz FOR UPDATE`,[item.key,item.sha256,item.bytes,claim]);
    if(r.rowCount!==1){await c.query('ROLLBACK');return false;}
    const removed=await remove();
    if(removed)await c.query("UPDATE app_media_assets SET local_evict_after='infinity'::timestamptz WHERE key=$1",[item.key]);
    await c.query('COMMIT');return removed;
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  },
  async defer(item){await pool.query(`UPDATE app_media_assets SET retry_after=now()+interval '5 minutes'
   WHERE key=$1 AND sha256=$2 AND bytes=$3 AND retry_after=$4::timestamptz AND NOT remote_ready`,[item.key,item.sha256,item.bytes,item.claim]);}
 };
 const backend=createObjectStorage(config),deadline=Date.now()+input.seconds*1000;
 function snapshot(){const value={pass:input.pass,counts,cursor,manifestRows:items.length,fatal,stopRequested,deadlineReached:Date.now()>=deadline,at:new Date().toISOString()};const f='/work/'+input.pass+'-PROGRESS.json';writeFileSync(f+'.tmp',JSON.stringify(value),{mode:0o600});renameSync(f+'.tmp',f);return value;}
 const progress=setInterval(()=>{snapshot();console.log('BACKFILL_PROGRESS '+JSON.stringify(counts));},10000);
 async function worker(){while(!fatal&&!stopRequested&&Date.now()<deadline&&cursor<items.length&&cursor<input.limit){const item=items[cursor++];try{
  const out=await backfillOne(item,{root:'/media',backend,store,log:emit,conditionalCreateVerified:false});counts.processed++;counts['outcome:'+out.status]=(counts['outcome:'+out.status]||0)+1;
  if(out.uploaded){counts.uploaded++;counts.uploadedBytes+=item.bytes;}
  if(out.status==='evicted'){counts.evicted++;counts.evictedBytes+=item.bytes;}
  emit({phase:'OUTCOME',key:item.key,sha256:item.sha256,bytes:item.bytes,...out});
 }catch(e){counts.errors++;fatal=true;emit({phase:'ERROR',key:item.key,code:(e as any).code||'BACKFILL_IO_FAILED'});}}}
 try{await Promise.all([worker(),worker()]);const result=snapshot();writeFileSync('/work/'+input.pass+'-RESULT.json',JSON.stringify(result),{mode:0o600});console.log(JSON.stringify(result));if(fatal)process.exitCode=1;}
 finally{clearInterval(progress);fsyncSync(log);closeSync(log);await pool.end();process.off('SIGTERM',stop);process.off('SIGINT',stop);}
}
main().catch(()=>{console.error('FINITE_BACKFILL_FAILED');process.exitCode=1;});
