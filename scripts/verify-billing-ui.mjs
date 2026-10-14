import {spawn,spawnSync} from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {mkdirSync,readFileSync,readdirSync,existsSync,cpSync} from "node:fs";
if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1"||new URL(process.env.DATABASE_URL||"http://invalid").hostname!=="127.0.0.1")throw new Error("Requires isolated local PostgreSQL");
mkdirSync("output/billing-20261003",{recursive:true});
const external=process.env.VERIFY_APP_ORIGIN,base=external||"http://127.0.0.1:31089";
const development=process.env.BILLING_UI_APP_MODE==="development";
if(new URL(base).hostname!=="127.0.0.1")throw new Error("Only local app is permitted");
if(!external&&!development){
 if(!existsSync(".next/standalone/server.js")||!existsSync(".next/static/chunks"))throw new Error("Build the standalone app and client assets before browser acceptance");
 cpSync(".next/static",".next/standalone/.next/static",{recursive:true});
 if(existsSync("public"))cpSync("public",".next/standalone/public",{recursive:true});
}
const schema=`billing_ui_${randomUUID().replaceAll("-","")}`,pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
await pool.query(`CREATE SCHEMA "${schema}"`);
const env={...process.env,PGOPTIONS:`-c search_path=${schema}`,NAUMI_ROUTER_MANAGEMENT_URL:"",SETTINGS_SECRET:"fixture-settings-0123456789abcdef0123456789abcdef0123456789",VIDEO_WORKER_SECRET:"fixture-worker-0123456789abcdef0123456789abcdef0123456789",OPENAI_API_KEY:"local-fixture-key",NAUMI_MULTI_USER:"1",NAUMI_PUBLIC_COMMERCE:"0",VIDEO_WORKER_DISABLED:"1"};
const server=external?null:spawn(process.execPath,development?["node_modules/next/dist/bin/next","dev","-H","127.0.0.1","-p","31089"]:[".next/standalone/server.js"],{env:{...env,PORT:"31089",HOSTNAME:"127.0.0.1"},stdio:"ignore"});
let prepared=false;
function fixture(mode){const result=spawnSync(process.execPath,["node_modules/tsx/dist/cli.mjs","--conditions","react-server","scripts/billing-ui-fixture.ts",...(mode?[mode]:[])],{env,stdio:"inherit"});if(result.status!==0)throw new Error(`Fixture ${mode||"setup"} failed`);}
try{
 let ready=false;for(let i=0;i<(development?300:50);i++){if(server?.exitCode!==null&&server)throw new Error("Local built app exited before readiness");try{const response=await fetch(`${base}/api/health`);if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error("Local app unavailable");
 if(!external&&!development){const chunk=readdirSync(".next/static/chunks").find(name=>name.endsWith(".js"));if(!chunk)throw new Error("No built browser JavaScript chunk");const asset=await fetch(`${base}/_next/static/chunks/${encodeURIComponent(chunk)}`);if(!asset.ok)throw new Error(`Standalone browser assets unavailable (${asset.status})`);}
 fixture();prepared=true;const data=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));
 if(development&&!external){
  // Cold route compilation can trigger HMR during navigation. The fixed CI app has no HMR.
  for(const route of ["/admin","/admin/center","/admin/bi","/admin/billing","/admin/billing/price-table","/admin/pricing"]){const page=await fetch(`${base}${route}`,{headers:{cookie:`nv_admin=${data.adminCookie}`}});await page.arrayBuffer();if(!page.ok)throw new Error(`Development page prewarm failed (${route}: ${page.status})`);}
 }
 const result=spawnSync(process.execPath,["node_modules/@playwright/test/cli.js","test","--config","scripts/billing-ui.config.ts",...(process.env.BILLING_UI_TEST_GREP?["--grep",process.env.BILLING_UI_TEST_GREP]:[])],{env:{...env,BILLING_UI_ADMIN_COOKIE:data.adminCookie},stdio:"inherit"});if(result.status!==0)process.exitCode=result.status||1;
}finally{if(prepared)fixture("cleanup");if(server&&server.exitCode===null&&server.signalCode===null){const stopped=new Promise(resolve=>server.once("exit",resolve));server.kill();await stopped;}await pool.query(`DROP SCHEMA "${schema}" CASCADE`);await pool.end();}
