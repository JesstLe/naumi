/** Windows/local only: decode bounded original bytes into a private content-addressed WebP cache. */
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const sharp=createRequire(new URL('../services/enterprise-workflow/package.json',import.meta.url))('sharp');
sharp.cache(false);sharp.concurrency(1);
export async function cacheMedia(snapshotFile, readFilePath, directory) {
  const envelope=JSON.parse(await readFile(snapshotFile,'utf8'));
  if(createHash('sha256').update(JSON.stringify(envelope.data)).digest('hex')!==envelope.sha256)throw Error('MEDIA_SNAPSHOT_DIGEST');
  const data=envelope.data,root=resolve(directory);await mkdir(root,{recursive:true,mode:0o700});
  if((await lstat(root)).isSymbolicLink() || await realpath(root)!==root)throw Error('MEDIA_ROOT_INVALID');
  const rows=new Map(data.rows.artworks.map(r=>[JSON.stringify([r.account.email,r.ref.id]),r]));
  const input=JSON.parse(await readFile(readFilePath,'utf8'));
  if(input.instanceId!==data.instanceId || input.enterpriseId!==data.enterpriseId || !input.sourceReadOnly || input.sourceWrites!==0
    || !Array.isArray(input.media) || input.media.length>25)throw Error('MEDIA_INPUT_SCOPE');
  const media=[],results=[],seen=new Set();let sourceBytes=0,cacheBytes=0;
  for(const item of input.media){const pair=JSON.stringify([item.email,item.id]);
    if(!rows.has(pair) || seen.has(pair))throw Error('MEDIA_INPUT_PAIR');seen.add(pair);
    const bytes=Buffer.from(item.base64,'base64');sourceBytes+=bytes.length;
    if(!bytes.length || bytes.length>2*1024*1024 || sourceBytes>32*1024*1024 || createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('MEDIA_INPUT_DIGEST');
    try{
      const meta=await sharp(bytes,{limitInputPixels:16777216,failOn:'error',animated:false}).metadata();
      if(!['png','jpeg','webp','avif','gif','heif'].includes(meta.format) || (meta.pages||1)>1)throw Error('MEDIA_FORMAT_UNSUPPORTED');
      const preview=await sharp(bytes,{limitInputPixels:16777216,failOn:'error',animated:false}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:78,effort:3}).toBuffer();
      if(preview.length>1024*1024)throw Error('MEDIA_PREVIEW_LIMIT');
      const sha256=createHash('sha256').update(preview).digest('hex'),file=join(root,sha256);
      try{await writeFile(file,preview,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;const info=await lstat(file);if(info.isSymbolicLink()||!info.isFile()||createHash('sha256').update(await readFile(file)).digest('hex')!==sha256)throw Error('MEDIA_CACHE_COLLISION');}
      media.push({id:item.id,email:item.email,mime:'image/webp',sha256,file:sha256});cacheBytes+=preview.length;
      results.push({id:item.id,ok:true,width:meta.width,height:meta.height,sourceVariant:item.variant,cacheBytes:preview.length});
    }catch{results.push({id:item.id,ok:false,result:'MEDIA_LOCAL_DECODE_REJECTED'});}
  }
  data.mediaRoot=root;data.media=media;
  return {envelope:{sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex'),data},result:{cached:media.length,sourceBytes,cacheBytes,results,sourceWrites:0,decodedLocally:true}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [snapshot,input,root,output]=process.argv.slice(2);const result=await cacheMedia(snapshot,input,root);
  await writeFile(output,JSON.stringify(result.envelope),{mode:0o600});await writeFile(output+'.result.json',JSON.stringify(result.result,null,2),{mode:0o600});
  console.log('SOURCE_MEDIA_CACHE_PASS: cached='+result.result.cached+' decoded_locally=1 source_writes=0');
}
