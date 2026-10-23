// Local preview entry, preserving the original URL/origin and browser data.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
const port=Number(process.argv[2]||18482),sourcePort=Number(process.argv[3]||18491);
if(![port,sourcePort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535)||port===sourcePort)throw Error('INVALID_PORTS');
const html=resolve('design/enterprise-demo/preview.html');
const importConfig=resolve(process.argv[4]||'data/enterprise-local-import/connection.json');
const localSession=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
const same=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const server=createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(400);return res.end();}
  const u=new URL(req.url||'/','http://127.0.0.1:'+port);
  try{
    if(u.pathname==='/api/enterprise/workflow'){res.writeHead(503,{'content-type':'application/json','cache-control':'private, no-store'});return res.end(JSON.stringify({error:'WORKFLOW_LOGIN_NOT_CONFIGURED'}));}
    if(u.pathname==='/api/enterprise/imports'){
      const fail=(code,error)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error}));};
      if((req.headers.origin&&req.headers.origin!==u.origin)||['cross-site','same-site'].includes(req.headers['sec-fetch-site']))return fail(403,'ORIGIN_DENIED');
      const action=u.searchParams.get('action');
      let config;try{config=JSON.parse(await readFile(importConfig,'utf8'));}catch{return fail(503,'LOCAL_IMPORT_NOT_CONFIGURED');}
      if(!Number.isInteger(config.port)||config.port<1024||config.port>65535||typeof config.token!=='string')return fail(503,'LOCAL_IMPORT_CONFIG_INVALID');
      if(action==='session'&&req.method==='GET'){
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','set-cookie':`enterprise_import_session=${localSession}; HttpOnly; SameSite=Strict; Path=/api/enterprise/imports`});return res.end(JSON.stringify({csrf,mode:'local-owner'}));
      }
      const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('enterprise_import_session='))?.slice('enterprise_import_session='.length);
      if(!same(cookie,localSession))return fail(401,'LOCAL_SESSION_REQUIRED');
      if(!['source-snapshot','worksheet','worksheet-audit','worksheet-command','worksheet-upload','worksheet-file','context','rows','references','reference-asset','asset','resolve','people','people-audit','people-profile','people-roster-preview','people-roster-apply','people-preview','people-apply','orders','order','intake','command'].includes(action))return fail(400,'INVALID_ACTION');
      const write=['worksheet-command','worksheet-upload','resolve','people-profile','people-roster-preview','people-roster-apply','people-preview','people-apply','intake','command'].includes(action);if(req.method!==(write?'POST':'GET'))return fail(405,'METHOD_NOT_ALLOWED');
      if(write&&(!same(req.headers['x-csrf-token'],csrf)||req.headers.origin!==u.origin))return fail(403,'CSRF_REQUIRED');
      const keys=action==='source-snapshot'?['op','enterpriseId','kind','email','from','to','page','id']:['source','id','orderId','download','thumb','query','status','page','before'];
      const args=new URLSearchParams();for(const key of keys)if(u.searchParams.has(key))args.set(key,u.searchParams.get(key));
      const chunks=[];let size=0;if(write){for await(const chunk of req){size+=chunk.length;if(size>(action==='worksheet-upload'?6*1024*1024:action==='resolve'?8192:256*1024))return fail(413,'BODY_TOO_LARGE');chunks.push(chunk);}}
      const response=await fetch(`http://127.0.0.1:${config.port}/v1/import/${action}?${args}`,{method:req.method,headers:{authorization:'Bearer '+config.token,'content-type':'application/json'},...(write?{body:Buffer.concat(chunks)}:{}),signal:AbortSignal.timeout(30000),redirect:'error'});
      res.writeHead(response.status,{...Object.fromEntries(response.headers),'cache-control':'private, no-store'});
      if(response.body){const stream=Readable.fromWeb(response.body);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}else res.end();return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
    if(u.pathname==='/'||u.pathname==='/preview.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"frame-ancestors 'none'",'x-frame-options':'DENY'});return res.end(await readFile(html));}
    if(u.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
    if(!['/api/enterprise/integration','/api/enterprise/media','/readyz'].includes(u.pathname)){res.writeHead(404);return res.end('not found');}
    const response=await fetch(`http://127.0.0.1:${sourcePort}${u.pathname}${u.search}`,{headers:{Accept:req.headers.accept||'*/*'},signal:AbortSignal.timeout(20000),redirect:'error'});
    res.writeHead(response.status,{...Object.fromEntries(response.headers),'cache-control':'no-store'});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Naumi 来源连接暂不可用'}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`PRODUCT_ENTRY_READY: http://127.0.0.1:${port}/preview.html?v=4 original_origin=1 source_loopback=${sourcePort} admin_shell=0`));
