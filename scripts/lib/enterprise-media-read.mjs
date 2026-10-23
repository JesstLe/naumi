/** Bounded byte-only reader. No image decoder, application bootstrap, DB writes or arbitrary URL fetch. */
import {createHash} from 'node:crypto';
const hash = /^[a-f0-9]{64}$/;
export function safeMediaKey(key) {
  if (typeof key !== 'string' || !key || key.length > 4096 || /[\\\0?#]/.test(key)
    || key.split('/').some(p => !p || p === '.' || p === '..')) throw Error('MEDIA_KEY_INVALID');
  return key;
}
export function objectEndpoint(config, key) {
  if (!config.enabled || !['s3','r2'].includes(config.driver)) throw Error('MEDIA_DRIVER_UNSUPPORTED');
  const url = new URL(config.endpoint);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(config.bucket)) throw Error('MEDIA_ENDPOINT_INVALID');
  if (!config.pathStyle) url.hostname = `${config.bucket}.${url.hostname}`;
  url.pathname = `${url.pathname.replace(/\/$/,'')}/${config.pathStyle ? encodeURIComponent(config.bucket)+'/' : ''}${safeMediaKey(key).split('/').map(encodeURIComponent).join('/')}`;
  return url;
}
/** sign(url,init) is an AWS GET-only signer; emit receives one verified object at a time. */
export async function readAuthorizedMedia(items, config, sign, emit, options = {}) {
  if (!Array.isArray(items) || items.length > 25) throw Error('MEDIA_PAIR_LIMIT');
  const fetcher = options.fetcher || fetch, maxObject = 2*1024*1024, maxTotal = 32*1024*1024;
  const deadline = Date.now() + (options.budgetMs ?? 65000), seen = new Set(), outcomes=[];
  let totalBytes = 0, objects = 0;
  for (const item of items) {
    const pair=JSON.stringify([item.email,item.id]);
    if (seen.has(pair)) throw Error('MEDIA_PAIR_DUPLICATE'); seen.add(pair);
    let reason='MEDIA_NOT_AVAILABLE', success=false;
    const assets=[...(item.variants || []).filter(v=>v.key===item.asset?.previewKey),
      ...(item.variants || []).filter(v=>v.key===item.asset?.thumbnailKey),item.asset].filter(Boolean);
    for (const asset of assets) {
      if (Date.now() >= deadline) {reason='MEDIA_TIME_BUDGET';break;}
      if (asset.owner !== item.email || asset.remoteReady !== true || !hash.test(asset.sha256)
        || !Number.isSafeInteger(Number(asset.bytes)) || Number(asset.bytes)<=0 || Number(asset.bytes)>maxObject
        || !/^image\/(png|jpeg|webp|avif|gif)$/.test(asset.contentType || '')) {reason='MEDIA_METADATA_UNSUPPORTED';continue;}
      if (totalBytes+Number(asset.bytes)>maxTotal) {reason='MEDIA_TOTAL_LIMIT';break;}
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(10000,Math.max(1,deadline-Date.now())));
      try {
        const url=objectEndpoint(config,asset.key),signed=await sign(url,{method:'GET',signal:controller.signal});
        const response=await fetcher(signed,{method:'GET',redirect:'error',signal:controller.signal});
        if (response.status===404) {await response.body?.cancel();reason='MEDIA_OBJECT_MISSING';continue;}
        if (response.status!==200 || response.headers.has('content-range')) {await response.body?.cancel();reason='MEDIA_GET_FAILED';break;}
        const length=response.headers.get('content-length');
        if (length!==null && (!/^\d+$/.test(length) || Number(length)!==Number(asset.bytes))) {await response.body?.cancel();reason='MEDIA_LENGTH_MISMATCH';break;}
        const reader=response.body?.getReader();if(!reader)throw Error();
        let size=0;const chunks=[];
        try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;totalBytes+=value.byteLength;
          if(size>maxObject || totalBytes>maxTotal || size>Number(asset.bytes))throw Error();chunks.push(Buffer.from(value));}}
        catch {await reader.cancel().catch(()=>{});reason='MEDIA_STREAM_LIMIT';break;}
        const bytes=Buffer.concat(chunks);
        if(size!==Number(asset.bytes) || createHash('sha256').update(bytes).digest('hex')!==asset.sha256){reason='MEDIA_DIGEST_MISMATCH';break;}
        await emit({id:item.id,email:item.email,mime:asset.contentType,sha256:asset.sha256,base64:bytes.toString('base64'),variant:asset===item.asset?'original':asset.key===item.asset.previewKey?'preview':'thumbnail'});
        objects++;success=true;reason='CACHED_SOURCE_BYTES';break;
      } catch {reason=controller.signal.aborted?'MEDIA_GET_TIMEOUT':'MEDIA_GET_FAILED';break;}
      finally {clearTimeout(timer);}
    }
    outcomes.push({id:item.id,email:item.email,ok:success,result:reason});
  }
  return {objects,totalBytes,outcomes,sourceWrites:0,decodeOnSource:false};
}
