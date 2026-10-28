'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createServer}=require('node:http'),{createHash,randomBytes}=require('node:crypto');
const ts=require('typescript'),esbuild=require('esbuild'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),mode=process.argv[2]||'modified';
const source=process.env.PEAK_BEFORE_DIR&&mode==='baseline'?path.resolve(process.env.PEAK_BEFORE_DIR):root;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function functions(file,names,context){
 const text=fs.readFileSync(path.join(source,file),'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));
 assert.equal(nodes.length,names.length,'actual source function extraction is complete');
 const code=ts.transpileModule(nodes.map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,Buffer,Error,Response,ReadableStream,Uint8Array,URL,console,...context});return exports;
}
async function main(){
 assert.ok(['baseline','modified'].includes(mode));
 const connections=new Set(),responses=new Map();let gets=0,lastCache;const originals=globalThis.fetch;
 const large=await sharp(randomBytes(2400*2400*4),{raw:{width:2400,height:2400,channels:4}}).png({compressionLevel:0}).toBuffer();
 assert.ok(large.length>12*1024*1024&&large.length<64*1024*1024);
 const small=await sharp({create:{width:8,height:8,channels:3,background:'red'}}).png().toBuffer();
 const server=createServer((req,res)=>{
  const key=req.url.split('/').at(-1);gets++;responses.set(key,res);
  if(['declared','over-output','error','missing'].includes(key)){
   res.writeHead(key==='error'?503:key==='missing'?404:200,{'content-type':'image/png','content-length':String(key==='over-output'?65*1024*1024:large.length)});
   res.flushHeaders();res.write(Buffer.alloc(65536,1));return; // A real unconsumed transport, not a fake cancellation counter.
  }
  if(key==='chunked'){res.writeHead(200,{'content-type':'image/png'});res.write(Buffer.alloc(256*1024,4));return;}
  if(key==='abort'){res.writeHead(200,{'content-type':'image/png','content-length':String(large.length)});res.flushHeaders();res.write(Buffer.alloc(64,4));return;}
  const bytes=key==='large'?large:small;res.writeHead(200,{'content-type':'image/png','content-length':String(bytes.length)});res.end(bytes);
 });
 server.on('connection',s=>{connections.add(s);s.on('close',()=>connections.delete(s));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 globalThis.fetch=(input,init)=>{lastCache=init?.cache;return originals(input,init);};
 try{
  const entry=path.join(source,'src/lib/object-storage/adapter.ts');
  const built=await esbuild.build({stdin:{contents:fs.readFileSync(entry,'utf8'),resolveDir:path.join(root,'src/lib/object-storage'),sourcefile:entry,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'server-only-test',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
  const module={exports:{}};new Function('module','exports','require',built.outputFiles[0].text)(module,module.exports,require);
  const backend=module.exports.createObjectStorage({driver:'s3',enabled:true,endpoint:origin,accessKeyId:'fixture-only',secretAccessKey:'fixture-only',region:'fixture',bucket:'fixture',pathStyle:true,privateMedia:false,accessMode:'proxy',mediaDir:'/fixture'});
  const storage=functions(fs.existsSync(path.join(source,'src/lib/object-storage/managed-read.ts'))?'src/lib/object-storage/managed-read.ts':'src/lib/storage.ts',['readManagedObject'],{
   storageKeyFromManagedUrl:u=>u.startsWith('/media/')?u.slice(7):null,storageDriver:'s3',privateMedia:false,
   fetchStoredObject:(key)=>backend.get(key),readLocalMirror:async key=>{if(key==='error'||key==='missing')return {bytes:small,contentType:'image/png',size:small.length};throw Object.assign(new Error('not found'),{code:'ENOENT'});}
  });
  let count=0;const check=()=>count++;
  const normal=await storage.readManagedObject('/media/small',small.length);assert.deepEqual(normal.bytes,small);check();
  assert.equal(lastCache,mode==='baseline'?undefined:'no-store');check();
  await assert.rejects(()=>storage.readManagedObject('/media/declared',12*1024*1024),/大小限制/);await wait(180);
  const declaredOpen=!responses.get('declared').destroyed;assert.equal(declaredOpen,mode==='baseline');check();server.closeAllConnections();
  const fallback=await storage.readManagedObject('/media/error',12*1024*1024);assert.deepEqual(fallback.bytes,small);await wait(180);
  const errorOpen=!responses.get('error').destroyed;assert.equal(errorOpen,mode==='baseline');check();server.closeAllConnections();
  const missing=await storage.readManagedObject('/media/missing',12*1024*1024);assert.deepEqual(missing.bytes,small);await wait(180);assert.equal(!responses.get('missing').destroyed,mode==='baseline');check();server.closeAllConnections();
  await assert.rejects(()=>storage.readManagedObject('/media/chunked',1024),/大小限制/);await wait(180);assert.ok(responses.get('chunked').destroyed);check();server.closeAllConnections();
  const controller=new AbortController(),response=await backend.get('abort','',controller.signal);controller.abort();await assert.rejects(()=>response.arrayBuffer());await wait(180);assert.ok(responses.get('abort').destroyed);check();server.closeAllConnections();
  const canvas=async(sourceUrl,_origin,_owner,max)=>{const r=await storage.readManagedObject(sourceUrl,max);return {buffer:r.bytes,mimeType:r.contentType};};
  let lookups=0,assetReads=0;
  class WorkbenchError extends Error{constructor(msg,status){super(msg);this.status=status;}}
  const service=functions('src/lib/reference-workbench/service.ts',['ownedAsset','imageBytes'],{
   readCanvasImage:(u,o,w)=>canvas(u,o,w,12*1024*1024),readCanvasOutput:(u,o,w)=>canvas(u,o,w,64*1024*1024),
   readImagegenInputAsset:async(id,owner)=>{assetReads++;if(owner!=='fixture-owner')throw new Error('not owned');return {buffer:small,mimeType:'image/png',url:'/media/small'};},
   listArtworksByIds:async(owner,ids)=>{lookups++;return owner==='fixture-owner'?[{image:'/media/'+(ids[0]==='over'?'over-output':'large'),videoUrl:ids[0]==='video'?'video':null}]:[];},
   WorkbenchError,document:async()=>({url:'/media/small'}),require
  });
  const before=gets;
  if(mode==='baseline')await assert.rejects(()=>service.imageBytes('fixture-owner','generated-large'),/大小限制/);
  else{const result=await service.imageBytes('fixture-owner','generated-large');assert.equal(createHash('sha256').update(result.buffer).digest('hex'),createHash('sha256').update(large).digest('hex'));}
  assert.equal(gets-before,1,'one original network read, not metadata + display');check();server.closeAllConnections();
  const beforeDenied=gets;await assert.rejects(()=>service.imageBytes('other-owner','generated-large'));assert.equal(gets,beforeDenied);check();
  await assert.rejects(()=>service.imageBytes('fixture-owner','video'));assert.equal(gets,beforeDenied);check();
  const original=await service.imageBytes('fixture-owner','asset-fixture');assert.deepEqual(original.buffer,small);assert.equal(assetReads,1);check();server.closeAllConnections();
  await assert.rejects(()=>service.imageBytes('fixture-owner','over'),/大小限制/);await wait(180);if(mode==='modified')assert.ok(responses.get('over-output').destroyed);check();server.closeAllConnections();
  const r=await backend.get('small','bytes=0-7');await r.arrayBuffer();check();
  const answer={mode,checks:count,declaredSocketOpen:declaredOpen,errorSocketOpen:errorOpen,largeOutputBytes:large.length,largeOutputReadable:mode==='modified',cache:mode==='modified'?'no-store':'unspecified',supplierCalls:0,businessWrites:0};
  console.log('PEAK_STORAGE_'+mode.toUpperCase()+'='+JSON.stringify(answer));
 }finally{globalThis.fetch=originals;server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
