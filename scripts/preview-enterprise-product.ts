// Original enterprise UI + real source API with a non-admin synthetic source identity.
// Loopback fixture only. No customer/credential bootstrap is bundled in production routes.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
async function main(){
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL!).hostname!=='127.0.0.1')throw new Error('DISPOSABLE_DATABASE_REQUIRED');
  const out=resolve(process.env.NAUMI_INTEGRATION_EVIDENCE_DIR!),meta=JSON.parse(await readFile(resolve(out,'SOURCE_FIXTURE_META.json'),'utf8'));
  Object.assign(process.env,{SETTINGS_SECRET:'enterprise-integration-fixture-0123456789',NAUMI_MULTI_USER:'1',NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'fixture-source-a',NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'dedicated',NAUMI_ENTERPRISE_ALLOWED_IDS:meta.root});
  const api=await import('../src/app/api/enterprise/integration/route'),native=await import('../src/lib/native-auth'),db=await import('../src/lib/db'),media=await import('../src/app/api/enterprise/media/route');
  const port=Number(process.env.ENTERPRISE_PREVIEW_PORT||18491);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('INVALID_PORT');
  const server=createServer(async(req,res)=>{try{
    if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(400);return res.end();}
    const url=new URL(req.url||'/','http://127.0.0.1:'+port);
    if(req.headers.origin&&req.headers.origin!==url.origin){res.writeHead(403);return res.end();}
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
    if(url.pathname==='/'||url.pathname==='/preview.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(await readFile(resolve('design/enterprise-demo/preview.html')));}
    if(url.pathname==='/readyz'){await db.getPool().query('SELECT 1');res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({status:'ready',fixture:true,product:'enterprise-original-shell'}));}
    if(process.env.ENTERPRISE_FIXTURE_CONTROLS==='1'&&url.pathname==='/fixture/grant'){
      const enabled=url.searchParams.get('enabled')==='1';await db.getPool().query('UPDATE app_account_teams SET enabled=$2 WHERE id=$1',[meta.root,enabled]);res.writeHead(200);return res.end('fixture grant '+enabled);
    }
    const request=new Request(url,{headers:{cookie:'nv_user='+native.signUserSession(meta.owner,Date.now()),Accept:req.headers.accept||'*/*'}});
    const response=url.pathname==='/api/enterprise/integration'?await api.GET(request):url.pathname==='/api/enterprise/media'?await media.GET(request):new Response('not found',{status:404});
    res.writeHead(response.status,{...Object.fromEntries(response.headers),'x-enterprise-fixture':'1'});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'隔离数据源暂不可用'}))}});
  server.listen(port,'127.0.0.1');await once(server,'listening');
  console.log(`PRODUCT_PREVIEW_READY: http://127.0.0.1:${port}/preview.html?v=4 original_shell=1 real_source_route=1 synthetic_enterprise_owner=1 platform_admin=0 disposable_pg=1`);
  const close=()=>{server.close(()=>void db.getPool().end().then(()=>process.exit(0)));server.closeAllConnections()};process.once('SIGINT',close);process.once('SIGTERM',close);
}
main().catch(e=>{console.error(e);process.exit(1)});
