/** Actual BillingProvider in React SSR + VM; auth/API fixtures, no supplier calls.
 * BILLING_CLIENT_SOURCE selects a baseline/restored copy without editing the worktree.
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {webcrypto} from 'node:crypto';

async function main(){
 const source=process.env.BILLING_CLIENT_SOURCE||'src/lib/billing/client.tsx';
 const bundle=await build({stdin:{contents:readFileSync(source,'utf8'),resolveDir:path.resolve('src/lib/billing'),sourcefile:'client.tsx',loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',define:{'process.env':'{}'},external:['react','react/jsx-runtime'],plugins:[{name:'explicit-fixtures',setup(b){
  b.onResolve({filter:/^@\/components\/ui\/toast$/},()=>({path:'toast',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/(auth-context|supabase)$/},a=>({path:a.path.endsWith('auth-context')?'auth':'headers',namespace:'fixture'}));
  b.onResolve({filter:/^\.\.\/supabase$/},()=>({path:'headers',namespace:'fixture'}));
  b.onResolve({filter:/^\.\.\/saas\/workspace-client$/},()=>({path:'workspace',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='toast'?'export const useToast=()=>({toast:()=>{}})':a.path==='auth'?'export const useAuth=()=>({user:{email:"client@fixture.test"},ready:false})':a.path==='headers'?'export const authHeader=async()=>{await globalThis.onAuthHeader?.();return {"x-naumi-workspace":globalThis.workspace}}':'export const currentWorkspace=()=>globalThis.workspace'}));
 }}]});
 type Call={url:string;headers:Headers;body:any};
 const entries=new Map<string,string>(),calls:Call[]=[],prompts:string[]=[];
 let confirm=true,checks=0,passed=0,failed=0,api:any;
 const storage={getItem:(k:string)=>entries.get(k)||null,setItem:(k:string,v:string)=>entries.set(k,v),removeItem:(k:string)=>entries.delete(k)};
 const context:any={module:{exports:{}},exports:{},require:createRequire(import.meta.url),console,Headers,Response,Request,FormData,File,Blob,URL,TextEncoder,Uint8Array,ArrayBuffer,TransformStream,TextDecoder,crypto:webcrypto,localStorage:storage,setTimeout,clearTimeout,workspace:'personal'};
 context.globalThis=context;context.window={confirm:(m:string)=>{prompts.push(m);return confirm},localStorage:storage,dispatchEvent:()=>{}};
 const quote=(extra:any={})=>({feature:'canvas.image',quantity:1,credits:12,reserveCredits:12,version:8,modelVersion:135,modelId:'image-a',selection:{feature:'canvas.image',quantity:1,quality:'medium',resolution:'4K',modelId:'image-a',canvas:true},quote:{id:'old',expiresAt:new Date(Date.now()-1000).toISOString()},...extra});
 const fresh=(extra:any={})=>quote({version:9,modelVersion:136,quote:{id:'refreshed',expiresAt:new Date(Date.now()+900000).toISOString()},...extra});
 const init=(headers:Record<string,string>={})=>({method:'POST',headers:{'content-type':'application/json','x-naumi-workspace':'tenant-original','x-naumi-project-context':'tree:original',...headers},body:JSON.stringify({prompt:'fixture',operationId:'old'})});
 let quoteHandler:(c:Call)=>Response|Promise<Response>,paidHandler:(c:Call)=>Response|Promise<Response>;
 context.fetch=async(url:string,request:RequestInit)=>{const call={url,headers:new Headers(request?.headers),body:JSON.parse(String(request?.body||'{}'))};calls.push(call);return url==='/api/billing/quote'?quoteHandler(call):paidHandler(call)};
 vm.runInNewContext(bundle.outputFiles[0].text,context);const client=context.module.exports;
 function Capture(){api=client.useBilling();return null;}
 const mount=()=>renderToString(React.createElement(client.BillingProvider,null,React.createElement(Capture)));
 const reset=()=>{entries.clear();calls.length=0;prompts.length=0;confirm=true;context.workspace='personal';context.onAuthHeader=undefined;quoteHandler=()=>Response.json(fresh());paidHandler=()=>Response.json({ok:true});mount()};
 const check=(actual:unknown,expected:unknown)=>{assert.deepEqual(actual,expected);checks++};
 const rejects=async(p:Promise<unknown>,pattern:RegExp)=>{await assert.rejects(p,pattern);checks++};
 const paid=()=>calls.filter(c=>c.url!=='/api/billing/quote');
 const saved=()=>Array.from(entries.entries());
 const expired=()=>Response.json({code:'IMAGE_QUOTE_EXPIRED',accepted:false},{status:409});
 const test=async(name:string,fn:()=>Promise<void>)=>{reset();try{await fn();passed++;console.log(`PASS ${name}`)}catch(e){failed++;console.error(`FAIL ${name}: ${e instanceof Error?e.message:String(e)}`)}};

 // Original 19 executed checks; reset cancelled intent before testing a new operation.
 await test('legacy-19',async()=>{
  await api.submit('/api/generate-image',init(),quote());
  check(calls.map(c=>c.url),['/api/billing/quote','/api/generate-image']);check(calls[0].headers.get('x-naumi-workspace'),'tenant-original');check(calls[0].headers.get('x-naumi-project-context'),'tree:original');check(calls[0].headers.get('x-naumi-canvas'),'1');check(calls[1].headers.get('x-naumi-image-quote'),'refreshed');check(calls[1].headers.get('x-naumi-billing-version'),'9');check(calls[1].headers.get('x-naumi-billing-operation-id'),calls[1].body.operationId);check(prompts.length,0);
  reset();quoteHandler=()=>Response.json(fresh({credits:14,reserveCredits:14}));confirm=false;await rejects(api.submit('/api/generate-image',init(),quote()),/已取消/);check(calls.length,1);check(prompts.length,1);
  reset();quoteHandler=()=>Response.json(fresh({credits:14,reserveCredits:14}));await api.submit('/api/generate-image',init(),quote());check(calls.length,2);check(prompts.length,1);check(calls[1].headers.get('x-naumi-billing-credits'),'14');
  reset();await api.submit('/api/generate-image',init(),fresh({quote:{id:'old',expiresAt:new Date(Date.now()+900000).toISOString()}}));check(calls.length,1);check(calls[0].headers.get('x-naumi-image-quote'),'old');check(prompts.length,0);
  calls.length=0;await api.quote({feature:'canvas.image',quantity:1});await api.quote({feature:'canvas.image',quantity:1});check(calls.length,1);context.workspace='tenant-next';await api.quote({feature:'canvas.image',quantity:1});check(calls.length,2);
 });
 if(!process.argv.includes('--legacy-only')){
  for(const [name,oldTerms,newTerms,needle] of [
   ['cap-20-to-200',{mode:'api-cost-plus',authorization:true,credits:6,reserveCredits:20,authorizedCredits:20},{mode:'api-cost-plus',authorization:true,credits:6,reserveCredits:200,authorizedCredits:200},'200'],
   ['fixed-to-costplus',{mode:'fixed',authorization:false,credits:6,reserveCredits:6,authorizedCredits:6},{mode:'api-cost-plus',authorization:true,credits:6,reserveCredits:100,authorizedCredits:100},'100'],
   ['reserve-only-increase',{mode:'api-cost-plus',credits:6,reserveCredits:20,authorizedCredits:200},{mode:'api-cost-plus',credits:6,reserveCredits:100,authorizedCredits:200},'100'],
   ['authorized-only-increase',{mode:'api-cost-plus',credits:6,reserveCredits:20,authorizedCredits:20},{mode:'api-cost-plus',credits:6,reserveCredits:20,authorizedCredits:200},'200'],
   ['estimate-only-increase',{mode:'fixed',credits:6,reserveCredits:20,authorizedCredits:20},{mode:'fixed',credits:7,reserveCredits:20,authorizedCredits:20},'7'],
   ['authorization-changed',{mode:'fixed',authorization:false},{mode:'fixed',authorization:true},'12'],
   ['mode-change-no-price-increase',{mode:'api-cost-plus',credits:6,reserveCredits:6},{mode:'fixed',credits:6,reserveCredits:6},'fixed'],
  ] as const){
   await test(name+'-final-consent',async()=>{
    quoteHandler=()=>Response.json(fresh(newTerms));confirm=false;
    await rejects(api.submit('/api/generate-image',init(),quote(oldTerms)),/已取消/);
    check(calls.map(c=>c.url),['/api/billing/quote']);check(prompts.length,1);check(prompts[0].includes(needle),true);check(entries.size,1);
   });
  }
  await test('approved-final-cap-sent-once',async()=>{
   quoteHandler=()=>Response.json(fresh({mode:'api-cost-plus',credits:6,reserveCredits:200,authorizedCredits:200}));
   await api.submit('/api/generate-image',init(),quote({mode:'api-cost-plus',credits:6,reserveCredits:20,authorizedCredits:20}));
   check(prompts.length,1);check(prompts[0].includes('200'),true);check(paid().length,1);check(paid()[0].headers.get('x-naumi-billing-credits'),'200');check(entries.size,0);
  });
  await test('valid-fixed-no-new-popup',async()=>{
   await api.submit('/api/generate-image',init(),fresh({mode:'fixed'}));check(calls.length,1);check(prompts.length,0);
  });
  await test('same-costplus-contract-single-popup',async()=>{
   const terms={mode:'api-cost-plus',credits:6,reserveCredits:20,authorizedCredits:20};quoteHandler=()=>Response.json(fresh(terms));await api.submit('/api/generate-image',init(),quote(terms));check(prompts.length,1);check(paid().length,1);
  });
  await test('held-costplus-keeps-existing-consent',async()=>{
   const terms={mode:'api-cost-plus',credits:6,reserveCredits:20,authorizedCredits:20};quoteHandler=()=>{throw new Error('MODEL_UNLISTED')};await api.submit('/api/generate-image',init({'x-naumi-billing-operation-id':'held-op'}),quote(terms));check(prompts.length,1);check(calls.map(c=>c.url),['/api/generate-image']);check(paid()[0].headers.get('x-naumi-image-quote'),'old');
   reset();confirm=false;await rejects(api.submit('/api/generate-image',init(),fresh(terms)),/已取消/);await rejects(api.submit('/api/generate-image',init(),fresh(terms)),/已取消/);check(paid().length,0);check(prompts.length,2);
  });
  for(const origin of ['header','storage','memory'] as const){
   await test('receipt-first-'+origin+'-model-unlisted',async()=>{
    let original='held-operation';
    if(origin!=='header'){
     paidHandler=()=>Response.json({code:'OPERATION_PENDING'},{status:409});await api.submit('/api/generate-image',init(),fresh());original=paid()[0].headers.get('x-naumi-billing-operation-id')!;
     if(origin==='storage')mount();else entries.clear();calls.length=0;
    }
    quoteHandler=()=>{throw new Error('MODEL_UNLISTED')};paidHandler=()=>Response.json({ok:true,receipt:'original'});
    const response=await api.submit('/api/generate-image',init(origin==='header'?{'x-naumi-billing-operation-id':original}:{}),quote());
    check(calls.map(c=>c.url),['/api/generate-image']);check(paid()[0].headers.get('x-naumi-image-quote'),'old');check(paid()[0].headers.get('x-naumi-billing-operation-id'),original);check(paid()[0].body.operationId,original);check((await response.json()).receipt,'original');
   });
  }
  await test('proven-expired-refresh-once-same-op',async()=>{
   paidHandler=()=>paid().length===1?expired():Response.json({ok:true});
   await api.submit('/api/generate-image',init({'x-naumi-billing-operation-id':'same-op'}),quote());
   check(calls.map(c=>c.url),['/api/generate-image','/api/billing/quote','/api/generate-image']);check(paid().map(c=>c.headers.get('x-naumi-image-quote')),['old','refreshed']);check(paid().map(c=>c.headers.get('x-naumi-billing-operation-id')),['same-op','same-op']);check(paid().map(c=>c.body.operationId),['same-op','same-op']);check(prompts.length,0);check(entries.size,0);
  });
  await test('second-expiration-never-third-post',async()=>{
   paidHandler=expired;const response=await api.submit('/api/generate-image',init({'x-naumi-billing-operation-id':'same-op'}),quote());check(response.status,409);check(paid().length,2);check(calls.filter(c=>c.url==='/api/billing/quote').length,1);
  });
  await test('refreshed-retry-contract-requires-consent',async()=>{
   confirm=false;paidHandler=expired;quoteHandler=()=>Response.json(fresh({mode:'api-cost-plus',credits:6,reserveCredits:100,authorizedCredits:100}));
   await rejects(api.submit('/api/generate-image',init({'x-naumi-billing-operation-id':'same-op'}),quote({mode:'fixed',credits:6,reserveCredits:6})),/已取消/);check(paid().length,1);check(prompts.length,1);check(prompts[0].includes('100'),true);check(Array.from(entries.values()),['same-op']);
  });
  for(const [name,status,body] of [
   ['expired-accepted-missing',409,{code:'IMAGE_QUOTE_EXPIRED'}],['expired-accepted-true',409,{code:'IMAGE_QUOTE_EXPIRED',accepted:true}],['expired-accepted-string',409,{code:'IMAGE_QUOTE_EXPIRED',accepted:'false'}],['other-409',409,{code:'OPERATION_PENDING',accepted:false}],['conflict',409,{code:'OPERATION_CONFLICT'}],['server-error',503,{error:'unknown'}],['pending-202',202,{code:'OPERATION_PENDING'}],['unknown-json',409,{error:'unknown'}],
  ] as const){
   await test('unknown-preserves-operation-'+name,async()=>{
    paidHandler=()=>Response.json(body,{status});await api.submit('/api/generate-image',init({'x-naumi-billing-operation-id':'recover-me'}),quote());const recovery=saved();
    check(calls.map(c=>c.url),['/api/generate-image']);check(Array.from(entries.values()),['recover-me']);
    calls.length=0;await api.submit('/api/generate-image',init(),quote());check(calls.map(c=>c.url),['/api/generate-image']);check(saved(),recovery);check(paid()[0].headers.get('x-naumi-billing-operation-id'),'recover-me');
   });
  }
  for(const failure of ['network','bad-json'] as const){
   await test('unknown-preserves-operation-'+failure,async()=>{
    paidHandler=()=>{if(failure==='network')throw new Error('network unknown');return new Response('{',{status:409,headers:{'content-type':'application/json'}})};
    if(failure==='network')await rejects(api.submit('/api/generate-image',init({'x-naumi-billing-operation-id':'recover-me'}),quote()),/network unknown/);else await api.submit('/api/generate-image',init({'x-naumi-billing-operation-id':'recover-me'}),quote());
    check(calls.map(c=>c.url),['/api/generate-image']);check(Array.from(entries.values()),['recover-me']);
   });
  }
  await test('malformed-success-keeps-operation',async()=>{
   paidHandler=()=>new Response('{',{status:200,headers:{'content-type':'application/json'}});await api.submit('/api/generate-image',init({'x-naumi-billing-operation-id':'recover-me'}),quote());check(Array.from(entries.values()),['recover-me']);check(paid().length,1);
  });
  for(const stage of ['hash','auth','quote-fetch','quote-json','409-json'] as const){
   await test('scope-guard-after-'+stage,async()=>{
    let current=true,guards=0;
    const guard=()=>{guards++;if(!current)throw new Error('scope changed')};
    if(stage==='auth')context.onAuthHeader=async()=>{current=false};
    if(stage==='quote-fetch')quoteHandler=()=>{current=false;return Response.json(fresh())};
    if(stage==='quote-json')quoteHandler=()=>{const r=Response.json(fresh());r.json=async()=>{await Promise.resolve();current=false;return fresh()};return r};
    if(stage==='409-json')paidHandler=()=>{const r=expired();r.clone=()=>{const copy=expired();copy.json=async()=>{await Promise.resolve();current=false;return {code:'IMAGE_QUOTE_EXPIRED',accepted:false}};return copy};return r};
    const submission=api.submit('/api/generate-image',init(stage==='409-json'?{'x-naumi-billing-operation-id':'same-op'}:{}),stage==='hash'?fresh():quote(),guard);
    if(stage==='hash')current=false;
    await rejects(submission,/scope changed/);check(paid().length,stage==='409-json'?1:0);check(guards>=1,true);check(entries.size,1);
   });
  }
  await test('scope-guard-adjacent-to-every-post',async()=>{
   let guards=0;paidHandler=()=>{check(guards,paid().length+1);return paid().length===1?expired():Response.json({ok:true})};
   await api.submit('/api/generate-image',init({'x-naumi-billing-operation-id':'same-op'}),quote(),()=>{guards++});check(guards,3);check(paid().length,2);
  });
  await test('original-canvas-header-survives-refresh',async()=>{
   const q=quote();delete q.selection.canvas;context.workspace='different-current-scope';await api.submit('/api/generate-image',init({'x-naumi-canvas':'1'}),q);
   check(calls[0].headers.get('x-naumi-canvas'),'1');check(calls[0].headers.get('x-naumi-workspace'),'tenant-original');check(calls[0].headers.get('x-naumi-project-context'),'tree:original');check('canvas' in calls[0].body,false);check(calls[0].body.resolution,'4K');
  });
  await test('unknown-second-response-keeps-same-key',async()=>{
   paidHandler=()=>paid().length===1?expired():Response.json({error:'unknown'},{status:503});await api.submit('/api/generate-image',init({'x-naumi-billing-operation-id':'recover-me'}),quote());const recovery=saved();
   check(paid().length,2);check(Array.from(entries.values()),['recover-me']);calls.length=0;paidHandler=()=>Response.json({code:'OPERATION_PENDING'},{status:409});await api.submit('/api/generate-image',init(),quote());check(calls.map(c=>c.url),['/api/generate-image']);check(saved(),recovery);
  });
 }
 console.log(`IMAGE_BILLING_CLIENT=${failed?'FAIL':'PASS'} TESTS=${passed+failed} PASSED=${passed} FAILED=${failed} CHECKS=${checks} ACTUAL_PROVIDER=1 SUPPLIER_CALLS=0`);
 if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
