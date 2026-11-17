'use strict';
// Execute the actual acceptance script with real Sharp/local bytes, isolated
// HTTP/SQL/object-storage fixture boundaries. Never reads deployment credentials.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),sharp=require('sharp');
const opt=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1]},root=process.cwd();
const source=path.resolve(opt('--probe')||'scripts/ops/nas47_storage_acceptance.cjs'),out=path.resolve(opt('--out')||'output/nas47-probe-contract');
fs.mkdirSync(out,{recursive:true});const script=fs.readFileSync(source,'utf8'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const specs=[
 {name:'deferred_flag_remote_first_low_disk',ready:[true,true,true],local:[false,false,false],deferred:true,pass:true,pending:0},
 {name:'deferred_pending_local',ready:[false,false,false],local:[true,true,true],deferred:true,pass:true,pending:3},
 {name:'mixed_asset_placement',ready:[false,true,false],local:[true,false,true],deferred:true,pass:true,pending:2},
 {name:'already_delivered_with_local_cache',ready:[true,true,true],local:[true,true,true],deferred:true,pass:true,pending:0},
 {name:'non_deferred_remote_first',ready:[true,true,true],local:[false,false,false],deferred:false,pass:true,pending:0},
 {name:'scoped_v2_derivatives_cleaned',ready:[true,true,true],local:[false,false,false],deferred:false,scoped:true,pass:true,pending:0},
 {name:'mismatched_v2_scope_never_deleted',ready:[true,true,true],local:[false,false,false],deferred:false,scoped:true,wrongScope:true,pass:false,error:'FIXTURE_KEY_REQUIRED'},
 {name:'pending_missing_local_rejected',ready:[false,true,true],local:[false,false,false],deferred:true,pass:false,error:'DURABLE_LOCAL_BYTES'},
 {name:'corrupt_local_rejected',ready:[false,true,true],local:[true,false,false],deferred:true,corruptLocal:true,pass:false,error:'LOCAL_FIXTURE_CHANGED'},
 {name:'corrupt_remote_rejected',ready:[true,true,true],local:[false,false,false],deferred:true,corruptRemote:true,pass:false,error:'NAS_DIRECT_SHA'},
 {name:'default_media_dir_matches_product',ready:[false,false,false],local:[true,true,true],deferred:true,defaultDir:true,pass:true,pending:3},
];
async function scenario(spec,index){
 const dir=fs.mkdtempSync(path.join(out,'fixture-')),media=path.join(dir,'data','media'),owner='probe@example.test',id=`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
 fs.mkdirSync(media,{recursive:true});let assets=[],body,art,updateKeys=[],deleted=false,sqlEnded=false,errors=[],result;const objects=new Map();
 const env={DATABASE_URL:'fixture-only',SETTINGS_SECRET:'fixture-only',S3_ENDPOINT:'http://fixture-storage',S3_BUCKET:'fixture',S3_ACCESS_KEY_ID:'fixture',S3_SECRET_ACCESS_KEY:'fixture',NAUMI_NAS_DEFER_UPLOAD:spec.deferred?'1':'0',SOURCE_COMMIT:'fixture'};
 if(!spec.defaultDir)env.MEDIA_DIR=media;
 const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
 const fakeFetch=async(input,options={})=>{
  const u=new URL(input);
  if(u.hostname==='fixture-storage'){
   const key=decodeURIComponent(u.pathname.slice('/fixture/'.length));if(options.method==='DELETE'){objects.delete(key);return new Response(null,{status:204});}
   const bytes=objects.get(key);return new Response(spec.corruptRemote?Buffer.from('wrong bytes'):bytes,{status:bytes?200:404});
  }
  assert.equal(u.origin,'http://127.0.0.1:3000');
  if(u.pathname==='/api/auth/session')return json({user:{email:owner}});
  if(u.pathname==='/api/artworks/add'){
   body=Buffer.from(await options.body.get('image').arrayBuffer());const sha=hash(body),key=`canvas-uploads/${id}.png`;
   const bytes=[body,await sharp(body).resize(12,16).webp().toBuffer(),await sharp(body).resize(24,32).webp().toBuffer()];
   const scope=hash(JSON.stringify([key,owner,false,sha]));
   const keys=spec.scoped?[key,`media-variants/v2/${scope}-512-${hash(bytes[1])}.webp`,`media-variants/v2/${spec.wrongScope?'0'.repeat(64):scope}-1600-${hash(bytes[2])}.webp`]:[key,`media-variants/${sha}-thumb.webp`,`media-variants/${sha}-preview.webp`];
   assets=keys.map((k,i)=>({key:k,owner,public:false,driver:'s3',sha256:hash(bytes[i]),bytes:bytes[i].length,remote_ready:spec.ready[i],thumbnail_key:i===0?keys[1]:null,preview_key:i===0?keys[2]:null}));
   for(let i=0;i<3;i++){objects.set(keys[i],bytes[i]);if(spec.local[i]){const f=path.join(media,keys[i]);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,spec.corruptLocal&&i===0?Buffer.from('corrupt'):bytes[i]);}}
   art={ok:true,id,image:'/media/'+key};return json(art);
  }
  if(u.pathname==='/api/artworks/delete'){deleted=true;return json({ok:true,deleted:1});}
  if(u.pathname==='/api/download')return new Response(body);
  if(u.pathname.startsWith('/media/')){
   if(!options.headers?.cookie)return json({error:'auth'},401);
   if(options.headers?.range)return new Response(body.subarray(5,105),{status:206});
   return new Response(body);
  }
  throw Error('UNEXPECTED_HTTP_'+u.pathname);
 };
 class Pool{
  async query(sql,args=[]){
   if(sql.startsWith('SELECT * FROM app_media_assets WHERE key=$1'))return{rows:assets.filter(a=>a.key===args[0])};
   if(sql.startsWith('SELECT * FROM app_media_assets WHERE key=ANY'))return{rows:assets.map(a=>({...a}))};
   if(sql.startsWith('UPDATE app_media_assets SET retry_after')){updateKeys=[...args[0]];for(const a of assets)if(updateKeys.includes(a.key))a.remote_ready=true;return{rows:[]};}
   if(sql.startsWith('SELECT remote_ready'))return{rows:assets.map(a=>({remote_ready:a.remote_ready}))};
   if(sql.startsWith('DELETE FROM app_media_assets'))return{rows:[],rowCount:assets.length};
   if(sql.includes('DELETE FROM app_artworks'))return{rows:[],rowCount:1};
   throw Error('UNEXPECTED_SQL');
  }
  async end(){sqlEnded=true;}
 }
 const fakeProcess={env,exitCode:0};
 const context={require:n=>(n==='fs'||n==='node:fs')?{...fs,readFileSync:(p,...args)=>p===0?JSON.stringify({cookie:'nv_user=fixture',releaseId:'fixture'}):fs.readFileSync(p,...args)}:n==='pg'?{Pool}:n==='node:crypto'?{...crypto,randomUUID:()=>id,randomBytes:n=>Buffer.from(Array.from({length:n},(_,i)=>(i*73+19)&255))}:require(n),process:fakeProcess,Buffer,URL,FormData,File,Response,AbortSignal,setTimeout,clearTimeout,console:{log:v=>{result=JSON.parse(v)},error:v=>errors.push(String(v))}};
 context.fetch=fakeFetch;
 try{
  process.chdir(dir);
  vm.runInNewContext(script.replace(/run\(\)\.catch\(/,'globalThis.__probe=run().catch('),context,{filename:source});await context.__probe;
  const passed=fakeProcess.exitCode===0&&result?.passed===true;
  assert.equal(passed,spec.pass,'probe acceptance contract');assert.equal(sqlEnded,true);
  if(!spec.pass)assert.ok(errors.at(-1)?.endsWith(spec.error),'expected rejection reason');
  if(spec.wrongScope)assert.equal(objects.size,3,'verify all cleanup keys before deleting any object');
  if(spec.pass){assert.equal(result.verificationDataCleaned,true);assert.equal(result.deferredQueueVerified,spec.pending>0);assert.equal(updateKeys.length,spec.pending);assert.equal(deleted,true);assert.equal(objects.size,0);}
  return{name:spec.name,pass:true,probeExit:fakeProcess.exitCode,queueVerified:result?.deferredQueueVerified,updateCount:updateKeys.length,error:errors.at(-1)||null};
 }catch(e){return{name:spec.name,pass:false,probeExit:fakeProcess.exitCode,error:String(e),probeError:errors.at(-1)||null};}
 finally{process.chdir(root);assert.equal(path.dirname(dir),out);fs.rmSync(dir,{recursive:true});}
}
(async()=>{const results=[];for(let i=0;i<specs.length;i++)results.push(await scenario(specs[i],i));const failures=results.filter(v=>!v.pass).length;
 const report={source,sourceSha256:hash(Buffer.from(script)),results,realSharp:true,realLocalFiles:true,realNetwork:0,realPostgres:0};fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(report,null,2));
 for(const v of results)console.log((v.pass?'PASS ':'FAIL ')+v.name+(v.error?' '+v.error:''));
 console.log(`NAS_PROBE_CONTRACT cases=${results.length} failures=${failures} NETWORK=0 PG=0 LOCAL_FIXTURES=0`);process.exitCode=failures?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
