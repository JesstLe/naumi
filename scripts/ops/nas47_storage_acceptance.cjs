/* Actual authenticated upload -> private NAS -> HTTP/Range read -> exact cleanup.
 * Runs inside the reviewed candidate. No model submission or supplier request. */
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const {Pool}=require('pg'),sharp=require('sharp');
const input=JSON.parse(fs.readFileSync(0,'utf8')),origin='http://127.0.0.1:3000',headers={cookie:input.cookie};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const hmac=(k,v)=>crypto.createHmac('sha256',k).update(v).digest();
const aws={async fetch(input,options={}){const u=new URL(input),method=options.method||'GET',date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),region=process.env.S3_REGION||'garage',headers={host:u.host,'x-amz-content-sha256':hash(Buffer.alloc(0)),'x-amz-date':date},names=Object.keys(headers).sort(),canonical=[method,u.pathname,'',names.map(k=>k+':'+headers[k]+'\n').join(''),names.join(';'),headers['x-amz-content-sha256']].join('\n'),scope=day+'/'+region+'/s3/aws4_request',key=hmac(hmac(hmac(hmac('AWS4'+process.env.S3_SECRET_ACCESS_KEY,day),region),'s3'),'aws4_request');headers.authorization='AWS4-HMAC-SHA256 Credential='+process.env.S3_ACCESS_KEY_ID+'/'+scope+', SignedHeaders='+names.join(';')+', Signature='+crypto.createHmac('sha256',key).update(['AWS4-HMAC-SHA256',date,scope,hash(Buffer.from(canonical))].join('\n')).digest('hex');return fetch(u,{...options,headers,redirect:'error'});}};
function url(key){return process.env.S3_ENDPOINT+'/'+process.env.S3_BUCKET+'/'+key.split('/').map(encodeURIComponent).join('/');}
async function run(){let art,assets=[],cleaned=false;const result={releaseId:input.releaseId,sourceCommit:process.env.SOURCE_COMMIT,supplierCalls:0};
 try{
  const session=await(await fetch(origin+'/api/auth/session',{headers})).json();if(!session.user?.email)throw Error('AUTH_SESSION');
  const body=await sharp(crypto.randomBytes(48*64*3),{raw:{width:48,height:64,channels:3}}).png().toBuffer(),fd=new FormData();fd.set('image',new File([body],'nas-release-acceptance.png',{type:'image/png'}));fd.set('title','NAS_RELEASE_VERIFICATION_'+crypto.randomUUID());fd.set('entry','canvas');fd.set('x','-99999');fd.set('y','-99999');
  const response=await fetch(origin+'/api/artworks/add',{method:'POST',headers,body:fd});art=await response.json();if(response.status!==200||!art.ok||!art.id||!art.image?.startsWith('/media/canvas-uploads/'+art.id+'.'))throw Error('UPLOAD_HTTP_'+response.status);
  const key=decodeURIComponent(art.image.slice(7)),row=(await pool.query('SELECT * FROM app_media_assets WHERE key=$1',[key])).rows[0];
  if(!row||row.owner!==session.user.email.toLowerCase()||!row.remote_ready||row.driver!=='s3'||row.sha256!==hash(body))throw Error('ASSET_BINDING');
  const keys=[...new Set([key,row.thumbnail_key,row.preview_key].filter(Boolean))];assets=(await pool.query('SELECT * FROM app_media_assets WHERE key=ANY($1::text[])',[keys])).rows;
  if(assets.length!==keys.length||assets.some(a=>a.owner!==row.owner||!a.remote_ready))throw Error('VARIANT_BINDING');
  const reads=[];for(const a of assets){if(fs.existsSync(path.join(process.env.MEDIA_DIR||'/data/media',a.key)))throw Error('REMOTE_SUCCESS_CREATED_LOCAL_DUPLICATE');const r=await aws.fetch(url(a.key),{signal:AbortSignal.timeout(60000)}),b=Buffer.from(await r.arrayBuffer());if(r.status!==200||b.length!==Number(a.bytes)||hash(b)!==a.sha256)throw Error('NAS_DIRECT_SHA');reads.push({key:a.key,bytes:b.length,sha256:hash(b),localCopy:false});}
  const r=await fetch(origin+art.image,{headers}),bytes=Buffer.from(await r.arrayBuffer());if(r.status!==200||hash(bytes)!==hash(body))throw Error('HTTP_READ_SHA');
  const range=await fetch(origin+art.image,{headers:{...headers,range:'bytes=5-104'}}),part=Buffer.from(await range.arrayBuffer());if(range.status!==206||!part.equals(body.subarray(5,105)))throw Error('HTTP_RANGE');
  const denied=await fetch(origin+art.image);await denied.body?.cancel();if(denied.status!==401)throw Error('PRIVATE_AUTH_DENIAL_'+denied.status);
  if(input.compatibleOrigin){const r=await fetch(input.compatibleOrigin+art.image,{headers,signal:AbortSignal.timeout(60000)}),bytes=Buffer.from(await r.arrayBuffer());if(r.status!==200||hash(bytes)!==hash(body))throw Error('PRIOR_NAS_ROLLBACK_READ');result.priorNasCompatibleRead=true;}
  Object.assign(result,{passed:true,actualUpload:true,httpReadback:true,directNasReadback:true,rangeStatus:206,anonymousStatus:401,originalSha256:hash(body),bytes:body.length,reads});
 }finally{
  if(art?.id){const r=await fetch(origin+'/api/artworks/delete',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({ids:[art.id]})});const v=await r.json();if(!r.ok||!v.ok||v.deleted!==1)throw Error('TEST_ART_CLEANUP');
   for(const a of assets){if(a.owner!==input.email&&input.email)throw Error('CLEANUP_OWNER_MISMATCH');const r=await aws.fetch(url(a.key),{method:'DELETE',signal:AbortSignal.timeout(30000)});await r.body?.cancel();if(!r.ok&&r.status!==404)throw Error('TEST_OBJECT_CLEANUP');}
   if(assets.length){await pool.query('DELETE FROM app_media_assets WHERE key=ANY($1::text[])AND owner=$2',[assets.map(a=>a.key),assets[0].owner]);
    const purged=await pool.query("DELETE FROM app_artworks WHERE id=$1 AND email=$2 AND image_url=$3 AND title LIKE 'NAS_RELEASE_VERIFICATION_%'AND deleted_at IS NOT NULL",[art.id,assets[0].owner,art.image]);if(purged.rowCount!==1)throw Error('TEST_ART_PURGE');}cleaned=true;
  }await pool.end();
 }
 result.verificationDataCleaned=cleaned;console.log(JSON.stringify(result));
}
run().catch(e=>{console.error('NAS_STORAGE_ACCEPTANCE_FAILED '+e.message);process.exitCode=1;});
