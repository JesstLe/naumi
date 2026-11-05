import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/platform/db/pool";
import { characterReferenceText, frozenCharacterInputIdentity, parseCharacterInputIdentity, type CharacterProject } from "../character/project";
import { ModelConfigError } from "../model-config/types";
import { assertCreationProjectInput } from "../saas/creation-access";
import {requireVisualImages} from "./visual-images";
import type {VisualReferenceExpansion} from "./visual-references";
import type { OrderedInput } from "../video/references";
import { ensureCharacterNodeSchema, mapCharacterNode } from "./character-node-repository";

function unavailable(message = "角色或外观不存在，或无权访问"): never {
  throw new ModelConfigError("CHARACTER_REFERENCE_UNAVAILABLE", message, 404);
}
export function characterImageIds(character: CharacterProject) {
  return [...new Set(character.appearances.flatMap(appearance => appearance.referenceArtworkIds))];
}
export async function authorizeCharacterImages(actor: string, character: CharacterProject) {
  await requireVisualImages(actor, characterImageIds(character), "character");
}
export async function lockCharacterImagesTx(client: PoolClient, actor: string, character: CharacterProject) {
  await requireVisualImages(actor, characterImageIds(character), "character", client);
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
  const images = await requireVisualImages(actor, imageIds, "character");
  const byImageId = new Map(images.map(art => [art.id, art]));
  return resolved.map(binding => ({ ...binding, images: binding.appearance.referenceArtworkIds.map(id => byImageId.get(id)!) }));
}
export async function authorizeCharacterInputs(actor: string, inputs: readonly OrderedInput[]) {
  await loadCharacterInputs(actor.toLowerCase(), inputs);
}
export async function characterVideoDefinitions(actor: string, inputs: readonly OrderedInput[]): Promise<VisualReferenceExpansion[]> {
  const resolved = await loadCharacterInputs(actor.toLowerCase(), inputs);
  if (!resolved.length) return [];
  return resolved.map(binding => ({
    inputId: binding.input.id,
    referenceLabel: "角色参考" as const,
    text: characterReferenceText(binding.node.character, binding.appearanceId),
    frozenNodeId: frozenCharacterInputIdentity(binding.id, binding.appearanceId, binding.node.revision),
    images: binding.images.map(image => ({
      inputId: `character-ref-${createHash("sha256").update(JSON.stringify([binding.input.id, image.id])).digest("hex").slice(0, 40)}`,
      artworkId: image.id, value: image.image,
    })),
  }));
}
