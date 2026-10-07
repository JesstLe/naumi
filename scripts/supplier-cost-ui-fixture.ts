import { spawn } from "node:child_process";
import { writeFile,mkdir,rm } from "node:fs/promises";
import { createModelFixture } from "./model-config-fixture";
async function main(){
  const f=await createModelFixture((req,res)=>{if(req.url==='/stop'){res.end('ok');setTimeout(()=>void close(),100)}else{res.writeHead(405);res.end('No supplier requests in UI acceptance')}});
  process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;process.env.NEXT_DIST_DIR='output/supplier-ui-next';process.env.NAUMI_VIDEO_WORKER='0';process.env.NAUMI_MULTI_USER='1';process.env.VIDEO_WORKER_SECRET='supplier-ui-fixture-worker-secret-independent';
  process.env.NAUMI_ROUTER_MANAGEMENT_URL=f.origin;process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN='supplier-ui-fixture-router-control-independent';process.env.MODEL_CONFIG_ENVELOPE_SECRET='supplier-ui-fixture-envelope-independent';process.env.MODEL_CONFIG_TRUSTED_ORIGINS=f.origin;
  const db=await import('../src/lib/db'),{setAdminPassword}=await import('../src/lib/admin-auth'),{signUserSession}=await import('../src/lib/native-auth');
  await db.ensureSchema();await f.repo.current();await setAdminPassword('SupplierFixture2026!');await db.setSetting('multi_user_enabled','1');await db.getOrCreateUser('fixture-cost@example.test','成本验收');
  const {createSupplierLedger}=await import('../src/lib/supplier-cost/repository'),{apimartTask}=await import('../src/lib/supplier-cost/adapters'),{accountIdentity}=await import('../src/lib/supplier-cost/runtime');
  const ledger=createSupplierLedger(f.sql),id=accountIdentity(f.origin,'ui-fixture-only');await ledger.account({id,providerId:'apimart-fixture',protocol:'apimart-images',baseUrl:f.origin,label:'APIMart 验收 fixture'});
  for(let i=0;i<3;i++){const c=await ledger.begin({accountId:id,providerId:'apimart-fixture',attemptId:'fixture-'+i,operationId:'fixture-ui-operation',userEmail:'fixture-cost@example.test',feature:'canvas.image',publicModelId:'灵动2.5 fixture',model:'ext-fixture',phase:i?'upgrade':'generation'});await ledger.apply(c.id,apimartTask({data:{id:'fixture-task-'+i,status:i===2?'failed':'completed',...(i===2?{}:{cost:i===0?'0.021':'0',credits_cost:i===0?'0.21':'0'}),completed:1780819200}},'fixture-task-'+i));}
  const next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','54980'],{env:process.env,windowsHide:true,stdio:'inherit'});
  let closing=false;
  async function close(){if(closing)return;closing=true;if(process.platform==='win32')spawn('taskkill',['/pid',String(next.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else next.kill();await db.getPool().end();await f.cleanup();await rm('output/supplier-ui-fixture.json',{force:true});process.exit(0)}
  await mkdir('output',{recursive:true});await writeFile('output/supplier-ui-fixture.json',JSON.stringify({control:f.origin,account:id,userCookie:signUserSession('fixture-cost@example.test',Date.now())}));
  process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
}
main().catch(e=>{console.error(e);process.exitCode=1});
