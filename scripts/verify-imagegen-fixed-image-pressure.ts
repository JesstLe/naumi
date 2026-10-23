/** Local-only fixed-image acceptance. Source imports seed isolated fixtures only;
 * all tested generation, decoding, storage and settlement run in the unmodified image. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Pool} from 'pg';
import sharp from 'sharp';

const args=process.argv.slice(2);
const option=(key:string,fallback:string)=>args.find(x=>x.startsWith('--'+key+'='))?.slice(key.length+3)||fallback;
const IMAGE=option('image','sha256:1680624b3ed72ae9e25d6aa1702088ce4d64738c11c50ac06ba6a8ed80bccb62');
const SOURCE=option('source','9f049b07b4219b46ef8a5cb51bc49a4a0ad33e26');
const BUILD=option('build','1792731828');
const DB='postgresql://fixture:fixture-local-only@127.0.0.1:65433/simplify?sslmode=disable';
const SECRET='fixed-image-pressure-local-fixture-secret-20261023';
const WORKER_SECRET='fixed-image-pressure-worker-secret-local-20261023';
const out=resolve(args.find(x=>x.startsWith('--output='))?.slice(9)||'output/imagegen-fixed-image-pressure-20261023');
const selected=(args.find(x=>x.startsWith('--cases='))?.slice(8)||'6,16,4,8,worker').split(',');
function positiveInteger(key:string,fallback:number){const raw=option(key,String(fallback));assert.match(raw,/^[1-9]\d*$/,`--${key} must be a positive integer`);const value=Number(raw);assert.ok(Number.isSafeInteger(value),`--${key} must be a safe integer`);return value;}
const webMemoryMiB=positiveInteger('web-memory-mib',3072),heapMiB=positiveInteger('heap-mib',2688);
const workerMemoryMiB=positiveInteger('worker-memory-mib',1024),workerHeapMiB=positiveInteger('worker-heap-mib',64);
const laneOverride=option('lane','')?positiveInteger('lane',4):undefined;
const suiteLane=positiveInteger('suite-lane',2),aplusLane=positiveInteger('aplus-lane',2);
const nativeMemoryProfile=option('native-memory-profile','off');
assert.ok(['off','bounded'].includes(nativeMemoryProfile),'--native-memory-profile must be off or bounded');
assert.ok(heapMiB<webMemoryMiB,'Web heap must leave room for native allocations');
assert.ok(workerHeapMiB<workerMemoryMiB,'Worker heap must leave room for native allocations');
assert.ok(selected.length>0&&selected.every(label=>['6','16','4','8','worker'].includes(label)),'--cases must contain only 6,16,4,8,worker');
assert.equal(new Set(selected).size,selected.length,'--cases must not repeat cases');
const runtimeProfile={webMemoryMiB,heapMiB,workerMemoryMiB,workerHeapMiB,lane:laneOverride??'per-case',suiteLane,aplusLane,nativeMemoryProfile};
const nodeOptions=(heap:number)=>`--max-old-space-size=${heap} ${nativeMemoryProfile==='bounded'?'--require=/app/scripts/runtime-memory.cjs ':''}--require=/app/scripts/release-http-observer.cjs`;
const nativeEnv:Record<string,string>=nativeMemoryProfile==='bounded'?{NAUMI_NATIVE_MEMORY_PROFILE:'bounded',MALLOC_ARENA_MAX:'2',UV_THREADPOOL_SIZE:'2'}:{};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
function docker(...a:string[]){return execFileSync('docker',a,{encoding:'utf8',maxBuffer:20*1024*1024}).trim();}
async function save(name:string,value:unknown){await writeFile(join(out,name),typeof value==='string'?value:JSON.stringify(value,null,2));}
function parseSample(line:string){const [at,current,peak,max,swap,events]=line.split('|');return {at:Number(at),current:Number(current),peak:Number(peak),max,swap,events:Object.fromEntries((events||'').split(';').filter(Boolean).map(x=>{const [k,v]=x.split('=');return [k,Number(v)];}))};}
async function selfTest(){assert.equal(parseSample('10|20|30|40|0|oom=0;oom_kill=1;').events.oom_kill,1);assert.equal(parseSample('10|20|30|40|0|oom=0;').peak,30);assert.match(IMAGE,/^sha256:[a-f0-9]{64}$/);assert.ok(nodeOptions(heapMiB).includes('--require=/app/scripts/release-http-observer.cjs'));if(nativeMemoryProfile==='bounded'){assert.ok(nodeOptions(heapMiB).includes('--require=/app/scripts/runtime-memory.cjs'));assert.equal(nativeEnv.UV_THREADPOOL_SIZE,'2');assert.equal(nativeEnv.MALLOC_ARENA_MAX,'2');}console.log('PASS fixed-image pressure harness self-test (sample parser, immutable image identity, explicit runtime profile)');console.log(JSON.stringify(runtimeProfile));}

async function main(){
 if(args.includes('--self-test'))return selfTest();
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1','Explicit local-only opt-in required');
 assert.match(IMAGE,/^sha256:[a-f0-9]{64}$/);assert.match(SOURCE,/^[a-f0-9]{40}$/);assert.match(BUILD,/^\d+$/);
 assert.equal(docker('image','inspect',IMAGE,'--format','{{.Id}}'),IMAGE);
 assert.equal(docker('image','inspect',IMAGE,'--format','{{range .Config.Env}}{{println .}}{{end}}').includes('SOURCE_COMMIT='+SOURCE),true);
 await mkdir(out,{recursive:true});
 const memory=docker('info','--format','{{.MemTotal}}');
 assert.ok(Number(memory)>(webMemoryMiB+workerMemoryMiB+2048)*1024**2,'Local VM needs room for configured Web + Worker caps and 2GiB for existing processes');
 await save('preflight.json',{image:IMAGE,source:SOURCE,build:BUILD,dockerMemory:Number(memory),running:docker('ps','--format','{{.Names}} {{.Image}}'),selected,runtimeProfile,localOnly:true});
 const admin=new Pool({connectionString:DB,ssl:false,max:2});
 const schemas:string[]=[],ownedContainers=new Set<string>();
 const allOwnedNames:string[]=[];
 function removeOwned(name:string,schema?:string){const observed=JSON.parse(docker('inspect',name))[0];const owner=observed.Config.Labels?.['naumi.pressure.owner'];assert.ok(schemas.includes(owner));if(schema)assert.equal(owner,schema);docker('rm','-f','-v',observed.Id);ownedContainers.delete(name);}
 const results:any[]=[];const posts:any[]=[];let digest='',active=0,maxActive=0,gateTarget=1,gateStart=0,gateReleased=false;
 const tile=Buffer.alloc(1024*1024*3);let seed=0x12345678;
 for(let i=0;i<tile.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;tile[i]=seed&255;}
 const png=await sharp(tile,{raw:{width:1024,height:1024,channels:3}}).resize(4096,4096,{kernel:'nearest'}).png({compressionLevel:6}).toBuffer();
 assert.ok(png.length<12*1024**2,'Each reference stays below the real handler input bound');
 await writeFile(join(out,'fixture-4k.png'),png);
 const encoded=png.toString('base64');
 const supplier=createServer(async(req,res)=>{
  try{
   const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const bytes=Buffer.concat(chunks);
   const ct=String(req.headers['content-type']||'');let body:any=ct.includes('json')?JSON.parse(bytes.toString()||'{}'):{};
   res.setHeader('content-type','application/json');
   if(req.url?.startsWith('/internal/config')){
    if(req.url.endsWith('/prepare'))return res.end(JSON.stringify({digest:body.digest,phase:'prepared'}));
    if(req.url.endsWith('/activate')){digest=body.digest;return res.end(JSON.stringify({id:body.id,digest,phase:'applied'}));}
    return res.end(JSON.stringify({digest}));
   }
   if(req.method==='POST'&&/\/images\/(edits|generations)$/.test(req.url||'')){
    const record:any={index:posts.length+1,at:Date.now(),path:req.url,requestBytes:bytes.length,contentType:ct};posts.push(record);
    if(ct.includes('multipart')){
     const form=await new Request('http://fixture'+req.url,{method:'POST',headers:{'content-type':ct},body:bytes}).formData();
     body=Object.fromEntries([...form.entries()].filter(([,v])=>typeof v==='string'));
     const files=[...form.entries()].filter(([,v])=>v instanceof File).map(([field,v])=>({field,size:(v as File).size}));record.references=files;record.referenceCount=files.length;
    }else record.referenceCount=Array.isArray(body.images)?body.images.length:0;
    Object.assign(record,{prompt:body.prompt,n:body.n,model:body.model,size:body.size,quality:body.quality,operationId:req.headers['x-naumi-operation-id'],requestId:req.headers['x-request-id']});
    active++;maxActive=Math.max(maxActive,active);record.activeAtStart=active;
    // Hold the first wave until requested overlap (or a bounded timeout). This
    // deliberately exposes concurrent retained inputs instead of a tiny health peak.
    while(!gateReleased&&active<gateTarget&&Date.now()-gateStart<20000)await sleep(50);
    gateReleased=true;await sleep(1500);
    const data=JSON.stringify({created:1,data:[{b64_json:encoded}]});
    await new Promise<void>(r=>{res.end(data,r);});active--;record.completedAt=Date.now();record.responseBytes=Buffer.byteLength(data);return;
   }
   res.statusCode=404;res.end(JSON.stringify({error:'Unconfigured local fixture route'}));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
 });
 await new Promise<void>(r=>supplier.listen(0,'0.0.0.0',r));
 const supplierPort=(supplier.address() as any).port,origin=`http://host.docker.internal:${supplierPort}`;
 await save('fixture.json',{listen:'0.0.0.0',supplierPort,dockerOrigin:origin,png:{width:4096,height:4096,bytes:png.length,sha256:sha(png)},externalCalls:0});
 try{
  for(const label of selected){
   const lane=laneOverride??(label==='16'?16:6), jobs=label==='6'?6:label==='16'?16:1, count=label==='8'?8:label==='4'?4:1;
   const schema='pressure_'+randomUUID().replaceAll('-','');schemas.push(schema);await admin.query(`CREATE SCHEMA ${schema}`);
   const media=join(out,schema,'media');await mkdir(media,{recursive:true});
   const sql=new Pool({connectionString:DB,ssl:false,options:`-c search_path=${schema}`,max:3});
   // A separate seed process is required because the source DB module caches its pool.
   const seedConfig={schema,media,origin,lane,owner:`${schema}@example.test`,pngPath:join(out,'fixture-4k.png')};
   await save(schema+'-seed.json',seedConfig);
   const seedChild=spawn(process.execPath,['--conditions','react-server','--import','tsx',process.argv[1],'--seed='+join(out,schema+'-seed.json')],{env:{...process.env,DATABASE_URL:DB,PGOPTIONS:`-c search_path=${schema}`,SETTINGS_SECRET:SECRET,NAUMI_MULTI_USER:'1',MODEL_CONFIG_TRUSTED_ORIGINS:origin,STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:media},stdio:['ignore','pipe','pipe']});
   let seedLog='';seedChild.stdout.on('data',b=>seedLog+=b);seedChild.stderr.on('data',b=>seedLog+=b);
   const seedExit=await new Promise<number|null>(r=>seedChild.once('exit',r));await save(schema+'-seed.log',seedLog);assert.equal(seedExit,0,seedLog);
   const refIds=[0,1,2].map(i=>'ref-'+i);
   const {createHmac}=await import('node:crypto');const exp=Date.now()+86400000,eb=Buffer.from(seedConfig.owner).toString('base64url');
   const cookie=`nv_user=${eb}.${exp}.${createHmac('sha256',SECRET).update(`user:${eb}.${exp}`).digest('hex')}`;
   const suffix=schema.slice(-10),web='naumi-pressure-web-'+suffix,worker='naumi-pressure-worker-'+suffix;
   const samples:{[name:string]:ReturnType<typeof parseSample>[]}={web:[],worker:[]};const samplers:any[]=[];const dbSamples:any[]=[];let dbTimer:ReturnType<typeof setInterval>|undefined;
   const result:any={label,lane,jobs,count,refs:3,resolution:'4K',actualPixels:[4096,4096],schema,web,worker,image:IMAGE,runtimeProfile,attemptedAt:new Date().toISOString(),status:'NOT_PROVEN'};results.push(result);
   let webPort=0,api='';const startPost=posts.length;maxActive=0;
   try{
    const env:Record<string,string>={DATABASE_URL:DB.replace('127.0.0.1','host.docker.internal'),PGOPTIONS:`-c search_path=${schema}`,SETTINGS_SECRET:SECRET,VIDEO_WORKER_SECRET:WORKER_SECRET,NAUMI_MULTI_USER:'1',NAUMI_ROUTER_MANAGEMENT_URL:origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'local-router-fixture-token-independent-123456789',MODEL_CONFIG_ENVELOPE_SECRET:'local-envelope-fixture-secret-independent-987654321',MODEL_CONFIG_TRUSTED_ORIGINS:origin,OPENAI_API_KEY:'fixture-only',OPENAI_BASE_URL:origin+'/v1',STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_DIR:'/data/media',NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE:String(lane),NAUMI_IMAGE_JOB_CONCURRENCY_IMAGEGEN:String(lane),INTERNAL_APP_ORIGIN:'http://127.0.0.1:3000',NODE_OPTIONS:'--max-old-space-size=2688 --require=/app/scripts/release-http-observer.cjs',NAUMI_RELEASE_RUNTIME:'1',NAUMI_INSTANCE_ID:web,RELEASE_CONTROL_SECRET:'local-release-observer-secret-independent-20261023',HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'*'};
    Object.assign(env,nativeEnv,{NODE_OPTIONS:nodeOptions(heapMiB),NAUMI_IMAGE_JOB_CONCURRENCY_SUITE:String(suiteLane),NAUMI_IMAGE_JOB_CONCURRENCY_APLUS:String(aplusLane)});
    env.NAUMI_RELEASE_ADMISSION_START='open';
    const envArgs=Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]);
    const cmd=['run','-d','--pull','never','--name',web,'--label','naumi.pressure.owner='+schema,'--memory',webMemoryMiB+'m','--memory-swap',webMemoryMiB+'m','--restart','no','-p','127.0.0.1::3000','--mount',`type=bind,source=${media},target=/data/media`,...envArgs,IMAGE];
    result.webCommand=['docker',...cmd];docker(...cmd);ownedContainers.add(web);allOwnedNames.push(web);
    webPort=Number(docker('port',web,'3000/tcp').split(':').at(-1));api='http://127.0.0.1:'+webPort;
    async function request(path:string,body?:unknown){const response=await fetch(api+path,{method:body===undefined?'GET':'POST',headers:{cookie,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data={raw:text.slice(0,3000)};}return {httpStatus:response.status,data};}
    for(let i=0;i<90;i++){try{const v=await request('/api/version');if(v.httpStatus===200){result.version=v;break;}}catch{}await sleep(1000);}
    assert.ok(result.version,'Next HTTP startup timeout');assert.equal(result.version.data.commit,SOURCE);assert.equal(result.version.data.version,BUILD);
    for(let i=0;i<30;i++){result.featureAccessWarmup=await request('/api/feature-access');if(result.featureAccessWarmup.httpStatus===200)break;await sleep(500);}
    assert.equal(result.featureAccessWarmup.httpStatus,200,'Real auth/feature route readiness');
    const workerEnv={NAUMI_APP_ORIGIN:`http://host.docker.internal:${webPort}`,VIDEO_WORKER_SECRET:WORKER_SECRET,VIDEO_WORKER_INTERVAL_MS:'5000',NAUMI_MEDIA_WORKER:'1',NAUMI_WORKER_RELEASE_CONTROL:'1',MEDIA_WORKER_SECRET:'local-native-media-worker-secret-independent-20261023',NAUMI_WORKER_STATE_FILE:'/data/pressure-worker.json',NAUMI_INSTANCE_ID:worker,NAUMI_WORKER_TARGET_INSTANCE_ID:web,NAUMI_WORKER_START_PAUSED:'0',MEDIA_WORKER_START_PAUSED:'0',MEDIA_WORKER_CONCURRENCY:'1',MEDIA_JOB_DIR:'/scratch'};
    Object.assign(workerEnv,nativeEnv,{NODE_OPTIONS:nodeOptions(workerHeapMiB)});
    const wc=['run','-d','--pull','never','--name',worker,'--label','naumi.pressure.owner='+schema,'--memory',workerMemoryMiB+'m','--memory-swap',workerMemoryMiB+'m','--restart','no','--user','0:0',...Object.entries(workerEnv).flatMap(([k,v])=>['-e',k+'='+v]),IMAGE,'node','scripts/video-worker-with-media.mjs'];
    result.workerCommand=['docker',...wc];docker(...wc);ownedContainers.add(worker);allOwnedNames.push(worker);
    for(const [role,name] of [['web',web],['worker',worker]]){
     const script='while :; do printf "%s|" "$(date +%s%3N)"; for f in memory.current memory.peak memory.max memory.swap.max; do printf "%s|" "$(cat /sys/fs/cgroup/$f)"; done; tr " \\n" "=;" < /sys/fs/cgroup/memory.events; printf "\\n"; sleep 0.2; done';
     const child=spawn('docker',['exec',name,'sh','-c',script],{stdio:['ignore','pipe','pipe']});let pending='';let raw='';child.stdout.on('data',b=>{raw+=b;pending+=b;const lines=pending.split('\n');pending=lines.pop()!;for(const line of lines)if(line.includes('|'))samples[role].push(parseSample(line));});samplers.push({child,role,raw:()=>raw});
    }
    await sleep(1000);result.idleBefore={web:samples.web.at(-1),worker:samples.worker.at(-1)};
    for(let i=0;i<60;i++){try{result.workerInitialStatus=JSON.parse(docker('exec',worker,'node','-e',`fetch('http://127.0.0.1:3001/status',{headers:{'x-video-worker-secret':'${WORKER_SECRET}'}}).then(async r=>{if(!r.ok)process.exit(1);console.log(JSON.stringify(await r.json()))}).catch(()=>process.exit(1))`));break;}catch{}if(docker('inspect',worker,'--format','{{.State.Running}}')!=='true')break;await sleep(500);}
    assert.ok(result.workerInitialStatus?.mediaWorker?.sandbox===true,'Native combined worker readiness required');
    let querying=false;dbTimer=setInterval(async()=>{if(querying)return;querying=true;try{const rows=(await sql.query("SELECT kind,count(*) FILTER(WHERE lease_token IS NOT NULL AND lease_until>now())::int leased,count(*) FILTER(WHERE snapshot->>'status' NOT IN ('done','error','needs_attention'))::int unfinished FROM app_image_jobs GROUP BY kind")).rows;dbSamples.push({at:Date.now(),rows});}catch{}finally{querying=false;}},200);
    result.dbProviderBudgets=(await sql.query('SELECT identity,max_concurrent FROM app_model_provider_budgets')).rows;
    gateTarget=Math.min(jobs,lane);gateStart=Date.now();gateReleased=false;
    if(label==='8'){
     const form=new FormData();for(const [k,v] of Object.entries({prompt:'PRESSURE_8 eight native outputs',model:'image-a',resolution:'4K',quality:'medium',ratio:'1:1',count:'8',origin:'generate'}))form.set(k,v);for(const ref of refIds)form.append('image',new File([new Uint8Array(png)],ref+'.png',{type:'image/png'}));
     const response=await fetch(api+'/api/generate-image',{method:'POST',headers:{cookie,'x-video-worker-secret':WORKER_SECRET},body:form,signal:AbortSignal.timeout(120000)});const raw=await response.text();let data:any;try{data=JSON.parse(raw);}catch{data={unparsedResponse:raw.slice(0,3000)};}result.submit=[{httpStatus:response.status,headers:Object.fromEntries(response.headers),responseBytes:Buffer.byteLength(raw),data}];
     const id=result.submit[0].data.jobId;assert.ok(id,JSON.stringify(result.submit));
     for(let i=0;i<600;i++){const row=(await sql.query('SELECT snapshot FROM app_image_jobs WHERE id=$1',[id])).rows[0];if(['done','error','needs_attention'].includes(row?.snapshot.status)){result.receipts=[row.snapshot];break;}if(i%10===0&&docker('inspect',web,'--format','{{.State.Running}}')!=='true')break;await sleep(200);}
    }else{
     const inputs=refIds.map(artworkId=>({artworkId,role:'reference'}));
     const requests=Array.from({length:jobs},(_,i)=>({version:1,operationId:randomUUID(),entry:'canvas',mode:'generate',prompt:`PRESSURE_${label}_${i} draw a local fixture object`,modelId:'image-a',parameters:{quality:'medium',resolution:'4K',ratio:'1:1'},inputs,variants:count,output:label==='4'?{format:'webp',compression:90,compressionMode:'local'}:{format:'png'}}));
     result.inputs=requests;const plans:any[]=[];
     for(const body of requests){const plan=await request('/api/imagegen/plan',body);plans.push(plan);assert.equal(plan.httpStatus,200,JSON.stringify(plan));}
     result.plans=plans;
     gateStart=Date.now();
     if(label==='worker')await sql.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,lease_token,lease_until) SELECT 'blocker-'||n,$1,'generate','{\"status\":\"running\",\"paidOperationVersion\":1}'::jsonb,'{}'::jsonb,false,'fixture-blocker',now()+interval '5 minutes' FROM generate_series(1,$2::int) n",[seedConfig.owner,lane]);
     result.submit=await Promise.all(requests.map((body,i)=>request('/api/imagegen',{operationId:body.operationId,quoteId:plans[i].data.quote.id,confirmed:true}).catch(e=>({httpStatus:0,data:{error:String(e)}}))));
     if(label==='worker'){
      for(let i=0;i<50;i++){const rows=(await sql.query("SELECT id FROM app_image_jobs WHERE kind='generate' AND id NOT LIKE 'blocker-%'")).rows;if(rows.length)break;await sleep(100);}
      result.postsBeforeUnblock=posts.length-startPost;assert.equal(result.postsBeforeUnblock,0,'Lane barrier proves supplier not started');
      result.workerRecoveryUnblockedAt=Date.now();await sql.query("DELETE FROM app_image_jobs WHERE id LIKE 'blocker-%'");
      result.workerRecovery='NOT_PROVEN';
     }
     const deadline=Date.now()+180000;
     while(Date.now()<deadline){
      const rows=(await sql.query("SELECT id,snapshot FROM app_image_jobs WHERE kind='imagegen' ORDER BY id")).rows;result.receipts=rows.map(r=>({id:r.id,...r.snapshot.result}));
      if(rows.length===jobs&&rows.every(r=>['done','error','needs_attention'].includes(r.snapshot.status)))break;
      if(docker('inspect',web,'--format','{{.State.Running}}')!=='true')break;
      await sleep(400);
     }
     if(docker('inspect',web,'--format','{{.State.Running}}')==='true'){
      result.httpReceipts=await Promise.all(requests.map(body=>request('/api/imagegen?operationId='+body.operationId).catch(e=>({error:String(e)}))));
      const beforeReplay=posts.length;result.replay=await Promise.all(requests.map((body,i)=>request('/api/imagegen',{operationId:body.operationId,quoteId:plans[i].data.quote.id,confirmed:true})));await sleep(500);result.replayAddedSupplierPosts=posts.length-beforeReplay;
     }
    }
    result.providerMaxSimultaneous=maxActive;
    result.supplierPosts=posts.slice(startPost);
    result.jobsDb=(await sql.query("SELECT id,kind,snapshot->>'status' AS status,billing_settled,reserved_cost,lease_token,lease_until,snapshot->'children' children,jsonb_array_length(COALESCE(snapshot->'images','[]')) image_count FROM app_image_jobs ORDER BY created_at")).rows;
    result.billing=(await sql.query("SELECT id,feature,state,reserved_credits,charged_credits,ledger_id FROM app_billing_operations WHERE feature IN ('canvas.image','image.generate') ORDER BY created_at")).rows;
    result.ledger=(await sql.query("SELECT id,delta,kind,reason FROM app_ledger WHERE kind='consume' ORDER BY created_at")).rows;
    result.reservations=(await sql.query('SELECT * FROM app_gen_reservations')).rows;
    result.outputArtworks=(await sql.query("SELECT id,image_url FROM app_artworks WHERE id NOT LIKE 'ref-%' ORDER BY created_at")).rows;
    result.outputChecks=[];
    for(const work of result.outputArtworks){
     const key=String(work.image_url).replace(/^\/media\//,'');const file=join(media,key);try{const bytes=await readFile(file),decoded=await sharp(bytes).raw().toBuffer({resolveWithObject:true});result.outputChecks.push({id:work.id,file,bytes:bytes.length,width:decoded.info.width,height:decoded.info.height,rawBytes:decoded.data.length,sha256:sha(bytes),valid4K:decoded.info.width===4096&&decoded.info.height===4096});}catch(error){result.outputChecks.push({id:work.id,error:String(error)});}
    }
    result.successfulJobs=label==='8'?result.receipts?.filter((r:any)=>r.status==='done'&&r.images?.length===8).length||0:result.receipts?.filter((r:any)=>r.status==='succeeded'&&r.artifacts?.length===count&&r.chargedCredits>0).length||0;
    const finalIds=label==='8'?result.receipts?.flatMap((r:any)=>r.images?.map((x:any)=>x.id)||[])||[]:result.receipts?.flatMap((r:any)=>r.artifacts?.map((x:any)=>x.artworkId)||[])||[];
    result.successfulOutputs=result.outputChecks.filter((x:any)=>x.valid4K&&finalIds.includes(x.id)).length;
    result.singlePostPerOutput=result.supplierPosts.length===jobs*count&&result.supplierPosts.every((p:any)=>p.referenceCount===3&&Number(p.n)===1);
    result.billingOnce=result.billing.length===jobs&&result.billing.every((b:any)=>b.state==='settled'&&b.charged_credits>0&&b.reserved_credits===0)&&result.ledger.length===jobs&&result.reservations.length===0;
    if(result.successfulJobs===jobs&&result.successfulOutputs===jobs*count&&result.singlePostPerOutput&&result.billingOnce)result.status='PASS_LOCAL_FIXTURE';
    await sleep(7000);result.idleAfter={web:samples.web.at(-1),worker:samples.worker.at(-1)};
    result.workerFinalStatus=JSON.parse(docker('exec',worker,'node','-e',`fetch('http://127.0.0.1:3001/status',{headers:{'x-video-worker-secret':'${WORKER_SECRET}'}}).then(async r=>console.log(JSON.stringify(await r.json())))`));
    if(label==='worker'&&result.status==='PASS_LOCAL_FIXTURE'&&result.postsBeforeUnblock===0&&result.workerFinalStatus.lastTick?.phase==='complete')result.workerRecovery='PASS_REAL_COMBINED_SCANNER_NO_CLIENT_POLL_DURING_RECOVERY';
   }catch(error){result.error=String(error);result.supplierPosts=posts.slice(startPost);result.providerMaxSimultaneous=maxActive;console.error('CASE',label,String(error));}
   finally{
    if(dbTimer)clearInterval(dbTimer);await save(schema+'-db-samples.json',dbSamples);result.maxLeased=Object.fromEntries(['generate','imagegen'].map(kind=>[kind,Math.max(0,...dbSamples.map(s=>s.rows.find((r:any)=>r.kind===kind)?.leased||0))]));
    for(const s of samplers){s.child.kill();await save(schema+'-'+s.role+'-cgroup.log',s.raw());}
    result.cgroup={};for(const role of ['web','worker']){const all=samples[role];result.cgroup[role]={sampleCount:all.length,samplePeriodTargetMs:200,maxObservedGapMs:all.length>1?Math.max(...all.slice(1).map((s,i)=>s.at-all[i].at)):null,peak:Math.max(0,...all.map(s=>s.peak)),currentMax:Math.max(0,...all.map(s=>s.current)),last:all.at(-1)};}
    for(const [role,name] of [['web',web],['worker',worker]])if(ownedContainers.has(name)){
     try{result[role+'Inspect']=JSON.parse(docker('inspect',name))[0];await save(schema+'-'+role+'-inspect.json',result[role+'Inspect']);await save(schema+'-'+role+'.log',docker('logs',name));}catch{}
     try{removeOwned(name,schema);}catch(error){result.cleanupError=String(error);}
    }
    if(result.webInspect?.State.OOMKilled||result.workerInspect?.State.OOMKilled||['web','worker'].some(role=>(result.cgroup[role].last?.events?.oom_kill||0)>0))result.status='FAIL_OOM';
    await sql.end();await save('results.json',results);console.log(JSON.stringify({label,status:result.status,error:result.error,successfulJobs:result.successfulJobs,successfulOutputs:result.successfulOutputs,posts:result.supplierPosts?.length,providerMaxSimultaneous:result.providerMaxSimultaneous,maxLeased:result.maxLeased,cgroup:result.cgroup}));
   }
  }
 }finally{
  for(const name of [...ownedContainers])removeOwned(name);
  for(const schema of schemas){assert.match(schema,/^pressure_[a-f0-9]{32}$/);await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}
  const left=(await admin.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name=ANY($1)",[schemas])).rows;
  const cleanup={ownSchemas:schemas,remainingOwnSchemas:left,remainingOwnContainers:docker('ps','-a','--format','{{.Names}}').split('\n').filter(name=>allOwnedNames.includes(name)),parentPgRunning:docker('inspect','naumi-imagegen-simplify-pg-20261023','--format','{{.State.Running}}'),at:new Date().toISOString()};
  await save('cleanup.json',cleanup);await save('supplier-posts.json',posts);await save('results.json',results);await admin.end();supplier.closeAllConnections();await new Promise<void>(r=>supplier.close(()=>r()));
 }
 process.exitCode=results.every(r=>r.status==='PASS_LOCAL_FIXTURE')?0:2;
}

async function seedFixture(path:string){
 const config=JSON.parse(await readFile(path,'utf8'));
 const db=await import('../src/lib/db');await db.ensureSchema();
 const {createModelRepository}=await import('../src/lib/model-config/repository');
 const {createCredentialStore}=await import('../src/lib/model-config/credentials');
 const {ensureModelSchema}=await import('../src/lib/model-config/schema');
 const {fixtureModelConfig}=await import('./model-config-unit-fixture');
 await ensureModelSchema(db.getPool());const credentials=createCredentialStore(db.getPool());
 const credential=await credentials.importPlain({providerId:'p1',plain:'local-fixture-provider-key',actor:'fixture'});
 const model=fixtureModelConfig(config.origin+'/v1',credential.id);model.providers[0].maxConcurrent=config.lane;
 Object.assign(model.upstreamModels[0].capabilities,{nativeResolutions:['1K','2K','4K'],preserveIdentity:true,maxReferenceImages:4});
 model.upstreamModels[0].parameterMap.resolution={'2K':'2048x2048','4K':'4096x4096'};
 await createModelRepository({pool:db.getPool(),trustedOrigins:[config.origin],initialize:async()=>model}).current();
 await db.getOrCreateUser(config.owner,'Local pressure fixture');
 const {createBillingService,withBillingTransaction}=await import('../src/lib/billing/service');
 await withBillingTransaction(db.getPool(),tx=>createBillingService().grantTx(tx,{id:randomUUID(),email:config.owner,amount:100000,source:'admin',reason:'local-only fixed-image pressure fixture',expiry:{unit:'years',value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:'fixture'}));
 const {uploadImage}=await import('../src/lib/storage');const png=await readFile(config.pngPath);
 for(let i=0;i<3;i++){const url=await uploadImage(png,'image/png',`refs/ref-${i}.png`,undefined,config.owner);await db.getPool().query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,origin) VALUES($1,$2,'Fixture','main','fixture','completed',$3,'from-white','canvas')",['ref-'+i,config.owner,url]);}
 console.log('SEED_OK schema='+config.schema+' providerCapacity='+config.lane+' refs=3 4096x4096');await db.getPool().end();
}
const seedPath=args.find(x=>x.startsWith('--seed='))?.slice(7);
(seedPath?seedFixture(seedPath):main()).catch(error=>{console.error(error);process.exitCode=1;});
