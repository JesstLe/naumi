import type {CanvasSceneNode} from "../canvas/scene-node-schema";
import type {VideoInputChoice} from "../video/client-settings";
import {sceneInputIdentity, sceneReferenceText} from "./project";

export function sceneInputChoices(nodes: readonly CanvasSceneNode[], media: readonly VideoInputChoice[]): VideoInputChoice[] {
  const images = new Map(media.filter(choice => choice.kind === "image").map(choice => [choice.nodeId, choice]));
  return nodes.filter(node => !node.deletedAt).flatMap(node => node.scene.states.map(state => {
    const nodeId = sceneInputIdentity(node.id, state.id), references = state.referenceArtworkIds.map(id => images.get(id));
    return {id: nodeId, nodeId, kind: "text" as const, category: "scene" as const,
      title: node.scene.states.length === 1 ? node.scene.name : `${node.scene.name} · ${state.name}`,
      value: sceneReferenceText(node.scene, state.id), referenceArtworkIds: [...state.referenceArtworkIds],
      thumbnail: images.get(state.background?.artworkId || "")?.value || references.find(Boolean)?.thumbnail || references.find(Boolean)?.value,
      available: references.every(choice => !!choice?.available)};
  }));
}
