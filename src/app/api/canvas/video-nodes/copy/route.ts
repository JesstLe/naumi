import {withCreationRoute} from "@/lib/saas/creation-context";
import { TeamError } from "@/lib/teams/errors";
import {NextResponse} from "next/server";
import {z} from "zod";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {copyVideoNodes} from "@/lib/canvas/video-node-service";
import { videoNodeIdSchema } from "@/lib/canvas/video-node-schema";
import { videoProjectKeySchema } from "@/lib/canvas/project-key";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic";
const schema=z.strictObject({ids:z.array(videoNodeIdSchema).min(1).max(100),projectKey:videoProjectKeySchema,operationId:z.uuid()});
export async function POST(request:Request){return withCreationRoute(request,async()=>{const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  try{const parsed=schema.safeParse(JSON.parse(await readBounded(new Response(request.body),32*1024)));
    if(!parsed.success)return NextResponse.json({error:"复制字段无效"},{status:422});
    return NextResponse.json({ok:true,...await copyVideoNodes(email,parsed.data.ids,parsed.data.projectKey,parsed.data.operationId)});
  }catch(error){return (error instanceof ModelConfigError||error instanceof TeamError)?NextResponse.json({error:error.message,code:"code" in error?error.code:undefined},{status:error.status}):NextResponse.json({error:"复制视频节点失败"},{status:503});}});}
