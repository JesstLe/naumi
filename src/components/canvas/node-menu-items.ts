import { Clapperboard, FileText, Film, Image, Mountain, Music2, UserRound, Video, Workflow } from "lucide-react";
import type { CanvasActionMenuItem } from "./canvas-action-menu";
import type { CanvasCreatableNodeKind } from "@/lib/canvas/node-creation";

export type CreatableCanvasNode = CanvasCreatableNodeKind;

/** One ordered list for toolbar, blank-canvas and reference creation. */
export function canvasNodeMenuItems({ L, readOnly, videoDisabled, onCreate, onWorkflow }: {
  L: (zh: string, en: string) => string;
  readOnly: boolean;
  videoDisabled: boolean;
  onWorkflow?:()=>void;
  onCreate: (kind: CreatableCanvasNode) => void;
}): CanvasActionMenuItem[] {
  return [
    { id: "character", icon: UserRound, label: L("角色", "Character"), disabled: readOnly, onSelect: () => onCreate("character") },
    { id: "scene", icon: Mountain, label: L("场景", "Scene"), disabled: readOnly, onSelect: () => onCreate("scene") },
    { id: "stage-3d", icon: Clapperboard, label: L("3D 导演台", "3D director"), disabled: readOnly, onSelect: () => onCreate("director") },
    { id: "text", icon: FileText, label: L("文本", "Text"), disabled: readOnly, onSelect: () => onCreate("text") },
    { id: "image-node", icon: Image, label: L("图片", "Image"), disabled: readOnly, onSelect: () => onCreate("image") },
    { id: "video-node", icon: Video, label: L("视频", "Video"), disabled: readOnly || videoDisabled, onSelect: () => onCreate("video") },
    { id: "audio", icon: Music2, label: L("音频", "Audio"), disabled: readOnly, onSelect: () => onCreate("audio") },
    ...(onWorkflow?[{id:"workflow",icon:Workflow,label:L("ComfyUI 工作流","ComfyUI workflow"),disabled:readOnly,onSelect:onWorkflow}]:[]),
    { id: "multitrack", icon: Film, label: L("多轨编辑器", "Multitrack editor"), disabled: readOnly, onSelect: () => onCreate("timeline") },
  ];
}
