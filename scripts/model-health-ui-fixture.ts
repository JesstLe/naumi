import {spawn} from "node:child_process";
import {mkdir,writeFile,rm} from "node:fs/promises";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
import {fixtureConfig} from "./billing-unit-fixture";
import {createHealthRepository} from "../src/lib/model-health/repository";
import {configuredHealthTargets} from "../src/lib/model-health/targets";

async function main(){
  const out="output/model-health-ui-fixture";let close=async()=>{},paid=0,catalogCalls=0;
  const png=await sharp({create:{width:8,height:8,channels:3,background:"#1475ef"}}).png().toBuffer();
  const f=await createModelFixture(async(req,res)=>{
    const send=(status:number,body:unknown)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(body));};
    if(req.url==="/stop"){send(200,{});setTimeout(()=>void close(),50);return;}
    if(req.url==="/stats"){send(200,{paid,catalogCalls});return;}
    if(req.url?.endsWith("/models")){catalogCalls++;send(200,{data:Array.from({length:258},(_,i)=>({id:`unused-${i}`}))});return;}
    if(req.url==="/v1/images/generations"&&req.method==="POST"){
      const parts=[];for await(const chunk of req)parts.push(chunk);const body=JSON.parse(Buffer.concat(parts).toString());paid++;
      if(body.model==="configured-3"){send(401,{error:{message:"fixture-auth-error"}});return;}
      send(200,{data:[{b64_json:png.toString("base64")}]});return;
    }
    send(405,{error:"unexpected fixture request"});
  });
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NEXT_DIST_DIR:`${out}/next-${Date.now()}`,NAUMI_MULTI_USER:"1",NAUMI_VIDEO_WORKER:"0",VIDEO_WORKER_SECRET:"health-fixture-independent-video-worker-secret",MODEL_HEALTH_WORKER_SECRET:"model-health-ui-fixture-worker-secret-only",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:"health-ui-fixture-router-private-token-independent-long",MODEL_CONFIG_ENVELOPE_SECRET:"health-ui-fixture-envelope-private-secret-independent-long",MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,STORAGE_DRIVER:"local"});
  f.config.providers[0].name="已配置图片供应商";
  f.config.upstreamModels[0].label="业务近期已验证";f.config.upstreamModels[0].model="configured-1";
  f.config.upstreamModels.push({...structuredClone(f.config.upstreamModels[0]),id:"u2",label:"轻量生图",model:"configured-2"},{...structuredClone(f.config.upstreamModels[0]),id:"u3",label:"高质量生图",model:"configured-3"});
  const db=await import("../src/lib/db"),auth=await import("../src/lib/admin-auth"),native=await import("../src/lib/native-auth");
  await db.ensureSchema();await db.setSetting("multi_user_enabled","1");await f.repo.current();await auth.setAdminPassword("HealthFixture2026!");
  await db.getOrCreateUser("health-member@example.test","普通成员");
  const {createConfigRuntime}=await import("../src/lib/billing/catalog");
  const billing=createConfigRuntime({pool:f.sql,ensureSchema:db.ensureSchema,initialize:async()=>fixtureConfig()});await billing.current();
  const repo=createHealthRepository(f.sql),targets=configuredHealthTargets(f.config);
  await repo.observe(targets[0],{success:true,reason:null,status:200,latencyMs:1520});
  await repo.observe(targets[2],{success:false,reason:"authentication",status:401,latencyMs:230});
  await repo.policy();await f.sql.query("UPDATE app_model_health_policy SET last_tick_at=now()");
  await mkdir(out,{recursive:true});
  const env={...process.env};delete env.NODE_OPTIONS;
  const child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port","54987"],{env,stdio:"inherit",windowsHide:true});
  let closing=false;
  close=async()=>{if(closing)return;closing=true;if(process.platform==="win32")await new Promise(resolve=>spawn("taskkill",["/pid",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true}).once("exit",resolve));else child.kill();await db.getPool().end();await f.cleanup();await rm(`${out}/fixture.json`,{force:true});process.exit(0);};
  await writeFile(`${out}/fixture.json`,JSON.stringify({control:f.origin,schemaName:f.schemaName,memberCookie:native.signUserSession("health-member@example.test",Date.now())}));
  process.on("SIGTERM",()=>void close());process.on("SIGINT",()=>void close());
}
main().catch(error=>{console.error(error);process.exitCode=1;});
