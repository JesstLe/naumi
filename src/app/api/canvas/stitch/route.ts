import {NextResponse} from 'next/server';
import {dbEnabled} from '@/platform/db/pool';
import {authenticatedEmail} from '@/lib/request-auth';
import {canvasStitchRequest,MAX_STITCH_IMAGES} from '@/lib/canvas/stitch-contract';
import {readCanvasStitch,stitchCanvasArtworks} from '@/lib/canvas/stitch';
import {ModelConfigError} from '@/lib/model-config/types';
import {withCreationReceiptRoute} from '@/lib/saas/creation-context';

export const runtime='nodejs';
export const dynamic='force-dynamic';
function errorResponse(error:unknown){return NextResponse.json({error:error instanceof Error?error.message:'详情长图拼接失败',...(error instanceof ModelConfigError?{code:error.code}:{})},{status:error instanceof ModelConfigError?error.status:500});}
async function handlePost(request:Request){
 if(!dbEnabled)return NextResponse.json({error:'未启用作品存储',accepted:false},{status:400});
 const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:'请先登录',accepted:false},{status:401});
 const parsed=canvasStitchRequest.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:`请选择 2–${MAX_STITCH_IMAGES} 张图片`,accepted:false},{status:400});
 try{return NextResponse.json(await stitchCanvasArtworks(email,parsed.data,request.url));}catch(error){return errorResponse(error);}
}
async function handleGet(request:Request){
 const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:'请先登录'},{status:401});
 const operationId=new URL(request.url).searchParams.get('operationId');
 if(!operationId||!canvasStitchRequest.shape.operationId.unwrap().safeParse(operationId).success)return NextResponse.json({error:'拼接操作编号无效'},{status:400});
 try{return NextResponse.json({ok:true,result:await readCanvasStitch(email,operationId)});}catch(error){return errorResponse(error);}
}
// Existing receipt reads remain authorized after new creation is disabled.
// The use case checks creation permission only for genuinely new work.
export function POST(request:Request){return withCreationReceiptRoute(request,()=>handlePost(request));}
export function GET(request:Request){return withCreationReceiptRoute(request,()=>handleGet(request));}
