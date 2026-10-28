import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/platform/db/pool";
import { sceneReferenceText, frozenSceneInputIdentity, parseSceneInputIdentity, type SceneProject } from "../scene/project";
import { ModelConfigError } from "../model-config/types";
import { assertCreationProjectInput } from "../saas/creation-access";
import {requireVisualImages} from "./visual-images";
import type {VisualReferenceExpansion} from "./visual-references";
import type { OrderedInput } from "../video/references";
import { ensureSceneNodeSchema, mapSceneNode } from "./scene-node-repository";

function unavailable(message = "场景或状态不存在，或无权访问"): never {
  throw new ModelConfigError("SCENE_REFERENCE_UNAVAILABLE", message, 404);
}
export function sceneImageIds(scene: SceneProject) {
  return [...new Set(scene.states.flatMap(state => state.referenceArtworkIds))];
}
export async function authorizeSceneImages(actor: string, scene: SceneProject) {
  await requireVisualImages(actor, sceneImageIds(scene), "scene");
}
export async function lockSceneImagesTx(client: PoolClient, actor: string, scene: SceneProject) {
  await requireVisualImages(actor, sceneImageIds(scene), "scene", client);
}

/** Resolves all scene identities in one DB read; clients never supply the trusted definition. */
async function loadSceneInputs(actor: string, inputs: readonly OrderedInput[]) {
  const bindings = inputs.filter(input => input.nodeId.startsWith("scene:"));
  if (!bindings.length) return [];
  const parsed = bindings.map(input => {
    const identity = parseSceneInputIdentity(input.nodeId);
    if (!identity || input.kind !== "text" || input.role !== "context") throw new ModelConfigError("SCENE_INPUT_INVALID", "场景引用身份或职责无效", 422, ["inputs"]);
    return { input, ...identity };
  });
  await ensureSceneNodeSchema();
  const ids = [...new Set(parsed.map(binding => binding.id))];
  const records = (await getPool().query("SELECT * FROM app_canvas_scene_nodes WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL", [actor, ids])).rows.map(mapSceneNode);
  const byId = new Map(records.map(node => [node.id, node]));
  const resolved = parsed.map(binding => {
    const node = byId.get(binding.id);
    const state = node?.scene.states.find(item => item.id === binding.stateId);
    if (!node || !state) unavailable();
    return { ...binding, node, state };
  });
  for (const node of records) await assertCreationProjectInput(actor, node.projectKey);
  const imageIds = [...new Set(resolved.flatMap(binding => binding.state.referenceArtworkIds))];
  const images = await requireVisualImages(actor, imageIds, "scene");
  const byImageId = new Map(images.map(art => [art.id, art]));
  return resolved.map(binding => ({ ...binding, images: binding.state.referenceArtworkIds.map(id => byImageId.get(id)!) }));
}
export async function authorizeSceneInputs(actor: string, inputs: readonly OrderedInput[]) {
  await loadSceneInputs(actor.toLowerCase(), inputs);
}
export async function sceneVideoDefinitions(actor: string, inputs: readonly OrderedInput[]): Promise<VisualReferenceExpansion[]> {
  const resolved = await loadSceneInputs(actor.toLowerCase(), inputs);
  if (!resolved.length) return [];
  return resolved.map(binding => ({
    inputId: binding.input.id,
    referenceLabel: "场景参考" as const,
    text: sceneReferenceText(binding.node.scene, binding.stateId),
    frozenNodeId: frozenSceneInputIdentity(binding.id, binding.stateId, binding.node.revision),
    images: binding.images.map(image => ({
      inputId: `scene-ref-${createHash("sha256").update(JSON.stringify([binding.input.id, image.id])).digest("hex").slice(0, 40)}`,
      artworkId: image.id, value: image.image,
    })),
  }));
}

/** New applications read trusted scene state under the shared graph transaction.
 * The exact already-saved snapshot survives a later edit/deletion of the asset. */
export async function resolveDirectorSceneProject(actor: string, project: import("../director/project").DirectorProject, previous: import("../director/project").DirectorProject | undefined, tx: PoolClient) {
  const binding = project.sceneReference;
  if (!binding) return project;
  if (JSON.stringify(binding) === JSON.stringify(previous?.sceneReference)) {
    return binding.background?.artworkId === project.panoramaArtworkId && binding.background?.projection === (project.backgroundProjection ?? "panorama") ? project : {...project, sceneReference: null};
  }
  await ensureSceneNodeSchema();
  const row = (await tx.query("SELECT * FROM app_canvas_scene_nodes WHERE email=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE", [actor, binding.sceneId])).rows[0];
  if (!row) unavailable();
  const node = mapSceneNode(row);
  await assertCreationProjectInput(actor, node.projectKey);
  const {sceneDirectorSnapshot} = await import("../scene/project"), {applySceneDirectorSnapshot} = await import("../scene/director");
  if (!node.scene.states.some(state => state.id === binding.stateId)) unavailable();
  const snapshot = sceneDirectorSnapshot(node.id, node.scene, binding.stateId, node.revision);
  // Position-only edits or changes to another state do not invalidate this selection.
  if (node.revision !== binding.revision && JSON.stringify({...binding,revision:node.revision}) !== JSON.stringify(snapshot)) throw new ModelConfigError("SCENE_REVISION_CONFLICT", "场景已更新，请重新选择状态", 409);
  await requireVisualImages(actor, snapshot.referenceArtworkIds, "scene", tx);
  return applySceneDirectorSnapshot(project, snapshot);
}
