import assert from 'node:assert/strict';
import {createModelFixture} from './model-config-fixture';
import {claimChannel,channelHealthKey,type ChannelTarget} from '../src/lib/model-config/channel-scheduler';
import {createProviderCapacity} from '../src/lib/model-config/capacity';
import {modelEndpointFetch} from '../src/lib/model-config/transport';
import {withImageOperation} from '../src/lib/image-gateway';
async function main(){
 let posts=0;
 const f=await createModelFixture(async(req,res)=>{for await(const _ of req){};posts++;res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'insufficient_quota',message:'insufficient_quota fixture-secret-do-not-store'}}));});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_ROUTER_MANAGEMENT_URL:f.origin,MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
 const db=await import('../src/lib/db');
 try{
  const cred=await f.credentials.importPlain({providerId:'p2',plain:'fixture-p2',actor:'fixture'});
  f.config.providers[0].maxConcurrent=1;f.config.providers.push({...f.config.providers[0],id:'p2',credentialRef:cred.id});
  f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:'u2',providerId:'p2'});
  const policy={mode:'priority' as const,channels:[{upstreamId:'u1',enabled:true,priority:1,weight:1},{upstreamId:'u2',enabled:true,priority:2,weight:1}]};
  f.config.publicModels[0].supplierRouting=policy;
  const snapshot=await f.repo.current();await db.ensureSchema();
  const targets=policy.channels.map((c,i)=>({...c,scope:{frozen:{modelVersion:snapshot.version,billingVersion:1,modelDigest:snapshot.digest,publicModelId:'image-a',binding:'image.generate',modality:'image',target:{type:'upstream',id:'u1'}},connection:{providerId:i?'p2':'p1',baseUrl:f.origin+'/v1',wireModel:'gpt-image-2',apiKey:'fixture',protocol:'openai-images',timeoutMs:1000,maxConcurrent:1},capabilities:f.config.upstreamModels[i].capabilities,parameterMap:{}}})) as ChannelTarget[];
  for(const t of targets)await f.sql.query("INSERT INTO app_model_channel_health(key,failures,open_until,last_status,last_failure_kind) VALUES($1,2,now()+interval '5 minutes',403,'auth')",[channelHealthKey(t)]);
  await assert.rejects(claimChannel(f.sql,'image-a',policy,targets,new Set()),(e:any)=>e.code==='PROVIDER_BUSY'&&e.status===503&&e.message.includes('暂时不可用'));
  assert.equal(posts,0);assert.equal((await f.sql.query('SELECT count(*)::int n FROM app_model_provider_leases')).rows[0].n,0);
  await f.sql.query('DELETE FROM app_model_channel_health');
  const held=await Promise.all(targets.map(t=>createProviderCapacity(f.sql).acquire(t.scope.connection as any)));
  try{await assert.rejects(claimChannel(f.sql,'image-a',policy,targets,new Set()),(e:any)=>e.status===429&&e.message.includes('请求较多'));assert.equal(posts,0)}finally{await Promise.all(held.map(l=>l.release()))}
  await f.sql.query("INSERT INTO app_model_channel_health(key,failures,open_until) VALUES($1,2,now()+interval '5 minutes')",[channelHealthKey(targets[0])]);
  const claim=await claimChannel(f.sql,'image-a',policy,targets,new Set());assert.equal(claim.target.upstreamId,'u2');await claim.release();
  assert.equal((await f.sql.query('SELECT count(*)::int n FROM app_model_provider_leases')).rows[0].n,0);
  const fetcher=modelEndpointFetch(f.origin+'/v1',{trustedOrigins:[f.origin]},{...targets[1].scope.connection,costScope:{...targets[1].scope,capacityReserved:true}});
  const response=await withImageOperation('image-a',{id:'admission-recovery-fixture'},()=>fetcher(f.origin+'/v1/images/edits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'gpt-image-2',prompt:'local fixture only'})}));
  assert.equal(response.status,403);await response.text();
  const calls=(await f.sql.query('SELECT state,cost_status,amount_micros,evidence FROM app_supplier_calls')).rows;
  assert.equal(posts,1);assert.equal(calls.length,1);assert.equal(calls[0].evidence.failureCategory,'quota');assert.equal(calls[0].evidence.httpStatus,403);assert.equal(calls[0].cost_status,'pending');assert.equal(calls[0].amount_micros,null);assert(!JSON.stringify(calls).includes('do-not-store'));
  console.log('IMAGE_ADMISSION_PG=PASS COOLDOWN=503 CAPACITY=429 AVAILABLE_FALLBACK=UNCHANGED CAPACITY_LEAKS=0 ERROR_EVIDENCE=QUOTA COST_UNKNOWN=PRESERVED LOOPBACK_POSTS=1 REAL_SUPPLIER_CALLS=0');
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
