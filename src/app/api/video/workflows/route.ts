import {withCreationRoute} from "@/lib/saas/creation-context";
import { TeamError } from "@/lib/teams/errors";
import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {scheduleVideoWorkflow,listVideoWorkflows} from "@/lib/video/workflow";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
function failure(error:unknown){return (error instanceof ModelConfigError||error instanceof TeamError)?NextResponse.json({error:error.message,code:"code" in error?error.code:undefined},{status:error.status}):NextResponse.json({error:"视频工作流暂时不可用"},{status:503});}
export async function GET(request:Request){const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  try{return NextResponse.json({ok:true,runs:await listVideoWorkflows(email,new URL(request.url).searchParams.get("projectKey")||undefined)},{headers:{"cache-control":"private, no-store"}});}catch(error){return failure(error);}}
export async function POST(request:Request){return withCreationRoute(request,async()=>{const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  try{const plan=JSON.parse(await readBounded(new Response(request.body),2*1024*1024));return NextResponse.json({ok:true,...await scheduleVideoWorkflow(email,plan)},{status:202});}catch(error){return failure(error);}});}
