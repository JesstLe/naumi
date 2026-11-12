import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';

// Render the production component against saved real-PG read models. Only
// navigation, authentication and HTTP transport are replaced by fixture ports.
const out=resolve(process.argv[2]);
const evidence=resolve(process.argv[3]);
const port=Number(process.env.UI_FIXTURE_PORT||65439);
await mkdir(out,{recursive:true});
const data=JSON.parse(await readFile(resolve(evidence,'UI_FIXTURE.json'),'utf8'));
const entry=`import React from 'react';import{createRoot}from'react-dom/client';
import{CreationBrowser}from'${resolve('src/components/saas/creation-browser.tsx').replaceAll('\\','/')}';
const fixture=${JSON.stringify(data)};
window.__fixture=fixture;window.__requests=[];
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,options)=>{
 const url=new URL(String(input),location.origin);window.__requests.push(url.pathname+url.search);
 const base='/api/'+(url.pathname.startsWith('/api/enterprise')?'enterprise':'admin')+'/creations';
 if(!url.pathname.startsWith(base))return nativeFetch(input,options);
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
 if(url.pathname.includes('/assets/'))return nativeFetch('/fixture.png');
 if(url.pathname===base){
  const p=url.searchParams;let rows=fixture.page.items.filter(item=>(!p.get('status')||item.status===p.get('status'))&&(!p.get('user')||item.actorEmail===p.get('user'))&&(!p.get('q')||item.title.toLowerCase().includes(p.get('q').toLowerCase()))&&(!p.get('from')||item.acceptedAt.slice(0,10)>=p.get('from'))&&(!p.get('to')||item.acceptedAt.slice(0,10)<=p.get('to')));
  const page=Number(p.get('page')||1),size=4;
  return json({...fixture.page,items:rows.slice((page-1)*size,page*size),pagination:{total:rows.length,page,size},appliedFilters:Object.fromEntries(p)});
 }
 const id=decodeURIComponent(url.pathname.slice(base.length+1));const key=id===fixture.oldId?fixture.root:id;
 const original=fixture.details[key];if(!original)return json({error:'记录不存在'},404);
 const detail=structuredClone(original),eventPage=Number(url.searchParams.get('eventPage')||1);
 if(fixture.eventPages[key]){detail.events=fixture.eventPages[key][eventPage-1]||[];detail.eventPagination.page=eventPage;}
 return json(detail);
};
createRoot(document.getElementById('root')).render(<CreationBrowser enterprise={new URLSearchParams(location.search).get('fixtureEnterprise')==='1'}/>);`;
await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:resolve(out,'fixture.js'),define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-ports',setup(b){
 b.onResolve({filter:/^(next\/navigation|@\/lib\/auth-context|@\/lib\/supabase)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',resolveDir:process.cwd(),contents:a.path==='next/navigation'?`import{useSyncExternalStore}from'react';const original=history.replaceState.bind(history);history.replaceState=(...args)=>{original(...args);dispatchEvent(new Event('popstate'))};const listen=f=>{addEventListener('popstate',f);return()=>removeEventListener('popstate',f)};export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(listen,()=>location.search));`:a.path.endsWith('auth-context')?`export const useAuth=()=>({user:{email:'fixture@example.test'}});`:`export const authHeader=async()=>({});`}));
}}]});
await writeFile(resolve(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>创作记录</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#f7f9fc;font-family:Arial,"Microsoft YaHei",sans-serif}main{padding:24px;max-width:1440px;margin:auto}h1{font-size:23px;color:#13243a;margin:0 0 20px}@media(max-width:600px){main{padding:12px}}</style><main><h1>创作记录</h1><div id="root"></div></main><script src="/fixture.js"></script></html>`);
// A local valid PNG exercises the existing authorized blob/media and lightbox UI.
await writeFile(resolve(out,'fixture.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5H0AAAAASUVORK5CYII=','base64'));
const server=createServer(async(req,res)=>{
 try{const pathname=new URL(req.url,'http://localhost').pathname;const file=['/fixture.js','/fixture.css','/fixture.png'].includes(pathname)?pathname.slice(1):'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.end(await readFile(resolve(out,file)));}
 catch{res.statusCode=500;res.end('fixture read failed');}
});
server.listen(port,'127.0.0.1',()=>console.log('UNIFIED_CREATIONS_UI=http://127.0.0.1:'+port+' REAL_COMPONENT=1 DATA=PG_FIXTURE SUPPLIER_CALLS=0'));
