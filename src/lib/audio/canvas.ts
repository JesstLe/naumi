import type {CanvasAudioNode} from "../canvas/audio-node-schema";
import type {VideoInputChoice} from "../video/client-settings";
import {audioInputIdentity} from "./project";

export function audioInputChoices(nodes: readonly CanvasAudioNode[], media: readonly VideoInputChoice[]): VideoInputChoice[] {
  return nodes.filter(node => !node.deletedAt).map(node => {
    const adopted = media.find(choice => choice.kind === "audio" && choice.nodeId === node.audio.adopted?.artworkId);
    const nodeId = audioInputIdentity(node.id);
    return {id: nodeId, nodeId, kind: "audio", title: node.title, value: adopted?.value ?? "", available: !!adopted?.available};
  });
}
