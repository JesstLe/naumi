import "server-only";
import {getPool} from "../db";
import {parseTimelineInputIdentity} from "../timeline/project";
import {ModelConfigError} from "../model-config/types";
import {assertCreationProjectInput} from "../saas/creation-context";
import type {OrderedInput} from "../video/references";
import {ensureTimelineNodeSchema,mapTimelineNode} from "./timeline-node-repository";
import {requireTimelineMaterials} from "./timeline-materials";

export async function resolveCanvasTimelineInputs(actorRaw:string,inputs:readonly OrderedInput[]){
  const actor=actorRaw.toLowerCase(),bindings=inputs.filter(input=>input.nodeId.startsWith("timeline-node:"));if(!bindings.length)return [...inputs];
  const parsed=bindings.map(input=>{const id=parseTimelineInputIdentity(input.nodeId);if(!id||input.kind!=="video"||input.role!=="source_video")throw new ModelConfigError("TIMELINE_INPUT_INVALID","多轨节点引用身份或职责无效",422);return {input,id};});
  await ensureTimelineNodeSchema();const nodes=(await getPool().query("SELECT * FROM app_canvas_timeline_nodes WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL",[actor,[...new Set(parsed.map(binding=>binding.id))]])).rows.map(mapTimelineNode),byId=new Map(nodes.map(node=>[node.id,node]));for(const node of nodes)await assertCreationProjectInput(actor,node.projectKey);
  const resolved=parsed.map(binding=>{const id=byId.get(binding.id)?.adopted?.artworkId;if(!id)throw new ModelConfigError("TIMELINE_REFERENCE_UNAVAILABLE","多轨节点尚未采用有效成片，或无权访问",404);return {...binding,artworkId:id};});
  const media=new Map((await requireTimelineMaterials(actor,resolved.map(binding=>binding.artworkId))).map(source=>[source.artworkId,source]));
  const replacements=new Map(resolved.map(binding=>{const source=media.get(binding.artworkId)!;if(source.kind!=="video")throw new ModelConfigError("TIMELINE_REFERENCE_INVALID","多轨成片没有有效视频流",422);return [binding.input.id,{...binding.input,nodeId:`video:${binding.artworkId}`,value:source.url}];}));return inputs.map(input=>replacements.get(input.id)??{...input});
}
