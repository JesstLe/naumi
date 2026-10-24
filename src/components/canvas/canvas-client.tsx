"use client";
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
import {useCanvasTextTasks} from "./use-canvas-text-tasks";
import {generalTextTask,derivedTextTask,stripTextMentions as stripMentionLines,withTextProduct as withProductMention} from "@/lib/canvas/text-task-request";
import {useCanvasSelectionRun} from "./use-canvas-selection-run";
import {newCanvasText} from "@/lib/canvas/node-commands";
import {useCanvasDrag} from "./use-canvas-drag";
import {canvasNodeClick,canvasFlowSelection,canvasSelectionIds} from "@/lib/canvas/selection";
import {compileCanvasLink,type CanvasLinkIntent} from "@/lib/canvas/link-command";
import {compileCanvasMove} from "@/lib/canvas/drag-controller";

import { updateAssistantTimeline, restoreAssistantTimeline, type AssistantTimelineTurn } from "@/lib/canvas/assistant-timeline";
import { CachedImage } from "@/components/cached-image";
import { browserImageArchive } from '@/lib/browser-image-archive';
import { cachedImageBlob, imageCacheSource, ImageCacheDenied, readBrowserImage } from '@/lib/browser-image-cache';
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
import { clipboardImageFiles } from "@/lib/canvas/clipboard-files";
import { CANVAS_RATIO_OPTIONS, CANVAS_RESOLUTIONS, CANVAS_MAX_COUNT, normalizeCanvasRatio, normalizeCanvasResolution, normalizeCanvasCount, normalizeCanvasQuality, canvasModelParameters, canvasCombinationSupported } from "@/lib/canvas/generation-parameters";
import { canvasDockLayout, canvasOverlaySafeArea, type NodeScreen } from "@/lib/canvas/dock-layout";
import { createProjectRootResolver } from "@/lib/canvas/project-roots";
import { canvasGenerationReferences, explicitCanvasParent, synchronizeCanvasArtworks } from "@/lib/canvas/input-references";
import { canvasFocusViewport } from "@/lib/canvas/upload-visibility";
import { readPlacementCache, type CanvasPoint } from "@/lib/canvas/stable-placement";
import { useCanvasTextDocument } from "./use-canvas-text-document";
import { CANVAS_TEXT_DEFAULT_WIDTH as TEXT_NODE_DEFAULT_W, CANVAS_TEXT_DEFAULT_HEIGHT as TEXT_NODE_DEFAULT_H } from "@/lib/canvas/text-document-model";
import { useCanvasHistory } from "./use-canvas-history";
import { textPatchOf, type CanvasTextNode, type VideoPatchFields, type CanvasHistoryAction as UndoAct } from "@/lib/canvas/history-model";
import type { HistoryCommit } from "@/lib/canvas/history-controller";
import { CanvasHistoryRequestError } from "@/lib/canvas/history-scope";
import { canvasTextEditPatch } from "@/lib/canvas/text-edit-history";
import { smartLayout } from "@/lib/canvas/smart-layout";
import { CanvasComposerShell, CanvasComposerFooter, CanvasComposerOptions } from "./composer-shell";
import { CanvasParameterPopover } from "./parameter-popover";
import {submitCanvasImagegen,resolveCanvasDetailFrame} from "@/lib/imagegen/canvas-client";
import {ImagegenPendingRecovery} from "./imagegen-pending-recovery";
import {FrameRatioDialog,useCanvasFrameChoice} from "./frame-ratio-dialog";
import {createRetainedBillingSubmission,type RetainedBillingSubmission} from "@/lib/billing/client-submission";
import {createCanvasResultAttachment} from "@/lib/canvas/result-attachment";
import {createCanvasEditTask,type CanvasEditRequest} from "@/lib/canvas/edit-task";
import {createCanvasDetailTask} from "@/lib/canvas/detail-task-controller";
import {prepareCanvasDetailTask} from "@/lib/canvas/detail-task-request";
import {createCanvasImageTask,type CanvasGeneratedImage} from "@/lib/canvas/image-task-controller";
import {captureCanvasImageTaskScope,captureCanvasTaskOwner} from "@/lib/canvas/image-task-scope";
import {prepareCanvasImageTask,appendCanvasImageReferences,type CanvasImageGenerationOptions} from "@/lib/canvas/image-task-request";
import {generateCanvasVideoBatch,hasCanvasVideoBatch} from "@/lib/video/canvas-batch-client";
import {VideoSettingsDialog,type VideoNodeDraft} from "./video/settings-dialog";
import {VideoNodeToolbar} from "./video/node-toolbar";
import {VideoResultDock} from "./video/result-dock";
import {useVideoCatalog} from "./video/use-video-catalog";
import {useVideoNodes} from "./video/use-video-nodes";
import {useVideoTasks} from "./video/use-video-tasks";
import { mediaDownloadHref, type VideoPlayerAction } from "./video/player";
import {MediaActionsDialog,type MediaInputChoice} from "./video/media-actions";
import {useMediaJobs} from "./video/use-media-jobs";
import {videoHistoryDraft} from "@/lib/video/client-history";
import {useVideoAssets,VideoAssetImportError} from "./video/use-video-assets";
import {VideoHistoryPicker} from "./video/history-picker";
import type {CanvasVideoNode} from "@/lib/canvas/video-node-schema";
import { catalogCapability, videoNodeCreationDefaults, videoModeRoles, type VideoInputChoice } from "@/lib/video/client-settings";
import {readVideoReceipt,prepareVideoReceipt,saveVideoReceipt,clearVideoReceipt} from "@/lib/video/canvas-receipts";

import type {PublicQuote} from "@/lib/billing/client";
import { CanvasPerformanceProbe, recordCanvasNativeMove } from "./canvas-performance-probe";
import { generationFailureMessage, assertGenerationResultsPresent } from '@/lib/canvas/generation-failure';
import { ImagegenHttpError, ImagegenPreparationCancelled } from '@/lib/imagegen/http';
import { useImageNodeDraft } from './use-image-node-draft';
import { ImageReferenceComposer } from './image-reference-composer';
import { resolveCanvasImageReferences, changeImageReferenceRole, imageReferenceManifest, inheritableImagePrompt, type CanvasImageReference, type ImageReferenceCandidate } from '@/lib/canvas/image-references';
import { canvasReferenceManifestSchema, compileReferenceInstructions, referenceManifestError } from '@/lib/imagegen/reference-labels';
import { imageDraftScope } from '@/lib/canvas/image-node-drafts';
import { CanvasRenderLayerGuard } from './canvas-render-layer-guard';
import { CanvasEdgeHoverHint, type CanvasEdgeHoverHandle } from './canvas-edge-hover-hint';
import { canvasZoomState } from '@/lib/canvas/viewport-state';
import { shouldVirtualizeCanvas } from '@/lib/canvas/virtualization';
import { CanvasModelSelect } from "./model-select";
import { CanvasActionMenu, CanvasActionPanel } from "./canvas-action-menu";
import { CanvasHelpDialog } from "./canvas-help-dialog";
import { ContextMenuSurface, ContextMenuItem as Item } from "./context-menu-surface";
import { selectionRunTargets } from "@/lib/canvas/selection-run";
import { BatchSelectionToolbar } from "./batch-selection-toolbar";
import { TextImageGenerationDialog } from "./text-image-generation-dialog";
import { buildTextImageRequests, type TextImageMode } from "@/lib/canvas/text-image-inputs";
import { GenerationSubmitAction } from "./generation-submit-action";
import { generationPlaceholderSize, generationPositionForTask, placeGenerationPreview } from "@/lib/canvas/generation-feedback";
import type { ImageSkill } from "@/lib/image-skills/catalog";
import { CanvasAssistantPanel } from "./canvas-assistant-panel";
import { assistantReferences, assistantAttachmentCapacity, MAX_ASSISTANT_IMAGES } from "@/lib/canvas/assistant-references";
import { useWorkflowPaste } from "./use-workflow-paste";
import type { ImportedManifest } from "@/lib/canvas/workflow-clipboard";
import { CanvasAgentToggle } from "./canvas-agent-toggle";
import { CanvasAgentOrb } from "./canvas-agent-orb";
import { restoredOrbOutcome, type AgentOrbOutcome, type AgentOrbStep } from "@/lib/canvas/agent-orb";
import { useOrbCompanion } from "../naumi-orb/use-orb-companion";
import { classifyAgentFailure } from "@/lib/agent/recovery";
import { agentOrbState } from "@/lib/canvas/agent-orb";
import { reduceAgentProgress } from "@/lib/canvas/agent-progress";
import {receiveAssistantActivity,type AssistantLiveActivity} from "@/lib/canvas/assistant-live-state";
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
  type ReactNode,
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
import { X, Pencil, MoreHorizontal, Crop, SlidersHorizontal, Lock, Unlock, ArrowUpToLine, ArrowDownToLine, Loader2, Sparkles, Download, Trash2, Upload, RotateCcw, RotateCw, Scissors, Sun, Moon, Type, Rotate3d, Wand2, Image as ImageIcon, ChevronDown, Home, LayoutGrid, Plus, Maximize, Maximize2, ChevronLeft, Map as MapIcon, Magnet, Clock, Keyboard, ShoppingBag, Crown, Zap, MapPin, BoxSelect, Combine, GalleryVerticalEnd, ScanSearch, Video, PenLine, Play, MessageSquareText, Workflow, MousePointer2, Hand, ImagePlus, Copy, Box, Ruler, Focus, ArrowUp, type LucideIcon } from "lucide-react";
import { authHeader } from "@/lib/supabase";
import {currentWorkspace} from '@/lib/saas/workspace-client';
import { useAuth } from "@/lib/auth-context";
import { useCanvasCredits } from "./use-canvas-credits";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useI18n } from "@/lib/i18n/locale-context";

import { Textarea } from "@/components/ui/textarea";
import { cdnUrl } from "@/lib/cdn";
import { ImageLightbox } from "@/components/image-lightbox";
import type { ComfyRunPayload, ComfyRunResult } from "@/components/canvas/canvas-comfy-dialog";
import { BRAND, BRAND_CANVAS_LOGO } from "@/lib/brand";
const panelLoading = () => <div role="status" className="p-4 text-sm text-slate-500">加载中…</div>;
const AssistantRichText = dynamic(() => import("./assistant-richtext").then(module => module.AssistantRichText), { ssr: false, loading: panelLoading });
const ImageCropDialog = dynamic(() => import("./image-crop-dialog").then(module => module.ImageCropDialog), { ssr: false, loading: panelLoading });
const NodePropertiesPanel = dynamic(() => import("./node-properties-panel").then(module => module.NodePropertiesPanel), { ssr: false, loading: panelLoading });
const AnnotateEditorModal = dynamic(() => import("./annotate-editor").then(module => module.AnnotateEditorModal), { ssr: false, loading: panelLoading });
const CanvasComfyDialog = dynamic(() => import("./canvas-comfy-dialog").then(module => module.CanvasComfyDialog), { ssr: false, loading: panelLoading });
const TemplatesClient = dynamic(() => import("@/components/templates/templates-client").then(module => module.TemplatesClient), { ssr: false, loading: panelLoading });
const CreditPacks = dynamic(() => import("@/components/credits/credit-packs").then(module => module.CreditPacks), { ssr: false, loading: panelLoading });
const PayQrModal = dynamic(() => import("@/components/credits/pay-qr-modal").then(module => module.PayQrModal), { ssr: false, loading: panelLoading });
const AccountClient = dynamic(() => import("@/components/account/account-client").then(module => module.AccountClient), { ssr: false, loading: panelLoading });
const SecurityClient = dynamic(() => import("@/components/account/security-client").then(module => module.SecurityClient), { ssr: false, loading: panelLoading });
const GenerateClient = dynamic(() => import("@/components/generate/generate-client").then(module => module.GenerateClient), { ssr: false, loading: panelLoading });
const CheckoutClient = dynamic(() => import("@/components/checkout/checkout-client").then(module => module.CheckoutClient), { ssr: false, loading: panelLoading });
import { usePaymentConfig } from "@/lib/payment-context";
import { useRecharge } from "@/lib/recharge-modal-context";
import {
  ACCOUNT_THEME_EVENT,
  AccountDockMenu,
  currentThemeIsDark,
  toggleAccountTheme,
} from "@/components/account/account-dock-menu";
import { cn, formatDate } from "@/lib/utils";
import { bytesLabel, prepareImageUploads, uploadFormData } from "@/lib/client-image-upload";
import {
  adaptiveCanvasImageSize,
  type Artwork,
  GENERATION_STYLES,
} from "@/lib/mock-data";
import {
  compactImageModelOptions,
} from "@/lib/image-model-routing";

import { adminConfiguredFeature } from "@/lib/model-config/selection-policy";
import { chosenFeatureModel, featureModelManaged, useFeatureModels } from "@/lib/model-config/feature-client";
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
const MAX_TOTAL_IMAGES = 16; // 节点图 + 追加参考图 合计上限
const MAX_UPLOAD = 64 * 1024 * 1024;
const MAX_GENERATION_COUNT = CANVAS_MAX_COUNT;
type CanvasPrimaryTool = "move" | "marquee" | "hand";
// 扩图使用同一组比例选项，不包含自适应（必须指定外扩目标）。
const EXPAND_RATIOS = CANVAS_RATIO_OPTIONS.filter(r => r.id !== "auto").map(r => r.id);
// 扩图锚点九宫格(原图贴哪一侧,新内容补其余方向) + 提示文案
const ANCHOR_GRID = ["nw", "n", "ne", "w", "center", "e", "sw", "s", "se"] as const;
const ANCHOR_TITLE: Record<string, string> = {
  nw: "左上", n: "上", ne: "右上", w: "左", center: "中", e: "右", sw: "左下", s: "下", se: "右下",
};
// React Flow 默认只允许 50%–200%。这里使用 JavaScript 可安全表达的完整正数范围，
// 让滚轮、触控板、按钮和百分比输入不再受产品层的人为缩放档位限制。
const CANVAS_MIN_ZOOM = Number.EPSILON;
const CANVAS_MAX_ZOOM = Number.MAX_SAFE_INTEGER;

type DesktopPlatform = "mac" | "windows" | "other";

const CANVAS_NODE_CLIPBOARD_TYPE = "application/x-naumi-canvas-node";
// Persistent controls block their own events; only modal layers block the canvas.
const CANVAS_MODAL_SELECTOR = '.fixed.inset-0, [data-canvas-hotkeys-blocked="true"][aria-modal="true"]';

function isEditableClipboardTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(
    element.closest(
      'input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
    )
  );
}

function canvasNodeIdFromClipboard(data: DataTransfer): string | null {
  const direct = data.getData(CANVAS_NODE_CLIPBOARD_TYPE).trim();
  if (direct) return direct;
  const html = data.getData("text/html");
  const matched = html.match(/data-naumi-canvas-node="([^"]+)"/i);
  if (!matched?.[1]) return null;
  try {
    return decodeURIComponent(matched[1]);
  } catch {
    return null;
  }
}

function escapeClipboardHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function setCanvasNodeClipboardData(data: DataTransfer, nodeId: string, title: string) {
  try {
    data.setData(CANVAS_NODE_CLIPBOARD_TYPE, nodeId);
  } catch {
    // Safari may reject non-standard clipboard MIME types; text/html remains portable.
  }
  data.setData("text/plain", title);
  data.setData(
    "text/html",
    `<span data-naumi-canvas-node="${encodeURIComponent(nodeId)}">${escapeClipboardHtml(title)}</span>`
  );
}

function detectDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return "other";
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = `${nav.userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  if (/Mac|iPhone|iPad|iPod/i.test(platform)) return "mac";
  if (/Win/i.test(platform)) return "windows";
  return "other";
}

function zoomPercentInput(zoom: number): string {
  return String(zoom * 100);
}

function zoomPercentLabel(zoom: number): string {
  const percent = zoom * 100;
  if (percent < 0.01 || percent >= 1_000_000) {
    return `${percent.toExponential(2)}%`;
  }
  if (percent >= 1000) {
    return `${Math.round(percent).toLocaleString("en-US")}%`;
  }
  return `${Number(percent.toFixed(2))}%`;
}

type GenerationMode = "standard" | "detail" | "triptych" | "split";

type GeneratedResult = CanvasGeneratedImage;

function fmt(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    s
  );
}


type Project = {
  key: string;
  members: Artwork[];
  textNodes: CanvasTextNode[];
  videoNodes?: CanvasVideoNode[];
  isSuite: boolean;
  cover: string;
  count: number;
  name: string;
  latestAt: string;
};

type CanvasWorkflowKey = "hero" | "detail" | "views" | "copy";
const CANVAS_WORKFLOWS: Array<{
  key: CanvasWorkflowKey;
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
}> = [
  { key: "hero", icon: ImageIcon, titleKey: "canvas.workflowHero", descriptionKey: "canvas.workflowHeroDesc" },
  { key: "detail", icon: GalleryVerticalEnd, titleKey: "canvas.workflowDetail", descriptionKey: "canvas.workflowDetailDesc" },
  { key: "views", icon: Rotate3d, titleKey: "canvas.workflowViews", descriptionKey: "canvas.workflowViewsDesc" },
  { key: "copy", icon: Type, titleKey: "canvas.workflowCopy", descriptionKey: "canvas.workflowCopyDesc" },
];




type OcrBox = { x: number; y: number; width: number; height: number };
type OcrSegment = {
  id: string;
  text: string;
  editedText: string;
  confidence: number;
  box: OcrBox;
};

// 沿血缘上溯到根作品(带环保护)
function rootOf(a: Artwork, byId: Map<string, Artwork>): Artwork {
  let cur = a;
  let guard = 0;
  while (cur.parentId && byId.has(cur.parentId) && guard++ < 200) {
    cur = byId.get(cur.parentId) as Artwork;
  }
  return cur;
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
const CANVAS_RATIOS = CANVAS_RATIO_OPTIONS;
const CANVAS_RES = CANVAS_RESOLUTIONS;
type ImageModelOption = { id: string; label: string; supportsEdit: boolean; generationParameters?: { ratios?: string[]; resolutions?: string[]; combinations?: string[] } };

// 重生成(拉线新建节点 / 侧栏「生成新版本」)在用户没写提示词、且原图也没有提示词
// 可继承时的兜底词。明确要求别替换背景、别改配色/色调 —— 否则 gpt-image 在宽松指令下
// 会顺手重画背景(实测:背景被改成黄色)。仍是重生成(非像素锁定),只是约束更强。
const FAITHFUL_REGEN_PROMPT =
  "在保持主体、背景、配色、材质、光影与构图不变的前提下,仅提升清晰度与画质,输出一张干净的高质量版本;不要替换背景、不要改变背景颜色或整体色调。";
const VIEW_CONSISTENCY_RULES =
  "必须严格保持同一件产品：外形比例、结构、包装文字、Logo、颜色、材质、零件数量和所有识别性细节一致。使用统一白色影棚背景、相同镜头高度、焦距、光线、阴影强度与产品尺度，不得重新设计产品。";

function viewPrompt(
  role: "正面" | "侧面" | "背面",
  feedback: string,
  anchor = false
) {
  return `${VIEW_CONSISTENCY_RULES} 输出产品${role}标准视图，产品完整露出并居中，画面只出现一个产品。${
    anchor
      ? "第一张参考图是主体原图，第二张参考图是已经确认的正面锚点；以正面锚点锁定产品身份和视觉规格。"
      : "以参考主体图为唯一产品依据。"
  }${feedback ? ` 用户补充要求：${feedback}` : ""}`;
}

// 比例小图标:按 w/h 等比缩放的圆角小方块(auto=正方)。
function RatioIcon({ w, h }: { w: number; h: number }) {
  const M = 16;
  let bw = M;
  let bh = M;
  if (w && h) {
    if (w >= h) bh = Math.max(7, Math.round((M * h) / w));
    else bw = Math.max(7, Math.round((M * w) / h));
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      className="shrink-0" aria-hidden="true" focusable="false">
      <rect x={(18 - bw) / 2} y={(18 - bh) / 2} width={bw} height={bh}
        rx="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// 画布通用深色下拉(替代系统原生 select 的白底下拉):portal 到 body 脱离 dock 裁切,
// dir="up" 向上弹(dock 里用)、"down" 向下弹(顶部工具条用)。
function DarkSelect({
  trigger,
  triggerClass,
  hint,
  value,
  options,
  onPick,
  dir = "up",
  disabled,
  light = false,
}: {
  trigger: ReactNode;
  triggerClass?: string;
  hint?: string;
  value: string;
  options: { value: string; label: ReactNode }[];
  onPick: (v: string) => void;
  dir?: "up" | "down";
  disabled?: boolean;
  light?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    bottom: number;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    if (disabled) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.top, bottom: r.bottom });
    setOpen((v) => !v);
  };
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={hint}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={disabled}
        className={triggerClass}
      >
        {trigger}
        <ChevronDown
          className={cn(
            "h-3 w-3 flex-none text-[#9aa1ae] transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            data-canvas-hotkeys-blocked="true"
            className={cn("fixed inset-0 z-[200]", light ? "canvas-ui-light" : "canvas-ui-dark")}
            onClick={() => setOpen(false)}
          >
            <div
              data-testid="canvas-select-options"
              onClick={(e) => e.stopPropagation()}
              style={
                dir === "down"
                  ? { left: rect.left, top: rect.bottom + 8, maxHeight: Math.max(80, window.innerHeight-rect.bottom-24), overflowY: "auto", overscrollBehavior: "contain" }
                  : {
                      left: rect.left,
                      maxHeight: Math.max(80, rect.top-24),
                      overflowY: "auto",
                      overscrollBehavior: "contain",
                      bottom:
                        (typeof window !== "undefined"
                          ? window.innerHeight
                          : 0) -
                        rect.top +
                        8,
                    }
              }
              className={cn(
                "canvas-ui-surface fixed min-w-[128px] rounded-xl border p-1",
                dir === "down" ? "menu-pop-down" : "menu-pop-up"
              )}
            >
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onPick(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "block w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                    o.value === value
                      ? "canvas-ui-control font-semibold"
                      : "canvas-ui-action"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function ImageCountControl({
  value,
  onChange,
  disabled = false,
  light = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  light?: boolean;
}) {
  const clamp = (value: number) =>
    Math.min(MAX_GENERATION_COUNT, Math.max(1, Math.round(value) || 1));
  return (
    <div className={cn(light ? "canvas-ui-light" : "canvas-ui-dark", "canvas-ui-control flex h-8 items-center overflow-hidden rounded-[9px] text-[12.5px] font-semibold")}>
      <button
        type="button"
        disabled={disabled || value <= 1}
        onClick={() => onChange(clamp(value - 1))}
        className="canvas-ui-action h-full px-2 disabled:opacity-35"
        aria-label="减少生成数量"
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={MAX_GENERATION_COUNT}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        className="canvas-ui-text h-full w-8 border-0 bg-transparent p-0 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label="生成图片数量"
      />
      <span className="canvas-ui-muted pr-1">张</span>
      <button
        type="button"
        disabled={disabled || value >= MAX_GENERATION_COUNT}
        onClick={() => onChange(clamp(value + 1))}
        className="canvas-ui-action h-full px-2 disabled:opacity-35"
        aria-label="增加生成数量"
      >
        +
      </button>
    </div>
  );
}

// 项目键:只有"一键套图"(batchId 以 suite- 开头)整批算一个项目;
// 普通生成的批次号是 b-...(每次生成都有),不能当项目分组依据,否则每次迭代都成独立项目、
// 血缘连不起来 —— 普通图一律按血缘树(根 id)分组。
function isSuiteBatch(id?: string | null): boolean {
  return !!id && id.startsWith("suite-");
}
function projectKey(a: Artwork, byId: Map<string, Artwork>, resolveRoot = (art: Artwork) => rootOf(art, byId)): string {
  const r = resolveRoot(a);
  if (isSuiteBatch(r.batchId)) return `batch:${r.batchId}`;
  // 稳定分组:优先用 group_id(删中间节点也不变,下游节点不会跑去别的项目);
  // 没有 group_id 的老数据回退到"血缘树根 id"。
  return `tree:${a.groupId || r.id}`;
}

// 占位节点(空白/上传中)动作上下文:让 React Flow 内的节点能调用主组件的上传
// 计算当前选中节点的整条血缘链路:上溯所有祖先 + 下延所有衍生(含自身)
// 画布助手的一轮对话(user/assistant 纯文本;assistant 内容可含 [[GEN]]…[[/GEN]] 生图块)
type AssistantTurn = AssistantTimelineTurn;

// 画布助手上下文:锚定节点 + 上游祖先(BFS 近者优先),最多 5 张(与后端 MAX_CONTEXT_IMAGES 对齐)
function assistantContext(members: Artwork[], anchorId: string): Artwork[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const anchor = byId.get(anchorId);
  if (!anchor) return [];
  const parentsOf = (m: Artwork): string[] => {
    const ps = new Set<string>();
    if (m.parentId && byId.has(m.parentId) && explicitCanvasParent(m, m.parentId)) ps.add(m.parentId);
    for (const pid of m.parentIds ?? [])
      if (pid && byId.has(pid)) ps.add(pid);
    return [...ps];
  };
  const out: Artwork[] = [anchor];
  const seen = new Set([anchorId]);
  const queue: string[] = [anchorId];
  let guard = 0;
  while (queue.length && out.length < 5 && guard++ < 2000) {
    const id = queue.shift() as string;
    const m = byId.get(id);
    if (!m) continue;
    for (const p of parentsOf(m)) {
      if (seen.has(p)) continue;
      seen.add(p);
      const art = byId.get(p);
      if (art) out.push(art);
      queue.push(p);
      if (out.length >= 5) break;
    }
  }
  return out.slice(0, 5);
}

// 构造展示节点与血缘连线；渲染不重新整理已有坐标。
export function CanvasClient({ initialProject, desktopAppearance = false }: { initialProject?: string; desktopAppearance?: boolean } = {}) {
  const { can: canFeature } = useFeatureAccess();
  const billing=useBilling();
  async function privateFetch(input:RequestInfo|URL,init:RequestInit & { isCurrent?: () => boolean; submission?: RetainedBillingSubmission }={}){
    const workspace=currentWorkspace(),projectContext=activeProjectRef.current?.key;
    const capturedHeaders=new Headers(init.headers);capturedHeaders.set('x-naumi-workspace',workspace);if(projectContext&&projectContext!=='workspace')capturedHeaders.set('x-naumi-project-context',projectContext);init={...init,headers:capturedHeaders};
    const assertCurrent=()=>{if(currentWorkspace()!==workspace||init.isCurrent&&!init.isCurrent())throw new ImagegenPreparationCancelled();};
    assertCurrent();
    if(init.submission?.ready)return init.submission.retry(billing,assertCurrent,await authHeader());
    const path=String(input).split('?')[0];
    const features:Record<string,FeatureId>={"/api/generate-image":"canvas.image","/api/aplus":"image.aplus","/api/suite":"image.suite","/api/cutout":"tool.cutout","/api/canvas/image-tasks":"canvas.image","/api/canvas/expand":"canvas.expand","/api/canvas/text-edit":"canvas.text-edit","/api/canvas/annotate":"canvas.annotate","/api/canvas/text-generate":"canvas.text-generate","/api/canvas/assistant":"canvas.assistant","/api/canvas/ocr":"canvas.ocr","/api/video/generate":"video.generate"};
    if(init.method!=="POST"||!features[path])return privateFetchRaw(input,init);
    const form=init.body instanceof FormData?init.body:null;
    if(path==="/api/aplus"&&form){
      const account=canvasAccountRef.current,project=activeProjectRef.current?.key||null,epoch=canvasContextEpochRef.current;
      await resolveCanvasDetailFrame(form,frameChoice.chooseFrame,()=>account===canvasAccountRef.current&&project===(activeProjectRef.current?.key||null)&&epoch===canvasContextEpochRef.current&&(init.isCurrent?.()??true));
    }
    const body=form?Object.fromEntries(Array.from(form.entries()).filter((entry)=>typeof entry[1]==="string")):typeof init.body==="string"?JSON.parse(init.body):{};
    if(path==="/api/generate-image"&&form&&user&&body.ratiogen!=="1"&&(!body.userPrompt||String(body.userPrompt).trim()===String(body.prompt).trim())){
      const account=canvasAccountRef.current,project=activeProjectRef.current?.key||null,epoch=canvasContextEpochRef.current;
      return submitCanvasImagegen(form,active?.members[0]?.id,message=>flashTip(message),{owner:user.email,project:active?.key||"workspace",chooseFrame:frameChoice.chooseFrame,
        isCurrent:()=>account===canvasAccountRef.current&&project===(activeProjectRef.current?.key||null)&&epoch===canvasContextEpochRef.current&&(init.isCurrent?.()??true)});
    }
    if (path === "/api/generate-image") {
      if(form?.has("canvasReferences")) {
        try {
          const manifest=canvasReferenceManifestSchema.parse(JSON.parse(String(form.get("canvasReferences"))));
          if(manifest.length!==form.getAll("image").length)throw new Error("参考图片顺序不一致，请重新选择");
          body.prompt=compileReferenceInstructions(String(body.prompt||""),manifest);
          form.set("prompt",body.prompt as string);form.delete("canvasReferences");delete body.canvasReferences;
        } catch(error) {
          throw new ImagegenHttpError(error instanceof Error?error.message:"参考图片信息无效",400,false);
        }
      }
      body.ratio = normalizeCanvasRatio(body.ratio);
      body.resolution = normalizeCanvasResolution(body.resolution);
      body.count = String(normalizeCanvasCount(body.count));
      delete body.targetWidth; delete body.targetHeight;
      if (form) { form.delete("targetWidth"); form.delete("targetHeight"); }
    }
    if (path === "/api/generate-image" || ["/api/canvas/image-tasks", "/api/canvas/expand", "/api/canvas/annotate", "/api/canvas/text-edit"].includes(path)) {
      body.quality = normalizeCanvasQuality(body.quality || canvasToolQualities[features[path]] || genQuality);
      if (form) for (const key of ["ratio", "resolution", "count", "quality"]) { if (body[key] !== undefined) form.set(key, String(body[key])); }
      else init = { ...init, body: JSON.stringify(body) };
    }
    const source=active?.members.find(art=>art.id===body.artworkId);
    const quantity=path==="/api/aplus"?Math.max(1,form?.getAll("module").length||body.modules?.length||1):path==="/api/suite"?(body.structure==="custom"?JSON.parse(String(body.shots||"[]")).length:13):Number(body.count||1);
    const headers=new Headers(init.headers);for(const [key,value] of Object.entries(await authHeader()))headers.set(key,value);
    headers.set('x-naumi-workspace',workspace);
    if (body.quality) headers.set("x-naumi-image-quality", String(body.quality));
    headers.set("x-naumi-canvas","1");
    const feature=features[path],modelId=["/api/aplus","/api/suite"].includes(path)?body.modelId||body.model||genModel:adminConfiguredFeature(feature) ? undefined : featureModelManaged(feature) && !["image.generate","video.generate"].includes(feature) ? chosenFeatureModel(feature) : body.modelId||body.model||undefined;
    const facts={canvas:true,feature,quantity,quality:String(body.quality||genQuality),resolution:String(body.resolution||source?.resolution||"1K"),modelId,providerId:body.providerId,ratio:body.ratio};
    return init.submission ? init.submission.submit(billing,path,{...init,headers},facts,assertCurrent) : billing.quoteAndSubmit(path,{...init,headers},facts,assertCurrent);
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
  const [names, setNames] = useState<Record<string, string>>({});
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

  const frameChoice=useCanvasFrameChoice(imageDraftScope(user?.email,targetEmail,activeKey));
  const canvasSelection=useCanvasSelection();
  const {selectedId,setSelectedId,selectedPendId,setSelectedPendId,selectedTextId,setSelectedTextId,selectedEdge,setSelectedEdge,multiSel,setMultiSel}=canvasSelection;
  const selectedIdRef = useRef<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [browserTab, setBrowserTab] = useState<"all" | "workflows">("all");
  const cancelEditRef = useRef(false); // Esc 取消时跳过失焦保存
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
  const [ratioMenuOpen, setRatioMenuOpen] = useState(false); // 比例/分辨率弹出面板
  const ratioBtnRef = useRef<HTMLButtonElement>(null);
  const [genStyle, setGenStyle] = useState(GENERATION_STYLES[0]);
  const [genCount, setGenCount] = useState(1);
  const [generationMode, setGenerationMode] =
    useState<GenerationMode>("standard");
  const [generationTasks, setGenerationTasks] = useState<
    CanvasGenerationTask[]
  >([]);
  // 自由拖动是默认；用户主动开启磁铁时才吸附网格。全局整理仅由手动动作触发。
  const [showMinimap, setShowMinimap] = useState(false);
  const [snapGrid, setSnapGrid] = useState(false);
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
  const zoomLabelRef = useRef<HTMLSpanElement>(null);
  const zoomButtonRef = useRef<HTMLButtonElement>(null);
  const zoomInputRef = useRef<HTMLInputElement>(null);
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
  const nodeClipRef = useRef<Artwork | null>(null);
  const genericNodeClipRef=useRef<{marker:string;ids:string[];owner:string}|null>(null);
  const pendingNodeSelectionRef=useRef<{ids:string[];projectKey:string;owner:string}|null>(null);
  // window copy 只消费紧邻本次画布 Cmd/Ctrl+C 的一次事件，不能让陈旧节点
  // 覆盖后续普通网页文本复制。
  const canvasCopyIntentRef = useRef<string | null>(null);
  const canvasCopyHandlerRef = useRef<(event: ClipboardEvent) => void>(() => {});
  const canvasPasteHandlerRef = useRef<(event: ClipboardEvent) => void>(() => {});
  const [hasClip, setHasClip] = useState(false);
  useEffect(() => {
    // The portable clipboard already persists owned node identities. Restore its
    // availability after a project navigation/reload, and never carry another
    // account's in-memory clipboard into the next account.
    nodeClipRef.current = null;
    genericNodeClipRef.current = null;
    canvasCopyIntentRef.current = null;
    const clip = readGenericNodeClip();
    if (clip) genericNodeClipRef.current = clip;
    setHasClip(!!clip);
  }, [user?.email]);
  const [copyTip, setCopyTip] = useState(false);
  const rootUploadRef = useRef<HTMLInputElement>(null);
  // 空白右键「上传图片/添加节点」时记下落点(画布坐标)与挂靠的当前项目根,供 uploadRoot 用
  const uploadCtxRef = useRef<{ parentId: string | null; x: number; y: number } | null>(
    null
  );
  // A captured scope survives queued drops, but is replaced when the user changes projects.
  const importScopeRef = useRef<{
    rootId: string | null;
    queue: Promise<void>;
    rects: { x: number; y: number; width: number; height: number; owner: number; index: number }[];
  }>({ rootId: null, queue: Promise.resolve(), rects: [] });
  const importSeqRef = useRef(0);
  const dragDepthRef = useRef(0);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [nodeTypeMenu, setNodeTypeMenu] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  // paste 必须挂在 window：点击 React Flow 空白处后 activeElement 可能仍是 body，
  // 只给 canvas div 绑定 onPaste 会漏掉系统截图和内部节点粘贴。
  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => canvasCopyHandlerRef.current(event);
    const onPaste = (event: ClipboardEvent) => canvasPasteHandlerRef.current(event);
    window.addEventListener("copy", onCopy);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("paste", onPaste);
    };
  }, []);
  const importResyncRef = useRef(new Set<number>());
  const [imageImports, setImageImports] = useState<{
    id: number; total: number; done: number; success: number; finished: boolean;
    errors: { name: string; message: string }[];
    phase: "optimizing" | "uploading" | "sync" | "done";
    owner?: string;
    originalBytes: number; uploadBytes: number; uploadedBytes: number;
    nodeIds?: string[];
  }[]>([]);

  function resetImportScope() {
    importScopeRef.current = { rootId: null, queue: Promise.resolve(), rects: [] };
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
  const [projMenuKey, setProjMenuKey] = useState<string | null>(null);
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
  const settledCanvasImageTaskRef = useRef(new Set<string>());
  const failedCanvasImageTaskRef = useRef(new Set<string>());
  const ocrApplyLockRef = useRef(false);
  const ocrRequestEpochRef = useRef(0);
  const ocrTaskSegmentRef = useRef(new Map<string, {
    artworkId: string;
    segmentId: string;
    oldText: string;
    newText: string;
  }>());
  const pendSeqRef = useRef(1);
  const canvasTextDocument = useCanvasTextDocument({account:canvasAccountRef.current,actor:user?.email||"",owner:targetEmail||user?.email||"",
    project:activeKey,enabled:ready&&!!user&&!!targetEmail,readOnly,notice:flashTip});
  const {nodes:textNodes,set:setTextNodes,ready:textNodesReady,unsaved:unsavedTextCount} = canvasTextDocument;
  const textNodesRef = useRef(textNodes); textNodesRef.current = textNodes;
  const [textPrompt, setTextPrompt] = useState("");
  // 文字节点一键放大/还原只改变当前画布视图，不写回节点尺寸；刷新后仍使用用户保存的原尺寸。
  const [expandedTextIds, setExpandedTextIds] = useState<Set<string>>(new Set());
  const [textComposerExpanded, setTextComposerExpanded] = useState(false);
  const [textComposerManuallySized, setTextComposerManuallySized] = useState(false);
  const textComposerDockRef = useRef<HTMLDivElement>(null);
  const textComposerBodyRef = useRef<HTMLDivElement>(null);
  const textPromptRef = useRef<HTMLTextAreaElement>(null);
  const [textReferenceMenuOpen, setTextReferenceMenuOpen] = useState(false);
  // @提及选图:输入 @ 弹出图片选择框,点击=插入 @图片名 并绑引用(等同连线)
  const [mentionState, setMentionState] = useState<{
    query: string;
    start: number;
  } | null>(null);
  const [ocrArtworkId, setOcrArtworkId] = useState<string | null>(null);
  const [ocrSegments, setOcrSegments] = useState<OcrSegment[]>([]);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "scanning" | "ready" | "applying" | "done" | "error">("idle");
  const [ocrEngine, setOcrEngine] = useState("");
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrApplyingId, setOcrApplyingId] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrImageSize, setOcrImageSize] = useState<{ width: number; height: number } | null>(null);
  const [ocrFocusedId, setOcrFocusedId] = useState<string | null>(null);
  // 扩图/标注编辑复用占位落地管线 landEditResult，重复提交仅锁对应源节点。
  // 生图、扩图和标注共用按源节点的同步守卫，不阻塞其他节点。
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
  const videoNodesStore=useVideoNodes({email:targetEmail||user?.email,readOnly,request:privateFetchRaw});
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
  // 画布助手:围绕选中节点+上游链的多轮对话,[[GEN]] 提示词可一键生图回画布
  const [assistantArtworkId, setAssistantArtworkId] = useState<string | null>(null);
  const [assistantTurns, setAssistantTurns] = useState<AssistantTurn[]>([]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantAttachments, setAssistantAttachments] = useState<Artwork[]>([]);
  const [assistantExcludedReferences, setAssistantExcludedReferences] = useState<string[]>([]);
  const [assistantUploading, setAssistantUploading] = useState(false);
  const [assistantUploadError, setAssistantUploadError] = useState<string | null>(null);
  const assistantUploadToken = useRef<object | null>(null);
  const [assistantSkill, setAssistantSkill] = useState<ImageSkill | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantResponding, setAssistantResponding] = useState(false);
  const [assistantActivity,setAssistantActivity]=useState<AssistantLiveActivity>({phase:"connecting"});
  const [assistantSteps, setAssistantSteps] = useState<AgentOrbStep[]>([]);
  const [assistantOutcome, setAssistantOutcome] = useState<AgentOrbOutcome>("idle");
  const orbCompanion = useOrbCompanion(`${user?.email || ""}:${activeKey || "workspace"}`);
  const orbCue = orbCompanion.emit;
  const assistantController = useRef<AbortController | null>(null);
  const assistantSessionId = useRef(browserRandomUUID());
  const assistantLiveSessionId = useRef("");
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantContinueTurn, setAssistantContinueTurn] = useState<string | null>(null);
  const assistantRetry = useRef<{ input: string; anchorId: string; referencesKey: string; history: AssistantTurn[]; body: string } | null>(null);
  const assistantRequestEpoch = useRef(0);
  const { open: assistantOpen, focusInput: assistantFocusInput, disclose: discloseAssistant, suspend: suspendAssistant } = useCanvasAssistantDisclosure(user?.email);
  const assistantVisible = canFeature("agent") && assistantOpen && !propertiesOpen && !ocrArtworkId;
  const assistantProject = useRef({ key: activeKey, email: user?.email });
  useEffect(() => {
    if (assistantProject.current.key === activeKey && assistantProject.current.email === user?.email) return;
    assistantProject.current = { key: activeKey, email: user?.email };
    assistantRequestEpoch.current += 1;
    assistantController.current?.abort();
    assistantSessionId.current=browserRandomUUID();
    setAssistantSteps([]); setAssistantOutcome("idle");
    setAssistantArtworkId(null);
    setAssistantTurns([]);
    setAssistantInput("");
    assistantUploadToken.current = null;
    setAssistantAttachments([]); setAssistantExcludedReferences([]); setAssistantUploading(false); setAssistantUploadError(null);
    setAssistantError(null);
    setAssistantContinueTurn(null);
    setAssistantBusy(false);
    assistantRetry.current = null;
  }, [activeKey, user?.email]);
  useEffect(() => () => { assistantRequestEpoch.current += 1; assistantController.current?.abort(); assistantUploadToken.current=null; }, []);
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
  const [desktopPlatform, setDesktopPlatform] = useState<DesktopPlatform>("other");
  useEffect(() => setDesktopPlatform(detectDesktopPlatform()), []);
  const isMac = desktopPlatform === "mac";
  const modifierKey = isMac ? "⌘" : "Ctrl";
  const shortcut = (key: string) => `${modifierKey}${key}`;
  // 主工具栏仅保留选择/移动、创建和设置；创建菜单与设置菜单互斥。
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  // 左下角缩放下拉菜单 + 可输入的缩放值
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [zoomInput, setZoomInput] = useState("100");
  // 右上角按钮在画布内弹窗打开的页面;支持层叠(下一级页面也在弹窗内,可返回)
  type ModalRoute = {
    page: "templates" | "plans" | "account" | "generate" | "checkout" | "security";
    params?: Record<string, string>;
  };
  const [modalStack, setModalStack] = useState<ModalRoute[]>([]);
  const modalTop = modalStack[modalStack.length - 1] ?? null;
  // 画布内扫码支付(原生支付宝/微信二维码 + 轮询到账,统一走共用 PayQrModal)
  const [payModal, setPayModal] = useState<{
    orderId: string;
    qrContent: string;
    provider: "alipay" | "wechat";
    credits: number;
    bonus: number;
    fen: number;
    discount?: string;
    packId: string;
  } | null>(null);
  // 打开一级弹窗(右上角按钮)
  function openModal(page: ModalRoute["page"]) {
    setModalStack([{ page }]);
  }
  // 弹窗内点链接 → 进下一级(画布内层叠);返回 = 出栈
  const MODAL_ROUTES: Record<string, ModalRoute["page"]> = {
    "/templates": "templates",
    "/plans": "plans",
    "/account": "account",
    "/account/security": "security",
    "/generate": "generate",
  };
  function pushModalHref(href: string): boolean {
    const [path, qs] = href.split("?");
    const route = path.replace(/\/+$/, "") || "/";
    const page = MODAL_ROUTES[route];
    if (!page) return false; // 未知/外部 → 不拦截,照常跳转
    if (!commerceVisible && (page === "plans" || page === "checkout")) {
      return false;
    }
    const params = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
    setModalStack((s) => [...s, { page, params }]);
    return true;
  }
  function modalBack() {
    setModalStack((s) => (s.length > 1 ? s.slice(0, -1) : []));
  }
  // 模板「做同款」→ 关弹窗 + 用模板图在画布里新建一个项目(独立根节点),选中后即可在画布内生成衍生
  async function applyTemplateToCanvas(templateId: string) {
    if (!user || readOnly) return;
    resetImportScope();
    setModalStack([]);
    setBrowsing(false);
    setCreatingNew(true); // 先进空白画布态,避免闪到旧项目;拿到新节点后自动切过去
    setActiveKey(null);
    setSelectedId(null);
    try {
      const res = await fetch(
        `/api/templates?ids=${encodeURIComponent(templateId)}&pageSize=1`,
        { cache: "no-store" }
      );
      const data = await res.json();
      const list = (data.templates ?? []) as Artwork[];
      const tpl =
        list.find((t) => t.id === templateId) ?? (list[0] as Artwork | undefined);
      if (!tpl) return;
      const r = await privateFetchRaw("/api/artworks/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          // 不传 parentId → 独立根节点 → 自成一个新项目(新画布)
          src: {
            image: tpl.image,
            title: tpl.title || (tpl.prompt ? tpl.prompt.slice(0, 16) : "模板"),
            category: tpl.category || "main",
            prompt: tpl.prompt || "",
            style: tpl.style,
            ratio: tpl.ratio,
            resolution: tpl.resolution,
            templateId: tpl.id,
            width: tpl.width,
            height: tpl.height,
          },
        }),
      });
      const d = await expectJsonOk(r, t("canvas.genFail"));
      if (!d?.id) throw new Error(t("canvas.genFail"));
      if (d?.id) pendingNodeRef.current = d.id; // 切到新项目并选中该节点
      const fresh = await mergeWorks(d?.id ? [d.id] : []);
      pushAddUndo(d?.id ?? null, fresh);
    } catch (e) {
      setCreatingNew(false);
      setBrowsing(true);
      flashTip(e instanceof Error ? e.message : t("canvas.genFail"));
    }
  }
  // 扫码支付二维码渲染 + 轮询到账 + 倒计时统一由共用 PayQrModal 处理(见下方 JSX)。
  // 预加载二维码库:进会员弹窗时就把 qrcode chunk 拉好,点开通后秒出码
  useEffect(() => {
    if (modalTop?.page === "plans") void import("qrcode");
  }, [modalTop?.page]);
  // 缩放输入框跟随实际缩放(用户改值后回车应用)
  useEffect(() => {
    setZoomInput(zoomPercentInput(viewport.zoom || 1));
  }, [viewport.zoom]);
  function applyZoomInput() {
    const percent = Number(zoomInput.replace(",", "."));
    if (Number.isFinite(percent) && percent > 0) {
      rfRef.current?.zoomTo(percent / 100, { duration: 200 });
      return;
    }
    setZoomInput(zoomPercentInput(viewport.zoom || 1));
  }
  const canvasHistory = useCanvasHistory({
    account: canvasAccountRef.current, project: activeKey, readOnly,
    works: setWorks, textDocument: canvasTextDocument.history, settings: applyHistorySettings, selectedText: setSelectedTextId,
    flush: videoNodesStore.flush,
    video: videoNodesStore.getNode, refresh: videoNodesStore.refresh,
    pending: applyPendingLinkHistory, applied: onHistoryApplied, warning: flashTip,
  });
  const {undoStack,redoStack,pushUndo,historyBusyRef,historySaving,setHistorySaving,historyCurrent} = canvasHistory;
  const textTasks=useCanvasTextTasks(canvasTextDocument.scope,{
    document:canvasTextDocument,
    submit:(request,submission,scope)=>privateFetch("/api/canvas/text-generate",{method:"POST",headers:{"content-type":"application/json","x-naumi-billing-intent-slot":request.node.id,...(request.operationId?{"x-naumi-billing-operation-id":request.operationId}:{})},body:JSON.stringify(request.payload),submission,isCurrent:scope.viewCurrent}),
    history:node=>canvasHistory.record({...canvasHistory.scope,project:node.projectKey,key:JSON.stringify([canvasHistory.scope.account,canvasHistory.scope.workspace,node.projectKey])},{kind:"text-add",records:[node]}),
    model:setTextModel,errorText:t("canvas.textGenerateFail"),
  });
  const promptMining=textTasks.busy("reverse"),assistBusy=textTasks.busy("assist");
  const canvasNodeOperations=useCanvasNodeOperations(canvasHistory.scope,{
    writable:()=>!!user&&!readOnly,
    snapshot:()=>({artworks:canvasArtworkDocument.getSnapshot().nodes||[],textNodes:canvasTextDocument.getSnapshot().nodes,videoNodes:videoNodesStore.allNodes.filter(node=>!node.deletedAt).map(node=>videoNodesStore.getNode(node.id)||node)}),
    history:canvasHistory,artworks:ids=>canvasArtworkDocument.merge(ids),videos:videoNodesStore.accept,
  });
  const [workflowManifests, setWorkflowManifests] = useState<ImportedManifest[]>([]);
  const workflowCallbacksRef = useRef({ replace: requestReplace, select: selectWorkflowGroup });
  workflowCallbacksRef.current = { replace: requestReplace, select: selectWorkflowGroup };
  useEffect(() => {
    const email = targetEmail || user?.email;
    setWorkflowManifests([]);
    if (!email) return;
    let cancelled = false;
    void privateFetchRaw(`/api/canvas/workflow-import?email=${encodeURIComponent(email)}`).then(response => response.json()).then(data => {
      if (!cancelled && Array.isArray(data.manifests)) setWorkflowManifests(current => Array.from(new Map([...data.manifests, ...current].map(m => [m.operationId, m])).values()));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [targetEmail, user?.email]);
  const workflowPaste = useWorkflowPaste({ email: user?.email, projectKey: creatingNew ? null : activeKey, browsing, readOnly,
    onCommitted: result => {
      const artworks = result.artworks as Artwork[];
      canvasArtworkDocument.accept(artworks);
      canvasTextDocument.accept(result.textNodes);
      setWorkflowManifests(current => [...current.filter(m => m.operationId !== result.operationId), result.manifest]);
      const settings = { ...nodeSettingsRef.current, ...result.settings }; nodeSettingsRef.current = settings; setNodeSettings(settings);
      pushUndo({ kind: "workflow-add", artworks, textNodes: result.textNodes });
      setCreatingNew(false); setActiveKey(result.projectKey); setSelectedId(null); setSelectedTextId(null);
      const missingAssets = artworks.filter(n => n.source === "workflow-placeholder").length;
      flashTip(missingAssets ? `工作流已导入，${missingAssets} 张图片待补齐` : result.missingReferences ? `工作流已导入，${result.missingReferences} 个外部引用未包含在选择中` : "工作流已导入");
      const ids = [...artworks.map(n => n.id), ...result.textNodes.map(n => n.id)];
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => void rfRef.current?.fitView({ nodes: ids.map(id => ({ id })), padding: 0.2, duration: 240, maxZoom: 1 })));
    } });
  // 右键未选节点会先按桌面习惯单选；若用户随后点“加入批量选择”，
  // 仍可恢复右键前的选择集合并把当前节点加入其中。
  const contextSelectionBaseRef = useRef<string[]>([]);
  // 框选多选(React Flow 选中集合)
  const [canvasTool, setCanvasTool] = useState<CanvasPrimaryTool>("move");
  const boxSelectMode = canvasTool === "marquee";
  // 画布默认亮色；仅显式保存 dark 时使用暗色，保留用户本地选择。
  const [lightCanvas, setLightCanvas] = useState(() => {
    if (desktopAppearance) return true;
    try {
      return typeof window === "undefined" || localStorage.getItem("nv:canvas:bg") !== "dark";
    } catch {
      return true;
    }
  });
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
    setNames({});
    if (!ready || !authenticatedEmail) return;
    let cancelled = false;
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
    void privateFetchRaw(`/api/projects?email=${encodeURIComponent(target)}`)
      .then(response=>expectJsonOk(response,"项目名称读取失败"))
      .then(data=>{if(!cancelled)setNames((data?.names??{}) as Record<string,string>);})
      .catch(()=>{});
    return () => {
      cancelled = true;
    };
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

  const { projects } = useMemo(() => {
    const arts = (works ?? []).filter(
      (a) => a.status === "completed" && a.origin!=="workbench" && (hasRenderableImage(a.image) || Boolean(a.videoUrl))
    );
    const byId = new Map(arts.map((a) => [a.id, a]));
    const groups = new Map<string, Artwork[]>();
    const resolveRoot = createProjectRootResolver(byId);
    for (const a of arts) {
      const k = projectKey(a, byId, resolveRoot);
      const arr = groups.get(k) ?? [];
      arr.push(a);
      groups.set(k, arr);
    }
    // 画布只是"高级工作台":单一作品库不分家,但项目列表只展示真正在画布作业过的项目 ——
    //   · 套图批次(本来就是一组)
    //   · 多节点血缘树(用户在画布上迭代/衍生过)
    //   · 含"显式加入画布"的节点(上传/复制/历史/拉线衍生 = source∈下表)
    //   · 用户重命名过的(说明在意它)
    // 那些从没在画布动过的、孤张一次性生图(生图页/套图页直接产出的单图)不在画布出现,
    // 它们仍在作品库/生图页可见。轻度用户因此基本不会看到画布。
    const CANVAS_SOURCES = new Set(["canvas-add", "derived", "upload"]);
    const imageProjects: Project[] = Array.from(groups.entries())
      .map(([key, members]) => {
        members.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        const latest = members[members.length - 1];
        const root =
          members.find((m) => !(m.parentId && byId.has(m.parentId))) ??
          members[0];
        const isSuite = key.startsWith("batch:");
        const defaultName = isSuite ? t("canvas.suiteProject") : root.title;
        return {
          key,
          members,
          textNodes: [],
          isSuite,
          cover: latest.image,
          count: members.length,
          name: names[key] ?? defaultName,
          latestAt: latest.createdAt,
        };
      })
      .filter(
        (p) =>
          // 管理员只读查看用户作品时不过滤:让单张一次性生图也能进画布(否则深链找不到→空白)
          readOnly ||
          p.isSuite ||
          p.members.length > 1 && !p.members.every(member=>member.origin==="workbench") ||
          p.members.some((m) => m.source && CANVAS_SOURCES.has(m.source)) ||
          p.members.some((m) => m.origin === "canvas") ||
          p.members.some((m) => m.marked) ||
          names[p.key] != null ||
          // ?node= 深链进来的那张(如抠图「送画布」):即使单张也放行,否则落到空列表
          (pinnedNode != null && p.members.some((m) => m.id === pinnedNode))
      );
    const projectMap = new Map(imageProjects.map((project) => [project.key, project]));
    for (const textNode of textNodes) {
      const existing = projectMap.get(textNode.projectKey);
      if (existing) {
        existing.textNodes.push(textNode);
        existing.count = existing.members.length + existing.textNodes.length;
        if (textNode.updatedAt > existing.latestAt) existing.latestAt = textNode.updatedAt;
        continue;
      }
      projectMap.set(textNode.projectKey, {
        key: textNode.projectKey,
        members: [],
        textNodes: [textNode],
        isSuite: false,
        cover: "",
        count: 1,
        name: names[textNode.projectKey] ?? textNode.title ?? t("canvas.textProject"),
        latestAt: textNode.updatedAt || textNode.createdAt,
      });
    }
    for(const videoNode of videoNodesStore.nodes){
      const existing=projectMap.get(videoNode.projectKey);
      if(existing){existing.videoNodes=[...(existing.videoNodes||[]),videoNode];existing.count++;if(videoNode.updatedAt>existing.latestAt)existing.latestAt=videoNode.updatedAt;}
      else projectMap.set(videoNode.projectKey,{key:videoNode.projectKey,members:[],textNodes:[],videoNodes:[videoNode],isSuite:false,cover:"",count:1,name:names[videoNode.projectKey]||videoNode.title,latestAt:videoNode.updatedAt});
    }
    const projects = Array.from(projectMap.values());
    projects.sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
    return { projects };
  }, [works, names, t, readOnly, pinnedNode, textNodes,videoNodesStore.nodes]);

  const projectMonths = useMemo(() => {
    const language =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : "zh-CN";
    const formatter = new Intl.DateTimeFormat(language, {
      year: "numeric",
      month: "long",
    });
    const sections = new Map<string, { label: string; projects: Project[] }>();
    for (const project of projects) {
      const date = new Date(project.latestAt);
      const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
      const key = `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, "0")}`;
      const section = sections.get(key) ?? {
        label: formatter.format(safeDate),
        projects: [],
      };
      section.projects.push(project);
      sections.set(key, section);
    }
    return Array.from(sections.entries()).map(([key, section]) => ({
      key,
      ...section,
    }));
  }, [projects]);

  // 打开中的项目消失了(被删 / 根节点变化导致 key 变)→ 回到项目网格,而非自动弹别的项目
  useEffect(() => {
    if (creatingNew || browsing) return;
    if (works === null) return; // 数据还没加载完别误判(否则刷新恢复会被踢回网格)
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
  }, [projects, activeKey, creatingNew, browsing, works, setSelectedId]);

  // ?node=<作品id>:跳到该图所在项目并选中聚焦(管理员从后台点图进来时)
  useEffect(() => {
    const node = pendingNodeRef.current;
    if (!node || projects.length === 0) return;
    const proj = projects.find((p) => p.members.some((m) => m.id === node)||p.videoNodes?.some(item=>item.id===node)||p.textNodes?.some(item=>item.id===node));
    if(!proj&&(!videoNodesStore.ready||!textNodesReady||works===null))return;
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
  }, [projects,videoNodesStore.ready,textNodesReady,works,setSelectedId]);

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
  const previousCanvasContextRef = useRef({ key: activeKey, email: user?.email || "" });
  useEffect(() => {
    activeProjectRef.current = active;
    const next = { key: activeKey, email: user?.email || "" };
    const previous = previousCanvasContextRef.current;
    if (previous.key !== next.key || previous.email !== next.email) {
      previousCanvasContextRef.current = next;
      canvasContextEpochRef.current += 1;
      ocrRequestEpochRef.current += 1;
      setOcrArtworkId(null);
      setOcrSegments([]);
      setOcrStatus("idle");
    }
  }, [active, activeKey, user?.email]);

  // 进入空白画布 = 新建项目;选中/拿到真实项目后自动退出该模式
  function startNewProject() {
    ocrRequestEpochRef.current += 1;
    setOcrArtworkId(null);
    setOcrSegments([]);
    setOcrStatus("idle");
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
    ocrRequestEpochRef.current += 1;
    setOcrArtworkId(null);
    setOcrSegments([]);
    setOcrStatus("idle");
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
    ocrRequestEpochRef.current += 1;
    setOcrArtworkId(null);
    setOcrSegments([]);
    setOcrStatus("idle");
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
    const prev = worksRef.current?.find((art) => art.id === id);
    setWorks((current) => current?.map((art) =>
      art.id === id
        ? { ...art, canvasX: x, canvasY: y, canvasWidth: width, canvasHeight: height }
        : art
    ) ?? current);
    if (!user || readOnly) return;
    void privateFetchRaw("/api/artworks/canvas-size", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, x, y, width, height }),
    });
    // 手动缩放可撤销:从 worksRef 取拖拽前的位置与尺寸记一条 art-size
    if (
      prev &&
      (prev.canvasX !== x ||
        prev.canvasY !== y ||
        prev.canvasWidth !== width ||
        prev.canvasHeight !== height)
    ) {
      pushUndo({
        kind: "art-size",
        id,
        from: {
          x: prev.canvasX ?? x,
          y: prev.canvasY ?? y,
          width: prev.canvasWidth ?? width,
          height: prev.canvasHeight ?? height,
        },
        to: { x, y, width, height },
      });
    }
  }, [user, readOnly, pushUndo, setWorks]);

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
    setWorks((current) => current?.map((art) =>
      art.id === id
        ? { ...art, canvasWidth: nextWidth, canvasHeight: nextHeight }
        : art
    ) ?? current);
    if (!user || readOnly) return;
    void privateFetchRaw("/api/artworks/canvas-size", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, width: nextWidth, height: nextHeight, sizeOnly: true }),
    }).catch(() => {});
  }, [user, readOnly, setWorks]);

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
    videoEdit:openVideoEditor,videoHistory:setVideoHistoryId,
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
  const videoInputChoices:VideoInputChoice[]=useMemo(()=>Array.from(new Map([
    ...(active?.members||[]).filter(art=>art.category!=="media").map(art=>({id:art.id,nodeId:art.id,kind:art.category==="audio"?"audio" as const:art.videoUrl?"video" as const:"image" as const,title:art.title,value:art.videoUrl||art.image,thumbnail:!art.videoUrl?art.image:undefined,available:art.status==="completed"})),
    ...textNodes.filter(node=>node.projectKey===activeKey).map(node=>({id:node.id,nodeId:node.id,kind:"text" as const,title:node.title,value:node.content||node.prompt||" ",available:node.status!=="generating"})),
    ...videoNodesStore.nodes.filter(node=>node.projectKey===activeKey).map(node=>{const task=videoTaskStore.tasks.find(task=>task.id===node.lastTaskId),art=(works||[]).find(art=>art.id===(node.displayResultId||node.lastResultId));return {id:node.id,nodeId:node.id,kind:"video" as const,title:node.title,value:art?.videoUrl||(!node.displayResultId?task?.videoUrl:undefined)||"/media/pending",available:!!(node.displayResultId||node.lastResultId)&&(art?.status==="completed"||!node.displayResultId&&task?.status==="completed")};}),
    ...videoAssetStore.choices,
  ].map(choice=>[choice.nodeId,choice])).values()),[active,activeKey,textNodes,videoNodesStore.nodes,videoTaskStore.tasks,works,videoAssetStore.choices]);
  const videoResultLoads=useRef(new Map<string,number>());
  useEffect(()=>{
    if(!user?.email||!activeKey||readOnly)return;
    const account=canvasAccountRef.current,epoch=canvasContextEpochRef.current,known=new Set((works||[]).map(art=>art.id)),now=Date.now();
    const ids=Array.from(new Set(videoNodesStore.nodes.filter(node=>node.projectKey===activeKey&&!node.deletedAt).map(node=>node.displayResultId||node.lastResultId).filter((id):id is string=>!!id&&!known.has(id)))).filter(id=>{const key=JSON.stringify([account,activeKey,id]),last=videoResultLoads.current.get(key)||0;if(now-last<15000)return false;videoResultLoads.current.set(key,now);return true;});
    if(!ids.length)return;
    void (async()=>{for(let offset=0;offset<ids.length;offset+=100){if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;await mergeWorks(ids.slice(offset,offset+100));}})().catch(()=>{});
  },[user?.email,targetEmail,activeKey,readOnly,works,videoNodesStore.nodes]);
  const selectedVideo=videoNodesStore.nodes.find(node=>node.id===selectedId&&node.projectKey===activeKey&&!node.deletedAt)||null;
  const mixedNativeSelection=multiSel.length>1&&(multiSel.some(id=>videoNodesStore.getNode(id))||multiSel.some(id=>id.startsWith("text-"))&&multiSel.some(id=>!id.startsWith("text-")));
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
            body: JSON.stringify({
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

  // 改字任务由 PostgreSQL + video-worker 持续执行。关闭侧栏、刷新或离开页面后，
  // 再次进入同一项目会恢复占位节点，并在任务完成后把稳定作品合回画布。
  useEffect(() => {
    if (!user || !active || persistMode !== "server") return;
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
          privateFetchRaw(`/api/canvas/image-tasks?limit=500&sourceIds=${encodeURIComponent(chunk.join(","))}`)
        ));
        if (stopped) return;
        if (responses.some((response) => !response.ok)) throw new Error("图片编辑任务查询失败");
        const payloads = await Promise.all(responses.map((response) => readJsonSafe(response)));
        if (stopped) return;
        const currentProject = activeProjectRef.current;
        if (!currentProject || currentProject.key !== projectKey) return;
        const tasks = payloads.flatMap((data) => Array.isArray(data?.tasks) ? data.tasks : []) as Array<{
          id: string;
          kind: "text-edit";
          sourceArtworkId: string;
          parameters?: { canvasX?: number; canvasY?: number; newText?: string };
          status: "queued" | "processing" | "needs_attention" | "completed" | "failed";
          progress?: number;
          resultArtworkId?: string;
          error?: string;
        }>;
        const memberIds = new Set(currentProject.members.map((item) => item.id));
        const relevant = tasks.filter((task) => task.kind === "text-edit" && memberIds.has(task.sourceArtworkId));
        if (stopped) return;
        const running = relevant.filter((task) => task.status === "queued" || task.status === "processing");
        const runningIds = new Set(running.map((task) => task.id));
        const terminalIds = new Set(relevant.filter((task) => task.status === "completed" || task.status === "failed" || task.status === "needs_attention").map((task) => task.id));
        setPendNodes((items) => {
          const progressByTask = new Map(running.map((task) => [task.id, Math.max(5, Math.min(95, Number(task.progress || 0)))]));
          const kept = items
            .filter((item) => item.taskKind !== "image-edit" || !item.taskId || !terminalIds.has(item.taskId))
            .map((item) => item.taskKind === "image-edit" && item.taskId && progressByTask.has(item.taskId)
              ? { ...item, progress: progressByTask.get(item.taskId) as number }
              : item);
          const known = new Set(kept.filter((item) => item.taskKind === "image-edit").map((item) => item.taskId).filter(Boolean));
          for (const task of running) {
            if (known.has(task.id)) continue;
            const source = currentProject.members.find((item) => item.id === task.sourceArtworkId);
            const sourceNode = source ? rfRef.current?.getNode(source.id) : null;
            const sourceSize = sourceNode && source ? flowNodeSize(sourceNode) : source ? artworkNodeSize(source) : { width: NODE_W, height: NODE_H };
            const x = task.parameters?.canvasX == null ? Number.NaN : Number(task.parameters.canvasX);
            const y = task.parameters?.canvasY == null ? Number.NaN : Number(task.parameters.canvasY);
            kept.push({
              id: `pend-image-task-${task.id}`,
              taskId: task.id,
              taskKind: "image-edit",
              x: Number.isFinite(x) ? x : (sourceNode?.position.x ?? source?.canvasX ?? 0) + sourceSize.width + X_GAP,
              y: Number.isFinite(y) ? y : sourceNode?.position.y ?? source?.canvasY ?? 0,
              parentId: task.sourceArtworkId,
              linked: true,
              label: task.parameters?.newText ? `改字结果 · ${String(task.parameters.newText).slice(0, 18)}` : "改字结果生成中",
              uploading: false,
              progress: Math.max(5, Math.min(95, Number(task.progress || 0))),
              inputs: [task.sourceArtworkId],
              generating: true,
            });
          }
          return kept;
        });

        for (const task of relevant) {
          if (
            task.status === "completed" &&
            task.resultArtworkId &&
            !memberIds.has(task.resultArtworkId) &&
            !settledCanvasImageTaskRef.current.has(task.id)
          ) {
            if (stopped) return;
            const x = task.parameters?.canvasX == null ? Number.NaN : Number(task.parameters.canvasX);
            const y = task.parameters?.canvasY == null ? Number.NaN : Number(task.parameters.canvasY);
            if (Number.isFinite(x) && Number.isFinite(y)) {
              const positionResponse = await privateFetchRaw("/api/artworks/position", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id: task.resultArtworkId, x: Math.round(x), y: Math.round(y) }),
              });
              if (stopped) return;
              if (!positionResponse.ok) throw new Error("改字结果定位失败");
            }
            if (stopped) return;
            const fresh = await mergeWorks([task.resultArtworkId]);
            if (stopped) return;
            if (!fresh.some((item) => item.id === task.resultArtworkId)) continue;
            settledCanvasImageTaskRef.current.add(task.id);
            pushAddUndo(task.resultArtworkId, fresh);
            await refreshCredits();
            if (stopped) return;
            if (ocrArtworkId === task.sourceArtworkId) {
              const segmentTask = ocrTaskSegmentRef.current.get(task.id);
              if (segmentTask && segmentTask.artworkId === task.sourceArtworkId) {
                setOcrSegments((items) => items.map((item) =>
                  item.id === segmentTask.segmentId
                    ? { ...item, text: segmentTask.newText, editedText: segmentTask.newText }
                    : item
                ));
              }
              setOcrProgress(100);
              setOcrStatus(running.some((item) => item.sourceArtworkId === task.sourceArtworkId) ? "ready" : "done");
            }
            ocrTaskSegmentRef.current.delete(task.id);
            flashTip("文字修改完成，结果已生成在原图右侧");
          }
          if ((task.status === "failed" || task.status === "needs_attention") && !failedCanvasImageTaskRef.current.has(task.id)) {
            failedCanvasImageTaskRef.current.add(task.id);
            if (ocrArtworkId === task.sourceArtworkId) {
              setOcrProgress(0);
              setOcrStatus("error");
              setOcrError(task.error || "在线改字失败，请稍后重试");
            }
            flashTip(task.error || "在线改字失败，请稍后重试");
          }
        }
        if (!stopped) timer = window.setTimeout(sync, runningIds.size ? 3000 : 15000);
      } catch {
        if (!stopped) timer = window.setTimeout(sync, 10000);
      }
    };
    void sync();
    return () => {
      stopped = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [user?.email, active?.key, persistMode, canvasImageTaskRefreshKey, ocrArtworkId]); // eslint-disable-line react-hooks/exhaustive-deps
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
      .filter((id) => id.startsWith("text-"))
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
    try { return { references: canvasGenerationReferences(selected, active?.members ?? []), error: "" }; }
    catch(error) { return { references: selected ? [selected] : [], error: error instanceof Error ? error.message : "参考图尚未同步" }; }
  }, [selected, active?.members]);
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
  useEffect(() => {
    const textarea = textPromptRef.current;
    if (!textarea) return;
    if (textComposerExpanded) {
      textarea.style.height = "100%";
      textarea.style.overflowY = "auto";
      return;
    }
    if (textComposerManuallySized) return;
    // 收起态至少展示约 5 行；短文本不再塌成两行，长文本自适应到 240px 后滚动。
    const minHeight = 112;
    const maxHeight = 240;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(maxHeight, Math.max(minHeight, textarea.scrollHeight))}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [textPrompt, textComposerExpanded, textComposerManuallySized, selectedTextId]);
  useEffect(() => {
    setTextComposerExpanded(false);
    setTextComposerManuallySized(false);
    // 自动带上节点现有内容:方便"看着原文改一改再生成";切换节点时整体替换。
    // 旧逻辑在下方又用 node.prompt 写了一次,会把已有 content 覆盖为空。
    setTextPrompt(selectedText?.content || selectedText?.prompt || "");
    // 切换节点时清掉上一节点手动拖出的固定高度:否则新节点继承"两行小窗",
    // 且 ResizeObserver 会立刻把 manuallySized 重新置真,自适应从此失效。
    if (textComposerDockRef.current?.style.height) {
      textComposerDockRef.current.style.height = "";
    }
  }, [selectedTextId, selectedText?.content, selectedText?.prompt]);
  useEffect(() => {
    const dock = textComposerDockRef.current;
    const body = textComposerBodyRef.current;
    const textarea = textPromptRef.current;
    if (!dock || !body || !textarea) return;
    const syncHeight = () => {
      const manuallySized = !textComposerExpanded && Boolean(dock.style.height);
      if (manuallySized !== textComposerManuallySized) {
        setTextComposerManuallySized(manuallySized);
      }
      if (textComposerExpanded || manuallySized) {
        // 即使用户拖动 Dock 或浏览器恢复了原生 resize 高度，也不允许输入区退回两行。
        textarea.style.height = `${Math.max(112, body.clientHeight)}px`;
        textarea.style.overflowY = "auto";
      }
    };
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(dock);
    observer.observe(body);
    return () => observer.disconnect();
  }, [selectedTextId, textComposerExpanded, textComposerManuallySized]);
  const selectedTextRefs = useMemo(
    () =>
      (selectedText?.sourceIds ?? [])
        .map((id) => active?.members.find((member) => member.id === id))
        .filter(Boolean) as Artwork[],
    [selectedText, active]
  );
  const selectedPendGenerating = !!selectedPend?.generating;
  const selectedGenerationCount =
    generationMode === "split" ? 3 : generationMode === "triptych" ? 1 : genCount;
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
    pendNodes,textNodes,videoNodes:videoNodesStore.nodes,videoTasks:videoTaskStore.tasks,works,selectedId,selectedPendId,selectedTextId,multiSel,expandedTextIds,
    locale,lightCanvas,nodeSettings,nodeSettingsReady,readOnly,cutoutAvailable:!!cutoutCatalog&&!cutoutCatalogError&&cutoutCatalog.available!==false,
    operations:generationOperationRef.current,workflowManifests,actions:sceneActions}),
    [nodes,edges,active,activeKey,generationTasks,pendNodes,textNodes,videoNodesStore.nodes,videoTaskStore.tasks,works,selectedId,selectedPendId,selectedTextId,multiSel,expandedTextIds,
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
    if (exitBoxMode) setCanvasTool("move");
  }

  useEffect(() => {
    setSelectedEdge(null);
    setRfEdges(current => current.map(edge => edge.selected ? { ...edge, selected: false } : edge));
  }, [activeKey, user?.email, setRfEdges, setSelectedEdge]);

  function applyArtworkSelection(ids: string[]) {
    const kinds=new Map<string,"art"|"text"|"video">([
      ...(active?.members||[]).map(node=>[node.id,"art"] as const),
      ...videoNodesStore.nodes.filter(node=>node.projectKey===activeKey).map(node=>[node.id,"video"] as const),
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
    const label=zoomPercentLabel(vp.zoom);
    if(zoomLabelRef.current)zoomLabelRef.current.textContent=label;
    zoomButtonRef.current?.setAttribute("aria-label",`${t("canvas.toolbar.zoom")} ${label}`);
    if(zoomInputRef.current&&document.activeElement!==zoomInputRef.current)zoomInputRef.current.value=zoomPercentInput(vp.zoom);
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
    const cur = (works ?? []).find((w) => w.id === id);
    if (!cur || cur.title === name) return;
    setWorks((prev) =>
      prev ? prev.map((w) => (w.id === id ? { ...w, title: name } : w)) : prev
    );
    try {
      const res = await privateFetchRaw("/api/artworks/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email, id, title: name }),
      });
      await expectJsonOk(res, t("canvas.genFail"));
      pushUndo({ kind: "rename", id, from: cur.title, to: name });
    } catch (e) {
      setWorks((prev) =>
        prev ? prev.map((w) => (w.id === id ? { ...w, title: cur.title } : w)) : prev
      );
      flashTip(e instanceof Error ? e.message : t("canvas.genFail"));
    }
  }

  async function renameGeneratedArtwork(id: string, title: string) {
    if (!user || !title.trim()) return;
    setWorks((current) =>
      current?.map((work) =>
        work.id === id ? { ...work, title: title.trim() } : work
      ) ?? current
    );
    await privateFetchRaw("/api/artworks/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, id, title: title.trim() }),
    }).catch(() => {});
  }

  async function toggleNodeMark() {
    if (!selected || !user || readOnly) return;
    const id = selected.id;
    const previous = !!selected.marked;
    const marked = !previous;
    setWorks((items) =>
      items?.map((item) => (item.id === id ? { ...item, marked } : item)) ?? items
    );
    try {
      const response = await privateFetchRaw("/api/artworks/mark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, marked }),
      });
      await expectJsonOk(response, t("canvas.genFail"));
      pushUndo({
        kind: "mark",
        changes: [{ id, from: previous, to: marked }],
      });
      flashTip(t(marked ? "canvas.dockMarkedTip" : "canvas.dockUnmarkedTip"));
    } catch (error) {
      setWorks((items) =>
        items?.map((item) =>
          item.id === id ? { ...item, marked: previous } : item
        ) ?? items
      );
      flashTip(error instanceof Error ? error.message : t("canvas.genFail"));
    }
  }

  async function saveRename(key: string) {
    const name = renameValue.trim();
    setRenamingKey(null);
    if (readOnly || !name || !user) return;
    const previous = names[key];
    setNames((prev) => ({ ...prev, [key]: name }));
    try {
      const res = await privateFetchRaw("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email, key, name }),
      });
      await expectJsonOk(res, t("canvas.genFail"));
    } catch (e) {
      setNames((prev) => {
        const next = { ...prev };
        if (previous) next[key] = previous;
        else delete next[key];
        return next;
      });
      flashTip(e instanceof Error ? e.message : t("canvas.genFail"));
    }
  }

  // Prompt/ratio are synchronously node-scoped drafts. Only ephemeral dock UI
  // resets on selection; never overwrite unsent text with artwork metadata.
  useEffect(() => {
    setGenStyle(selected?.style || GENERATION_STYLES[0]);
    // Blank-node creation/workflows set their mode explicitly in the event.
    if (selected?.id) setGenerationMode("standard");
    setRatioMenuOpen(false);
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

  useEffect(() => {
    setTextReferenceMenuOpen(false);
  }, [selectedText?.id]);

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
    if (readOnly || !user) return [];
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
    const taskPosition = reserveGenerationPosition(taskId, preferredPosition, previewSize, retryPosition);
    setGenerationTasks((current) => [
      ...current.filter(task => !(task.operationKey === operationKey && task.failure)),
      {
        id: taskId,
        operationKey,
        sourceId: source.id,
        label: opts?.taskLabel || t("canvas.pending"),
        stage: "preparing", startedAt: Date.now(), previewSize, count: requestedCount,
        position: taskPosition,
      },
    ]);
    setGenError(null);
    const requestAccount=canvasAccountRef.current,requestProject=activeProjectRef.current?.key||null,requestEpoch=canvasContextEpochRef.current;
    const scope=captureCanvasImageTaskScope(user.email,requestProject,()=>batchRunMountedRef.current&&requestAccount===canvasAccountRef.current&&requestProject===(activeProjectRef.current?.key||null)&&requestEpoch===canvasContextEpochRef.current&&(opts?.isCurrent?.()??true));
    const task=createCanvasImageTask({scope,
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

  // 面板「生成」:用编辑框提示词 + 参数 + 追加参考图(留空=按这张图再生成一张)
  async function generateChild() {
    if (!selected) return;
    if (dockReferenceState.error) { setGenError(dockReferenceState.error); return; }
    if (referenceError) { setGenError(referenceError); return; }
    if (visibleDockRefs.length + extraFiles.length > MAX_TOTAL_IMAGES) { setGenError(`一次最多使用 ${MAX_TOTAL_IMAGES} 张图片，请移除多余引用`); return; }
    if (generationMode === "detail") {
      const references = visibleDockRefs.length ? visibleDockRefs : [selected];
      await generateDetailSequence(selected, references, editPrompt.trim(), extraFiles, undefined, composerReferences);
      return;
    }
    if (generationMode === "triptych") {
      const feedback = editPrompt.trim();
      const result = await runGen(
        selected,
        `${VIEW_CONSISTENCY_RULES} 在同一张横向画布中制作正面、侧面、背面三个等宽分区，按从左到右顺序排列并完整露出；三个分区中的产品必须是同一件产品，背景与尺度统一。${
          feedback ? ` 用户补充要求：${feedback}` : ""
        }`,
        {
          ratio: "16:9",
          style: genStyle,
          count: 1,
          resolution: genResolution,
          parentId: selected.id,
          refUrls: [selected.image],
          referenceInputs: composerReferences,
          taskLabel: "三视图合成中…",
          userPrompt: feedback || "生成正侧背三视图",
        }
      );
      if (result[0]) await renameGeneratedArtwork(result[0].id, "正侧背三视图");
      return;
    }
    if (generationMode === "split") {
      if(!composerReferences.length){setGenError("请先选择一张编辑目标，再生成三视图");return;}
      if(composerReferences.length>=MAX_TOTAL_IMAGES){setGenError("分图需要为生成的正面锚点预留一张参考图位置");return;}
      await generateSplitViews(selected, editPrompt.trim(), composerReferences);
      return;
    }
    const text =
      editPrompt.trim() || inheritableImagePrompt(selected.prompt) || FAITHFUL_REGEN_PROMPT;
    // 新图 = 选中节点的子节点(落在它下方,血缘父=选中节点)。
    // 参考图 = dock 里可见的全部引用图(用户所见即所用,多图全送、不丢图)。
    // 若用户在 dock 删掉了自动引用图、改上传了自己的图:用上传图作参考。
    const useUploadAsBase = visibleDockRefs.length === 0 && extraFiles.length > 0;
    await runGen(selected, text, {
      ratio: genRatio,
      style: genStyle,
      count: genCount,
      resolution: genResolution,
      parentId: selected.id,
      parentIds: visibleDockRefs.filter(ref => ref.id !== selected.id).map(ref => ref.id),
      baseFile: useUploadAsBase ? extraFiles[0] : undefined,
      extra: useUploadAsBase ? extraFiles.slice(1) : extraFiles,
      refUrls: useUploadAsBase ? [] : visibleDockRefs.map((r) => r.image),
      userPrompt: editPrompt.trim(),
      referenceInputs: composerReferences,
    });
  }

  async function openImageTextEditor(artwork: Artwork) {
    if (readOnly || !user) return;
    assistantController.current?.abort();
    assistantController.current = null;
    setPropertiesOpen(false);
    const requestEpoch = ocrRequestEpochRef.current + 1;
    ocrRequestEpochRef.current = requestEpoch;
    suspendAssistant(); // 与画布助手面板互斥，不覆盖用户显隐偏好
    setOcrArtworkId(artwork.id);
    setOcrSegments([]);
    setOcrEngine("");
    setOcrError(null);
    setOcrImageSize(null);
    setOcrFocusedId(null);
    setOcrStatus("scanning");
    setOcrProgress(12);
    const progressTimer = window.setInterval(() => {
      setOcrProgress((current) =>
        current >= 88
          ? current
          : Math.min(88, current + Math.max(2, Math.round((92 - current) / 8)))
      );
    }, 650);
    try {
      const response = await privateFetch("/api/canvas/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artworkId: artwork.id }),
      });
      const data = await readJsonSafe(response);
      if (requestEpoch !== ocrRequestEpochRef.current) return;
      if (!response.ok) throw new Error(data?.error || "图片文字识别失败");
      const segments = ((data?.segments ?? []) as Array<{
        id?: string;
        text?: string;
        confidence?: number;
        box?: OcrBox;
      }>).map((segment, index) => ({
        id: segment.id || `ocr-${index + 1}`,
        text: String(segment.text || ""),
        editedText: String(segment.text || ""),
        confidence: Number(segment.confidence || 0),
        box: segment.box as OcrBox,
      })).filter((segment) => segment.text && segment.box);
      if (!segments.length) {
        throw new Error("未识别到可编辑文字，请换一张更清晰的图片重试");
      }
      setOcrSegments(segments);
      setOcrEngine(String(data?.engine || "ocr"));
      const imageWidth = Number(data?.image?.width || 0);
      const imageHeight = Number(data?.image?.height || 0);
      setOcrImageSize(imageWidth > 0 && imageHeight > 0 ? { width: imageWidth, height: imageHeight } : null);
      setOcrFocusedId(segments[0]?.id || null);
      setOcrProgress(100);
      setOcrStatus("ready");
    } catch (error) {
      if (requestEpoch !== ocrRequestEpochRef.current) return;
      setOcrError(error instanceof Error ? error.message : "图片文字识别失败");
      setOcrStatus("error");
      setOcrProgress(0);
    } finally {
      window.clearInterval(progressTimer);
    }
  }

  async function applyOcrSegment(segment: OcrSegment) {
    if (readOnly || !user || !ocrArtworkId || ocrApplyLockRef.current) return;
    const requestEpoch = ocrRequestEpochRef.current;
    const sourceArtworkId = ocrArtworkId;
    const source = active?.members.find((artwork) => artwork.id === ocrArtworkId);
    if (!source) return;
    const nextText = segment.editedText.trim();
    if (!nextText || nextText === segment.text) {
      setOcrError(nextText ? "请先修改文字内容" : "新文字不能为空");
      return;
    }
    const sourceNode = rfRef.current?.getNode(source.id);
    const sourceSize = sourceNode ? flowNodeSize(sourceNode) : artworkNodeSize(source);
    const x = (sourceNode?.position.x ?? source.canvasX ?? 0) + sourceSize.width + X_GAP;
    const y = sourceNode?.position.y ?? source.canvasY ?? 0;
    const operationId = browserRandomUUID();
    const pendingId = `pend-text-edit-${operationId}`;
    const pending: Pend = {
      id: pendingId,
      taskKind: "image-edit",
      x,
      y,
      parentId: source.id,
      linked: true,
      label: `改字结果 · ${nextText}`,
      uploading: false,
      progress: 8,
      inputs: [source.id],
      generating: true,
    };
    setPendNodes((current) => [...current, pending]);
    ocrApplyLockRef.current = true;
    setOcrApplyingId(segment.id);
    setOcrStatus("applying");
    setOcrError(null);
    setOcrProgress(8);
    try {
      const response = await privateFetch("/api/canvas/image-tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "text-edit",
          quality: genQuality,
          artworkId: source.id,
          oldText: segment.text,
          newText: nextText,
          box: segment.box,
          canvasX: Math.round(x),
          canvasY: Math.round(y),
          operationId,
        }),
      });
      const data = await readJsonSafe(response);
      const taskId = String(data?.taskId || "");
      if (!response.ok || !taskId) throw new Error(data?.error || "在线改字任务创建失败");
      setPendNodes((items) => items.map((item) =>
        item.id === pendingId
          ? { ...item, taskId, taskKind: "image-edit" }
          : item
      ));
      ocrTaskSegmentRef.current.set(taskId, {
        artworkId: sourceArtworkId,
        segmentId: segment.id,
        oldText: segment.text,
        newText: nextText,
      });
      setCanvasImageTaskRefreshKey((value) => value + 1);
      if (requestEpoch === ocrRequestEpochRef.current) {
        setOcrProgress(0);
        setOcrStatus("ready");
      }
      flashTip("改字任务已进入后台，可关闭面板继续其他工作");
    } catch (error) {
      setPendNodes((items) => items.filter((item) => item.id !== pendingId));
      if (requestEpoch === ocrRequestEpochRef.current) {
        setOcrError(error instanceof Error ? error.message : "在线改字任务创建失败");
        setOcrStatus("error");
        setOcrProgress(0);
      }
    } finally {
      ocrApplyLockRef.current = false;
      setOcrApplyingId(null);
    }
  }

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
  async function generateVideoDraft(id:string,draft:VideoNodeDraft,quote:PublicQuote|null,onPersisted?: (revision:number)=>void,count=1){
    if(!user||readOnly)throw new Error("无法修改此画布");
    let previous=readVideoReceipt(localStorage,user.email,id);
    if(previous){const response=await privateFetchRaw(previous.taskId?`/api/video/tasks?id=${encodeURIComponent(previous.taskId)}`:`/api/video/tasks?idempotencyKey=${encodeURIComponent(previous.idempotencyKey)}`),data=await response.json();
      if(response.ok&&data.task){if(!["completed","failed","cancelled"].includes(data.task.status)){await videoNodesStore.refresh();await videoTaskStore.refresh();throw new Error("上次视频任务仍在执行，设置尚未提交");}clearVideoReceipt(localStorage,user.email,id,previous.idempotencyKey);previous=null;}
      else if(response.status!==404)throw new Error(data.error||"上次视频提交尚未核实");
      else if(previous.expectedRevision!==draft.expectedRevision)throw new Error("上次提交尚未核实，节点已更新，请先查看任务历史");
      else {const current=videoNodesStore.nodes.find(node=>node.id===id);if(!current||JSON.stringify({title:current.title,config:current.config,inputs:current.inputs})!==JSON.stringify({title:draft.title,config:draft.config,inputs:draft.inputs}))throw new Error("上次提交尚未核实，请先恢复原设置或查看任务历史");}
    }
    if(count>1||hasCanvasVideoBatch(localStorage,user.email,id)){
      if(previous)throw new Error("上次单个视频提交尚未核实，请先查看任务历史");
      const account=canvasAccountRef.current,project=activeProjectRef.current?.key;
      try{
        const run=await generateCanvasVideoBatch({email:user.email,nodeId:id,draft,count,quote,storage:localStorage,request:privateFetchRaw,submit:billing.submit,
          save:()=>saveVideoDraft(id,draft),onPersisted:revision=>onPersisted?.(revision),assertCurrent:()=>{if(account!==canvasAccountRef.current||project!==activeProjectRef.current?.key)throw new Error("账号或项目已切换，返回原画布查看批次");}});
        const failures=run.nodes.filter(node=>['blocked','needs_confirmation','needs_attention','cancelled'].includes(node.status));
        if(failures.length)throw new Error(`批次已保留，${failures.length}/${run.nodes.length} 个任务需要处理：${failures[0].error||"请查看视频历史"}`);
      }finally{if(account===canvasAccountRef.current){await Promise.allSettled([videoNodesStore.refresh(),videoTaskStore.refresh(),refreshCredits()]);}}
      return;
    }
    const saved=previous&&previous.expectedRevision===draft.expectedRevision?videoNodesStore.nodes.find(node=>node.id===id):await saveVideoDraft(id,draft);
    if(!saved)throw new Error("视频节点不存在");
    if(!previous)onPersisted?.(saved.revision);
    let receipt=prepareVideoReceipt(localStorage,user.email,saved);
    const generationInit={method:"POST",headers:{"content-type":"application/json","x-naumi-canvas":"1","x-naumi-billing-operation-id":receipt.idempotencyKey},body:JSON.stringify({expectedRevision:receipt.expectedRevision,idempotencyKey:receipt.idempotencyKey})};
    const generationUrl=`/api/canvas/video-nodes/${encodeURIComponent(id)}/generate`;
    const response=saved.config.comfyWorkflowId?await privateFetchRaw(generationUrl,generationInit):await billing.submit(generationUrl,generationInit,quote,actualId=>{receipt={...receipt,idempotencyKey:actualId};saveVideoReceipt(localStorage,user.email,receipt);});
    const data=await readJsonSafe(response);if(!response.ok){if(response.status<500&&!["OPERATION_PENDING","OPERATION_CONFLICT"].includes(data?.code))clearVideoReceipt(localStorage,user.email,id,receipt.idempotencyKey);throw new Error(data?.error||"视频提交失败，请核查任务后重试");}
    saveVideoReceipt(localStorage,user.email,{...receipt,taskId:String(data.taskId)});
    await videoNodesStore.refresh();await videoTaskStore.refresh();await refreshCredits();
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

  /**
   * ComfyUI 工作流执行(BYOC,不扣积分):占位节点 + 假进度 → /api/comfyui/run →
   * 图片产物逐张落到源图右侧(血缘 parentId)→ mergeWorks → 撤销。
   * 与 landEditResult 分开:产物是复数(图/视频),视频由面板直出预览不挂树。
   */
  async function runComfyWorkflow(
    source: Artwork,
    payload: ComfyRunPayload
  ): Promise<ComfyRunResult> {
    if (readOnly || !user) throw new Error("只读画布不能执行工作流");
    const operationKey = `node:${source.id}`;
    if (generationOperationRef.current.has(operationKey)) throw new Error("当前节点已有任务在进行");
    generationOperationRef.current.add(operationKey);
    const sourceNode = rfRef.current?.getNode(source.id);
    const sourceSize = sourceNode ? flowNodeSize(sourceNode) : artworkNodeSize(source);
    const baseX = (sourceNode?.position.x ?? source.canvasX ?? 0) + sourceSize.width + X_GAP;
    const baseY = sourceNode?.position.y ?? source.canvasY ?? 0;
    const pendingId = `pend-comfy-${browserRandomUUID()}`;
    setPendNodes((current) => [
      ...current,
      {
        id: pendingId,
        operationKey,
        x: baseX,
        y: baseY,
        parentId: source.id,
        linked: true,
        label: "工作流结果",
        uploading: false,
        progress: 8,
        inputs: [source.id],
        generating: true,
      },
    ]);

    const timer = window.setInterval(() => {
      setPendNodes((items) =>
        items.map((item) =>
          item.id === pendingId
            ? { ...item, progress: Math.min(92, item.progress + Math.max(1, Math.round((96 - item.progress) / 9))) }
            : item
        )
      );
    }, 1200);
    try {
      const response = await privateFetchRaw("/api/comfyui/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artworkId: source.id, ...payload }),
      });
      const data = await readJsonSafe(response);
      if (!response.ok) throw new Error(data?.error || "工作流执行失败");
      const images = (data.images ?? []) as { id: string }[];
      const livePosition = livePendingPosition(pendingId, {x:baseX,y:baseY});
      for (let i = 0; i < images.length; i++) {
        const x = Math.round(livePosition.x + i * 40);
        const y = Math.round(livePosition.y + i * 40);
        await privateFetchRaw("/api/artworks/position", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: images[i].id, x, y }),
        });
        const fresh = await mergeWorks([images[i].id]);
        pushAddUndo(images[i].id, fresh);
        // 多张结果独立落地，不自动切换选中节点。
      }
      // 视频产物已落成画布节点,同样 merge 挂树(与图片并列)
      const videoArtworkId = String(data.videoArtworkId || "");
      if (videoArtworkId) {
        await privateFetchRaw("/api/artworks/position", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: videoArtworkId,
            x: Math.round(livePosition.x + images.length * 40),
            y: Math.round(livePosition.y + images.length * 40),
          }),
        });
        const freshVideo = await mergeWorks([videoArtworkId]);
        pushAddUndo(videoArtworkId, freshVideo);
      }
      flashTip(
        images.length
          ? `工作流完成，${images.length} 张结果已生成在原图右侧`
          : videoArtworkId
            ? "工作流完成，视频已生成在原图右侧"
            : "工作流完成，视频在面板中预览"
      );
      return { images: data.images, videos: data.videos };
    } catch (error) {
      throw error instanceof Error ? error : new Error("工作流执行失败");
    } finally {
      window.clearInterval(timer);
      setPendNodes((items) => items.filter((item) => item.id !== pendingId));
      generationOperationRef.current.delete(operationKey);
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
    setOcrArtworkId(null); // 与在线改字面板互斥
    discloseAssistant(true);
    if (assistantBusy || assistantArtworkId === artwork.id) return;
    setAssistantArtworkId(artwork.id);
    assistantRetry.current = null;
  }

  async function stopAssistantTask() {
    orbCue({ type: "stop" });
    assistantController.current?.abort();
    const sessionId=assistantLiveSessionId.current||assistantSessionId.current;
    if(sessionId.startsWith("cv-"))await privateFetchRaw("/api/canvas/assistant/control",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"stop",sessionId,projectKey:activeKey||"workspace"})}).catch(()=>null);
  }

  async function restoreAssistantConversation(_anchorId:string,id:string) {
    assistantUploadToken.current=null;setAssistantUploading(false);setAssistantUploadError(null);setAssistantAttachments([]);setAssistantExcludedReferences([]);
    const controller=new AbortController();assistantController.current?.abort();assistantController.current=controller;
    assistantLiveSessionId.current=id;
    setAssistantContinueTurn(null);
    assistantSessionId.current=id;setAssistantSteps([]);setAssistantOutcome("running");setAssistantBusy(true);setAssistantResponding(false);setAssistantActivity({phase:"connecting"});setAssistantInput("");setAssistantError(null);setAssistantContinueTurn(null);assistantRetry.current=null;
    let recalled = false;
    try{
      for(;;){
        const response=await privateFetchRaw(`/api/canvas/assistant?projectKey=${encodeURIComponent(activeKey||"workspace")}&id=${encodeURIComponent(id)}`,{signal:controller.signal});
        const data=await expectJsonOk(response,"历史对话读取失败");
        if(controller.signal.aborted||assistantController.current!==controller)return;
        setAssistantActivity({phase:"processing",lastEventAt:Date.now()});
        setAssistantArtworkId(data.session.anchorId||null);setSelectedId(data.session.anchorId||null);setSelectedTextId(null);
        if(Array.isArray(data.session.referenceIds)){
          const restored=await mergeWorks(data.session.referenceIds);
          if(controller.signal.aborted||assistantController.current!==controller)return;
          setAssistantAttachments(data.session.referenceIds.map((refId:string)=>restored.find(art=>art.id===refId)).filter((art:Artwork|undefined):art is Artwork=>!!art));
          setAssistantExcludedReferences(assistantContext(restored,data.session.anchorId||"").filter(art=>!data.session.referenceIds.includes(art.id)).map(art=>art.id));
        }
        setAssistantTurns(restoreAssistantTimeline(data.session.turns, data.session.steps || [], locale === "en"));
        let steps: AgentOrbStep[] = [];
        const historySteps=data.session.steps||[], currentTurn=historySteps.findLastIndex((step:{type:string})=>step.type==="canvas_turn");
        for (const step of historySteps.slice(Math.max(0,currentTurn))) steps = reduceAgentProgress(steps, step, locale === "en", !!data.session.running);
        setAssistantSteps(steps);
        setAssistantOutcome(restoredOrbOutcome(data.session));
        {
          orbCue({ type: "restore", recall: !recalled, running: !!data.session.running, outcome: restoredOrbOutcome(data.session), attention: data.session.attention, phase: agentOrbState(!!data.session.running, restoredOrbOutcome(data.session), steps) });
          recalled = true;
        }
        if(!data.session.running){setAssistantContinueTurn(data.session.continueFromTurnId||null);if(data.session.error)setAssistantError(data.session.error);const ids=data.session.turns.flatMap((turn:AssistantTurn)=>(turn.artifacts||[]).map(art=>art.id));if(ids.length)await mergeWorks(ids);break;}
        await new Promise(resolve=>window.setTimeout(resolve,1000));
      }
    }catch(error){if(assistantController.current===controller){orbCue(controller.signal.aborted?{type:"stop"}:{type:"failure",code:classifyAgentFailure(error).code});setAssistantOutcome(controller.signal.aborted?"stopped":"error");setAssistantError(controller.signal.aborted?"已停止跟随任务，请在历史中核对已有结果":error instanceof Error?error.message:"历史对话读取失败");}}
    finally{if(assistantController.current===controller){assistantController.current=null;setAssistantBusy(false);}}
  }

  function closeAssistant() {
    discloseAssistant(false);
  }

  function toggleAssistant() {
    if (assistantVisible) { closeAssistant(); return; }
    setPropertiesOpen(false);
    setOcrArtworkId(null);
    discloseAssistant(true);
    if (selected && !assistantBusy && selected.id !== assistantArtworkId) openAssistant(selected);
  }

  // 图片是可选上下文，换图不清空对话或改变项目会话身份。
  useEffect(() => {
    if (assistantOpen && !assistantBusy && selectedId && selectedId !== assistantArtworkId) {
      setAssistantArtworkId(selectedId);
      assistantRetry.current = null;
    }
  }, [selectedId, assistantArtworkId, assistantOpen, assistantBusy]);
  // Project/unmount guards own cancellation; restoring history may change its anchor.

  function currentAssistantReferences() {
    const members=active?.members??[];
    const inherited=assistantArtworkId?assistantContext(members,assistantArtworkId):[];
    return assistantReferences(inherited,assistantAttachments,assistantExcludedReferences);
  }

  async function uploadAssistantImages(files:File[]) {
    // Attachments belong to the next turn; the in-flight request body is already frozen.
    if(assistantUploadToken.current||readOnly||!user||!files.length)return;
    const token={},account=canvasAccountRef.current,project=activeKey,session=assistantSessionId.current;
    const isCurrent=()=>assistantUploadToken.current===token&&account===canvasAccountRef.current&&project===(activeProjectRef.current?.key??null)&&session===assistantSessionId.current;
    const capacity=assistantAttachmentCapacity(currentAssistantReferences().map(art=>art.id));
    if(!capacity){setAssistantUploadError(locale==='en'?`Up to ${MAX_ASSISTANT_IMAGES} images. Remove one to add another.`:`最多添加 ${MAX_ASSISTANT_IMAGES} 张图片，请先移除一张再添加。`);return;}
    assistantUploadToken.current=token;setAssistantUploading(true);setAssistantUploadError(null);assistantRetry.current=null;
    try{
      const ids=await uploadRoot(files.slice(0,capacity),{assistant:true,isCurrent});
      if(!isCurrent())return;
      const fresh=await mergeWorks(ids);
      if(!isCurrent())return;
      const added=ids.map(id=>fresh.find(art=>art.id===id)).filter((art):art is Artwork=>!!art);
      setAssistantAttachments(current=>assistantReferences([], [...current,...added]));
      const errors=[];
      if(ids.length<Math.min(files.length,capacity))errors.push(locale==='en'?'Some images failed to upload. Your existing images are kept.':'部分图片添加失败，已有图片已保留，请查看上传结果后重试。');
      if(added.length<ids.length)errors.push(locale==='en'?'Images saved; refresh the canvas to select them.':'图片已保存，列表读取未完成，请刷新画布后选择。');
      if(files.length>capacity)errors.push(locale==='en'?`Up to ${MAX_ASSISTANT_IMAGES} images; extra files were not uploaded.`:`最多添加 ${MAX_ASSISTANT_IMAGES} 张图片，超出的文件未上传。`);
      setAssistantUploadError(errors.join(' ')||null);
    }catch(error){if(isCurrent())setAssistantUploadError(error instanceof Error?error.message:'图片添加失败，已有图片已保留');}
    finally{if(assistantUploadToken.current===token){assistantUploadToken.current=null;setAssistantUploading(false);}}
  }

  async function sendAssistantMessage(continueText = false) {
    const continueFromTurnId = continueText ? assistantContinueTurn : null;
    if (continueText && !continueFromTurnId) return;
    const text = continueText ? "继续输出" : assistantInput.trim();
    if (assistantBusy || assistantUploadToken.current || !text) return;
    const references=currentAssistantReferences();
    const source = references[0];
    const anchorId=source?.id||"";
    const referencesKey=JSON.stringify(references.map(art=>art.id));
    const previousAttempt = assistantRetry.current;
    const reuseAttempt=!continueText&&previousAttempt?.input===text&&previousAttempt.anchorId===anchorId&&previousAttempt.referencesKey===referencesKey;
    const history = reuseAttempt ? previousAttempt.history : [
      ...assistantTurns,
      { id: `as-u-${Date.now()}`, role: "user" as const, content: text },
    ];
    const attempt = reuseAttempt ? previousAttempt : {
      input: text, anchorId, referencesKey, history,
      body: JSON.stringify({ mode: "agent", continueText, continueFromTurnId, skill: assistantSkill ? { id: assistantSkill.id, revision: assistantSkill.revision } : null, sessionId: assistantSessionId.current, turnId: browserRandomUUID(), anchorId, videoNodeId:videoNodesStore.getNode(assistantArtworkId||selectedId||"")?.id,textNodeId:textNodes.find(node=>node.id===(assistantArtworkId||selectedId))?.id, projectKey: activeKey||"workspace", contextIds: references.map(artwork=>artwork.id), messages: continueText ? [] : history.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })), imageModelId: chosenFeatureModel("canvas.image") || genModel, ratio: genRatio, resolution: genResolution, quality: genQuality }),
    };
    assistantRetry.current = attempt;
    const epoch = ++assistantRequestEpoch.current;
    setAssistantError(null);
    setAssistantBusy(true);
    setAssistantResponding(false);
    setAssistantActivity({phase:"connecting"});
    setAssistantSteps([]); setAssistantOutcome("running");
    orbCue({ type: "submit" });
    const controller = new AbortController();
    const acceptedSession = assistantSessionId.current;
    assistantLiveSessionId.current=acceptedSession;
    let serverSessionId = acceptedSession;
    assistantController.current = controller;
    let receivedText = "";
    let recoveryTurn: string | null = null;
    setAssistantContinueTurn(null);
    const artifactIds = new Set<string>();
    let videoProjectResult:{key:string;nodeId:string}|undefined;
    const acceptedVideoProject=activeKey;
    let orbFailureCode: string | undefined;
    // Show this turn immediately, including image/session preparation before SSE opens.
    setAssistantTurns([...history,{id:`as-a-${Date.now()}`,role:"assistant",content:""}]);
    setAssistantInput("");
    try {
      const response = await privateFetch("/api/canvas/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: attempt.body,
        signal: controller.signal,
      });
      if (epoch !== assistantRequestEpoch.current) return;
      if(acceptedSession!==assistantSessionId.current||controller.signal.aborted)throw new Error("任务上下文已切换");
      if (!response.ok || !response.body) {
        const data = await readJsonSafe(response);
        orbFailureCode = response.status === 401 || response.status === 403 ? "AUTH" : response.status === 402 ? "CREDITS" : response.status === 400 ? "VALIDATION" : undefined;
        throw new Error(data?.error || "画布助手暂时不可用");
      }
      orbCue({ type: "connected" });
      setAssistantActivity({phase:"processing",lastEventAt:Date.now()});
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let text = "";
      let streamError: string | null = null;
      let completed = false;
      let lastOrbDelta = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (epoch !== assistantRequestEpoch.current) { await reader.cancel(); return; }
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if(acceptedSession!==assistantSessionId.current||controller.signal.aborted)throw new Error("任务上下文已切换");
          const evLine = part.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!evLine || !dataLine) continue;
          const type = evLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
          setAssistantActivity(current=>receiveAssistantActivity(current,type,data,Date.now()));
          if (["delta", "assistant", "tool_start", "tool_end", "attention", "artifacts", "final"].includes(type)) setAssistantTurns(current => updateAssistantTimeline(current, { ...data, type }, locale === "en"));
          if(type==="open"){serverSessionId=String(data.sessionId||acceptedSession);assistantLiveSessionId.current=serverSessionId;}
          if(type==="done" && data.ok===true)completed=true;
          if (type === "attention") {
            setAssistantSteps(current => reduceAgentProgress(current, { ...data, type }, locale === "en"));
            const attention = data.kind === "waiting" || data.kind === "restricted" ? data.kind : undefined;
            if (attention) orbCue({ type: "attention", kind: attention });
            else if (data.kind === "resolved") orbCue({ type: "attention-resolved", tool: String(data.tool || "") });
          }
          if (type === "delta") {
            if (Date.now() - lastOrbDelta > 650) { lastOrbDelta = Date.now(); orbCue({ type: "delta" }); }
            setAssistantResponding(true);
            text += (data.text as string) || "";
            receivedText = text;
            setAssistantTurns((current) => {
              const copy = [...current];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: text };
              return copy;
            });
          } else if (type === "error") {
            if (data.canContinue === true && typeof data.continueFromTurnId === "string") recoveryTurn = data.continueFromTurnId;
            if (typeof data.code === "string") orbFailureCode = data.code;
            streamError = (data.error as string) || (data.message as string) || "画布助手暂时不可用";
          } else if (type === "tool_start" || type === "tool_end") {
            orbCue(type === "tool_start" ? { type: "tool-start", tool: String(data.tool || "") } : { type: "tool-end", error: !!data.isError });
            setAssistantResponding(false);
            setAssistantSteps(current => reduceAgentProgress(current, { ...data, type }, locale === "en"));
          } else if(type==="video_nodes"&&Array.isArray(data.nodes)){
            const nodes=data.nodes as {id:string;projectKey:string}[];
            if(acceptedVideoProject){if(nodes.some(node=>node.projectKey===acceptedVideoProject))await videoNodesStore.refresh();}
            else if(nodes[0])videoProjectResult={key:nodes[0].projectKey,nodeId:nodes[0].id};
          } else if(type==="text_nodes"&&Array.isArray(data.nodes)){
            const ids=new Set((data.nodes as {id:string;projectKey:string}[]).filter(node=>node.projectKey===acceptedVideoProject).map(node=>node.id));
            const account=canvasAccountRef.current,email=targetEmail||user?.email;
            if(ids.size&&email){
              const response=await privateFetchRaw(`/api/canvas/text-nodes?email=${encodeURIComponent(email)}`,{signal:controller.signal});
              if(!response.ok)throw new Error("剧本资产已保存，画布文字读取暂不可用");
              const snapshot=await response.json();
              if(account===canvasAccountRef.current&&epoch===assistantRequestEpoch.current&&!controller.signal.aborted){
                const added=((snapshot.nodes||[]) as CanvasTextNode[]).filter(node=>ids.has(node.id)&&node.projectKey===acceptedVideoProject).map(node=>({...node,width:node.width||TEXT_NODE_DEFAULT_W,height:node.height||TEXT_NODE_DEFAULT_H,sourceIds:node.sourceIds||[],targetIds:node.targetIds||[],productIds:node.productIds||[]}));
                canvasTextDocument.accept(added);
              }
            }
          } else if (type === "artifacts" && Array.isArray(data.artifacts)) {
            setAssistantSteps(current => reduceAgentProgress(current, { ...data, type }, locale === "en"));
            const artifacts = data.artifacts as {id:string;image:string;title:string}[];
            artifacts.forEach(art => artifactIds.add(art.id));
            orbCue({ type: "artifacts", count: artifactIds.size });
            setAssistantTurns(current => { const copy = [...current], last = copy[copy.length-1]; if(last) copy[copy.length-1] = {...last, artifacts:Array.from(new Map([...(last.artifacts || []),...artifacts].map(art=>[art.id,art])).values())}; return copy; });
          } else if (type === "final") {
            text = String(data.reply || text);
            setAssistantTurns(current => { const copy = [...current], last = copy[copy.length-1]; if(last) copy[copy.length-1] = {...last,content:text}; return copy; });
          }
        }
      }
      if (streamError) throw new Error(streamError);
      if (!completed) throw new Error("任务连接已中断，请从历史核对执行结果，避免重复生图");
      if (!text.trim()) throw new Error("助手没有返回内容，请重试");
      setAssistantTurns((current) => {
        const copy = [...current];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: text.trim() };
        return copy;
      });
      if (assistantRetry.current === attempt) assistantRetry.current = null;
      assistantSessionId.current = serverSessionId;
      setAssistantOutcome("done");
      orbCue({ type: "done" });
      if(videoProjectResult&&!activeProjectRef.current?.key){await videoNodesStore.refresh();if(epoch===assistantRequestEpoch.current){setCreatingNew(false);setBrowsing(false);setActiveKey(videoProjectResult.key);setSelectedId(videoProjectResult.nodeId);}}
    } catch (error) {
      if (epoch !== assistantRequestEpoch.current) return;
      if(acceptedSession!==assistantSessionId.current)return;
      if (assistantRetry.current === attempt && !recoveryTurn && !receivedText) setAssistantInput(continueText ? "" : text);
      setAssistantContinueTurn(controller.signal.aborted ? null : recoveryTurn);
      assistantSessionId.current=serverSessionId;
      const failureCode = orbFailureCode || classifyAgentFailure(error).code;
      const aborted = controller.signal.aborted || failureCode === "ABORTED";
      setAssistantOutcome(aborted ? "stopped" : "error");
      orbCue(aborted ? { type: "stop" } : { type: "failure", code: failureCode });
      setAssistantError(controller.signal.aborted ? "任务已停止，可从历史继续。已生成的结果会保留。" : error instanceof Error ? error.message : "画布助手暂时不可用");
    } finally {
      if (artifactIds.size) { const ids = [...artifactIds]; const fresh = await mergeWorks(ids); pushAddUndoMany(ids,fresh); }
      if (assistantController.current === controller) { assistantController.current = null; setAssistantBusy(false); }
    }
  }

  // 助手回复里的 [[GEN]] 提示词 → 复用 runGen 管线(占位节点/撤销/计费)生成子节点
  function genFromAssistant(prompt: string) {
    const source = assistantArtworkId
      ? active?.members.find((artwork) => artwork.id === assistantArtworkId)
      : null;
    const text = prompt.trim();
    if (!source || !text) return;
    void runGen(source, text, {
      count: 1,
      parentId: source.id,
      refUrls: [source.image],
      taskLabel: "助手生成中…",
      userPrompt: "画布助手生成",
    });
  }

  // 展示层保留原始 Markdown 和已有生图入口，不修改 Agent 执行或历史数据。
  async function copyAssistantText(content: string) {
    const session = assistantSessionId.current, epoch = assistantRequestEpoch.current;
    const ok = await copyText(content);
    if (ok && session === assistantSessionId.current && epoch === assistantRequestEpoch.current) orbCue({ type: "copied" });
    return ok;
  }
  function renderAssistantContent(content: string) {
    return <AssistantRichText content={content} light={lightCanvas} english={locale === "en"} onCopy={copyAssistantText} onGenerate={genFromAssistant} />;
  }

  async function generateSplitViews(source: Artwork, feedback: string, referenceInputs?: CanvasImageReference[]) {
    const viewSet = `views:${source.id}:${Date.now()}`;
    const front = await runGen(source, viewPrompt("正面", feedback), {
      ratio: genRatio,
      style: genStyle,
      count: 1,
      resolution: genResolution,
      parentId: source.id,
      refUrls: [source.image],
      operationKey: `${viewSet}:front`,
      referenceInputs,
      taskLabel: "生成正面锚点…",
      userPrompt: feedback ? `正面视图：${feedback}` : "生成正面视图",
      taskOffset: 0,
    });
    const anchor = front[0];
    if (!anchor) return;
    await renameGeneratedArtwork(anchor.id, "正面视图");
    const shared = [source.image, anchor.url];
    const anchoredReferences = referenceInputs ? [...referenceInputs, { key: `node:${anchor.id}`, sourceNodeId: anchor.id, title: "正面锚点", url: anchor.url, number: Math.max(0,...referenceInputs.map(ref=>ref.number))+1, role: "reference" as const }] : undefined;
    const [side, back] = await Promise.all([
      runGen(source, viewPrompt("侧面", feedback, true).replace("第二张参考图", "最后一张参考图"), {
        ratio: genRatio,
        style: genStyle,
        count: 1,
        resolution: genResolution,
        parentId: source.id,
        parentIds: [anchor.id],
        refUrls: shared,
        operationKey: `${viewSet}:side`,
        referenceInputs: anchoredReferences,
        taskLabel: "生成侧面视图…",
        userPrompt: feedback ? `侧面视图：${feedback}` : "生成侧面视图",
        taskOffset: 1,
      }),
      runGen(source, viewPrompt("背面", feedback, true).replace("第二张参考图", "最后一张参考图"), {
        ratio: genRatio,
        style: genStyle,
        count: 1,
        resolution: genResolution,
        parentId: source.id,
        parentIds: [anchor.id],
        refUrls: shared,
        operationKey: `${viewSet}:back`,
        referenceInputs: anchoredReferences,
        taskLabel: "生成背面视图…",
        userPrompt: feedback ? `背面视图：${feedback}` : "生成背面视图",
        taskOffset: 2,
      }),
    ]);
    if (side[0]) await renameGeneratedArtwork(side[0].id, "侧面视图");
    if (back[0]) await renameGeneratedArtwork(back[0].id, "背面视图");
    // 三视图完成后保留用户当前选择。
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

  async function retrySelected() {
    if (!selected) return;
    if (dockReferenceState.error || referenceError) { setGenError(dockReferenceState.error || referenceError); return; }
    const feedback = editPrompt.trim();
    const originalPrompt = inheritableImagePrompt(selected.prompt) || FAITHFUL_REGEN_PROMPT;
    const prompt = `${originalPrompt}${
      feedback && feedback !== originalPrompt
        ? `\n本次重做要求：${feedback}`
        : "\n重新生成一个新版本，严格保持产品身份和关键细节。"
    }`;
    const parent = selected.parentId
      ? active?.members.find((item) => item.id === selected.parentId) ?? selected
      : selected;
    const retried = await runGen(parent, prompt, {
      ratio: genRatio,
      style: selected.style || genStyle,
      count: 1,
      resolution: selected.resolution || genResolution,
      parentId: selected.parentId || selected.id,
      parentIds: selected.parentIds ?? [],
      refUrls: [selected.image, ...(parent.id === selected.id ? [] : [parent.image])],
      referenceInputs: composerReferences,
      operationKey: `retry:${selected.id}`,
      taskLabel: "按要求重做中…",
      userPrompt: feedback || inheritableImagePrompt(selected.prompt) || "重做当前图片",
    });
    if (retried[0]) {
      await renameGeneratedArtwork(retried[0].id, `${selected.title} · 重做`);
      // 重做完成不打断当前草稿。
    }
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
      if(activeKey&&!members.some(node=>!ids.includes(node.id))&&!texts.some(node=>node.projectKey===activeKey)&&!videoNodesStore.nodes.some(node=>node.projectKey===activeKey&&!ids.includes(node.id))){
        setActiveKey(null);setCreatingNew(false);setBrowsing(true);
      }
    }catch(error){if(scope.viewCurrent())flashTip(error instanceof Error?error.message:t("canvas.genFail"));}
  }

  // History controller owns request identity, commit, refresh and stacks.
  function applyHistory(act: UndoAct, undo: boolean, initialRevision?: number) {
    return canvasHistory.applyHistory(act,undo,initialRevision);
  }
  function doUndo() { return canvasHistory.doUndo(); }
  function doRedo() { return canvasHistory.doRedo(); }
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
    if(act.kind==="mixed-add"){
      if(undo&&(active?.members.length||0)===act.artworks.length&&(active?.textNodes.length||0)===act.textNodes.length&&(active?.videoNodes?.length||0)===act.videoNodes.length)setCreatingNew(true);
      if(!undo){setCreatingNew(false);setActiveKey(act.projectKey);setBrowsing(false);}
    }
    if(act.kind==="video-add"){
      if(undo&&!active?.members.length&&!active?.textNodes.length&&(active?.videoNodes||[]).every(node=>act.records.some(record=>record.id===node.id)))setCreatingNew(true);
      if(!undo){setCreatingNew(false);setActiveKey(act.records[0]?.projectKey||null);setBrowsing(false);}
    }
    if (act.kind === "workflow-add") {
      // Undoing the first import leaves an editable empty project, so redo stays
      // reachable instead of the project-disappearance effect sending it to the grid.
      if (undo && act.artworks.every(n=>active?.members.some(m=>m.id===n.id)) && (active?.members.length || 0) === act.artworks.length
        && (active?.textNodes.length || 0) === act.textNodes.length) setCreatingNew(true);
      if (!undo) { setCreatingNew(false); setActiveKey(act.textNodes[0]?.projectKey || `tree:${act.artworks[0]?.groupId || act.artworks[0]?.id}`); setBrowsing(false); }
    }
  }

  function openProperties() {
    suspendAssistant();setOcrArtworkId(null);setPropertiesOpen(true);
  }
  async function commitNodeSettings(id: string, to: CanvasNodeSettings) {
    if (!user || readOnly || !nodeSettingsReady || historyBusyRef.current) return false;
    const from=settingsFor(id);
    if(JSON.stringify(from)===JSON.stringify(to))return true;
    historyBusyRef.current=true;setHistorySaving(true);
    try {
      const act: UndoAct = {kind:"node-settings",id,text:id.startsWith("text-"),video:!!videoNodesStore.getNode(id),from,to};
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
    localEditBusyRef.current=true;setLocalEditBusy(true);
    try{
      const fingerprint=JSON.stringify({id:artwork.id,crop,file:file?{name:file.name,size:file.size,lastModified:file.lastModified}:null});
      if(localEditAttempt.current?.fingerprint!==fingerprint)localEditAttempt.current={fingerprint,id:browserRandomUUID()};
      const operationId=localEditAttempt.current!.id;
      let body:BodyInit;let headers:Record<string,string>|undefined;
      if(file){const fd=new FormData();fd.set("image",file);fd.set("id",artwork.id);fd.set("operationId",operationId);body=fd;}
      else{headers={"content-type":"application/json"};body=JSON.stringify({mode:"crop",id:artwork.id,operationId,crop});}
      const filling = artwork.source === "workflow-placeholder" && Boolean(file);
      const response=await privateFetchRaw(filling ? "/api/canvas/workflow-import/asset" : "/api/canvas/local-image-edit",{method:"POST",headers,body,signal:AbortSignal.timeout(60000)});
      const data=await expectJsonOk(response,L("图片编辑失败","Image edit failed"));
      if (filling) {
        const node = data.node as Artwork;
        setWorks(current=>current?.map(item=>item.id===node.id ? node : item) ?? current);
        pushUndo({kind:"workflow-fill",id:node.id,assetOperationId:data.assetOperationId,from:artwork,to:node});
        localEditAttempt.current=null; flashTip("图片已补齐"); return;
      }
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
    if(selectedId&&videoNodesStore.getNode(selectedId)){batchDelete([selectedId]);return;}
    if (selected) await deleteTree(selected.id);
  }

  // 删除整个项目(其全部成员图)
  function deleteProject(p: Project) {
    if (readOnly || !user) return;
    const ids = p.members.map((m) => m.id);
    setConfirmModal({
      title: t("canvas.deleteProjectTitle"),
      message: fmt(t("canvas.deleteProject"), { n: ids.length + p.textNodes.length+(p.videoNodes?.length||0) }),
      confirmLabel: t("canvas.confirmDelete"),
      onConfirm: () => void runProjectDelete(p, ids),
    });
  }
  async function runProjectDelete(p:Project,_ids:string[]) {
    if(!user||readOnly)return;const scope=canvasHistory.scope;setSidebarOpen(false);
    try {
      await canvasNodeOperations.removeProject(p.key);
      if(!scope.documentCurrent())return;
      setNames(previous=>{if(!scope.documentCurrent())return previous;const next={...previous};delete next[p.key];return next;});
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

  async function markBatchSelection() {
    if (!user || readOnly || selectedBatchArts.length < 2) return;
    const marked = !selectedBatchAllMarked;
    try {
      const responses = await Promise.all(
        selectedBatchIds.map((id) =>
          privateFetchRaw("/api/artworks/mark", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, marked }),
          })
        )
      );
      if (responses.some((response) => !response.ok)) throw new Error();
      const ids = new Set(selectedBatchIds);
      // 批量标记可撤销:逐 id 记录原值(部分已标记的节点原值不同)
      pushUndo({
        kind: "mark",
        changes: selectedBatchArts.map((art) => ({
          id: art.id,
          from: !!art.marked,
          to: marked,
        })),
      });
      setWorks((items) =>
        items?.map((item) => (ids.has(item.id) ? { ...item, marked } : item)) ??
        items
      );
      flashTip(
        fmt(t(marked ? "canvas.batchMarked" : "canvas.batchUnmarked"), {
          n: selectedBatchIds.length,
        })
      );
    } catch {
      await refetchWorks().catch(()=>{});
      flashTip(t("canvas.genFail"));
    }
  }

  async function applyCanvasGroupAssignments(
    assignments: Array<{ id: string; canvasGroupId: string | null }>
  ) {
    if (!assignments.length) return assignments;
    const response = await privateFetchRaw("/api/canvas/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignments }),
    });
    const data = await expectJsonOk(response, t("canvas.groupFail"));
    const applied = Array.isArray(data?.assignments)
      ? (data.assignments as Array<{ id: string; canvasGroupId: string | null }>)
      : assignments;
    const groupById = new Map(applied.map((item) => [item.id, item.canvasGroupId]));
    setWorks((current) =>
      current?.map((artwork) =>
        groupById.has(artwork.id)
          ? { ...artwork, canvasGroupId: groupById.get(artwork.id) ?? null }
          : artwork
      ) ?? current
    );
    return applied;
  }

  async function groupBatchSelection() {
    if (!user || readOnly || selectedBatchArts.length < 2) return;
    const before = new Map(
      selectedBatchArts.map((artwork) => [artwork.id, artwork.canvasGroupId ?? null])
    );
    try {
      const response = await privateFetchRaw("/api/canvas/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "group", ids: selectedBatchIds }),
      });
      const data = await expectJsonOk(response, t("canvas.groupFail"));
      const applied = (data.assignments ?? []) as Array<{
        id: string;
        canvasGroupId: string | null;
      }>;
      if (applied.length !== selectedBatchIds.length) throw new Error(t("canvas.groupFail"));
      const groupById = new Map(applied.map((item) => [item.id, item.canvasGroupId]));
      setWorks((current) =>
        current?.map((artwork) =>
          groupById.has(artwork.id)
            ? { ...artwork, canvasGroupId: groupById.get(artwork.id) ?? null }
            : artwork
        ) ?? current
      );
      pushUndo({
        kind: "canvas-group",
        changes: applied.map((item) => ({
          id: item.id,
          from: before.get(item.id) ?? null,
          to: item.canvasGroupId,
        })),
      });
      flashTip(fmt(t("canvas.groupDone"), { n: applied.length }));
    } catch (error) {
      flashTip(error instanceof Error ? error.message : t("canvas.groupFail"));
    }
  }

  async function ungroupBatchSelection() {
    if (!user || readOnly || !active || !selectedBatchCanvasGroupId) return;
    const members = active.members.filter(
      (artwork) => artwork.canvasGroupId === selectedBatchCanvasGroupId
    );
    if (!members.length) return;
    const assignments = members.map((artwork) => ({
      id: artwork.id,
      canvasGroupId: null,
    }));
    try {
      await applyCanvasGroupAssignments(assignments);
      pushUndo({
        kind: "canvas-group",
        changes: members.map((artwork) => ({
          id: artwork.id,
          from: selectedBatchCanvasGroupId,
          to: null,
        })),
      });
      flashTip(fmt(t("canvas.ungroupDone"), { n: members.length }));
    } catch (error) {
      flashTip(error instanceof Error ? error.message : t("canvas.groupFail"));
    }
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
    spawnSourceRef.current = params.nodeId ?? null;
    setLinking(true);
  }
  async function submitCanvasLink(intent:CanvasLinkIntent) {
    if(readOnly||!user)return false;
    const scope=canvasHistory.scope;
    // Drain current drafts before snapshotting link fields. The history owner
    // serializes the command and retains an unknown response's original body.
    try {
      await canvasTextDocument.flush();scope.assertView();
      return await canvasHistory.submit(scope,()=>{
        const memberIds=new Set(active?.members.map(node=>node.id)||[]);
        return compileCanvasLink({
        project:scope.project,artworks:(canvasArtworkDocument.getSnapshot().nodes||[]).filter(node=>memberIds.has(node.id)),texts:canvasTextDocument.getSnapshot().nodes,
        videos:videoNodesStore.nodes.map(node=>videoNodesStore.getNode(node.id)||node),pending:pendNodesRef.current,selected:multiSel,choices:videoInputChoices,
        locked:isNodeLocked,productTitle:t("canvas.productNode"),referenceLimit:t("canvas.textReferenceLimit"),cycleMessage:t("canvas.linkCycle"),productMention:withProductMention,
      },intent);});
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
      if(await submitCanvasLink({...edge,add:false})&&scope.viewCurrent()){
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
      const mobileIds = new Set([...artworkIds, ...textIds,...(active.videoNodes||[]).map(node=>node.id)]);
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
  /**
   * 统一处理画布 paste：系统 image/* 永远优先导入；输入框纯文本交给浏览器；
   * 其余场景只有确认是本画布节点格式时才执行内部节点粘贴。
   */
  function handleCanvasPaste(event: ClipboardEvent) {
    if (event.target instanceof Element && event.target.closest('[data-canvas-hotkeys-blocked="true"], [data-canvas-hotkeys-scope="assistant"]')) return;
    if (
      !ready ||
      !user ||
      readOnly ||
      browsing ||
      loading ||
      canvasShortcutLayerOpen ||
      document.querySelector(CANVAS_MODAL_SELECTOR)
    ) {
      return;
    }
    const data = event.clipboardData;
    if (!data) return;
    if (!isEditableClipboardTarget(event.target)) {
      const box = canvasAreaRef.current?.getBoundingClientRect();
      const point = rfRef.current?.screenToFlowPosition({ x: (box?.left ?? 0) + (box?.width ?? 0) / 2, y: (box?.top ?? 0) + (box?.height ?? 0) / 2 }, { snapToGrid: false }) || { x: 0, y: 0 };
      if (workflowPaste.paste(data.getData("text/html"), point)) { event.preventDefault(); return; }
    }
    const files = clipboardImageFiles(data);
    if (files.length) {
      event.preventDefault();
      const box = canvasAreaRef.current?.getBoundingClientRect();
      const center = rfRef.current?.screenToFlowPosition({
        x: (box?.left ?? 0) + (box?.width ?? 0) / 2,
        y: (box?.top ?? 0) + (box?.height ?? 0) / 2,
      }, { snapToGrid: false }) ?? { x: 0, y: 0 };
      uploadCtxRef.current = {
        parentId: activeRootId(), x: center.x - NODE_W / 2, y: center.y - NODE_H / 2,
      };
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      uploadRoot(transfer.files);
      return;
    }
    if (isEditableClipboardTarget(event.target)) return;
    const nodeId = canvasNodeIdFromClipboard(data);
    const generic=readGenericNodeClip(nodeId||undefined);if(nodeId&&generic){event.preventDefault();void duplicateCanvasNodes(generic.ids);return;}
    const copied = nodeClipRef.current;
    if (!copied) return;
    if (nodeId !== copied.id) return;
    const box = canvasAreaRef.current?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault();
    void pasteNode();
  }
  canvasPasteHandlerRef.current = handleCanvasPaste;

  // Multi-select and native file drops share one import path. Copy the live FileList first.
  function uploadRoot(files: FileList | File[] | null, options?:{assistant:boolean;isCurrent:()=>boolean}):Promise<string[]> {
    const picked = Array.from(files ?? []);
    if (rootUploadRef.current) rootUploadRef.current.value = "";
    if (readOnly || !user || browsing || !picked.length) return Promise.resolve([]);
    const box = canvasAreaRef.current?.getBoundingClientRect();
    const center = rfRef.current?.screenToFlowPosition({
      x: (box?.left ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.top ?? 0) + (box?.height ?? 0) / 2,
    }, { snapToGrid: false }) ?? { x: 0, y: 0 };
    const ctx = (!options?.assistant ? uploadCtxRef.current : null) ?? {
      parentId: activeRootId(), x: center.x - NODE_W / 2, y: center.y - NODE_H / 2,
    };
    if(!options?.assistant)uploadCtxRef.current = null;
    const scope = importScopeRef.current;
    if (ctx.parentId) scope.rootId = ctx.parentId;
    const id = ++importSeqRef.current;
    const email = user.email;
    const uploadAccount = canvasAccountRef.current;
    const failures: { name: string; message: string }[] = [];
    const valid = picked.filter(file => {
      const supported = /^(image\/png|image\/jpeg|image\/webp)$/.test(file.type) ||
        (!file.type && /\.(png|jpe?g|webp)$/i.test(file.name));
      const message = !supported ? t("canvas.importUnsupported") :
        file.size > MAX_UPLOAD ? t("canvas.importTooLarge") :
        file.size === 0 ? t("canvas.importEmpty") : "";
      if (message) failures.push({ name: file.name, message });
      return !message;
    });
    const canvasGroupId = valid.length > 1
      ? `canvas-import-${Date.now()}-${id}`
      : null;
    const columns = Math.min(4, Math.ceil(Math.sqrt(valid.length)));
    const entries = valid.map(file => ({ file, pos: { x: ctx.x, y: ctx.y } }));
    setImageImports(current => [...current.filter(batch => !batch.finished || batch.errors.length > 0), {
      id, owner: email.toLowerCase(), total: picked.length, done: failures.length, success: 0, errors: failures, finished: false,
      phase: "optimizing", originalBytes: valid.reduce((sum, file) => sum + file.size, 0),
      uploadBytes: valid.reduce((sum, file) => sum + file.size, 0), uploadedBytes: 0,
    }]);
    const run = async () => {
      if(options&&!options.isCurrent()){
        setImageImports(current=>current.map(batch=>batch.id===id?{...batch,finished:true,phase:"done"}:batch));
        return [];
      }
      const prepared = await prepareImageUploads(entries.map(entry => entry.file), 1, {preserveOriginal:true});
      // 解码完成后按图片比例生成舒适的画布初始尺寸；原图像素仍单独保存。
      const preparedCanvasSizes = prepared.map((item) =>
        adaptiveCanvasImageSize(item.width, item.height)
      );
      const rowCount = Math.max(1, columns);
      let batchWidth = 0;
      let batchHeight = 0;
      const relative: { x: number; y: number }[] = [];
      for (let start = 0; start < prepared.length; start += rowCount) {
        const row = preparedCanvasSizes.slice(start, start + rowCount);
        let rowX = 0;
        const rowHeight = Math.max(
          ...row.map((item) => item.height + NODE_LABEL_H),
          NODE_H
        );
        row.forEach((item, offset) => {
          relative[start + offset] = { x: rowX, y: batchHeight };
          rowX += item.width + X_GAP;
        });
        batchWidth = Math.max(batchWidth, Math.max(0, rowX - X_GAP));
        batchHeight += rowHeight + Y_GAP;
      }
      batchHeight = Math.max(0, batchHeight - Y_GAP);
      const firstCanvasSize = preparedCanvasSizes[0] ?? { width: NODE_W, height: NODE_H - NODE_LABEL_H };
      const baseX = ctx.x + NODE_W / 2 - firstCanvasSize.width / 2;
      const baseY = ctx.y + NODE_H / 2 - (firstCanvasSize.height + NODE_LABEL_H) / 2;
      const existingRects = [
        ...(importScopeRef.current === scope ? rfRef.current?.getNodes() ?? rfNodes : rfNodes).map((node) => {
          const size = flowNodeSize(node);
          return { x: node.position.x, y: node.position.y, width: size.width, height: size.height };
        }),
        ...scope.rects,
      ];
      // Allocate only the new batch near the requested point. A distant node must
      // never push an upload to the bottom of the entire project.
      const nearby = placeGenerationPreview({ x: baseX, y: baseY },
        { width: batchWidth, height: batchHeight }, existingRects);
      entries.forEach((entry, index) => {
        entry.pos.x = Math.round(nearby.x + relative[index].x);
        entry.pos.y = Math.round(nearby.y + relative[index].y);
      });
      const batchRects = entries.map((entry, index) => ({
        x: entry.pos.x,
        y: entry.pos.y,
        width: preparedCanvasSizes[index]?.width || NODE_W,
        height: (preparedCanvasSizes[index]?.height || NODE_H - NODE_LABEL_H) + NODE_LABEL_H,
        owner: id,
        index,
      }));
      // Queued drops close over an earlier React render, so rfNodes alone cannot see the
      // preceding batch. Keep native-size rectangles in the shared import scope as soon
      // as the batch is laid out, then retain only successfully imported rectangles.
      scope.rects.push(...batchRects);
      const uploadBytes = prepared.reduce((sum, item) => sum + item.uploadBytes, 0);
      const loaded = new Array(prepared.length).fill(0) as number[];
      setImageImports(current => current.map(batch => batch.id === id ? {
        ...batch, phase: "uploading", uploadBytes,
      } : batch));
      const ids: (string | undefined)[] = [];
      const upload = async (index: number) => {
        const { file, pos } = entries[index];
        const selected = prepared[index];
        let error = "";
        try {
          if(options&&!options.isCurrent())throw new Error(locale==='en'?'Conversation changed; upload cancelled.':'对话已切换，已取消尚未开始的上传。');
          if(selected.error)throw new Error(selected.error);
          const fd = new FormData();
          fd.append("email", email);
          fd.append("image", selected.file);
          fd.append("title", file.name);
          if (canvasGroupId) fd.append("canvasGroupId", canvasGroupId);
          if (scope.rootId) fd.append("parentId", scope.rootId);
          fd.append("x", String(pos.x));
          fd.append("y", String(pos.y));
          const d = await uploadFormData<{ id?: string; error?: string }>(
            "/api/artworks/add", fd,
            (sent, total) => {
              loaded[index] = total ? Math.min(selected.uploadBytes, sent / total * selected.uploadBytes) : 0;
              setImageImports(current => current.map(batch => batch.id === id ? {
                ...batch, uploadedBytes: Math.round(loaded.reduce((sum, value) => sum + value, 0)),
              } : batch));
            }, 120_000, options ? () => {if(!options.isCurrent())throw new Error("对话已切换，已取消尚未开始的上传。");} : undefined
          );
          if (!d?.id) throw new Error(d?.error || t("canvas.importFailed"));
          ids[index] = d.id;
          if (!scope.rootId) scope.rootId = d.id;
        } catch (e) {
          error = e instanceof Error ? e.message : t("canvas.importFailed");
        }
        loaded[index] = selected.uploadBytes;
        setImageImports(current => current.map(batch => batch.id === id ? {
          ...batch, done: batch.done + 1, success: batch.success + (error ? 0 : 1),
          errors: error ? [...batch.errors, { name: file.name, message: error }] : batch.errors,
          uploadedBytes: Math.round(loaded.reduce((sum, value) => sum + value, 0)),
        } : batch));
      };
      let next = 0;
      // The first successful image is the project root; a failed first image must not split the batch.
      while (!scope.rootId && next < entries.length) await upload(next++);
      await Promise.all(Array.from({ length: Math.min(2, entries.length - next) }, async () => {
        while (next < entries.length) await upload(next++);
      }));
      const added = ids.filter((value): value is string => !!value);
      scope.rects = scope.rects.filter((rect) => rect.owner !== id || !!ids[rect.index]);
      setImageImports(current => current.map(batch => batch.id === id ? { ...batch, nodeIds: added, phase: "sync" } : batch));
      if (added.length && (!options || options.isCurrent())) {
        // Background uploads must not drag the user back after they switch projects.
        if (importScopeRef.current === scope && !options?.assistant) {
          openPendingNodeWithoutSelectionRef.current = true;
          pendingNodeRef.current = added[0];
        }
        const fresh = await synchronizeCanvasArtworks(added, () => mergeWorks(added), () => canvasAccountRef.current === uploadAccount);
        if (importScopeRef.current === scope) pushAddUndoMany(added, fresh);
      }
      setImageImports(current => current.map(batch => batch.id === id ? {
        ...batch, finished: true, phase: "done", uploadedBytes: batch.uploadBytes, nodeIds: added,
      } : batch));
      return added;
    };
    // Batches stay ordered; after root creation, each batch uses up to two uploads.
    const result = scope.queue.then(run, run).catch(() => {
      setImageImports(current => current.map(batch => batch.id === id ? {
        ...batch, finished: true,
        phase: batch.nodeIds?.length ? "sync" : batch.phase,
        errors: [...batch.errors, { name: t("canvas.importSync"), message: batch.nodeIds?.length ? "图片已保存，画布尚未同步；请点击同步图片，无需重新上传" : t("canvas.importSyncFailed") }],
      } : batch));
      return [];
    });
    scope.queue=result.then(()=>{});
    return result;
  }
  async function retryImportSynchronization(batchId: number) {
    const batch = imageImports.find(item => item.id === batchId);
    if (!batch?.nodeIds?.length || batch.owner !== user?.email.toLowerCase() || readOnly || importResyncRef.current.has(batchId)) return;
    importResyncRef.current.add(batchId);
    const account = canvasAccountRef.current;
    setImageImports(current => current.map(item => item.id === batchId ? { ...item, finished: false } : item));
    try {
      const fresh = await synchronizeCanvasArtworks(batch.nodeIds, () => mergeWorks(batch.nodeIds!), () => canvasAccountRef.current === account);
      pushAddUndoMany(batch.nodeIds, fresh);
      setImageImports(current => current.map(item => item.id === batchId ? { ...item, finished: true, phase: "done", errors: item.errors.filter(error => error.name !== t("canvas.importSync")) } : item));
    } catch {
      setImageImports(current => current.map(item => item.id === batchId ? { ...item, finished: true, phase: "sync" } : item));
    } finally { importResyncRef.current.delete(batchId); }
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
  function createCanvasNode(kind: "text" | "image" | "video", point = centerScreen()) {
    if (readOnly) return;
    setNodeTypeMenu(null);
    if (kind === "text") addTextNodeAtScreen(point.x, point.y);
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
          const results = await runGen(art, inheritableImagePrompt(art.prompt) || FAITHFUL_REGEN_PROMPT, {
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
      text ||
      inputTextNodes
        .map((node) => node.content.trim() || node.prompt.trim())
        .filter(Boolean)
        .join("\n\n") ||
      inheritableImagePrompt(inputArts[0]?.prompt) ||
      FAITHFUL_REGEN_PROMPT;
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

  // 占位节点里选了图片 → 带进度上传 → 完成后移除占位、刷新出真节点
  async function doUploadPend(files: FileList | null) {
    const pendId = pendUploadTargetRef.current;
    pendUploadTargetRef.current = null;
    // 必须先取出 File 再清空 input —— input.value="" 会清空这个"活的"FileList,
    // 若先清空,后面 files[0] 就拿不到文件了(之前上传无反应的根因)。
    const file = files && files.length ? files[0] : null;
    if (pendUploadRef.current) pendUploadRef.current.value = "";
    if (!pendId || !file || !user) return;
    const pend = pendNodes.find((p) => p.id === pendId);
    if (!pend) return;
    const info = `${file.name} · ${Math.round(file.size / 1024)}KB`;
    setPendNodes((prev) =>
      prev.map((p) =>
        p.id === pendId
          ? { ...p, uploading: true, progress: 0, fileInfo: info }
          : p
      )
    );
    const fd = new FormData();
    fd.append("email", user.email);
    fd.append("image", file);
    // 有输入(拉线/连多输入)→挂第一个输入并画线;否则挂当前项目根、独立无线
    if (pend.inputs && pend.inputs.length) {
      fd.append("parentId", pend.inputs[0]);
      fd.append("linked", "1");
    } else {
      const root = activeRootId();
      if (root) fd.append("parentId", root);
    }
    fd.append("x", String(Math.round(pend.x)));
    fd.append("y", String(Math.round(pend.y)));
    try {
      const body = await uploadFormData<{ id?: string; error?: string }>("/api/artworks/add", fd,
        (sent, total) => setPendNodes(prev => prev.map(p => p.id === pendId ? { ...p, progress: total ? sent / total * 100 : 0 } : p)));
      if (!body.id) throw new Error(body.error || t("canvas.genFail"));
      setPendNodes(prev => prev.filter(p => p.id !== pendId));
      setSelectedPendId(cur => cur === pendId ? null : cur);
      pendingNodeRef.current = body.id;
      await mergeWorks([body.id]).then(fresh => pushAddUndo(body.id!, fresh));
    } catch (error) {
      setGenError(error instanceof Error ? error.message : t("canvas.genFail"));
      setPendNodes(prev => prev.map(p => p.id === pendId ? { ...p, uploading: false } : p));
    }
  }
  function showCopyTip() {
    setCopyTip(true);
    setTimeout(() => setCopyTip(false), 1500);
  }
  // 复制图片到系统剪贴板(剪贴板只可靠支持 PNG,非 PNG 先转码;失败退回复制图片链接)
  async function copyImageToClipboard(image: string) {
    try {
      let blob = await readBrowserImage(image);
      if (blob.type !== "image/png") {
        const bmp = await createImageBitmap(blob);
        const c = document.createElement("canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d")?.drawImage(bmp, 0, 0);
        blob = await new Promise<Blob>((resolve) =>
          c.toBlob((b) => resolve(b as Blob), "image/png")
        );
      }
      // 图片写剪贴板仅安全上下文(HTTPS)可用;HTTP 下抛错 → 落到下面复制链接兜底
      if (!navigator.clipboard?.write) throw new Error("no clipboard");
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      showCopyTip();
    } catch {
      // 兜底:复制图片链接(copyText 内含 HTTP execCommand 兜底)
      if (await copyText(cdnUrl(image))) showCopyTip();
    }
  }
  function handleCanvasCopy(event: ClipboardEvent) {
    const generic=genericNodeClipRef.current;
    if(generic&&canvasCopyIntentRef.current===generic.marker&&!isEditableClipboardTarget(event.target)&&event.clipboardData){event.preventDefault();setCanvasNodeClipboardData(event.clipboardData,generic.marker,L("画布节点","Canvas nodes"));canvasCopyIntentRef.current=null;return;}

    const copied = nodeClipRef.current;
    const intendedNodeId = canvasCopyIntentRef.current;
    canvasCopyIntentRef.current = null;
    if (
      !copied ||
      intendedNodeId !== copied.id ||
      selected?.id !== copied.id ||
      isEditableClipboardTarget(event.target)
    ) {
      return;
    }
    const data = event.clipboardData;
    if (!data) return;
    const title = copied.title || t("canvas.imageNode");
    event.preventDefault();
    setCanvasNodeClipboardData(data, copied.id, title);
  }
  canvasCopyHandlerRef.current = handleCanvasCopy;

  async function writeCanvasNodeClipboard(a: Pick<Artwork,"id"|"title">) {
    const title = a.title || t("canvas.imageNode");
    const html = `<span data-naumi-canvas-node="${encodeURIComponent(a.id)}">${escapeClipboardHtml(title)}</span>`;
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([title], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
        return;
      }
    } catch {
      // Safari/HTTP/权限失败时通过同步 copy 事件写入同样的 HTML 标记。
    }
    let wroteMarker = false;
    const onCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      wroteMarker = true;
      event.preventDefault();
      setCanvasNodeClipboardData(event.clipboardData, a.id, title);
    };
    document.addEventListener("copy", onCopy, { capture: true, once: true });
    const copied = document.execCommand("copy");
    if (!wroteMarker) document.removeEventListener("copy", onCopy, true);
    if (!copied && !wroteMarker) await copyText(title);
  }

  function copyNodeToClip(a: Artwork, writeSystemClipboard = false) {
    genericNodeClipRef.current=null;nodeClipRef.current = a;
    setHasClip(true);
    if (writeSystemClipboard) void writeCanvasNodeClipboard(a);
  }
  function copyCanvasSelection(ids:string[]){
    if(!user||!ids.length)return;
    const wanted=Array.from(new Set(ids)).filter(id=>videoNodesStore.getNode(id)||textNodesRef.current.some(node=>node.id===id)||(works||[]).some(node=>node.id===id));if(!wanted.length)return;
    const clip={marker:`clip-${browserRandomUUID()}`,ids:wanted,owner:user.email.toLowerCase()};genericNodeClipRef.current=clip;nodeClipRef.current=null;setHasClip(true);canvasCopyIntentRef.current=clip.marker;
    try{localStorage.setItem(`naumi:canvas-node-clipboard:${user.email.toLowerCase()}`,JSON.stringify(clip));}catch{}
    void writeCanvasNodeClipboard({id:clip.marker,title:L("画布节点","Canvas nodes")});
  }
  function readGenericNodeClip(marker?:string){
    let clip=genericNodeClipRef.current;try{if(!clip&&user)clip=JSON.parse(localStorage.getItem(`naumi:canvas-node-clipboard:${user.email.toLowerCase()}`)||"null");}catch{}
    return clip&&clip.owner===user?.email.toLowerCase()&&typeof clip.marker==="string"&&Array.isArray(clip.ids)&&clip.ids.length>0&&clip.ids.length<=200&&clip.ids.every(id=>typeof id==="string")&&(!marker||clip.marker===marker)?clip:null;
  }
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
  async function pasteNode() {
    if(nodeClipRef.current){await duplicateArt(nodeClipRef.current);return;}
    const clip=readGenericNodeClip();if(clip){await duplicateCanvasNodes(clip.ids);return;}
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
    commit:(moves,scope)=>canvasHistory.submit(scope,()=>compileCanvasMove(moves,id=>{
      const video=videoNodesStore.getNode(id);if(video)return {x:video.x,y:video.y};
      const node=id.startsWith("text-")?canvasTextDocument.getSnapshot().nodes.find(node=>node.id===id):canvasArtworkDocument.getSnapshot().nodes?.find(node=>node.id===id);
      return node&&typeof node.canvasX==="number"&&typeof node.canvasY==="number"?{x:node.canvasX,y:node.canvasY}:undefined;
    })),
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
      modalTop ||
      payModal ||
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
      ratioMenuOpen ||
      nodeTypeMenu ||
      expandOpen ||
        !!videoHistoryId ||
      !!videoMedia ||
      spawnMenu ||
      ctxMenu ||
      addMenuOpen ||
      moreToolsOpen ||
      zoomMenuOpen ||
      sidebarOpen ||
      projMenuKey ||
      textComposerExpanded ||
      textReferenceMenuOpen ||
      mentionState
  );

  // macOS / Windows 共用键盘层：⌘ 或 Ctrl 作为主修饰键；输入框和上层界面不接管系统快捷键。
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el =
        e.target instanceof Element
          ? e.target
          : document.activeElement;
      const tag = el?.tagName;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (
        e.defaultPrevented ||
        e.isComposing ||
        el?.closest('[data-canvas-hotkeys-blocked="true"], [data-canvas-hotkeys-scope="assistant"]') ||
        canvasShortcutLayerOpen ||
        document.querySelector(CANVAS_MODAL_SELECTOR) ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        isEditableClipboardTarget(el)
      ) {
        // A focused modal/menu button is not an editor: Backspace must not invoke
        // WebKit's history navigation even while canvas commands yield to it.
        if (!browsing && key === "backspace" && !e.isComposing && tag !== "SELECT" && !isEditableClipboardTarget(el)) e.preventDefault();
        return;
      }
      if (historyBusyRef.current || cuttingEdgesRef.current.size > 0) {
        // Let unrelated browser shortcuts and viewport actions pass through.
        if ((mod && (key === "z" || key === "y")) || key === "delete" || key === "backspace") { e.preventDefault(); return; }
      }
      if (!mod && !e.altKey && !e.shiftKey && !readOnly && !browsing) {
        if (key === "v") {
          e.preventDefault();
          setCanvasTool("move");
          return;
        }
        if (key === "m") {
          e.preventDefault();
          setCanvasTool("marquee");
          setSelectedId(null);
          setSelectedPendId(null);
          setSelectedTextId(null);
          clearCanvasSelection();
          return;
        }
        if (key === "h") {
          e.preventDefault();
          setCanvasTool("hand");
          return;
        }
      }
      if (
        e.shiftKey &&
        !mod &&
        !e.altKey &&
        e.code === "KeyT" &&
        !readOnly &&
        !browsing
      ) {
        e.preventDefault();
        const c = centerScreen();
        addTextNodeAtScreen(c.x, c.y);
        return;
      }
      if (mod && key === "c") {
        canvasCopyIntentRef.current = null;
        const nativeText=window.getSelection();
        if((multiSel.length>1||selectedTextId||selectedId&&videoNodesStore.getNode(selectedId))&&(!nativeText||nativeText.isCollapsed)){
          copyCanvasSelection(multiSel.length?multiSel:[selectedTextId||selectedId!]);flashTip(t("canvas.copied"));return;
        }
        const nativeSelection = window.getSelection();
        if (!selected || (nativeSelection && !nativeSelection.isCollapsed)) return;
        canvasCopyIntentRef.current = selected.id;
        window.setTimeout(() => {
          if (canvasCopyIntentRef.current === selected.id) {
            canvasCopyIntentRef.current = null;
          }
        }, 1000);
        // Chrome/Playwright and some macOS WebKit paths do not emit a native
        // `copy` event when focus sits on a non-editable video/audio surface.
        // Write the portable node marker explicitly so the following Cmd/Ctrl+V
        // can still verify and paste the selected media node.
        copyNodeToClip(selected, true);
        flashTip(t("canvas.copied"));
        return;
      }
      if (
        mod &&
        key === "v" &&
        (tag === "VIDEO" || tag === "AUDIO") &&
        canvasCopyIntentRef.current &&
        (nodeClipRef.current?.id === canvasCopyIntentRef.current||genericNodeClipRef.current?.marker===canvasCopyIntentRef.current)
      ) {
        // Native media focus can suppress both copy/paste clipboard events.
        // Consume only the short-lived intent created by the immediately
        // preceding canvas copy, so ordinary system clipboard paste is intact.
        e.preventDefault();
        canvasCopyIntentRef.current = null;
        void pasteNode();
        return;
      }
      if (mod && key === "z") {
        if (readOnly) return;
        e.preventDefault();
        if (e.shiftKey) void doRedo();
        else void doUndo();
        return;
      }
      if (mod && key === "y") {
        if (readOnly) return;
        e.preventDefault();
        void doRedo();
        return;
      }
      if (mod && ["+", "=", "add"].includes(key)) {
        e.preventDefault();
        void rfRef.current?.zoomIn({ duration: 160 });
        return;
      }
      if (mod && ["-", "_", "subtract"].includes(key)) {
        e.preventDefault();
        void rfRef.current?.zoomOut({ duration: 160 });
        return;
      }
      if (mod && key === "0") {
        e.preventDefault();
        void rfRef.current?.fitView({ duration: 240, padding: 0.2, maxZoom: 1 });
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // Safari/WebKit can navigate back on Backspace when no editable field owns it.
        // Empty canvas selection must be a no-op, not leave the current project.
        if (!browsing) e.preventDefault();
        if (readOnly || e.repeat) return;
        if (selectedEdge) {
          e.preventDefault();
          void cutEdge(selectedEdge);
          return;
        }
        if (selectedGenerating) return;
        const realSel = multiSel.filter(
          (id) => !id.startsWith("pend-") && !id.startsWith("task-")
        );
        if (realSel.length >= 1) {
          e.preventDefault();
          void runDelete(realSel);
        } else if (selectedId) {
          e.preventDefault();
          void runDelete([selectedId]);
        } else if (selectedTextId) {
          e.preventDefault();
          void removeTextNode(selectedTextId);
        }
        return;
      }
      if (e.key === "Escape" && canvasTool !== "move") {
        e.preventDefault();
        clearCanvasSelection(true);
      }
    }
    // Capture before React Flow/native media surfaces stop bubbling key events.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    readOnly,
    selectedId,
    selectedTextId,
    selectedGenerating,
    multiSel,
    selectedEdge,
    undoStack,
    redoStack,
    canvasTool,
    browsing,
    canvasShortcutLayerOpen,
    nodeSettingsReady,
  ]);

  // Ctrl/⌘ + 滚轮:阻止浏览器整页缩放(画布内由 React Flow 自己缩放)
  useEffect(() => {
    if (!ready || !user) return;
    const el = canvasAreaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ready, user, browsing]);

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

  // dock 里的「比例·分辨率」按钮(对齐参考站图1)。面板用 portal 渲染到 body,
  // 脱离 dock 的 overflow-hidden(否则向上展开的分辨率行会被裁掉)。
  const openRatioMenu = () => {
    setRatioMenuOpen((v) => !v);
  };
  const generationParameters = canvasModelParameters(imageModels.find(m => m.id === genModel)?.generationParameters);
  const activeImageModelLabel =
    imageModels.find((item) => item.id === genModel)?.label || (canvasImageCatalogError ? "模型加载失败" : "模型加载中");
  const modelControl = (disabled = false) => (
    <CanvasModelSelect value={genModel} label={t("canvas.dockModel")} placeholder={activeImageModelLabel}
      disabled={disabled} testId="canvas-generation-model" onChange={pickGenerationModel}
      options={imageModels.map(item => ({ value: item.id, modelId: item.id, label: item.label,
        ...(!item.supportsEdit ? { note: t("canvas.modelTextOnly") } : {}) }))} />
  );

  const ratioControl = (
    <button
      ref={ratioBtnRef}
      type="button"
      onClick={openRatioMenu}
      className="canvas-ui-control flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold transition-colors"
    >
      <Ruler aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span>
        {genRatio === "auto" ? t("canvas.ratioAuto") : genRatio} ·{" "}
        {genResolution}
      </span>
      <ChevronDown
        className={cn(
          "h-3 w-3 text-[#9aa1ae] transition-transform",
          ratioMenuOpen && "rotate-180"
        )}
      />
    </button>
  );
  const ratioMenu =
    ratioMenuOpen
      ? <CanvasParameterPopover anchorRef={ratioBtnRef} light={lightCanvas} onClose={() => setRatioMenuOpen(false)}>
              <p className="canvas-ui-muted mb-2 text-[12px] font-semibold">
                {t("canvas.resolution")}
              </p>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {generationParameters.resolutions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setGenResolution(r)}
                    disabled={!canvasCombinationSupported(generationParameters, genRatio, r)}
                    className={cn(
                      "rounded-xl border py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      genResolution === r
                        ? "canvas-ui-control !border-[#6366f1] font-semibold"
                        : "canvas-ui-control"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="canvas-ui-muted mb-2 text-[12px] font-semibold">
                {t("canvas.ratio")}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {generationParameters.ratios.map(id => CANVAS_RATIOS.find(r => r.id === id) || { id, w: Number(id.split(":")[0]), h: Number(id.split(":")[1]) }).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setGenRatio(r.id)}
                    disabled={!canvasCombinationSupported(generationParameters, r.id, genResolution)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl border py-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      genRatio === r.id
                        ? "canvas-ui-control !border-[#6366f1] font-semibold"
                        : "canvas-ui-control"
                    )}
                  >
                    <RatioIcon w={r.w} h={r.h} />
                    <span className="text-[11px] font-medium leading-none">
                      {r.id === "auto" ? t("canvas.ratioAuto") : r.id}
                    </span>
                  </button>
                ))}
              </div>

          </CanvasParameterPopover>
      : null;

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
      {!readOnly&&<ImagegenPendingRecovery {...recoveryScope} isCurrent={recoveryCurrent} onAttach={async(ids,isMounted)=>{
        const current=()=>recoveryCurrent()&&isMounted();if(!current())return false;
        const fresh=await mergeWorks(ids,current);if(!current())return false;
        assertGenerationResultsPresent(ids,fresh);
        // A queued React updater is not delivery. Observe the committed canvas
        // after one frame; a suspended/stale render retains its original receipt.
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        return current()&&ids.every(id=>worksRef.current?.some(art=>art.id===id&&!!art.image));
      }}/>}
      {(canvasArtworkDocument.error||canvasTextDocument.error) && <div className="fixed top-20 left-1/2 z-[200] flex -translate-x-1/2 flex-col gap-2">
      {canvasArtworkDocument.error && <div role="alert" data-testid="canvas-artwork-load-error" className="flex items-center gap-3 rounded-lg border border-amber-400 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
        <span>{canvasArtworkDocument.error}</span><button className="font-semibold underline" onClick={()=>void canvasArtworkDocument.retry().catch(()=>{})}>重试同步作品</button>
      </div>}
      {canvasTextDocument.error && <div role="alert" data-testid="canvas-text-load-error" className="flex items-center gap-3 rounded-lg border border-amber-400 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
        <span>{canvasTextDocument.error}</span><button className="font-semibold underline" onClick={()=>void canvasTextDocument.load()}>重新加载文字</button>
      </div>}
      </div>}
      {unsavedTextCount>0 && <div role="alert" className="fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-500 bg-background px-4 py-3 text-sm shadow-lg">
        <span>{t("canvas.unsavedChanges")} ({unsavedTextCount})</span>
        <button className="font-semibold underline" onClick={()=>void canvasTextDocument.retry()}>{t("canvas.retrySave")}</button>
      </div>}
      {historySaving && <div className="fixed inset-0 z-[190] cursor-wait" aria-label={t("canvas.savingChanges")}>
        <div role="status" className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-background px-4 py-3 text-sm shadow-lg">{t("canvas.savingChanges")}</div>
      </div>}

      {ratioMenu}
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
        {/* 左上项目下拉:点击外部关闭 */}
        {sidebarOpen && (
          <div
            className="absolute inset-0 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={cn(
            "canvas-ui-surface absolute left-3 top-[108px] z-40 flex max-h-[min(72vh,540px)] w-[min(200px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl border transition-all duration-150 md:top-[60px]",
            lightCanvas ? "canvas-ui-light" : "canvas-ui-dark",
            sidebarOpen
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-1 opacity-0"
          )}
        >
          {/* 项目菜单(对齐原型图3:回到主页/全部项目/创建新项目/重命名/删除项目) */}
          <div className="flex-none border-b border-border p-1.5">
            {/* 全部项目 = 画布的项目网格(不是作品库) */}
            <button
              type="button"
              onClick={backToBrowser}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              {t("canvas.allProjects")}
            </button>
            <Link
              href="/"
              onClick={() => setSidebarOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <Home className="h-4 w-4 text-muted-foreground" />
              {t("canvas.home")}
            </Link>
            {/* 作品库 = 所有生成作品的画廊(/dashboard),与画布项目区分开 */}
            <Link
              href="/dashboard"
              onClick={() => setSidebarOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              {t("nav.dashboard")}
            </Link>
            {/* 回收站:已删除的作品(保留 180 天,可恢复) */}
            {!readOnly && (
              <button
                type="button"
                onClick={openTrash}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                {t("canvas.trash")}
              </button>
            )}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={startNewProject}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
              {t("canvas.newProject")}
            </button>
            {active && !readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    // 关掉下拉,改名统一在左上 pill 内联完成(避免双输入抢焦点)
                    setSidebarOpen(false);
                    setRenamingKey(active.key);
                    setRenameValue(active.name);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  {t("canvas.rename")}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteProject(active)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("canvas.deleteProjectShort")}
                </button>
              </>
            )}
          </div>
        </aside>

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
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("canvas.loading")}
            </div>
          ) : canvasArtworkDocument.phase === "error" && works === null ? (
            <div data-testid="canvas-artwork-unavailable" className="flex h-full items-center justify-center text-sm text-slate-600">作品暂未加载</div>
          ) : browsing ? (
            <div
              data-testid="canvas-project-browser"
              className="h-full overflow-y-auto bg-[#f6f7f9] px-4 py-6 text-[#20242c] sm:px-8 sm:py-8"
            >
              <div className="mx-auto w-full max-w-[1680px]">
                <div className="mb-7 flex items-end justify-between border-b border-[#dfe3e8]">
                  <div className="flex items-center gap-7">
                    <button
                      type="button"
                      onClick={() => setBrowserTab("all")}
                      className={cn(
                        "border-b-2 pb-3 text-[15px] font-semibold transition-colors",
                        browserTab === "all"
                          ? "border-[#20242c] text-[#20242c]"
                          : "border-transparent text-[#7a8492] hover:text-[#20242c]"
                      )}
                    >
                      {t("canvas.allProjects")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrowserTab("workflows")}
                      className={cn(
                        "border-b-2 pb-3 text-[15px] font-semibold transition-colors",
                        browserTab === "workflows"
                          ? "border-[#20242c] text-[#20242c]"
                          : "border-transparent text-[#7a8492] hover:text-[#20242c]"
                      )}
                    >
                      {t("canvas.commonWorkflows")}
                    </button>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={startNewProject}
                      className="mb-2.5 flex h-9 items-center gap-2 bg-[#20242c] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#343a43]"
                    >
                      <Plus className="h-4 w-4" />
                      {t("canvas.newProject")}
                    </button>
                  )}
                </div>

                {projMenuKey && (
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setProjMenuKey(null)}
                  />
                )}

                <section className="mb-10">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-[#20242c]">
                      {t("canvas.commonWorkflows")}
                    </h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {CANVAS_WORKFLOWS.map((workflow) => {
                      const WorkflowIcon = workflow.icon;
                      return (
                        <button
                          key={workflow.key}
                          type="button"
                          onClick={() => startWorkflow(workflow.key)}
                          disabled={readOnly}
                          className="group flex min-h-[108px] items-start gap-4 border border-[#dfe3e8] bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#aeb7c4] hover:shadow-[0_8px_22px_rgba(16,24,40,0.08)] disabled:cursor-default disabled:opacity-60"
                        >
                          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-[#dfe3e8] bg-[#f4f6f8] text-[#46505e] group-hover:border-[#b9c4d2] group-hover:bg-[#edf2f6]">
                            <WorkflowIcon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#20242c]">
                              {t(workflow.titleKey)}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-[#707b89]">
                              {t(workflow.descriptionKey)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {browserTab === "all" && (
                  <section>
                    <h2 className="mb-4 text-base font-semibold text-[#20242c]">
                      {t("canvas.personalProjects")}
                    </h2>

                    {projectMonths.length === 0 && (
                      <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={startNewProject}
                            className="group flex flex-col gap-2 text-left"
                          >
                            <span className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 border border-dashed border-[#bfc7d2] bg-white text-[#697482] transition-colors group-hover:border-[#7f8b9a] group-hover:text-[#20242c]">
                              <Plus className="h-7 w-7" strokeWidth={1.5} />
                              <span className="text-sm font-medium">{t("canvas.startCreate")}</span>
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {projectMonths.map((section, sectionIndex) => (
                      <div key={section.key} className="mb-9">
                        <div className="mb-3 flex items-center gap-3">
                          <h3 className="text-sm font-semibold text-[#596473]">
                            {section.label}
                          </h3>
                          <span className="h-px flex-1 bg-[#e3e6ea]" />
                        </div>
                        <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 min-[1920px]:grid-cols-6">
                          {sectionIndex === 0 && !readOnly && (
                            <button
                              type="button"
                              onClick={startNewProject}
                              className="group flex flex-col gap-2 text-left"
                            >
                              <span className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 border border-dashed border-[#bfc7d2] bg-white text-[#697482] transition-colors group-hover:border-[#7f8b9a] group-hover:text-[#20242c]">
                                <Plus className="h-7 w-7" strokeWidth={1.5} />
                                <span className="text-sm font-medium">{t("canvas.startCreate")}</span>
                              </span>
                            </button>
                          )}

                          {section.projects.map((p) => (
                            <div key={p.key} className="group flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => openProject(p.key)}
                                title={p.name}
                                className="relative aspect-[16/10] w-full overflow-hidden rounded-[12px] border border-[#d8dde4] bg-white transition-all group-hover:border-[#9da8b6] group-hover:shadow-[0_8px_24px_rgba(16,24,40,0.10)]"
                              >
                                {p.cover ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <CachedImage
                                    src={cdnUrl(p.cover)}
                                    alt={p.name}
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-[#f2f4f7] p-5 text-left text-[#525b69]">
                                    <div className="w-full border border-[#dce1e8] bg-white p-3 shadow-sm">
                                      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#7b8491]">
                                        <Type className="h-3.5 w-3.5" /> {t("canvas.textGenerate")}
                                      </div>
                                      <p className="line-clamp-4 whitespace-pre-wrap text-[10px] leading-relaxed">
                                        {p.textNodes[0]?.content || p.textNodes[0]?.prompt || t("canvas.textEmpty")}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </button>
                              <div className="flex min-w-0 items-start justify-between gap-2 px-0.5">
                                <div className="min-w-0 flex-1">
                                  {renamingKey === p.key && !readOnly ? (
                                    <input
                                      autoFocus
                                      value={renameValue}
                                      onChange={(e) => setRenameValue(e.target.value)}
                                      onFocus={(e) => e.currentTarget.select()}
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") e.currentTarget.blur();
                                        if (e.key === "Escape") {
                                          cancelEditRef.current = true;
                                          setRenamingKey(null);
                                        }
                                      }}
                                      onBlur={() => {
                                        if (cancelEditRef.current) {
                                          cancelEditRef.current = false;
                                          return;
                                        }
                                        saveRename(p.key);
                                      }}
                                      maxLength={60}
                                      className="w-full border border-[#8090a3] bg-white px-1.5 py-0.5 text-sm font-medium text-[#20242c] outline-none"
                                    />
                                  ) : (
                                    <div className="truncate text-sm font-medium text-[#20242c]">
                                      {p.name}
                                    </div>
                                  )}
                                  <div className="truncate text-[11px] text-[#7a8492]">
                                    {formatDate(p.latestAt)}
                                  </div>
                                </div>
                                {!readOnly && (
                                  <div className="relative flex-none">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setProjMenuKey((key) => key === p.key ? null : p.key);
                                      }}
                                      title={t("canvas.more")}
                                      className="-mr-1 flex h-7 w-7 items-center justify-center text-[#7a8492] transition-colors hover:bg-[#e9edf2] hover:text-[#20242c]"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                    {projMenuKey === p.key && (
                                      <div className="menu-pop-down absolute right-0 top-9 z-30 w-32 overflow-hidden border border-[#d8dde4] bg-white p-1 text-[#20242c] shadow-xl">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setProjMenuKey(null);
                                            setRenamingKey(p.key);
                                            setRenameValue(p.name);
                                          }}
                                          className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm transition-colors hover:bg-[#f1f3f6]"
                                        >
                                          <Pencil className="h-4 w-4 text-[#7a8492]" />
                                          {t("canvas.rename")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setProjMenuKey(null);
                                            deleteProject(p);
                                          }}
                                          className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm text-[#d24b45] transition-colors hover:bg-[#fff0ef]"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          {t("canvas.deleteProjectShort")}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            </div>
          ) : (

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
              {/* 左上:logo(点开项目菜单) + 项目名(点进入内联编辑,失焦/回车确定) */}
              <div className="absolute left-3 top-3 z-30 max-w-[calc(100%-1.5rem)]">
                <div
                  data-testid="canvas-project-chrome"
                  className={cn(
                    "canvas-ui-surface flex max-w-full items-center gap-0.5 overflow-hidden rounded-xl border px-1.5 py-1.5 backdrop-blur transition-colors",
                    sidebarOpen && "!border-[var(--canvas-ui-border-strong)]"
                  )}
                >
                  {/* logo:点击展开「项目/重命名/删除…」菜单 */}
                  <button
                    type="button"
                    onClick={() => setSidebarOpen((v) => !v)}
                    title={BRAND}
                    className="flex flex-none items-center gap-1 rounded-lg px-1 pr-0.5 transition-colors hover:bg-white/5"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <CachedImage
                      src={BRAND_CANVAS_LOGO}
                      alt={BRAND}
                      className="h-7 w-auto max-w-[108px] flex-none rounded-lg object-contain sm:max-w-[140px]"
                    />
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 flex-none text-muted-foreground transition-transform",
                        sidebarOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {/* 项目名:只读时纯展示;否则点击进入内联编辑 */}
                  {renamingKey === active?.key && active && !readOnly ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                          cancelEditRef.current = true;
                          setRenamingKey(null);
                        }
                      }}
                      onBlur={() => {
                        if (cancelEditRef.current) {
                          cancelEditRef.current = false;
                          return;
                        }
                        saveRename(active.key);
                      }}
                      maxLength={60}
                      placeholder={t("canvas.renamePlaceholder")}
                      className="ml-0.5 w-[35vw] max-w-[180px] rounded-lg border border-primary/60 bg-background px-2 py-1 text-sm font-bold text-foreground outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (readOnly || !active) {
                          setSidebarOpen((v) => !v);
                          return;
                        }
                        setRenamingKey(active.key);
                        setRenameValue(active.name);
                      }}
                      title={
                        readOnly ? undefined : t("canvas.rename")
                      }
                      className="ml-0.5 max-w-[35vw] truncate rounded-lg px-2 py-1 text-left text-sm font-bold text-foreground transition-colors hover:bg-white/5 sm:max-w-[200px]"
                    >
                      {active ? active.name : t("canvas.newProject")}
                    </button>
                  )}
                  {readOnly && (
                    <span className="flex-none rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                      只读
                    </span>
                  )}
                </div>
              </div>

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
                  <button
                    type="button"
                    data-tool="move"
                    onClick={() => setCanvasTool("move")}
                    aria-label={`${t("canvas.moveTool")} (V)`}
                title={`${t("canvas.moveTool")} (V)`}
                    aria-pressed={canvasTool === "move"}
                    className={cn(
                      "flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9",
                      canvasTool === "move"
                        ? "canvas-ui-primary shadow-sm"
                        : "canvas-ui-action"
                    )}
                  >
                    <MousePointer2 className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    type="button"
                    data-tool="marquee"
                    onClick={() => {
                      setCanvasTool("marquee");
                      setSelectedId(null);
                      setSelectedPendId(null);
                      setSelectedTextId(null);
                      clearCanvasSelection();
                    }}
                    aria-label={`${t("canvas.boxSelect")} (M)`}
                title={`${t("canvas.boxSelect")} (M)`}
                    aria-pressed={canvasTool === "marquee"}
                    className={cn(
                      "flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9",
                      canvasTool === "marquee"
                        ? "canvas-ui-primary shadow-sm"
                        : "canvas-ui-action"
                    )}
                  >
                    <BoxSelect className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    type="button"
                    data-tool="hand"
                    onClick={() => setCanvasTool("hand")}
                    aria-label={`${t("canvas.handTool")} (H)`}
                title={`${t("canvas.handTool")} (H)`}
                    aria-pressed={canvasTool === "hand"}
                    className={cn(
                      "flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors sm:h-9 sm:w-9",
                      canvasTool === "hand"
                        ? "canvas-ui-primary shadow-sm"
                        : "canvas-ui-action"
                    )}
                  >
                    <Hand className="h-[18px] w-[18px]" />
                  </button>

                  <span className="mx-0.5 h-5 w-px flex-none bg-[var(--canvas-ui-border)] sm:mx-1 sm:h-6" />

                  <CanvasActionMenu label={t("canvas.addNode")} light={lightCanvas} disabled={readOnly}
                    open={addMenuOpen} onOpenChange={open => { setMoreToolsOpen(false); setAddMenuOpen(open); }}
                    triggerIcon={Plus} iconOnly triggerTestId="canvas-add-node-button" menuTestId="canvas-create-menu"
                    triggerClassName="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:h-9 sm:w-9"
                    items={[
                      { id: "text", icon: Type, label: t("canvas.toolbar.addText"), onSelect: () => createCanvasNode("text") },
                      { id: "image-node", icon: ImagePlus, label: t("canvas.toolbar.addImageNode"), onSelect: () => createCanvasNode("image") },
                      { id: "video-node", icon: Video, label: videoNodeCreateLabel, disabled: !canFeature("video")||videoNodeCreateDisabled, onSelect: () => createCanvasNode("video") },
                    ]}
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
                    disabled={historySaving || undoStack.length === 0} onClick={() => void doUndo()}
                    className="canvas-ui-action flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors disabled:opacity-40 sm:h-9 sm:w-9">
                    <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <button type="button" data-tool="redo" aria-label={t("canvas.redo")} title={`${t("canvas.redo")} (${isMac ? "⇧⌘Z" : "CtrlY"})`}
                    disabled={historySaving || redoStack.length === 0} onClick={() => void doRedo()}
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
                <button type="button" className="canvas-ui-action rounded-lg px-3 py-2 text-xs" onClick={()=>copyCanvasSelection(multiSel)}>{t("canvas.copyNode")}</button>
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
          {imageImports.some(batch => batch.owner === user?.email.toLowerCase()) && (
            <div className="absolute right-3 top-[108px] z-40 max-h-[40%] w-80 max-w-[calc(100%-24px)] overflow-y-auto rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm md:top-16" data-testid="canvas-import-status" aria-live="polite">
              {imageImports.filter(batch => batch.owner === user?.email.toLowerCase()).map(batch => (
                <div key={batch.id} className="border-b border-slate-100 p-3 last:border-0">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {!batch.finished && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span className="flex-1">{batch.phase === "sync" ? (locale === "en" ? "Syncing canvas" : "等待画布同步") : batch.finished ? t("canvas.importDone") : t("canvas.importBusy")} {batch.done} / {batch.total} · {t("canvas.importSuccess")} {batch.success}{batch.errors.length ? ` · ${t("canvas.importErrors")} ${batch.errors.length}` : ""}</span>
                    {batch.finished && <button type="button" aria-label={t("canvas.importDismiss")} className="p-1 hover:bg-slate-100" onClick={() => setImageImports(current => current.filter(item => item.id !== batch.id))}><X className="h-3.5 w-3.5" /></button>}
                  </div>
                  {!batch.finished && (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-sky-500 transition-[width] duration-200" style={{ width: `${batch.phase === "optimizing" ? 8 : Math.min(100, batch.uploadBytes ? batch.uploadedBytes / batch.uploadBytes * 100 : 0)}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                        <span>{batch.phase === "optimizing" ? t("canvas.importOptimizing") : `${Math.round(batch.uploadBytes ? batch.uploadedBytes / batch.uploadBytes * 100 : 0)}%`}</span>
                        <span>{batch.uploadBytes < batch.originalBytes ? `${bytesLabel(batch.originalBytes)} → ${bytesLabel(batch.uploadBytes)}` : bytesLabel(batch.uploadBytes)}</span>
                      </div>
                    </div>
                  )}
                  {batch.finished && batch.phase === "sync" && batch.owner === user?.email.toLowerCase() && <button type="button" data-testid="canvas-import-resync" className="mt-2 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50" onClick={() => void retryImportSynchronization(batch.id)}>{locale === "en" ? "Sync saved images" : "同步图片"}</button>}
                  {batch.finished && batch.nodeIds?.some(id => active?.members.some(member => member.id === id)) && (
                    <button type="button" data-testid="canvas-import-locate" className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
                      onClick={() => {
                        const id = batch.nodeIds?.find(id => active?.members.some(member => member.id === id));
                        if (id) { setSelectedId(null); setSelectedTextId(null); setSelectedPendId(null); setFocusId(id); }
                      }}>
                      <ScanSearch className="h-3.5 w-3.5" />{locale === "en" ? "View image" : "查看图片"}
                    </button>
                  )}
                  {batch.errors.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-red-600">
                      {batch.errors.map((error, index) => <li key={index} className="break-words">{error.name}：{error.message}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

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
            <div
              data-testid="canvas-view-toolbar"
              className={cn(
                "canvas-ui-surface absolute bottom-4 left-4 flex items-center gap-0.5 rounded-xl border p-1.5",
                zoomMenuOpen ? "z-40" : "z-20"
              )}
            >
              {!readOnly && (
                <button
                  type="button"
                  title={t("canvas.ctxTidy")}
                  aria-label={t("canvas.ctxTidy")}
                  onClick={tidyLayout}
                  disabled={historySaving || !nodeSettingsReady || !textNodesReady}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                title={t("canvas.minimap")}
                aria-pressed={showMinimap}
                aria-label={t("canvas.minimap")}
                onClick={() => setShowMinimap((v) => !v)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-secondary",
                  showMinimap ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <MapIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={t("canvas.snap")}
                aria-pressed={snapGrid}
                aria-label={t("canvas.snap")}
                onClick={() => setSnapGrid((v) => !v)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-secondary",
                  snapGrid ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Magnet className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={t("canvas.ctxFit")}
                aria-label={t("canvas.ctxFit")}
                onClick={() =>
                  rfRef.current?.fitView({ duration: 400, padding: 0.2, maxZoom: 1 })
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Maximize className="h-4 w-4" />
              </button>
              <button
                type="button"
                data-testid="canvas-theme-toggle"
                aria-label={t(lightCanvas ? "canvas.toolbar.darkCanvas" : "canvas.toolbar.lightCanvas")}
                title={t(lightCanvas ? "canvas.toolbar.darkCanvas" : "canvas.toolbar.lightCanvas")}
                aria-pressed={!lightCanvas}
                onClick={() => setLightCanvas(v => { const next = !v; try { localStorage.setItem("nv:canvas:bg", next ? "light" : "dark"); } catch { /* Keep theme switching even without local storage. */ } return next; })}
                className="canvas-ui-action flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315fc8]"
              >
                {lightCanvas ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
              </button>
              <span className="mx-0.5 h-5 w-px bg-border" />
              {/* 缩放 % → 点击弹出缩放菜单(放大/缩小/适合屏幕/缩放至…) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setZoomMenuOpen((v) => !v)}
                  title={t("canvas.toolbar.zoom")}
                  ref={zoomButtonRef}
                  aria-label={`${t("canvas.toolbar.zoom")} ${zoomPercentLabel(viewport.zoom)}`}
                  aria-expanded={zoomMenuOpen}
                  className="rounded-lg px-1.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span ref={zoomLabelRef}>{zoomPercentLabel(viewport.zoom)}</span>
                </button>
                {zoomMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setZoomMenuOpen(false)}
                    />
                    <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-50 -translate-x-1/2">
                    <div className="canvas-ui-surface menu-pop-up w-52 overflow-hidden rounded-xl border py-1.5">
                      {/* 可输入的缩放值 */}
                      <div className="canvas-ui-control mx-1.5 mb-1 flex items-center justify-between rounded-lg px-3 py-2">
                        <input
                          ref={zoomInputRef}
                          value={zoomInput}
                          onChange={(e) => {
                            const next = e.target.value.replace(",", ".");
                            if (/^\d*(?:\.\d*)?(?:e[+-]?\d*)?$/i.test(next)) {
                              setZoomInput(next);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              applyZoomInput();
                              setZoomMenuOpen(false);
                            }
                          }}
                          className="w-16 bg-transparent text-sm font-medium outline-none"
                          inputMode="decimal"
                        />
                        <span className="text-sm text-[#9aa1ae]">%</span>
                      </div>
                      {[
                        {
                          label: "放大",
                          hk: `${modifierKey} +`,
                          fn: () => rfRef.current?.zoomIn({ duration: 200 }),
                        },
                        {
                          label: "缩小",
                          hk: `${modifierKey} -`,
                          fn: () => rfRef.current?.zoomOut({ duration: 200 }),
                        },
                        { sep: true },
                        {
                          label: "缩放至50%",
                          fn: () => rfRef.current?.zoomTo(0.5, { duration: 200 }),
                        },
                        {
                          label: "缩放至100%",
                          fn: () => rfRef.current?.zoomTo(1, { duration: 200 }),
                        },
                        {
                          label: "缩放至800%",
                          fn: () => rfRef.current?.zoomTo(8, { duration: 200 }),
                        },
                      ].map((it, i) =>
                        it.sep ? (
                          <div
                            key={`s${i}`}
                            className="my-1 h-px bg-[#2a2d36]"
                          />
                        ) : (
                          <button
                            key={it.label}
                            type="button"
                            onClick={() => {
                              it.fn?.();
                              setZoomMenuOpen(false);
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-[#2a2e38]"
                          >
                            <span>{it.label}</span>
                            {it.hk && (
                              <span className="text-xs text-[#9aa1ae]">
                                {it.hk}
                              </span>
                            )}
                          </button>
                        )
                      )}
                    </div>
                    </div>
                  </>
                )}
              </div>
            </div>
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

          {nodeTypeMenu && <div data-testid="canvas-node-type-menu">
            <ContextMenuSurface x={nodeTypeMenu.cx} y={nodeTypeMenu.cy} light={true} onClose={() => setNodeTypeMenu(null)}>
              <Item label={t("canvas.toolbar.addText")} disabled={readOnly} onClick={() => createCanvasNode("text", nodeTypeMenu)} />
              <Item label={t("canvas.toolbar.addImageNode")} disabled={readOnly} onClick={() => createCanvasNode("image", nodeTypeMenu)} />
              <Item label={videoNodeCreateLabel} disabled={readOnly || !canFeature("video") || videoNodeCreateDisabled} onClick={() => createCanvasNode("video", nodeTypeMenu)} />
            </ContextMenuSurface>
          </div>}

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
              if (ctxMenu.nodeId && !node && !textNode && !pendNode&&!videoNode) return null;
              const mutationDisabled = readOnly || !nodeSettingsReady || historySaving || Boolean(ctxMenu.nodeId && isNodeLocked(ctxMenu.nodeId));
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
                    ) : videoNode ? (
                      <>
                        <Item label="视频设置" disabled={mutationDisabled} onClick={()=>openVideoEditor(videoNode.id)}/>
                        <Item label={L("属性设置","Properties")} disabled={readOnly} onClick={()=>{setSelectedId(videoNode.id);openProperties();}}/>
                        {nodeManagementItems(videoNode.id).map(item=><Item key={item.id} label={item.label} disabled={item.disabled} onClick={item.onSelect}/>)}
                        <Sep/>
                        <Item label={t("canvas.copyNode")} onClick={()=>copyCanvasSelection(multiSel.includes(videoNode.id)?multiSel:[videoNode.id])}/>
                        <Item label={t("canvas.duplicate")} disabled={mutationDisabled} onClick={()=>void duplicateCanvasNodes(multiSel.includes(videoNode.id)?multiSel:[videoNode.id])}/>
                        <Item label={t("canvas.delete")} disabled={mutationDisabled} danger onClick={()=>batchDelete(multiSel.includes(videoNode.id)?multiSel:[videoNode.id])}/>
                      </>
                    ) : textNode ? (
                      <>
                        <Item label={t("canvas.editName")} disabled={mutationDisabled} onClick={() => { setNodeRenameValue(textNode.title); setRenamingNodeId(textNode.id); }} />
                        <Item label={t("canvas.toolbar.productCopy")} disabled={mutationDisabled || assistBusy} onClick={() => setProductPicker({ textNodeIds: [textNode.id] })} />
                        <FeatureVisible feature="generate"><Item label={t("canvas.toolbar.textToImages")} disabled={mutationDisabled || textNode.status === "generating"} onClick={() => openTextImageMenu([textNode.id])} /></FeatureVisible>
                        <Sep />
                        <Item label={t("canvas.copyNode")} onClick={()=>copyCanvasSelection(multiSel.includes(textNode.id)?multiSel:[textNode.id])}/>
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
                            onClick={() => copyNodeToClip(node, true)}
                          />
                        )}
                        <Item
                          label={t("canvas.copyImage")}
                          onClick={() => void copyImageToClipboard(node.image)}
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
                            onClick={() => void pasteNode()}
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
                        <Item
                          label={t("canvas.textGenerate")}
                          hk="⇧T"
                          disabled={readOnly}
                          onClick={() => addTextNodeAtScreen(ctxMenu.x, ctxMenu.y)}
                        />
                        <Item
                          label={t("canvas.addNode")}
                          disabled={readOnly}
                          onClick={() => setNodeTypeMenu({ x: ctxMenu.x, y: ctxMenu.y, cx: ctxMenu.cx, cy: ctxMenu.cy })}
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
                          onClick={() => void pasteNode()}
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
            onCopy={()=>copyCanvasSelection([selectedVideo.id])} onDuplicate={()=>void duplicateCanvasNodes([selectedVideo.id])}
            onDownload={()=>{const result=videoInputChoices.find(choice=>choice.nodeId===selectedVideo.id&&choice.available);if(result)downloadVideo(result.value);}}
            onDelete={()=>batchDelete([selectedVideo.id])} onProperties={openProperties} management={nodeManagementItems(selectedVideo.id)}/>}
          {selected?.videoUrl&&selectedBatchArts.length<=1&&multiSel.length<=1&&!propertiesOpen&&topbarStyle&&<VideoNodeToolbar
            ref={nodeToolbarRef} style={{left:topbarStyle.left,top:topbarStyle.top}} light={lightCanvas}
            readOnly={readOnly} locked={isNodeLocked(selected.id)} busy={!nodeSettingsReady||historySaving} hasResult hasHistory={false}
            settingsLabel={L("视频处理","Video tools")} onSettings={()=>extractVideoToCanvas(selected.id,{action:'trim'})} onHistory={()=>{}}
            onRename={()=>{setNodeRenameValue(selected.title);setRenamingNodeId(selected.id);}}
            onCopy={()=>copyCanvasSelection([selected.id])} onDuplicate={()=>void duplicateArt(selected)} onDownload={()=>downloadVideo(selected.videoUrl!)}
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
              <FeatureVisible feature="generate"><DarkSelect
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
              <FeatureVisible feature="generate"><DarkSelect
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
                    {id:"copy-node",icon:Copy,label:t("canvas.copyNode"),onSelect:()=>copyNodeToClip(selected,true)},
                    {id:"copy-image",icon:ImageIcon,label:t("canvas.copyImage"),onSelect:()=>void copyImageToClipboard(selected.image)},
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
            open={comfyOpen}
            onClose={() => setComfyOpen(false)}
            source={selected}
            onRun={(payload) => {
              if (!selected) return Promise.reject(new Error("请先选择一张图"));
              return runComfyWorkflow(selected, payload);
            }}
          />}

          {ocrArtworkId && (
            <aside
              aria-label="在线改字面板"
              className="canvas-ui-surface canvas-ui-surface-solid canvas-ui-side-panel absolute bottom-4 right-4 top-4 z-30 flex w-[min(390px,calc(100%-2rem))] flex-col overflow-hidden border"
            >
              <div className="flex items-start justify-between border-b border-[var(--canvas-ui-border)] px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[15px] font-bold">
                    <Type className="h-4 w-4 text-[#248da1]" /> 在线改字
                  </div>
                  <p className="mt-1 truncate text-[12px] canvas-ui-muted">
                    {active?.members.find((artwork) => artwork.id === ocrArtworkId)?.title || "图片节点"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="关闭在线改字"
                  onClick={() => {
                    ocrRequestEpochRef.current += 1;
                    setOcrArtworkId(null);
                    setOcrSegments([]);
                    setOcrError(null);
                    setOcrImageSize(null);
                    setOcrFocusedId(null);
                    setOcrApplyingId(null);
                    setOcrStatus("idle");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg canvas-ui-action"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {(ocrStatus === "scanning" || ocrStatus === "applying") && (
                <div className="border-b border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-4 py-3">
                  <div className="flex items-center justify-between text-[12px] font-semibold canvas-ui-muted">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#248da1]" />
                      {ocrStatus === "scanning" ? "正在扫描整张图片并提取文字" : "正在匹配原图字体并生成结果"}
                    </span>
                    <span>{Math.round(ocrProgress)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden bg-[#dfe6ec]">
                    <div
                      className="h-full bg-[#248da1] transition-all"
                      style={{ width: `${Math.max(4, Math.min(100, ocrProgress))}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="mb-3"><label className="mb-2 block text-xs">文字识别模型<TextModelSelect feature="canvas.ocr" compact dark={!lightCanvas} /></label><FeatureModelSelect feature="canvas.text-edit" disabled={ocrStatus === "applying"} /><ImageQualityControl compact feature="canvas.text-edit" resolution={active?.members.find(a => a.id === ocrArtworkId)?.resolution || "1K"} disabled={ocrStatus === "applying"} /></div>
                {ocrError && (
                  <div className="mb-3 border border-[#f0c8c3] bg-[#fff5f3] px-3 py-2 text-[12px] font-medium text-[#b44f43]">
                    {ocrError}
                  </div>
                )}
                {ocrStatus === "done" && !ocrError && (
                  <div className="mb-3 border border-[#bfe1d3] bg-[#f2fbf7] px-3 py-2 text-[12px] font-medium text-[#28785e]">
                    已生成改字结果，并放在原图右侧。
                  </div>
                )}
                {ocrStatus === "ready" && ocrSegments.length === 0 && (
                  <div className="py-12 text-center text-[13px] canvas-ui-muted">
                    没有识别到可编辑文字。
                  </div>
                )}
                {ocrSegments.length > 0 && ocrImageSize && (() => {
                  const artwork = active?.members.find((item) => item.id === ocrArtworkId);
                  if (!artwork?.image) return null;
                  return (
                    <div className="mb-3 rounded-xl border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] p-2">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold canvas-ui-muted">
                        <span>整图文字定位</span>
                        <span>{ocrSegments.length} 处</span>
                      </div>
                      <div
                        data-testid="ocr-image-preview"
                        className="relative mx-auto w-full overflow-hidden bg-white"
                        style={{ aspectRatio: `${ocrImageSize.width} / ${ocrImageSize.height}` }}
                      >
                        <NextImage
                          src={cdnUrl(artwork.image)}
                          alt="OCR 整图预览"
                          fill
                          unoptimized
                          sizes="390px"
                          className="object-contain"
                        />
                        {ocrSegments.map((segment, index) => {
                          const focused = ocrFocusedId === segment.id;
                          return (
                            <button
                              key={segment.id}
                              type="button"
                              aria-label={`定位文字 ${index + 1}`}
                              title={segment.text}
                              onClick={() => {
                                setOcrFocusedId(segment.id);
                                document.getElementById(`ocr-segment-${segment.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                              }}
                              className={cn(
                                "absolute border-2 transition-colors",
                                focused
                                  ? "border-[#315fc8] bg-[#315fc8]/15"
                                  : "border-[#248da1]/70 bg-[#248da1]/10 hover:border-[#315fc8]"
                              )}
                              style={{
                                left: `${(segment.box.x / ocrImageSize.width) * 100}%`,
                                top: `${(segment.box.y / ocrImageSize.height) * 100}%`,
                                width: `${(segment.box.width / ocrImageSize.width) * 100}%`,
                                height: `${(segment.box.height / ocrImageSize.height) * 100}%`,
                              }}
                            >
                              <span className="absolute -left-0.5 -top-5 bg-[#25313b] px-1 text-[9px] font-bold leading-4 text-white">
                                {index + 1}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-3">
                  {ocrSegments.map((segment, index) => (
                    <section
                      id={`ocr-segment-${segment.id}`}
                      key={segment.id}
                      onMouseEnter={() => setOcrFocusedId(segment.id)}
                      onFocusCapture={() => setOcrFocusedId(segment.id)}
                      className={cn(
                        "rounded-xl border bg-[var(--canvas-ui-soft)] p-3 transition-colors",
                        ocrFocusedId === segment.id ? "border-[#315fc8]" : "border-[var(--canvas-ui-border)]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide canvas-ui-muted">
                          文字 {index + 1}
                        </span>
                        <span className="text-[10px] canvas-ui-muted">
                          {Math.round(segment.confidence * 100)}% · {segment.box.x},{segment.box.y} · {segment.box.width}×{segment.box.height}
                        </span>
                      </div>
                      <p className="mt-2 break-words text-[12px] canvas-ui-muted">
                        原文：{segment.text}
                      </p>
                      <textarea
                        aria-label={`修改文字 ${index + 1}`}
                        value={segment.editedText}
                        disabled={ocrStatus === "applying"}
                        onChange={(event) => setOcrSegments((items) => items.map((item) =>
                          item.id === segment.id ? { ...item, editedText: event.target.value } : item
                        ))}
                        rows={2}
                        maxLength={300}
                        className="canvas-ui-input mt-2 w-full resize-y rounded-lg border px-2.5 py-2 text-[14px] font-medium leading-5 outline-none transition-colors focus:border-[#248da1]"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          aria-label={`应用文字 ${index + 1}`}
                          disabled={ocrStatus === "applying" || !segment.editedText.trim() || segment.editedText.trim() === segment.text}
                          onClick={() => void applyOcrSegment(segment)}
                          className="canvas-ui-primary flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white hover:bg-[#182129] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          {ocrApplyingId === segment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                          应用
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
              </div>
              <div className="border-t border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-4 py-2 text-[10px] canvas-ui-muted">
                {ocrEngine ? `识别引擎：${ocrEngine === "paddleocr" ? "PaddleOCR" : "视觉模型兜底"}` : "优先使用 PaddleOCR 扫描整图"}
              </div>
            </aside>
          )}

          {/* 重命名节点:在节点标签处弹出内联输入(编辑按钮触发),失焦/回车确定、Esc 取消 */}
          {renamingNodeId &&
            (selected || selectedText || selectedVideo) &&
            renamingNodeId === (selected?.id ?? selectedText?.id ?? selectedVideo?.id) &&
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
            <CanvasComposerShell
              data-testid="image-node-dock"
              key={`dock-${selected.id}`}
              ref={panelRef}
              style={dockStyle ?? { left: 12, bottom: 12, maxHeight: "60%" }}

             kind="image" heading={selected.title || L("图片生成", "Image generation")} onDismiss={() => setSelectedId(null)} closeLabel={L("关闭创作栏", "Close composer")}>
              {/* dbody:风格/标记/聚焦 chips + 引用图 + 提示词(对齐原型 .cz-dock .dbody) */}
              <div data-composer-body="true" className="min-h-0 overflow-y-auto px-4 pb-1.5 pt-3.5">
                <ImageReferenceComposer key={imageDraft.key || imageDraftNodeId} references={composerReferences} prompt={editPrompt} onPrompt={setEditPrompt}
                  onRole={(key,role)=>imageDraft.setReferenceBindings(changeImageReferenceRole(imageReferenceState.bindings,key,role))}
                  onRemove={removeComposerReference} onPreview={ref=>setLightbox({src:ref.url,alt:ref.title})}
                  onLocate={locateComposerReference} english={locale === "en"} error={referenceError}
                  textareaRef={promptAreaRef} readOnly={readOnly} placeholder={t("canvas.promptPlaceholder")}>
                  {!readOnly && <>
                    <input ref={extraInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={event=>pickExtra(event.target.files)} />
                    {composerReferences.length < MAX_TOTAL_IMAGES && <button type="button" onClick={()=>extraInputRef.current?.click()}
                      title={t("canvas.toolbar.addReference")} aria-label={t("canvas.toolbar.addReference")}
                      className="canvas-ui-action flex h-[68px] w-12 flex-none items-center justify-center rounded-[10px] border border-dashed border-[var(--canvas-ui-border)] hover:!border-[#6366f1]/60"><Upload className="h-4 w-4" /></button>}
                  </>}
                </ImageReferenceComposer>
                {genError && (
                  <p className="pb-1 text-xs font-medium text-red-400">
                    {genError}
                  </p>
                )}
              </div>

              {/* dbar:模型 / 比例·清晰度 / 数量 + 积分 + 发送(对齐原型 .dbar) */}
              {!readOnly && (
                <CanvasComposerFooter controls={<>
                  {modelControl(false)}
                  <DarkSelect
                    dir="up"
                    light={true}
                    value={generationMode}
                    options={[
                      { value: "standard", label: t("canvas.modeStandard") },
                      { value: "detail", label: t("canvas.modeDetail") },
                      { value: "triptych", label: t("canvas.modeTriptych") },
                      { value: "split", label: t("canvas.modeSplit") },
                    ]}
                    onPick={(value) => setGenerationMode(value as GenerationMode)}
                    triggerClass="canvas-ui-control flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold disabled:opacity-45"
                    trigger={
                      <>
                        {generationMode === "detail" ? (
                          <GalleryVerticalEnd className="h-3.5 w-3.5" />
                        ) : (
                          <Rotate3d className="h-3.5 w-3.5" />
                        )}
                        {generationMode === "standard"
                          ? t("canvas.modeStandardShort")
                          : generationMode === "detail"
                            ? t("canvas.modeDetailShort")
                          : generationMode === "triptych"
                            ? t("canvas.modeTriptychShort")
                            : t("canvas.modeSplitShort")}
                      </>
                    }
                  />
                  {ratioControl}
                  <ImageQualityControl compact feature="canvas.image" modelId={genModel} resolution={genResolution} ratio={genRatio} quantity={selectedGenerationCount} />
                  {generationMode === "standard" || generationMode === "detail" ? (
                    <ImageCountControl
                      value={genCount}
                      onChange={setGenCount}
                      light={true}
                    />
                  ) : (
                    <span className="canvas-ui-control inline-flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold">
                      <ImageIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      {generationMode === "split"
                        ? t("canvas.viewNodesCount")
                        : t("canvas.viewSheetCount")}
                    </span>
                  )}
                  <CanvasComposerOptions label={L("更多图片参数", "More image settings")}><DarkSelect
                        dir="up"
                        light={true}
                        value={genStyle}
                        options={GENERATION_STYLES.map((s) => ({
                          value: s,
                          label: s,
                        }))}
                        onPick={(v) => setGenStyle(v)}
                        triggerClass="canvas-ui-control flex cursor-pointer items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-[12.5px] transition-colors"
                        trigger={
                          <>
                            <Box aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-[88px] truncate">
                              {genStyle}
                            </span>
                          </>
                        }
                      />
                      <button
                        type="button"
                        onClick={() => void toggleNodeMark()}
                        aria-pressed={!!selected.marked}
                        className={cn(
                          "flex items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-[12.5px] transition-colors",
                          selected.marked
                            ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                            : "canvas-ui-control"
                        )}
                      >
                        <MapPin
                          className={cn(
                            "h-3.5 w-3.5",
                            selected.marked && "fill-current"
                          )}
                        />
                        {t(selected.marked ? "canvas.dockUnmark" : "canvas.dockMark")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFocusId(selected.id)}
                        className="canvas-ui-control flex items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-[12.5px] transition-colors"
                      >
                        <Focus aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        {t("canvas.dockFocus")}
                      </button><button
                    type="button"
                    onClick={() => void retrySelected()}
                    disabled={selectedGenerating}
                    title={t("canvas.retryImageHint")}
                    className="canvas-ui-control flex h-10 items-center gap-1.5 rounded-[11px] border px-3 text-[12.5px] font-semibold disabled:opacity-45"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("canvas.retryImage")}
                  </button></CanvasComposerOptions> </>} actions={<>

                  <GenerationSubmitAction generating={selectedGenerating} failure={selectedGenerationFailure}
                    onGenerate={selectedGenerationFailure&&selectedGenerationRetry?selectedGenerationRetry:generateChild} english={locale === "en"} />
                 </>}/>
              )}
            </CanvasComposerShell>
          )}

          {/* 空白节点生成 dock(文生图 / 合并多输入):选中空白节点时出现(图3 旁支节点) */}
          {canFeature("generate") && selectedPend && !readOnly && (
            <CanvasComposerShell
              data-testid="pending-node-dock"
              ref={panelRef}
              key={`pdock-${selectedPend.id}`}
              style={dockStyle ?? { left: 12, bottom: 12 }}

             kind="image" heading={L("图片生成", "Image generation")} onDismiss={() => setSelectedPendId(null)} closeLabel={L("关闭创作栏", "Close composer")}>
              <div data-composer-body="true" className="min-h-0 overflow-y-auto px-4 pb-1.5 pt-3.5">
                <ImageReferenceComposer key={imageDraft.key || imageDraftNodeId} references={composerReferences} prompt={editPrompt} onPrompt={setEditPrompt}
                  onRole={(key,role)=>imageDraft.setReferenceBindings(changeImageReferenceRole(imageReferenceState.bindings,key,role))}
                  onRemove={removeComposerReference} onPreview={ref=>setLightbox({src:ref.url,alt:ref.title})}
                  onLocate={locateComposerReference} english={locale === "en"} error={referenceError}
                  textareaRef={pendPromptRef} placeholder={t("canvas.pendPromptPlaceholder")} />
                {genError && (
                  <p className="pb-1 text-xs font-medium text-red-400">
                    {genError}
                  </p>
                )}
              </div>
              <CanvasComposerFooter controls={<>
                {modelControl(false)}
                <DarkSelect
                  dir="up"
                  light={true}
                  value={generationMode === "detail" ? "detail" : "standard"}
                  options={[
                    { value: "standard", label: t("canvas.modeStandard") },
                    { value: "detail", label: t("canvas.modeDetail") },
                  ]}
                  onPick={(value) => setGenerationMode(value as GenerationMode)}
                triggerClass="canvas-ui-control flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold disabled:opacity-45"
                  trigger={
                    <>
                      {generationMode === "detail" ? (
                        <GalleryVerticalEnd className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {generationMode === "detail"
                        ? t("canvas.modeDetailShort")
                        : t("canvas.modeStandardShort")}
                    </>
                  }
                />
                {ratioControl}
                <ImageQualityControl compact feature="canvas.image" modelId={genModel} resolution={genResolution} ratio={genRatio} quantity={genCount} />
                <ImageCountControl
                  value={genCount}
                  onChange={setGenCount}
                  light={true}
                />
                 </>} actions={<>
                <GenerationSubmitAction generating={selectedPendGenerating} failure={selectedPend.generationFailure}
                  onGenerate={selectedPend.generationFailure&&selectedPend.onGenerationRetry?selectedPend.onGenerationRetry:() => generatePend()} english={locale === "en"} />
               </>}/>
            </CanvasComposerShell>
          )}

          {/* 文字生成节点：布局与图片节点一致，配色跟随画布黑/白主题。 */}
          {selectedText && selectedTextBatchNodes.length <= 1 && !readOnly && !propertiesOpen && !isNodeLocked(selectedText.id) && (
            <CanvasComposerShell
              ref={textComposerDockRef}
              key={`tdock-${selectedText.id}`}
              data-testid="text-node-dock"
              style={
                textComposerExpanded
                  ? {
                      left: overlaySafeArea.left,
                      right: overlaySafeArea.right,
                      top: dockStyle?.top ?? overlaySafeArea.top,
                      bottom: overlaySafeArea.bottom,
                      width: "auto",
                      maxHeight: dockStyle?.maxHeight,
                      minHeight: Math.min(218, dockStyle?.maxHeight ?? 218),
                    }
                  : dockStyle ? { ...dockStyle, minHeight: Math.min(218, dockStyle.maxHeight ?? 218) } : {
                      left: 12,
                      bottom: 12,
                      width: canvasSize.width ? Math.max(1, Math.min(820, canvasSize.width - 24)) : 820,
                    }
              }
              className={textComposerExpanded ? "resize-none" : "resize-y"}
             kind="text" heading={selectedText.title || L("文字生成", "Text generation")} onDismiss={() => setSelectedTextId(null)} expanded={textComposerExpanded} onToggleExpand={() => { if (textComposerDockRef.current) textComposerDockRef.current.style.height = ""; setTextComposerManuallySized(false); setTextComposerExpanded(value => !value); }} expandLabel={L("展开文字编辑窗口", "Expand text editor")} collapseLabel={L("收起文字编辑窗口", "Collapse text editor")} closeLabel={L("关闭创作栏", "Close composer")}>
              <div
                ref={textComposerBodyRef} data-composer-body="true"
                className="flex min-h-0 flex-1 items-stretch gap-2 overflow-hidden px-3.5 pb-2 pt-3"
              >
                <button
                  type="button"
                  title={t("canvas.textAddReference")}
                  aria-label={t("canvas.textAddReference")}
                  aria-expanded={textReferenceMenuOpen}
                  onClick={() => setTextReferenceMenuOpen((open) => !open)}
                  className={cn(
                    "mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border transition-colors",
                    lightCanvas
                      ? "border-[#dfe4ea] bg-[#f3f5f7] text-[#596271] hover:border-[#aeb8c5] hover:bg-[#e9edf2] hover:text-[#20242c]"
                      : "border-[#2a2d36] bg-[#1f2229] text-[#b9c0cb] hover:border-[#4a505c] hover:text-white"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <Textarea
                  autoFocus
                  ref={textPromptRef}
                  value={textPrompt}
                  placeholder={t("canvas.textPromptPlaceholder")}
                  onChange={(event) => {
                    setTextPrompt(event.target.value);
                    // 检测光标前未完成的 "@关键词" → 弹出图片选择框
                    const el = event.target;
                    const caret = el.selectionStart ?? event.target.value.length;
                    const before = event.target.value.slice(0, caret);
                    const m = before.match(/@([^@\n\s]{0,24})$/);
                    setMentionState(
                      m ? { query: m[1], start: caret - m[1].length - 1 } : null
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && mentionState) {
                      event.preventDefault();
                      setMentionState(null);
                      return;
                    }
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      void generateTextNode();
                    }
                  }}
                  className={cn(
                    "h-full min-h-[112px] min-w-[160px] flex-1 resize-none border-0 bg-transparent px-0 py-0.5 text-sm leading-relaxed shadow-none focus-visible:border-0 focus-visible:bg-transparent focus-visible:ring-0",
                    textComposerExpanded || textComposerManuallySized
                      ? "h-full max-h-none overflow-y-auto"
                      : "max-h-[240px] overflow-y-hidden",
                    lightCanvas
                      ? "text-[#303641] placeholder:text-[#929aa6]"
                      : "text-[#e7e9ee] placeholder:text-[#818895]"
                  )}
                />


              </div>
              {/* @提及选图:输入 @ 触发,点击=插入 @图片名 并绑引用(等同连线) */}
              {mentionState && selectedText && (() => {
                const q = mentionState.query.toLowerCase();
                const options = (active?.members ?? [])
                  .filter(
                    (member) =>
                      hasRenderableImage(member.image) &&
                      (!q || (member.title || "").toLowerCase().includes(q))
                  )
                  .slice(0, 8);
                return (
                  <div
                    data-testid="mention-picker"
                    className={cn(
                      "border-t px-3.5 py-2.5",
                      lightCanvas
                        ? "border-[#edf0f3] bg-[#fafbfd]"
                        : "border-[#2a2d36] bg-[#17191f]"
                    )}
                  >
                    <p
                      className={cn(
                        "mb-2 text-[11px] font-medium",
                        lightCanvas ? "text-[#697383]" : "text-[#9aa1ae]"
                      )}
                    >
                      {t("canvas.mentionPickHint")}
                    </p>
                    {options.length ? (
                      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
                        {options.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => {
                              const insert = `@${member.title || t("canvas.imageNode")} `;
                              const end = mentionState.start + 1 + mentionState.query.length;
                              setTextPrompt(
                                textPrompt.slice(0, mentionState.start) +
                                  insert +
                                  textPrompt.slice(end)
                              );
                              setMentionState(null);
                              void updateTextReference(selectedText.id, member.id, true);
                            }}
                            className={cn(
                              "flex max-w-[210px] items-center gap-1.5 rounded-[8px] border px-2 py-1 text-[11px] font-medium transition-colors",
                              lightCanvas
                                ? "border-[#dfe4ea] bg-white text-[#46505e] hover:border-[#8794a4] hover:bg-[#f2f5f8] hover:text-[#20242c]"
                                : "border-[#343842] bg-[#20232a] text-[#cdd2da] hover:border-[#6bd7ec] hover:text-[#8fe7f5]"
                            )}
                          >
                            <CachedImage src={cdnUrl(member.image)} alt="" className="h-5 w-5 flex-none object-cover" />
                            <span className="truncate">@{member.title || t("canvas.imageNode")}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p
                        className={cn(
                          "text-[11px]",
                          lightCanvas ? "text-[#7b8492]" : "text-[#7f8793]"
                        )}
                      >
                        {t("canvas.mentionEmpty")}
                      </p>
                    )}
                  </div>
                );
              })()}
              {textReferenceMenuOpen && (
                <div
                  className={cn(
                    "border-t px-3.5 py-2.5",
                    lightCanvas
                      ? "border-[#edf0f3] bg-[#fafbfd]"
                      : "border-[#2a2d36] bg-[#17191f]"
                  )}
                >
                  <p
                    className={cn(
                      "mb-2 text-[11px] font-medium",
                      lightCanvas ? "text-[#697383]" : "text-[#9aa1ae]"
                    )}
                  >
                    {t("canvas.textReferenceHint")}
                  </p>
                  <div className="flex max-h-24 flex-wrap gap-1.5 overflow-auto">
                    {(active?.members ?? []).map((reference) => {
                      const checked = (selectedText.sourceIds ?? []).includes(reference.id);
                      return (
                        <button
                          key={reference.id}
                          type="button"
                          data-artwork-id={reference.id}
                          onClick={() =>
                            void updateTextReference(selectedText.id, reference.id, !checked)
                          }
                          className={cn(
                            "flex max-w-[210px] items-center gap-1.5 border px-2 py-1 text-[11px] font-medium transition-colors",
                            checked
                              ? lightCanvas
                                ? "border-[#8aa6b2] bg-[#e8f2f5] text-[#315a68]"
                                : "border-[#6bd7ec] bg-[#163842] text-[#8fe7f5]"
                              : lightCanvas
                                ? "border-[#dfe4ea] bg-white text-[#46505e] hover:border-[#9aa6b5] hover:bg-[#f2f5f8]"
                                : "border-[#343842] bg-[#20232a] text-[#cdd2da] hover:border-[#596170]"
                          )}
                        >
                          <CachedImage src={cdnUrl(reference.image)} alt="" className="h-5 w-5 flex-none object-cover" />
                          <span className="truncate">@{reference.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!!selectedTextRefs.length && (
                <div
                  className={cn(
                    "flex flex-wrap gap-1.5 border-t px-3.5 py-2",
                    lightCanvas ? "border-[#edf0f3]" : "border-[#2a2d36]"
                  )}
                >
                  {selectedTextRefs.map((reference) => (
                    <span
                      key={reference.id}
                      className={cn(
                        "flex max-w-[220px] items-center gap-1 rounded-[8px] border py-0.5 pl-2 pr-1 text-[11px] font-semibold",
                        lightCanvas
                          ? "border-[#b9d0d8] bg-[#e8f2f5] text-[#315a68]"
                          : "border-[#24505f] bg-[#163842] text-[#8fe7f5]"
                      )}
                    >
                      <span className="truncate">@{reference.title}</span>
                      <button
                        type="button"
                        aria-label={`${t("canvas.textRemoveReference")} ${reference.title}`}
                        onClick={() =>
                          void updateTextReference(selectedText.id, reference.id, false)
                        }
                        className={cn(
                          "flex h-4 w-4 flex-none items-center justify-center rounded transition-colors",
                          lightCanvas
                            ? "text-[#668a96] hover:bg-[#cfe2e8] hover:text-[#284d59]"
                            : "text-[#79bcc7] hover:bg-[#24505f] hover:text-white"
                        )}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {textTasks.state(selectedText.id).error && (
                <p className="px-12 pb-2 text-xs font-medium text-red-400">{textTasks.state(selectedText.id).error}</p>
              )}
              <CanvasComposerFooter testId="text-node-dock-footer" controls={<>
                <TextModelSelect feature="canvas.text-generate" compact dark={false} direction="up" />

                <button
                  type="button"
                  disabled={assistBusy}
                  onClick={() => setProductPicker({ textNodeIds: [selectedText.id] })}
                  title={t("canvas.assistWriteHint")}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-[9px] border px-3 text-[11px] font-semibold transition-colors disabled:opacity-45",
                    lightCanvas
                      ? "border-[#d8dde4] bg-white text-[#46505e] hover:border-[#aeb7c3] hover:bg-[#f2f4f6] hover:text-[#20242c]"
                      : "border-[#343842] text-[#d5d8df] hover:bg-[#24272f] hover:text-white"
                  )}
                >
                  {assistBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PenLine className="h-3.5 w-3.5" />
                  )}
                  {t("canvas.assistWrite")}
                </button>
                <FeatureVisible feature="generate"><button
                  type="button"
                  disabled={!nodeSettingsReady || textImageSubmitting || isNodeLocked(selectedText.id) || selectedText.status === "generating"}
                  onClick={() => openTextImageMenu([selectedText.id])}
                  title={t("canvas.genImagesHint")}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-[9px] border px-3 text-[11px] font-semibold transition-colors",
                    lightCanvas
                      ? "border-[#d8dde4] bg-white text-[#46505e] hover:border-[#aeb7c3] hover:bg-[#f2f4f6] hover:text-[#20242c]"
                      : "border-[#343842] text-[#d5d8df] hover:bg-[#24272f] hover:text-white"
                  )}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t("canvas.genImages")}
                </button></FeatureVisible>
                 </>} actions={<> <span
                  className={cn(
                    "text-[11px] font-semibold",
                    lightCanvas ? "text-[#547886]" : "text-[#6bd7ec]"
                  )}
                >
                  {selectedTextRefs.length}/5
                </span>
                <button
                  type="button"
                  onClick={() => void generateTextNode()}
                  disabled={(!textPrompt.trim()&&!textTasks.retryable(selectedText.id)) || textTasks.state(selectedText.id).busy || selectedText.status==="generating"&&textTasks.state(selectedText.id).phase==="idle"}
                  title={textTasks.retryable(selectedText.id)?L("继续原任务","Resume original task"):t("canvas.textGenerate")} aria-label={textTasks.retryable(selectedText.id)?L("继续原任务","Resume original task"):t("canvas.textGenerate")}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-[11px] transition-opacity hover:opacity-90 disabled:opacity-45",
                    lightCanvas ? "bg-[#20242c] text-white" : "bg-white text-[#111]"
                  )}
                >
                  {textTasks.state(selectedText.id).busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp aria-hidden="true" className="h-4 w-4" />
                  )}
                </button>
               </>}/>
            </CanvasComposerShell>
          )}
          {!browsing && !readOnly && canFeature("agent") && user && <CanvasAgentOrb key={`${user.email}:${activeKey || "workspace"}`} email={user.email}
            busy={assistantBusy} outcome={assistantOutcome} steps={assistantSteps} responding={assistantResponding} open={assistantVisible} companion={orbCompanion} onCue={orbCue}
            english={locale === "en"} onActivate={toggleAssistant} light={lightCanvas} />}
        </div>
        {propertiesOpen && !browsing && (selectedText || selected || selectedVideo) && <NodePropertiesPanel
          key={(selectedText || selected || selectedVideo)!.id} title={(selectedText || selected || selectedVideo)!.title} kind={selectedText ? "text" : "image"}
          settings={nodeSettings[(selectedText || selected || selectedVideo)!.id] || DEFAULT_CANVAS_SETTINGS} light={lightCanvas} english={locale==='en'} busy={historySaving || localEditBusy} readOnly={readOnly || !nodeSettingsReady}
          content={selectedText?.content || selectedText?.prompt}
          displaySize={selectedText ? {width:selectedText.width,height:selectedText.height} : selectedVideo?{width:selectedVideo.width,height:selectedVideo.height}:artworkNodeSize(selected!)}
          imageEditable={!selectedVideo&&!selected?.videoUrl}
          imageSize={selected?.width && selected?.height ? {width:selected.width,height:selected.height} : undefined}
          onSave={settings=>commitNodeSettings((selectedText || selected || selectedVideo)!.id,settings)} onClose={()=>setPropertiesOpen(false)}
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
            onRemoveReference={id=>{if(assistantBusy||assistantUploadToken.current)return;setAssistantAttachments(current=>current.filter(art=>art.id!==id));setAssistantExcludedReferences(current=>[...current,id]);setAssistantUploadError(null);assistantRetry.current=null;}}
            selectedSkill={assistantSkill} onSkillSelect={skill => { setAssistantSkill(skill); assistantRetry.current = null; }} skillAccountKey={user?.email || ""} skillSessionId={assistantSessionId.current} turns={assistantTurns} input={assistantInput} busy={assistantBusy} error={assistantError} canContinue={!!assistantContinueTurn} onContinue={()=>void sendAssistantMessage(true)} steps={assistantSteps} english={locale === "en"} responding={assistantResponding} activity={assistantActivity} attention={orbCompanion.model.attention} onStop={() => void stopAssistantTask()}
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
            onInputChange={value => { setAssistantInput(value); orbCue({ type: "draft", text: value }); }} onSend={() => void sendAssistantMessage()}
            onClearReference={()=>{if(assistantUploadToken.current)return;setAssistantAttachments([]);setAssistantExcludedReferences([]);setAssistantArtworkId(null);setSelectedId(null);setSelectedTextId(null);assistantRetry.current=null;}}
            onNewChat={() => { if(assistantUploadToken.current)return;setAssistantAttachments([]);setAssistantExcludedReferences([]);setAssistantUploadError(null);orbCue({ type: "reset" }); assistantSessionId.current = browserRandomUUID(); setAssistantSteps([]); setAssistantOutcome("idle"); setAssistantTurns([]); setAssistantInput(""); setAssistantError(null); setAssistantContinueTurn(null); assistantRetry.current = null; }}
            historyLoader={async () => { const response=await privateFetchRaw(`/api/canvas/assistant?projectKey=${encodeURIComponent(activeKey||"workspace")}`);const data=await expectJsonOk(response,"历史记录读取失败");return (data.sessions||[]).map((session:{id:string;title:string;updatedAt:string;anchorId:string})=>({...session,turns:[]})); }}
            onRenameHistory={async(id,title)=>{await expectJsonOk(await privateFetchRaw(`/api/canvas/assistant?projectKey=${encodeURIComponent(activeKey || "workspace")}&id=${encodeURIComponent(id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({title})}),"会话改名失败");}}
            onDeleteHistory={async(id)=>{await expectJsonOk(await privateFetchRaw(`/api/canvas/assistant?projectKey=${encodeURIComponent(activeKey || "workspace")}&id=${encodeURIComponent(id)}`,{method:"DELETE"}),"删除会话失败");if(assistantSessionId.current===id){orbCue({ type: "reset" }); assistantSessionId.current=browserRandomUUID();setAssistantContinueTurn(null);setAssistantError(null);setAssistantTurns([]);setAssistantSteps([]); setAssistantOutcome("idle");}}}
            onRestoreChat={(turns,id) => { if(id){void restoreAssistantConversation(anchor?.id||"",id);return;}orbCue({ type: "reset" }); assistantSessionId.current=browserRandomUUID();setAssistantSteps([]); setAssistantOutcome("idle");setAssistantTurns(turns);setAssistantInput("");setAssistantError(null);setAssistantContinueTurn(null);assistantRetry.current=null; }}
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
      {/* 右上角按钮:在画布内弹窗打开模板/会员/账户(可层叠下一级,可返回) */}
      {modalTop &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={cn(
              "fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm text-foreground",
              lightCanvas ? "canvas-ui-light" : "dark canvas-ui-dark"
            )}
            onClick={() => setModalStack([])}
          >
            <div
              className={cn(
                "relative flex h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl",
                modalTop.page === "templates" || modalTop.page === "generate"
                  ? "max-w-6xl"
                  : "max-w-5xl"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-none items-center justify-between border-b border-border px-5 py-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  {modalStack.length > 1 && (
                    <button
                      type="button"
                      onClick={modalBack}
                      aria-label={t("canvas.backToProjects")}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}
                  <span className="truncate text-base font-bold text-foreground">
                    {modalTop.page === "templates"
                      ? t("nav.templates")
                      : modalTop.page === "plans"
                        ? t("nav.plans")
                        : modalTop.page === "account"
                          ? t("nav.account")
                          : modalTop.page === "security"
                            ? "账户与安全"
                            : modalTop.page === "generate"
                              ? t("nav.generate")
                              : "结算"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setModalStack([])}
                  aria-label={t("canvas.close")}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto"
                onClickCapture={(e) => {
                  // 弹窗内点向 模板/会员/账户/生成 的内部链接 → 不跳页面,改为在弹窗内进下一级;
                  // 未知/外部(支付等)照常跳转。
                  const a = (e.target as HTMLElement).closest("a");
                  if (!a) return;
                  const href = a.getAttribute("href") || "";
                  if (!href.startsWith("/")) return; // 外链照常
                  // 模板「做同款」(/generate?template=ID)→ 关弹窗,在画布里新建一个项目
                  const [hp, hq] = href.split("?");
                  if (hp.replace(/\/+$/, "") === "/generate") {
                    const tplId = new URLSearchParams(hq || "").get("template");
                    if (tplId) {
                      e.preventDefault();
                      e.stopPropagation();
                      void applyTemplateToCanvas(tplId);
                      return;
                    }
                  }
                  if (pushModalHref(href)) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                {modalTop.page === "templates" && (
                  <TemplatesClient gridClass="columns-2 md:columns-3 xl:columns-4" />
                )}
                {commerceVisible && modalTop.page === "plans" && (
                  <div className="p-4">
                    <CreditPacks
                      onCheckout={(orderId, info) => {
                        if (!info.pack) return;
                        setPayModal({
                          orderId,
                          qrContent: info.qrContent,
                          provider: info.provider,
                          credits: info.pack.credits,
                          bonus: info.pack.bonus,
                          fen: info.pack.fen,
                          discount: info.pack.discount,
                          packId: info.pack.id,
                        });
                      }}
                    />
                  </div>
                )}
                {modalTop.page === "account" && <AccountClient />}
                {modalTop.page === "security" && <SecurityClient />}
                {modalTop.page === "generate" && (
                  <GenerateClient seedTemplateId={modalTop.params?.template} />
                )}
                {commerceVisible && modalTop.page === "checkout" && (
                  <CheckoutClient pack={modalTop.params?.pack} />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      {/* 画布内扫码支付:统一走共用 PayQrModal */}
      {commerceVisible && payModal && (
        <PayQrModal
          open={!!payModal}
          orderId={payModal.orderId}
          provider={payModal.provider}
          qrContent={payModal.qrContent}
          credits={payModal.credits}
          bonus={payModal.bonus}
          fen={payModal.fen}
          discount={payModal.discount}
          onClose={() => setPayModal(null)}
          onPaid={() => void refreshCredits()}
          onRefresh={async () => {
            const em = targetEmail || user?.email;
            if (!em) return;
            try {
              const res = await fetch("/api/payments/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: em,
                  kind: "pack",
                  itemId: payModal.packId,
                  method: payModal.provider,
                }),
              });
              const data = await res.json();
              if (res.ok && data.mode === "native" && data.qrContent) {
                setPayModal((m) =>
                  m
                    ? {
                        ...m,
                        orderId: data.orderId,
                        qrContent: String(data.qrContent),
                        provider:
                          (data.provider as "alipay" | "wechat") ?? m.provider,
                      }
                    : m
                );
              }
            } catch {
              /* ignore */
            }
          }}
        />
      )}
    </div>
    </TextNodeContext.Provider>
    </PendContext.Provider>
  );
}
