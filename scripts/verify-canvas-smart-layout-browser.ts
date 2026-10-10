import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import sharp from "sharp";
import { chromium, request, expect as baseExpect } from "@playwright/test";
import { complexCanvas } from "./fixtures/canvas-complex-layout";
import { defaultNodeSettings } from "../src/lib/canvas/node-settings";

const output=path.resolve(process.env.LAYOUT_EVIDENCE_DIR || "output/canvas-smart-layout/browser");
const container=`naumi-layout-${Date.now()}`,password=randomUUID(),email="layout-fixture@example.test";
const appLog:string[]=[],checks:string[]=[],errors:string[]=[];
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const expect=baseExpect.configure({timeout:45000});
let app:ReturnType<typeof spawn>|undefined,pool:pg.Pool|undefined;
let api:Awaited<ReturnType<typeof request.newContext>>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
let page:Awaited<ReturnType<NonNullable<typeof browser>["newPage"]>>|undefined;
const pass=(text:string)=>{checks.push(text);console.log(`PASS ${text}`);};
async function main() {
try {
  await mkdir(path.join(output,"media"),{recursive:true});
  execFileSync("docker",["run","-d","--name",container,"-e","POSTGRES_USER=fixture","-e",`POSTGRES_PASSWORD=${password}`,"-e","POSTGRES_DB=fixture","-p","127.0.0.1::5432","--tmpfs","/var/lib/postgresql/data","postgres:16-alpine"],{stdio:"pipe"});
  const mapping=execFileSync("docker",["port",container,"5432"],{encoding:"utf8"}).trim();
  const database=`postgres://fixture:${password}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool=new pg.Pool({connectionString:database});
  for(let i=0;i<60;i++){try{await pool.query("SELECT 1");break;}catch{await sleep(300);}}
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=(server.address() as {port:number}).port;await new Promise<void>(resolve=>server.close(()=>resolve()));
  const base=`http://127.0.0.1:${port}`;
  app=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","-p",String(port)],{
    env:{...process.env,DATABASE_URL:database,SETTINGS_SECRET:randomUUID(),VIDEO_WORKER_SECRET:randomUUID(),NAUMI_VIDEO_WORKER:"0",ADMIN_EMAIL:email,
      NAUMI_EDITION:"cloud",NAUMI_MULTI_USER:"1",NAUMI_PUBLIC_COMMERCE:"0",MEDIA_DIR:path.join(output,"media"),
      STORAGE_DRIVER:"local",NEXT_PUBLIC_SUPABASE_URL:"",NEXT_PUBLIC_SUPABASE_ANON_KEY:"",SMTP_HOST:"",
      OPENAI_API_KEY:"layout-fixture-not-a-real-key",OPENAI_BASE_URL:"http://127.0.0.1:1/v1",NEXT_TELEMETRY_DISABLED:"1",NEXT_DIST_DIR:process.env.NEXT_DIST_DIR || ".next-layout-acceptance"},
    stdio:["ignore","pipe","pipe"],
  });
  app.stdout?.on("data",chunk=>appLog.push(chunk.toString()));app.stderr?.on("data",chunk=>appLog.push(chunk.toString()));
  let ready=false;
  for(let i=0;i<160;i++){try{if((await fetch(base+"/api/health")).ok){ready=true;break;}}catch{}await sleep(500);}
  assert.ok(ready,"app startup");
  api=await request.newContext({baseURL:base,timeout:120000});
  const registration=await api.post("/api/auth/register",{data:{email,password,name:"复杂画布验收"}});
  assert.equal(registration.status(),200,await registration.text());
  const fixture=complexCanvas(),groupId="layout-complex",projectKey="tree:"+groupId;
  const artworkNodes=fixture.nodes.filter(n=>!n.id.startsWith("text-"));
  const textNodes=fixture.nodes.filter(n=>n.id.startsWith("text-"));
  for(const node of artworkNodes){
    const product=Number(node.id[1]),variant=node.id.includes("original")?"src":node.id.includes("final")?"main":"selling";
    const demo=product===1?"suppl":"thermos";
    await sharp(`public/demos/suite-demo/${demo}-${variant}.png`).resize(node.width,node.height,{fit:"fill"}).png().toFile(path.join(output,"media",node.id+".png"));
    const parents=fixture.edges.filter(e=>e.target===node.id && !e.source.startsWith("text-")).map(e=>e.source);
    await pool.query(`INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,source_url,parent_id,parent_ids,group_id,origin,image_width,image_height,canvas_width,canvas_height,canvas_x,canvas_y,created_at)
      VALUES($1,$2,$3,'main','隔离验收样例','completed',$4,'','derived',$5,$6::jsonb,$7,'canvas',$8::integer,$9::integer,$8::integer,$9::integer,$10,$11,$12)`,
      [node.id,email,`产品${product+1} · ${node.id.split('-').at(-1)}`,`/media/${node.id}.png`,parents[0]||null,JSON.stringify(parents.slice(1)),groupId,node.width,node.height,node.x,node.y,new Date(Date.UTC(2026,9,10,0,fixture.nodes.indexOf(node))).toISOString()]);
  }
  for(const node of textNodes){
    const sources=fixture.edges.filter(e=>e.target===node.id).map(e=>e.source),targets=fixture.edges.filter(e=>e.source===node.id).map(e=>e.target);
    const content=node.id.endsWith("copy")?"清新自然，品质生活。\n主图文案 · 版本确认":Array.from({length:node.id.endsWith("brief")?24:42},(_,i)=>`${i+1}. ${i%2?"保留主体、统一光线与包装细节。":"产品卖点与画面构图，分支版本对比。"}`).join("\n");
    await pool.query(`INSERT INTO app_canvas_text_nodes(id,email,project_key,title,content,canvas_x,canvas_y,canvas_width,canvas_height,source_ids,target_ids)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)`,[node.id,email,projectKey,node.id.endsWith("brief")?"创作要求":node.id.endsWith("review")?"版本分析":"文案",content,node.x,node.y,node.width,node.height,JSON.stringify(sources),JSON.stringify(targets)]);
  }
  // This GET initializes the existing node settings table before fixture seeding.
  assert.equal((await api.get("/api/canvas/node-settings")).status(),200);
  const locked=defaultNodeSettings();locked.locked=true;
  await pool.query("INSERT INTO app_canvas_node_settings(email,node_id,kind,settings) VALUES($1,$2,'image',$3::jsonb)",[email,"p1-reference",JSON.stringify(locked)]);
  const positions=async()=>{const rows=await pool!.query(`SELECT id,canvas_x AS x,canvas_y AS y FROM app_artworks WHERE email=$1 UNION ALL SELECT id,canvas_x AS x,canvas_y AS y FROM app_canvas_text_nodes WHERE email=$1 ORDER BY id`,[email]);return rows.rows;};
  const before=await positions();
  const unchanged=async()=>{const artworks=await pool!.query("SELECT id,title,image_url,parent_id,parent_ids,image_width,image_height,canvas_width,canvas_height FROM app_artworks WHERE email=$1 ORDER BY id",[email]);const texts=await pool!.query("SELECT id,title,content,source_ids,target_ids,canvas_width,canvas_height FROM app_canvas_text_nodes WHERE email=$1 ORDER BY id",[email]);return {artworks:artworks.rows,texts:texts.rows};};
  browser=await chromium.launch({channel:process.platform==="win32"?"msedge":undefined,headless:true});
  const context=await browser.newContext({storageState:await api.storageState(),viewport:{width:1600,height:1000}});
  await context.addCookies([{name:"naumi_locale",value:"zh",url:base}]);
  await context.addInitScript(({key})=>{localStorage.setItem("nv:canvas:last",key);localStorage.setItem("nv:canvas:bg","light");},{key:projectKey});
  page=await context.newPage();page.setDefaultTimeout(60000);page.on("pageerror",e=>errors.push(e.message));
  let paidRequests=0,positionPosts=0,historyPosts=0;
  page.on("request",req=>{if(req.method()!=="POST")return;const url=new URL(req.url()).pathname;if(url==="/api/canvas/history")historyPosts++;if(url==="/api/artworks/position")positionPosts++;});
  await page.route("**/api/**",async route=>{const url=new URL(route.request().url()).pathname;
    if(route.request().method()==="POST" && /generate|image-tasks|billing\/submit|canvas\/assistant/.test(url)){paidRequests++;await route.abort();return;}await route.continue();});
  await page.goto(base+"/canvas");
  await expect(page.locator(".react-flow__node")).toHaveCount(fixture.nodes.length);
  const tidy=page.getByRole("button",{name:"整理画布",exact:true});await expect(tidy).toBeEnabled();
  // Existing text auto-height persists on load; capture the baseline AFTER that settles.
  await expect.poll(async()=> (await unchanged()).texts.filter(n=>n.id.endsWith("review")).every(n=>n.canvas_height>720)).toBe(true);
  await page.waitForTimeout(300);
  const originalContent=await unchanged();
  await page.getByRole("button",{name:"适应视图",exact:true}).click();await page.waitForTimeout(650);
  await page.screenshot({path:path.join(output,"before.png")});
  const uiBefore=await page.locator(".react-flow__node").evaluateAll(elements=>elements.map(el=>[el.getAttribute("data-id"),(el as HTMLElement).style.transform]));
  // Simulate one failed transaction. No node should move and no undo should be added.
  await page.route("**/api/canvas/history",route=>route.fulfill({status:409,json:{error:"验收模拟保存失败"}}));
  await tidy.click();await expect(page.getByText("验收模拟保存失败",{exact:true})).toBeVisible();
  assert.deepEqual(await positions(),before);
  assert.deepEqual(await page.locator(".react-flow__node").evaluateAll(elements=>elements.map(el=>[el.getAttribute("data-id"),(el as HTMLElement).style.transform])),uiBefore);
  await expect(page.getByTestId("canvas-main-toolbar").locator('[data-tool="undo"]')).toBeDisabled();
  await page.unroute("**/api/canvas/history");pass("failed-save leaves database, UI and undo stack intact");
  await tidy.click();await expect(page.getByTestId("canvas-main-toolbar").locator('[data-tool="undo"]')).toBeEnabled();
  const after=await positions();assert.notDeepEqual(after,before);
  const lockedBefore=before.find(n=>n.id==="p1-reference");assert.deepEqual(after.find(n=>n.id==="p1-reference"),lockedBefore);
  assert.ok(textNodes.every(n=>JSON.stringify(after.find(a=>a.id===n.id))!==JSON.stringify(before.find(a=>a.id===n.id))));
  assert.deepEqual(await unchanged(),originalContent);
  const geometry=async()=>page!.locator(".react-flow__node").evaluateAll(elements=>elements.map(el=>({id:el.getAttribute("data-id"),...(()=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()})));
  const assertNoOverlap=async()=>{const boxes=await geometry();for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const p=boxes[a],q=boxes[b];assert.ok(p.x+p.width<=q.x+1 || q.x+q.width<=p.x+1 || p.y+p.height<=q.y+1 || q.y+q.height<=p.y+1,`UI overlap ${p.id}/${q.id}`);}};
  await page.waitForTimeout(750);await assertNoOverlap();
  for(const box of await geometry()) assert.ok(box.x>=0 && box.y>=0 && box.x+box.width<=1600 && box.y+box.height<=1000,`auto-fit clipped ${box.id}`);
  await page.screenshot({path:path.join(output,"after.png")});
  pass("30 image/text nodes + all references arrange with zero rectangle overlap; locked node and content unchanged");
  await tidy.click();await page.waitForTimeout(650);assert.deepEqual(await positions(),after);
  const undo=page.getByTestId("canvas-main-toolbar").locator('[data-tool="undo"]'),redo=page.getByTestId("canvas-main-toolbar").locator('[data-tool="redo"]');
  await undo.click();await expect(redo).toBeEnabled();assert.deepEqual(await positions(),before);
  await redo.click();await expect(undo).toBeEnabled();assert.deepEqual(await positions(),after);
  pass("repeat arrange is stable; single undo restores exact original image/text positions; redo restores arranged positions");
  await page.reload();await expect(page.locator(".react-flow__node")).toHaveCount(30);await expect(tidy).toBeEnabled();
  assert.deepEqual(await positions(),after);await page.getByRole("button",{name:"适应视图",exact:true}).click();await page.waitForTimeout(650);await assertNoOverlap();
  await page.screenshot({path:path.join(output,"after-reload.png")});
  // Atomic rollback inside REAL PostgreSQL: the first valid move must not survive a later invalid ID.
  const atomic=await context.request.post(base+"/api/canvas/history",{data:{operationId:randomUUID(),operations:[{type:"position",id:"p0-original",text:false,x:999,y:999},{type:"position",id:"missing",text:false,x:0,y:0}]}});
  assert.equal(atomic.status(),409);assert.deepEqual(await positions(),after);
  pass("reload restores persisted layout; PostgreSQL rolls back the whole batch on a mid-step failure");
  await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"适应视图",exact:true}).click();await page.waitForTimeout(650);await assertNoOverlap();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,"mobile.png")});
  assert.deepEqual(errors,[]);assert.equal(paidRequests,0);assert.equal(positionPosts,0);
  const transactions=(await pool.query("SELECT count(*)::int AS n FROM app_canvas_history_ops WHERE email=$1",[email])).rows[0].n;
  assert.equal(transactions,3);pass("390px canvas works; no client exception or model consumption; exactly 3 committed arrange/undo/redo steps");
  await writeFile(path.join(output,"result.json"),JSON.stringify({checks,nodes:30,edges:fixture.edges.length,locked:lockedBefore,historyPosts,transactions,paidRequests,positionPosts,errors,before,after},null,2));
  console.log("BROWSER=PASS NODES=30 OVERLAPS=0 SAVE_RELOAD_UNDO_REDO=PASS FAILED_SAVE=UNCHANGED ATOMIC_ROLLBACK=PASS PAID_CALLS=0");
} catch(error) {
  await page?.screenshot({path:path.join(output,"failure.png")}).catch(()=>{});throw error;
} finally {
  await mkdir(output,{recursive:true});await writeFile(path.join(output,"checks.txt"),checks.join("\n"));await writeFile(path.join(output,"next.log"),appLog.join(""));
  await browser?.close();await api?.dispose();await pool?.end();
  if(app?.pid){if(process.platform==="win32"){try{execFileSync("taskkill",["/PID",String(app.pid),"/T","/F"],{stdio:"pipe"});}catch{}}else app.kill("SIGTERM");}
  try{execFileSync("docker",["rm","-f",container],{stdio:"pipe"});}catch{}
}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
