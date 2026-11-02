import {withCreationRoute} from "@/lib/saas/creation-context";
import {TeamError} from "@/lib/teams/server";
import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {scheduleCanvasVideoWorkflow,canvasWorkflowSchema} from "@/lib/video/canvas-workflow";
import {ModelConfigError} from "@/lib/model-config/types";
import {z} from "zod";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
export async function POST(request:Request){return withCreationRoute(request,async()=>{const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站执行"},{status:403});let enteredSchedule=false;try{const body=canvasWorkflowSchema.parse(JSON.parse(await readBounded(new Response(request.body),128*1024)));enteredSchedule=true;return NextResponse.json({ok:true,...await scheduleCanvasVideoWorkflow(actor,body)},{status:202});}catch(error){if(!enteredSchedule&&(error instanceof z.ZodError||error instanceof SyntaxError))return NextResponse.json({error:"制作链节点列表无效",operationNotStaged:true},{status:422});return (error instanceof ModelConfigError||error instanceof TeamError)?NextResponse.json({error:error.message,code:"code" in error?error.code:undefined},{status:error.status}):error instanceof z.ZodError?NextResponse.json({error:"制作链节点列表无效"},{status:422}):NextResponse.json({error:"制作链提交尚未核实，请查询原编号"},{status:503});}});}
