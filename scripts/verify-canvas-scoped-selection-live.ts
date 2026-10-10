import assert from "node:assert/strict";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {chromium,expect as baseExpect} from "@playwright/test";
import {compactImageModelOptions,imageModelDisplayId} from "../src/lib/image-model-routing";

async function main(){
 if(!process.env.MVP_BROWSER_COOKIE_FILE)throw Error("Protected staging session required");
 const origin="http://120.27.162.85",out="output/canvas-scoped-selection-20261010/live";await mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:process.platform==="win32"?"msedge":undefined,headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),expect=baseExpect.configure({timeout:30000});
 const get=async(path:string)=>{const r=await context.request.get(origin+path);assert.equal(r.status(),200);return r.json();};
 const errors:string[]=[];let blocked=0;
 try{
  await context.addCookies(JSON.parse(await readFile(process.env.MVP_BROWSER_COOKIE_FILE,"utf8")));await context.addCookies([{name:"naumi_locale",value:"zh",url:origin}]);
  const before=await get("/api/admin/bi/model-config"),mvp=await get("/api/admin/mvp"),email=(await get("/api/auth/session")).user.email;
  const catalogs=new Map<string,any>();for(const feature of ["canvas.image","canvas.expand","canvas.text-edit","canvas.annotate"]){const c=await get("/api/models?feature="+feature);assert.equal(c.selectionMode,"user");assert.deepEqual([...new Set(c.models.map((m:any)=>imageModelDisplayId(m.id)))],mvp.rows.filter((r:any)=>r.features.some((f:any)=>f.id===feature)).map((r:any)=>r.id));catalogs.set(feature,c);}
  const admin=await context.newPage();await admin.goto(origin+"/admin/mvp");await admin.getByRole("button",{name:"调整排序",exact:true}).click();const order=admin.getByRole("dialog",{name:"调整模型排序",exact:true});await expect(order.locator("li")).toHaveCount(mvp.rows.length);await order.locator("li").first().getByRole("button",{name:/下移/}).click();await expect(order.getByRole("button",{name:"保存排序并生效",exact:true})).toBeEnabled();await order.getByRole("button",{name:"取消",exact:true}).click();
  const now=new Date().toISOString(),id="scoped-ui-live",user={name:"范围验收",email,plan:"starter",creditsTotal:10000,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[]};
  await context.addInitScript(({email,user,id})=>{localStorage.setItem("naumi:last-email",email);localStorage.setItem("naumi:user:"+email,JSON.stringify(user));localStorage.setItem("nv:canvas:last","tree:"+id);localStorage.setItem("nv:canvas:bg","light");},{email,user,id});
  const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));await page.route("**/api/**",async route=>{const req=route.request(),path=new URL(req.url()).pathname;
   if(req.method()!=="GET"){if(path==="/api/billing/quote")return route.continue();if(/generate|image-tasks|expand|annotate|text-edit|ocr/.test(path)){blocked++;return route.fulfill({status:409,json:{error:"Live acceptance forbids supplier calls"}});}return route.fulfill({json:{ok:true,persisted:true}});}
   if(path==="/api/account")return route.fulfill({json:{persisted:true,user,artworks:[{id,email,title:"模型范围验收",category:"main",prompt:"",status:"completed",image:origin+"/cutout-hero.jpg",gradient:"",origin:"canvas",parentId:null,parentIds:[],groupId:id,width:640,height:480,canvasWidth:320,canvasHeight:240,canvasX:100,canvasY:100,createdAt:now}]}});
   if(path==="/api/canvas/text-nodes")return route.fulfill({json:{persisted:true,nodes:[]}});if(path==="/api/projects")return route.fulfill({json:{names:{["tree:"+id]:"模型范围验收"}}});if(path==="/api/video/tasks")return route.fulfill({json:{tasks:[]}});return route.continue();
  });
  const catalog=catalogs.get("canvas.image"),models=compactImageModelOptions(catalog.models,[catalog.defaultModelId]);assert.ok(models.length>1,"Live user scope must expose multiple image families");
  await page.goto(origin+"/canvas");await page.locator(`.react-flow__node[data-id="${id}"]`).click({force:true});const dock=page.getByTestId("image-node-dock"),model=dock.getByTestId("canvas-generation-model");await expect(model.locator("..")).toBeEnabled();await model.locator("..").click();const menu=page.getByTestId("canvas-select-options");await expect(menu.getByRole("button")).toHaveCount(models.length);assert.deepEqual(await menu.getByRole("button").allTextContents(),models.map(m=>m.label));const chosen=models.find(m=>imageModelDisplayId(m.id)!==imageModelDisplayId(catalog.defaultModelId))!;await menu.getByRole("button",{name:chosen.label!,exact:true}).click();await expect(model).toHaveText(chosen.label!);
  await page.reload();await page.locator(`.react-flow__node[data-id="${id}"]`).click({force:true});await expect(model).toHaveText(chosen.label!);
  const q=await context.request.post(origin+"/api/billing/quote",{data:{feature:"canvas.image",modelId:chosen.id,quality:"medium",resolution:"1K",ratio:"1:1",quantity:1}});assert.equal(q.status(),200);assert.equal(imageModelDisplayId((await q.json()).modelId),imageModelDisplayId(chosen.id));
  await page.getByTestId("image-node-toolbar").getByRole("button",{name:"扩展画面",exact:true}).click();const expand=page.getByRole("combobox",{name:"canvas.expand 模型",exact:true});await expect(expand).toBeVisible();assert.deepEqual(await expand.locator("option").evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value)),compactImageModelOptions(catalogs.get("canvas.expand").models,[catalogs.get("canvas.expand").defaultModelId]).map(m=>m.id));
  await page.screenshot({path:out+"/desktop.png"});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+"/mobile.png"});
  assert.deepEqual(await get("/api/admin/bi/model-config"),before);assert.equal(errors.length,0);assert.equal(blocked,0);
  await writeFile(out+"/result.json",JSON.stringify({pass:true,modelVersion:mvp.version,models:models.map(m=>m.id),scopes:[...catalogs].map(([feature,c])=>({feature,count:c.models.length})),quoteSelection:true,configUnchanged:true,paidCalls:0},null,2));
  console.log(`LIVE_SCOPED_MODELS=PASS FAMILIES=${models.length} ORDER=PASS PICK_RELOAD=PASS QUOTE_SELECTED_MODEL=PASS EXPAND_PICKER=PASS SORT_DIALOG=PASS MOBILE=PASS CONFIG_UNCHANGED=1 PAID_CALLS=0`);
 }catch(e){await writeFile(out+"/failure.txt",e instanceof Error?e.message:String(e));throw e;}finally{await browser.close();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
