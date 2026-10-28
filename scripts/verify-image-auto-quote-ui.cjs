'use strict';
// Actual browser BillingProvider -> actual server quote functions via an intercepted
// fixture transport. No listening server, live account or supplier request.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHarness}=require('./fixtures/image-auto-quote-harness.cjs');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.CANVAS_TEST_OUT||'output/image-auto-quote-ui'),entry=path.join(root,'scripts/fixtures/image-auto-quote-ui.tsx');
const h=createHarness(process.env.CANVAS_SOURCE_ROOT||root),checks=[],requests=[],errors=[];let failQuotes=false;
const hooks={'@/lib/auth-context':'useAuth','@/lib/supabase':'authHeader','@/components/ui/toast':'useToast','@/lib/image-quality-context':'useImageQuality','@/lib/model-config/feature-client':'useFeatureModels,chosenFeatureModel,FEATURE_MODEL_SELECTION','@/lib/model-config/public-client':'MODEL_CATALOG_REFRESH','@/lib/i18n/locale-context':'useI18n','next/navigation':'usePathname'};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const js=await require('esbuild').build({absWorkingDir:root,entryPoints:[entry],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[{name:'identity-and-model-fixtures',setup(b){
  b.onResolve({filter:/^(?:@\/lib\/(?:auth-context|supabase|image-quality-context|model-config\/(?:feature-client|public-client)|i18n\/locale-context)|@\/components\/ui\/toast|next\/navigation)$/},a=>({path:a.path,namespace:'fixture'}));
  b.onResolve({filter:/^(?:\.\/|\.\.\/)supabase$/},()=>({path:'@/lib/supabase',namespace:'fixture'}));
  b.onResolve({filter:/image-auto-quote-ui\.tsx$/,namespace:'fixture'},()=>({path:entry}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',resolveDir:root,contents:`export {${hooks[a.path]}} from ${JSON.stringify(entry.replace(/\\/g,'/'))}`}));
 }}]});
 const config=require('tailwindcss/loadConfig')(path.join(root,'tailwind.config.ts'));
 const css=await require('postcss')([require('tailwindcss')({...config,content:[entry,path.join(root,'src/components/image-quality-control.tsx'),path.join(root,'src/components/ui/image-quality-select.tsx'),path.join(root,'src/components/canvas/generation-submit-action.tsx')]})]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:path.join(root,'src/app/globals.css')});
 const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css.css+'</style><style>body{margin:0;background:#f5f6f8;color:#252932;font:14px system-ui}main{max-width:820px;margin:54px auto;padding:20px}header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px}h1{font-size:20px;font-weight:650}header span{font-size:12px;color:#69717d}section{background:white;border:1px solid #e4e7ec;border-radius:16px;padding:24px}textarea{width:100%;min-height:100px;border:0;resize:none;padding:4px;font-size:15px;outline:none}select{border:1px solid #dde1e8;border-radius:8px;background:white;padding:5px}label{font-size:12px}@media(max-width:480px){main{margin:20px auto;padding:14px}section{padding:16px}}</style></head><body class="light"><div id="root"></div><script>'+js.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
 fs.writeFileSync(path.join(out,'fixture.html'),html);
 const {chromium,expect}=require('@playwright/test'),browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1080,height:720}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());requests.push({path:url.pathname,method:req.method()});
  if(url.origin!=='http://fixture'){errors.push('unexpected external request');return route.abort();}
  if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:html});
  if(url.pathname==='/api/billing/catalog')return route.fulfill({json:{version:8,features:{},products:[],thresholds:{},effective:{metering:true}}});
  if(url.pathname==='/api/billing/quote'){
   const r=failQuotes?{status:503,body:{error:'Fixture temporary failure'}}:await h.post(req.postDataJSON(),req.headers());
   return route.fulfill({status:r.status,json:r.body});
  }
  errors.push('unexpected endpoint '+url.pathname);return route.abort();
 });
 const select=page.getByTestId('image-quality-select'),total=page.getByTestId('image-quality-total');
 try{
  await page.goto('http://fixture/');
  await expect(select).toContainText('11 积分/张');await expect(total).toHaveText('总计 22 积分');checks.push('auto_unit_and_total_real_quote');
  await select.click();for(const text of ['低 · 0 积分/张','中 · 7 积分/张','高 · 11 积分/张','超高 · 17 积分/张','极致 · 23 积分/张'])await expect(page.getByRole('option',{name:text,exact:true})).toBeVisible();
  await page.screenshot({path:path.join(out,'quote-desktop.png')});checks.push('all_five_quality_prices');
  await page.getByRole('option',{name:'中 · 7 积分/张',exact:true}).click();await expect(total).toHaveText('总计 14 积分');
  await page.getByLabel('清晰度',{exact:true}).selectOption('2K');await expect(select).toContainText('12 积分/张');await expect(total).toHaveText('总计 24 积分');
  await page.getByLabel('张数',{exact:true}).selectOption('4');await expect(total).toHaveText('总计 48 积分');checks.push('quality_resolution_quantity_changes');
  failQuotes=true;await page.getByLabel('清晰度',{exact:true}).selectOption('4K');await expect(select).toContainText('报价暂不可用');await expect(total).toContainText('报价暂不可用');
  failQuotes=false;await page.getByRole('button',{name:'重试报价',exact:true}).click();await expect(select).toContainText('17 积分/张');await expect(total).toHaveText('总计 68 积分');checks.push('failure_retry_recovers_both_without_generation');
  await page.getByLabel('比例',{exact:true}).selectOption('3:4');await expect(select).toContainText('17 积分/张');await expect(total).toHaveText('总计 68 积分');checks.push('concrete_frame_keeps_price');
  await page.getByLabel('比例',{exact:true}).selectOption('auto');await page.setViewportSize({width:390,height:844});await expect(select).toContainText('17 积分/张');await expect(total).toHaveText('总计 68 积分');
  await page.screenshot({path:path.join(out,'quote-mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks.push('mobile_390_no_horizontal_overflow');
  assert.deepEqual(errors,[]);assert.ok(requests.every(r=>['/','/api/billing/catalog','/api/billing/quote'].includes(r.path)));
  console.log(`IMAGE_AUTO_QUOTE_UI=PASS CASES=${checks.length} PAGE_ERRORS=0 PAID_CALLS=0`);
 }catch(e){fs.writeFileSync(path.join(out,'failure.txt'),String(e.stack||e));await page.screenshot({path:path.join(out,'failure.png'),timeout:5000}).catch(()=>{});throw e}
 finally{fs.writeFileSync(path.join(out,'UI_QUOTE.json'),JSON.stringify({checks,requests,errors,calls:h.state.calls,sourceFiles:Object.fromEntries(h.sourceFiles),evidenceTier:'actual React DOM/Edge + BillingProvider + quote route/functions; auth/config/quote-row repositories are fixtures; not production page acceptance',paidCalls:0},null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
