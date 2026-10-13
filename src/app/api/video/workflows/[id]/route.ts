import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {getVideoWorkflow,resumeVideoWorkflow,cancelVideoWorkflow} from "@/lib/video/workflow";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
type Context={params:Promise<{id:string}>};
function failure(error:unknown){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"视频工作流暂时不可用"},{status:503});}
export async function GET(request:Request,context:Context){const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  try{return NextResponse.json({ok:true,run:await getVideoWorkflow(email,(await context.params).id)},{headers:{"cache-control":"private, no-store"}});}catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  const body=await request.json().catch(()=>null);if(!["resume","cancel"].includes(body?.action))return NextResponse.json({error:"工作流操作无效"},{status:422});
  try{const id=(await context.params).id;return NextResponse.json({ok:true,run:body.action==="cancel"?await cancelVideoWorkflow(email,id):await resumeVideoWorkflow(id,email)});}catch(error){return failure(error);}}
