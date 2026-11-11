/* Actual Next pages / Chromium, local media bytes, fixture API identities.
 * Does not validate a paid supplier result or a production deployment. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {buildSync}=require('esbuild');
const origin=process.env.CASES_ORIGIN||'http://127.0.0.1:3021';
const out=path.resolve(process.env.CASES_EVIDENCE||'output/public-cases-browser');fs.mkdirSync(out,{recursive:true});
const catalog=require('../src/lib/creation-cases/catalog.json');
buildSync({entryPoints:['src/lib/feature-access/catalog.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'feature-policy.cjs')});
const {DEFAULT_POLICY}=require(path.join(out,'feature-policy.cjs'));
const receipt={tier:'actual Next/Chromium + local public media; API fixtures; no paid generation',checks:[],errors:[],requests:[],screenshots:[]};
const check=(name,condition)=>{assert.ok(condition,name);receipt.checks.push(name);console.log('PASS '+name);};
const user={email:'public-cases@example.test',name:'案例验收',plan:'starter',creditsTotal:1000,creditsUsed:0,joinedAt:'2026-11-11T00:00:00Z',renewsAt:'2026-12-11T00:00:00Z',invoices:[]};
const legacy={id:'legacy-template',title:'既有商品模板',description:'旧模板链路验收',category:'主图',industry:'电商',prompt:'原有的受保护提示词',tags:['商品'],image:'/demos/workbench-v2/suite-coffee-main.webp',gradient:'',popular:false};
let browser;
async function setup({member=false,denied=false,width=1440,broken=false}={}){
 const context=await browser.newContext({viewport:{width,height:1000},permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(120000);
 page.on('pageerror',error=>receipt.errors.push(error.message));
 page.on('request',request=>receipt.requests.push({url:request.url(),method:request.method()}));
 if(broken)await context.route('**/creation-cases/gold-pendant.webp',route=>route.fulfill({status:404,body:'missing fixture'}));
 await context.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(p==='/api/config'){const response=await route.fetch();return json({...await response.json(),db:true,multiUser:true});}
  if(p==='/api/auth/session')return json({user:member?user:null});
  if(p==='/api/account')return json({persisted:true,user,artworks:[],stats:{today:0,total:0}});
  if(p==='/api/feature-access')return json({email:user.email,policy:denied?{mode:'custom',allowed:['templates'],version:1}:DEFAULT_POLICY});
  if(p==='/api/enterprise')return json({enterprises:[]});
  if(p==='/api/canvas/projects')return json({persisted:true,projects:[]});
  if(p==='/api/agent/session')return json({sessions:[]});
  if(p==='/api/agent')return json({running:false,total:0,events:[]});
  if(p==='/api/templates/categories')return json({categories:[{name:'主图',count:1}]});
  if(p==='/api/templates')return json({templates:[legacy],total:1,page:1,pageSize:24,persisted:true});
  if(p==='/api/favorites')return json({favs:[],authed:member});
  if(p==='/api/video/catalog')return json({models:[]});
  if(p==='/api/video/projects')return json({projects:[]});
  if(p==='/api/video/tasks')return json({tasks:[],nextCursor:null});
  if(p==='/api/video/assets')return json({assets:[],nextCursor:null});
  if(p==='/api/video/media-jobs')return json({jobs:[],nextCursor:null});
  if(p==='/api/video/byoc/catalog')return json({workflows:[],models:[]});
  if(p==='/api/models'||p==='/api/text-models')return route.continue();
  if(/comfyui/.test(p))return json({workflows:[],models:[]});
  if(p==='/api/billing/catalog')return route.continue();
  if(p==='/api/billing/quote')return json({error:'fixture: no paid model configured'},409);
  return json({});
 });
 return {context,page};
}
async function closeContext(context){await context.unrouteAll({behavior:'wait'});await context.close();}
async function loaded(page){
 for(const image of await page.locator('[data-case-id] img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(im=>im.decode());}
}
async function shot(page,name,selector){
 await page.evaluate(()=>window.scrollTo(0,0));
 const target=selector==='dialog'?page.locator(selector):page;
 await target.screenshot({path:path.join(out,name+'.png'),...(selector==='dialog'?{}:{fullPage:true})});receipt.screenshots.push(name+'.png');
}
async function run(){
 browser=await chromium.launch({headless:true});
 const {page,context}=await setup();
 await page.goto(origin+'/templates',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'模板中心',exact:true}).waitFor();
 check('18-public-cases-anonymous',await page.locator('[data-case-id]').count()===18);
 await loaded(page);
 check('24-static-assets-available', (await Promise.all([...new Set(catalog.flatMap(c=>[c.poster,...(c.video?[c.video]:[])]))].map(async url=>(await context.request.get(origin+url)).status()))).every(code=>code===200));
 check('no-video-prefetch-in-grid',!receipt.requests.some(req=>req.url.endsWith('.mp4')));
 await shot(page,'templates-light','[data-testid="template-library"]');
 await page.evaluate(()=>document.documentElement.classList.add('dark'));
 await shot(page,'templates-dark','[data-testid="template-library"]');
 await page.evaluate(()=>document.documentElement.classList.remove('dark'));
 await page.getByRole('button',{name:/^短视频\s*6$/}).click();
 check('video-filter-six',await page.locator('[data-case-kind=video]').count()===6);
 await shot(page,'video-gallery','[data-testid="template-library"]');
 for(const item of catalog.filter(c=>c.kind==='video')){
  await page.getByRole('button',{name:'播放 '+item.title,exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  const video=dialog.locator('video');
  await video.evaluate(async v=>{v.muted=true;await v.play();});
  await page.waitForFunction(()=>{const v=document.querySelector('dialog video');return v&&!v.paused&&v.currentTime>.12&&v.videoWidth===848;});
  check('actual-playback-'+item.id,true);
  check('explicit-source-'+item.id,await dialog.getByRole('link',{name:item.source.title,exact:true}).getAttribute('href')===item.source.url);
  check('video-real-route-'+item.id,await dialog.getByRole('link',{name:'使用此案例'}).getAttribute('href')==='/video?case='+item.id);
  if(item.id==='citrus-still-life')await shot(page,'video-detail','dialog');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  check('video-unmounted-'+item.id,await page.locator('video').count()===0);
 }
 await page.getByRole('button',{name:/^图片\s*12$/}).click();
 check('image-filter-twelve',await page.locator('[data-case-kind=image]').count()===12);
 await page.getByRole('searchbox',{name:'搜索公开案例'}).fill('金饰');
 check('query-filter-one',await page.locator('[data-case-id]').count()===1);
 const trigger=page.getByRole('button',{name:'查看 金饰微距',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'复制创作提示词'}).click();
 check('clipboard-real-prompt',await page.evaluate(()=>navigator.clipboard.readText())===catalog.find(c=>c.id==='gold-pendant').prompt);
 check('image-real-route',new URL(await dialog.getByRole('link',{name:'使用此案例'}).getAttribute('href'),origin).searchParams.get('prompt')===catalog.find(c=>c.id==='gold-pendant').prompt);
 for(let i=0;i<9;i++)await page.keyboard.press('Tab');
 check('native-dialog-focus-trap',await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)));
 await shot(page,'image-detail','dialog');await page.keyboard.press('Escape');
 check('focus-restored',await trigger.evaluate(el=>el===document.activeElement));
 await page.getByRole('searchbox',{name:'搜索公开案例'}).fill('no-such-public-case');
 check('empty-search-feedback',await page.getByText('没有匹配的案例',{exact:true}).count()===1);
 await page.getByRole('button',{name:'清除筛选',exact:true}).click();
 await page.getByRole('button',{name:'商品摄影',exact:true}).click();
 check('category-filter-four',await page.locator('[data-case-id]').count()===4);
 await page.getByRole('button',{name:'模板库',exact:true}).click();
 await page.getByText('既有商品模板',{exact:true}).waitFor();
 check('legacy-template-and-favorites-retained',await page.getByRole('button',{name:'我的收藏',exact:false}).count()===1);
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'创作灵感',exact:true}).waitFor();
 check('home-shared-library-twelve',await page.locator('[data-case-id]').count()===12);
 await loaded(page);await shot(page,'home-discovery-light','[data-testid="template-library"]');
 await page.getByRole('button',{name:'切换为深色主题'}).click();
 await shot(page,'home-discovery-dark','[data-testid="template-library"]');
 await page.getByRole('button',{name:'切换为浅色主题'}).click();
 await page.getByRole('button',{name:'查看全部 18 个案例',exact:true}).click();
 check('home-expand-eighteen',await page.locator('[data-case-id]').count()===18);
 await closeContext(context);

 const mobile=await setup({width:390});
 await mobile.page.goto(origin+'/templates');await loaded(mobile.page);
 check('mobile-no-horizontal-overflow',await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await shot(mobile.page,'templates-mobile','[data-testid="template-library"]');
 await mobile.page.getByRole('button',{name:'播放 柠檬静物短片',exact:true}).click();
 check('mobile-dialog-fits',await mobile.page.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().width<innerWidth));
 await shot(mobile.page,'video-detail-mobile','dialog');await closeContext(mobile.context);

 const member=await setup({member:true});
 await member.page.goto(origin+'/video?case=citrus-still-life');
 await member.page.getByTestId('video-workbench').waitFor();
 const videoPrompt=member.page.getByTestId('video-composer-prompt');
 check('video-case-seeded-after-auth',await videoPrompt.innerText()===catalog.find(c=>c.id==='citrus-still-life').prompt);
 await videoPrompt.fill('我的独立视频草稿');
 await member.page.evaluate(()=>window.dispatchEvent(new Event('naumi:model-catalog-refresh')));
 check('video-user-edit-retained',await videoPrompt.innerText()==='我的独立视频草稿');
 await member.page.goto(origin+'/video?case=../../invalid');
 await member.page.getByTestId('video-workbench').waitFor();
 check('unknown-case-not-imported',await member.page.getByTestId('video-composer-prompt').innerText()==='');
 await member.page.goto(origin+'/templates');
 await member.page.getByRole('button',{name:'查看 金饰微距',exact:true}).click();
 await member.page.getByRole('link',{name:'使用此案例',exact:true}).click();
 await member.page.waitForURL('**/generate?*');
 await member.page.waitForFunction(prompt=>Array.from(document.querySelectorAll('textarea')).some(el=>el.value===prompt),catalog.find(c=>c.id==='gold-pendant').prompt);
 check('image-case-arrives-editable-in-real-generate',true);await closeContext(member.context);

 const denied=await setup({member:true,denied:true});
 await denied.page.goto(origin+'/templates');await denied.page.getByRole('button',{name:'查看 金饰微距',exact:true}).click();
 check('feature-grant-not-bypassed',await denied.page.getByRole('dialog').getByRole('link',{name:'使用此案例'}).count()===0);await closeContext(denied.context);
 const broken=await setup({broken:true});
 await broken.page.goto(origin+'/templates');await broken.page.getByRole('button',{name:'查看 金饰微距',exact:true}).click();
 await broken.page.getByRole('alert').filter({hasText:'素材加载失败'}).waitFor();check('failed-media-visible-feedback',true);await closeContext(broken.context);
 check('no-generation-submissions',!receipt.requests.some(req=>req.method==='POST'&&/\/api\/(?:video\/tasks|generate|imagegen)/.test(req.url)));
 check('no-react-hydration-or-runtime-errors',receipt.errors.length===0);
 console.log('BROWSER_PASS checks='+receipt.checks.length+' errors=0 paid_submissions=0');
}
run().catch(error=>{receipt.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(receipt,null,2));if(browser){for(const context of browser.contexts())await context.unrouteAll({behavior:'wait'});await browser.close();}});
