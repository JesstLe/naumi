import {NextResponse} from 'next/server';
import {biAuthorize,biJson,BI_PRIVATE_HEADERS} from '@/lib/bi/access';
import {ArtworkPreviewNotAvailable,resolveArtworkPreview} from '@/lib/bi/artwork-preview-source';
import {logBiAccess} from '@/lib/bi/repository';
import {MediaPreviewBusy,renderMediaPreview} from '@/lib/media-preview';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
 const auth=await biAuthorize(request);
 if(auth instanceof NextResponse)return auth;
 const params=new URL(request.url).searchParams;
 const id=params.get('id')||'',slot=params.get('slot')||'result',index=params.get('index')||'0';
 if(!id||id.length>200)return biJson({error:'作品参数无效'},400);
 if((slot!=='result'&&slot!=='input')||!/^(0|[1-9]\d?)$/.test(index))return biJson({error:'图片参数无效'},400);
 try{
  const {image,source}=await renderMediaPreview(request,()=>resolveArtworkPreview(id,slot,Number(index),request.signal));
  if(params.get('full')==='1')await logBiAccess(auth.actor,slot==='input'?'view-input-image':'view-image','artworks',source.email);
  request.signal.throwIfAborted();
  return new NextResponse(image,{headers:{...BI_PRIVATE_HEADERS,'Content-Type':'image/webp','Content-Security-Policy':"default-src 'none'"}});
 }catch(error){
  if(request.signal.aborted)return biJson({error:'请求已取消'},499);
  if(error instanceof ArtworkPreviewNotAvailable)return biJson({error:error.message},error.status);
  if(error instanceof MediaPreviewBusy){const busy=biJson({error:'预览请求较多，请稍后重试'},503);busy.headers.set('Retry-After','1');return busy;}
  return biJson({error:'图片暂时不可读取，原始作品记录仍保留'},422);
 }
}
