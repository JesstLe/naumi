import { spawn } from 'node:child_process';
import { writeFile,rm } from 'node:fs/promises';
import { createModelFixture } from './model-config-fixture';
async function main(){
  let queries=0,paid=0;
  const f=await createModelFixture((req,res)=>{
    if(req.url==='/stop'){res.end('ok');setTimeout(()=>void close(),100);return;}
    if(req.url==='/stats'){res.setHeader('content-type','application/json');res.end(JSON.stringify({queries,paid}));return;}
    if(req.method==='GET'&&req.url==='/v1/models'){queries++;res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'catalog-image-v2',name:'灵动 2.5 目录验收'},{id:'catalog-text-v1',name:'文字模型 目录验收'}]}));return;}
    if(req.method==='POST')paid++;res.writeHead(405);res.end('Generation forbidden');
  });
  process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
  process.env.NEXT_DIST_DIR='output/provider-catalog-ui-next';process.env.NAUMI_VIDEO_WORKER='0';process.env.NAUMI_MULTI_USER='1';
  process.env.VIDEO_WORKER_SECRET='catalog-ui-fixture-worker-independent-secret-20261007';
  process.env.NAUMI_ROUTER_MANAGEMENT_URL=f.origin;process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN='catalog-fixture-router-independent';
  process.env.MODEL_CONFIG_ENVELOPE_SECRET='catalog-fixture-envelope-independent';process.env.MODEL_CONFIG_TRUSTED_ORIGINS=f.origin;
  const db=await import('../src/lib/db'),auth=await import('../src/lib/admin-auth'),native=await import('../src/lib/native-auth');
  await db.ensureSchema();f.config.providers[0].name='目录验收供应商';await f.repo.current();await auth.setAdminPassword('CatalogFixture2026!');await db.setSetting('multi_user_enabled','1');await db.getOrCreateUser('catalog-member@example.test','普通成员');
  const next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','54981'],{env:process.env,windowsHide:true,stdio:'inherit'});
  let closing=false;
  async function close(){if(closing)return;closing=true;const stop=process.platform==='win32'?spawn('taskkill',['/pid',String(next.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}):undefined;if(!stop)next.kill();else await new Promise(resolve=>stop.once('exit',resolve));await db.getPool().end();await f.cleanup();await rm('output/provider-catalog-ui.json',{force:true});process.exit(0);}
  await writeFile('output/provider-catalog-ui.json',JSON.stringify({control:f.origin,userCookie:native.signUserSession('catalog-member@example.test',Date.now())}));
  process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
}
main().catch(e=>{console.error(e);process.exitCode=1});
