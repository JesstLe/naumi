/* Actual authenticated upload -> private NAS -> HTTP/Range read -> exact cleanup.
 * Runs inside the reviewed candidate. No model submission or supplier request. */
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const {Pool}=require('pg'),sharp=require('sharp');
const input=JSON.parse(fs.readFileSync(0,'utf8')),origin='http://127.0.0.1:3000',headers={cookie:input.cookie},mediaDir=path.resolve(process.env.MEDIA_DIR||'./data/media');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const hmac=(k,v)=>crypto.createHmac('sha256',k).update(v).digest();
const aws={async fetch(input,options={}){const u=new URL(input),method=options.method||'GET',date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),region=process.env.S3_REGION||'garage',headers={host:u.host,'x-amz-content-sha256':hash(Buffer.alloc(0)),'x-amz-date':date},names=Object.keys(headers).sort(),canonical=[method,u.pathname,'',names.map(k=>k+':'+headers[k]+'\n').join(''),names.join(';'),headers['x-amz-content-sha256']].join('\n'),scope=day+'/'+region+'/s3/aws4_request',key=hmac(hmac(hmac(hmac('AWS4'+process.env.S3_SECRET_ACCESS_KEY,day),region),'s3'),'aws4_request');headers.authorization='AWS4-HMAC-SHA256 Credential='+process.env.S3_ACCESS_KEY_ID+'/'+scope+', SignedHeaders='+names.join(';')+', Signature='+crypto.createHmac('sha256',key).update(['AWS4-HMAC-SHA256',date,scope,hash(Buffer.from(canonical))].join('\n')).digest('hex');return fetch(u,{...options,headers,redirect:'error'});}};
function url(key){return process.env.S3_ENDPOINT+'/'+process.env.S3_BUCKET+'/'+key.split('/').map(encodeURIComponent).join('/');}
async function run(){let art,assets=[],cleaned=false,original;const result={releaseId:input.releaseId,sourceCommit:process.env.SOURCE_COMMIT,supplierCalls:0};
 try{
  const session=await(await fetch(origin+'/api/auth/session',{headers})).json();if(!session.user?.email)throw Error('AUTH_SESSION');
  const body=await sharp(crypto.randomBytes(48*64*3),{raw:{width:48,height:64,channels:3}}).png().toBuffer(),fd=new FormData();fd.set('image',new File([body],'nas-release-acceptance.png',{type:'image/png'}));fd.set('title','NAS_RELEASE_VERIFICATION_'+crypto.randomUUID());fd.set('entry','canvas');fd.set('x','-99999');fd.set('y','-99999');
  const response=await fetch(origin+'/api/artworks/add',{method:'POST',headers,body:fd});art=await response.json();if(response.status!==200||!art.ok||!art.id||!art.image?.startsWith('/media/canvas-uploads/'+art.id+'.'))throw Error('UPLOAD_HTTP_'+response.status);
  const key=decodeURIComponent(art.image.slice(7)),row=(await pool.query('SELECT * FROM app_media_assets WHERE key=$1',[key])).rows[0];
  const deferred=process.env.NAUMI_NAS_DEFER_UPLOAD==='1';
  if(!row||row.owner!==session.user.email.toLowerCase()||!deferred&&!row.remote_ready||row.driver!=='s3'||row.sha256!==hash(body))throw Error('ASSET_BINDING');
  original=row;
  result.originalSha256=hash(body);
  const keys=[...new Set([key,row.thumbnail_key,row.preview_key].filter(Boolean))];assets=(await pool.query('SELECT * FROM app_media_assets WHERE key=ANY($1::text[])',[keys])).rows;
  if(assets.length!==keys.length||assets.some(a=>a.owner!==row.owner||!deferred&&!a.remote_ready))throw Error('VARIANT_BINDING');
  // Deferred delivery is an opt-in, not an unconditional local-first result.
  // Low disk reserve or large objects legitimately use remote-first; each asset
  // (including variants) carries its actual durable placement in remote_ready.
  const localCopies=new Set(),pending=assets.filter(a=>!a.remote_ready);
  for(const a of assets){const file=path.join(mediaDir,a.key),exists=fs.existsSync(file);if(exists){if(hash(fs.readFileSync(file))!==a.sha256)throw Error('DURABLE_LOCAL_BYTES');localCopies.add(a.key);}else if(!a.remote_ready)throw Error('DURABLE_LOCAL_BYTES');}
  if(pending.length){
   if(!deferred)throw Error('UNEXPECTED_PENDING_REMOTE');
   // Only this random fixture gets a prompt queue check; no user job is retried.
   await pool.query("UPDATE app_media_assets SET retry_after='2000-01-01' WHERE key=ANY($1::text[])AND owner=$2 AND NOT remote_ready",[pending.map(a=>a.key),row.owner]);
   const deadline=Date.now()+150000;let ready=false;
   while(Date.now()<deadline){const current=(await pool.query('SELECT remote_ready FROM app_media_assets WHERE key=ANY($1::text[])',[keys])).rows;if(current.length===keys.length&&current.every(a=>a.remote_ready)){ready=true;break;}await new Promise(r=>setTimeout(r,2000));}
   if(!ready)throw Error('DEFERRED_NAS_QUEUE_NOT_DELIVERED');
  }
  const reads=[];for(const a of assets){if(!deferred&&localCopies.has(a.key))throw Error('REMOTE_SUCCESS_CREATED_LOCAL_DUPLICATE');const r=await aws.fetch(url(a.key),{signal:AbortSignal.timeout(60000)}),b=Buffer.from(await r.arrayBuffer());if(r.status!==200||b.length!==Number(a.bytes)||hash(b)!==a.sha256)throw Error('NAS_DIRECT_SHA');reads.push({key:a.key,bytes:b.length,sha256:hash(b),localCopy:localCopies.has(a.key)});}
  const r=await fetch(origin+art.image,{headers}),bytes=Buffer.from(await r.arrayBuffer());if(r.status!==200||hash(bytes)!==hash(body))throw Error('HTTP_READ_SHA');
  const range=await fetch(origin+art.image,{headers:{...headers,range:'bytes=5-104'}}),part=Buffer.from(await range.arrayBuffer());if(range.status!==206||!part.equals(body.subarray(5,105)))throw Error('HTTP_RANGE');
  const download=await fetch(origin+'/api/download?u='+encodeURIComponent(art.image)+'&n=release-check.png',{headers}),downloadBytes=Buffer.from(await download.arrayBuffer());if(download.status!==200||!downloadBytes.equals(body))throw Error('DOWNLOAD_BYTES');
  const denied=await fetch(origin+art.image);await denied.body?.cancel();if(denied.status!==401)throw Error('PRIVATE_AUTH_DENIAL_'+denied.status);
  if(input.compatibleOrigin){const r=await fetch(input.compatibleOrigin+art.image,{headers,signal:AbortSignal.timeout(60000)}),bytes=Buffer.from(await r.arrayBuffer());if(r.status!==200||hash(bytes)!==hash(body))throw Error('PRIOR_NAS_ROLLBACK_READ');result.priorNasCompatibleRead=true;}
  Object.assign(result,{passed:true,actualUpload:true,httpReadback:true,download:true,directNasReadback:true,deferredEnabled:deferred,deferredQueueVerified:pending.length>0,pendingAssetsObserved:pending.length,localAssetsVerified:localCopies.size,rangeStatus:206,anonymousStatus:401,originalSha256:hash(body),bytes:body.length,reads});
 }finally{
  try{
  if(art?.id){const r=await fetch(origin+'/api/artworks/delete',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({ids:[art.id]})});const v=await r.json();if(!r.ok||!v.ok||v.deleted!==1)throw Error('TEST_ART_CLEANUP');
   const scope=original&&hash(JSON.stringify([original.key,original.owner,original.public,original.sha256]));
   for(const a of assets){
    if(a.owner!==original.owner||input.email&&a.owner!==input.email)throw Error('CLEANUP_OWNER_MISMATCH');
    const size=a.key===original.thumbnail_key?512:a.key===original.preview_key?1600:0;
    const derivative=size>0&&(a.key.startsWith('media-variants/'+original.sha256+'-')||/^[a-f0-9]{64}$/.test(a.sha256)&&a.key===`media-variants/v2/${scope}-${size}-${a.sha256}.webp`);
    if(!(a.key===original.key&&a.key.startsWith('canvas-uploads/'+art.id+'.')||derivative))throw Error('FIXTURE_KEY_REQUIRED');
   }
   for(const a of assets){const r=await aws.fetch(url(a.key),{method:'DELETE',signal:AbortSignal.timeout(30000)});await r.body?.cancel();if(!r.ok&&r.status!==404)throw Error('TEST_OBJECT_CLEANUP');const local=path.join(mediaDir,a.key);if(fs.existsSync(local)){if(hash(fs.readFileSync(local))!==a.sha256)throw Error('LOCAL_FIXTURE_CHANGED');fs.unlinkSync(local);}}
   if(assets.length){await pool.query('DELETE FROM app_media_assets WHERE key=ANY($1::text[])AND owner=$2',[assets.map(a=>a.key),assets[0].owner]);
    const purged=await pool.query("DELETE FROM app_artworks WHERE id=$1 AND email=$2 AND image_url=$3 AND title LIKE 'NAS_RELEASE_VERIFICATION_%'AND deleted_at IS NOT NULL",[art.id,assets[0].owner,art.image]);if(purged.rowCount!==1)throw Error('TEST_ART_PURGE');}cleaned=true;
  }
  }finally{await pool.end();}
 }
 result.verificationDataCleaned=cleaned;console.log(JSON.stringify(result));
}
run().catch(e=>{console.error('NAS_STORAGE_ACCEPTANCE_FAILED '+e.message);process.exitCode=1;});
