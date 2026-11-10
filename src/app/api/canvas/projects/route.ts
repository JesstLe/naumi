import { NextResponse } from "next/server";
import { dbEnabled } from "@/platform/db/pool";
import { authenticatedEmail } from "@/lib/request-auth";
import { requestFeaturePolicy } from "@/lib/feature-access/server";
import { allows } from "@/lib/feature-access/catalog";
import { withCreationReceiptRoute } from "@/lib/saas/creation-context";
import { recentCanvasProjects } from "@/lib/canvas/project-summary";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export function GET(request:Request){return withCreationReceiptRoute(request,async()=>{
  const actor=await authenticatedEmail(request);
  const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
  if(!actor)return json({error:"请先登录"},401);
  const access=await requestFeaturePolicy(request);
  if(!access.admin&&(!access.policy||!allows(access.policy,"canvas")))return json({error:"画布尚未授权"},403);
  if(!dbEnabled)return json({projects:[],persisted:false});
  try{return json({projects:await recentCanvasProjects(actor),persisted:true});}
  catch{return json({error:"画布列表读取失败，请重试"},503);}
});}
