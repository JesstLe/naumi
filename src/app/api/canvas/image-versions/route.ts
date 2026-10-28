import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {listCanvasImageVersions} from "@/lib/canvas/image-version-store";
import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
export const runtime="nodejs",dynamic="force-dynamic";
export function GET(request:Request){return withCreationReceiptRoute(request,async()=>{
  const owner=await authenticatedEmail(request);if(!owner)return NextResponse.json({error:"请先登录"},{status:401});
  const id=new URL(request.url).searchParams.get("nodeId")||"";if(!id||id.length>200)return NextResponse.json({error:"图片节点编号无效"},{status:400});
  try{return NextResponse.json(await listCanvasImageVersions(owner,id),{headers:{"cache-control":"private, no-store"}});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"图片历史读取失败"},{status:409});}
});}
