import {NextResponse} from "next/server";
import {z} from "zod";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {withCreationRoute} from "@/lib/saas/creation-context";
import {readBounded} from "@/lib/supplier-cost/io";
import {adoptTimelineResult} from "@/lib/canvas/timeline-node-service";
import {timelineNodeIdSchema} from "@/lib/canvas/timeline-node-schema";
import {timelineFailure} from "../../response";
export const runtime="nodejs",dynamic="force-dynamic";
const requestSchema=z.strictObject({operationId:z.uuid(),expectedRevision:z.number().int().positive(),jobId:z.uuid()});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  return withCreationRoute(request,async()=>{
    const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
    if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
    try{const id=timelineNodeIdSchema.parse((await context.params).id),body=requestSchema.parse(JSON.parse(await readBounded(new Response(request.body),8192)));return NextResponse.json({node:await adoptTimelineResult(actor,{...body,id})});}catch(error){return timelineFailure(error);}
  });
}
