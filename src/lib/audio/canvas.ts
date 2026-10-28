import type {CanvasAudioNode} from "../canvas/audio-node-schema";
import type {VideoInputChoice} from "../video/client-settings";
import {audioInputIdentity,parseAudioInputIdentity} from "./project";
import type {OrderedInput} from "../video/references";

export function audioInputChoices(nodes: readonly CanvasAudioNode[], media: readonly VideoInputChoice[]): VideoInputChoice[] {
  return nodes.filter(node => !node.deletedAt).map(node => {
    const adopted = media.find(choice => choice.kind === "audio" && choice.nodeId === node.audio.adopted?.artworkId);
    const nodeId = audioInputIdentity(node.id);
    return {id: nodeId, nodeId, kind: "audio", title: node.title, value: adopted?.value ?? "", available: !!adopted?.available};
  });
}

/** Advisory only: a live binding previews the current adopted choice, never a
 * stale saved URL. The acceptance boundary independently reads trusted records. */
export function previewAudioInputs(inputs: readonly OrderedInput[], choices: readonly VideoInputChoice[]): OrderedInput[] {
  return inputs.map(input => {
    if (!input.nodeId.startsWith("audio-node:")) return {...input};
    const choice = choices.find(choice => choice.nodeId === input.nodeId && choice.kind === "audio");
    if (!parseAudioInputIdentity(input.nodeId) || input.kind !== "audio" || input.role !== "source_audio" || !choice?.available || !choice.value) throw new Error("音频节点或已采用素材已不可用");
    return {...input, value: choice.value};
  });
}
