'use strict';
// node --conditions react-server scripts/verify-image-auto-quote.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHarness}=require('./fixtures/image-auto-quote-harness.cjs');
const out=path.resolve(process.env.CANVAS_TEST_OUT||'output/image-auto-quote'),h=createHarness(process.env.CANVAS_SOURCE_ROOT||process.cwd()),results=[];
const base={feature:'canvas.image',modelId:'gpt-image-2',quality:'high',resolution:'1K',ratio:'auto',quantity:1};
async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS '+name)}catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL '+name+': '+e.message)}}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await test('auto_quotes_all_qualities_tiers_and_totals',async()=>{
  const before=h.state.writes;
  for(const [quality,price]of Object.entries({low:0,medium:7,high:11,xhigh:17,max:23}))for(const [resolution,extra]of Object.entries({'1K':0,'2K':5,'4K':10}))for(const quantity of [1,2,4]){
   const r=await h.post({...base,quality,resolution,quantity});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.credits,(price+extra)*quantity);assert.equal(r.body.quote,undefined,'unresolved preview must not create an executable token');
  }
  assert.equal(h.state.writes,before);
 });
 await test('quote_retry_keeps_auto_and_returns_real_zero',async()=>{for(let i=0;i<2;i++){const r=await h.post({...base,quality:'low'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.credits,0);assert.equal(h.state.calls.at(-1).input.ratio,'auto');}});
 await test('resolved_frame_keeps_price_and_freezes_actual_mapping',async()=>{
  const r=await h.post({...base,ratio:'3:4',resolution:'2K',quantity:2});assert.equal(r.status,200);assert.equal(r.body.credits,32);assert.ok(r.body.quote?.id);
  const q=h.state.rows.get(r.body.quote.id).quote;assert.equal(q.facts.ratio,'3:4');assert.equal(q.imageParameterPlans.u1.wire.size,'3:4');assert.equal(q.imageParameterPlans.u1.wire.resolution,'2k');
  h.context.assertImageBillingSelection(q,{...base,ratio:'3:4',resolution:'2K',quantity:2});
  assert.throws(()=>h.context.assertImageBillingSelection(q,{...base,ratio:'16:9',resolution:'2K',quantity:2}),e=>e.code==='OPERATION_CONFLICT');
 });
 await test('display_auto_never_weakens_execution_admission',async()=>{
  await assert.rejects(h.context.quoteForRequest(h.request(base),base),e=>e.code==='IMAGE_MAPPING_INVALID');
  assert.throws(()=>h.context.compileImageParameterPlan(h.state.models.config.upstreamModels[0],{quality:'high',resolution:'1K',ratio:'auto'},{publicModelId:'gpt-image-2',protocol:'apimart-images',modelVersion:152}),e=>e.code==='IMAGE_MAPPING_INVALID');
 });
 await test('invalid_concrete_ratio_and_missing_prices_still_fail',async()=>{
  assert.equal((await h.post({...base,ratio:'broken'})).status,422);
  const tariff=h.state.billing.config.features['canvas.image'],old=tariff.pricing;
  tariff.pricing={mode:'matrix',prices:{high:{'1K':null}}};try{const r=await h.post(base);assert.equal(r.status,400);assert.equal(r.body.credits,undefined)}finally{tariff.pricing=old}
 });
 await test('authentication_and_model_checks_remain',async()=>{assert.equal((await h.post(base,{'x-fixture-owner':''})).status,401);assert.equal((await h.post({...base,modelId:'missing'})).status,409);assert.equal((await h.post(base,{'sec-fetch-site':'cross-site'})).status,403);assert.equal((await h.post({...base,quantity:0})).status,400)});
 await test('frozen_price_owner_scope_and_ratio_stay_immutable',async()=>{
  const r=await h.post({...base,ratio:'1:1'}),q=h.state.rows.get(r.body.quote.id).quote,headers={'x-naumi-image-quote':r.body.quote.id};
  h.state.billing.config.features['canvas.image'].pricing.quality.high=99;
  const retained=await h.context.quoteForRequest(h.request({...base,ratio:'1:1'},headers),{...base,ratio:'1:1'});assert.equal(retained.requestedCredits,q.requestedCredits);
  await assert.rejects(h.context.quoteForRequest(h.request(base,headers),base),e=>e.code==='OPERATION_CONFLICT');
  await assert.rejects(h.context.quoteForRequest(h.request({...base,ratio:'1:1'},{...headers,'x-fixture-owner':'other@example.test'}),{...base,ratio:'1:1'}),e=>e.code==='IMAGE_QUOTE_INVALID');
  assert.equal((await h.post({...base,ratio:'1:1'},{...headers,'x-fixture-workspace':'other-workspace'})).status,400);
 });
 const failed=results.filter(x=>!x.pass).length;
 fs.writeFileSync(path.join(out,'AUTO_QUOTE.json'),JSON.stringify({sourceRoot:process.env.CANVAS_SOURCE_ROOT||process.cwd(),sourceFiles:Object.fromEntries(h.sourceFiles),results,calls:h.state.calls,passed:results.length-failed,failed,quoteRowWrites:h.state.writes,supplierCalls:0,evidenceTier:'actual Route/billing/business functions; repository and authenticated identity fixtures'},null,2));
 console.log(`IMAGE_AUTO_QUOTE=${failed?'FAIL':'PASS'} CASES=${results.length} FAILED=${failed} SUPPLIER_CALLS=0`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
