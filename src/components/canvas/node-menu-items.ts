import { Clapperboard, FileText, Film, Image, Mountain, Music2, UserRound, Video } from "lucide-react";
import type { CanvasActionMenuItem } from "./canvas-action-menu";

export type CreatableCanvasNode = "text" | "image" | "video";

/** One ordered list for the toolbar and the blank-canvas context submenu. */
export function canvasNodeMenuItems({ L, readOnly, videoDisabled, onCreate }: {
  L: (zh: string, en: string) => string;
  readOnly: boolean;
  videoDisabled: boolean;
  onCreate: (kind: CreatableCanvasNode) => void;
}): CanvasActionMenuItem[] {
  return [
    { id: "character", icon: UserRound, label: L("角色", "Character"), disabled: true, onSelect: () => {} },
    { id: "scene", icon: Mountain, label: L("场景", "Scene"), disabled: true, onSelect: () => {} },
    { id: "stage-3d", icon: Clapperboard, label: L("3D 导演台", "3D director"), disabled: true, onSelect: () => {} },
    { id: "text", icon: FileText, label: L("文本", "Text"), disabled: readOnly, onSelect: () => onCreate("text") },
    { id: "image-node", icon: Image, label: L("图片", "Image"), disabled: readOnly, onSelect: () => onCreate("image") },
    { id: "video-node", icon: Video, label: L("视频", "Video"), disabled: readOnly || videoDisabled, onSelect: () => onCreate("video") },
    { id: "audio", icon: Music2, label: L("音频", "Audio"), disabled: true, onSelect: () => {} },
    { id: "multitrack", icon: Film, label: L("多轨编辑器", "Multitrack editor"), disabled: true, onSelect: () => {} },
  ];
}
