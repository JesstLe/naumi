const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),esbuild=require('esbuild'),Module=require('node:module'),sharp=require('sharp');
const mode=process.argv[2]||'MODIFIED',out=path.resolve(process.argv[3]||'output/bi-artwork-input-output-20261016');
const root=mode==='BASELINE'?path.join(out,'baseline'):mode==='ROLLBACK'?path.join(out,'rollback-copy'):process.cwd();
if(mode!=='MODIFIED'){
 const ui=fs.readFileSync(path.join(root,'src/components/admin/bi/dashboard.tsx'),'utf8');assert.match(ui,/src=\{`\/api\/admin\/bi\/media\?id=/);assert.doesNotMatch(ui,/<ArtworkMedia/);
 console.log(`${mode}=PASS MEDIA=RESULT_ONLY INPUT_LABELS=ABSENT EXIT=0`);process.exit(0);
}
function load(code,name){const m=new Module(path.join(process.cwd(),name));m.filename=path.join(process.cwd(),name);m.paths=module.paths;m._compile(code,m.filename);return m.exports;}
const compile=entry=>esbuild.buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const {artworkInputs:inputs,artworkInputPresentation:present,ARTWORK_INPUT_JOINS:joins}=load(compile('src/lib/bi/artwork-inputs.ts'),'verify-inputs.cjs');
const ptr=url=>({buf:{$imageJobBuffer:url},type:'image/png'}),p={creation_provenance:{operation:'generate'},input_params:{images:[ptr('/media/input1.bin'),ptr('/media/input2.bin')]}};
assert.equal(inputs(p).inputs.length,2);assert.equal(present(p).generation_mode,'图生图');
assert.equal(present({input_params:{images:[]},job_kind:'generate'}).generation_mode,'文生图');
assert.equal(present({input_images:[ptr('/media/a')],job_kind:'suite'}).input_count,1);
assert.equal(present({input_request:{mode:'generate',inputs:[{artworkId:'x',role:'reference'},{artworkId:'m',role:'mask'}]}}).input_count,1);
assert.equal(present({input_source_id:'canvas-input'}).generation_mode,'图生图');
assert.equal(present({parent_id:'mutable-link-only'}).input_count,0);
assert.equal(present({creation_provenance:{operation:'upload'}}).generation_mode,'上传图片');
assert.equal(present({creation_provenance:{operation:'replicate'}}).input_status,'原图未留存');
assert.equal(present({input_params:{images:[{},ptr('/media/a')]}}).input_status,'部分原图缺失');
assert.match(joins,/j.email=a.email/);assert.match(joins,/email=a.email AND result_artwork_id=a.id/);
assert.ok(!JSON.stringify(present(p)).includes('/media/'));
const repo=fs.readFileSync('src/lib/bi/repository.ts','utf8');assert.match(repo,/input_params, input_images, input_request, input_source_id, \.\.\.row/);
const css=fs.readFileSync('src/components/admin/bi/artwork-media.module.css','utf8');assert.match(css,/object-fit:contain/);
const ui=fs.readFileSync('src/components/admin/bi/artwork-media.tsx','utf8');assert.match(ui,/提示词 \/ 操作内容/);assert.match(ui,/Math.min\(count, 2\)/);assert.match(ui,/detail \? count/);assert.doesNotMatch(ui,/cached-next-image|dangerouslySetInnerHTML/);

(async()=>{
 const fixture=await sharp({create:{width:120,height:220,channels:3,background:'#4591e0'}}).png().toBuffer();
 let auth=true,queries=[],reads=[],audits=[];let row={...p,email:'owner@test',image_url:'data:image/png;base64,'+fixture.toString('base64')};
 global.__biFixture={auth:()=>auth,row:()=>row,queries,reads,audits,fixture};
 const stubs={
 '@/lib/bi/access':`const {NextResponse}=require('next/server');export const BI_PRIVATE_HEADERS={'Cache-Control':'private, no-store','Vary':'Cookie, Authorization'};export const biJson=(data,status=200)=>NextResponse.json(data,{status,headers:BI_PRIVATE_HEADERS});export const biAuthorize=async()=>global.__biFixture.auth()?{actor:'admin@test'}:biJson({error:'not found'},404);`,
 '@/platform/db/pool':`export const getPool=()=>({connect:async()=>({release(){},query:async(sql,args)=>{const f=global.__biFixture;f.queries.push([sql,args]);if(sql.startsWith('SELECT image_url FROM'))return {rows:args[1]==='owner@test'?[{image_url:f.row().image_url}]:[]};return {rows:[f.row()]}}})});`,
 '@/lib/bi/repository':`export const logBiAccess=async(...a)=>global.__biFixture.audits.push(a);`,
 '@/lib/object-storage/runtime':`export const dataUrlToBytes=url=>url.startsWith('data:image/png;base64,')?{bytes:Buffer.from(url.split(',')[1],'base64'),contentType:'image/png'}:null;export const isManagedImageUrl=url=>url.startsWith('/media/');`,
 '@/lib/object-storage/managed-read':`export const readManagedObject=async(url)=>{global.__biFixture.reads.push(url);return {bytes:global.__biFixture.fixture}};`,
 '@/lib/imagegen/input-asset-reference':`export const readImagegenInputAssetReference=async(id,owner,client)=>{if(owner!=='owner@test'||!client)throw Error('wrong owner or connection');return {url:'/media/'+id}};`,
 '@/lib/media-cache-version':`export const mediaCacheVersion=async()=>null;`,
 '@/lib/media-assets-schema':`export const ensureMediaSchema=async()=>{};`,
 'server-only':'',
 '@/lib/download-source':`export const parseDownloadSource=()=>{throw Error('Unexpected external request')};export const fetchDownloadSource=()=>{throw Error('Unexpected external request')};`
 };
 const built=await esbuild.build({entryPoints:['src/app/api/admin/bi/media/route.ts'],bundle:true,platform:'node',format:'cjs',write:false,external:['next/server','sharp'],plugins:[{name:'bi-isolated-fixture',setup(build){build.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'ts'}));}}]});
 const {GET}=load(built.outputFiles[0].text,'verify-bi-media-route.cjs'),get=q=>GET(new Request('http://fixture.test/api/admin/bi/media?id=result'+q));
 auth=false;assert.equal((await get('&slot=input')).status,404);assert.equal(queries.length,0);auth=true;
 for(const q of ['&slot=invalid','&slot=input&index=-1','&slot=input&index=1.5','&slot=input&index=100'])assert.equal((await get(q)).status,400);
 const result=await get('');assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/no-store/);const meta=await sharp(Buffer.from(await result.arrayBuffer())).metadata();assert.equal(meta.width,120);assert.equal(meta.height,220);
 assert.equal((await get('&slot=input&index=1&full=1')).status,200);assert.deepEqual(reads,['/media/input2.bin']);assert.equal(audits[0][1],'view-input-image');
 assert.equal((await get('&slot=input&index=9')).status,404);
 row={...row,input_params:{images:[ptr('http://127.0.0.1/private')]}};assert.equal((await get('&slot=input')).status,422);
 row={...row,input_params:null,input_source_id:'source'};assert.equal((await get('&slot=input')).status,200);assert.ok(queries.some(([sql,args])=>sql.includes('id=$1 AND email=$2')&&args[1]==='owner@test'));
 row={...row,input_source_id:null,input_request:{inputs:[{artworkId:'asset-00000000-0000-4000-8000-000000000000',role:'reference'}]}};assert.equal((await get('&slot=input')).status,200);
 assert.equal(reads.length,2);delete global.__biFixture;
 console.log('MODIFIED=PASS IMAGE_TO_IMAGE=ORIGINALS_AND_RESULT TEXT_TO_IMAGE=PROMPT_AND_RESULT MULTI_INPUT=PASS MISSING_HISTORY=EXPLICIT AUTH=PASS OWNER_SCOPE=PASS SSRF=PASS CONTAIN=PASS NO_DUPLICATE_STORAGE=PASS EXIT=0');
})().catch(e=>{console.error(e);process.exitCode=1});
