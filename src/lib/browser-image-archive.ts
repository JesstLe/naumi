'use client';
import {cachedImageBlob,imageCacheSource} from './browser-image-cache';
import {authHeader} from './supabase';
export async function browserImageArchive(items:{url:string;name:string}[]):Promise<Blob>{
  // Keep the existing server archive for mixed video/external or very large sets.
  if(!items.length||items.length>30||items.some(item=>!imageCacheSource(item.url))){
    const response=await fetch('/api/suite/download',{method:'POST',headers:{'content-type':'application/json',...await authHeader()},body:JSON.stringify({items})});
    if(!response.ok)throw new Error('打包失败');return response.blob();
  }
  const JSZip=(await import('jszip')).default,zip=new JSZip();let total=0;
  // Bound concurrent reads and memory. Each cache read independently verifies access.
  for(let start=0;start<items.length;start+=3){
    const batch=await Promise.all(items.slice(start,start+3).map(async(item,j)=>({item,i:start+j,blob:await cachedImageBlob(item.url)})));
    for(const {item,i,blob}of batch){total+=blob.size;if(total>128*1024*1024)throw new Error('本地打包超过大小上限');
      const name=(item.name||`image-${i+1}`).replace(/[\\/:*?"<>|]/g,'_').slice(0,60);
      const extension=(new URL(item.url,location.origin).pathname.match(/\.([a-z0-9]+)$/i)?.[1]||'png').toLowerCase();
      zip.file(`${String(i+1).padStart(2,'0')}-${name}.${extension}`,await blob.arrayBuffer());
    }
  }
  return zip.generateAsync({type:'blob'});
}
