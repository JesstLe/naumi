import "server-only";
import type {PoolClient} from "pg";
import {audioEditMediaRequest, effectiveAudioEdit, type AudioProject} from "../audio/project";
import {ModelConfigError} from "../model-config/types";
import {readMediaJobEvidence} from "../video/media-jobs";
import {requireAudioMaterials} from "./audio-materials";

/** Validate final media state, so a mixed restore is independent of operation order.
 * Copies may change artwork IDs but must keep the exact frozen source/output bytes. */
export async function validateAudioProject(actor: string, project: AudioProject, tx?: PoolClient) {
  const ids = [project.sourceArtworkId, project.adopted?.artworkId].filter((id): id is string => !!id);
  const materials = await requireAudioMaterials(actor, ids, tx), byId = new Map(materials.map(media => [media.id, media]));
  const source = project.sourceArtworkId ? byId.get(project.sourceArtworkId)! : null;
  if (!source) return materials;
  try {effectiveAudioEdit(project.edit, source.duration);} catch (error) {throw new ModelConfigError("AUDIO_EDIT_INVALID", (error as Error).message, 422);}
  const checkRecipe = (job: Awaited<ReturnType<typeof readMediaJobEvidence>>, edit: AudioProject["edit"]) => {
    let expected;
    try {expected = audioEditMediaRequest({...project, edit}, source.duration, job.request.operationId, job.request.projectKey);} catch (error) {throw new ModelConfigError("AUDIO_EDIT_INVALID", (error as Error).message, 422);}
    const input = job.inputs[0];
    if (job.request.action !== expected.action || job.inputs.length !== 1 || input.key !== source.storageKey || input.sha256 !== source.sha256 ||
      JSON.stringify(job.request.args) !== JSON.stringify(expected.args) || JSON.stringify(job.request.outputs) !== JSON.stringify(expected.outputs) ||
      job.request.auxiliaryFiles.length || job.request.auxiliaryOutputs.length) throw new ModelConfigError("AUDIO_RESULT_CONFLICT", "音频任务与所选来源或剪辑设定不一致", 409);
  };
  if (project.render) {
    try {effectiveAudioEdit(project.render.edit, source.duration);} catch (error) {throw new ModelConfigError("AUDIO_EDIT_INVALID", (error as Error).message, 422);}
  }
  const adopted = project.adopted;
  if (!adopted?.jobId) return materials;
  const result = byId.get(adopted.artworkId)!, job = await readMediaJobEvidence(actor, adopted.jobId, true, tx);
  checkRecipe(job, adopted.edit);
  const output = job.outputs.find(item => item.storageKey === result.storageKey && item.sha256 === result.sha256 && !item.fragment);
  if (!output?.mimeType.startsWith("audio/")) throw new ModelConfigError("AUDIO_RESULT_CONFLICT", "音频结果与所选剪辑任务不一致", 409);
  return materials;
}
