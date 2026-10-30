import type {Artwork} from "../mock-data";
import type {CanvasTextNode} from "./text-document-model";
import type {CanvasNodeSettings} from "./node-settings";
import type {GenerationFailure} from "./generation-failure";
import type {GenerationStage} from "./generation-feedback";
import type {VideoPlayerAction} from "../video/player-actions";
export type CanvasBounds={x:number;y:number;width:number;height:number};
export type CanvasArtNodeData = {
    id: string;
    image?: string;
    videoUrl?: string;
    category?: string;
    label: string;
    rootLabel?: string | null;
    version?: number;
    prompt?: string;
    date?: string;
    pending?: boolean;
    generationFailure?: GenerationFailure;
    onGenerationRetry?: () => unknown;
    generationStage?: GenerationStage;
    generationStartedAt?: number;
    generationCount?: number;
    generationCompleted?: number;
    inChain?: boolean;
    marked?: boolean;
    canvasGroupId?: string | null;
    ratio?: string | null;
    width?: number | null;
    height?: number | null;
    intrinsicWidth?: number | null;
    processingKind?: Artwork["processingKind"];
    intrinsicHeight?: number | null;
    inspectOriginal?: boolean;
    lightCanvas?: boolean;
    onDimensions?: (id: string, width: number, height: number) => void;
    workflowPresentation?: { rotation: number; flipX: boolean; opacity: number };
    missingAsset?: boolean;
    onFill?: (id:string) => void;
    onCanvasResize?: (
      id: string,
      bounds: { x: number; y: number; width: number; height: number }
    ) => void;
    onCanvasRatioRepair?: (id: string, width: number, height: number) => void;
    onRenameRequest?: (id: string, label: string) => void;
    onVideoExtract?: (id: string, action: VideoPlayerAction) => void;
    onCutout?: (id: string) => void;
    regenerating?:boolean;regenerationFailure?:boolean;
    cutoutBusy?: boolean;
    cutoutBlocked?: boolean;
    settings?: CanvasNodeSettings;
    readOnly?: boolean;
  };
export type CanvasTextNodeData = {
    __id: string;
    nodeKind: "text";
    width: number;
    height: number;
    title: string;
    prompt: string;
    content: string;
    status: CanvasTextNode["status"];
    error?: string;
    sourceRefs?: Array<{ id: string; title: string }>;
    selected?: boolean;
    lightCanvas?: boolean;
    expanded?: boolean;
    settings?: CanvasNodeSettings;
    readOnly?: boolean;
    workflowPresentation?: { rotation: number; flipX: boolean; opacity: number };
  };
export type CanvasPendingNodeData = {
    __id: string;
    onGenerate?: (id:string)=>unknown;
    label: string;
    uploading?: boolean;
    progress?: number;
    fileName?: string;
    fileInfo?: string;
    generating?: boolean;
    generationFailure?: GenerationFailure;
    onGenerationRetry?: () => unknown;
    generationStage?: GenerationStage;
    generationStartedAt?: number;
    generationSize?: { width: number; height: number };
    generationCount?: number;
    generationKind?: "image" | "video";
    needsAttention?: boolean;
    attentionTitle?: string;
    attentionHint?: string;
    attentionAction?: string;
    attentionHref?: string;
    selected?: boolean;
    lightCanvas?: boolean;
  };
export type CanvasPendingNode = {
    id: string;
    x: number;
    y: number;
    parentId: string | null;
    linked: boolean;
    label: string;
    uploading: boolean;
    progress: number;
    fileInfo?: string;
    inputs: string[]; // 多输入:连进这个空白节点的源节点 id(生成时作参考图)
    generationFailure?: GenerationFailure;
    onGenerationRetry?: () => unknown;
    generationStage?: GenerationStage;
    generationStartedAt?: number;
    generationSize?: { width: number; height: number };
    generationCount?: number;
    generating?: boolean; // 该空白节点正在文生图/合并生成中
    operationKey?: string; // 编辑任务锁自己的源节点，普通空白节点仅锁自己
    taskId?: string; // 视频等后台任务 ID，刷新后可从任务表恢复占位节点
    taskKind?: "video" | "image-edit"; // 不同后台任务独立恢复，避免彼此清理占位节点
    needsAttention?: boolean;
    attentionTitle?: string;
    attentionHint?: string;
    attentionAction?: string;
    attentionHref?: string;
  };

export type CanvasGenerationTask = {
  replaceNode?:boolean;
  slotIndex?:number;
  isVisible?: () => boolean;
  failure?: GenerationFailure;
  onRetry?: () => unknown;
  stage?: GenerationStage;
  startedAt?: number;
  previewSize?: { width: number; height: number };
  count?: number;
  completed?: number;
  id: string;
  operationKey: string;
  sourceId: string;
  label: string;
  position: { x: number; y: number };
};


export type CanvasSceneActions={
  dimensions:(id:string,width:number,height:number)=>void;
  resize:(id:string,bounds:CanvasBounds)=>void;
  ratioRepair:(id:string,width:number,height:number)=>void;
  rename:(id:string,label:string)=>void;
  videoProcess:(id:string,action:VideoPlayerAction)=>void;
  cutout:(id:string)=>void;
  generatePending:(id:string)=>unknown;
  directorEdit?:(id:string)=>void;
  characterEdit?:(id:string)=>void;
  audioEdit?:(id:string)=>void;
  timelineEdit?:(id:string)=>void;
  sceneEdit?:(id:string)=>void;
  videoEdit:(id:string)=>void;
  videoHistory:(id:string)=>void;
  videoCancel:(id:string)=>void;
  videoPrompt:(id:string,prompt:string)=>Promise<void>;
  videoResize:(id:string,bounds:CanvasBounds)=>void;
  workflowFill:(id:string)=>void;
  workflowSelect:(ids:string[])=>void;
};
