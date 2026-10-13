import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {readBounded} from "@/lib/supplier-cost/io";
import {listVideoNodes,saveVideoNode,authorizeVideoProject} from "@/lib/canvas/video-node-service";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic";
function failure(error:unknown){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"视频节点暂时不可用"},{status:503});}
export async function GET(request:Request){const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  try{const key=new URL(request.url).searchParams.get("projectKey")||undefined;if(key)await authorizeVideoProject(email,key);return NextResponse.json({ok:true,nodes:await listVideoNodes(email,key)},{headers:{"cache-control":"private, no-store"}});}catch(error){return failure(error);}}
export async function POST(request:Request){const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  try{const body=JSON.parse(await readBounded(new Response(request.body),512*1024));return NextResponse.json({ok:true,node:await saveVideoNode(email,body)},{status:201});}catch(error){return failure(error);}}
