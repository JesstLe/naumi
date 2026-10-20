const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const file=process.argv[2]||'src/app/media/[...path]/route.ts',baseline=process.argv.includes('--baseline');
const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
let remoteType=null,owner='owner@example.test',calls=0;const bytes=Buffer.from('fixture-original-bytes'),exp={};
const assets={canReadMedia:async(_key,email)=>email===owner,getMediaAsset:async()=>({content_type:'image/png',sha256:'a'.repeat(64),remote_ready:true}),importLegacyMedia:async()=>null,ensureMediaVariants:async()=>null};
const storage={MEDIA_DIR:'/fixture/media',storageDriver:'s3',privateMedia:true,remoteMediaAccess:'proxy',fetchStoredObject:async(_key,range)=>{calls++;return new Response(range?bytes.subarray(0,5):bytes,{status:range?206:200,headers:{...(remoteType?{'content-type':remoteType}:{}),'content-length':String(range?5:bytes.length)}});}};
vm.runInNewContext(compiled,{exports:exp,Buffer,Response,Headers,URL,console,process,require:n=>{
 if(n==='@/lib/storage')return storage;if(n==='@/lib/request-auth')return{authenticatedEmail:async r=>r.headers.get('x-fixture-user')};if(n==='@/lib/media-assets')return assets;
 if(n==='node:fs/promises')return{stat:async()=>{throw Object.assign(Error('no local mirror'),{code:'ENOENT'})}};
 if(['node:fs','node:stream','path'].includes(n))return require(n);throw Error('UNEXPECTED_IMPORT '+n);
}},{filename:file});
async function get(type=null,user=owner,range){remoteType=type;return exp.GET(new Request('http://fixture/media/private/a.png',{headers:{...(user?{'x-fixture-user':user}:{}),...(range?{range}:{})}}),{params:Promise.resolve({path:['private','a.png']})});}
(async()=>{let r=await get();assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),baseline?null:'image/png');assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
 if(baseline){console.log('MEDIA_MIME_BASELINE=REPRODUCED HTTP200_CONTENT_TYPE_NULL BROWSER_REJECTS_IMAGE');return;}
 r=await get('application/octet-stream');assert.equal(r.headers.get('content-type'),'image/png');await r.arrayBuffer();r=await get('image/jpeg');assert.equal(r.headers.get('content-type'),'image/jpeg');await r.arrayBuffer();
 r=await get(null,owner,'bytes=0-4');assert.equal(r.status,206);assert.equal(r.headers.get('content-type'),'image/png');assert.equal((await r.arrayBuffer()).byteLength,5);
 const before=calls;assert.equal((await get(null,null)).status,401);assert.equal((await get(null,'other@example.test')).status,404);assert.equal(calls,before);
 r=await get();assert.equal(r.headers.get('vary'),'Cookie, Authorization');assert.equal(r.headers.get('x-content-type-options'),'nosniff');console.log('MEDIA_MIME_MODIFIED=PASS CHECKS=13 CATALOG_TYPE=1 EXPLICIT_IMAGE_TYPE_RETAINED=1 RANGE206=1 AUTH401_404_BEFORE_NAS=1 LOCAL_MIRROR=0');
})().catch(e=>{console.error(e);process.exitCode=1;});
