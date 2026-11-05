import "server-only";
import {getPool} from "@/platform/db/pool";
import {parseAudioInputIdentity} from "../audio/project";
import {ModelConfigError} from "../model-config/types";
import {assertCreationProjectInput} from "../saas/creation-access";
import type {OrderedInput} from "../video/references";
import {ensureAudioNodeSchema, mapAudioNode} from "./audio-node-repository";
import {requireAudioMaterials} from "./audio-materials";

/** A live editor binding becomes the explicitly adopted real artwork at acceptance.
 * Existing task replay happens before this lookup; later drafts never replace it. */
export async function resolveCanvasAudioInputs(actorRaw: string, inputs: readonly OrderedInput[]) {
  const actor = actorRaw.toLowerCase(), bindings = inputs.filter(input => input.nodeId.startsWith("audio-node:"));
  if (!bindings.length) return [...inputs];
  const parsed = bindings.map(input => {
    const id = parseAudioInputIdentity(input.nodeId);
    if (!id || input.kind !== "audio" || input.role !== "source_audio") throw new ModelConfigError("AUDIO_INPUT_INVALID", "音频节点引用身份或职责无效", 422, ["inputs"]);
    return {input, id};
  });
  await ensureAudioNodeSchema();
  const records = (await getPool().query("SELECT * FROM app_canvas_audio_nodes WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL", [actor, [...new Set(parsed.map(binding => binding.id))]])).rows.map(mapAudioNode);
  const byId = new Map(records.map(node => [node.id, node]));
  for (const node of records) await assertCreationProjectInput(actor, node.projectKey);
  const resolved = parsed.map(binding => {
    const node = byId.get(binding.id), artworkId = node?.audio.adopted?.artworkId;
    if (!node || !artworkId) throw new ModelConfigError("AUDIO_REFERENCE_UNAVAILABLE", "音频节点尚未采用有效音频，或无权访问", 404);
    return {...binding, artworkId};
  });
  const media = new Map((await requireAudioMaterials(actor, resolved.map(binding => binding.artworkId))).map(art => [art.id, art]));
  const replacements = new Map(resolved.map(binding => [binding.input.id, {...binding.input, nodeId: `audio:${binding.artworkId}`, value: media.get(binding.artworkId)!.url}]));
  return inputs.map(input => replacements.get(input.id) ?? {...input});
}
