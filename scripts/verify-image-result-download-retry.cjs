const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),sharp=require('sharp');
const root=process.argv.includes('--source-root')?path.resolve(process.argv[process.argv.indexOf('--source-root')+1]):process.cwd(),baseline=process.argv.includes('--baseline');
function load(rel,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,rel),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Buffer,Response,Request,Headers,URL,AbortSignal,WeakMap,WeakSet,console,require:n=>n==='server-only'?{}:deps[n]});return exports;}
(async()=>{
 const png=await sharp({create:{width:4,height:3,channels:3,background:'#4488ff'}}).png().toBuffer();let calls=[],behavior,checks=0;
 const io={readBoundedBytes:async r=>Buffer.from(await r.arrayBuffer())};
 const mod=load('src/lib/model-config/channel-image-response.ts',{sharp,'../supplier-cost/io':io,'./transport':{modelEndpointFetch:()=>async(url,opts)=>{calls.push({url:String(url),...opts});return behavior(calls.length);}}});
 const reset=()=>Object.assign(new Error('socket reset private-url'),{code:'ECONNRESET'});
 const run=()=>mod.completedChannelImage(Response.json({data:[{url:'https://fixture.invalid/original.png?private=secret'}]}),AbortSignal.timeout(5000),{});
 behavior=n=>{if(n===1)throw reset();return new Response(png)};
 if(baseline){await assert.rejects(run(),/supplier-image-download-failed/);assert.equal(calls.length,1);console.log('BASELINE=REPRODUCED ORIGINAL_IMAGE_GET_RESET_ABORTS=1 GENERATED_POSTS=0');return;}
 const result=await run();assert.equal(calls.length,2);assert.equal(calls[0].url,calls[1].url);assert.equal(calls[0].signal,calls[1].signal);assert(calls.every(c=>c.method==='GET'&&c.redirect==='error'&&!c.headers&&!c.body));assert.deepEqual(Buffer.from((await result.json()).data[0].b64_json,'base64'),png);checks+=5;
 for(const [name,fn,expected] of [['two resets',()=>{throw reset()},2],['HTTP403',()=>new Response('denied',{status:403}),1],['bad pixels',()=>new Response('not pixels'),1],['invalid response',()=>{throw Error('not retryable')},1]]){calls=[];behavior=fn;await assert.rejects(run());assert.equal(calls.length,expected,name);checks++;}
 calls=[];behavior=()=>{throw Object.assign(Error('wrapped'),{cause:reset()})};await assert.rejects(run());assert.equal(calls.length,2);checks++;
 const diagnostics=load('src/lib/supplier-cost/response-diagnostics.ts',{}),a=Response.json({}),b=Response.json({});let seen=[];
 diagnostics.bindResponseDiagnostics(a,async x=>seen.push(x));await diagnostics.recordImageResponseFailure(b,{stage:'download-image'});assert.equal(seen.length,0);await diagnostics.recordImageResponseFailure(a,{stage:'download-image',status:200,causes:[{name:'Error',code:'ECONNRESET',kind:'image-download'}],observedAt:'fixture'});assert.equal(seen.length,1);assert.equal(seen[0].stage,'download-image');checks+=3;
 diagnostics.bindResponseDiagnostics(a,async()=>{throw Error('db unavailable')});await diagnostics.recordImageResponseFailure(a,{stage:'download-image'});checks++;
 console.log('IMAGE_RESULT_GET_RETRY=PASS CHECKS='+checks+' MAX_GETS=2 SAME_URL=1 ONE_TIMEOUT_BUDGET=1 GENERATION_POSTS=0 EXACT_RESPONSE_DIAGNOSTIC=1');
})().catch(e=>{console.error(e);process.exitCode=1;});
