import assert from "node:assert/strict";
import {mkdir,readFile} from "node:fs/promises";
import {chromium, expect} from "@playwright/test";
const origin=process.env.CANVAS_POPOVER_URL||"http://127.0.0.1:54990",out="output/canvas-dock-menu-20261009";
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:"msedge",headless:true});
let paid=0;
try{
 for(const theme of ["light","dark"]){
  const context=await browser.newContext({viewport:{width:1920,height:911}});
  if(process.env.MODEL_MANAGEMENT_BROWSER_COOKIE_FILE) await context.addCookies([JSON.parse(await readFile(process.env.MODEL_MANAGEMENT_BROWSER_COOKIE_FILE,"utf8"))]);
  const email="popover-fixture@local.test",id="popover-image",key="tree:"+id,now=new Date().toISOString();
  const user={name:"Popover fixture",email,plan:"starter",creditsTotal:20,creditsUsed:0,joinedAt:now,renewsAt:now,invoices:[]};
  await context.addInitScript(({email,user,key,theme})=>{localStorage.setItem("naumi:user:"+email,JSON.stringify(user));localStorage.setItem("naumi:last-email",email);localStorage.setItem("nv:canvas:bg",theme);localStorage.setItem("nv:canvas:last",key);},{email,user,key,theme});
  await context.addCookies([{name:"naumi_locale",value:"zh",url:origin}]);
  await context.route("**/api/**",async route=>{
   const r=route.request(),p=new URL(r.url()).pathname;
   if(r.method()==="POST" && /generate|image-tasks|expand|annotate|text-edit/.test(p)){paid++;await route.fulfill({status:409,json:{error:"Paid submissions forbidden in fixture"}});return;}
   if(r.method()!=="GET"){await route.fulfill({json:{ok:true,persisted:true}});return;}
   if(p==="/api/config"){await route.fulfill({json:{db:true,authMode:"mock",multiUser:false,openai:true,defaultImageModel:"gpt-image-2",imageModels:[{id:"gpt-image-2",label:"gpt-image-2",supportsEdit:true,provider:"managed"}]}});return;}
   if(p==="/api/account"){await route.fulfill({json:{persisted:true,user,artworks:[{id,email,title:"产品.jpg",category:"main",prompt:"保留产品主体，调整场景。".repeat(70),status:"completed",image:origin+"/cutout-hero.jpg",gradient:"from-slate-100 to-slate-200",source:"canvas-add",origin:"canvas",parentId:null,parentIds:[],groupId:id,canvasGroupId:null,width:3072,height:1426,canvasWidth:420,canvasHeight:195,canvasX:100,canvasY:200,createdAt:now}]}});return;}
   if(p==="/api/projects"){await route.fulfill({json:{names:{[key]:"产品.jpg"}}});return;}
   if(p==="/api/canvas/text-nodes"){await route.fulfill({json:{persisted:true,nodes:[]}});return;}
   if(p==="/api/video/tasks"){await route.fulfill({json:{tasks:[]}});return;}
   await route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(origin+"/canvas");await page.locator('.react-flow__node[data-id="'+id+'"]').click({force:true});
  const dock=page.getByTestId("image-node-dock");await expect(dock).toBeVisible({timeout:30000});
  await dock.locator("textarea").fill("请保留产品主体，调整灯光与背景。\n".repeat(60));
  const trigger=()=>dock.getByRole("button").filter({hasText:/📐/});
  for(const viewport of [{width:1920,height:911},{width:1093,height:614},{width:1024,height:360},{width:390,height:400},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(200);
   const composer=await dock.boundingBox(),toolbar=await page.getByTestId("image-node-toolbar").boundingBox();
   assert.ok(composer.y+composer.height+10<=toolbar.y || toolbar.y+toolbar.height+10<=composer.y,JSON.stringify({composer,toolbar,viewport}));
   await trigger().click({force:true});const panel=page.getByTestId("canvas-generation-parameters");await expect(panel).toBeVisible();
   const measure=()=>panel.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,height:r.height,scroll:el.scrollTop,total:el.scrollHeight,client:el.clientHeight}});
   let bounds=await measure();assert.ok(bounds.top>=7&&bounds.bottom<=viewport.height-7&&bounds.left>=7&&bounds.right<=viewport.width-7,JSON.stringify({theme,viewport,bounds}));
   const transform=await page.locator(".react-flow__viewport").getAttribute("style");
   if(bounds.total>bounds.client+1){await page.mouse.move((bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2);await page.mouse.wheel(0,900);await page.waitForTimeout(160);const scrolled=await measure();assert.ok(scrolled.scroll>0,JSON.stringify(scrolled));assert.equal(await page.locator(".react-flow__viewport").getAttribute("style"),transform,"scrolling options cannot zoom the canvas");}
   await panel.getByRole("button",{name:"16:9",exact:true}).click();await panel.getByRole("button",{name:"4K",exact:true}).click();
   await page.screenshot({path:out+"/"+theme+"-"+viewport.width+"x"+viewport.height+".png",fullPage:true});
   await page.keyboard.press("Escape");await expect(panel).toHaveCount(0);await expect(trigger()).toContainText("16:9");await expect(trigger()).toContainText("4K");
   console.log(JSON.stringify({theme,viewport,top:bounds.top,height:bounds.height,scrollable:bounds.total>bounds.client+1}));
  }
  await page.setViewportSize({width:1093,height:614});await trigger().click({force:true});await page.setViewportSize({width:390,height:320});await page.waitForTimeout(200);
  const resize=await page.getByTestId("canvas-generation-parameters").boundingBox();assert.ok(resize.y>=7&&resize.y+resize.height<=313&&resize.x>=7&&resize.x+resize.width<=383);
  assert.equal(errors.length,0,errors.join("\n"));await context.close();
 }
 assert.equal(paid,0);console.log("CANVAS_PARAMETER_BROWSER=PASS THEMES=2 VIEWPORTS=5 OPEN_RESIZE=PASS WHEEL=PASS BOTTOM_OPTIONS=PASS PAID_SUBMISSIONS=0");
}finally{await browser.close()}
