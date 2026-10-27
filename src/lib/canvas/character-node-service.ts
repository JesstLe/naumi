import "server-only";
import { getPool } from "../db";
import { ModelConfigError } from "../model-config/types";
import { bindActualCreationProject } from "../saas/creation-context";
import { authorizeCanvasProject, mayCreateCanvasRoot } from "./project-access";
import { characterNodeWriteSchema } from "./character-node-schema";
import { ensureCharacterNodeSchema, findCharacterOperation, getCharacterNode, saveCharacterNodeTx } from "./character-node-repository";
import { authorizeCharacterImages, lockCharacterImagesTx } from "./character-references";
export { getCharacterNode, listCharacterNodes } from "./character-node-repository";

export async function saveCharacterNode(actorRaw: string, raw: unknown) {
  const actor = actorRaw.toLowerCase(), parsed = characterNodeWriteSchema.safeParse(raw);
  if (!parsed.success) throw new ModelConfigError("INVALID_CHARACTER_NODE", "角色字段无效", 422, parsed.error.issues.map(issue => issue.path.join(".")));
  const input = parsed.data;
  await ensureCharacterNodeSchema();
  const old = await getCharacterNode(actor, input.id, true);
  const projectKey = input.projectKey || old?.projectKey || `tree:${input.id}`;
  // Accepted operation identity precedes mutable dependencies. Replays remain
  // replays even when a reference image has since been deleted.
  const replay = await findCharacterOperation(actor, input.operationId, { input, projectKey });
  if (replay) return replay;
  let newRoot = false;
  try { await authorizeCanvasProject(actor, projectKey); }
  catch (error) {
    if (!(error instanceof ModelConfigError) || old || input.expectedRevision !== 0 || !await mayCreateCanvasRoot(actor, input, projectKey)) throw error;
    newRoot = true;
  }
  const referencesToCheck = input.deleted === true ? undefined : input.character ?? (input.deleted === false ? old?.character : undefined);
  if (referencesToCheck) await authorizeCharacterImages(actor, referencesToCheck);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`video-node-graph:${actor}`]);
    await bindActualCreationProject(actor, projectKey, { tx: client, newRoot });
    if (referencesToCheck) await lockCharacterImagesTx(client, actor, referencesToCheck);
    const node = await saveCharacterNodeTx(client, actor, input, projectKey);
    await client.query("COMMIT");
    return node;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
