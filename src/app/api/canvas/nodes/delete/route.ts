import { NextResponse } from "next/server";
import { dbEnabled, deleteCanvasNodesAtomically } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {deleteCanvasProject} from "@/lib/canvas/node-delete";
import {videoProjectKeySchema} from "@/lib/canvas/video-node-schema";
import {withCreationRoute,assertCreationProjectInput} from "@/lib/saas/creation-context";
import {getCharacterNode} from "@/lib/canvas/character-node-repository";
import {getDirectorNode} from "@/lib/canvas/director-node-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePost(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  let body: { artworkIds?: string[]; textIds?: string[];videoIds?:string[];directorIds?:string[];characterIds?:string[];operationId?:string;projectKey?:string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if(body.projectKey!==undefined){
    if(!videoProjectKeySchema.safeParse(body.projectKey).success||!body.operationId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.operationId)||body.artworkIds||body.textIds||body.videoIds||body.directorIds||body.characterIds)return NextResponse.json({error:"项目删除字段无效"},{status:422});
    if(!dbEnabled)return NextResponse.json({ok:true,persisted:false});
    try{await deleteCanvasProject(email,body.projectKey,body.operationId);return NextResponse.json({ok:true,persisted:true});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"项目删除失败"},{status:409});}
  }
  const artworkIds = Array.isArray(body.artworkIds)
    ? body.artworkIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const textIds = Array.isArray(body.textIds)
    ? body.textIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const videoIds=Array.isArray(body.videoIds)?body.videoIds.map(id=>String(id).trim()).filter(Boolean):[];
  const directorIds=Array.isArray(body.directorIds)?body.directorIds.map(id=>String(id).trim()).filter(Boolean):[];
  const characterIds=Array.isArray(body.characterIds)?body.characterIds.map(id=>String(id).trim()).filter(Boolean):[];
  if(artworkIds.length>200||textIds.length>200||videoIds.length>200||directorIds.length>200||characterIds.length>200)return NextResponse.json({error:"单次删除节点过多，请分批操作"},{status:422});
  if(body.operationId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.operationId))return NextResponse.json({error:"删除操作编号无效"},{status:422});
  if (!artworkIds.length && !textIds.length&&!videoIds.length&&!directorIds.length&&!characterIds.length) {
    return NextResponse.json({ error: "缺少待删除节点" }, { status: 400 });
  }
  if (!dbEnabled) {
    return NextResponse.json({ ok: true, persisted: false, artworks: 0, textNodes: 0 });
  }
  try {
    for(const id of directorIds){const node=await getDirectorNode(email,id,true);if(node)await assertCreationProjectInput(email,node.projectKey);}
    for(const id of characterIds){const node=await getCharacterNode(email,id,true);if(node)await assertCreationProjectInput(email,node.projectKey);}
    const deleted = await deleteCanvasNodesAtomically(email, artworkIds, textIds,videoIds,body.operationId,directorIds,characterIds);
    return NextResponse.json({ ok: true, persisted: true, ...deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除节点失败" },
      { status: 500 }
    );
  }
}
export function POST(request:Request){return withCreationRoute(request,()=>handlePost(request));}
