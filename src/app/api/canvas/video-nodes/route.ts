import {withCreationRoute} from "@/lib/saas/creation-context";
import {TeamError} from "@/lib/teams/server";
import {NextResponse} from "next/server";
import {authenticatedEmail,authorizedTargetEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {listVideoNodes,saveVideoNode,authorizeVideoProject} from "@/lib/canvas/video-node-service";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic";
function failure(error:unknown){return (error instanceof ModelConfigError||error instanceof TeamError)?NextResponse.json({error:error.message,code:"code" in error?error.code:undefined},{status:error.status}):NextResponse.json({error:"视频节点暂时不可用"},{status:503});}
export async function GET(request:Request){const email=await authorizedTargetEmail(request,new URL(request.url).searchParams.get("email"),true);if(!email)return NextResponse.json({error:"未登录或无权访问"},{status:401});
  try{const params=new URL(request.url).searchParams,key=params.get("projectKey")||undefined;if(key)await authorizeVideoProject(email,key);return NextResponse.json({ok:true,nodes:await listVideoNodes(email,key,params.get("includeDeleted")==="1")},{headers:{"cache-control":"private, no-store"}});}catch(error){return failure(error);}}
export async function POST(request:Request){return withCreationRoute(request,async()=>{const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  try{const body=JSON.parse(await readBounded(new Response(request.body),512*1024));return NextResponse.json({ok:true,node:await saveVideoNode(email,body)},{status:201});}catch(error){return failure(error);}});}
