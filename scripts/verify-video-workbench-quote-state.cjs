'use strict';
// Actual Studio, settings controls and BillingProvider; only identity/HTTP are fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{chromium,expect}=require('@playwright/test');
const root=process.cwd(),out=path.resolve(process.argv[2]||'output/video-workbench-quote-state');
async function main(){
 fs.mkdirSync(out,{recursive:true});let errors=[],checks=[],requests=[],held=[],pendingMode='hold',posted=0;
 const pass=name=>{checks.push(name);console.log('VIDEO_QUOTE_CHECK=PASS '+name)};
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{BillingProvider}from'@/lib/billing/client';import{VideoStudioClient}from'@/components/video/video-studio-session';createRoot(document.getElementById('root')).render(<BillingProvider><VideoStudioClient/></BillingProvider>);`;
 const js=(await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'only-runtime-identity',setup(b){
  b.onResolve({filter:/^(?:@\/lib\/(?:auth-context|auth-modal-context|supabase|i18n\/locale-context)|next\/(?:link|image))$/},a=>({path:a.path,namespace:'fixture'}));
  b.onResolve({filter:/^(?:\.\/|\.\.\/)supabase$/},()=>({path:'@/lib/supabase',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',resolveDir:root,contents:a.path==='@/lib/auth-context'?`const user={email:'video-quote@example.test'};export const useAuth=()=>({user,ready:true});`:a.path==='@/lib/auth-modal-context'?`export const useAuthModal=()=>({openAuth:()=>{throw Error('No login needed in fixture')}});`:a.path==='@/lib/supabase'?`export const authHeader=async()=>({});`:a.path==='@/lib/i18n/locale-context'?`const t=x=>x;export const useI18n=()=>({locale:'zh',t});`:`import React from'react';export default function Element({children,...props}){return <a {...props}>{children}</a>}` }));
 }}]})).outputFiles[0].text;
 const html=`<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{background:white;color:#172033;font:14px system-ui}button,input,select{padding:8px;margin:4px}main{max-width:1100px;margin:auto}textarea{width:90%}</style><div id='root'></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script>`;
 fs.writeFileSync(path.join(out,'fixture.html'),html);
 const definition={modes:['text'],durationResolutionMap:[{durations:[4],resolutions:['480p']}],aspectRatios:['16:9'],defaultDurationSeconds:4,defaultResolution:'480p',defaultAspectRatio:'16:9',supportsFirstFrame:false,supportsLastFrame:false,supportsMultiShot:false,limits:{images:0,videos:0,audios:0},requiresPrompt:true};
 const models=['paid-a','paid-b','free','paid-error','paid-ceiling'].map((modelId,i)=>({modelId,providerId:'managed-video',label:['Paid A','Paid B','Explicit free','Quote error','Cost plus'][i],definition,isDefault:i===0}));
 const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1280,height:900}});
 const quote=b=>({version:8,modelVersion:117,modelId:b.modelId,feature:b.feature,quantity:1,credits:b.modelId==='free'?0:b.modelId==='paid-b'?27:20,reserveCredits:0});
 await page.route('**/*',async route=>{const r=route.request(),u=new URL(r.url()),send=body=>route.fulfill({json:body});requests.push({path:u.pathname,method:r.method()});
  if(u.origin!=='http://video-quote.fixture')throw Error('Unexpected external request '+u.origin);
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
  if(u.pathname==='/api/billing/catalog')return send({version:8,features:{},products:[],thresholds:{},effective:{metering:true}});
  if(u.pathname==='/api/billing/quote'){const body=r.postDataJSON();if(pendingMode==='hold'){held.push({route,body});return;}if(pendingMode==='fail')return route.fulfill({status:503,json:{error:'报价暂不可用'}});if(pendingMode==='cost-plus')return send({...quote(body),mode:'api-cost-plus',credits:3,authorizedCredits:41,reserveCredits:39});return send(quote(body));}
  if(u.pathname==='/api/video/catalog')return send({models});
  if(u.pathname==='/api/video/byoc/catalog')return send({endpoint:{id:'fixture-local',name:'Local'},workflows:[{id:'local-video',name:'Local video',videoOutput:true,inputs:{images:[],texts:[],seeds:[],numerics:[],requiredNodes:[]},paths:[],defaultMappings:[]}]});
  if(u.pathname==='/api/video/projects')return send({projects:[]});
  if(u.pathname==='/api/video/assets')return send({assets:[],nextCursor:null});
  if(u.pathname==='/api/video/tasks')return send({tasks:[],nextCursor:null});
  if(u.pathname==='/api/video/media-jobs')return send({jobs:[],nextCursor:null});
  if(r.method()!=='GET')posted++;
  throw Error('Unexpected request '+u.pathname);
 });
 page.on('pageerror',e=>errors.push(e.message));
 const generate=()=>page.getByRole('button',{name:/生成视频/});
 async function release(){pendingMode='normal';while(held.length){const h=held.shift();await h.route.fulfill({json:quote(h.body)});}}
 async function choose(label){await page.getByRole('combobox',{name:'视频模型',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click();}
 try{
  await page.goto('http://video-quote.fixture/');await page.getByRole('combobox',{name:'视频模型',exact:true}).waitFor();await page.getByRole('textbox',{name:'视频描述',exact:true}).fill('固定机位，雨夜空车站，湿地面倒映灯光。');
  await expect(generate()).toContainText('—');await expect(generate()).toBeDisabled();pass('initial_pending_quote_is_not_free_and_cannot_submit');
  await release();await expect(generate()).toContainText('每个 20 积分');await expect(generate()).toBeEnabled();pass('formal_fixed_quote_displayed');
  pendingMode='hold';await choose('Paid B');await expect(generate()).toContainText('—');await expect(generate()).toBeDisabled();assert.ok(!await generate().innerText().then(x=>x.includes('0 积分')));pass('model_switch_clears_old_price_without_zero_fallback');
  await choose('Explicit free');await expect(generate()).toContainText('—');await expect.poll(()=>held.filter(h=>h.body.modelId==='paid-b').length).toBeGreaterThan(0);const late=held.find(h=>h.body.modelId==='paid-b');held=held.filter(h=>h!==late);await late.route.fulfill({json:quote(late.body)});await expect(generate()).toContainText('—');await expect(generate()).toBeDisabled();pass('late_previous_model_quote_cannot_price_current_model');
  await release();await expect(generate()).toContainText('每个 0 积分');await expect(generate()).toBeEnabled();pass('explicit_formal_zero_is_preserved');
  pendingMode='fail';await choose('Quote error');await expect(generate()).toContainText('—');await expect(generate()).toBeDisabled();await page.getByText('报价暂不可用',{exact:true}).waitFor();pass('failed_quote_is_unknown_not_free');
  pendingMode='cost-plus';await choose('Cost plus');await expect(generate()).toContainText('每个上限 41 积分');pass('cost_plus_displays_authorized_ceiling');
  pendingMode='hold';await page.getByLabel('视频执行入口',{exact:true}).selectOption('byoc');await expect(generate()).toContainText('每个 0 积分');await expect(generate()).toBeEnabled();pass('explicit_byoc_zero_stays_zero_without_managed_quote');
  assert.equal(posted,0);assert.equal(requests.some(x=>['/api/video/generate','/api/comfyui/run'].includes(x.path)),false);assert.deepEqual(errors,[]);pass('actual_hooks_settings_and_quote_transport_no_generation_or_vendor');
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({checks,requests,errors,paidCalls:0},null,2));console.log(`VIDEO_WORKBENCH_QUOTE_STATE=PASS CHECKS=${checks.length} PAGE_ERRORS=0 PAID_CALLS=0`);
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.txt'),String(error)+'\n'+await page.locator('body').innerText());throw error;}finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
