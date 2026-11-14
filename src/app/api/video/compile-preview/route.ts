import {authenticatedEmail} from '@/lib/request-auth';
import {sameSiteBiMutation} from '@/lib/bi/access';
import {withCreationRequest} from '@/lib/saas/creation-context';
import {TeamError} from '@/lib/teams/errors';
import {ModelConfigError} from '@/lib/model-config/types';
import {readBounded} from '@/lib/supplier-cost/io';
import {checkRateLimit} from '@/lib/rate-limit-http';
import {previewVideoExecution} from '@/lib/video/compile-preview';

export const runtime='nodejs',dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','vary':'Cookie, Authorization'}});
export async function POST(request:Request){
  const actor=await authenticatedEmail(request);if(!actor)return json({error:'请先登录'},401);
  if(!sameSiteBiMutation(request))return json({error:'不允许跨站请求'},403);
  const admitted=await checkRateLimit(`video-compile-preview:${actor}`,120,60_000);
  if(admitted instanceof Response)return admitted;
  if(!admitted)return json({error:'请求过于频繁'},429);
  try{
    const scopedRequest=request.clone();
    const raw=JSON.parse(await readBounded(new Response(request.body),256*1024));
    // Receipt mode performs scope authorization without binding a project or
    // accepting a creation. The use case separately checks current feature access.
    return await withCreationRequest(scopedRequest,actor,async()=>{
      const result=await previewVideoExecution(actor,raw);return json(result,result.ok?200:422);
    },{receipt:true});
  }catch(error){
    if(error instanceof SyntaxError)return json({error:'视频预览JSON无效',code:'INVALID_VIDEO_PREVIEW'},422);
    if(error instanceof TeamError||error instanceof ModelConfigError)return json({error:error.message,...(error instanceof ModelConfigError?{code:error.code}:{})},error.status);
    return json({error:'视频预览暂不可用'},503);
  }
}
