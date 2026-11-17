/* Real 103 R2 upload/read/download/ACL check. Only this random fixture is deleted. */
const fs=require('node:fs'),crypto=require('node:crypto');
const {Pool}=require('pg'),sharp=require('sharp');
const input=JSON.parse(fs.readFileSync(0,'utf8')),origin='http://127.0.0.1:3000',headers={cookie:input.cookie};
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const hmac=(k,v)=>crypto.createHmac('sha256',k).update(v).digest();
const endpoint='https://'+process.env.R2_ACCOUNT_ID+'.r2.cloudflarestorage.com';
async function objectRequest(key,method='GET'){
 const u=new URL(endpoint+'/'+process.env.R2_BUCKET+'/'+key.split('/').map(encodeURIComponent).join('/'));
 const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),region='auto';
 const h={host:u.host,'x-amz-content-sha256':hash(Buffer.alloc(0)),'x-amz-date':date},names=Object.keys(h).sort();
 const canonical=[method,u.pathname,'',names.map(k=>k+':'+h[k]+'\n').join(''),names.join(';'),h['x-amz-content-sha256']].join('\n'),scope=day+'/'+region+'/s3/aws4_request';
 const k=hmac(hmac(hmac(hmac('AWS4'+process.env.R2_SECRET_ACCESS_KEY,day),region),'s3'),'aws4_request');
 h.authorization='AWS4-HMAC-SHA256 Credential='+process.env.R2_ACCESS_KEY_ID+'/'+scope+', SignedHeaders='+names.join(';')+', Signature='+crypto.createHmac('sha256',k).update(['AWS4-HMAC-SHA256',date,scope,hash(Buffer.from(canonical))].join('\n')).digest('hex');
 return fetch(u,{method,headers:h,redirect:'error',signal:AbortSignal.timeout(45000)});
}
async function run(){
 if(process.env.STORAGE_DRIVER!=='r2'||process.env.MEDIA_PRIVATE!=='1')throw Error('103_PRIVATE_R2_REQUIRED');
 let art,assets=[],owner,original,cleaned=false;const result={releaseId:input.releaseId,commit:process.env.SOURCE_COMMIT,supplierCalls:0};
 try{
  const s=await(await fetch(origin+'/api/auth/session',{headers})).json();owner=s.user?.email?.toLowerCase();if(!owner)throw Error('NATIVE_AUTH');
  const bytes=await sharp(crypto.randomBytes(48*64*3),{raw:{width:48,height:64,channels:3}}).png().toBuffer();
  const fd=new FormData();fd.set('image',new File([bytes],'release103-refactor-check.png',{type:'image/png'}));fd.set('title','RELEASE103_REFACTOR_'+crypto.randomUUID());fd.set('entry','canvas');fd.set('x','-99999');fd.set('y','-99999');
  const response=await fetch(origin+'/api/artworks/add',{method:'POST',headers,body:fd,signal:AbortSignal.timeout(60000)});art=await response.json();
  if(response.status!==200||!art.ok||!art.id||!art.image?.startsWith('/media/canvas-uploads/'+art.id+'.'))throw Error('UPLOAD_HTTP_'+response.status);
  const key=decodeURIComponent(art.image.slice(7)),row=(await pool.query('SELECT * FROM app_media_assets WHERE key=$1',[key])).rows[0];
  if(!row||row.owner!==owner||row.driver!=='r2'||!row.remote_ready||row.sha256!==hash(bytes))throw Error('R2_CATALOG_BINDING');
  original=row;
  const keys=[...new Set([key,row.thumbnail_key,row.preview_key].filter(Boolean))];assets=(await pool.query('SELECT * FROM app_media_assets WHERE key=ANY($1::text[])',[keys])).rows;
  if(assets.length!==keys.length||assets.some(a=>a.owner!==owner||a.driver!=='r2'||!a.remote_ready))throw Error('R2_VARIANT_BINDING');
  for(const a of assets){const r=await objectRequest(a.key),b=Buffer.from(await r.arrayBuffer());if(r.status!==200||hash(b)!==a.sha256||b.length!==Number(a.bytes))throw Error('DIRECT_R2_BYTES');}
  const read=await fetch(origin+art.image,{headers}),body=Buffer.from(await read.arrayBuffer());if(read.status!==200||!body.equals(bytes))throw Error('WEB_READ_BYTES');
  const range=await fetch(origin+art.image,{headers:{...headers,range:'bytes=5-104'}}),part=Buffer.from(await range.arrayBuffer());if(range.status!==206||!part.equals(bytes.subarray(5,105)))throw Error('RANGE_BYTES');
  const denied=await fetch(origin+art.image);await denied.body?.cancel();if(denied.status!==401)throw Error('PRIVATE_ACL_'+denied.status);
  const dl=await fetch(origin+'/api/download?u='+encodeURIComponent(art.image)+'&n=release-check.png',{headers}),db=Buffer.from(await dl.arrayBuffer());if(dl.status!==200||!db.equals(bytes))throw Error('DOWNLOAD_BYTES');
  Object.assign(result,{passed:true,actualUpload:true,directR2Readback:true,webReadback:true,download:true,rangeStatus:206,anonymousStatus:401,variantCount:assets.length,bytes:bytes.length});
 }finally{
  if(art?.id){
   const r=await fetch(origin+'/api/artworks/delete',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({ids:[art.id]})});const v=await r.json();if(!r.ok||!v.ok||v.deleted!==1)throw Error('FIXTURE_ART_CLEANUP');
   if(!assets.length){const key=art.image?.startsWith('/media/')?decodeURIComponent(art.image.slice(7)):null;if(key)assets=(await pool.query('SELECT * FROM app_media_assets WHERE key=$1',[key])).rows;}
   const scope=original&&hash(JSON.stringify([original.key,original.owner,original.public,original.sha256]));
   for(const a of assets){
    const size=original&&a.key===original.thumbnail_key?512:original&&a.key===original.preview_key?1600:0;
    const derivative=size>0&&(a.key.startsWith('media-variants/'+original.sha256+'-')||/^[a-f0-9]{64}$/.test(a.sha256)&&a.key===`media-variants/v2/${scope}-${size}-${a.sha256}.webp`);
    if(a.owner!==owner||!(a.key.startsWith('canvas-uploads/'+art.id+'.')||derivative))throw Error('FIXTURE_OWNER_GUARD');
   }
   for(const a of assets){const x=await objectRequest(a.key,'DELETE');await x.body?.cancel();if(!x.ok&&x.status!==404)throw Error('FIXTURE_R2_CLEANUP');}
   if(assets.length)await pool.query('DELETE FROM app_media_assets WHERE key=ANY($1::text[])AND owner=$2',[assets.map(a=>a.key),owner]);
   const purged=await pool.query("DELETE FROM app_artworks WHERE id=$1 AND email=$2 AND image_url=$3 AND title LIKE 'RELEASE103_REFACTOR_%' AND deleted_at IS NOT NULL",[art.id,owner,art.image]);if(purged.rowCount!==1)throw Error('FIXTURE_ART_PURGE');
   cleaned=true;
  }
  await pool.end();
 }
 result.verificationDataCleaned=cleaned;console.log(JSON.stringify(result));
}
run().catch(e=>{console.error('103_R2_ACCEPTANCE_FAILED '+e.message);process.exitCode=1;});
