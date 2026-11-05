import "server-only";
import { getPool } from "@/platform/db/pool";
import { ModelConfigError } from "../model-config/types";
import { bindActualCreationProject, assertCreationProjectInput } from "../saas/creation-access";
import {audioEditMediaRequest} from "../audio/project";
import {createMediaJob,listMediaJobs} from "../video/media-jobs";
import {requireAudioMaterials} from "./audio-materials";
import { authorizeCanvasProject, mayCreateCanvasRoot } from "./project-access";
import { audioNodeWriteSchema } from "./audio-node-schema";
import { ensureAudioNodeSchema, findAudioOperation, findAudioRenderIntent, getAudioNode, saveAudioNodeTx } from "./audio-node-repository";
import {validateAudioProject} from "./audio-project-validation";
export { getAudioNode, listAudioNodes } from "./audio-node-repository";

export async function saveAudioNode(actorRaw: string, raw: unknown) {
  const actor = actorRaw.toLowerCase(), parsed = audioNodeWriteSchema.safeParse(raw);
  if (!parsed.success) throw new ModelConfigError("INVALID_AUDIO_NODE", "音频字段无效", 422, parsed.error.issues.map(issue => issue.path.join(".")));
  const input = parsed.data;
  await ensureAudioNodeSchema();
  const old = await getAudioNode(actor, input.id, true);
  const projectKey = input.projectKey || old?.projectKey || `tree:${input.id}`;
  // Accepted operation identity precedes mutable dependencies. Replays remain
  // replays even when a source audio has since been deleted.
  const replay = await findAudioOperation(actor, input.operationId, { input, projectKey });
  if (replay) return replay;
  let newRoot = false;
  try { await authorizeCanvasProject(actor, projectKey); }
  catch (error) {
    if (!(error instanceof ModelConfigError) || old || input.expectedRevision !== 0 || !await mayCreateCanvasRoot(actor, input, projectKey)) throw error;
    newRoot = true;
  }
  const referencesToCheck = input.deleted === true ? undefined : input.audio ?? (input.deleted === false ? old?.audio : undefined);
  if (referencesToCheck) await validateAudioProject(actor, referencesToCheck);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
    await bindActualCreationProject(actor, projectKey, { tx: client, newRoot });
    if (referencesToCheck) await validateAudioProject(actor, referencesToCheck, client);
    const node = await saveAudioNodeTx(client, actor, input, projectKey);
    await client.query("COMMIT");
    return node;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

/** Freeze the editor's intent before media submission. The existing media job owns
 * reservation, execution, recovery and outputs. Replays look up its operation first. */
export async function renderAudioNode(actorRaw: string, input: {id: string; expectedRevision: number; operationId: string}) {
  const actor = actorRaw.toLowerCase();
  const intent = await findAudioRenderIntent(actor, input.operationId);
  if (intent) {
    if (intent.id !== input.id || intent.audio.render!.baseRevision !== input.expectedRevision) throw new ModelConfigError("AUDIO_OPERATION_CONFLICT", "操作编号已用于另一项音频处理", 409);
    await bindActualCreationProject(actor, intent.projectKey);
    await assertCreationProjectInput(actor, intent.projectKey);
    const accepted = (await listMediaJobs(actor, {operationId: input.operationId})).jobs[0];
    if (accepted) return {node: await getAudioNode(actor, input.id, true) ?? intent, job: accepted};
  }
  let node = await getAudioNode(actor, input.id, true);
  if (!node) throw new ModelConfigError("AUDIO_NODE_UNAVAILABLE", "音频节点不存在或无权访问", 404);
  await bindActualCreationProject(actor, node.projectKey);
  await assertCreationProjectInput(actor, node.projectKey);
  const sameOperation = node.audio.render?.operationId === input.operationId;
  if (sameOperation) {
    const accepted = (await listMediaJobs(actor, {operationId: input.operationId})).jobs[0];
    if (accepted) return {node, job: accepted};
  }
  if (node.deletedAt || !node.audio.sourceArtworkId) throw new ModelConfigError("AUDIO_NODE_UNAVAILABLE", "音频节点或来源已不可用", 404);
  if (!sameOperation) {
    if (node.revision !== input.expectedRevision) throw new ModelConfigError("AUDIO_REVISION_CONFLICT", "音频已更新，请重新读取后处理", 409);
    node = await saveAudioNode(actor, {id: node.id, expectedRevision: input.expectedRevision, operationId: input.operationId,
      audio: {...node.audio, render: {operationId: input.operationId, baseRevision: input.expectedRevision, sourceArtworkId: node.audio.sourceArtworkId, edit: structuredClone(node.audio.edit)}}});
  }
  const render = node.audio.render!, source = (await requireAudioMaterials(actor, [render.sourceArtworkId]))[0];
  const request = audioEditMediaRequest({...node.audio, sourceArtworkId: render.sourceArtworkId, edit: render.edit}, source.duration, input.operationId, node.projectKey);
  const job = await createMediaJob(actor, request);
  return {node, job};
}
