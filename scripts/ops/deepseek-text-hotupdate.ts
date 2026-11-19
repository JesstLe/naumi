import 'server-only';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import OpenAI from 'openai';
import sharp from 'sharp';
import {prepareDeepseek,rollbackDeepseek,WIRE,UPSTREAM,PUBLIC_IDS} from '../lib/deepseek-hotupdate.mjs';
import {validateModelConfig} from '../../src/lib/model-config/schema';
import {modelConfigDigest,canonicalConfig} from '../../src/lib/model-config/snapshot-value';
import {createModelExecutor} from '../../src/lib/model-config/execution';
import {modelEndpointFetch} from '../../src/lib/model-config/transport';
import {publicModelCatalog} from '../../src/lib/model-config/public-catalog';
const [mode,root]=process.argv.slice(2);assert(['PROBE','PLAN','APPLY','VERIFY','ROLLBACK'].includes(mode)&&/^\/tmp\/deepseek-text-hotupdate-[a-z0-9-]+$/.test(root));
const read=(n:string)=>JSON.parse(readFileSync(join(root,n),'utf8'));
function save(n:string,v:unknown){const fd=openSync(join(root,n),'wx',0o600);try{writeFileSync(fd,JSON.stringify(v));fsyncSync(fd)}finally{closeSync(fd)}}
async function main(){
 const {getModelAdministration}=await import('../../src/lib/model-config/server');const a=await getModelAdministration();
 try{
  const current=await a.repo.current(),billing=await a.billing.current(),provider=current.config.providers.find(p=>p.id==='apib-text')!;
  const directory=read('DISCOVERY.json');assert(directory.models.some((m:any)=>m.id===WIRE));assert.equal(directory.providerId,provider.id);
  const executor=createModelExecutor({...a,billingByVersion:async version=>(await a.billing.byVersion(version)),gateway:()=>({baseUrl:'',apiKey:''})});
  const check=async(config:any)=>{
   validateModelConfig(config,{trustedOrigins:a.trustedOrigins});const snapshot={...current,config};
   for(const id of PUBLIC_IDS){const m=config.publicModels.find((m:any)=>m.id===id);assert.equal(m.target.id,UPSTREAM);assert(m.supplierRouting.channels.filter((c:any)=>c.enabled).every((c:any)=>c.upstreamId===UPSTREAM));}
   const checks=[];
   for(const binding of ['agent.text','agent.vision','text.generate','text.title','text.competitor','vision.reference','vision.review']){
    const frozen=await executor.resolve({snapshot,billing,binding});assert.equal(frozen.target.id,UPSTREAM);checks.push(binding);
   }
   const originalCatalog=publicModelCatalog(current,'text'),nextCatalog=publicModelCatalog(snapshot,'text');assert.deepEqual(nextCatalog,originalCatalog,'FRONTEND_CATALOG_CHANGED');
   return {bindings:checks,publicIds:PUBLIC_IDS,frontendCatalogUnchanged:true,customerPricingUnchanged:true};
  };
  if(mode==='PROBE'){
   assert(!existsSync(join(root,'PROBE_REQUEST.json')),'PROBE_REQUEST_EXISTS_QUERY_ORIGINAL_NO_REPLAY');
   const id=randomUUID();save('PROBE_REQUEST.json',{id,wireModel:WIRE,maxSupplierPosts:3,syntheticInputOnly:true,at:new Date().toISOString()});
   const apiKey=await a.credentials.read(provider.credentialRef!,provider.id);
   const fetcher=modelEndpointFetch(provider.baseUrl,{trustedOrigins:a.trustedOrigins},{providerId:provider.id,apiKey,credentialRef:provider.credentialRef,protocol:provider.protocol,wireModel:WIRE,timeoutMs:90000,actor:{userEmail:'ops@naumi.invalid',feature:'ops.deepseek-compatibility'}});
   const client=new OpenAI({baseURL:provider.baseUrl,apiKey,timeout:90000,maxRetries:0,fetch:fetcher});
   let stage='stream-text';const outputs:any[]=[];
   async function call(input:any,index:number){
    const start=Date.now();const params:OpenAI.Chat.ChatCompletionCreateParamsStreaming={...input,model:WIRE,max_tokens:1024,stream:true,stream_options:{include_usage:true}};
    const stream=await client.chat.completions.create(params,{headers:{'Idempotency-Key':id+':'+index}});
    let text='',finish='',model='',usage:any;const tools:any[]=[];
    for await(const chunk of stream){model=chunk.model||model;if(chunk.usage)usage=chunk.usage;const c=chunk.choices[0];if(!c)continue;text+=c.delta.content||'';if(c.finish_reason)finish=c.finish_reason;
     for(const item of c.delta.tool_calls||[]){const t=tools[item.index]||={id:'',type:'function',function:{name:'',arguments:''}};if(item.id)t.id=item.id;t.function.name+=item.function?.name||'';t.function.arguments+=item.function?.arguments||'';}
    }
    assert(finish&&['stop','tool_calls'].includes(finish),'INCOMPLETE_PROBE_RESPONSE');outputs.push({stage,finish,responseModel:model,elapsedMs:Date.now()-start,usage,textChars:text.length,toolCalls:tools.length});
    return {text,finish,tools};
   }
   try{
    const text=await call({messages:[{role:'user',content:'Reply with exactly NAUMI_DS_OK and nothing else.'}]},0);assert.equal(text.finish,'stop');assert.equal(text.text.trim(),'NAUMI_DS_OK');
    stage='vision-tool';const image=await sharp({create:{width:128,height:64,channels:3,background:'#ff0000'}}).composite([{input:await sharp({create:{width:64,height:64,channels:3,background:'#0000ff'}}).png().toBuffer(),left:64,top:0}]).png().toBuffer();
    const messages:any[]=[{role:'user',content:[{type:'text',text:'Inspect the image. Call naumi_visual_probe with the dominant color of the LEFT half and RIGHT half, using English lowercase color names.'},{type:'image_url',image_url:{url:'data:image/png;base64,'+image.toString('base64')}}]}];
    const tools:any[]=[{type:'function',function:{name:'naumi_visual_probe',description:'Record colors for an isolated compatibility test. No application action.',parameters:{type:'object',properties:{left:{type:'string'},right:{type:'string'}},required:['left','right'],additionalProperties:false}}}];
    const vision=await call({messages,tools,tool_choice:{type:'function',function:{name:'naumi_visual_probe'}}},1);assert.equal(vision.finish,'tool_calls');assert.equal(vision.tools.length,1);const tool=vision.tools[0];assert.equal(tool.function.name,'naumi_visual_probe');assert.deepEqual(JSON.parse(tool.function.arguments),{left:'red',right:'blue'});
    stage='tool-result';messages.push({role:'assistant',content:vision.text||null,tool_calls:vision.tools},{role:'tool',tool_call_id:tool.id,content:'{"ok":true,"result":"NAUMI_TOOL_OK"}'},{role:'user',content:'Reply with exactly NAUMI_TOOL_OK.'});
    const final=await call({messages,tools,tool_choice:'none'},2);assert.equal(final.text.trim(),'NAUMI_TOOL_OK');
    save('PROBE.json',{id,wireModel:WIRE,status:'PASS',supplierPosts:3,syntheticInputOnly:true,applicationToolsExecuted:0,outputs});console.log(JSON.stringify({mode,status:'PASS',wireModel:WIRE,supplierPosts:3,outputs}));
   }catch(e:any){save('PROBE_FAILURE.json',{id,stage,status:e.status,code:e.code||e.name});throw Error('COMPATIBILITY_PROBE_FAILED_'+stage)}
   return;
  }
  const probe=read('PROBE.json');assert.equal(probe.status,'PASS');assert.equal(probe.wireModel,WIRE);
  if(mode==='PLAN'){
   const config=prepareDeepseek(current.config),checks=await check(config);assert.deepEqual(rollbackDeepseek(config,current.config,config),current.config);
   save('PLAN.json',{operationId:randomUUID(),baseline:current,billing,config,candidateDigest:modelConfigDigest(config),probe,checks});console.log(JSON.stringify({mode,version:current.version,addedUpstreams:1,changedPublicModels:4,checks}));return;
  }
  const plan=read('PLAN.json');
  if(mode==='VERIFY'){
   const publication=await a.repo.publication(plan.operationId);assert.equal(publication.phase,'applied');assert.equal(publication.version,current.version);assert.equal(current.digest,plan.candidateDigest);assert.equal(canonicalConfig(billing),canonicalConfig(plan.billing));
   const checks=await check(current.config);save('VERIFIED.json',{publication,checks});console.log(JSON.stringify({mode,publication,checks}));return;
  }
  const rollback=mode==='ROLLBACK';if(rollback)assert.equal((await a.repo.publication(plan.operationId)).phase,'applied');
  const config=rollback?rollbackDeepseek(current.config,plan.baseline.config,plan.config):plan.config;
  if(!rollback){assert.equal(current.version,plan.baseline.version);assert.equal(current.digest,plan.baseline.digest);assert.equal(canonicalConfig(billing),canonicalConfig(plan.billing));await check(config)}
  validateModelConfig(config,{trustedOrigins:a.trustedOrigins});
  assert(!existsSync(join(root,mode+'_REQUEST.json')),'REQUEST_EXISTS_QUERY_ORIGINAL_NO_REPLAY');
  const id=rollback?randomUUID():plan.operationId,actor='ops:deepseek-hotupdate:'+id,draft=await a.repo.draft(actor),saved=await a.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config,actor});
  const request={id,draftId:saved.id,expectedRevision:saved.revision,expectedVersion:current.version,actor,reason:rollback?'Selective inverse of DeepSeek text routing only':'User requested DeepSeek V4.1 Flash, preserve frontend names, IDs, prices, media and frozen history'};save(mode+'_REQUEST.json',request);
  const publication=await a.runtime.publish(request);save(mode+'_PUBLICATION.json',publication);console.log(JSON.stringify({mode,publication,frontendNamesUnchanged:true}));assert.equal(publication.phase,'applied');
 }finally{await a.pool.end()}
}
main().catch(e=>{console.error('DEEPSEEK_HOTUPDATE_HOLD',e.code||e.name,e.message);process.exitCode=1});
