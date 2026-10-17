// Local preview entry, preserving the original URL/origin and browser data.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const port=Number(process.argv[2]||18482),sourcePort=Number(process.argv[3]||18491);
if(![port,sourcePort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535)||port===sourcePort)throw Error('INVALID_PORTS');
const html=resolve('design/enterprise-demo/preview.html');
const server=createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(400);return res.end();}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  const u=new URL(req.url||'/','http://127.0.0.1:'+port);
  try{
    if(u.pathname==='/'||u.pathname==='/preview.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(await readFile(html));}
    if(u.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
    if(!['/api/enterprise/integration','/api/enterprise/media','/readyz'].includes(u.pathname)){res.writeHead(404);return res.end('not found');}
    const response=await fetch(`http://127.0.0.1:${sourcePort}${u.pathname}${u.search}`,{headers:{Accept:req.headers.accept||'*/*'},signal:AbortSignal.timeout(20000),redirect:'error'});
    res.writeHead(response.status,{...Object.fromEntries(response.headers),'cache-control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Naumi 来源连接暂不可用'}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`PRODUCT_ENTRY_READY: http://127.0.0.1:${port}/preview.html?v=4 original_origin=1 source_loopback=${sourcePort} admin_shell=0`));
