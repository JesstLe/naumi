"use client";
import {CanvasCollaborationActions} from "@/components/collaboration/collaboration-entry";
import {useCollaboration} from "@/components/collaboration/collaboration-context";
import {useImagePromptSync} from "./use-image-prompt-sync";
import type {ImagePromptDocument} from "@/lib/canvas/image-prompt-schema";
import {uploadCanvasPromptReference} from "@/lib/canvas/persist-image-reference-upload";
import {newCanvasImageAttempt,forkPendingImageDraft,projectCanvasImageAttempts,canvasImageSubmissionKey,beginCanvasImageSubmission} from "@/lib/canvas/background-generation";
import {imageDraftKey} from "@/lib/canvas/image-node-drafts";
import type {CanvasGenerationTask} from "@/lib/canvas/scene-types";
import {generationPlaceholderSize,placeGenerationPreview} from "@/lib/canvas/generation-feedback";
import {carryCompletedCanvasImageDraft,carryUploadedCanvasImageDraft} from "@/lib/canvas/image-draft-completion";
import {useCanvasNativeEditors} from "./use-canvas-native-editors";
import {CanvasNativeEditors} from "./native-editors";
import {CanvasArtworkPicker} from "./artwork-picker";
import {useCanvasArtworkPicker} from "./use-canvas-artwork-picker";
import type {NodePreferenceChange} from "@/lib/canvas/node-preferences";
import {useCanvasNodePreferences} from "./use-canvas-node-preferences";
import {useCanvasTextEditing} from "./use-canvas-text-editing";
import {useCanvasProjectNavigation} from "./use-canvas-project-navigation";
import {canvasHistoryFailureMessage} from '@/lib/canvas/history-scope';
import {createCanvasSaveCommand} from '@/lib/canvas/save-command';
import {Save} from 'lucide-react';
import {canvasDeletableIds,applyCanvasLocalHistory,type CanvasLocalHistoryAction} from '@/lib/canvas/node-commands';
import {useComfyNodes} from "./comfy/use-comfy-nodes";
import {editComfyField,projectComfyGraph,type ComfyDocument} from "@/lib/comfyui/document";
import type {ComfyNodeActions} from "@/lib/canvas/comfy-node-schema";
import {useCanvasWorkflowDocument} from "./use-canvas-workflow-document";
import {canvasNativeDocuments} from "@/lib/canvas/native-document-lifecycle";
import {canvasHistoryScope,canvasHistoryInsertionView} from "@/lib/canvas/history-model";
import {useCanvasTemplateImports} from "./use-canvas-template-imports";
import {createCanvasTimelineActions} from "@/lib/canvas/timeline-actions";
import {useTimelineNodes} from "./timeline/use-timeline-nodes";
import {timelineInputChoices} from "@/lib/timeline/canvas";
import type {CanvasTimelineNode} from "@/lib/canvas/timeline-node-schema";
import type {TimelinePatchFields} from "@/lib/canvas/history-model";
import {createCanvasAudioActions} from "@/lib/canvas/audio-actions";
import {createCanvasReferenceAssetActions} from "@/lib/canvas/reference-asset-actions";
import {createCanvasDirectorActions} from "@/lib/canvas/director-actions";
import {createCanvasVideoNodeActions} from "@/lib/canvas/video-node-actions";
import {useAudioNodes,useAudioResultAdoption} from "./audio/use-audio-nodes";
import {audioInputChoices} from "@/lib/audio/canvas";
import type {CanvasAudioNode} from "@/lib/canvas/audio-node-schema";
import type {AudioPatchFields} from "@/lib/canvas/history-model";
import {loadCanvasImageVersions} from "@/lib/canvas/image-version-client";
import type {CanvasImageVersion,CanvasImageVersionList} from "@/lib/canvas/image-versions";
import {createCanvasResultAttachment,createCanvasImageVersionAttachment} from "@/lib/canvas/result-attachment";
import {useSceneNodes} from "./scene/use-scene-nodes";
import {sceneInputIdentity,sceneStateWithReferences,sceneDirectorSnapshot} from "@/lib/scene/project";
import {applySceneDirectorSnapshot} from "@/lib/scene/director";
import {sceneInputChoices} from "@/lib/scene/canvas";
import {useCharacterNodes} from "./character/use-character-nodes";
import type {CanvasCharacterNode} from "@/lib/canvas/character-node-schema";
import {characterInputIdentity,parseCharacterInputIdentity} from "@/lib/character/project";
import {characterInputChoices} from "@/lib/character/canvas";
import {executeCanvasImageCreation,generateCanvasAssistantImage,canvasInheritedImagePrompt,CANVAS_IMAGE_REFERENCE_LIMIT as MAX_TOTAL_IMAGES,type CanvasImageCreationServices} from "@/lib/canvas/image-creation";
import {canvasNodeMenuItems} from "./node-menu-items";
import {artworkFields} from "@/lib/canvas/artwork-write";
import {CanvasArtworkConflicts} from "./artwork-conflicts";
import { NODE_W, NODE_H, NODE_LABEL_H, IMAGE_NODE_MIN_W, IMAGE_NODE_MIN_H, IMAGE_NODE_MAX_W, IMAGE_NODE_MAX_H, artworkNodeSize, flowNodeSize } from "@/lib/canvas/node-geometry";
import type {CanvasPendingNode as Pend} from "@/lib/canvas/scene-types";
import { layoutGraph, projectCanvasScene } from "@/lib/canvas/scene-projection";
import {PendContext} from "./nodes/pending-node";
import {TextNodeContext} from "./nodes/text-node";
import {canvasNodeTypes,canvasEdgeTypes} from "./nodes/registry";
import {useCanvasSceneActions} from "./use-canvas-scene-actions";
import { resilientLocalStorage } from "@/lib/browser-storage/local";
import {useCanvasScene} from "./use-canvas-scene";
import {useCanvasSelection} from "./use-canvas-selection";
import {canvasSelectionTargets,canvasContextTargets,canvasSelectionProperties} from "@/lib/canvas/selection-projection";
import {optimizeCanvasVideoPrompt} from "@/lib/canvas/prompt-optimizer-client";
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
import {createCanvasPendingAtScreen,createCanvasMultiReferenceNode,createCanvasTextAtScreen,dispatchCanvasNodeCreation,type CanvasCreatableNodeKind,type CanvasPendingCreationPorts,type CanvasTextCreationPorts,type CanvasTextCreationOptions} from "@/lib/canvas/node-creation";
import {useCanvasDrag} from "./use-canvas-drag";
import {compileCanvasLink,canvasLinkMediaSource,type CanvasLinkIntent} from "@/lib/canvas/link-command";
import {compileCanvasMove} from "@/lib/canvas/drag-controller";
import { visibleTimeout } from "@/lib/visible-timeout";

import {useCanvasAssistant} from "./use-canvas-assistant";
import {useCanvasImageTextEditor} from "./use-canvas-image-text-editor";
import {CanvasImageTextPanel} from "./image-text-panel";
import type {CanvasImageTextContext,CanvasOcrSegment as OcrSegment} from "@/lib/canvas/image-text-editor";
import {canvasDocumentFetch,canvasDocumentHeaders} from "@/lib/canvas/document-scope";
import type {CanvasAssistantContext} from "@/lib/canvas/assistant-session";
import { CachedImage } from "@/components/cached-image";
import {useCanvasDownloads} from './use-canvas-downloads';
import { useFeatureAccess, FeatureVisible } from "@/lib/feature-access/client";


import { useCanvasArtworkDocument } from "./use-canvas-artwork-document";
import { isHostedImageUrl as hasRenderableImage } from "@/lib/media-url";
import {useBilling} from "@/lib/billing/client";
import { browserRandomUUID } from "@/lib/browser-crypto";
import type {FeatureId} from "@/lib/billing/types";
import { useImageQuality } from "@/lib/image-quality-context";
import { ImageQualityControl } from "@/components/image-quality-control";
import { copyText } from "@/lib/clipboard";
import { CANVAS_RATIO_OPTIONS, CANVAS_MAX_COUNT, normalizeCanvasCount, normalizeCanvasQuality } from "@/lib/canvas/generation-parameters";
import {useCanvasOverlayLayout} from "./use-canvas-overlay-layout";
import {canvasProjects,canvasProjectMonths,type CanvasProject as Project,type CanvasWorkflowKey} from "@/lib/canvas/project-catalog";
import {useCanvasProjectCatalog} from "./use-canvas-project-catalog";
import {CanvasProjectBrowser} from "./project-browser";
import {CanvasProjectMenu,CanvasProjectTitle} from "./project-chrome";
import { canvasGenerationReferences,canvasRegenerationReferences, explicitCanvasParent } from "@/lib/canvas/input-references";
import { readPlacementCache, type CanvasPoint } from "@/lib/canvas/stable-placement";
import { useCanvasTextDocument } from "./use-canvas-text-document";
import {resolveCanvasTextInstruction} from "@/lib/canvas/text-generation-input";
import {resolveLinkedImageText,type LinkedImageTextResult} from "@/lib/canvas/linked-image-text";
import {prepareLinkedImageText} from "@/lib/canvas/prepare-linked-image-text";
import {canvasTextContent} from "@/lib/canvas/text-content";
import {useTextNodeAutosave} from "./use-text-node-autosave";
import {CanvasTextConflicts} from "./text-conflicts";
import { CANVAS_TEXT_DEFAULT_WIDTH as TEXT_NODE_DEFAULT_W, CANVAS_TEXT_DEFAULT_HEIGHT as TEXT_NODE_DEFAULT_H } from "@/lib/canvas/text-document-model";
import { useCanvasHistory } from "./use-canvas-history";
import { textPatchOf, type CanvasTextNode, type VideoPatchFields, type DirectorPatchFields, type CharacterPatchFields, type ScenePatchFields, type CanvasHistoryAction as UndoAct } from "@/lib/canvas/history-model";
import type { HistoryCommit } from "@/lib/canvas/history-controller";
import { CanvasHistoryRequestError } from "@/lib/canvas/history-scope";
import {arrangeCanvasDocument} from "@/lib/canvas/arrange";
import { SurfaceAppearanceProvider } from "@/components/ui/surface-appearance";
import {submitCanvasCreationRequest,type CanvasCreationRequestInit} from "@/lib/canvas/creation-request";
import {ImagegenPendingRecovery} from "./imagegen-pending-recovery";
import {updateCanvasImagegenPlacement} from "@/lib/imagegen/client-recovery";
import {FrameRatioDialog,useCanvasFrameChoice} from "./frame-ratio-dialog";
import type {CanvasEditRequest} from "@/lib/canvas/edit-task";
import {runCanvasEdit} from "@/lib/canvas/edit-run";
import {runCanvasDetail} from "@/lib/canvas/detail-run";
import {createCanvasWorkflowRuns} from "@/lib/canvas/workflow-runs";
import type {CanvasGenerationRunContext} from "@/lib/canvas/generation-run-context";
import {useCanvasGenerationPresentation} from "./use-canvas-generation-presentation";
import {useCanvasPendingPresentation} from "./use-canvas-pending-presentation";
import {useCanvasVideoTaskFollow} from "./use-canvas-video-task-follow";
import type {CanvasGeneratedImage} from "@/lib/canvas/image-task-controller";
import {runCanvasDerivedImage,runCanvasBlankImage,type CanvasImageRunContext,type CanvasBlankImageOptions} from "@/lib/canvas/image-runs";
import {captureCanvasImageTaskScope,captureCanvasTaskOwner} from "@/lib/canvas/image-task-scope";
import {appendCanvasImageReferences,type CanvasImageGenerationOptions} from "@/lib/canvas/image-task-request";
import {generateCanvasVideo} from "@/lib/video/canvas-submission";
import {videoResultComposerNode} from "@/lib/canvas/video-result-composer";
import {readVideoReceipt,clearVideoReceipt} from "@/lib/video/canvas-receipts";
import {VideoSettingsDialog,type VideoNodeDraft} from "./video/settings-dialog";
import {StoryboardPanel} from "./video/storyboard-panel";
import {storyboardPlanningRequest} from "@/lib/video/storyboard-client";
import {VideoNodeToolbar} from "./video/node-toolbar";
import {VideoResultDock} from "./video/result-dock";
import {useVideoCatalog} from "./video/use-video-catalog";
import {useVideoNodes} from "./video/use-video-nodes";
import {useDirectorNodes,DirectorClientError} from "./director/use-director-nodes";
import {useVideoTasks} from "./video/use-video-tasks";
import { type VideoPlayerAction } from "./video/player";
import {MediaActionsDialog,type MediaInputChoice} from "./video/media-actions";
import {useMediaJobs} from "./video/use-media-jobs";
import {videoHistoryDraft} from "@/lib/video/client-history";
import {useVideoAssets,VideoAssetImportError} from "./video/use-video-assets";
import {VideoHistoryPicker} from "./video/history-picker";
import type {CanvasVideoNode} from "@/lib/canvas/video-node-schema";
import { videoNodeCreationDefaults, type VideoInputChoice } from "@/lib/video/client-settings";

import type {PublicQuote} from "@/lib/billing/client";
import { CanvasPerformanceProbe, recordCanvasNativeMove } from "./canvas-performance-probe";
import { generationFailureMessage, assertGenerationResultsPresent } from '@/lib/canvas/generation-failure';
import { ImagegenPreparationCancelled } from '@/lib/imagegen/http';
import { useImageNodeDraft } from './use-image-node-draft';
import {useCanvasImageModel} from './use-canvas-image-model';
import {useImageReferenceDraft} from './use-image-reference-draft';
import { resolveCanvasImageReferences, changeImageReferenceRole, imageReferenceManifest, inheritableImagePrompt, type CanvasImageReference, type ImageReferenceCandidate } from '@/lib/canvas/image-references';
import { referenceManifestError } from '@/lib/imagegen/reference-labels';
import { imageDraftScope } from '@/lib/canvas/image-node-drafts';
import { CanvasRenderLayerGuard } from './canvas-render-layer-guard';
import { CanvasGroupLayer } from "./group-layer";
import { CanvasEdgeHoverHint, type CanvasEdgeHoverHandle } from './canvas-edge-hover-hint';
import { canvasZoomState } from '@/lib/canvas/viewport-state';
import {CANVAS_MIN_ZOOM,CANVAS_MAX_ZOOM} from "@/lib/canvas/view-controls";
import {useCanvasViewControls} from "./use-canvas-view-controls";
import {useCanvasViewportFocus} from "./use-canvas-viewport-focus";
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
import type {TextImageMode} from "@/lib/canvas/text-image-inputs";
import type {CanvasTextImageContext} from "@/lib/canvas/text-image-runs";
import {useCanvasTextImages} from "./use-canvas-text-images";
import {useCanvasLocalImageEdits} from "./use-canvas-local-image-edits";
import {canvasImageToolState} from "@/lib/canvas/image-tool-state";
import {useCanvasStitch} from "./use-canvas-stitch";
import type {CanvasLocalImageEditPorts} from "@/lib/canvas/local-image-edits";
import { CanvasAssistantPanel } from "./canvas-assistant-panel";
import { useWorkflowPaste } from "./use-workflow-paste";
import type { ImportedManifest } from "@/lib/canvas/workflow-clipboard";
import { CanvasAgentToggle } from "./canvas-agent-toggle";
import { CanvasAgentOrb } from "./canvas-agent-orb";
import { useOrbCompanion } from "../naumi-orb/use-orb-companion";
import { useCanvasAssistantDisclosure } from "@/lib/canvas/assistant-disclosure";
import { defaultNodeSettings, type CanvasNodeSettings, type CanvasCrop } from "@/lib/canvas/node-settings";
const DEFAULT_CANVAS_SETTINGS = defaultNodeSettings();

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import {currentWorkspace,currentWorkspaceRevision} from '@/lib/saas/workspace-client';
import { useAuth } from "@/lib/auth-context";
import { useCanvasCredits } from "./use-canvas-credits";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useI18n } from "@/lib/i18n/locale-context";

import { Textarea } from "@/components/ui/textarea";
import { cdnUrl } from "@/lib/cdn";
import { ImageLightbox } from "@/components/image-lightbox";
import type {ComfyRunPayload,ComfyRunResult} from "@/lib/comfyui/run-contract";
import { BRAND, BRAND_CANVAS_LOGO } from "@/lib/brand";
const panelLoading = () => <div role="status" className="p-4 text-sm text-slate-500">加载中…</div>;
const AssistantRichText = dynamic(() => import("./assistant-richtext").then(module => module.AssistantRichText), { ssr: false, loading: panelLoading });
const ImageCropDialog = dynamic(() => import("./image-crop-dialog").then(module => module.ImageCropDialog), { ssr: false, loading: panelLoading });
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

// 占位节点(空白/上传中)动作上下文:让 React Flow 内的节点能调用主组件的上传
// 计算当前选中节点的整条血缘链路:上溯所有祖先 + 下延所有衍生(含自身)

// 画布助手上下文:锚定节点 + 上游祖先(BFS 近者优先),最多 5 张(与后端 MAX_CONTEXT_IMAGES 对齐)
// 构造展示节点与血缘连线；渲染不重新整理已有坐标。
const CANVAS_MULTI_SELECTION_KEYS = ["Control", "Meta", "Shift"];
const CANVAS_ZOOM_KEYS = ["Control", "Meta"];

export function CanvasClient({ initialProject, desktopAppearance = false }: { initialProject?: string; desktopAppearance?: boolean } = {}) {
  const collaboration = useCollaboration();
  const projectSearchParams = useSearchParams();
  const requestedProject = initialProject || projectSearchParams.get("project") || undefined;
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
  const artworkPlacementRef = useRef({ scope: "", positions: new Map<string, CanvasPoint>() });
  // 管理员看指定用户:?email=<用户> → 只读查看该用户画布;?node=<作品id> → 预选中那张
  const projectView=useCanvasProjectNavigation({ready,email:user?.email,requestedProject,ports:()=>({
    refreshProject:()=>Promise.all([canvasArtworkDocument.refresh(),canvasTextDocument.load().then(loaded=>{if(!loaded)throw new Error("文字节点加载失败");})]),
    select:(project,id)=>{
      const text=!!id&&textNodes.some(node=>node.id===id&&node.projectKey===project);
      selectCanvasProject(project,{selectedId:text?null:id,selectedTextId:text?id:null,selectedPendId:null});
      if(!id)canvasSelection.clear();
    },
    focus:focusCanvasNode,missing:()=>canvasSelection.patch({selectedId:null}),back:doBackToBrowser,
  })});
  const {navigation:projectNavigation,targetEmail,readOnly,activeKey,browsing,creatingNew,pinnedNode,pendingNode}=projectView;
  const canvasAccountRef=useRef("");canvasAccountRef.current=JSON.stringify([user?.email?.toLowerCase(),targetEmail?.toLowerCase()]);
  const canvasOwner=JSON.stringify([canvasAccountRef.current,currentWorkspaceRevision()]);
  const canvasOwnerEpochRef=useRef({key:canvasOwner,revision:0});
  if(canvasOwnerEpochRef.current.key!==canvasOwner)canvasOwnerEpochRef.current={key:canvasOwner,revision:canvasOwnerEpochRef.current.revision+1};
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const L = (zh: string, en: string) => locale === "en" ? en : zh;
  const canvasArtworkDocument = useCanvasArtworkDocument({account:canvasAccountRef.current,actor:user?.email||"",owner:targetEmail||user?.email||"",
    project:activeKey,enabled:ready&&!!user&&!!targetEmail,readOnly});
  const nodePreferences=useCanvasNodePreferences(canvasArtworkDocument.scope,{owner:targetEmail||user?.email||"",enabled:ready&&!!user,
    notice:flashTip,failed:L("节点属性读取失败，请刷新重试","Properties failed to load. Refresh to retry.")});
  const nodeSettings=nodePreferences.settings,nodeSettingsReady=nodePreferences.ready,settingsFor=nodePreferences.get,isNodeLocked=nodePreferences.locked;
  const generationPresentation=useCanvasGenerationPresentation(canvasArtworkDocument.scope);
  const generationTasks=generationPresentation.tasks;
  const imageSubmissionRef=useRef(new Map<string,symbol>()),originalImageChecksRef=useRef(new Map<string,symbol>());
  const [,setImageSubmissionEpoch]=useState(0);
  const {nodes:works,set:setWorks,recordDimensions:onNodeDimensions} = canvasArtworkDocument;
  worksRef.current=works;
  const projectCatalog=useCanvasProjectCatalog({scope:canvasArtworkDocument.scope,ready:ready&&!!targetEmail,actor:user?.email||"",target:targetEmail||"",readOnly,notice:flashTip,failure:t("canvas.genFail")});

  const frameChoice=useCanvasFrameChoice(imageDraftScope(user?.email,targetEmail,activeKey,currentWorkspace()));
  const canvasSelection=useCanvasSelection(canvasArtworkDocument.scope,()=>({
    catalogue:()=>({project:activeKey,artworks:active?.members||[],text:textNodesRef.current,video:videoNodesStore.nodes,director:directorNodesStore.nodes,character:characterNodesStore.nodes,scene:sceneNodesStore.nodes,audio:audioNodesStore.nodes,timeline:timelineNodesStore.nodes,comfy:comfyNodesStore.nodes}),
    tool:()=>canvasTool,taskFailed:id=>!!generationPresentation.getSnapshot().tasks.find(task=>task.id===id)?.failure,nodes:()=>rfNodes,
    nodesSelection:select=>setRfNodes(current=>current.map(node=>{const selected=select(node.id,!!node.selected);return !!node.selected===selected?node:{...node,selected};})),
    edgesSelection:select=>setRfEdges(current=>current.map(edge=>{const selected=select(edge.id,!!edge.selected);return !!edge.selected===selected?edge:{...edge,selected};})),
    leaveBox:()=>viewControls.selectTool("move"),timer:{set:(run,delay)=>window.setTimeout(run,delay),clear:token=>window.clearTimeout(token as number)},
  }));
  const {selectedId,setSelectedId,selectedPendId,setSelectedPendId,selectedTextId,setSelectedTextId,selectedEdge,setSelectedEdge,multiSel,setMultiSel}=canvasSelection;
  const {selectInProject:selectCanvasProject,project:projectCanvasSelection}=canvasSelection;
  const selectedIdRef = useRef<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const imageDraftNodeId = selectedPendId || selectedId;
  const imageDraftArtwork = selectedPendId ? undefined : works?.find(art => art.id === selectedId);
  const imageDraft = useImageNodeDraft(
    imageDraftScope(user?.email, targetEmail, activeKey,currentWorkspace()), imageDraftNodeId,
    { prompt: inheritableImagePrompt(imageDraftArtwork?.prompt), ratio: "auto" }, readOnly
  );
  const { prompt: editPrompt, setPrompt: setEditPrompt, ratio: genRatio, setRatio: setGenRatio } = imageDraft;
  const {model:genModel,models:imageModels,quality:genQuality,error:canvasImageCatalogError,resolution:genResolution,setResolution:setGenResolution,pick:pickGenerationModel,parameters:generationParameters}=
    useCanvasImageModel({draftKey:imageDraft.key,ratio:genRatio,setRatio:setGenRatio});
  const expandQuality = useImageQuality("canvas.expand").quality;
  const textEditQuality = useImageQuality("canvas.text-edit").quality;
  const annotateQuality = useImageQuality("canvas.annotate").quality;
  const canvasToolQualities: Partial<Record<FeatureId,string>> = {"canvas.expand":expandQuality,"canvas.text-edit":textEditQuality,"canvas.annotate":annotateQuality};
  const { catalog: cutoutCatalog, error: cutoutCatalogError } = useFeatureModels("tool.cutout");
  const [imageComposerMenuOpen,setImageComposerMenuOpen]=useState(false);
  const [genStyle, setGenStyle] = useState(GENERATION_STYLES[0]);
  const [genCount, setGenCount] = useState(1);
  const [generationMode, setGenerationMode] =
    useState<GenerationMode>("standard");
  // 自由拖动是默认；用户主动开启磁铁时才吸附网格。全局整理仅由手动动作触发。
  const [genError, setGenError] = useState<string | null>(null);
  const downloads=useCanvasDownloads(canvasArtworkDocument.scope,{notice:flashTip,
    imageFailed:L("下载失败，请重试","Download failed. Please try again."),archiveFailed:L("打包下载失败，请重试","Download failed. Please try again.")});
  const zipping=downloads.zipping;

  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );
  const [flowReady, setFlowReady] = useState(0);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  // 视口变换(平移/缩放),用于把生成器面板停靠到选中节点正下方并跟随
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const viewportRef = useRef(viewport);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  // 拉线建节点(5b):从 +端口拉出 → 记源节点;落空白弹「新建节点」菜单
  const spawnSourceRef = useRef<string | null>(null);
  const connectedRef = useRef(false);
  const [spawnMenu, setSpawnMenu] = useState<{
    x: number;
    y: number;
    sourceId: string;
    cx: number;
    cy: number;
  } | null>(null);
  // 右键菜单(5c):nodeId 有值=节点菜单,无值=空白菜单
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; // 画布区相对坐标(供添加节点/上传/历史落点)
    y: number;
    cx: number; // 视口坐标(供 body portal 固定定位)
    cy: number;
    nodeId?: string;
  } | null>(null);
  // The inline editor grows; the Dock body owns scrolling.
  const promptAreaRef=useRef<HTMLDivElement>(null);
  // 追加参考图(与节点图一起参与图生图)
  const referenceDraft=useImageReferenceDraft(imageDraft.key,user?.email?JSON.stringify([user.email.toLowerCase(),(targetEmail||user.email).toLowerCase()]):null,readOnly);
  const extraFiles=referenceDraft.files;
  const extraInputRef = useRef<HTMLInputElement>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const referenceUploadLock = useRef(false);
  // 节点剪贴板(复制/粘贴节点)+ 上传作根节点的文件 input
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

  // 「全部项目」网格里每张卡片的「...」菜单(重命名/删除)当前展开的是哪个项目
  // 回收站(软删除的作品):打开状态 + 列表 + 操作中
  const [trashOpen, setTrashOpen] = useState(false);
  const {trash:trashItems,trashBusy} = canvasArtworkDocument;
  // 剪刀剪线:鼠标悬停的连线 + 光标在画布内的位置(屏幕坐标,相对 canvasArea)
  const edgeHoverHintRef = useRef<CanvasEdgeHoverHandle>(null);
  // 连线选中(RF 原生点击选中):Delete/Backspace 才剪断,不再点一下就删
  const cuttingEdgesRef = useRef(new Set<string>());
  // 占位/空白节点(添加节点/拉线建节点 → 先出空白节点,里面上传带进度,完成后变真节点)
  const pendingPresentation=useCanvasPendingPresentation(canvasArtworkDocument.scope,readOnly);
  const {nodes:pendNodes,set:setPendNodes}=pendingPresentation;
  const pendNodesRef = useRef(pendNodes); pendNodesRef.current = pendNodes;
  // Session-local task ownership survives project switches; unknown paid work is
  // never discarded or restarted merely because its original view is hidden.
  const taskDocumentRef=useRef({merge:mergeWorks,history:pushAddUndoMany});
  taskDocumentRef.current={merge:mergeWorks,history:pushAddUndoMany};
  const [canvasImageTaskRefreshKey, setCanvasImageTaskRefreshKey] = useState(0);
  const pendSeqRef = useRef(1);
  const preparingPendingImagesRef=useRef(new Set<string>());
  const canvasTextDocument = useCanvasTextDocument({account:canvasAccountRef.current,actor:user?.email||"",owner:targetEmail||user?.email||"",
    project:activeKey,enabled:ready&&!!user&&!!targetEmail,readOnly,notice:flashTip});
  const {nodes:textNodes,set:setTextNodes,ready:textNodesReady,unsaved:unsavedTextCount} = canvasTextDocument;
  const textNodesRef = useRef(textNodes); textNodesRef.current = textNodes;
  const [textPrompt, setTextPrompt] = useState("");
  const textInstructionDrafts=useRef(new Map<string,string>()),textInstructionOwner=useRef(canvasOwner);
  if(textInstructionOwner.current!==canvasOwner){textInstructionOwner.current=canvasOwner;textInstructionDrafts.current.clear();}
  const textWriteBarrierRef=useRef(0);
  const textAutosave=useTextNodeAutosave<CanvasTextNode,{isCurrent:()=>boolean;document:typeof canvasTextDocument}>({
    getNode:id=>canvasTextDocument.getSnapshot().nodes.find(node=>node.id===id),
    save:(node,context)=>context.document.save(node),hasUnsaved:()=>canvasTextDocument.getSnapshot().unsaved>0,
  });
  const scheduleTextAutosave=(id:string)=>textAutosave.schedule(id,{isCurrent:canvasTextDocument.scope.documentCurrent,document:canvasTextDocument});
  // 文字节点一键放大/还原只改变当前画布视图，不写回节点尺寸；刷新后仍使用用户保存的原尺寸。
  const [textComposerExpanded, setTextComposerExpanded] = useState(false);
  const [mediaComposerExpanded,setMediaComposerExpanded]=useState(false);
  useEffect(()=>setMediaComposerExpanded(false),[selectedId,selectedPendId,activeKey,canvasOwner]);
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
  const [storyboardPanel,setStoryboardPanel]=useState<{projectKey:string;nodeIds:string[]}|null>(null);
  useEffect(()=>setStoryboardPanel(null),[activeKey,canvasOwner]);
  const [videoHistoryId,setVideoHistoryId]=useState<string|null>(null);
  const videoResultAttempts=useRef(new Map<string,Extract<UndoAct,{kind:"video-result"}>>());
  const [videoMedia,setVideoMedia]=useState<{id:string;projectKey:string;initial:VideoPlayerAction}|null>(null);
  const videoWorkActive=useRef(false);
  const videoNodesStore=useVideoNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope,pollIntervalMs:()=>videoWorkActive.current?6000:30000});
  const comfyNodesStore=useComfyNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const [comfyRunId,setComfyRunId]=useState<string|null>(null);
  useEffect(()=>{if(comfyNodesStore.error)flashTip(comfyNodesStore.error);},[comfyNodesStore.error]);
  const directorNodesStore=useDirectorNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  useEffect(()=>{if(directorNodesStore.error)flashTip(directorNodesStore.error);},[directorNodesStore.error]);
  const [directorActionsOwner]=useState(createCanvasDirectorActions);
  const characterNodesStore=useCharacterNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const [characterActionsOwner]=useState(()=>createCanvasReferenceAssetActions("character"));
  useEffect(()=>{if(characterNodesStore.error)flashTip(characterNodesStore.error);},[characterNodesStore.error]);
  const audioNodesStore=useAudioNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const [audioActionsOwner]=useState(createCanvasAudioActions);
  useEffect(()=>{if(audioNodesStore.error)flashTip(audioNodesStore.error);},[audioNodesStore.error]);
  const timelineNodesStore=useTimelineNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const [timelineActionsOwner]=useState(createCanvasTimelineActions);
  useEffect(()=>{if(timelineNodesStore.error)flashTip(timelineNodesStore.error);},[timelineNodesStore.error]);
  const sceneNodesStore=useSceneNodes({email:targetEmail||user?.email,readOnly,scope:canvasArtworkDocument.scope});
  const nativeEditors=useCanvasNativeEditors(canvasArtworkDocument.scope,{
    character:characterNodesStore,scene:sceneNodesStore,director:directorNodesStore,audio:audioNodesStore,timeline:timelineNodesStore,
  },(project,id)=>{canvasSelection.selectInProject(project,{selectedId:id,selectedTextId:null,selectedPendId:null,multiSel:[]});setPropertiesOpen(false);});
  const [sceneActionsOwner]=useState(()=>createCanvasReferenceAssetActions("scene"));
  useEffect(()=>{if(sceneNodesStore.error)flashTip(sceneNodesStore.error);},[sceneNodesStore.error]);
  const videoAssetStore=useVideoAssets({email:targetEmail||user?.email,readOnly,request:privateFetchRaw});
  const imageMoreRef = useRef<HTMLButtonElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const videoModelCatalog=useVideoCatalog({email:user?.email,ready,request:privateFetchRaw});
  const videoCatalog=videoModelCatalog.models;
  const videoCreationCatalogRef=useRef(videoModelCatalog);videoCreationCatalogRef.current=videoModelCatalog;
  const [videoNodeActionsOwner]=useState(createCanvasVideoNodeActions);
  const [videoNodeCreateBusy,setVideoNodeCreateBusy]=useState(false);
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
  const pendPromptRef = useRef<HTMLDivElement>(null);
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
  // 项目网格落地页(Figma 式):进画布先看项目卡片,点卡片才进入该项目的画布
  const viewControls=useCanvasViewControls({flow:rfRef,area:canvasAreaRef,zoom:viewport.zoom,zoomLabel:t("canvas.toolbar.zoom"),desktopAppearance,enabled:ready&&!!user,
    contextKey:canvasArtworkDocument.scope.key,scope:canvasArtworkDocument.scope,browsing,onMarquee:()=>{setSelectedId(null);setSelectedPendId(null);setSelectedTextId(null);clearCanvasSelection();}});
  const {tool:canvasTool,showMinimap,snapGrid,lightCanvas,isMac,modifierKey,zoomMenuOpen}=viewControls;
  const boxSelectMode=canvasTool==="marquee";
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
  const nativeDocuments=canvasNativeDocuments({videoNodes:videoNodesStore,directorNodes:directorNodesStore,characterNodes:characterNodesStore,sceneNodes:sceneNodesStore,audioNodes:audioNodesStore,timelineNodes:timelineNodesStore,comfyNodes:comfyNodesStore});
  const canvasHistory = useCanvasHistory({
    account: canvasAccountRef.current, project: activeKey, readOnly,
    artworkDocument:canvasArtworkDocument.history, works: setWorks, textDocument: {...canvasTextDocument.history,transaction:async(scope,work)=>{
      textWriteBarrierRef.current++;
      try{await textAutosave.flushAll();scope.assertView();return await canvasTextDocument.history.transaction(scope,work);}
      finally{textWriteBarrierRef.current--;}
    }}, settings: applyHistorySettings, selectedText: setSelectedTextId,
    native:nativeDocuments,flush:nativeDocuments.flush,
    validateOperations:operations=>{if(operations.some(op=>["text-patch","text-delete","text-restore"].includes(op.type)&&textTasks.state("id" in op?String(op.id):"node" in op?String(op.node.id):"").busy))throw new Error("文字正在生成或保存，请完成后再撤销");},
    video: videoNodesStore.getNode,director:directorNodesStore.getNode,character:characterNodesStore.getNode,scene:sceneNodesStore.getNode,audio:audioNodesStore.getNode,timeline:timelineNodesStore.getNode,comfy:comfyNodesStore.getNode,artwork:id=>canvasArtworkDocument.getSnapshot().nodes?.find(node=>node.id===id), refresh:nativeDocuments.refresh,
    pending: applyPendingLinkHistory, applied: onHistoryApplied, warning: flashTip,
  });
  const {undoStack,redoStack,pushUndo,historyBusyRef,historySaving,setHistorySaving,historyCurrent} = canvasHistory;
  const artworkPicker=useCanvasArtworkPicker(canvasHistory.scope,works,()=>({writable:()=>!!user&&!readOnly,project:()=>active?.key,
    viewport:()=>rfRef.current?.getViewport()??viewportRef.current,size:{width:NODE_W,height:NODE_H},
    copy:canvasNodeOperations.copy,applied:result=>selectCopiedNodes(result,true),failed:L("添加失败，请重试","Could not add this artwork. Please try again.") }));
  const historyPicker=artworkPicker.point;
  const templateImports=useCanvasTemplateImports(canvasArtworkDocument.scope,{
    writable:()=>!!user&&!readOnly,viewCurrent:importViewCurrent,merge:ids=>canvasArtworkDocument.merge(ids),history:canvasHistory,
    open:(id,projectKey)=>{resetImportScope();workspacePages.close();projectNavigation.open(projectKey);canvasSelection.selectInProject(projectKey,{selectedId:id,selectedTextId:null,selectedPendId:null});},
  });
  const textTasks=useCanvasTextTasks(canvasTextDocument.scope,{
    document:canvasTextDocument,
    prepare:async(request,scope)=>{
      await textAutosave.flushAll();await canvasTextDocument.flush();scope.assertView();
      const sourceIds=new Set(request.node.sourceIds||[]);
      // Model input is read server-side. Every linked text must ACK through the
      // original document first; unsaved non-conflict failures also block POST.
      for(const source of canvasTextDocument.getSnapshot().nodes.filter(node=>sourceIds.has(node.id))){
        if(!await canvasTextDocument.save(source))throw new Error("关联文字尚未保存，请先重试保存");
        scope.assertView();
      }
      if(!await canvasTextDocument.save(request.node))throw new Error("正文尚未保存，请重试");
      scope.assertView();if(textWriteBarrierRef.current||historyBusyRef.current||isNodeLocked(request.node.id))throw new Error("节点状态已变更，请重新操作");
    },
    historyEdit:(before,after)=>canvasHistory.record({...canvasHistory.scope,project:after.projectKey,key:JSON.stringify([canvasHistory.scope.account,canvasHistory.scope.workspace,after.projectKey])},{kind:"text-patch",id:after.id,from:textPatchOf(before),to:textPatchOf(after)}),
    submit:(request,submission,scope)=>privateFetch("/api/canvas/text-generate",{method:"POST",headers:{"content-type":"application/json","x-naumi-billing-intent-slot":request.node.id,...(request.operationId?{"x-naumi-billing-operation-id":request.operationId}:{})},body:JSON.stringify(request.payload),submission,isCurrent:scope.viewCurrent}),
    history:node=>canvasHistory.record({...canvasHistory.scope,project:node.projectKey,key:JSON.stringify([canvasHistory.scope.account,canvasHistory.scope.workspace,node.projectKey])},{kind:"text-add",records:[node]}),
    historyBatch:records=>canvasHistory.record({...canvasHistory.scope,project:records[0]?.projectKey||canvasHistory.scope.project,key:JSON.stringify([canvasHistory.scope.account,canvasHistory.scope.workspace,records[0]?.projectKey||canvasHistory.scope.project])},{kind:"text-add",records}),
    model:setTextModel,errorText:t("canvas.textGenerateFail"),
  });
  const promptMining=textTasks.busy("reverse"),assistBusy=textTasks.busy("assist");
  const canvasNodeOperations=useCanvasNodeOperations(canvasHistory.scope,{
    writable:()=>!!user&&!readOnly,
    native:nativeDocuments,
    snapshot:()=>({artworks:canvasArtworkDocument.getSnapshot().nodes||[],textNodes:canvasTextDocument.getSnapshot().nodes.map(node=>textTasks.state(node.id).busy?{...node,status:"generating" as const}:node),videoNodes:[],...nativeDocuments.snapshot(),pendingNodes:pendingPresentation.getSnapshot().map(node=>preparingPendingImagesRef.current.has(node.id)?{...node,generating:true}:node),generationTasks:[...generationPresentation.getSnapshot().tasks]}),
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
      if(scope.documentCurrent())nodePreferences.accept(result.settings);
      canvasHistory.record({...scope,project:result.projectKey,key:JSON.stringify([scope.account,scope.workspace,result.projectKey])},{kind:"workflow-add",artworks,textNodes:result.textNodes});
      if(!present)return;
      const view=viewControls.capture(scope);
      projectNavigation.open(result.projectKey); setSelectedId(null); setSelectedTextId(null);
      const missingAssets = artworks.filter(n => n.source === "workflow-placeholder").length;
      flashTip(missingAssets ? `工作流已导入，${missingAssets} 张图片待补齐` : result.missingReferences ? `工作流已导入，${result.missingReferences} 个外部引用未包含在选择中` : "工作流已导入");
      const ids = [...artworks.map(n => n.id), ...result.textNodes.map(n => n.id)];
      view.fitNodes(ids,result.projectKey);
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
  const localEdits=useCanvasLocalImageEdits(canvasArtworkDocument.scope);
  const stitch=useCanvasStitch(canvasArtworkDocument.scope),stitching=stitch.busy;
  const {crop:cropArtwork,busy:localEditBusy}=localEdits;
  const textImages=useCanvasTextImages(canvasArtworkDocument.scope);
  const {menu:genImageMenu,submitting:textImageSubmitting}=textImages;
  // 居中确认弹框(替代浏览器原生 confirm,贴合站点配色)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  async function pickExtra(list: FileList | null) {
    if (!list || !selected || !activeKey || readOnly || referenceUploadLock.current) return;
    const room = MAX_TOTAL_IMAGES - composerReferences.length;
    if (room <= 0) return;
    const files=Array.from(list).filter(file=>/^image\/(png|jpe?g|webp)$/.test(file.type)&&file.size<=MAX_UPLOAD).slice(0,room);
    if (!files.length) return;
    if (extraInputRef.current) extraInputRef.current.value = "";
    if(!promptSync.persisted){referenceDraft.add(files);return;}
    const owner=canvasAccountRef.current, ownerEpoch=canvasOwnerEpochRef.current.revision, workspace=currentWorkspace(), projectKey=activeKey, nodeId=selected.id;
    const isCurrent=()=>owner===canvasAccountRef.current&&ownerEpoch===canvasOwnerEpochRef.current.revision&&workspace===currentWorkspace()&&projectKey===activeProjectRef.current?.key;
    referenceUploadLock.current=true;setReferenceUploading(true);
    const added=[...(imageDraft.additionalReferenceIds||[])];
    try {
      await promptSync.flush();
      for (const file of files) {
        if(!isCurrent())throw new Error('画布已切换，图片保留在原项目');
        const sourceWorkspace=promptSync.workspace||workspace;
        const uploaded=await uploadCanvasPromptReference(file,{parentId:nodeId,projectKey,workspace:sourceWorkspace,ownerScope:owner,isCurrent});
        if(!isCurrent())return;
        await mergeWorks([uploaded.id],isCurrent);
        if(!isCurrent())return;
        added.push(uploaded.id);
        const saved=await promptSync.appendReference({workspace:sourceWorkspace,projectKey,nodeId},uploaded.id);
        if(!isCurrent())return;
        // Bind to the initiating node even if another node is now selected.
        imageDraft.seed(nodeId,{additionalReferenceIds:[...new Set(added)],referenceBindings:saved.bindings});
      }
    } catch(error) { if(isCurrent())setGenError(error instanceof Error?error.message:'参考图片保存失败，请重试'); }
    finally { referenceUploadLock.current=false;if(owner===canvasAccountRef.current)setReferenceUploading(false); }
  }

  useEffect(() => {
    if (ready && !user) openAuth("sign-in");
  }, [ready, user, openAuth]);

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

  const projects=useMemo(()=>canvasProjects({works,names:projectCatalog.names,t,readOnly,pinnedNode,textNodes,videoNodes:videoNodesStore.nodes,directorNodes:directorNodesStore.nodes,characterNodes:characterNodesStore.nodes,sceneNodes:sceneNodesStore.nodes,audioNodes:audioNodesStore.nodes,timelineNodes:timelineNodesStore.nodes,comfyNodes:comfyNodesStore.nodes}),[works,projectCatalog.names,t,readOnly,pinnedNode,textNodes,videoNodesStore.nodes,directorNodesStore.nodes,characterNodesStore.nodes,sceneNodesStore.nodes,audioNodesStore.nodes,timelineNodesStore.nodes,comfyNodesStore.nodes]);
  const projectMonths=useMemo(()=>canvasProjectMonths(projects,typeof navigator!=="undefined"&&navigator.language?navigator.language:"zh-CN"),[projects]);

  useEffect(()=>{
    projectNavigation.reconcile(projects,works!==null&&textNodesReady&&videoNodesStore.ready&&directorNodesStore.ready&&characterNodesStore.ready&&sceneNodesStore.ready&&audioNodesStore.ready&&timelineNodesStore.ready&&comfyNodesStore.ready&&projectView.requestedProjectReady,requestedProject);
  },[projectNavigation,projects,works,textNodesReady,videoNodesStore.ready,directorNodesStore.ready,characterNodesStore.ready,sceneNodesStore.ready,audioNodesStore.ready,timelineNodesStore.ready,comfyNodesStore.ready,requestedProject,projectView.requestedProjectReady,pendingNode]);

  const active = useMemo(
    () => projects.find((p) => p.key === activeKey) ?? null,
    [projects, activeKey]
  );
  const activeProjectRef = useRef(active);
  activeProjectRef.current = active;
  const canvasContextEpochRef = useRef(0);
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
    projectNavigation.start();
    canvasSelection.reset();
    pendingPresentation.clearTransient();
    setSidebarOpen(false);
  }
  function startWorkflow(key: CanvasWorkflowKey) {
    startNewProject();
    projectNavigation.deferStarter(()=>{
      const center=centerScreen();
      if(key==="copy"){
        addTextNodeAtScreen(center.x,center.y,{forceNewProject:true,title:t("canvas.workflowCopy"),prompt:t("canvas.workflowCopyPrompt")});return;
      }
      const pend=addPendAtScreen(center.x,center.y,null,false);
      setGenerationMode(key==="detail"?"detail":key==="views"?"triptych":"standard");
      imageDraft.seed(pend.id,{prompt:t(key==="detail"?"canvas.workflowDetailPrompt":key==="views"?"canvas.workflowViewsPrompt":"canvas.workflowHeroPrompt")},imageDraftScope(user?.email,targetEmail,null,currentWorkspace()));
      wantFocusPendPrompt.current=true;
    });
  }
  function restoreEditTasks() { pendingPresentation.restore(!readOnly); }
  useEffect(() => {
    if (!browsing) restoreEditTasks();
  }, [activeKey, active?.key, user?.email, targetEmail, browsing, readOnly, canvasArtworkDocument.scope.workspace]); // eslint-disable-line react-hooks/exhaustive-deps

  // 打开某个画布项目(从网格落地页点卡片)
  function openProject(key: string) {
    imageTextEditor.close();
    resetImportScope();
    projectNavigation.open(key);
    canvasSelection.reset();
    pendingPresentation.clearTransient();
    setSidebarOpen(false);
  }
  // 返回项目网格落地页(实际状态切换)
  function doBackToBrowser() {
    imageTextEditor.close();
    resetImportScope();
    projectNavigation.browse();
    canvasSelection.reset();
    pendingPresentation.clearTransient();
    setSidebarOpen(false);
  }
  // 「全部项目」按钮:若进做图页时压过历史,用浏览器后退消费掉它(popstate 里完成回项目页),
  // 保持历史栈一致;否则直接切回网格。
  function backToBrowser(){projectNavigation.back();}

  const artworkCommandsRef=useRef({history:canvasHistory,document:canvasArtworkDocument,warning:flashTip,failed:()=>t("canvas.genFail")});artworkCommandsRef.current={history:canvasHistory,document:canvasArtworkDocument,warning:flashTip,failed:()=>t("canvas.genFail")};
  const onArtworkCanvasResize = useCallback((
    id: string,
    bounds: { x: number; y: number; width: number; height: number }
  ) => {
    if (readOnly || isNodeLocked(id)) return;
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
  }, [user, readOnly, isNodeLocked]);

  const onArtworkCanvasRatioRepair = useCallback((id: string, width: number, height: number) => {
    if (readOnly || isNodeLocked(id)) return;
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
  }, [user, readOnly, isNodeLocked]);

  const requestNodeRename = useCallback((id: string, label: string) => {
    if(readOnly || isNodeLocked(id))return;
    if (readOnly) return;
    setSelectedId(id);
    setSelectedPendId(null);
    setSelectedTextId(null);
    setNodeRenameValue(label);
    setRenamingNodeId(id);
  }, [readOnly,isNodeLocked,setSelectedId,setSelectedPendId,setSelectedTextId]);

  const extractVideoToCanvas = useCallback((id:string,action:VideoPlayerAction)=>{
    if(readOnly||!user||isNodeLocked(id))return;
    const source=worksRef.current?.find(item=>item.id===id),node=videoNodesStore.getNode(id),project=activeProjectRef.current?.key;
    if(!project||!source?.videoUrl&&!node?.displayResultId&&!node?.lastResultId)return;
    setVideoMedia({id,projectKey:project,initial:action});
  },[readOnly,user,isNodeLocked,videoNodesStore.getNode]);

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
  useEffect(()=>{videoWorkActive.current=videoTaskStore.tasks.some(task=>task.status==="queued"||task.status==="processing");},[videoTaskStore.tasks]);
  const mediaJobStore=useMediaJobs({email:user?.email,projectKey:active?.key,readOnly,request:privateFetchRaw,onCompleted:async job=>{
    const project=activeProjectRef.current?.key;
    if(!project||job.projectKey!==project||job.source==="workbench")return;
    const ids=job.outputs.map(output=>output.artworkId);if(ids.length)await mergeWorks(ids);
    await refreshCredits();
  }});
  useEffect(()=>{if(videoMedia&&videoMedia.projectKey!==activeKey)setVideoMedia(null);},[activeKey,videoMedia]);
  function nativeNodeLocation(at:{x:number;y:number},id:string){
    const box=canvasAreaRef.current?.getBoundingClientRect(),point=rfRef.current?.screenToFlowPosition({x:at.x+(box?.left||0),y:at.y+(box?.top||0)})||{x:0,y:0};
    return {projectKey:!browsing&&!creatingNew&&activeKey?activeKey:`tree:${id}`,...point};
  }
  function revealNativeNode(node:{id:string;projectKey:string},open:(id:string,project?:string)=>void){open(node.id,node.projectKey);projectNavigation.open(node.projectKey);}
  function nativeReferenceDraft(input:{x:number;y:number;width:number;height:number;prompt:string;referenceArtworkIds:string[]}){
    const center=centerScreen(),pending=addPendAtScreen(center.x,center.y,null,false),{referenceArtworkIds:ids}=input;
    pendingPresentation.set(nodes=>nodes.map(node=>node.id===pending.id?{...node,x:input.x,y:input.y,inputs:ids,parentId:ids[0]||null,linked:ids.length>0}:node));
    imageDraft.seed(pending.id,{prompt:input.prompt,ratio:"auto"});setGenCount(1);wantFocusPendPrompt.current=true;focusEditableCanvasArea(input);
  }
  const referenceAssetPorts={english:locale==="en",writable:()=>!!user&&!readOnly,settingsReady:()=>nodeSettingsReady,locked:isNodeLocked,
    location:nativeNodeLocation,history:pushUndo,upload:(files:File[],project:string)=>videoAssetStore.upload(files,project),merge:mergeWorks,
    previewSize:{width:NODE_W,height:NODE_H},occupied:()=>(rfRef.current?.getNodes()||[]).map(node=>({...node.position,...flowNodeSize(node)})),draft:nativeReferenceDraft};
  const characterActions=characterActionsOwner.bind(canvasHistory.scope,{...referenceAssetPorts,store:characterNodesStore,
    created:node=>revealNativeNode(node,openCharacterEditor),uneditable:L("角色不可编辑","Character is not editable"),blocked:L("请先解锁角色","Unlock this character first"),missing:L("角色不存在","Character not found")});
  const sceneNodeActions=sceneActionsOwner.bind(canvasHistory.scope,{...referenceAssetPorts,store:sceneNodesStore,
    created:node=>revealNativeNode(node,openSceneEditor),uneditable:L("场景不可编辑","Scene is not editable"),blocked:L("请先解锁场景","Unlock this scene first"),missing:L("场景不存在","Scene not found")});
  const directorActions=directorActionsOwner.bind(canvasHistory.scope,{...referenceAssetPorts,store:directorNodesStore,
    created:node=>revealNativeNode(node,openDirectorEditor),uneditable:L("导演节点不可编辑","Director node is not editable"),blocked:L("请先解锁节点","Unlock this node first"),missing:L("导演节点不存在","Director node not found"),
    refresh:directorNodesStore.refresh,attach:directorNodesStore.attachOutput,conflict:error=>error instanceof DirectorClientError&&error.code==="DIRECTOR_REVISION_CONFLICT",
    position:async(operationId,id,point)=>{const response=await canvasDocumentFetch(canvasArtworkDocument.scope,"/api/canvas/history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operationId,operations:[{type:"position",id,text:false,...point}]})},true);return expectJsonOk(response,L("输出位置保存失败","Output position save failed"));}});
  const videoNodeActions=videoNodeActionsOwner.bind(canvasHistory.scope,{english:locale==="en",writable:()=>!!user&&!readOnly,allowed:()=>canFeature("video"),catalog:()=>videoCreationCatalogRef.current,
    location:(at,id)=>({...nativeNodeLocation(at,id),projectKey:active?.key||`tree:${id}`}),store:videoNodesStore,history:pushUndo,busy:setVideoNodeCreateBusy,notice:flashTip,
    created:node=>revealNativeNode(node,openVideoEditor)});
  useEffect(()=>{setVideoNodeCreateBusy(videoNodeActionsOwner.isCreating(canvasHistory.scope.key));},[videoNodeActionsOwner,canvasHistory.scope.key]);
  const audioActions=audioActionsOwner.bind(canvasHistory.scope,{
    english:locale==="en",writable:()=>!!user&&!readOnly,settingsReady:()=>nodeSettingsReady,locked:isNodeLocked,store:audioNodesStore,
    location:nativeNodeLocation,
    created:node=>revealNativeNode(node,openAudioEditor),history:pushUndo,
    upload:(files,project)=>videoAssetStore.upload(files,project),merge:mergeWorks,jobs:mediaJobStore.jobs,refresh:mediaJobStore.refresh,notice:flashTip,
  });
  const timelineActions=timelineActionsOwner.bind(canvasHistory.scope,{
    english:locale==="en",writable:()=>!!user&&!readOnly,settingsReady:()=>nodeSettingsReady,locked:isNodeLocked,store:timelineNodesStore,
    location:nativeNodeLocation,
    created:node=>revealNativeNode(node,openTimelineEditor),history:pushUndo,
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
    ...textNodes.filter(node=>node.projectKey===activeKey).map(node=>({id:node.id,nodeId:node.id,kind:"text" as const,title:node.title,value:canvasTextContent(node)||" ",available:node.status!=="generating"&&!textTasks.state(node.id).busy})),
    ...videoNodesStore.nodes.filter(node=>node.projectKey===activeKey).map(node=>{const task=videoTaskStore.tasks.find(task=>task.id===node.lastTaskId),art=(works||[]).find(art=>art.id===(node.displayResultId||node.lastResultId));return {id:node.id,nodeId:node.id,kind:"video" as const,title:node.title,value:art?.videoUrl||(!node.displayResultId?task?.videoUrl:undefined)||"/media/pending",available:!!(node.displayResultId||node.lastResultId)&&(art?.status==="completed"||!node.displayResultId&&task?.status==="completed")};}),
    ...videoAssetStore.choices,
  ].map(choice=>[choice.nodeId,choice])).values()),[active,activeKey,textNodes,videoNodesStore.nodes,videoTaskStore.tasks,works,visualReferenceIds,videoAssetStore.choices]);
  const videoInputChoices:VideoInputChoice[]=useMemo(()=>[...baseVideoInputChoices,...characterInputChoices(characterNodesStore.nodes.filter(node=>node.projectKey===activeKey),baseVideoInputChoices),...sceneInputChoices(sceneNodesStore.nodes.filter(node=>node.projectKey===activeKey),baseVideoInputChoices),...audioInputChoices(audioNodesStore.nodes.filter(node=>node.projectKey===activeKey),baseVideoInputChoices),...timelineInputChoices(timelineNodesStore.nodes.filter(node=>node.projectKey===activeKey),baseVideoInputChoices)],[baseVideoInputChoices,characterNodesStore.nodes,sceneNodesStore.nodes,audioNodesStore.nodes,timelineNodesStore.nodes,activeKey]);
  const videoResultLoads=useRef(new Map<string,number>());
  useEffect(()=>{
    if(!user?.email||!activeKey||readOnly)return;
    const account=canvasAccountRef.current,epoch=canvasContextEpochRef.current,known=new Set((works||[]).map(art=>art.id)),now=Date.now();
    const ids=Array.from(new Set([...videoNodesStore.nodes.filter(node=>node.projectKey===activeKey&&!node.deletedAt).map(node=>node.displayResultId||node.lastResultId),...directorNodesStore.nodes.filter(node=>node.projectKey===activeKey).flatMap(node=>node.outputs.map(output=>output.artworkId)),...visualReferenceIds].filter((id):id is string=>!!id&&!known.has(id)&&!canvasArtworkDocument.absent(id)))).filter(id=>{const key=JSON.stringify([account,activeKey,id]),last=videoResultLoads.current.get(key)||0;if(now-last<15000)return false;videoResultLoads.current.set(key,now);return true;});
    if(!ids.length)return;
    void (async()=>{for(let offset=0;offset<ids.length;offset+=100){if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;await mergeWorks(ids.slice(offset,offset+100));}})().catch(()=>{});
  },[user?.email,targetEmail,activeKey,readOnly,works,videoNodesStore.nodes,directorNodesStore.nodes,characterNodesStore.nodes,sceneNodesStore.nodes,audioNodesStore.nodes,timelineNodesStore.nodes,visualReferenceIds]);
  const selectionCatalogue=useMemo(()=>({project:activeKey,artworks:active?.members||[],text:textNodes,pending:pendNodes,
    video:videoNodesStore.nodes,director:directorNodesStore.nodes,character:characterNodesStore.nodes,scene:sceneNodesStore.nodes,audio:audioNodesStore.nodes,timeline:timelineNodesStore.nodes,comfy:comfyNodesStore.nodes}),
    [activeKey,active?.members,textNodes,pendNodes,videoNodesStore.nodes,directorNodesStore.nodes,characterNodesStore.nodes,sceneNodesStore.nodes,audioNodesStore.nodes,timelineNodesStore.nodes,comfyNodesStore.nodes]);
  const selectionTargets=useMemo(()=>canvasSelectionTargets(selectionCatalogue,{selectedId,selectedTextId,selectedPendId}),[selectionCatalogue,selectedId,selectedTextId,selectedPendId]);
  const {artwork:selected,text:selectedText,pending:selectedPend,video:selectedVideo,director:selectedDirector,character:selectedCharacter,scene:selectedScene,audio:selectedAudio,timeline:selectedTimeline}=selectionTargets;
  // Keep result selection/geometry/media actions intact; only its composer
  // reuses the explicitly recorded native generation owner.
  const resultVideoComposer=useMemo(()=>selected?.videoUrl&&selected.category!=="audio"
    ?videoResultComposerNode(selected.id,activeKey,videoNodesStore.nodes,videoTaskStore.tasks):null,
    [selected,activeKey,videoNodesStore.nodes,videoTaskStore.tasks]);
  const videoComposerNode=selectedVideo||(canFeature("video")?resultVideoComposer:null);
  const selectedProperties=canvasSelectionProperties(selectionTargets);
  const mixedNativeSelection=multiSel.length>1&&(multiSel.some(id=>videoNodesStore.getNode(id)||directorNodesStore.getNode(id)||characterNodesStore.getNode(id)||sceneNodesStore.getNode(id)||audioNodesStore.getNode(id)||timelineNodesStore.getNode(id))||multiSel.some(id=>textNodesRef.current.some(node=>node.id===id))&&multiSel.some(id=>!textNodesRef.current.some(node=>node.id===id)));

  // Follow existing durable videos; this page does not own another polling/task system.
  useCanvasVideoTaskFollow(canvasArtworkDocument.scope,!!user&&!!active&&!readOnly,{
    project:()=>activeProjectRef.current,request:(url,init)=>canvasDocumentFetch(canvasArtworkDocument.scope,url,init,true),pending:pendingPresentation,
    position:source=>{const node=source?rfRef.current?.getNode(source.id):null,size=node&&source?flowNodeSize(node):source?artworkNodeSize(source):{width:NODE_W,height:NODE_H};return{x:(node?.position.x??source?.canvasX??0)+size.width+X_GAP,y:node?.position.y??source?.canvasY??0};},
    merge:mergeWorks,credits:refreshCredits,notice:flashTip,
    messages:{attention:t("canvas.videoNeedsAttention"),attentionHint:t("canvas.videoNeedsAttentionHint"),openTasks:t("canvas.videoOpenTasks")},
    timer:{set:(run,delay)=>visibleTimeout(run,delay),clear:cancel=>(cancel as ()=>void)()},
  });

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
  const selectedImageAttempts=projectCanvasImageAttempts([...generationTasks].filter(task=>task.isVisible?.()??true),selectedId||"");
  function imageToolState(source:Artwork|null|undefined){return canvasImageToolState({source,readOnly,ready:nodeSettingsReady,locked:!!source&&isNodeLocked(source.id),
    cutoutReady:!!cutoutCatalog&&!cutoutCatalogError&&cutoutCatalog.available!==false&&cutoutCatalog.supported!==false,cutoutError:cutoutCatalogError});}
  const selectedImageTools=imageToolState(selected);
  const selectedImageSubmitting=!!selectedId&&(imageSubmissionRef.current.has(canvasImageSubmissionKey(canvasAccountRef.current,currentWorkspace(),activeProjectRef.current?.key||null,selectedId))||generationTasks.some(task=>task.sourceId===selectedId&&!task.failure&&task.stage==="preparing"));
  const selectedPendingSubmitting=!!selectedPendId&&imageSubmissionRef.current.has(canvasImageSubmissionKey(canvasAccountRef.current,currentWorkspace(),activeProjectRef.current?.key||null,selectedPendId));
  const selectedGenerationFailure = selectedImageAttempts.current?.failure||generationTasks.find(task => !task.replaceNode&&task.failure && task.sourceId === selectedId && (task.isVisible?.() ?? true))?.failure
    || pendNodes.find(node => node.generationFailure && node.parentId === selectedId)?.generationFailure;
  const selectedGenerationRetry = generationTasks.find(task => task.failure && task.sourceId === selectedId && (task.isVisible?.() ?? true))?.onRetry
    || pendNodes.find(node => node.generationFailure && node.parentId === selectedId)?.onGenerationRetry;
  // Updating this node still uses its current image as the default edit target.
  const dockReferenceState = useMemo(() => {
    try { return { references: generationMode==="standard"?canvasRegenerationReferences(selected,active?.members??[]):canvasGenerationReferences(selected,active?.members??[]), error: "" }; }
    catch(error) { return { references: [], error: error instanceof Error ? error.message : "参考图尚未同步" }; }
  }, [selected, active?.members,generationMode]);
  const dockRefs = dockReferenceState.references;
  // Explicit removals belong to this node draft too; hiding the composer does not restore them.
  const hiddenRefIds=imageDraft.hiddenReferenceIds;
  const visibleDockRefs = useMemo(
    () => dockRefs.filter((r) => !hiddenRefIds?.includes(r.id)),
    [dockRefs, hiddenRefIds]
  );
  // Prompt remains the input to the existing task owner; resize and picker
  // state belong to the selected text composer, not the canvas document.
  useEffect(() => {
    setTextComposerExpanded(false);
    setTextPrompt(selectedTextId?textInstructionDrafts.current.get(selectedTextId)??textNodesRef.current.find(node=>node.id===selectedTextId)?.prompt??"":"");
  }, [selectedTextId,selectedText?.id,canvasOwner]);
  const linkedImageText=resolveLinkedImageText({
    nodes:textNodes.map(node=>({...node,busy:textTasks.state(node.id).busy})),
    targetId:selectedPend?.id||selectedId||"",projectKey:activeKey||"workspace",
    explicitTextIds:selectedPend?[selectedPend.parentId,...selectedPend.inputs].filter((id):id is string=>!!id?.startsWith("text-")):[],draft:editPrompt,
  });
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
    for(const id of imageDraft.additionalReferenceIds||[]){
      if(imageDraft.hiddenReferenceIds?.includes(id)||candidates.some(ref=>ref.key===`node:${id}`))continue;
      const art=works?.find(item=>item.id===id&&item.image&&!item.videoUrl);
      if(art)candidates.push({key:`node:${id}`,sourceNodeId:id,title:art.title||L('图片节点','Image node'),url:art.image});
    }
    if (!selectedPend) for(const upload of referenceDraft.uploads)candidates.push({key:upload.key,title:upload.file.name,url:upload.url,file:upload.file});
    return resolveCanvasImageReferences(candidates, imageDraft.referenceBindings,!selectedPend&&generationMode==="standard"&&selected?`node:${selected.id}`:undefined);
  }, [selectedPend, pendInputArts, visibleDockRefs, referenceDraft.uploads, imageDraft.referenceBindings, imageDraft.additionalReferenceIds, imageDraft.hiddenReferenceIds, works, generationMode, selected]);
  const composerReferences = imageReferenceState.references;
  useEffect(() => {
    if (JSON.stringify(imageReferenceState.bindings) !== JSON.stringify(imageDraft.referenceBindings || [])) imageDraft.setReferenceBindings(imageReferenceState.bindings);
  }, [imageDraft.key, imageReferenceState.bindings, imageDraft.referenceBindings]);
  const referenceError = referenceManifestError(editPrompt, imageReferenceManifest(composerReferences));
  const imagePromptDocument:ImagePromptDocument={version:1,prompt:editPrompt,
    bindings:imageReferenceState.bindings.filter(binding=>binding.key.startsWith('node:')),
    activeKeys:composerReferences.filter(ref=>ref.key.startsWith('node:')).map(ref=>ref.key),
    additionalKeys:(imageDraft.additionalReferenceIds||[]).map(id=>`node:${id}`).filter(key=>composerReferences.some(ref=>ref.key===key)),
    hiddenReferenceIds:imageDraft.hiddenReferenceIds||[]};
  const promptSync=useImagePromptSync({owner:canvasAccountRef.current,ownerRevision:canvasOwnerEpochRef.current.revision,address:!readOnly&&user&&activeKey&&!selectedPend&&selected?.image&&!selected.videoUrl?{workspace:currentWorkspace(),projectKey:activeKey,nodeId:selected.id}:null,
    document:referenceDraft.uploads.length||selected&&isNodeLocked(selected.id)?null:imagePromptDocument,request:fetch,
    hydrate:async document=>{
      const owner=canvasAccountRef.current,epoch=canvasOwnerEpochRef.current.revision,nodeId=imageDraftNodeId;
      const current=()=>owner===canvasAccountRef.current&&epoch===canvasOwnerEpochRef.current.revision;
      const ids=(document.additionalKeys||[]).map(key=>key.slice(5));
      if(ids.some(id=>!worksRef.current?.some(art=>art.id===id)))await mergeWorks(ids,current);
      if(current()&&nodeId)imageDraft.seed(nodeId,{prompt:document.prompt,referenceBindings:document.bindings,hiddenReferenceIds:document.hiddenReferenceIds,additionalReferenceIds:ids});
    }});
  async function flushImagePrompts(){
    const owner=canvasAccountRef.current,epoch=canvasContextEpochRef.current,workspace=currentWorkspace();
    if(referenceUploadLock.current)throw new Error('参考图片正在保存，请稍后重试');
    await promptSync.flush();
    if(owner!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current||workspace!==currentWorkspace())throw new Error('画布已切换，请在当前画布重新操作');
  }
  function removeComposerReference(ref: CanvasImageReference) {
    if (selectedPend) setPendNodes(nodes => nodes.map(node => node.id === selectedPend.id ? { ...node, inputs: node.inputs.filter(id => id !== ref.sourceNodeId) } : node));
    else if (ref.file) referenceDraft.remove(ref.key);
    else if (ref.sourceNodeId) {imageDraft.setHiddenReferenceIds([...(hiddenRefIds||[]),ref.sourceNodeId]);imageDraft.setAdditionalReferenceIds((imageDraft.additionalReferenceIds||[]).filter(id=>id!==ref.sourceNodeId));}
  }
  function locateComposerReference(id: string) {
    void rfRef.current?.fitView({ nodes: [{ id }], padding: 0.8, duration: 240, maxZoom: 1 });
  }
  const appendComposerReferences = appendCanvasImageReferences;

  // 生成中:在选中节点下方临时插入"生成中"占位节点;
  // 选中时:整条血缘链路点亮(蓝色流光),其余节点/连线变暗。
  const textEditing=useCanvasTextEditing(canvasTextDocument.scope,()=>({writable:()=>!!user&&!readOnly&&nodeSettingsReady&&!textWriteBarrierRef.current&&!historyBusyRef.current,locked:id=>isNodeLocked(id)||textTasks.state(id).busy,document:canvasTextDocument,history:canvasHistory,
    autosave:{schedule:scheduleTextAutosave,flush:textAutosave.flush}}),textNodesReady,textNodes);
  const expandedTextIds=textEditing.expanded;

  async function patchComfyDocument(id:string,update:(document:ComfyDocument)=>ComfyDocument){
    const scope=canvasHistory.scope;
    if(readOnly||!user||isNodeLocked(id))throw new Error("工作流为只读");
    return canvasHistory.submit(scope,()=>{const node=comfyNodesStore.getNode(id);if(!node||node.deletedAt)throw new Error("工作流不存在");return {kind:"comfy-patch",id,from:{workflow:node.workflow},to:{workflow:update(node.workflow)}};});
  }
  const comfyActionsRef=useRef<ComfyNodeActions>(null!);
  comfyActionsRef.current={
    field:(id,nodeId,key,value)=>patchComfyDocument(id,doc=>editComfyField(doc,nodeId,key,value)),
    move:(id,nodeId,x,y)=>patchComfyDocument(id,doc=>({...doc,positions:{...doc.positions,[nodeId]:{x,y}}})),
    collapse:id=>patchComfyDocument(id,doc=>({...doc,collapsed:!doc.collapsed})),
    run:id=>{setComfyRunId(id);setComfyOpen(true);},
  };
  const comfyActions=useMemo<ComfyNodeActions>(()=>({field:(...args)=>comfyActionsRef.current.field(...args),move:(...args)=>comfyActionsRef.current.move(...args),collapse:(...args)=>comfyActionsRef.current.collapse(...args),run:(...args)=>comfyActionsRef.current.run(...args)}),[]);
  const comfyImportsRef=useRef(new Map<string,string>());
  async function addComfyToCanvas(name:string,workflow:ComfyDocument){
    const scope=canvasArtworkDocument.scope;scope.assertView();if(readOnly||!user)throw new Error("当前画布为只读");
    const destination=(!browsing&&!creatingNew?activeKey:null),fingerprint=JSON.stringify([scope.account,scope.workspace,destination,name,workflow]);
    const id=comfyImportsRef.current.get(fingerprint)||`comfy-${browserRandomUUID()}`;comfyImportsRef.current.set(fingerprint,id);
    const projectKey=destination||`tree:${id}`,graph=projectComfyGraph(workflow);
    const v=viewportRef.current,point={x:(canvasSize.width/2-v.x)/v.zoom,y:(canvasSize.height/2-v.y)/v.zoom};
    const node=await comfyNodesStore.save(id,{projectKey,title:name,workflow,x:Math.round(point.x),y:Math.round(point.y),width:graph.width,height:graph.height+52});
    comfyImportsRef.current.delete(fingerprint);if(!scope.viewCurrent())return;
    canvasHistory.record({...scope,project:projectKey,key:canvasHistoryScope(scope.account,scope.workspace,projectKey)},{kind:"comfy-add",records:[node]});
    projectNavigation.open(projectKey);canvasSelection.selectInProject(projectKey,{selectedId:node.id,selectedTextId:null,selectedPendId:null,multiSel:[]});
    viewControls.focusNode(node.id,projectKey);
  }
  const {displayNodes,displayEdges}=useMemo(()=>projectCanvasScene({nodes,edges,comfyNodes:comfyNodesStore.nodes,comfyActions,comfySaving:comfyNodesStore.saving,active,activeKey,generationTasks:generationTasks.filter(task=>canvasArtworkDocument.scope.viewCurrent()&&(task.isVisible?.()??true)),taskPositions:generationPresentation.positions,
    textBusyIds:new Set(textNodes.filter(node=>textTasks.state(node.id).busy).map(node=>node.id)),pendNodes,textNodes,videoNodes:videoNodesStore.nodes,directorNodes:directorNodesStore.nodes,characterNodes:characterNodesStore.nodes,sceneNodes:sceneNodesStore.nodes,audioNodes:audioNodesStore.nodes,timelineNodes:timelineNodesStore.nodes,videoTasks:videoTaskStore.tasks,works,selectedId,selectedPendId,selectedTextId,multiSel,expandedTextIds,
    locale,lightCanvas,nodeSettings,nodeSettingsReady,readOnly,cutoutAvailable:!!cutoutCatalog&&!cutoutCatalogError&&cutoutCatalog.available!==false,
    operations:generationPresentation.operations,workflowManifests,actions:sceneActions}),
    [comfyNodesStore.nodes,comfyNodesStore.saving,comfyActions,textTasks.revision,nodes,edges,active,activeKey,generationTasks,generationPresentation.positions,generationPresentation.operations,pendNodes,textNodes,videoNodesStore.nodes,directorNodesStore.nodes,characterNodesStore.nodes,sceneNodesStore.nodes,audioNodesStore.nodes,timelineNodesStore.nodes,videoTaskStore.tasks,works,selectedId,selectedPendId,selectedTextId,multiSel,expandedTextIds,
      locale,lightCanvas,nodeSettings,nodeSettingsReady,readOnly,cutoutCatalog,cutoutCatalogError,workflowManifests,sceneActions,canvasArtworkDocument.scope]);
  const {rfNodes,setRfNodes,onNodesChange,rfEdges,setRfEdges,onEdgesChange,holdPositions}=useCanvasScene(displayNodes,displayEdges,canvasArtworkDocument.scope);
  useEffect(()=>{projectCanvasSelection();},[rfNodes,projectCanvasSelection]);

  function selectWorkflowGroup(ids:string[]){canvasSelection.group(ids);}
  function clearCanvasSelection(exitBoxMode=false){canvasSelection.clear(exitBoxMode);}
  function applyArtworkSelection(ids:string[]){canvasSelection.selectIds(ids);}
  function toggleArtworkBatchSelection(nodeId:string,base?:string[]){canvasSelection.toggle(nodeId,base);}

  const {nodeScreen,dockStyle,topbarStyle,overlaySafeArea,panelRef,textComposerDockRef,nodeToolbarRef,nodeRenamePositionRef,updateLiveViewport}=useCanvasOverlayLayout({
    flow:rfRef,viewport:viewportRef,nodes:rfNodes,size:canvasSize,selection:{selectedId,selectedPendId,selectedTextId},contextMenuOpen:!!ctxMenu,
    textComposerExpanded,mediaComposerExpanded,readOnly,nodeTitleHeight:selectedVideo||selected?.videoUrl?38:0,anchorTitleHeight:selectedVideo?38:0,protectImageNodeTitle:!!selected&&!selected.videoUrl,compactImage:!!selected||!!selectedPend||!!selectedVideo,
    measurementKey:JSON.stringify([selectedBatchArts.length,selectedTextBatchNodes.length,browsing,videoComposerNode?.id??null]),
    contextKey:JSON.stringify([canvasArtworkDocument.scope.key,canvasContextEpochRef.current]),syncZoom:viewControls.syncZoom});

  // 重命名节点:本地改标题 + 落库(节点标签 = 作品 title)
  async function saveNodeRename() {
    const id = renamingNodeId;
    const name = nodeRenameValue.trim();
    setRenamingNodeId(null);
    if (!id || !user || readOnly || !name || isNodeLocked(id)) return;
    const comfy=comfyNodesStore.getNode(id);if(comfy){if(comfy.title!==name)try{await canvasHistory.submit(canvasHistory.scope,()=>({kind:"comfy-patch",id,from:{title:comfy.title},to:{title:name}}));}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const character=characterNodesStore.getNode(id);if(character){if(character.title!==name)try{await patchCharacterNode(id,{title:name,character:{...character.character,name}});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const audio=audioNodesStore.getNode(id);if(audio){if(audio.title!==name)try{await patchAudioNode(id,{title:name});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const timeline=timelineNodesStore.getNode(id);if(timeline){if(timeline.title!==name)try{await patchTimelineNode(id,{title:name});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const scene=sceneNodesStore.getNode(id);if(scene){if(scene.title!==name)try{await patchSceneNode(id,{title:name,scene:{...scene.scene,name}});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const director=directorNodesStore.getNode(id);if(director){if(director.title!==name)try{await patchDirectorNode(id,{title:name,project:{...director.project,name}});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    const videoNode=videoNodesStore.getNode(id);
    if(videoNode){if(videoNode.title!==name)try{await patchVideoNode(id,{title:name});}catch(error){flashTip(error instanceof Error?error.message:t("canvas.genFail"));}return;}
    if(canvasTextDocument.getSnapshot().nodes.some(node=>node.id===id)){await textEditing.rename(id,name);return;}
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
  function livePendingPosition(id: string, fallback: CanvasPoint): CanvasPoint {
    const pending = pendingPresentation.get(id);
    return rfRef.current?.getNode(id)?.position ?? (pending ? {x:pending.x,y:pending.y} : fallback);
  }

  function rememberGenerationDrag(id: string, position: CanvasPoint, saveReceipt = false, operationKey?: string) {
    if (id.startsWith("task-")) {
      generationPresentation.drag(id,position,saveReceipt);
      const task=generationPresentation.getSnapshot().tasks.find(task=>task.id===id);
      if(saveReceipt&&task?.slotIndex!==undefined&&user)try{
        updateCanvasImagegenPlacement(recoveryScope,`node:${task.operationKey}`,placement=>({...placement,slots:placement.slots.map((slot,index)=>index===task.slotIndex?{...slot,...position}:slot)}));
      }catch{flashTip(L("位置尚未保存，原任务已保留","Position not saved; original task retained"));}
    }
    pendingPresentation.drag(id,position,saveReceipt);
  }

  /** Canvas supplies the current scene, scoped stores and existing document I/O. */
  function canvasImageRunContext(isCurrent?:()=>boolean):CanvasImageRunContext {
    return {
      capture:()=>{
        const account=canvasAccountRef.current,project=activeProjectRef.current?.key||null,epoch=canvasContextEpochRef.current;
        return captureCanvasImageTaskScope(user!.email,project,()=>batchRunMountedRef.current&&account===canvasAccountRef.current&&project===(activeProjectRef.current?.key||null)&&epoch===canvasContextEpochRef.current&&(isCurrent?.()??true));
      },
      generation:generationPresentation,pending:pendingPresentation,
      geometry:{gap:X_GAP,artworkSize:artworkNodeSize,
        source:art=>{const node=rfRef.current?.getNode(art.id)??rfNodes.find(item=>item.id===art.id);return{point:node?.position??{x:art.canvasX||0,y:art.canvasY||0},size:node?flowNodeSize(node):artworkNodeSize(art),inScene:!!node};},
        occupied:()=>(rfRef.current?.getNodes()??rfNodes).map(node=>({...node.position,...flowNodeSize(node)})),position:livePendingPosition},
      document:{merge:mergeWorks,history:pushAddUndoMany},replacementHistory:pushUndo,
      attachTextImages:(ids,images)=>canvasTextDocument.attachImageResults(ids,images.map(image=>image.id)),
      submit:async(form,current)=>privateFetch("/api/generate-image",{method:"POST",headers:await authHeader(),body:form,isCurrent:current}),
      user:value=>applyServerUser(value as Parameters<typeof applyServerUser>[0]),notice:flashTip,clearError:()=>setGenError(null),
      errorText:t("canvas.genFail"),saveErrorText:t("canvas.saveFailed"),pendingLabel:t("canvas.pending"),resultGap:NODE_LABEL_H+24,
    };
  }
  async function runGen(source:Artwork,prompt:string,opts?:CanvasImageGenerationOptions):Promise<GeneratedResult[]> {
    if(!user||!imageToolState(source).canMutate)return [];
    const presentation=generationPresentation;
    const visibleAttempt=()=>!opts?.replaceNode||projectCanvasImageAttempts([...presentation.getSnapshot().tasks],source.id).current?.operationKey===(opts.operationKey??`node:${source.id}`);
    return runCanvasDerivedImage({source,prompt,options:opts,model:genModel,quality:genQuality,models:imageModels,
      failed:failure=>{const message=generationFailureMessage(failure);if(selectedIdRef.current===source.id&&visibleAttempt())setGenError(message);else flashTip(`${source.title}：${message}`);},
      succeeded:()=>{if(selectedIdRef.current===source.id&&visibleAttempt())setGenError(null);}},canvasImageRunContext(opts?.isCurrent));
  }

  // 抠图使用管理员配置的处理器；旧 fast/fine 不是图片模型的质量档位。
  // 同步返回,新节点落在生成占位处,挂在源节点下。
  async function runCutout(source: Artwork, _quality: "fast" | "fine" = "fine") {
    if (readOnly || !user || !canFeature("cutout") || isNodeLocked(source.id)) return;
    if (!cutoutCatalog || cutoutCatalogError || cutoutCatalog.available === false || cutoutCatalog.supported === false) { setGenError(cutoutCatalogError || "抠图执行配置尚未就绪，请稍后再试"); return; }
    return landEditResult(source,{kind:"cutout",source},"抠图");
  }

  const [textComposerFocusRevision,setTextComposerFocusRevision]=useState(0);
  function canvasImageCreationServices():CanvasImageCreationServices {
    const scope=captureCanvasTaskOwner(user?.email||"",()=>({account:canvasAccountRef.current,project:activeProjectRef.current?.key||null,epoch:canvasContextEpochRef.current,mounted:batchRunMountedRef.current})).capture();
    return {isCurrent:scope.isCurrent,generate:runGen,rename:renameGeneratedArtwork,
      detail:input=>generateDetailSequence(input.source,input.references,input.prompt,input.files,undefined,input.referenceInputs)};
  }

  // The document remains the sole persistence owner; prepare only direct inputs.
  function prepareImageText(targetId:string,project:string|null,draft:string,isCurrent:()=>boolean,explicitTextIds:readonly string[]=[]){
    return prepareLinkedImageText({
      read:()=>resolveLinkedImageText({nodes:canvasTextDocument.getSnapshot().nodes.map(node=>({...node,busy:textTasks.state(node.id).busy})),targetId,projectKey:project||"workspace",explicitTextIds,draft}),
      flush:ids=>Promise.all(ids.map(id=>textAutosave.flush(id))),wait:ids=>canvasTextDocument.flush(ids),
      isUnsaved:id=>canvasTextDocument.hasUnsaved(id)||textAutosave.hasPending(id),isCurrent,
    });
  }

  // 面板「生成」:用编辑框提示词 + 参数 + 追加参考图(留空=按这张图再生成一张)
  async function generateSelectedImage(onSubmitted?:()=>void){
    if(!selected)return;
    const scope=canvasArtworkDocument.scope;
    const account=canvasAccountRef.current,workspace=currentWorkspace(),project=activeProjectRef.current?.key||null,epoch=canvasContextEpochRef.current;
    const unlock=beginCanvasImageSubmission(imageSubmissionRef.current,canvasImageSubmissionKey(account,workspace,project,selected.id));if(!unlock)return;
    const release=()=>{if(unlock())setImageSubmissionEpoch(value=>value+1);};setImageSubmissionEpoch(value=>value+1);
    try{
      try{await flushImagePrompts();}catch(error){setGenError(error instanceof Error?error.message:"提示词尚未保存");return;}
      const current=()=>scope.viewCurrent()&&account===canvasAccountRef.current&&workspace===currentWorkspace()&&project===(activeProjectRef.current?.key||null)&&epoch===canvasContextEpochRef.current;
      if(!current())return;
      let linked:LinkedImageTextResult;
      try{linked=await prepareImageText(selected.id,project,editPrompt,current);}catch(error){if(current())setGenError(error instanceof Error?error.message:"关联文字尚未保存");return;}
      if(!current()||textWriteBarrierRef.current||historyBusyRef.current||isNodeLocked(selected.id)||!canvasArtworkDocument.getSnapshot().nodes?.some(node=>node.id===selected.id))return;
      const captured=canvasImageCreationServices(),services={...captured,isCurrent:()=>current()&&captured.isCurrent()};
      const issue=await executeCanvasImageCreation({source:selected,prompt:linked.prompt,mode:generationMode,parameters:{ratio:genRatio,style:genStyle,count:genCount,resolution:genResolution},references:visibleDockRefs,files:extraFiles,referenceInputs:composerReferences,referenceError:dockReferenceState.error||referenceError,
        operationKey:generationMode==="standard"?newCanvasImageAttempt(selected.id):undefined,onSubmitted:()=>{release();onSubmitted?.();}},services);
      if(issue&&services.isCurrent())setGenError(issue);
    }finally{release();}
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
    if(!user||!imageToolState(artwork).canMutate)return;assistantSession.detach();setPropertiesOpen(false);suspendAssistant();
    await imageTextEditor.open(artwork,canvasImageTextContext());
  }
  function applyOcrSegment(segment:OcrSegment){const source=active?.members.find(artwork=>artwork.id===ocrArtworkId);if(!user||!imageToolState(source).canMutate)return Promise.resolve();return imageTextEditor.apply(segment,canvasImageTextContext());}
  function applyAllOcrSegments(){return imageTextEditor.applyAll(canvasImageTextContext());}

  /** React supplies geometry and existing document/transport adapters only. */
  function canvasGenerationRunContext():CanvasGenerationRunContext {
    return {
      owner:captureCanvasTaskOwner(user!.email,()=>({account:canvasAccountRef.current,project:activeProjectRef.current?.key||null,epoch:canvasContextEpochRef.current,mounted:batchRunMountedRef.current})),
      generation:generationPresentation,pending:pendingPresentation,
      geometry:{gap:X_GAP,artworkSize:artworkNodeSize,
        source:art=>{const node=rfRef.current?.getNode(art.id);return {point:node?.position??{x:art.canvasX??0,y:art.canvasY??0},size:node?flowNodeSize(node):artworkNodeSize(art),inScene:!!node};},
        occupied:()=>(rfRef.current?.getNodes()??rfNodes).map(node=>({...node.position,...flowNodeSize(node)})),
        position:livePendingPosition},
      document:{merge:(ids,current)=>taskDocumentRef.current.merge(ids,current),history:(ids,arts)=>taskDocumentRef.current.history(ids,arts)},
      submit:(url,init,scope,submission)=>privateFetch(url,{...init,isCurrent:scope.isCurrent,submission}),
      user:value=>applyServerUser(value as Parameters<typeof applyServerUser>[0]),notice:flashTip,
    };
  }
  async function landEditResult(source:Artwork,request:CanvasEditRequest,label:string):Promise<boolean> {
    if(!user||!imageToolState(source).canMutate)return false;
    return runCanvasEdit({source,request,label},canvasGenerationRunContext());
  }

  async function openVideoNodeFromSelection(blank=false,at?:{x:number;y:number}){
    if(readOnly||!user)return;
    const ids=blank?new Set<string>():new Set([...multiSel,...(selectedId?[selectedId]:[]),...(selectedTextId?[selectedTextId]:[])]);
    try{return await videoNodeActions.create({at:at??centerScreen(),blank,prompt:selected?.prompt||"",choices:videoInputChoices.filter(choice=>ids.has(choice.nodeId))});}
    catch(error){flashTip(error instanceof Error?error.message:"新增视频节点失败");}
  }
  function openVideoEditor(id:string,project=canvasHistory.scope.project){
    canvasSelection.selectInProject(project,{selectedId:id,selectedTextId:null,selectedPendId:null,multiSel:[]});setPropertiesOpen(false);setVideoDockAdvancedId(null);
  }
  function patchVideoNode(id:string,patch:VideoPatchFields&{expectedRevision?:number}){return videoNodeActions.patch(id,patch);}
  async function saveVideoDraft(id:string,draft:VideoNodeDraft){return patchVideoNode(id,{title:draft.title,config:draft.config,inputs:draft.inputs,expectedRevision:draft.expectedRevision});}
  function openCharacterEditor(id:string,project?:string){return nativeEditors.open("character",id,project);}
  function createCharacterNode(at:{x:number;y:number}){if(readOnly||!user)return;return characterActions.create(at).catch(error=>flashTip(error instanceof Error?error.message:L("角色创建失败","Character creation failed")));}
  function patchCharacterNode(id:string,patch:CharacterPatchFields&{expectedRevision?:number}){return characterActions.patch(id,patch);}
  function openAudioEditor(id:string,project?:string){return nativeEditors.open("audio",id,project);}
  function openTimelineEditor(id:string,project?:string){return nativeEditors.open("timeline",id,project);}
  function createTimelineNode(at:{x:number;y:number}){return timelineActions.create(at).catch(error=>{flashTip(error instanceof Error?error.message:L("多轨创建失败","Multitrack creation failed"));});}
  function patchTimelineNode(id:string,patch:TimelinePatchFields&{expectedRevision?:number}){return timelineActions.patch(id,patch);}
  function createAudioNode(at:{x:number;y:number}){return audioActions.create(at).catch(error=>{flashTip(error instanceof Error?error.message:L("音频创建失败","Audio creation failed"));});}
  function editAudioResult(art:Artwork){
    if(readOnly||!user||!nodeSettingsReady||isNodeLocked(art.id)||art.category!=="audio")return;
    const existing=audioNodesStore.nodes.find(node=>node.projectKey===activeKey&&!node.deletedAt&&node.audio.sourceArtworkId===art.id);
    if(existing){openAudioEditor(existing.id);return;}
    void audioActions.create(centerScreen(),{artworkId:art.id,title:art.title}).catch(error=>flashTip(error instanceof Error?error.message:L("音频创建失败","Audio creation failed")));
  }
  function patchAudioNode(id:string,patch:AudioPatchFields&{expectedRevision?:number},resultAdoption=false){return audioActions.patch(id,patch,resultAdoption);}
  function openSceneEditor(id:string,project?:string){return nativeEditors.open("scene",id,project);}
  function createSceneNode(at:{x:number;y:number}){if(readOnly||!user)return;return sceneNodeActions.create(at).catch(error=>flashTip(error instanceof Error?error.message:L("场景创建失败","Scene creation failed")));}
  function patchSceneNode(id:string,patch:ScenePatchFields&{expectedRevision?:number}){return sceneNodeActions.patch(id,patch);}
  function openDirectorEditor(id:string,project?:string){return nativeEditors.open("director",id,project);}
  function createDirectorNode(at:{x:number;y:number}){if(readOnly||!user)return;return directorActions.create(at).catch(error=>flashTip(error instanceof Error?error.message:L("导演节点创建失败","Director node creation failed")));}
  function patchDirectorNode(id:string,patch:DirectorPatchFields&{expectedRevision?:number}){return directorActions.patch(id,patch);}
  async function generateVideoDraft(id:string,draft:VideoNodeDraft,quote:PublicQuote|null,onPersisted?: (revision:number)=>void,count=1){
    if(!user||readOnly)throw new Error("无法修改此画布");
    const scope=canvasHistory.scope;
    return generateCanvasVideo({email:user.email,nodeId:id,draft,quote,onPersisted,count},{assertCurrent:scope.assertView,isCurrent:scope.viewCurrent},{
      storage:resilientLocalStorage,request:(url,init)=>canvasDocumentFetch(scope,url,init,true),
      submit:async(url,init,quote,onIdentity)=>billing.submit(url,{...init,headers:await canvasDocumentHeaders(scope,init.headers,true)},quote,onIdentity),
      node:videoNodesStore.getNode,save:saveVideoDraft,
      refreshNodes:videoNodesStore.refresh,refreshTasks:videoTaskStore.refresh,refreshCredits,
    });
  }

  async function checkOriginalImageTask(task:CanvasGenerationTask) {
    if(!task.onRetry||task.failure?.kind==='not-started'||readOnly)return;
    const unlock=beginCanvasImageSubmission(originalImageChecksRef.current,task.operationKey);
    if(!unlock)return;
    const account=canvasAccountRef.current,project=activeProjectRef.current?.key||null,epoch=canvasContextEpochRef.current;
    setImageSubmissionEpoch(value=>value+1);
    try { await task.onRetry(); }
    catch(error){
      if(account===canvasAccountRef.current&&project===(activeProjectRef.current?.key||null)&&epoch===canvasContextEpochRef.current)
        setGenError(error instanceof Error?error.message:L('原任务暂未核对完成','Original task check is incomplete'));
    } finally { if(unlock())setImageSubmissionEpoch(value=>value+1); }
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

  const workflowRunsRef=useRef<ReturnType<typeof createCanvasWorkflowRuns>|null>(null);
  if(!workflowRunsRef.current)workflowRunsRef.current=createCanvasWorkflowRuns();
  async function runComfyWorkflow(source:Artwork|null,payload:ComfyRunPayload):Promise<ComfyRunResult>{
    if(readOnly||!user)throw new Error("只读画布不能执行工作流");
    return workflowRunsRef.current!.run(source,payload,{...canvasGenerationRunContext(),storage:resilientLocalStorage,submitted:()=>videoTaskStore.refresh()},payload.workflowId.startsWith("canvas-comfy:")?comfyNodesStore.getNode(payload.workflowId.slice("canvas-comfy:".length)):undefined);
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
      video:async(nodes,isCurrent)=>{if(isCurrent()&&nodes.some(node=>node.projectKey===scope.project)){await videoNodesStore.refresh();void videoTaskStore.refresh().catch(()=>{});}},
      storyboard:async(result,isCurrent)=>{await videoNodesStore.refresh();if(isCurrent())setStoryboardPanel(result);},
      text:(nodes,signal,isCurrent)=>canvasTextDocument.refreshSaved(nodes,signal,isCurrent),
      revealVideo:async(result,isCurrent)=>{if(activeProjectRef.current?.key||!isCurrent())return;await videoNodesStore.refresh();if(isCurrent()){projectNavigation.open(result.key);canvasSelection.selectInProject(result.key,{selectedId:result.nodeId,selectedTextId:null,selectedPendId:null});}},
    };
  }
  function currentAssistantReferences(){return assistantSession.refs(canvasAssistantContext());}
  function uploadAssistantImages(files:File[]){if(readOnly||!user)return Promise.resolve();return assistantSession.upload(files,canvasAssistantContext());}
  function sendAssistantMessage(continueText=false,prepared?:ReturnType<typeof storyboardPlanningRequest>){if(readOnly||!user)return Promise.resolve();return assistantSession.send(canvasAssistantContext(),continueText,prepared);}
  function planTextStoryboard(source:CanvasTextNode){
    if(readOnly||assistantBusy||assistantUploading||source.projectKey!==activeKey||!canFeature("agent")||!canFeature("video"))return;
    try{const prepared=storyboardPlanningRequest(source,locale==="en");setPropertiesOpen(false);imageTextEditor.close();assistantSession.anchor(source.id);discloseAssistant(true);void sendAssistantMessage(false,prepared);}
    catch(error){flashTip(error instanceof Error?error.message:"分镜规划未开始");}
  }

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



  // Detail planning/execution remains in its application; Canvas maps current UI input and error placement.
  async function generateDetailSequence(source:Artwork,referenceArts:Artwork[],feedback:string,uploadedRefs:File[]=[],pend?:Pend,referenceInputs?:CanvasImageReference[]) {
    if(!user||readOnly||generationPresentation.busy(pend?`pend:${pend.id}`:`node:${source.id}`))return;
    const count=Math.max(1,Math.min(MAX_GENERATION_COUNT,genCount||1));setGenError(null);
    return runCanvasDetail({request:{source,references:referenceArts,uploads:uploadedRefs,referenceInputs,feedback,model:genModel,ratio:genRatio,count,maxReferences:MAX_TOTAL_IMAGES,missingReferences:t("canvas.detailNeedRefs")},pending:pend,
      label:done=>fmt(t("canvas.detailProgress"),{done,total:count}),errorText:t("canvas.genFail"),saveErrorText:t("canvas.saveFailed"),
      failed:failure=>{const message=generationFailureMessage(failure);if(pend?selectedPendIdRef.current===pend.id:selectedIdRef.current===source.id)setGenError(message);else flashTip(`${source.title}：${message}`);},
      attached:(id,artworkId)=>{void rewirePendingBranchSources(id,artworkId).then(()=>{canvasHistory.consumePending(id);setSelectedPendId(current=>current===id?null:current);});},
    },canvasGenerationRunContext());
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
    if(!user||readOnly||historyBusyRef.current||ids.some(id=>preparingPendingImagesRef.current.has(id)))return;
    if(!nodeSettingsReady||ids.some(isNodeLocked)){flashTip(L("请先解锁选中的节点","Unlock selected nodes first"));return;}
    const scope=canvasHistory.scope;
    try {
      if(!await canvasNodeOperations.remove(ids)||!scope.viewCurrent())return;
      canvasSelection.patch({selectedId:null,selectedTextId:null,selectedPendId:null,multiSel:multiSel.filter(id=>!ids.includes(id))});
      const members=active?.members||[],texts=canvasTextDocument.getSnapshot().nodes;
      if(activeKey&&!members.some(node=>!ids.includes(node.id))&&!texts.some(node=>node.projectKey===activeKey)&&!videoNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!directorNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!characterNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!sceneNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!audioNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!timelineNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))&&!comfyNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))){
        projectNavigation.empty();
      }
    }catch(error){if(scope.viewCurrent())flashTip(canvasHistoryFailureMessage(error,t("canvas.genFail")));}
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
  const saveCommand=useRef(createCanvasSaveCommand()),[manualSaving,setManualSaving]=useState(false);
  async function saveCanvasChanges(){
    if(readOnly||!user||browsing)return;
    const scope=canvasHistory.scope;setManualSaving(true);
    try{
      await saveCommand.current.run(scope,{flush:textAutosave.flushAll,
        retry:[()=>canvasTextDocument.retry(),()=>videoNodesStore.retryPending(),flushImagePrompts,
          ()=>Promise.all([directorNodesStore.flush(),characterNodesStore.flush(),sceneNodesStore.flush(),audioNodesStore.flush(),timelineNodesStore.flush(),comfyNodesStore.flush()])],
        history:()=>canvasHistory.retry(),unsaved:()=>canvasTextDocument.getSnapshot().unsaved>0||videoNodesStore.getSnapshot().unsavedCount>0});
      if(scope.viewCurrent())flashTip(L("修改已保存","Changes saved"));
    }catch(error){if(scope.viewCurrent())flashTip(canvasHistoryFailureMessage(error,t("canvas.saveFailed")));}
    finally{setManualSaving(false);}
  }
  function applyPendingLinkHistory(act:CanvasLocalHistoryAction,undo:boolean,checkOnly=false,scope=canvasHistory.scope){
    const hidden=applyCanvasLocalHistory(act,undo,{pending:pendingPresentation.atScope(scope),generation:generationPresentation.atScope(scope)},checkOnly);
    if(!checkOnly&&scope.viewCurrent()&&hidden.length){const ids=new Set(hidden);canvasSelection.patch({selectedId:selectedId&&ids.has(selectedId)?null:selectedId,selectedPendId:selectedPendId&&ids.has(selectedPendId)?null:selectedPendId,multiSel:multiSel.filter(id=>!ids.has(id))});}
  }
  function applyHistorySettings(update:(current:Record<string,CanvasNodeSettings>)=>Record<string,CanvasNodeSettings>,persisted:boolean){nodePreferences.apply(update,persisted);}
  function onHistoryApplied({action:act,undo}: HistoryCommit) {
    // Version provenance never overwrites the independently editable image draft.
    const insertion=canvasHistoryInsertionView(act,undo,active);
    if(insertion){if(undo&&insertion.empty)projectNavigation.empty();if(!undo){projectNavigation.open(insertion.project);}}

  }

  function loadImageVersions(nodeId:string){return loadCanvasImageVersions(canvasHistory.scope,nodeId);}
  async function selectImageVersion(nodeId:string,version:CanvasImageVersion,from:CanvasImageVersionList){
    if(readOnly||historyBusyRef.current||isNodeLocked(nodeId))return;
    await canvasHistory.submit(canvasHistory.scope,()=>({kind:"image-version",id:nodeId,from:{versionId:from.currentVersionId,image:from.image},to:{versionId:version.id,image:version.image}}));
  }
  function openProperties() {
    suspendAssistant();imageTextEditor.close();setPropertiesOpen(true);
  }
  async function commitNodeSettings(id:string,to:NodePreferenceChange){
    return nodePreferences.commit(id,to,{writable:()=>!!user&&!readOnly,kinds:nativeDocuments.settingsKinds,history:canvasHistory,notice:flashTip,failed:t("canvas.saveFailed")});
  }
  function nodeManagementItems(id: string) {
    const settings=settingsFor(id),disabled=readOnly || !nodeSettingsReady || historySaving;
    return [
      {id:"lock-node",icon:settings.locked?Unlock:Lock,label:settings.locked?L("解锁节点","Unlock node"):L("锁定节点","Lock node"),disabled,
        onSelect:()=>void commitNodeSettings(id,"toggle-lock")},
      {id:"front-node",icon:ArrowUpToLine,label:L("置于顶层","Bring to front"),disabled:disabled||settings.locked,
        onSelect:()=>void commitNodeSettings(id,"front")},
      {id:"back-node",icon:ArrowDownToLine,label:L("置于底层","Send to back"),disabled:disabled||settings.locked,
        onSelect:()=>void commitNodeSettings(id,"back")},
    ];
  }
  function canvasLocalEditContext():CanvasLocalImageEditPorts {
    const account=canvasAccountRef.current,epoch=canvasContextEpochRef.current,scope=canvasArtworkDocument.scope;
    return {writable:()=>!!user&&!readOnly,ready:nodeSettingsReady,locked:isNodeLocked,
      viewCurrent:()=>batchRunMountedRef.current&&account===canvasAccountRef.current&&epoch===canvasContextEpochRef.current&&scope.viewCurrent()&&importViewCurrent(),
      merge:ids=>canvasArtworkDocument.merge(ids),history:canvasHistory,fill:(art,file)=>workflowDocument.fill(art,file),
      applied:id=>{projectNavigation.requestNode(id);setSelectedId(id);setSelectedTextId(null);},notice:flashTip,
      messages:{invalidFile:L("请选择12MB以内的PNG、JPEG或WebP","Choose a PNG, JPEG or WebP up to 12MB"),failed:L("图片编辑失败","Image edit failed"),
        filled:"图片已补齐",fillFailed:"补图失败，请重试",saved:L("新版本已保存，原图保留","New version saved; original kept"),
        unknown:L("原编辑结果待同步，请稍后重试","The original edit is awaiting sync. Try again shortly"),missing:L("编辑已保存，结果尚未同步，请重试","The edit was saved; retry to sync its result")},
    };
  }
  function requestReplace(artwork:Artwork){if(localEdits.requestReplacement(artwork,canvasLocalEditContext()))replaceInputRef.current?.click();}
  async function saveLocalImageEdit(artwork:Artwork,crop?:CanvasCrop,file?:File){await localEdits.execute(artwork,crop,file,canvasLocalEditContext());}
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
    if (readOnly || !user) return;
    const real = canvasDeletableIds(ids.filter(id=>!preparingPendingImagesRef.current.has(id)),{textNodes:canvasTextDocument.getSnapshot().nodes,pendingNodes:pendingPresentation.getSnapshot(),generationTasks:[...generationPresentation.getSnapshot().tasks]});
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
    if(selectedPendId){batchDelete([selectedPendId]);return;}
    if(selectedId?.startsWith("task-")){batchDelete([selectedId]);return;}
    if(selectedId&&(comfyNodesStore.getNode(selectedId)||videoNodesStore.getNode(selectedId)||directorNodesStore.getNode(selectedId)||characterNodesStore.getNode(selectedId)||sceneNodesStore.getNode(selectedId)||audioNodesStore.getNode(selectedId)||timelineNodesStore.getNode(selectedId))){batchDelete([selectedId]);return;}
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
      if(scope.viewCurrent()&&p.key===activeKey){projectNavigation.browse(true);canvasSelection.patch({selectedId:null,selectedTextId:null,selectedPendId:null});}
    }catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }

  async function downloadProject(){if(active)await downloads.archive(active.members,active.name||"project");}
  async function downloadBatchSelection(){if(active&&selectedBatchArts.length>=2)await downloads.archive(selectedBatchArts,`${active.name||"project"}-已选-${selectedBatchArts.length}张`);}

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

  async function stitchBatchSelection(){
    if(!user||readOnly||selectedBatchArts.length<2)return;
    const scope=canvasArtworkDocument.scope,epoch=canvasContextEpochRef.current;
    const selectedNodes=(rfRef.current?.getNodes()??[]).filter(node=>selectedBatchIds.includes(node.id));
    const x=selectedNodes.length?Math.max(...selectedNodes.map(node=>node.position.x+flowNodeSize(node).width))+X_GAP:0;
    const y=selectedNodes.length?Math.min(...selectedNodes.map(node=>node.position.y)):0;
    await stitch.run({ids:selectedBatchIds,title:fmt(t("canvas.longImageTitle"),{n:selectedBatchIds.length}),x,y},{
      writable:()=>!!user&&!readOnly,current:()=>batchRunMountedRef.current&&epoch===canvasContextEpochRef.current,
      merge:canvasArtworkDocument.merge,history:canvasHistory,
      applied:id=>{clearCanvasSelection(true);setSelectedId(id);},notice:flashTip,
      messages:{failed:t("canvas.stitchFail"),done:t("canvas.stitchDone"),unknown:L("原拼接结果待同步，请稍后检查","The original stitch is awaiting sync. Check again shortly"),missing:L("拼接已保存，结果尚未同步，请重试读取","The stitch was saved; retry to sync its result")},
    });
  }

  // 拉线建节点(5b):+端口拖出 → onConnectStart 记源；落到图片节点建立生成输入，
  // 落到文字节点建立图片上下文；落空白 onConnectEnd → 在释放点弹「新建节点」菜单。
  function onConnectStart(
    _e: unknown,
    params: { nodeId?: string | null; handleId?: string | null }
  ) {
    connectedRef.current = false;
    spawnSourceRef.current = params.nodeId || null;
    setLinking(true);
  }
  async function submitCanvasLink(intent:CanvasLinkIntent,notifyNoop=false) {
    if(readOnly||!user||preparingPendingImagesRef.current.has(intent.target))return false;
    const scope=canvasHistory.scope;
    // Drain current drafts before snapshotting link fields. The history owner
    // serializes the command and retains an unknown response's original body.
    try {
      await canvasTextDocument.flush();scope.assertView();
      const snapshot=()=>{
        const memberIds=new Set(active?.members.map(node=>node.id)||[]);
        return {
        project:scope.project,artworks:(canvasArtworkDocument.getSnapshot().nodes||[]).filter(node=>memberIds.has(node.id)),texts:canvasTextDocument.getSnapshot().nodes,
        videos:videoNodesStore.getSnapshot().nodes.filter(node=>!node.deletedAt),directors:directorNodesStore.getSnapshot().nodes.filter(node=>!node.deletedAt),characters:characterNodesStore.getSnapshot().nodes.filter(node=>!node.deletedAt),scenes:sceneNodesStore.getSnapshot().nodes.filter(node=>!node.deletedAt),audios:audioNodesStore.getSnapshot().nodes.filter(node=>!node.deletedAt),timelines:timelineNodesStore.getSnapshot().nodes.filter(node=>!node.deletedAt),pending:pendingPresentation.getSnapshot(),selected:multiSel,choices:videoInputChoices,
        videoModels:videoCreationCatalogRef.current.models,
        locked:(id:string)=>isNodeLocked(id)||preparingPendingImagesRef.current.has(id),productTitle:t("canvas.productNode"),referenceLimit:t("canvas.textReferenceLimit"),cycleMessage:t("canvas.linkCycle"),productMention:withProductMention,
      };};
      const timelineMaterials=intent.add&&timelineNodesStore.getNode(intent.target)?await timelineActions.inspect(intent.target,[canvasLinkMediaSource(snapshot(),intent.source)]):[];scope.assertView();
      const linked=await canvasHistory.submit(scope,()=>compileCanvasLink({...snapshot(),timelineMaterials},intent));
      if(!linked&&notifyNoop&&scope.viewCurrent())flashTip(L("节点已创建，当前来源无法引用到此节点","Node created; this source cannot be referenced by it"));
      return linked;
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
    setSpawnMenu({ x, y, cx: pt.clientX, cy: pt.clientY, sourceId: src });
  }
  // Reference creation shares both the node catalogue and ordinary link commands.
  function spawnNode(kind:CanvasCreatableNodeKind) {
    if (!spawnMenu) return;
    const { sourceId, x, y } = spawnMenu;
    setSpawnMenu(null);
    return createCanvasNode(kind,{x,y},sourceId);
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
    const base=canvasSelection.context(node.id,e.ctrlKey||e.metaKey);if(!base)return;
    setSpawnMenu(null);
    const p = relPoint(e);
    if(!node.id.startsWith("text-")&&!node.id.startsWith("pend-")&&!node.id.startsWith("task-"))contextSelectionBaseRef.current=[...base];
    setCtxMenu({ x: p.x, y: p.y, cx: e.clientX, cy: e.clientY, nodeId: node.id });
  }
  function onPaneContextMenu(e: ReactMouseEvent | MouseEvent) {
    e.preventDefault();
    setSpawnMenu(null);
    const p = relPoint(e);
    setCtxMenu({ x: p.x, y: p.y, cx: e.clientX, cy: e.clientY });
  }
  function onSelectionContextMenu(e:ReactMouseEvent,selectedNodes:{id:string}[]){
    e.preventDefault();e.stopPropagation();
    // React Flow's multi-selection overlay receives the event instead of the
    // node/pane. Reuse the same selection owner and existing batch menu.
    const ids=selectedNodes.map(node=>node.id);if(!ids.length)return;
    canvasSelection.selectIds(ids);contextSelectionBaseRef.current=ids;
    setSpawnMenu(null);const p=relPoint(e);
    setCtxMenu({x:p.x,y:p.y,cx:e.clientX,cy:e.clientY,nodeId:ids[0]});
  }
  // Layout owns preparation/fit; history remains the single transaction/undo owner.
  async function tidyLayout() {
    await arrangeCanvasDocument(canvasHistory.scope,{
      available:()=>!!active&&!readOnly&&!!user&&nodeSettingsReady&&textNodesReady,
      closeMenu:()=>setCtxMenu(null),text:canvasTextDocument,
      history:{busy:historyBusyRef,setBusy:setHistorySaving,apply:action=>applyHistory(action,false),record:pushUndo},
      scene:()=>({nodes:rfRef.current?.getNodes()??rfNodes,edges:rfRef.current?.getEdges()??rfEdges,locked:isNodeLocked,
        movableIds:active?[active.members,active.textNodes,active.videoNodes||[],active.directorNodes||[],active.characterNodes||[],active.sceneNodes||[],active.audioNodes||[],active.timelineNodes||[]].flatMap(nodes=>nodes.map(node=>node.id)):[]}),
      view:{begin:()=>{viewControls.cancelFocus();return viewControls.navigationRevision.current;},revision:()=>viewControls.navigationRevision.current,
        nodes:()=>rfRef.current?.getNodes()??[],frame:run=>{requestAnimationFrame(run);},
        fit:ids=>{void rfRef.current?.fitView({nodes:ids.map(id=>({id})),duration:500,padding:0.18,maxZoom:1});}},
      notice:flashTip,messages:{unsaved:L("请先保存未保存的文字节点","Save pending text changes first"),tooMany:L("本次整理最多支持400个移动节点","Arrange up to 400 movable nodes at a time"),failed:t("canvas.saveFailed")},
    });
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
      await flushImagePrompts();if(!scope.viewCurrent())return;
      const result=await canvasNodeOperations.copy({ids:[a.id],projectKey:active?.key,detached:true,singleArtwork:{x:Math.round((node?.position.x??a.canvasX??0)+40),y:Math.round((node?.position.y??a.canvasY??0)+artworkNodeSize(a).height+30),title:`${a.title} 副本`.slice(0,80)}},"duplicate");
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
      reveal:id=>{projectNavigation.requestNode(id,false);},t,locale};
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
  // Canvas captures the screen point; the picker owns its scoped copy intent.
  function openHistoryPicker(screenX:number,screenY:number){artworkPicker.open({x:screenX,y:screenY});}
  // 在画布某屏幕点新建一个空白占位节点(linked=拉线建的,连源节点)
  function pendingNodeCreationPorts():CanvasPendingCreationPorts {
    return {project:activeKey,viewport:()=>rfRef.current?.getViewport()??viewportRef.current,nextSequence:()=>pendSeqRef.current++,now:()=>Date.now(),imageLabel:t("canvas.imageNode"),
      append:node=>setPendNodes(current=>[...current,node]),history:pushUndo,focus:focusEditableCanvasArea,
      activate:(node,multiple)=>{
        if(multiple){clearCanvasSelection(true);setSelectedId(null);setSelectedPendId(node.id);imageDraft.seed(node.id,{prompt:"",ratio:"auto"});setGenerationMode("standard");setGenCount(1);wantFocusPendPrompt.current=true;}
        else{setGenerationMode("standard");setSelectedId(null);setSelectedTextId(null);setSelectedPendId(node.id);}
      },
    };
  }
  function addPendAtScreen(screenX:number,screenY:number,parentId:string|null,linked:boolean):Pend {
    return createCanvasPendingAtScreen({x:screenX,y:screenY},parentId,linked,pendingNodeCreationPorts());
  }
  function createMergeNodeFromSelection(){
    createCanvasMultiReferenceNode({ids:selectedBatchIds,artworkCount:selectedBatchArts.length,readOnly,limit:MAX_TOTAL_IMAGES,gap:X_GAP,
      nodes:ids=>(rfRef.current?.getNodes()??[]).filter(node=>ids.includes(node.id)).map(node=>({...node.position,width:flowNodeSize(node).width})),
      referenceLimit:()=>flashTip(fmt(t("canvas.batchGenerateLimit"),{n:MAX_TOTAL_IMAGES})),
    },pendingNodeCreationPorts());
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
  function focusEditableCanvasArea(area:{x:number;y:number;width:number;height:number}){
    viewControls.capture(canvasArtworkDocument.scope).area(area);
  }
  function focusCanvasNode(id:string,project?:string){viewControls.focusNode(id,project);}
  async function createCanvasNode(kind:CanvasCreatableNodeKind,point=centerScreen(),sourceId?:string){
    const scope=sourceId?canvasHistory.scope:undefined;
    if(sourceId&&(!scope?.viewCurrent()||isNodeLocked(sourceId)))return;
    const node=await dispatchCanvasNodeCreation(kind,point,{readOnly,canVideo:()=>canFeature("video"),actions:{
      timeline:createTimelineNode,audio:createAudioNode,scene:createSceneNode,character:createCharacterNode,director:createDirectorNode,
      text:at=>addTextNodeAtScreen(at.x,at.y),image:at=>addPendAtScreen(at.x,at.y,null,false),video:at=>openVideoNodeFromSelection(true,at),
    }});
    if(sourceId&&node&&scope?.viewCurrent())await submitCanvasLink({source:sourceId,target:node.id,add:true},true);
    return node;
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
  function resizeTextNode(id:string,bounds:{x:number;y:number;width:number;height:number}){textEditing.resize(id,bounds);}
  function toggleTextNodeExpand(id:string){textEditing.toggle(id);}
  function textNodeCreationPorts():CanvasTextCreationPorts {
    const view=viewControls.capture(canvasArtworkDocument.scope);
    return {writable:!readOnly&&!!user,project:active?.key||activeKey,defaultTitle:L("文字","Text"),viewport:()=>rfRef.current?.getViewport()??viewportRef.current,
      append:node=>setTextNodes(current=>[...current,node]),history:pushUndo,save:persistTextNode,focus:(area,project)=>{view.area(area,project);},
      activate:(node,prompt)=>{projectNavigation.open(node.projectKey);canvasSelection.selectInProject(node.projectKey,{selectedId:null,selectedPendId:null,selectedTextId:node.id});setTextPrompt(prompt);},
    };
  }
  function addTextNodeAtScreen(screenX:number,screenY:number,options?:CanvasTextCreationOptions){
    return createCanvasTextAtScreen({x:screenX,y:screenY},options,textNodeCreationPorts());
  }
  async function removeTextNode(id: string) {
    await runDelete([id]);
  }

  function changeTextNodeContent(id:string,content:string){textEditing.change(id,content);}
  function commitTextNodeContent(id:string,content:string,initialContent?:string){textEditing.commit(id,content,initialContent);}
  function changeTextInstruction(value:string){if(!selectedTextId||textTasks.state(selectedTextId).busy||textWriteBarrierRef.current||historyBusyRef.current)return;
    textInstructionDrafts.current.set(selectedTextId,value);setTextPrompt(value);textEditing.instruction(selectedTextId,value);
  }
  async function generateTextNode(options?:{node:CanvasTextNode;prompt:string;silent?:boolean;intent?:"polish"}):Promise<boolean>{
    const target=textNodesRef.current.find(node=>node.id===(options?.node.id??selectedTextId)),prompt=(options?.prompt??textPrompt).trim();
    if(!target||readOnly||!nodeSettingsReady||textWriteBarrierRef.current||historyBusyRef.current||isNodeLocked(target.id)||textTasks.state(target.id).busy)return false;
    if(target.status==="generating"&&textTasks.state(target.id).phase==="idle")return false;
    if(!resolveCanvasTextInstruction(options?.intent==="polish"?"":prompt,canvasTextContent(target))&&!textTasks.retryable(target.id))return false;
    const ok=textTasks.retryable(target.id)?await textTasks.resume(target.id):await textTasks.run(generalTextTask(target,prompt,t("canvas.textGenerate"),options?.intent));
    return ok;
  }

  // ===== 竞品反推 → 智能帮写 → 成套生成 链路 =====

  // 绑定/换绑文字节点的产品图:productIds 记录绑定,@产品图 行刷新到内容开头


  // 批量反推:每张竞品图右侧生成一个"逆向提示词"文字节点(2 路并发,失败节点保留可重试)
  async function reversePromptsForSelection(arts:Artwork[]){
    if(readOnly||!user||!activeKey||promptMining||!arts.length)return;
    setCtxMenu(null);const scope=canvasTextDocument.scope,live=new Map((rfRef.current?.getNodes()||[]).map(node=>[node.id,node]));
    const requests=[...new Map(arts.map(source=>[source.id,source])).values()].map(source=>{const node=live.get(source.id);return derivedTextTask({mode:"reverse",source,project:activeKey,title:t("canvas.reverseTitle"),productTitle:t("canvas.productNode"),gap:X_GAP,
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
    const busy = (id: string) => busyIds.has(id) || generationPresentation.busy(`node:${id}`) || generationPresentation.busy(`retry:${id}`) || pendNodesRef.current.some(node => node.generating && node.operationKey === `node:${id}`);
    return selectionRunTargets(ids, [
      ...(activeProjectRef.current?.members || []).filter(art => selectedIds.has(art.id)).map(art => ({ id: art.id, kind: "image" as const, ...point(art.id, art.canvasX ?? 0, art.canvasY ?? 0), locked: isNodeLocked(art.id), busy: busy(art.id), runnable: canFeature("generate") && art.status === "completed" && !art.videoUrl && art.category !== "audio" && art.category !== "media" && !["workflow-decoration", "workflow-placeholder"].includes(art.source || "") && hasRenderableImage(art.image) })),
      ...textNodesRef.current.filter(node => selectedIds.has(node.id) && node.projectKey === activeKey).map(node => ({ id: node.id, kind: "text" as const, ...point(node.id, node.canvasX, node.canvasY), locked: isNodeLocked(node.id), busy: node.status === "generating" || textTasks.state(node.id).busy || generationPresentation.busy(`text:${node.id}`), runnable: !!node.prompt.trim() })),
      ...pendNodesRef.current.filter(node => selectedIds.has(node.id)).map(node => ({ id: node.id, kind: "pending" as const, ...point(node.id, node.x, node.y), busy: node.generating || node.uploading || node.needsAttention || generationPresentation.busy(`pend:${node.id}`), runnable: canFeature("generate") && !node.taskId && node.inputs.some(id => activeProjectRef.current?.members.some(art => art.id === id && hasRenderableImage(art.image) && !art.videoUrl) || textNodesRef.current.some(text => text.id === id && text.projectKey === activeKey && text.status !== "generating" && !textTasks.state(text.id).busy && !!canvasTextContent(text).trim())) })),
    ]);
  }

  const selectionRun=useCanvasSelectionRun({scope:canvasHistory.scope,targets:currentSelectionRunTargets,
    canRun:target=>!readOnly&&nodeSettingsReady&&(target.kind==="text"||canFeature("generate"))&&currentSelectionRunTargets([target.id]).length>0,
    run:async(target,isCurrent)=>{
          if (target.kind === "text") {
            const node = textNodesRef.current.find(node => node.id === target.id);
            return node ? generateTextNode({ node, prompt: node.prompt, silent: true }) : false;
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
  function canvasTextImageContext():CanvasTextImageContext {
    const scope=canvasArtworkDocument.scope,epoch=canvasContextEpochRef.current;
    return {scope,current:()=>batchRunMountedRef.current&&scope.account===canvasAccountRef.current&&scope.project===(activeProjectRef.current?.key||null)&&epoch===canvasContextEpochRef.current,writable:()=>!readOnly&&!!user,canGenerate:canFeature("generate"),ready:nodeSettingsReady,
      project:()=>activeProjectRef.current,texts:()=>canvasTextDocument.getSnapshot().nodes.map(node=>textTasks.state(node.id).busy?{...node,status:"generating" as const}:node),locked:isNodeLocked,draft:{id:null,text:""},
      positions:()=>new Map((rfRef.current?.getNodes()||[]).map(node=>[node.id,node.position])),nextSequence:()=>pendSeqRef.current++,
      gap:X_GAP,textWidth:TEXT_NODE_DEFAULT_W,imageLabel:t("canvas.imageNode"),maxImages:MAX_TOTAL_IMAGES,pending:setPendNodes,generate:generatePend,
      flushTexts:async ids=>{await Promise.all(ids.map(id=>textAutosave.flush(id)));await canvasTextDocument.flush(ids);},
      textUnsaved:id=>canvasTextDocument.hasUnsaved(id)||textAutosave.hasPending(id),
      lockedNotice:()=>flashTip(L("引用的文字节点已锁定","A referenced text node is locked")),
      error:error=>{
        const code=(error as {code?:string})?.code,messages:Record<string,string>={
          EMPTY_TEXT:L("先输入提示词或填写文字节点内容","Enter a prompt or add text content first"),
          TEXT_BUSY:L("引用的文字仍在生成，请完成后再试","Referenced text is still generating"),
          MISSING_PRODUCT:t("canvas.textNoProduct"),MISSING_REFERENCE:L("引用图片已失效，请重新选择或移除连线","A reference is unavailable; select it again or remove its link"),
          TOO_MANY_IMAGES:L(`一次最多使用 ${MAX_TOTAL_IMAGES} 张参考图片，请减少引用`,`Use at most ${MAX_TOTAL_IMAGES} reference images`),
          PROMPT_TOO_LONG:L("组合提示词超过 6000 字，请精简或选择逐条创作","Combined prompt exceeds 6,000 characters; shorten it or create separately"),
        };
        flashTip(messages[code||""]||(error instanceof Error?error.message:t("canvas.genFail")));
      },
    };
  }
  function openTextImageMenu(textNodeIds:string[],imageIds:string[]=[]){textImages.open(textNodeIds,imageIds,canvasTextImageContext());}
  async function generateImagesFromTextNodes(mode:TextImageMode,options:{combine:boolean;useReferences:boolean}){
    await textImages.run(mode,options,canvasTextImageContext());
  }
  // 底部工具条:从生成历史选择(画布中心)
  function toolHistory() {
    if (readOnly) return;
    const c = centerScreen();
    openHistoryPicker(c.x, c.y);
  }
  /** 空节点落地为作品时换新 id:把以它为源的分支 inputs/parentId 同步改写,
   * 否则"空节点骨架"的分支连线会在落地后静默消失。改写走 pending-link 本地
   * 历史(可撤销);个别分支正在生成/上传时改写失败不阻断结果落地。 */
  async function rewirePendingBranchSources(consumedId:string,artworkId?:string){
    if(!artworkId||artworkId===consumedId)return;
    const scope=canvasArtworkDocument.scope;
    if(!scope.viewCurrent()||readOnly)return;
    for(const node of pendingPresentation.getSnapshot()){
      if(node.id===consumedId||(!node.inputs.includes(consumedId)&&node.parentId!==consumedId))continue;
      const from={inputs:node.inputs,parentId:node.parentId,linked:node.linked};
      const to={inputs:node.inputs.map(source=>source===consumedId?artworkId:source),parentId:node.parentId===consumedId?artworkId:node.parentId,linked:node.linked};
      try{await canvasHistory.submit(scope,()=>({kind:"pending-link",id:node.id,from,to}));}catch{/* 保持原状,由后续生成校验提示 */}
    }
  }
  function onPendUpload(id: string) {
    if(preparingPendingImagesRef.current.has(id))return;
    const context=user?canvasImportContext():null,saved=context?imageImportOwner.pendingBatch(id,context):null;
    if(saved?.nodeIds?.length){void retryImportSynchronization(saved.id);return;}
    pendUploadTargetRef.current = id;
    pendUploadRef.current?.click();
  }
  function onPendRemove(id: string) { void runDelete([id]); }
  // 空白节点生成(文生图 / 合并多输入):用 dock 的提示词 + 输入图(若有)生成,填充本节点
  /** An explicit new Generate action never replaces an accepted blank run. */
  async function generatePendingImage(onSubmitted?:()=>void){
    const source=pendNodesRef.current.find(node=>node.id===selectedPendIdRef.current);
    if(!source||readOnly||!user||source.uploading||source.needsAttention)return false;
    const account=canvasAccountRef.current,workspace=currentWorkspace(),project=activeProjectRef.current?.key||null;
    const unlock=beginCanvasImageSubmission(imageSubmissionRef.current,canvasImageSubmissionKey(account,workspace,project,source.id));if(!unlock)return false;
    let unlockTarget:(()=>boolean)|null=null;
    const release=()=>{const sourceReleased=unlock(),targetReleased=unlockTarget?.();if(sourceReleased||targetReleased)setImageSubmissionEpoch(value=>value+1);};setImageSubmissionEpoch(value=>value+1);
    try{
      if(generationMode!=="standard")return await generatePend();
      if(source.generating&&!source.generationSubmitted)return false;
      let target=source;
      if(source.generating||source.generationFailure){
        const size=generationPlaceholderSize(genRatio),position=placeGenerationPreview({x:source.x+size.width+X_GAP,y:source.y},size,(rfRef.current?.getNodes()??rfNodes).map(node=>({...node.position,...flowNodeSize(node)})));
        target=forkPendingImageDraft(source,`pend-${browserRandomUUID()}`,position);
        unlockTarget=beginCanvasImageSubmission(imageSubmissionRef.current,canvasImageSubmissionKey(account,workspace,project,target.id));if(!unlockTarget)return false;
        imageDraft.seed(target.id,{prompt:editPrompt,ratio:genRatio,referenceBindings:imageDraft.referenceBindings,hiddenReferenceIds:imageDraft.hiddenReferenceIds});
        referenceDraft.copyTo(imageDraftKey(imageDraftScope(user.email,targetEmail,activeKey,currentWorkspace()),target.id));
        setPendNodes(nodes=>[...nodes,target]);pendNodesRef.current=[...pendNodesRef.current.filter(node=>node.id!==target.id),target];selectedPendIdRef.current=target.id;setSelectedPendId(target.id);
      }
      return await generatePend({pend:target,prompt:editPrompt,referenceInputs:composerReferences,onSubmitted:()=>{release();onSubmitted?.();}});
    }finally{release();}
  }
  async function generatePend(opts?:CanvasBlankImageOptions):Promise<boolean> {
    if(readOnly||!user)return false;
    const node=opts?.pend??pendingPresentation.getSnapshot().find(item=>item.id===selectedPendId);
    if(!node||node.generating||node.uploading||node.needsAttention||preparingPendingImagesRef.current.has(node.id))return false;
    const pend={...node,inputs:[...node.inputs]},scope=canvasArtworkDocument.scope,account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;
    const current=()=>scope.viewCurrent()&&account===canvasAccountRef.current&&epoch===canvasContextEpochRef.current&&(opts?.isCurrent?.()??true);
    preparingPendingImagesRef.current.add(pend.id);
    try{
      const ids=[pend.parentId,...pend.inputs].filter((id):id is string=>!!id?.startsWith("text-"));
      const linked=await prepareImageText(pend.id,scope.project,opts?.prompt??editPrompt,current,ids);
      if(!current())return false;
      const live=pendingPresentation.getSnapshot().find(item=>item.id===pend.id);
      if(!live||live.uploading||live.generating||live.needsAttention||textWriteBarrierRef.current||historyBusyRef.current||isNodeLocked(pend.id)||JSON.stringify([live.parentId,live.inputs])!==JSON.stringify([pend.parentId,pend.inputs]))throw new Error("图片节点或连线已变更，请重新确认生成");
      return await generatePreparedPend({...opts,pend:{...live},isCurrent:current,linked:opts?.frozenTextPrompt===undefined?linked:{...linked,prompt:opts.frozenTextPrompt}});
    }catch(error){if(current())setGenError(error instanceof Error?error.message:"关联文字尚未保存");return false;}
    finally{preparingPendingImagesRef.current.delete(pend.id);}
  }
  async function generatePreparedPend(opts:CanvasBlankImageOptions&{linked:LinkedImageTextResult}):Promise<boolean> {
    if(readOnly||!user)return false;
    const pend=opts?.pend??pendNodes.find(node=>node.id===selectedPendId);if(!pend)return false;
    const requestOwner=user.email,requestProject=activeKey,requestWorkspace=currentWorkspace(),requestTarget=targetEmail;
    return runCanvasBlankImage({pend,prompt:opts?.prompt??editPrompt,linked:opts.linked,onSubmitted:opts?.onSubmitted,
      settings:{ratio:opts?.ratio||genRatio,resolution:genResolution,style:genStyle,count:genCount,quality:genQuality,model:genModel},
      members:activeProjectRef.current?.members||[],textNodes:canvasTextDocument.getSnapshot().nodes,detail:generationMode==="detail"&&!opts?.forceStandard,
      referenceInputs:opts?.referenceInputs||(!opts?.forceStandard&&pend.id===selectedPendId?composerReferences:undefined),
      invalid:setGenError,needReferences:t("canvas.detailNeedRefs"),needPrompt:t("canvas.pendNeedPrompt"),
      runDetail:(source,inputs,prompt,node,refs)=>generateDetailSequence(source,inputs,prompt,[],node,refs),
      failed:failure=>{const message=generationFailureMessage(failure);if(selectedPendIdRef.current===pend.id)setGenError(message);else flashTip(`${pend.label}：${message}`);},
      attached:(images,artworks)=>{
        const nextId=carryCompletedCanvasImageDraft({owner:requestOwner,target:requestTarget,project:requestProject,workspace:requestWorkspace,pendingId:pend.id,prompt:opts?.prompt??editPrompt,ratio:opts?.ratio||genRatio,resultId:images[0]?.id,artworks,currentArtworks:worksRef.current||[]},{draft:imageDraft,references:referenceDraft});
        if(nextId&&selectedPendIdRef.current===pend.id){setSelectedId(nextId);selectedIdRef.current=nextId;}
        if(selectedPendIdRef.current===pend.id&&!activeKey)projectNavigation.requestNode(images[0]?.id||null);
        void rewirePendingBranchSources(pend.id,images[0]?.id).then(()=>canvasHistory.consumePending(pend.id));
      },
      completed:()=>{setSelectedPendId(id=>id===pend.id?null:id);if(selectedPendIdRef.current===pend.id)setGenError(null);},
    },canvasImageRunContext(opts?.isCurrent));
  }

  // Snapshot the live FileList before clearing its input; the importer owns
  // decoding, queued placeholders, root order, upload receipts and read-only retry.
  async function doUploadPend(files:FileList|null){
    const pendId=pendUploadTargetRef.current;pendUploadTargetRef.current=null;
    const picked=Array.from(files??[]);if(pendUploadRef.current)pendUploadRef.current.value="";
    if(!pendId||!picked.length||!user||readOnly||preparingPendingImagesRef.current.has(pendId))return;
    const context=canvasImportContext(),scope=canvasArtworkDocument.scope;
    const draftOwner=user.email,draftTarget=targetEmail,draftProject=activeKey,draftWorkspace=scope.workspace;
    try{await imageImportOwner.uploadPendingFiles(picked,pendId,activeRootId(),context,{
      pending:pendingPresentation,newId:()=>`pend-${Date.now()}-${pendSeqRef.current++}`,
      history:records=>pushUndo({kind:"pending-add",records}),
      attached:(id,artworkId,rows)=>{
        carryUploadedCanvasImageDraft({owner:draftOwner,target:draftTarget,project:draftProject,workspace:draftWorkspace,pendingId:id,resultId:artworkId,artworks:rows,currentArtworks:worksRef.current||[]},{draft:imageDraft,references:referenceDraft});
        void rewirePendingBranchSources(id,artworkId).then(()=>{canvasHistory.consumePending(id);if(scope.viewCurrent())setSelectedPendId(current=>current===id?null:current);});
      },
      error:message=>{if(scope.viewCurrent())setGenError(message);},
    });}catch(error){if(scope.viewCurrent())setGenError(error instanceof Error?error.message:t("canvas.genFail"));}
  }
  function showCopyTip() {
    setCopyTip(true);
    setTimeout(() => setCopyTip(false), 1500);
  }
  const clipboard=useCanvasClipboard({
    owner:user?.email,account:canvasAccountRef.current,workspace:canvasArtworkDocument.scope.workspace,current:canvasArtworkDocument.scope.documentCurrent,
    imageLabel:t("canvas.imageNode"),selectionLabel:L("画布节点","Canvas nodes"),
    state:()=>({ready,readOnly,browsing,loading,blocked:canvasShortcutLayerOpen,selected:selected||null,selectedId,selectedTextId,multiSel}),
    contains:id=>!!comfyNodesStore.getNode(id)||!!videoNodesStore.getNode(id)||!!directorNodesStore.getNode(id)||!!characterNodesStore.getNode(id)||!!sceneNodesStore.getNode(id)||!!audioNodesStore.getNode(id)||!!timelineNodesStore.getNode(id)||textNodesRef.current.some(node=>node.id===id)||(works||[]).some(node=>node.id===id),
    isVideo:id=>!!comfyNodesStore.getNode(id)||!!videoNodesStore.getNode(id)||!!directorNodesStore.getNode(id)||!!characterNodesStore.getNode(id)||!!sceneNodesStore.getNode(id)||!!audioNodesStore.getNode(id),hasCanvas:()=>!!canvasAreaRef.current,
    center:()=>{const box=canvasAreaRef.current?.getBoundingClientRect();return rfRef.current?.screenToFlowPosition({x:(box?.left??0)+(box?.width??0)/2,y:(box?.top??0)+(box?.height??0)/2},{snapToGrid:false})??{x:0,y:0};},
    workflow:(html,point)=>workflowPaste.paste(html,point),
    images:(files,point)=>{uploadCtxRef.current={parentId:activeRootId(),x:point.x-NODE_W/2,y:point.y-NODE_H/2};const data=new DataTransfer();for(const file of files)data.items.add(file);uploadRoot(data.files);},
    duplicateArtwork:duplicateArt,duplicateNodes:duplicateCanvasNodes,copied:()=>flashTip(t("canvas.copied")),imageCopied:showCopyTip,
  });
  const {hasClip}=clipboard;
  function selectCopiedNodes(result:{idMap:Record<string,string>;projectKey:string},focusSingle=false) {
    const ids=Object.values(result.idMap);projectNavigation.open(result.projectKey);
    canvasSelection.copied(result.projectKey,ids,focusSingle);
  }
  async function duplicateCanvasNodes(ids:string[]) {
    if(!user||readOnly)return;const scope=canvasHistory.scope;
    try{await flushImagePrompts();if(!scope.viewCurrent())return;const result=await canvasNodeOperations.copy({ids,projectKey:!browsing&&!creatingNew?active?.key:undefined});if(scope.viewCurrent())selectCopiedNodes(result);}
    catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:"复制节点失败");}
  }


  const canvasDrag=useCanvasDrag({
    scope:canvasHistory.scope,selected:multiSel,nodes:rfNodes,artworks:active?.members||[],setNodes:setRfNodes,hold:holdPositions,
    locked:id=>readOnly||!user||isNodeLocked(id),warning:flashTip,
    local:(id,point,finished)=>{
      rememberGenerationDrag(id,point,finished);if(!finished)return;
    },
    commit:(moves,scope)=>canvasHistory.submit(scope,()=>{const action=compileCanvasMove(moves,id=>{
      const comfy=comfyNodesStore.getNode(id);if(comfy)return {x:comfy.x,y:comfy.y};
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

  useCanvasViewportFocus({id:viewControls.nodeFocus.id,requestRevision:viewControls.nodeFocus.revision,enabled:!!flowReady,flow:rfRef,nodes:rfNodes,size:canvasSize,insets:overlaySafeArea,
    minZoom:CANVAS_MIN_ZOOM,contextKey:JSON.stringify([canvasArtworkDocument.scope.key,canvasContextEpochRef.current]),navigationRevision:viewControls.navigationRevision,onComplete:viewControls.completeNodeFocus});

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
      nativeEditors.openCount > 0 ||
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
      case "save":void saveCanvasChanges();return;
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
    selectedId,selectedTextId,selectedPendId,selectedEdge:!!selectedEdge,selectedGenerating,multiSel,
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
    english:locale==="en",error:referenceError||promptSync.error,
  };

  const recoveryScope={owner:user.email.toLowerCase(),workspace:currentWorkspace(),project:activeKey||"workspace"};
  // Sharing consumes native saved IDs only. Pending generation placeholders are
  // not a share source and opening chat never writes canvas selection/viewport.
  const collaborationSource = !readOnly && !browsing && active ? { projectKey: active.key, kind: "workflow" as const } : null;
  const collaborationNodeIds = new Set([
    ...(active?.members.map(node => node.id) || []),
    ...textNodes.filter(node => node.projectKey === active?.key).map(node => node.id),
    ...[videoNodesStore, directorNodesStore, characterNodesStore, sceneNodesStore, audioNodesStore, timelineNodesStore, comfyNodesStore].flatMap(store => store.nodes.filter(node => node.projectKey === active?.key).map(node => node.id)),
  ]);
  const collaborationSelected = [...new Set(multiSel.length ? multiSel : selectedBatchIds.length ? selectedBatchIds : [selectedId, selectedTextId, selectedPendId].filter((id): id is string => !!id))];
  const collaborationSelectionPending = collaborationSelected.some(id => !collaborationNodeIds.has(id));
  const collaborationSelection = collaborationSource && collaborationSelected.length && collaborationSelected.every(id => collaborationNodeIds.has(id)) ? { ...collaborationSource, nodeIds: collaborationSelected } : null;
  async function shareCanvasNodes(ids?: string[]) {
    if (!collaborationSource) return;
    if (ids?.some(id => !collaborationNodeIds.has(id))) { flashTip("请先保存所选节点，再发送"); return; }
    const owner=canvasAccountRef.current,epoch=canvasContextEpochRef.current;
    try{await flushImagePrompts();if(owner!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;
      collaboration.share({ ...collaborationSource, ...(ids?.length ? { nodeIds: ids } : {}), kind: ids?.length === 1 && active?.members.some(node => node.id === ids[0]) ? "artwork" : "workflow", title: active?.name });
      setCtxMenu(null);
    }catch(error){flashTip(error instanceof Error?error.message:'提示词尚未保存');}
  }
  const recoveryAccount=canvasAccountRef.current,recoveryEpoch=canvasContextEpochRef.current;
  const recoveryCurrent=()=>recoveryAccount===canvasAccountRef.current&&recoveryEpoch===canvasContextEpochRef.current&&recoveryScope.workspace===currentWorkspace()&&recoveryScope.project===(activeProjectRef.current?.key||"workspace");
  return (
    <SurfaceAppearanceProvider value={lightCanvas ? "light" : "dark"}>
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
      {!readOnly&&<ImagegenPendingRecovery {...recoveryScope} isCurrent={recoveryCurrent} onAttach={async(ids,isMounted,attachment,placement)=>{
        const current=()=>recoveryCurrent()&&isMounted();if(!current())return false;
        const scope=captureCanvasImageTaskScope(user!.email,activeProjectRef.current?.key||null,current);
        const fresh=attachment?await createCanvasImageVersionAttachment({nodeId:attachment.nodeId,merge:mergeWorks})(scope,attachment):placement?
          await createCanvasResultAttachment({position:()=>placement.slots[0],layout:{kind:"fanout",point:id=>placement.slots.find(slot=>slot.artworkId===id)},saveErrorText:t("canvas.saveFailed"),merge:mergeWorks,history:()=>{}})(scope,ids.map(id=>({id}))):await mergeWorks(ids,current);if(!current())return false;
        assertGenerationResultsPresent(ids,fresh);
        // A queued React updater is not delivery. Observe the committed canvas
        // after one frame; a suspended/stale render retains its original receipt.
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        return current()&&ids.every(id=>fresh.some(art=>art.id===id&&!!art.image));
      }}/>}
      {(canvasArtworkDocument.error||canvasTextDocument.error) && <div className="fixed top-20 left-1/2 z-[200] flex -translate-x-1/2 flex-col gap-2">
      {canvasArtworkDocument.error && !importSynchronizationVisible && <div role="alert" data-testid="canvas-artwork-load-error" className="flex items-center gap-3 rounded-lg border border-amber-400 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
        <span>{canvasArtworkDocument.error}</span><button className="font-semibold underline" onClick={()=>void (projectView.requestedProjectReady?canvasArtworkDocument.retry():projectView.retryRequestedProject()).catch(()=>{})}>重试同步作品</button>
      </div>}
      {canvasTextDocument.error && <div role="alert" data-testid="canvas-text-load-error" className="flex items-center gap-3 rounded-lg border border-amber-400 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
        <span>{canvasTextDocument.error}</span><button className="font-semibold underline" onClick={()=>void (projectView.requestedProjectReady?canvasTextDocument.load():projectView.retryRequestedProject()).catch(()=>{})}>重新加载文字</button>
      </div>}
      </div>}
      {(Object.keys(canvasTextDocument.conflicts).length>0||Object.keys(canvasArtworkDocument.conflicts).length>0)&&<div className="fixed bottom-20 left-1/2 z-[200] flex -translate-x-1/2 flex-col gap-2"><CanvasArtworkConflicts conflicts={canvasArtworkDocument.conflicts} onResolve={resolveArtworkConflict} />
          <CanvasTextConflicts conflicts={canvasTextDocument.conflicts} nodes={textNodes} onResolve={resolveTextConflict}/></div>}
      {(unsavedTextCount>0||videoNodesStore.unsavedCount>0) && <div role="alert" className="fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-500 bg-background px-4 py-3 text-sm shadow-lg">
        <span>{videoNodesStore.error||t("canvas.unsavedChanges")} ({unsavedTextCount+videoNodesStore.unsavedCount})</span>
        <button className="font-semibold underline" disabled={manualSaving} onClick={()=>void saveCanvasChanges()}>{manualSaving?L("保存中…","Saving…"):t("canvas.retrySave")}</button>
      </div>}
      {historySaving && <div className="fixed inset-0 z-[190] cursor-wait" aria-label={t("canvas.savingChanges")}>
        <div role="status" className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-background px-4 py-3 text-sm shadow-lg">{t("canvas.savingChanges")}</div>
      </div>}

      {frameChoice.pending&&<FrameRatioDialog key={frameChoice.pending.id} choices={frameChoice.pending.choices} english={locale==="en"} onChoose={id=>frameChoice.choose(frameChoice.pending!.id,id)}/>}
      {/* 占位节点上传用的隐藏 input */}
      <input
        ref={pendUploadRef}
        data-testid="canvas-pending-upload-input"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => doUploadPend(e.target.files)}
      />
      {/* 顶栏:仅项目网格落地页显示(进入项目后用全屏悬浮挂件,见下) */}
      {browsing && !desktopAppearance && (
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
            <CanvasCollaborationActions source={null} />
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
          className={cn("canvas-stage relative min-w-0 flex-1 overflow-clip", lightCanvas && "canvas-light")}
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
                // Promote only the guarded edge surface; image/text nodes rasterize natively.
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
              onNodeClick={canvasSelection.nodeClick}
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
              onEdgeClick={(_,edge)=>canvasSelection.edgeClick(edge)}
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
                canvasSelection.reset();
                setCtxMenu(null);
                edgeHoverHintRef.current?.clear();
              }}
              onMoveStart={event => {
                if(event)viewControls.cancelFocus();
                if (spawnMenu) setSpawnMenu(null);
                // 菜单遮罩处理用户点击关闭；程序化视口动画不应取消右键菜单。
              }}
              onNodeContextMenu={onNodeContextMenu}
              onPaneContextMenu={onPaneContextMenu}
              onSelectionContextMenu={onSelectionContextMenu}
              onSelectionChange={({nodes,edges})=>canvasSelection.flowSelection(nodes,edges)}
              onSelectionStart={()=>{canvasSelection.clearFocus();setCtxMenu(null);}}
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
              multiSelectionKeyCode={CANVAS_MULTI_SELECTION_KEYS}
              panActivationKeyCode="Space"
              panOnScroll
              zoomOnScroll={false}
              zoomOnPinch
              zoomActivationKeyCode={CANVAS_ZOOM_KEYS}
              snapToGrid={snapGrid}
              snapGrid={[16, 16]}
              onlyRenderVisibleElements={shouldVirtualizeCanvas(rfNodes.length, rfEdges.length)}
            >
              <CanvasPerformanceProbe />
              <CanvasRenderLayerGuard />
              <CanvasGroupLayer key={`groups:${canvasArtworkDocument.scope.key}:${currentWorkspaceRevision()}`} nodes={rfNodes}
                disabled={canvasTool === "hand" || historySaving || !nodeSettingsReady} readOnly={readOnly} snap={snapGrid} english={locale === "en"}
                onSelect={applyArtworkSelection}
                onPreview={moves => { const positions = new Map(moves.map(move => [move.id, move.to])); setRfNodes(current => current.map(node => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node)); }}
                onCommit={moves => { void canvasDrag.commitMoves(moves); }} />
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
              <CanvasProjectTitle active={active} catalog={projectCatalog} readOnly={readOnly} open={sidebarOpen} setOpen={setSidebarOpen} t={t} desktopAppearance={desktopAppearance}/>

              {/* 右上:分享(下载)/ 模板库 / 会员特惠+积分 / 头像 */}
              <div data-testid="canvas-top-actions" style={{ top: canvasSize.width > 0 && canvasSize.width < 768 ? 60 : 12 }} className="absolute right-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 overflow-visible">
                <CanvasCollaborationActions source={collaborationSource} selection={collaborationSelection} selectionPending={collaborationSelectionPending} title={active?.name} beforeShare={flushImagePrompts} onError={message=>flashTip(message)} />
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
                {!desktopAppearance && <>
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
                </>}
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
                    items={canvasNodeMenuItems({ L, readOnly, onWorkflow:canFeature("comfyui")?()=>{setComfyRunId(null);setComfyOpen(true);}:undefined, videoDisabled: !canFeature("video") || videoNodeCreateDisabled, onCreate: kind => createCanvasNode(kind) })}
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
                  <button type="button" data-tool="save" data-testid="canvas-save-button" aria-label={L("保存画布","Save canvas")} title={`${L("保存画布","Save canvas")} (${shortcut("S")})`}
                    disabled={manualSaving||historySaving} onClick={()=>void saveCanvasChanges()}
                    className="canvas-ui-action flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors disabled:opacity-35 sm:h-9 sm:w-9">
                    {manualSaving?<Loader2 className="h-[18px] w-[18px] animate-spin"/>:<Save className="h-[18px] w-[18px]"/>}
                  </button>
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
                    onClick={() => batchDelete(multiSel)}
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
            <div className="pointer-events-none absolute inset-3 z-50 flex items-center justify-center border-2 border-dashed canvas-ui-section border-[var(--canvas-ui-accent)]" data-testid="canvas-drop-hint">
              <div className="flex items-center gap-3 text-sm font-medium canvas-ui-text">
                <Upload className="h-5 w-5" />{t("canvas.importDropHint")}
              </div>
            </div>
          )}
          <CanvasImageImportStatus batches={imageImports} owner={user?.email||""} active={active} locale={locale} t={t}
            onDismiss={imageImportOwner.dismiss} onSynchronize={id=>void retryImportSynchronization(id)}
            onLocate={id=>{setSelectedId(null);setSelectedTextId(null);setSelectedPendId(null);focusCanvasNode(id);}} />

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

          {/* 拉线新建与添加节点共用清单、权限和创建入口。 */}
          {spawnMenu && (
            <ContextMenuSurface x={spawnMenu.cx} y={spawnMenu.cy} light={lightCanvas} onClose={() => setSpawnMenu(null)}>
              {canvasNodeMenuItems({ L, readOnly, onWorkflow:canFeature("comfyui")?()=>{setComfyRunId(null);setComfyOpen(true);}:undefined, videoDisabled: !canFeature("video") || videoNodeCreateDisabled, onCreate: kind => void spawnNode(kind) }).map(item => (
                <Item key={item.id} action={item.id} label={item.label} icon={item.icon} disabled={item.disabled} onClick={item.onSelect} />
              ))}
            </ContextMenuSurface>
          )}

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
              const {artwork:node,text:textNode,pending:pendNode,video:videoNode,director:directorNode,character:characterNode,scene:sceneNode,audio:audioNode,timeline:timelineNode}=canvasContextTargets(selectionCatalogue,ctxMenu.nodeId);
              const failedTask = generationTasks.find(task=>task.id===ctxMenu.nodeId&&task.failure&&!task.replaceNode);
              if (ctxMenu.nodeId && !node && !textNode && !pendNode&&!failedTask&&!videoNode&&!directorNode&&!characterNode&&!sceneNode&&!audioNode&&!timelineNode) return null;
              const mutationDisabled = readOnly || !nodeSettingsReady || historySaving || (directorNodesStore.saving||characterNodesStore.saving||sceneNodesStore.saving||audioNodesStore.saving||timelineNodesStore.saving) || Boolean(ctxMenu.nodeId && isNodeLocked(ctxMenu.nodeId));
              const Sep = () => <div className="canvas-ui-divider my-1 h-px" />;
              const batchContextSelection = Boolean(
                node &&
                  selectedBatchArts.length > 1 &&
                  selectedBatchIds.includes(node.id)
              );
              const menu = (
                <ContextMenuSurface x={ctxMenu.cx} y={ctxMenu.cy} light={lightCanvas} onClose={() => setCtxMenu(null)}>
                    {ctxMenu.nodeId&&multiSel.length>1&&multiSel.includes(ctxMenu.nodeId)&&!batchContextSelection ? (
                      <Item label={t("canvas.delete")} disabled={mutationDisabled} danger onClick={()=>batchDelete(multiSel)}/>
                    ) : failedTask ? (
                      <Item label={t("canvas.delete")} disabled={mutationDisabled} danger onClick={()=>batchDelete([failedTask.id])}/>
                    ) : node && batchContextSelection ? (
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
                          onClick={() => batchDelete(multiSel)}
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
                            void downloads.image(node.image)
                          }
                        />
                        {!readOnly && canFeature("generate") && (
                          <Item
                            label={t("canvas.ctxGenerate")}
                            onClick={() => {
                              setSelectedId(node.id);
                              focusCanvasNode(node.id);
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
                          items={canvasNodeMenuItems({ L, readOnly, onWorkflow:canFeature("comfyui")?()=>{setComfyRunId(null);setComfyOpen(true);}:undefined, videoDisabled: !canFeature("video") || videoNodeCreateDisabled, onCreate: kind => createCanvasNode(kind, ctxMenu) })}
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
            onDownload={()=>{const result=videoInputChoices.find(choice=>choice.nodeId===selectedVideo.id&&choice.available);if(result)downloads.video(result.value);}}
            onDelete={()=>batchDelete([selectedVideo.id])} onProperties={openProperties} management={nodeManagementItems(selectedVideo.id)}/>}
          {selected?.videoUrl&&selectedBatchArts.length<=1&&multiSel.length<=1&&!propertiesOpen&&topbarStyle&&<VideoNodeToolbar
            ref={nodeToolbarRef} style={{left:topbarStyle.left,top:topbarStyle.top}} light={lightCanvas}
            readOnly={readOnly} locked={isNodeLocked(selected.id)} busy={!nodeSettingsReady||historySaving} hasResult hasHistory={!!resultVideoComposer}
            settingsLabel={selected.category==="audio"?L("编辑音频","Edit audio"):L("视频处理","Video tools")}
            downloadLabel={selected.category==="audio"?L("下载音频","Download audio"):undefined}
            onSettings={()=>selected.category==="audio"?editAudioResult(selected):extractVideoToCanvas(selected.id,{action:'trim'})} onHistory={()=>{if(resultVideoComposer)setVideoHistoryId(resultVideoComposer.id);}}
            onRename={()=>{setNodeRenameValue(selected.title);setRenamingNodeId(selected.id);}}
            onCopy={()=>clipboard.copySelection([selected.id])} onDuplicate={()=>void duplicateArt(selected)} onDownload={()=>downloads.video(selected.videoUrl!)}
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
                "canvas-ui-surface canvas-dock-entry absolute z-20 flex max-w-[min(780px,calc(100%-1rem))] -translate-x-1/2 items-center gap-0.5 rounded-[14px] border p-1.5 [&>*]:shrink-0 [&_button]:whitespace-nowrap",
                "overflow-x-auto"
              )}
            >
              {selected && <>
              <button type="button" data-action="rename" aria-label={t("canvas.editName")} title={t("canvas.toolbar.renameHint")}
                disabled={!selectedImageTools.canMutate} onClick={() => { if (selected) { setNodeRenameValue(selected.title); setRenamingNodeId(selected.id); } }}
                className="canvas-ui-action flex h-[34px] items-center justify-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold transition-colors disabled:opacity-40">
                <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
              <FeatureVisible feature="agent"><button type="button" data-action="assistant" aria-label={t("canvas.toolbar.assistant")} title={t("canvas.toolbar.assistantHint")}
                disabled={!selected || readOnly} onClick={() => selected && openAssistant(selected)}
                className="canvas-ui-action flex h-[34px] items-center justify-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold transition-colors disabled:opacity-40">
                <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button></FeatureVisible>
              {/* 抠图:发丝级,扣 1 积分/张(已去掉免费极速档) */}
              <FeatureVisible feature="cutout"><button
                type="button"
                disabled={selectedGenerating || !selectedImageTools.canCutout}
                title={selectedImageTools.cutoutReason || t("canvas.toolbar.cutoutHint")}
                onClick={() => onCutout("fine")}
                className="canvas-ui-action flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40"
              >
                <Scissors className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("canvas.qa.cutout")}
              </button></FeatureVisible>
              {/* 高清:下拉选分辨率(深色弹出,向下) */}
              <FeatureVisible feature="generate"><CanvasSelect
                hint={selectedImageTools.reason || (generationParameters.resolutions.length ? t("canvas.toolbar.hdHint") : "当前模型没有可用分辨率")}
                dir="down"
                light={lightCanvas}
                disabled={selectedGenerating || !selectedImageTools.canMutate || !generationParameters.resolutions.length}
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
                hint={selectedImageTools.reason || t("canvas.toolbar.ratioHint")}
                dir="down"
                light={lightCanvas}
                disabled={selectedGenerating || !selectedImageTools.canMutate}
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
              {/* 扩图:选目标比例 + 原图锚点,outpaint 保原图内容补全四周 */}
              <FeatureVisible feature="generate"><div className="relative flex items-center">
                <button
                  type="button"
                  ref={expandButtonRef}
                  aria-expanded={expandOpen}
                  title={selectedImageTools.reason || t("canvas.toolbar.expandHint")}
                  disabled={!selectedImageTools.canMutate || selectedGenerating}
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
                        disabled={!expandRatio || selectedGenerating || !selectedImageTools.canMutate}
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
              {/* 低频处理与节点管理使用一个可访问的Portal菜单。 */}

              </>}
              <CanvasActionMenu triggerRef={imageMoreRef} label={t("canvas.toolbar.imageMore")} light={lightCanvas}
                items={[
                  ...QUICK_ACTIONS.filter(a => canFeature("generate") && ["bg", "angle", "caption", "relight"].includes(a.key)).map(a => ({
                    id: a.key, icon: a.icon, label: t(`canvas.qa.${a.key}`), hint: t(`canvas.toolbar.${a.key}Hint`),
                    disabled: selectedGenerating || !selectedImageTools.canMutate, onSelect: () => onQuickAction(a.key),
                  })),
                  ...(canFeature("generate") ? [
                    { id:"edit-text",icon:Type,label:t("canvas.toolbar.editText"),hint:selectedImageTools.reason||t("canvas.toolbar.editTextHint"),disabled:!selectedImageTools.canMutate||selectedGenerating,onSelect:()=>{if(selected)void openImageTextEditor(selected);} },
                    { id:"annotate",icon:PenLine,label:t("canvas.toolbar.annotate"),hint:selectedImageTools.reason||t("canvas.toolbar.annotateHint"),disabled:!selectedImageTools.canMutate||selectedGenerating,onSelect:()=>{if(selected)setAnnotateArtwork(selected);} },
                  ] : []),
                  ...(selected&&!selected.videoUrl ? [{id:"replace",icon:ImagePlus,label:L("替换图片","Replace image"),disabled:localEditBusy||!nodeSettingsReady||isNodeLocked(selected.id),onSelect:()=>requestReplace(selected)}] : []),
                  { id: "workflow", icon: Workflow, label: t("canvas.toolbar.workflow"), hint: t("canvas.toolbar.workflowHint"),
                    disabled: readOnly, onSelect: () => {setComfyRunId(null);setComfyOpen(true);} },
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
                  disabled={localEditBusy || !nodeSettingsReady || isNodeLocked(selected.id)} onClick={()=>localEdits.openCrop(selected,canvasLocalEditContext())}
                  className="canvas-ui-action flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 text-[13px] font-semibold disabled:opacity-40"><Crop className="h-4 w-4" />{L("裁剪","Crop")}</button>

              </>}
              <button
                type="button"
                title={t("canvas.toolbar.downloadImage")}
                aria-label={t("canvas.toolbar.downloadImage")}
                disabled={!selectedImageTools.canView}
                onClick={() =>
                  selected && void downloads.image(selected.image)
                }
                className="canvas-ui-action flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-[16px] leading-none transition-colors disabled:opacity-40"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                title={t("canvas.viewLarge")}
                aria-label={t("canvas.viewLarge")}
                disabled={!selectedImageTools.canView}
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
                onClick={() => setTextComposerFocusRevision(value=>value+1)}
                aria-label={L("AI 写作", "AI writing")}
                title={L("AI 写作", "AI writing")}
                className="canvas-ui-action flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40"
              >
                {assistBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PenLine className="h-4 w-4" />
                )}
                {L("AI 写作", "AI writing")}
              </button>
              <FeatureVisible feature="generate"><button
                type="button"
                disabled={!nodeSettingsReady || textImageSubmitting || textTasks.state(selectedText.id).busy || isNodeLocked(selectedText.id) || selectedText.status === "generating"}
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
                onClick={() => focusCanvasNode(selectedText.id)}
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
                items={[{id:"product-copy",icon:PenLine,label:t("canvas.toolbar.productCopy"),disabled:assistBusy||!selectedText.content.trim(),onSelect:()=>setProductPicker({textNodeIds:[selectedText.id]})},...nodeManagementItems(selectedText.id),{id:"properties",icon:SlidersHorizontal,label:L("属性设置","Properties"),onSelect:openProperties}]} />
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
            onClose={() => {setComfyOpen(false);setComfyRunId(null);}}
            canvasWorkflow={comfyRunId?comfyNodesStore.getNode(comfyRunId):null}
            onAdd={addComfyToCanvas}
            source={selected}
            inputArtworks={active?.members||[]}
            onRun={(payload,artworkId) => {
              return runComfyWorkflow(artworkId?(active?.members.find(art=>art.id===artworkId)||null):null, payload);
            }}
          />}

          <CanvasImageTextPanel state={imageTextEditor.state} artwork={active?.members.find(artwork=>artwork.id===ocrArtworkId)} lightCanvas={lightCanvas}
            onClose={imageTextEditor.close} onFocus={imageTextEditor.focus} onEdit={imageTextEditor.edit} onApply={applyOcrSegment} onApplyAll={applyAllOcrSegments} />

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

          {storyboardPanel&&storyboardPanel.projectKey===activeKey&&!readOnly&&canFeature("video")&&<StoryboardPanel
            key={JSON.stringify([user?.email,targetEmail,storyboardPanel])} projectKey={storyboardPanel.projectKey} scope={JSON.stringify([user?.email,targetEmail])}
            choices={videoInputChoices} onOpenTimeline={async id=>{await timelineNodesStore.refresh();setStoryboardPanel(null);openTimelineEditor(id);}}
            nodes={videoNodesStore.nodes} initialNodeIds={storyboardPanel.nodeIds} request={privateFetchRaw} english={locale==='en'}
            onClose={()=>setStoryboardPanel(null)} onEditNode={id=>{setStoryboardPanel(null);openVideoEditor(id);}}
            onChanged={run=>{void videoNodesStore.refresh();const ids=(run.assembly?.outputs||[]).map(output=>output.artworkId).filter((id):id is string=>!!id);if(ids.length)void mergeWorks(ids);}}/>}
          {videoComposerNode&&multiSel.length<=1&&!propertiesOpen&&canFeature("video")&&<VideoSettingsDialog
            key={JSON.stringify([user?.email,targetEmail,canvasArtworkDocument.scope.workspace,activeKey,videoComposerNode.id])} node={videoComposerNode} presentation="dock"
            dockRef={panelRef} dockStyle={dockStyle??{left:12,bottom:12,maxHeight:"60%"}} expanded={mediaComposerExpanded} onToggleExpand={()=>setMediaComposerExpanded(value=>!value)} draftScope={JSON.stringify([user?.email,targetEmail,canvasArtworkDocument.scope.workspace,activeKey])} advanced={videoDockAdvancedId===videoComposerNode.id} onCloseAdvanced={()=>setVideoDockAdvancedId(null)}
            task={videoTaskStore.tasks.find(task=>task.id===videoComposerNode.lastTaskId)}
            generationBlocked={!!videoComposerNode.lastTaskId&&!videoTaskStore.tasks.some(task=>task.id===videoComposerNode.lastTaskId)}
            onCancel={()=>{if(videoComposerNode.lastTaskId)void videoTaskStore.cancel(videoComposerNode.lastTaskId).catch(error=>flashTip(error.message));}}
            email={targetEmail||user?.email} models={videoCatalog} catalogLoading={videoModelCatalog.loading} catalogError={videoModelCatalog.error} onRetryCatalog={videoModelCatalog.refresh}
            choices={videoInputChoices} light={lightCanvas} readOnly={readOnly||!nodeSettingsReady||isNodeLocked(videoComposerNode.id)||!!selected&&isNodeLocked(selected.id)} onClose={()=>{setVideoDockAdvancedId(null);setSelectedId(null);}}
            onStoryboard={()=>setStoryboardPanel({projectKey:videoComposerNode.projectKey,nodeIds:[videoComposerNode.id]})}
            onSave={draft=>saveVideoDraft(videoComposerNode.id,draft)} onGenerate={(draft,quote,onPersisted,count)=>generateVideoDraft(videoComposerNode.id,draft,quote,onPersisted,count)}
            onOptimize={(prompt,signal)=>optimizeCanvasVideoPrompt(privateFetchRaw,prompt,signal)}
            onImport={async files=>{try{const choices=await videoAssetStore.upload(files,videoComposerNode.projectKey);await mergeWorks(choices.map(choice=>choice.nodeId));return choices;}catch(cause){if(cause instanceof VideoAssetImportError&&cause.choices.length)await mergeWorks(cause.choices.map(choice=>choice.nodeId));throw cause;}}}
            onLoadMoreAssets={videoAssetStore.loadMore} canLoadMoreAssets={!!videoAssetStore.nextCursor}/>}
          {/* 底部生成器(配方):选中节点正下方居中,横向 dock(原型 dock) */}
          {selected?.videoUrl&&!videoComposerNode&&selectedBatchArts.length<=1&&multiSel.length<=1&&!propertiesOpen&&<VideoResultDock
            ref={panelRef} style={dockStyle??{left:12,bottom:12,maxHeight:"60%"}} title={selected.title} prompt={selected.prompt||""}
            expanded={mediaComposerExpanded} onToggleExpand={()=>setMediaComposerExpanded(value=>!value)} onDismiss={()=>setSelectedId(null)}
            readOnly={readOnly||!nodeSettingsReady||isNodeLocked(selected.id)} canGenerate={canFeature("video")}
            kind={selected.category==="audio"?"audio":"video"} onEditAudio={()=>editAudioResult(selected)}
            onProcess={action=>extractVideoToCanvas(selected.id,action)} onContinue={()=>void openVideoNodeFromSelection()}/>}
          {canFeature("generate") && selected && !selected.videoUrl && selectedBatchArts.length <= 1 && !propertiesOpen && (
            <CanvasImageComposer linkedText={linkedImageText} key={`dock-${imageDraft.key||selected.id}`} pending={false} title={selected.title}
              dockRef={panelRef} style={dockStyle} expanded={mediaComposerExpanded} onToggleExpand={()=>setMediaComposerExpanded(value=>!value)} readOnly={readOnly} optimizationDisabled={!nodeSettingsReady||isNodeLocked(selected.id)} onDismiss={()=>setSelectedId(null)}
              referenceEditor={{...imageComposerReferences,textareaRef:promptAreaRef,placeholder:t("canvas.promptPlaceholder"),readOnly:readOnly||!promptSync.ready||referenceUploading||isNodeLocked(selected.id)}}
              promptRecovery={promptSync.error?{error:promptSync.error,retry:promptSync.retry,reload:()=>void promptSync.reloadSaved().catch(error=>setGenError(error instanceof Error?error.message:"读取失败"))}:undefined}
              recovery={{identity:`${canvasArtworkDocument.scope.key}:${selected.id}`,tasks:selectedImageAttempts.recoverable,busy:key=>originalImageChecksRef.current.has(key),check:checkOriginalImageTask}}
              upload={{inputRef:extraInputRef,available:composerReferences.length<MAX_TOTAL_IMAGES,disabled:!promptSync.ready||referenceUploading,onFiles:pickExtra}}
              restoreReferences={hiddenRefIds?.some(id=>dockRefs.some(ref=>ref.id===id))?{disabled:dockRefs.length+extraFiles.length>MAX_TOTAL_IMAGES,onRestore:()=>imageDraft.setHiddenReferenceIds([])}:undefined}
              controls={imageComposerControls} error={genError}
              imageActions={{style:genStyle,onStyle:setGenStyle,marked:!!selected.marked,onMark:toggleNodeMark,onFocus:()=>focusCanvasNode(selected.id)}}
              versions={{contextKey:`${canvasHistory.scope.key}:${selected.id}`,revision:selected.canvasImageRevision||0,disabled:readOnly||historySaving||isNodeLocked(selected.id),english:locale==="en",load:()=>loadImageVersions(selected.id),onSelect:(version,from)=>selectImageVersion(selected.id,version,from)}}
              generation={{ariaLabel:L("生成","Generate"),allowBackground:generationMode==="standard",generating:generationMode==="standard"?selectedImageSubmitting:selectedGenerating,failure:generationMode==="standard"?undefined:selectedGenerationFailure,onGenerate:generateSelectedImage}}/>
          )}
          {canFeature("generate") && selectedPend && !readOnly && (
            <CanvasImageComposer linkedText={linkedImageText} key={`pdock-${imageDraft.key||selectedPend.id}`} pending dockRef={panelRef} style={dockStyle} expanded={mediaComposerExpanded} onToggleExpand={()=>setMediaComposerExpanded(value=>!value)} optimizationDisabled={!nodeSettingsReady||isNodeLocked(selectedPend.id)}
              onDismiss={()=>setSelectedPendId(null)} controls={imageComposerControls} error={genError}
              referenceEditor={{...imageComposerReferences,textareaRef:pendPromptRef,placeholder:t("canvas.pendPromptPlaceholder")}}
              generation={{generating:selectedPendingSubmitting||(generationMode==="standard"?selectedPendGenerating&&!selectedPend.generationSubmitted:selectedPendGenerating),allowBackground:generationMode==="standard",failure:generationMode==="standard"?undefined:selectedPend.generationFailure,onGenerate:generatePendingImage}}/>
          )}
          {selectedText && selectedTextBatchNodes.length <= 1 && !readOnly && !propertiesOpen && !isNodeLocked(selectedText.id) && (
            <CanvasTextComposer focusRevision={textComposerFocusRevision} key={`tdock-${canvasOwnerEpochRef.current.revision}-${selectedText.id}`} node={selectedText} members={active?.members??[]} light={lightCanvas} optimization={{contextKey:JSON.stringify([user?.email,targetEmail,activeKey,selectedText.id]),disabled:readOnly||!nodeSettingsReady||isNodeLocked(selectedText.id)}}
              draft={{prompt:textPrompt,onChange:changeTextInstruction}}
              content={{onChange:value=>changeTextNodeContent(selectedText.id,value),onCommit:(value,initial)=>commitTextNodeContent(selectedText.id,value,initial),onFlush:()=>textAutosave.flush(selectedText.id)}} task={{state:textTasks.state(selectedText.id),retryable:textTasks.retryable(selectedText.id),onGenerate:intent=>generateTextNode(intent?{node:selectedText,prompt:"",intent}:undefined)}}
              layout={{dockRef:textComposerDockRef,style:dockStyle,safeArea:overlaySafeArea,canvasSize,expanded:textComposerExpanded,onExpandedChange:setTextComposerExpanded}}
              onDismiss={()=>setSelectedTextId(null)} onReference={(id,enabled)=>updateTextReference(selectedText.id,id,enabled)} onMenuOpenChange={setTextComposerMenuOpen}
              storyboard={canFeature("agent")&&canFeature("video")?{disabled:!nodeSettingsReady||assistantBusy||assistantUploading||isNodeLocked(selectedText.id)||selectedText.status!=="completed"||!selectedText.content.trim(),onPlan:()=>planTextStoryboard(selectedText)}:undefined}
              assist={{busy:assistBusy,onPickProduct:()=>setProductPicker({textNodeIds:[selectedText.id]})}}
              image={{disabled:!nodeSettingsReady||textImageSubmitting||isNodeLocked(selectedText.id)||selectedText.status==="generating",onGenerate:()=>openTextImageMenu([selectedText.id])}}/>
          )}
          {!browsing && !readOnly && canFeature("agent") && user && <CanvasAgentOrb key={`${user.email}:${activeKey || "workspace"}`} email={user.email}
            busy={assistantBusy} outcome={assistantOutcome} steps={assistantSteps} responding={assistantResponding} open={assistantVisible} companion={orbCompanion} onCue={orbCue}
            english={locale === "en"} onActivate={toggleAssistant} light={lightCanvas} />}
        </div>
        {propertiesOpen && !browsing && selectedProperties && <NodePropertiesPanel
          key={selectedProperties.id} title={selectedProperties.title} kind={selectedProperties.kind}
          settings={nodeSettings[selectedProperties.id] || DEFAULT_CANVAS_SETTINGS} light={lightCanvas} english={locale==='en'} busy={historySaving || localEditBusy} readOnly={readOnly || !nodeSettingsReady}
          content={selectedProperties.content} displaySize={selectedProperties.displaySize}
          imageEditable={selectedProperties.imageEditable} imageSize={selectedProperties.imageSize}
          onSave={settings=>commitNodeSettings(selectedProperties.id,settings)} onClose={()=>setPropertiesOpen(false)}
          onCrop={()=>selected && localEdits.openCrop(selected,canvasLocalEditContext())} onReplace={()=>selected && requestReplace(selected)} />}
        {cropArtwork && <ImageCropDialog image={cdnUrl(cropArtwork.image)} title={cropArtwork.title} light={lightCanvas} english={locale==='en'} busy={localEditBusy}
          onApply={crop=>saveLocalImageEdit(cropArtwork,crop)} onClose={localEdits.close} />}
        <input ref={replaceInputRef} data-testid="canvas-replace-image-input" type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(file)void localEdits.replace(file);}} />
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
      {canFeature("generate") && genImageMenu && textImages.isCurrent(genImageMenu,canvasTextImageContext()) && (
        <TextImageGenerationDialog textCount={genImageMenu.textNodeIds.length} referenceCount={textImages.referenceCount(canvasTextImageContext())}
          preview={options=>textImages.preview("general",options,canvasTextImageContext())}
          locale={locale === "en" ? "en" : "zh"} busy={textImageSubmitting}
          onClose={textImages.close} onGenerate={(mode, options) => void generateImagesFromTextNodes(mode, options)} />
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
      <CanvasNativeEditors sessions={nativeEditors.sessions} legacyDraftScope={JSON.stringify([user?.email,targetEmail,activeKey])}
        nodes={{characterNodes:characterNodesStore.nodes,sceneNodes:sceneNodesStore.nodes,directorNodes:directorNodesStore.nodes,audioNodes:audioNodesStore.nodes,timelineNodes:timelineNodesStore.nodes,comfyNodes:comfyNodesStore.nodes}}
        commands={{character:characterActions,scene:sceneNodeActions,director:directorActions,audio:audioActions,timeline:timelineActions}}
        inputs={baseVideoInputChoices} resolvedInputs={videoInputChoices} media={mediaJobStore} inspectTimeline={timelineNodesStore.inspect}
        english={locale==='en'} readOnly={readOnly} settingsReady={nodeSettingsReady} locked={isNodeLocked}/>
      {videoHistoryId&&videoNodesStore.nodes.find(node=>node.id===videoHistoryId&&node.projectKey===activeKey)&&<VideoHistoryPicker key={`${user?.email}:${targetEmail}:${activeKey}:${videoHistoryId}`} email={targetEmail||user?.email} projectKey={activeKey} node={videoNodesStore.getNode(videoHistoryId)} projects={projects.map(project=>({key:project.key,name:project.name}))} assets={videoAssetStore.assets} canLoadMoreAssets={!!videoAssetStore.nextCursor} onLoadMoreAssets={videoAssetStore.loadMore} request={privateFetchRaw} light={lightCanvas} readOnly={readOnly||isNodeLocked(videoHistoryId)} onClose={()=>setVideoHistoryId(null)} onSelectResult={(id,revision)=>selectVideoResult(videoHistoryId,id,revision)} onReuseSettings={async snapshot=>{const node=videoNodesStore.getNode(videoHistoryId),account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;if(!node||readOnly||isNodeLocked(node.id))throw new Error("无法修改视频设置");const draft=videoHistoryDraft(snapshot);await mergeWorks(draft.choices.filter(choice=>choice.kind!=="text").map(choice=>choice.nodeId));if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)throw new Error("账号或项目已切换");await saveVideoDraft(node.id,{title:node.title,config:draft.config,inputs:draft.inputs,expectedRevision:node.revision});if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;setVideoHistoryId(null);openVideoEditor(node.id);}} onSent={async result=>{await mergeWorks([result.artworkId,...(result.artworkIds||[]),...(result.inputArtworkIds||[])]);await videoNodesStore.refresh();await videoAssetStore.refresh();}} onRetried={async()=>{await videoNodesStore.refresh();await videoTaskStore.refresh();await refreshCredits();}} onProcess={(id,action)=>{const account=canvasAccountRef.current;void mergeWorks([id]).then(()=>{if(account===canvasAccountRef.current)extractVideoToCanvas(id,action);}).catch(error=>flashTip(error instanceof Error?error.message:"媒体加载失败"));}}/>}
      {/* 从生成历史选择:作品选择器 */}
      {historyPicker && <CanvasArtworkPicker items={artworkPicker.items} addingId={artworkPicker.addingId} error={artworkPicker.error}
        hasMore={artworkPicker.hasMore} light={lightCanvas} locale={locale} t={t} onClose={artworkPicker.close} onMore={artworkPicker.more} onPick={artworkPicker.pick}/>}

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
    </SurfaceAppearanceProvider>
  );
}
