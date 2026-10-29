/** Native modules, real local PG, signed user cookies, local HTTP callback,
 * actual recovery -> artwork -> media authorization -> original billing. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import sharp from 'sharp';
import type {ImagegenPlan} from '../src/lib/imagegen/types';
import type {BillingQuote} from '../src/lib/billing/types';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55435');assert.equal(url.pathname,'/naumi_x5_native');assert.equal(url.username,'x5_fixture');
 if(process.argv[2]==='--read'){
  const {DurableImageJobs}=await import('../src/lib/durable-image-jobs'),jobs=new DurableImageJobs<any>('generate');
  try{const saved=await jobs.get(process.argv[3]);const image=Object.values(saved.paidOperations)[0] as any;assert.equal(sha(Buffer.from(image.result[0].url.split(',')[1],'base64')),process.argv[4]);console.log('NATIVE_RESTART=PASS ORIGINAL_BYTES=MATCH');}
  finally{await (await import('../src/lib/db')).getPool().end();}return;
 }
 const admin=new Pool({connectionString:url.href,ssl:false}),schema='x5_native_'+randomUUID().replaceAll('-','');
 await admin.query('CREATE SCHEMA '+schema);process.env.PGOPTIONS='-c search_path='+schema;
 const db=await import('../src/lib/db');await db.ensureSchema();
 const {DurableImageJobs}=await import('../src/lib/durable-image-jobs'),repo=await import('../src/lib/image-job-repository');
 const {storedDeliveryState,recoverStoredDelivery}=await import('../src/lib/imagegen/stored-delivery');
 const {USER_COOKIE,signUserSession}=await import('../src/lib/native-auth');
 const {GET:mediaGet}=await import('../src/app/media/[...path]/route'),{GET:jobGet}=await import('../src/app/api/generate-image/route');
 const owner='native-x5@fixture.test',other='other-x5@fixture.test';
 await db.getOrCreateUser(owner);await db.getOrCreateUser(other);await db.addCreditBatch(owner,100,{source:'admin',reason:'X5 local fixture'});await db.setSetting('multi_user_enabled','1');
 const png=await sharp({create:{width:512,height:512,channels:3,background:'#3985bc'}}).png({compressionLevel:0}).toBuffer();let posts=0;
 const server=createServer(async(req,res)=>{for await(const _ of req){}posts++;res.setHeader('content-type','application/json');res.end(JSON.stringify([{url:'data:image/png;base64,'+png.toString('base64')}]));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const request=(path:string,email=owner)=>new Request(origin+path,{headers:{cookie:`${USER_COOKIE}=${signUserSession(email,Date.now())}`}});
 try{
  const id='x5-native-child-'+randomUUID(),parent='x5-native-parent-'+randomUUID(),op=randomUUID(),jobs=new DurableImageJobs<any>('generate');
  const quote:BillingQuote={schemaVersion:1,engineVersion:1,configVersion:1,facts:{feature:'image.generate',quantity:1,quality:'medium',resolution:'1K',metered:true,byok:false,paidFen:0,userGroup:'fixture'},tariff:{label:'X5 fixture',rules:[],enabled:true,unit:'image',pricing:{mode:'fixed',credits:6},settlement:{unknown:'hold',qualityBasis:'requested',successBasis:'successful-units',failureBps:0,byokBps:10000,reserveBps:10000}},costRates:{},reserveCredits:6,requestedCredits:6,authorizedCredits:6,matchedRuleId:null};
  const plan={request:{version:1,operationId:op,entry:'canvas',mode:'generate',prompt:'X5 fixture',inputs:[],variants:1,output:{format:'png'}},intent:{operation:'generate',background:'opaque',conflicts:[],requirements:[]},steps:[{key:'generate',operation:'generate',parameters:{},eligibleUpstreamIds:[],credits:6}],warnings:[],totalCredits:6,confirmationRequired:false} as unknown as ImagegenPlan;
  await jobs.create(id,owner,{status:'pending',createdAt:Date.now()},{p:{count:1,prompt:'X5 fixture',quality:'medium'},cost:6},6,true,quote);
  await repo.createImageJob(parent,owner,'imagegen',{status:'error',children:{generate:{jobId:id}},result:{operationId:op,jobId:parent,status:'failed',stage:'saving',artifacts:[],chargedCredits:0,warnings:[]}},{plan},0,false);
  let callback=false;await jobs.kick(id,async()=>{callback=true;await jobs.paidOperation(id,'fixture',{id,managedGateway:false},async()=>await(await fetch(origin+'/generate',{method:'POST'})).json());await jobs.patch(id,{status:'error',error:'X5 controlled interruption after paid checkpoint'});});
  const deadline=Date.now()+15000;let row;do{row=await repo.getImageJob(id,'generate');if(callback&&row&&!row.lease_token&&row.snapshot.status==='error')break;await sleep(20);}while(Date.now()<deadline);
  assert.equal(callback,true);assert.equal(posts,1);assert.equal(row!.snapshot.status,'error');assert.equal(row!.lease_token,null);
  const originalToken=(row!.snapshot.paidOperations as any)[id].attemptToken,raw=JSON.stringify(row!.snapshot);
  assert.ok(raw.includes('$imageJobBuffer'));assert.ok(!raw.includes(png.toString('base64')));assert.ok(Buffer.byteLength(raw)<2000);
  const child=spawnSync(process.execPath,['--conditions=react-server','--import=tsx',resolve('scripts/verify-image-result-storage-native.ts'),'--read',id,sha(png)],{env:process.env,encoding:'utf8',timeout:30000});process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);assert.equal(child.status,0);
  assert.equal((await storedDeliveryState(parent,owner))?.available,true);assert.equal(await storedDeliveryState(parent,other),null);await assert.rejects(()=>recoverStoredDelivery(parent,other));
  const recovered=await recoverStoredDelivery(parent,owner);assert.equal(recovered.complete,true);assert.equal(recovered.artworkIds.length,1);assert.equal(posts,1);
  const again=await recoverStoredDelivery(parent,owner);assert.deepEqual(again.artworkIds,recovered.artworkIds);assert.equal(posts,1);
  const final=await repo.getImageJob(id,'generate');assert.equal((final!.snapshot.paidOperations as any)[id].attemptToken,originalToken);
  const ledger=(await db.getPool().query('SELECT count(*)::int n,sum(delta)::int delta FROM app_ledger WHERE id=$1',['led-image-'+id])).rows[0];assert.deepEqual(ledger,{n:1,delta:-6});
  const poll=await jobGet(request('/api/generate-image?job='+id)),text=await poll.text();assert.equal(poll.status,200);assert.ok(!text.includes('$imageJob')&&!text.includes('base64')&&!text.includes('paidOperations'));
  const image=JSON.parse(text).images[0],media=await mediaGet(request(image.url),{params:Promise.resolve({path:image.url.slice(7).split('/')})});assert.equal(media.status,200);assert.equal(sha(Buffer.from(await media.arrayBuffer())),sha(png));
  assert.equal((await jobGet(request('/api/generate-image?job='+id,other))).status,403);
  assert.equal((await mediaGet(request(image.url,other),{params:Promise.resolve({path:image.url.slice(7).split('/')})})).status,404);
  console.log(`NATIVE_RECOVERY=PASS SNAPSHOT_BYTES=${Buffer.byteLength(raw)} OBJECT_BYTES=${png.length} HTTP_POSTS=1 RECOVERY_POSTS=0 LEDGER=1 DELTA=-6 GET_BYTES=${Buffer.byteLength(text)} CROSS_OWNER_JOB=403 CROSS_OWNER_MEDIA=404`);
 }finally{
  await (await import('../src/lib/imagegen/coordination-pool')).closeImageCoordinationPool();await db.getPool().end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();await new Promise<void>(r=>server.close(()=>r()));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
