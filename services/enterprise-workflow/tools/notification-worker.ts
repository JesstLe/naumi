import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {createWorkflowPool,resolveDatabaseActor} from '../src/server';
import {NotificationStore} from '../src/notification-store';
import {createDingTalkNotificationAdapter} from '../src/dingtalk-notification-adapter';
import type {NotificationConnector} from '../src/notification-contracts';
const schema=z.strictObject({databaseUrl:z.string().min(1),connectors:z.array(z.strictObject({enterpriseId:z.string().uuid(),id:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/),label:z.string().min(1).max(80),appKey:z.string().min(1),appSecret:z.string().min(1),agentId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),productUrl:z.string().url()})).max(100)});
async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1')throw Error('LEGACY_WORKER_FIXTURE_ONLY_USE_RUNTIME');
 const path=process.env.NAUMI_NOTIFICATION_CONFIG;if(!path)throw Error('NOTIFICATION_CONFIG_FILE_REQUIRED');
 const c=schema.parse(JSON.parse(await readFile(path,'utf8')));if(new URL(c.databaseUrl).hostname!=='127.0.0.1')throw Error('ISOLATED_DATABASE_REQUIRED');const all=new Map<string,NotificationConnector[]>();
 for(const x of c.connectors){const rows=all.get(x.enterpriseId)??[];if(rows.some(r=>r.id===x.id))throw Error('DUPLICATE_CONNECTOR_ID');rows.push({id:x.id,revision:createHash('sha256').update(JSON.stringify([x.appKey,x.agentId,x.productUrl])).digest('hex'),label:x.label,adapter:createDingTalkNotificationAdapter(x)});all.set(x.enterpriseId,rows);}
 const pool=createWorkflowPool(c.databaseUrl),store=new NotificationStore(pool,resolveDatabaseActor,id=>all.get(id)??[]);let stopping=false;
 process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
 try{await store.ready();console.log('NOTIFICATION_WORKER_READY: concurrency=1 pool=4');if(process.argv.includes('--once')){await store.tick();console.log('NOTIFICATION_WORKER_ONCE_PASS: bounded_tick=1');return;}while(!stopping){try{const r=await store.tick();if(!r.processed)await new Promise(r=>setTimeout(r,1000));}catch{console.error('NOTIFICATION_WORKER_RETRY: database_or_lease_error');await new Promise(r=>setTimeout(r,5000));}}}finally{await pool.end();console.log('NOTIFICATION_WORKER_STOPPED: current_attempt_finished=1');}
}
main().catch(()=>{console.error('NOTIFICATION_WORKER_START_FAILED: verify protected config and database');process.exitCode=1;});
