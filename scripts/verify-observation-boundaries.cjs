// Actual observer/request/context code with explicit environment/I/O ports.
// Both baseline and modified load their original source, not a reimplemented observer.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(arg('--source-root')||'.'),baseline=process.argv.includes('--baseline'),out=path.resolve(process.env.ARTWORK_EVIDENCE||'output/refactor-r4a4-20261024');
let cases=0,checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const plain=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const text=f=>fs.readFileSync(path.join(root,f),'utf8');
class TeamError extends Error{constructor(message,status){super(message);this.status=status;}}
class ModelConfigError extends Error{constructor(code,message,status){super(message);this.code=code;this.status=status;}}
class ReleaseRuntimeError extends Error{constructor(code,status){super(code);this.code=code;this.status=status;}}
function fixture({email='owner@fixture.test',failure,dbEnabled=true,telemetryFault=false}={}){
 const events=[],sql=[],calls=new Map();let billing,managed=false;
 const ports={...require('node:async_hooks'),...require('node:crypto'),TeamError,ModelConfigError,ReleaseRuntimeError,CONTINUATION_HEADER:'x-fixture-continuation',
  dbEnabled,resolveUserEmail:async()=>email,ensureBiSchema:async()=>{},currentSynchronousBilling:()=>billing,currentImageOperationId:()=>'',currentModelExecution:()=>null,isManagedModelClient:()=>managed,
  getPool:()=>({query:async(q,args)=>{if(telemetryFault)throw Error('telemetry offline');sql.push({q,args});if(q.startsWith('INSERT'))calls.set(args[0],args);return {rows:[]};}}),
  markBillingUpstream:s=>events.push(['upstream',s]),recordBillingUsage:(v,i)=>events.push(['usage',plain(v),i]),withObservedCallId:(_id,run)=>run(),
  withArtworkCreation:(v,run)=>{events.push(['artwork',v]);return run();},provenanceEntry:(_entry,fallback)=>fallback,
  withCreationRequest:(_r,_email,run)=>{events.push(['creation']);return run();},withAcceptedContinuationRequest:(_r,_email,run)=>{events.push(['continuation']);return run();},
  withModelRequest:(_r,run)=>{events.push(['model']);if(failure)throw failure;return run();},releaseError:e=>Response.json({code:e.code},{status:e.status}),
 };
 const loaded={};function evaluate(file){const m={exports:{}},c=vm.createContext({module:m,exports:m.exports,require:id=>id==='server-only'?{}:{...ports,...loaded},console,process,Buffer,Response,Request,Headers,URL,Date,Symbol});vm.runInContext(ts.transpileModule(text(file),{compilerOptions:{target:9,module:1,esModuleInterop:true}}).outputText,c,{filename:file});Object.assign(loaded,m.exports);return m.exports;}
 if(baseline)evaluate('src/lib/bi/model-observer.ts');else{evaluate('src/lib/bi/context.ts');evaluate('src/lib/bi/model-calls.ts');evaluate('src/lib/bi/request.ts');}
 return {api:loaded,events,sql,calls,setBilling:v=>billing=v,setManaged:v=>managed=v};
}
async function main(){
 {const f=fixture();eq(f.api.currentBiContext(),undefined);await Promise.all(Array.from({length:30},(_,i)=>f.api.withBiModelContext('owner-'+i,'fixture','op-'+i,async()=>{await new Promise(r=>setTimeout(r,i%3));eq(f.api.currentBiContext().email,'owner-'+i);await f.api.withBiModelContext('nested','nested','child',async()=>{eq(f.api.currentBiOperationId(),'child');});eq(f.api.currentBiOperationId(),'op-'+i);})));eq(f.api.currentBiContext(),undefined);cases++;}
 for(const email of [null,'owner@fixture.test']){const f=fixture({email}),reply=Response.json({ok:true});let invoked=0;eq(await f.api.withBiRequest(new Request('http://fixture.local/api/canvas/test'),async()=>{invoked++;if(email)eq(plain(f.api.currentBiContext()),{email,operation:'/api/canvas/test'});return reply;}),reply);eq(invoked,1);eq(f.events.filter(e=>['creation','continuation','model'].includes(e[0])).map(e=>e[0]),email?['creation','continuation','model']:[]);eq(f.api.currentBiContext(),undefined);cases++;}
 {const f=fixture({email:null});let invoked=0;const r=await f.api.withBiRequest(new Request('http://fixture.local/api/test',{headers:{'x-fixture-continuation':'forged'}}),async()=>{invoked++;return Response.json({ok:true});});eq(r.status,403);eq(invoked,0);cases++;}
 for(const failure of [new TeamError('owner rejected',409),new ModelConfigError('IMAGE_QUOTE_EXPIRED','expired',409),new ReleaseRuntimeError('AGENT_CONTINUATION_FORGED',403)]){const f=fixture({failure}),r=await f.api.withBiRequest(new Request('http://fixture.local/api/test'),async()=>Response.json({ok:true}));eq(r.status,failure.status);const body=await r.json();if(failure.code==='IMAGE_QUOTE_EXPIRED')eq(body.accepted,false);eq(f.api.currentBiContext(),undefined);cases++;}
 {const fault=new Error('original'),f=fixture({failure:fault});await assert.rejects(f.api.withBiRequest(new Request('http://fixture.local/api/test'),async()=>Response.json({ok:true})),e=>e===fault);checks++;eq(f.api.currentBiContext(),undefined);cases++;}
 for(const [status,state] of [[200,'response-received'],[403,'rejected'],[503,'unknown-result']]){const f=fixture();const original=new Response('bytes',{status});eq(await f.api.withBiModelContext('owner','call','op',()=>f.api.observeModelCall('wire',async()=>original,null)),original);eq([...f.calls.values()][0][6],state);eq(f.events.at(-1),['upstream',status===403?'rejected':'unknown']);cases++;}
 for(const status of [400,401,403,404,422,429,500,undefined]){const f=fixture(),error=Object.assign(new Error('original failure'),{status});await assert.rejects(f.api.withBiModelContext('owner','call','op',()=>f.api.observeModelCall('wire',async()=>{throw error;},null)),e=>e===error);checks++;eq([...f.calls.values()][0][6],[400,401,403,404,422,429].includes(status)?'rejected':'unknown-result');cases++;}
 {const f=fixture({telemetryFault:true}),result={data:'paid-output'};let invoked=0;eq(await f.api.withBiModelContext('owner','call','op',()=>f.api.observeModelCall('wire',async()=>{invoked++;return result;},null)),result);eq(invoked,1);cases++;}
 {const f=fixture();f.setBilling({id:'billing-original'});await f.api.withBiModelContext('owner','call','bi-original',()=>f.api.observeModelCall('wire',async()=>({model:'reply',usage:{prompt_tokens:2,completion_tokens:1}}),null,{imageInput:true}));eq([...f.calls.values()][0][3],'billing-original');eq(f.events.find(e=>e[0]==='usage'),['usage',{prompt_tokens:2,completion_tokens:1},true]);cases++;}
 const literal=`OBSERVATION_BOUNDARIES=PASS mode=${baseline?'BASELINE':'MODIFIED'} cases=${cases} checks=${checks} CONTEXT_CONCURRENT=30 REQUEST_ORDER=EXACT ERRORS=PRESERVED PAID_REPLAY=0 TELEMETRY_FAILURE=OUTPUT_PRESERVED SQL_PORTS=FIXTURE EXTERNAL=0`;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,`OBSERVER_${baseline?'BASELINE':'MODIFIED'}.json`),JSON.stringify({root,baseline,cases,checks,literal},null,2));console.log(literal);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
