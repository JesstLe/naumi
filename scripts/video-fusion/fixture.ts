import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

export async function fixtureDatabase(url = process.env.DATABASE_URL || "") {
  const parsed=new URL(url);
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1"||parsed.hostname!=="127.0.0.1"||!/^\/naumi_video_fixture_[a-z0-9_]+$/.test(parsed.pathname))
    throw new Error("An explicitly isolated loopback video fixture database is required");
  const sql=new Pool({connectionString:url,ssl:false,max:5});
  try {
    const current=(await sql.query("SELECT current_database() AS name")).rows[0].name;
    if(current!==parsed.pathname.slice(1))throw new Error("Fixture database identity mismatch");
    const marked=(await sql.query("SELECT to_regclass('public.naumi_video_fixture_guard') AS name")).rows[0].name;
    if(!marked)throw new Error("Video fixture owner marker is required");
    const marker=(await sql.query("SELECT owner FROM public.naumi_video_fixture_guard LIMIT 1")).rows[0];
    if(marker?.owner!=="canvas-video-fusion-20261013")throw new Error("Database belongs to another task");
    return sql;
  } catch(error) {await sql.end();throw error;}
}
export async function seedVideoFixture() {
  const guard=await fixtureDatabase();await guard.end();
  const db=await import("../../src/lib/db");
  await db.ensureSchema();
  await db.setSetting("credits_metering","1");
  const {createCredentialStore}=await import("../../src/lib/model-config/credentials");
  const {createModelRepository}=await import("../../src/lib/model-config/repository");
  const {fixtureModelConfig}=await import("../model-config-unit-fixture");
  const {CAP_RICH}=await import("./profiles");
  const {videoWireProfileSchema,videoProfileProtocol}=await import("../../src/lib/video/capability-schema");
  const profile=videoWireProfileSchema.parse(process.env.VIDEO_FIXTURE_VIDEO_PROFILE||"ark"),protocol=videoProfileProtocol(profile);
  const credentials=createCredentialStore(db.getPool());
  const imageKey=await credentials.importPlain({providerId:"p1",plain:process.env.OPENAI_API_KEY!,actor:"fixture"});
  const videoKey=await credentials.importPlain({providerId:"fixture-video-provider",plain:process.env.VIDEO_API_KEY!,actor:"fixture"});
  const config=fixtureModelConfig(process.env.OPENAI_BASE_URL!,imageKey.id);
  config.providers.push({id:"fixture-video-provider",name:"Fixture video supplier",protocol,baseUrl:process.env.VIDEO_FIXTURE_SUPPLIER_ORIGIN!+`/protocol/${protocol}`+(protocol==="ark"?"/api/v3":""),credentialRef:videoKey.id,enabled:true,timeoutMs:120000,maxConcurrent:4});
  config.upstreamModels.push({id:"fixture-video-upstream",providerId:"fixture-video-provider",model:"wire-video",label:"Fixture upstream",modality:"video",enabled:true,
    capabilities:{verified:true,generate:true,edit:true,vision:false,transparent:false,preserveIdentity:false,textAccuracy:false,qualityRank:3,qualities:[],nativeResolutions:[],maxReferenceImages:30,expectedLatencyMs:0,video:CAP_RICH},parameterMap:{videoProfile:profile}});
  config.publicModels.push({id:"video-a",label:"Fixture video",modality:"video",enabled:true,visible:true,target:{type:"upstream",id:"fixture-video-upstream"}});
  config.publicModels.push({id:"disabled-model",label:"Disabled fixture",modality:"video",enabled:false,visible:true,target:{type:"upstream",id:"fixture-video-upstream"}});
  config.bindings["video.generate"]="video-a";
  const repo=createModelRepository({pool:db.getPool(),trustedOrigins:(process.env.MODEL_CONFIG_TRUSTED_ORIGINS||"").split(","),initialize:async()=>config});
  await repo.current();
  const { uploadImage }=await import("../../src/lib/storage");
  const { signUserSession }=await import("../../src/lib/native-auth");
  const root=path.resolve(process.env.VIDEO_FIXTURE_ASSETS_ROOT || "");
  const manifest=JSON.parse(await readFile(path.join(root,"manifest.json"),"utf8"));
  const accounts={a:`video-a-${randomUUID()}@example.test`,b:`video-b-${randomUUID()}@example.test`};
  for(const [id,email] of Object.entries(accounts)) {
    await db.getOrCreateUser(email,`Video fixture ${id}`);
    await db.adjustUserCredits(email,10000,"isolated video fixture",{id:randomUUID(),actor:"fixture"});
  }
  await db.setUserRole(accounts.a,"admin");
  const refs:Record<string,unknown>={};
  for(const [kind,name] of [["image","first.png"],["lastImage","last.png"],["video","landscape-4-audio.mp4"],["audio","tone-8.wav"]]) {
    const info=manifest.files.find((entry:{name:string})=>entry.name===name);
    if(!info)throw new Error(`Fixture asset missing ${name}`);
    const storageKey=`video-fixture/${randomUUID()}/${name}`;
    const url=await uploadImage(await readFile(path.join(root,name)),info.mimeType,storageKey,undefined,accounts.a);
    const id=`fixture-art-${randomUUID()}`,category=kind==="video"?"video":kind==="audio"?"audio":"main";
    await db.addArtworks(accounts.a,[{id,title:`Fixture ${kind}`,category,prompt:"original test media",status:"completed",image:url,videoUrl:category==="main"?null:url,
      gradient:"from-slate-100 to-zinc-100",style:null,ratio:info.aspectRatio||"16:9",resolution:"1K",source:"upload",origin:"canvas",parentId:null,
      width:info.width,height:info.height}],`fixture-${randomUUID()}`);
    refs[kind]={...info,id,url,storageKey};
  }
  // Cookie data is emitted only over the parent fixture's private pipe, never as test evidence.
  await db.saveComfyEndpoint(accounts.a,{name:"Fixture ComfyUI",baseUrl:process.env.VIDEO_FIXTURE_SUPPLIER_ORIGIN!+"/protocol/comfyui",apiKey:process.env.VIDEO_API_KEY!,activate:true});
  const workflows=await db.saveComfyWorkflow(accounts.a,{name:"Fixture durable video",apiJson:{"load-image":{class_type:"LoadImage",inputs:{image:"old.png"}},"encode":{class_type:"CLIPTextEncode",inputs:{text:"fixture video"}},"save-video":{class_type:"SaveVideo",inputs:{frames:["load-image",0]}}},inputs:{},required:["LoadImage","CLIPTextEncode","SaveVideo"]});
  const byocWorkflowId=workflows.find(workflow=>workflow.name==="Fixture durable video")!.id;
  const cookies=Object.fromEntries(Object.entries(accounts).map(([id,email])=>[id,`nv_user=${signUserSession(email,Date.now())}`]));
  await db.getPool().end();
  return {accounts,cookies,refs,byocWorkflowId};
}
if(process.argv.includes("--seed-private")) {
  if(process.env.VIDEO_FIXTURE_PARENT_PIPE!=="1")throw new Error("Private fixture seed must be started by its parent harness");
  void seedVideoFixture().then(result=>process.stdout.write(JSON.stringify(result))).catch(error=>{
    let message=error instanceof Error?error.message:"Private video fixture bootstrap failed";
    for(const [key,value] of Object.entries(process.env))if(value&&/PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL/.test(key))message=message.split(value).join("[fixture-secret]");
    message=message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[fixture-database]");process.stderr.write(message.slice(0,1200)+"\n");process.exitCode=1;
  });
}
