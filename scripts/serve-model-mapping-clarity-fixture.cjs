// Bundle the real ModelManagement, dialogs and CSS modules; mock auth/API only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),esbuild=require('esbuild'),postcss=require('postcss'),tailwind=require('tailwindcss'),ts=require('typescript');
const {createState}=require('./model-mapping-clarity-fixture.cjs');
const port=Number(process.env.FIXTURE_PORT||14688),source=process.argv[2];
(async()=>{
  const compiled=ts.transpileModule(fs.readFileSync('tailwind.config.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,mod={exports:{}};new Function('require','module','exports',compiled)(require,mod,mod.exports);
  const css=(await postcss([tailwind({...mod.exports.default,content:['src/components/admin/**/*.{ts,tsx}']})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')})).css;
  const bundle=await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{ModelManagement}from'./src/components/admin/model-management/model-management';createRoot(document.getElementById('root')).render(<ModelManagement/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'output/model-mapping-clarity-20261017/bundle',format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[{name:'isolated-fixture',setup(b){
    b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
    b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'auth',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='auth'?`export async function authHeader(){return {}}`:`import React from'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`,loader:'tsx',resolveDir:process.cwd()}));
    if(process.env.FIXTURE_SOURCE_ROOT)b.onLoad({filter:/\.(tsx|css)$/},a=>{const rel=path.relative(process.cwd(),a.path);if(rel.startsWith('..'))return;const old=path.join(process.env.FIXTURE_SOURCE_ROOT,rel);if(fs.existsSync(old))return {contents:fs.readFileSync(old,'utf8'),loader:a.path.endsWith('.css')?'local-css':'tsx',resolveDir:path.dirname(a.path)}});
    if(source)b.onLoad({filter:/[\\/]model-management\.tsx$/},()=>({contents:fs.readFileSync(source,'utf8'),loader:'tsx',resolveDir:path.resolve('src/components/admin/model-management')}));
  }}]});
  const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents,modules=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.contents||'';
  let state=createState(),posts=[];
  const server=http.createServer(async(req,res)=>{
    const u=new URL(req.url,'http://fixture'),p=u.pathname;
    const json=(v,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(v))};
    if(p==='/__fixture/state')return json({state,posts});
    if(p==='/__fixture/reset'){state=createState();posts=[];return json({ok:true})}
    if(p==='/api/admin/model-management'){
      if(req.method==='POST'){
        let raw='';for await(const b of req)raw+=b;const op=JSON.parse(raw);posts.push(op);
        if(op.action==='discover')return json(state.catalogs.find(c=>c.providerId===op.providerId));
        if(op.expectedVersion!==state.version)return json({error:'fixture version mismatch'},409);
        const row=state.rows.find(r=>r.id===op.rowId);
        if(op.action==='channels'){row.supplierRouting=op.policy; if(op.policy)row.routes=row.routes.map(r=>({...r,enabled:!!op.policy.channels.find(c=>c.upstreamId===r.upstreamId)?.enabled}));}
        else if(op.action==='rename'||op.action==='identity'){row.label=op.label;if(op.publicId){row.id=op.publicId;row.publicIds=[op.publicId];}}
        else if(op.action==='scope')row.features=row.scopeOptions.filter(f=>op.features.includes(f.id)).map(({id,label})=>({id,label}));
        else if(op.action==='order')state.rows=op.rowIds.map(id=>state.rows.find(r=>r.id===id));
        state.version++;return json({publication:{phase:'applied'}});
      }
      if(u.searchParams.has('feature'))return json({grid:['low','medium','high','xhigh','max','auto'].flatMap(quality=>['1K','2K','4K','5K'].map(resolution=>({quality,effectiveQuality:quality,resolution,available:quality==='medium'&&resolution==='1K',credits:6,estimated:false})))});
      return json(String(req.headers.referer).includes('readonly=1') ? {...state,managed:false} : state);
    }
    if(p.startsWith('/api/'))return json({error:'ISOLATED_FIXTURE_NO_EXTERNAL_CALLS'},403);
    if(p==='/app.js'){res.setHeader('content-type','application/javascript');return res.end(js)}
    if(p==='/style.css'){res.setHeader('content-type','text/css');return res.end(css+'\n'+Buffer.from(modules).toString())}
    if(p==='/checks.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(process.env.FIXTURE_CHECKS||'scripts/verify-model-mapping-clarity-browser.js'))}
    res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>模型管理 · 本地验收</title><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/app.js"></script><script src="/checks.js"></script></body></html>');
  });
  server.listen(port,'127.0.0.1',()=>console.log('FIXTURE_READY=http://127.0.0.1:'+port+' SOURCE='+(source||'modified')+' SUPPLIER_CALLS=0'));
})().catch(e=>{console.error(e);process.exit(1)});
