import {spawn} from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import {mkdirSync,readFileSync,readdirSync,existsSync,createWriteStream,writeFileSync} from "node:fs";
import {finished} from "node:stream/promises";
import {createBillingUiProvider} from "./billing-ui-provider.mjs";
import {sourceIdentity} from "./verification/refactor-runner.mjs";
import {prepareOwnedModelUiProduction} from "./verification/model-ui-production-build.mjs";
if(process.env.NAUMI_VERIFY_ISOLATED_DB!=="1"||new URL(process.env.DATABASE_URL||"http://invalid").hostname!=="127.0.0.1")throw new Error("Requires isolated local PostgreSQL");
mkdirSync("output/billing-20261003",{recursive:true});
const external=process.env.VERIFY_APP_ORIGIN,base=external||"http://127.0.0.1:31089";
const development=process.env.BILLING_UI_APP_MODE==="development";
if(new URL(base).hostname!=="127.0.0.1")throw new Error("Only local app is permitted");
let production;
if(!external&&!development){
 if(!existsSync(".next/standalone/server.js")||!existsSync(".next/static/chunks"))throw new Error("Build the standalone app and client assets before browser acceptance");
 const root=process.cwd(),run=path.resolve("output/billing-20261003/runs",randomUUID());
 mkdirSync(run,{recursive:true});
 // Each browser suite owns its assembled runtime. Never append static/public
 // assets to, or start a server inside, the shared sealed build tree.
 production=await prepareOwnedModelUiProduction({root,source:await sourceIdentity(root),target:path.join(run,"production"),manifestFile:process.env.NAUMI_MODEL_UI_PRODUCTION_MANIFEST});
 writeFileSync(path.join(run,"PRODUCTION.json"),JSON.stringify(production.evidence,null,2)+"\n");
}
const schema=`billing_ui_${randomUUID().replaceAll("-","")}`,pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
await pool.query(`CREATE SCHEMA "${schema}"`);
const supplier=await createBillingUiProvider();
const env={...process.env,...production?.environment,PGOPTIONS:`-c search_path=${schema}`,BILLING_UI_PROVIDER_ORIGIN:supplier.origin,OPENAI_BASE_URL:supplier.origin+"/v1",MODEL_CONFIG_TRUSTED_ORIGINS:supplier.origin,NAUMI_ROUTER_MANAGEMENT_URL:"",SETTINGS_SECRET:"fixture-settings-0123456789abcdef0123456789abcdef0123456789",VIDEO_WORKER_SECRET:"fixture-worker-0123456789abcdef0123456789abcdef0123456789",OPENAI_API_KEY:"local-fixture-key",NAUMI_MULTI_USER:"1",NAUMI_PUBLIC_COMMERCE:"0",VIDEO_WORKER_DISABLED:"1"};
const logs=external?[]:[createWriteStream("output/billing-20261003/ui-app.stdout.log"),createWriteStream("output/billing-20261003/ui-app.stderr.log")];
const server=external?null:spawn(process.execPath,development?["node_modules/next/dist/bin/next","dev","-H","127.0.0.1","-p","31089"]:[production.server],{env:{...env,PORT:"31089",HOSTNAME:"127.0.0.1"},stdio:["ignore","pipe","pipe"]});
server?.stdout.pipe(logs[0]);server?.stderr.pipe(logs[1]);
let prepared=false;
async function execute(args,childEnv){return await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env:childEnv,stdio:"inherit"});child.once("error",reject);child.once("exit",(code,signal)=>{if(signal)reject(new Error(`Browser child exited by ${signal}`));else resolve(code??1);});});}
async function fixture(mode){const status=await execute(["node_modules/tsx/dist/cli.mjs","--conditions","react-server","scripts/billing-ui-fixture.ts",...(mode?[mode]:[])],env);if(status!==0)throw new Error(`Fixture ${mode||"setup"} failed (exit ${status})`);}
try{
 let ready=false;for(let i=0;i<(development?300:50);i++){if(server?.exitCode!==null&&server)throw new Error("Local built app exited before readiness");try{const response=await fetch(`${base}/api/health`);if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error("Local app unavailable");
 if(!external&&!development){const chunk=readdirSync(".next/static/chunks").find(name=>name.endsWith(".js"));if(!chunk)throw new Error("No built browser JavaScript chunk");const asset=await fetch(`${base}/_next/static/chunks/${encodeURIComponent(chunk)}`);if(!asset.ok)throw new Error(`Standalone browser assets unavailable (${asset.status})`);}
 await fixture();prepared=true;const data=JSON.parse(readFileSync("output/billing-20261003/ui-fixture.json","utf8"));
 if(development&&!external){
  // Cold route compilation can trigger HMR during navigation. The fixed CI app has no HMR.
  for(const route of ["/admin","/admin/center","/admin/bi","/admin/billing","/admin/billing/price-table","/admin/pricing"]){const page=await fetch(`${base}${route}`,{headers:{cookie:`nv_admin=${data.adminCookie}`}});await page.arrayBuffer();if(!page.ok)throw new Error(`Development page prewarm failed (${route}: ${page.status})`);}
 }
 const status=await execute(["node_modules/@playwright/test/cli.js","test","--config","scripts/billing-ui.config.ts",...(process.env.BILLING_UI_TEST_GREP?["--grep",process.env.BILLING_UI_TEST_GREP]:[])],{...env,BILLING_UI_ADMIN_COOKIE:data.adminCookie});if(status!==0)process.exitCode=status;
}finally{
 try{if(prepared)await fixture("cleanup");}
 finally{
  if(server&&server.exitCode===null&&server.signalCode===null){const stopped=new Promise(resolve=>server.once("exit",resolve));server.kill();await stopped;}
  await Promise.all(logs.map(log=>finished(log)));
  writeFileSync("output/billing-20261003/ui-provider.json",JSON.stringify(supplier.snapshot(),null,2)+"\n");
  await supplier.close();await pool.query(`DROP SCHEMA "${schema}" CASCADE`);await pool.end();
 }
}
