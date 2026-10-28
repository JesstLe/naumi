import {parseCharacterInputIdentity} from "../character/project";
import {parseSceneInputIdentity} from "../scene/project";

/** Option changes retain an asset identity; swapping a character for a place,
 * even with a matching raw ID, must not retain its named prompt reference. */
export function parseVisualInputIdentity(nodeId: string) {
  const character = parseCharacterInputIdentity(nodeId);
  if (character) return {kind: "character" as const, id: character.id, variantId: character.appearanceId};
  const scene = parseSceneInputIdentity(nodeId);
  return scene ? {kind: "scene" as const, id: scene.id, variantId: scene.stateId} : null;
}
