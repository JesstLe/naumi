const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {chromium}=require('playwright'),{buildSync}=require('esbuild');
const origin=process.env.CREATION_ORIGIN||'http://127.0.0.1:3022';
const out=path.resolve(process.env.CREATION_EVIDENCE||'output/agent-creation-controls/browser');fs.mkdirSync(out,{recursive:true});
buildSync({entryPoints:['src/lib/feature-access/catalog.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(out,'policy.cjs')});
const {DEFAULT_POLICY}=require(path.join(out,'policy.cjs'));
const user={email:'creation-turns@example.test',name:'创作验收',plan:'starter',creditsTotal:1000,creditsUsed:0,joinedAt:'2026-11-11',renewsAt:'2026-12-11',invoices:[]};
const imageModels=[{id:'image-a',label:'图像模型 A',modality:'image',supportsEdit:true,qualities:['medium','high'],nativeResolutions:['1K','2K','4K'],generationParameters:{ratios:['1:1','16:9','9:16'],resolutions:['1K','2K','4K']}},{id:'image-b',label:'图像模型 B',modality:'image',supportsEdit:true,qualities:['medium'],nativeResolutions:['1K','2K'],generationParameters:{ratios:['1:1','3:4'],resolutions:['1K','2K']}}];
const videos=[{modelId:'video-a',providerId:'managed-video',label:'视频模型 A',isDefault:true,definition:{sources:{},modes:['text'],aspectRatios:['16:9','9:16'],durationResolutionMap:[{durations:[5,10],resolutions:['720p','1080p']}]}}];
const media=fs.readFileSync('public/demos/workbench-v2/suite-coffee-scene.webp');
const receipt={tier:'Actual Next UI + real SSE + fixture APIs; no paid supplier',checks:[],errors:[],submitted:[],shots:[]};
const check=(name,value)=>{assert.ok(value,name);receipt.checks.push(name);console.log('PASS '+name);};
let browser,server,context,page,finish;const history=[],steps=[];
async function closeContext(c){await c.unrouteAll({behavior:'wait'});await c.close();}
async function run(){
 server=http.createServer(async(req,res)=>{
  if(req.method!=='PUT'){res.writeHead(200,{'content-type':'application/json'});res.end('{"running":false,"total":0,"events":[]}');return;}
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw),turn=receipt.submitted.length+1;receipt.submitted.push({body,model:req.headers['x-naumi-text-model']});
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  const event=(type,data)=>{const row={type,turnId:'turn-'+turn,...data};steps.push(row);emit(type,row);};
  emit('open',{sessionId:'ag-controls'});
  event('turn_settings',{settings:body.creationSettings,modelId:req.headers['x-naumi-text-model'],userIndex:turn-1});
  event('image_skill',{id:'product',name:'创意设计'});
  event('tool_start',{id:'call-'+turn,tool:'recolor_product',details:{parameters:[{name:'color',value:'#C8102E'},{name:'ratio',value:body.creationSettings?.image?.ratio||'1:1'}]}});
  event('harness',{summary:'internal event must not render'});
  event('tool_start',{id:'call-'+turn,tool:'recolor_product',summary:'图片生成中',progress:{completed:0,total:1}});
  finish=()=>{
    event('tool_end',{id:'call-'+turn,tool:'recolor_product',summary:'已生成 1 张图片',outputs:['/media/creation-result.webp']});
    const reply=`**换色完成**\n\n![商品图](/media/creation-result.webp)\n\n已保留产品结构与包装文字。`;
    event('assistant',{text:reply});emit('final',{reply});history.push({role:'user',content:body.message},{role:'assistant',content:reply});res.end();finish=null;
  };
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const sse='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(25000);page.setDefaultNavigationTimeout(120000);
 page.on('pageerror',e=>receipt.errors.push(e.stack||String(e)));
 await context.route('**/media/creation-result.webp',r=>r.fulfill({contentType:'image/webp',body:media}));
 await context.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname;const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(p==='/api/config'){const data=await (await route.fetch()).json();return json({...data,db:true,multiUser:true});}
  if(p==='/api/auth/session')return json({user});
  if(p==='/api/feature-access')return json({email:user.email,policy:DEFAULT_POLICY});
  if(p==='/api/account')return json({persisted:true,user,artworks:[],stats:{total:0,today:0}});
  if(p==='/api/enterprise')return json({enterprises:[]});
  if(p==='/api/canvas/projects')return json({persisted:true,projects:[]});
  if(p==='/api/text-models')return json({defaultModel:'chat-a',models:['chat-a','chat-b']});
  if(p==='/api/models')return json({managed:true,feature:url.searchParams.get('feature'),defaultModelId:url.searchParams.get('feature')==='image.generate'?'image-a':'chat-a',models:url.searchParams.get('feature')==='image.generate'?imageModels:[{id:'chat-a',label:'对话模型 A',modality:'text'},{id:'chat-b',label:'对话模型 B',modality:'text'}]});
  if(p==='/api/video/catalog')return json({models:videos});
  if(p==='/api/agent/session')return url.searchParams.has('id')?json({session:{id:'ag-controls',title:'多轮创作',messages:history,steps}}):json({sessions:history.length?[{id:'ag-controls',title:'多轮创作',messageCount:history.length}]:[]});
  if(p==='/api/agent')return req.method()==='PUT'?route.continue({url:sse+'/api/agent'}):json({running:false,total:steps.length,events:[]});
  if(p==='/api/media/image-cache'||p==='/api/public-image-cache'){const sources=req.postDataJSON().sources,account=p==='/api/public-image-cache'?'public':user.email;return json({account,results:Object.fromEntries(sources.map(source=>[source,{account,source,version:'test-v1',fetchUrl:source,bytes:media.length,contentType:'image/webp'}]))});}
  if(p==='/api/templates')return json({templates:[],total:0,page:1,pageSize:24});
  if(p==='/api/templates/categories')return json({categories:[]});
  if(p==='/api/favorites')return json({favs:[],authed:true});
  if(p==='/api/billing/catalog')return route.continue();
  if(p==='/api/collaboration/bootstrap')return json({teams:[],invitations:[]});
  return json({});
 });
 const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});receipt.shots.push(name+'.png');};
 await page.goto(origin);await page.getByRole('button',{name:'创作设置',exact:true}).click();let panel=page.getByRole('dialog',{name:'本轮创作设置'});
 await panel.getByRole('button',{name:'图像模型 A',exact:true}).click();await panel.getByRole('button',{name:'比例 16:9',exact:true}).click();await panel.getByRole('button',{name:'清晰度 2K',exact:true}).click();await panel.getByRole('button',{name:'质量 高质量',exact:true}).click();
 await shot('settings-image-light');
 await panel.getByRole('button',{name:'视频',exact:true}).click();await panel.getByRole('button',{name:'视频模型 A',exact:true}).click();await panel.getByRole('button',{name:'时长 5 秒',exact:true}).click();await panel.getByRole('button',{name:'清晰度 720p',exact:true}).click();await panel.getByRole('button',{name:'比例 9:16',exact:true}).click();await shot('settings-video-light');
 await page.getByRole('button',{name:'关闭创作设置'}).click();
 await page.getByRole('textbox',{name:'创作描述',exact:true}).fill('把商品换成红色');await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.getByTestId('creation-activity').waitFor();
 await page.locator('[data-tool-call="call-1"]').waitFor();
 check('first-turn-settings-sent',receipt.submitted[0].body.creationSettings.image.modelId==='image-a'&&receipt.submitted[0].body.creationSettings.image.ratio==='16:9'&&receipt.submitted[0].body.creationSettings.video.modelId==='video-a');
 check('agent-model-separate',receipt.submitted[0].model==='chat-a');
 check('one-row-for-repeated-progress',await page.locator('[data-tool-call="call-1"]').count()===1);
 check('real-count-no-fabricated-percentage',await page.getByText('0/1 图片生成中…',{exact:true}).count()===1&&!await page.getByText('11%',{exact:true}).count());
 await shot('tool-progress-light');await page.getByRole('button',{name:'切换为深色主题'}).click();await shot('tool-progress-dark');
 await page.getByRole('button',{name:'创作设置',exact:true}).click();panel=page.getByRole('dialog',{name:'本轮创作设置'});await panel.getByRole('button',{name:'图像模型 B',exact:true}).click();await panel.getByRole('button',{name:'比例 3:4',exact:true}).click();await shot('settings-image-dark');await page.getByRole('button',{name:'关闭创作设置'}).click();
 check('changing-next-turn-does-not-resubmit',receipt.submitted.length===1&&receipt.submitted[0].body.creationSettings.image.modelId==='image-a');finish();
 await page.getByRole('button',{name:'重新生成',exact:true}).waitFor();
 check('markdown-rendered-not-literal-stars',await page.locator('strong').filter({hasText:'换色完成'}).count()===1);
 check('no-automatic-review-or-internal-spam',!/(verify_image_output|视觉检查|工具执行完成|internal event)/.test(await page.locator('main').innerText()));
 await page.getByRole('button',{name:'切换为浅色主题'}).click();await shot('tool-completed-light');
 await page.getByRole('textbox',{name:'创作描述',exact:true}).fill('再做一个版本');await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('[data-tool-call="call-2"]').waitFor();
 check('second-turn-has-own-settings',receipt.submitted[1].body.creationSettings.image.modelId==='image-b'&&receipt.submitted[1].body.creationSettings.image.ratio==='3:4');finish();
 await page.getByRole('button',{name:'重新生成',exact:true}).nth(1).waitFor();await page.getByRole('button',{name:'重新生成',exact:true}).first().click();await page.locator('[data-tool-call="call-3"]').waitFor();
 check('regenerate-first-turn-uses-original-settings',receipt.submitted[2].body.creationSettings.image.modelId==='image-a'&&receipt.submitted[2].body.creationSettings.image.ratio==='16:9');finish();await page.getByRole('button',{name:'重新生成',exact:true}).nth(2).waitFor();
 await page.getByRole('button',{name:'多轮创作',exact:true}).click();await page.getByRole('button',{name:'重新生成',exact:true}).nth(2).waitFor();
 check('history-retains-three-distinct-tool-rows',await page.locator('[data-tool-call^="call-"]').count()===3);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'创作设置',exact:true}).click();panel=page.getByRole('dialog',{name:'本轮创作设置'});await panel.getByRole('button',{name:'图像模型 A',exact:true}).waitFor();await shot('settings-mobile');
 check('mobile-panel-inside-viewport',await panel.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0;}));
 check('no-runtime-or-hydration-errors',receipt.errors.length===0);
 await closeContext(context);console.log('AGENT_CREATION_BROWSER_PASS checks='+receipt.checks.length+' errors=0 paid_calls=0');
}
run().catch(async error=>{if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});receipt.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(receipt,null,2));if(browser){for(const c of browser.contexts())await c.unrouteAll({behavior:'wait'});await browser.close();}finish?.();server?.close();});
