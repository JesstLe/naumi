import {authenticatedEmail} from '@/lib/request-auth';
import {sameSiteBiMutation} from '@/lib/bi/access';
import {withCreationRequest} from '@/lib/saas/creation-context';
import {TeamError} from '@/lib/teams/errors';
import {ModelConfigError} from '@/lib/model-config/types';
import {VideoContractError} from '@/lib/video/contract';
import {readBounded} from '@/lib/supplier-cost/io';
import {checkRateLimit} from '@/lib/rate-limit-http';
import {previewCanvasVideo} from '@/lib/video/node-preview';

export const runtime='nodejs',dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','vary':'Cookie, Authorization'}});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const actor=await authenticatedEmail(request);if(!actor)return json({error:'请先登录'},401);
  if(!sameSiteBiMutation(request))return json({error:'不允许跨站请求'},403);
  const admitted=await checkRateLimit(`video-compile-preview:${actor}`,120,60_000);if(admitted instanceof Response)return admitted;if(!admitted)return json({error:'请求过于频繁'},429);
  try{
    const scoped=request.clone(),raw=JSON.parse(await readBounded(new Response(request.body),256*1024));
    return await withCreationRequest(scoped,actor,async()=>{const result=await previewCanvasVideo(actor,(await context.params).id,raw);return json(result,result.ok?200:422);},{receipt:true});
  }catch(error){
    if(error instanceof SyntaxError)return json({error:'视频预览JSON无效',code:'INVALID_VIDEO_PREVIEW'},422);
    if(error instanceof TeamError||error instanceof ModelConfigError||error instanceof VideoContractError)return json({error:error.message,...(error instanceof TeamError?{}:{code:error.code})},error.status);
    return json({error:'视频预览暂不可用'},503);
  }
}
