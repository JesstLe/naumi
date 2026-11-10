import {NextResponse} from "next/server";
import {z} from "zod";
import {authenticatedEmail} from "../request-auth";
import {withCreationRoute} from "../saas/creation-context";
import {sameSiteBiMutation} from "../bi/access";
import {readBounded} from "../supplier-cost/io";
import {ModelConfigError} from "../model-config/types";
import {TeamError} from "../teams/errors";

export function storyboardProductionRoute(request:Request,execute:(actor:string,body:unknown)=>Promise<unknown>,receipt=false){return withCreationRoute(request,async(authenticatedActor)=>{
  const actor=await authenticatedEmail(request,authenticatedActor);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站操作"},{status:403});
  try{const body=JSON.parse(await readBounded(new Response(request.body),128*1024));return NextResponse.json(await execute(actor,body),{headers:{"cache-control":"private, no-store"}});}
  catch(error){if(error instanceof ModelConfigError||error instanceof TeamError)return NextResponse.json({error:error.message,code:"code" in error?error.code:undefined},{status:error.status});if(error instanceof z.ZodError||error instanceof SyntaxError)return NextResponse.json({error:"制作准备参数无效"},{status:422});return NextResponse.json({error:"操作结果尚未核实，请沿用原操作重试"},{status:503});}
},{receipt});}
