import {getAudioNode} from "@/lib/canvas/audio-node-repository";
import {getSceneNode} from "@/lib/canvas/scene-node-repository";
import {getCharacterNode} from "@/lib/canvas/character-node-repository";
import {z} from "zod";
import {CanvasArtworkWriteConflict,canvasArtworkFieldsSchema} from "@/lib/canvas/artwork-write";
import {canvasTextSnapshotSchema} from "@/lib/canvas/history-contract";
import {CanvasTextWriteConflict} from "@/lib/canvas/text-write";
import { NextResponse } from "next/server";
import {dbEnabled} from "@/platform/db/pool";
import {deleteCanvasNodesAtomically} from "@/lib/canvas/node-deletion";
import { authenticatedEmail } from "@/lib/request-auth";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {deleteCanvasProject} from "@/lib/canvas/node-delete";
import {withCreationRoute} from "@/lib/saas/creation-context";
import {assertCreationProjectInput} from "@/lib/saas/creation-access";
import {getDirectorNode} from "@/lib/canvas/director-node-repository";
import { videoProjectKeySchema } from "@/lib/canvas/project-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePost(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站修改"},{status:403});
  let body: { artworkIds?: string[]; textIds?: string[];videoIds?:string[];directorIds?:string[];characterIds?:string[];sceneIds?:string[];audioIds?:string[];operationId?:string;projectKey?:string;expectedTexts?:unknown;expectedArtworks?:unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if(body.projectKey!==undefined){
    if(!videoProjectKeySchema.safeParse(body.projectKey).success||!body.operationId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.operationId)||body.artworkIds||body.textIds||body.videoIds||body.directorIds||body.characterIds||body.sceneIds||body.audioIds)return NextResponse.json({error:"项目删除字段无效"},{status:422});
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
  const sceneIds=Array.isArray(body.sceneIds)?body.sceneIds.map(id=>String(id).trim()).filter(Boolean):[];
  const audioIds=Array.isArray(body.audioIds)?body.audioIds.map(id=>String(id).trim()).filter(Boolean):[];
  if(artworkIds.length>200||textIds.length>200||videoIds.length>200||directorIds.length>200||characterIds.length>200||sceneIds.length>200||audioIds.length>200)return NextResponse.json({error:"单次删除节点过多，请分批操作"},{status:422});
  if(body.operationId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.operationId))return NextResponse.json({error:"删除操作编号无效"},{status:422});
  if (!artworkIds.length && !textIds.length&&!videoIds.length&&!directorIds.length&&!characterIds.length&&!sceneIds.length&&!audioIds.length) {
    return NextResponse.json({ error: "缺少待删除节点" }, { status: 400 });
  }
  if (!dbEnabled) {
    return NextResponse.json({ ok: true, persisted: false, artworks: 0, textNodes: 0 });
  }
  const expected=body.expectedTexts===undefined?undefined:canvasTextSnapshotSchema.array().safeParse(body.expectedTexts);
  if(expected&&!expected.success)return NextResponse.json({error:"文字删除基线无效"},{status:422});
  const artworkExpected=body.expectedArtworks===undefined?undefined:z.array(z.object({id:z.string().min(1).max(200),fields:canvasArtworkFieldsSchema})).safeParse(body.expectedArtworks);
  if(artworkExpected&&!artworkExpected.success)return NextResponse.json({error:"图片删除基线无效"},{status:422});
  try {
    for(const id of directorIds){const node=await getDirectorNode(email,id,true);if(node)await assertCreationProjectInput(email,node.projectKey);}
    for(const id of characterIds){const node=await getCharacterNode(email,id,true);if(node)await assertCreationProjectInput(email,node.projectKey);}
    for(const id of sceneIds){const node=await getSceneNode(email,id,true);if(node)await assertCreationProjectInput(email,node.projectKey);}
    for(const id of audioIds){const node=await getAudioNode(email,id,true);if(node)await assertCreationProjectInput(email,node.projectKey);}
    const deleted = await deleteCanvasNodesAtomically(email, artworkIds, textIds,videoIds,body.operationId,expected?.success?expected.data.map(n=>({...n,updatedAt:n.updatedAt||n.createdAt})):undefined,artworkExpected?.success?artworkExpected.data:undefined,directorIds,characterIds,sceneIds,audioIds);
    return NextResponse.json({ ok: true, persisted: true, ...deleted });
  } catch (error) {
    if(error instanceof CanvasArtworkWriteConflict)return NextResponse.json({error:error.message,code:error.code,id:error.id,fields:error.fields,current:error.current},{status:409});
    if(error instanceof CanvasTextWriteConflict)return NextResponse.json({error:error.message,code:error.code,id:error.id,fields:error.fields,current:error.current},{status:409});
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除节点失败" },
      { status: 500 }
    );
  }
}
export function POST(request:Request){return withCreationRoute(request,()=>handlePost(request));}
