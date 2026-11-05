/** Finite I/O fixture -> actual central assembly/HMAC/schema/matching -> actual
 * client stream reader/model. No PostgreSQL, HTTP listener, or network fetch.
 * --baseline=<git-ref> bundles original src blobs without editing the checkout.
 * --source-root=<copy> [--expect-baseline] reads actual independent-copy bytes;
 * only unchanged dependencies may fall back to this checkout. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'output/fleet-business-response-budget-20261105');
const baseline=process.argv.find(arg=>arg.startsWith('--baseline='))?.slice('--baseline='.length);
const sourceRootArg=process.argv.find(arg=>arg.startsWith('--source-root='))?.slice('--source-root='.length);
const sourceRoot=sourceRootArg?path.resolve(sourceRootArg):undefined;
const expectBaseline=process.argv.includes('--expect-baseline');
const baselineMode=Boolean(baseline||expectBaseline);
assert.ok(process.argv.slice(2).every(arg=>arg==='--expect-baseline'||arg.startsWith('--baseline=')&&arg.length>11||arg.startsWith('--source-root=')&&arg.length>14),'supported arguments: --baseline=<git-ref>, --source-root=<copy>, --expect-baseline');
assert.ok(!(baseline&&sourceRoot),'git baseline and actual independent source copy are mutually exclusive');
assert.ok(!expectBaseline||sourceRoot,'--expect-baseline requires --source-root=<actual-copy>');
assert.ok(!sourceRoot||sourceRoot!==ROOT,'independent source root must differ from the live checkout');
if(baseline)assert.match(baseline,/^[a-zA-Z0-9_./-]+$/,'baseline must be a literal git ref');
const LIMIT=2*1024*1024, NOW=Date.now()-1000;
const fixtureKey='__naumiFleetBusinessResponseBudgetFixture';
const secretBefore=process.env.SETTINGS_SECRET,fetchBefore=globalThis.fetch;
const checks=[],scenarios=[],sourceBlobs=new Map(),sourceOrigins=new Map();
const requiredCopyFiles=new Set(['src/lib/fleet/business-central.ts','src/lib/fleet/business-central-contracts.ts','src/components/admin/business-data/client.ts',
  ...(!baselineMode?['src/lib/fleet/business-response.ts']:[])]);
let api,activeFixture,streamFetches=0;
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
/** Fingerprint either exact text or serialized fixture data for source and immutability evidence. */
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function check(value,name){assert.ok(value,name);checks.push(name);}
function same(actual,expected,name){assert.deepEqual(actual,expected,name);checks.push(name);}
const sourcePath=file=>path.join(ROOT,'src',...file.split('/'));

const ioStub=`
const current=()=>globalThis[${JSON.stringify(fixtureKey)}];
export class FleetError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export function getPool(){current().calls.pool++;return Object.freeze({finiteFixture:true});}
export async function readFleetBusinessQuery(pool,query){
  const f=current();f.calls.local++;if(!pool.finiteFixture)throw new Error('FIXTURE_POOL_REQUIRED');
  if(JSON.stringify(query)!==JSON.stringify(f.query))throw new Error('FIXTURE_QUERY_MISMATCH');
  return f.snapshot;
}
export async function fleetBusinessInstances(){const f=current();f.calls.registry++;return structuredClone(f.rows);}
export async function fleetReadCommand(actor,id,commandId){
  const f=current();f.calls.receipts++;const mode=f.states[id]||'succeeded';
  const operation=structuredClone(f.query);
  if(mode==='mismatched-query')operation.page++;
  const state=mode==='pending'?'queued':mode==='failed'?'failed':mode==='unknown'?'blocked':'succeeded';
  const snapshot=mode==='mismatched-snapshot'?{...f.snapshot,from:f.snapshot.asOf}:f.snapshot;
  return {id:commandId,operation,state,result:{status:'succeeded',data:{business:snapshot}}};
}
export async function enqueueCommand(){current().calls.enqueue++;throw new Error('UNEXPECTED_FIXTURE_ENQUEUE');}
`;

/** Bundle the actual central/contracts/client/model sources with finite I/O, preserving baseline/copy origins and checking the shared response limit. */
async function bundle(){
  const entry=`export * from './src/lib/fleet/business-central.ts';
export * from './src/lib/fleet/business-contracts.ts';
export * from './src/lib/fleet/business-central-contracts.ts';
export * from './src/components/admin/business-data/client.ts';
export * from './src/components/admin/business-data/model.ts';
${baselineMode?'':"export * from './src/lib/fleet/business-response.ts';"}`;
  const result=await build({absWorkingDir:ROOT,stdin:{contents:entry,resolveDir:ROOT,sourcefile:'fleet-business-budget-entry.ts',loader:'ts'},
    bundle:true,write:false,format:'esm',platform:'node',target:'node20',metafile:true,logLevel:'silent',
    plugins:[{name:'finite-business-io-and-original-source',setup(plugin){
      plugin.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'fixture-marker'}));
      plugin.onLoad({filter:/.*/,namespace:'fixture-marker'},()=>({contents:'export {};',loader:'js'}));
      plugin.onResolve({filter:/^(?:@\/platform\/db\/pool|\.\/business-read-model|\.\/server)$/},args=>{
        if(path.resolve(args.importer)===sourcePath('lib/fleet/business-central.ts'))return {path:'central-io',namespace:'finite-business-io'};
      });
      plugin.onLoad({filter:/.*/,namespace:'finite-business-io'},()=>({contents:ioStub,loader:'js'}));
      plugin.onLoad({filter:/\.[cm]?[jt]sx?$/},async args=>{
        const relative=path.relative(ROOT,args.path).replaceAll('\\','/');
        if(!relative.startsWith('src/'))return;
        let contents,origin;
        if(baseline){contents=execFileSync('git',['show',`${baseline}:${relative}`],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024});origin='git-show';}
        else if(sourceRoot){
          try{contents=await readFile(path.join(sourceRoot,...relative.split('/')),'utf8');origin='independent-copy';}
          catch(error){
            if(error.code!=='ENOENT'||requiredCopyFiles.has(relative))throw error;
            contents=await readFile(args.path,'utf8');origin='unchanged-working-tree-dependency';
          }
        }else{contents=await readFile(args.path,'utf8');origin='working-tree';}
        sourceBlobs.set(relative,hash(contents));
        sourceOrigins.set(relative,origin);
        return {contents,loader:args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':'js',resolveDir:path.dirname(args.path)};
      });
    }}]});
  api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  check(Object.keys(result.metafile.inputs).every(input=>!input.endsWith('/business-read-model.ts')&&!input.endsWith('/server.ts')&&!input.endsWith('/db/pool.ts')),'only finite central I/O seams are loaded; no real pool/read-model/server');
  check(sourceBlobs.has('src/lib/fleet/business-central.ts')&&sourceBlobs.has('src/components/admin/business-data/client.ts')&&sourceBlobs.has('src/components/admin/business-data/model.ts'),'actual central, client stream parser and totals model are bundled');
  if(sourceRoot)check([...requiredCopyFiles].every(file=>sourceOrigins.get(file)==='independent-copy'),'central/contracts/client and any imported budget helper come from actual independent-copy bytes, never live fallback');
  if(!baselineMode)same(api.FLEET_BUSINESS_RESPONSE_MAX_BYTES,LIMIT,'shared response bound remains exactly 2 MiB');
}

/** Create and validate a legal small or near-maximum escaped UTF-8 site snapshot within the per-site receipt bound. */
function makeSnapshot(query,large){
  const snapshot={schemaVersion:1,view:query.view,asOf:query.asOf,from:new Date(Date.parse(query.asOf)-query.days*86400000).toISOString(),observedAt:query.asOf,
    timeZone:'Asia/Shanghai',scope:'site',page:query.page,pageSize:30,total:large?30:1,
    totals:{credits:7,operations:2,activeUsers:1,balance:93,users:1,artworks:1,paidOrders:1,paidAmount:600,refundCredits:5,administrativeDebits:3},
    users:[],daily:[],orders:[],ledger:Array.from({length:large?30:1},(_,i)=>({id:large?'账"\\\n'.repeat(50):'账-1',
      email:large?'户"\\\n'.repeat(63)+'ab':'fixture@example.test',kind:'consume',delta:-7,
      reason:large?'图"\\\n'.repeat(40):'图片 "生成"\\记录',createdAt:query.asOf})),creations:[]};
  if(large)shrinkSnapshot(snapshot,Math.max(0,bytes({status:'succeeded',data:{business:snapshot}})-api.FLEET_BUSINESS_MAX_BYTES));
  const parsed=api.parseFleetBusinessSnapshot(snapshot);
  same(parsed,snapshot,large?'large multilingual/escaped snapshot passes real 42,000-byte schema guard':'small snapshot passes real schema guard');
  check(bytes({status:'succeeded',data:{business:snapshot}})<=42000,'per-site serialized receipt is at most 42,000 UTF-8 bytes');
  if(large)check(bytes({status:'succeeded',data:{business:snapshot}})>=41900,'maximum-collection fixture uses a near-limit per-site receipt');
  return snapshot;
}

/** Reduce only legal bounded string fields by an exact serialized UTF-8 delta. */
function shrinkSnapshot(snapshot,remaining){
  let touched;
  for(let i=snapshot.ledger.length-1;i>=0&&remaining>0;i--)for(const key of ['reason','email','id']){
    if(!remaining)break;
    const row=snapshot.ledger[i],cost=Buffer.byteLength(JSON.stringify(row[key]),'utf8')-2,removed=Math.min(remaining,cost),target=cost-removed;
    if(!removed)continue;
    row[key]='界'.repeat(Math.floor(target/3))+'a'.repeat(target%3);
    remaining-=removed;touched={index:i,key};
  }
  assert.equal(remaining,0,'fixture string capacity must cover exact byte adjustment');
  return touched;
}

/** Install a deterministic directory, snapshots and requested source states in finite I/O, resetting call counters and the local cache for each scenario. */
function fixture(remoteCount,{large=false,states={},longNames=false,allOffline=false}={}){
  const request={site:'all',view:'ledger',days:30,page:1,search:'查"\\\n询',refresh:true};
  const query=api.businessQuerySchema.parse({type:'business.query',view:request.view,days:request.days,asOf:new Date(NOW).toISOString(),page:request.page,search:request.search});
  const rows=Array.from({length:remoteCount},(_,index)=>({id:`10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
    name:longNames?'界'.repeat(80):`站点 "${index+1}"\\目录`,kind:index%2?'enterprise':'main',enabled:!allOffline,last_seen:new Date(NOW).toISOString(),status:{business:1}}));
  const modes={};for(const [index,mode]of Object.entries(states)){modes[rows[Number(index)-1].id]=mode;if(mode==='offline')rows[Number(index)-1].enabled=false;}
  const snapshot=makeSnapshot(query,large),snapshotHash=hash(snapshot);
  activeFixture={request,query,rows,snapshot,snapshotHash,states:modes,calls:{pool:0,local:0,registry:0,receipts:0,enqueue:0}};
  globalThis[fixtureKey]=activeFixture;globalThis.__naumiBusinessLocalCache=new Map();
  return activeFixture;
}
const actor={actor:'budget-root@fixture.test',root:true};
async function start(f,input=f.request){return api.startFleetBusinessQuery(actor,input,NOW);}
function unchanged(f,name){same(hash(f.snapshot),f.snapshotHash,name);same(f.calls.enqueue,0,'finite receipts do not enqueue commands');}

async function clientRead(body){
  const payload=new TextEncoder().encode(JSON.stringify(body));let offset=0;
  globalThis.fetch=async()=>{streamFetches++;return new Response(new ReadableStream({
    /** Stream the serialized response in bounded byte chunks and close only after the entire fixture payload is consumed. */
    pull(controller){
    if(offset===payload.length){controller.close();return;}
    const next=Math.min(offset+8191,payload.length);controller.enqueue(payload.slice(offset,next));offset=next;
  }}),{status:200,headers:{'content-type':'application/json'}});};
  return api.readBusinessResponse('https://finite-fixture.invalid/api/admin/business',new AbortController().signal);
}

/** Verify complete two-site aggregation, real HMAC token identity/ownership checks and unchanged snapshot inputs through the actual client reader. */
async function smallAndIdentity(){
  const f=fixture(1),response=await start(f),parsed=await clientRead(response);
  check(response.complete&&response.sources.length===2&&response.sources.every(source=>source.status==='succeeded'),'small two-site response is complete and untruncated');
  same(parsed,response,'actual streamed client accepts the complete two-site central response');
  same(api.combinedTotals(parsed).credits,14,'actual model combines complete small response totals');
  same(response.query,f.query,'actual central query schema retains normalized fixture query');
  const polled=await api.pollFleetBusinessQuery(actor,response.requestId,NOW+1);
  same(polled,response,'actual HMAC request token decodes and polls without a request side-map');
  const tail=response.requestId.endsWith('0')?'1':'0';
  await assert.rejects(()=>api.pollFleetBusinessQuery(actor,response.requestId.slice(0,-1)+tail,NOW+1),error=>error.status===400);checks.push('actual HMAC rejects tampered request token');
  await assert.rejects(()=>api.pollFleetBusinessQuery({...actor,actor:'another@fixture.test'},response.requestId,NOW+1),error=>error.status===403);checks.push('actual HMAC token remains actor-bound');
  await assert.rejects(()=>start(f,{...f.request,days:31}));checks.push('actual public start query rejects invalid query schema');
  unchanged(f,'small fixture snapshot remains unchanged');
  scenarios.push({name:'small-two-sites-and-real-token',sites:2,bytes:bytes(response),complete:response.complete,calls:f.calls});
}

/** Assemble 201 selected sources, reproduce baseline overflow or verify bounded omission and single-site recovery through the actual central/client code. */
async function largeCollection(){
  const f=fixture(200,{large:true}),response=await start(f),responseBytes=bytes(response);
  same(response.sites.length,201,'full local plus 200 remote site directory remains present');
  same(response.sources.length,201,'all 201 selected source identities remain present');
  check(responseBytes>JSON.stringify(response).length,'response accounting uses actual JSON UTF-8 bytes, not JS character length');
  if(baselineMode){
    check(responseBytes>LIMIT,'baseline actual central assembly exceeds the real client 2 MiB bound');
    check(response.complete&&response.sources.every(source=>source.status==='succeeded'),'baseline overflow consists of real assembled succeeded snapshots');
    let rejected;
    try{await clientRead(response);}catch(error){rejected=error;}
    check(rejected instanceof api.BusinessReadError&&rejected.message==='查询结果过大，请筛选站点或账号','baseline actual client stream reader rejects assembled over-limit response');
    unchanged(f,'baseline large fixture snapshot remains unchanged');
    scenarios.push({name:'201-source-overflow',sites:201,bytes:responseBytes,limit:LIMIT,perSiteReceiptBytes:bytes({status:'succeeded',data:{business:f.snapshot}}),complete:response.complete,client:{accepted:false,error:rejected.message},calls:f.calls});
    return response;
  }
  const parsed=await clientRead(response),unavailable=parsed.sources.filter(source=>source.status==='unavailable');
  check(responseBytes<=LIMIT,'actual 201-source central assembly is within 2 MiB including its complete envelope');
  check(unavailable.length>0&&unavailable.length<201,'budget keeps whole available snapshots and explicitly marks omitted sources');
  check(!parsed.complete&&api.combinedTotals(parsed)===null,'budget-limited response is incomplete and model never invents a global total');
  check(response.sources.filter(source=>source.status==='unavailable').every(source=>!('data'in source)),'raw central unavailable sources contain no data field before client sanitization');
  for(const source of parsed.sources){
    if(source.status==='succeeded')assert.deepEqual(source.data,f.snapshot);
    else assert.ok(source.status==='unavailable'&&!('data'in source)||source.status==='unavailable'&&source.data===undefined);
    if(source.status==='unavailable')assert.equal(source.error,'汇总结果达到大小上限，请选择该站点查看');
  }
  checks.push('every admitted source retains its complete original snapshot; unavailable sources carry no data and explain single-site access');
  same(parsed.sites.map(site=>site.id),['local',...f.rows.map(row=>row.id)],'budget does not drop any selectable site from the full directory');
  const selected=unavailable.find(source=>source.id!=='local');assert.ok(selected);
  const single=await start(f,{...f.request,site:selected.id}),singleParsed=await clientRead(single);
  check(singleParsed.complete&&singleParsed.sources.length===1&&singleParsed.sources[0].id===selected.id,'budget-unavailable remote site remains selectable as one complete source');
  same(singleParsed.sources[0].data,f.snapshot,'single-site view preserves every original snapshot field and row');
  same(singleParsed.sites.length,201,'single-site view still returns the full site directory');
  same(api.combinedTotals(singleParsed),f.snapshot.totals,'single-site complete model totals retain exact original values');
  unchanged(f,'201-site and single-site input fixture snapshot remains unchanged');
  scenarios.push({name:'201-source-budget-and-single-site',sites:201,bytes:responseBytes,limit:LIMIT,perSiteReceiptBytes:bytes({status:'succeeded',data:{business:f.snapshot}}),succeeded:parsed.sources.filter(source=>source.status==='succeeded').length,
    unavailable:unavailable.length,complete:parsed.complete,client:{accepted:true},singleSite:{bytes:bytes(single),complete:single.complete,rows:single.sources[0].data.ledger.length},calls:f.calls});
  return response;
}

/** Verify response budgeting preserves pending/offline/failed/unknown receipts and rejects mismatched operations or snapshots without complete totals. */
async function mixedStates(){
  const f=fixture(200,{large:true,states:{197:'pending',198:'offline',199:'failed',200:'unknown'}}),response=await start(f),parsed=await clientRead(response);
  for(const [index,status]of [[197,'pending'],[198,'offline'],[199,'failed'],[200,'unknown']]){
    const source=parsed.sources.find(item=>item.id===f.rows[index-1].id);
    check(source?.status===status&&!source.data,`existing ${status} source is preserved without invented snapshot`);
    const single=await start(f,{...f.request,site:source.id});
    same(response.sources.find(item=>item.id===source.id),single.sources[0],`budget preserves the complete original ${status} receipt metadata and error`);
  }
  check(parsed.sources.some(source=>source.status==='unavailable')&&!parsed.complete&&api.combinedTotals(parsed)===null,'mixed incomplete budget response never becomes a complete global total');
  check(bytes(response)<=LIMIT,'mixed-state full envelope remains within actual UTF-8 budget');
  unchanged(f,'mixed-state snapshot input remains unchanged');
  scenarios.push({name:'mixed-source-states',sites:201,bytes:bytes(response),states:Object.fromEntries(['pending','offline','failed','unknown','unavailable'].map(status=>[status,parsed.sources.filter(source=>source.status===status).length])),calls:f.calls});
  const mismatch=fixture(2,{states:{1:'mismatched-query',2:'mismatched-snapshot'}}),mismatched=await clientRead(await start(mismatch));
  check(mismatched.sources.slice(1).every(source=>source.status==='unknown'&&!source.data),'real central operation and snapshot matching reject finite mismatched receipts');
  check(!mismatched.complete&&api.combinedTotals(mismatched)===null,'mismatched receipt is unknown, not a zero or complete total');
}

/** Construct exact-limit and one-byte-over UTF-8 envelopes to verify pure budgeting boundaries, source omission and input immutability. */
async function pureBoundaries(){
  check(typeof api.boundFleetBusinessResponse==='function','actual pure response budget helper is exported');
  const f=fixture(49,{large:true}),raw=await start(f);
  // Build a fully valid 50-source envelope before budgeting, then tune only one
  // legal snapshot string. Request ID/query/sites/source commas all remain real.
  const input={...raw,sources:raw.sources.map(source=>({id:source.id,name:source.name,kind:source.kind,...(source.commandId?{commandId:source.commandId}:{}),status:'succeeded',data:structuredClone(f.snapshot)})),complete:true};
  check(bytes(input)>LIMIT,'finite exact-boundary input initially exceeds full-envelope budget');
  const last=input.sources.at(-1),touched=shrinkSnapshot(last.data,bytes(input)-LIMIT);assert.ok(touched);
  api.parseFleetBusinessSnapshot(last.data);
  same(bytes(input),LIMIT,'complete envelope fixture equals exactly 2 MiB in serialized UTF-8');
  const before=JSON.stringify(input),atLimit=api.boundFleetBusinessResponse(input);
  same(atLimit,input,'exactly 2 MiB complete envelope is retained in full, including complete:true');
  same(JSON.stringify(input),before,'exact-boundary budget helper does not mutate its input');
  const over=structuredClone(input);over.sources.at(-1).data.ledger[touched.index][touched.key]+='a';
  api.parseFleetBusinessSnapshot(over.sources.at(-1).data);
  same(bytes(over),LIMIT+1,'one additional legal ASCII byte creates a +1-byte full envelope');
  check(bytes(over.sources)<LIMIT,'source array alone fits: query, requestId, directory and envelope punctuation cause the overflow');
  const overBefore=JSON.stringify(over),bounded=api.boundFleetBusinessResponse(over);
  check(bounded&&bytes(bounded)<=LIMIT&&!bounded.complete&&bounded.sources.some(source=>source.status==='unavailable'&&!source.data),'+1-byte envelope marks a whole source unavailable and stays within budget');
  same(JSON.stringify(over),overBefore,'over-limit budget helper leaves all original snapshot bytes unchanged');
  check(api.combinedTotals(bounded)===null,'pure budget output cannot expose a false complete global total');
  scenarios.push({name:'exact-utf8-envelope-boundaries',exactBytes:LIMIT,plusOneBytes:LIMIT+1,sourceArrayBytes:bytes(over.sources),boundedBytes:bytes(bounded),inputUnchanged:true});
}

/** Verify an oversized directory alone produces the documented 503 instead of returning an unbounded response or mutating fixture inputs. */
async function metadataOverflow(){
  const f=fixture(6000,{longNames:true,allOffline:true});
  const sites=[{id:'local',name:'103平台',kind:'local',enabled:true,lastSeen:null},...f.rows.map(row=>({id:row.id,name:row.name,kind:row.kind,enabled:row.enabled,lastSeen:row.last_seen}))];
  const metadataOnly={requestId:'finite-fixture',query:f.query,sites,sources:[{id:'local',name:'103平台',kind:'local',status:'pending'}],complete:false};
  check(bytes(metadataOnly)>LIMIT,'valid finite site directory metadata alone exceeds 2 MiB');
  const before=JSON.stringify(metadataOnly);
  same(api.boundFleetBusinessResponse(metadataOnly),null,'pure helper declines an over-limit metadata-only envelope');
  same(JSON.stringify(metadataOnly),before,'metadata-only overflow input remains unchanged');
  let error;try{await start(f);}catch(caught){error=caught;}
  check(error?.status===503&&error.message==='站点目录超出响应大小上限，请联系管理员','actual public central returns status 503 instead of a huge metadata response');
  unchanged(f,'metadata-overflow fixture snapshot remains unchanged');
  scenarios.push({name:'metadata-only-overflow',sites:6001,metadataOnlyBytes:bytes(metadataOnly),central:{status:error.status,error:error.message,responseReturned:false},calls:f.calls});
}

/** Run the finite response-budget scenarios, save source hashes and reopened evidence, and distinguish reproduced baseline failure from modified-code acceptance. */
async function main(){
  process.env.SETTINGS_SECRET='finite-budget-fixture-secret-20261105-no-real-network';
  await bundle();await smallAndIdentity();await largeCollection();
  if(!baselineMode){await mixedStates();await pureBoundaries();await metadataOverflow();}
  const result=baselineMode?'REPRODUCED':'PASS',exitStatus=baselineMode?1:0;
  const command='node scripts/verify-fleet-business-response-budget.mjs'+process.argv.slice(2).map(arg=>' '+(/\s/.test(arg)?JSON.stringify(arg):arg)).join('');
  const literalOutput=`FLEET_BUSINESS_RESPONSE_BUDGET=${result} ASSERTIONS=${checks.length} SITES=201 MAX_BYTES=${LIMIT} REAL_PG=0 REAL_HTTP=0 NETWORK=0`;
  const report={result,exitStatus,command,assertions:checks.length,scriptSHA256:hash(await readFile(fileURLToPath(import.meta.url),'utf8')),sourceRef:sourceRoot?'independent-copy:'+sourceRoot:baseline||'working-tree',
    sourceMode:sourceRoot?(baselineMode?'actual-restored-copy':'actual-modified-copy'):baseline?'git-original-blobs':'working-tree',layer:'finite-I/O-fixture -> actual central public API/HMAC/queryschema/snapshotmatching/assembly -> actual client stream parser/model',
    fixture:{finite:true,multibyteAndEscapedJSON:true,perSiteMaxBytes:42000,maxCollectionSources:201,realPostgres:0,realHTTP:0,networkRequests:0,
      request:{site:'all',view:'ledger',days:30,page:1,search:'查"\\\n询',refresh:true},now:NOW,
      replacedIOSurfaces:['central getPool/readFleetBusinessQuery','central fleetBusinessInstances/fleetReadCommand/enqueueCommand/FleetError'],serverOnlyMarker:'empty build-only marker'},
    checks,scenarios,streamedClientFixtureFetches:streamFetches,sourceSHA256:Object.fromEntries([...sourceBlobs].sort()),sourceOrigins:Object.fromEntries([...sourceOrigins].sort()),literalOutput};
  await mkdir(OUT,{recursive:true});const target=path.join(OUT,sourceRoot?(baselineMode?'ROLLBACK_RESULT.json':'COPY_MODIFIED_RESULT.json'):baseline?'BASELINE_RESULT.json':'MODIFIED_RESULT.json');
  await writeFile(target,JSON.stringify(report,null,2)+'\n','utf8');
  same(JSON.parse(await readFile(target,'utf8')).literalOutput,literalOutput,'result evidence reopened');
  console.log(literalOutput);console.log('RESULT='+target);process.exitCode=exitStatus;
}
main().catch(async error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  globalThis.fetch=fetchBefore;delete globalThis[fixtureKey];delete globalThis.__naumiBusinessLocalCache;
  if(secretBefore===undefined)delete process.env.SETTINGS_SECRET;else process.env.SETTINGS_SECRET=secretBefore;
});
