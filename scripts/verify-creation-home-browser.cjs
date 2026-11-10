/* Real Next/React application; only API receipts/auth/provider are browser-local
 * fixtures. This tier never represents a paid supplier or production test. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {buildSync}=require('esbuild');
const out=path.resolve(process.env.CREATION_EVIDENCE||'output/creation-home-browser');fs.mkdirSync(out,{recursive:true});
const policyPath=path.join(out,'feature-policy.cjs');buildSync({entryPoints:['src/lib/feature-access/catalog.ts'],bundle:true,platform:'node',format:'cjs',outfile:policyPath});
const {DEFAULT_POLICY}=require(policyPath);
const origin=process.env.CREATION_ORIGIN||'http://127.0.0.1:3018';
const user={email:'creation-ui@example.test',name:'创作验收',plan:'starter',creditsTotal:1000,creditsUsed:0,joinedAt:'2026-11-10T00:00:00Z',renewsAt:'2026-12-10T00:00:00Z',invoices:[]};
const media=fs.readFileSync('public/demos/workbench-v2/suite-coffee-scene.webp');
const art={id:'ui-art-coffee',title:'咖啡机商品场景',image:'/media/creation-ui-coffee.webp',createdAt:'2026-11-10T09:00:00Z',status:'completed'};
const sessions=['咖啡机上新套图','保温杯场景主图'].map((title,i)=>({id:'ag-ui-'+i,title,createdAt:'2026-11-10T09:00:00Z',updatedAt:'2026-11-10T09:00:00Z',messageCount:2}));
const templates=['主图','白底图','场景图','套图','A+详情页','海报'].map((category,i)=>({id:'tpl-ui-'+i,title:category+' · 商品创作',category,industry:'电商',description:'公开测试素材',prompt:'保留产品材质，制作商品场景图',tags:['商品'],image:'/demos/workbench-v2/'+(['suite-coffee-main.webp','retouch-before.webp','image-after.webp','suite-after.webp','suite-coffee-structure.webp','replicate-after.webp'][i]),gradient:'',popular:false}));
const results={tier:'Real Next application + browser API fixtures; no paid provider',checks:[],failures:[],requests:[],errors:[],screenshots:[]};
const check=(name,condition)=>{assert.ok(condition,name);results.checks.push(name);console.log('PASS '+name);};
let browser,context,page,member=true,unknown=false,submitted=[];
async function setup(width=1600){
 context=await browser.newContext({viewport:{width,height:1000}});page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>results.errors.push(String(e)));
 await context.route('**/media/creation-ui-coffee.webp',r=>r.fulfill({contentType:'image/webp',body:media}));
 await context.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname;
  results.requests.push({path:p,method:request.method()});
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(p==='/api/config'){const response=await route.fetch();return json({...await response.json(),db:true,multiUser:true});}
  if(p==='/api/auth/session')return json({user:member?user:null});
  if(p==='/api/auth/logout'){member=false;return json({ok:true});}
  if(p==='/api/feature-access')return json({email:user.email,policy:DEFAULT_POLICY});
  if(p==='/api/account'){if(url.searchParams.has('email'))assert.equal(url.searchParams.get('email'),user.email,'artwork resolver actor remains an email');return json({persisted:true,user,artworks:[art],stats:{today:1,total:1}});}
  if(p==='/api/enterprise')return json({enterprises:[]});
  if(p==='/api/media/image-cache'||p==='/api/public-image-cache'){
   const sources=request.postDataJSON().sources,account=p==='/api/public-image-cache'?'public':user.email;
   return json({account,results:Object.fromEntries(sources.map(source=>[source,{account,source,version:'creation-ui-v1',fetchUrl:source,bytes:media.length,contentType:'image/webp'}]))});
  }
  if(p==='/api/canvas/projects')return json({persisted:true,projects:[{projectKey:'tree:ui-art-coffee',name:'咖啡机上新',cover:art.image,updatedAt:art.createdAt}]});
  if(p==='/api/agent/session'){
   if(request.method()==='GET'&&!url.searchParams.has('id'))return json({sessions});
   const current=sessions.find(s=>s.id===url.searchParams.get('id'))||sessions[0];
   return json({session:{...current,messages:[{role:'user',content:current.title+'，保留产品外形，放入自然光厨房场景。\n[商品图] '+art.image},{role:'assistant',content:'![咖啡机场景图]('+art.image+')'}],steps:[]}});
  }
  if(p==='/api/agent'){
   if(request.method()==='GET')return unknown?json({error:'fixture-unconfirmed'},503):json({running:false,total:0,events:[]});
   if(request.method()==='PUT'){
    const body=request.postDataJSON();submitted.push(body);
    return route.fulfill({contentType:'text/event-stream',body:'event: open\ndata: '+JSON.stringify({sessionId:body.sessionId||'ag-ui-new'})+'\n\nevent: delta\ndata: '+JSON.stringify({text:'已读取创作需求。'})+'\n\nevent: final\ndata: '+JSON.stringify({reply:'已读取创作需求。'})+'\n\n'});
   }
   return json({ok:true});
  }
  if(p==='/api/artworks/add')return json({artwork:art});
  if(p==='/api/download'||p==='/api/media/variant')return route.fulfill({contentType:'image/webp',body:media});
  if(p==='/api/templates/categories')return json({categories:templates.map(t=>({name:t.category,count:1}))});
  if(p==='/api/templates')return json({templates:templates.filter(t=>(!url.searchParams.get('category')||t.category===url.searchParams.get('category'))&&(!url.searchParams.get('q')||t.title.includes(url.searchParams.get('q')))),total:6,page:1,pageSize:24,persisted:true});
  if(p==='/api/favorites')return json({favs:[],authed:member});
  return route.continue();
 });
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'我的账户',exact:false}).waitFor();
 await page.getByRole('button',{name:'咖啡机上新套图',exact:true}).waitFor();
}
async function shot(name){await page.waitForFunction(()=>[...document.images].filter(im=>im.loading!=='lazy'&&im.getBoundingClientRect().width>0).every(im=>im.complete&&im.naturalWidth>0),{},{timeout:15000});await page.waitForTimeout(350);await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});results.screenshots.push(name+'.png');}
async function run(){
 browser=await chromium.launch({headless:true});await setup();
 const shell=page.locator('[data-creation-view]');
 check('creation-home-real-entry',await shell.getAttribute('data-creation-view')==='home');
 const nav=await page.locator('aside[aria-label="创作导航"] nav').allTextContents();
 check('exact-primary-navigation',nav[0].replace(/\s/g,'')==='创作模板中心创作工具我的作品');
 check('exact-workspace-navigation',nav[1].replace(/\s/g,'')==='无限画布参考工作台视频工作台');
 check('real-conversation-history',await page.getByRole('button',{name:'咖啡机上新套图',exact:true}).count()===1);
 check('real-canvas-summary-link',await page.getByRole('link',{name:'咖啡机上新',exact:true}).getAttribute('href')==='/canvas?project=tree%3Aui-art-coffee');
 await page.getByRole('textbox',{name:'创作描述',exact:true}).fill('首页独立草稿');
 await page.getByRole('button',{name:'切换为深色主题'}).click();
 check('dark-theme-draft-retained',await page.getByRole('textbox',{name:'创作描述',exact:true}).inputValue()==='首页独立草稿');
 check('dark-persisted',await page.evaluate(()=>localStorage.getItem('theme'))==='dark');
 await shot('home-dark');await page.getByRole('button',{name:'切换为浅色主题'}).click();await shot('home-light');
 await page.getByRole('button',{name:'咖啡机上新套图',exact:true}).click();
 await page.getByRole('button',{name:'放大查看图片'}).waitFor();
 check('native-conversation-view',await shell.getAttribute('data-creation-view')==='chat');
 check('single-composer',await page.getByRole('textbox',{name:'创作描述',exact:true}).count()===1);
 check('new-chat-draft-isolated',await page.getByRole('textbox',{name:'创作描述',exact:true}).inputValue()==='');
 check('eight-native-image-tools',await page.locator('[aria-label="图片工具"] button').count()===8);
 await page.waitForFunction(()=>{const im=document.querySelector('button[aria-label="放大查看图片"] img');return im?.complete&&im.naturalWidth>0;});check('real-image-loaded',true);
 await shot('chat-light');await page.getByRole('button',{name:'切换为深色主题'}).click();await shot('chat-dark');
 await page.getByRole('textbox',{name:'创作描述',exact:true}).fill('咖啡机独立草稿');
 await page.getByRole('button',{name:'保温杯场景主图',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('button[aria-current="page"]')?.textContent?.includes('保温杯'));
 check('conversation-draft-not-shared',await page.getByRole('textbox',{name:'创作描述',exact:true}).inputValue()==='');
 await page.getByRole('button',{name:'咖啡机上新套图',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('textarea')?.value==='咖啡机独立草稿');
 check('conversation-draft-restored',true);
 await page.getByRole('button',{name:'创作',exact:true}).click();
 check('home-draft-restored',await page.getByRole('textbox',{name:'创作描述',exact:true}).inputValue()==='首页独立草稿');
 await page.getByRole('button',{name:'咖啡机上新套图',exact:true}).click();await page.getByRole('button',{name:'重新编辑',exact:true}).click();
 check('reedit-uses-result',await page.locator('[aria-label="移除参考图 1"]').count()===1);
 check('reedit-does-not-send',submitted.length===0);
 await page.getByRole('textbox',{name:'创作描述',exact:true}).fill('继续保持咖啡机外形');
 await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByText('已读取创作需求。',{exact:true}).waitFor();
 check('real-owner-send-wire',submitted.length===1&&submitted[0].sessionId==='ag-ui-0'&&submitted[0].images[0]===art.image&&submitted[0].message.includes('继续保持咖啡机外形'));
 check('server-owned-no-client-save',!results.requests.some(r=>r.path==='/api/agent/session'&&r.method==='POST'));
 await page.getByRole('button',{name:'咖啡机上新套图',exact:true}).click();await page.getByRole('button',{name:'放大查看图片'}).waitFor();
 await page.getByRole('button',{name:'发送到画布',exact:true}).click();await page.waitForURL('**/canvas?node=ui-art-coffee');check('image-to-canvas-real-artwork-identity',true);
 await page.goto(origin);await page.getByRole('button',{name:'咖啡机上新套图',exact:true}).click();
 await page.getByRole('button',{name:'咖啡机上新套图',exact:true}).click();await page.getByRole('button',{name:'放大查看图片'}).waitFor();
 await page.getByRole('button',{name:'产品精修',exact:true}).click();
 await page.waitForURL('**/retouch?src=**');await page.waitForFunction(()=>[...document.images].some(im=>im.src.startsWith('blob:')));
 check('image-tool-reference-actually-loaded',true);check('tool-navigation-never-generates',submitted.length===1);
 for(const tool of ['upscale','cutout','inpaint','recolor','fuse','tryon']){
  await page.goto(origin+'/'+tool+'?src='+encodeURIComponent(art.image),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>[...document.images].some(im=>im.src.startsWith('blob:')&&im.complete&&im.naturalWidth>0));
  check('reference-handoff-'+tool,true);
 }
 await page.goto(origin);await page.getByRole('button',{name:'咖啡机上新套图',exact:true}).click();await page.getByRole('button',{name:'放大查看图片'}).waitFor();
 for(const width of [390,320,1024]){await page.setViewportSize({width,height:1000});check('no-overflow-'+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(width===390){await shot('chat-mobile-dark');await page.getByRole('button',{name:'切换为浅色主题'}).click();await shot('chat-mobile-light');}}
 await page.setViewportSize({width:1600,height:1000});unknown=true;await page.getByRole('button',{name:'保温杯场景主图',exact:true}).click();await page.getByRole('alert').filter({hasText:'状态暂未确认'}).waitFor();
 check('unknown-recovery-keeps-send-fenced',await page.getByRole('button',{name:'发送',exact:true}).isDisabled());unknown=false;
 await page.getByRole('button',{name:'创作',exact:true}).click();await page.getByRole('textbox',{name:'创作描述',exact:true}).fill('登出前私有草稿');
 await page.getByRole('button',{name:'我的账户',exact:false}).click();await page.getByRole('button',{name:/退出登录|Sign out/}).click();
 check('logout-clears-private-draft',await page.getByRole('textbox',{name:'创作描述',exact:true}).inputValue()==='');
 await page.getByRole('textbox',{name:'创作描述',exact:true}).fill('访客草稿');await page.getByRole('button',{name:'发送',exact:true}).click();
 check('guest-keeps-draft-before-auth',await page.getByRole('textbox',{name:'创作描述',exact:true}).inputValue()==='访客草稿');
 check('guest-does-not-submit',submitted.length===1);
 check('no-runtime-errors',results.errors.length===0);
}
run().catch(e=>{results.failures.push(String(e.stack||e));console.error(e);process.exitCode=1;}).finally(async()=>{await context?.unrouteAll({behavior:'wait'});await browser?.close();fs.writeFileSync(path.join(out,'RESULTS.json'),JSON.stringify(results,null,2));console.log('CREATION_HOME_BROWSER='+JSON.stringify({checks:results.checks.length,failed:results.failures.length,supplierCalls:0,source:'actual Next application'}));});
