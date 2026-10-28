import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {getPool} from "@/platform/db/pool";
import {listArtworksByIds} from "../artworks/repository";
import type {ArtworkRecord} from "../artworks/types";
import { characterReferenceText, frozenCharacterInputIdentity, parseCharacterInputIdentity, type CharacterProject } from "../character/project";
import { ModelConfigError } from "../model-config/types";
import { assertCreationProjectInput } from "../saas/creation-access";
import { assertCreationObjectRefs, assertCreationInputsTx } from "../saas/creation-writer";
import { expandCharacterReferences } from "../character/references";
import type { OrderedInput } from "../video/references";
import { ensureCharacterNodeSchema, mapCharacterNode } from "./character-node-repository";

function unavailable(message = "角色或外观不存在，或无权访问"): never {
  throw new ModelConfigError("CHARACTER_REFERENCE_UNAVAILABLE", message, 404);
}
export function characterImageIds(character: CharacterProject) {
  return [...new Set(character.appearances.flatMap(appearance => appearance.referenceArtworkIds))];
}
function assertImages(ids: readonly string[], artworks: readonly Pick<ArtworkRecord, "id" | "status" | "image" | "videoUrl">[]) {
  const byId = new Map(artworks.map(art => [art.id, art]));
  for (const id of ids) {
    const art = byId.get(id);
    if (!art || art.status !== "completed" || !art.image || art.videoUrl) unavailable("角色参考图片不存在、尚未完成或已改变类型");
  }
}
export async function authorizeCharacterImages(actor: string, character: CharacterProject) {
  const ids = characterImageIds(character);
  if (!ids.length) return;
  await assertCreationObjectRefs(actor, ids);
  assertImages(ids, await listArtworksByIds(actor, ids));
}
/** Recheck under shared row locks in the caller's save/history transaction. */
export async function lockCharacterImagesTx(client: PoolClient, actor: string, character: CharacterProject) {
  const ids = characterImageIds(character);
  if (!ids.length) return;
  await assertCreationInputsTx(client, actor, ids);
  const rows = (await client.query("SELECT id,status,image_url,video_url FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL FOR SHARE", [actor, ids])).rows;
  assertImages(ids, rows.map(row => ({ id: String(row.id), status: row.status, image: row.image_url, videoUrl: row.video_url })));
}

/** Resolves all role identities in one DB read; clients never supply the trusted definition. */
async function loadCharacterInputs(actor: string, inputs: readonly OrderedInput[]) {
  const bindings = inputs.filter(input => input.nodeId.startsWith("character:"));
  if (!bindings.length) return [];
  const parsed = bindings.map(input => {
    const identity = parseCharacterInputIdentity(input.nodeId);
    if (!identity || input.kind !== "text" || input.role !== "context") throw new ModelConfigError("CHARACTER_INPUT_INVALID", "角色引用身份或职责无效", 422, ["inputs"]);
    return { input, ...identity };
  });
  await ensureCharacterNodeSchema();
  const ids = [...new Set(parsed.map(binding => binding.id))];
  const records = (await getPool().query("SELECT * FROM app_canvas_character_nodes WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL", [actor, ids])).rows.map(mapCharacterNode);
  const byId = new Map(records.map(node => [node.id, node]));
  const resolved = parsed.map(binding => {
    const node = byId.get(binding.id);
    const appearance = node?.character.appearances.find(item => item.id === binding.appearanceId);
    if (!node || !appearance) unavailable();
    return { ...binding, node, appearance };
  });
  for (const node of records) await assertCreationProjectInput(actor, node.projectKey);
  const imageIds = [...new Set(resolved.flatMap(binding => binding.appearance.referenceArtworkIds))];
  await assertCreationObjectRefs(actor, imageIds);
  const images = await listArtworksByIds(actor, imageIds);
  assertImages(imageIds, images);
  const byImageId = new Map(images.map(art => [art.id, art]));
  return resolved.map(binding => ({ ...binding, images: binding.appearance.referenceArtworkIds.map(id => byImageId.get(id)!) }));
}
export async function authorizeCharacterInputs(actor: string, inputs: readonly OrderedInput[]) {
  await loadCharacterInputs(actor.toLowerCase(), inputs);
}
export async function resolveCharacterVideoInputs(actor: string, inputs: readonly OrderedInput[], prompt: string) {
  const resolved = await loadCharacterInputs(actor.toLowerCase(), inputs);
  if (!resolved.length) return { inputs: [...inputs], prompt, characters: [] };
  const definitions = resolved.map(binding => ({
    inputId: binding.input.id,
    text: characterReferenceText(binding.node.character, binding.appearanceId),
    frozenNodeId: frozenCharacterInputIdentity(binding.id, binding.appearanceId, binding.node.revision),
    images: binding.images.map(image => ({
      inputId: `character-ref-${createHash("sha256").update(JSON.stringify([binding.input.id, image.id])).digest("hex").slice(0, 40)}`,
      artworkId: image.id, value: image.image,
    })),
  }));
  return {...expandCharacterReferences(inputs, prompt, definitions), characters: resolved.map(binding => ({id: binding.id, appearanceId: binding.appearanceId, revision: binding.node.revision}))};
}
