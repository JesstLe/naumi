import type { CanvasCharacterNode } from "../canvas/character-node-schema";
import type { VideoInputChoice } from "../video/client-settings";
import { characterInputIdentity, characterReferenceText } from "./project";
import {expandCharacterReferences} from "./references";
import type {OrderedInput} from "../video/references";

/** A role appearance is one ordinary named input; media expansion stays server-side. */
export function characterInputChoices(nodes: readonly CanvasCharacterNode[], media: readonly VideoInputChoice[]): VideoInputChoice[] {
  const images = new Map(media.filter(choice => choice.kind === "image").map(choice => [choice.nodeId, choice]));
  return nodes.filter(node => !node.deletedAt).flatMap(node => node.character.appearances.map(appearance => {
    const nodeId = characterInputIdentity(node.id, appearance.id);
    const references = appearance.referenceArtworkIds.map(id => images.get(id));
    return {
      id: nodeId, nodeId, kind: "text" as const, category: "character" as const,
      title: node.character.appearances.length === 1 ? node.character.name : `${node.character.name} · ${appearance.name}`,
      value: characterReferenceText(node.character, appearance.id),
      thumbnail: references.find(Boolean)?.thumbnail || references.find(Boolean)?.value,
      referenceArtworkIds: [...appearance.referenceArtworkIds],
      available: references.every(choice => !!choice?.available),
    };
  }));
}

/** Advisory preview only. The saved inputs remain live identities and the
 * server re-reads all definitions and media before accepting a task. */
export function previewCharacterInputs(inputs: readonly OrderedInput[], prompt: string, choices: readonly VideoInputChoice[]) {
  const ids = new Set(inputs.map(input => input.id));
  const definitions = inputs.flatMap((input, index) => {
    if (!input.nodeId.startsWith("character:")) return [];
    const choice = choices.find(item => item.nodeId === input.nodeId && item.category === "character");
    if (input.kind !== "text" || input.role !== "context" || !choice?.available || !choice.referenceArtworkIds) throw new Error("角色或外观素材已不可用");
    return [{inputId: input.id, text: choice.value, images: choice.referenceArtworkIds.map((artworkId, imageIndex) => {
      const image = choices.find(item => item.nodeId === artworkId && item.kind === "image" && item.available);
      if (!image) throw new Error("角色参考图片尚未完成或已不可用");
      let id = `character-preview-${index}-${imageIndex}`;
      while (ids.has(id)) id += "_";
      ids.add(id);
      return {inputId: id, artworkId, value: image.value};
    })}];
  });
  return expandCharacterReferences(inputs, prompt, definitions);
}
