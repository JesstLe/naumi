import type { CanvasCharacterNode } from "../canvas/character-node-schema";
import type { VideoInputChoice } from "../video/input-choice";
import { characterInputIdentity, characterReferenceText } from "./project";

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
