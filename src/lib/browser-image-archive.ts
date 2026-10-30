'use client';
import {cachedImageBlob,imageCacheSource} from './browser-image-cache';
import {authHeader} from './supabase';
import type {ImagegenBatchResult} from './imagegen/client';
type ArchiveOptions={signal?:AbortSignal;headers?:()=>Promise<HeadersInit>};
export async function browserImageArchive(items:{url:string;name:string}[],options:ArchiveOptions={}):Promise<Blob>{
  const check=()=>options.signal?.throwIfAborted();check();
  // Keep the existing server archive for mixed video/external or very large sets.
  if(!items.length||items.length>30||items.some(item=>!imageCacheSource(item.url))){
    const request=async(batch:typeof items)=>{
      const headers=new Headers(options.headers?await options.headers():await authHeader());headers.set('content-type','application/json');check();
      const response=await fetch('/api/suite/download',{method:'POST',headers,body:JSON.stringify({items:batch}),signal:options.signal});
      if(!response.ok){await response.body?.cancel();throw new Error('打包失败');}return response.blob();
    };
    if(items.length<=30)return request(items);
    // Preserve the existing server's 30-item request protocol, not its old
    // silent first-page truncation. One explicit archive owns all chunk results.
    const JSZip=(await import('jszip')).default,zip=new JSZip();
    for(let offset=0;offset<items.length;offset+=30){
      check();const part=await JSZip.loadAsync(await(await request(items.slice(offset,offset+30))).arrayBuffer());check();
      for(const [name,file]of Object.entries(part.files))if(!file.dir){
        const globalName=name.replace(/^(\d+)-/,(_,index)=>`${String(Number(index)+offset).padStart(2,'0')}-`);
        zip.file(globalName,await file.async('uint8array'));
      }
    }
    check();const blob=await zip.generateAsync({type:'blob'},check);check();return blob;
  }
  const JSZip=(await import('jszip')).default,zip=new JSZip();let total=0;
  // Bound concurrent reads and memory. Each cache read independently verifies access.
  for(let start=0;start<items.length;start+=3){
    check();const batch=await Promise.all(items.slice(start,start+3).map(async(item,j)=>({item,i:start+j,blob:await cachedImageBlob(item.url,options.signal)})));check();
    for(const {item,i,blob}of batch){total+=blob.size;if(total>128*1024*1024)throw new Error('本地打包超过大小上限');
      const name=(item.name||`image-${i+1}`).replace(/[\\/:*?"<>|]/g,'_').slice(0,60);
      const extension=(new URL(item.url,location.origin).pathname.match(/\.([a-z0-9]+)$/i)?.[1]||'png').toLowerCase();
      zip.file(`${String(i+1).padStart(2,'0')}-${name}.${extension}`,await blob.arrayBuffer());
    }
  }
  const blob=await zip.generateAsync({type:'blob'},check);check();return blob;
}
export async function browserImagegenBatchArchive(batch:ImagegenBatchResult):Promise<Blob>{
  const artifacts=batch.items.flatMap(item=>item.result.artifacts.map(artifact=>({item,artifact})));
  if(artifacts.length>30||artifacts.some(({artifact})=>!imageCacheSource(artifact.url))){const response=await fetch(`/api/imagegen/batches/${batch.id}/download`,{headers:await authHeader()});if(!response.ok)throw new Error('原图下载失败');return response.blob();}
  const JSZip=(await import('jszip')).default,zip=new JSZip();let size=0,ordinal=0;
  for(const {item,artifact}of artifacts){const blob=await cachedImageBlob(artifact.url);size+=blob.size;if(size>128*1024*1024)throw new Error('本地打包超过大小上限');
    let name=item.name.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/g,'-').replace(/^[. ]+|[. ]+$/g,'').slice(0,80)||'image';
    if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='image-'+name;
    const extension=blob.type==='image/webp'?'webp':blob.type==='image/jpeg'?'jpg':'png';zip.file(`${name}-${++ordinal}.${extension}`,await blob.arrayBuffer());
  }
  zip.file('results.jsonl',batch.items.map(item=>JSON.stringify({key:item.key,name:item.name,status:item.result.status,chargedCredits:item.result.chargedCredits,error:item.result.error,artworkIds:item.result.artifacts.map(a=>a.artworkId)})).join('\n')+'\n');
  return zip.generateAsync({type:'blob'});
}
