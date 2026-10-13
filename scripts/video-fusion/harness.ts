import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureDatabase } from "./fixture";
import { loadVideoAssets, defaultAssetsRoot } from "./assets.mjs";
import { createVideoSupplier } from "./supplier.mjs";
import { createFixtureObjects } from "./objects.mjs";

export {CAP_RICH} from "./profiles";
type Account="a"|"b";
type FixtureRef={id:string;url:string;storageKey:string;durationSeconds:number;hasVideoStream:boolean;mimeType:string;sha256:string};
type Seed={accounts:Record<Account,string>;cookies:Record<Account,string>;refs:Record<"image"|"lastImage"|"video"|"audio",FixtureRef>};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
async function freePort(){const server=createServer();await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const port=(server.address() as {port:number}).port;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;}
async function stopChild(child:ChildProcess|undefined){
  if(!child||child.exitCode!==null)return;
  child.kill("SIGTERM");
  await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill("SIGKILL");resolve();},5000);child.once("exit",()=>{clearTimeout(timer);resolve();});});
}
function cleanEnv(){const env:NodeJS.ProcessEnv={};for(const key of ["PATH","Path","SystemRoot","WINDIR","TEMP","TMP","LOCALAPPDATA","APPDATA","HOME","USERPROFILE"]){if(process.env[key])env[key]=process.env[key];}return env;}
function privateChild(args:string[],env:NodeJS.ProcessEnv):Promise<string>{return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});let out="",error="";
  child.stdout.on("data",chunk=>{out+=chunk;});child.stderr.on("data",chunk=>{error=(error+chunk).slice(-5000);});
  child.on("error",reject);child.on("exit",code=>code===0?resolve(out):reject(new Error(error.replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi,"$1[redacted]")||"Fixture bootstrap failed")));
});}

/** Uses real Naumi HTTP and Worker processes; only upstream services are simulated. */
export async function createVideoFixture(options:{databaseUrl?:string;assetsRoot?:string;startWorker?:boolean;routerUrl?:string;validateWire?:(call:unknown)=>void|Promise<void>}={}) {
  let databaseUrl=options.databaseUrl||process.env.VIDEO_FIXTURE_DATABASE_URL||process.env.DATABASE_URL||"";
  const routerUrl=options.routerUrl||process.env.VIDEO_FIXTURE_ROUTER_MANAGEMENT_URL||"";
  const router=new URL(routerUrl);
  if(router.protocol!=="http:"||router.hostname!=="127.0.0.1"||router.username||router.password||!process.env.VIDEO_FIXTURE_ROUTER_TOKEN||!process.env.VIDEO_FIXTURE_ROUTER_ENVELOPE_SECRET)
    throw new Error("A separate loopback fixture Router with private fixture credentials is required");
  const guard=await fixtureDatabase(databaseUrl);
  const namespace=randomUUID(),schemaName=`video_run_${namespace.replace(/-/g,"")}`;
  // A new schema per process keeps model versions, accounts and supplier endpoints independent.
  try{await guard.query(`CREATE SCHEMA ${schemaName}`);}finally{await guard.end();}
  const scopedUrl=new URL(databaseUrl);scopedUrl.searchParams.set("options",`-c search_path=${schemaName}`);databaseUrl=scopedUrl.href;
  const sql=await fixtureDatabase(databaseUrl);
  // Next loads dotenv files before the application. Reject them rather than inherit any formal credentials.
  for(const name of [".env",".env.local",".env.development",".env.development.local"]){if(await stat(path.join(root,name)).catch(()=>null)){await sql.end();throw new Error("Fixture requires a worktree without dotenv files");}}
  const assetsRoot=path.resolve(options.assetsRoot||process.env.VIDEO_FIXTURE_ASSETS_ROOT||defaultAssetsRoot);
  let app:ChildProcess|undefined,worker:ChildProcess|undefined;
  const manifest=await loadVideoAssets(assetsRoot).catch(async error=>{await sql.end();throw error;});
  const output=path.join(root,"output/canvas-video-fusion-20261013/runs",namespace);
  await mkdir(output,{recursive:true});
  const objectCalls:Array<Record<string,unknown>>=[];
  const accessKeyId=`fixture-${randomUUID()}`,secretAccessKey=randomUUID()+randomUUID(),bucket=`fixture-${namespace}`;
  const objects=createFixtureObjects({root:path.join(output,"objects"),accessKeyId,secretAccessKey,bucket,calls:objectCalls});
  const supplier=await createVideoSupplier({assetsRoot,manifest,objectHandler:objects,validateWire:options.validateWire});
  const appPort=await freePort(),baseUrl=`http://127.0.0.1:${appPort}`,workerSecret=randomUUID()+randomUUID();
  const env:NodeJS.ProcessEnv={...cleanEnv(),NODE_ENV:"development",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:databaseUrl,NAUMI_VERIFY_ISOLATED_DB:"1",
    NAUMI_MULTI_USER:"1",NAUMI_EDITION:"pro",PRO_LICENSE_KEY:"LOCAL-OFFLINE",SETTINGS_SECRET:randomUUID()+randomUUID(),
    VIDEO_FIXTURE_PARENT_PIPE:"1",VIDEO_FIXTURE_ASSETS_ROOT:assetsRoot,MEDIA_DIR:path.join(output,"media"),STORAGE_DRIVER:"s3",MEDIA_PRIVATE:"1",
    S3_ENDPOINT:supplier.origin+"/objects",S3_REGION:"us-east-1",S3_BUCKET:bucket,S3_FORCE_PATH_STYLE:"1",S3_ACCESS_KEY_ID:accessKeyId,S3_SECRET_ACCESS_KEY:secretAccessKey,
    NAUMI_VIDEO_WORKER:"0",VIDEO_WORKER_SECRET:workerSecret,NAUMI_APP_ORIGIN:baseUrl,INTERNAL_APP_ORIGIN:baseUrl,VIDEO_WORKER_INTERVAL_MS:"5000",
    MODEL_CONFIG_TRUSTED_ORIGINS:[supplier.origin,router.origin].join(","),VIDEO_FIXTURE_SUPPLIER_ORIGIN:supplier.origin,
    NAUMI_ROUTER_MANAGEMENT_URL:routerUrl,NAUMI_ROUTER_MANAGEMENT_TOKEN:process.env.VIDEO_FIXTURE_ROUTER_TOKEN,
    MODEL_CONFIG_ENVELOPE_SECRET:process.env.VIDEO_FIXTURE_ROUTER_ENVELOPE_SECRET,VIDEO_API_BASE_URL:supplier.origin+"/protocol/openai-videos/v1",VIDEO_API_KEY:supplier.token,VIDEO_API_MODEL:"fixture-video",
    OPENAI_BASE_URL:supplier.origin+"/protocol/image/v1",OPENAI_API_KEY:supplier.token,OPENAI_IMAGE_MODEL:"fixture-image"};
  const logs:string[]=[];
  const capture=(name:string,child:ChildProcess)=>{
    const handle=(data:Buffer)=>{let line=data.toString();for(const value of [databaseUrl,supplier.token,env.SETTINGS_SECRET!,workerSecret,secretAccessKey,env.NAUMI_ROUTER_MANAGEMENT_TOKEN!,env.MODEL_CONFIG_ENVELOPE_SECRET!])line=line.split(value).join("[fixture-secret]");logs.push(`${name}: ${line.slice(-3000)}`);if(logs.length>100)logs.shift();};
    child.stdout?.on("data",handle);child.stderr?.on("data",handle);
  };
  try {
    const seed=JSON.parse(await privateChild(["--conditions=react-server","--import","tsx","scripts/video-fusion/fixture.ts","--seed-private"],env)) as Seed;
    app=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port",String(appPort)],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});capture("app",app);
    const deadline=Date.now()+120_000;
    while(Date.now()<deadline){
      if(app.exitCode!==null)throw new Error(`Fixture app exited ${app.exitCode}: ${logs.slice(-4).join("\n")}`);
      const ready=await fetch(baseUrl+"/api/health",{signal:AbortSignal.timeout(5000)}).then(r=>r.ok).catch(()=>false);
      if(ready)break;await new Promise(resolve=>setTimeout(resolve,300));
    }
    if(!(await fetch(baseUrl+"/api/health",{signal:AbortSignal.timeout(5000)})).ok)throw new Error("Fixture app readiness failed");
    if(options.startWorker!==false){worker=spawn(process.execPath,["scripts/video-worker.mjs"],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});capture("worker",worker);}
    const countTables=new Set(["app_video_tasks","app_video_results","app_artworks","app_canvas_video_nodes","app_billing_operations","app_ledger"]);
    return {baseUrl,refs:seed.refs,accounts:seed.accounts,cookies:seed.cookies,logs,manifest,
      supplierCalls:()=>[...supplier.calls,...objectCalls],setScenario:(name:string)=>supplier.setScenario(name),
      async request<T=unknown>(account:Account,method:string,url:string,body?:unknown){
        if(!url.startsWith("/")||url.startsWith("//"))throw new Error("Fixture requests must stay in the fixture app");
        const response=await fetch(baseUrl+url,{method,headers:{cookie:seed.cookies[account],...(body!==undefined?{"content-type":"application/json"}:{}),"x-naumi-billing-operation-id":String((body as {idempotencyKey?:string})?.idempotencyKey||randomUUID())},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90_000)});
        const type=response.headers.get("content-type")||"";
        const data=type.includes("application/json")?await response.json():await response.arrayBuffer();
        return {status:response.status,body:data as T,headers:response.headers};
      },
      async dbCount(table:string,where:Record<string,string>={}){
        if(!countTables.has(table))throw new Error("Fixture table not permitted");
        const values:unknown[]=[[seed.accounts.a,seed.accounts.b]],clauses=["email=ANY($1::text[])"];
        for(const [key,value] of Object.entries(where)){if(!["id","status","source","source_id","artwork_id"].includes(key))throw new Error("Fixture field not permitted");values.push(value);clauses.push(`${key}=$${values.length}`);}
        return Number((await sql.query(`SELECT count(*) AS n FROM ${table} WHERE ${clauses.join(" AND ")}`,values)).rows[0].n);
      },
      async balance(account:Account){return Number((await sql.query("SELECT credits_total AS n FROM app_users WHERE email=$1",[seed.accounts[account]])).rows[0].n);},
      async tick(){const r=await fetch(baseUrl+"/api/video/worker/tick",{method:"POST",headers:{"x-video-worker-secret":workerSecret},signal:AbortSignal.timeout(90_000)});if(!r.ok)throw new Error(`Fixture tick failed ${r.status}`);return r.json();},
      async stop(){await stopChild(worker);await stopChild(app);await supplier.close();await sql.end();},
    };
  } catch(error){await stopChild(worker);await stopChild(app);await supplier.close();await sql.end();throw error;}
}
