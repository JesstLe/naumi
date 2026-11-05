import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {copyCanvasNodes,nodeCopyRequest} from "@/lib/canvas/node-copy";
import {ModelConfigError} from "@/lib/model-config/types";
import {withCreationRoute} from '@/lib/saas/creation-context';
import {withCreationOperation,assertCreationObjectRefs} from '@/lib/saas/creation-writer';
import {listArtworksByIds} from "@/lib/artworks/repository";
export const runtime="nodejs",dynamic="force-dynamic";
async function handlePost(request:Request){const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站复制"},{status:403});
  try{const input=nodeCopyRequest.safeParse(JSON.parse(await readBounded(new Response(request.body),64*1024)));if(!input.success)return NextResponse.json({error:"复制字段无效"},{status:422});
    await assertCreationObjectRefs(email,input.data.ids);const sources=await listArtworksByIds(email,input.data.ids);
    const result=await withCreationOperation('canvas-copy',input.data.operationId,email,{inputs:sources.map(a=>({artworkId:a.id,role:'copy-source'}))},()=>copyCanvasNodes(email,input.data),r=>({artworkIds:r.artworkIds}));
    return NextResponse.json({ok:true,...result});
  }catch(error){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"复制节点失败"},{status:503});}
}
export function POST(request:Request){return withCreationRoute(request,()=>handlePost(request));}
