import {NextResponse} from "next/server";
import {z} from "zod";
import {authorizedTargetEmail} from "@/lib/request-auth";
import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {getTimelineNode} from "@/lib/canvas/timeline-node-service";
import {requireTimelineMaterials} from "@/lib/canvas/timeline-materials";
import {timelineFailure} from "../../response";
export const runtime="nodejs",dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  return withCreationReceiptRoute(request,async()=>{
    const params=new URL(request.url).searchParams,actor=await authorizedTargetEmail(request,params.get("email"),true);if(!actor)return NextResponse.json({error:"未登录或无权访问"},{status:401});
    try{const node=await getTimelineNode(actor,(await context.params).id);if(!node)return NextResponse.json({error:"多轨节点不存在"},{status:404});const text=params.get("ids")||"[]";if(text.length>32768)return NextResponse.json({error:"素材查询过大"},{status:422});const ids=z.array(z.string().min(1).max(160)).max(1000).parse(JSON.parse(text));return NextResponse.json({materials:await requireTimelineMaterials(actor,ids)},{headers:{"cache-control":"private, no-store"}});}catch(error){return timelineFailure(error);}
  });
}
