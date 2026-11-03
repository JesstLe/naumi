/** Disposable local BI fixture. It never connects to production or paid suppliers. */
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import path from "node:path";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { stopFixtureChild } from "./video-fusion/process-lifecycle";
import {startModelUiLinuxWeb} from "./verification/model-ui-linux-web";
import {annotateAdminFailure} from "./verification/admin-browser-diagnostics";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";
let cleanupOnFailure=async()=>{};
async function ephemeralPort(){return await new Promise<number>((done,reject)=>{const server=createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const port=(server.address() as {port:number}).port;server.close(()=>done(port));});});}

async function main() {
  const source = process.env.NAUMI_VERIFY_ROUTER_SOURCE;
  if (!source)
    throw new Error(
      "Set NAUMI_VERIFY_ROUTER_SOURCE to the isolated Router checkout",
    );
  const folder = await mkdtemp(join(tmpdir(), "naumi-model-ui-"));
  const runId=process.env.NAUMI_MODEL_UI_RUN_ID,appPort=Number(process.env.NAUMI_MODEL_UI_PORT||54980);
  const routerPort=runId?await ephemeralPort():54981,managementPort=runId?await ephemeralPort():54982;
  const appOrigin=`http://127.0.0.1:${appPort}`;
  let dropActivation = false,
    activations = 0,
    generationRequests = 0;
  let close = async (_code=0) => {};
  let publishOther: () => Promise<void> = async () => { throw new Error("Fixture is not ready"); };
  const f = await createModelFixture(async (req, res) => {
    if (req.url === "/fixture/publish-other" && req.method === "POST") {
      try { await publishOther(); res.end("ok"); }
      catch { res.writeHead(500); res.end("Fixture publication failed"); }
      return;
    }
    if (req.url === "/fixture/drop-next-activation" && req.method === "POST") {
      dropActivation = true;
      res.end("ok");
      return;
    }
    if (req.url === "/fixture/stop" && req.method === "POST") {
      res.end("ok");
      setTimeout(() => void close(), 100);
      return;
    }
    if (req.url === "/fixture/metrics") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ activations, generationRequests }));
      return;
    }
    if (!req.url?.startsWith("/internal/config/")) {
      generationRequests++;
      res.writeHead(405);
      res.end("No supplier calls allowed in BI tests");
      return;
    }
    try {
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part));
      const activation = req.url === "/internal/config/activate";
      const response = await fetch(`http://127.0.0.1:${managementPort}${req.url}`, {
        method: req.method,
        headers: {
          authorization: String(req.headers.authorization || ""),
          "content-type": "application/json",
        },
        ...(parts.length ? { body: Buffer.concat(parts) } : {}),
      });
      const body = await response.arrayBuffer();
      if (activation) activations++;
      if (activation && dropActivation) {
        dropActivation = false;
        res.destroy();
        return;
      }
      res.writeHead(response.status, { "content-type": "application/json" });
      res.end(Buffer.from(body));
    } catch {
      res.writeHead(503);
      res.end("Fixture control unavailable");
    }
  });
  let router:ReturnType<typeof spawn>|undefined,next:ReturnType<typeof spawn>|undefined,closing=false,linuxWeb:Awaited<ReturnType<typeof startModelUiLinuxWeb>>|undefined;
  close=async(code=0)=>{
    if(closing)return;closing=true;
    const failures:unknown[]=[];
    try{await linuxWeb?.stop();}catch(error){failures.push(String(error));}
    for(const child of [next,router])try{await stopFixtureChild(child);}catch(error){failures.push(String(error));}
    try{const db=await import("../src/lib/db");await db.getPool().end();await f.cleanup();}catch(error){failures.push(String(error));}
    try{
      if(path.dirname(resolve(folder))!==resolve(tmpdir())||!path.basename(folder).startsWith("naumi-model-ui-"))throw Error("FIXTURE_TEMP_OWNER_MISMATCH");
      await rm(folder,{recursive:true,force:true});
      const metadata=JSON.parse(await readFile("output/model-ui-fixture.json","utf8").catch(()=>"null"));
      if(metadata){if(runId?metadata.runId!==runId:metadata.routerPID!==router?.pid)throw Error("FIXTURE_METADATA_OWNER_MISMATCH");await rm("output/model-ui-fixture.json",{force:true});}
    }catch(error){failures.push(String(error));}
    await mkdir("output/model-config-ui-fixture",{recursive:true});
    await writeFile("output/model-config-ui-fixture/CLEANUP.json",JSON.stringify({status:failures.length?"FAIL":"PASS",runId,appPort,routerPort,managementPort,routerPID:router?.pid,nextPID:next?.pid,schemaName:f.schemaName,generationRequests,activations,failures})+"\n");
    process.exit(failures.length?1:code);
  };
  cleanupOnFailure=()=>close(1);
  process.on("message",message=>{const control=message as {action?:string;runId?:string};if(control.action==="stop"&&control.runId===runId)void close();});
  process.on("disconnect",()=>void close());
  process.on("SIGINT",()=>void close());process.on("SIGTERM",()=>void close());
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  process.env.NEXT_DIST_DIR ||= "output/model-ui-next";
  process.env.MEDIA_DIR = join(folder, "media");
  process.env.STORAGE_DRIVER = "local";
  process.env.VIDEO_WORKER_SECRET =
    "fixture-ui-video-worker-independent-20261004";
  process.env.NAUMI_ROUTER_MANAGEMENT_URL = f.origin;
  process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN =
    "fixture-ui-model-control-independent-20261004";
  process.env.MODEL_CONFIG_ENVELOPE_SECRET =
    "fixture-ui-model-envelope-independent-20261004";
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS = `${f.origin},http://127.0.0.1:${managementPort}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  const db = await import("../src/lib/db");
  await db.ensureSchema();
  const { setAdminPassword } = await import("../src/lib/admin-auth");
  await setAdminPassword("ModelUiFixture2026!");
  const { signUserSession } = await import("../src/lib/native-auth");
  const member="business-ui@example.test";
  await db.setSetting("multi_user_enabled","1"); await db.getOrCreateUser(member,"业务验收"); await db.addCreditBatch(member,1000,{source:"grant",reason:"isolated UI"});
  if (process.env.NAUMI_VERIFY_BUSINESS_UI === "1") {
    const credential=await f.credentials.importPlain({providerId:"text-p",plain:"fixture-text-only",actor:"fixture"});
    f.config.providers.push({...f.config.providers[0],id:"text-p",name:"Fixture text",protocol:"openai-chat",credentialRef:credential.id});
    f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"text-u",providerId:"text-p",model:"wire-text-private",modality:"text",capabilities:{...f.config.upstreamModels[0].capabilities,vision:true}});
    f.config.publicModels.push({id:"text-public",label:"业务文字",modality:"text",enabled:true,visible:true,target:{type:"upstream",id:"text-u"}});
    Object.assign(f.config.bindings,{"agent.text":"text-public","text.generate":"text-public","vision.reference":"text-public"});
    f.config.business={"canvas.text-generate":{enabled:true,defaultModelId:"text-public",options:[{modelId:"text-public",enabled:true,sort:0,unit:"task",pricing:{mode:"cny-fixed",amountMicros:"500000",creditsPerCnyMicros:"100000000",rounding:"ceil"}}]}};
  }
  const hostOrigin=f.origin.replace('127.0.0.1','host.docker.internal');
  if(process.env.NAUMI_MODEL_UI_PRODUCTION_DIR&&process.env.NAUMI_MODEL_UI_DEV_IMAGE)throw Error('MODEL_UI_PRODUCTION_OWNER_REQUIRED');
  if(process.env.NAUMI_MODEL_UI_DEV_IMAGE){
    // Linux Next reaches the owned fixture through Docker's host bridge. The
    // host Go Router validates that exact same provider origin independently.
    process.env.MODEL_CONFIG_TRUSTED_ORIGINS+=`,${hostOrigin}`;
    for(const provider of f.config.providers)provider.baseUrl=provider.baseUrl.replace(f.origin,hostOrigin);
  }
  await f.repo.current();
  const { createConfigRuntime } = await import("../src/lib/billing/catalog");
  const costs = fixtureConfig();
  costs.costs["supplier-cost-estimate"] = {
    currency: "CNY",
    amountMicros: "290000",
    unit: "task",
    source: "manual-estimate",
  };
  await createConfigRuntime({
    pool: f.sql,
    ensureSchema: db.ensureSchema,
    initialize: async () => costs,
  }).current();
  const { createRouterControl } = await import("../src/lib/model-config/router-client");
  const { createModelRuntime } = await import("../src/lib/model-config/runtime");
  const control = createRouterControl({ baseUrl: f.origin, token: process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN!, envelopeSecret: process.env.MODEL_CONFIG_ENVELOPE_SECRET!, trustedOrigins: [f.origin] });
  const runtime = createModelRuntime({ pool: f.sql, repo: f.repo, credentials: f.credentials, router: control, trustedOrigins: [f.origin,...(process.env.NAUMI_MODEL_UI_DEV_IMAGE?[hostOrigin]:[])], billing: async () => ({ version: 1, config: costs }) });
  publishOther = async () => {
    const snapshot = await f.repo.current(), actor = "other-fixture-admin";
    const draft = await f.repo.draft(actor), config = structuredClone(snapshot.config);
    config.publicModels[0].label = "Other administrator update";
    const saved = await f.repo.saveDraft({ id: draft.id, actor, expectedRevision: draft.revision, config });
    const { randomUUID } = await import("node:crypto");
    const result = await runtime.publish({ id: randomUUID(), draftId: saved.id, expectedRevision: saved.revision, expectedVersion: snapshot.version, actor, reason: "Disposable concurrent-admin conflict verification" });
    if (result.phase !== "applied") throw new Error("Fixture publication not applied");
  };
  const executable = join(folder, "router.exe");
  const build = spawnSync("go", ["build", "-o", executable, "./cmd/server"], {
    cwd: source,
    encoding: "utf8",
  });
  if (build.status !== 0)
    throw new Error(build.stderr || "Fixture Router build failed");
  router = spawn(executable, [], {
    cwd: source,
    env: {
      ...process.env,
      NAUMI_ROUTER_TOKEN: "fixture-ui-generation-independent-20261004",
      NAUMI_HTTP_ADDR: `127.0.0.1:${routerPort}`,
      NAUMI_ROUTER_MANAGEMENT_ADDR: `127.0.0.1:${managementPort}`,
      NAUMI_MODEL_CAPACITY_URL: `${appOrigin}/api/internal/model-capacity`,
      NAUMI_ROUTES_CONFIG: resolve(source, "config/routes.example.json"),
      NAUMI_STATE_DIR: join(folder, "state"),
    },
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  if(process.env.NAUMI_MODEL_UI_PRODUCTION_DIR){
    if(!runId||process.env.NAUMI_MODEL_UI_DEV_IMAGE)throw Error('MODEL_UI_PRODUCTION_OWNER_REQUIRED');
    const production=path.resolve(process.env.NAUMI_MODEL_UI_PRODUCTION_DIR);
    if(production!==path.join(path.dirname(process.cwd()),'production'))throw Error('MODEL_UI_PRODUCTION_PATH_OWNER_MISMATCH');
    const buildId=(await readFile(path.join(production,'.next/BUILD_ID'),'utf8')).trim();
    if(buildId!==process.env.NAUMI_MODEL_UI_PRODUCTION_BUILD_ID)throw Error('MODEL_UI_PRODUCTION_BUILD_ID_MISMATCH');
    next=spawn(process.execPath,[path.join(production,'server.js')],{cwd:production,env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(appPort)},stdio:['ignore','inherit','inherit'],windowsHide:true});
  }else if(process.env.NAUMI_MODEL_UI_DEV_IMAGE){
    if(!runId)throw Error("LINUX_UI_MANAGED_OWNER_REQUIRED");
    const keys=["DATABASE_URL","PGOPTIONS","SETTINGS_SECRET","VIDEO_WORKER_SECRET","MODEL_CONFIG_ENVELOPE_SECRET","NAUMI_ROUTER_MANAGEMENT_TOKEN"];
    const environment:Record<string,string>=Object.fromEntries(keys.flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]!]]));
    Object.assign(environment,{DATABASE_URL:environment.DATABASE_URL.replace('127.0.0.1','host.docker.internal'),NAUMI_ROUTER_MANAGEMENT_URL:hostOrigin,MODEL_CONFIG_TRUSTED_ORIGINS:hostOrigin,NEXT_DIST_DIR:'.next',MEDIA_DIR:'/tmp/current-model-ui-media',STORAGE_DRIVER:'local',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NAUMI_MULTI_USER:'1'});
    linuxWeb=await startModelUiLinuxWeb(process.env.NAUMI_MODEL_UI_DEV_IMAGE,runId,appPort,environment);next=linuxWeb.child;
  }else next = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    },
  );
  await mkdir("output", { recursive: true });
  await writeFile(
    "output/model-ui-fixture.json",
    JSON.stringify({
      schemaName: f.schemaName,
      userCookie:signUserSession(member,Date.now()),
      folder,
      controlOrigin: f.origin,
      routerPID: router.pid,
      nextPID: next.pid,
      runId,appOrigin,routerPort,managementPort,runtime:process.env.NAUMI_MODEL_UI_PRODUCTION_DIR?'production-standalone':'development',buildId:process.env.NAUMI_MODEL_UI_PRODUCTION_BUILD_ID||null,
    }),
  );
  console.log(
    `BI fixture: ${appOrigin}/admin (disposable test account only)`,
  );
  for (const child of [router, next])
    child.on("exit", () => {
      if (!closing) void close(1);
    });
}
main().catch(async(error) => {
  console.error(error);
  annotateAdminFailure(error,"Model configuration fixture failed");
  process.exitCode = 1;
  await cleanupOnFailure();
  process.exit(1);
});
