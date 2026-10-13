import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {requestVideoCancellation} from "@/lib/video/cancellation";
import {ModelConfigError} from "@/lib/model-config/types";
export const runtime="nodejs",dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站停止"},{status:403});
  try{return NextResponse.json({ok:true,...await requestVideoCancellation(email,(await context.params).id)});}
  catch(error){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"停止请求暂时不可用"},{status:503});}
}
