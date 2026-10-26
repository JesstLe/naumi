import {ensureVideoBatchSchema as ensureBatchSchema} from "@/lib/video/storage-schema";
import "server-only";
import {assertWorkflowCreationScope,runWorkflowCreation,bindWorkflowCreationProject,acceptWorkflowCreationTx,validateWorkflowCreationInputs} from "./workflow-creation";
import type {CreationContext} from "@/lib/saas/creation-scope";
import {creationLinkTx} from "../saas/creation-writer";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {getPool} from "@/platform/db/pool";
import {encryptAtRest,decryptAtRest} from "../settings";
import {canonicalConfig} from "@/lib/model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import {getVideoNode,saveVideoNodeTx} from "../canvas/video-node-repository";


import {videoNodeIdSchema,type CanvasVideoNode} from "../canvas/video-node-schema";
import {buildCanvasVideoWorkflow} from "./canvas-workflow";
import {authorizeWorkflowInputs,scheduleVideoWorkflow,getVideoWorkflow} from "./workflow";


import {freezeVideoWorkflow,type FrozenWorkflowStage} from "./workflow-freeze";
import type {VideoWorkflowPlan} from "./workflow-schema";

export const canvasVideoBatchSchema = z.strictObject({
  nodeId: videoNodeIdSchema, expectedRevision: z.number().int().nonnegative(), idempotencyKey: z.uuid(),
  count: z.union([z.literal(2), z.literal(4)]),
  billingVersion: z.number().int().positive().optional(), billingCredits: z.number().finite().nonnegative().optional(),
});
type PreparedBatch = { plan: VideoWorkflowPlan; frozen: Record<string, FrozenWorkflowStage>; nodeIds: string[] };


export async function readCanvasVideoBatch(actor: string, nodeId: string, id: string) {
  await ensureBatchSchema();
  const row = (await getPool().query("SELECT 1 FROM app_canvas_video_batches WHERE id=$1 AND email=$2 AND node_id=$3", [id, actor.toLowerCase(), nodeId])).rows[0];
  if (!row) throw new ModelConfigError("VIDEO_BATCH_UNAVAILABLE", "视频批次不存在", 404);
  const run = (await getPool().query("SELECT 1 FROM app_video_workflow_runs WHERE id=$1 AND email=$2", [id, actor.toLowerCase()])).rows[0];
  return { runId: id, run: run ? await getVideoWorkflow(actor.toLowerCase(), id) : null };
}

/** Freeze once, save every output node and receipt atomically, then use the existing durable scheduler. */
export async function submitCanvasVideoBatch(actorRaw: string, raw: unknown) {
  const input = canvasVideoBatchSchema.parse(raw), actor = actorRaw.toLowerCase();
  await ensureBatchSchema();
  const pool = getPool(), client = await pool.connect(), lock = `canvas-video-batch:${actor}:${input.nodeId}`;
  let acquired = false;
  try {
    acquired = (await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired", [lock])).rows[0].acquired;
    if (!acquired) throw new ModelConfigError("OPERATION_PENDING", "视频批次正在提交，请稍后核查原批次", 409);
    const {billingVersion:_version,billingCredits:_credits,...intent}=input;
    const digest = createHash("sha256").update(canonicalConfig(intent)).digest("hex");
    const legacyDigest = createHash("sha256").update(canonicalConfig(input)).digest("hex");
    const old = (await client.query("SELECT * FROM app_canvas_video_batches WHERE id=$1", [input.idempotencyKey])).rows[0];
    let prepared: PreparedBatch,creationScope:CreationContext|undefined;
    if (old) {
      creationScope=assertWorkflowCreationScope(old.creation_scope,actor);
      if (old.email !== actor || old.node_id !== input.nodeId || ![digest,legacyDigest].includes(old.input_digest)) throw new ModelConfigError("OPERATION_CONFLICT", "批次编号已用于另一请求", 409);
      const decoded = decryptAtRest(old.prepared_enc);
      if (!decoded) throw new ModelConfigError("WORKFLOW_SNAPSHOT_UNAVAILABLE", "批次冻结记录不可用，未重新提交", 503);
      prepared = JSON.parse(decoded);
    } else {
      const source = await getVideoNode(actor, input.nodeId);
      if (!source) throw new ModelConfigError("VIDEO_NODE_UNAVAILABLE", "视频节点不存在", 404);
      await bindWorkflowCreationProject(actor,source.projectKey);
      const plan = await buildCanvasVideoWorkflow(actor, { id: input.idempotencyKey, projectKey: source.projectKey, nodes: [{ id: source.id, revision: input.expectedRevision }] });
      await validateWorkflowCreationInputs(actor,plan);await authorizeWorkflowInputs(actor, plan);
      const original = plan.nodes[0], copies: CanvasVideoNode[] = [];
      for (let index = 1; index < input.count; index++) {
        const id = `video-${input.idempotencyKey}-${index}`;
        const copy = { ...source, id, revision: 1, title: `${source.title.slice(0, 180)} · ${index + 1}`, x: source.x + (source.width + 32) * index, lastTaskId: null, lastResultId: null, displayResultId: null };
        copies.push(copy);
        plan.nodes.push({ ...structuredClone(original), id, canvasNodeId: id, canvasNodeRevision: 1, canvasLastTaskId: null });
      }
      const frozen = await freezeVideoWorkflow(actor, plan);
      for (const node of plan.nodes) {
        const quote = frozen[node.id].quote;
        node.request.billingConfirmation = { version: quote.version, credits: quote.authorization ? quote.authorizedCredits : quote.credits };
      }
      prepared = { plan, frozen, nodeIds: plan.nodes.map(node => node.id) };
      // Use the same graph-lock ordering as ordinary node writes; revisions guard edits during freezing.
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
        const current = (await client.query("SELECT revision,deleted_at FROM app_canvas_video_nodes WHERE email=$1 AND id=$2 FOR UPDATE", [actor, source.id])).rows[0];
        if (!current || current.deleted_at || Number(current.revision) !== input.expectedRevision) throw new ModelConfigError("VIDEO_NODE_REVISION_CONFLICT", "视频节点已更新，批次未提交", 409);
        creationScope=await acceptWorkflowCreationTx(client,actor,plan);
        if(creationScope?.creationId){await creationLinkTx(client,creationScope.creationId,actor,'video-batch',input.idempotencyKey);await creationLinkTx(client,creationScope.creationId,actor,'video-node',source.id,'input');}
        for (const copy of copies) await saveVideoNodeTx(client, actor, { id: copy.id, projectKey: copy.projectKey, expectedRevision: 0, operationId: randomUUID(), title: copy.title, x: copy.x, y: copy.y, width: copy.width, height: copy.height, config: copy.config, inputs: copy.inputs }, copy.projectKey);
        await client.query("INSERT INTO app_canvas_video_batches(id,email,node_id,input_digest,prepared_enc,creation_scope) VALUES($1,$2,$3,$4,$5,$6::jsonb)", [input.idempotencyKey, actor, source.id, digest, encryptAtRest(JSON.stringify(prepared)),creationScope?JSON.stringify(creationScope):null]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    const result = await runWorkflowCreation(creationScope,()=>scheduleVideoWorkflow(actor, prepared.plan, undefined, prepared.frozen));
    return { ...result, nodeIds: prepared.nodeIds, run: await getVideoWorkflow(actor, result.runId) };
  } finally {
    if (acquired) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [lock]).catch(() => {});
    client.release();
  }
}
