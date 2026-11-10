import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID,createHash } from "node:crypto";
import { mkdir, stat,readFile,writeFile,appendFile,rmdir } from "node:fs/promises";
import path from "node:path";
import { fixtureDatabase } from "./fixture";
import { loadVideoAssets, defaultAssetsRoot } from "./assets.mjs";
import { createVideoSupplier } from "./supplier.mjs";
import { createFixtureObjects } from "./objects.mjs";
import type {VideoWireProfile} from "../../src/lib/video/capability-schema";
import type {VideoModelDefinition} from "../../src/lib/video/capability-schema";
import {stopFixtureChild as stopChild} from './process-lifecycle';

export {CAP_RICH} from "./profiles";
type Account="a"|"b";
type FixtureRef={id:string;url:string;storageKey:string;durationSeconds:number;hasVideoStream:boolean;mimeType:string;sha256:string};
type Seed={accounts:Record<Account,string>;cookies:Record<Account,string>;refs:Record<"image"|"lastImage"|"video"|"silentVideo"|"audio",FixtureRef>;byocWorkflowId:string};
const root=path.resolve(__dirname,"../..");
async function freePort(){const server=createServer();await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const port=(server.address() as {port:number}).port;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;}
function cleanEnv(){const env:NodeJS.ProcessEnv={NODE_ENV:"development"};for(const key of ["PATH","Path","SystemRoot","WINDIR","TEMP","TMP","LOCALAPPDATA","APPDATA","HOME","USERPROFILE"]){if(process.env[key])env[key]=process.env[key];}return env;}
function privateChild(args:string[],env:NodeJS.ProcessEnv):Promise<string>{return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});let out="",error="";
  child.stdout.on("data",chunk=>{out+=chunk;});child.stderr.on("data",chunk=>{error=(error+chunk).slice(-5000);});
  child.on("error",reject);child.on("exit",code=>code===0?resolve(out):reject(new Error(error.replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi,"$1[redacted]")||"Fixture bootstrap failed")));
});}

/** Uses real Naumi HTTP and Worker processes; only upstream services are simulated. */
export async function createVideoFixture(options:{databaseUrl?:string;assetsRoot?:string;startWorker?:boolean;routerUrl?:string;routerBinary?:string;videoProfile?:VideoWireProfile;videoWireModel?:string;legacyGemini?:boolean;videoDefinition?:VideoModelDefinition;extraVideoModels?:Array<{id:string;definition:VideoModelDefinition}>;fullWorkflow?:boolean;uiModels?:boolean;referenceModels?:boolean;agentVision?:boolean;audio?:boolean;audioReply?:(request:any)=>any|Promise<any>;validateWire?:(call:unknown)=>void|Promise<void>;validatePoll?:(call:unknown)=>void|Promise<void>;agentReply?:(request:any)=>any|Promise<any>}={}) {
  if(options.legacyGemini&&options.videoProfile!=="gemini")throw new Error("Native legacy fixture is limited to Gemini");
  if(options.fullWorkflow&&!['autodl','runninghub'].includes(options.videoProfile||''))throw new Error("Full workflow fixture requires AutoDL or RunningHub");
  let databaseUrl=options.databaseUrl||process.env.VIDEO_FIXTURE_DATABASE_URL||process.env.DATABASE_URL||"";
  const routerBinary=options.routerBinary||process.env.VIDEO_FIXTURE_ROUTER_BINARY;
  let routerUrl=options.routerUrl||process.env.VIDEO_FIXTURE_ROUTER_MANAGEMENT_URL||"",routerToken=process.env.VIDEO_FIXTURE_ROUTER_TOKEN,routerEnvelope=process.env.VIDEO_FIXTURE_ROUTER_ENVELOPE_SECRET;
  if(routerBinary){
    const hash=createHash("sha256").update(await readFile(routerBinary)).digest("hex");
    if(hash!==process.env.VIDEO_FIXTURE_ROUTER_BINARY_SHA256?.toLowerCase())throw new Error("Pinned fixture Router binary SHA required");
    routerUrl=`http://127.0.0.1:${await freePort()}`;routerToken=randomUUID()+randomUUID();routerEnvelope=randomUUID()+randomUUID();
  }
  const router=new URL(routerUrl);
  if(router.protocol!=="http:"||router.hostname!=="127.0.0.1"||router.username||router.password||!routerToken||!routerEnvelope)
    throw new Error("A separate loopback fixture Router with private fixture credentials is required");
  const guard=await fixtureDatabase(databaseUrl);
  const namespace=randomUUID(),schemaName=`video_run_${namespace.replace(/-/g,"")}`;
  // A new schema per process keeps model versions, accounts and supplier endpoints independent.
  try{await guard.query(`CREATE SCHEMA ${schemaName}`);}finally{await guard.end();}
  const scopedUrl=new URL(databaseUrl);scopedUrl.searchParams.set("options",`-c search_path=${schemaName}`);databaseUrl=scopedUrl.href;
  let sql=await fixtureDatabase(databaseUrl);
  // Next loads dotenv files before the application. Reject them rather than inherit any formal credentials.
  for(const name of [".env",".env.local",".env.development",".env.development.local"]){if(await stat(path.join(root,name)).catch(()=>null)){await sql.end();throw new Error("Fixture requires a worktree without dotenv files");}}
  const assetsRoot=path.resolve(options.assetsRoot||process.env.VIDEO_FIXTURE_ASSETS_ROOT||defaultAssetsRoot);
  let app:ChildProcess|undefined,worker:ChildProcess|undefined,routerProcess:ChildProcess|undefined,mediaWorker:ChildProcess|undefined;
  const manifest=await loadVideoAssets(assetsRoot).catch(async error=>{await sql.end();throw error;});
  const output=path.join(process.env.VIDEO_FIXTURE_OUTPUT_ROOT||path.join(root,"output/canvas-video-fusion-20261013/runs"),namespace);
  await mkdir(output,{recursive:true});
  const objectCalls:Array<Record<string,unknown>>=[];
  const accessKeyId=`fixture-${randomUUID()}`,secretAccessKey=randomUUID()+randomUUID(),bucket=`fixture-${namespace}`;
  const objectCorsOrigins:string[]=[];
  const objects=createFixtureObjects({root:path.join(output,"objects"),accessKeyId,secretAccessKey,bucket,calls:objectCalls,allowedOrigins:objectCorsOrigins});
  const supplier=await createVideoSupplier({assetsRoot,manifest,objectHandler:objects,validateWire:options.validateWire,validatePoll:options.validatePoll,agentReply:options.agentReply,audioReply:options.audioReply});
  const appPort=await freePort(),baseUrl=`http://127.0.0.1:${appPort}`,workerSecret=randomUUID()+randomUUID();
  objectCorsOrigins.push(baseUrl);
  const mediaPort=await freePort(),mediaSecret=randomUUID()+randomUUID(),mediaOrigin=`http://127.0.0.1:${mediaPort}`;
  const env:NodeJS.ProcessEnv={...cleanEnv(),NODE_ENV:"development",NEXT_TELEMETRY_DISABLED:"1",DATABASE_URL:databaseUrl,NAUMI_VERIFY_ISOLATED_DB:"1",
    NAUMI_MULTI_USER:"1",NAUMI_EDITION:"pro",PRO_LICENSE_KEY:"LOCAL-OFFLINE",SETTINGS_SECRET:randomUUID()+randomUUID(),
    VIDEO_FIXTURE_PARENT_PIPE:"1",VIDEO_FIXTURE_AUDIO:options.audio?"1":"0",VIDEO_FIXTURE_ASSETS_ROOT:assetsRoot,VIDEO_FIXTURE_AGENT_VISION:options.agentVision?"1":"0",VIDEO_FIXTURE_AGENT:options.agentReply?"1":"0",VIDEO_FIXTURE_UI_MODELS:options.uiModels?"1":"0",VIDEO_FIXTURE_REFERENCE_MODELS:options.referenceModels?"1":"0",MEDIA_DIR:path.join(output,"media"),STORAGE_DRIVER:"s3",MEDIA_PRIVATE:"1",
    S3_ENDPOINT:supplier.origin+"/objects",S3_REGION:"us-east-1",S3_BUCKET:bucket,S3_FORCE_PATH_STYLE:"1",S3_ACCESS_KEY_ID:accessKeyId,S3_SECRET_ACCESS_KEY:secretAccessKey,
    NAUMI_VIDEO_WORKER:"0",VIDEO_WORKER_SECRET:workerSecret,NAUMI_APP_ORIGIN:baseUrl,INTERNAL_APP_ORIGIN:baseUrl,VIDEO_WORKER_INTERVAL_MS:"5000",
    MEDIA_WORKER_ORIGIN:mediaOrigin,MEDIA_WORKER_SECRET:mediaSecret,MEDIA_JOB_DIR:path.join(output,"media-jobs"),
    MODEL_CONFIG_TRUSTED_ORIGINS:[supplier.origin,router.origin].join(","),VIDEO_FIXTURE_SUPPLIER_ORIGIN:supplier.origin,VIDEO_FIXTURE_VIDEO_PROFILE:options.videoProfile||"ark",VIDEO_FIXTURE_WIRE_MODEL:options.videoWireModel||"",VIDEO_FIXTURE_LEGACY_GEMINI:options.legacyGemini?"1":"0",VIDEO_FIXTURE_FULL_WORKFLOW:options.fullWorkflow?"1":"0",VIDEO_FIXTURE_VIDEO_DEFINITION:options.videoDefinition?JSON.stringify(options.videoDefinition):"",VIDEO_FIXTURE_EXTRA_VIDEO_MODELS:JSON.stringify(options.extraVideoModels||[]),
    NAUMI_ROUTER_MANAGEMENT_URL:routerUrl,NAUMI_ROUTER_MANAGEMENT_TOKEN:routerToken,
    MODEL_CONFIG_ENVELOPE_SECRET:routerEnvelope,VIDEO_API_BASE_URL:supplier.origin+"/protocol/openai-videos/v1",VIDEO_API_KEY:supplier.token,VIDEO_API_MODEL:"fixture-video",
    OPENAI_BASE_URL:supplier.origin+"/protocol/image/v1",OPENAI_API_KEY:supplier.token,OPENAI_IMAGE_MODEL:"fixture-image"};
  const logs:string[]=[];
  const capture=(name:string,child:ChildProcess)=>{
    const handle=(data:Buffer)=>{let line=data.toString();for(const value of [databaseUrl,supplier.token,env.SETTINGS_SECRET!,workerSecret,mediaSecret,secretAccessKey,env.NAUMI_ROUTER_MANAGEMENT_TOKEN!,env.MODEL_CONFIG_ENVELOPE_SECRET!])line=line.split(value).join("[fixture-secret]");
      line=line.replace(/https?:\/\/[^\s"'<>]+/g,value=>{try{const url=new URL(value);url.search="";url.hash="";url.username="";url.password="";return url.href;}catch{return "[fixture-url]";}});
      logs.push(`${name}: ${line.slice(-3000)}`);if(logs.length>100)logs.shift();void appendFile(path.join(output,"runtime.log"),`${name}: ${line.slice(-3000)}`).catch(()=>{});};
    child.stdout?.on("data",handle);child.stderr?.on("data",handle);
  };
  try {
    if(routerBinary){
      const routesPath=process.env.VIDEO_FIXTURE_ROUTER_ROUTES_CONFIG;
      if(!routesPath)throw new Error("Pinned fixture Router routes are required");
      const configPath=path.join(output,"router-routes.json");await writeFile(configPath,await readFile(routesPath));
      const routerEnv={...cleanEnv(),NAUMI_HTTP_ADDR:`127.0.0.1:${await freePort()}`,NAUMI_ROUTER_MANAGEMENT_ADDR:`127.0.0.1:${router.port}`,NAUMI_ROUTER_TOKEN:randomUUID()+randomUUID(),
        NAUMI_ROUTER_MANAGEMENT_TOKEN:routerToken,MODEL_CONFIG_ENVELOPE_SECRET:routerEnvelope,NAUMI_ROUTES_CONFIG:configPath,NAUMI_STATE_DIR:path.join(output,"router-state"),
        NAUMI_MODEL_CAPACITY_URL:baseUrl+"/api/internal/model-capacity",MODEL_CONFIG_TRUSTED_ORIGINS:[supplier.origin,router.origin,baseUrl].join(",")};
      routerProcess=spawn(routerBinary,[],{cwd:output,env:routerEnv,windowsHide:true,stdio:["ignore","pipe","pipe"]});capture("router",routerProcess);
      let ready=false;const deadline=Date.now()+20000;
      while(Date.now()<deadline){if(routerProcess.exitCode!==null)throw new Error(`Fixture Router exited: ${logs.slice(-3).join("\n")}`);
        ready=await fetch(routerUrl+"/internal/config/state",{headers:{authorization:`Bearer ${routerToken}`},signal:AbortSignal.timeout(2000)}).then(response=>response.ok).catch(()=>false);
        if(ready)break;await new Promise(resolve=>setTimeout(resolve,300));}
      if(!ready)throw new Error("Real fixture Router readiness failed");
    }
    const startMediaWorker=async()=>{
    mediaWorker=spawn(process.execPath,["scripts/video-media-worker.mjs"],{cwd:root,env:{...cleanEnv(),MEDIA_WORKER_FIXTURE_OWNER:"canvas-video-fusion-20261013",MEDIA_WORKER_HOST:"127.0.0.1",MEDIA_WORKER_PORT:String(mediaPort),MEDIA_WORKER_SECRET:mediaSecret,MEDIA_JOB_DIR:env.MEDIA_JOB_DIR},windowsHide:true,stdio:["ignore","pipe","pipe"]});capture("media-worker",mediaWorker);
    const mediaDeadline=Date.now()+15000;let mediaReady=false;
    while(Date.now()<mediaDeadline){if(mediaWorker.exitCode!==null)throw new Error("Fixture media worker exited");mediaReady=await fetch(mediaOrigin+"/health",{headers:{authorization:`Bearer ${mediaSecret}`},signal:AbortSignal.timeout(1000)}).then(r=>r.ok).catch(()=>false);if(mediaReady)break;await new Promise(resolve=>setTimeout(resolve,100));}
    if(!mediaReady)throw new Error("Fixture media worker readiness failed");
    };await startMediaWorker();
    const schemaColumns=async()=> (await sql.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=current_schema() ORDER BY table_name,ordinal_position")).rows;
    const startApp=async(mode:"candidate"|"rollback"="candidate")=>{
      const builtRoot=mode==="rollback"?process.env.VIDEO_FIXTURE_ROLLBACK_APP_ROOT:process.env.VIDEO_FIXTURE_BUILT_APP_ROOT;
      const builtCommit=mode==="rollback"?process.env.VIDEO_FIXTURE_ROLLBACK_SOURCE_COMMIT:process.env.VIDEO_FIXTURE_BUILT_SOURCE_COMMIT;
      const builtVersion=mode==="rollback"?process.env.VIDEO_FIXTURE_ROLLBACK_VERSION:process.env.VIDEO_FIXTURE_BUILT_VERSION;
      if(mode==="rollback"&&!builtRoot)throw new Error("Explicit rollback runtime required");
      if(builtRoot&&(process.platform!=="linux"||builtRoot!==(mode==="rollback"?"/rollback-app":"/fixed-app")||!/^[a-f0-9]{40}$/.test(builtCommit||"")||!/^\d{10}$/.test(builtVersion||"")))throw new Error("Fixed Linux fixture image metadata required");
      // The Linux fixture has no network interface except loopback; its fake
      // BYOC endpoint uses the existing explicit private-network opt-in.
      // Next dev otherwise overrides the heap to half the host's physical RAM,
      // not the commit budget available to this isolated functional fixture.
      const appEnv:NodeJS.ProcessEnv=builtRoot?{...env,NODE_ENV:"production",HOSTNAME:"127.0.0.1",PORT:String(appPort),USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK:"true",SOURCE_COMMIT:builtCommit!,BUILD_VERSION:builtVersion!}:{...env,NODE_OPTIONS:"--max-old-space-size=6144"};
      app=spawn(process.execPath,builtRoot?[path.join(builtRoot,"server.js")]:["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port",String(appPort)],{cwd:builtRoot||root,env:appEnv,windowsHide:true,stdio:["ignore","pipe","pipe"]});capture("app",app);
      const deadline=Date.now()+120_000;let ready=false;
      while(Date.now()<deadline){
        if(app.exitCode!==null)throw new Error(`Fixture app exited ${app.exitCode}: ${logs.slice(-4).join("\n")}`);
        ready=await fetch(baseUrl+"/api/health",{signal:AbortSignal.timeout(5000)}).then(async response=>response.ok&&(await response.json()).db?.ok===true).catch(()=>false);
        if(ready)break;await new Promise(resolve=>setTimeout(resolve,300));
      }
      if(!ready)throw new Error("Fixture app/database readiness failed");
      if(builtRoot){const version=await fetch(baseUrl+"/api/version").then(response=>response.json());if(version.commit!==builtCommit||String(version.version)!==builtVersion)throw new Error("Fixed Linux App version mismatch");}
    };
    let legacySchema:Awaited<ReturnType<typeof schemaColumns>>|undefined;
    let legacySentinel:{email:string;taskId:string;ledgerId:string;settingKey:string}|undefined,legacyRowsBeforeDdl:Record<string,any>|undefined;
    const legacySentinelState=async()=>{
      if(!legacySentinel)throw new Error("Legacy fixture rows required");
      const {email,taskId,ledgerId,settingKey}=legacySentinel,result:Record<string,any>={};
      for(const [label,table,key,value] of [["user","app_users","email",email],["task","app_video_tasks","id",taskId],["ledger","app_ledger","id",ledgerId],["setting","app_settings","k",settingKey]])result[label]=(await sql.query(`SELECT to_jsonb(t) AS value FROM ${table} t WHERE ${key}=$1`,[value])).rows[0]?.value;
      return result;
    };
    if(process.env.VIDEO_FIXTURE_BOOTSTRAP_ROLLBACK==="1"){
      await startApp("rollback");legacySchema=await schemaColumns();
      if(!legacySchema.some(row=>row.table_name==="app_video_tasks"))throw new Error("Legacy runtime did not initialize its actual schema");
      await stopChild(app);
      legacySentinel={email:`legacy-${namespace}@example.test`,taskId:`vid-${randomUUID()}`,ledgerId:`legacy-${randomUUID()}`,settingKey:`legacy-${namespace}`};
      await sql.query("INSERT INTO app_users(email,name,credits_total,credits_used,renews_at) VALUES($1,'Legacy fixture',77,5,now()+interval '1 year')",[legacySentinel.email]);
      await sql.query("INSERT INTO app_ledger(id,email,delta,reason) VALUES($1,$2,-3,'Legacy fixture')",[legacySentinel.ledgerId,legacySentinel.email]);
      await sql.query("INSERT INTO app_settings(k,v) VALUES($1,$2)",[legacySentinel.settingKey,JSON.stringify({enabled:false,seed:0,legacy:"preserve"})]);
      await sql.query("INSERT INTO app_video_tasks(id,email,upstream_id,prompt,status,parameters) VALUES($1,$2,'legacy-fixture','Legacy full prompt','completed',$3::jsonb)",[legacySentinel.taskId,legacySentinel.email,JSON.stringify({request:{prompt:"Legacy full prompt",generateAudio:false,providerOptions:{seed:0}}})]);
      legacyRowsBeforeDdl=await legacySentinelState();
    }
    const legacySource=process.env.VIDEO_FIXTURE_LEGACY_SOURCE_ROOT;
    if(legacySource&&(legacySource!=="/legacy-source"||process.env.VIDEO_FIXTURE_BOOTSTRAP_ROLLBACK!=="1"||(await readFile(path.join(legacySource,".fixture-source-commit"),"utf8")).trim()!==process.env.VIDEO_FIXTURE_ROLLBACK_SOURCE_COMMIT))throw new Error("Pinned legacy fixture source required");
    const seed=JSON.parse(await privateChild(["--conditions=react-server","--import","tsx",legacySource?path.join(legacySource,"scripts/video-fusion/fixture.ts"):"scripts/video-fusion/fixture.ts","--seed-private"],legacySource?{...env,TSX_TSCONFIG_PATH:path.join(legacySource,"tsconfig.json")}:env)) as Seed;
    if(legacySource)legacySchema=await schemaColumns();
    const startWorker=()=>{if(options.startWorker!==false){worker=spawn(process.execPath,["scripts/video-worker.mjs"],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});capture("worker",worker);}};
    await startApp(legacySource?"rollback":"candidate");startWorker();
    await writeFile(path.join(output,"public-run.json"),JSON.stringify({namespace,baseUrl,supplierOrigin:supplier.origin,schemaName,owner:"canvas-video-fusion-20261013"}));
    const countTables=new Set(["app_video_tasks","app_video_results","app_artworks","app_canvas_video_nodes","app_video_media_jobs","app_billing_operations","app_ledger","app_video_reference_uploads","app_video_asset_imports","app_canvas_video_task_sends","app_canvas_video_workflow_sources"]);
    return {baseUrl,supplierOrigin:supplier.origin,refs:seed.refs,accounts:seed.accounts,cookies:seed.cookies,logs,manifest,byocWorkflowId:seed.byocWorkflowId,
      async restartApp(mode:"candidate"|"rollback"="candidate"){await stopChild(worker);await stopChild(app);await startApp(mode);startWorker();},
      legacySchema,schemaColumns,legacyRowsBeforeDdl,legacySentinelState,
      fixtureDatabaseName:new URL(databaseUrl).pathname.slice(1),
      fixtureSchema:schemaName,
      async withAudioFixtureFault<T>(kind:"artwork"|"settlement"|"transcription-settlement"|"adoption",action:()=>Promise<T>){
        const table=kind==="artwork"?"app_artworks":kind==="settlement"||kind==="transcription-settlement"?"app_billing_operations":"app_audio_adoption_links";
        const event=kind==="settlement"||kind==="transcription-settlement"?"UPDATE":"INSERT",condition=kind==="artwork"?"WHEN (NEW.category='audio')":kind==="settlement"||kind==="transcription-settlement"?`WHEN (NEW.feature='${kind==="settlement"?"audio.speech":"audio.transcribe"}' AND NEW.state='settled')`:"";
        await sql.query(`CREATE FUNCTION fixture_audio_write_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned audio fixture write fault'; END $$;CREATE TRIGGER fixture_audio_write_fault BEFORE ${event} ON ${table} FOR EACH ROW ${condition} EXECUTE FUNCTION fixture_audio_write_fault();`);
        try{return await action();}finally{await sql.query(`DROP TRIGGER fixture_audio_write_fault ON ${table};DROP FUNCTION fixture_audio_write_fault()`);}
      },
      async withOwnedStructureLinkFault<T>(id:string,action:()=>Promise<T>){
        if(!/^[A-Za-z0-9._:-]{1,80}$/.test(id)||!(await sql.query("SELECT 1 FROM app_storyboard_roughcuts WHERE email=$1 AND timeline_id=$2",[seed.accounts.a,id])).rowCount)throw new Error("Owned fixture roughcut required");
        await sql.query(`CREATE FUNCTION fixture_structure_link_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned structure link fault'; END $$;CREATE TRIGGER fixture_structure_link_fault BEFORE UPDATE ON app_storyboard_roughcuts FOR EACH ROW WHEN (NEW.timeline_id='${id}') EXECUTE FUNCTION fixture_structure_link_fault();`);
        try{return await action();}finally{await sql.query("DROP TRIGGER fixture_structure_link_fault ON app_storyboard_roughcuts;DROP FUNCTION fixture_structure_link_fault()");}
      },
      async verifyStoryboardCosts(projectKey:string,planId:string){return JSON.parse(await privateChild(["--conditions=react-server","--import","tsx","scripts/verify-storyboard-costs-runtime.ts"],{...env,VIDEO_FIXTURE_ACTION_ACTOR:seed.accounts.a,VIDEO_FIXTURE_ACTION_OTHER:seed.accounts.b,VIDEO_FIXTURE_ACTION_PROJECT:projectKey,VIDEO_FIXTURE_ACTION_PLAN:planId})) as {checks:string[]};},
      async verifyStoryboardAgent(projectKey:string,planId:string){return JSON.parse(await privateChild(["--conditions=react-server","--import","tsx","scripts/verify-storyboard-agent-runtime.ts"],{...env,VIDEO_FIXTURE_ACTION_ACTOR:seed.accounts.a,VIDEO_FIXTURE_ACTION_OTHER:seed.accounts.b,VIDEO_FIXTURE_ACTION_PROJECT:projectKey,VIDEO_FIXTURE_ACTION_PLAN:planId})) as {checks:string[]};},
      async shortLivedFixtureObjectUrl(key:string){
        if(!Object.values(seed.refs).some(ref=>ref.storageKey===key))throw new Error("Owned fixture source required");
        const {AwsV4Signer}=await import("aws4fetch");
        const url=new URL(`${supplier.origin}/objects/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);url.searchParams.set("X-Amz-Expires","2");
        const signed=await new AwsV4Signer({method:"GET",url:url.href,accessKeyId,secretAccessKey,service:"s3",region:"us-east-1",signQuery:true}).sign();return String(signed.url);
      },
      async stopAppForFixtureRestore(){await stopChild(worker);await stopChild(app);},
      async restartOnRestoredFixtureDatabase(name:string){
        if(process.platform!=="linux"||process.env.VIDEO_FIXTURE_BOOTSTRAP_ROLLBACK!=="1"||!/^naumi_video_fixture_restore_[a-f0-9]{32}$/.test(name))throw new Error("Owned restored Linux fixture database required");
        const restored=new URL(databaseUrl);restored.pathname="/"+name;
        const next=await fixtureDatabase(restored.href);
        const present=(await next.query("SELECT to_regclass($1) AS name",[schemaName+".app_video_tasks"])).rows[0].name;
        if(!present){await next.end();throw new Error("Restored fixture task schema missing");}
        await sql.end();sql=next;databaseUrl=restored.href;env.DATABASE_URL=databaseUrl;
        await startApp("rollback");
        return String((await sql.query("SELECT current_database() AS name")).rows[0].name);
      },
      async resetUnconsumedVideoDefaultsForLegacyBootstrap(){
        if(process.env.VIDEO_FIXTURE_BOOTSTRAP_ROLLBACK!=="1")throw new Error("Legacy fixture bootstrap only");
        if(legacySource)return 0;
        if(Number((await sql.query("SELECT count(*) AS n FROM app_video_tasks WHERE ($1::text IS NULL OR id<>$1)",[legacySentinel?.taskId||null])).rows[0].n)!==0)throw new Error("Cannot replace defaults after any seeded-model task exists");
        // Current seed publication eagerly creates defaults. For the old-runtime
        // baseline, let the old code freeze its own values before any task.
        return (await sql.query("DELETE FROM app_video_model_defaults")).rowCount;
      },
      async protectionSnapshot(){
        const names=(await sql.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND (tablename IN ('app_users','app_settings','app_ledger','app_video_model_defaults') OR tablename LIKE 'app_model_%' OR tablename LIKE 'app_billing_%') ORDER BY tablename")).rows.map(row=>String(row.tablename));
        const hashes:Record<string,string>={};
        for(const name of names){if(!/^app_[a-z0-9_]+$/.test(name))throw new Error("Unexpected fixture table");const rows=(await sql.query(`SELECT to_jsonb(t)::text AS value FROM ${name} t ORDER BY to_jsonb(t)::text`)).rows;hashes[name]=createHash("sha256").update(JSON.stringify(rows)).digest("hex");}
        return hashes;
      },
      async restartMediaWorker(){await stopChild(mediaWorker);await startMediaWorker();},
      async mediaWorkerRequest(id:string,method:string,body?:unknown){
        if(!/^[0-9a-f-]{36}$/.test(id))throw new Error("Invalid fixture media job ID");
        const response=await fetch(`${mediaOrigin}/jobs/${id}`,{method,headers:{authorization:`Bearer ${mediaSecret}`,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
        return {status:response.status,body:await response.json()};
      },
      async mediaTemporaryExists(id:string){if(!/^[0-9a-f-]{36}$/.test(id))throw new Error("Invalid fixture media job ID");return stat(path.join(env.MEDIA_JOB_DIR!,id)).then(()=>true).catch(()=>false);},
      async failOwnedQueuedAssembly(id:string){
        if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("Invalid fixture assembly ID");
        const row=(await sql.query("SELECT status,request FROM app_video_media_jobs WHERE email=$1 AND id=$2",[seed.accounts.a,id])).rows[0];
        if(row?.status!=="queued"||row.request.action!=="concat"||row.request.source!=="workflow")throw new Error("Owned queued fixture assembly required");
        // Real local filesystem fault: the actual media engine cannot create its
        // output directory beneath this file. No task success/state is fabricated.
        const directory=path.join(env.MEDIA_JOB_DIR!,id,"fixture-sandbox");await mkdir(directory,{recursive:true});
        await writeFile(path.join(directory,"work"),"owned fixture assembly failure",{flag:"wx"});
      },
      async mediaWorkerMode(mode:"drain"|"resume"){const response=await fetch(`${mediaOrigin}/${mode}`,{method:"POST",headers:{authorization:`Bearer ${mediaSecret}`},signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error("Fixture media control failed");return response.json();},
      async blockVideoOutput(id:string,index:number,extension:string){
        if(!/^vid-[0-9a-f-]{36}$/.test(id)||!Number.isSafeInteger(index)||index<1||!['wav','png','mp4'].includes(extension))throw new Error("Invalid fixture storage fault");
        if(!(await sql.query("SELECT 1 FROM app_video_tasks WHERE email=$1 AND id=$2",[seed.accounts.a,id])).rowCount)throw new Error("Owned fixture task required");
        const directory=path.join(env.MEDIA_DIR!,"videos"),file=path.join(directory,`vid-art-${id}-${index}.${extension}`);await mkdir(directory,{recursive:true});await mkdir(file);
        return async()=>{await rmdir(file);};
      },
      async forceVideoPollDue(id:string){await sql.query("UPDATE app_video_tasks SET next_poll_at=now() WHERE email=$1 AND id=$2 AND status IN ('queued','processing')",[seed.accounts.a,id]);},
      async expireOwnedVideoPollLease(id:string){if(!/^vid-[0-9a-f-]{36}$/.test(id))throw new Error("Owned fixture task required");const result=await sql.query("UPDATE app_video_tasks SET poll_lock_until=now()-interval '1 second' WHERE email=$1 AND id=$2 AND status IN ('queued','processing') AND poll_lock_until>now() RETURNING id",[seed.accounts.a,id]);if(result.rowCount!==1)throw new Error("Active owned fixture poll lease required");},
      supplierCalls:()=>[...supplier.calls,...objectCalls],setScenario:(name:string)=>supplier.setScenario(name),
      async request<T=unknown>(account:Account,method:string,url:string,body?:unknown){
        if(!url.startsWith("/")||url.startsWith("//"))throw new Error("Fixture requests must stay in the fixture app");
        // Inspection/control HTTP must not inherit an idle socket from the App
        // process deliberately killed by restart tests. Browser traffic and the
        // real unknown-acceptance requests keep their original transport. Only
        // read-side transport failures may retry the same actor/URL/deadline.
        // HTTP errors and every mutating method remain exactly one request.
        let response:Response;
        try{
          const init={method,headers:{connection:"close",cookie:seed.cookies[account],...(body!==undefined?{"content-type":"application/json"}:{}),"x-naumi-billing-operation-id":String((body as {idempotencyKey?:string})?.idempotencyKey||randomUUID())},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90_000)};
          for(let attempt=0;;attempt++){
            try{init.signal.throwIfAborted();response=await fetch(baseUrl+url,init);break;}
            catch(error){
              const code=(error as {cause?:{code?:string}})?.cause?.code;
              if(method!=="GET"||init.signal.aborted||attempt>=4||!['ECONNRESET','ECONNREFUSED','EPIPE','UND_ERR_SOCKET'].includes(code||''))throw error;
              logs.push(`fixture-control: GET ${url} transport ${code}; retry same read ${attempt+1}`);
              await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
            }
          }
        }
        catch(error){logs.push(`fixture-control: ${method} ${url} transport failed: ${String(error)}`);throw new Error(`Fixture HTTP ${method} ${url} transport failed`,{cause:error});}
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
      async audioCostEvidence(operationId:string){return JSON.parse(await privateChild(["--conditions=react-server","--import","tsx","scripts/video-fusion/fixture-actions.ts","--audio-cost-evidence"],{...env,VIDEO_FIXTURE_ACTION_ACTOR:seed.accounts.a,VIDEO_FIXTURE_ACTION_SOURCE:operationId}));},
      async setAudioPrice(feature:"audio.speech"|"audio.transcribe",credits:number){return JSON.parse(await privateChild(["--conditions=react-server","--import","tsx","scripts/video-fusion/fixture-actions.ts","--set-audio-price"],{...env,VIDEO_FIXTURE_ACTION_FEATURE:feature,VIDEO_FIXTURE_ACTION_CREDITS:String(credits)}));},
      async setTextPrice(credits:number){if(!Number.isSafeInteger(credits)||credits<0||credits>100)throw new Error("Invalid fixture price");return JSON.parse(await privateChild(["--conditions=react-server","--import","tsx","scripts/video-fusion/fixture-actions.ts","--set-text-price"],{...env,VIDEO_FIXTURE_ACTION_CREDITS:String(credits)})) as {version:number;credits:number};},
      async setMediaPrice(credits:number){if(!Number.isSafeInteger(credits)||credits<0||credits>100)throw new Error("Invalid fixture price");return JSON.parse(await privateChild(["--conditions=react-server","--import","tsx","scripts/video-fusion/fixture-actions.ts","--set-media-price"],{...env,VIDEO_FIXTURE_ACTION_CREDITS:String(credits)})) as {version:number;credits:number};},
      async ownedArtworkVisible(account:Account,id:string){const row=(await sql.query("SELECT deleted_at FROM app_artworks WHERE email=$1 AND id=$2",[seed.accounts[account],id])).rows[0];if(!row)throw new Error("Owned fixture artwork required");return !row.deleted_at;},
      async withForeignMediaScope(account:Account,id:string,action:()=>Promise<void>){
        const email=seed.accounts[account];if(!(await sql.query("SELECT 1 FROM app_artworks WHERE email=$1 AND id=$2",[email,id])).rowCount)throw new Error("Owned fixture artwork required");
        const prior=(await sql.query("SELECT scope_kind,tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='media' AND context_id=$2",[email,id])).rows[0];
        await sql.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'media',$2,'tenant',$3) ON CONFLICT(actor_email,context_kind,context_id) DO UPDATE SET scope_kind='tenant',tenant_id=EXCLUDED.tenant_id",[email,id,randomUUID()]);
        try{await action();}finally{if(prior)await sql.query("UPDATE app_creation_contexts SET scope_kind=$3,tenant_id=$4 WHERE actor_email=$1 AND context_kind='media' AND context_id=$2",[email,id,prior.scope_kind,prior.tenant_id]);else await sql.query("DELETE FROM app_creation_contexts WHERE actor_email=$1 AND context_kind='media' AND context_id=$2",[email,id]);}
      },
      async mediaBillingEvidence(account:Account,id:string){
        if(!/^[0-9a-f-]{36}$/.test(id)||!(await sql.query("SELECT 1 FROM app_video_media_jobs WHERE email=$1 AND id=$2",[seed.accounts[account],id])).rowCount)throw new Error("Owned fixture media job required");
        return {operation:(await sql.query("SELECT state,reserved_credits,charged_credits,quote->>'configVersion' AS quote_version FROM app_billing_operations WHERE email=$1 AND id=$2",[seed.accounts[account],id])).rows[0],reservation:(await sql.query("SELECT cost FROM app_gen_reservations WHERE email=$1 AND job_id=$2",[seed.accounts[account],id])).rows,ledger:(await sql.query("SELECT delta,kind FROM app_ledger WHERE email=$1 AND id=$2",[seed.accounts[account],`led-media-${id}`])).rows};
      },
      async videoBillingEvidence(account:Account,id:string){
        if(!/^vid-[0-9a-f-]{36}$/i.test(id)||!(await sql.query("SELECT 1 FROM app_video_tasks WHERE email=$1 AND id=$2",[seed.accounts[account],id])).rowCount)throw new Error("Owned fixture video task required");
        return {operation:(await sql.query("SELECT state,reserved_credits,charged_credits FROM app_billing_operations WHERE email=$1 AND id=$2",[seed.accounts[account],id])).rows[0],reservation:(await sql.query("SELECT cost FROM app_gen_reservations WHERE email=$1 AND job_id=$2",[seed.accounts[account],id])).rows,ledger:(await sql.query("SELECT delta,kind FROM app_ledger WHERE email=$1 AND id=$2",[seed.accounts[account],`led-video-${id}`])).rows};
      },
      async creditState(account:Account){return (await sql.query("SELECT credits_total,credits_used FROM app_users WHERE email=$1",[seed.accounts[account]])).rows[0];},
      async prepareQueued(account:Account,sourceTask:string){return JSON.parse(await privateChild(["--conditions=react-server","--import","tsx","scripts/video-fusion/fixture-actions.ts","--prepare-queued"],{...env,VIDEO_FIXTURE_ACTION_ACTOR:seed.accounts[account],VIDEO_FIXTURE_ACTION_SOURCE:sourceTask})) as {taskId:string};},
      async checkNodeReservationRollback(account:Account,sourceTask:string){return JSON.parse(await privateChild(["--conditions=react-server","--import","tsx","scripts/video-fusion/fixture-actions.ts","--node-reservation-failure"],{...env,VIDEO_FIXTURE_ACTION_ACTOR:seed.accounts[account],VIDEO_FIXTURE_ACTION_SOURCE:sourceTask})) as {rolledBack:boolean;attemptedTaskId:string};},
      async workflowFreezeState(account:Account,id:string){if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("Invalid fixture workflow ID");const row=(await sql.query("SELECT frozen_nodes_enc,input_digest FROM app_video_workflow_runs WHERE email=$1 AND id=$2",[seed.accounts[account],id])).rows[0];if(!row)throw new Error("Owned fixture workflow required");const parts=String(row.frozen_nodes_enc||"").split(".");return {encrypted:parts.length===3&&Buffer.from(parts[0],"base64").length===12&&Buffer.from(parts[1],"base64").length===16&&Buffer.from(parts[2],"base64").length>0,inputDigestSaved:/^[a-f0-9]{64}$/.test(row.input_digest||"")};},
      async taskPersistence(account:Account,id:string){return (await sql.query("SELECT status,parameters,video_references,capability_snapshot,cancellation_requested_at FROM app_video_tasks WHERE email=$1 AND id=$2",[seed.accounts[account],id])).rows[0];},
      async rollbackTaskState(account:Account,id:string){
        if(!/^vid-[0-9a-f-]{36}$/.test(id))throw new Error("Owned fixture task required");
        const row=(await sql.query("SELECT to_jsonb(t) AS value FROM app_video_tasks t WHERE email=$1 AND id=$2",[seed.accounts[account],id])).rows[0];
        if(!row)throw new Error("Owned fixture task missing");return row.value as Record<string,unknown>;
      },
      async simulateLegacyGeminiPrimaryManifest(account:Account,id:string){
        if(!/^vid-[0-9a-f-]{36}$/.test(id))throw new Error("Invalid owned fixture task");
        const tx=await sql.connect();try{await tx.query("BEGIN");const row=(await tx.query("SELECT parameters,provider_snapshot,status FROM app_video_tasks WHERE email=$1 AND id=$2 FOR UPDATE",[seed.accounts[account],id])).rows[0];const manifest=row?.parameters.resultAssetManifest;
          const profile=row?.provider_snapshot.videoProfile,gemini=profile==="gemini"||((profile===undefined||profile==="")&&row?.provider_snapshot.protocol==="gemini");
          if(!gemini||row.status!=="processing"||manifest?.version!==1||manifest.entries.length!==2||manifest.entries[0].sourceIndex!==-1||!manifest.entries[0].saved||manifest.entries[1].saved)throw new Error("Real saved Gemini primary and unsaved second output required");
          const legacy={version:1,entries:[manifest.entries[0]]};await tx.query("UPDATE app_video_tasks SET parameters=jsonb_set(parameters,'{resultAssetManifest}',$3::jsonb) WHERE email=$1 AND id=$2",[seed.accounts[account],id,JSON.stringify(legacy)]);await tx.query("COMMIT");return legacy;
        }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
      },
      async tick(){const r=await fetch(baseUrl+"/api/video/worker/tick",{method:"POST",headers:{"x-video-worker-secret":workerSecret},signal:AbortSignal.timeout(300_000)});if(!r.ok)throw new Error(`Fixture tick failed ${r.status}`);return r.json();},
      async stop(){await stopChild(worker);await stopChild(app);await stopChild(mediaWorker);await stopChild(routerProcess);await supplier.close();await sql.end();},
    };
  } catch(error){await stopChild(worker);await stopChild(app);await stopChild(mediaWorker);await stopChild(routerProcess);await supplier.close();await sql.end();throw error;}
}
