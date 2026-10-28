import "server-only";
import { getPool } from "../db";
import { ModelConfigError } from "../model-config/types";
import { bindActualCreationProject } from "../saas/creation-context";
import { authorizeCanvasProject, mayCreateCanvasRoot } from "./project-access";
import { sceneNodeWriteSchema } from "./scene-node-schema";
import { ensureSceneNodeSchema, findSceneOperation, getSceneNode, saveSceneNodeTx } from "./scene-node-repository";
import { authorizeSceneImages, lockSceneImagesTx } from "./scene-references";
export { getSceneNode, listSceneNodes } from "./scene-node-repository";

export async function saveSceneNode(actorRaw: string, raw: unknown) {
  const actor = actorRaw.toLowerCase(), parsed = sceneNodeWriteSchema.safeParse(raw);
  if (!parsed.success) throw new ModelConfigError("INVALID_SCENE_NODE", "场景字段无效", 422, parsed.error.issues.map(issue => issue.path.join(".")));
  const input = parsed.data;
  await ensureSceneNodeSchema();
  const old = await getSceneNode(actor, input.id, true);
  const projectKey = input.projectKey || old?.projectKey || `tree:${input.id}`;
  // Accepted operation identity precedes mutable dependencies. Replays remain
  // replays even when a reference image has since been deleted.
  const replay = await findSceneOperation(actor, input.operationId, { input, projectKey });
  if (replay) return replay;
  let newRoot = false;
  try { await authorizeCanvasProject(actor, projectKey); }
  catch (error) {
    if (!(error instanceof ModelConfigError) || old || input.expectedRevision !== 0 || !await mayCreateCanvasRoot(actor, input, projectKey)) throw error;
    newRoot = true;
  }
  const referencesToCheck = input.deleted === true ? undefined : input.scene ?? (input.deleted === false ? old?.scene : undefined);
  if (referencesToCheck) await authorizeSceneImages(actor, referencesToCheck);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
    await bindActualCreationProject(actor, projectKey, { tx: client, newRoot });
    if (referencesToCheck) await lockSceneImagesTx(client, actor, referencesToCheck);
    const node = await saveSceneNodeTx(client, actor, input, projectKey);
    await client.query("COMMIT");
    return node;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
