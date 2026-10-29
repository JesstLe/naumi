"use client";
import {useCanvasWorkflowDocument} from "./use-canvas-workflow-document";
import {canvasNativeDocuments} from "@/lib/canvas/native-document-lifecycle";
import {canvasHistoryInsertionView} from "@/lib/canvas/history-model";
import {useCanvasTemplateImports} from "./use-canvas-template-imports";
import {createCanvasTimelineActions} from "@/lib/canvas/timeline-actions";
import {useTimelineNodes} from "./timeline/use-timeline-nodes";
import {timelineInputChoices} from "@/lib/timeline/canvas";
import type {CanvasTimelineNode} from "@/lib/canvas/timeline-node-schema";
import type {TimelinePatchFields} from "@/lib/canvas/history-model";
import {createCanvasAudioActions} from "@/lib/canvas/audio-actions";
import {useAudioNodes,useAudioResultAdoption} from "./audio/use-audio-nodes";
import {audioInputChoices} from "@/lib/audio/canvas";
import type {CanvasAudioNode} from "@/lib/canvas/audio-node-schema";
import type {AudioPatchFields} from "@/lib/canvas/history-model";
import type {PublicMediaJob} from "@/lib/video/media-job-schema";
import {loadCanvasImageVersions} from "@/lib/canvas/image-version-client";
import type {CanvasImageVersion,CanvasImageVersionList} from "@/lib/canvas/image-versions";
import {createCanvasImageVersionAttachment} from "@/lib/canvas/result-attachment";
import {useSceneNodes} from "./scene/use-scene-nodes";
import {newSceneProject,sceneInputIdentity,sceneReferenceText,sceneStateWithReferences,sceneDirectorSnapshot,type SceneProject} from "@/lib/scene/project";
import {applySceneDirectorSnapshot} from "@/lib/scene/director";
import {sceneInputChoices} from "@/lib/scene/canvas";
import {useCharacterNodes} from "./character/use-character-nodes";
import type {CanvasCharacterNode} from "@/lib/canvas/character-node-schema";
import {newCharacterProject,characterInputIdentity,parseCharacterInputIdentity,characterReferenceText,type CharacterProject} from "@/lib/character/project";
import {characterInputChoices} from "@/lib/character/canvas";
import {executeCanvasImageCreation,generateCanvasAssistantImage,canvasBlankImagePrompt,canvasInheritedImagePrompt,CANVAS_IMAGE_REFERENCE_LIMIT as MAX_TOTAL_IMAGES,type CanvasImageCreationServices} from "@/lib/canvas/image-creation";
import {canvasNodeMenuItems} from "./node-menu-items";
import {artworkFields} from "@/lib/canvas/artwork-write";
import {CanvasArtworkConflicts} from "./artwork-conflicts";
import { NODE_W, NODE_H, NODE_LABEL_H, IMAGE_NODE_MIN_W, IMAGE_NODE_MIN_H, IMAGE_NODE_MAX_W, IMAGE_NODE_MAX_H, TEXT_NODE_MIN_W, TEXT_NODE_MIN_H, TEXT_NODE_MAX_W, TEXT_NODE_MAX_H, estimateTextNodeHeight, artworkNodeSize, flowNodeSize } from "@/lib/canvas/node-geometry";
import type {CanvasPendingNode as Pend,CanvasGenerationTask} from "@/lib/canvas/scene-types";
import { layoutGraph, projectCanvasScene } from "@/lib/canvas/scene-projection";
import {PendContext} from "./nodes/pending-node";
import {TextNodeContext} from "./nodes/text-node";
import {canvasNodeTypes,canvasEdgeTypes} from "./nodes/registry";
import {useCanvasSceneActions} from "./use-canvas-scene-actions";
import {useCanvasScene} from "./use-canvas-scene";
import {useCanvasSelection} from "./use-canvas-selection";
import {useCanvasNodeOperations} from "./use-canvas-node-operations";
import {useCanvasClipboard} from "./use-canvas-clipboard";
import {useCanvasTextTasks} from "./use-canvas-text-tasks";
import {CanvasSelect} from "./composer-controls";
import {useCanvasWorkspacePages} from "./use-canvas-workspace-pages";
import {CanvasWorkspacePagesView} from "./canvas-workspace-pages";
import {CanvasImageComposer,type CanvasImageComposerProps} from "./image-composer";
import {CanvasTextComposer} from "./text-composer";
import type {CanvasGenerationMode as GenerationMode} from "./image-generation-controls";
import {generalTextTask,derivedTextTask,stripTextMentions as stripMentionLines,withTextProduct as withProductMention} from "@/lib/canvas/text-task-request";
import {useCanvasSelectionRun} from "./use-canvas-selection-run";
import {newCanvasText} from "@/lib/canvas/node-commands";
import {useCanvasDrag} from "./use-canvas-drag";
import {canvasNodeClick,canvasFlowSelection,canvasSelectionIds} from "@/lib/canvas/selection";
import {compileCanvasLink,canvasLinkMediaSource,type CanvasLinkIntent} from "@/lib/canvas/link-command";
import {compileCanvasMove} from "@/lib/canvas/drag-controller";

import {useCanvasAssistant} from "./use-canvas-assistant";
import {useCanvasImageTextEditor} from "./use-canvas-image-text-editor";
import {CanvasImageTextPanel} from "./image-text-panel";
import type {CanvasImageTextContext,CanvasOcrSegment as OcrSegment} from "@/lib/canvas/image-text-editor";
import {canvasDocumentFetch,canvasDocumentHeaders} from "@/lib/canvas/document-scope";
import type {CanvasAssistantContext} from "@/lib/canvas/assistant-session";
import { CachedImage } from "@/components/cached-image";
import { browserImageArchive } from '@/lib/browser-image-archive';
import { cachedImageBlob, imageCacheSource, ImageCacheDenied } from '@/lib/browser-image-cache';
import { useFeatureAccess, FeatureVisible } from "@/lib/feature-access/client";


import { useCanvasArtworkDocument } from "./use-canvas-artwork-document";
import { isHostedImageUrl as hasRenderableImage } from "@/lib/media-url";
import {useBilling} from "@/lib/billing/client";
import { browserRandomUUID } from "@/lib/browser-crypto";
import type {FeatureId} from "@/lib/billing/types";
import { useImageQuality } from "@/lib/image-quality-context";
import { ImageQualityControl } from "@/components/image-quality-control";
import { copyText } from "@/lib/clipboard";
import { createImageDownloadName } from "@/lib/download";
import { CANVAS_RATIO_OPTIONS, CANVAS_MAX_COUNT, normalizeCanvasRatio, normalizeCanvasResolution, normalizeCanvasCount, normalizeCanvasQuality, canvasModelParameters } from "@/lib/canvas/generation-parameters";
import { canvasDockLayout, canvasOverlaySafeArea, type NodeScreen } from "@/lib/canvas/dock-layout";
import {canvasProjects,canvasProjectMonths,type CanvasProject as Project,type CanvasWorkflowKey} from "@/lib/canvas/project-catalog";
import {useCanvasProjectCatalog} from "./use-canvas-project-catalog";
import {CanvasProjectBrowser} from "./project-browser";
import {CanvasProjectMenu,CanvasProjectTitle} from "./project-chrome";
import { canvasGenerationReferences,canvasRegenerationReferences, explicitCanvasParent } from "@/lib/canvas/input-references";
import { canvasFocusViewport } from "@/lib/canvas/upload-visibility";
import { readPlacementCache, type CanvasPoint } from "@/lib/canvas/stable-placement";
import { useCanvasTextDocument } from "./use-canvas-text-document";
import {CanvasTextConflicts} from "./text-conflicts";
import { CANVAS_TEXT_DEFAULT_WIDTH as TEXT_NODE_DEFAULT_W, CANVAS_TEXT_DEFAULT_HEIGHT as TEXT_NODE_DEFAULT_H } from "@/lib/canvas/text-document-model";
import { useCanvasHistory } from "./use-canvas-history";
import { textPatchOf, type CanvasTextNode, type VideoPatchFields, type DirectorPatchFields, type CharacterPatchFields, type ScenePatchFields, type CanvasHistoryAction as UndoAct } from "@/lib/canvas/history-model";
import type { HistoryCommit } from "@/lib/canvas/history-controller";
import { CanvasHistoryRequestError } from "@/lib/canvas/history-scope";
import { canvasTextEditPatch } from "@/lib/canvas/text-edit-history";
import { smartLayout } from "@/lib/canvas/smart-layout";
import {submitCanvasCreationRequest,type CanvasCreationRequestInit} from "@/lib/canvas/creation-request";
import {ImagegenPendingRecovery} from "./imagegen-pending-recovery";
import {FrameRatioDialog,useCanvasFrameChoice} from "./frame-ratio-dialog";
import {createRetainedBillingSubmission} from "@/lib/billing/client-submission";
import {createCanvasResultAttachment} from "@/lib/canvas/result-attachment";
import {createCanvasEditTask,type CanvasEditRequest} from "@/lib/canvas/edit-task";
import {createCanvasDetailTask} from "@/lib/canvas/detail-task-controller";
import {prepareCanvasDetailTask} from "@/lib/canvas/detail-task-request";
import {createCanvasImageTask,type CanvasGeneratedImage} from "@/lib/canvas/image-task-controller";
import {captureCanvasImageTaskScope,captureCanvasTaskOwner} from "@/lib/canvas/image-task-scope";
import {prepareCanvasImageTask,appendCanvasImageReferences,type CanvasImageGenerationOptions} from "@/lib/canvas/image-task-request";
import {generateCanvasVideo} from "@/lib/video/canvas-submission";
import {readVideoReceipt,clearVideoReceipt} from "@/lib/video/canvas-receipts";
import {VideoSettingsDialog,type VideoNodeDraft} from "./video/settings-dialog";
import {VideoNodeToolbar} from "./video/node-toolbar";
import {VideoResultDock} from "./video/result-dock";
import {useVideoCatalog} from "./video/use-video-catalog";
import {useVideoNodes} from "./video/use-video-nodes";
import {useDirectorNodes,DirectorClientError} from "./director/use-director-nodes";
import {newDirectorProject,type DirectorProject} from "@/lib/director/project";
import {useVideoTasks} from "./video/use-video-tasks";
import { mediaDownloadHref, type VideoPlayerAction } from "./video/player";
import {MediaActionsDialog,type MediaInputChoice} from "./video/media-actions";
import {useMediaJobs} from "./video/use-media-jobs";
import {videoHistoryDraft} from "@/lib/video/client-history";
import {useVideoAssets,VideoAssetImportError} from "./video/use-video-assets";
import {VideoHistoryPicker} from "./video/history-picker";
import type {CanvasVideoNode} from "@/lib/canvas/video-node-schema";
import { catalogCapability, videoNodeCreationDefaults, videoModeRoles, type VideoInputChoice } from "@/lib/video/client-settings";

import type {PublicQuote} from "@/lib/billing/client";
import { CanvasPerformanceProbe, recordCanvasNativeMove } from "./canvas-performance-probe";
import { generationFailureMessage, assertGenerationResultsPresent } from '@/lib/canvas/generation-failure';
import { ImagegenPreparationCancelled } from '@/lib/imagegen/http';
import { useImageNodeDraft } from './use-image-node-draft';
import { resolveCanvasImageReferences, changeImageReferenceRole, imageReferenceManifest, inheritableImagePrompt, type CanvasImageReference, type ImageReferenceCandidate } from '@/lib/canvas/image-references';
import { referenceManifestError } from '@/lib/imagegen/reference-labels';
import { imageDraftScope } from '@/lib/canvas/image-node-drafts';
import { CanvasRenderLayerGuard } from './canvas-render-layer-guard';
import { CanvasEdgeHoverHint, type CanvasEdgeHoverHandle } from './canvas-edge-hover-hint';
import { canvasZoomState } from '@/lib/canvas/viewport-state';
import {CANVAS_MIN_ZOOM,CANVAS_MAX_ZOOM} from "@/lib/canvas/view-controls";
import {useCanvasViewControls} from "./use-canvas-view-controls";
import {CanvasViewToolbar} from "./view-toolbar";
import {CanvasToolButtons} from "./tool-buttons";
import {useCanvasKeyboard} from "./use-canvas-keyboard";
import type {CanvasKeyboardAction} from "@/lib/canvas/keyboard-command";
import { shouldVirtualizeCanvas } from '@/lib/canvas/virtualization';
import { CanvasActionMenu, CanvasActionPanel } from "./canvas-action-menu";
import { CanvasHelpDialog } from "./canvas-help-dialog";
import { ContextMenuSurface, ContextMenuSubmenu, ContextMenuItem as Item } from "./context-menu-surface";
import { selectionRunTargets } from "@/lib/canvas/selection-run";
import { BatchSelectionToolbar } from "./batch-selection-toolbar";
import { TextImageGenerationDialog } from "./text-image-generation-dialog";
import { buildTextImageRequests, type TextImageMode } from "@/lib/canvas/text-image-inputs";
import { generationPlaceholderSize, generationPositionForTask, placeGenerationPreview } from "@/lib/canvas/generation-feedback";
import { CanvasAssistantPanel } from "./canvas-assistant-panel";
import { useWorkflowPaste } from "./use-workflow-paste";
import type { ImportedManifest } from "@/lib/canvas/workflow-clipboard";
import { CanvasAgentToggle } from "./canvas-agent-toggle";
import { CanvasAgentOrb } from "./canvas-agent-orb";
import { useOrbCompanion } from "../naumi-orb/use-orb-companion";
import { useCanvasAssistantDisclosure } from "@/lib/canvas/assistant-disclosure";
import { defaultNodeSettings, validNodeSettings, type CanvasNodeSettings, type CanvasCrop } from "@/lib/canvas/node-settings";
const DEFAULT_CANVAS_SETTINGS = defaultNodeSettings();

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import dynamic from "next/dynamic";
import NextImage from "@/components/cached-next-image";
import { useWorkspaceRouter as useRouter } from "@/lib/desktop/navigation";
import {
  ReactFlow,
  MiniMap,
  SelectionMode,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { X, Pencil, MoreHorizontal, Crop, SlidersHorizontal, Lock, Unlock, ArrowUpToLine, ArrowDownToLine, Loader2, Sparkles, Download, Trash2, Upload, RotateCcw, RotateCw, Scissors, Sun, Moon, Type, Rotate3d, Wand2, Image as ImageIcon, ChevronDown, Home, LayoutGrid, Plus, Maximize, Maximize2, ChevronLeft, Map as MapIcon, Magnet, Clock, Keyboard, ShoppingBag, Crown, Zap, MapPin, BoxSelect, Combine, GalleryVerticalEnd, ScanSearch, Video, PenLine, Play, MessageSquareText, Workflow, MousePointer2, Hand, ImagePlus, Copy, Focus, type LucideIcon } from "lucide-react";
import { authHeader } from "@/lib/supabase";
import {currentWorkspace} from '@/lib/saas/workspace-client';
import { useAuth } from "@/lib/auth-context";
import { useCanvasCredits } from "./use-canvas-credits";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useI18n } from "@/lib/i18n/locale-context";

import { Textarea } from "@/components/ui/textarea";
import { cdnUrl } from "@/lib/cdn";
import { ImageLightbox } from "@/components/image-lightbox";
import type {ComfyRunPayload,ComfyRunResult} from "@/lib/comfyui/run-contract";
import {createCanvasComfyWorkflow,comfyRunReceiptKey} from "@/lib/canvas/comfy-workflow";
import { BRAND, BRAND_CANVAS_LOGO } from "@/lib/brand";
const panelLoading = () => <div role="status" className="p-4 text-sm text-slate-500">加载中…</div>;
const AssistantRichText = dynamic(() => import("./assistant-richtext").then(module => module.AssistantRichText), { ssr: false, loading: panelLoading });
const ImageCropDialog = dynamic(() => import("./image-crop-dialog").then(module => module.ImageCropDialog), { ssr: false, loading: panelLoading });
const CharacterEditor = dynamic(() => import("./character/character-editor").then(module => module.CharacterEditor), { ssr: false, loading: panelLoading });
const AudioEditor = dynamic(() => import("./audio/audio-editor").then(module => module.AudioEditor), {ssr:false,loading:panelLoading});
const TimelineEditor = dynamic(() => import("./timeline/timeline-editor").then(module => module.TimelineEditor), {ssr:false,loading:panelLoading});
const SceneEditor = dynamic(() => import("./scene/scene-editor").then(module => module.SceneEditor), { ssr: false, loading: panelLoading });
const DirectorEditor = dynamic(() => import("./director/director-editor").then(module => module.DirectorEditor), { ssr: false, loading: panelLoading });
const NodePropertiesPanel = dynamic(() => import("./node-properties-panel").then(module => module.NodePropertiesPanel), { ssr: false, loading: panelLoading });
const AnnotateEditorModal = dynamic(() => import("./annotate-editor").then(module => module.AnnotateEditorModal), { ssr: false, loading: panelLoading });
const CanvasComfyDialog = dynamic(() => import("./canvas-comfy-dialog").then(module => module.CanvasComfyDialog), { ssr: false, loading: panelLoading });
import { usePaymentConfig } from "@/lib/payment-context";
import { useRecharge } from "@/lib/recharge-modal-context";
import {
  ACCOUNT_THEME_EVENT,
  AccountDockMenu,
  currentThemeIsDark,
  toggleAccountTheme,
} from "@/components/account/account-dock-menu";
import { cn } from "@/lib/utils";
import {useCanvasImageImports} from "./use-canvas-image-imports";
import {CanvasImageImportStatus} from "./image-import-status";
import {CANVAS_IMAGE_UPLOAD_LIMIT as MAX_UPLOAD,type CanvasImageImportContext} from "@/lib/canvas/image-imports";
import {
  type Artwork,
  GENERATION_STYLES,
} from "@/lib/mock-data";
import {
  compactImageModelOptions,
} from "@/lib/image-model-routing";

import { adminConfiguredFeature } from "@/lib/model-config/selection-policy";
import { chosenFeatureModel, useFeatureModels } from "@/lib/model-config/feature-client";
import { FeatureModelSelect } from "@/components/tools/feature-model-select";
import { TextModelSelect } from "@/components/ui/text-model-select";
import { useTextModel } from "@/lib/text-model-context";

/** Supabase 模式补 Authorization；原生账号模式依靠同源 HttpOnly cookie。 */
async function privateFetchRaw(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const workspace=headers.get('x-naumi-workspace');
  const auth = await authHeader();
  for (const [key, value] of Object.entries(auth)) headers.set(key, value);
  if(workspace)headers.set('x-naumi-workspace',workspace);
  return fetch(input, { ...init, headers });
}
// 横向链路布局(对齐原型 node-canvas-preview):深度→x 向右展开,同层兄弟→y 竖排。
// 图片节点使用更清晰的工作尺寸，并按图片比例自适应；高分屏上保持可辨识。
const X_GAP = 90; // 层间横向间距
const Y_GAP = 48; // 同层兄弟纵向间距
 // 节点图 + 追加参考图 合计上限
const MAX_GENERATION_COUNT = CANVAS_MAX_COUNT;
// 扩图使用同一组比例选项，不包含自适应（必须指定外扩目标）。
const EXPAND_RATIOS = CANVAS_RATIO_OPTIONS.filter(r => r.id !== "auto").map(r => r.id);
// 扩图锚点九宫格(原图贴哪一侧,新内容补其余方向) + 提示文案
const ANCHOR_GRID = ["nw", "n", "ne", "w", "center", "e", "sw", "s", "se"] as const;
const ANCHOR_TITLE: Record<string, string> = {
  nw: "左上", n: "上", ne: "右上", w: "左", center: "中", e: "右", sw: "左下", s: "下", se: "右下",
};
// React Flow 默认只允许 50%–200%。这里使用 JavaScript 可安全表达的完整正数范围，
// 让滚轮、触控板、按钮和百分比输入不再受产品层的人为缩放档位限制。









type GeneratedResult = CanvasGeneratedImage;

function fmt(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    s
  );
}


// ===== 竞品反推 → 智能帮写 → 成套生成 链路的纯文本工具 =====
// 去掉内容开头由产品绑定自动加的 "@产品图" 行(生成图片时提示词不应包含)
// 复刻模式生成时追加的防抄袭约束:产品取自产品原图,竞品图只当构图参考
const REPLICATE_GUARD =
  "\n产品必须完全取自第一张参考图（产品白底图），包装、品牌、文字保持不变；其余参考图仅作构图与风格参考，严禁照搬其中的竞品标识、品牌名与文案。";

// 安全解析接口返回:非 JSON(多为部署瞬间的纯文本 500「Internal Server Error」)
// 时给出可读错误,而不是让前端抛 "Unexpected token 'I'"。
async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      !res.ok
        ? `服务暂时不可用(${res.status}),请刷新页面后重试`
        : "服务返回异常,请重试"
    );
  }
}

async function expectJsonOk(res: Response, fallback: string): Promise<any> {
  const data = await readJsonSafe(res);
  if (!res.ok) throw new Error(data?.error || fallback);
  return data;
}

// 画布生成器:比例选项(对齐参考站图1 的网格)。w/h 只用于画小图标;
// 实际出图尺寸由后端 sizeFor 按方向(横/竖/方)映射到 gpt-image 支持的尺寸。
type ImageModelOption = { id: string; label: string; supportsEdit: boolean; generationParameters?: { ratios?: string[]; resolutions?: string[]; combinations?: string[] } };

// 占位节点(空白/上传中)动作上下文:让 React Flow 内的节点能调用主组件的上传
// 计算当前选中节点的整条血缘链路:上溯所有祖先 + 下延所有衍生(含自身)

// 画布助手上下文:锚定节点 + 上游祖先(BFS 近者优先),最多 5 张(与后端 MAX_CONTEXT_IMAGES 对齐)
// 构造展示节点与血缘连线；渲染不重新整理已有坐标。
export function CanvasClient({ initialProject, desktopAppearance = false }: { initialProject?: string; desktopAppearance?: boolean } = {}) {
  const { can: canFeature } = useFeatureAccess();
  const billing=useBilling();
  function privateFetch(input:RequestInfo|URL,init:CanvasCreationRequestInit={}){
    const account=canvasAccountRef.current,project=activeProjectRef.current?.key||null,epoch=canvasContextEpochRef.current;
    const scope=captureCanvasImageTaskScope(user?.email||"",project,()=>batchRunMountedRef.current&&account===canvasAccountRef.current&&project===(activeProjectRef.current?.key||null)&&epoch===canvasContextEpochRef.current&&(init.isCurrent?.()??true));
    return submitCanvasCreationRequest(input,init,{scope,authenticated:!!user,sourceId:active?.members[0]?.id,sources:active?.members||[],model:genModel,quality:genQuality,toolQualities:canvasToolQualities},
      {billing,request:privateFetchRaw,chooseFrame:frameChoice.chooseFrame,notice:message=>{if(scope.isCurrent())flashTip(message);}});
  }
  const { model: textModel, setModel: setTextModel } = useTextModel();
  const { user, ready, remaining, persistMode, applyServerUser, signOut } = useAuth();
  const { openAuth } = useAuthModal();
  const { openRecharge } = useRecharge();
  const { t, locale } = useI18n();
  const router = useRouter();
  const { commerceVisible } = usePaymentConfig();
  // works 的同步镜像:供 useCallback(如缩放撤销记录)读取最新值而不重挂回调
  const worksRef = useRef<Artwork[] | null>(null);
  const dimensionSyncRef = useRef(new Set<string>());
  const artworkPlacementRef = useRef({ scope: "", positions: new Map<string, CanvasPoint>() });
  // 管理员看指定用户:?email=<用户> → 只读查看该用户画布;?node=<作品id> → 预选中那张
  const [targetEmail, setTargetEmail] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const canvasAccountRef=useRef("");canvasAccountRef.current=JSON.stringify([user?.email?.toLowerCase(),targetEmail?.toLowerCase()]);
  const [nodeSettings, setNodeSettings] = useState<Record<string, CanvasNodeSettings>>({});
  const nodeSettingsRef = useRef(nodeSettings); nodeSettingsRef.current = nodeSettings;
  const [nodeSettingsReady, setNodeSettingsReady] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [cropArtwork, setCropArtwork] = useState<Artwork | null>(null);
  const [localEditBusy, setLocalEditBusy] = useState(false);
  const localEditBusyRef = useRef(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<Artwork | null>(null);
  const localEditAttempt = useRef<{fingerprint:string;id:string}|null>(null);
  const L = (zh: string, en: string) => locale === "en" ? en : zh;
  const settingsFor = (id: string) => nodeSettingsRef.current[id] || DEFAULT_CANVAS_SETTINGS;
  const isNodeLocked = (id: string) => settingsFor(id).locked;

  useEffect(() => {
    if (!ready || !user) return;
    const email=(targetEmail || user.email).toLowerCase();
    let stopped=false;setNodeSettingsReady(false);setNodeSettings({});
    void privateFetchRaw(`/api/canvas/node-settings?email=${encodeURIComponent(email)}`).then(async response=>{
      const data=await expectJsonOk(response,"节点属性读取失败");if(stopped)return;
      const raw=data.persisted ? data.settings : JSON.parse(localStorage.getItem(`naumi:node-settings:${email}`) || '{}');
      setNodeSettings(Object.fromEntries(Object.entries(raw || {}).map(([id,value])=>[id,validNodeSettings(value)])));
      setNodeSettingsReady(true);
    }).catch(()=>{if(!stopped)flashTip(L("节点属性读取失败，请刷新重试","Properties failed to load. Refresh to retry."));});
    return ()=>{stopped=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ready,user?.email,targetEmail]);
  useEffect(()=>{
    if(!nodeSettingsReady || !user || readOnly)return;
    try{localStorage.setItem(`naumi:node-settings:${user.email.toLowerCase()}`,JSON.stringify(nodeSettings));}catch{/* best effort */}
  },[nodeSettings,nodeSettingsReady,user,readOnly]);
  const pendingNodeRef = useRef<string | null>(null);
  // 文件拖入完成后只打开对应项目，不自动弹出节点功能；用户点击图片后再显示。
  const openPendingNodeWithoutSelectionRef = useRef(false);
  // 通过 ?node= 深链进入的节点 id(如 AI 抠图「送画布」):即使它是单张一次性作品
  // (按常规规则不算项目),也让它所在项目在列表里显示出来,否则深链会落到空项目列表。
  const [pinnedNode, setPinnedNode] = useState<string | null>(null);
  // 每个任务各自保存占位节点位置；允许多个互不依赖的节点同时生成和拖动。
  const generationTaskPosRef = useRef<
    Record<string, { x: number; y: number }>
  >({});
  const generationOperationRef = useRef(new Set<string>());
  const generationTaskSizeRef = useRef<Record<string, { width: number; height: number }>>({});
  // 仅"后台深链 ?node="进入时才自动平移聚焦;日常新建/上传/生成节点都不动画布
  const deepFocusRef = useRef(false);
  // 是否已做过"刷新恢复上次项目"的初始化(避免初始挂载误清本地保存)
  const restoredRef = useRef(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const canvasArtworkDocument = useCanvasArtworkDocument({account:canvasAccountRef.current,actor:user?.email||"",owner:targetEmail||user?.email||"",
    project:activeKey,enabled:ready&&!!user&&!!targetEmail,readOnly});
  const {nodes:works,set:setWorks} = canvasArtworkDocument;
  worksRef.current=works;
  const projectCatalog=useCanvasProjectCatalog({scope:canvasArtworkDocument.scope,ready:ready&&!!targetEmail,actor:user?.email||"",target:targetEmail||"",readOnly,notice:flashTip,failure:t("canvas.genFail")});

  const frameChoice=useCanvasFrameChoice(imageDraftScope(user?.email,targetEmail,activeKey));
  const canvasSelection=useCanvasSelection();
  const {selectedId,setSelectedId,selectedPendId,setSelectedPendId,selectedTextId,setSelectedTextId,selectedEdge,setSelectedEdge,multiSel,setMultiSel}=canvasSelection;
  const selectedIdRef = useRef<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const imageDraftNodeId = selectedPendId || selectedId;
  const imageDraftArtwork = selectedPendId ? undefined : works?.find(art => art.id === selectedId);
  const imageDraft = useImageNodeDraft(
    imageDraftScope(user?.email, targetEmail, activeKey), imageDraftNodeId,
    { prompt: inheritableImagePrompt(imageDraftArtwork?.prompt), ratio: "auto" }, readOnly
  );
  const { prompt: editPrompt, setPrompt: setEditPrompt, ratio: genRatio, setRatio: setGenRatio } = imageDraft;
  const [genModel, setGenModel] = useState("");
  const { quality: genQuality, imageCost, modelConfig } = useImageQuality("canvas.image", genModel);
  const expandQuality = useImageQuality("canvas.expand").quality;
  const textEditQuality = useImageQuality("canvas.text-edit").quality;
  const annotateQuality = useImageQuality("canvas.annotate").quality;
  const canvasToolQualities: Partial<Record<FeatureId,string>> = {"canvas.expand":expandQuality,"canvas.text-edit":textEditQuality,"canvas.annotate":annotateQuality};
  const { catalog: cutoutCatalog, error: cutoutCatalogError } = useFeatureModels("tool.cutout");
  const { catalog: canvasImageCatalog, selected: canvasImageModel, setSelected: setCanvasImageModel, error: canvasImageCatalogError } = useFeatureModels("canvas.image");
  const [imageModels, setImageModels] = useState<ImageModelOption[]>([]);
  const [genResolution, setGenResolution] = useState("1K"); // 默认 1K
  const [imageComposerMenuOpen,setImageComposerMenuOpen]=useState(false);
  const [genStyle, setGenStyle] = useState(GENERATION_STYLES[0]);
  const [genCount, setGenCount] = useState(1);
  const [generationMode, setGenerationMode] =
    useState<GenerationMode>("standard");
  const [generationTasks, setGenerationTasks] = useState<
    CanvasGenerationTask[]
  >([]);
  // 自由拖动是默认；用户主动开启磁铁时才吸附网格。全局整理仅由手动动作触发。
  const [genError, setGenError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [stitching, setStitching] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );
  const [focusId, setFocusId] = useState<string | null>(null);
  const [flowReady, setFlowReady] = useState(0);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  // 视口变换(平移/缩放),用于把生成器面板停靠到选中节点正下方并跟随
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const viewportRef = useRef(viewport);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const previousCanvasSizeRef = useRef({ width: 0, height: 0 });
  const previousViewportAnchorRef = useRef<string | null>(null);
  // 拉线建节点(5b):从 +端口拉出 → 记源节点;落空白弹「新建节点」菜单
  const spawnSourceRef = useRef<string | null>(null);
  const connectedRef = useRef(false);
  const [spawnMenu, setSpawnMenu] = useState<{
    x: number;
    y: number;
    sourceId: string;
  } | null>(null);
  // 右键菜单(5c):nodeId 有值=节点菜单,无值=空白菜单
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; // 画布区相对坐标(供添加节点/上传/历史落点)
    y: number;
    cx: number; // 视口坐标(供 body portal 固定定位)
    cy: number;
    nodeId?: string;
  } | null>(null);
  // 生成器面板停靠在选中节点正下方(不再可拖);panelRef 仍用于测量
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nodeToolbarRef = useRef<HTMLDivElement | null>(null);
  const nodeRenamePositionRef = useRef<HTMLDivElement | null>(null);
  const [dockMetrics, setDockMetrics] = useState({ dockHeight: 0, toolbarHeight: 50, toolbarWidth: 0 });
  // 底部 dock 提示词框:随内容自适应长高。显式写入最小高度，避免 macOS
  // Chromium/Safari 在 flex + max-height 组合下把 textarea 压缩成约两行。
  const promptAreaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = promptAreaRef.current;
    if (!el) return;
    const minHeight = 112;
    const maxHeight = 220;
    el.style.height = "0px";
    el.style.height = `${Math.min(maxHeight, Math.max(minHeight, el.scrollHeight))}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [editPrompt]);
  // 追加参考图(与节点图一起参与图生图)
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const extraReferenceKeys = useRef(new WeakMap<File,string>());
  const extraReferenceOwner = useRef<string | null>(null);
  const [extraPreviews, setExtraPreviews] = useState<string[]>([]);
  const extraPreviewUrls = useRef(extraPreviews); extraPreviewUrls.current = extraPreviews;
  const extraInputRef = useRef<HTMLInputElement>(null);
  // 节点剪贴板(复制/粘贴节点)+ 上传作根节点的文件 input
  const pendingNodeSelectionRef=useRef<{ids:string[];projectKey:string;owner:string}|null>(null);
  const [copyTip, setCopyTip] = useState(false);
  const rootUploadRef = useRef<HTMLInputElement>(null);
  // 空白右键「上传图片/添加节点」时记下落点(画布坐标)与挂靠的当前项目根,供 uploadRoot 用
  const uploadCtxRef = useRef<{ parentId: string | null; x: number; y: number } | null>(
    null
  );
  const imageImportOwner=useCanvasImageImports();
  const imageImports=imageImportOwner.batches.filter(batch=>batch.workspace===canvasArtworkDocument.scope.workspace);
  const importSynchronizationVisible=imageImports.some(batch=>batch.owner===user?.email.toLowerCase()&&batch.phase==="sync"&&batch.project===activeKey&&batch.nodeIds?.length);
  const dragDepthRef = useRef(0);
  const [fileDragOver, setFileDragOver] = useState(false);
  function resetImportScope() {
    imageImportOwner.reset();
    uploadCtxRef.current = null;
    dragDepthRef.current = 0;
    setFileDragOver(false);
  }

  useEffect(() => {
        if (canvasImageCatalog?.managed) {
          const options = canvasImageCatalog.models;
          setImageModels(options);
          setGenModel(options.find(item => item.id === canvasImageModel)?.id || canvasImageCatalog.defaultModelId || options[0]?.id || "");
          return;
        }
        // Never briefly expose the unrestricted generation list while a managed canvas loads.
        if (canvasImageCatalog?.managed !== false && modelConfig?.modelVersion) {
          setImageModels([]); setGenModel(""); return;
        }
        const config = modelConfig;
        if (!config) return;
        const options = Array.isArray(config.imageModels)
          ? config.imageModels.filter((item) => item?.id && item?.label)
          : [];
        const fallback = config.defaultImageModel || options[0]?.id || "";
        const saved = window.localStorage.getItem("naumi:canvas-image-model") || "";
        const normalized = options.length
          ? compactImageModelOptions(options, [fallback, saved])
          : fallback
            ? [{ id: fallback, label: fallback, supportsEdit: fallback.startsWith("gpt-image") }]
            : [];
        setImageModels(normalized);
        setGenModel((current) => {
          if (normalized.some((item) => item.id === current)) return current;
          if (normalized.some((item) => item.id === saved)) return saved;
          return normalized.find((item) => item.id === fallback)?.id || normalized[0]?.id || "";
        });
  }, [modelConfig, canvasImageCatalog, canvasImageModel]);

  useEffect(() => {
    const parameters = canvasModelParameters(imageModels.find(m => m.id === genModel)?.generationParameters);
    setGenRatio(current => parameters.ratios.includes(normalizeCanvasRatio(current)) ? normalizeCanvasRatio(current) : "auto");
    setGenResolution(current => parameters.resolutions.includes(normalizeCanvasResolution(current)) ? normalizeCanvasResolution(current) : parameters.resolutions[0] || "1K");
  }, [genModel, imageModels, imageDraft.key, genRatio]);

  function pickGenerationModel(model: string) {
    if (canvasImageCatalog?.managed) { setCanvasImageModel(model); return; }
    setGenModel(model);
    window.localStorage.setItem("naumi:canvas-image-model", model);
  }
  // 从生成历史选择:打开作品选择器(记下落点)
  const [historyPicker, setHistoryPicker] = useState<{ x: number; y: number } | null>(
    null
  );
  const historyAddingRef = useRef(false);
  const [historyAddingId, setHistoryAddingId] = useState<string | null>(null);
  const [historyPickerError, setHistoryPickerError] = useState<string | null>(null);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(60);
  useEffect(() => {
    if (!historyPicker) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !historyAddingRef.current) {
        event.preventDefault();
        setHistoryPicker(null);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [historyPicker]);
  // 「全部项目」网格里每张卡片的「...」菜单(重命名/删除)当前展开的是哪个项目
  // 回收站(软删除的作品):打开状态 + 列表 + 操作中
  const [trashOpen, setTrashOpen] = useState(false);
  const {trash:trashItems,trashBusy} = canvasArtworkDocument;
  // 剪刀剪线:鼠标悬停的连线 + 光标在画布内的位置(屏幕坐标,相对 canvasArea)
  const edgeHoverHintRef = useRef<CanvasEdgeHoverHandle>(null);
  // 连线选中(RF 原生点击选中):Delete/Backspace 才剪断,不再点一下就删
  const cuttingEdgesRef = useRef(new Set<string>());
  // 占位/空白节点(添加节点/拉线建节点 → 先出空白节点,里面上传带进度,完成后变真节点)
  const [pendNodes, setPendNodes] = useState<Pend[]>([]);
  const pendNodesRef = useRef(pendNodes); pendNodesRef.current = pendNodes;
  // Session-local task ownership survives project switches; unknown paid work is
  // never discarded or restarted merely because its original view is hidden.
  const taskDocumentRef=useRef({merge:mergeWorks,history:pushAddUndoMany});
  taskDocumentRef.current={merge:mergeWorks,history:pushAddUndoMany};
  const editTaskStateRef = useRef(new Map<string, { account: string; project: string | null; workspace: string; node: Pend }>());
  const [canvasImageTaskRefreshKey, setCanvasImageTaskRefreshKey] = useState(0);
  const settledCanvasVideoTaskRef = useRef(new Set<string>());
  const failedCanvasVideoTaskRef = useRef(new Set<string>());
  const pendSeqRef = useRef(1);
  const canvasTextDocument = useCanvasTextDocument({account:canvasAccountRef.current,actor:user?.email||"",owner:targetEmail||user?.email||"",
    project:activeKey,enabled:ready&&!!user&&!!targetEmail,readOnly,notice:flashTip});
  const {nodes:textNodes,set:setTextNodes,ready:textNodesReady,unsaved:unsavedTextCount} = canvasTextDocument;
  const textNodesRef = useRef(textNodes); textNodesRef.current = textNodes;
  const [textPrompt, setTextPrompt] = useState("");
  // 文字节点一键放大/还原只改变当前画布视图，不写回节点尺寸；刷新后仍使用用户保存的原尺寸。
  const [expandedTextIds, setExpandedTextIds] = useState<Set<string>>(new Set());
  const [textComposerExpanded, setTextComposerExpanded] = useState(false);
  const textComposerDockRef = useRef<HTMLDivElement>(null);
  const [textComposerMenuOpen,setTextComposerMenuOpen]=useState(false);
  const imageTextEditor=useCanvasImageTextEditor(canvasArtworkDocument.scope);
  const {artworkId:ocrArtworkId}=imageTextEditor.state;

  const [expandOpen, setExpandOpen] = useState(false);
  // ComfyUI 工作流面板(BYOC:算力在用户端点,不扣积分)
  const [comfyOpen, setComfyOpen] = useState(false);
  const [comfyMounted, setComfyMounted] = useState(false);
  useEffect(() => { if (comfyOpen) setComfyMounted(true); }, [comfyOpen]);
  const [expandRatio, setExpandRatio] = useState<string | null>(null);
  const [expandAnchor, setExpandAnchor] = useState("center");
  // 持久视频节点与公开能力目录；规范请求经独立节点设置面板提交。
  const [videoDockAdvancedId,setVideoDockAdvancedId]=useState<string|null>(null);
  const [videoHistoryId,setVideoHistoryId]=useState<string|null>(null);
  const videoResultAttempts=useRef(new Map<string,Extract<UndoAct,{kind:"video-result"}>>());
  const [videoMedia,setVideoMedia]=useState<{id:string;projectKey:string;initial:VideoPlayerAction}|null>(null);
  const videoNodesStore=useVideoNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const directorNodesStore=useDirectorNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const [directorEditorId,setDirectorEditorId]=useState<string|null>(null);
  useEffect(()=>{if(directorNodesStore.error)flashTip(directorNodesStore.error);},[directorNodesStore.error]);
  const directorCreating=useRef(false);
  const characterNodesStore=useCharacterNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const [characterEditorId,setCharacterEditorId]=useState<string|null>(null),characterCreating=useRef(false);
  useEffect(()=>{if(characterNodesStore.error)flashTip(characterNodesStore.error);},[characterNodesStore.error]);
  const audioNodesStore=useAudioNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const [audioEditorId,setAudioEditorId]=useState<string|null>(null);
  const [audioActionsOwner]=useState(createCanvasAudioActions);
  useEffect(()=>{if(audioNodesStore.error)flashTip(audioNodesStore.error);},[audioNodesStore.error]);
  const timelineNodesStore=useTimelineNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const [timelineEditorId,setTimelineEditorId]=useState<string|null>(null);
  const [timelineActionsOwner]=useState(createCanvasTimelineActions);
  useEffect(()=>{if(timelineNodesStore.error)flashTip(timelineNodesStore.error);},[timelineNodesStore.error]);
  const sceneNodesStore=useSceneNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const [sceneEditorId,setSceneEditorId]=useState<string|null>(null),sceneCreating=useRef(false);
  useEffect(()=>{if(sceneNodesStore.error)flashTip(sceneNodesStore.error);},[sceneNodesStore.error]);
  const directorOutputAttempts=useRef(new WeakMap<File,{artworkId?:string;operationId:string;expectedRevision?:number;position?:{x:number;y:number};positionOperationId?:string;addedToHistory?:boolean}>());
  const videoAssetStore=useVideoAssets({email:targetEmail||user?.email,readOnly,request:privateFetchRaw});
  const imageMoreRef = useRef<HTMLButtonElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const videoModelCatalog=useVideoCatalog({email:user?.email,ready,request:privateFetchRaw});
  const videoCatalog=videoModelCatalog.models;
  const videoCreationCatalogRef=useRef(videoModelCatalog);videoCreationCatalogRef.current=videoModelCatalog;
  const videoNodeCreatePending=useRef(false),[videoNodeCreateBusy,setVideoNodeCreateBusy]=useState(false);
  const videoNodeCreationReady=!!videoNodeCreationDefaults(videoModelCatalog);
  const videoNodeCreateDisabled=videoModelCatalog.loading||videoNodeCreateBusy;
  const videoNodeCreateLabel=videoModelCatalog.loading?L("视频模型加载中…","Loading video models…"):videoNodeCreationReady?L("新增视频节点","Add video node"):L("重试视频模型","Retry video models");
  const [annotateArtwork, setAnnotateArtwork] = useState<Artwork | null>(null);
  // The session owner owns transcript, stream, recovery and attachments.
  const assistantSession=useCanvasAssistant(canvasArtworkDocument.scope);
  const {anchorId:assistantArtworkId,turns:assistantTurns,input:assistantInput,uploading:assistantUploading,uploadError:assistantUploadError,
    skill:assistantSkill,busy:assistantBusy,responding:assistantResponding,activity:assistantActivity,steps:assistantSteps,outcome:assistantOutcome,
    error:assistantError,continueTurn:assistantContinueTurn}=assistantSession.state;
  const orbCompanion=useOrbCompanion(`${user?.email||""}:${canvasArtworkDocument.scope.workspace}:${activeKey||"workspace"}`);
  const orbCue=orbCompanion.emit;
  const {open:assistantOpen,focusInput:assistantFocusInput,disclose:discloseAssistant,suspend:suspendAssistant}=useCanvasAssistantDisclosure(user?.email);
  const assistantVisible=canFeature("agent")&&assistantOpen&&!propertiesOpen&&!ocrArtworkId;
  // 拉线「生成衍生图」:建好空白节点后,把光标自动落进提示词框,引导用户写"改什么"
  const pendPromptRef = useRef<HTMLTextAreaElement>(null);
  // 占位 dock 与已生成节点保持同一自适应视野。
  useEffect(() => {
    const el = pendPromptRef.current;
    if (!el) return;
    const minHeight = 112;
    const maxHeight = 220;
    el.style.height = "0px";
    el.style.height = `${Math.min(maxHeight, Math.max(minHeight, el.scrollHeight))}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [editPrompt]);
  const wantFocusPendPrompt = useRef(false);
  // 重命名节点(改作品标题):正在改的节点 id + 输入值
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [nodeRenameValue, setNodeRenameValue] = useState("");
  const nodeRenameCancelRef = useRef(false); // Esc 取消时跳过失焦保存
  const pendUploadRef = useRef<HTMLInputElement>(null);
  const pendUploadTargetRef = useRef<string | null>(null);
  // 选中的空白节点(显示文生图/合并 dock)
  const selectedPendIdRef = useRef(selectedPendId); selectedPendIdRef.current = selectedPendId;
  // 新建项目:进入空白画布(无任何节点),右键添加节点/上传第一张图后即成新项目并切过去
  const [creatingNew, setCreatingNew] = useState(false);
  // 项目网格落地页(Figma 式):进画布先看项目卡片,点卡片才进入该项目的画布
  const [browsing, setBrowsing] = useState(true);
  const viewControls=useCanvasViewControls({flow:rfRef,area:canvasAreaRef,zoom:viewport.zoom,zoomLabel:t("canvas.toolbar.zoom"),desktopAppearance,enabled:ready&&!!user,
    contextKey:canvasArtworkDocument.scope.key,browsing,onMarquee:()=>{setSelectedId(null);setSelectedPendId(null);setSelectedTextId(null);clearCanvasSelection();}});
  const {tool:canvasTool,showMinimap,snapGrid,lightCanvas,isMac,modifierKey,zoomMenuOpen}=viewControls;
  const boxSelectMode=canvasTool==="marquee";
  // 浏览器后退支持:进做图页(browsing=false)时往历史压一条,使「后退」先回项目页而非离开 /canvas。
  const editorPushedRef = useRef(false);
  const browsingRef = useRef(true);
  // 余额独立于作品快照缓存；同一 hook 覆盖项目列表与编辑器右上角。
  // 先从当前URL解析只读目标，不等待作品effect设置targetEmail，避免首帧串号和切号旧目标请求。
  const creditsTargetEmail = ready && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("email") : null;
  const { credits, refreshCredits } = useCanvasCredits({ user, ready, targetEmail: creditsTargetEmail, request: privateFetchRaw });
  // 右上账户入口与站内其他页面共用同一 AccountDockMenu，不再打开整页账户弹窗。
  const [accountDockOpen, setAccountDockOpen] = useState(false);
  const [accountDockDark, setAccountDockDark] = useState(false);
  const accountDockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const syncTheme = () => setAccountDockDark(currentThemeIsDark());
    syncTheme();
    window.addEventListener(ACCOUNT_THEME_EVENT, syncTheme);
    return () => window.removeEventListener(ACCOUNT_THEME_EVENT, syncTheme);
  }, []);
  useEffect(() => {
    if (!accountDockOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !accountDockRef.current?.contains(event.target)) {
        setAccountDockOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountDockOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountDockOpen]);
  useEffect(() => {
    if (browsing) setAccountDockOpen(false);
  }, [browsing]);
  // 帮助/快捷键弹框 + 画布工具栏临时提示
  const [helpOpen, setHelpOpen] = useState(false);
  const [tipMsg, setTipMsg] = useState<string | null>(null);
  const shortcut = (key: string) => `${modifierKey}${key}`;
  // 主工具栏仅保留选择/移动、创建和设置；创建菜单与设置菜单互斥。
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  // 左下角缩放下拉菜单 + 可输入的缩放值
  const workspacePages=useCanvasWorkspacePages({commerceVisible,email:targetEmail||user?.email});
  const openModal=workspacePages.open;
  // Import presentation belongs to this surface, independently of document
  // ownership. Closing/reopening a modal or gallery must not steal later focus.
  const importViewRef=useRef({browsing,creatingNew,stack:workspacePages.modalStack});
  if(importViewRef.current.browsing!==browsing||importViewRef.current.creatingNew!==creatingNew||importViewRef.current.stack!==workspacePages.modalStack)importViewRef.current={browsing,creatingNew,stack:workspacePages.modalStack};
  const importView=importViewRef.current,importViewCurrent=()=>importViewRef.current===importView;
  // 模板「做同款」→ 关弹窗 + 用模板图在画布里新建一个项目(独立根节点),选中后即可在画布内生成衍生
  async function applyTemplateToCanvas(templateId:string){
    if(!user||readOnly)return;
    const scope=canvasArtworkDocument.scope;
    try{await templateImports.apply(templateId);}
    catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }
  const nativeDocuments=canvasNativeDocuments({videoNodes:videoNodesStore,directorNodes:directorNodesStore,characterNodes:characterNodesStore,sceneNodes:sceneNodesStore,audioNodes:audioNodesStore,timelineNodes:timelineNodesStore});
  const canvasHistory = useCanvasHistory({
    account: canvasAccountRef.current, project: activeKey, readOnly,
    artworkDocument:canvasArtworkDocument.history, works: setWorks, textDocument: canvasTextDocument.history, settings: applyHistorySettings, selectedText: setSelectedTextId,
    native:nativeDocuments,flush:nativeDocuments.flush,
    video: videoNodesStore.getNode,director:directorNodesStore.getNode,character:characterNodesStore.getNode,scene:sceneNodesStore.getNode,audio:audioNodesStore.getNode,timeline:timelineNodesStore.getNode,artwork:id=>canvasArtworkDocument.getSnapshot().nodes?.find(node=>node.id===id), refresh:nativeDocuments.refresh,
    pending: applyPendingLinkHistory, applied: onHistoryApplied, warning: flashTip,
  });
  const {undoStack,redoStack,pushUndo,historyBusyRef,historySaving,setHistorySaving,historyCurrent} = canvasHistory;
  const templateImports=useCanvasTemplateImports(canvasArtworkDocument.scope,{
    writable:()=>!!user&&!readOnly,viewCurrent:importViewCurrent,merge:ids=>canvasArtworkDocument.merge(ids),history:canvasHistory,
    open:(id,projectKey)=>{resetImportScope();workspacePages.close();setBrowsing(false);setCreatingNew(false);setActiveKey(projectKey);setSelectedId(id);setSelectedTextId(null);},
  });
  const textTasks=useCanvasTextTasks(canvasTextDocument.scope,{
    document:canvasTextDocument,
    submit:(request,submission,scope)=>privateFetch("/api/canvas/text-generate",{method:"POST",headers:{"content-type":"application/json","x-naumi-billing-intent-slot":request.node.id,...(request.operationId?{"x-naumi-billing-operation-id":request.operationId}:{})},body:JSON.stringify(request.payload),submission,isCurrent:scope.viewCurrent}),
    history:node=>canvasHistory.record({...canvasHistory.scope,project:node.projectKey,key:JSON.stringify([canvasHistory.scope.account,canvasHistory.scope.workspace,node.projectKey])},{kind:"text-add",records:[node]}),
    model:setTextModel,errorText:t("canvas.textGenerateFail"),
  });
  const promptMining=textTasks.busy("reverse"),assistBusy=textTasks.busy("assist");
  const canvasNodeOperations=useCanvasNodeOperations(canvasHistory.scope,{
    writable:()=>!!user&&!readOnly,
    native:nativeDocuments,
    snapshot:()=>({artworks:canvasArtworkDocument.getSnapshot().nodes||[],textNodes:canvasTextDocument.getSnapshot().nodes,videoNodes:[],...nativeDocuments.snapshot()}),
    history:canvasHistory,artworks:ids=>canvasArtworkDocument.merge(ids),
  });
  const workflowDocument=useCanvasWorkflowDocument(canvasArtworkDocument.scope,targetEmail||user?.email||"",{writable:()=>!!user&&!readOnly,merge:canvasArtworkDocument.merge,history:canvasHistory});
  const workflowManifests=workflowDocument.manifests;
  useEffect(()=>{if(workflowDocument.error)flashTip(workflowDocument.error);},[workflowDocument.error]);
  const workflowCallbacksRef = useRef({ replace: requestReplace, select: selectWorkflowGroup });
  workflowCallbacksRef.current = { replace: requestReplace, select: selectWorkflowGroup };
  const workflowPaste = useWorkflowPaste({scope:canvasArtworkDocument.scope,writable:()=>!!user&&!readOnly&&!browsing,viewCurrent:importViewCurrent,
    onCommitted: (result,scope,present) => {
      const artworks = result.artworks as Artwork[];
      canvasArtworkDocument.accept(artworks);
      canvasTextDocument.accept(result.textNodes);
      workflowDocument.accept(result.manifest);
      setNodeSettings(current=>scope.documentCurrent()?{...current,...result.settings}:current);
      canvasHistory.record({...scope,project:result.projectKey,key:JSON.stringify([scope.account,scope.workspace,result.projectKey])},{kind:"workflow-add",artworks,textNodes:result.textNodes});
      if(!present)return;
      setCreatingNew(false); setActiveKey(result.projectKey); setSelectedId(null); setSelectedTextId(null);
      const missingAssets = artworks.filter(n => n.source === "workflow-placeholder").length;
      flashTip(missingAssets ? `工作流已导入，${missingAssets} 张图片待补齐` : result.missingReferences ? `工作流已导入，${result.missingReferences} 个外部引用未包含在选择中` : "工作流已导入");
      const ids = [...artworks.map(n => n.id), ...result.textNodes.map(n => n.id)];
      const expectedViewEpoch=canvasContextEpochRef.current+(scope.project===result.projectKey?0:1);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {if(scope.documentCurrent()&&canvasContextEpochRef.current===expectedViewEpoch&&activeProjectRef.current?.key===result.projectKey)void rfRef.current?.fitView({ nodes: ids.map(id => ({ id })), padding: 0.2, duration: 240, maxZoom: 1 });}));
    } });
  // 右键未选节点会先按桌面习惯单选；若用户随后点“加入批量选择”，
  // 仍可恢复右键前的选择集合并把当前节点加入其中。
  const contextSelectionBaseRef = useRef<string[]>([]);
  // 拉线中:图片节点端口全部显形(canvas-linking),目标的前 + 不再隐形盲抓
  const [linking, setLinking] = useState(false);
  // 竞品链路:反推中/帮写中标记、产品图选择器、生成图片模式菜单
  const batchRunMountedRef = useRef(true);
  useEffect(() => { batchRunMountedRef.current = true; return () => { batchRunMountedRef.current = false; }; }, []);
  const [productPicker, setProductPicker] = useState<{ textNodeIds: string[] } | null>(null);
  const [genImageMenu, setGenImageMenu] = useState<{
    textNodeIds: string[]; imageIds: string[]; drafts: Record<string, string>;
    account: string; project: string; workspace: string; epoch: number; revision: number;
  } | null>(null);
  const textImageContextKey = JSON.stringify([canvasAccountRef.current, activeKey, currentWorkspace()]);
  const textImageContextRef = useRef({key: textImageContextKey, revision: 0});
  if (textImageContextRef.current.key !== textImageContextKey) {
    textImageContextRef.current = {key: textImageContextKey, revision: textImageContextRef.current.revision + 1};
  }
  const textImageSubmittingRef = useRef(false);
  const [textImageSubmitting, setTextImageSubmitting] = useState(false);
  // 居中确认弹框(替代浏览器原生 confirm,贴合站点配色)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    return () => extraPreviewUrls.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function pickExtra(list: FileList | null) {
    if (!list) return;
    const room = MAX_TOTAL_IMAGES - visibleDockRefs.length - extraFiles.length;
    if (room <= 0) return;
    const nf: File[] = [];
    const np: string[] = [];
    for (const f of Array.from(list)) {
      if (nf.length >= room) break;
      if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) continue;
      if (f.size > MAX_UPLOAD) continue;
      nf.push(f);
      extraReferenceKeys.current.set(f, `upload:${browserRandomUUID()}`);
      np.push(URL.createObjectURL(f));
    }
    if (nf.length === 0) return;
    extraReferenceOwner.current = imageDraft.key;
    setExtraFiles((prev) => [...prev, ...nf]);
    setExtraPreviews((prev) => [...prev, ...np]);
    if (extraInputRef.current) extraInputRef.current.value = "";
  }
  function removeExtra(i: number) {
    setExtraPreviews((prev) => {
      const u = prev[i];
      if (u) URL.revokeObjectURL(u);
      return prev.filter((_, j) => j !== i);
    });
    setExtraFiles((prev) => prev.filter((_, j) => j !== i));
  }

  useEffect(() => {
    if (ready && !user) openAuth("sign-in");
  }, [ready, user, openAuth]);

  // 余额轮询会回写新的 user 对象；仅账号变化才重载画布，避免覆盖正在编辑的内容。
  const authenticatedEmail = user?.email;
  useEffect(() => {
    if (!ready || !authenticatedEmail) return;
    const sp = new URLSearchParams(window.location.search);
    const emailParam = sp.get("email");
    const target = emailParam || authenticatedEmail;
    const ro =
      !!emailParam && emailParam.toLowerCase() !== authenticatedEmail.toLowerCase();
    pendingNodeRef.current = sp.get("node");
    if (sp.get("node")) {
      setPinnedNode(sp.get("node")); // 让该节点所在项目即使单张也显示在列表/可直达
      setBrowsing(false); // 深链直达某节点 → 跳过网格落地页
      deepFocusRef.current = true; // 深链才允许自动聚焦
    } else {
      // 刷新恢复:加载数据前就先决定停在上次的项目画布,避免网格一闪而过
      try {
        const last = localStorage.getItem("nv:canvas:last");
        if (last) {
          setActiveKey(last);
          setBrowsing(false);
        }
      } catch {
        /* ignore */
      }
    }
    restoredRef.current = true;
    setTargetEmail(target);
    setReadOnly(ro);
  }, [ready, authenticatedEmail]);

  // 文字节点内容自适应高度:内容/引用/宽度变化时按估算调高(阈值 28px 防抖)。
  // 签名机制保证手动拖拽的尺寸不被覆盖 —— 只有内容真的变了才重新自适应;
  // 一键放大中的节点跳过自适应,避免把撑大的视野又缩回去。
  const fittedTextNodesRef = useRef(new Map<string, string>());
  useEffect(() => {
    if (!textNodesReady || readOnly) return;
    const updates: CanvasTextNode[] = [];
    for (const node of textNodes) {
      // A pasted frame has an intentional layout. Text scrolls inside it until
      // the user explicitly resizes it; never auto-fit an imported frame.
      if (node.id.startsWith("text-import-")) continue;
      if (nodeSettingsRef.current[node.id]?.locked) continue;
      const sig = `${node.content.length}|${node.prompt.length}|${node.sourceIds?.length ?? 0}|${node.productIds?.length ?? 0}|${node.width}`;
      if (fittedTextNodesRef.current.get(node.id) === sig) continue;
      fittedTextNodesRef.current.set(node.id, sig);
      const fit = estimateTextNodeHeight(node);
      if (Math.abs(fit - node.height) < 28) continue;
      updates.push({
        ...node,
        height: fit,
        updatedAt: new Date().toISOString(),
      });
    }
    if (!updates.length) return;
    const byId = new Map(updates.map((n) => [n.id, n]));
    setTextNodes((cur) => cur.map((n) => byId.get(n.id) ?? n));
    updates.forEach((n) => void persistTextNode(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textNodes, textNodesReady, readOnly]);

  // 从收银台返回(支付完成/取消)→ 自动重开会员弹窗,并清掉 URL 上的标记
  useEffect(() => {
    if (!ready || !user) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (commerceVisible && sp.get("pay")) {
        openModal("plans");
        sp.delete("pay");
        const qs = sp.toString();
        window.history.replaceState(
          null,
          "",
          window.location.pathname + (qs ? `?${qs}` : "")
        );
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  const projects=useMemo(()=>canvasProjects({works,names:projectCatalog.names,t,readOnly,pinnedNode,textNodes,videoNodes:videoNodesStore.nodes,directorNodes:directorNodesStore.nodes,characterNodes:characterNodesStore.nodes,sceneNodes:sceneNodesStore.nodes,audioNodes:audioNodesStore.nodes,timelineNodes:timelineNodesStore.nodes}),[works,projectCatalog.names,t,readOnly,pinnedNode,textNodes,videoNodesStore.nodes,directorNodesStore.nodes,characterNodesStore.nodes,sceneNodesStore.nodes,audioNodesStore.nodes,timelineNodesStore.nodes]);
  const projectMonths=useMemo(()=>canvasProjectMonths(projects,typeof navigator!=="undefined"&&navigator.language?navigator.language:"zh-CN"),[projects]);

  // 打开中的项目消失了(被删 / 根节点变化导致 key 变)→ 回到项目网格,而非自动弹别的项目
  useEffect(() => {
    if (creatingNew || browsing) return;
    if (works === null || !textNodesReady || !videoNodesStore.ready || !directorNodesStore.ready || !characterNodesStore.ready || !sceneNodesStore.ready || !audioNodesStore.ready||!timelineNodesStore.ready) return; // 等待混合节点，保留刷新后的纯导演/文字/视频项目。
    if (activeKey && !projects.some((p) => p.key === activeKey)) {
      setBrowsing(true);
      setActiveKey(null);
      setSelectedId(null);
      try {
        localStorage.removeItem("nv:canvas:last");
      } catch {
        /* ignore */
      }
    }
  }, [projects, activeKey, creatingNew, browsing, works,textNodesReady,videoNodesStore.ready,directorNodesStore.ready,characterNodesStore.ready,sceneNodesStore.ready,audioNodesStore.ready,timelineNodesStore.ready,setSelectedId]);

  // ?node=<作品id>:跳到该图所在项目并选中聚焦(管理员从后台点图进来时)
  useEffect(() => {
    const node = pendingNodeRef.current;
    if (!node || projects.length === 0) return;
    const proj = projects.find((p) => p.members.some((m) => m.id === node)||p.videoNodes?.some(item=>item.id===node)||p.directorNodes?.some(item=>item.id===node)||p.characterNodes?.some(item=>item.id===node)||p.sceneNodes?.some(item=>item.id===node)||p.audioNodes?.some(item=>item.id===node)||p.timelineNodes?.some(item=>item.id===node)||p.textNodes?.some(item=>item.id===node));
    if(!proj&&(!videoNodesStore.ready||!directorNodesStore.ready||!characterNodesStore.ready||!sceneNodesStore.ready||!audioNodesStore.ready||!timelineNodesStore.ready||!textNodesReady||works===null))return;
    pendingNodeRef.current = null;
    const openWithoutSelection = openPendingNodeWithoutSelectionRef.current;
    openPendingNodeWithoutSelectionRef.current = false;
    if (proj) {
      setActiveKey(proj.key);
      setSelectedId(openWithoutSelection ? null : node);
      // 只有后台深链进入才自动聚焦;日常新建/上传/生成不动画布
      if (deepFocusRef.current) {
        setFocusId(node);
        deepFocusRef.current = false;
      }
      setBrowsing(false); // 新建/上传/深链 → 直接进入该项目画布,不停在网格
    }
  }, [projects,videoNodesStore.ready,directorNodesStore.ready,characterNodesStore.ready,sceneNodesStore.ready,audioNodesStore.ready,timelineNodesStore.ready,textNodesReady,works,setSelectedId]);

  // Optional desktop deep link; the original /canvas defaults are unchanged.
  const desktopProjectOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!initialProject || desktopProjectOpened.current === initialProject) return;
    const project = projects.find(p => p.key === initialProject);
    if (!project) return;
    desktopProjectOpened.current = initialProject;
    setCreatingNew(false); setActiveKey(project.key); setBrowsing(false);
  }, [initialProject, projects]);

  // 同步当前打开的项目到本地(供刷新恢复);只写不清,清除交给返回/删除路径,
  // 避免初始挂载时(browsing=true)误清掉上次保存的项目。
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      if (!browsing && activeKey)
        localStorage.setItem("nv:canvas:last", activeKey);
    } catch {
      /* ignore */
    }
  }, [browsing, activeKey]);

  const active = useMemo(
    () => projects.find((p) => p.key === activeKey) ?? null,
    [projects, activeKey]
  );
  const activeProjectRef = useRef(active);
  activeProjectRef.current = active;
  const canvasContextEpochRef = useRef(0);
  useEffect(()=>{if(directorEditorId&&!directorNodesStore.nodes.some(node=>node.id===directorEditorId&&node.projectKey===activeKey))setDirectorEditorId(null);},[directorEditorId,directorNodesStore.nodes,activeKey,targetEmail,user?.email]);
  useEffect(()=>{if(characterEditorId&&!characterNodesStore.nodes.some(node=>node.id===characterEditorId&&node.projectKey===activeKey))setCharacterEditorId(null);},[characterEditorId,characterNodesStore.nodes,activeKey,targetEmail,user?.email]);
  useEffect(()=>{if(audioEditorId&&!audioNodesStore.nodes.some(node=>node.id===audioEditorId&&node.projectKey===activeKey))setAudioEditorId(null);},[audioEditorId,audioNodesStore.nodes,activeKey,targetEmail,user?.email]);
  useEffect(()=>{if(timelineEditorId&&!timelineNodesStore.nodes.some(node=>node.id===timelineEditorId&&node.projectKey===activeKey))setTimelineEditorId(null);},[timelineEditorId,timelineNodesStore.nodes,activeKey,targetEmail,user?.email]);
  useEffect(()=>{if(sceneEditorId&&!sceneNodesStore.nodes.some(node=>node.id===sceneEditorId&&node.projectKey===activeKey))setSceneEditorId(null);},[sceneEditorId,sceneNodesStore.nodes,activeKey,targetEmail,user?.email]);
  const previousCanvasContextRef = useRef({ key: activeKey, email: user?.email || "" });
  useEffect(() => {
    activeProjectRef.current = active;
    const next = { key: activeKey, email: user?.email || "" };
    const previous = previousCanvasContextRef.current;
    if (previous.key !== next.key || previous.email !== next.email) {
      previousCanvasContextRef.current = next;
      canvasContextEpochRef.current += 1;
    }
  }, [active, activeKey, user?.email]);

  // 进入空白画布 = 新建项目;选中/拿到真实项目后自动退出该模式
  function startNewProject() {
    imageTextEditor.close();
    resetImportScope();
    setCreatingNew(true);
    setBrowsing(false);
    setActiveKey(null);
    setSelectedId(null);
    setSelectedTextId(null);
    setPendNodes([]);
    setSidebarOpen(false);
  }
  function startWorkflow(key: CanvasWorkflowKey) {
    startNewProject();
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const center = centerScreen();
        if (key === "copy") {
          addTextNodeAtScreen(center.x, center.y, {
            forceNewProject: true,
            title: t("canvas.workflowCopy"),
            prompt: t("canvas.workflowCopyPrompt"),
          });
          return;
        }
        const pend = addPendAtScreen(center.x, center.y, null, false);
        setGenerationMode(
          key === "detail" ? "detail" : key === "views" ? "triptych" : "standard"
        );
        imageDraft.seed(pend.id, { prompt: t(
          key === "detail" ? "canvas.workflowDetailPrompt" : key === "views" ? "canvas.workflowViewsPrompt" : "canvas.workflowHeroPrompt"
        ) }, imageDraftScope(user?.email, targetEmail, null));
        wantFocusPendPrompt.current = true;
      }, 0);
    });
  }
  useEffect(() => {
    if (active) setCreatingNew(false);
  }, [active]);
  function restoreEditTasks() {
    const account = canvasAccountRef.current, project = activeProjectRef.current?.key || null;
    const restored = Array.from(editTaskStateRef.current.values())
      .filter(task => !readOnly && task.account === account && task.project === project && task.workspace === currentWorkspace()).map(task => task.node);
    setPendNodes(nodes => [...nodes.filter(node => !editTaskStateRef.current.has(node.id)), ...restored]);
  }
  useEffect(() => {
    if (!browsing) restoreEditTasks();
  }, [activeKey, active?.key, user?.email, targetEmail, browsing, readOnly, canvasArtworkDocument.scope.workspace]); // eslint-disable-line react-hooks/exhaustive-deps

  // 打开某个画布项目(从网格落地页点卡片)
  function openProject(key: string) {
    imageTextEditor.close();
    resetImportScope();
    setActiveKey(key);
    setSelectedId(null);
    setSelectedTextId(null);
    setPendNodes([]);
    setCreatingNew(false);
    setBrowsing(false);
    setSidebarOpen(false);
    try {
      localStorage.setItem("nv:canvas:last", key);
    } catch {
      /* ignore */
    }
  }
  // 返回项目网格落地页(实际状态切换)
  function doBackToBrowser() {
    imageTextEditor.close();
    resetImportScope();
    setBrowsing(true);
    setSelectedId(null);
    setSelectedTextId(null);
    setCreatingNew(false);
    setPendNodes([]);
    setSidebarOpen(false);
    try {
      localStorage.removeItem("nv:canvas:last");
    } catch {
      /* ignore */
    }
  }
  // 「全部项目」按钮:若进做图页时压过历史,用浏览器后退消费掉它(popstate 里完成回项目页),
  // 保持历史栈一致;否则直接切回网格。
  function backToBrowser() {
    if (editorPushedRef.current && typeof window !== "undefined") {
      window.history.back();
      return;
    }
    doBackToBrowser();
  }

  // popstate 回调只挂一次,闭包里读不到最新 browsing,用 ref 同步。
  useEffect(() => {
    browsingRef.current = browsing;
  }, [browsing]);

  // 进做图页(browsing=false)→ 往历史压一条同 URL 记录,使浏览器「后退」先回项目页;
  // 回到项目页(browsing=true)→ 复位标记。
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!browsing && !editorPushedRef.current) {
      editorPushedRef.current = true;
      window.history.pushState({ nvCanvasEditor: true }, "");
    } else if (browsing) {
      editorPushedRef.current = false;
    }
  }, [browsing]);

  // 后退键:在做图页 → 回项目页(消费掉上面压的记录,停在 /canvas);
  // 已在项目页 → 不拦截,让浏览器正常退回进画布前的上一页。
  useEffect(() => {
    const onPop = () => {
      if (!browsingRef.current) {
        editorPushedRef.current = false;
        doBackToBrowser();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodeDimensions = useCallback((id: string, width: number, height: number) => {
    const w = Math.round(width);
    const h = Math.round(height);
    if (!id || w < 1 || h < 1 || w > 8192 || h > 8192) return;
    setWorks((current) => current?.map((art) =>
      art.id === id && (art.width !== w || art.height !== h)
        ? { ...art, width: w, height: h }
        : art
    ) ?? current);
    if (!user || readOnly || dimensionSyncRef.current.has(id)) return;
    dimensionSyncRef.current.add(id);
    void privateFetchRaw("/api/artworks/dimensions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, width: w, height: h }),
    }).catch(() => dimensionSyncRef.current.delete(id));
  }, [user, readOnly, setWorks]);

  const artworkCommandsRef=useRef({history:canvasHistory,document:canvasArtworkDocument,warning:flashTip,failed:()=>t("canvas.genFail")});artworkCommandsRef.current={history:canvasHistory,document:canvasArtworkDocument,warning:flashTip,failed:()=>t("canvas.genFail")};
  const onArtworkCanvasResize = useCallback((
    id: string,
    bounds: { x: number; y: number; width: number; height: number }
  ) => {
    if (readOnly || nodeSettingsRef.current[id]?.locked) return;
    const x = Math.round(bounds.x);
    const y = Math.round(bounds.y);
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    if (
      !id ||
      width < IMAGE_NODE_MIN_W ||
      height < IMAGE_NODE_MIN_H ||
      width > IMAGE_NODE_MAX_W ||
      height > IMAGE_NODE_MAX_H
    ) return;
    if(!user)return;const {history:historyOwner,document,warning,failed}=artworkCommandsRef.current,scope=historyOwner.scope;
    void historyOwner.submit(scope,()=>{
      const prev=document.getSnapshot().nodes?.find(art=>art.id===id);if(!prev)return null;
      if(prev.canvasX===x&&prev.canvasY===y&&prev.canvasWidth===width&&prev.canvasHeight===height)return null;
      return {kind:"art-size",id,from:{x:prev.canvasX??x,y:prev.canvasY??y,width:prev.canvasWidth??width,height:prev.canvasHeight??height},to:{x,y,width,height},artworkBases:{[id]:artworkFields(prev)}};
    }).catch(error=>{if(scope.viewCurrent())warning(error instanceof Error?error.message:failed());});
  }, [user, readOnly]);

  const onArtworkCanvasRatioRepair = useCallback((id: string, width: number, height: number) => {
    if (readOnly || nodeSettingsRef.current[id]?.locked) return;
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (
      !id ||
      nextWidth < IMAGE_NODE_MIN_W ||
      nextHeight < IMAGE_NODE_MIN_H ||
      nextWidth > IMAGE_NODE_MAX_W ||
      nextHeight > IMAGE_NODE_MAX_H
    ) return;
    if(!user)return;const {history:historyOwner,document,warning,failed}=artworkCommandsRef.current,scope=historyOwner.scope,prev=document.getSnapshot().nodes?.find(art=>art.id===id);if(!prev)return;
    if(prev.canvasWidth===nextWidth&&prev.canvasHeight===nextHeight)return;
    void historyOwner.submit(scope,()=>({kind:"art-dimensions",id,from:{width:prev.canvasWidth??nextWidth,height:prev.canvasHeight??nextHeight},to:{width:nextWidth,height:nextHeight},artworkBases:{[id]:artworkFields(prev)}}),false).catch(error=>{if(scope.viewCurrent())warning(error instanceof Error?error.message:failed());});
  }, [user, readOnly]);

  const requestNodeRename = useCallback((id: string, label: string) => {
    if(readOnly || nodeSettingsRef.current[id]?.locked)return;
    if (readOnly) return;
    setSelectedId(id);
    setSelectedPendId(null);
    setSelectedTextId(null);
    setNodeRenameValue(label);
    setRenamingNodeId(id);
  }, [readOnly,setSelectedId,setSelectedPendId,setSelectedTextId]);

  const extractVideoToCanvas = useCallback((id:string,action:VideoPlayerAction)=>{
    if(readOnly||!user||nodeSettingsRef.current[id]?.locked)return;
    const source=worksRef.current?.find(item=>item.id===id),node=videoNodesStore.getNode(id),project=activeProjectRef.current?.key;
    if(!project||!source?.videoUrl&&!node?.displayResultId&&!node?.lastResultId)return;
    setVideoMedia({id,projectKey:project,initial:action});
  },[readOnly,user,videoNodesStore.getNode]);

  const sceneActions=useCanvasSceneActions({
    dimensions:onNodeDimensions,resize:onArtworkCanvasResize,ratioRepair:onArtworkCanvasRatioRepair,rename:requestNodeRename,
    videoProcess:extractVideoToCanvas,cutout:id=>{const art=worksRef.current?.find(item=>item.id===id);if(art)void runCutout(art);},
    generatePending:id=>{const pend=pendNodesRef.current.find(node=>node.id===id);if(pend)return generatePend({pend});},
    directorEdit:openDirectorEditor,characterEdit:openCharacterEditor,sceneEdit:openSceneEditor,audioEdit:openAudioEditor,timelineEdit:openTimelineEditor,videoEdit:openVideoEditor,videoHistory:setVideoHistoryId,
    videoCancel:id=>{const node=videoNodesStore.nodes.find(node=>node.id===id);if(node?.lastTaskId)void videoTaskStore.cancel(node.lastTaskId).catch(error=>flashTip(error.message));},
    videoPrompt:async(id,prompt)=>{const node=videoNodesStore.nodes.find(node=>node.id===id);if(node)await patchVideoNode(id,{config:{...node.config,prompt}});},
    videoResize:(id,size)=>{void patchVideoNode(id,size).catch(error=>flashTip(error.message));},
    workflowFill:id=>{const art=worksRef.current?.find(item=>item.id===id);if(art)workflowCallbacksRef.current.replace(art);},
    workflowSelect:ids=>workflowCallbacksRef.current.select(ids),
  });
  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!active) return { nodes: [], edges: [] };
    const scope = `naumi:canvas-positions:${JSON.stringify([canvasAccountRef.current, active.key])}`;
    if (artworkPlacementRef.current.scope !== scope) {
      let positions = new Map<string, CanvasPoint>();
      try { positions = readPlacementCache(sessionStorage.getItem(scope)); } catch { /* SSR/private storage */ }
      artworkPlacementRef.current = { scope, positions };
    }
    return layoutGraph(
      active.members,
      t("canvas.rootBadge"),
      sceneActions.dimensions,
      sceneActions.resize,
      sceneActions.ratioRepair,
      sceneActions.rename,
      sceneActions.videoProcess,
      artworkPlacementRef.current.positions
    );
  }, [active,t,sceneActions]);
  useEffect(() => {
    const {scope, positions} = artworkPlacementRef.current;
    if (!scope) return;
    try { sessionStorage.setItem(scope, JSON.stringify(Array.from(positions).slice(-4000))); } catch { /* best effort */ }
  }, [nodes]);

  const videoTaskStore=useVideoTasks({email:targetEmail||user?.email,projectKey:active?.key,readOnly,request:privateFetchRaw,onCompleted:async(task,project)=>{
    const ids=task.resultAssets?.map(asset=>asset.artworkId)||[];if(task.artworkId&&!ids.includes(task.artworkId))ids.unshift(task.artworkId);
    if(activeProjectRef.current?.key!==project)return;
    await videoNodesStore.refresh();
    if(task.sourceId&&videoNodesStore.getNode(task.sourceId)?.deletedAt)return;
    if(ids.length)await mergeWorks(ids);
    if(task.sourceId&&user){const receipt=readVideoReceipt(localStorage,user.email,task.sourceId);if(receipt?.taskId===task.id)clearVideoReceipt(localStorage,user.email,task.sourceId,receipt.idempotencyKey);}
    await refreshCredits();
  }});
  const mediaJobStore=useMediaJobs({email:user?.email,projectKey:active?.key,readOnly,request:privateFetchRaw,onCompleted:async job=>{
    const project=activeProjectRef.current?.key;
    if(!project||job.projectKey!==project||job.source==="workbench")return;
    const ids=job.outputs.map(output=>output.artworkId);if(ids.length)await mergeWorks(ids);
    await refreshCredits();
  }});
  useEffect(()=>{if(videoMedia&&videoMedia.projectKey!==activeKey)setVideoMedia(null);},[activeKey,videoMedia]);
  const audioActions=audioActionsOwner.bind(canvasHistory.scope,{
    english:locale==="en",writable:()=>!!user&&!readOnly,settingsReady:()=>nodeSettingsReady,locked:isNodeLocked,store:audioNodesStore,
    location:(at,id)=>{const box=canvasAreaRef.current?.getBoundingClientRect(),point=rfRef.current?.screenToFlowPosition({x:at.x+(box?.left||0),y:at.y+(box?.top||0)})||{x:0,y:0};return{projectKey:!browsing&&!creatingNew&&activeKey?activeKey:`tree:${id}`,...point};},
    created:node=>{setActiveKey(node.projectKey);setCreatingNew(false);setBrowsing(false);openAudioEditor(node.id);},history:pushUndo,
    upload:(files,project)=>videoAssetStore.upload(files,project),merge:mergeWorks,jobs:mediaJobStore.jobs,refresh:mediaJobStore.refresh,notice:flashTip,
  });
  const timelineActions=timelineActionsOwner.bind(canvasHistory.scope,{
    english:locale==="en",writable:()=>!!user&&!readOnly,settingsReady:()=>nodeSettingsReady,locked:isNodeLocked,store:timelineNodesStore,
    location:(at,id)=>{const box=canvasAreaRef.current?.getBoundingClientRect(),point=rfRef.current?.screenToFlowPosition({x:at.x+(box?.left||0),y:at.y+(box?.top||0)})||{x:0,y:0};return{projectKey:!browsing&&!creatingNew&&activeKey?activeKey:`tree:${id}`,...point};},
    created:node=>{setActiveKey(node.projectKey);setCreatingNew(false);setBrowsing(false);openTimelineEditor(node.id);},history:pushUndo,
    upload:(files,project)=>videoAssetStore.upload(files,project),merge:mergeWorks,jobs:mediaJobStore.jobs,refresh:mediaJobStore.refresh,
  });
  useAudioResultAdoption({commands:audioActions,nodes:audioNodesStore.nodes,jobs:mediaJobStore.jobs,context:canvasHistory.scope.key,readOnly,ready:nodeSettingsReady,settings:nodeSettings});
  const visualReferenceIds=useMemo(()=>new Set([
    ...audioNodesStore.nodes.filter(node=>node.projectKey===activeKey).flatMap(node=>[node.audio.sourceArtworkId,node.audio.adopted?.artworkId]),
    ...timelineNodesStore.nodes.filter(node=>node.projectKey===activeKey).flatMap(node=>[node.adopted?.artworkId,...node.timeline.tracks.flatMap(track=>track.clips.map(clip=>clip.artworkId))]),
    ...characterNodesStore.nodes.filter(node=>node.projectKey===activeKey).flatMap(node=>node.character.appearances.flatMap(appearance=>appearance.referenceArtworkIds)),
    ...sceneNodesStore.nodes.filter(node=>node.projectKey===activeKey).flatMap(node=>node.scene.states.flatMap(state=>state.referenceArtworkIds)),
    ...directorNodesStore.nodes.filter(node=>node.projectKey===activeKey).flatMap(node=>[node.project.panoramaArtworkId,...(node.project.sceneReference?.referenceArtworkIds||[])]),
  ].filter((id):id is string=>!!id)),[activeKey,characterNodesStore.nodes,sceneNodesStore.nodes,audioNodesStore.nodes,timelineNodesStore.nodes,directorNodesStore.nodes]);
  const baseVideoInputChoices:VideoInputChoice[]=useMemo(()=>Array.from(new Map([
    ...Array.from(new Map([...(active?.members||[]),...(works||[]).filter(art=>visualReferenceIds.has(art.id))].map(art=>[art.id,art])).values()).filter(art=>art.category!=="media").map(art=>({id:art.id,nodeId:art.id,kind:art.category==="audio"?"audio" as const:art.videoUrl?"video" as const:"image" as const,title:art.title,value:art.videoUrl||art.image,thumbnail:!art.videoUrl?art.image:undefined,available:art.status==="completed"})),
    ...textNodes.filter(node=>node.projectKey===activeKey).map(node=>({id:node.id,nodeId:node.id,kind:"text" as const,title:node.title,value:node.content||node.prompt||" ",available:node.status!=="generating"})),
    ...videoNodesStore.nodes.filter(node=>node.projectKey===activeKey).map(node=>{const task=videoTaskStore.tasks.find(task=>task.id===node.lastTaskId),art=(works||[]).find(art=>art.id===(node.displayResultId||node.lastResultId));return {id:node.id,nodeId:node.id,kind:"video" as const,title:node.title,value:art?.videoUrl||(!node.displayResultId?task?.videoUrl:undefined)||"/media/pending",available:!!(node.displayResultId||node.lastResultId)&&(art?.status==="completed"||!node.displayResultId&&task?.status==="completed")};}),
    ...videoAssetStore.choices,
  ].map(choice=>[choice.nodeId,choice])).values()),[active,activeKey,textNodes,videoNodesStore.nodes,videoTaskStore.tasks,works,visualReferenceIds,videoAssetStore.choices]);
  const videoInputChoices:VideoInputChoice[]=useMemo(()=>[...baseVideoInputChoices,...characterInputChoices(characterNodesStore.nodes.filter(node=>node.projectKey===activeKey),baseVideoInputChoices),...sceneInputChoices(sceneNodesStore.nodes.filter(node=>node.projectKey===activeKey),baseVideoInputChoices),...audioInputChoices(audioNodesStore.nodes.filter(node=>node.projectKey===activeKey),baseVideoInputChoices),...timelineInputChoices(timelineNodesStore.nodes.filter(node=>node.projectKey===activeKey),baseVideoInputChoices)],[baseVideoInputChoices,characterNodesStore.nodes,sceneNodesStore.nodes,audioNodesStore.nodes,timelineNodesStore.nodes,activeKey]);
  const videoResultLoads=useRef(new Map<string,number>());
  useEffect(()=>{
    if(!user?.email||!activeKey||readOnly)return;
    const account=canvasAccountRef.current,epoch=canvasContextEpochRef.current,known=new Set((works||[]).map(art=>art.id)),now=Date.now();
    const ids=Array.from(new Set([...videoNodesStore.nodes.filter(node=>node.projectKey===activeKey&&!node.deletedAt).map(node=>node.displayResultId||node.lastResultId),...directorNodesStore.nodes.filter(node=>node.projectKey===activeKey).flatMap(node=>node.outputs.map(output=>output.artworkId)),...visualReferenceIds].filter((id):id is string=>!!id&&!known.has(id)))).filter(id=>{const key=JSON.stringify([account,activeKey,id]),last=videoResultLoads.current.get(key)||0;if(now-last<15000)return false;videoResultLoads.current.set(key,now);return true;});
    if(!ids.length)return;
    void (async()=>{for(let offset=0;offset<ids.length;offset+=100){if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;await mergeWorks(ids.slice(offset,offset+100));}})().catch(()=>{});
  },[user?.email,targetEmail,activeKey,readOnly,works,videoNodesStore.nodes,directorNodesStore.nodes,characterNodesStore.nodes,sceneNodesStore.nodes,audioNodesStore.nodes,timelineNodesStore.nodes,visualReferenceIds]);
  const selectedScene=sceneNodesStore.nodes.find(node=>node.id===selectedId&&node.projectKey===activeKey)||null;
  const editingScene=sceneNodesStore.nodes.find(node=>node.id===sceneEditorId&&node.projectKey===activeKey)||null;
  const selectedAudio=audioNodesStore.nodes.find(node=>node.id===selectedId&&node.projectKey===activeKey)||null;
  const selectedTimeline=timelineNodesStore.nodes.find(node=>node.id===selectedId&&node.projectKey===activeKey)||null;
  const editingAudio=audioNodesStore.nodes.find(node=>node.id===audioEditorId&&node.projectKey===activeKey)||null;
  const editingTimeline=timelineNodesStore.nodes.find(node=>node.id===timelineEditorId&&node.projectKey===activeKey)||null;
  const selectedCharacter=characterNodesStore.nodes.find(node=>node.id===selectedId&&node.projectKey===activeKey)||null;
  const editingCharacter=characterNodesStore.nodes.find(node=>node.id===characterEditorId&&node.projectKey===activeKey)||null;
  const selectedDirector=directorNodesStore.nodes.find(node=>node.id===selectedId&&node.projectKey===activeKey)||null;
  const editingDirector=directorNodesStore.nodes.find(node=>node.id===directorEditorId&&node.projectKey===activeKey)||null;
  const selectedVideo=videoNodesStore.nodes.find(node=>node.id===selectedId&&node.projectKey===activeKey&&!node.deletedAt)||null;
  const mixedNativeSelection=multiSel.length>1&&(multiSel.some(id=>videoNodesStore.getNode(id)||directorNodesStore.getNode(id)||characterNodesStore.getNode(id)||sceneNodesStore.getNode(id)||audioNodesStore.getNode(id)||timelineNodesStore.getNode(id))||multiSel.some(id=>textNodesRef.current.some(node=>node.id===id))&&multiSel.some(id=>!textNodesRef.current.some(node=>node.id===id)));
  const selected = useMemo(
    () => active?.members.find((a) => a.id === selectedId) ?? null,
    [active, selectedId]
  );

  // 页面刷新/关闭后恢复画布视频任务：运行中恢复占位节点，后台完成后自动并回作品树。
  useEffect(() => {
    if (!user || !active) return;
    const projectKey = active.key;
    let stopped = false;
    let timer: number | null = null;
    const sync = async () => {
      try {
        const project = activeProjectRef.current;
        if (!project || project.key !== projectKey) return;
        const sourceIds = project.members.map((item) => item.id);
        const sourceIdChunks = Array.from(
          { length: Math.max(1, Math.ceil(sourceIds.length / 80)) },
          (_, index) => sourceIds.slice(index * 80, index * 80 + 80)
        );
        const responses = await Promise.all(sourceIdChunks.map((chunk) =>
          privateFetchRaw(`/api/video/tasks?source=canvas&limit=500&sourceIds=${encodeURIComponent(chunk.join(","))}`)
        ));
        if (stopped) return;
        if (responses.some((response) => !response.ok)) throw new Error("视频任务查询失败");
        const payloads = await Promise.all(responses.map((response) => readJsonSafe(response)));
        if (stopped) return;
        const currentProject = activeProjectRef.current;
        if (!currentProject || currentProject.key !== projectKey) return;
        const tasks = payloads.flatMap((data) => Array.isArray(data?.tasks) ? data.tasks : []) as Array<{
          id: string; source?: string; sourceId?: string; status: string; progress?: number; artworkId?: string; prompt?: string; error?: string;
        }>;
        const memberIds = new Set(currentProject.members.map((item) => item.id));
        const relevant = tasks.filter((task) => task.source === "canvas" && task.sourceId && memberIds.has(task.sourceId));
        if (stopped) return;
        const runningIds = new Set(relevant.filter((task) => task.status === "processing" || task.status === "queued").map((task) => task.id));
        const attentionIds = new Set(relevant.filter((task) => task.status === "needs_attention").map((task) => task.id));
        const terminalIds = new Set(relevant.filter((task) => task.status === "completed" || task.status === "failed").map((task) => task.id));
        setPendNodes((items) => {
          const progressByTask = new Map(relevant.filter((task) => runningIds.has(task.id)).map((task) => [task.id, Math.max(5, Math.min(95, Number(task.progress || 0)))]));
          const kept = items
            .filter((item) => item.taskKind !== "video" || !item.taskId || !terminalIds.has(item.taskId))
            .map((item) => {
              if (item.taskKind !== "video" || !item.taskId) return item;
              if (attentionIds.has(item.taskId)) {
                return {
                  ...item,
                  label: t("canvas.videoNeedsAttention"),
                  generating: false,
                  progress: 0,
                  needsAttention: true,
                  attentionTitle: t("canvas.videoNeedsAttention"),
                  attentionHint: t("canvas.videoNeedsAttentionHint"),
                  attentionAction: t("canvas.videoOpenTasks"),
                  attentionHref: "/video",
                };
              }
              return progressByTask.has(item.taskId)
                ? {
                    ...item,
                    progress: progressByTask.get(item.taskId) as number,
                    generating: true,
                    needsAttention: false,
                  }
                : item;
            });
          const known = new Set(kept.filter((item) => item.taskKind === "video").map((item) => item.taskId).filter(Boolean));
          for (const task of relevant) {
            if ((!runningIds.has(task.id) && !attentionIds.has(task.id)) || known.has(task.id)) continue;
            const source = currentProject.members.find((item) => item.id === task.sourceId);
            const sourceNode = source ? rfRef.current?.getNode(source.id) : null;
            const size = sourceNode && source ? flowNodeSize(sourceNode) : source ? artworkNodeSize(source) : { width: NODE_W, height: NODE_H };
            kept.push({
              id: `pend-video-task-${task.id}`,
              taskId: task.id,
              taskKind: "video",
              x: (sourceNode?.position.x ?? source?.canvasX ?? 0) + size.width + X_GAP,
              y: sourceNode?.position.y ?? source?.canvasY ?? 0,
              parentId: task.sourceId || null,
              linked: true,
              label: attentionIds.has(task.id)
                ? t("canvas.videoNeedsAttention")
                : task.prompt ? `视频生成中 · ${task.prompt.slice(0, 18)}` : "视频生成中",
              uploading: false,
              progress: attentionIds.has(task.id) ? 0 : Math.max(5, Math.min(95, Number(task.progress || 0))),
              inputs: task.sourceId ? [task.sourceId] : [],
              generating: !attentionIds.has(task.id),
              needsAttention: attentionIds.has(task.id),
              attentionTitle: t("canvas.videoNeedsAttention"),
              attentionHint: t("canvas.videoNeedsAttentionHint"),
              attentionAction: t("canvas.videoOpenTasks"),
              attentionHref: "/video",
            });
          }
          return kept;
        });
        const completed = relevant.filter((task) =>
          task.status === "completed" &&
          task.artworkId &&
          !memberIds.has(task.artworkId) &&
          !settledCanvasVideoTaskRef.current.has(task.id)
        );
        for (const task of completed) {
          if (stopped) return;
          const source = currentProject.members.find((item) => item.id === task.sourceId);
          const sourceNode = source ? rfRef.current?.getNode(source.id) : null;
          const size = sourceNode && source ? flowNodeSize(sourceNode) : source ? artworkNodeSize(source) : { width: NODE_W, height: NODE_H };
          const positionResponse = await privateFetchRaw("/api/artworks/position", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mode: "initialize",
              id: task.artworkId,
              x: Math.round((sourceNode?.position.x ?? source?.canvasX ?? 0) + size.width + X_GAP),
              y: Math.round(sourceNode?.position.y ?? source?.canvasY ?? 0),
            }),
          });
          if (stopped) return;
          if (!positionResponse.ok) throw new Error("视频结果定位失败");
          const fresh = await mergeWorks([task.artworkId as string]);
          if (stopped) return;
          if (fresh.some((item) => item.id === task.artworkId)) {
            settledCanvasVideoTaskRef.current.add(task.id);
            await refreshCredits();
            if (stopped) return;
          }
        }
        for (const task of relevant) {
          if (task.status !== "failed" || failedCanvasVideoTaskRef.current.has(task.id)) continue;
          failedCanvasVideoTaskRef.current.add(task.id);
          await refreshCredits();
          if (stopped) return;
          flashTip(task.error || "视频生成失败，积分已退回");
        }
        if (!stopped) timer = window.setTimeout(sync, runningIds.size ? 8000 : 15000);
      } catch {
        if (!stopped) timer = window.setTimeout(sync, 12000);
      }
    };
    void sync();
    return () => {
      stopped = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [user?.email, active?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // The owner observes the existing durable tasks; opening/closing OCR does not restart its task identity.
  useEffect(()=>{
    if(!user||!active||persistMode!=="server")return;
    return imageTextEditor.follow(canvasImageTextContext());
  },[user?.email,active?.key,persistMode,canvasImageTaskRefreshKey,canvasArtworkDocument.scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedBatchArts = useMemo(() => {
    if (!active || multiSel.length < 2) return [];
    const byId = new Map(active.members.map((art) => [art.id, art]));
    const positions = new Map(
      (rfRef.current?.getNodes() ?? []).map((node) => [node.id, node.position])
    );
    return multiSel
      .map((id) => byId.get(id))
      .filter((art): art is Artwork => !!art && !["workflow-decoration","workflow-placeholder"].includes(art.source || "") && hasRenderableImage(art.image))
      .sort((a, b) => {
        const ap = positions.get(a.id) ?? { x: a.canvasX ?? 0, y: a.canvasY ?? 0 };
        const bp = positions.get(b.id) ?? { x: b.canvasX ?? 0, y: b.canvasY ?? 0 };
        return Math.abs(ap.y - bp.y) > 24 ? ap.y - bp.y : ap.x - bp.x;
      });
  }, [active, multiSel]);
  const selectedBatchIds = useMemo(
    () => selectedBatchArts.map((art) => art.id),
    [selectedBatchArts]
  );
  const selectedBatchAllMarked =
    selectedBatchArts.length > 0 && selectedBatchArts.every((art) => art.marked);
  const selectedBatchCanvasGroupId = useMemo(() => {
    if (selectedBatchArts.length < 2) return null;
    const ids = new Set(selectedBatchArts.map((art) => art.canvasGroupId).filter(Boolean));
    return ids.size === 1 && selectedBatchArts.every((art) => art.canvasGroupId)
      ? (Array.from(ids)[0] as string)
      : null;
  }, [selectedBatchArts]);
  // 框选里的文字节点(竞品链路的批量入口):反推结果的批量帮写、批量生成图片
  const selectedTextBatchNodes = useMemo(() => {
    const byId = new Map(textNodes.map((node) => [node.id, node]));
    return multiSel
      .map((id) => byId.get(id))
      .filter(
        (node): node is CanvasTextNode =>
          !!node && (!activeKey || node.projectKey === activeKey)
      );
  }, [multiSel, textNodes, activeKey]);
  selectedIdRef.current = selectedId;

  const selectedGenerating = !!selectedId &&
    generationTasks.some(
      (task) => !task.failure && (task.isVisible?.() ?? true) && (
        task.sourceId === selectedId ||
        task.operationKey === `node:${selectedId}` ||
        task.operationKey === `retry:${selectedId}`)
    ) || (!!selectedId && pendNodes.some(node => node.generating && !node.generationFailure && node.parentId === selectedId));
  const selectedGenerationFailure = generationTasks.find(task => task.failure && task.sourceId === selectedId && (task.isVisible?.() ?? true))?.failure
    || pendNodes.find(node => node.generationFailure && node.parentId === selectedId)?.generationFailure;
  const selectedGenerationRetry = generationTasks.find(task => task.failure && task.sourceId === selectedId && (task.isVisible?.() ?? true))?.onRetry
    || pendNodes.find(node => node.generationFailure && node.parentId === selectedId)?.onGenerationRetry;
  // dock 显示显式连线输入和当前节点；隐藏的项目父节点不自动成为参考图。
  // “重做”生成同级新版本，但仍只使用创作栏中当前可见的图片，不暗加历史输入。
  const dockReferenceState = useMemo(() => {
    try { return { references: generationMode==="standard"?canvasRegenerationReferences(selected,active?.members??[]):canvasGenerationReferences(selected,active?.members??[]), error: "" }; }
    catch(error) { return { references: [], error: error instanceof Error ? error.message : "参考图尚未同步" }; }
  }, [selected, active?.members,generationMode]);
  const dockRefs = dockReferenceState.references;
  // 用户可在 dock 里"×"掉自动引用图(改用自己上传的);hiddenRefIds 随选中切换清空
  const [hiddenRefIds, setHiddenRefIds] = useState<string[]>([]);
  const hiddenReferenceOwner = useRef<string | null>(null);
  const visibleDockRefs = useMemo(
    () => dockRefs.filter((r) => hiddenReferenceOwner.current !== imageDraft.key || !hiddenRefIds.includes(r.id)),
    [dockRefs, hiddenRefIds, imageDraft.key]
  );
  const selectedPend = useMemo(
    () => pendNodes.find((p) => p.id === selectedPendId) ?? null,
    [pendNodes, selectedPendId]
  );
  const selectedText = useMemo(
    () => textNodes.find((node) => node.id === selectedTextId) ?? null,
    [textNodes, selectedTextId]
  );
  // Prompt remains the input to the existing task owner; resize and picker
  // state belong to the selected text composer, not the canvas document.
  useEffect(() => {
    setTextComposerExpanded(false);
    setTextPrompt(selectedText?.content || selectedText?.prompt || "");
  }, [selectedTextId, selectedText?.content, selectedText?.prompt]);
  const selectedPendGenerating = !!selectedPend?.generating;
  // 选中空白节点时的输入图(参考图)
  const pendInputArts = useMemo(
    () =>
      (selectedPend?.inputs ?? [])
        .map((id) => active?.members.find((m) => m.id === id))
        .filter(Boolean) as Artwork[],
    [selectedPend, active]
  );

  const imageReferenceState = useMemo(() => {
    const arts = selectedPend ? pendInputArts : visibleDockRefs;
    const candidates: ImageReferenceCandidate[] = arts.map(art => ({ key: `node:${art.id}`, sourceNodeId: art.id, title: art.title || L("图片节点", "Image node"), url: art.image }));
    if (!selectedPend && extraReferenceOwner.current === imageDraft.key) extraFiles.forEach((file, index) => {
      const key = extraReferenceKeys.current.get(file);
      if (key) candidates.push({ key, title: file.name, url: extraPreviews[index] || "", file });
    });
    return resolveCanvasImageReferences(candidates, imageDraft.referenceBindings);
  }, [selectedPend, pendInputArts, visibleDockRefs, extraFiles, extraPreviews, imageDraft.referenceBindings, imageDraft.key]);
  const composerReferences = imageReferenceState.references;
  useEffect(() => {
    if (JSON.stringify(imageReferenceState.bindings) !== JSON.stringify(imageDraft.referenceBindings || [])) imageDraft.setReferenceBindings(imageReferenceState.bindings);
  }, [imageDraft.key, imageReferenceState.bindings, imageDraft.referenceBindings]);
  const referenceError = referenceManifestError(editPrompt, imageReferenceManifest(composerReferences));
  function removeComposerReference(ref: CanvasImageReference) {
    if (selectedPend) setPendNodes(nodes => nodes.map(node => node.id === selectedPend.id ? { ...node, inputs: node.inputs.filter(id => id !== ref.sourceNodeId) } : node));
    else if (ref.file) removeExtra(extraFiles.indexOf(ref.file));
    else if (ref.sourceNodeId) { hiddenReferenceOwner.current=imageDraft.key; setHiddenRefIds(ids => [...ids, ref.sourceNodeId!]); }
  }
  function locateComposerReference(id: string) {
    void rfRef.current?.fitView({ nodes: [{ id }], padding: 0.8, duration: 240, maxZoom: 1 });
  }
  const appendComposerReferences = appendCanvasImageReferences;

  // 生成中:在选中节点下方临时插入"生成中"占位节点;
  // 选中时:整条血缘链路点亮(蓝色流光),其余节点/连线变暗。
  const {displayNodes,displayEdges}=useMemo(()=>projectCanvasScene({nodes,edges,active,activeKey,generationTasks:generationTasks.filter(task=>canvasArtworkDocument.scope.viewCurrent()&&(task.isVisible?.()??true)),taskPositions:generationTaskPosRef.current,
    pendNodes,textNodes,videoNodes:videoNodesStore.nodes,directorNodes:directorNodesStore.nodes,characterNodes:characterNodesStore.nodes,sceneNodes:sceneNodesStore.nodes,audioNodes:audioNodesStore.nodes,timelineNodes:timelineNodesStore.nodes,videoTasks:videoTaskStore.tasks,works,selectedId,selectedPendId,selectedTextId,multiSel,expandedTextIds,
    locale,lightCanvas,nodeSettings,nodeSettingsReady,readOnly,cutoutAvailable:!!cutoutCatalog&&!cutoutCatalogError&&cutoutCatalog.available!==false,
    operations:generationOperationRef.current,workflowManifests,actions:sceneActions}),
    [nodes,edges,active,activeKey,generationTasks,pendNodes,textNodes,videoNodesStore.nodes,directorNodesStore.nodes,characterNodesStore.nodes,sceneNodesStore.nodes,audioNodesStore.nodes,timelineNodesStore.nodes,videoTaskStore.tasks,works,selectedId,selectedPendId,selectedTextId,multiSel,expandedTextIds,
      locale,lightCanvas,nodeSettings,nodeSettingsReady,readOnly,cutoutCatalog,cutoutCatalogError,workflowManifests,sceneActions,canvasArtworkDocument.scope]);
  const {rfNodes,setRfNodes,onNodesChange,rfEdges,setRfEdges,onEdgesChange,holdPositions}=useCanvasScene(displayNodes,displayEdges,canvasArtworkDocument.scope);
  useEffect(()=>{
    const pending=pendingNodeSelectionRef.current;if(!pending)return;
    if(pending.owner!==user?.email.toLowerCase()){pendingNodeSelectionRef.current=null;return;}
    if(pending.projectKey!==activeKey||!pending.ids.every(id=>rfNodes.some(node=>node.id===id)))return;
    pendingNodeSelectionRef.current=null;const ids=new Set(pending.ids);setRfNodes(current=>current.map(node=>({...node,selected:ids.has(node.id)})));
  },[rfNodes,activeKey,user?.email,setRfNodes]);

  function selectWorkflowGroup(ids: string[]) {
    setSelectedId(null); setSelectedTextId(null); setSelectedPendId(null);
    setRfNodes(current => current.map(node => ({ ...node, selected: ids.includes(node.id) })));
    setMultiSel(ids);
  }
  function clearCanvasSelection(exitBoxMode = false) {
    setMultiSel([]);
    setSelectedEdge(null);
    setRfEdges(current => current.map(edge => edge.selected ? { ...edge, selected: false } : edge));
    setRfNodes((current) =>
      current.map((node) => (node.selected ? { ...node, selected: false } : node))
    );
    if (exitBoxMode) viewControls.selectTool("move");
  }

  useEffect(() => {
    setSelectedEdge(null);
    setRfEdges(current => current.map(edge => edge.selected ? { ...edge, selected: false } : edge));
  }, [activeKey, user?.email, setRfEdges, setSelectedEdge]);

  function applyArtworkSelection(ids: string[]) {
    const kinds=new Map<string,"art"|"text"|"video"|"director"|"character"|"scene"|"audio"|"timeline">([
      ...(active?.members||[]).map(node=>[node.id,"art"] as const),
      ...videoNodesStore.nodes.filter(node=>node.projectKey===activeKey).map(node=>[node.id,"video"] as const),
      ...directorNodesStore.nodes.filter(node=>node.projectKey===activeKey).map(node=>[node.id,"director"] as const),
      ...characterNodesStore.nodes.filter(node=>node.projectKey===activeKey).map(node=>[node.id,"character"] as const),
      ...sceneNodesStore.nodes.filter(node=>node.projectKey===activeKey).map(node=>[node.id,"scene"] as const),
      ...audioNodesStore.nodes.filter(node=>node.projectKey===activeKey).map(node=>[node.id,"audio"] as const),
      ...timelineNodesStore.nodes.filter(node=>node.projectKey===activeKey).map(node=>[node.id,"timeline"] as const),
      ...textNodesRef.current.filter(node=>node.projectKey===activeKey).map(node=>[node.id,"text"] as const),
    ]);
    const patch=canvasSelectionIds(ids,kinds),valid=new Set(patch.multiSel);
    canvasSelection.patch(patch);
    setRfEdges(current=>current.map(edge=>edge.selected?{...edge,selected:false}:edge));
    setRfNodes(current=>current.map(node=>({...node,selected:valid.has(node.id)})));
  }

  function toggleArtworkBatchSelection(nodeId: string, base = multiSel) {
    const next = new Set(base);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    applyArtworkSelection(Array.from(next));
  }

  // Geometry is shared by render and live gestures; docks follow every transform without rerendering the editor.
  function selectedNodeScreen(vp: {x:number;y:number;zoom:number}):NodeScreen|undefined {
    const anchorId=selectedId??selectedPendId??selectedTextId;
    const node=anchorId?rfNodes.find(n=>n.id===anchorId):undefined;
    if(!node)return undefined;
    const z=vp.zoom||1,size=flowNodeSize(node),left=node.position.x*z+vp.x,top=node.position.y*z+vp.y;
    return {left,top,bottom:top+size.height*z,cx:left+size.width*z/2};
  }
  const nodeScreen=selectedNodeScreen(viewportRef.current);
  const overlaySafeArea=useMemo(()=>canvasOverlaySafeArea(canvasSize),[canvasSize.width]);
  const {dock:dockStyle,toolbar:topbarStyle}=canvasDockLayout({nodeScreen,canvasSize,dockMetrics,selectedTextId,textComposerExpanded,readOnly,nodeTitleHeight:selectedVideo||selected?.videoUrl?38:0});

  // 窗口缩放、分屏、旋转或切换选中节点时，React Flow 会保留旧 viewport，可能让
  // 新锚点留在安全区外。尺寸或锚点变化时做最小平移；拖动同一节点不会触发，
  // 因而不改变缩放、不修改持久化坐标，也不和正常拖动竞争。
  useEffect(() => {
    // 右键菜单按点击位置固定；自动锚点平移不应立即关闭刚打开的菜单。
    if (ctxMenu) return;
    const anchorId = selectedId ?? selectedPendId ?? selectedTextId;
    const previous = previousCanvasSizeRef.current;
    const previousAnchor = previousViewportAnchorRef.current;
    previousCanvasSizeRef.current = canvasSize;
    previousViewportAnchorRef.current = anchorId;
    const canvasChanged =
      Math.abs(previous.width - canvasSize.width) >= 1 ||
      Math.abs(previous.height - canvasSize.height) >= 1;
    const anchorChanged = previousAnchor !== anchorId;
    if (
      !canvasSize.width ||
      !canvasSize.height ||
      (!canvasChanged && !anchorChanged)
    ) {
      return;
    }
    const instance = rfRef.current;
    const selectedNode = anchorId ? rfNodes.find((node) => node.id === anchorId) : null;
    if (!instance || !selectedNode) return;

    const current = instance.getViewport();
    const size = flowNodeSize(selectedNode);
    const left = selectedNode.position.x * current.zoom + current.x;
    const top = selectedNode.position.y * current.zoom + current.y;
    const right = left + size.width * current.zoom;
    const bottom = top + size.height * current.zoom;
    const safeLeft = overlaySafeArea.left;
    const safeRight = canvasSize.width - overlaySafeArea.right;
    const defaultSafeTop = overlaySafeArea.top + 58;
    // 左下工具条只占画布左侧约 224px。节点本身不与它横向相交时，无需无条件
    // 扣掉 72px；否则低高度窗口会把节点过度上推，令上置 Dock 覆盖工具条和节点。
    const nodeIntersectsViewToolbar = left <= 224 && right >= overlaySafeArea.left;
    const safeBottom =
      canvasSize.height -
      (nodeIntersectsViewToolbar ? overlaySafeArea.bottom : overlaySafeArea.right);
    const estimatedDockHeight = selectedTextId
      ? canvasSize.width < 480
        ? 240
        : 218
      : 220;
    const stackedSafeTop = overlaySafeArea.top + estimatedDockHeight + 70 + (selectedVideo ? 38 : 0);

    let dx = 0;
    let dy = 0;
    const visibleWidth = safeRight - safeLeft;
    const nodeWidth = right - left;
    const nodeHeight = bottom - top;
    const safeTop =
      safeBottom - stackedSafeTop >= nodeHeight ? stackedSafeTop : defaultSafeTop;
    const visibleHeight = safeBottom - safeTop;
    if (nodeWidth > visibleWidth) {
      dx = safeLeft + (visibleWidth - nodeWidth) / 2 - left;
    } else if (left < safeLeft) {
      dx = safeLeft - left;
    } else if (right > safeRight) {
      dx = safeRight - right;
    }
    if (nodeHeight > visibleHeight) {
      dy = safeTop + (visibleHeight - nodeHeight) / 2 - top;
    } else if (top < safeTop) {
      dy = safeTop - top;
    } else if (bottom > safeBottom) {
      dy = safeBottom - bottom;
    }
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    void instance.setViewport(
      { x: current.x + dx, y: current.y + dy, zoom: current.zoom },
      { duration: 180 }
    );
  }, [
    canvasSize,
    overlaySafeArea,
    rfNodes,
    selectedId,
    selectedPendId,
    selectedTextId,
    ctxMenu,
  ]);

  // scrollbars, zoom and selection changes all share the same collision resolver.
  const docksReady = !!dockStyle && !!topbarStyle;
  useLayoutEffect(() => {
    if (!docksReady) return;
    const dock = selectedTextId ? textComposerDockRef.current : panelRef.current;
    const toolbar = nodeToolbarRef.current;
    if (!dock || !toolbar) return;
    const measure = () => setDockMetrics((previous) => {
      const next = { dockHeight: dock.offsetHeight, toolbarHeight: toolbar.offsetHeight, toolbarWidth: toolbar.offsetWidth };
      return previous.dockHeight === next.dockHeight && previous.toolbarHeight === next.toolbarHeight && previous.toolbarWidth === next.toolbarWidth ? previous : next;
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [docksReady, canvasSize.width, canvasSize.height, selectedId, selectedPendId, selectedTextId, selectedBatchArts.length, selectedTextBatchNodes.length, readOnly, browsing, textComposerExpanded]);

  function updateLiveViewport(vp:{x:number;y:number;zoom:number}) {
    viewControls.syncZoom(vp.zoom);
    const screen=selectedNodeScreen(vp);
    if(!screen)return;
    const layout=canvasDockLayout({nodeScreen:screen,canvasSize,dockMetrics,selectedTextId,textComposerExpanded,readOnly,nodeTitleHeight:selectedVideo||selected?.videoUrl?38:0});
    const dock=selectedTextId?textComposerDockRef.current:panelRef.current;
    if(dock&&layout.dock){
      if(!(textComposerExpanded&&selectedTextId))dock.style.left=layout.dock.left+'px';
      dock.style.top=layout.dock.top+'px';
      dock.style.maxHeight=layout.dock.maxHeight==null?'':layout.dock.maxHeight+'px';
      if(selectedTextId)dock.style.minHeight=Math.min(218,layout.dock.maxHeight??218)+'px';
    }
    if(nodeToolbarRef.current&&layout.toolbar){nodeToolbarRef.current.style.left=layout.toolbar.left+'px';nodeToolbarRef.current.style.top=layout.toolbar.top+'px';}
    if(nodeRenamePositionRef.current){nodeRenamePositionRef.current.style.left=screen.cx+'px';nodeRenamePositionRef.current.style.top=Math.max(8,screen.top-40)+'px';}
  }

  // 重命名节点:本地改标题 + 落库(节点标签 = 作品 title)
  async function saveNodeRename() {
    const id = renamingNodeId;
    const name = nodeRenameValue.trim();
    setRenamingNodeId(null);
    if (!id || !user || readOnly || !name || isNodeLocked(id)) return;
    const character=characterNodesStore.getNode(id);if(character){if(character.title!==name)try{await patchCharacterNode(id,{title:name,character:{...character.character,name}});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const audio=audioNodesStore.getNode(id);if(audio){if(audio.title!==name)try{await patchAudioNode(id,{title:name});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const timeline=timelineNodesStore.getNode(id);if(timeline){if(timeline.title!==name)try{await patchTimelineNode(id,{title:name});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const scene=sceneNodesStore.getNode(id);if(scene){if(scene.title!==name)try{await patchSceneNode(id,{title:name,scene:{...scene.scene,name}});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const director=directorNodesStore.getNode(id);if(director){if(director.title!==name)try{await patchDirectorNode(id,{title:name,project:{...director.project,name}});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const videoNode=videoNodesStore.getNode(id);
    if(videoNode){if(videoNode.title!==name)try{await patchVideoNode(id,{title:name});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const textNode = textNodes.find((node) => node.id === id);
    if (textNode) {
      if (textNode.title === name) return;
      const updated = {
        ...textNode,
        title: name,
        updatedAt: new Date().toISOString(),
      };
      pushUndo({
        kind: "text-patch",
        id,
        from: textPatchOf(textNode),
        to: textPatchOf(updated),
      });
      setTextNodes((current) =>
        current.map((node) => (node.id === id ? updated : node))
      );
      try {
        await persistTextNode(updated);
      } catch (error) {
        setTextNodes((current) =>
          current.map((node) => (node.id === id ? textNode : node))
        );
        flashTip(error instanceof Error ? error.message : t("canvas.genFail"));
      }
      return;
    }
    const scope=canvasHistory.scope;
    try{await canvasHistory.submit(scope,()=>{const cur=canvasArtworkDocument.getSnapshot().nodes?.find(w=>w.id===id);return cur&&cur.title!==name?{kind:"rename",id,from:cur.title,to:name}:null;});}
    catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }

  async function renameGeneratedArtwork(id:string,title:string){
    if(!user||!title.trim())return;const cur=canvasArtworkDocument.getSnapshot().nodes?.find(w=>w.id===id);if(!cur||cur.title===title.trim())return;
    const scope=canvasHistory.scope;try{await canvasHistory.submit(scope,()=>({kind:"rename",id,from:cur.title,to:title.trim().slice(0,80)}),false);}catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }

  async function toggleNodeMark(){
    if(!selected||!user||readOnly)return;const id=selected.id,scope=canvasHistory.scope;
    try{await canvasHistory.submit(scope,()=>{const cur=canvasArtworkDocument.getSnapshot().nodes?.find(w=>w.id===id);return cur?{kind:"mark",changes:[{id,from:!!cur.marked,to:!cur.marked}]}:null;});}
    catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }

  // Prompt/ratio are synchronously node-scoped drafts. Only ephemeral dock UI
  // resets on selection; never overwrite unsent text with artwork metadata.
  useEffect(() => {
    setGenStyle(selected?.style || GENERATION_STYLES[0]);
    // Blank-node creation/workflows set their mode explicitly in the event.
    if (selected?.id) setGenerationMode("standard");
    setGenError(null);
    setExtraFiles([]);
    setExtraPreviews(urls => { urls.forEach(url => URL.revokeObjectURL(url)); return []; });
    setHiddenRefIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDraft.key, selected?.id, selectedPendId, activeKey, readOnly]);

  useEffect(() => { setGenError(null); }, [selectedPendId]);

  // 拉线「生成衍生图」建好空白节点后:把光标落进提示词框,引导用户写改动
  useEffect(() => {
    if (!wantFocusPendPrompt.current || !selectedPendId) return;
    wantFocusPendPrompt.current = false;
    const raf = requestAnimationFrame(() => pendPromptRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [selectedPendId]);


  // Document owner keeps read state, merge order and the current graph together.
  function refetchWorks(isCurrent:()=>boolean=()=>true):Promise<Artwork[]> { return canvasArtworkDocument.refresh(isCurrent); }
  function mergeWorks(ids:string[],isCurrent:()=>boolean=()=>true):Promise<Artwork[]> { return canvasArtworkDocument.merge(ids,isCurrent); }
  function removeWorksLocal(ids:string[]):Artwork[] { return canvasArtworkDocument.remove(ids); }

  // ── 回收站 ──
  async function openTrash() {
    setSidebarOpen(false);setTrashOpen(true);await canvasArtworkDocument.loadTrash();
  }
  async function trashAction(action:"restore"|"purge",ids:string[]) {
    try{await canvasArtworkDocument.trashAction(action,ids);}
    catch(error){if(canvasArtworkDocument.scope.documentCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }

  // 生成核心:以某节点为底图(图生图)+ 提示词 → 新图作为其子节点。
  function reserveGenerationPosition(taskId: string, preferred: CanvasPoint, size: {width:number;height:number}, existing?: CanvasPoint) {
    const occupied = (rfRef.current?.getNodes() ?? rfNodes).map(node => ({ ...node.position, ...flowNodeSize(node) }));
    for (const [id, position] of Object.entries(generationTaskPosRef.current)) {
      occupied.push({ ...position, ...(generationTaskSizeRef.current[id] ?? generationPlaceholderSize("auto")) });
    }
    const position = generationPositionForTask(existing, preferred, size, occupied);
    generationTaskSizeRef.current[taskId] = size;
    generationTaskPosRef.current[taskId] = position;
    return position;
  }

  function livePendingPosition(id: string, fallback: CanvasPoint): CanvasPoint {
    const pending = pendNodesRef.current.find(node => node.id === id);
    return rfRef.current?.getNode(id)?.position ?? (pending ? {x:pending.x,y:pending.y} : fallback);
  }

  function rememberGenerationDrag(id: string, position: CanvasPoint, saveReceipt = false, operationKey?: string) {
    const task = generationTasks.find(task => task.id === id);
    if (id.startsWith("task-")) generationTaskPosRef.current[id] = { ...position };
    else if (id.startsWith("pend-")) pendNodesRef.current = pendNodesRef.current.map(node => node.id === id ? { ...node, ...position } : node);
    const retained = editTaskStateRef.current.get(id);
    if (retained) editTaskStateRef.current.set(id, { ...retained, node: { ...retained.node, ...position } });
  }

  async function runGen(
    source: Artwork,
    prompt: string,
    opts?: CanvasImageGenerationOptions
  ): Promise<GeneratedResult[]> {
    if (readOnly || !user || isNodeLocked(source.id)) return [];
    const text = prompt.trim();
    if (!text && !opts?.ratiogen) return []; // 改比例可无提示词(服务端用固定重构图指令)
    const requestedCount = opts?.ratiogen ? 1 : Math.max(1, opts?.count ?? 1);
    const operationKey = opts?.operationKey ?? `node:${source.id}`;
    if (generationOperationRef.current.has(operationKey)) return [];
    generationOperationRef.current.add(operationKey);
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sourceNode = rfRef.current?.getNode(source.id) ?? rfNodes.find((node) => node.id === source.id);
    const siblingTaskCount = generationTasks.filter(
      (task) => task.sourceId === source.id
    ).length;
    const sourceSize = flowNodeSize(sourceNode);
    const previewSize = generationPlaceholderSize(opts?.ratio || source.ratio);
    const preferredPosition = sourceNode
      ? {
          x: sourceNode.position.x + sourceSize.width + X_GAP,
          y:
            sourceNode.position.y +
            (opts?.taskOffset ?? siblingTaskCount) * (previewSize.height + NODE_LABEL_H + 24),
        }
      : { x: 0, y: 0 };
    const replacedFailures = generationTasks.filter(task => task.operationKey === operationKey && task.failure);
    const lastFailure = replacedFailures[replacedFailures.length - 1];
    const retryPosition = lastFailure ? generationTaskPosRef.current[lastFailure.id] || lastFailure.position : undefined;
    for (const failed of replacedFailures) { delete generationTaskPosRef.current[failed.id]; delete generationTaskSizeRef.current[failed.id]; }
    const taskPosition = opts?.replaceNode ? sourceNode?.position||{x:source.canvasX||0,y:source.canvasY||0} : reserveGenerationPosition(taskId, preferredPosition, previewSize, retryPosition);
    setGenerationTasks((current) => [
      ...current.filter(task => !(task.operationKey === operationKey && task.failure)),
      {
        id: taskId,
        operationKey,
        sourceId: source.id,replaceNode:opts?.replaceNode,
        label: opts?.taskLabel || t("canvas.pending"),
        stage: "preparing", startedAt: Date.now(), previewSize, count: requestedCount,
        position: taskPosition,
      },
    ]);
    setGenError(null);
    const requestAccount=canvasAccountRef.current,requestProject=activeProjectRef.current?.key||null,requestEpoch=canvasContextEpochRef.current;
    const scope=captureCanvasImageTaskScope(user.email,requestProject,()=>batchRunMountedRef.current&&requestAccount===canvasAccountRef.current&&requestProject===(activeProjectRef.current?.key||null)&&requestEpoch===canvasContextEpochRef.current&&(opts?.isCurrent?.()??true));
    const task=createCanvasImageTask({scope,replacement:opts?.replaceNode?{nodeId:source.id,history:pushUndo}:undefined,
      prepare:()=>prepareCanvasImageTask({kind:"derived",scope,operationKey,position:taskPosition,prompt:text,source,options:opts||{},models:imageModels,model:genModel,quality:genQuality,referenceInputs:opts?.referenceInputs}),
      submit:async(form,isCurrent)=>privateFetch("/api/generate-image",{method:"POST",headers:await authHeader(),body:form,isCurrent}),
      position:()=>generationTaskPosRef.current[taskId]??taskPosition,
      merge:mergeWorks,history:pushAddUndoMany,
      stage:stage=>setGenerationTasks(tasks=>tasks.map(item=>item.id===taskId?{...item,stage,failure:undefined}:item)),
      user:value=>applyServerUser(value as Parameters<typeof applyServerUser>[0]),notice:flashTip,
      errorText:t("canvas.genFail"),saveErrorText:t("canvas.saveFailed"),resultGap:NODE_LABEL_H+24,
    });
    const execute=async():Promise<GeneratedResult[]>=>{
      let retained=false;
      try{
        const result=await task.run();
        if(result.status==="failed"){
          retained=true;const message=generationFailureMessage(result.failure);
          if(selectedIdRef.current===source.id)setGenError(message);else flashTip(`${source.title}：${message}`);
          setGenerationTasks(tasks=>tasks.map(item=>item.id===taskId?{...item,failure:result.failure,onRetry:retry}:item));
          return [];
        }
        if(result.status==="stale"||result.status==="cancelled")return [];
        if(selectedIdRef.current===source.id)setGenError(null);
        if(result.images.length<requestedCount)flashTip(`请求 ${requestedCount} 张，已交付 ${result.images.length} 张`);
        return result.images;
      }finally{
        generationOperationRef.current.delete(operationKey);
        if(!retained){delete generationTaskPosRef.current[taskId];delete generationTaskSizeRef.current[taskId];setGenerationTasks(tasks=>tasks.filter(item=>item.id!==taskId));}
      }
    };
    const retry=()=>{
      if(!scope.isCurrent()||generationOperationRef.current.has(operationKey))return;
      generationOperationRef.current.add(operationKey);return execute();
    };
    return execute();
  }

  // 抠图使用管理员配置的处理器；旧 fast/fine 不是图片模型的质量档位。
  // 同步返回,新节点落在生成占位处,挂在源节点下。
  async function runCutout(source: Artwork, _quality: "fast" | "fine" = "fine") {
    if (readOnly || !user || !canFeature("cutout") || isNodeLocked(source.id)) return;
    if (!cutoutCatalog || cutoutCatalogError || cutoutCatalog.available === false || cutoutCatalog.supported === false) { setGenError(cutoutCatalogError || "抠图执行配置尚未就绪，请稍后再试"); return; }
    return landEditResult(source,{kind:"cutout",source},"抠图");
  }

  function canvasImageCreationServices():CanvasImageCreationServices {
    const scope=captureCanvasTaskOwner(user?.email||"",()=>({account:canvasAccountRef.current,project:activeProjectRef.current?.key||null,epoch:canvasContextEpochRef.current,mounted:batchRunMountedRef.current})).capture();
    return {isCurrent:scope.isCurrent,generate:runGen,rename:renameGeneratedArtwork,
      detail:input=>generateDetailSequence(input.source,input.references,input.prompt,input.files,undefined,input.referenceInputs)};
  }

  // 面板「生成」:用编辑框提示词 + 参数 + 追加参考图(留空=按这张图再生成一张)
  async function generateSelectedImage(){
    if(!selected)return;
    const services=canvasImageCreationServices();
    const issue=await executeCanvasImageCreation({source:selected,prompt:editPrompt,mode:generationMode,parameters:{ratio:genRatio,style:genStyle,count:genCount,resolution:genResolution},references:visibleDockRefs,files:extraFiles,referenceInputs:composerReferences,referenceError:dockReferenceState.error||referenceError},services);
    if(issue&&services.isCurrent())setGenError(issue);
  }

  function canvasImageTextContext():CanvasImageTextContext {
    const scope=canvasArtworkDocument.scope;
    return {owner:targetEmail||user?.email||"",quality:genQuality,members:()=>activeProjectRef.current?.key===scope.project?activeProjectRef.current.members:[],
      position:source=>{const node=rfRef.current?.getNode(source.id),size=node?flowNodeSize(node):artworkNodeSize(source);return{x:(node?.position.x??source.canvasX??0)+size.width+X_GAP,y:node?.position.y??source.canvasY??0};},
      scan:(body,signal,submission,isCurrent)=>privateFetch("/api/canvas/ocr",{method:"POST",headers:{"content-type":"application/json"},body,signal,submission,isCurrent}),
      submit:(body,submission,isCurrent)=>privateFetch("/api/canvas/image-tasks",{method:"POST",headers:{"content-type":"application/json","x-naumi-billing-operation-id":String(JSON.parse(body).operationId)},body,submission,isCurrent}),
      read:url=>canvasDocumentFetch(scope,url,{},true),pending:change=>{if(scope.viewCurrent())setPendNodes(change);},
      merge:(ids,isCurrent)=>mergeWorks(ids,isCurrent),history:pushAddUndoMany,refresh:()=>setCanvasImageTaskRefreshKey(value=>value+1),credits:refreshCredits,notice:message=>{if(scope.viewCurrent())flashTip(message);}};
  }
  async function openImageTextEditor(artwork:Artwork){
    if(readOnly||!user)return;assistantSession.detach();setPropertiesOpen(false);suspendAssistant();
    await imageTextEditor.open(artwork,canvasImageTextContext());
  }
  function applyOcrSegment(segment:OcrSegment){if(readOnly||!user)return Promise.resolve();return imageTextEditor.apply(segment,canvasImageTextContext());}

  /** React owns the placeholder; task and attachment own execution/recovery. */
  async function landEditResult(source: Artwork, request: CanvasEditRequest, label: string): Promise<boolean> {
    if (readOnly || !user) return false;
    const operationKey=`node:${source.id}`;
    if(generationOperationRef.current.has(operationKey))return false;
    const account=canvasAccountRef.current,project=activeProjectRef.current?.key||null;
    const owner=captureCanvasTaskOwner(user.email,()=>({account:canvasAccountRef.current,project:activeProjectRef.current?.key||null,epoch:canvasContextEpochRef.current,mounted:batchRunMountedRef.current}));
    const sourceNode=rfRef.current?.getNode(source.id),sourceSize=sourceNode?flowNodeSize(sourceNode):artworkNodeSize(source);
    const preferred={x:(sourceNode?.position.x??source.canvasX??0)+sourceSize.width+X_GAP,y:sourceNode?.position.y??source.canvasY??0};
    const previewSize=generationPlaceholderSize(source.ratio),pendingId=`pend-edit-${browserRandomUUID()}`;
    const occupied=(rfRef.current?.getNodes()??rfNodes).map(node=>({...node.position,...flowNodeSize(node)}));
    for(const [id,saved] of editTaskStateRef.current)if(saved.account===account&&saved.project===project&&saved.workspace===owner.workspace){
      if(saved.node.operationKey===operationKey&&saved.node.generationFailure)editTaskStateRef.current.delete(id);
      else occupied.push({x:saved.node.x,y:saved.node.y,...(saved.node.generationSize??previewSize)});
    }
    const {x,y}=placeGenerationPreview(preferred,previewSize,occupied);
    const node:Pend={id:pendingId,operationKey,x,y,parentId:source.id,linked:true,label:`${label}结果`,uploading:false,progress:8,inputs:[source.id],generating:true,
      generationSize:previewSize,generationStage:"generating",generationStartedAt:Date.now()};
    editTaskStateRef.current.set(pendingId,{account,project,workspace:owner.workspace,node});
    setPendNodes(nodes=>[...nodes.filter(item=>!(item.operationKey===operationKey&&item.generationFailure)),node]);
    const update=(patch:Partial<Pend>,visible:boolean)=>{
      const saved=editTaskStateRef.current.get(pendingId);if(!saved)return;
      const next={...saved.node,...patch};editTaskStateRef.current.set(pendingId,{...saved,node:next});
      if(visible)setPendNodes(nodes=>!owner.isVisible()?nodes:nodes.some(item=>item.id===pendingId)?nodes.map(item=>item.id===pendingId?next:item):[...nodes,next]);
    };
    const submission=createRetainedBillingSubmission();
    const task=createCanvasEditTask({request,
      submit:(prepared,scope)=>privateFetch(prepared.url,{...prepared.init,isCurrent:scope.isCurrent,submission}),
      attach:createCanvasResultAttachment({layout:{kind:"single"},saveErrorText:`${label}结果定位失败`,
        position:()=>{const stored=editTaskStateRef.current.get(pendingId)?.node;return livePendingPosition(pendingId,stored?{x:stored.x,y:stored.y}:{x,y});},
        merge:(ids,current)=>taskDocumentRef.current.merge(ids,current),history:(ids,arts)=>taskDocumentRef.current.history(ids,arts)}),
      user:value=>applyServerUser(value as Parameters<typeof applyServerUser>[0]),saving:()=>update({generationStage:"saving"},owner.isVisible()),errorText:`${label}未完成，请检查原操作`,
    });
    const execute=async():Promise<boolean>=>{
      if(!owner.isVisible()||generationOperationRef.current.has(operationKey)||!editTaskStateRef.current.has(pendingId))return false;
      const scope=owner.capture();generationOperationRef.current.add(operationKey);
      update({generating:true,generationFailure:undefined,onGenerationRetry:undefined},true);
      const timer=window.setInterval(()=>{const progress=editTaskStateRef.current.get(pendingId)?.node.progress||8;update({progress:Math.min(92,progress+Math.max(1,Math.round((96-progress)/9)))},scope.isCurrent());},900);
      try{
        const result=await task.run(scope);
        if(result.status==="failed"||result.status==="stale"){
          update({generating:false,generationFailure:result.failure,onGenerationRetry:execute},owner.isVisible());
          if(scope.isCurrent())flashTip(generationFailureMessage(result.failure));return false;
        }
        editTaskStateRef.current.delete(pendingId);
        if(scope.isCurrent()){setPendNodes(nodes=>nodes.filter(node=>node.id!==pendingId));if(result.status==="succeeded")flashTip(`${label}完成，结果已载入画布`);}
        return result.status==="succeeded";
      }finally{window.clearInterval(timer);generationOperationRef.current.delete(operationKey);}
    };
    return execute();
  }

  async function openVideoNodeFromSelection(blank=false, at?: { x: number; y: number }){
    if(!user||readOnly||!canFeature("video")||videoNodeCreatePending.current)return;
    videoNodeCreatePending.current=true;setVideoNodeCreateBusy(true);
    try{
      const id=`vnode-${browserRandomUUID()}`,project=active?.key||`tree:${id}`,center=at??centerScreen();
      const box=canvasAreaRef.current?.getBoundingClientRect();
      const point=rfRef.current?.screenToFlowPosition({x:center.x+(box?.left??0),y:center.y+(box?.top??0)})||{x:0,y:0};
      const selectedIds=blank?new Set<string>():new Set([...multiSel,...(selectedId?[selectedId]:[]),...(selectedTextId?[selectedTextId]:[])]);
      const choices=videoInputChoices.filter(choice=>selectedIds.has(choice.nodeId));
      // Recheck the current catalog at the write boundary; retrying a catalog never queues creation.
      const catalog=videoCreationCatalogRef.current,creation=videoNodeCreationDefaults(catalog);
      if(!creation){
        if(catalog.loading)flashTip(L("视频模型加载中…","Loading video models…"));
        else await catalog.refresh();
        return;
      }
      const {model}=creation,config={...creation.config,prompt:blank?"":selected?.prompt||""};
      const images=choices.filter(choice=>choice.kind==="image").length;
      const proposed=choices.length===0?"text":choices.length===1&&images===1?"single_image":"reference";
      if(catalogCapability(model).modes?.includes(proposed))config.mode=proposed;
      const inputs=videoModeRoles(choices.map(choice=>({id:`ref-${browserRandomUUID()}`,nodeId:choice.nodeId,kind:choice.kind,role:choice.kind==="text"?"context" as const:choice.kind==="video"?"source_video" as const:choice.kind==="audio"?"source_audio" as const:"reference" as const,value:choice.value})),config.mode);
      const ratio=config.aspectRatio?.match(/^([1-9]\d*):([1-9]\d*)$/),aspect=ratio?Number(ratio[1])/Number(ratio[2]):16/9;
      const created=await videoNodesStore.save(id,{projectKey:project,title:"视频",x:point.x,y:point.y,width:384,height:Math.max(160,Math.min(680,Math.round(384/aspect))),config,inputs});pushUndo({kind:"video-add",records:[created]});
      setCreatingNew(false);setActiveKey(project);setBrowsing(false);setSelectedId(id);setSelectedTextId(null);setSelectedPendId(null);setMultiSel([]);setVideoDockAdvancedId(null);
    }catch(error){flashTip(error instanceof Error?error.message:"新增视频节点失败");}
    finally{videoNodeCreatePending.current=false;setVideoNodeCreateBusy(false);}
  }
  function openVideoEditor(id:string){
    setSelectedId(id);setSelectedPendId(null);setSelectedTextId(null);setMultiSel([]);setPropertiesOpen(false);setVideoDockAdvancedId(null);
  }
  async function patchVideoNode(id:string,patch:VideoPatchFields&{expectedRevision?:number}){
    await videoNodesStore.flush();const before=videoNodesStore.getNode(id);if(!before)throw new Error("视频节点不存在");
    const {expectedRevision,...fields}=patch,from:VideoPatchFields={};for(const key of Object.keys(fields) as Array<keyof VideoPatchFields>)Object.assign(from,{[key]:structuredClone(before[key])});
    const result=await videoNodesStore.save(id,{...fields,expectedRevision:expectedRevision??before.revision});
    if(JSON.stringify(from)!==JSON.stringify(fields))pushUndo({kind:"video-patch",id,from,to:fields});return result;
  }
  async function saveVideoDraft(id:string,draft:VideoNodeDraft){return patchVideoNode(id,{title:draft.title,config:draft.config,inputs:draft.inputs,expectedRevision:draft.expectedRevision});}
  function openCharacterEditor(id:string){setCharacterEditorId(id);setSelectedId(id);setSelectedTextId(null);setSelectedPendId(null);setMultiSel([]);setPropertiesOpen(false);}
  async function createCharacterNode(at:{x:number;y:number}){
    if(readOnly||!user||characterCreating.current)return;characterCreating.current=true;const account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;
    try{const id=`character-${browserRandomUUID()}`,projectKey=!browsing&&!creatingNew&&activeKey?activeKey:`tree:${id}`,box=canvasAreaRef.current?.getBoundingClientRect(),point=rfRef.current?.screenToFlowPosition({x:at.x+(box?.left||0),y:at.y+(box?.top||0)})||{x:0,y:0},character=newCharacterProject(L("角色","Character"));
      const node=await characterNodesStore.save(id,{projectKey,title:character.name,x:point.x,y:point.y,character});if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;
      pushUndo({kind:"character-add",records:[node]});setActiveKey(projectKey);setCreatingNew(false);setBrowsing(false);openCharacterEditor(id);
    }catch(error){flashTip(error instanceof Error?error.message:L("角色创建失败","Character creation failed"));}finally{characterCreating.current=false;}
  }
  async function patchCharacterNode(id:string,patch:CharacterPatchFields&{expectedRevision?:number}){
    if(readOnly||!nodeSettingsReady||isNodeLocked(id))throw new Error(L("请先解锁角色","Unlock this character first"));
    await characterNodesStore.flush();const before=characterNodesStore.getNode(id);if(!before)throw new Error(L("角色不存在","Character not found"));
    const {expectedRevision,...fields}=patch,from:CharacterPatchFields={};for(const key of Object.keys(fields) as Array<keyof CharacterPatchFields>)Object.assign(from,{[key]:structuredClone(before[key])});
    const result=await characterNodesStore.save(id,{...fields,expectedRevision:expectedRevision??before.revision});if(JSON.stringify(from)!==JSON.stringify(fields))pushUndo({kind:"character-patch",id,from,to:fields});return result;
  }
  async function uploadCharacterReferences(id:string,files:File[]){
    const node=characterNodesStore.getNode(id),account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;if(!node||readOnly||isNodeLocked(id))throw new Error(L("角色不可编辑","Character is not editable"));
    const choices=await videoAssetStore.upload(files,node.projectKey);if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current||activeProjectRef.current?.key!==node.projectKey)throw new Error(L("画布已切换，素材保留在原项目","Canvas changed; assets remain in their original project"));
    const fresh=await mergeWorks(choices.map(choice=>choice.nodeId));if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)throw new Error(L("画布账号已切换","Canvas account changed"));
    if(fresh.length)pushUndo({kind:"add",records:fresh});return choices;
  }
  async function generateCharacterReference(id:string,character:CharacterProject,appearanceId:string){
    const node=characterNodesStore.getNode(id),appearance=character.appearances.find(item=>item.id===appearanceId);if(!node||!appearance||readOnly||isNodeLocked(id))throw new Error(L("角色不可编辑","Character is not editable"));
    const account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;if(appearance.referenceArtworkIds.length)await mergeWorks(appearance.referenceArtworkIds);
    if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current||activeProjectRef.current?.key!==node.projectKey)throw new Error(L("画布已切换","Canvas changed"));
    const center=centerScreen(),pending=addPendAtScreen(center.x,center.y,null,false),point=placeGenerationPreview({x:node.x+node.width+96,y:node.y},{width:NODE_W,height:NODE_H},(rfRef.current?.getNodes()||[]).map(item=>({...item.position,...flowNodeSize(item)})));
    setPendNodes(current=>current.map(item=>item.id===pending.id?{...item,x:point.x,y:point.y,inputs:[...appearance.referenceArtworkIds],parentId:appearance.referenceArtworkIds[0]||null,linked:appearance.referenceArtworkIds.length>0}:item));
    imageDraft.seed(pending.id,{prompt:characterReferenceText(character,appearanceId),ratio:"auto"});setGenCount(1);wantFocusPendPrompt.current=true;focusEditableCanvasArea({...point,width:NODE_W,height:NODE_H});
  }
  function openAudioEditor(id:string){setAudioEditorId(id);setSelectedId(id);setSelectedTextId(null);setSelectedPendId(null);setMultiSel([]);setPropertiesOpen(false);}
  function openTimelineEditor(id:string){setTimelineEditorId(id);setSelectedId(id);setSelectedTextId(null);setSelectedPendId(null);setMultiSel([]);setPropertiesOpen(false);}
  function createTimelineNode(at:{x:number;y:number}){return timelineActions.create(at).catch(error=>{flashTip(error instanceof Error?error.message:L("多轨创建失败","Multitrack creation failed"));});}
  function patchTimelineNode(id:string,patch:TimelinePatchFields&{expectedRevision?:number}){return timelineActions.patch(id,patch);}
  function uploadTimelineSources(id:string,files:File[]){return timelineActions.upload(id,files);}
  function renderTimelineEdit(id:string,revision:number){return timelineActions.render(id,revision);}
  function adoptTimelineResult(id:string,job:PublicMediaJob){return timelineActions.adopt(id,job);}
  function createAudioNode(at:{x:number;y:number}){return audioActions.create(at).catch(error=>{flashTip(error instanceof Error?error.message:L("音频创建失败","Audio creation failed"));});}
  function patchAudioNode(id:string,patch:AudioPatchFields&{expectedRevision?:number},resultAdoption=false){return audioActions.patch(id,patch,resultAdoption);}
  function uploadAudioSource(id:string,files:File[]){return audioActions.upload(id,files);}
  function renderAudioEdit(id:string,revision:number){return audioActions.render(id,revision);}
  function adoptAudioResult(id:string,job:PublicMediaJob){return audioActions.adopt(id,job);}
  function openSceneEditor(id:string){setSceneEditorId(id);setSelectedId(id);setSelectedTextId(null);setSelectedPendId(null);setMultiSel([]);setPropertiesOpen(false);}
  async function createSceneNode(at:{x:number;y:number}){
    if(readOnly||!user||sceneCreating.current)return;sceneCreating.current=true;const account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;
    try{const id=`scene-${browserRandomUUID()}`,projectKey=!browsing&&!creatingNew&&activeKey?activeKey:`tree:${id}`,box=canvasAreaRef.current?.getBoundingClientRect(),point=rfRef.current?.screenToFlowPosition({x:at.x+(box?.left||0),y:at.y+(box?.top||0)})||{x:0,y:0},scene=newSceneProject(L("场景","Scene"));
      const node=await sceneNodesStore.save(id,{projectKey,title:scene.name,x:point.x,y:point.y,scene});if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;
      pushUndo({kind:"scene-add",records:[node]});setActiveKey(projectKey);setCreatingNew(false);setBrowsing(false);openSceneEditor(id);
    }catch(error){flashTip(error instanceof Error?error.message:L("场景创建失败","Scene creation failed"));}finally{sceneCreating.current=false;}
  }
  async function patchSceneNode(id:string,patch:ScenePatchFields&{expectedRevision?:number}){
    if(readOnly||!nodeSettingsReady||isNodeLocked(id))throw new Error(L("请先解锁场景","Unlock this scene first"));
    await sceneNodesStore.flush();const before=sceneNodesStore.getNode(id);if(!before)throw new Error(L("场景不存在","Scene not found"));
    const {expectedRevision,...fields}=patch,from:ScenePatchFields={};for(const key of Object.keys(fields) as Array<keyof ScenePatchFields>)Object.assign(from,{[key]:structuredClone(before[key])});
    const result=await sceneNodesStore.save(id,{...fields,expectedRevision:expectedRevision??before.revision});if(JSON.stringify(from)!==JSON.stringify(fields))pushUndo({kind:"scene-patch",id,from,to:fields});return result;
  }
  async function uploadSceneReferences(id:string,files:File[]){
    const node=sceneNodesStore.getNode(id),account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;if(!node||readOnly||isNodeLocked(id))throw new Error(L("场景不可编辑","Scene is not editable"));
    const choices=await videoAssetStore.upload(files,node.projectKey);if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current||activeProjectRef.current?.key!==node.projectKey)throw new Error(L("画布已切换，素材保留在原项目","Canvas changed; assets remain in their original project"));
    const fresh=await mergeWorks(choices.map(choice=>choice.nodeId));if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)throw new Error(L("画布账号已切换","Canvas account changed"));
    if(fresh.length)pushUndo({kind:"add",records:fresh});return choices;
  }
  async function generateSceneReference(id:string,scene:SceneProject,stateId:string){
    const node=sceneNodesStore.getNode(id),state=scene.states.find(item=>item.id===stateId);if(!node||!state||readOnly||isNodeLocked(id))throw new Error(L("场景不可编辑","Scene is not editable"));
    const account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;if(state.referenceArtworkIds.length)await mergeWorks(state.referenceArtworkIds);
    if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current||activeProjectRef.current?.key!==node.projectKey)throw new Error(L("画布已切换","Canvas changed"));
    const center=centerScreen(),pending=addPendAtScreen(center.x,center.y,null,false),point=placeGenerationPreview({x:node.x+node.width+96,y:node.y},{width:NODE_W,height:NODE_H},(rfRef.current?.getNodes()||[]).map(item=>({...item.position,...flowNodeSize(item)})));
    setPendNodes(current=>current.map(item=>item.id===pending.id?{...item,x:point.x,y:point.y,inputs:[...state.referenceArtworkIds],parentId:state.referenceArtworkIds[0]||null,linked:state.referenceArtworkIds.length>0}:item));
    imageDraft.seed(pending.id,{prompt:sceneReferenceText(scene,stateId),ratio:"auto"});setGenCount(1);wantFocusPendPrompt.current=true;focusEditableCanvasArea({...point,width:NODE_W,height:NODE_H});
  }
  function openDirectorEditor(id:string){setDirectorEditorId(id);setSelectedId(id);setSelectedTextId(null);setSelectedPendId(null);setMultiSel([]);setPropertiesOpen(false);}
  async function createDirectorNode(at:{x:number;y:number}){
    if(readOnly||!user||directorCreating.current)return;directorCreating.current=true;const account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;
    try{const id=`director-${browserRandomUUID()}`,projectKey=!browsing&&!creatingNew&&activeKey?activeKey:`tree:${id}`,box=canvasAreaRef.current?.getBoundingClientRect(),point=rfRef.current?.screenToFlowPosition({x:at.x+(box?.left||0),y:at.y+(box?.top||0)})||{x:0,y:0},project=newDirectorProject();project.name=L("3D 导演台","3D director");
      const node=await directorNodesStore.save(id,{projectKey,title:project.name,x:point.x,y:point.y,project});if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;
      pushUndo({kind:"director-add",records:[node]});setActiveKey(projectKey);setCreatingNew(false);setBrowsing(false);openDirectorEditor(id);
    }catch(error){flashTip(error instanceof Error?error.message:L("导演节点创建失败","Director node creation failed"));}finally{directorCreating.current=false;}
  }
  async function patchDirectorNode(id:string,patch:DirectorPatchFields&{expectedRevision?:number}){
    if(readOnly||!nodeSettingsReady||isNodeLocked(id))throw new Error(L("请先解锁节点","Unlock this node first"));
    await directorNodesStore.flush();const before=directorNodesStore.getNode(id);if(!before)throw new Error(L("导演节点不存在","Director node not found"));
    const {expectedRevision,...fields}=patch,from:DirectorPatchFields={};for(const key of Object.keys(fields) as Array<keyof DirectorPatchFields>)Object.assign(from,{[key]:structuredClone(before[key])});
    const result=await directorNodesStore.save(id,{...fields,expectedRevision:expectedRevision??before.revision});if(JSON.stringify(from)!==JSON.stringify(fields))pushUndo({kind:"director-patch",id,from,to:fields});return result;
  }
  async function sendDirectorOutput(id:string,file:File,kind:"image"|"video",expectedRevision:number){
    const node=directorNodesStore.getNode(id),account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;
    if(!node||node.deletedAt||readOnly||isNodeLocked(id))throw new Error(L("导演节点不可编辑","Director node is not editable"));
    const current=()=>{if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current||activeProjectRef.current?.key!==node.projectKey)throw new Error(L("画布已切换，素材保留在原项目","Canvas changed; the output remains in its original project"));};
    let attempt=directorOutputAttempts.current.get(file);if(!attempt){attempt={operationId:browserRandomUUID(),expectedRevision};directorOutputAttempts.current.set(file,attempt);}
    current();if(!attempt.artworkId){const choices=await videoAssetStore.upload([file],node.projectKey);attempt.artworkId=choices[0].nodeId;}
    current();const fresh=await mergeWorks([attempt.artworkId]);current();const art=fresh.find(item=>item.id===attempt!.artworkId);
    if(art&&art.canvasX==null&&art.canvasY==null){attempt.position||=placeGenerationPreview({x:node.x+node.width+96,y:node.y},{width:384,height:280},(rfRef.current?.getNodes()||[]).map(item=>({...item.position,...flowNodeSize(item)})));attempt.positionOperationId||=browserRandomUUID();
      const response=await privateFetchRaw("/api/canvas/history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operationId:attempt.positionOperationId,operations:[{type:"position",id:art.id,text:false,...attempt.position}]})});await expectJsonOk(response,L("输出位置保存失败","Output position save failed"));current();await mergeWorks([art.id]);}
    if(!attempt.addedToHistory&&art){pushUndo({kind:"add",records:[art]});attempt.addedToHistory=true;}
    current();try{return await directorNodesStore.attachOutput(id,attempt.artworkId,kind,attempt.expectedRevision!,attempt.operationId);}
    catch(error){if(!(error instanceof DirectorClientError)||error.code!=="DIRECTOR_REVISION_CONFLICT")throw error;
      await directorNodesStore.refresh();current();const latest=directorNodesStore.getNode(id);if(!latest||latest.deletedAt)throw error;if(latest.outputs.some(output=>output.artworkId===attempt!.artworkId))return latest;
      attempt.expectedRevision=latest.revision;attempt.operationId=browserRandomUUID();return directorNodesStore.attachOutput(id,attempt.artworkId,kind,attempt.expectedRevision,attempt.operationId);}
  }
  async function generateVideoDraft(id:string,draft:VideoNodeDraft,quote:PublicQuote|null,onPersisted?: (revision:number)=>void,count=1){
    if(!user||readOnly)throw new Error("无法修改此画布");
    const scope=canvasHistory.scope;
    return generateCanvasVideo({email:user.email,nodeId:id,draft,quote,onPersisted,count},{assertCurrent:scope.assertView,isCurrent:scope.viewCurrent},{
      storage:localStorage,request:(url,init)=>canvasDocumentFetch(scope,url,init,true),
      submit:async(url,init,quote,onIdentity)=>billing.submit(url,{...init,headers:await canvasDocumentHeaders(scope,init.headers,true)},quote,onIdentity),
      node:videoNodesStore.getNode,save:saveVideoDraft,
      refreshNodes:videoNodesStore.refresh,refreshTasks:videoTaskStore.refresh,refreshCredits,
    });
  }

  async function selectVideoResult(id:string,artworkId:string|null,expectedRevision:number){
    if(!user||readOnly||isNodeLocked(id))throw new Error("无法替换视频结果");
    const project=activeProjectRef.current?.key,key=JSON.stringify([canvasAccountRef.current,currentWorkspace(),project,id,artworkId]);
    await videoNodesStore.flush();if(!historyCurrent())throw new Error("账号或项目已切换");
    let act=videoResultAttempts.current.get(key);
    if(!act){
      const current=videoNodesStore.getNode(id);
      if(!current||current.deletedAt||current.projectKey!==project)throw new Error("视频节点不存在或项目已切换");
      if(current.revision!==expectedRevision)throw new Error("视频节点已更新，请重新选择结果");
      act={kind:"video-result",id,from:current.displayResultId||null,to:artworkId};videoResultAttempts.current.set(key,act);
    }
    try {
      await applyHistory(act,false,expectedRevision); videoResultAttempts.current.delete(key); pushUndo(act);
      if(artworkId&&historyCurrent())await mergeWorks([artworkId],historyCurrent);
    } catch(error) {
      if(error instanceof CanvasHistoryRequestError&&error.status<500)videoResultAttempts.current.delete(key);
      throw error;
    }
  }

  async function onExpand(ratio: string) {
    const source = selected;
    setExpandOpen(false);
    if (!source) return;
    await landEditResult(source,{kind:"expand",artworkId:source.id,ratio,anchor:expandAnchor},"扩图");
  }

  const comfyRunsRef=useRef(new Map<string,{task:ReturnType<typeof createCanvasComfyWorkflow>;owner:ReturnType<typeof captureCanvasTaskOwner>;node:Pend}>());
  /** Canvas projects workflow state; the application owns submission/recovery. */
  async function runComfyWorkflow(source:Artwork,payload:ComfyRunPayload):Promise<ComfyRunResult>{
    if(readOnly||!user)throw new Error("只读画布不能执行工作流");
    const operationKey=`node:${source.id}`;
    if(generationOperationRef.current.has(operationKey))throw new Error("当前节点已有任务在进行");
    const owner=captureCanvasTaskOwner(user.email,()=>({account:canvasAccountRef.current,project:activeProjectRef.current?.key||null,epoch:canvasContextEpochRef.current,mounted:batchRunMountedRef.current}));
    const key=comfyRunReceiptKey(owner.capture(),source.id);
    let retained=comfyRunsRef.current.get(key);
    if(!retained){
      const sourceNode=rfRef.current?.getNode(source.id),size=sourceNode?flowNodeSize(sourceNode):artworkNodeSize(source);
      const position={x:(sourceNode?.position.x??source.canvasX??0)+size.width+X_GAP,y:sourceNode?.position.y??source.canvasY??0};
      const pendingId=`pend-comfy-${browserRandomUUID()}`;
      const node:Pend={id:pendingId,operationKey,...position,parentId:source.id,linked:true,label:"工作流结果",uploading:false,progress:8,inputs:[source.id],generating:true,generationStage:"generating",generationStartedAt:Date.now()};
      const task=createCanvasComfyWorkflow({sourceId:source.id,payload,receiptKey:key,storage:localStorage,
        attach:createCanvasResultAttachment({layout:{kind:"offset",step:40},saveErrorText:"工作流结果定位失败",
          position:()=>livePendingPosition(pendingId,position),merge:(ids,current)=>taskDocumentRef.current.merge(ids,current),
          history:(ids,arts)=>{for(const id of ids)taskDocumentRef.current.history([id],arts);}}),
        submitted:async()=>{await videoTaskStore.refresh();},
        saving:()=>{if(owner.isVisible())setPendNodes(nodes=>nodes.map(item=>item.id===pendingId?{...item,generationStage:"saving"}:item));},
      });
      retained={task,owner,node};comfyRunsRef.current.set(key,retained);
    }
    const {task,node}=retained,scope=retained.owner.capture();scope.assertCurrent();
    generationOperationRef.current.add(operationKey);
    setPendNodes(nodes=>[...nodes.filter(item=>item.id!==node.id),{...node,generating:true}]);
    const timer=window.setInterval(()=>{if(scope.isCurrent())setPendNodes(nodes=>nodes.map(item=>item.id===node.id?{...item,progress:Math.min(92,item.progress+Math.max(1,Math.round((96-item.progress)/9)))}:item));},1200);
    try{
      const result=await task.run(scope);
      if(scope.isCurrent()){
        if(result.state==="completed")flashTip(result.images?.length?`工作流完成，${result.images.length} 张结果已生成在原图右侧`:"工作流完成，视频已生成");
        if(result.state==="submitted")flashTip("视频工作流已提交");
      }
      return result;
    }finally{
      if(task.finished&&comfyRunsRef.current.get(key)?.task===task)comfyRunsRef.current.delete(key);
      window.clearInterval(timer);generationOperationRef.current.delete(operationKey);
      if(scope.isCurrent())setPendNodes(nodes=>nodes.filter(item=>item.id!==node.id));
    }
  }

  async function submitAnnotations(formData: FormData) {
    const source = annotateArtwork;
    if (!source) return;
    // The child closes this submission's editor immediately. Completion must not
    // close any editor the user has opened since, including the same artwork.
    await landEditResult(source,{kind:"annotate",form:formData},"标注编辑");
  }

  function openAssistant(artwork: Artwork) {
    if (readOnly || !user) return;
    setPropertiesOpen(false);
    imageTextEditor.close(); // 与在线改字面板互斥
    discloseAssistant(true);
    if (assistantBusy || assistantArtworkId === artwork.id) return;
    assistantSession.anchor(artwork.id);
  }

  function stopAssistantTask(){return assistantSession.stop(canvasAssistantContext());}
  function restoreAssistantConversation(_anchorId:string,id:string){return assistantSession.restore(id,canvasAssistantContext());}

  function closeAssistant() {
    discloseAssistant(false);
  }

  function toggleAssistant() {
    if (assistantVisible) { closeAssistant(); return; }
    setPropertiesOpen(false);
    imageTextEditor.close();
    discloseAssistant(true);
    if (selected && !assistantBusy && selected.id !== assistantArtworkId) openAssistant(selected);
  }

  // 图片是可选上下文，换图不清空对话或改变项目会话身份。
  useEffect(() => {
    if (assistantOpen && !assistantBusy && selectedId && selectedId !== assistantArtworkId) {
      assistantSession.anchor(selectedId);
    }
  }, [selectedId, assistantArtworkId, assistantOpen, assistantBusy,assistantSession]);
  // Project/unmount guards own cancellation; restoring history may change its anchor.

  function canvasAssistantContext():CanvasAssistantContext {
    const scope=canvasArtworkDocument.scope;
    return {english:locale==="en",members:active?.members??[],imageModelId:chosenFeatureModel("canvas.image")||genModel,
      ratio:genRatio,resolution:genResolution,quality:genQuality,
      videoNodeId:videoNodesStore.getNode(assistantArtworkId||selectedId||"")?.id,textNodeId:textNodes.find(node=>node.id===(assistantArtworkId||selectedId))?.id,
      submit:(body,signal,submission,isCurrent)=>privateFetch("/api/canvas/assistant",{method:"POST",headers:{"content-type":"application/json"},body,signal,submission,isCurrent}),
      read:(url,init)=>canvasDocumentFetch(scope,url,init,true),merge:ids=>mergeWorks(ids,scope.viewCurrent),history:pushAddUndoMany,
      upload:(files,options)=>uploadRoot(files,options),cue:orbCue,
      selectAnchor:id=>{setSelectedId(id);setSelectedTextId(null);},
      video:async(nodes,isCurrent)=>{if(isCurrent()&&nodes.some(node=>node.projectKey===scope.project))await videoNodesStore.refresh();},
      text:async(nodes,signal,isCurrent)=>{
        const ids=new Set(nodes.filter(node=>node.projectKey===scope.project).map(node=>node.id)),email=targetEmail||user?.email;
        if(!ids.size||!email||!isCurrent())return;
        const response=await canvasDocumentFetch(scope,`/api/canvas/text-nodes?email=${encodeURIComponent(email)}`,{signal},true);
        if(!response.ok)throw Error("剧本资产已保存，画布文字读取暂不可用");const snapshot=await response.json();
        if(isCurrent())canvasTextDocument.accept(((snapshot.nodes||[]) as CanvasTextNode[]).filter(node=>ids.has(node.id)&&node.projectKey===scope.project).map(node=>({...node,width:node.width||TEXT_NODE_DEFAULT_W,height:node.height||TEXT_NODE_DEFAULT_H,sourceIds:node.sourceIds||[],targetIds:node.targetIds||[],productIds:node.productIds||[]})));
      },
      revealVideo:async(result,isCurrent)=>{if(activeProjectRef.current?.key||!isCurrent())return;await videoNodesStore.refresh();if(isCurrent()){setCreatingNew(false);setBrowsing(false);setActiveKey(result.key);setSelectedId(result.nodeId);}},
    };
  }
  function currentAssistantReferences(){return assistantSession.refs(canvasAssistantContext());}
  function uploadAssistantImages(files:File[]){if(readOnly||!user)return Promise.resolve();return assistantSession.upload(files,canvasAssistantContext());}
  function sendAssistantMessage(continueText=false){if(readOnly||!user)return Promise.resolve();return assistantSession.send(canvasAssistantContext(),continueText);}

  // 助手回复里的 [[GEN]] 提示词 → 复用 runGen 管线(占位节点/撤销/计费)生成子节点
  function genFromAssistant(prompt:string){
    const source=active?.members.find(artwork=>artwork.id===assistantArtworkId);
    void generateCanvasAssistantImage(source,prompt,canvasImageCreationServices());
  }

  // 展示层保留原始 Markdown 和已有生图入口，不修改 Agent 执行或历史数据。
  async function copyAssistantText(content:string){
    const accepted=assistantSession.identity(),ok=await copyText(content),now=assistantSession.identity();
    if(ok&&assistantSession.isCurrent()&&accepted.sessionId===now.sessionId&&accepted.epoch===now.epoch)orbCue({type:"copied"});
    return ok;
  }
  function renderAssistantContent(content: string) {
    return <AssistantRichText content={content} light={lightCanvas} english={locale === "en"} onCopy={copyAssistantText} onGenerate={genFromAssistant} />;
  }



  // 复用 A+ 的视觉规划与逐张串行生成管线：所选 N 张图直接作为已准备好的
  // 多视角参考，不再重复白底提取；按详情模块顺序生成，随后纵向排列为兄弟节点。
  async function generateDetailSequence(
    source: Artwork,
    referenceArts: Artwork[],
    feedback: string,
    uploadedRefs: File[] = [],
    pend?: Pend,
    referenceInputs?: CanvasImageReference[]
  ) {
    if (!user || readOnly) return;
    const operationKey = pend ? `pend:${pend.id}` : `node:${source.id}`;
    if (generationOperationRef.current.has(operationKey)) return;
    generationOperationRef.current.add(operationKey);
    const owner=captureCanvasTaskOwner(user.email,()=>({account:canvasAccountRef.current,project:activeProjectRef.current?.key||null,epoch:canvasContextEpochRef.current,mounted:batchRunMountedRef.current}));
    const count = Math.max(1, Math.min(MAX_GENERATION_COUNT, genCount || 1));
    const sourceNode = rfRef.current?.getNode(source.id);
    const sourceSize = flowNodeSize(sourceNode);
    const basePosition = pend
      ? { x: pend.x, y: pend.y }
      : sourceNode
        ? { x: sourceNode.position.x + sourceSize.width + X_GAP, y: sourceNode.position.y }
        : { x: 0, y: 0 };
    const taskId = `task-detail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const replacedFailures = generationTasks.filter(task => task.operationKey === operationKey && task.failure);
    const previous = replacedFailures[replacedFailures.length - 1];
    const retryPosition = previous ? generationTaskPosRef.current[previous.id] || previous.position : undefined;
    for (const failed of replacedFailures) { delete generationTaskPosRef.current[failed.id]; delete generationTaskSizeRef.current[failed.id]; }
    const reservedPosition = reserveGenerationPosition(taskId, basePosition, generationPlaceholderSize(genRatio), pend ? basePosition : retryPosition);
    setGenerationTasks((current) => [
      ...current.filter(task => !replacedFailures.some(failed => failed.id === task.id)),
      {
        id: taskId,isVisible:owner.isVisible,
        operationKey,
        sourceId: source.id,
        label: fmt(t("canvas.detailProgress"), { done: 0, total: count }),
        stage: "preparing", startedAt: Date.now(), previewSize: generationPlaceholderSize(genRatio), count, completed: 0,
        position: reservedPosition,
      },
    ]);
    if (pend) {
      setPendNodes((current) =>
        current.map((node) => (node.id === pend.id ? { ...node, generating: true, generationFailure: undefined, onGenerationRetry: undefined } : node))
      );
    }
    setGenError(null);
    const submission=createRetainedBillingSubmission();
    const updatePending=(patch:Partial<Pend>,visible:boolean)=>{
      if(!pend)return;
      const saved=editTaskStateRef.current.get(pend.id);
      const node={...(saved?.node??pendNodesRef.current.find(item=>item.id===pend.id)??pend),...patch};
      editTaskStateRef.current.set(pend.id,{account:canvasAccountRef.current,project:activeProjectRef.current?.key||null,workspace:owner.workspace,...saved,node});
      if(visible)setPendNodes(nodes=>!owner.isVisible()?nodes:nodes.some(item=>item.id===pend.id)?nodes.map(item=>item.id===pend.id?node:item):[...nodes,node]);
    };
    updatePending({operationKey,generating:true},true);
    const task=createCanvasDetailTask({
      prepare:scope=>prepareCanvasDetailTask({source,references:referenceArts,uploads:uploadedRefs,referenceInputs,feedback,model:genModel,ratio:genRatio,count,maxReferences:MAX_TOTAL_IMAGES,missingReferences:t("canvas.detailNeedRefs")},scope),
      submit:(form,scope)=>privateFetch("/api/aplus",{method:"POST",body:form,isCurrent:scope.isCurrent,submission}),
      attach:createCanvasResultAttachment({position:()=>pend?livePendingPosition(pend.id,reservedPosition):generationTaskPosRef.current[taskId]??reservedPosition,
        layout:{kind:"detail",gap:24,height:art=>artworkNodeSize(art).height},saveErrorText:t("canvas.saveFailed"),
        merge:(ids,current)=>taskDocumentRef.current.merge(ids,current),history:(ids,arts)=>taskDocumentRef.current.history(ids,arts)}),
      progress:(stage,done)=>{
        setGenerationTasks(tasks=>tasks.map(item=>item.id===taskId?{...item,stage,completed:done,label:fmt(t("canvas.detailProgress"),{done,total:count}),failure:undefined}:item));
        updatePending({generating:true,generationStage:stage,generationFailure:undefined},true);
      },user:value=>applyServerUser(value as Parameters<typeof applyServerUser>[0]),errorText:t("canvas.genFail"),expectedCount:count,
    });
    const execute=async()=>{
      const scope=owner.capture();let retain=false;
      try{
        const result=await task.run(scope);
        if(result.status==="failed"||result.status==="stale"){
          retain=true;
          setGenerationTasks(tasks=>pend?tasks.filter(item=>item.id!==taskId):tasks.map(item=>item.id===taskId?{...item,failure:result.failure,onRetry:retry}:item));
          updatePending({generating:false,generationFailure:result.failure,onGenerationRetry:retry},owner.isVisible());
          if(scope.isCurrent()){
            const message=generationFailureMessage(result.failure);
            if(pend?selectedPendIdRef.current===pend.id:selectedIdRef.current===source.id)setGenError(message);else flashTip(`${source.title}：${message}`);

          }
          return;
        }
        if(pend)editTaskStateRef.current.delete(pend.id);
        if(scope.isCurrent()&&pend){
          if(result.status==="succeeded"){setPendNodes(nodes=>nodes.filter(node=>node.id!==pend.id));setSelectedPendId(id=>id===pend.id?null:id);}
          else setPendNodes(nodes=>nodes.map(node=>node.id===pend.id?{...node,generating:false}:node));
        }
      }finally{
        generationOperationRef.current.delete(operationKey);
        if(!retain){delete generationTaskPosRef.current[taskId];delete generationTaskSizeRef.current[taskId];setGenerationTasks(tasks=>tasks.filter(item=>item.id!==taskId));}
      }
    };
    const retry=()=>{if(!owner.isVisible()||generationOperationRef.current.has(operationKey))return;generationOperationRef.current.add(operationKey);return execute();};
    return execute();
  }

  // 顶部图像工具条:6 个一键动作(预设提示词,各自衍生一个子节点)
  const QUICK_ACTIONS: {
    key: string;
    icon: LucideIcon;
    prompt: string;
    transparent?: boolean;
    resolution?: string;
  }[] = useMemo(
    () => [
      {
        key: "bg",
        icon: ImageIcon,
        prompt:
          "在保持主体完全不变的前提下,把背景替换为简洁高级的纯色或微场景背景,光影与主体自然衔接,电商主图风格,商业产品摄影,干净通透",
      },
      {
        key: "cutout",
        icon: Scissors,
        prompt: "精确沿主体边缘抠出主体,移除背景,输出干净的透明底 PNG",
        transparent: true,
      },
      {
        key: "relight",
        icon: Sun,
        prompt:
          "为主体重新布光,柔和专业的商业棚拍灯光,增强质感、立体感与高光层次,主体、角度与构图保持不变",
      },
      {
        key: "angle",
        icon: Rotate3d,
        prompt:
          "保持同一主体、材质与风格,换一个拍摄视角(约 45° 侧前方)重新呈现,商业产品摄影,背景与光线协调一致",
      },
      {
        key: "caption",
        icon: Type,
        prompt:
          "在画面留白区域加入精致的中文营销标题与卖点文案排版,字体现代、层级清晰、排版高级,主体保持不变,电商主图风格",
      },
      {
        key: "hd",
        icon: Wand2,
        prompt:
          "在不改变画面内容、主体与构图的前提下,提升清晰度、细节与质感,输出高清成片",
        resolution: "2K",
      },
    ],
    []
  );
  function onQuickAction(action: string) {
    if (readOnly || !selected || selectedGenerating) return;
    const a = QUICK_ACTIONS.find((x) => x.key === action);
    if (!a) return;
    // 抠图走专用自托管服务(不重绘主体);其余动作仍走 gpt-image 生成。
    if (a.key === "cutout") {
      void runCutout(selected);
      return;
    }
    void runGen(selected, a.prompt, {
      transparent: a.transparent,
      resolution: a.resolution,
      count: 1,
    });
  }
  // 抠图:统一发丝级(Replicate),扣 1 积分/张
  function onCutout(quality: string) {
    if (readOnly || !selected || selectedGenerating) return;
    void runCutout(selected, quality === "fast" ? "fast" : "fine");
  }
  // 高清:按所选分辨率(1K/2K/4K)放大当前节点
  function onHd(resolution: string) {
    if (readOnly || !selected || selectedGenerating) return;
    void runGen(
      selected,
      "在不改变画面内容、主体与构图的前提下,提升清晰度、细节与质感,输出高清成片",
      { resolution, count: 1 }
    );
  }
  // 改比例(ChatGPT 式重生成):拿当前节点自身的提示词 + 原图当参考,按目标比例重画一张。
  // 仿 ChatGPT「用不同宽高比生成此图片」——同主体/风格/配色,自然重构图,无需用户额外输入提示词。
  // 新图作为当前节点的子节点;只引用当前节点自己的图。
  function onRatioGen(ratio: string) {
    if (readOnly || !selected || selectedGenerating) return;
    void runGen(selected, inheritableImagePrompt(selected.prompt), {
      ratio,
      count: 1,
      resolution: selected.resolution || "1K",
      ratiogen: true,
      parentId: selected.id,
      refUrls: [selected.image],
    });
  }

  // 删除某节点(只删这一个,确认后调接口)。
  // 重要:绝不连删子孙、也不主动把子节点重挂到父节点 —— 其余所有节点的位置与父子关系一律不动。
  // (若删的是中间/根节点,其子节点的 parentId 会指向已删节点 → 画布上自然变成根,各自成项目,
  //  但没有任何数据丢失、位置也不变。)
  async function deleteTree(rootId: string) {
    if (readOnly || !user || !active) return;
    if (!active.members.some((m) => m.id === rootId)) return;
    const ids = [rootId];
    setConfirmModal({
      title: t("canvas.deleteNodeTitle"),
      message: t("canvas.deleteOne"),
      confirmLabel: t("canvas.confirmDelete"),
      onConfirm: () => void runDelete(ids),
    });
  }
  // 真正执行删除(确认后)。文字节点与作品必须分流到各自 API，
  // 混合选择仍只记一条 undo，避免用户需要撤销两次才能恢复。
  async function runDelete(ids:string[]) {
    if(!user||readOnly)return;
    if(!nodeSettingsReady||ids.some(isNodeLocked)){flashTip(L("请先解锁选中的节点","Unlock selected nodes first"));return;}
    const scope=canvasHistory.scope;
    try {
      if(!await canvasNodeOperations.remove(ids)||!scope.viewCurrent())return;
      canvasSelection.patch({selectedId:null,selectedTextId:null,selectedPendId:null,multiSel:multiSel.filter(id=>!ids.includes(id))});
      const members=active?.members||[],texts=canvasTextDocument.getSnapshot().nodes;
      if(activeKey&&!members.some(node=>!ids.includes(node.id))&&!texts.some(node=>node.projectKey===activeKey)&&!videoNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!directorNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!characterNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!sceneNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!audioNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!timelineNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))){
        setActiveKey(null);setCreatingNew(false);setBrowsing(true);
      }
    }catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }

  // History controller owns request identity, commit, refresh and stacks.
  function applyHistory(act: UndoAct, undo: boolean, initialRevision?: number) {
    return canvasHistory.applyHistory(act,undo,initialRevision);
  }
  async function resolveTextConflict(id:string,choice:"local"|"server"){
    const scope=canvasHistory.scope,conflict=canvasTextDocument.conflicts[id];
    const saved=await canvasTextDocument.resolve(id,choice);
    if(choice!=="local"||!saved||!scope.documentCurrent())return;
    canvasHistory.record(scope,conflict?.current?{kind:"text-patch",id:saved.id,from:textPatchOf(conflict.current),to:textPatchOf(saved)}:{kind:"text-add",records:[saved]});
  }
  async function resolveArtworkConflict(id:string,choice:"local"|"server"){
    const scope=canvasHistory.scope,conflict=canvasArtworkDocument.conflicts[id],action=canvasArtworkDocument.resolveConflict(id,choice);if(!action){if(choice==="server"&&conflict)canvasHistory.discard(conflict.action);return;}
    try{await canvasHistory.submit(scope,()=>action);if(scope.documentCurrent()){canvasArtworkDocument.clearConflict(id);if(conflict)canvasHistory.discard(conflict.action);}}catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }
  function doUndo() { if((directorNodesStore.saving||characterNodesStore.saving||sceneNodesStore.saving||audioNodesStore.saving||timelineNodesStore.saving))return Promise.resolve();return canvasHistory.doUndo(); }
  function doRedo() { if((directorNodesStore.saving||characterNodesStore.saving||sceneNodesStore.saving||audioNodesStore.saving||timelineNodesStore.saving))return Promise.resolve();return canvasHistory.doRedo(); }
  function applyPendingLinkHistory(act: Extract<UndoAct,{kind:"pending-link"}>, undo: boolean) {
    const pending = pendNodesRef.current.find(node => node.id === act.id);
    if (!pending || pending.generating || pending.uploading) throw new Error(L("节点已开始生成或已移除", "Node is generating or no longer exists"));
    setPendNodes(current => current.map(node => node.id === act.id ? {...node,...act[undo?"from":"to"]} : node));
  }
  function applyHistorySettings(update: (current: Record<string,CanvasNodeSettings>) => Record<string,CanvasNodeSettings>, persisted: boolean) {
    const next = update(nodeSettingsRef.current);
    nodeSettingsRef.current = next; setNodeSettings(next);
    if (!persisted && user) localStorage.setItem(`naumi:node-settings:${user.email.toLowerCase()}`,JSON.stringify(next));
  }
  function onHistoryApplied({action:act,undo}: HistoryCommit) {
    if(act.kind==="image-version"){const node=canvasArtworkDocument.getSnapshot().nodes?.find(node=>node.id===act.id);if(node)imageDraft.seed(act.id,{prompt:inheritableImagePrompt(node.prompt)});}
    const insertion=canvasHistoryInsertionView(act,undo,active);
    if(insertion){if(undo&&insertion.empty)setCreatingNew(true);if(!undo){setCreatingNew(false);setActiveKey(insertion.project);setBrowsing(false);}}

  }

  function loadImageVersions(nodeId:string){return loadCanvasImageVersions(canvasHistory.scope,nodeId);}
  async function selectImageVersion(nodeId:string,version:CanvasImageVersion,from:CanvasImageVersionList){
    if(readOnly||historyBusyRef.current||isNodeLocked(nodeId))return;
    await canvasHistory.submit(canvasHistory.scope,()=>({kind:"image-version",id:nodeId,from:{versionId:from.currentVersionId,image:from.image},to:{versionId:version.id,image:version.image}}));
  }
  function openProperties() {
    suspendAssistant();imageTextEditor.close();setPropertiesOpen(true);
  }
  async function commitNodeSettings(id: string, to: CanvasNodeSettings) {
    if (!user || readOnly || !nodeSettingsReady || historyBusyRef.current) return false;
    const from=settingsFor(id);
    if(JSON.stringify(from)===JSON.stringify(to))return true;
    historyBusyRef.current=true;setHistorySaving(true);
    try {
      const act: UndoAct = {kind:"node-settings",id,text:id.startsWith("text-"),video:!!videoNodesStore.getNode(id),director:!!directorNodesStore.getNode(id),character:!!characterNodesStore.getNode(id),scene:!!sceneNodesStore.getNode(id),audio:!!audioNodesStore.getNode(id),timeline:!!timelineNodesStore.getNode(id),from,to};
      await applyHistory(act,false); pushUndo(act); return true;
    } catch(error){flashTip(error instanceof Error?error.message:t("canvas.saveFailed"));return false;}
    finally {historyBusyRef.current=false;setHistorySaving(false);}
  }
  function nodeManagementItems(id: string) {
    const settings=settingsFor(id),disabled=readOnly || !nodeSettingsReady || historySaving;
    const orders=Object.values(nodeSettings).map(item=>item.order);
    return [
      {id:"lock-node",icon:settings.locked?Unlock:Lock,label:settings.locked?L("解锁节点","Unlock node"):L("锁定节点","Lock node"),disabled,
        onSelect:()=>void commitNodeSettings(id,{...settings,locked:!settings.locked})},
      {id:"front-node",icon:ArrowUpToLine,label:L("置于顶层","Bring to front"),disabled:disabled||settings.locked,
        onSelect:()=>void commitNodeSettings(id,{...settings,order:Math.min(100000,Math.max(0,...orders)+1)})},
      {id:"back-node",icon:ArrowDownToLine,label:L("置于底层","Send to back"),disabled:disabled||settings.locked,
        onSelect:()=>void commitNodeSettings(id,{...settings,order:Math.max(-100000,Math.min(0,...orders)-1)})},
    ];
  }
  function requestReplace(artwork: Artwork) {
    if(readOnly || isNodeLocked(artwork.id) || localEditBusyRef.current)return;
    replaceTargetRef.current=artwork;replaceInputRef.current?.click();
  }
  async function saveLocalImageEdit(artwork: Artwork, crop?: CanvasCrop, file?: File) {
    if(!user || readOnly || !nodeSettingsReady || isNodeLocked(artwork.id) || localEditBusyRef.current)return;
    if(file && (file.size>12*1024*1024 || !["image/png","image/jpeg","image/webp"].includes(file.type))){flashTip(L("请选择12MB以内的PNG、JPEG或WebP","Choose a PNG, JPEG or WebP up to 12MB"));return;}
    if(artwork.source==="workflow-placeholder"&&file){
      const scope=canvasArtworkDocument.scope;localEditBusyRef.current=true;setLocalEditBusy(true);
      try{await workflowDocument.fill(artwork,file);if(scope.viewCurrent())flashTip("图片已补齐");}
      catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:"补图失败，请重试");}
      finally{localEditBusyRef.current=false;if(scope.documentCurrent())setLocalEditBusy(false);if(replaceInputRef.current)replaceInputRef.current.value="";}
      return;
    }
    localEditBusyRef.current=true;setLocalEditBusy(true);
    try{
      const fingerprint=JSON.stringify({id:artwork.id,crop,file:file?{name:file.name,size:file.size,lastModified:file.lastModified}:null});
      if(localEditAttempt.current?.fingerprint!==fingerprint)localEditAttempt.current={fingerprint,id:browserRandomUUID()};
      const operationId=localEditAttempt.current!.id;
      let body:BodyInit;let headers:Record<string,string>|undefined;
      if(file){const fd=new FormData();fd.set("image",file);fd.set("id",artwork.id);fd.set("operationId",operationId);body=fd;}
      else{headers={"content-type":"application/json"};body=JSON.stringify({mode:"crop",id:artwork.id,operationId,crop});}
      const response=await privateFetchRaw("/api/canvas/local-image-edit",{method:"POST",headers,body,signal:AbortSignal.timeout(60000)});
      const data=await expectJsonOk(response,L("图片编辑失败","Image edit failed"));
      if(!data.id)throw new Error(t("canvas.genFail"));
      const fresh=await mergeWorks([data.id]);pushAddUndo(data.id,fresh);
      pendingNodeRef.current=data.id;setSelectedId(data.id);setSelectedTextId(null);setCropArtwork(null);localEditAttempt.current=null;
      flashTip(L("新版本已保存，原图保留","New version saved; original kept"));
    }catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
    finally{localEditBusyRef.current=false;setLocalEditBusy(false);if(replaceInputRef.current)replaceInputRef.current.value="";}
  }
  // 添加节点后记一笔可撤销(从刚刷新的列表取完整记录)
  function pushAddUndo(newId: string | null, fresh: Artwork[]) {
    if (!newId) return;
    const rec = fresh.find((a) => a.id === newId);
    if (rec) pushUndo({ kind: "add", records: [rec] });
  }
  function pushAddUndoMany(newIds: string[], fresh: Artwork[]) {
    const wanted = new Set(newIds);
    const records = fresh.filter((artwork) => wanted.has(artwork.id));
    if (records.length) pushUndo({ kind: "add", records });
  }
  // 批量删除选中的多个节点(框选 + Del)
  function batchDelete(ids: string[]) {
    if (readOnly || !user || !active) return;
    const real = ids.filter(
      (id) => !id.startsWith("pend-") && !id.startsWith("task-")
    );
    if (!real.length) return;
    setConfirmModal({
      title: t("canvas.deleteNodeTitle"),
      message: fmt(t("canvas.deleteMany"), { n: real.length }),
      confirmLabel: t("canvas.confirmDelete"),
      onConfirm: () => void runDelete(real),
    });
  }
  // 删除当前选中节点(供面板按钮 / Delete 键)
  async function deleteSelected() {
    if(selectedId&&(videoNodesStore.getNode(selectedId)||directorNodesStore.getNode(selectedId)||characterNodesStore.getNode(selectedId)||sceneNodesStore.getNode(selectedId)||audioNodesStore.getNode(selectedId)||timelineNodesStore.getNode(selectedId))){batchDelete([selectedId]);return;}
    if (selected) await deleteTree(selected.id);
  }

  // 删除整个项目(其全部成员图)
  function deleteProject(p: Project) {
    if (readOnly || !user) return;
    const ids = p.members.map((m) => m.id);
    setConfirmModal({
      title: t("canvas.deleteProjectTitle"),
      message: fmt(t("canvas.deleteProject"), { n: ids.length + p.textNodes.length+(p.videoNodes?.length||0)+(p.directorNodes?.length||0)+(p.characterNodes?.length||0)+(p.sceneNodes?.length||0)+(p.audioNodes?.length||0)+(p.timelineNodes?.length||0) }),
      confirmLabel: t("canvas.confirmDelete"),
      onConfirm: () => void runProjectDelete(p, ids),
    });
  }
  async function runProjectDelete(p:Project,_ids:string[]) {
    if(!user||readOnly)return;const scope=canvasHistory.scope;setSidebarOpen(false);
    try {
      await canvasNodeOperations.removeProject(p.key);
      if(!scope.documentCurrent())return;
      if(scope.documentCurrent())projectCatalog.remove(p.key);
      if(scope.viewCurrent()&&p.key===activeKey){setActiveKey(null);canvasSelection.patch({selectedId:null,selectedTextId:null,selectedPendId:null});setCreatingNew(false);setBrowsing(true);}
    }catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }

  async function downloadZip(members: Artwork[], filename: string) {
    if (zipping) return;
    setZipping(true);
    try {
      const items = members
        .filter((m) => hasRenderableImage(m.image))
        .slice(0, 30)
        .map((m, i) => ({ url: m.image, name: m.title || `img-${i + 1}` }));
      if (!items.length) return;
      const blob = await browserImageArchive(items);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename || "project"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      flashTip(locale === "en" ? "Download failed. Please try again." : "打包下载失败，请重试");
    } finally {
      setZipping(false);
    }
  }

  // 把当前项目所有图打包下载 ZIP(复用套图下载接口)
  async function downloadProject() {
    if (!active) return;
    await downloadZip(active.members, active.name || "project");
  }

  async function downloadBatchSelection() {
    if (!active || selectedBatchArts.length < 2) return;
    await downloadZip(
      selectedBatchArts,
      `${active.name || "project"}-已选-${selectedBatchArts.length}张`
    );
  }

  async function markBatchSelection(){
    if(!user||readOnly||selectedBatchArts.length<2)return;const scope=canvasHistory.scope,ids=new Set(selectedBatchIds),marked=!selectedBatchAllMarked;
    try{await canvasHistory.submit(scope,()=>({kind:"mark",changes:(canvasArtworkDocument.getSnapshot().nodes||[]).filter(a=>ids.has(a.id)).map(a=>({id:a.id,from:!!a.marked,to:marked}))}));}
    catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }
  async function groupBatchSelection(){
    if(!user||readOnly||selectedBatchArts.length<2)return;const scope=canvasHistory.scope,ids=new Set(selectedBatchIds),group=`canvas-group-${browserRandomUUID()}`;
    try{await canvasHistory.submit(scope,()=>({kind:"canvas-group",changes:(canvasArtworkDocument.getSnapshot().nodes||[]).filter(a=>ids.has(a.id)).map(a=>({id:a.id,from:a.canvasGroupId??null,to:group}))}));}
    catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.groupFail"));}
  }
  async function ungroupBatchSelection(){
    if(!user||readOnly||!active||!selectedBatchCanvasGroupId)return;const scope=canvasHistory.scope,group=selectedBatchCanvasGroupId;
    try{await canvasHistory.submit(scope,()=>({kind:"canvas-group",changes:(canvasArtworkDocument.getSnapshot().nodes||[]).filter(a=>a.canvasGroupId===group).map(a=>({id:a.id,from:a.canvasGroupId??null,to:null}))}));}
    catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.groupFail"));}
  }

  async function stitchBatchSelection() {
    if (!user || readOnly || stitching || selectedBatchArts.length < 2) return;
    const selectedNodes = (rfRef.current?.getNodes() ?? []).filter((node) =>
      selectedBatchIds.includes(node.id)
    );
    const x = selectedNodes.length
      ? Math.max(...selectedNodes.map((node) => node.position.x + flowNodeSize(node).width)) + X_GAP
      : 0;
    const y = selectedNodes.length
      ? Math.min(...selectedNodes.map((node) => node.position.y))
      : 0;
    setStitching(true);
    try {
      const response = await privateFetchRaw("/api/canvas/stitch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: selectedBatchIds,
          title: fmt(t("canvas.longImageTitle"), { n: selectedBatchIds.length }),
          x,
          y,
        }),
      });
      const result = await expectJsonOk(response, t("canvas.stitchFail"));
      const id = String(result?.id || "");
      if (!id) throw new Error(t("canvas.stitchFail"));
      clearCanvasSelection(true);
      const fresh = await mergeWorks([id]);
      pushAddUndo(id, fresh);
      setSelectedId(id);
      flashTip(t("canvas.stitchDone"));
    } catch (error) {
      flashTip(error instanceof Error ? error.message : t("canvas.stitchFail"));
    } finally {
      setStitching(false);
    }
  }

  // 拉线建节点(5b):+端口拖出 → onConnectStart 记源；落到图片节点建立生成输入，
  // 落到文字节点建立图片上下文；落空白 onConnectEnd → 在释放点弹「新建节点」菜单。
  function onConnectStart(
    _e: unknown,
    params: { nodeId?: string | null; handleId?: string | null }
  ) {
    connectedRef.current = false;
    spawnSourceRef.current = (params.nodeId&&directorNodesStore.getNode(params.nodeId)?.outputs.at(-1)?.artworkId)||params.nodeId||null;
    setLinking(true);
  }
  async function submitCanvasLink(intent:CanvasLinkIntent) {
    if(readOnly||!user)return false;
    const scope=canvasHistory.scope;
    // Drain current drafts before snapshotting link fields. The history owner
    // serializes the command and retains an unknown response's original body.
    try {
      await canvasTextDocument.flush();scope.assertView();
      const snapshot=()=>{
        const memberIds=new Set(active?.members.map(node=>node.id)||[]);
        return {
        project:scope.project,artworks:(canvasArtworkDocument.getSnapshot().nodes||[]).filter(node=>memberIds.has(node.id)),texts:canvasTextDocument.getSnapshot().nodes,
        videos:videoNodesStore.nodes.map(node=>videoNodesStore.getNode(node.id)||node),directors:directorNodesStore.nodes.map(node=>directorNodesStore.getNode(node.id)||node),characters:characterNodesStore.nodes.map(node=>characterNodesStore.getNode(node.id)||node),scenes:sceneNodesStore.nodes.map(node=>sceneNodesStore.getNode(node.id)||node),audios:audioNodesStore.nodes.map(node=>audioNodesStore.getNode(node.id)||node),timelines:timelineNodesStore.nodes.map(node=>timelineNodesStore.getNode(node.id)||node),pending:pendNodesRef.current,selected:multiSel,choices:videoInputChoices,
        locked:isNodeLocked,productTitle:t("canvas.productNode"),referenceLimit:t("canvas.textReferenceLimit"),cycleMessage:t("canvas.linkCycle"),productMention:withProductMention,
      };};
      const timelineMaterials=intent.add&&timelineNodesStore.getNode(intent.target)?await timelineActions.inspect(intent.target,[canvasLinkMediaSource(snapshot(),intent.source)]):[];scope.assertView();
      return await canvasHistory.submit(scope,()=>compileCanvasLink({...snapshot(),timelineMaterials},intent));
    }catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.saveFailed"));return false;}
  }
  async function onConnect(conn:{source?:string|null;target?:string|null}) {
    connectedRef.current=true;
    if(conn.source&&conn.target)await submitCanvasLink({source:conn.source,target:conn.target,add:true});
  }
  async function cutEdge(edge:{id:string;source:string;target:string}) {
    if(readOnly||!user||historyBusyRef.current||cuttingEdgesRef.current.has(edge.id)||!rfEdges.some(item=>item.id===edge.id))return;
    const scope=canvasHistory.scope;cuttingEdgesRef.current.add(edge.id);edgeHoverHintRef.current?.clear();
    try {
      if(await submitCanvasLink({...edge,edgeId:edge.id,add:false})&&scope.viewCurrent()){
        setRfEdges(current=>scope.viewCurrent()?current.filter(item=>item.id!==edge.id):current);
        setSelectedEdge(current=>scope.viewCurrent()&&current?.id===edge.id?null:current);
      }
    }finally{cuttingEdgesRef.current.delete(edge.id);}
  }
  function onConnectEnd(
    event: MouseEvent | TouchEvent,
    connectionState?: { isValid?: boolean | null }
  ) {
    setLinking(false);
    const src = spawnSourceRef.current;
    spawnSourceRef.current = null;
    if (!src || src.startsWith("task-") || readOnly) return;
    // 落到了已有节点(有效连接)= 多输入,留 5d,不弹新建菜单
    if (connectionState?.isValid || connectedRef.current) return;
    const pt =
      "changedTouches" in event && event.changedTouches.length
        ? event.changedTouches[0]
        : (event as MouseEvent);
    const box = canvasAreaRef.current?.getBoundingClientRect();
    const x = box ? pt.clientX - box.left : pt.clientX;
    const y = box ? pt.clientY - box.top : pt.clientY;
    setCtxMenu(null);
    // 拉线落空白 → 在落点弹「新建节点」菜单(选类型后再建节点)
    setSpawnMenu({ x, y, sourceId: src });
  }
  // 拉线落空白后的「新建节点」菜单动作:图片 / 上传图片 / 文字生成。
  // 图片 → 文字会把源图记录为结构化上下文，并在文字输入区显示 @图片名。
  function spawnNode(type: string) {
    if (!spawnMenu) return;
    const { sourceId, x, y } = spawnMenu;
    setSpawnMenu(null);
    if (type === "text") {
      if (sourceId.startsWith("text-")) return;
      addTextNodeAtScreen(x, y, { sourceIds: [sourceId] });
      return;
    }
    const pend = addPendAtScreen(x, y, sourceId, true);
    if (type === "upload") {
      // 节点 + 立刻弹出上传窗口
      onPendUpload(pend.id);
    } else {
      // 「图片」:落点建好节点后,把光标落进提示词框,写"改什么"→点生成出衍生(img2img)
      const textSource = textNodes.find((node) => node.id === sourceId);
      imageDraft.seed(pend.id, { prompt: textSource?.content || textSource?.prompt || "" });
      wantFocusPendPrompt.current = true;
    }
  }
  // 右键菜单(5c):算出相对画布区的坐标后弹出
  function relPoint(e: { clientX: number; clientY: number }) {
    const box = canvasAreaRef.current?.getBoundingClientRect();
    return {
      x: box ? e.clientX - box.left : e.clientX,
      y: box ? e.clientY - box.top : e.clientY,
    };
  }
  function onNodeContextMenu(
    e: ReactMouseEvent,
    node: { id: string }
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (node.id.startsWith("task-")) return;
    setSelectedEdge(null);
    setRfEdges(current => current.map(edge => edge.selected ? { ...edge, selected: false } : edge));
    setSpawnMenu(null);
    const p = relPoint(e);
    if(node.id.startsWith("text-")&&multiSel.length>1&&multiSel.includes(node.id)){setCtxMenu({x:p.x,y:p.y,cx:e.clientX,cy:e.clientY,nodeId:node.id});return;}
    if (node.id.startsWith("text-") || node.id.startsWith("pend-")) {
      setSelectedId(null); setMultiSel([]);
      setRfNodes(current => current.map(item => item.selected ? { ...item, selected: false } : item));
      setSelectedPendId(node.id.startsWith("pend-") ? node.id : null);
      setSelectedTextId(node.id.startsWith("text-") ? node.id : null);
      setCtxMenu({ x: p.x, y: p.y, cx: e.clientX, cy: e.clientY, nodeId: node.id });
      return;
    }
    contextSelectionBaseRef.current = [...multiSel];
    const modified = e.ctrlKey || e.metaKey;
    if (modified) {
      toggleArtworkBatchSelection(node.id);
    } else if (multiSel.length < 2 || !multiSel.includes(node.id)) {
      // 普通右键未选节点遵循桌面习惯：先成为唯一选中对象。
      applyArtworkSelection([node.id]);
    }
    setCtxMenu({ x: p.x, y: p.y, cx: e.clientX, cy: e.clientY, nodeId: node.id });
  }
  function onPaneContextMenu(e: ReactMouseEvent | MouseEvent) {
    e.preventDefault();
    setSpawnMenu(null);
    const p = relPoint(e);
    setCtxMenu({ x: p.x, y: p.y, cx: e.clientX, cy: e.clientY });
  }
  // 全部图文参与布局；锁定/运行节点作为障碍。一个事务、一个撤销步骤。
  async function tidyLayout() {
    if (!active || readOnly || !user || !nodeSettingsReady || !textNodesReady || historyBusyRef.current) return;
    setCtxMenu(null);
    historyBusyRef.current = true;
    setHistorySaving(true);
    try {
      await canvasTextDocument.flush();
      if (canvasTextDocument.getSnapshot().unsaved) throw new Error(L("请先保存未保存的文字节点", "Save pending text changes first"));
      const currentNodes = (rfRef.current?.getNodes() ?? rfNodes).filter(node => node.type !== "workflowGroup");
      const currentEdges = rfRef.current?.getEdges() ?? rfEdges;
      const artworkIds = new Set(active.members.map(member => member.id));
      const textIds = new Set(active.textNodes.map(node => node.id));
      const mobileIds = new Set([...artworkIds, ...textIds,...(active.videoNodes||[]).map(node=>node.id),...(active.directorNodes||[]).map(node=>node.id),...(active.characterNodes||[]).map(node=>node.id),...(active.sceneNodes||[]).map(node=>node.id),...(active.audioNodes||[]).map(node=>node.id),...(active.timelineNodes||[]).map(node=>node.id)]);
      const input = currentNodes.map(node => ({
        id: node.id, ...flowNodeSize(node), x: node.position.x, y: node.position.y,
        fixed: !mobileIds.has(node.id) || isNodeLocked(node.id),
        group: (node.data as { canvasGroupId?: string | null }).canvasGroupId,
      }));
      const positions = smartLayout(input, currentEdges);
      const moves = input.filter(node => !node.fixed).flatMap(node => {
        const to = positions.get(node.id)!;
        const from = { x: node.x, y: node.y };
        return to.x === from.x && to.y === from.y ? [] : [{ id: node.id, from, to }];
      });
      if (moves.length > 400) throw new Error(L("本次整理最多支持400个移动节点", "Arrange up to 400 movable nodes at a time"));
      if (moves.length) {
        const act: UndoAct = { kind: "move-many", moves };
        // applyHistory persists atomically BEFORE moving local nodes; failed saves leave the canvas intact.
        await applyHistory(act, false);
        pushUndo(act);
      }
      if (!historyCurrent()) return;
      let frames = 0;
      const fitArrangedView = () => {
        if (!historyCurrent()) return;
        const instance = rfRef.current;
        const liveNodes = instance?.getNodes() ?? [];
        const readyToFit = liveNodes.length > 0 && moves.every(move => {
          const live = liveNodes.find(node => node.id === move.id);
          return live?.position.x === move.to.x && live?.position.y === move.to.y;
        });
        if (instance && readyToFit) {
          void instance.fitView({ nodes: Array.from(mobileIds, id => ({ id })), duration: 500, padding: 0.18, maxZoom: 1 });
        } else if (++frames < 60) {
          requestAnimationFrame(fitArrangedView);
        }
      };
      requestAnimationFrame(fitArrangedView);
    } catch (error) {
      flashTip(error instanceof Error ? error.message : t("canvas.saveFailed"));
    } finally {
      historyBusyRef.current = false;
      setHistorySaving(false);
    }
  }

  // 下载单张图
  function downloadVideo(url:string){const link=document.createElement('a');link.href=mediaDownloadHref(url);link.download='video.mp4';document.body.appendChild(link);link.click();link.remove();}
  async function downloadOne(image: string) {
    try {
      const filename = createImageDownloadName();
      let blob: Blob;
      try {
        if(!imageCacheSource(image))throw new Error('native download');
        blob=await cachedImageBlob(image);
      } catch(error) {
        if(error instanceof ImageCacheDenied)throw error;
        const r=await fetch(`/api/download?u=${encodeURIComponent(image)}&n=${encodeURIComponent(filename)}`);
        if(!r.ok)throw new Error();blob=await r.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      flashTip(locale === "en" ? "Download failed. Please try again." : "下载失败，请重试");
    }
  }

  // 当前项目的根 id(用于把手动加的节点归到当前项目,而非自成新项目)
  function activeRootId(): string | null {
    if (!active) return null;
    const ids = new Set(active.members.map((m) => m.id));
    const root = active.members.find(
      (m) => !(m.parentId && ids.has(m.parentId))
    );
    return root?.id ?? active.members[0]?.id ?? null;
  }
  // ── 节点操作(真功能,对齐原型右键菜单)──
  // 创建副本 / 粘贴:复制成一个独立节点(无连线),落在源节点旁边
  async function duplicateArt(a:Artwork) {
    if(readOnly||!user)return;const scope=canvasHistory.scope,node=rfNodes.find(node=>node.id===a.id);
    try {
      const result=await canvasNodeOperations.copy({ids:[a.id],projectKey:active?.key,singleArtwork:{x:Math.round((node?.position.x??a.canvasX??0)+40),y:Math.round((node?.position.y??a.canvasY??0)+artworkNodeSize(a).height+30),title:`${a.title} 副本`.slice(0,80)}},"duplicate");
      if(scope.viewCurrent())selectCopiedNodes(result,true);
    }catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:L("复制节点失败，请重试","Could not duplicate this node. Please try again."));}
  }
  // DOM FileList/viewport capture stays at the edge; queue, transport and saved
  // receipt synchronization are owned by the shared importer.
  function canvasImportContext():CanvasImageImportContext {
    const scope=canvasArtworkDocument.scope;
    return {owner:user!.email,account:canvasAccountRef.current,workspace:scope.workspace,project:scope.project,
      documentCurrent:scope.documentCurrent,viewCurrent:scope.viewCurrent,
      rects:()=>((scope.viewCurrent()?rfRef.current?.getNodes():undefined)??rfNodes).map(node=>({...node.position,...flowNodeSize(node)})),
      merge:ids=>mergeWorks(ids),history:pushAddUndoMany,
      reveal:id=>{openPendingNodeWithoutSelectionRef.current=true;pendingNodeRef.current=id;},t,locale};
  }
  function uploadRoot(files:FileList|File[]|null,options?:{assistant:boolean;isCurrent:()=>boolean}):Promise<string[]> {
    const picked=Array.from(files??[]);
    if(rootUploadRef.current)rootUploadRef.current.value="";
    if(readOnly||!user||browsing||!picked.length)return Promise.resolve([]);
    const box=canvasAreaRef.current?.getBoundingClientRect();
    const center=rfRef.current?.screenToFlowPosition({x:(box?.left??0)+(box?.width??0)/2,y:(box?.top??0)+(box?.height??0)/2},{snapToGrid:false})??{x:0,y:0};
    const point=(!options?.assistant?uploadCtxRef.current:null)??{parentId:activeRootId(),x:center.x-NODE_W/2,y:center.y-NODE_H/2};
    if(!options?.assistant)uploadCtxRef.current=null;
    return imageImportOwner.upload(picked,point,canvasImportContext(),options);
  }
  async function retryImportSynchronization(batchId:number){
    if(!user||readOnly)return;
    try{await imageImportOwner.synchronize(batchId,canvasImportContext());}catch{/* Saved IDs remain on the import status, without uploading again. */}
  }

  // 在画布某屏幕点(相对画布区)上传图片:落在当前项目、该点的画布坐标
  function triggerUpload(screenX: number, screenY: number) {
    const viewport = rfRef.current?.getViewport() ?? viewportRef.current;
    const z = viewport.zoom || 1;
    const wx = (screenX - viewport.x) / z - NODE_W / 2;
    const wy = (screenY - viewport.y) / z - NODE_H / 2;
    let parentId: string | null = null;
    if (active) {
      const ids = new Set(active.members.map((m) => m.id));
      const root = active.members.find(
        (m) => !(m.parentId && ids.has(m.parentId))
      );
      parentId = root?.id ?? active.members[0]?.id ?? null;
    }
    uploadCtxRef.current = { parentId, x: wx, y: wy };
    rootUploadRef.current?.click();
  }
  // 从生成历史选择:在画布某点打开作品选择器
  function openHistoryPicker(screenX: number, screenY: number) {
    if (readOnly || historyAddingRef.current) return;
    const viewport = rfRef.current?.getViewport() ?? viewportRef.current;
    const z = viewport.zoom || 1;
    const wx = (screenX - viewport.x) / z - NODE_W / 2;
    const wy = (screenY - viewport.y) / z - NODE_H / 2;
    setHistoryPickerError(null);
    setHistoryVisibleCount(60);
    setHistoryPicker({ x: wx, y: wy });
  }
  // 选中历史作品 → 作为节点加入当前项目(落在记下的点)
  async function addFromHistory(a:Artwork) {
    if(readOnly||!user||!historyPicker||historyAddingRef.current)return;
    historyAddingRef.current=true;setHistoryAddingId(a.id);setHistoryPickerError(null);const scope=canvasHistory.scope;
    try {
      const result=await canvasNodeOperations.copy({ids:[a.id],projectKey:active?.key,singleArtwork:{x:Math.round(historyPicker.x),y:Math.round(historyPicker.y)}},"history");
      if(scope.viewCurrent()){selectCopiedNodes(result,true);setHistoryPicker(null);}
    }catch(error){if(scope.viewCurrent())setHistoryPickerError(error instanceof Error?error.message:L("添加失败，请重试","Could not add this artwork. Please try again."));}
    finally{historyAddingRef.current=false;if(scope.viewCurrent())setHistoryAddingId(null);}
  }
  // 在画布某屏幕点新建一个空白占位节点(linked=拉线建的,连源节点)
  function addPendAtScreen(
    screenX: number,
    screenY: number,
    parentId: string | null,
    linked: boolean
  ): Pend {
    const viewport = rfRef.current?.getViewport() ?? viewportRef.current;
    const z = viewport.zoom || 1;
    const wx = (screenX - viewport.x) / z - NODE_W / 2;
    const wy = (screenY - viewport.y) / z - NODE_H / 2;
    const seq = pendSeqRef.current++;
    const id = `pend-${Date.now()}-${seq}`;
    const pend: Pend = {
      id,
      x: wx,
      y: wy,
      parentId,
      linked,
      label: `${t("canvas.imageNode")} ${seq}`,
      uploading: false,
      progress: 0,
      inputs: linked && parentId ? [parentId] : [],
    };
    setPendNodes((prev) => [...prev, pend]);
    setGenerationMode("standard");
    // 选中新空白节点 → 自动出生成 dock(图3:加节点即可直接写提示词生成)
    setSelectedId(null);
    setSelectedTextId(null);
    setSelectedPendId(id);
    focusEditableCanvasArea({ x: wx, y: wy, width: NODE_W, height: NODE_H });
    return pend;
  }
  // 将框选图片作为同一个新节点的多输入。新节点沿用现有生成 Dock，用户可继续
  // 写提示词、选比例/数量后生成；本站单次最多提交 16 张参考图；执行通道按已发布能力筛选。
  function createMergeNodeFromSelection() {
    if (readOnly || selectedBatchArts.length < 2) return;
    const inputs = selectedBatchIds.slice(0, MAX_TOTAL_IMAGES);
    const selectedNodes = (rfRef.current?.getNodes() ?? []).filter((node) =>
      inputs.includes(node.id)
    );
    const seq = pendSeqRef.current++;
    const id = `pend-${Date.now()}-${seq}`;
    const maxX = selectedNodes.length
      ? Math.max(...selectedNodes.map((node) => node.position.x + flowNodeSize(node).width))
      : 0;
    const avgY = selectedNodes.length
      ? selectedNodes.reduce((sum, node) => sum + node.position.y, 0) /
        selectedNodes.length
      : 0;
    const pend: Pend = {
      id,
      x: maxX + X_GAP,
      y: avgY,
      parentId: inputs[0] ?? null,
      linked: true,
      label: `${t("canvas.imageNode")} ${seq}`,
      uploading: false,
      progress: 0,
      inputs,
    };
    setPendNodes((current) => [...current, pend]);
    clearCanvasSelection(true);
    setSelectedId(null);
    setSelectedPendId(id);
    imageDraft.seed(id, { prompt: "", ratio: "auto" });
    setGenerationMode("standard");
    setGenCount(1);
    wantFocusPendPrompt.current = true;
    focusEditableCanvasArea({ x: pend.x, y: pend.y, width: NODE_W, height: NODE_H });
    if (selectedBatchIds.length > MAX_TOTAL_IMAGES) {
      flashTip(fmt(t("canvas.batchGenerateLimit"), { n: MAX_TOTAL_IMAGES }));
    }
  }
  function flashTip(m: string) {
    setTipMsg(m);
    setTimeout(() => setTipMsg(null), 1900);
  }
  // 画布可视区中心(屏幕坐标,相对画布区)
  function centerScreen() {
    const box = canvasAreaRef.current;
    return {
      x: (box?.clientWidth ?? 600) / 2,
      y: (box?.clientHeight ?? 400) / 2,
    };
  }
  function focusEditableCanvasArea(area: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const instance = rfRef.current;
        const canvas = canvasAreaRef.current;
        if (!instance || !canvas) return;
        const current = instance.getViewport();
        const targetZoom = Math.max(
          current.zoom,
          Math.min(1, Math.max(0.75, 240 / area.width, 160 / area.height))
        );
        const screenLeft = area.x * current.zoom + current.x;
        const screenTop = area.y * current.zoom + current.y;
        const outside =
          screenLeft + area.width * current.zoom < 40 ||
          screenTop + area.height * current.zoom < 40 ||
          screenLeft > canvas.clientWidth - 40 ||
          screenTop > canvas.clientHeight - 80;
        if (!outside && current.zoom >= targetZoom * 0.95) return;
        void instance.setCenter(
          area.x + area.width / 2,
          area.y + area.height / 2,
          { zoom: targetZoom, duration: 320 }
        );
      }, 0);
    });
  }
  function createCanvasNode(kind: "text" | "image" | "video" | "director" | "character" | "scene" | "audio" | "timeline", point = centerScreen()) {
    if (readOnly) return;
    if (kind === "timeline") void createTimelineNode(point);
    else if (kind === "audio") void createAudioNode(point);
    else if (kind === "scene") void createSceneNode(point);
    else if (kind === "character") void createCharacterNode(point);
    else if (kind === "director") void createDirectorNode(point);
    else if (kind === "text") addTextNodeAtScreen(point.x, point.y);
    else if (kind === "image") addPendAtScreen(point.x, point.y, null, false);
    else if (canFeature("video")) void openVideoNodeFromSelection(true, point);
  }
  // 底部工具条:＋ 添加空白节点(画布中心)
  function toolAddNode() {
    if (readOnly) return;
    const c = centerScreen();
    addPendAtScreen(c.x, c.y, null, false);
  }
  function persistTextNode(node: CanvasTextNode) { return canvasTextDocument.save(node); }
  async function updateTextReference(textNodeId:string,sourceId:string,add:boolean) {
    return submitCanvasLink({source:sourceId,target:textNodeId,add});
  }
  function resizeTextNode(
    id: string,
    bounds: { x: number; y: number; width: number; height: number }
  ) {
    if (readOnly || isNodeLocked(id)) return;
    const current = textNodes.find((node) => node.id === id);
    if (!current) return;
    const updated: CanvasTextNode = {
      ...current,
      canvasX: Number.isFinite(bounds.x) ? bounds.x : current.canvasX,
      canvasY: Number.isFinite(bounds.y) ? bounds.y : current.canvasY,
      width: Math.round(
        Math.min(TEXT_NODE_MAX_W, Math.max(TEXT_NODE_MIN_W, bounds.width))
      ),
      height: Math.round(
        Math.min(id.startsWith("text-import-") ? 100000 : TEXT_NODE_MAX_H, Math.max(TEXT_NODE_MIN_H, bounds.height))
      ),
      updatedAt: new Date().toISOString(),
    };
    if (updated.width !== current.width || updated.height !== current.height) {
      pushUndo({
        kind: "text-patch",
        id,
        from: textPatchOf(current),
        to: textPatchOf(updated),
      });
    }
    setTextNodes((nodes) =>
      nodes.map((node) => (node.id === updated.id ? updated : node))
    );
    void persistTextNode(updated);
  }
  // 一键放大/还原文字节点：仅切换展示尺寸，不污染持久化尺寸。
  function toggleTextNodeExpand(id: string) {
    if (readOnly) return;
    setExpandedTextIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function addTextNodeAtScreen(
    screenX: number,
    screenY: number,
    options?: {
      forceNewProject?: boolean;
      title?: string;
      prompt?: string;
      sourceIds?: string[];
    }
  ) {
    if (readOnly || !user) return;
    const node=newCanvasText({...options,x:screenX,y:screenY,viewport:rfRef.current?.getViewport()??viewportRef.current,
      project:active?.key||activeKey,title:options?.title||t("canvas.textGenerate")});
    const {id,projectKey}=node;
    setTextNodes((current) => [...current, node]);
    setActiveKey(projectKey);
    setCreatingNew(false);
    setBrowsing(false);
    setSelectedId(null);
    setSelectedPendId(null);
    setSelectedTextId(id);
    setTextPrompt(options?.prompt || "");
    focusEditableCanvasArea({
      x: node.canvasX,
      y: node.canvasY,
      width: 300,
      height: 176,
    });
    pushUndo({ kind: "text-add", records: [node] });
    void persistTextNode(node);
  }
  async function removeTextNode(id: string) {
    await runDelete([id]);
  }

  function changeTextNodeContent(id: string, content: string) {
    if(readOnly || isNodeLocked(id))return;
    setTextNodes((current) =>
      current.map((node) =>
        node.id === id
          ? { ...node, content: content.slice(0, 12000), updatedAt: new Date().toISOString() }
          : node
      )
    );
  }

  function commitTextNodeContent(id: string, content: string, initialContent?: string) {
    if(readOnly || isNodeLocked(id))return;
    const node = textNodes.find((item) => item.id === id);
    if (node) {
      const updated = {
        ...node,
        content: content.slice(0, 12000),
        updatedAt: new Date().toISOString(),
      };
      // onChange already updates controlled state. Preserve the focus-time text
      // instead of mistaking the latest draft for the undo baseline on blur.
      const patch = canvasTextEditPatch(textPatchOf(node), updated.content, initialContent);
      if (patch) {
        pushUndo({
          kind: "text-patch",
          id,
          from: patch.from,
          to: patch.to,
        });
      }
      setTextNodes((current) => current.map((item) => (item.id === id ? updated : item)));
      void persistTextNode(updated);
    }
  }
  async function generateTextNode(options?:{node:CanvasTextNode;prompt:string;silent?:boolean}):Promise<boolean>{
    const target=options?.node??selectedText,prompt=(options?.prompt??textPrompt).trim();
    if(!target||readOnly||!nodeSettingsReady||isNodeLocked(target.id)||textTasks.state(target.id).busy)return false;
    if(target.status==="generating"&&textTasks.state(target.id).phase==="idle")return false;
    if(!prompt&&!textTasks.retryable(target.id))return false;
    const ok=textTasks.retryable(target.id)?await textTasks.resume(target.id):await textTasks.run(generalTextTask(target,prompt,t("canvas.textGenerate")));
    return ok;
  }

  // ===== 竞品反推 → 智能帮写 → 成套生成 链路 =====

  // 绑定/换绑文字节点的产品图:productIds 记录绑定,@产品图 行刷新到内容开头


  // 批量反推:每张竞品图右侧生成一个"逆向提示词"文字节点(2 路并发,失败节点保留可重试)
  async function reversePromptsForSelection(arts:Artwork[]){
    if(readOnly||!user||!activeKey||promptMining||!arts.length)return;
    setCtxMenu(null);const scope=canvasTextDocument.scope,live=new Map((rfRef.current?.getNodes()||[]).map(node=>[node.id,node]));
    const requests=arts.map(source=>{const node=live.get(source.id);return derivedTextTask({mode:"reverse",source,project:activeKey,title:t("canvas.reverseTitle"),productTitle:t("canvas.productNode"),gap:X_GAP,
      position:{x:node?.position.x??source.canvasX??0,y:node?.position.y??source.canvasY??0,width:node?flowNodeSize(node).width:NODE_W}});});
    const result=await textTasks.batch("reverse",requests);
    if(scope.viewCurrent())flashTip(result.failed?L(`反推：成功 ${result.succeeded}，失败 ${result.failed}`,`Reverse prompts: ${result.succeeded} succeeded, ${result.failed} failed`):fmt(t("canvas.reverseDone"),{n:result.succeeded}));
  }

  function currentSelectionRunTargets(ids: string[]) {
    if (!ids.length) return [];
    const selectedIds = new Set(ids);
    const positions = new Map((rfRef.current?.getNodes() ?? []).map(node => [node.id, node.position]));
    const busyIds = new Set(generationTasks.filter(task => !task.failure).map(task => task.sourceId));
    const point = (id: string, x = 0, y = 0) => positions.get(id) || { x, y };
    const busy = (id: string) => busyIds.has(id) || generationOperationRef.current.has(`node:${id}`) || generationOperationRef.current.has(`retry:${id}`) || pendNodesRef.current.some(node => node.generating && node.operationKey === `node:${id}`);
    return selectionRunTargets(ids, [
      ...(activeProjectRef.current?.members || []).filter(art => selectedIds.has(art.id)).map(art => ({ id: art.id, kind: "image" as const, ...point(art.id, art.canvasX ?? 0, art.canvasY ?? 0), locked: isNodeLocked(art.id), busy: busy(art.id), runnable: canFeature("generate") && art.status === "completed" && !art.videoUrl && art.category !== "audio" && art.category !== "media" && !["workflow-decoration", "workflow-placeholder"].includes(art.source || "") && hasRenderableImage(art.image) })),
      ...textNodesRef.current.filter(node => selectedIds.has(node.id) && node.projectKey === activeKey).map(node => ({ id: node.id, kind: "text" as const, ...point(node.id, node.canvasX, node.canvasY), locked: isNodeLocked(node.id), busy: node.status === "generating" || generationOperationRef.current.has(`text:${node.id}`), runnable: !!(node.content || node.prompt).trim() })),
      ...pendNodesRef.current.filter(node => selectedIds.has(node.id)).map(node => ({ id: node.id, kind: "pending" as const, ...point(node.id, node.x, node.y), busy: node.generating || node.uploading || node.needsAttention || generationOperationRef.current.has(`pend:${node.id}`), runnable: canFeature("generate") && !node.taskId && node.inputs.some(id => activeProjectRef.current?.members.some(art => art.id === id && hasRenderableImage(art.image) && !art.videoUrl) || textNodesRef.current.some(text => text.id === id && text.projectKey === activeKey && text.status !== "generating" && !!(text.content || text.prompt).trim())) })),
    ]);
  }

  const selectionRun=useCanvasSelectionRun({scope:canvasHistory.scope,targets:currentSelectionRunTargets,
    canRun:target=>!readOnly&&nodeSettingsReady&&(target.kind==="text"||canFeature("generate"))&&currentSelectionRunTargets([target.id]).length>0,
    run:async(target,isCurrent)=>{
          if (target.kind === "text") {
            const node = textNodesRef.current.find(node => node.id === target.id);
            return node ? generateTextNode({ node, prompt: node.content || node.prompt, silent: true }) : false;
          }
          if (target.kind === "pending") {
            const pend = pendNodesRef.current.find(node => node.id === target.id);
            if (!pend) return false;
            return generatePend({ pend, prompt: "", forceStandard: true, isCurrent });
          }
          const art = activeProjectRef.current?.members.find(art => art.id === target.id);
          if (!art) return false;
          // Artwork persists prompt/ratio/resolution/style, not an individual
          // model/quality/count recipe. Those retain the current canvas defaults.
          const results = await runGen(art, canvasInheritedImagePrompt(art.prompt), {
            ratio: art.ratio || "1:1", resolution: art.resolution || genResolution,
            style: art.style || "", count: 1, parentId: art.id, refUrls: [art.image],
            isCurrent, operationKey: `node:${art.id}`, taskLabel: L("批量运行中…", "Running selection…"),
          });
          return results.length > 0;
    },
  });
  const batchRunBusy=selectionRun.busy,batchRunProgress=selectionRun;
  async function batchRunSelection(ids=multiSel) {
    if(readOnly||!user||!nodeSettingsReady||historySaving)return;
    setCtxMenu(null);const scope=canvasHistory.scope;
    const result=await selectionRun.start(ids);
    if(result&&scope.viewCurrent())flashTip(L(`批量运行：成功 ${result.succeeded}，失败 ${result.failed}，跳过 ${result.skipped}`,`Batch run: ${result.succeeded} succeeded, ${result.failed} failed, ${result.skipped} skipped`));
  }
  async function batchRunImages(arts:Artwork[]) {await batchRunSelection(arts.map(art=>art.id));}

  const selectionRunCount = nodeSettingsReady ? currentSelectionRunTargets(multiSel).length : 0;
  const batchRunButton = (label: string) => (selectionRunCount > 0 || batchRunBusy) && (
    <button type="button" data-testid="canvas-selection-run" disabled={batchRunBusy || !nodeSettingsReady || historySaving}
      onClick={() => void batchRunSelection()} title={L("分别运行选中节点，跳过锁定和运行中的节点", "Run selected nodes; skip locked or running nodes")}
      className="canvas-ui-primary flex items-center text-xs font-semibold transition-colors disabled:opacity-45">
      {batchRunBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
      {batchRunBusy ? `${L("运行中", "Running")} ${batchRunProgress.completed}/${batchRunProgress.total}` : label}
    </button>
  );

  // 智能帮写:每个反推节点右侧生成成对的帮写节点(@产品图 前缀 + 已绑产品)
  async function assistWriteForNodes(textNodeIds:string[],product:Artwork){
    if(readOnly||!user||!activeKey||assistBusy)return;
    const sources=canvasTextDocument.getSnapshot().nodes.filter(node=>textNodeIds.includes(node.id)&&node.projectKey===activeKey&&!!stripMentionLines(node.content||""));
    if(!sources.length){flashTip(t("canvas.assistNeedContent"));setProductPicker(null);return;}
    setProductPicker(null);const scope=canvasTextDocument.scope,live=new Map((rfRef.current?.getNodes()||[]).map(node=>[node.id,node]));
    const requests=sources.map(source=>{const node=live.get(source.id);return derivedTextTask({mode:"assist",source,product,project:activeKey,title:t("canvas.assistTitle"),productTitle:t("canvas.productNode"),gap:X_GAP,
      position:{x:node?.position.x??source.canvasX,y:node?.position.y??source.canvasY,width:source.width||TEXT_NODE_DEFAULT_W}});});
    const result=await textTasks.batch("assist",requests);
    if(scope.viewCurrent())flashTip(result.failed?L(`帮写：成功 ${result.succeeded}，失败 ${result.failed}`,`Assisted writing: ${result.succeeded} succeeded, ${result.failed} failed`):t("canvas.assistDone"));
  }

  // Text is a universal image prompt; product recipes remain explicit optional modes.
  function textImageScopeCurrent(menu: NonNullable<typeof genImageMenu>) {
    return batchRunMountedRef.current && !readOnly && !!user &&
      menu.account === canvasAccountRef.current && menu.project === activeProjectRef.current?.key &&
      menu.workspace === currentWorkspace() && menu.epoch === canvasContextEpochRef.current && menu.revision === textImageContextRef.current.revision;
  }
  function openTextImageMenu(textNodeIds: string[], imageIds: string[] = []) {
    const project = activeProjectRef.current;
    if (!user || readOnly || !project || !canFeature("generate") || !nodeSettingsReady || textImageSubmittingRef.current) return;
    const ids = Array.from(new Set(textNodeIds)).filter(id => textNodesRef.current.some(node => node.id === id && node.projectKey === project.key));
    if (!ids.length || ids.some(id => isNodeLocked(id) || textNodesRef.current.find(node => node.id === id)?.status === "generating")) return;
    setGenImageMenu({textNodeIds: ids, imageIds: Array.from(new Set(imageIds)),
      drafts: selectedTextId && ids.includes(selectedTextId) ? {[selectedTextId]: textPrompt} : {},
      account: canvasAccountRef.current, project: project.key, workspace: currentWorkspace(), epoch: canvasContextEpochRef.current, revision: textImageContextRef.current.revision});
  }
  function textImageRequests(menu: NonNullable<typeof genImageMenu>, mode: TextImageMode, options: {combine: boolean; useReferences: boolean}) {
    const project = activeProjectRef.current;
    if (!project || !textImageScopeCurrent(menu)) return [];
    return buildTextImageRequests({projectKey: project.key, nodes: textNodesRef.current, textNodeIds: menu.textNodeIds,
      imageIds: project.members.filter(art => !art.videoUrl && !["workflow-decoration", "workflow-placeholder"].includes(art.source || "") && hasRenderableImage(art.image)).map(art => art.id),
      selectedImageIds: menu.imageIds, drafts: menu.drafts, mode, combine: options.combine, useReferences: options.useReferences, maxImages: MAX_TOTAL_IMAGES});
  }
  function textImageReferenceCount(menu: NonNullable<typeof genImageMenu>) {
    const project = activeProjectRef.current;
    if (!project || !textImageScopeCurrent(menu)) return 0;
    const byId = new Map(textNodesRef.current.filter(node => node.projectKey === menu.project).map(node => [node.id, node]));
    const images = new Set(menu.imageIds), visited = new Set<string>(), queue = [...menu.textNodeIds];
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index]; if (visited.has(id)) continue; visited.add(id);
      const node = byId.get(id); if (!node) continue;
      for (const source of node.sourceIds || []) {
        if (byId.has(source)) queue.push(source);
        else if (!source.startsWith("text-")) images.add(source);
      }
      for (const product of node.productIds || []) images.add(product);
    }
    return images.size;
  }
  async function generateImagesFromTextNodes(mode: TextImageMode, options: {combine: boolean; useReferences: boolean}) {
    const menu = genImageMenu;
    if (!menu || !textImageScopeCurrent(menu) || !canFeature("generate") || !nodeSettingsReady || textImageSubmittingRef.current) return;
    const current = () => textImageScopeCurrent(menu);
    textImageSubmittingRef.current = true; setTextImageSubmitting(true);
    try {
      const requests = textImageRequests(menu, mode, options);
      if (!requests.length) return;
      if (requests.some(request => request.textNodeIds.some(isNodeLocked))) {setGenImageMenu(null);flashTip(L("引用的文字节点已锁定", "A referenced text node is locked"));return;}
      // Validate every input before adding any placeholders or starting a billable request.
      setGenImageMenu(null);
      const graph = rfRef.current?.getNodes() || [];
      for (const request of requests) {
        if (!current()) return;
        const node = textNodesRef.current.find(item => item.id === request.anchorTextId && item.projectKey === menu.project);
        if (!node) return;
        const position = graph.find(item => item.id === node.id)?.position || {x: node.canvasX, y: node.canvasY};
        const seq = pendSeqRef.current++;
        const pend: Pend = {id: `pend-${Date.now()}-${seq}`, x: Math.round(position.x + (node.width || TEXT_NODE_DEFAULT_W) + X_GAP),
          y: Math.round(position.y), parentId: request.imageIds[0] || node.id, linked: true,
          label: `${t("canvas.imageNode")} ${seq}`, uploading: false, progress: 0,
          inputs: [...request.imageIds, ...request.textNodeIds]};
        setPendNodes(previous => current() ? [...previous, pend] : previous);
        const succeeded = await generatePend({pend, prompt: request.prompt, forceStandard: true, isCurrent: current});
        // A cancellation, pending/unknown receipt or failure never starts the next purchase.
        if (!succeeded || !current()) return;
      }
    } catch (error) {
      if (!current()) return;
      setGenImageMenu(null);
      const code = (error as {code?: string})?.code;
      const messages: Record<string, string> = {
        EMPTY_TEXT: L("先输入提示词或填写文字节点内容", "Enter a prompt or add text content first"),
        TEXT_BUSY: L("引用的文字仍在生成，请完成后再试", "Referenced text is still generating"),
        MISSING_PRODUCT: t("canvas.textNoProduct"),
        MISSING_REFERENCE: L("引用图片已失效，请重新选择或移除连线", "A reference is unavailable; select it again or remove its link"),
        TOO_MANY_IMAGES: L(`一次最多使用 ${MAX_TOTAL_IMAGES} 张参考图片，请减少引用`, `Use at most ${MAX_TOTAL_IMAGES} reference images`),
        PROMPT_TOO_LONG: L("组合提示词超过 6000 字，请精简或选择逐条创作", "Combined prompt exceeds 6,000 characters; shorten it or create separately"),
      };
      flashTip(messages[code || ""] || (error instanceof Error ? error.message : t("canvas.genFail")));
    } finally {
      textImageSubmittingRef.current = false;
      if (batchRunMountedRef.current) setTextImageSubmitting(false);
    }
  }
  // 底部工具条:从生成历史选择(画布中心)
  function toolHistory() {
    if (readOnly) return;
    const c = centerScreen();
    openHistoryPicker(c.x, c.y);
  }
  function onPendUpload(id: string) {
    pendUploadTargetRef.current = id;
    pendUploadRef.current?.click();
  }
  function onPendRemove(id: string) {
    const retained = editTaskStateRef.current.get(id);
    if (retained) {
      if (retained.account !== canvasAccountRef.current || retained.project !== (activeProjectRef.current?.key || null) || retained.workspace !== currentWorkspace()) return;
      if (retained.node.generating) {
        flashTip("正在执行操作，请稍后再删除");
        return;
      }
      editTaskStateRef.current.delete(id);
    }
    setPendNodes((prev) => prev.filter((p) => p.id !== id));
    setSelectedPendId((cur) => (cur === id ? null : cur));
  }
  // 空白节点生成(文生图 / 合并多输入):用 dock 的提示词 + 输入图(若有)生成,填充本节点
  async function generatePend(opts?: {
    pend?: Pend;
    prompt?: string;
    ratio?: string;
    forceStandard?: boolean;
    referenceInputs?: CanvasImageReference[];
    isCurrent?: () => boolean;
  }): Promise<boolean> {
    if (readOnly || !user) return false;
    // 可传入指定的空白节点(拉线「生成衍生图」用,避免依赖尚未刷新的 state)
    const pend = opts?.pend ?? pendNodes.find((p) => p.id === selectedPendId);
    if (!pend || pend.generating || pend.uploading || pend.needsAttention) return false;
    const text = (opts?.prompt ?? editPrompt).trim();
    const inputArts = pend.inputs
      .map((id) => active?.members.find((m) => m.id === id))
      .filter(Boolean) as Artwork[];
    const referenceInputs = opts?.referenceInputs || (!opts?.forceStandard && pend.id === selectedPendId ? composerReferences : undefined);
    if(referenceInputs){
      const issue=referenceManifestError(text,imageReferenceManifest(referenceInputs));
      if(issue){setGenError(issue);return false;}
      if(pend.inputs.some(id=>!id.startsWith("text-")&&!inputArts.some(art=>art.id===id&&art.image&&!art.videoUrl))){setGenError("已连接的参考图片尚未载入，请同步图片后重试");return false;}
    }
    const inputTextNodeIds = Array.from(
      new Set(
        [pend.parentId, ...pend.inputs].filter(
          (id): id is string => Boolean(id?.startsWith("text-"))
        )
      )
    );
    const inputTextNodes = inputTextNodeIds
      .map((id) => textNodes.find((node) => node.id === id))
      .filter(Boolean) as CanvasTextNode[];
    if (generationMode === "detail" && !opts?.forceStandard) {
      if (!inputArts.length) {
        flashTip(t("canvas.detailNeedRefs"));
        return false;
      }
      await generateDetailSequence(inputArts[0], inputArts, text, [], pend, referenceInputs);
      return false;
    }
    if (!text && !pend.inputs.length) {
      flashTip(t("canvas.pendNeedPrompt"));
      return false;
    }
    const operationKey = `pend:${pend.id}`;
    if (generationOperationRef.current.has(operationKey)) return false;
    generationOperationRef.current.add(operationKey);
    // 没写提示词时:不再注入"生成一张电商商业图"这种会重绘/改风格的通用词
    // (那会让输出莫名其妙变样,还被存成节点提示词)。改为沿用主输入图自身的
    // 提示词(延续它的配方);没有则用"保持主体/构图/风格"的中性词。
    const promptToUse =
      canvasBlankImagePrompt(text,inputTextNodes,inputArts);
    setGenError(null);
    const generationSize = generationPlaceholderSize(opts?.ratio || genRatio);
    const livePend = rfRef.current?.getNode(pend.id)?.position ?? pendNodesRef.current.find(node => node.id === pend.id) ?? pend;
    const generationPosition = generationPositionForTask(livePend, livePend, generationSize, []);
    setPendNodes((prev) =>
      prev.map((p) => (p.id === pend.id ? { ...p, generationFailure: undefined, onGenerationRetry: undefined, generating: true, generationStage: "preparing", generationStartedAt: Date.now(),
        ...generationPosition, generationSize, generationCount: normalizeCanvasCount(genCount) } : p))
    );
    const requestAccount=canvasAccountRef.current,requestProject=activeProjectRef.current?.key||null,requestEpoch=canvasContextEpochRef.current;
    const scope=captureCanvasImageTaskScope(user.email,requestProject,()=>batchRunMountedRef.current&&requestAccount===canvasAccountRef.current&&requestProject===(activeProjectRef.current?.key||null)&&requestEpoch===canvasContextEpochRef.current&&(opts?.isCurrent?.()??true));
    const task=createCanvasImageTask({scope,
      prepare:()=>prepareCanvasImageTask({kind:"blank",scope,operationKey,position:generationPosition,prompt:promptToUse,ratio:opts?.ratio||genRatio,resolution:genResolution,style:genStyle,count:genCount,quality:genQuality,model:genModel,inputs:inputArts,referenceInputs,
        textParentId:pend.parentId?.startsWith("text-")&&inputTextNodes.some(node=>node.id===pend.parentId)?pend.parentId:undefined}),
      submit:async(form,isCurrent)=>privateFetch("/api/generate-image",{method:"POST",headers:await authHeader(),body:form,isCurrent}),
      position:()=>livePendingPosition(pend.id,generationPosition),merge:mergeWorks,history:pushAddUndoMany,
      attached:async(images)=>{
        const newIds=images.map(image=>image.id);
        if(!inputTextNodes.length)return;
        // Merge generated links into today's text document, not the submission snapshot.
        const inputIds=new Set(inputTextNodes.map(node=>node.id));
        const updated=textNodesRef.current.filter(node=>inputIds.has(node.id)).map(node=>({...node,targetIds:Array.from(new Set([...(node.targetIds??[]),...newIds])),updatedAt:new Date().toISOString()}));
        const links=new Map(updated.map(node=>[node.id,node.targetIds]));
        const merge=(nodes:CanvasTextNode[])=>nodes.map(node=>links.has(node.id)?{...node,targetIds:Array.from(new Set([...(node.targetIds??[]),...links.get(node.id)!]))}:node);
        textNodesRef.current=merge(textNodesRef.current);setTextNodes(merge);
        await Promise.all(updated.map(node=>persistTextNode(node)));
      },
      stage:stage=>setPendNodes(nodes=>nodes.map(node=>node.id===pend.id?{...node,generating:true,generationStage:stage,generationFailure:undefined}:node)),
      user:value=>applyServerUser(value as Parameters<typeof applyServerUser>[0]),notice:flashTip,
      errorText:t("canvas.genFail"),saveErrorText:t("canvas.saveFailed"),resultGap:NODE_LABEL_H+24,
    });
    const execute=async():Promise<boolean>=>{
      try{
        const result=await task.run();
        if(result.status==="stale")return false;
        if(result.status==="cancelled"){setPendNodes(nodes=>nodes.map(node=>node.id===pend.id?{...node,generating:false,generationFailure:undefined}:node));return false;}
        if(result.status==="failed"){
          const message=generationFailureMessage(result.failure);
          if(selectedPendIdRef.current===pend.id)setGenError(message);else flashTip(`${pend.label}：${message}`);
          setPendNodes(nodes=>nodes.map(node=>node.id===pend.id?{...node,generating:false,generationFailure:result.failure,onGenerationRetry:retry}:node));return false;
        }
        if(selectedPendIdRef.current===pend.id&&!activeKey)pendingNodeRef.current=result.images[0]?.id||null;
        setPendNodes(nodes=>nodes.filter(node=>node.id!==pend.id));setSelectedPendId(id=>id===pend.id?null:id);if(selectedPendIdRef.current===pend.id)setGenError(null);
        return result.status==="succeeded";
      }finally{generationOperationRef.current.delete(operationKey);}
    };
    const retry=()=>{
      if(!scope.isCurrent()||generationOperationRef.current.has(operationKey))return;
      generationOperationRef.current.add(operationKey);return execute();
    };
    return execute();
  }

  // Placeholder import keeps its saved ID on sync failure; the shared import
  // status resumes reads rather than asking the user to upload the file again.
  async function doUploadPend(files:FileList|null){
    const pendId=pendUploadTargetRef.current;pendUploadTargetRef.current=null;
    const file=files?.length?files[0]:null;
    if(pendUploadRef.current)pendUploadRef.current.value="";
    if(!pendId||!file||!user||readOnly)return;
    const pend=pendNodes.find(node=>node.id===pendId);if(!pend)return;
    const context=canvasImportContext(),scope=canvasArtworkDocument.scope;
    setPendNodes(nodes=>nodes.map(node=>node.id===pendId?{...node,uploading:true,progress:0,generationFailure:undefined,fileInfo:`${file.name} · ${Math.round(file.size/1024)}KB`}:node));
    try{
      await imageImportOwner.uploadPending(file,{pendingId:pendId,parentId:pend.inputs?.[0]||activeRootId(),linked:!!pend.inputs?.length,x:pend.x,y:pend.y},context,{
        progress:progress=>{if(scope.viewCurrent())setPendNodes(nodes=>nodes.map(node=>node.id===pendId?{...node,progress}:node));},
        attached:id=>{setPendNodes(nodes=>nodes.filter(node=>node.id!==pendId));setSelectedPendId(current=>current===pendId?null:current);pendingNodeRef.current=id;},
      });
    }catch(error){if(scope.viewCurrent()){
      setGenError(error instanceof Error?error.message:t("canvas.genFail"));
      const saved=imageImportOwner.pendingBatch(pendId,context);
      setPendNodes(nodes=>nodes.map(node=>node.id===pendId?{...node,uploading:false,
        ...(saved?.nodeIds?.length?{generationFailure:{kind:"sync" as const,message:"图片已保存，画布尚未同步；点击重试读取原结果，无需重新上传"},onGenerationRetry:()=>retryImportSynchronization(saved.id)}:{})}:node));
    }}
  }
  function showCopyTip() {
    setCopyTip(true);
    setTimeout(() => setCopyTip(false), 1500);
  }
  const clipboard=useCanvasClipboard({
    owner:user?.email,account:canvasAccountRef.current,workspace:canvasArtworkDocument.scope.workspace,current:canvasArtworkDocument.scope.documentCurrent,
    imageLabel:t("canvas.imageNode"),selectionLabel:L("画布节点","Canvas nodes"),
    state:()=>({ready,readOnly,browsing,loading,blocked:canvasShortcutLayerOpen,selected:selected||null,selectedId,selectedTextId,multiSel}),
    contains:id=>!!videoNodesStore.getNode(id)||!!directorNodesStore.getNode(id)||!!characterNodesStore.getNode(id)||!!sceneNodesStore.getNode(id)||!!audioNodesStore.getNode(id)||!!timelineNodesStore.getNode(id)||textNodesRef.current.some(node=>node.id===id)||(works||[]).some(node=>node.id===id),
    isVideo:id=>!!videoNodesStore.getNode(id)||!!directorNodesStore.getNode(id)||!!characterNodesStore.getNode(id)||!!sceneNodesStore.getNode(id)||!!audioNodesStore.getNode(id),hasCanvas:()=>!!canvasAreaRef.current,
    center:()=>{const box=canvasAreaRef.current?.getBoundingClientRect();return rfRef.current?.screenToFlowPosition({x:(box?.left??0)+(box?.width??0)/2,y:(box?.top??0)+(box?.height??0)/2},{snapToGrid:false})??{x:0,y:0};},
    workflow:(html,point)=>workflowPaste.paste(html,point),
    images:(files,point)=>{uploadCtxRef.current={parentId:activeRootId(),x:point.x-NODE_W/2,y:point.y-NODE_H/2};const data=new DataTransfer();for(const file of files)data.items.add(file);uploadRoot(data.files);},
    duplicateArtwork:duplicateArt,duplicateNodes:duplicateCanvasNodes,copied:()=>flashTip(t("canvas.copied")),imageCopied:showCopyTip,
  });
  const {hasClip}=clipboard;
  function selectCopiedNodes(result:{idMap:Record<string,string>;projectKey:string},focusSingle=false) {
    const ids=Object.values(result.idMap);setCreatingNew(false);setActiveKey(result.projectKey);setBrowsing(false);
    canvasSelection.patch({selectedId:focusSingle&&ids.length===1?ids[0]:null,selectedTextId:null,selectedPendId:null,multiSel:ids});
    const selection={ids,projectKey:result.projectKey,owner:user!.email.toLowerCase()};pendingNodeSelectionRef.current=selection;
    window.setTimeout(()=>{if(pendingNodeSelectionRef.current===selection)pendingNodeSelectionRef.current=null;},1500);
  }
  async function duplicateCanvasNodes(ids:string[]) {
    if(!user||readOnly)return;const scope=canvasHistory.scope;
    try{const result=await canvasNodeOperations.copy({ids,projectKey:!browsing&&!creatingNew?active?.key:undefined});if(scope.viewCurrent())selectCopiedNodes(result);}
    catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:"复制节点失败");}
  }


  const canvasDrag=useCanvasDrag({
    scope:canvasHistory.scope,selected:multiSel,nodes:rfNodes,artworks:active?.members||[],setNodes:setRfNodes,hold:holdPositions,
    locked:id=>readOnly||!user||isNodeLocked(id),warning:flashTip,
    local:(id,point,finished)=>{
      rememberGenerationDrag(id,point,finished);if(!finished)return;
      if(id.startsWith("task-")){
        generationTaskPosRef.current[id]={...point};
        setGenerationTasks(current=>current.map(task=>task.id===id?{...task,position:{...point}}:task));
      }else if(id.startsWith("pend-"))setPendNodes(current=>current.map(node=>node.id===id?{...node,x:point.x,y:point.y}:node));
    },
    commit:(moves,scope)=>canvasHistory.submit(scope,()=>{const action=compileCanvasMove(moves,id=>{
      const audio=audioNodesStore.getNode(id);if(audio)return {x:audio.x,y:audio.y};
      const timeline=timelineNodesStore.getNode(id);if(timeline)return {x:timeline.x,y:timeline.y};
      const scene=sceneNodesStore.getNode(id);if(scene)return {x:scene.x,y:scene.y};
      const character=characterNodesStore.getNode(id);if(character)return {x:character.x,y:character.y};
      const director=directorNodesStore.getNode(id);if(director)return {x:director.x,y:director.y};
      const video=videoNodesStore.getNode(id);if(video)return {x:video.x,y:video.y};
      const node=id.startsWith("text-")?canvasTextDocument.getSnapshot().nodes.find(node=>node.id===id):canvasArtworkDocument.getSnapshot().nodes?.find(node=>node.id===id);
      return node&&typeof node.canvasX==="number"&&typeof node.canvasY==="number"?{x:node.canvasX,y:node.canvasY}:undefined;
    });if(action)action.artworkBases=Object.fromEntries(moves.flatMap(move=>{const node=canvasArtworkDocument.getSnapshot().nodes?.find(n=>n.id===move.id);return node?[[node.id,artworkFields(node)]]:[]}));return action;}),
  });

  // Explicit node focus / deep links move the view, never the nodes.
  // fitView queues until *all* nodes initialize; a large virtualized project can
  // leave that queue pending. Focus a known node directly, independent of offscreen DOM.
  useEffect(() => {
    if (!focusId || !flowReady) return;
    const node = rfNodes.find(item => item.id === focusId);
    if (!node) return;
    let cancelled = false;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (cancelled) return;
        const instance = rfRef.current;
        if (!instance) return;
        const live = instance.getNode(focusId) ?? node;
        const size = flowNodeSize(live);
        const target = canvasFocusViewport({ ...live.position, ...size }, canvasSize, overlaySafeArea, CANVAS_MIN_ZOOM);
        if (!target) return;
        void instance.setViewport(target, { duration: 280 }).then(ok => {
          if (ok && !cancelled) setFocusId(current => current === focusId ? null : current);
        });
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [focusId, flowReady, rfNodes, canvasSize, overlaySafeArea]);

  // 画布全局快捷键只在画布本体接管。弹窗、遮罩、确认框、侧边编辑器或菜单
  // 打开时必须完全让出键盘，避免用户在账户/帮助等上层界面操作时误删底层节点。
  const canvasShortcutLayerOpen = Boolean(
    accountDockOpen ||
      workspacePages.isOpen ||
      helpOpen ||
      confirmModal ||
      lightbox ||
      productPicker ||
      genImageMenu ||
      trashOpen ||
      historyPicker ||
      annotateArtwork ||
      comfyOpen ||
      ocrArtworkId ||
      (propertiesOpen && (selectedId || selectedTextId)) ||
      cropArtwork ||
      imageComposerMenuOpen ||
      expandOpen ||
        !!videoHistoryId ||
      !!videoMedia ||
      spawnMenu ||
      ctxMenu ||
      addMenuOpen ||
      moreToolsOpen ||
      zoomMenuOpen ||
      sidebarOpen ||
      projectCatalog.menuKey ||
      textComposerExpanded ||
      textComposerMenuOpen
  );

  function performCanvasShortcut(action:CanvasKeyboardAction){
    switch(action.kind){
      case "tool":viewControls.selectTool(action.tool);return;
      case "add-text":{const center=centerScreen();addTextNodeAtScreen(center.x,center.y);return;}
      case "copy":clipboard.copyShortcut();return;
      case "paste-media":clipboard.clearIntent();void clipboard.paste();return;
      case "undo":void doUndo();return;
      case "redo":void doRedo();return;
      case "zoom-in":void viewControls.zoomIn(160);return;
      case "zoom-out":void viewControls.zoomOut(160);return;
      case "fit":void viewControls.fit(240);return;
      case "cut-edge":if(selectedEdge)void cutEdge(selectedEdge);return;
      case "remove":void runDelete(action.ids);return;
      case "remove-text":void removeTextNode(action.id);return;
      case "clear":clearCanvasSelection(true);return;
    }
  }
  useCanvasKeyboard({state:()=>({readOnly,browsing,blocked:canvasShortcutLayerOpen,busy:historyBusyRef.current||cuttingEdgesRef.current.size>0,tool:canvasTool,
    selectedId,selectedTextId,selectedEdge:!!selectedEdge,selectedGenerating,multiSel,
    mediaCopyIntent:clipboard.hasMediaIntent()}),perform:performCanvasShortcut});



  useEffect(() => {
    if (!ready || !user) return;
    const el = canvasAreaRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      // 宿主布局在极窄窗口可能让画布的布局宽度暂时大于可见视口；
      // Dock 必须按真正可见的 CSS 像素收缩，而不是按溢出宽度计算。
      const visibleWidth = Math.max(
        1,
        Math.min(rect.width, window.innerWidth - Math.max(0, rect.left))
      );
      const visibleHeight = Math.max(
        1,
        Math.min(rect.height, window.innerHeight - Math.max(0, rect.top))
      );
      setCanvasSize({ width: visibleWidth, height: visibleHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ready, user, browsing]);

  if (!ready) {
    return (
      <div className="container py-20 text-sm text-muted-foreground">
        {t("canvas.loading")}
      </div>
    );
  }

  if (!user) return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-5 py-20 text-center">
      <h1 className="text-2xl font-semibold">{t("canvas.guestTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("canvas.guestDescription")}</p>
      <div className="flex gap-3">
        <button className="rounded-lg bg-primary px-5 py-2 text-primary-foreground" onClick={() => openAuth("sign-in")}>{t("canvas.guestLogin")}</button>
        <button className="rounded-lg border px-5 py-2" onClick={() => router.push("/")}>{t("canvas.guestHome")}</button>
      </div>
    </div>
  );

  const loading = persistMode === "server" && works === null && canvasArtworkDocument.phase !== "error";

  const generationParameters=canvasModelParameters(imageModels.find(model=>model.id===genModel)?.generationParameters);
  const imageComposerControls:CanvasImageComposerProps["controls"]={
    light:lightCanvas,model:{value:genModel,placeholder:imageModels.find(model=>model.id===genModel)?.label||(canvasImageCatalogError?"模型加载失败":"模型加载中"),
      options:imageModels.map(model=>({value:model.id,modelId:model.id,label:model.label,...(!model.supportsEdit?{note:t("canvas.modelTextOnly")}: {})})),onChange:pickGenerationModel},
    mode:generationMode,onMode:setGenerationMode,ratio:genRatio,resolution:genResolution,parameters:generationParameters,
    onRatio:setGenRatio,onResolution:setGenResolution,count:genCount,onCount:setGenCount,onMenuOpenChange:setImageComposerMenuOpen,
  };
  const imageComposerReferences:Omit<CanvasImageComposerProps["referenceEditor"],"textareaRef"|"placeholder">={
    identity:imageDraft.key||imageDraftNodeId,references:composerReferences,prompt:editPrompt,onPrompt:setEditPrompt,
    onRole:(key,role)=>imageDraft.setReferenceBindings(changeImageReferenceRole(imageReferenceState.bindings,key,role)),
    onRemove:removeComposerReference,onPreview:ref=>setLightbox({src:ref.url,alt:ref.title}),onLocate:locateComposerReference,
    english:locale==="en",error:referenceError,
  };

  const recoveryScope={owner:user.email.toLowerCase(),workspace:currentWorkspace(),project:activeKey||"workspace"};
  const recoveryAccount=canvasAccountRef.current,recoveryEpoch=canvasContextEpochRef.current;
  const recoveryCurrent=()=>recoveryAccount===canvasAccountRef.current&&recoveryEpoch===canvasContextEpochRef.current&&recoveryScope.workspace===currentWorkspace()&&recoveryScope.project===(activeProjectRef.current?.key||"workspace");
  return (
    <PendContext.Provider value={{ onUpload: onPendUpload, onRemove: onPendRemove }}>
    <TextNodeContext.Provider
      value={{
        onRemove: (id) => void removeTextNode(id),
        onCopy: (value) => void copyText(value).then((ok) => ok && showCopyTip()),
        onContentChange: changeTextNodeContent,
        onContentCommit: commitTextNodeContent,
        onResize: resizeTextNode,
        onToggleExpand: toggleTextNodeExpand,
      }}
    >
    <div className={cn(
      "flex h-dvh min-h-[100svh] flex-col overflow-hidden bg-background text-foreground",
      lightCanvas ? "canvas-ui-light" : "dark canvas-ui-dark"
    )}>
      {!readOnly&&<ImagegenPendingRecovery {...recoveryScope} isCurrent={recoveryCurrent} onAttach={async(ids,isMounted,attachment)=>{
        const current=()=>recoveryCurrent()&&isMounted();if(!current())return false;
        const fresh=attachment?await createCanvasImageVersionAttachment({nodeId:attachment.nodeId,merge:mergeWorks})({isCurrent:current,assertCurrent:()=>{if(!current())throw new Error("画布已切换");}},attachment):await mergeWorks(ids,current);if(!current())return false;
        assertGenerationResultsPresent(ids,fresh);
        // A queued React updater is not delivery. Observe the committed canvas
        // after one frame; a suspended/stale render retains its original receipt.
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        return current()&&ids.every(id=>fresh.some(art=>art.id===id&&!!art.image));
      }}/>}
      {(canvasArtworkDocument.error||canvasTextDocument.error) && <div className="fixed top-20 left-1/2 z-[200] flex -translate-x-1/2 flex-col gap-2">
      {canvasArtworkDocument.error && !importSynchronizationVisible && <div role="alert" data-testid="canvas-artwork-load-error" className="flex items-center gap-3 rounded-lg border border-amber-400 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
        <span>{canvasArtworkDocument.error}</span><button className="font-semibold underline" onClick={()=>void canvasArtworkDocument.retry().catch(()=>{})}>重试同步作品</button>
      </div>}
      {canvasTextDocument.error && <div role="alert" data-testid="canvas-text-load-error" className="flex items-center gap-3 rounded-lg border border-amber-400 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
        <span>{canvasTextDocument.error}</span><button className="font-semibold underline" onClick={()=>void canvasTextDocument.load()}>重新加载文字</button>
      </div>}
      </div>}
      {(Object.keys(canvasTextDocument.conflicts).length>0||Object.keys(canvasArtworkDocument.conflicts).length>0)&&<div className="fixed bottom-20 left-1/2 z-[200] flex -translate-x-1/2 flex-col gap-2"><CanvasArtworkConflicts conflicts={canvasArtworkDocument.conflicts} onResolve={resolveArtworkConflict} />
          <CanvasTextConflicts conflicts={canvasTextDocument.conflicts} nodes={textNodes} onResolve={resolveTextConflict}/></div>}
      {unsavedTextCount>0 && <div role="alert" className="fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-500 bg-background px-4 py-3 text-sm shadow-lg">
        <span>{t("canvas.unsavedChanges")} ({unsavedTextCount})</span>
        <button className="font-semibold underline" onClick={()=>void canvasTextDocument.retry()}>{t("canvas.retrySave")}</button>
      </div>}
      {historySaving && <div className="fixed inset-0 z-[190] cursor-wait" aria-label={t("canvas.savingChanges")}>
        <div role="status" className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-background px-4 py-3 text-sm shadow-lg">{t("canvas.savingChanges")}</div>
      </div>}

      {frameChoice.pending&&<FrameRatioDialog key={frameChoice.pending.id} choices={frameChoice.pending.choices} english={locale==="en"} onChoose={id=>frameChoice.choose(frameChoice.pending!.id,id)}/>}
      {/* 占位节点上传用的隐藏 input */}
      <input
        ref={pendUploadRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => doUploadPend(e.target.files)}
      />
      {/* 顶栏:仅项目网格落地页显示(进入项目后用全屏悬浮挂件,见下) */}
      {browsing && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          {/* 左上:画布专属 logo(回主页) */}
          <Link href="/" className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <CachedImage
              src={BRAND_CANVAS_LOGO}
              alt={BRAND}
              className="h-9 w-auto max-w-[180px] object-contain"
            />
            {readOnly && (
              <span className="flex-none rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                只读·查看用户
              </span>
            )}
          </Link>
          {/* 右上:与画布右上角一致(分享暂无项目,故只放 模板/会员/头像) */}
          <div className="flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={() => openModal("templates")}
              title={t("nav.templates")}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ShoppingBag className="h-4 w-4" />
            </button>
            {commerceVisible ? (
              <button
                type="button"
                onClick={() => openModal("plans")}
                className="flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-2.5 py-2 text-xs font-semibold text-amber-500 shadow-sm transition-colors hover:bg-amber-400/20"
              >
                <Crown className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t("canvas.memberDeal")}</span>
                <span className="flex items-center gap-0.5">
                  <Zap className="h-3 w-3" />
                  {credits != null ? credits : "—"}
                </span>
              </button>
            ) : (
              <span className="flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-2 text-xs font-semibold text-muted-foreground shadow-sm">
                <Zap className="h-3.5 w-3.5" />
                {credits != null ? credits : "—"}
              </span>
            )}
            <div ref={accountDockRef} className="relative flex-none">
              <button
                data-testid="canvas-account-dock-trigger"
                type="button"
                onClick={() => setAccountDockOpen((open) => !open)}
                title={user.email}
                aria-expanded={accountDockOpen}
                aria-haspopup="menu"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold uppercase text-primary-foreground shadow-sm transition-transform hover:scale-[1.03]"
              >
                {user.name?.trim().charAt(0) || user.email?.[0] || "U"}
              </button>
              {accountDockOpen && (
                <AccountDockMenu
                  user={user}
                  remaining={credits ?? remaining}
                  dark={accountDockDark}

                  className="right-0 top-11"
                  onClose={() => setAccountDockOpen(false)}
                  onToggleTheme={() => setAccountDockDark(toggleAccountTheme())}
                  onRedeem={() => openRecharge("code")}
                  onSignOut={signOut}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <CanvasProjectMenu active={active} catalog={projectCatalog} readOnly={readOnly} open={sidebarOpen} setOpen={setSidebarOpen} lightCanvas={lightCanvas} t={t} onBrowse={backToBrowser} onTrash={openTrash} onNew={startNewProject} onDelete={deleteProject}/>

        {/* 右:画布 */}
        <div
          ref={canvasAreaRef}
          data-testid="canvas-drop-zone"
          className={cn("canvas-stage relative min-w-0 flex-1 overflow-hidden", lightCanvas && "canvas-light")}
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            dragDepthRef.current += 1;
            if (!readOnly && !browsing && !loading) setFileDragOver(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = readOnly || browsing || loading ? "none" : "copy";
          }}
          onDragLeave={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) setFileDragOver(false);
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.stopPropagation();
            dragDepthRef.current = 0;
            setFileDragOver(false);
            if (readOnly || browsing || loading) return;
            const point = rfRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false });
            if (!point) return;
            uploadCtxRef.current = {
              parentId: activeRootId(), x: point.x - NODE_W / 2, y: point.y - NODE_H / 2,
            };
            setCtxMenu(null);
            setSpawnMenu(null);
            uploadRoot(event.dataTransfer.files);
          }}
          style={{
            // 画布底色 + 点阵,像素级对齐原型 .cvz/.board;浅色模式换白底深点
            backgroundColor: lightCanvas ? "#f5f6f8" : "#0e0f13",
            backgroundImage: lightCanvas
              ? "radial-gradient(circle, rgba(15,23,42,0.10) 1px, transparent 1px)"
              : "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        >
          {!browsing && workflowPaste.status}
          <CanvasProjectBrowser key={`${canvasArtworkDocument.scope.account}:${canvasArtworkDocument.scope.workspace}`} visible={!loading && browsing}
            months={projectMonths} catalog={projectCatalog} readOnly={readOnly} t={t} onNew={startNewProject} onWorkflow={startWorkflow} onOpen={openProject} onDelete={deleteProject}/>
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("canvas.loading")}
            </div>
          ) : canvasArtworkDocument.phase === "error" && works === null ? (
            <div data-testid="canvas-artwork-unavailable" className="flex h-full items-center justify-center text-sm text-slate-600">作品暂未加载</div>
          ) : browsing ? null : (

              <ReactFlow
              key={active?.key ?? "__new__"}
              colorMode="dark"
              style={{ background: "transparent" }}
              className={cn(
                // Promote two render surfaces, not hundreds of individual cards.
                // Selected/linking edges retain React Flow's original z-index plane.
                !selectedEdge && !linking && "canvas-render-layers",
                boxSelectMode && "canvas-box-select",
                canvasTool === "move" && "canvas-select-tool",
                canvasTool === "hand" && "canvas-hand-tool",
                linking && "canvas-linking"
              )}
              connectionRadius={32}
              nodes={rfNodes}
              elevateNodesOnSelect={false}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={canvasNodeTypes}
              edgeTypes={canvasEdgeTypes}
              onInit={(inst) => {
                rfRef.current = inst;
                setFlowReady(value => value + 1);
                viewportRef.current = inst.getViewport();
                setViewport(viewportRef.current);
              }}
              onMove={(event, vp) => {
                recordCanvasNativeMove(event);
                viewportRef.current = vp;
                updateLiveViewport(vp);
              }}
              onMoveEnd={(_, vp) => {
                viewportRef.current = vp;
                updateLiveViewport(vp);
                setViewport(previous => canvasZoomState(previous, vp));
              }}
              onNodeClick={(event,node)=>{
                if(canvasTool==="hand"||node.id.startsWith("task-"))return;
                const art=active?.members.find(item=>item.id===node.id),group=art?.canvasGroupId?active?.members.filter(item=>item.canvasGroupId===art.canvasGroupId).map(item=>item.id)||[]:[];
                const patch=canvasNodeClick(node.id,event.ctrlKey||event.metaKey||event.shiftKey,group);canvasSelection.patch(patch);
                setRfEdges(current=>current.map(edge=>edge.selected?{...edge,selected:false}:edge));
                if(patch.multiSel){const ids=new Set(patch.multiSel);setRfNodes(current=>current.map(item=>({...item,selected:ids.has(item.id)})));}
              }}
              onNodeDoubleClick={(_, node) => {
                if(characterNodesStore.nodes.some(item=>item.id===node.id)){openCharacterEditor(node.id);return;}
                if(audioNodesStore.nodes.some(item=>item.id===node.id)){openAudioEditor(node.id);return;}
                if(timelineNodesStore.nodes.some(item=>item.id===node.id)){openTimelineEditor(node.id);return;}
                if(sceneNodesStore.nodes.some(item=>item.id===node.id)){openSceneEditor(node.id);return;}
                if(directorNodesStore.nodes.some(item=>item.id===node.id)){openDirectorEditor(node.id);return;}
                if(videoNodesStore.nodes.some(item=>item.id===node.id)){openVideoEditor(node.id);return;}
                const m = active?.members.find((x) => x.id === node.id);
                if (m) setLightbox({ src: m.image, alt: m.title });
              }}
              // 连线交互:悬停出剪刀提示可剪断;点击=选中(RF 原生连线选择),
              // 选中后按 Delete/Backspace 才真正剪断,防止点一下误删。
              onEdgeClick={(_, edge) => {
                if (canvasTool === "hand" || edge.selectable === false) return;
                setSelectedId(null);
                setSelectedTextId(null);
                setSelectedPendId(null);
                setMultiSel([]);
                setRfNodes(current => current.map(node => node.selected ? { ...node, selected: false } : node));
                setSelectedEdge({ id: edge.id, source: edge.source, target: edge.target });
                setRfEdges(current => current.map(item => ({ ...item, selected: item.id === edge.id })));
              }}
              onEdgeMouseMove={
                readOnly
                  ? undefined
                  : (ev, edge) => {
                      if (canvasTool === "hand" || ev.buttons || edge.selectable === false) return;
                      const rect =
                        canvasAreaRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      edgeHoverHintRef.current?.show({
                        x: ev.clientX - rect.left,
                        y: ev.clientY - rect.top,
                      });
                    }
              }
              onEdgeMouseLeave={readOnly ? undefined : () => edgeHoverHintRef.current?.clear()}
              onPaneClick={() => {
                setSelectedId(null);
                setSelectedPendId(null);
                setSelectedTextId(null);
                clearCanvasSelection();
                setCtxMenu(null);
                edgeHoverHintRef.current?.clear();
              }}
              onMoveStart={() => {
                if (spawnMenu) setSpawnMenu(null);
                // 菜单遮罩处理用户点击关闭；程序化视口动画不应取消右键菜单。
              }}
              onNodeContextMenu={onNodeContextMenu}
              onPaneContextMenu={onPaneContextMenu}
              onSelectionChange={({nodes,edges})=>canvasSelection.update(state=>canvasFlowSelection(state,nodes,edges))}
              onSelectionStart={() => {
                setSelectedId(null);
                setSelectedPendId(null);
                setSelectedTextId(null);
                setCtxMenu(null);
              }}
              onNodeDragStart={(_,node,nodes)=>canvasDrag.start(node,nodes)}
              onNodeDrag={(_,node)=>canvasDrag.move(node)}
              onNodeDragStop={(_,node,nodes)=>void canvasDrag.finish(node,nodes)}
              onSelectionDragStart={(_,nodes)=>canvasDrag.startMany(nodes)}
              onSelectionDragStop={(_,nodes)=>void canvasDrag.finishMany(nodes)}
              onConnectStart={onConnectStart}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              minZoom={CANVAS_MIN_ZOOM}
              maxZoom={CANVAS_MAX_ZOOM}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={!readOnly && canvasTool !== "hand"}
              nodesConnectable={!readOnly && canvasTool !== "hand"}
              elementsSelectable={canvasTool !== "hand"}
              deleteKeyCode={null}
              // V/M drag empty space to select; H alone owns left-button panning.
              // Space and the middle button still provide temporary panning.
              panOnDrag={canvasTool === "hand" ? [0, 1] : [1]}
              selectionOnDrag={canvasTool !== "hand"}
              selectionMode={SelectionMode.Partial}
              selectionKeyCode={canvasTool === "hand" ? null : "Shift"}
              multiSelectionKeyCode={["Control", "Meta", "Shift"]}
              panActivationKeyCode="Space"
              panOnScroll
              zoomOnScroll={false}
              zoomOnPinch
              zoomActivationKeyCode={["Control", "Meta"]}
              snapToGrid={snapGrid}
              snapGrid={[16, 16]}
              onlyRenderVisibleElements={shouldVirtualizeCanvas(rfNodes.length, rfEdges.length)}
            >
              <CanvasPerformanceProbe />
              <CanvasRenderLayerGuard />
              {showMinimap && (
                <MiniMap
                  pannable
                  zoomable
                  position="bottom-left"
                  // 显示在左下角工具条上方(而不是右侧)
                  style={{ left: 16, bottom: canvasSize.width > 0 && canvasSize.width < 800 ? 128 : 84, margin: 0 }}
                  maskColor={lightCanvas ? "rgba(91,103,120,0.16)" : "rgba(0,0,0,0.55)"}
                />
              )}
            </ReactFlow>
          )}

          {/* 剪刀:鼠标在连线上时跟随光标(pointer-events-none,点击穿透到线 → onEdgeClick 剪断) */}
          {!browsing && !readOnly && <CanvasEdgeHoverHint key={"edge-hover:" + (activeKey || "__new__")} ref={edgeHoverHintRef} />}

          {/* ── 进入项目后的全屏悬浮挂件(对齐原型:左上项目/右上挂件/底部工具条) ── */}
          {!browsing && (
            <>
              <CanvasProjectTitle active={active} catalog={projectCatalog} readOnly={readOnly} open={sidebarOpen} setOpen={setSidebarOpen} t={t}/>

              {/* 右上:分享(下载)/ 模板库 / 会员特惠+积分 / 头像 */}
              <div data-testid="canvas-top-actions" style={{ top: canvasSize.width > 0 && canvasSize.width < 768 ? 60 : 12 }} className="absolute right-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 overflow-visible">
                {!readOnly && canFeature("agent") && <CanvasAgentToggle open={assistantVisible} label={t("canvas.assistant.entry")} onClick={toggleAssistant} />}
                {active && (
                  <button
                    type="button"
                    onClick={downloadProject}
                    disabled={zipping}
                    title={t("canvas.downloadProject")}
                    className="canvas-ui-surface canvas-ui-action flex h-9 w-9 items-center justify-center rounded-xl border backdrop-blur transition-colors disabled:opacity-50"
                  >
                    {zipping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openModal("templates")}
                  title={t("nav.templates")}
                  className="canvas-ui-surface canvas-ui-action flex h-9 w-9 items-center justify-center rounded-xl border backdrop-blur transition-colors"
                >
                  <ShoppingBag className="h-4 w-4" />
                </button>
                {commerceVisible ? (
                  <button
                    type="button"
                    onClick={() => openModal("plans")}
                    className="flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-2.5 py-2 text-xs font-semibold text-amber-300 shadow-lg backdrop-blur transition-colors hover:bg-amber-400/20"
                  >
                    <Crown className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{t("canvas.memberDeal")}</span>
                    <span className="flex items-center gap-0.5">
                      <Zap className="h-3 w-3" />
                      {credits != null ? credits : "—"}
                    </span>
                  </button>
                ) : (
                  <span className="canvas-ui-surface canvas-ui-muted flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-semibold backdrop-blur max-[390px]:hidden">
                    <Zap className="h-3.5 w-3.5" />
                    {credits != null ? credits : "—"}
                  </span>
                )}
                <div ref={accountDockRef} className="relative flex-none">
                  <button
                    data-testid="canvas-account-dock-trigger"
                    type="button"
                    onClick={() => setAccountDockOpen((open) => !open)}
                    title={user.email}
                    aria-expanded={accountDockOpen}
                    aria-haspopup="menu"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold uppercase text-primary-foreground shadow-lg transition-transform hover:scale-[1.03]"
                  >
                    {user.name?.trim().charAt(0) || user.email?.[0] || "U"}
                  </button>
                  {accountDockOpen && (
                    <AccountDockMenu
                      user={user}
                      remaining={credits ?? remaining}
                      dark={accountDockDark}

                      className="right-0 top-11"
                      onClose={() => setAccountDockOpen(false)}
                      onToggleTheme={() => setAccountDockDark(toggleAccountTheme())}
                      onRedeem={() => openRecharge("code")}
                      onSignOut={signOut}
                    />
                  )}
                </div>
              </div>

              {/* 常用工具常驻底部，完整创建菜单与设置向上飞出。 */}
              {!readOnly && (
                <div
                  data-testid="canvas-main-toolbar"
                  style={{ bottom: canvasSize.width > 0 && canvasSize.width < 1000 ? 76 : 20 }}
                  aria-label={t("canvas.toolPalette")}
                  className="canvas-ui-surface absolute bottom-[76px] left-1/2 z-30 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-0 overflow-x-auto rounded-2xl border px-1 py-1.5 text-[#20242c] shadow-[0_12px_34px_rgba(15,23,42,0.18)] backdrop-blur min-[390px]:gap-0.5 min-[390px]:px-1.5 min-[800px]:bottom-5"
                >
                  <CanvasToolButtons tool={canvasTool} onSelect={viewControls.selectTool} t={t}/>

                  <span className="mx-0.5 h-5 w-px flex-none bg-[var(--canvas-ui-border)] sm:mx-1 sm:h-6" />

                  <CanvasActionMenu label={t("canvas.addNode")} light={lightCanvas} disabled={readOnly}
                    open={addMenuOpen} onOpenChange={open => { setMoreToolsOpen(false); setAddMenuOpen(open); }}
                    triggerIcon={Plus} iconOnly triggerTestId="canvas-add-node-button" menuTestId="canvas-create-menu"
                    triggerClassName="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:h-9 sm:w-9"
                    items={canvasNodeMenuItems({ L, readOnly, videoDisabled: !canFeature("video") || videoNodeCreateDisabled, onCreate: kind => createCanvasNode(kind) })}
                  />
                  <button type="button" data-tool="text" aria-label={t("canvas.toolbar.addText")} title={t("canvas.toolbar.addText")}
                    onClick={() => { const c = centerScreen(); addTextNodeAtScreen(c.x, c.y); }}
                    className="canvas-ui-action flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9">
                    <Type className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <button type="button" data-tool="image-node" aria-label={t("canvas.toolbar.addImageNode")} title={t("canvas.toolbar.addImageNode")}
                    onClick={toolAddNode}
                    className="canvas-ui-action flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9">
                    <ImagePlus className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <button type="button" data-tool="upload" aria-label={t("canvas.uploadImage")} title={t("canvas.uploadImage")}
                    onClick={() => { const c = centerScreen(); triggerUpload(c.x, c.y); }}
                    className="canvas-ui-action flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9">
                    <Upload className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <button type="button" data-tool="history" aria-label={t("canvas.fromHistory")} title={t("canvas.fromHistory")}
                    onClick={toolHistory}
                    className="canvas-ui-action flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9">
                    <Clock className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <span className="mx-0.5 h-5 w-px flex-none bg-[var(--canvas-ui-border)] sm:mx-1 sm:h-6" />
                  <button type="button" data-tool="undo" aria-label={t("canvas.undo")} title={`${t("canvas.undo")} (${shortcut("Z")})`}
                    disabled={historySaving || (directorNodesStore.saving||characterNodesStore.saving||sceneNodesStore.saving||audioNodesStore.saving||timelineNodesStore.saving) || undoStack.length === 0} onClick={() => void doUndo()}
                    className="canvas-ui-action flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors disabled:opacity-40 sm:h-9 sm:w-9">
                    <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <button type="button" data-tool="redo" aria-label={t("canvas.redo")} title={`${t("canvas.redo")} (${isMac ? "⇧⌘Z" : "CtrlY"})`}
                    disabled={historySaving || (directorNodesStore.saving||characterNodesStore.saving||sceneNodesStore.saving||audioNodesStore.saving||timelineNodesStore.saving) || redoStack.length === 0} onClick={() => void doRedo()}
                    className="canvas-ui-action flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors disabled:opacity-40 sm:h-9 sm:w-9">
                    <RotateCw className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <CanvasActionMenu label={t("canvas.toolbar.settings")} light={lightCanvas}
                    open={moreToolsOpen} onOpenChange={open => { setAddMenuOpen(false); setMoreToolsOpen(open); }}
                    iconOnly dataTool="more" menuTestId="canvas-more-tools-menu"
                    triggerClassName="canvas-ui-action flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9"
                    items={[
                      { id: "help", icon: Keyboard, label: t("canvas.shortcuts"), onSelect: () => setHelpOpen(true) },
                    ]}
                  />
                </div>
              )}

              {mixedNativeSelection&&!readOnly&&<BatchSelectionToolbar label={L("节点操作","Node actions")} selectionLabel={L(`已选择 ${multiSel.length} 个节点`,`${multiSel.length} nodes selected`)} clearLabel={t("canvas.batchClear")} testId="mixed-node-batch-bar" onClear={()=>clearCanvasSelection(true)} primaryAction={batchRunButton(L(`批量运行 (${selectionRunCount})`, `Run selection (${selectionRunCount})`))}>
                {selectedTextBatchNodes.length > 0 && selectedBatchArts.length > 0 && <FeatureVisible feature="generate"><button type="button" className="canvas-ui-action rounded-lg px-3 py-2 text-xs" disabled={!nodeSettingsReady || textImageSubmitting || selectedTextBatchNodes.some(node => isNodeLocked(node.id) || node.status === "generating")} onClick={() => openTextImageMenu(selectedTextBatchNodes.map(node => node.id), selectedBatchIds)}><ImageIcon className="mr-1.5 inline h-4 w-4" />{t("canvas.genImages")}</button></FeatureVisible>}
                <button type="button" className="canvas-ui-action rounded-lg px-3 py-2 text-xs" onClick={()=>clipboard.copySelection(multiSel)}>{t("canvas.copyNode")}</button>
                <button type="button" className="canvas-ui-action rounded-lg px-3 py-2 text-xs" disabled={historySaving||multiSel.some(isNodeLocked)} onClick={()=>void duplicateCanvasNodes(multiSel)}>{t("canvas.duplicate")}</button>
                <button type="button" className="canvas-ui-action rounded-lg px-3 py-2 text-xs" disabled={historySaving||multiSel.some(isNodeLocked)} onClick={()=>batchDelete(multiSel)}>{t("canvas.delete")}</button>
              </BatchSelectionToolbar>}
              {(selectedBatchArts.length > 1 || multiSel.length > 1 && multiSel.some(id => pendNodes.some(node => node.id === id))) && !readOnly && !mixedNativeSelection && (
                <BatchSelectionToolbar
                  label={t("canvas.batchActions")}
                  testId="image-batch-bar"
                  primaryAction={batchRunButton(t("canvas.batchRunImages"))}
                  selectionLabel={fmt(t("canvas.batchSelected"), { n: multiSel.length })}
                  clearLabel={t("canvas.batchClear")}
                  onClear={() => clearCanvasSelection(true)}
                >
                  <button
                    type="button"
                    disabled={selectedBatchArts.length < 2}
                    onClick={() =>
                      void (selectedBatchCanvasGroupId
                        ? ungroupBatchSelection()
                        : groupBatchSelection())
                    }
                    className="flex h-9 items-center gap-1.5 canvas-ui-control rounded-xl border px-3 text-xs font-semibold transition-colors"
                  >
                    <Combine className="h-4 w-4" />
                    {t(
                      selectedBatchCanvasGroupId
                        ? "canvas.batchUngroup"
                        : "canvas.batchGroup"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={selectedBatchArts.length < 2}
                    onClick={createMergeNodeFromSelection}
                    className="flex h-9 items-center gap-1.5 rounded-xl canvas-ui-primary px-3 text-xs font-semibold text-white transition-colors hover:opacity-90"
                  >
                    <Combine className="h-4 w-4" />
                    {t("canvas.batchGenerate")}
                  </button>
                  <button
                    type="button"
                    disabled={promptMining || selectedBatchArts.length < 2}
                    onClick={() => void reversePromptsForSelection(selectedBatchArts)}
                    title={t("canvas.batchRunText")}
                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold canvas-ui-action transition-colors disabled:opacity-45"
                  >
                    {promptMining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Type className="h-4 w-4" />}
                    {t("canvas.batchRunText")}
                  </button>
                  <button
                    type="button"
                    disabled={promptMining || selectedBatchArts.length < 2}
                    onClick={() => void reversePromptsForSelection(selectedBatchArts)}
                    title={t("canvas.reverseHint")}
                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold canvas-ui-action transition-colors disabled:opacity-45"
                  >
                    {promptMining ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ScanSearch className="h-4 w-4" />
                    )}
                    {t("canvas.reversePrompt")}
                  </button>
                  <button
                    type="button"
                    disabled={selectedBatchArts.length < 2}
                    onClick={() => void markBatchSelection()}
                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold canvas-ui-action transition-colors"
                  >
                    <MapPin className="h-4 w-4" />
                    {t(
                      selectedBatchAllMarked
                        ? "canvas.batchUnmark"
                        : "canvas.batchMark"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={stitching || selectedBatchArts.length < 2}
                    onClick={() => void stitchBatchSelection()}
                    title={t("canvas.stitchOrderHint")}
                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold canvas-ui-action transition-colors disabled:opacity-45"
                  >
                    {stitching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <GalleryVerticalEnd className="h-4 w-4" />
                    )}
                    {t("canvas.batchStitch")}
                  </button>
                  <button
                    type="button"
                    disabled={zipping || selectedBatchArts.length < 2}
                    onClick={() => void downloadBatchSelection()}
                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold canvas-ui-action transition-colors disabled:opacity-45"
                  >
                    {zipping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {t("canvas.batchDownload")}
                  </button>
                  <button
                    type="button"
                    onClick={() => batchDelete(selectedBatchIds)}
                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-[#d24b45] transition-colors hover:bg-[#fff0ef]"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("canvas.delete")}
                  </button>
                </BatchSelectionToolbar>
              )}
              {selectedTextBatchNodes.length > 1 && !readOnly && !mixedNativeSelection && selectedBatchArts.length === 0 && (
                <BatchSelectionToolbar
                  label={t("canvas.textBatchActions")}
                  testId="text-batch-bar"
                  primaryAction={batchRunButton(t("canvas.batchRunText"))}
                  selectionLabel={fmt(t("canvas.textBatchSelected"), { n: selectedTextBatchNodes.length })}
                  clearLabel={t("canvas.batchClear")}
                  onClear={() => clearCanvasSelection(true)}
                >
                  <button
                    type="button"
                    disabled={assistBusy}
                    onClick={() =>
                      setProductPicker({
                        textNodeIds: selectedTextBatchNodes.map((node) => node.id),
                      })
                    }
                    className="flex h-9 items-center gap-1.5 rounded-xl canvas-ui-primary px-3 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-45"
                  >
                    {assistBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PenLine className="h-4 w-4" />
                    )}
                    {t("canvas.assistWrite")}
                  </button>
                  <button
                    type="button"
                    disabled={!canFeature("generate") || !nodeSettingsReady || textImageSubmitting || selectedTextBatchNodes.some(node => isNodeLocked(node.id) || node.status === "generating")}
                    onClick={() =>
                      openTextImageMenu(selectedTextBatchNodes.map((node) => node.id))
                    }
                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold canvas-ui-action transition-colors"
                  >
                    <ImageIcon className="h-4 w-4" />
                    {t("canvas.genImages")}
                  </button>
                </BatchSelectionToolbar>
              )}
            </>
          )}

          {fileDragOver && (
            <div className="pointer-events-none absolute inset-3 z-50 flex items-center justify-center border-2 border-dashed border-sky-400 bg-sky-50/90" data-testid="canvas-drop-hint">
              <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <Upload className="h-5 w-5" />{t("canvas.importDropHint")}
              </div>
            </div>
          )}
          <CanvasImageImportStatus batches={imageImports} owner={user?.email||""} active={active} locale={locale} t={t}
            onDismiss={imageImportOwner.dismiss} onSynchronize={id=>void retryImportSynchronization(id)}
            onLocate={id=>{setSelectedId(null);setSelectedTextId(null);setSelectedPendId(null);setFocusId(id);}} />

          {/* 新建项目空白画布:引导文案(右键即可加节点) */}
          {creatingNew && !active && pendNodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="canvas-ui-control flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed text-2xl">
                ＋
              </div>
              <p className="canvas-ui-muted max-w-xs text-sm">
                {t("canvas.newCanvasHint")}
              </p>
            </div>
          )}

          {/* 左下角视图工具:整理画布 / 小地图 / 网格吸附 / 适应视图 / 画布颜色 / 缩放% */}
          {!browsing && (active || creatingNew) && (
            <CanvasViewToolbar controls={viewControls} zoom={viewport.zoom} readOnly={readOnly} tidyDisabled={historySaving||!nodeSettingsReady||!textNodesReady} onTidy={tidyLayout} t={t}/>
          )}

          {/* 拉线落空白:新建节点菜单(基于源图衍生) */}
          {spawnMenu &&
            (() => {
              const src =
                active?.members.find((m) => m.id === spawnMenu.sourceId) ??
                textNodes.find((node) => node.id === spawnMenu.sourceId);
              if (!src) return null;
              return (
                <>
                  <div
                    className="absolute inset-0 z-40"
                    onPointerDown={() => setSpawnMenu(null)}
                  />
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      left: Math.max(8, Math.min(spawnMenu.x, (canvasAreaRef.current?.clientWidth ?? 9999) - 212)),
                      top: Math.max(8, Math.min(spawnMenu.y, (canvasAreaRef.current?.clientHeight ?? 9999) - 230)),
                    }}
                    className="canvas-ui-surface menu-pop absolute z-50 w-[204px] overflow-hidden rounded-2xl border p-1.5"
                  >
                    <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold text-muted-foreground">
                      {t("canvas.spawnTitle")}
                    </p>
                    {[
                      { key: "image", icon: ImageIcon, label: t("canvas.spawnImage") },
                      { key: "upload", icon: Upload, label: t("canvas.spawnUpload") },
                      ...(!spawnMenu.sourceId.startsWith("text-")
                        ? [{ key: "text", icon: Type, label: t("canvas.textGenerate") }]
                        : []),
                    ].map((it) => (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => void spawnNode(it.key)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                      >
                        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-secondary text-[15px]">
                          <it.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                        </span>
                        {it.label}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}

          {/* 上传图片作根节点(隐藏 input,右键「上传图片/添加节点」触发) */}
          <input
            ref={rootUploadRef}
            data-testid="canvas-image-input"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void uploadRoot(e.target.files)}
          />

          {/* 右键菜单(5c):节点 / 空白 */}
          {ctxMenu &&
            (() => {
              const node = ctxMenu.nodeId
                ? active?.members.find((m) => m.id === ctxMenu.nodeId)
                : null;
              const textNode = textNodes.find(item => item.id === ctxMenu.nodeId && item.projectKey === activeKey);
              const pendNode = pendNodes.find(item => item.id === ctxMenu.nodeId);
              const videoNode=videoNodesStore.nodes.find(item=>item.id===ctxMenu.nodeId&&item.projectKey===activeKey);
              const directorNode=directorNodesStore.nodes.find(item=>item.id===ctxMenu.nodeId&&item.projectKey===activeKey);
              const sceneNode=sceneNodesStore.nodes.find(item=>item.id===ctxMenu.nodeId&&item.projectKey===activeKey);
              const audioNode=audioNodesStore.nodes.find(item=>item.id===ctxMenu.nodeId&&item.projectKey===activeKey)||null;
              const timelineNode=timelineNodesStore.nodes.find(item=>item.id===ctxMenu.nodeId&&item.projectKey===activeKey)||null;
              const characterNode=characterNodesStore.nodes.find(item=>item.id===ctxMenu.nodeId&&item.projectKey===activeKey);
              if (ctxMenu.nodeId && !node && !textNode && !pendNode&&!videoNode&&!directorNode&&!characterNode&&!sceneNode&&!audioNode&&!timelineNode) return null;
              const mutationDisabled = readOnly || !nodeSettingsReady || historySaving || (directorNodesStore.saving||characterNodesStore.saving||sceneNodesStore.saving||audioNodesStore.saving||timelineNodesStore.saving) || Boolean(ctxMenu.nodeId && isNodeLocked(ctxMenu.nodeId));
              const Sep = () => <div className="canvas-ui-divider my-1 h-px" />;
              const batchContextSelection = Boolean(
                node &&
                  selectedBatchArts.length > 1 &&
                  selectedBatchIds.includes(node.id)
              );
              const menu = (
                <ContextMenuSurface x={ctxMenu.cx} y={ctxMenu.cy} light={lightCanvas} onClose={() => setCtxMenu(null)}>
                    {node && batchContextSelection ? (
                      /* 已选图片组内右键：保留整组选择并直接提供批量对象操作。 */
                      <>
                        <p
                          data-testid="canvas-batch-context-count"
                          className="canvas-ui-muted px-3 py-2 text-xs font-semibold"
                        >
                          {fmt(t("canvas.batchSelected"), {
                            n: selectedBatchArts.length,
                          })}
                        </p>
                        <Item
                          label={t("canvas.removeFromBatchSelection")}
                          onClick={() =>
                            toggleArtworkBatchSelection(node.id, multiSel)
                          }
                        />
                        <Item
                          label={t(
                            selectedBatchCanvasGroupId
                              ? "canvas.batchUngroup"
                              : "canvas.batchGroup"
                          )}
                          disabled={readOnly}
                          onClick={() =>
                            void (selectedBatchCanvasGroupId
                              ? ungroupBatchSelection()
                              : groupBatchSelection())
                          }
                        />
                        <Item
                          label={t("canvas.batchGenerate")}
                          disabled={readOnly || selectedBatchArts.length < 2}
                          onClick={createMergeNodeFromSelection}
                        />
                        <Sep />
                        <FeatureVisible feature="generate"><Item
                          label={t("canvas.batchRunImages")}
                          disabled={batchRunBusy || readOnly || !nodeSettingsReady || selectionRunCount === 0}
                          onClick={() => void batchRunImages(selectedBatchArts)}
                        /></FeatureVisible>
                        <Item
                          label={t("canvas.batchRunText")}
                          disabled={promptMining || readOnly}
                          onClick={() =>
                            void reversePromptsForSelection(selectedBatchArts)
                          }
                        />
                        <Item
                          label={t("canvas.batchStitch")}
                          disabled={stitching || readOnly}
                          onClick={() => void stitchBatchSelection()}
                        />
                        <Sep />
                        <Item
                          label={t(
                            selectedBatchAllMarked
                              ? "canvas.batchUnmark"
                              : "canvas.batchMark"
                          )}
                          disabled={readOnly || selectedBatchArts.length < 2}
                          onClick={() => void markBatchSelection()}
                        />
                        <Item
                          label={t("canvas.batchDownload")}
                          disabled={zipping}
                          onClick={() => void downloadBatchSelection()}
                        />
                        <Item
                          label={t("canvas.delete")}
                          disabled={readOnly}
                          danger
                          onClick={() => batchDelete(selectedBatchIds)}
                        />
                      </>
                    ) : characterNode ? (
                      <>
                        <Item label={L("编辑角色","Edit character")} onClick={()=>openCharacterEditor(characterNode.id)}/>
                        <Item label={L("属性设置","Properties")} disabled={readOnly} onClick={()=>{setSelectedId(characterNode.id);openProperties();}}/>
                        {nodeManagementItems(characterNode.id).map(item=><Item key={item.id} label={item.label} disabled={item.disabled} onClick={item.onSelect}/>)}
                        <Sep/>
                        <Item label={t("canvas.copyNode")} onClick={()=>clipboard.copySelection(multiSel.includes(characterNode.id)?multiSel:[characterNode.id])}/>
                        <Item label={t("canvas.duplicate")} disabled={mutationDisabled} onClick={()=>void duplicateCanvasNodes(multiSel.includes(characterNode.id)?multiSel:[characterNode.id])}/>
                        <Item label={t("canvas.delete")} disabled={mutationDisabled} danger onClick={()=>batchDelete(multiSel.includes(characterNode.id)?multiSel:[characterNode.id])}/>
                      </>
                    ) : audioNode ? (
                      <>
                        <Item label={L("编辑音频","Edit audio")} onClick={()=>openAudioEditor(audioNode.id)}/>
                        <Item label={L("属性设置","Properties")} disabled={readOnly} onClick={()=>{setSelectedId(audioNode.id);openProperties();}}/>
                        {nodeManagementItems(audioNode.id).map(item=><Item key={item.id} label={item.label} disabled={item.disabled} onClick={item.onSelect}/>)}
                        <Sep/>
                        <Item label={t("canvas.copyNode")} onClick={()=>clipboard.copySelection(multiSel.includes(audioNode.id)?multiSel:[audioNode.id])}/>
                        <Item label={t("canvas.duplicate")} disabled={mutationDisabled} onClick={()=>void duplicateCanvasNodes(multiSel.includes(audioNode.id)?multiSel:[audioNode.id])}/>
                        <Item label={t("canvas.delete")} disabled={mutationDisabled} danger onClick={()=>batchDelete(multiSel.includes(audioNode.id)?multiSel:[audioNode.id])}/>
                      </>
                    ) : timelineNode ? (
                      <>
                        <Item label={L("编辑多轨","Edit timeline")} onClick={()=>openTimelineEditor(timelineNode.id)}/>
                        <Item label={L("属性设置","Properties")} disabled={readOnly} onClick={()=>{setSelectedId(timelineNode.id);openProperties();}}/>
                        {nodeManagementItems(timelineNode.id).map(item=><Item key={item.id} label={item.label} disabled={item.disabled} onClick={item.onSelect}/>)}
                        <Sep/>
                        <Item label={t("canvas.copyNode")} onClick={()=>clipboard.copySelection(multiSel.includes(timelineNode.id)?multiSel:[timelineNode.id])}/>
                        <Item label={t("canvas.duplicate")} disabled={mutationDisabled} onClick={()=>void duplicateCanvasNodes(multiSel.includes(timelineNode.id)?multiSel:[timelineNode.id])}/>
                        <Item label={t("canvas.delete")} disabled={mutationDisabled} danger onClick={()=>batchDelete(multiSel.includes(timelineNode.id)?multiSel:[timelineNode.id])}/>
                      </>
                    ) : sceneNode ? (
                      <>
                        <Item label={L("编辑场景","Edit scene")} onClick={()=>openSceneEditor(sceneNode.id)}/>
                        <Item label={L("属性设置","Properties")} disabled={readOnly} onClick={()=>{setSelectedId(sceneNode.id);openProperties();}}/>
                        {nodeManagementItems(sceneNode.id).map(item=><Item key={item.id} label={item.label} disabled={item.disabled} onClick={item.onSelect}/>)}
                        <Sep/>
                        <Item label={t("canvas.copyNode")} onClick={()=>clipboard.copySelection(multiSel.includes(sceneNode.id)?multiSel:[sceneNode.id])}/>
                        <Item label={t("canvas.duplicate")} disabled={mutationDisabled} onClick={()=>void duplicateCanvasNodes(multiSel.includes(sceneNode.id)?multiSel:[sceneNode.id])}/>
                        <Item label={t("canvas.delete")} disabled={mutationDisabled} danger onClick={()=>batchDelete(multiSel.includes(sceneNode.id)?multiSel:[sceneNode.id])}/>
                      </>
                    ) : directorNode ? (
                      <>
                        <Item label={L("打开3D导演台","Open 3D director")} onClick={()=>openDirectorEditor(directorNode.id)}/>
                        <Item label={L("属性设置","Properties")} disabled={readOnly} onClick={()=>{setSelectedId(directorNode.id);openProperties();}}/>
                        {nodeManagementItems(directorNode.id).map(item=><Item key={item.id} label={item.label} disabled={item.disabled} onClick={item.onSelect}/>)}
                        <Sep/>
                        <Item label={t("canvas.copyNode")} onClick={()=>clipboard.copySelection(multiSel.includes(directorNode.id)?multiSel:[directorNode.id])}/>
                        <Item label={t("canvas.duplicate")} disabled={mutationDisabled} onClick={()=>void duplicateCanvasNodes(multiSel.includes(directorNode.id)?multiSel:[directorNode.id])}/>
                        <Item label={t("canvas.delete")} disabled={mutationDisabled} danger onClick={()=>batchDelete(multiSel.includes(directorNode.id)?multiSel:[directorNode.id])}/>
                      </>
                    ) : videoNode ? (
                      <>
                        <Item label="视频设置" disabled={mutationDisabled} onClick={()=>openVideoEditor(videoNode.id)}/>
                        <Item label={L("属性设置","Properties")} disabled={readOnly} onClick={()=>{setSelectedId(videoNode.id);openProperties();}}/>
                        {nodeManagementItems(videoNode.id).map(item=><Item key={item.id} label={item.label} disabled={item.disabled} onClick={item.onSelect}/>)}
                        <Sep/>
                        <Item label={t("canvas.copyNode")} onClick={()=>clipboard.copySelection(multiSel.includes(videoNode.id)?multiSel:[videoNode.id])}/>
                        <Item label={t("canvas.duplicate")} disabled={mutationDisabled} onClick={()=>void duplicateCanvasNodes(multiSel.includes(videoNode.id)?multiSel:[videoNode.id])}/>
                        <Item label={t("canvas.delete")} disabled={mutationDisabled} danger onClick={()=>batchDelete(multiSel.includes(videoNode.id)?multiSel:[videoNode.id])}/>
                      </>
                    ) : textNode ? (
                      <>
                        <Item label={t("canvas.editName")} disabled={mutationDisabled} onClick={() => { setNodeRenameValue(textNode.title); setRenamingNodeId(textNode.id); }} />
                        <Item label={t("canvas.toolbar.productCopy")} disabled={mutationDisabled || assistBusy} onClick={() => setProductPicker({ textNodeIds: [textNode.id] })} />
                        <FeatureVisible feature="generate"><Item label={t("canvas.toolbar.textToImages")} disabled={mutationDisabled || textNode.status === "generating"} onClick={() => openTextImageMenu([textNode.id])} /></FeatureVisible>
                        <Sep />
                        <Item label={t("canvas.copyNode")} onClick={()=>clipboard.copySelection(multiSel.includes(textNode.id)?multiSel:[textNode.id])}/>
                        <Item label={t("canvas.duplicate")} disabled={mutationDisabled} onClick={()=>void duplicateCanvasNodes(multiSel.includes(textNode.id)?multiSel:[textNode.id])}/>
                        <Item label={t("canvas.copyToClipboard")} disabled={!textNode.content} onClick={() => void copyText(textNode.content).then(ok => ok && showCopyTip())} />
                        <Item label={L("文字样式", "Text style")} disabled={readOnly} onClick={openProperties} />
                        {nodeManagementItems(textNode.id).map(item => <Item key={item.id} label={item.label} disabled={item.disabled} onClick={item.onSelect} />)}
                        <Sep />
                        <Item label={t("canvas.deleteNodeTitle")} danger disabled={mutationDisabled} onClick={() => void removeTextNode(textNode.id)} />
                      </>
                    ) : pendNode ? (
                      <>
                        <FeatureVisible feature="generate"><Item label={t("canvas.ctxGenerate")} disabled={readOnly || pendNode.generating || pendNode.uploading || pendNode.needsAttention} onClick={() => setSelectedPendId(pendNode.id)} /></FeatureVisible>
                        <Item label={t("canvas.uploadImage")} disabled={readOnly || pendNode.generating || pendNode.uploading || pendNode.needsAttention} onClick={() => onPendUpload(pendNode.id)} />
                        <Item label={t("canvas.delete")} danger disabled={readOnly || pendNode.generating || pendNode.uploading || pendNode.needsAttention} onClick={() => onPendRemove(pendNode.id)} />
                      </>
                    ) : node ? (
                      /* 图片操作复用工具栏动作，不新增业务请求。 */
                      <>
                        <Item label={t("canvas.editName")} disabled={mutationDisabled} onClick={() => { setNodeRenameValue(node.title); setRenamingNodeId(node.id); }} />
                        <Item label={L("属性设置", "Properties")} disabled={readOnly} onClick={openProperties} />
                        {nodeManagementItems(node.id).map(item => <Item key={item.id} label={item.label} disabled={item.disabled} onClick={item.onSelect} />)}
                        <Sep />
                        <Item
                          label={t("canvas.ctxDownload")}
                          onClick={() =>
                            void downloadOne(node.image)
                          }
                        />
                        {!readOnly && canFeature("generate") && (
                          <Item
                            label={t("canvas.ctxGenerate")}
                            onClick={() => {
                              setSelectedId(node.id);
                              setFocusId(node.id);
                            }}
                          />
                        )}
                        {!readOnly && (
                          <Item
                            label={t("canvas.reversePrompt")}
                            disabled={promptMining}
                            onClick={() => void reversePromptsForSelection([node])}
                          />
                        )}
                        {!readOnly && canFeature("agent") && (
                          <Item
                            label={t("canvas.assistant.entry")}
                            onClick={() => {
                              setCtxMenu(null);
                              openAssistant(node);
                            }}
                          />
                        )}
                        {!readOnly && (
                          <Item label={t("canvas.optimizeLayout")} disabled={historySaving || !nodeSettingsReady || !textNodesReady} onClick={tidyLayout} />
                        )}
                        <Sep />
                        {!readOnly && (
                          <Item
                            label={t("canvas.copyNode")}
                            hk={shortcut("C")}
                            onClick={() => clipboard.copyArtwork(node, true)}
                          />
                        )}
                        <Item
                          label={t("canvas.copyImage")}
                          onClick={() => void clipboard.copyImage(node.image)}
                        />
                        {!readOnly && (
                          <Item
                            label={t("canvas.duplicate")}
                            disabled={mutationDisabled}
                            onClick={() => void duplicateArt(node)}
                          />
                        )}
                        {!readOnly && (
                          <Item
                            label={t("canvas.addToBatchSelection")}
                            onClick={() =>
                              applyArtworkSelection([
                                ...contextSelectionBaseRef.current,
                                node.id,
                              ])
                            }
                          />
                        )}
                        {!readOnly && (
                          <Item
                            label={t("canvas.paste")}
                            hk={shortcut("V")}
                            disabled={!hasClip}
                            onClick={() => void clipboard.paste()}
                          />
                        )}
                        <Sep />
                        {!readOnly && (
                          <Item
                            label={t("canvas.delete")}
                            disabled={mutationDisabled}
                            hk={isMac ? "⌫" : "Del"}
                            danger
                            onClick={() => void deleteTree(node.id)}
                          />
                        )}
                      </>
                    ) : (
                      /* 空白右键菜单(对齐原型 czcanvas) */
                      <>
                        <ContextMenuSubmenu
                          label={t("canvas.addNode")}
                          disabled={readOnly}
                          items={canvasNodeMenuItems({ L, readOnly, videoDisabled: !canFeature("video") || videoNodeCreateDisabled, onCreate: kind => createCanvasNode(kind, ctxMenu) })}
                        />
                        <Item
                          label={t("canvas.uploadImage")}
                          disabled={readOnly}
                          onClick={() => triggerUpload(ctxMenu.x, ctxMenu.y)}
                        />
                        <Item
                          label={t("canvas.fromHistory")}
                          disabled={readOnly}
                          onClick={() => openHistoryPicker(ctxMenu.x, ctxMenu.y)}
                        />
                        <Sep />
                        <Item
                          label={t("canvas.undo")}
                          hk={shortcut("Z")}
                          disabled={readOnly || undoStack.length === 0}
                          onClick={() => void doUndo()}
                        />
                        <Item
                          label={t("canvas.redo")}
                          hk={isMac ? "⇧⌘Z" : "CtrlY"}
                          disabled={readOnly || redoStack.length === 0}
                          onClick={() => void doRedo()}
                        />
                        <Sep />
                        <Item
                          label={t("canvas.paste")}
                          hk={shortcut("V")}
                          disabled={readOnly || !hasClip}
                          onClick={() => void clipboard.paste()}
                        />
                      </>
                    )}
                </ContextMenuSurface>
              );
              return typeof document !== "undefined"
                ? createPortal(menu, document.body)
                : menu;
            })()}

          {selectedVideo&&multiSel.length<=1&&!propertiesOpen&&topbarStyle&&<VideoNodeToolbar
            ref={nodeToolbarRef} style={{left:topbarStyle.left,top:topbarStyle.top}} light={lightCanvas}
            readOnly={readOnly} locked={isNodeLocked(selectedVideo.id)} busy={!nodeSettingsReady||historySaving}
            hasResult={!!videoInputChoices.find(choice=>choice.nodeId===selectedVideo.id&&choice.available)}
            onSettings={()=>setVideoDockAdvancedId(current=>current===selectedVideo.id?null:selectedVideo.id)}
            onHistory={()=>setVideoHistoryId(selectedVideo.id)}
            onRename={()=>{setNodeRenameValue(selectedVideo.title);setRenamingNodeId(selectedVideo.id);}}
            onCopy={()=>clipboard.copySelection([selectedVideo.id])} onDuplicate={()=>void duplicateCanvasNodes([selectedVideo.id])}
            onDownload={()=>{const result=videoInputChoices.find(choice=>choice.nodeId===selectedVideo.id&&choice.available);if(result)downloadVideo(result.value);}}
            onDelete={()=>batchDelete([selectedVideo.id])} onProperties={openProperties} management={nodeManagementItems(selectedVideo.id)}/>}
          {selected?.videoUrl&&selectedBatchArts.length<=1&&multiSel.length<=1&&!propertiesOpen&&topbarStyle&&<VideoNodeToolbar
            ref={nodeToolbarRef} style={{left:topbarStyle.left,top:topbarStyle.top}} light={lightCanvas}
            readOnly={readOnly} locked={isNodeLocked(selected.id)} busy={!nodeSettingsReady||historySaving} hasResult hasHistory={false}
            settingsLabel={L("视频处理","Video tools")} onSettings={()=>extractVideoToCanvas(selected.id,{action:'trim'})} onHistory={()=>{}}
            onRename={()=>{setNodeRenameValue(selected.title);setRenamingNodeId(selected.id);}}
            onCopy={()=>clipboard.copySelection([selected.id])} onDuplicate={()=>void duplicateArt(selected)} onDownload={()=>downloadVideo(selected.videoUrl!)}
            onDelete={()=>void deleteTree(selected.id)} onProperties={openProperties} management={nodeManagementItems(selected.id)}/>}
          {/* 顶部图像工具条：统一使用16px Lucide线性图标，颜色继承画布主题。 */}
          {((selected&&!selected.videoUrl) || selectedPend) &&
            selectedBatchArts.length <= 1 &&
            !readOnly &&
            topbarStyle && (
            <div
              key={selectedId ?? selectedPendId ?? "tb"}
              data-testid="image-node-toolbar"
              ref={nodeToolbarRef}
              style={{ left: topbarStyle.left, top: topbarStyle.top }}
              className={cn(
                "canvas-ui-surface canvas-dock-entry absolute z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-0.5 rounded-[14px] border p-1.5 [&>*]:shrink-0 [&_button]:whitespace-nowrap",
                "overflow-x-auto"
              )}
            >
              {selected && <>
              <button type="button" data-action="rename" aria-label={t("canvas.editName")} title={t("canvas.toolbar.renameHint")}
                disabled={!selected || !nodeSettingsReady || isNodeLocked(selected.id)} onClick={() => { if (selected) { setNodeRenameValue(selected.title); setRenamingNodeId(selected.id); } }}
                className="canvas-ui-action flex h-[34px] items-center justify-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold transition-colors disabled:opacity-40">
                <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("canvas.editName")}
              </button>
              <FeatureVisible feature="agent"><button type="button" data-action="assistant" aria-label={t("canvas.toolbar.assistant")} title={t("canvas.toolbar.assistantHint")}
                disabled={!selected || readOnly} onClick={() => selected && openAssistant(selected)}
                className="canvas-ui-action flex h-[34px] items-center justify-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold transition-colors disabled:opacity-40">
                <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("canvas.toolbar.assistant")}
              </button></FeatureVisible>
              {QUICK_ACTIONS.filter(
                (a) => canFeature("generate") && ["bg", "angle", "caption"].includes(a.key)
              ).map((a) => (
                <button
                  key={a.key}
                  data-action={a.key}
                  type="button"
                  disabled={selectedGenerating || !selected}
                  title={!selected ? t("canvas.toolNeedImage") : t(`canvas.toolbar.${a.key}Hint`)}
                  onClick={() => onQuickAction(a.key)}
                  className="canvas-ui-action flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40"
                >
                  <a.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t(`canvas.qa.${a.key}`)}
                </button>
              ))}
              {/* 抠图:发丝级,扣 1 积分/张(已去掉免费极速档) */}
              <FeatureVisible feature="cutout"><button
                type="button"
                disabled={selectedGenerating || !selected}
                title={!selected ? t("canvas.toolNeedImage") : t("canvas.toolbar.cutoutHint")}
                onClick={() => onCutout("fine")}
                className="canvas-ui-action flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40"
              >
                <Scissors className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("canvas.qa.cutout")}
              </button></FeatureVisible>
              {/* 高清:下拉选分辨率(深色弹出,向下) */}
              <FeatureVisible feature="generate"><CanvasSelect
                hint={t("canvas.toolbar.hdHint")}
                dir="down"
                light={lightCanvas}
                disabled={selectedGenerating || !selected}
                value=""
                options={generationParameters.resolutions.map((resolution) => ({
                  value: resolution,
                  label: resolution,
                }))}
                onPick={(v) => onHd(v)}
                triggerClass={cn(
                  "canvas-ui-action flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-colors",
                  selected && !selectedGenerating
                    ? "cursor-pointer"
                    : "cursor-default opacity-40"
                )}
                trigger={
                  <>
                    <ScanSearch className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t("canvas.qa.hd")}
                  </>
                }
              /></FeatureVisible>
              {/* 改比例(ChatGPT 式重生成):选目标比例,按原图重画再裁切,无需提示词 */}
              <FeatureVisible feature="generate"><CanvasSelect
                hint={t("canvas.toolbar.ratioHint")}
                dir="down"
                light={lightCanvas}
                disabled={selectedGenerating || !selected}
                value=""
                options={[
                  { value: "1:1", label: t("canvas.ratioSquare") },
                  { value: "3:4", label: t("canvas.ratioPort") },
                  { value: "9:16", label: t("canvas.ratioStory") },
                  { value: "4:3", label: t("canvas.ratioLand") },
                  { value: "16:9", label: t("canvas.ratioWide") },
                ]}
                onPick={(v) => onRatioGen(v)}
                triggerClass={cn(
                  "canvas-ui-action flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-colors",
                  selected && !selectedGenerating
                    ? "cursor-pointer"
                    : "cursor-default opacity-40"
                )}
                trigger={
                  <>
                    <Maximize2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t("canvas.qa.ratio")}
                  </>
                }
              /></FeatureVisible>
              <span className="canvas-ui-divider mx-1.5 h-5 w-px flex-none" />
              {/* 内容编辑与生成变换使用不同名称，避免暗示只是修改参数。 */}
              <FeatureVisible feature="generate"><button
                type="button"
                title={t("canvas.toolbar.editTextHint")}
                disabled={!selected || selectedGenerating || readOnly}
                onClick={() => selected && void openImageTextEditor(selected)}
                className="canvas-ui-action flex h-[34px] items-center justify-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold transition-colors disabled:opacity-40"
              >
                <Type className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("canvas.toolbar.editText")}
              </button></FeatureVisible>
              {/* 扩图:选目标比例 + 原图锚点,outpaint 保原图内容补全四周 */}
              <FeatureVisible feature="generate"><div className="relative flex items-center">
                <button
                  type="button"
                  ref={expandButtonRef}
                  aria-expanded={expandOpen}
                  title={t("canvas.toolbar.expandHint")}
                  disabled={!selected || selectedGenerating || readOnly}
                  onClick={() => {
                    setExpandOpen((open) => !open);
                    setExpandRatio(null);
                  }}
                  className="canvas-ui-action flex h-[34px] items-center justify-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold transition-colors disabled:opacity-40"
                >
                  <Maximize2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("canvas.toolbar.expand")}
                </button>
                {canFeature("generate") && expandOpen && selected && (
                    <CanvasActionPanel anchorRef={expandButtonRef} label={t("canvas.toolbar.expand")} light={lightCanvas} width={256} onClose={() => setExpandOpen(false)}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider opacity-70">
                        目标比例
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {EXPAND_RATIOS.map((ratio) => {
                          const [rw, rh] = ratio.split(":").map(Number);
                          const sameRatio =
                            !!selected.width &&
                            !!selected.height &&
                            Math.abs(selected.width / selected.height - rw / rh) / (rw / rh) < 0.02;
                          return (
                            <button
                              key={ratio}
                              type="button"
                              disabled={sameRatio}
                              title={sameRatio ? "当前已是该比例" : undefined}
                              onClick={() => setExpandRatio(ratio)}
                              className={cn(
                                "rounded-lg px-1 py-1.5 text-[12px] font-semibold transition-colors",
                                expandRatio === ratio
                                  ? "bg-teal-500 text-white"
                                  : "canvas-ui-action",
                                sameRatio && "cursor-not-allowed opacity-30"
                              )}
                            >
                              {ratio}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider opacity-70">
                        原图位置
                      </p>
                      <div className="grid w-[76px] grid-cols-3 gap-1">
                        {ANCHOR_GRID.map((cell) => (
                          <button
                            key={cell}
                            type="button"
                            title={`原图贴${ANCHOR_TITLE[cell]}侧`}
                            onClick={() => setExpandAnchor(cell)}
                            className={cn(
                              "h-6 w-6 rounded-[6px] border transition-colors",
                              expandAnchor === cell
                                ? "border-teal-400 bg-teal-500/70"
                                : "canvas-ui-action border-current opacity-40 hover:opacity-90"
                            )}
                          />
                        ))}
                      </div>
                      <FeatureModelSelect feature="canvas.expand" disabled={selectedGenerating} />
                      <ImageQualityControl compact feature="canvas.expand" resolution={selected?.resolution || "1K"} />
                      <button
                        type="button"
                        disabled={!expandRatio || selectedGenerating}
                        onClick={() => expandRatio && void onExpand(expandRatio)}
                        className="mt-3 w-full rounded-[10px] bg-teal-500 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        开始扩图
                      </button>
                      <p className="mt-2 text-[11px] leading-relaxed opacity-60">
                        保持原图内容不变，向四周自然延展画面到目标比例。
                      </p>
                    </CanvasActionPanel>
                )}
              </div></FeatureVisible>
              {/* 标注编辑:箭头/涂抹/编号标注 + 逐条指令改图 */}
              <FeatureVisible feature="generate"><button
                type="button"
                title={t("canvas.toolbar.annotateHint")}
                disabled={!selected || selectedGenerating || readOnly}
                onClick={() => selected && setAnnotateArtwork(selected)}
                className="canvas-ui-action flex h-[34px] items-center justify-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold transition-colors disabled:opacity-40"
              >
                <PenLine className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("canvas.toolbar.annotate")}
              </button></FeatureVisible>
              {/* 低频处理与节点管理使用一个可访问的Portal菜单。 */}

              </>}
              <CanvasActionMenu triggerRef={imageMoreRef} label={t("canvas.toolbar.imageMore")} light={lightCanvas}
                items={[
                  ...QUICK_ACTIONS.filter(a => canFeature("generate") && a.key === "relight").map(a => ({
                    id: a.key, icon: a.icon, label: t(`canvas.qa.${a.key}`), hint: t(`canvas.toolbar.${a.key}Hint`),
                    disabled: selectedGenerating || !selected, onSelect: () => onQuickAction(a.key),
                  })),
                  { id: "workflow", icon: Workflow, label: t("canvas.toolbar.workflow"), hint: t("canvas.toolbar.workflowHint"),
                    disabled: !selected || readOnly, onSelect: () => setComfyOpen(true) },
                  { id: "video", icon: Video, label: videoNodeCreationReady?t("canvas.toolbar.video"):videoNodeCreateLabel, hint: t("canvas.toolbar.videoHint"),
                    disabled: readOnly||videoNodeCreateDisabled, onSelect: () => { void openVideoNodeFromSelection(); } },
                  ...(selected ? [
                    {id:"copy-node",icon:Copy,label:t("canvas.copyNode"),onSelect:()=>clipboard.copyArtwork(selected,true)},
                    {id:"copy-image",icon:ImageIcon,label:t("canvas.copyImage"),onSelect:()=>void clipboard.copyImage(selected.image)},
                    {id:"duplicate-node",icon:Plus,label:t("canvas.duplicate"),disabled:readOnly,onSelect:()=>void duplicateArt(selected)},
                    ...nodeManagementItems(selected.id),
                    {id:"properties",icon:SlidersHorizontal,label:L("属性设置","Properties"),onSelect:openProperties},
                  ] : []),
                ].filter(item => selected || item.id === "video")}
              />


              {/* 画布助手:围绕选中节点+上游链对话,可一键生图回画布 */}

              {selected && <>
              {!selected.videoUrl && <>
                <button type="button" aria-label={L("裁剪图片","Crop image")} title={L("裁剪为新版本","Crop to a new version")}
                  disabled={localEditBusy || !nodeSettingsReady || isNodeLocked(selected.id)} onClick={()=>setCropArtwork(selected)}
                  className="canvas-ui-action flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 text-[13px] font-semibold disabled:opacity-40"><Crop className="h-4 w-4" />{L("裁剪","Crop")}</button>
                <button type="button" aria-label={L("替换图片","Replace image")} title={L("替换为新版本","Replace with a new version")}
                  disabled={localEditBusy || !nodeSettingsReady || isNodeLocked(selected.id)} onClick={()=>requestReplace(selected)}
                  className="canvas-ui-action flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 text-[13px] font-semibold disabled:opacity-40"><ImagePlus className="h-4 w-4" />{L("替换","Replace")}</button>
              </>}
              <button
                type="button"
                title={t("canvas.toolbar.downloadImage")}
                aria-label={t("canvas.toolbar.downloadImage")}
                disabled={!selected}
                onClick={() =>
                  selected && void downloadOne(selected.image)
                }
                className="canvas-ui-action flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-[16px] leading-none transition-colors disabled:opacity-40"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                title={t("canvas.viewLarge")}
                aria-label={t("canvas.viewLarge")}
                disabled={!selected}
                onClick={() =>
                  selected &&
                  setLightbox({ src: selected.image, alt: selected.title })
                }
                className="canvas-ui-action flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-[15px] leading-none transition-colors disabled:opacity-40"
              >
                <Maximize className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
              </>}
              {!selected && selectedPend && <button type="button" onClick={() => onPendUpload(selectedPend.id)}
                title={t("canvas.toolbar.fillImageHint")} aria-label={t("canvas.toolbar.fillImage")}
                className="canvas-ui-action flex h-[34px] items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-semibold">
                <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />{t("canvas.toolbar.fillImage")}
              </button>}
            </div>
          )}

          {/* 文字节点工具条：沿用图片节点的层级、尺寸和交互密度，动作替换为文字可用能力。 */}
          {selectedText &&
            selectedTextBatchNodes.length <= 1 &&
            !readOnly &&
            topbarStyle && (
            <div
              key={`text-toolbar-${selectedText.id}`}
              data-testid="text-node-toolbar"
              ref={nodeToolbarRef}
              style={{ left: topbarStyle.left, top: topbarStyle.top }}
              className={cn(
                "canvas-ui-surface canvas-dock-entry absolute z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-[14px] border p-1.5",
                !lightCanvas && "!border-[#40444f]"
              )}
            >
              <button
                type="button"
                disabled={assistBusy || !nodeSettingsReady || isNodeLocked(selectedText.id)}
                onClick={() => setProductPicker({ textNodeIds: [selectedText.id] })}
                aria-label={t("canvas.toolbar.productCopy")}
                title={t("canvas.assistWriteHint")}
                className="canvas-ui-action flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40"
              >
                {assistBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PenLine className="h-4 w-4" />
                )}
                {t("canvas.toolbar.productCopy")}
              </button>
              <FeatureVisible feature="generate"><button
                type="button"
                disabled={!nodeSettingsReady || textImageSubmitting || isNodeLocked(selectedText.id) || selectedText.status === "generating"}
                onClick={() => openTextImageMenu([selectedText.id])}
                aria-label={t("canvas.toolbar.textToImages")}
                title={t("canvas.genImagesHint")}
                className="canvas-ui-action flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-colors"
              >
                <ImageIcon className="h-4 w-4" />
                {t("canvas.toolbar.textToImages")}
              </button></FeatureVisible>

              <span className="canvas-ui-divider mx-1.5 h-5 w-px flex-none" />
              <button type="button" aria-label={L("文字样式","Text style")} title={L("文字样式","Text style")} onClick={openProperties}
                className="canvas-ui-action flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 text-[13px] font-semibold"><SlidersHorizontal className="h-4 w-4" />{L("样式","Style")}</button>
              <button
                type="button"
                disabled={!selectedText.content}
                onClick={() =>
                  void copyText(selectedText.content).then((ok) => ok && showCopyTip())
                }
                aria-label={t("canvas.copyToClipboard")}
                title={t("canvas.copyToClipboard")}
                className="canvas-ui-action flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] text-[16px] transition-colors disabled:opacity-40"
              >
                <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setFocusId(selectedText.id)}
                aria-label={t("canvas.toolbar.focusNode")}
                title={t("canvas.toolbar.focusNode")}
                className="canvas-ui-action flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] text-[15px] transition-colors"
              >
                <ScanSearch className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={!nodeSettingsReady || isNodeLocked(selectedText.id)}
                onClick={() => {
                  setNodeRenameValue(selectedText.title);
                  setRenamingNodeId(selectedText.id);
                }}
                aria-label={t("canvas.editName")}
                title={t("canvas.editName")}
                className="canvas-ui-action flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] text-[16px] transition-colors"
              >
                <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void removeTextNode(selectedText.id)}
                disabled={!nodeSettingsReady || isNodeLocked(selectedText.id)}
                aria-label={t("canvas.deleteNodeTitle")}
                title={t("canvas.deleteNodeTitle")}
                className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] text-[#9aa1ae] transition-colors hover:bg-[#ff6b63]/15 hover:text-[#ff6b63]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <CanvasActionMenu iconOnly label={L("更多节点操作","More node actions")} light={lightCanvas}
                items={[...nodeManagementItems(selectedText.id),{id:"properties",icon:SlidersHorizontal,label:L("属性设置","Properties"),onSelect:openProperties}]} />
            </div>
          )}
          {/* 标注编辑弹窗：提交即关闭，landEditResult 在画布占位节点中后台继续落地。 */}
          {annotateArtwork && (
            <AnnotateEditorModal
              artwork={{
                id: annotateArtwork.id,
                image: annotateArtwork.image,
                title: annotateArtwork.title,
              }}
              onClose={() => setAnnotateArtwork(null)}
              onSubmitted={submitAnnotations}
            />
          )}

          {/* ComfyUI 工作流面板(BYOC):端点/导入/运行,图片产物按血缘挂树 */}
          {canFeature("comfyui") && (comfyOpen || comfyMounted) && <CanvasComfyDialog
            key={`${canvasAccountRef.current}:${currentWorkspace()}:${activeKey}:${canvasContextEpochRef.current}:${selected?.id||""}`}
            open={comfyOpen}
            onClose={() => setComfyOpen(false)}
            source={selected}
            onRun={(payload) => {
              if (!selected) return Promise.reject(new Error("请先选择一张图"));
              return runComfyWorkflow(selected, payload);
            }}
          />}

          <CanvasImageTextPanel state={imageTextEditor.state} artwork={active?.members.find(artwork=>artwork.id===ocrArtworkId)} lightCanvas={lightCanvas}
            onClose={imageTextEditor.close} onFocus={imageTextEditor.focus} onEdit={imageTextEditor.edit} onApply={applyOcrSegment} />

          {/* 重命名节点:在节点标签处弹出内联输入(编辑按钮触发),失焦/回车确定、Esc 取消 */}
          {renamingNodeId &&
            (selected || selectedText || selectedVideo || selectedDirector || selectedCharacter || selectedScene || selectedAudio || selectedTimeline) &&
            renamingNodeId === (selected?.id ?? selectedText?.id ?? selectedVideo?.id ?? selectedDirector?.id ?? selectedCharacter?.id ?? selectedScene?.id ?? selectedAudio?.id ?? selectedTimeline?.id) &&
            nodeScreen && (
              <div
                ref={nodeRenamePositionRef}
                className="absolute z-30 -translate-x-1/2"
                style={{
                  left: nodeScreen.cx,
                  top: Math.max(8, nodeScreen.top - 40),
                }}
              >
                <input
                  autoFocus
                  value={nodeRenameValue}
                  onChange={(e) => setNodeRenameValue(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      nodeRenameCancelRef.current = true;
                      setRenamingNodeId(null);
                    }
                  }}
                  onBlur={() => {
                    if (nodeRenameCancelRef.current) {
                      nodeRenameCancelRef.current = false;
                      return;
                    }
                    void saveNodeRename();
                  }}
                  maxLength={60}
                  placeholder={t("canvas.renamePlaceholder")}
                  className="canvas-ui-input w-[240px] rounded-md border !border-[#315fc8] bg-white px-3 py-2 text-center text-sm font-semibold text-[#20242c] shadow-[0_6px_18px_rgba(15,23,42,0.16)] outline-none"
                />
              </div>
            )}

          {selectedVideo&&multiSel.length<=1&&!propertiesOpen&&canFeature("video")&&<VideoSettingsDialog
            key={`${user?.email}:${targetEmail}:${activeKey}:${selectedVideo.id}`} node={selectedVideo} presentation="dock"
            dockRef={panelRef} dockStyle={dockStyle??{left:12,bottom:12,maxHeight:"60%"}} draftScope={JSON.stringify([user?.email,targetEmail,activeKey])} advanced={videoDockAdvancedId===selectedVideo.id} onCloseAdvanced={()=>setVideoDockAdvancedId(null)}
            task={videoTaskStore.tasks.find(task=>task.id===selectedVideo.lastTaskId)}
            generationBlocked={!!selectedVideo.lastTaskId&&!videoTaskStore.tasks.some(task=>task.id===selectedVideo.lastTaskId)}
            onCancel={()=>{if(selectedVideo.lastTaskId)void videoTaskStore.cancel(selectedVideo.lastTaskId).catch(error=>flashTip(error.message));}}
            email={targetEmail||user?.email} models={videoCatalog} catalogLoading={videoModelCatalog.loading} catalogError={videoModelCatalog.error} onRetryCatalog={videoModelCatalog.refresh}
            choices={videoInputChoices} light={lightCanvas} readOnly={readOnly||!nodeSettingsReady||isNodeLocked(selectedVideo.id)} onClose={()=>{setVideoDockAdvancedId(null);setSelectedId(null);}}
            onSave={draft=>saveVideoDraft(selectedVideo.id,draft)} onGenerate={(draft,quote,onPersisted,count)=>generateVideoDraft(selectedVideo.id,draft,quote,onPersisted,count)}
            onOptimize={async(prompt,signal)=>{const response=await privateFetchRaw('/api/prompt-assist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idea:prompt,mode:'optimize',tool:'canvas-video'}),signal});const data=await readJsonSafe(response);if(!response.ok||typeof data?.prompt!=='string')throw new Error(data?.error||'提示词优化失败，原文已保留');return data.prompt;}}
            onImport={async files=>{try{const choices=await videoAssetStore.upload(files,selectedVideo.projectKey);await mergeWorks(choices.map(choice=>choice.nodeId));return choices;}catch(cause){if(cause instanceof VideoAssetImportError&&cause.choices.length)await mergeWorks(cause.choices.map(choice=>choice.nodeId));throw cause;}}}
            onLoadMoreAssets={videoAssetStore.loadMore} canLoadMoreAssets={!!videoAssetStore.nextCursor}/>}
          {/* 底部生成器(配方):选中节点正下方居中,横向 dock(原型 dock) */}
          {selected?.videoUrl&&selectedBatchArts.length<=1&&multiSel.length<=1&&!propertiesOpen&&<VideoResultDock
            ref={panelRef} style={dockStyle??{left:12,bottom:12,maxHeight:"60%"}} prompt={selected.prompt||""}
            readOnly={readOnly||!nodeSettingsReady||isNodeLocked(selected.id)} canGenerate={canFeature("video")}
            onProcess={action=>extractVideoToCanvas(selected.id,action)} onContinue={()=>void openVideoNodeFromSelection()}/>}
          {canFeature("generate") && selected && !selected.videoUrl && selectedBatchArts.length <= 1 && !propertiesOpen && (
            <CanvasImageComposer key={`dock-${imageDraft.key||selected.id}`} pending={false} title={selected.title}
              dockRef={panelRef} style={dockStyle} readOnly={readOnly} optimizationDisabled={!nodeSettingsReady||isNodeLocked(selected.id)} onDismiss={()=>setSelectedId(null)}
              referenceEditor={{...imageComposerReferences,textareaRef:promptAreaRef,placeholder:t("canvas.promptPlaceholder"),readOnly}}
              upload={{inputRef:extraInputRef,available:composerReferences.length<MAX_TOTAL_IMAGES,onFiles:pickExtra}}
              controls={imageComposerControls} error={genError}
              imageActions={{style:genStyle,onStyle:setGenStyle,marked:!!selected.marked,onMark:toggleNodeMark,onFocus:()=>setFocusId(selected.id)}}
              versions={{contextKey:`${canvasHistory.scope.key}:${selected.id}`,revision:selected.canvasImageRevision||0,disabled:readOnly||historySaving||isNodeLocked(selected.id),english:locale==="en",load:()=>loadImageVersions(selected.id),onSelect:(version,from)=>selectImageVersion(selected.id,version,from)}}
              generation={{actionLabel:generationMode==="standard"?L("重新生成","Regenerate"):undefined,generating:selectedGenerating,failure:selectedGenerationFailure,onGenerate:selectedGenerationFailure&&selectedGenerationRetry?selectedGenerationRetry:generateSelectedImage}}/>
          )}
          {canFeature("generate") && selectedPend && !readOnly && (
            <CanvasImageComposer key={`pdock-${imageDraft.key||selectedPend.id}`} pending dockRef={panelRef} style={dockStyle} optimizationDisabled={!nodeSettingsReady||isNodeLocked(selectedPend.id)}
              onDismiss={()=>setSelectedPendId(null)} controls={imageComposerControls} error={genError}
              referenceEditor={{...imageComposerReferences,textareaRef:pendPromptRef,placeholder:t("canvas.pendPromptPlaceholder")}}
              generation={{generating:selectedPendGenerating,failure:selectedPend.generationFailure,onGenerate:selectedPend.generationFailure&&selectedPend.onGenerationRetry?selectedPend.onGenerationRetry:()=>generatePend()}}/>
          )}
          {selectedText && selectedTextBatchNodes.length <= 1 && !readOnly && !propertiesOpen && !isNodeLocked(selectedText.id) && (
            <CanvasTextComposer key={`tdock-${selectedText.id}`} node={selectedText} members={active?.members??[]} light={lightCanvas} optimization={{contextKey:JSON.stringify([user?.email,targetEmail,activeKey,selectedText.id]),disabled:readOnly||!nodeSettingsReady||isNodeLocked(selectedText.id)}}
              draft={{prompt:textPrompt,onChange:setTextPrompt}} task={{state:textTasks.state(selectedText.id),retryable:textTasks.retryable(selectedText.id),onGenerate:()=>generateTextNode()}}
              layout={{dockRef:textComposerDockRef,style:dockStyle,safeArea:overlaySafeArea,canvasSize,expanded:textComposerExpanded,onExpandedChange:setTextComposerExpanded}}
              onDismiss={()=>setSelectedTextId(null)} onReference={(id,enabled)=>updateTextReference(selectedText.id,id,enabled)} onMenuOpenChange={setTextComposerMenuOpen}
              assist={{busy:assistBusy,onPickProduct:()=>setProductPicker({textNodeIds:[selectedText.id]})}}
              image={{disabled:!nodeSettingsReady||textImageSubmitting||isNodeLocked(selectedText.id)||selectedText.status==="generating",onGenerate:()=>openTextImageMenu([selectedText.id])}}/>
          )}
          {!browsing && !readOnly && canFeature("agent") && user && <CanvasAgentOrb key={`${user.email}:${activeKey || "workspace"}`} email={user.email}
            busy={assistantBusy} outcome={assistantOutcome} steps={assistantSteps} responding={assistantResponding} open={assistantVisible} companion={orbCompanion} onCue={orbCue}
            english={locale === "en"} onActivate={toggleAssistant} light={lightCanvas} />}
        </div>
        {propertiesOpen && !browsing && (selectedText || selected || selectedVideo || selectedDirector || selectedCharacter || selectedScene || selectedAudio || selectedTimeline) && <NodePropertiesPanel
          key={(selectedText || selected || selectedVideo || selectedDirector || selectedCharacter || selectedScene || selectedAudio || selectedTimeline)!.id} title={(selectedText || selected || selectedVideo || selectedDirector || selectedCharacter || selectedScene || selectedAudio || selectedTimeline)!.title} kind={selectedText ? "text" : "image"}
          settings={nodeSettings[(selectedText || selected || selectedVideo || selectedDirector || selectedCharacter || selectedScene || selectedAudio || selectedTimeline)!.id] || DEFAULT_CANVAS_SETTINGS} light={lightCanvas} english={locale==='en'} busy={historySaving || localEditBusy} readOnly={readOnly || !nodeSettingsReady}
          content={selectedText?.content || selectedText?.prompt}
          displaySize={selectedText ? {width:selectedText.width,height:selectedText.height} : selectedVideo?{width:selectedVideo.width,height:selectedVideo.height}:selectedDirector?{width:selectedDirector.width,height:selectedDirector.height}:selectedCharacter?{width:selectedCharacter.width,height:selectedCharacter.height}:selectedScene?{width:selectedScene.width,height:selectedScene.height}:selectedTimeline?{width:selectedTimeline.width,height:selectedTimeline.height}:selectedAudio?{width:selectedAudio.width,height:selectedAudio.height}:artworkNodeSize(selected!)}
          imageEditable={!selectedVideo&&!selectedDirector&&!selectedCharacter&&!selectedScene&&!selectedAudio&&!selectedTimeline&&!selected?.videoUrl}
          imageSize={selected?.width && selected?.height ? {width:selected.width,height:selected.height} : undefined}
          onSave={settings=>commitNodeSettings((selectedText || selected || selectedVideo || selectedDirector || selectedCharacter || selectedScene || selectedAudio || selectedTimeline)!.id,settings)} onClose={()=>setPropertiesOpen(false)}
          onCrop={()=>selected && setCropArtwork(selected)} onReplace={()=>selected && requestReplace(selected)} />}
        {cropArtwork && <ImageCropDialog image={cdnUrl(cropArtwork.image)} title={cropArtwork.title} light={lightCanvas} english={locale==='en'} busy={localEditBusy}
          onApply={crop=>saveLocalImageEdit(cropArtwork,crop)} onClose={()=>{if(!localEditBusyRef.current)setCropArtwork(null);}} />}
        <input ref={replaceInputRef} data-testid="canvas-replace-image-input" type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={event=>{const file=event.target.files?.[0],target=replaceTargetRef.current;if(file && target)void saveLocalImageEdit(target,undefined,file);}} />
        {/* 助手作为画布的并列侧栏：桌面让出空间，窄屏浮层；OCR仍互斥。 */}
        {!browsing && !readOnly && canFeature("agent") && (() => {
          const anchor = active?.members.find(artwork => artwork.id === assistantArtworkId);
          return <CanvasAssistantPanel open={assistantVisible} focusInput={assistantFocusInput} contextReady={true} modelControl={<TextModelSelect feature="canvas.assistant" compact composer dark={!lightCanvas} />} key={`assistant:${activeKey || "empty"}`} historyScopeKey={activeKey||"workspace"} light={lightCanvas} anchorTitle={anchor?.title || (locale==="en"?"Text conversation":"文本对话")}
            contextImages={currentAssistantReferences().map(artwork => ({ id: artwork.id, title: artwork.title, image: cdnUrl(artwork.image) }))}
            onUploadImages={files=>void uploadAssistantImages(files)} uploadingImages={assistantUploading} uploadError={assistantUploadError}
            onRemoveReference={assistantSession.removeReference}
            selectedSkill={assistantSkill} onSkillSelect={assistantSession.skill} skillAccountKey={user?.email || ""} skillSessionId={assistantSession.identity().sessionId} turns={assistantTurns} input={assistantInput} busy={assistantBusy} error={assistantError} canContinue={!!assistantContinueTurn} onContinue={()=>void sendAssistantMessage(true)} steps={assistantSteps} english={locale === "en"} responding={assistantResponding} activity={assistantActivity} attention={orbCompanion.model.attention} onStop={() => void stopAssistantTask()}
            labels={{title: t("canvas.assistant.title"),
              scrollToBottom: t("canvas.assistant.scrollToBottom"),
              newChat: t("canvas.assistant.newChat"),
              history: locale === "en" ? "Project conversations" : "项目对话记录",
              close: t("canvas.assistant.close"),
              back: t("canvas.assistant.back"),
              morning: t("canvas.assistant.morning"),
              afternoon: t("canvas.assistant.afternoon"),
              evening: t("canvas.assistant.evening"),
              question: t("canvas.assistant.question"),
              changeTasks: t("canvas.assistant.changeTasks"),
              placeholder: t("canvas.assistant.placeholder"),
              send: t("canvas.assistant.send"),
              references: t("canvas.assistant.references"),
              closeReferences: t("canvas.assistant.closeReferences"),
              currentImage: t("canvas.assistant.currentImage"),
              upstreamImage: t("canvas.assistant.upstreamImage"),
              thinking: t("canvas.assistant.thinking"),
              copy: t("canvas.assistant.copy"),
              copied: t("canvas.assistant.copied"),
              emptyHistory: t("canvas.assistant.emptyHistory"),
              currentChat: t("canvas.assistant.currentChat"),
              agent: t("canvas.assistant.agent"),
              mode: anchor?t("canvas.assistant.mode"):(locale==="en"?"Text conversation":"文本对话"),
              retry: t("canvas.assistant.retry")}}
            tasks={["main", "detail", "scene", "retouch", "background", "copyLayout", "review", "prompt"].map(id => ({ id, label: t(`canvas.assistant.${id}`), prompt: t(`canvas.assistant.${id}Prompt`) }))}
            costLabel={billing.catalog?.features["canvas.assistant"]?.prices.medium?.["1K"] === 0 ? "对话免费 · 生图另行计费" : billing.catalog?.features["canvas.assistant"]?.prices.medium?.["1K"] != null ? `${billing.catalog.features["canvas.assistant"].prices.medium["1K"]} 积分 / 轮 · 生图另行计费` : "对话报价加载中 · 生图另行计费"}
            onInputChange={value=>{assistantSession.input(value);orbCue({type:"draft",text:value});}} onSend={() => void sendAssistantMessage()}
            onSynchronizeResults={assistantSession.state.syncIds.length?()=>void assistantSession.synchronize():undefined}
            onClearReference={()=>{if(assistantSession.isUploading())return;assistantSession.clearReferences();setSelectedId(null);setSelectedTextId(null);}}
            onNewChat={()=>assistantSession.newChat(canvasAssistantContext())}
            historyLoader={()=>assistantSession.list(canvasAssistantContext())}
            onRenameHistory={(id,title)=>assistantSession.rename(id,title,canvasAssistantContext())}
            onDeleteHistory={id=>assistantSession.remove(id,canvasAssistantContext())}
            onRestoreChat={(turns,id)=>{if(id){void restoreAssistantConversation(anchor?.id||"",id);return;}assistantSession.newChat(canvasAssistantContext(),turns);}}
            onClose={closeAssistant}
            onPreview={image => setLightbox({ src: image.image, alt: image.title })}
            onCopy={copyAssistantText} feedbackLabels={locale === "en" ? { positive: "Helpful", negative: "Needs improvement" } : { positive: "有帮助", negative: "需要改进" }} onFeedback={positive => orbCue({ type: "feedback", positive })} renderContent={renderAssistantContent}
          />;
        })()}

      </div>
      {/* 智能帮写:选择产品白底图(帮写与生成图片都以它为产品参照) */}
      {productPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setProductPicker(null)}
        >
          <div
            data-testid="product-picker"
            className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-none items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("canvas.productPick")}</h3>
              </div>
              <button
                type="button"
                aria-label={t("canvas.close")}
                onClick={() => setProductPicker(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              {t("canvas.productPickHint")}
            </p>
            <div className="grid grid-cols-3 gap-2 overflow-y-auto p-4 sm:grid-cols-4">
              {(active?.members ?? [])
                .filter((member) => hasRenderableImage(member.image))
                .map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => void assistWriteForNodes(productPicker.textNodeIds, member)}
                    className="group flex flex-col items-stretch gap-1.5 rounded-lg border border-border bg-background p-1.5 text-left transition-colors hover:border-primary/60"
                  >
                    <CachedImage src={cdnUrl(member.image)} alt="" className="block h-20 w-full rounded object-cover" />
                    <span className="truncate text-[11px] font-medium text-foreground">
                      {member.title || t("canvas.imageNode")}
                    </span>
                  </button>
                ))}
            </div>
            {!(active?.members ?? []).some((member) => hasRenderableImage(member.image)) && (
              <p className="px-4 pb-4 text-xs text-muted-foreground">
                {t("canvas.productPickEmpty")}
              </p>
            )}
          </div>
        </div>
      )}
      {/* Universal text-to-image; specialized product modes are optional. */}
      {canFeature("generate") && genImageMenu && textImageScopeCurrent(genImageMenu) && (
        <TextImageGenerationDialog textCount={genImageMenu.textNodeIds.length} referenceCount={textImageReferenceCount(genImageMenu)}
          locale={locale === "en" ? "en" : "zh"} busy={textImageSubmitting}
          onClose={() => setGenImageMenu(null)} onGenerate={(mode, options) => void generateImagesFromTextNodes(mode, options)} />
      )}
      {/* 回收站:已删除作品(保留 180 天,可恢复 / 彻底删除) */}
      {trashOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setTrashOpen(false)}
        >
          <div
            className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-none items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{t("canvas.trash")}</span>
                <span className="text-[11px] text-muted-foreground">
                  {t("canvas.trashHint")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {trashItems && trashItems.length > 0 && (
                  <button
                    type="button"
                    disabled={trashBusy}
                    onClick={() =>
                      trashAction(
                        "purge",
                        (trashItems ?? []).map((w) => w.id)
                      )
                    }
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {t("canvas.trashClear")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTrashOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {canvasArtworkDocument.trashError ? (
                <div role="alert" className="flex items-center justify-center gap-3 p-6 text-sm"><span>{canvasArtworkDocument.trashError}</span><button onClick={()=>void canvasArtworkDocument.loadTrash()} className="underline">重试加载回收站</button></div>
              ) : trashItems === null ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t("canvas.loading")}
                </p>
              ) : trashItems.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t("canvas.trashEmpty")}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {trashItems.map((w) => (
                    <div
                      key={w.id}
                      className="group relative overflow-hidden rounded-xl border border-border bg-secondary"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <CachedImage
                        src={cdnUrl(w.image)}
                        alt={w.title}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      {/* 悬停操作:恢复 / 彻底删除 */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          disabled={trashBusy}
                          onClick={() => trashAction("restore", [w.id])}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow disabled:opacity-50"
                        >
                          {t("canvas.restore")}
                        </button>
                        <button
                          type="button"
                          disabled={trashBusy}
                          onClick={() => trashAction("purge", [w.id])}
                          className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500/70 disabled:opacity-50"
                        >
                          {t("canvas.purge")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {videoMedia&&videoMedia.projectKey===activeKey&&<MediaActionsDialog key={`${user?.email}:${videoMedia.projectKey}:${videoMedia.id}`} initial={videoMedia.initial} sourceId={videoMedia.id} projectKey={videoMedia.projectKey} choices={videoInputChoices.filter(choice=>choice.available&&choice.kind!=="text").map(choice=>({id:choice.nodeId,title:choice.title,kind:choice.kind as MediaInputChoice["kind"],url:choice.value}))} light={lightCanvas} readOnly={readOnly||isNodeLocked(videoMedia.id)} jobs={mediaJobStore.jobs} historyError={mediaJobStore.error} canLoadMore={!!mediaJobStore.nextCursor} onLoadMore={mediaJobStore.loadMore} onQuote={mediaJobStore.estimate} onSubmit={mediaJobStore.submit} onCancel={mediaJobStore.cancel} onClose={()=>setVideoMedia(null)}/>}
      {editingCharacter&&createPortal(<CharacterEditor key={`${canvasAccountRef.current}:${activeKey}:${editingCharacter.id}`} node={editingCharacter} images={baseVideoInputChoices.filter(choice=>choice.kind==='image')} draftScope={JSON.stringify([user?.email,targetEmail,activeKey])} english={locale==='en'} readOnly={readOnly||!nodeSettingsReady||isNodeLocked(editingCharacter.id)} onSave={(character,revision)=>patchCharacterNode(editingCharacter.id,{character,title:character.name,expectedRevision:revision})} onUpload={files=>uploadCharacterReferences(editingCharacter.id,files)} onGenerate={(character,appearanceId)=>generateCharacterReference(editingCharacter.id,character,appearanceId)} onClose={()=>setCharacterEditorId(null)}/>,document.body)}
      {editingTimeline&&createPortal(<TimelineEditor key={`${canvasAccountRef.current}:${activeKey}:${editingTimeline.id}`} node={editingTimeline} choices={baseVideoInputChoices.filter(choice=>choice.kind!=="text")} jobs={mediaJobStore.jobs} draftScope={canvasHistory.scope.key} english={locale==='en'} readOnly={readOnly||!nodeSettingsReady||isNodeLocked(editingTimeline.id)} onSave={(timeline,revision)=>patchTimelineNode(editingTimeline.id,{timeline,expectedRevision:revision})} onInspect={ids=>timelineNodesStore.inspect(editingTimeline.id,ids)} onUpload={files=>uploadTimelineSources(editingTimeline.id,files)} onRender={revision=>renderTimelineEdit(editingTimeline.id,revision)} onCancel={mediaJobStore.cancel} onAdopt={job=>adoptTimelineResult(editingTimeline.id,job)} onQuote={()=>mediaJobStore.estimate("ffmpeg")} onClose={()=>setTimelineEditorId(null)}/>,document.body)}
      {editingAudio&&createPortal(<AudioEditor key={`${canvasAccountRef.current}:${activeKey}:${editingAudio.id}`} node={editingAudio} sources={baseVideoInputChoices.filter(choice=>choice.kind==='audio')} jobs={mediaJobStore.jobs} draftScope={JSON.stringify([user?.email,targetEmail,activeKey])} english={locale==='en'} readOnly={readOnly||!nodeSettingsReady||isNodeLocked(editingAudio.id)} onSave={(audio,revision)=>patchAudioNode(editingAudio.id,{audio,expectedRevision:revision})} onUpload={files=>uploadAudioSource(editingAudio.id,files)} onRender={revision=>renderAudioEdit(editingAudio.id,revision)} onCancel={mediaJobStore.cancel} onAdopt={job=>adoptAudioResult(editingAudio.id,job)} onQuote={()=>mediaJobStore.estimate("ffmpeg")} onClose={()=>setAudioEditorId(null)}/>,document.body)}
      {editingScene&&createPortal(<SceneEditor key={`${canvasAccountRef.current}:${activeKey}:${editingScene.id}`} node={editingScene} images={baseVideoInputChoices.filter(choice=>choice.kind==='image')} draftScope={JSON.stringify([user?.email,targetEmail,activeKey])} english={locale==='en'} readOnly={readOnly||!nodeSettingsReady||isNodeLocked(editingScene.id)} onSave={(scene,revision)=>patchSceneNode(editingScene.id,{scene,title:scene.name,expectedRevision:revision})} onUpload={files=>uploadSceneReferences(editingScene.id,files)} onGenerate={(scene,stateId)=>generateSceneReference(editingScene.id,scene,stateId)} onClose={()=>setSceneEditorId(null)}/>,document.body)}
      {editingDirector&&createPortal(<DirectorEditor key={`${canvasAccountRef.current}:${activeKey}:${editingDirector.id}`} node={editingDirector} scenes={sceneNodesStore.nodes.filter(node=>node.projectKey===activeKey)} draftScope={JSON.stringify([user?.email,targetEmail,activeKey])} english={locale==='en'} readOnly={readOnly||!nodeSettingsReady||isNodeLocked(editingDirector.id)} images={videoInputChoices.filter(choice=>choice.kind==='image'&&choice.available).map(choice=>({id:choice.nodeId,title:choice.title,url:choice.value}))} onSave={(project,revision)=>patchDirectorNode(editingDirector.id,{project,title:project.name,expectedRevision:revision})} onOutput={(file,kind,revision)=>sendDirectorOutput(editingDirector.id,file,kind,revision)} onClose={()=>setDirectorEditorId(null)}/>,document.body)}
      {videoHistoryId&&videoNodesStore.nodes.find(node=>node.id===videoHistoryId&&node.projectKey===activeKey)&&<VideoHistoryPicker key={`${user?.email}:${targetEmail}:${activeKey}:${videoHistoryId}`} email={targetEmail||user?.email} projectKey={activeKey} node={videoNodesStore.getNode(videoHistoryId)} projects={projects.map(project=>({key:project.key,name:project.name}))} assets={videoAssetStore.assets} canLoadMoreAssets={!!videoAssetStore.nextCursor} onLoadMoreAssets={videoAssetStore.loadMore} request={privateFetchRaw} light={lightCanvas} readOnly={readOnly||isNodeLocked(videoHistoryId)} onClose={()=>setVideoHistoryId(null)} onSelectResult={(id,revision)=>selectVideoResult(videoHistoryId,id,revision)} onReuseSettings={async snapshot=>{const node=videoNodesStore.getNode(videoHistoryId),account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;if(!node||readOnly||isNodeLocked(node.id))throw new Error("无法修改视频设置");const draft=videoHistoryDraft(snapshot);await mergeWorks(draft.choices.filter(choice=>choice.kind!=="text").map(choice=>choice.nodeId));if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)throw new Error("账号或项目已切换");await saveVideoDraft(node.id,{title:node.title,config:draft.config,inputs:draft.inputs,expectedRevision:node.revision});if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;setVideoHistoryId(null);openVideoEditor(node.id);}} onSent={async result=>{await mergeWorks([result.artworkId,...(result.artworkIds||[]),...(result.inputArtworkIds||[])]);await videoNodesStore.refresh();await videoAssetStore.refresh();}} onRetried={async()=>{await videoNodesStore.refresh();await videoTaskStore.refresh();await refreshCredits();}} onProcess={(id,action)=>{const account=canvasAccountRef.current;void mergeWorks([id]).then(()=>{if(account===canvasAccountRef.current)extractVideoToCanvas(id,action);}).catch(error=>flashTip(error instanceof Error?error.message:"媒体加载失败"));}}/>}
      {/* 从生成历史选择:作品选择器 */}
      {historyPicker && (
        <div
          data-testid="canvas-history-picker"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
          onClick={() => { if (!historyAddingRef.current) setHistoryPicker(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="canvas-history-picker-title"
            aria-busy={Boolean(historyAddingId)}
            className="canvas-ui-light flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
              <span id="canvas-history-picker-title" className="text-sm font-semibold">
                {t("canvas.fromHistory")}
              </span>
              <button
                type="button"
                aria-label={t("canvas.close")}
                disabled={Boolean(historyAddingId)}
                onClick={() => setHistoryPicker(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {historyPickerError && <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{historyPickerError}</p>}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {(() => {
                const available = (works ?? [])
                  .filter(
                    (w) =>
                      w.status === "completed" && hasRenderableImage(w.image) &&
                      !["workflow-decoration", "workflow-placeholder"].includes(w.source || "")
                  );
                const items = available.slice(0, historyVisibleCount);
                if (items.length === 0)
                  return (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {t("canvas.empty")}
                    </p>
                  );
                // 瀑布流:每张图按原始比例排列,不裁切、不变形,高低错落
                return (
                  <><div className="columns-3 gap-3 [column-fill:_balance] sm:columns-5">
                    {items.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        data-history-artwork-id={w.id}
                        disabled={Boolean(historyAddingId)}
                        onClick={() => void addFromHistory(w)}
                        title={w.title}
                        className="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition-all hover:-translate-y-0.5 hover:border-primary/50 disabled:cursor-wait disabled:opacity-60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <CachedImage
                          src={cdnUrl(w.image)}
                          alt={w.title}
                          loading="lazy"
                          className="block w-full"
                        />
                        {historyAddingId === w.id && <span className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 aria-label={locale === "en" ? "Adding artwork" : "正在添加"} className="h-5 w-5 animate-spin text-primary" /></span>}
                      </button>
                    ))}
                  </div>
                    {available.length > historyVisibleCount && <button type="button" disabled={Boolean(historyAddingId)} onClick={() => setHistoryVisibleCount(count => count + 60)} className="mx-auto mt-3 block rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">{locale === "en" ? "Load more" : "加载更多"}</button>}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 复制成功提示 */}
      {copyTip && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background shadow-lg">
          {t("canvas.copied")}
        </div>
      )}
      {/* 底部工具条临时提示 */}
      {tipMsg && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background shadow-lg">
          {tipMsg}
        </div>
      )}
      {/* 快捷键 / 帮助弹框 */}
      {helpOpen && <CanvasHelpDialog isMac={isMac} english={locale === "en"} onClose={() => setHelpOpen(false)} />}
      {/* 居中确认弹框(删除等),贴合站点暗色配色 */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-foreground">
              {confirmModal.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {confirmModal.message}
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
              >
                {t("canvas.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  fn();
                }}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {lightbox && (
        <ImageLightbox
          src={cdnUrl(lightbox.src)}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
      <CanvasWorkspacePagesView pages={workspacePages} lightCanvas={lightCanvas} commerceVisible={commerceVisible}
        t={t} applyTemplateToCanvas={applyTemplateToCanvas} refreshCredits={refreshCredits} />
    </div>
    </TextNodeContext.Provider>
    </PendContext.Provider>
  );
}
