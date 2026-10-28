import type {OrderedInput} from "../video/references";
import type {VideoInputChoice} from "../video/client-settings";
import {previewAudioInputs} from "../audio/canvas";
import {previewVisualInputs} from "./visual-references";

/** Same ordering as native server resolution; no credentials or trusted state. */
export function previewCanvasInputs(inputs: readonly OrderedInput[], prompt: string, choices: readonly VideoInputChoice[]) {
  return previewVisualInputs(previewAudioInputs(inputs, choices), prompt, choices);
}
