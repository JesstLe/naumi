import {NextResponse} from 'next/server';
import {teamJson,PRIVATE_HEADERS} from '@/lib/teams/access';
import {MediaPreviewBusy,MediaPreviewVersionChanged,renderMediaPreview} from '@/lib/media-preview';
/** Authorization precedes this renderer; never accept an image URL from the browser. */
export async function enterpriseMediaResponse(request:Request,imageUrl:string){
  const signal=request.signal;
  try {
    const {image}=await renderMediaPreview(request,async()=>({url:imageUrl}),{validateCacheVersion:true});
    return new NextResponse(image, { headers: { ...PRIVATE_HEADERS, "Content-Type": "image/webp", "Content-Security-Policy": "default-src 'none'" } });
  } catch(error) {
    if(signal.aborted)return teamJson({error:'请求已取消'},499);
    if(error instanceof MediaPreviewBusy){const response=teamJson({error:'预览请求较多，请稍后重试'},503);response.headers.set('Retry-After','1');return response;}
    if(error instanceof MediaPreviewVersionChanged)return teamJson({error:'素材版本已改变'},409);
    return teamJson({ error: "媒体暂时不可读取" }, 422);
  }
}
