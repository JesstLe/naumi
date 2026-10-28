import "server-only";
import type {OrderedInput} from "../video/references";
import {characterVideoDefinitions} from "./character-references";
import {sceneVideoDefinitions} from "./scene-references";
import {expandVisualReferences} from "./visual-references";

/** Collect both assets first, then number once. Sequential expansion would
 * leave the first asset's image legend stale when the next asset inserts media. */
export async function resolveCanvasVisualInputs(actor: string, inputs: readonly OrderedInput[], prompt: string) {
  const [characters, scenes] = await Promise.all([characterVideoDefinitions(actor, inputs), sceneVideoDefinitions(actor, inputs)]);
  return expandVisualReferences(inputs, prompt, [...characters, ...scenes]);
}
