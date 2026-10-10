import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
async function main(){
 if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1')throw Error('Requires isolated fixture');
 const origin='http://127.0.0.1:54989',out='output/canvas-scope-fix-20261009';await mkdir(out,{recursive:true});
 const fixture=JSON.parse(await readFile('output/model-management-fixture/fixture.json','utf8'));
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}});
 let blocked=0;const errors:string[]=[];
 try{
  assert.equal((await context.request.post(origin+'/api/admin/login',{data:{password:'MvpFixture2026!'}})).status(),200);
  await context.addCookies([{name:'nv_user',value:fixture.memberCookie,domain:'127.0.0.1',path:'/'},{name:'naumi_locale',value:'zh',url:origin}]);
  const before=await(await context.request.get(origin+'/api/admin/bi/model-config')).json();
  const admin=await context.newPage();admin.setDefaultTimeout(45000);expect.configure({timeout:45000});await admin.goto(origin+'/admin/model-management');
  const row=admin.locator('article').filter({has:admin.getByRole('heading',{name:'gemini-3.0-pro-image',exact:true})});
  const names=['画布生图','画布扩图','画布改字','画布标注'],features=['canvas.image','canvas.expand','canvas.text-edit','canvas.annotate'];
  const save=async(selected:string[]|'group')=>{const version=(await(await context.request.get(origin+'/api/admin/model-management')).json()).version;await row.getByRole('button',{name:'编辑范围',exact:true}).click();const dialog=admin.getByRole('dialog',{name:'选择应用工具',exact:true});await dialog.getByRole('button',{name:'清空选择',exact:true}).click();await dialog.getByRole('checkbox',{name:'自由生图',exact:true}).check();if(selected==='group')await dialog.getByRole('checkbox',{name:'画布',exact:true}).check();else for(const name of selected)await dialog.getByRole('checkbox',{name,exact:true}).check();await dialog.getByRole('button',{name:'保存范围并生效',exact:true}).click();await expect(dialog).toHaveCount(0);await expect.poll(async()=>(await(await context.request.get(origin+'/api/admin/model-management')).json()).version).toBeGreaterThan(version);await expect(admin.getByText('模型配置 v'+(await(await context.request.get(origin+'/api/admin/model-management')).json()).version,{exact:true})).toBeVisible();};
  await save([]);
  const id='scope-test-image',email='mvp-member@example.test',key='tree:'+id,now=new Date().toISOString();const user={name:'范围验收',email,plan:'starter',creditsTotal:500,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[]};
  await context.addInitScript(({email,key,user})=>{localStorage.setItem('naumi:user:'+email,JSON.stringify(user));localStorage.setItem('naumi:last-email',email);localStorage.setItem('nv:canvas:last',key);localStorage.setItem('nv:canvas:bg','light');localStorage.setItem('naumi:canvas-image-model','gemini-3.0-pro-image-square');},{email,key,user});
  const canvas=await context.newPage();canvas.setDefaultTimeout(45000);canvas.on('pageerror',e=>errors.push(e.message));
  await canvas.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
   if(req.method()!=='GET'){
    if(path==='/api/billing/quote')return route.continue();
    if(/generate-image|image-tasks|expand|text-edit|annotate/.test(path)){blocked++;return route.fulfill({status:409,json:{error:'禁止收费生成的浏览器验收'}});}
    return route.fulfill({json:{ok:true,persisted:true}});
   }
   if(path==='/api/account')return route.fulfill({json:{persisted:true,user,artworks:[{id,email,title:'范围验收.jpg',category:'main',prompt:'保留主体',status:'completed',image:origin+'/cutout-hero.jpg',gradient:'from-slate-100 to-slate-200',source:'canvas-add',origin:'canvas',parentId:null,parentIds:[],groupId:id,canvasGroupId:null,width:1024,height:1024,canvasWidth:320,canvasHeight:320,canvasX:100,canvasY:200,createdAt:now}]}});
   if(path==='/api/download')return route.fulfill({response:await context.request.get(origin+'/cutout-hero.jpg')});
   if(path==='/api/projects')return route.fulfill({json:{names:{[key]:'范围验收.jpg'}}});if(path==='/api/canvas/text-nodes')return route.fulfill({json:{persisted:true,nodes:[]}});if(path==='/api/video/tasks')return route.fulfill({json:{tasks:[]}});return route.continue();
  });
  await canvas.goto(origin+'/canvas');await canvas.locator('.react-flow__node[data-id="'+id+'"]').click({force:true});const dock=canvas.getByTestId('image-node-dock');await expect(dock).toBeVisible();const model=dock.getByTestId('canvas-generation-model');await expect(model).toHaveText('灵动图片');await expect(model.locator('..')).toBeDisabled();
  await save('group');await canvas.evaluate(()=>window.dispatchEvent(new Event('focus')));
  const family='gemini-3.0-pro-image';
  for(const feature of features){const c=await(await context.request.get(origin+'/api/models?feature='+feature)).json();assert.equal(c.selectionMode,'user');assert.ok(c.models.some((m:any)=>m.id.startsWith(family)));assert.ok(c.models.some((m:any)=>m.id==='image-a'));}
  await expect(model.locator('..')).toBeEnabled();await model.locator('..').click();await expect(canvas.getByTestId('canvas-select-options').getByRole('button',{name:family,exact:true})).toBeVisible();await canvas.getByTestId('canvas-select-options').getByRole('button',{name:family,exact:true}).click();await expect(model).toHaveText(family);
  await canvas.reload();await canvas.locator('.react-flow__node[data-id="'+id+'"]').click({force:true});await expect(model).toHaveText(family);
  await canvas.getByTestId('image-node-toolbar').getByRole('button',{name:'扩展画面',exact:true}).click();await expect(canvas.getByRole('combobox',{name:'canvas.expand 模型',exact:true})).toHaveValue(/gemini-3.0-pro-image-/);await canvas.mouse.click(4,200);
  const move=async()=>{await admin.getByRole('button',{name:'调整排序',exact:true}).click();const order=admin.getByRole('dialog',{name:'调整模型排序',exact:true});await order.getByRole('button',{name:'上移 '+family,exact:true}).click();await order.getByRole('button',{name:'上移 '+family,exact:true}).click();await order.getByRole('button',{name:'保存排序并生效',exact:true}).click();await expect(order).toHaveCount(0);await expect.poll(async()=>(await(await context.request.get(origin+'/api/admin/model-management')).json()).rows[0].id).toBe(family);};
  await move();await canvas.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await model.locator('..').click();await expect(canvas.getByTestId('canvas-select-options').getByRole('button').first()).toContainText(family);await canvas.mouse.click(4,200);await expect(model).toHaveText(family);
  await admin.reload();await expect(admin.locator('article[data-testid^="managed-model-"]').first()).toHaveAttribute('data-testid','managed-model-'+family);
  const ordinary=await(await context.request.get(origin+'/api/models?feature=image.generate')).json();assert.ok(ordinary.models.some((m:any)=>m.id.startsWith('gemini-3.0-pro-image-')));
  const submitResponse=canvas.waitForResponse(r=>r.url().endsWith('/api/generate-image')&&r.request().method()==='POST');const submit=canvas.waitForRequest(r=>r.url().endsWith('/api/generate-image')&&r.method()==='POST');const quote=canvas.waitForRequest(r=>r.url().endsWith('/api/billing/quote')&&r.method()==='POST');await dock.locator('textarea').fill('范围验收，禁止真实调用');await dock.locator('button.canvas-ui-primary').click();assert.equal((await quote).postDataJSON().feature,'canvas.image');assert.ok((await submit).headers()['x-naumi-feature-model'].startsWith(family));assert.equal((await submitResponse).status(),409);assert.equal(blocked,1);
  await save([]);await canvas.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(model).toHaveText('灵动图片');const removed=await(await context.request.get(origin+'/api/models?feature=canvas.image')).json();assert.ok(!removed.models.some((m:any)=>m.id.startsWith(family)));assert.equal((await(await context.request.get(origin+'/api/admin/model-management')).json()).rows[0].id,family);await canvas.screenshot({path:out+'/canvas-scope.png'});await canvas.setViewportSize({width:390,height:844});await expect(model).toHaveText('灵动图片');assert.ok(await canvas.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const after=await(await context.request.get(origin+'/api/admin/bi/model-config')).json();assert.deepEqual(after.draft,before.draft);assert.deepEqual(after.billingSnapshot,before.billingSnapshot);assert.deepEqual(after.snapshot.config.upstreamModels,before.snapshot.config.upstreamModels);assert.equal(errors.length,0,errors.join('\n'));const stats=await(await context.request.get(fixture.control+'/stats')).json();assert.equal(stats.paid,0);
  console.log('CANVAS_SCOPE_UI=PASS CANVAS_GROUP_SELECTION=PASS ALL_ALLOWED_MODELS=PASS SELECT_AND_RELOAD=PASS SHARED_IMAGE_POOL_EXPAND=PASS NATIVE_ORDER_SAVE=PASS ORDER_RELOAD_AND_SCOPE_PRESERVED=PASS REMOVED_SELECTION_FALLBACK=PASS FOCUS_REFRESH=PASS CANVAS_QUOTE=PASS NORMAL_GENERATION_PRESERVED=PASS MOBILE=PASS DRAFT_PRICES_TARGETS_PRESERVED=PASS REAL_PAID_GENERATION=0');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
