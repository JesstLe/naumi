// Isolated PostgreSQL + real Next routes + a deterministic model fixture + Chrome.
// Does not read production credentials or touch the running local/remote database.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import pg from "pg";
import { chromium, request as playwrightRequest } from "@playwright/test";

const root = process.cwd();
const output = path.resolve("output/competitor-implementation");
await mkdir(output, { recursive: true });
const container = `naumi-competitor-test-${Date.now()}`;
const password = randomUUID();
const report = [];
const pass = (name) => { report.push(name); console.log(`PASS ${name}`); };
let app, browser, pool, fixture, testPage;
const handles = [];
const appLog = [];
const calls = [];
const png = await sharp({ create: { width: 320, height: 240, channels: 4, background: "#d2c7aa" } }).composite([
  { input: await sharp({ create: { width: 100, height: 80, channels: 4, background: "#a13838" } }).png().toBuffer(), left: 20, top: 20 },
]).png().toBuffer();
const blue = await sharp({ create: { width: 320, height: 240, channels: 4, background: "#164ac9" } }).png().toBuffer();
const sleep = ms => new Promise(r => setTimeout(r,ms));
async function port() { const s=createServer(); await new Promise(r=>s.listen(0,"127.0.0.1",r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
const appPort = await port();
const base = `http://127.0.0.1:${appPort}`;
const real = process.argv.includes("--real");
let localEnv = {};
if (real) {
  const envText = await readFile(".env","utf8");
  for (const line of envText.split(/\r?\n/)) { const m=line.match(/^([A-Z_]+)=(.*)$/); if(m) localEnv[m[1]]=m[2].replace(/^["']|["']$/g,""); }
}
try {
  execFileSync("docker", ["run","-d","--name",container,"-e","POSTGRES_USER=fixture","-e",`POSTGRES_PASSWORD=${password}`,"-e","POSTGRES_DB=fixture","-p","127.0.0.1::5432","--tmpfs","/var/lib/postgresql/data","postgres:16-alpine"],{stdio:"pipe"});
  const mapping=execFileSync("docker",["port",container,"5432"],{encoding:"utf8"}).trim();
  const database=`postgres://fixture:${password}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool=new pg.Pool({connectionString:database});
  for(let i=0;i<50;i++){try{await pool.query("select 1");break;}catch{await sleep(300);}}
  fixture=createServer(async(req,res)=>{
    try {
      const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
      res.setHeader("Content-Type","application/json");
      if(req.url==="/v1/chat/completions") {
        calls.push({type:"vision",body:JSON.parse(body)});
        return res.end(JSON.stringify({ choices:[{message:{content:JSON.stringify({prompt:"米白背景的产品展示图，红色产品位于左上，右侧保留文字排版空间，柔和侧光，材质细腻。",regions:[{label:"产品",kind:"product",x:.05,y:.05,width:.35,height:.4,color:"#a13838",instruction:"替换产品款式，保留布光"},{label:"文字区",kind:"text",x:.65,y:.15,width:.2,height:.3,color:"#222222",instruction:"替换为新的标题"}]})}}] }));
      }
      if(req.url==="/v1/images/edits") {
        const request=new Request("http://fixture/",{method:"POST",headers:{"content-type":req.headers["content-type"]},body});
        const fd=await request.formData();
        const prompt=String(fd.get("prompt"));
        const images=[...fd.entries()].filter(([k])=>k==="image"||k.startsWith("image["));
        calls.push({type:"edit",prompt,images:images.length,mask:!!fd.get("mask")});
        await sleep(650);
        if(prompt.includes("FORCE_FAIL")){res.statusCode=502;return res.end(JSON.stringify({error:{message:"fixture failure"}}));}
        return res.end(JSON.stringify({data:[{b64_json:blue.toString("base64")}] }));
      }
      res.statusCode=404;res.end("{}");
    }catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}
  });
  await new Promise(r=>fixture.listen(0,"127.0.0.1",r));
  const provider=`http://127.0.0.1:${fixture.address().port}/v1`;
  const media=path.join(output,real?"real-media":"test-media");
  const env={...process.env,DATABASE_URL:database,SETTINGS_SECRET:randomUUID(),NAUMI_EDITION:"cloud",NAUMI_MULTI_USER:"1",NAUMI_PUBLIC_COMMERCE:"0",MEDIA_DIR:media,STORAGE_DRIVER:"local",NEXT_PUBLIC_SUPABASE_URL:"",NEXT_PUBLIC_SUPABASE_ANON_KEY:"",SMTP_HOST:"",
    OPENAI_API_KEY:real?localEnv.OPENAI_API_KEY:"fixture-key",OPENAI_BASE_URL:real?localEnv.OPENAI_BASE_URL:provider,AGENT_API_KEY:real?localEnv.AGENT_API_KEY:"fixture-key",AGENT_BASE_URL:real?localEnv.AGENT_BASE_URL:provider,AGENT_VISION_MODEL:real?localEnv.AGENT_VISION_MODEL:"fixture-vision",NEXT_TELEMETRY_DISABLED:"1"};
  app=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","-p",String(appPort)],{cwd:root,env,stdio:["ignore","pipe","pipe"]});
  app.stdout.on("data",x=>appLog.push(x.toString()));app.stderr.on("data",x=>appLog.push(x.toString()));
  let ready=false;
  for(let i=0;i<100;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){ready=true;break;}}catch{}await sleep(500);}
  assert(ready,"Next server ready");
  const api=await playwrightRequest.newContext({baseURL:base,timeout:300000});handles.push(api);
  const other=await playwrightRequest.newContext({baseURL:base});handles.push(other);
  assert.equal((await api.get("/api/competitors")).status(),401);
  const email="competitor-smoke@local.test";
  for(const [client,mail] of [[api,email],[other,"competitor-other@local.test"]]) {
    const r=await client.post("/api/auth/register",{data:{email:mail,password,name:"竞品验收"}});assert.equal(r.status(),200,await r.text());
  }
  pass("authentication and isolated native accounts");
  const batch=randomUUID();
  async function upload(client,relative="品牌A/主图/01.png",body=png,batchId=batch){
    return client.post("/api/competitors",{multipart:{batchId,path:relative,image:{name:"sample.png",mimeType:"image/png",buffer:body}}});
  }
  let r=await upload(api);assert.equal(r.status(),200,await r.text());let item=(await r.json()).item;
  r=await upload(api);assert.equal((await r.json()).item.id,item.id);
  assert.equal((await upload(api,"../outside.png")).status(),400);
  assert.equal((await upload(api,"bad.png",Buffer.from("not an image"))).status(),400);
  const second=(await (await upload(api,"品牌A/详情/02.png")).json()).item;
  assert.equal((await (await api.get("/api/competitors")).json()).items.length,2);
  pass("nested folder paths, import idempotence, invalid image/path rejection");
  for(const [verb,url] of [["get",`/api/competitors/${item.id}`],["delete",`/api/competitors/${item.id}`],["get",`/api/competitors/${item.id}/image`]])assert.equal((await other[verb](url)).status(),404);
  assert.equal((await other.post(`/api/competitors/${item.id}/action`,{data:{revision:0,prompt:"test",regions:[],activeVersion:"",action:"analyze"}})).status(),404);
  pass("cross-account list, read, download, delete and model-action isolation");
  const draft=i=>({revision:i.revision,prompt:i.prompt,regions:i.regions,activeVersion:i.activeVersion});
  const get=async(id=item.id)=>(await (await api.get(`/api/competitors/${id}`)).json()).item;
  async function act(i,action,extra={}){return api.post(`/api/competitors/${i.id}/action`,{data:{...draft(i),action,...extra}});}
  if(real) {
    const sample=await readFile("public/demos/suite-before.webp");
    r=await upload(api,"真实模型/产品参考.webp",sample,randomUUID());assert.equal(r.status(),200,await r.text());item=(await r.json()).item;
  }
  r=await act(item,"analyze");assert.equal(r.status(),200,await r.text());item=(await r.json()).item;
  assert(item.prompt.length>10);assert(item.regions.length>0);assert(item.regions.every(x=>!x.enabled));
  await writeFile(path.join(output,real?"REAL_ANALYSIS.json":"FIXTURE_ANALYSIS.json"),JSON.stringify({prompt:item.prompt,regions:item.regions},null,2));
  pass(real?"real vision analysis returned editable prompt and typed suggested regions":"vision analysis, typed suggested regions, disabled-by-default review");
  item.regions=[{id:"color-a",label:"产品换色",kind:"color",x:.1,y:.15,width:.22,height:.25,instruction:"保留产品形状与纹理",color:"#164ac9",enabled:true},{id:"text-b",label:"文字组件",kind:"text",x:.6,y:.2,width:.2,height:.3,instruction:"FORCE_FAIL",color:"#222222",enabled:false}];
  if(real) Object.assign(item.regions[0],{label:"手柄紫色侧板",x:.34,y:.41,width:.26,height:.52,instruction:"把手柄左侧整块紫色外壳改成宝蓝色 #164ac9。保留原有充电接口、圆孔、黑色面板、材质光影与外轮廓，不修改白色背景。"});
  const oldRevision=item.revision;
  r=await api.patch(`/api/competitors/${item.id}`,{data:draft(item)});assert.equal(r.status(),200,await r.text());item=(await r.json()).item;
  assert.equal((await api.patch(`/api/competitors/${item.id}`,{data:{...draft(item),revision:oldRevision}})).status(),409);
  assert.equal((await api.patch(`/api/competitors/${item.id}`,{data:{...draft(item),regions:[{...item.regions[0],x:.99}]}})).status(),400);
  pass("persistent editable prompt/regions, stale revision and bounds validation");
  const job=act(item,"edit");
  if(!real) {
    for(let i=0;i<60;i++){if((await get()).busy)break;await sleep(100);}
    assert.equal((await act(item,"edit")).status(),409);
    assert.equal((await api.delete(`/api/competitors/${item.id}`)).status(),409);
    assert.equal((await api.patch(`/api/competitors/${item.id}`,{data:draft(item)})).status(),409);
    const otherJob=await act(second,"analyze");assert.equal(otherJob.status(),200,await otherJob.text());
  }
  r=await job;assert.equal(r.status(),200,await r.text());item=(await r.json()).item;
  assert.equal(item.versions.length,1);assert.equal(item.busy,false);
  const original=await readFile(path.join(media,item.image.replace(/^\/media\//,"")));
  const outputImage=await readFile(path.join(media,item.versions[0].image.replace(/^\/media\//,"")));
  const a=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const b=await sharp(outputImage).ensureAlpha().raw().toBuffer();
  let insideChanged=0,outsideChanged=0;
  const rr=item.regions[0],w=a.info.width,h=a.info.height;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const inside=x>=Math.floor(rr.x*w)&&x<Math.ceil((rr.x+rr.width)*w)&&y>=Math.floor(rr.y*h)&&y<Math.ceil((rr.y+rr.height)*h);
    const i=(y*w+x)*4;if(!a.data.subarray(i,i+4).equals(b.subarray(i,i+4))){if(inside)insideChanged++;else outsideChanged++;}
  }
  assert.equal(outsideChanged,0);assert(insideChanged>0);
  if(real){
    let bluePixels=0;for(let i=0;i<b.length;i+=4){if(b[i+2]>70&&b[i]<b[i+2]*.35&&b[i+1]<b[i+2]*.65)bluePixels++;}
    assert(bluePixels>1000,`visible target blue pixels=${bluePixels}`);pass(`real selected product recolor: target-blue pixels=${bluePixels}`);
  }
  await writeFile(path.join(output,real?"REAL_PIXEL_CHECK.json":"PIXEL_CHECK.json"),JSON.stringify({outsideChanged,insideChanged,width:w,height:h},null,2));
  await writeFile(path.join(output,real?"REAL_EDIT.png":"FIXTURE_EDIT.png"),outputImage);
  pass(`masked edit pixel verification: outsideChanged=${outsideChanged}; insideChanged=${insideChanged}`);
  pass("per-image task lease, other-image progress, version persistence");
  if(real){
    r=await act(item,"replicate",{prompt:item.prompt+" 使用类似构图生成清爽的产品广告图。"});assert.equal(r.status(),200,await r.text());item=(await r.json()).item;
    await writeFile(path.join(output,"REAL_REPLICA.png"),await readFile(path.join(media,item.versions.at(-1).image.replace(/^\/media\//,""))));
    pass("real image-to-image reference generation and persisted version");
  } else {
    assert.equal(calls.filter(c=>c.type==="edit").at(-1).prompt.includes("FORCE_FAIL"),false);
    item.regions[0].instruction="FORCE_FAIL";
    const beforeCount=item.versions.length;
    const beforeBalance=(await pool.query("select credits_total,credits_used from app_users where email=$1",[email])).rows[0];
    r=await act(item,"edit");assert.equal(r.status(),502);item=await get();assert.equal(item.versions.length,beforeCount);assert.equal(item.busy,false);
    assert.deepEqual((await pool.query("select credits_total,credits_used from app_users where email=$1",[email])).rows[0],beforeBalance);
    assert.equal(Number((await pool.query("select count(*) from app_gen_reservations")).rows[0].count),0);
    pass("model error preserves history, refunds reservation, releases lease");
    r=await act(item,"replicate",{degree:"style",productId:second.id});assert.equal(r.status(),200,await r.text());item=(await r.json()).item;
    assert.equal(calls.filter(c=>c.type==="edit").at(-1).images,2);
    assert.equal(item.versions.at(-1).parent,item.versions[0].id);
    pass("reference style generation uses own product + reference and parent version");
    // Return to original and edit two independent selected regions in one new branch.
    item.activeVersion="";item.regions[0].instruction="保留纹理";item.regions[1].enabled=true;item.regions[1].instruction="换为文字 NEW";
    r=await act(item,"edit");assert.equal(r.status(),200,await r.text());item=(await r.json()).item;
    assert.equal(item.versions.at(-1).parent,"");
    assert(calls.filter(c=>c.type==="edit").at(-1).prompt.includes("换为文字 NEW"));
    pass("multiple semantic region instructions and redo from original without deleting history");
  }
  r=await api.get(`/api/competitors/${item.id}/image?version=${item.activeVersion}&region=color-a`);assert.equal(r.status(),200,await r.text().catch(()=>""));
  assert((await sharp(await r.body()).metadata()).width<item.width);
  pass("authenticated element crop export");
  // Browser acceptance exercises the actual API, PostgreSQL and React UI, not intercepted routes.
  browser=await chromium.launch({channel:"chrome",headless:true,args:["--disable-gpu"]});
  const context=await browser.newContext({storageState:await api.storageState(),viewport:{width:1440,height:1050}});
  await context.addInitScript(() => { Object.defineProperty(crypto,"randomUUID",{value:undefined,configurable:true}); });
  const page=await context.newPage();testPage=page;const pageErrors=[];page.on("pageerror",e=>pageErrors.push(e.message));
  await page.goto(`${base}/competitors`);await page.getByRole("heading",{name:"竞品工作台"}).waitFor();
  await page.getByTitle(item.path,{exact:true}).waitFor(); // session hydration is complete
  const fixtureDir=path.join(output,"folder-fixture","竞品合集");
  await mkdir(path.join(fixtureDir,"子目录"),{recursive:true});await writeFile(path.join(fixtureDir,"01.png"),png);await writeFile(path.join(fixtureDir,"子目录","02.png"),png);await writeFile(path.join(fixtureDir,"说明.txt"),"skip");
  await page.getByTestId("folder-input").setInputFiles(fixtureDir);
  await page.getByText("导入进度 2 / 2",{exact:false}).waitFor({timeout:30000});
  await page.getByLabel("反推提示词").fill("浅色背景，产品居中，右侧展示卖点");
  await page.getByRole("button",{name:"框选元素",exact:true}).click();
  const box=await page.getByTestId("region-surface").boundingBox();assert(box);
  await page.mouse.move(box.x+box.width*.12,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.5,{steps:10});await page.mouse.up();
  await page.getByLabel("元素名称",{exact:true}).fill("包装组件");await page.getByLabel("选区修改要求").fill("改为浅绿色纸盒");
  await page.getByRole("button",{name:"保存修改",exact:true}).click();await page.getByText("提示词与选区已保存",{exact:true}).waitFor();
  await page.screenshot({path:path.join(output,real?"REAL_DESKTOP.png":"DESKTOP.png"),fullPage:true});
  await page.reload();await page.getByTitle("竞品合集/01.png",{exact:true}).click();
  await page.getByRole("button",{name:"1. 包装组件",exact:true}).click();assert.equal(await page.getByLabel("选区修改要求").inputValue(),"改为浅绿色纸盒");
  assert.equal(await page.getByLabel("反推提示词").inputValue(),"浅色背景，产品居中，右侧展示卖点");
  pass("Chrome folder upload, rectangle drawing, independent instruction editing, save/reload without crypto.randomUUID (HTTP compatibility)");
  if(!real){
    await page.getByRole("button",{name:"仅修改启用选区 (1)",exact:true}).click();
    await page.getByRole("button",{name:"V1 · 局部修改",exact:true}).waitFor({timeout:30000});
    pass("browser directional generation returns a new selectable version");
  }
  const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"导出元素裁片",exact:true}).click();const download=await downloadPromise;assert((await download.suggestedFilename()).includes("element"));
  await page.getByRole("button",{name:"存入作品库",exact:true}).click();await page.getByText("已存入作品库，可在画布中通过历史作品添加。",{exact:true}).waitFor();
  const works=(await (await api.get(`/api/account?email=${email}`)).json()).artworks;assert(works.some(w=>w.title==="01.png"));
  pass("browser crop download and real artwork export available to canvas");
  if(!real){
    const mask=await sharp({create:{width:320,height:240,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
    const old=await api.post("/api/inpaint",{multipart:{image:{name:"image.png",mimeType:"image/png",buffer:png},mask:{name:"mask.png",mimeType:"image/png",buffer:mask},prompt:"make it blue",resolution:"1K"}});
    assert.equal(old.status(),200,await old.text());assert((await old.json()).url.startsWith("/media/inpaints/"));
  pass("existing inpaint route regression after shared transport extraction");
    // Exercise folder batch analysis, reusable JSON export and batch image generation.
    await page.getByLabel("选择 竞品合集/01.png",{exact:true}).check();
    await page.getByLabel("选择 竞品合集/子目录/02.png",{exact:true}).check();
    await page.getByRole("button",{name:"批量反推 (2)",exact:true}).click();
    await page.getByText("批处理：2 成功 / 0 失败 · 已结束",{exact:true}).waitFor({timeout:30000});
    const promptDownload=page.waitForEvent("download");await page.getByRole("button",{name:"导出提示词",exact:true}).click();
    const promptFile=await promptDownload;const exported=JSON.parse(await readFile(await promptFile.path(),"utf8"));assert.equal(exported.length,2);assert(exported.every(x=>x.prompt.length>10));
    // Existing test principal is exhausted; top up only the isolated synthetic account.
    await pool.query("UPDATE app_credit_batches SET remaining=remaining+30 WHERE email=$1",[email]);
    await pool.query("UPDATE app_users SET credits_total=credits_total+30 WHERE email=$1",[email]);
    await page.getByRole("button",{name:"批量生成",exact:true}).click();
    await page.getByText("批处理：2 成功 / 0 失败 · 已结束",{exact:true}).waitFor({state:"hidden",timeout:10000});
    await page.getByText("批处理：2 成功 / 0 失败 · 已结束",{exact:true}).waitFor({timeout:30000});
    const batchItems=(await (await api.get("/api/competitors")).json()).items.filter(x=>x.path.startsWith("竞品合集/"));assert(batchItems.every(x=>x.versions.some(v=>v.kind==="replicate")));
    pass("browser batch analysis, exported reusable prompts and ordered per-file reference generation");
    let failOnce=true;
    await page.route("**/api/competitors",async route=>{if(route.request().method()==="POST"&&failOnce){failOnce=false;await route.abort("failed");}else await route.continue();});
    await page.getByTestId("image-input").setInputFiles({name:"retry.png",mimeType:"image/png",buffer:png});
    await page.getByRole("button",{name:"重试",exact:true}).waitFor();await page.getByRole("button",{name:"重试",exact:true}).click();
    await page.getByText("导入进度 1 / 1",{exact:false}).waitFor({timeout:30000});await page.unroute("**/api/competitors");
    pass("failed folder/file upload can be retried without losing successful imports");
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,real?"REAL_MOBILE.png":"MOBILE.png"),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  assert.deepEqual(pageErrors,[]);pass("390px responsive layout and no browser runtime exceptions");
  const balance=(await pool.query("select credits_used from app_users where email=$1",[email])).rows[0];assert.equal(balance.credits_used,0);
  const rows=await pool.query("select count(*) from app_gen_reservations");assert.equal(Number(rows.rows[0].count),0);
  pass("all successful credits settled; no orphan reservations");
  console.log(`${real?"REAL":"FIXTURE"}_RESULT=PASS checks=${report.length}`);
} catch(e) {
  report.push(`FAIL ${e.message}`);
  if(testPage){await testPage.screenshot({path:path.join(output,"FAILURE.png"),fullPage:true}).catch(()=>{});await writeFile(path.join(output,"FAILURE.txt"),await testPage.locator("body").innerText().catch(()=>""));}
  throw e;
} finally {
  await writeFile(path.join(output,real?"real-test.log":"test.log"),report.map(x=>`PASS ${x}`).join("\n")+"\n");
  await writeFile(path.join(output,real?"real-next.log":"next.log"),appLog.join(""));
  await browser?.close();for(const h of handles)await h.dispose();await pool?.end();
  if(app?.pid){if(process.platform==="win32"){try{execFileSync("taskkill",["/PID",String(app.pid),"/T","/F"],{stdio:"pipe"});}catch{}}else app.kill("SIGTERM");}
  fixture?.close();
  try{execFileSync("docker",["rm","-f",container],{stdio:"pipe"});}catch{}
}
