// Isolated API+React acceptance fixture; no production deployment or login issuer.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { once } from 'node:events';
async function main(){
  if(process.env.NAUMI_VERIFY_ISOLATED_DB!=='1'||new URL(process.env.DATABASE_URL!).hostname!=='127.0.0.1')throw new Error('DISPOSABLE_DATABASE_REQUIRED');
  const out=resolve(process.env.NAUMI_INTEGRATION_EVIDENCE_DIR!),meta=JSON.parse(await readFile(resolve(out,'SOURCE_FIXTURE_META.json'),'utf8'));
  Object.assign(process.env,{SETTINGS_SECRET:'enterprise-integration-fixture-0123456789',NAUMI_MULTI_USER:'1',NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'fixture-source-a',NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'shared',NAUMI_ENTERPRISE_ALLOWED_IDS:''});
  const generated=resolve(out,'browser-bundle');await mkdir(generated,{recursive:true});
  await build({entryPoints:['scripts/enterprise-integration-ui-fixture.tsx'],outfile:resolve(generated,'fixture.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'fixture-browser-shell',setup(b){
    b.onResolve({filter:/^(next\/link|next\/navigation|@\/lib\/supabase|@\/lib\/browser-image-cache)$/},args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/link'?"import React from 'react';export default function Link({href,prefetch,...rest}){return <a href={href} {...rest}/>}":args.path==='next/navigation'?"export const useRouter=()=>({replace:()=>{},refresh:()=>{}})":args.path==='@/lib/supabase'?"export const authHeader=async()=>({})":"export async function readBrowserImage(src,signal){const r=await fetch(src,{signal});if(!r.ok)throw Error('MEDIA_DENIED');return r.blob()}"}));
  }}]});
  const api=await import('../src/app/api/admin/enterprise-workbench/route'),native=await import('../src/lib/native-auth'),db=await import('../src/lib/db'),media=await import('../src/app/api/enterprise/media/route');
  const port=18490;
  const server=createServer(async(req,res)=>{try{
    if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(400);return res.end();}
    const url=new URL(req.url||'/','http://127.0.0.1:'+port);
    if(url.pathname==='/') {res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Naumi企业接入 · 隔离验收</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;font-family:Microsoft YaHei,system-ui}button,select,input{font:inherit}*{box-sizing:border-box}</style><div id="app"></div><script src="/fixture.js"></script></html>');}
    if(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'){res.writeHead(200,{'content-type':url.pathname.endsWith('css')?'text/css':'application/javascript'});return res.end(await readFile(resolve(generated,url.pathname.slice(1))));}
    if(url.pathname==='/api/admin/fleet/status'){res.writeHead(200,{'content-type':'application/json'});return res.end('{"enabled":false}');}
    if(url.pathname==='/fixture/dedicated'){process.env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE='dedicated';process.env.NAUMI_ENTERPRISE_ALLOWED_IDS=meta.root;res.writeHead(200);return res.end('fixture dedicated');}
    if(url.pathname==='/fixture/shared'){process.env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE='shared';process.env.NAUMI_ENTERPRISE_ALLOWED_IDS='';res.writeHead(200);return res.end('fixture shared');}
    const request=new Request(url,{headers:{cookie:'nv_user='+native.signUserSession(meta.admin,Date.now())}});
    const response=url.pathname==='/api/admin/enterprise-workbench'?await api.GET(request):url.pathname==='/api/enterprise/media'?await media.GET(request):new Response('not found',{status:404});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){console.error(e);res.writeHead(500);res.end('fixture error')}});
  server.listen(port,'127.0.0.1');await once(server,'listening');
  console.log('INTEGRATION_UI_READY: http://127.0.0.1:18490/ real_route=1 synthetic_accounts=1 disposable_pg=1');
  const close=()=>{server.close(()=>void db.getPool().end().then(()=>process.exit(0)));server.closeAllConnections()};process.once('SIGINT',close);process.once('SIGTERM',close);
}
main().catch(e=>{console.error(e);process.exit(1)});
