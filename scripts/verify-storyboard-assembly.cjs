// Actual assembly use-case with isolated persistence/media boundaries. No IO purchase.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const filename=path.resolve('src/lib/video/workflow-assembly.ts'),out=path.resolve(process.env.STORYBOARD_OUT||'E:/Workspace/naumi/output/storyboard-flow-20261102');fs.mkdirSync(out,{recursive:true});
class ModelConfigError extends Error{constructor(code,message,status){super(message);this.code=code;this.status=status;}}
let run,receipts,creates,reads,drop,lookupFailure,locked,cancelAfterCreate,seenHashes;
const copy=x=>structuredClone(x),blank=()=>{run={id:'b1f4c491-a61b-42d0-9343-a9fd53f91df4',email:'fixture@example.test',plan:{projectKey:'tree:fixture',assembly:{nodeIds:['b','a']}},assembly_state:{},assembly_quote:{configVersion:9,authorizedCredits:3},cancellation_requested_at:null};receipts=new Map();creates=0;reads=0;drop=false;lookupFailure=false;locked=false;cancelAfterCreate=false;seenHashes=null;};
const getPool=()=>({query:async(sql,p)=>{
 if(sql.startsWith('SELECT *'))return {rows:p[0]===run.id&&p[1]===run.email?[copy(run)]:[]};
 if(sql.startsWith('SELECT cancellation'))return {rows:[{cancellation_requested_at:run.cancellation_requested_at}]};
 if(sql.startsWith('UPDATE')&&sql.includes('assembly_state=')){run.assembly_state=JSON.parse(p[2]||p[1]);return {rowCount:1};}
 throw Error('Unmocked SQL '+sql);
}});
const media={listMediaJobs:async(_actor,{operationId})=>{reads++;if(lookupFailure)throw Error('database unavailable');return {jobs:receipts.has(operationId)?[copy(receipts.get(operationId))]:[]};},
 getMediaJob:async(actor,id)=>copy([...receipts.values()].find(job=>job.id===id)||null),
 createMediaJob:async(actor,request,quote,hashes)=>{seenHashes=hashes;assert.equal(actor,run.email);assert.deepEqual(quote,run.assembly_quote);let job=receipts.get(request.operationId);if(!job){creates++;job={id:'media-'+creates,operationId:request.operationId,status:'queued',outputs:[],request};receipts.set(request.operationId,job);}if(cancelAfterCreate)run.cancellation_requested_at='now';if(drop){drop=false;throw Error('accepted response lost');}return copy(job);},
 cancelMediaJob:async(_actor,id)=>{const job=[...receipts.values()].find(job=>job.id===id);job.status='cancelled';return copy(job);}};
const m={exports:{}};vm.runInThisContext('(function(require,module,exports){'+ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'\n})',{filename})((name)=>{
 if(name==='server-only')return {};if(name==='node:crypto')return require(name);if(name==='../db')return {getPool};if(name==='../model-config/types')return {ModelConfigError};if(name==='./media-jobs')return media;
 if(name==='./coordination-pool')return {acquireVideoCoordinationLock:async()=>{if(locked)return {acquired:false,release:async()=>{}};locked=true;return {acquired:true,release:async()=>{locked=false;}};}};
 throw Error('Unmocked import '+name);
},m,m.exports);
const {advanceWorkflowAssembly:advance,resetWorkflowAssembly:reset,assemblyOperationId,publicWorkflowAssembly}=m.exports;
const nodes=[{node_id:'a',status:'completed',result_assets:[{kind:'video',artworkId:'art-a',sha256:'a'.repeat(64)}]},{node_id:'b',status:'completed',result_assets:[{kind:'video',artworkId:'art-b',sha256:'b'.repeat(64)}]}];
const checks=[];async function check(name,fn){blank();await fn();checks.push(name);}
async function main(){
 await check('old run has no assembly',async()=>{assert.equal(publicWorkflowAssembly({},{}),null);});
 await check('all nodes must finish before acceptance',async()=>{await advance(copy(run),[nodes[0],{...nodes[1],status:'processing'}]);assert.equal(creates,0);});
 await check('ordered actual assets and frozen hashes',async()=>{await advance(copy(run),nodes);assert.equal(creates,1);assert.deepEqual([...receipts.values()][0].request.inputs,['art-b','art-a']);assert.deepEqual(seenHashes,[{artworkId:'art-b',sha256:'b'.repeat(64)},{artworkId:'art-a',sha256:'a'.repeat(64)}]);});
 await check('accepted disconnect resumes same operation',async()=>{drop=true;await advance(copy(run),nodes);assert.equal(run.assembly_state.status,'needs_attention');await advance(copy(run),nodes);assert.equal(run.assembly_state.status,'queued');assert.equal(creates,1);});
 await check('query outage never guesses absence',async()=>{lookupFailure=true;await advance(copy(run),nodes);assert.equal(creates,0);assert.equal(run.assembly_state.status,'needs_attention');});
 await check('unknown receipt cannot be retried with new id',async()=>{lookupFailure=true;await advance(copy(run),nodes);await assert.rejects(()=>reset(run.email,run.id,0),e=>e.code==='ASSEMBLY_RETRY_UNCONFIRMED');assert.equal(run.assembly_state.attempt,0);});
 await check('known failure retry is attempt CAS and only media',async()=>{await advance(copy(run),nodes);[...receipts.values()][0].status='failed';await advance(copy(run),nodes);await reset(run.email,run.id,0);assert.equal(run.assembly_state.attempt,1);await reset(run.email,run.id,0);await advance(copy(run),nodes);assert.equal(creates,2);assert.notEqual(...[...receipts.keys()]);});
 await check('cross-account retry is404',async()=>{await assert.rejects(()=>reset('foreign',run.id,0),e=>e.status===404);assert.equal(creates,0);});
 await check('cancel before submit never creates media',async()=>{run.cancellation_requested_at='now';await advance(copy(run),nodes);assert.equal(creates,0);assert.equal(run.assembly_state.status,'cancelled');});
 await check('cancel during acceptance cancels same receipt',async()=>{cancelAfterCreate=true;await advance(copy(run),nodes);assert.equal(creates,1);assert.equal(run.assembly_state.status,'cancelled');});
 await check('missing snapshot preserves unknown without submitting',async()=>{delete run.assembly_quote;await advance(copy(run),nodes);assert.equal(creates,0);assert.equal(run.assembly_state.status,'needs_attention');});
 await check('failed shot prevents assembly and marks blocked result',async()=>{await advance(copy(run),[nodes[0],{...nodes[1],status:'blocked'}]);assert.equal(creates,0);assert.equal(run.assembly_state.status,'failed');});
 await check('completed receipt reused without writes or new media',async()=>{await advance(copy(run),nodes);const job=[...receipts.values()][0];job.status='completed';job.outputs=[{artworkId:'final',url:'/media/final.mp4'}];await advance(copy(run),nodes);const stable=copy(run.assembly_state);await advance(copy(run),nodes);assert.deepEqual(run.assembly_state,stable);assert.equal(creates,1);});
 await check('operation identity is stable and retry-specific',async()=>{assert.match(assemblyOperationId(run.id,0),/^[a-f0-9-]{36}$/);assert.equal(assemblyOperationId(run.id,0),assemblyOperationId(run.id,0));assert.notEqual(assemblyOperationId(run.id,0),assemblyOperationId(run.id,1));});
 const result=`STORYBOARD_ASSEMBLY=PASS CHECKS=${checks.length} UNKNOWN=RETAINED RETRY=CAS REGENERATED_VIDEOS=0 SUPPLIER_CALLS=0`;
 fs.writeFileSync(path.join(out,'ASSEMBLY_UNIT.json'),JSON.stringify({result,checks,evidence:'actual use-case, isolated DB/media boundaries'},null,2));console.log(result);
}
main().catch(e=>{console.error(e);process.exitCode=1});
