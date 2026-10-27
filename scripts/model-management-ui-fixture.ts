/** Isolated local database and mock suppliers/Router. No production access. */
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
let cleanupOnFailure=async()=>{};

async function main() {
  let close = async (_code=0) => {}, activeDigest = "", queries = 0, paid = 0, dropNext = false;
  const publications = new Map<string, unknown>();
  const f = await createModelFixture(async (req, res) => {
    const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.url === "/stop") { send(200, {}); setTimeout(() => void close(), 150); return; }
    if (req.url === "/drop-next") { dropNext = true; send(200, {}); return; }
    if (req.url === "/stats") { send(200, { queries, paid }); return; }
    if (req.url?.endsWith("/models") && req.method === "GET") { queries++; if (queries === 1) await new Promise(resolve => setTimeout(resolve, 2500)); send(200, { data: [{ id: "gpt-image-2" }, { id: "gpt-image-1.5" }, { id: "catalog-image-new" }] }); return; }
    const parts: Buffer[] = []; for await (const chunk of req) parts.push(chunk);
    const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
    if (req.url === "/internal/config/state") return send(200, { digest: activeDigest });
    if (req.url === "/internal/config/prepare") return send(200, { digest: body.digest, phase: "prepared" });
    if (req.url === "/internal/config/activate") {
      if (body.expectedDigest !== activeDigest) return send(409, {});
      activeDigest = body.digest;
      const p = { id: body.id, digest: body.digest, phase: "applied" }; publications.set(body.id, p);
      if (dropNext) { dropNext = false; res.destroy(); return; }
      return send(200, p);
    }
    if (req.url?.startsWith("/internal/config/publications/")) { const p = publications.get(req.url.split("/").at(-1)!); return send(p ? 200 : 404, p || {}); }
    if (req.method === "POST") paid++;
    send(405, { error: "Generation forbidden" });
  });
  let next:ReturnType<typeof spawn>|undefined,closing=false;
  close=async(code=0)=>{
    if(closing)return;closing=true;
    if(next?.pid && next.exitCode===null){
      if(process.platform==="win32")await new Promise(resolve=>spawn("taskkill",["/pid",String(next!.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"}).once("exit",resolve));
      else next.kill();
    }
    const db=await import("../src/lib/db");
    await db.getPool().end();await f.cleanup();
    await rm("output/model-management-fixture/fixture.json",{force:true});process.exit(code);
  };
  cleanupOnFailure=()=>close(1);
  process.on("message",message=>{const control=message as {action?:string;runId?:string};if(control.action==="stop"&&control.runId===process.env.NAUMI_MODEL_UI_RUN_ID)void close();});
  process.on("disconnect",()=>void close());
  process.on("SIGINT",()=>void close());process.on("SIGTERM",()=>void close());
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  process.env.NEXT_DIST_DIR ||= "output/model-management-fixture/next";
  process.env.NAUMI_VIDEO_WORKER = "0";
  process.env.NAUMI_MULTI_USER = "1";
  process.env.BUILD_VERSION="1791542000";
  process.env.SOURCE_COMMIT="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  process.env.VIDEO_WORKER_SECRET = "mvp-ui-worker-private-secret-independent-long";
  process.env.NAUMI_ROUTER_MANAGEMENT_URL = f.origin;
  process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN = "mvp-ui-router-private-token-independent-long";
  process.env.MODEL_CONFIG_ENVELOPE_SECRET = "mvp-ui-envelope-private-secret-independent-long";
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS = f.origin;
  f.config.providers[0].name = "图片模型源";
  f.config.upstreamModels[0].model = "gpt-image-2";
  f.config.publicModels[0].label = "灵动图片";
  f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: "u2", label: "图片备用模型", model: "gpt-image-1.5" });
  const textKey = await f.credentials.importPlain({ providerId: "p2", plain: "isolated-ui-text-key", actor: "fixture" });
  f.config.providers.push({ id: "p2", name: "文字模型源", protocol: "openai-chat", baseUrl: `${f.origin}/text/v1`, enabled: true, credentialRef: textKey.id, maxConcurrent: 4, timeoutMs: 120000 });
  f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: "text1", providerId: "p2", label: "文字模型", model: "gpt-4.1", modality: "text", capabilities: { ...f.config.upstreamModels[0].capabilities, edit: false, vision: true, qualities: [], nativeResolutions: [] } });
  f.config.publicModels.push({ id: "smart-text", label: "创作助手", modality: "text", enabled: true, visible: true, target: { type: "upstream", id: "text1" } });
  Object.assign(f.config.bindings, { "agent.text": "smart-text", "text.generate": "smart-text", "vision.ocr": "smart-text" });
  f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"family-image",model:"fixture-family-wire"});
  f.config.publicModels.push(...["square","portrait","three-four"].map(s=>({...structuredClone(f.config.publicModels[0]),id:"gemini-3.0-pro-image-"+s,label:"gemini-3.0-pro-image-"+s,target:{type:"upstream" as const,id:"family-image"}})));
  if(process.env.VERIFY_CANVAS_NODE_EDITING === "1") f.config.upstreamModels[0].parameterMap.qualityPolicy={mode:"map",choices:(["low","medium","high","xhigh","max"] as const).map((id,i)=>({id,label:["低","标准","高","超高","最高"][i],value:["xhigh","max"].includes(id)?"high":id}))};
  const db = await import("../src/lib/db"), auth = await import("../src/lib/admin-auth"), native = await import("../src/lib/native-auth");
  await db.ensureSchema();
  if(process.env.VERIFY_ADMIN_UI_INTEGRATION === "1") {
    const release=await import("../src/lib/release-runtime/store");
    await release.ensureReleaseSchema();await release.releasePool().end();
    const {createWorkerTickReceiptStore}=await import("../src/lib/release-runtime/worker-tick-receipts");
    const commit="a".repeat(40),tick={tickId:crypto.randomUUID(),workerInstanceId:"fixture-worker",workerBootId:crypto.randomUUID(),workerCommit:commit,targetWebInstanceId:"fixture-web"};
    const web={instanceId:"fixture-web",bootId:crypto.randomUUID(),commit};
    const ticks=createWorkerTickReceiptStore(f.sql);await ticks.accept(tick,web);await ticks.complete(tick,web,{ok:true,fixture:true});
  }
  await db.setSetting("multi_user_enabled","1"); await f.repo.current(); await auth.setAdminPassword("MvpFixture2026!");
  await db.getOrCreateUser("mvp-member@example.test", "普通成员");
  if(process.env.VERIFY_CANVAS_NODE_EDITING === "1") {
    process.env.STORAGE_DRIVER="local";
    const sharp=(await import("sharp")).default,{uploadImage}=await import("../src/lib/storage");
    const png=await sharp({create:{width:640,height:480,channels:3,background:"#dce9e2"}}).png().toBuffer(),image=await uploadImage(png,"image/png","fixtures/integration-image.png");
    await db.addArtworks("mvp-member@example.test",[{id:"integration-image",title:"合并验收图片",category:"main",prompt:"本地像素编辑验收",image,status:"completed",gradient:"",origin:"canvas",width:640,height:480,canvasWidth:320,canvasHeight:240}]);
    await db.getPool().query("UPDATE app_artworks SET canvas_x=100,canvas_y=100 WHERE id='integration-image'");
    const now=new Date().toISOString();await db.upsertCanvasTextNode("mvp-member@example.test",{id:"text-integration",projectKey:"tree:integration-image",title:"合并验收文字",prompt:"",content:"画布整合验收\n保留模型与积分配置",status:"completed",canvasX:480,canvasY:100,width:300,height:210,createdAt:now,updatedAt:now,sourceIds:["integration-image"],targetIds:[],productIds:[]});
  }
  if(process.env.VERIFY_RETIRED_ENDPOINTS === "1") await db.upsertUserImageProviderRecord({id:"retired-ui-provider",email:"mvp-member@example.test",name:"Historical UI fixture",isActive:true,enabled:true,protocol:"openai-images",baseUrlEnc:f.origin+"/v1",apiKeyEnc:"old-ui-fixture-only-key",models:["gpt-image-own"],defaultModel:"gpt-image-own"});
  const { createConfigRuntime } = await import("../src/lib/billing/catalog");
  const fixtureBilling=fixtureConfig();fixtureBilling.switches.metering="on";
  const billing=createConfigRuntime({ pool: f.sql, ensureSchema: db.ensureSchema, initialize: async () => fixtureBilling });
  const beforeBilling=await billing.current();await billing.publish({id:crypto.randomUUID(),expectedVersion:beforeBilling.version,config:fixtureBilling,actor:"fixture",reason:"Enable isolated UI pricing"});
  if(process.env.VERIFY_ADMIN_UI_INTEGRATION === "1") {
    process.env.STORAGE_DRIVER="local";
    process.env.MEDIA_DIR=process.cwd()+"/output/model-management-fixture/admin-media";
    const seed=spawn(process.execPath,["--conditions=react-server","--import","tsx","scripts/seed-saas-admin-preview.ts"],{env:process.env,windowsHide:true,stdio:"inherit"});
    const code=await new Promise<number|null>((resolve,reject)=>{seed.once("error",reject);seed.once("exit",resolve);});
    if(code!==0)throw Error("ADMIN_UI_REAL_FIXTURE_SEED_FAILED");
  }
  await mkdir("output/model-management-fixture", { recursive: true });
  next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", process.env.NAUMI_MODEL_UI_PORT||"54989"], { env: process.env, windowsHide: true, stdio: "inherit" });
  await writeFile("output/model-management-fixture/fixture.json", JSON.stringify({ control: f.origin, memberCookie: native.signUserSession("mvp-member@example.test", Date.now()), schemaName: f.schemaName,runId:process.env.NAUMI_MODEL_UI_RUN_ID }));
}
main().catch(async e => { console.error(e);process.exitCode=1;await cleanupOnFailure(); });
