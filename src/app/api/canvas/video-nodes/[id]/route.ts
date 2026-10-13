import {NextResponse} from "next/server";
import {authenticatedEmail,authorizedTargetEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {getVideoNode,saveVideoNode} from "@/lib/canvas/video-node-service";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
function failure(error:unknown){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"视频节点暂时不可用"},{status:503});}
export async function GET(request:Request,context:Context){const email=await authorizedTargetEmail(request,new URL(request.url).searchParams.get("email"),true);if(!email)return NextResponse.json({error:"未登录或无权访问"},{status:401});
  try{const node=await getVideoNode(email,(await context.params).id);if(!node)return NextResponse.json({error:"视频节点不存在"},{status:404});return NextResponse.json({ok:true,node},{headers:{"cache-control":"private, no-store"}});}catch(error){return failure(error);}}
export async function PATCH(request:Request,context:Context){const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  try{const id=(await context.params).id;if(!await getVideoNode(email,id,true))return NextResponse.json({error:"视频节点不存在"},{status:404});
    const body=JSON.parse(await readBounded(new Response(request.body),512*1024));return NextResponse.json({ok:true,node:await saveVideoNode(email,{...body,id})});}catch(error){return failure(error);}}
