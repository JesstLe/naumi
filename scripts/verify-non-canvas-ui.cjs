/* Actual Next/React/Chromium UI. All business API responses are isolated fixtures.
 * No supplier, production account, paid task or server deployment is exercised. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {buildSync}=require('esbuild');
const out=path.resolve(process.env.UI_EVIDENCE||'output/non-canvas-ui'),origin=process.env.UI_ORIGIN||'http://127.0.0.1:3027';
fs.mkdirSync(out,{recursive:true});
const only=process.argv.find(x=>x.startsWith('--only='))?.slice(7).split(',');
const baseline=process.argv.includes('--baseline'),originalNative=process.argv.includes('--original-native');
buildSync({entryPoints:['src/lib/tool-meta.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'tool-meta.cjs')});
const {TOOLS}=require(path.join(out,'tool-meta.cjs'));
const user={email:'workspace-ui@example.test',name:'创作验收',plan:'starter',creditsTotal:1200,creditsUsed:30,joinedAt:'2026-11-10T00:00:00Z',renewsAt:'2026-12-10T00:00:00Z',invoices:[]};
const image='/demos/workbench-v2/suite-coffee-scene.webp',media=fs.readFileSync('public'+image);
const artwork={id:'ui-art-coffee',title:'咖啡机场景',image,source:image,category:'generate',status:'completed',createdAt:'2026-11-12T00:00:00Z',prompt:'保留产品结构，日光厨房场景',gradient:''};
let sessions=[{id:'ag-ui-one',title:'咖啡机上新套图',lastImageUrl:image,pinned:true,createdAt:'2026-11-12T00:00:00Z',updatedAt:'2026-11-12T00:00:00Z',messageCount:2},{id:'ag-ui-two',title:'保温杯场景',createdAt:'2026-11-11T00:00:00Z',updatedAt:'2026-11-11T00:00:00Z',messageCount:2}];
const templates=['主图','场景图','套图','海报','A+详情页','白底图'].map((category,i)=>({id:'tpl-ui-'+i,title:category+' · 商品创作',category,industry:'电商',description:'',prompt:'保留产品材质，制作商品场景图',tags:['商品'],image:'/demos/workbench-v2/'+['suite-coffee-main','retouch-after','suite-after','replicate-after','suite-coffee-structure','cutout-after'][i]+'.webp',gradient:'',popular:i===0}));
const features=Object.fromEntries(['image.generate','image.suite','image.aplus','tool.cutout','tool.avatar','tool.upscale','tool.garment','tool.garment3d','tool.style','tool.dewrinkle','tool.dewatermark','tool.extract','tool.printfile','tool.ipcheck','tool.tryon','tool.retouch','tool.recolor','tool.replicate','tool.inpaint','tool.packaging3d','text.titles','video.generate'].map(f=>[f,{label:f,enabled:true,unit:'image',prices:{low:{'1K':2,'2K':4},medium:{'1K':4,'2K':8},high:{'1K':8,'2K':16}}}]));
const model={id:'image-ui',label:'图像模型',modality:'image',supportsEdit:true,qualities:['low','medium','high'],nativeResolutions:['1K','2K'],generationParameters:{ratios:['1:1','3:4','4:3','16:9','9:16'],resolutions:['1K','2K']}};
const result={tier:'Next/Chromium with isolated API fixtures',routes:[],checks:[],failures:[],pageErrors:[],consoleErrors:[],writes:[],baseline};
let browser,context,page,member=true,sessionFailure=false,restricted=false,slowPersonal=false;
const check=(name,ok,detail)=>{result.checks.push({name,ok,detail});if(!ok)result.failures.push({name,detail});console.log((ok?'PASS ':'FAIL ')+name+(detail?' '+JSON.stringify(detail):''));};
async function fixture(route){
 const req=route.request(),url=new URL(req.url()),p=url.pathname,method=req.method();
 const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)}).catch(()=>{});
 if(method!=='GET')result.writes.push({method,path:p,body:req.postData()?.slice(0,500)});
 if(p==='/api/config')return json({db:true,authMode:'mock',multiUser:true,openai:true,defaultImageModel:model.id,imageModels:[model],imageQualityCapable:true});
 if(p==='/api/auth/session')return json({user:member?user:null});
 if(p==='/api/auth/logout'){member=false;return json({ok:true});}
 if(p==='/api/feature-access')return json({email:user.email,policy:restricted?{mode:'custom',allowed:['workspace','agent'],version:2}:{mode:'default',allowed:[],version:1}});
 if(p==='/api/team/access')return json({allowed:true,canManageTeams:false,enterprise:false,startsAt:null,expiresAt:null,status:'active',href:'/team'});
 if(p==='/api/team')return json({team:{id:'team-ui',name:'商品创作团队',owner_email:user.email,enabled:true,version:1,authorized_until:'2027-11-12T00:00:00Z'},members:[{id:'member-1',email:'member-ui@example.test',name:'设计同事',banned:false,account_expires_at:'2027-11-12T00:00:00Z',management_version:1,available:480,consumed:20,artworks:3}]});
 if(p==='/api/account/agent-tokens')return json({tokens:[]});
 if(p==='/api/video/byoc/catalog')return json({workflows:[],configured:false,enabled:false});
 if(p==='/api/genchat')return json({sessions:[],messages:[]});
 if(p==='/api/enterprise')return json({enterprises:[{id:'ui-teamspace',name:'团队空间'}]});
 if(p==='/api/account')return json({persisted:true,user,artworks:[artwork],stats:{today:1,total:1},suiteGroups:[]});
 if(p==='/api/canvas/projects')return json({projects:[{projectKey:'ui-project',name:'咖啡机新品',cover:image,updatedAt:'2026-11-12T00:00:00Z'}]});
 if(p==='/api/agent/session'){
  if(sessionFailure)return json({error:'fixture read failed'},503);
  if(method==='PATCH'){const body=req.postDataJSON();sessions=sessions.map(s=>s.id===body.id?{...s,...body}:s);return json({ok:true});}
  if(method==='DELETE'){sessions=sessions.filter(s=>s.id!==url.searchParams.get('id'));return json({ok:true});}
  const space=req.headers()['x-naumi-workspace']||'personal';if(method==='GET'&&!url.searchParams.has('id')&&space==='ui-teamspace')return json({sessions:[{...sessions[0],id:'ag-ui-team',title:'团队专属会话'}]});if(slowPersonal&&method==='GET'&&!url.searchParams.has('id'))await new Promise(r=>setTimeout(r,500));
  const id=url.searchParams.get('id');return json(id?{session:{id,title:sessions.find(s=>s.id===id)?.title||'创作会话',messages:[{role:'user',content:'制作咖啡机场景图'},{role:'assistant',content:`![咖啡机场景](${image})`}],steps:[],running:false}}:{sessions});
 }
 if(p==='/api/agent')return json({running:false,total:0,events:[]});
 if(p==='/api/models'){const feature=url.searchParams.get('feature'),text=feature?.includes('text')||feature==='text.titles'||feature==='tool.ipcheck';const m=text?{id:'text-ui',label:'对话模型',modality:'text'}:model;return json({managed:true,supported:true,feature,version:1,models:[m],defaultModelId:m.id});}
 if(p==='/api/text-models')return json({models:['text-ui'],defaultModel:'text-ui'});
 if(p==='/api/billing/catalog')return json({version:1,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}});
 if(p==='/api/billing/quote')return json({...req.postDataJSON(),credits:4,reserveCredits:4,version:1});
 if(p==='/api/video/catalog')return json({ok:true,version:1,configured:true,defaultModel:'video-ui',models:[{providerId:'ui-video',modelId:'video-ui',label:'视频模型',modes:['text','image'],durations:[4,8],aspectRatios:['16:9','9:16'],resolutions:['720p','1080p'],maxReferenceImages:1,isDefault:true,definition:{modes:['text','single_image'],aspectRatios:['16:9','9:16'],durationResolutionMap:[{durations:[4,8],resolutions:['720p','1080p']}],defaultDurationSeconds:4,defaultResolution:'720p',audio:'disabled',sources:{}}}]});
 if(p==='/api/video/tasks')return json({tasks:[],total:0});
 if(p==='/api/video/assets'||p==='/api/media/assets')return json({assets:[],items:[],nextCursor:null});
 if(p==='/api/templates/categories')return json({categories:templates.map(t=>({name:t.category,count:1}))});
 if(p==='/api/templates'){const list=templates.filter(t=>(!url.searchParams.get('category')||t.category===url.searchParams.get('category'))&&(!url.searchParams.get('q')||t.title.includes(url.searchParams.get('q'))));return json({templates:list,total:list.length,page:1,pageSize:24,persisted:true});}
 if(p.startsWith('/api/templates/'))return json({template:templates.find(t=>p.endsWith(t.id))||templates[0]});
 if(p==='/api/favorites')return json({favs:[],authed:member});
 if(p==='/api/competitors')return json({items:[]});
 if(p==='/api/download'||p==='/api/media/variant')return route.fulfill({contentType:'image/webp',body:media});
 if(p==='/api/media/image-cache'||p==='/api/media/cache')return json({items:[],images:[]});
 if(p.startsWith('/api/reference-workbench/')){
  const action=p.slice('/api/reference-workbench/'.length);
  if(action==='auth/status')return json({id:user.email,user,ok:true,is_admin:false});
  if(action==='settings')return json({models:[],settings:{},config:{},providers:[],templates:[],workbench_root:''});
  return json({ok:true,items:[],projects:[],tasks:[],sessions:[],messages:[],images:[],results:[],config:{},state:{},root:'',total:0});
 }
 // Unknown business routes are isolated too. The fixture log is audited below.
 return json({ok:true,items:[],tasks:[],events:[],announcements:[],notifications:[],total:0,unread:0,enabled:false});
}
async function shot(name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
async function inspect(href){
 member=!['/sign-in','/sign-up','/reset'].includes(href);
 if(!member&&page.url().startsWith(origin))await page.evaluate(()=>localStorage.clear());
 await page.setViewportSize({width:1440,height:1000});
 const response=await page.goto(origin+href,{waitUntil:'domcontentloaded',timeout:120000});
 const native=href.startsWith('/batchshot'),auth=['/sign-in','/sign-up','/reset'].includes(href),creation=['/','/agent'].includes(href);
 await page.locator(native?(originalNative?'.appHeader':'body[data-native-workspace]'):auth?(href==='/reset'?'.workspace-auth':'[role=dialog]'):creation?'[data-creation-view]':'[data-workspace-shell]').waitFor({timeout:90000});
 if(!native&&!auth)await page.getByRole('button',{name:'我的账户',exact:false}).first().waitFor({timeout:15000});
 await page.waitForTimeout(200);
 check(href+' HTTP',response.status()===200,{status:response.status(),gated:href==='/guides'&&response.status()===404});
 if(native&&originalNative)check('original native chrome preserved',await page.locator('.nativeSidebar').count()===0&&await page.locator('.appHeader .menuBtn').isVisible());
 check(href+' content rendered',!(await page.locator('body').innerText()).includes('页面没有正常加载'));
 if(auth){await shot(href.replaceAll('/','_')+'-auth');}
 for(const width of [1440,1024,390]){
  await page.setViewportSize({width,height:width===390?844:1000});await page.waitForTimeout(100);
  const geometry=await page.evaluate(()=>({overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,content:document.querySelector('main')?.getBoundingClientRect().width,heading:document.querySelector('#workspace-content h1,main h1,.activePage')?.textContent?.trim()}));
  result.routes.push({href,width,...geometry});check(href+' layout '+width,geometry.overflow<=1,geometry);
  if(width===390){if(!auth&&!(native&&originalNative)){const open=page.getByRole('button',{name:'打开导航',exact:true}).first();await open.click();const nav=page.locator('aside[aria-label="创作导航"]');check(href+' mobile navigation',await nav.isVisible());await page.keyboard.press('Escape');if(creation)await page.getByRole('button',{name:'关闭导航',exact:true}).count().then(async n=>{if(n)await page.getByRole('button',{name:'关闭导航',exact:true}).click();});}}
  if(width===1440&&['/templates','/tools','/works','/generate','/retouch','/video','/studio3d','/account','/team','/batchshot/native/workbench'].includes(href)||width===390&&['/templates','/tools','/works','/video','/team'].includes(href))await shot(href.replaceAll('/','_')+'-'+width);
 }
}
async function interactions(){
 member=true;
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/tools');
 await page.getByRole('button',{name:'咖啡机上新套图 会话操作',exact:true}).waitFor();
 await page.getByRole('button',{name:'咖啡机上新套图 会话操作',exact:true}).click();await page.getByRole('menuitem',{name:'取消置顶',exact:true}).click();
 check('session pin persistence',sessions[0].pinned===false);
 await page.getByRole('button',{name:'咖啡机上新套图 会话操作',exact:true}).click();await page.getByRole('menuitem',{name:'重命名',exact:true}).click();
 await page.getByRole('textbox',{name:'会话名称',exact:true}).fill('咖啡机详情页');await page.getByRole('textbox',{name:'会话名称',exact:true}).press('Enter');
 await page.getByRole('button',{name:'咖啡机详情页 会话操作',exact:true}).waitFor();check('session rename persistence',sessions[0].title==='咖啡机详情页');
 await page.getByRole('button',{name:'保温杯场景 会话操作',exact:true}).click();await page.getByRole('menuitem',{name:'删除',exact:true}).click();await page.getByRole('menuitem',{name:'取消',exact:true}).click();check('delete confirmation cancellation',sessions.length===2);
 await page.keyboard.press('Escape');check('menu escape',await page.getByRole('menu').count()===0);
 await page.getByRole('button',{name:'咖啡机详情页',exact:true}).click();await page.locator('[data-creation-view="chat"]').waitFor();check('session deep link restores without execution',page.url().includes('session=ag-ui-one')&&!result.writes.some(r=>r.path==='/api/agent'));
 await page.goto(origin+'/tools');await page.getByRole('button',{name:'咖啡机详情页',exact:true}).waitFor();await page.getByRole('textbox',{name:'搜索工具',exact:true}).fill('抠图');await page.waitForTimeout(200);const filteredLinks=await page.locator('#workspace-content a').evaluateAll(items=>items.map(item=>item.getAttribute('href')));check('tool filter',filteredLinks.includes('/cutout')&&!filteredLinks.includes('/suite'),{query:await page.getByRole('textbox',{name:'搜索工具',exact:true}).inputValue(),links:filteredLinks});
 await page.getByRole('button',{name:'我的账户',exact:false}).click();check('account popover',await page.getByTestId('account-dock').isVisible());await page.keyboard.press('Escape');
 await page.goto(origin+'/works');await page.getByPlaceholder('搜索作品').fill('不存在的作品');await page.waitForTimeout(150);check('works search empty state',await page.getByText('咖啡机场景',{exact:true}).count()===0);
 await page.goto(origin+'/templates');await page.getByPlaceholder('搜索模板、行业或标签').fill('场景');await page.waitForTimeout(600);check('template search',await page.locator('[data-creation-templates]').innerText().then(t=>t.includes('场景图')));
 sessionFailure=true;await page.goto(origin+'/tools');await page.getByRole('button',{name:'重试读取对话',exact:true}).first().waitFor();sessionFailure=false;await page.getByRole('button',{name:'重试读取对话',exact:true}).first().click();await page.getByRole('button',{name:'咖啡机详情页',exact:true}).waitFor();check('catalog failed read and retry',true);
 await page.evaluate(()=>document.documentElement.classList.add('dark'));check('saved dark preference keeps product surface light',await page.locator('[data-workspace-shell]').evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(255, 255, 255)');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.keyboard.press('Escape');check('mobile focus restored',await page.getByRole('button',{name:'打开导航',exact:true}).evaluate(el=>el===document.activeElement));
 await page.setViewportSize({width:1440,height:1000});slowPersonal=true;await page.goto(origin+'/tools');await page.getByRole('combobox',{name:'创作工作空间',exact:true}).selectOption('ui-teamspace');await page.getByRole('button',{name:'团队专属会话',exact:true}).waitFor();await page.waitForTimeout(650);check('late personal response fenced',await page.getByRole('button',{name:'咖啡机详情页',exact:true}).count()===0);slowPersonal=false;
 await page.getByRole('button',{name:'团队专属会话',exact:true}).click();await page.waitForURL(/workspace=ui-teamspace/);await page.locator('[data-creation-view="chat"]').waitFor();check('workspace preserved in session navigation',page.url().includes('workspace=ui-teamspace'));
 await page.goto(origin+'/retouch');await page.getByRole('button',{name:'咖啡机详情页',exact:true}).waitFor();await page.locator('input[type=file]').first().setInputFiles({name:'reference.webp',mimeType:'image/webp',buffer:media});await page.waitForFunction(()=>[...document.querySelectorAll('fieldset img')].some(img=>img.complete&&img.naturalWidth>0));check('tool file input still operable',true);
 const quality=page.locator('fieldset [role=combobox]').first();if(await quality.count()){await quality.click();await page.getByRole('listbox').first().waitFor();const rect=await page.getByRole('listbox').first().boundingBox();check('parameter popover within viewport',rect.x>=0&&rect.x+rect.width<=1440&&rect.y>=0&&rect.y+rect.height<=1000);await page.keyboard.press('Escape');}
 await page.goto(origin+'/studio3d');await page.locator('.s3-template').first().click();await page.locator('.s3-editor-grid').waitFor();await page.locator('.s3-frame canvas').waitFor({timeout:30000});
 for(const width of [1440,1024,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(150);const box=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,stage:document.querySelector('.s3-stage').getBoundingClientRect().width}));check('3D editor layout '+width,box.overflow<=1&&box.stage>200,box);await shot('3d-editor-'+width);}
 restricted=true;await page.goto(origin+'/templates');await page.getByRole('heading',{name:'此页面尚未授权',exact:true}).waitFor();check('page grants retained in new shell',await page.locator('#workspace-content [data-creation-templates]').count()===0);restricted=false;

}
(async()=>{try{
 browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'naumi_locale',value:'zh',url:origin}]);
 await context.route('**/api/**',fixture);
 // Public guides use their real host policy; only the HTTP Host header is projected on the local Next server.
 await context.route('**/guides{,/**}',async route=>{const response=await route.fetch({headers:{...route.request().headers(),host:'naumi.top'}});await route.fulfill({response})});await context.addInitScript(()=>{try{localStorage.setItem('theme','light')}catch{}});
 page=await context.newPage();page.on('pageerror',error=>{result.pageErrors.push({url:page.url(),message:error.message});console.log('PAGE_ERROR '+error.message)});page.on('console',msg=>{if(msg.type()==='error'){result.consoleErrors.push({url:page.url(),message:msg.text()});console.log('CONSOLE_ERROR '+msg.text())}});page.setDefaultTimeout(20000);
 const routes=originalNative?['/batchshot/native/workbench']:baseline?['/templates','/tools','/works']:[...new Set(['/templates','/tools','/works',...TOOLS.filter(t=>t.href!=='/agent'&&t.href!=='/batchshot').map(t=>t.href),'/genchat','/account','/account/security','/account/agent','/team','/contact','/guides','/guides/ai-product-images','/about','/terms','/privacy','/access-denied','/sign-in','/sign-up','/reset'])];
 for(const href of routes.filter(href=>!only||only.includes(href)))await inspect(href);
 if((!only||process.argv.includes('--interactions'))&&!baseline&&!originalNative)await interactions();
 check('no browser exceptions',result.pageErrors.length===0,result.pageErrors);
 check('no React render exceptions',!result.consoleErrors.some(e=>/TypeError:|ReferenceError:|SyntaxError:/.test(e.message)));
 check('no paid execution',!result.writes.some(r=>['/api/generate-image','/api/agent','/api/imagegen','/api/video/tasks','/api/reference-workbench/workbench/start'].includes(r.path)));
 }catch(error){result.failures.push({name:'run',message:String(error),stack:error.stack});console.error(error);if(page)await shot('failure').catch(()=>{});}finally{
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2));if(browser)await browser.close();
 console.log('NON_CANVAS_UI='+JSON.stringify({routes:new Set(result.routes.map(r=>r.href)).size,viewports:result.routes.length,checks:result.checks.length,failed:result.failures.length,pageErrors:result.pageErrors.length}));process.exitCode=result.failures.length?1:0;
 }})();
