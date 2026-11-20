'use client';
import {browserImageArchive} from '../browser-image-archive';
import {cachedImageBlob,imageCacheSource,ImageCacheDenied} from '../browser-image-cache';
import {createImageDownloadName} from '../download';
import {mediaDownloadHref} from '../media/download-href';
import {canvasDocumentHeaders,type CanvasDocumentScope} from './document-scope';
import type {CanvasDownloadPorts} from './downloads';
import {prepareImageUpload} from '../client-image-upload';
import {browserImageHeader} from '../browser-reference-image';

function clickDownload(href:string,name:string){
  const link=document.createElement('a');link.href=href;link.download=name;
  document.body.appendChild(link);try{link.click();}finally{link.remove();}
}
export function canvasDownloadBrowser(scope:CanvasDocumentScope):CanvasDownloadPorts{
  return{
    async image(source,signal){
      const name=createImageDownloadName();let blob:Blob;
      try{if(!imageCacheSource(source))throw Error('native download');blob=await cachedImageBlob(source,signal);}
      catch(error){
        if(error instanceof ImageCacheDenied||signal.aborted)throw error;
        const headers=await canvasDocumentHeaders(scope);signal.throwIfAborted();
        const response=await fetch(`/api/download?u=${encodeURIComponent(source)}&n=${encodeURIComponent(name)}`,{headers,signal});
        if(!response.ok){await response.body?.cancel();throw Error('download');}blob=await response.blob();
      }
      return{blob,name};
    },
    archive:(items,signal)=>browserImageArchive(items,{signal,headers:()=>canvasDocumentHeaders(scope)}),
    async compress(blob,signal){
      signal.throwIfAborted();
      const file=new File([blob],'original',{type:blob.type});await browserImageHeader(file);signal.throwIfAborted();
      const prepared=await prepareImageUpload(file,{force:true,maxEdge:Number.MAX_SAFE_INTEGER,quality:0.82});
      signal.throwIfAborted();return prepared.optimized?prepared.file:null;
    },
    save(blob,name){const url=URL.createObjectURL(blob);try{clickDownload(url,name);}finally{URL.revokeObjectURL(url);}},
    video(source){clickDownload(mediaDownloadHref(source),'video.mp4');},
  };
}
