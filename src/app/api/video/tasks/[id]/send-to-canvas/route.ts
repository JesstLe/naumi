import {NextResponse} from "next/server";
import {z} from "zod";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {sendVideoTaskToCanvas} from "@/lib/canvas/video-node-service";
import { videoProjectKeySchema } from "@/lib/canvas/project-key";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  try{const text=await readBounded(new Response(request.body),8192),parsed=z.strictObject({projectKey:videoProjectKeySchema.optional()}).safeParse(text?JSON.parse(text):{});
    if(!parsed.success)return NextResponse.json({error:"目标项目无效"},{status:422});
    return NextResponse.json({ok:true,...await sendVideoTaskToCanvas(email,(await context.params).id,parsed.data.projectKey)});
  }catch(error){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"发送到画布失败"},{status:503});}
}
