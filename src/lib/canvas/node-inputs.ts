import "server-only";
import type {OrderedInput} from "../video/references";
import {resolveCanvasTimelineInputs} from "./timeline-references";
import {resolveCanvasAudioInputs} from "./audio-references";
import {resolveCanvasVisualInputs} from "./visual-reference-service";

/** Acceptance boundary for native asset bindings. Audio replaces one real media
 * input; visual identities then expand and number once across both asset kinds. */
export async function resolveCanvasNodeInputs(actor: string, inputs: readonly OrderedInput[], prompt: string) {
  return resolveCanvasVisualInputs(actor, await resolveCanvasTimelineInputs(actor,await resolveCanvasAudioInputs(actor, inputs)), prompt);
}
