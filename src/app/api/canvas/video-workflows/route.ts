import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {scheduleCanvasVideoWorkflow} from "@/lib/video/canvas-workflow";
import {ModelConfigError} from "@/lib/model-config/types";
import {z} from "zod";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
export async function POST(request:Request){const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站执行"},{status:403});try{const body=JSON.parse(await readBounded(new Response(request.body),128*1024));return NextResponse.json({ok:true,...await scheduleCanvasVideoWorkflow(actor,body)},{status:202});}catch(error){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):error instanceof z.ZodError?NextResponse.json({error:"制作链节点列表无效"},{status:422}):NextResponse.json({error:"制作链提交尚未核实，请查询原编号"},{status:503});}}
