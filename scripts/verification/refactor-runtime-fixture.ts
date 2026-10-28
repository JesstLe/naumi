/** Full-image acceptance: only setup uses imported domain APIs. All tested
 * operations cross the packaged Web HTTP boundary and the packaged Worker. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
import {getPool} from '../../src/platform/db/pool';
import {initializeApplicationPersistence} from '../../src/lib/application/persistence';
import {createModelRepository} from '../../src/lib/model-config/repository';
import {createCredentialStore} from '../../src/lib/model-config/credentials';
import {fixtureModelConfig} from '../model-config-unit-fixture';
import {seed} from '../direct-worker-pg-fixture';
import {getBillingRuntime} from '../../src/lib/billing/runtime';
import {getOrCreateUser} from '../../src/lib/accounts/session';
import {addCreditBatch} from '../../src/lib/billing/grants';
import {hashPassword} from '../../src/lib/pw';
import {signUserSession} from '../../src/lib/native-auth';
import {compileCanvasHistory} from '../../src/lib/canvas/history-model';

const out='/evidence',sql=getPool(),origin='http://web:3000',provider='http://provider:3300';
const secret=process.env.VIDEO_WORKER_SECRET!,releaseSecret=process.env.RELEASE_CONTROL_SECRET!;
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let checks=0;const eq=(a:unknown,b:unknown,label='')=>{assert.deepEqual(a,b,label);checks++;};
const ok=(a:unknown,label='')=>{assert.ok(a,label);checks++;};
const events:unknown[]=[];
async function request(url:string,body?:unknown,cookie?:string){
 const begin=performance.now();const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{origin,'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 const value=await response.json();events.push({path:new URL(url).pathname,status:response.status,ms:Math.round(performance.now()-begin)});return {status:response.status,body:value};
}
async function until<T>(read:()=>Promise<T>,accept:(v:T)=>boolean,label:string,timeout=90000){const end=Date.now()+timeout;let value:T|undefined;while(Date.now()<end){value=await read();if(accept(value))return value;await sleep(100);}throw Error(label+' TIMEOUT '+JSON.stringify(value));}
export async function setup(){
 const cred=await createCredentialStore(sql).importPlain({providerId:'p1',plain:'fixture-r6b-provider-only',actor:'fixture'});
 const config=fixtureModelConfig(provider+'/v1',cred.id);
 // Existing retained-job fixture predates the public image-a name. Preserve
 // that accepted legacy ID in this fixture's catalog, not by rewriting jobs.
 config.publicModels.push({...config.publicModels[0],id:'gpt-image-2',label:'Retained fixture model'});
 config.upstreamModels[0].capabilities.preserveIdentity=true;
 config.upstreamModels[0].parameterMap={resolutionPolicy:{mode:'map',field:'resolution',ratioField:'aspect_ratio',values:{'1K':'1K','2K':'2K'}}};
 await createModelRepository({pool:sql,initialize:async()=>config,trustedOrigins:[provider]}).current();
 await initializeApplicationPersistence();const retained=await seed();
 const owner='runtime-owner@fixture.test',other='runtime-other@fixture.test',poor='runtime-poor@fixture.test',password='fixture-login-only-20261026';
 for(const email of [owner,other,poor]){
  await getOrCreateUser(email);await sql.query('DELETE FROM app_ledger WHERE email=$1',[email]);await sql.query('DELETE FROM app_credit_batches WHERE email=$1',[email]);await sql.query('UPDATE app_users SET credits_total=0,credits_used=0,password_hash=$2 WHERE email=$1',[email,hashPassword(password)]);
 }
 await addCreditBatch(owner,1000,{source:'admin',reason:'R6B isolated runtime fixture'});
 const billing=await getBillingRuntime(),current=await billing.config.current(),cfg=structuredClone(current.config);cfg.switches.metering='on';
 for(const feature of ['image.generate','canvas.image'] as const){cfg.features[feature].pricing={mode:'fixed',credits:6};cfg.features[feature].rules=[];}
 await billing.config.publish({id:randomUUID(),actor:'fixture',reason:'R6B public entry original price',expectedVersion:current.version,config:cfg});
 await writeFile(out+'/SETUP.json',JSON.stringify({retained,owner,other,poor,password},null,2)+'\n');
 console.log('REFACTOR_RUNTIME_SETUP=PASS REAL_SCHEMA=1 REAL_CONFIG=1 RETAINED_KINDS=4 USER_PASSWORDS=FIXTURE_ONLY');
}
async function run(){
 const input=JSON.parse(await readFile(out+'/SETUP.json','utf8')),source=process.env.SOURCE_COMMIT!;
 const controlStatus=async()=>{const r=await fetch('http://127.0.0.1:3001/status',{headers:{'x-video-worker-secret':secret}});assert.equal(r.status,200);return r.json();};
 const control=async(action:string)=>{const s=await controlStatus();const r=await fetch('http://127.0.0.1:3001/control',{method:'POST',headers:{'x-video-worker-secret':secret,'content-type':'application/json'},body:JSON.stringify({action,operationId:randomUUID(),bootId:s.bootId,expectedRevision:s.revision})});const b=await r.json();eq(r.status,200,JSON.stringify(b));return b.state;};
 const stats=async()=>(await request(provider+'/fixture/stats')).body;
 const login=await request(origin+'/api/auth/login',{email:input.owner,password:input.password});eq(login.status,200,JSON.stringify(login.body));
 // Cookie issuance is checked separately, then the same real signed session is used.
 const auth=await fetch(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:input.owner,password:input.password})});
 const cookie=auth.headers.get('set-cookie')!.split(';')[0];ok(cookie.startsWith('nv_user='));
 const otherCookie='nv_user='+signUserSession(input.other,Date.now()),poorCookie='nv_user='+signUserSession(input.poor,Date.now());
 const http=async(path:string,body?:unknown,c=cookie)=>(await request(origin+path,body,c));
 const accepted=async(op:string,quoteId:string,c=cookie)=>{const r=await http('/api/imagegen',{operationId:op,quoteId},c);eq(r.status,200,JSON.stringify(r.body));return r.body;};
 const result=async(op:string)=>(await http('/api/imagegen?operationId='+op)).body;
 const completed=(op:string)=>until(()=>result(op),r=>['succeeded','partial','failed','cancelled','needs_attention'].includes(r.status),'imagegen '+op);
 const plan=async(prompt:string,c=cookie)=>{const operationId=randomUUID(),raw={version:1,operationId,entry:'canvas',mode:'generate',prompt,modelId:'image-a',parameters:{quality:'medium',resolution:'1K',ratio:'1:1'},output:{format:'png'},variants:1};const r=await http('/api/imagegen/plan',raw,c);eq(r.status,200,JSON.stringify(r.body));return {operationId,raw,quote:r.body};};
 const ledger=async(email=input.owner)=>(await sql.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int amount FROM app_ledger WHERE email=$1 AND kind='consume'",[email])).rows[0];
 const release=async()=>{const r=await fetch(origin+'/api/internal/release/status',{headers:{'x-release-control-secret':releaseSecret}});const b=await r.json();eq(r.status,200,JSON.stringify(b));return b;};
 const first=await controlStatus();eq(first.commit,source);eq(first.executionMode,'direct');eq(first.executorRole,'worker');eq(first.targetInstanceId,first.instanceId);eq(first.paused,true);eq(first.mediaWorker.version,source);eq(first.mediaWorker.sandbox,true);
 const web=await release();eq(web.identity.commit,source);eq(web.identity.instanceId,'r6b-web');ok(web.identity.bootId!==first.bootId);
 eq((await http('/api/health')).body.db.ok,true);eq((await stats()).calls,0);
 const a=await plan('R6B first blocked provider'),q=a.quote;eq(q.totalCredits,6);eq(q.confirmationRequired,false);
 const billing=await getBillingRuntime(),current=await billing.config.current(),changed=structuredClone(current.config);
 for(const feature of ['image.generate','canvas.image'] as const)changed.features[feature].pricing={mode:'fixed',credits:17};
 await billing.config.publish({id:randomUUID(),actor:'fixture',reason:'R6B current changes after preview',expectedVersion:current.version,config:changed});
 const repeat=await http('/api/imagegen/plan',a.raw);eq(repeat.body.quote.id,q.quote.id);eq(repeat.body.totalCredits,6);
 await accepted(a.operationId,q.quote.id);eq((await stats()).calls,0);eq(await ledger(),{n:0,amount:0});
 const beforeJob=(await sql.query('SELECT lease_token,snapshot FROM app_image_jobs WHERE id=$1',['imagegen-'+a.operationId])).rows[0];eq(beforeJob.lease_token,null);eq(beforeJob.snapshot.status,'pending');
 eq((await http('/api/imagegen?operationId='+a.operationId,undefined,otherCookie)).status,404);
 await control('resume');await until(stats,s=>s.waiting===1,'supplier held');
 const active=await controlStatus();eq(active.activeTicks,1);ok(active.backgroundTasks>0);eq(active.tickDrainComplete,false);
 const latency:number[]=[];for(let i=0;i<5;i++){const t=performance.now();eq((await http('/api/health')).body.db.ok,true);latency.push(Math.round(performance.now()-t));}ok(Math.max(...latency)<5000,'Web responsive during paid callback');
 const b=await plan('R6B second arrival while first waits');eq(b.quote.totalCredits,17);await accepted(b.operationId,b.quote.quote.id);
 await until(stats,s=>s.waiting===2,'second task wakeup during original tick');
 const draining=await control('drain');eq(draining.phase,'DRAINING');eq(draining.tickDrainComplete,false);eq(draining.mediaWorker.draining,true);
 const c=await plan('R6B cancel before execution');await accepted(c.operationId,c.quote.quote.id);
 eq((await http('/api/imagegen/cancel',{action:'cancel',operationId:c.operationId})).status,200);
 eq((await stats()).calls,2);await request(provider+'/fixture/release',{});
 const ra=await completed(a.operationId),rb=await completed(b.operationId);eq(ra.status,'succeeded',JSON.stringify(ra));eq(rb.status,'succeeded',JSON.stringify(rb));eq(ra.chargedCredits,6);eq(rb.chargedCredits,17);eq(ra.billingStatus,'confirmed');eq(ra.artifacts.length,1);
 await until(controlStatus,s=>s.tickDrainComplete,'first tick drained');eq(await ledger(),{n:2,amount:23});
 const artifact=ra.artifacts[0];const mediaResponse=await fetch(new URL(artifact.url,origin),{headers:{cookie}});eq(mediaResponse.status,200);const pixels=Buffer.from(await mediaResponse.arrayBuffer()),metadata=await sharp(pixels).metadata();eq([metadata.width,metadata.height],[1024,1024]);
 ok((await sql.query('SELECT 1 FROM app_artworks WHERE email=$1 AND id=$2',[input.owner,artifact.artworkId])).rowCount===1);
 const duplicate=await accepted(a.operationId,q.quote.id);eq(duplicate.operationId,a.operationId);eq((await stats()).calls,2);eq(await ledger(),{n:2,amount:23});
 // Real packaged Canvas route, disjoint field merge, conflicting field reject,
 // and original operation replay returning current canonical state.
 const saved=(await sql.query('SELECT title FROM app_artworks WHERE id=$1',[artifact.artworkId])).rows[0];
 const rename={operationId:randomUUID(),operations:compileCanvasHistory({kind:'rename',id:artifact.artworkId,from:saved.title,to:'R6B canonical A'},false,()=>undefined)};
 eq((await http('/api/canvas/history',rename)).status,200);
 const conflict=await http('/api/canvas/history',{operationId:randomUUID(),operations:compileCanvasHistory({kind:'rename',id:artifact.artworkId,from:saved.title,to:'R6B stale B'},false,()=>undefined)});eq(conflict.status,409);eq(conflict.body.code,'CANVAS_ARTWORK_CONFLICT');
 const mark={operationId:randomUUID(),operations:compileCanvasHistory({kind:'mark',changes:[{id:artifact.artworkId,from:false,to:true}]},false,()=>undefined)};eq((await http('/api/canvas/history',mark)).status,200);
 const canonical=await http('/api/canvas/history',rename);eq(canonical.status,200);eq(canonical.body.artworkNodes[0].node.title,'R6B canonical A');eq(canonical.body.artworkNodes[0].node.marked,true);
 const text={id:'r6b-text-'+randomUUID(),projectKey:'tree:r6b',title:'Original text',prompt:'',content:'Original content',status:'completed',canvasX:10,canvasY:20,width:300,height:176,createdAt:new Date().toISOString(),sourceIds:[],targetIds:[],productIds:[]};
 const textCreated=await http('/api/canvas/text-nodes',{...text,base:null});eq(textCreated.status,200,JSON.stringify(textCreated.body));const base=textCreated.body.node;
 const ta=await http('/api/canvas/text-nodes',{...base,content:'Tab A kept content',base});eq(ta.status,200);
 const tb=await http('/api/canvas/text-nodes',{...base,width:600,base});eq(tb.status,200);eq(tb.body.node.content,'Tab A kept content');eq(tb.body.node.width,600);
 const tc=await http('/api/canvas/text-nodes',{...base,content:'Tab B conflicting content',base});eq(tc.status,409);eq(tc.body.code,'CANVAS_TEXT_CONFLICT');eq(tc.body.current.content,'Tab A kept content');
 const textRead=await http('/api/canvas/text-nodes');eq(textRead.body.nodes.find((n:any)=>n.id===text.id).width,600);
 const poor=await plan('R6B insufficient actual wallet',poorCookie);const insufficient=await http('/api/imagegen',{operationId:poor.operationId,quoteId:poor.quote.quote.id},poorCookie);
 // Domain acceptance can precede the child's wallet reserve. Final state, no
 // supplier call and zero consume are checked, not inferred from HTTP alone.
 ok([200,400,402].includes(insufficient.status));
 // Workbench quote and explicit cancellation, then same original plan accepted.
 const wb={request_id:randomUUID(),prompt:'R6B workbench two outputs',count:2,quality:'medium',resolution:'1k',ratio:'1:1',modelId:'image-a',images:[]};
 const wq=await http('/api/reference-workbench/quote',{action:'single/start',body:wb});eq(wq.status,200,JSON.stringify(wq.body));eq(wq.body.totalCredits,34);
 eq((await http('/api/reference-workbench/single/start',{...wb,native_quote:{id:wq.body.id,confirmed:false}})).status,400);
 eq((await sql.query('SELECT state FROM app_reference_operations WHERE id=$1',[wq.body.id])).rows[0].state,'preview');eq((await stats()).calls,2);
 eq((await http('/api/reference-workbench/single/start',{...wb,native_quote:{id:wq.body.id}})).status,200);
 await control('resume');
 const cancelled=await completed(c.operationId);eq(cancelled.status,'cancelled');eq(cancelled.chargedCredits,0);
 if(insufficient.status===200){const p=await until(()=>request(origin+'/api/imagegen?operationId='+poor.operationId,undefined,poorCookie),v=>['failed','needs_attention'].includes(v.body.status),'poor wallet');eq(p.body.chargedCredits,0);}
 eq(await ledger(input.poor),{n:0,amount:0});
 const wr=await until(()=>http('/api/reference-workbench/single/status?id='+wq.body.id),r=>r.body.status!=='running','workbench');eq(wr.body.status,'done',JSON.stringify(wr.body));eq(wr.body.results.length,2);eq(wr.body.chargedCredits,34);
 // The same combined Worker's real native sandbox decodes and transforms an
 // actual delivered image. No fixture engine and no replacement media process.
 const mid=randomUUID(),mdir='/scratch/'+mid;await mkdir(mdir+'/inputs',{recursive:true});await writeFile(mdir+'/inputs/input-0.png',pixels);
 const mediaCall=async(method:string,pathname:string,body?:unknown)=>{const r=await fetch('http://127.0.0.1:3002'+pathname,{method,headers:{authorization:'Bearer '+process.env.MEDIA_WORKER_SECRET,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const nativeRequest={action:'ffmpeg',inputs:[{name:'input-0.png',bytes:pixels.length,sha256:createHash('sha256').update(pixels).digest('hex')}],outputs:['native.png'],args:['-i','asset:0','-frames:v','1','output:0']};
 eq((await mediaCall('POST','/jobs/'+mid,nativeRequest)).status,202);
 const native=await until(()=>mediaCall('GET','/jobs/'+mid),r=>['completed','failed','cancelled'].includes(r.body.status),'native media');eq(native.body.status,'completed',JSON.stringify(native.body));
 const nativeOutput=native.body.result.outputs[0],nativeBytes=await readFile(mdir+'/results/'+nativeOutput.name);eq(createHash('sha256').update(nativeBytes).digest('hex'),nativeOutput.sha256);eq(nativeOutput.probe.width,1024);eq(nativeOutput.probe.height,1024);eq(nativeOutput.probe.videoCodec,'png');
 eq((await mediaCall('PATCH','/jobs/'+mid)).status,200);eq((await mediaCall('GET','/jobs/'+mid)).status,410);
 // Execute the core-verified four-source recipe
 // through this same image's actual native media Worker and Linux sandbox.
 const timelineChecksBefore=checks,vector=JSON.parse(await readFile('/evidence/timeline-inputs/result.json','utf8')),timelineId=randomUUID(),timelineDir='/scratch/'+timelineId;
 const vectorFiles:Record<string,string>={red:'red.mp4',blue:'blue.mp4',music:'music.wav',green:'green.png'},sourceBytes:Record<string,Buffer>={};
 await mkdir(timelineDir+'/inputs',{recursive:true});
 const manifest=[];
 for(const id of vector.recipe.inputs){const name=vectorFiles[id],bytes=await readFile('/evidence/timeline-inputs/'+name);eq(createHash('sha256').update(bytes).digest('hex'),vector.sourceHashesUnchanged[id]);sourceBytes[id]=bytes;await writeFile(timelineDir+'/inputs/'+name,bytes);manifest.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 const timelineRequest={action:vector.recipe.action,inputs:manifest,outputs:vector.recipe.outputs,args:vector.recipe.args,auxiliaryFiles:vector.recipe.auxiliaryFiles,auxiliaryOutputs:vector.recipe.auxiliaryOutputs};
 eq((await mediaCall('POST','/jobs/'+timelineId,timelineRequest)).status,202);
 const timelineRun=await until(()=>mediaCall('GET','/jobs/'+timelineId),r=>['completed','failed','cancelled'].includes(r.body.status),'packaged native timeline');eq(timelineRun.body.status,'completed',JSON.stringify(timelineRun.body));
 const movie=timelineRun.body.result.outputs.find((v:any)=>v.name==='timeline.mp4');ok(movie);eq(movie.probe.width,320);eq(movie.probe.height,180);ok(Math.abs(movie.probe.durationSeconds-3.5)<.04);ok(movie.probe.audioCodecs.length>0);
 const movieBytes=await readFile(timelineDir+'/results/'+movie.name);eq(createHash('sha256').update(movieBytes).digest('hex'),movie.sha256);
 const probeId=randomUUID(),probeDir='/scratch/'+probeId;await mkdir(probeDir+'/inputs',{recursive:true});
 const probeInputs=[{name:'rendered.mp4',bytes:movieBytes},...['red','music'].map(id=>({name:vectorFiles[id],bytes:sourceBytes[id]}))];
 for(const input of probeInputs)await writeFile(probeDir+'/inputs/'+input.name,input.bytes);
 const times=[.5,1.8,2.25,2.75,3.25],probeOutputs=[...times.map((_,i)=>'pixel-'+i+'.png'),'mixed.wav','source440.wav','source660.wav'],probeArgs=['-i','asset:0','-i','asset:1','-i','asset:2'];
 for(const [i,time] of times.entries())probeArgs.push('-map','0:v:0','-ss',String(time),'-frames:v','1','-vf','scale=1:1','output:'+i);
 for(const i of [0,1,2])probeArgs.push('-map',i+':a:0','-ac','1','-ar','48000','-c:a','pcm_f32le','output:'+(5+i));
 eq((await mediaCall('POST','/jobs/'+probeId,{action:'ffmpeg',inputs:probeInputs.map(input=>({name:input.name,bytes:input.bytes.length,sha256:createHash('sha256').update(input.bytes).digest('hex')})),outputs:probeOutputs,args:probeArgs})).status,202);
 const probeRun=await until(()=>mediaCall('GET','/jobs/'+probeId),r=>['completed','failed','cancelled'].includes(r.body.status),'packaged timeline pixels and mix');eq(probeRun.body.status,'completed',JSON.stringify(probeRun.body));
 const probes:Record<string,Buffer>={},colors:Record<string,number[]>={};
 for(const name of probeOutputs){const entry=probeRun.body.result.outputs.find((v:any)=>v.name===name);ok(entry);const bytes=await readFile(probeDir+'/results/'+name);eq(createHash('sha256').update(bytes).digest('hex'),entry.sha256);probes[name]=bytes;}
 for(const [i,time] of times.entries()){const rgb=[...(await sharp(probes['pixel-'+i+'.png']).removeAlpha().raw().toBuffer())];eq(rgb.length,3);colors[String(time)]=rgb;ok(rgb.every((v,c)=>Math.abs(v-vector.pixels[String(time)][c])<=4));}
 function pcm(bytes:Buffer){for(let i=12;i+8<=bytes.length;){const size=bytes.readUInt32LE(i+4);if(bytes.toString('ascii',i,i+4)==='data')return bytes.subarray(i+8,Math.min(bytes.length,i+8+size));i+=8+size+(size%2);}throw Error('PCM_DATA_MISSING');}
 function amp(buffer:Buffer,time:number,hz:number){let re=0,im=0;const start=Math.round(time*48000),n=4800;for(let j=0;j<n;j++){const x=buffer.readFloatLE((start+j)*4),phase=2*Math.PI*hz*j/48000;re+=x*Math.cos(phase);im-=x*Math.sin(phase);}return 2*Math.hypot(re,im)/n;}
 const mixed=pcm(probes['mixed.wav']),redGain=amp(mixed,.8,440)/amp(pcm(probes['source440.wav']),1.05,440),musicGain=amp(mixed,.8,660)/amp(pcm(probes['source660.wav']),.3,660);
 ok(Math.abs(redGain-.5)<.04);ok(Math.abs(musicGain-.25)<.04);ok(amp(mixed,2.8,440)<.002);ok(amp(mixed,2.8,660)<.002);
 for(const id of vector.recipe.inputs)eq(createHash('sha256').update(await readFile(timelineDir+'/inputs/'+vectorFiles[id])).digest('hex'),vector.sourceHashesUnchanged[id]);
 for(const id of [timelineId,probeId]){eq((await mediaCall('PATCH','/jobs/'+id)).status,200);eq((await mediaCall('GET','/jobs/'+id)).status,410);}
 const packagedTimeline={status:'PASS',source,image:process.env.R6B_IMAGE_ID,actualPackagedWorker:true,actualLinuxSandbox:true,sourceInputs:vector.sourceHashesUnchanged,outputSha256:movie.sha256,width:320,height:180,duration:movie.probe.durationSeconds,colors,redGain,musicGain,originalRuntimeAssertionsUnchanged:true,additionalChecks:checks-timelineChecksBefore,engineReplacement:false};
 await writeFile(out+'/PACKAGED_TIMELINE_RESULT.json',JSON.stringify(packagedTimeline,null,2)+'\n');
 console.log('PACKAGED_TIMELINE_NATIVE=PASS SAME_IMAGE=1 SOURCES=4 ACTUAL_LINUX_SANDBOX=1 DISSOLVE_OVERLAY_PIXELS=5 AUDIO_GAIN=MEASURED SOURCE_HASHES=UNCHANGED RETIREMENT_ACK=PASS CHECKS='+packagedTimeline.additionalChecks);


 await until(stats,s=>s.calls===4,'exact four fixture outputs');
 await http('/api/reference-workbench/single/start',{...wb,native_quote:{id:wq.body.id,confirmed:false}});eq((await stats()).calls,4);eq(await ledger(),{n:4,amount:57});
 await control('drain');const final=await until(controlStatus,s=>s.tickDrainComplete,'final worker drain');eq(final.unresolvedTicks,0);eq(final.backgroundTasks,0);eq(final.mediaWorker.running,0);
 for(const [kind,id] of Object.entries(input.retained.ids)){const row=(await sql.query('SELECT snapshot,payload FROM app_image_jobs WHERE id=$1',[id])).rows[0];eq(row.snapshot.status,'done',kind);if(kind!=='imagegen')eq(row.payload.billingQuote,input.retained.quotes[kind]);}
 eq(await ledger(input.retained.owner),{n:3,amount:18});
 eq((await sql.query('SELECT lease_token FROM app_image_jobs WHERE id=$1',[input.retained.live])).rows[0].lease_token,input.retained.token);
 eq((await sql.query('SELECT snapshot FROM app_image_jobs WHERE id=$1',[input.retained.unknown])).rows[0].snapshot.status,'needs_attention');
 const receipts=(await sql.query('SELECT phase,web_instance_id,worker_instance_id FROM app_worker_tick_receipts')).rows;ok(receipts.length>0);ok(receipts.every(r=>r.phase==='completed'&&r.web_instance_id==='r6b-worker'&&r.worker_instance_id==='r6b-worker'));
 const webFinal=await release();eq(webFinal.observations.trackedAcceptedWork,0);eq(webFinal.observations.unknownLeases,0);
 const finalStats=await stats();eq(finalStats.unexpected,0);eq(finalStats.edits,0);ok(finalStats.wires.every((w:any)=>w.model==='wire-image-one'));
 const report={status:'PASS',checks,source,image:process.env.R6B_IMAGE_ID,webWorkerSameImage:true,actualFullImage:true,web: {identity:webFinal.identity,healthLatencyWhileProviderHeldMs:latency},worker:final,supplier:finalStats,ledger:await ledger(),retainedLedger:await ledger(input.retained.owner),artwork:{id:artifact.artworkId,sha256:createHash('sha256').update(pixels).digest('hex'),width:metadata.width,height:metadata.height},events,production:false,capacity:false,browser:false};
 await writeFile(out+'/RUNTIME_RESULT.json',JSON.stringify(report,null,2)+'\n');
 console.log(`REFACTOR_RUNTIME=PASS CHECKS=${checks} FULL_IMAGE=1 WEB_WORKER_SAME_IMAGE=1 REAL_LOGIN=1 HTTP_SUBMIT=1 WORKER_DIRECT=1 FIXTURE_POSTS=4 USER_CONSUME=4 USER_CREDITS=57 RETAINED_CONSUME=3 RETAINED_CREDITS=18 ORIGINAL_PRICE=6_CURRENT17 UNKNOWN_REPLAY=0 CANCELLED_POSTS=0 WEB_LIVE_DURING_WORK=1 CANVAS_CAS=ART_AND_TEXT WORKBENCH=2 NATIVE_FFMPEG=1 DRAIN=COMPLETE EXTERNAL=0 DEPLOY=0`);
}
async function main(){assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'db');assert.match(process.env.PGOPTIONS||'',/search_path=r6b_[0-9a-f]+$/);try{if(process.argv.includes('--setup'))await setup();else await run();}finally{await sql.end();}}
if(!process.argv.includes('--browser-helper'))main().catch(async error=>{await writeFile(out+'/RUNTIME_FAILURE.json',JSON.stringify({error:String(error),stack:error.stack,checks,events},null,2)+'\n').catch(()=>{});console.error(error);process.exitCode=1;});
