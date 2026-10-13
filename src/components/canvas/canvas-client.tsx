"use client";
import { CachedImage } from "@/components/cached-image";
import { browserImageArchive } from '@/lib/browser-image-archive';
import { cachedImageBlob, imageCacheSource, ImageCacheDenied, readBrowserImage } from '@/lib/browser-image-cache';
import { useFeatureAccess, FeatureVisible } from "@/lib/feature-access/client";


import { loadAccountSnapshot, invalidateBrowserData } from "@/lib/browser-data-cache";
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
import { separateCanvasDocks } from "@/lib/canvas/dock-placement";
import { smartLayout } from "@/lib/canvas/smart-layout";
import { CanvasParameterPopover } from "./parameter-popover";
import {ImagegenPanel,type ImagegenPanelInput} from "@/components/imagegen/imagegen-panel";
import type {ImagegenResult} from "@/lib/imagegen/types";
import {submitCanvasImagegen} from "@/lib/imagegen/canvas-client";
import {canvasReceipts,clearCanvasReceipt} from "@/lib/imagegen/canvas-receipts";
import {pollImagegen} from "@/lib/imagegen/client";
import {VideoGenerationNode} from "./video/generation-node";
import {VideoSettingsDialog,type VideoNodeDraft} from "./video/settings-dialog";
import {useVideoNodes} from "./video/use-video-nodes";
import {useVideoTasks} from "./video/use-video-tasks";
import {VideoPlayer,mediaDownloadHref,type VideoPlayerAction} from "./video/player";
import {MediaActionsDialog,type MediaInputChoice} from "./video/media-actions";
import {useMediaJobs} from "./video/use-media-jobs";
import {videoHistoryDraft} from "@/lib/video/client-history";
import {useVideoAssets,VideoAssetImportError} from "./video/use-video-assets";
import {VideoHistoryPicker} from "./video/history-picker";
import type {CanvasVideoNode} from "@/lib/canvas/video-node-schema";
import {catalogCapability,reconcileVideoSettings,videoModeRoles,type VideoCatalogModel,type VideoInputChoice} from "@/lib/video/client-settings";
import {readVideoReceipt,prepareVideoReceipt,saveVideoReceipt,clearVideoReceipt} from "@/lib/video/canvas-receipts";
import type {PublicVideoTaskView} from "@/lib/video/service";
import type {PublicQuote} from "@/lib/billing/client";
import {CanvasImage} from './canvas-image';
import { CanvasActionMenu, CanvasActionPanel } from "./canvas-action-menu";
import { CanvasHelpDialog } from "./canvas-help-dialog";
import { ContextMenuSurface, ContextMenuItem as Item } from "./context-menu-surface";
import { BatchSelectionToolbar } from "./batch-selection-toolbar";
import { GenerationPlaceholder } from "./generation-placeholder";
import { generationPlaceholderSize, placeGenerationPreview, type GenerationStage } from "@/lib/canvas/generation-feedback";
import type { ImageSkill } from "@/lib/image-skills/catalog";
import { CanvasAssistantPanel } from "./canvas-assistant-panel";
import { useWorkflowPaste } from "./use-workflow-paste";
import { WorkflowDecorationNode, WorkflowGroupNode } from "./workflow-import-nodes";
import type { ImportedManifest } from "@/lib/canvas/workflow-clipboard";
import { CanvasAgentToggle } from "./canvas-agent-toggle";
import { CanvasAgentOrb } from "./canvas-agent-orb";
import { AssistantRichText } from "./assistant-richtext";
import { restoredOrbOutcome, type AgentOrbOutcome, type AgentOrbStep } from "@/lib/canvas/agent-orb";
import { useOrbCompanion } from "../naumi-orb/use-orb-companion";
import { classifyAgentFailure } from "@/lib/agent/recovery";
import { agentOrbState } from "@/lib/canvas/agent-orb";
import { agentToolLabel, agentToolSummary } from "@/lib/canvas/agent-activity";
import { useCanvasAssistantDisclosure } from "@/lib/canvas/assistant-disclosure";
import { NodePropertiesPanel } from "./node-properties-panel";
import { ImageCropDialog } from "./image-crop-dialog";
import { defaultNodeSettings, validNodeSettings, nodeTextStyle, type CanvasNodeSettings, type CanvasCrop } from "@/lib/canvas/node-settings";
const DEFAULT_CANVAS_SETTINGS = defaultNodeSettings();

import {
  createContext,
  useCallback,
  useContext,
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
  Handle,
  NodeResizer,
  Position,
  useNodesState,
  useEdgesState,
  getBezierPath,
  SelectionMode,
  type NodeProps,
  type EdgeProps,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  X,
  Pencil,
  MoreHorizontal,
  Crop,
  SlidersHorizontal,
  Lock,
  Unlock,
  ArrowUpToLine,
  ArrowDownToLine,
  Loader2,
  Sparkles,
  Download,
  Trash2,
  Upload,
  RotateCcw,
  RotateCw,
  Scissors,
  Sun,
  Moon,
  Type,
  Rotate3d,
  Wand2,
  Image as ImageIcon,
  ChevronDown,
  Home,
  LayoutGrid,
  Plus,
  Maximize,
  Maximize2,
  Minimize2,
  ChevronLeft,
  Map as MapIcon,
  Magnet,
  Link2,
  Clock,
  Keyboard,
  ShoppingBag,
  Crown,
  Zap,
  MapPin,
  BoxSelect,
  Combine,
  GalleryVerticalEnd,
  ScanSearch,
  Video,
  Pause,
  AlertTriangle,
  PenLine,
  Play,
  MessageSquareText,
  Workflow,
  MousePointer2,
  Hand,
  ImagePlus,
  Copy,
  type LucideIcon,
} from "lucide-react";
import { authHeader } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useI18n } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cdnUrl, cdnThumb, onImgError } from "@/lib/cdn";
import { ImageLightbox } from "@/components/image-lightbox";
import type { ComfyRunPayload, ComfyRunResult } from "@/components/canvas/canvas-comfy-dialog";
import { BRAND, BRAND_CANVAS_LOGO } from "@/lib/brand";
const panelLoading = () => <div role="status" className="p-4 text-sm text-slate-500">加载中…</div>;
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
  useAccountAdminStatus,
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
  routeImageModel,
} from "@/lib/image-model-routing";
import { ModelIcon } from "@/components/ui/model-icon";
import {MODEL_CATALOG_REFRESH} from "@/lib/model-config/public-client";
import { adminConfiguredFeature } from "@/lib/model-config/selection-policy";
import { chosenFeatureModel, featureModelManaged, useFeatureModels } from "@/lib/model-config/feature-client";
import { FeatureModelSelect } from "@/components/tools/feature-model-select";
import { TextModelSelect } from "@/components/ui/text-model-select";
import { useTextModel } from "@/lib/text-model-context";

/** Supabase 模式补 Authorization；原生账号模式依靠同源 HttpOnly cookie。 */
async function privateFetchRaw(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const auth = await authHeader();
  for (const [key, value] of Object.entries(auth)) headers.set(key, value);
  return fetch(input, { ...init, headers });
}
// 横向链路布局(对齐原型 node-canvas-preview):深度→x 向右展开,同层兄弟→y 竖排。
// 图片节点使用更清晰的工作尺寸，并按图片比例自适应；高分屏上保持可辨识。
const NODE_W = 320; // 新建图片节点的默认宽度，避免高分辨率屏幕上过小
const NODE_H = 236; // 标签行 36 + 默认图片区 200
const NODE_LABEL_H = 36;
const IMAGE_NODE_MIN_W = 120;
const IMAGE_NODE_MIN_H = 108;
const IMAGE_NODE_MAX_W = 2400;
const IMAGE_NODE_MAX_H = 2400;
const PORT_Y = NODE_LABEL_H + 100; // 默认空白节点连接点垂直居中
const X_GAP = 90; // 层间横向间距
const Y_GAP = 48; // 同层兄弟纵向间距
const MAX_TOTAL_IMAGES = 6; // 节点图 + 追加参考图 合计上限
const MAX_UPLOAD = 12 * 1024 * 1024;
const MAX_GENERATION_COUNT = CANVAS_MAX_COUNT;
type CanvasPrimaryTool = "move" | "marquee" | "hand";
// 扩图可选目标比例(ratioTilesC 同款,去掉 auto 与极端档 2:1/1:2)
const EXPAND_RATIOS = CANVAS_RATIO_OPTIONS.filter(r => r.id !== "auto").map(r => r.id);
// 扩图锚点九宫格(原图贴哪一侧,新内容补其余方向) + 提示文案
const ANCHOR_GRID = ["nw", "n", "ne", "w", "center", "e", "sw", "s", "se"] as const;
const ANCHOR_TITLE: Record<string, string> = {
  nw: "左上", n: "上", ne: "右上", w: "左", center: "中", e: "右", sw: "左下", s: "下", se: "右下",
};
const TEXT_NODE_MIN_W = 220;
const TEXT_NODE_MIN_H = 140;
const TEXT_NODE_DEFAULT_W = 380;
const TEXT_NODE_DEFAULT_H = 240;
const TEXT_NODE_MAX_W = 1200;
const TEXT_NODE_MAX_H = 1200;

// 文字节点内容自适应高度估算:标题栏36 + 内边距 + 引用芯片行 + 正文行数(12px/1.65行高)。
// 只做粗估(阈值 28px 起才调整),手动拖大节点后不被覆盖(签名不变则不动)。
function estimateTextNodeHeight(node: {
  width: number;
  content: string;
  prompt: string;
  sourceIds?: string[];
}): number {
  const width = node.width || TEXT_NODE_DEFAULT_W;
  const charsPerLine = Math.max(8, Math.floor((width - 24) / 11));
  const text = `${node.content || ""}\n${node.prompt || ""}`.trim();
  const lines = text
    ? text
        .split("\n")
        .reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / charsPerLine)), 0)
    : 2;
  const refsRows = node.sourceIds?.length ? 1 : 0;
  const h = 32 + 20 + refsRows * 26 + lines * 20 + 14;
  return Math.round(
    Math.min(TEXT_NODE_MAX_H, Math.max(TEXT_NODE_DEFAULT_H, h))
  );
}
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

const DETAIL_MODULE_ORDER = [
  "hero",
  "selling",
  "scene",
  "angles",
  "ingredients",
  "usage",
  "specs",
  "assurance",
] as const;

type CanvasGenerationTask = {
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

type GeneratedResult = { id: string; url: string; width?: number; height?: number };

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

type CanvasTextNode = {
  id: string;
  projectKey: string;
  title: string;
  prompt: string;
  content: string;
  status: "idle" | "generating" | "completed" | "failed";
  canvasX: number;
  canvasY: number;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  sourceIds: string[];
  targetIds: string[];
  productIds?: string[];
};

type CanvasVideoCapability = VideoCatalogModel;

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
function stripMentionLines(content: string): string {
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim().startsWith("@")) i++;
  return lines.slice(i).join("\n").trim();
}
// 绑定/换绑产品图时,把 @产品图 行刷新到内容开头(旧 @ 行先剥掉)
function withProductMention(content: string, title: string): string {
  return `@${title}\n\n${stripMentionLines(content)}`.trim();
}
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

function artworkImageSize(art: Pick<Artwork, "width" | "height">) {
  const withCanvas = art as Pick<
    Artwork,
    "width" | "height" | "canvasWidth" | "canvasHeight"
  >;
  if (
    withCanvas.canvasWidth &&
    withCanvas.canvasWidth > 0 &&
    withCanvas.canvasHeight &&
    withCanvas.canvasHeight > 0
  ) {
    return {
      width: Math.round(withCanvas.canvasWidth),
      height: Math.round(withCanvas.canvasHeight),
    };
  }
  return adaptiveCanvasImageSize(art.width, art.height);
}

function artworkNodeSize(art: Pick<Artwork, "width" | "height">) {
  const image = artworkImageSize(art);
  return { width: image.width, height: image.height + NODE_LABEL_H, imageHeight: image.height };
}

function flowNodeSize(node: Node | undefined) {
  if (!node) return { width: NODE_W, height: NODE_H };
  const data = node.data as { width?: number; height?: number; nodeKind?: string } | undefined;
  const width = data?.width && data.width > 0 ? data.width : node.measured?.width || NODE_W;
  if (data?.nodeKind === "text") {
    const height = data.height && data.height > 0
      ? data.height
      : node.measured?.height || TEXT_NODE_DEFAULT_H;
    return { width, height };
  }
  const imageHeight = data?.height && data.height > 0 ? data.height : Math.max(110, (node.measured?.height || NODE_H) - NODE_LABEL_H);
  return { width, height: imageHeight + NODE_LABEL_H };
}
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
    <span
      className="block rounded-[3px] border-[1.5px] border-current"
      style={{ width: bw, height: bh }}
    />
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
function projectKey(a: Artwork, byId: Map<string, Artwork>): string {
  const r = rootOf(a, byId);
  if (isSuiteBatch(r.batchId)) return `batch:${r.batchId}`;
  // 稳定分组:优先用 group_id(删中间节点也不变,下游节点不会跑去别的项目);
  // 没有 group_id 的老数据回退到"血缘树根 id"。
  return `tree:${a.groupId || r.id}`;
}

// 占位节点(空白/上传中)动作上下文:让 React Flow 内的节点能调用主组件的上传
type PendCtx = {
  onUpload: (id: string) => void;
  onRemove: (id: string) => void;
};
const PendContext = createContext<PendCtx | null>(null);

type TextNodeCtx = {
  onRemove: (id: string) => void;
  onCopy: (text: string) => void;
  onContentChange: (id: string, content: string) => void;
  onContentCommit: (id: string, content: string) => void;
  onResize: (id: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  onToggleExpand: (id: string) => void;
};
const TextNodeContext = createContext<TextNodeCtx | null>(null);

function TextCanvasNode({ data, selected }: NodeProps) {
  const ctx = useContext(TextNodeContext);
  const d = data as {
    __id: string;
    title: string;
    prompt: string;
    content: string;
    status: CanvasTextNode["status"];
    sourceRefs?: Array<{ id: string; title: string }>;
    selected?: boolean;
    lightCanvas?: boolean;
    expanded?: boolean;
    settings?: CanvasNodeSettings;
    readOnly?: boolean;
    workflowPresentation?: { rotation: number; flipX: boolean; opacity: number };
  };
  const active = selected || d.selected;
  const body = d.content || d.prompt;
  const editableBody = d.status === "completed" || Boolean(d.content);
  return (
    <div className="group relative flex h-full w-full flex-col" style={d.workflowPresentation ? { transform: `rotate(${d.workflowPresentation.rotation}deg) scaleX(${d.workflowPresentation.flipX ? -1 : 1})`, opacity: d.workflowPresentation.opacity } : undefined}>
      <NodeResizer
        isVisible={active && !d.expanded && !d.readOnly && !d.settings?.locked}
        minWidth={TEXT_NODE_MIN_W}
        minHeight={TEXT_NODE_MIN_H}
        maxWidth={TEXT_NODE_MAX_W}
        maxHeight={String(data.__id || "").startsWith("text-import-") ? 100000 : TEXT_NODE_MAX_H}
        color="#315fc8"
        handleClassName="!h-2.5 !w-2.5 !border-2 !border-white !bg-[#315fc8]"
        lineClassName="!border-[#315fc8]"
        onResizeEnd={(_, bounds) =>
          ctx?.onResize(d.__id, {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          })
        }
      />
      {/* 标题行跟随画布明暗切换，避免浅色画布上的浅色标题失去对比度。 */}
      <div
        data-testid="text-node-title"
        className={cn(
          "mb-1.5 flex h-[30px] flex-none items-center gap-1.5 truncate pl-0.5 text-[clamp(14px,0.85vw,18px)] font-semibold leading-none",
          d.lightCanvas ? "text-[#303641]" : "text-[#e2e6ed]"
        )}
      >
        <span className="min-w-0 flex-1 truncate" title={d.title || "文字生成"}>
          {d.title || "文字生成"}
        </span>
        {d.status === "generating" && (
          <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-[#6bd7ec]" />
        )}
      </div>
      {/* 内容卡与图片节点统一；选中态使用稿定式清晰蓝框，不使用光晕。 */}
      <div
        data-testid="text-node-card"
        className={cn(
          "canvas-ui-node-card relative min-h-0 flex-1 overflow-auto rounded-[10px] border px-3 py-2.5 text-[12px] leading-[1.65] transition-all",
          d.lightCanvas ? "canvas-ui-light" : "canvas-ui-dark",
          active
            ? "canvas-ui-selected ring-2 ring-[#315fc8] ring-offset-2 ring-offset-transparent"
            : ""
        )}
      >
        {!!d.sourceRefs?.length && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {d.sourceRefs.map((reference) => (
              <span
                key={reference.id}
                className={cn(
                  "max-w-full truncate border px-1.5 py-0.5 text-[10px] font-semibold leading-4",
                  d.lightCanvas
                    ? "border-[#b9d0d8] bg-[#e8f2f5] text-[#315a68]"
                    : "border-[#24505f] bg-[#163842] text-[#8fe7f5]"
                )}
                title={`@${reference.title}`}
              >
                @{reference.title}
              </span>
            ))}
          </div>
        )}
        {d.status === "generating" ? (
          <div className="canvas-ui-muted flex h-[108px] items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#6366f1]" /> 正在生成文字…
          </div>
        ) : editableBody ? (
          <textarea
            aria-label="编辑生成文本"
            readOnly={d.readOnly || d.settings?.locked}
            style={nodeTextStyle(d.settings || DEFAULT_CANVAS_SETTINGS)}
            value={d.content}
            onChange={(event) => ctx?.onContentChange(d.__id, event.target.value)}
            onBlur={(event) => ctx?.onContentCommit(d.__id, event.currentTarget.value)}
            onPointerDown={(event) => event.stopPropagation()}
            className={cn(!d.settings?.text.color && "canvas-ui-text", "nodrag nowheel h-full min-h-[96px] w-full resize-none overflow-auto border-0 bg-transparent p-0 text-[12px] leading-[1.65] outline-none")}
          />
        ) : body ? (
          <p style={nodeTextStyle(d.settings || DEFAULT_CANVAS_SETTINGS)} className="whitespace-pre-wrap break-words">{body}</p>
        ) : (
          <p className="canvas-ui-muted">输入需求后生成文字内容</p>
        )}
      </div>
      <div className={cn("canvas-ui-surface-solid absolute right-1.5 top-1.5 hidden items-center gap-1 rounded-md pl-1 group-hover:flex", d.lightCanvas ? "canvas-ui-light" : "canvas-ui-dark")}>
        <button
          type="button"
          className="canvas-ui-action nodrag flex h-6 w-6 items-center justify-center"
          title={d.expanded ? "还原大小" : "放大查看"}
          onClick={(event) => {
            event.stopPropagation();
            ctx?.onToggleExpand(d.__id);
          }}
        >
          {d.expanded ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
        {!!d.content && (
          <button
            type="button"
            className="canvas-ui-action nodrag flex h-6 w-6 items-center justify-center"
            title="复制文字"
            onClick={(event) => {
              event.stopPropagation();
              ctx?.onCopy(d.content);
            }}
          >
            <span className="text-[11px]">⧉</span>
          </button>
        )}
        <button
          type="button"
          className="nodrag flex h-6 w-6 items-center justify-center text-[#7d8694] hover:bg-[#ff6b63]/15 hover:text-[#ff6b63]"
          title="删除文字节点"
          disabled={d.readOnly || d.settings?.locked}
          onClick={(event) => {
            event.stopPropagation();
            ctx?.onRemove(d.__id);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className={cn(
          "canvas-ui-port art-port !flex !h-12 !w-12 !-left-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-all",
          active
            ? "!opacity-100"
            : "!pointer-events-none !opacity-0 group-hover:!pointer-events-auto group-hover:!opacity-100"
        )}
      >
        <span className="pointer-events-none leading-none">+</span>
      </Handle>
      <Handle
        id="out"
        type="source"
        position={Position.Right}
        className={cn(
          "canvas-ui-port art-port !flex !h-12 !w-12 !-right-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-all",
          active
            ? "!opacity-100"
            : "!pointer-events-none !opacity-0 group-hover:!pointer-events-auto group-hover:!opacity-100"
        )}
      >
        <span className="pointer-events-none leading-none">+</span>
      </Handle>
    </div>
  );
}

// 占位/上传中节点(对齐参考站:空白节点→里面上传→进度条→填充)
function PendNode({ data, selected }: NodeProps) {
  const ctx = useContext(PendContext);
  const d = data as {
    label: string;
    uploading?: boolean;
    progress?: number;
    fileName?: string;
    fileInfo?: string;
    generating?: boolean;
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
  const sel = selected || d.selected;
  return (
    <div style={d.generating ? { width: d.generationSize?.width ?? 384 } : undefined} className={cn("group relative w-[320px]", d.lightCanvas ? "canvas-ui-light" : "canvas-ui-dark")}>
      {/* 标签(图片上方,对齐原型 .lb2) */}
      <div className="canvas-ui-text mb-1.5 flex h-[30px] items-center gap-1.5 truncate pl-0.5 text-[clamp(14px,0.85vw,18px)] font-semibold">
        <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{d.label}</span>
      </div>
      {/* 占位卡(原型 .nb2 + .ph2:单层卡片,选中=teal) */}
      <div
        style={d.generating ? { height: d.generationSize?.height ?? 384 } : undefined}
        className={cn(
          "canvas-ui-node-card relative flex h-[200px] flex-col items-center justify-center rounded-[12px] border px-5 text-center transition-all",
          sel
            ? "canvas-ui-selected ring-2 ring-[#315fc8] ring-offset-2 ring-offset-transparent"
            : "border-dashed"
        )}
      >
        {d.needsAttention ? (
          <div className="flex w-full flex-col items-center gap-2.5">
            <AlertTriangle className="h-6 w-6 text-[#b7791f]" />
            <div className="canvas-ui-text text-[13px] font-semibold">
              {d.attentionTitle || "视频任务需核对"}
            </div>
            <div className="canvas-ui-muted max-w-[250px] text-[11px] leading-5">
              {d.attentionHint || "任务已停止自动处理，请前往视频任务页核对后继续。"}
            </div>
            <Link
              href={d.attentionHref || "/video"}
              className="nodrag nopan rounded-md border border-[#c78b2c] bg-[#fff8e8] px-3 py-1.5 text-[11px] font-semibold text-[#8a5a12] transition-colors hover:bg-[#fff1cf]"
            >
              {d.attentionAction || "前往视频任务"}
            </Link>
          </div>
        ) : d.generating ? (
          <GenerationPlaceholder stage={d.generationStage} startedAt={d.generationStartedAt} count={d.generationCount} kind={d.generationKind} />
        ) : d.uploading ? (
          <div className="flex w-full flex-col items-center gap-2.5">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="canvas-ui-text text-[12px] font-medium">
              上传中（{Math.round(d.progress ?? 0)}%）
            </div>
            <div className="canvas-ui-control h-1.5 w-full overflow-hidden rounded-full border-0">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round(d.progress ?? 0)}%` }}
              />
            </div>
            {d.fileInfo && (
              <div className="canvas-ui-muted w-full truncate text-[10px]">
                {d.fileInfo}
              </div>
            )}
          </div>
        ) : (
          <>
            <ImageIcon className="canvas-ui-muted mb-2 h-6 w-6" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ctx?.onUpload(String((data as { __id?: string }).__id ?? ""));
              }}
              className="canvas-ui-control flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors hover:border-primary/60"
            >
              <Upload className="h-3.5 w-3.5" /> 上传图片
            </button>
          </>
        )}
      </div>
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        style={{ top: PORT_Y }}
        className="canvas-ui-port !flex !h-12 !w-12 !-left-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-colors"
      >
        <span className="pointer-events-none leading-none">+</span>
      </Handle>
      {!d.uploading && !d.generating && !d.needsAttention && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            ctx?.onRemove(String((data as { __id?: string }).__id ?? ""));
          }}
          className="canvas-ui-control nodrag absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
          title="删除空白节点"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// 自定义连线:点亮链路时叠多层彗星流光(严格对齐原型 cw-tail/body/head/spark)
function CometEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const d = data as { lit?: boolean; dim?: boolean } | undefined;
  const lit = !!d?.lit;
  return (
    <>
      {/* 加宽的透明命中区:让"鼠标放到线上"更容易触发悬停/剪断 */}
      <path
        className="react-flow__edge-interaction"
        d={path}
        fill="none"
        strokeWidth={22}
        stroke="transparent"
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
      />
      <path
        className={cn("cw-base", lit && "cw-on", d?.dim && "cw-dim2")}
        d={path}
        fill="none"
      />
      {lit && (
        <>
          <path className="cw-comet cw-tail" pathLength={100} d={path} fill="none" />
          <path className="cw-comet cw-body" pathLength={100} d={path} fill="none" />
          <path className="cw-comet cw-head" pathLength={100} d={path} fill="none" />
          <path className="cw-comet cw-spark" pathLength={100} d={path} fill="none" />
        </>
      )}
    </>
  );
}

/**
 * 画布视频节点表面(参照 infinite-canvas):原生 video 元素 + 播放/放大角标 +
 * 时长显示。未选中自动暂停；选中后可聚焦视频表面并用空格播放。
 * 所有媒体控件都隔离 React Flow 的拖动、滚轮和平移快捷键。
 */
function VideoNodeSurface({url,selected,kind,onExtract}:{url:string;selected:boolean;kind:"video"|"audio";onExtract?:(action:VideoPlayerAction)=>void}) {
  return <VideoPlayer url={url} selected={selected} kind={kind} compact onProcess={onExtract}/>;
}

function ArtNode({ data, selected, id: nodeId }: NodeProps) {
  const d = data as {
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
    lightCanvas?: boolean;
    onDimensions?: (id: string, width: number, height: number) => void;
    workflowPresentation?: { rotation: number; flipX: boolean; opacity: number };
    missingAsset?: boolean;
    onFill?: () => void;
    onCanvasResize?: (
      id: string,
      bounds: { x: number; y: number; width: number; height: number }
    ) => void;
    onCanvasRatioRepair?: (id: string, width: number, height: number) => void;
    onRenameRequest?: (id: string, label: string) => void;
    onVideoExtract?: (id: string, action: VideoPlayerAction) => void;
    settings?: CanvasNodeSettings;
    readOnly?: boolean;
  };
  const imageWidth = d.width && d.width > 0 ? Math.round(d.width) : undefined;
  const imageHeight = d.height && d.height > 0 ? Math.round(d.height) : undefined;
  // 节点边界=图片区域(标题绝对定位悬在图上方,不占边界),端口对齐图片竖直中点
  const portY = (imageHeight ?? 110) / 2;
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [forceOriginal, setForceOriginal] = useState(false);
  const preview = !forceOriginal && !!d.intrinsicWidth && !!d.intrinsicHeight;
  const previousImage = useRef(d.image);
  useEffect(() => {
    if (previousImage.current === d.image) return;
    previousImage.current = d.image;
    setForceOriginal(false); setNaturalSize(null); aspectFixedRef.current = false;
  }, [d.image]);
  const title = d.pending
    ? d.label
    : `${d.version ? `v${d.version}` : ""}${d.date ? ` · ${formatDate(d.date)}` : ""}${d.prompt ? `\n${d.prompt}` : ""}`;
  // 缺尺寸/预览宽高比与元数据不符时回源解码；缩略图像素绝不回写为原图尺寸。
  // 这里只静默修复显示高度，不写坐标、不污染用户撤销栈。
  const aspectFixedRef = useRef(false);
  useEffect(() => {
    if (aspectFixedRef.current || nodeId.startsWith("art-import-") || d.pending || d.videoUrl || !naturalSize) return;
    const iw = naturalSize.width;
    const ih = naturalSize.height;
    const cw = d.width;
    const ch = d.height;
    if (!iw || !ih || !cw || !ch) return;
    const imgRatio = iw / ih;
    const nodeRatio = cw / ch;
    if (Math.abs(nodeRatio - imgRatio) / imgRatio < 0.05) return;
    aspectFixedRef.current = true;
    d.onCanvasRatioRepair?.(
      nodeId,
      Math.round(cw),
      Math.max(IMAGE_NODE_MIN_H, Math.min(IMAGE_NODE_MAX_H, Math.round(cw / imgRatio)))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, naturalSize, d.width, d.height, d.pending, d.videoUrl]);
  return (
    <div
      className={cn("group relative flex h-full w-full flex-col", d.lightCanvas ? "canvas-ui-light" : "canvas-ui-dark")}
      data-image-width={imageWidth}
      data-image-height={imageHeight}
      data-intrinsic-width={d.intrinsicWidth || undefined}
      data-intrinsic-height={d.intrinsicHeight || undefined}
      data-canvas-group-id={d.canvasGroupId || undefined}
    >
      <NodeResizer
        isVisible={selected && !d.pending && !d.readOnly && !d.settings?.locked}
        keepAspectRatio
        minWidth={IMAGE_NODE_MIN_W}
        minHeight={IMAGE_NODE_MIN_H}
        maxWidth={IMAGE_NODE_MAX_W}
        maxHeight={IMAGE_NODE_MAX_H}
        color="#315fc8"
        handleClassName="!h-3 !w-3 !border-2 !border-white !bg-[#315fc8]"
        lineClassName="!border-[#315fc8]"
        onResizeEnd={(_, bounds) =>
          d.onCanvasResize?.(d.id, {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: Math.max(IMAGE_NODE_MIN_H, bounds.height),
          })
        }
      />

      {/* 标题悬在图片上方(节点边界外):选中框/缩放框只框图片,不框标题。未选中时仅显示文件名,点击后显示标记/分组/版本。 */}
      <div className="art-title absolute -top-[38px] left-0 right-0 z-10 flex h-[30px] items-center gap-1.5 truncate pl-0.5 text-[clamp(14px,0.85vw,18px)] font-semibold leading-none text-[#e2e6ed]">
        <span
          className="nodrag min-w-0 flex-1 cursor-text truncate"
          title={`${d.label} · 双击编辑`}
          onDoubleClick={(event) => {
            event.stopPropagation();
            d.onRenameRequest?.(d.id, d.label);
          }}
        >
          {d.label}
        </span>
        {selected && d.marked && (
          <MapPin className="h-3 w-3 flex-none fill-amber-400 text-amber-400" />
        )}
        {d.settings?.locked && <Lock className="h-3.5 w-3.5 shrink-0" aria-label="节点已锁定" />}
        {selected && d.canvasGroupId && (
          <Combine className="h-3 w-3 flex-none text-[#6bd7ec]" aria-label="已成组" />
        )}
        {selected && d.version && (
          <span className="art-version ml-auto flex-none rounded bg-white/10 px-1 text-[10px] font-semibold text-slate-200">
            v{d.version}
          </span>
        )}
      </div>

      {/* 图片卡使用单层边框；选中态为稿定式蓝色描边与外环。 */}
      <div
        title={title}
        className={cn(
          "canvas-ui-node-card relative min-h-0 flex-1 overflow-hidden rounded-[10px] border transition-all",
          selected
            ? "canvas-ui-selected ring-2 ring-[#315fc8] ring-offset-2 ring-offset-transparent"
            : d.inChain
              ? "border-[#6366f1]/50"
              : "border-transparent"
        )}
      >
        {d.pending ? (
          <GenerationPlaceholder stage={d.generationStage} startedAt={d.generationStartedAt} count={d.generationCount} completed={d.generationCompleted} />
        ) : d.videoUrl && d.category==="media" ? (
          <div className="flex h-full items-center justify-center p-3"><a className="nodrag nowheel nokey rounded-lg bg-current/5 px-3 py-2 text-xs" href={mediaDownloadHref(d.videoUrl,d.label)} download>下载 {d.label}</a></div>
        ) : d.videoUrl ? (
          <VideoNodeSurface url={d.videoUrl} selected={selected} kind={d.category === "audio" ? "audio" : "video"} onExtract={action => d.onVideoExtract?.(d.id, action)} />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <CanvasImage
              key={d.image as string}
              source={d.image as string}
              forceOriginal={forceOriginal}
              hasDimensions={!!d.intrinsicWidth && !!d.intrinsicHeight}
              decoding="async"
              onError={event => { if(event.currentTarget.dataset.mediaVariant!=='original')setForceOriginal(true);else onImgError(event,d.image as string); }}
              alt={d.label}
              draggable={false}
              width={imageWidth}
              height={imageHeight}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (!(image.naturalWidth > 0) || !(image.naturalHeight > 0)) return;
                const optimized = preview && image.dataset.mediaVariant !== 'original';
                if (optimized && Math.abs(image.naturalWidth / image.naturalHeight - d.intrinsicWidth! / d.intrinsicHeight!) > 0.02) {
                  setForceOriginal(true); return;
                }
                const width = optimized ? d.intrinsicWidth! : image.naturalWidth;
                const height = optimized ? d.intrinsicHeight! : image.naturalHeight;
                setNaturalSize((current) =>
                  current?.width === width && current.height === height
                    ? current
                    : { width, height }
                );
                if (
                  d.intrinsicWidth !== width || d.intrinsicHeight !== height
                ) d.onDimensions?.(d.id, width, height);
              }}
              className="block h-full w-full object-contain"
              style={d.workflowPresentation ? { transform: `rotate(${d.workflowPresentation.rotation}deg) scaleX(${d.workflowPresentation.flipX ? -1 : 1})`, opacity: d.workflowPresentation.opacity } : undefined}
            />
            {d.missingAsset && <div data-testid="workflow-missing-asset" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50/80 text-slate-500">
              <ImagePlus className="h-8 w-8 text-slate-400" />
              <span className="text-sm font-medium">待补图片</span>
              {!d.readOnly && <button type="button" className="nodrag nopan rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                disabled={d.settings?.locked} onClick={event=>{event.stopPropagation();d.onFill?.();}}>补充图片</button>}
            </div>}
            {selected && d.rootLabel && (
              <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {d.rootLabel}
              </span>
            )}
            {selected && d.processingKind && <span className="absolute bottom-1.5 left-1.5 bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{d.processingKind === "resize" ? "普通缩放" : d.processingKind === "native" ? "原生像素已校验" : d.processingKind === "ai-upscale" ? "AI 超分" : "底图"} · {naturalSize?.width || d.intrinsicWidth}×{naturalSize?.height || d.intrinsicHeight}</span>}
          </>
        )}
      </div>

      {/* 端口(原型 .port:22px 圆,top:78,hover 变 teal);左右都是 + 圆点 */}
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        style={{ top: portY }}
        className={cn(
          "canvas-ui-port art-port !flex !h-12 !w-12 !-left-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-all",
          selected
            ? "!opacity-100"
            : "!pointer-events-none !opacity-0 group-hover:!pointer-events-auto group-hover:!opacity-100"
        )}
      >
        <span className="pointer-events-none leading-none">+</span>
      </Handle>
      {!d.pending && (
        <Handle
          id="out"
          type="source"
          position={Position.Right}
          style={{ top: portY }}
          className={cn(
            "canvas-ui-port art-port !flex !h-12 !w-12 !-right-6 !-translate-y-1/2 !items-center !justify-center !rounded-full !border-2 !text-[26px] !font-medium !leading-none shadow-lg transition-all",
            selected
              ? "!opacity-100"
              : "!pointer-events-none !opacity-0 group-hover:!pointer-events-auto group-hover:!opacity-100"
          )}
        >
          <span className="pointer-events-none leading-none">+</span>
        </Handle>
      )}
    </div>
  );
}

// 计算当前选中节点的整条血缘链路:上溯所有祖先 + 下延所有衍生(含自身)
function lineageChain(
  members: Artwork[],
  selectedId: string | null
): Set<string> {
  const chain = new Set<string>();
  if (!selectedId) return chain;
  const byId = new Map(members.map((m) => [m.id, m]));
  // 某节点的全部父(primary + 多输入);canvas-add 独立节点无血缘父
  const parentsOf = (m: Artwork): string[] => {
    if (m.source === "canvas-add") return [];
    const ps: string[] = [];
    if (m.parentId && byId.has(m.parentId)) ps.push(m.parentId);
    for (const pid of m.parentIds ?? [])
      if (pid && byId.has(pid) && pid !== m.parentId) ps.push(pid);
    return ps;
  };
  const childrenOf = new Map<string, string[]>();
  for (const m of members) {
    for (const p of parentsOf(m)) {
      const arr = childrenOf.get(p) ?? [];
      arr.push(m.id);
      childrenOf.set(p, arr);
    }
  }
  // 上溯祖先(含多输入父,BFS)
  const up = [selectedId];
  let guard = 0;
  while (up.length && guard++ < 2000) {
    const id = up.pop() as string;
    if (chain.has(id)) continue;
    chain.add(id);
    const m = byId.get(id);
    if (m) for (const p of parentsOf(m)) up.push(p);
  }
  // 下延衍生(BFS)
  const stack = [selectedId];
  while (stack.length) {
    const id = stack.pop() as string;
    for (const c of childrenOf.get(id) ?? []) {
      if (!chain.has(c)) {
        chain.add(c);
        stack.push(c);
      }
    }
  }
  return chain;
}

// 画布助手的一轮对话(user/assistant 纯文本;assistant 内容可含 [[GEN]]…[[/GEN]] 生图块)
type AssistantTurn = { id: string; role: "user" | "assistant"; content: string; artifacts?: {id:string;image:string;title:string}[] };

// 画布助手上下文:锚定节点 + 上游祖先(BFS 近者优先),最多 5 张(与后端 MAX_CONTEXT_IMAGES 对齐)
function assistantContext(members: Artwork[], anchorId: string): Artwork[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const anchor = byId.get(anchorId);
  if (!anchor) return [];
  const parentsOf = (m: Artwork): string[] => {
    if (m.source === "canvas-add") return [];
    const ps: string[] = [];
    if (m.parentId && byId.has(m.parentId)) ps.push(m.parentId);
    for (const pid of m.parentIds ?? [])
      if (pid && byId.has(pid) && pid !== m.parentId) ps.push(pid);
    return ps;
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

// 把一组作品(可能是森林:多个根)排成整齐的血缘树布局
function layoutGraph(
  arts: Artwork[],
  rootLabel: string,
  onDimensions: (id: string, width: number, height: number) => void,
  onCanvasResize: (
    id: string,
    bounds: { x: number; y: number; width: number; height: number }
  ) => void,
  onCanvasRatioRepair: (id: string, width: number, height: number) => void,
  onRenameRequest: (id: string, label: string) => void,
  onVideoExtract: (id: string, action: VideoPlayerAction) => void
): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(arts.map((a) => [a.id, a]));
  const sorted = [...arts].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const a of sorted) {
    // 手动加的节点(canvas-add:上传/副本/从历史)是独立节点:不连父、自成一格
    const p =
      a.parentId && byId.has(a.parentId) && a.source !== "canvas-add"
        ? a.parentId
        : null;
    if (p) {
      const arr = children.get(p) ?? [];
      arr.push(a.id);
      children.set(p, arr);
    } else {
      roots.push(a.id);
    }
  }
  // 按图片真实像素尺寸布局，确保 900×900 图片在画布坐标中就是 900×900，
  // 同时为每一层预留该层最宽节点，避免大图与下游节点重叠。
  const pos: Record<string, { x: number; y: number }> = {};
  const depthById = new Map<string, number>();
  const assignDepth = (id: string, depth: number) => {
    if ((depthById.get(id) ?? -1) >= depth) return;
    depthById.set(id, depth);
    for (const child of children.get(id) ?? []) assignDepth(child, depth + 1);
  };
  roots.forEach((root) => assignDepth(root, 0));
  const widthByDepth = new Map<number, number>();
  for (const art of sorted) {
    const depth = depthById.get(art.id) ?? 0;
    widthByDepth.set(depth, Math.max(widthByDepth.get(depth) ?? 0, artworkNodeSize(art).width));
  }
  const xByDepth = new Map<number, number>();
  let xCursor = 0;
  const maxDepth = Math.max(0, ...Array.from(depthById.values()));
  for (let depth = 0; depth <= maxDepth; depth++) {
    xByDepth.set(depth, xCursor);
    xCursor += (widthByDepth.get(depth) ?? NODE_W) + X_GAP;
  }
  let leafY = 0;
  const place = (id: string, depth: number) => {
    const kids = children.get(id) ?? [];
    const size = artworkNodeSize(byId.get(id) as Artwork);
    if (kids.length === 0) {
      pos[id] = { x: xByDepth.get(depth) ?? 0, y: leafY };
      leafY += size.height + Y_GAP;
    } else {
      kids.forEach((k) => place(k, depth + 1));
      const centers = kids.map((k) => pos[k].y + artworkNodeSize(byId.get(k) as Artwork).height / 2);
      pos[id] = {
        x: xByDepth.get(depth) ?? 0,
        y: (Math.min(...centers) + Math.max(...centers)) / 2 - size.height / 2,
      };
    }
  };
  roots.forEach((r) => place(r, 0));
  const nodes: Node[] = sorted.map((a, idx) => {
    const isRoot = !(a.parentId && byId.has(a.parentId));
    const canvasSize = artworkImageSize(a);
    // 手动拖过的节点用记住的坐标,否则用自动布局
    const position =
      a.canvasX != null && a.canvasY != null
        ? { x: a.canvasX, y: a.canvasY }
        : pos[a.id] ?? { x: 0, y: 0 };
    return {
      id: a.id,
      type: "art",
      position,
      data: {
        id: a.id,
        category: a.category,
        image: a.image,
        videoUrl: a.videoUrl ?? undefined,
        label: a.title,
        rootLabel: isRoot ? rootLabel : null,
        version: idx + 1, // 项目内按生成时间的版本序号
        prompt: a.prompt,
        date: a.createdAt,
        marked: !!a.marked,
        canvasGroupId: a.canvasGroupId ?? null,
        ratio: a.ratio,
        width: canvasSize.width,
        height: canvasSize.height,
        intrinsicWidth: a.width,
        processingKind: a.processingKind,
        intrinsicHeight: a.height,
        onDimensions,
        onCanvasResize,
        onCanvasRatioRepair,
        onRenameRequest,
        onVideoExtract,
      },
      style: {
        width: canvasSize.width,
        // 标题是负 top 的绝对定位元素，不占节点边界；节点高度必须等于图片卡高度。
        height: canvasSize.height,
      },
    };
  });
  const edges: Edge[] = [];
  for (const a of sorted) {
    // primary 血缘边(canvas-add 独立节点不画)
    if (a.parentId && byId.has(a.parentId) && a.source !== "canvas-add") {
      edges.push({
        id: `e-${a.parentId}-${a.id}`,
        source: a.parentId as string,
        sourceHandle: "out",
        target: a.id,
        targetHandle: "in",
        type: "default",
      });
    }
    // 多输入额外边(显式连接,总是画)
    for (const pid of a.parentIds ?? []) {
      if (pid && byId.has(pid) && pid !== a.parentId) {
        edges.push({
          id: `e-${pid}-${a.id}`,
          source: pid,
          sourceHandle: "out",
          target: a.id,
          targetHandle: "in",
          type: "default",
        });
      }
    }
  }
  return { nodes, edges };
}

export function CanvasClient({ initialProject, desktopAppearance = false }: { initialProject?: string; desktopAppearance?: boolean } = {}) {
  const { can: canFeature } = useFeatureAccess();
  const billing=useBilling();
  async function privateFetch(input:RequestInfo|URL,init:RequestInit={}){
    const path=String(input).split('?')[0];
    const features:Record<string,FeatureId>={"/api/generate-image":"canvas.image","/api/aplus":"image.aplus","/api/suite":"image.suite","/api/cutout":"tool.cutout","/api/canvas/image-tasks":"canvas.image","/api/canvas/expand":"canvas.expand","/api/canvas/text-edit":"canvas.text-edit","/api/canvas/annotate":"canvas.annotate","/api/canvas/text-generate":"canvas.text-generate","/api/canvas/assistant":"canvas.assistant","/api/canvas/ocr":"canvas.ocr","/api/video/generate":"video.generate"};
    if(init.method!=="POST"||!features[path])return privateFetchRaw(input,init);
    const form=init.body instanceof FormData?init.body:null;
    const body=form?Object.fromEntries(Array.from(form.entries()).filter((entry)=>typeof entry[1]==="string")):typeof init.body==="string"?JSON.parse(init.body):{};
    if(path==="/api/generate-image"&&form&&user&&body.ratiogen!=="1"&&(!body.userPrompt||String(body.userPrompt).trim()===String(body.prompt).trim()))return submitCanvasImagegen(form,active?.members[0]?.id,message=>flashTip(message),{owner:user.email,project:active?.key||"workspace"});
    if (path === "/api/generate-image") {
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
    if (body.quality) headers.set("x-naumi-image-quality", String(body.quality));
    headers.set("x-naumi-canvas","1");
    const feature=features[path],modelId=["/api/aplus","/api/suite"].includes(path)?body.modelId||body.model||genModel:adminConfiguredFeature(feature) ? undefined : featureModelManaged(feature) && !["image.generate","video.generate"].includes(feature) ? chosenFeatureModel(feature) : body.modelId||body.model||undefined;
    return billing.quoteAndSubmit(path,{...init,headers},{canvas:true,feature,quantity,quality:String(body.quality||genQuality),resolution:String(body.resolution||source?.resolution||"1K"),modelId,providerId:body.providerId,ratio:body.ratio});
  }
  const { model: textModel, setModel: setTextModel } = useTextModel();
  const { user, ready, remaining, persistMode, applyServerUser, signOut } = useAuth();
  const { openAuth } = useAuthModal();
  const { openRecharge } = useRecharge();
  const { t, locale } = useI18n();
  const router = useRouter();
  const { commerceVisible } = usePaymentConfig();
  const accountIsAdmin = useAccountAdminStatus(user);
  const [works, setWorks] = useState<Artwork[] | null>(null);
  // works 的同步镜像:供 useCallback(如缩放撤销记录)读取最新值而不重挂回调
  const worksRef = useRef<Artwork[] | null>(null);
  useEffect(() => {
    worksRef.current = works;
  }, [works]);
  const dimensionSyncRef = useRef(new Set<string>());
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
  // 仅"后台深链 ?node="进入时才自动平移聚焦;日常新建/上传/生成节点都不动画布
  const deepFocusRef = useRef(false);
  // 是否已做过"刷新恢复上次项目"的初始化(避免初始挂载误清本地保存)
  const restoredRef = useRef(false);
  // 「基于上一级重做」:切到父节点时把本节点提示词带过去(避免被选中-清空逻辑抹掉)
  const carryPromptRef = useRef<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [browserTab, setBrowserTab] = useState<"all" | "workflows">("all");
  const cancelEditRef = useRef(false); // Esc 取消时跳过失焦保存
  const [editPrompt, setEditPrompt] = useState("");
  const [genModel, setGenModel] = useState("");
  const [imagegenPanel,setImagegenPanel]=useState<{inputs:ImagegenPanelInput[];sourceNodeId?:string;x:number;y:number}|null>(null);
  const imagegenPlacement=useRef(new Map<string,number>());
  const { quality: genQuality, imageCost, modelConfig } = useImageQuality("canvas.image", genModel);
  const expandQuality = useImageQuality("canvas.expand").quality;
  const textEditQuality = useImageQuality("canvas.text-edit").quality;
  const annotateQuality = useImageQuality("canvas.annotate").quality;
  const canvasToolQualities: Partial<Record<FeatureId,string>> = {"canvas.expand":expandQuality,"canvas.text-edit":textEditQuality,"canvas.annotate":annotateQuality};
  const { catalog: canvasImageCatalog, selected: canvasImageModel, setSelected: setCanvasImageModel, error: canvasImageCatalogError } = useFeatureModels("canvas.image");
  const [imageModels, setImageModels] = useState<ImageModelOption[]>([]);
  const [genRatio, setGenRatio] = useState("auto"); // 默认自适应
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
  // 左下控件:小地图开关、网格吸附(原型默认吸附 on)
  const [showMinimap, setShowMinimap] = useState(false);
  const [snapGrid, setSnapGrid] = useState(true);
  const [genError, setGenError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [stitching, setStitching] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );
  const [focusId, setFocusId] = useState<string | null>(null);
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
  const [extraPreviews, setExtraPreviews] = useState<string[]>([]);
  const extraInputRef = useRef<HTMLInputElement>(null);
  // 节点剪贴板(复制/粘贴节点)+ 上传作根节点的文件 input
  const nodeClipRef = useRef<Artwork | null>(null);
  const genericNodeClipRef=useRef<{marker:string;ids:string[];owner:string}|null>(null);
  const copyAttemptsRef=useRef(new Map<string,string>());
  const pendingNodeSelectionRef=useRef<{ids:string[];projectKey:string;owner:string}|null>(null);
  // window copy 只消费紧邻本次画布 Cmd/Ctrl+C 的一次事件，不能让陈旧节点
  // 覆盖后续普通网页文本复制。
  const canvasCopyIntentRef = useRef<string | null>(null);
  const canvasCopyHandlerRef = useRef<(event: ClipboardEvent) => void>(() => {});
  const canvasPasteHandlerRef = useRef<(event: ClipboardEvent) => void>(() => {});
  const [hasClip, setHasClip] = useState(false);
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
    positions: { x: number; y: number }[];
    rects: { x: number; y: number; width: number; height: number; owner: number; index: number }[];
  }>({ rootId: null, queue: Promise.resolve(), positions: [], rects: [] });
  const importSeqRef = useRef(0);
  const dragDepthRef = useRef(0);
  const [fileDragOver, setFileDragOver] = useState(false);
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
  const [imageImports, setImageImports] = useState<{
    id: number; total: number; done: number; success: number; finished: boolean;
    errors: { name: string; message: string }[];
    phase: "optimizing" | "uploading" | "done";
    originalBytes: number; uploadBytes: number; uploadedBytes: number;
  }[]>([]);

  function resetImportScope() {
    importScopeRef.current = { rootId: null, queue: Promise.resolve(), positions: [], rects: [] };
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
  }, [genModel, imageModels]);

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
  const duplicateBusyRef = useRef(new Set<string>());
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
  const [trashItems, setTrashItems] = useState<Artwork[] | null>(null);
  const [trashBusy, setTrashBusy] = useState(false);
  // 剪刀剪线:鼠标悬停的连线 + 光标在画布内的位置(屏幕坐标,相对 canvasArea)
  const [edgeCut, setEdgeCut] = useState<{
    id: string;
    source: string;
    target: string;
    x: number;
    y: number;
  } | null>(null);
  // 连线选中(RF 原生点击选中):Delete/Backspace 才剪断,不再点一下就删
  const [selectedEdge, setSelectedEdge] = useState<{
    id: string;
    source: string;
    target: string;
  } | null>(null);
  const cuttingEdgesRef = useRef(new Set<string>());
  // 占位/空白节点(添加节点/拉线建节点 → 先出空白节点,里面上传带进度,完成后变真节点)
  type Pend = {
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
  const [pendNodes, setPendNodes] = useState<Pend[]>([]);
  const pendNodesRef = useRef(pendNodes); pendNodesRef.current = pendNodes;
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
  const [textNodes, setTextNodes] = useState<CanvasTextNode[]>([]);
  const textNodesRef = useRef(textNodes); textNodesRef.current = textNodes;
  const [textNodesReady, setTextNodesReady] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [textPrompt, setTextPrompt] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
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
  const [videoEditId,setVideoEditId]=useState<string|null>(null);
  const [videoHistoryId,setVideoHistoryId]=useState<string|null>(null);
  const videoResultAttempts=useRef(new Map<string,{operationId:string;operations:Record<string,unknown>[];from:string|null;to:string|null}>());
  const [videoMedia,setVideoMedia]=useState<{id:string;projectKey:string;initial:VideoPlayerAction}|null>(null);
  const videoNodesStore=useVideoNodes({email:user?.email,readOnly,request:privateFetchRaw});
  const videoAssetStore=useVideoAssets({email:user?.email,readOnly,request:privateFetchRaw});
  const imageMoreRef = useRef<HTMLButtonElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const [videoCatalog, setVideoCatalog] = useState<CanvasVideoCapability[]>([]);

  useEffect(()=>{
    let cancelled=false;if(!ready||!user){setVideoCatalog([]);return;}
    const load=async()=>{try{const response=await privateFetchRaw("/api/video/catalog",{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.error||"视频模型加载失败");if(!cancelled)setVideoCatalog(Array.isArray(data.models)?data.models:[]);}catch{if(!cancelled)setVideoCatalog([]);}};
    void load();window.addEventListener(MODEL_CATALOG_REFRESH,load);return()=>{cancelled=true;window.removeEventListener(MODEL_CATALOG_REFRESH,load);};
  },[ready,user?.email]);
  const [annotateArtwork, setAnnotateArtwork] = useState<Artwork | null>(null);
  // 画布助手:围绕选中节点+上游链的多轮对话,[[GEN]] 提示词可一键生图回画布
  const [assistantArtworkId, setAssistantArtworkId] = useState<string | null>(null);
  const [assistantTurns, setAssistantTurns] = useState<AssistantTurn[]>([]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantSkill, setAssistantSkill] = useState<ImageSkill | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantResponding, setAssistantResponding] = useState(false);
  const [assistantSteps, setAssistantSteps] = useState<AgentOrbStep[]>([]);
  const [assistantOutcome, setAssistantOutcome] = useState<AgentOrbOutcome>("idle");
  const orbCompanion = useOrbCompanion(`${user?.email || ""}:${activeKey || "workspace"}`);
  const orbCue = orbCompanion.emit;
  const assistantController = useRef<AbortController | null>(null);
  const assistantSessionId = useRef(browserRandomUUID());
  const assistantLiveSessionId = useRef("");
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const assistantRetry = useRef<{ input: string; anchorId: string; history: AssistantTurn[]; body: string } | null>(null);
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
    setAssistantError(null);
    setAssistantBusy(false);
    assistantRetry.current = null;
  }, [activeKey, user?.email]);
  useEffect(() => () => { assistantRequestEpoch.current += 1; assistantController.current?.abort(); }, []);
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
  const [selectedPendId, setSelectedPendId] = useState<string | null>(null);
  const selectedPendIdRef = useRef(selectedPendId); selectedPendIdRef.current = selectedPendId;
  // 新建项目:进入空白画布(无任何节点),右键添加节点/上传第一张图后即成新项目并切过去
  const [creatingNew, setCreatingNew] = useState(false);
  // 项目网格落地页(Figma 式):进画布先看项目卡片,点卡片才进入该项目的画布
  const [browsing, setBrowsing] = useState(true);
  // 浏览器后退支持:进做图页(browsing=false)时往历史压一条,使「后退」先回项目页而非离开 /canvas。
  const editorPushedRef = useRef(false);
  const browsingRef = useRef(true);
  // 剩余积分(右上会员挂件展示)
  const [credits, setCredits] = useState<number | null>(null);
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
  async function refreshCredits() {
    const em = targetEmail || user?.email;
    if (!em) return;
    try {
      const r = await fetch(`/api/account?email=${encodeURIComponent(em)}`, {
        headers: await authHeader(),
      });
      const d = await r.json();
      const u = d?.user as
        | { creditsTotal?: number; creditsUsed?: number }
        | undefined;
      if (u && typeof u.creditsTotal === "number")
        setCredits(Math.max(0, u.creditsTotal - (u.creditsUsed ?? 0)));
    } catch {
      /* ignore */
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
  // 撤销/重做(实用版:移动/删除/添加/连线/文字编辑/重命名/缩放/标记)
  // 文字节点字段快照:撤销文案编辑、引用增删、产品绑定、尺寸、标题的最小数据
  type TextPatchFields = Pick<
    CanvasTextNode,
    "title" | "content" | "sourceIds" | "targetIds" | "productIds" | "width" | "height"
  >;
  const textPatchOf = (node: CanvasTextNode): TextPatchFields => ({
    title: node.title,
    content: node.content,
    sourceIds: [...(node.sourceIds ?? [])],
    targetIds: [...(node.targetIds ?? [])],
    productIds: [...(node.productIds ?? [])],
    width: node.width,
    height: node.height,
  });
  type VideoPatchFields=Partial<Pick<CanvasVideoNode,"title"|"config"|"inputs"|"x"|"y"|"width"|"height">>;
  type UndoAct =
    | {kind:"video-patch";id:string;from:VideoPatchFields;to:VideoPatchFields}
    | {kind:"video-result";id:string;from:string|null;to:string|null}
    | {kind:"video-add";records:CanvasVideoNode[]}

    | { kind: "pending-link"; id: string; from: Pick<Pend, "inputs" | "parentId" | "linked">; to: Pick<Pend, "inputs" | "parentId" | "linked"> }
    | { kind: "workflow-add"; artworks: Artwork[]; textNodes: CanvasTextNode[] }
    | {kind:"mixed-add";artworks:Artwork[];textNodes:CanvasTextNode[];videoNodes:CanvasVideoNode[];projectKey:string}
    | { kind: "workflow-fill"; id: string; assetOperationId: string; from: Artwork; to: Artwork }
    | { kind: "node-settings"; id: string; text: boolean; video?:boolean; from: CanvasNodeSettings; to: CanvasNodeSettings }
    | { kind: "move"; id: string; from: { x: number; y: number }; to: { x: number; y: number } }
    | {
        kind: "move-many";
        moves: Array<{
          id: string;
          from: { x: number; y: number };
          to: { x: number; y: number };
        }>;
      }
    | {
        kind: "canvas-group";
        changes: Array<{
          id: string;
          from: string | null;
          to: string | null;
        }>;
      }
    | { kind: "delete"; records: Artwork[] }
    | {
        kind: "mixed-delete";
        artworks: Artwork[];
        textNodes: CanvasTextNode[];
        videoNodes?:CanvasVideoNode[];
      }
    | { kind: "add"; records: Artwork[] }
    | { kind: "text-delete"; records: CanvasTextNode[] }
    | { kind: "text-add"; records: CanvasTextNode[] }
    | { kind: "text-move"; id: string; from: { x: number; y: number }; to: { x: number; y: number } }
    // 血缘连线增删(undo/redo 应用反向)
    | { kind: "parent"; targetId: string; parentId: string; added: boolean }
    // 文字节点字段级快照(内容/引用/产品绑定/尺寸):undo 应用 from,redo 应用 to
    | { kind: "text-patch"; id: string; from: TextPatchFields; to: TextPatchFields }
    // 节点重命名
    | { kind: "rename"; id: string; from: string; to: string }
    // 图片节点画布尺寸/位置(NodeResizer 手动拖拽)
    | {
        kind: "art-size";
        id: string;
        from: { x: number; y: number; width: number; height: number };
        to: { x: number; y: number; width: number; height: number };
      }
    // 标记/取消标记(逐 id 记录原值,批量操作共用)
    | { kind: "mark"; changes: Array<{ id: string; from: boolean; to: boolean }> };
  const [undoStack, setUndoStack] = useState<UndoAct[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAct[]>([]);
  const pushUndo = useCallback((action: UndoAct) => {
    setUndoStack((stack) => [...stack.slice(-50), action]);
    setRedoStack([]);
  }, []);
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
      const artworks = result.artworks as Artwork[], importedIds = new Set(artworks.map(n => n.id));
      setWorks(current => [...(current || []).filter(n => !importedIds.has(n.id)), ...artworks]);
      const textIds = new Set(result.textNodes.map(n => n.id));
      setTextNodes(current => [...current.filter(n => !textIds.has(n.id)), ...result.textNodes]);
      setWorkflowManifests(current => [...current.filter(m => m.operationId !== result.operationId), result.manifest]);
      const settings = { ...nodeSettingsRef.current, ...result.settings }; nodeSettingsRef.current = settings; setNodeSettings(settings);
      pushUndo({ kind: "workflow-add", artworks, textNodes: result.textNodes });
      setCreatingNew(false); setActiveKey(result.projectKey); setSelectedId(null); setSelectedTextId(null);
      const missingAssets = artworks.filter(n => n.source === "workflow-placeholder").length;
      flashTip(missingAssets ? `工作流已导入，${missingAssets} 张图片待补齐` : result.missingReferences ? `工作流已导入，${result.missingReferences} 个外部引用未包含在选择中` : "工作流已导入");
      const ids = [...artworks.map(n => n.id), ...result.textNodes.map(n => n.id)];
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => void rfRef.current?.fitView({ nodes: ids.map(id => ({ id })), padding: 0.2, duration: 240, maxZoom: 1 })));
    } });
  const dragStartRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const selectionDragStartRef = useRef<
    Record<string, { x: number; y: number }>
  >({});
  const groupedDragStartRef = useRef<{
    anchorId: string;
    starts: Record<string, { x: number; y: number }>;
  } | null>(null);
  const skipSelectionDragStopRef = useRef(false);
  // 右键未选节点会先按桌面习惯单选；若用户随后点“加入批量选择”，
  // 仍可恢复右键前的选择集合并把当前节点加入其中。
  const contextSelectionBaseRef = useRef<string[]>([]);
  // 框选多选(React Flow 选中集合)
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [canvasTool, setCanvasTool] = useState<CanvasPrimaryTool>("move");
  const boxSelectMode = canvasTool === "marquee";
  // 画布底色:深色(默认) / 浅色白底,本地记忆
  const [lightCanvas, setLightCanvas] = useState(() => {
    if (desktopAppearance) return true;
    try {
      return (
        typeof window !== "undefined" &&
        localStorage.getItem("nv:canvas:bg") === "light"
      );
    } catch {
      return false;
    }
  });
  // 拉线中:图片节点端口全部显形(canvas-linking),目标的前 + 不再隐形盲抓
  const [linking, setLinking] = useState(false);
  // 竞品链路:反推中/帮写中标记、产品图选择器、生成图片模式菜单
  const [promptMining, setPromptMining] = useState(false);
  const [batchRunBusy, setBatchRunBusy] = useState(false);
  const [assistBusy, setAssistBusy] = useState(false);
  const [productPicker, setProductPicker] = useState<{ textNodeIds: string[] } | null>(null);
  const [genImageMenu, setGenImageMenu] = useState<{ textNodeIds: string[] } | null>(null);
  // 居中确认弹框(替代浏览器原生 confirm,贴合站点配色)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    return () => extraPreviews.forEach((u) => URL.revokeObjectURL(u));
  }, [extraPreviews]);

  function pickExtra(list: FileList | null) {
    if (!list) return;
    const room = MAX_TOTAL_IMAGES - 1 - extraFiles.length; // 减去节点图本身占 1
    if (room <= 0) return;
    const nf: File[] = [];
    const np: string[] = [];
    for (const f of Array.from(list)) {
      if (nf.length >= room) break;
      if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) continue;
      if (f.size > MAX_UPLOAD) continue;
      nf.push(f);
      np.push(URL.createObjectURL(f));
    }
    if (nf.length === 0) return;
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
    setCredits(null);
    setWorks(null); setNames({}); setTextNodes([]); setTextNodesReady(false);
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
    Promise.all([
      // Cross-account requests bypass the browser cache; canvas never applies stale revalidation over edits.
      loadAccountSnapshot<Artwork>(target),
      privateFetchRaw(`/api/projects?email=${encodeURIComponent(target)}`)
        .then((r) => r.json())
        .catch(() => ({ names: {} })),
      privateFetchRaw(`/api/canvas/text-nodes?email=${encodeURIComponent(target)}`)
        .then((r) => r.json())
        .catch(() => ({ persisted: false, nodes: [] })),
    ])
      .then(([acc, proj, textData]) => {
        if (cancelled) return;
        setWorks((acc?.artworks ?? []) as Artwork[]);
        setNames((proj?.names ?? {}) as Record<string, string>);
        if (textData?.persisted) {
          setTextNodes(
            ((textData?.nodes ?? []) as CanvasTextNode[]).map((node) => ({
              ...node,
              width: Number.isFinite(node.width) && node.width > 0 ? node.width : TEXT_NODE_DEFAULT_W,
              height: Number.isFinite(node.height) && node.height > 0 ? node.height : TEXT_NODE_DEFAULT_H,
              sourceIds: Array.isArray(node.sourceIds) ? node.sourceIds : [],
              targetIds: Array.isArray(node.targetIds) ? node.targetIds : [],
              productIds: Array.isArray(node.productIds) ? node.productIds : [],
            }))
          );
        } else {
          try {
            const local = localStorage.getItem(`naumi:canvas-text-nodes:${target.toLowerCase()}`);
            setTextNodes(
              local
                    ? (JSON.parse(local) as CanvasTextNode[]).map((node) => ({
                      ...node,
                      width: Number.isFinite(node.width) && node.width > 0 ? node.width : TEXT_NODE_DEFAULT_W,
                      height: Number.isFinite(node.height) && node.height > 0 ? node.height : TEXT_NODE_DEFAULT_H,
                      sourceIds: Array.isArray(node.sourceIds) ? node.sourceIds : [],
                      targetIds: Array.isArray(node.targetIds) ? node.targetIds : [],
                      productIds: Array.isArray(node.productIds) ? node.productIds : [],
                    }))
                : []
            );
          } catch {
            setTextNodes([]);
          }
        }
        setTextNodesReady(true);

      })
      .catch(() => {
        if (!cancelled) {
          setWorks([]);
          setTextNodesReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticatedEmail]);

  useEffect(() => {
    const email = (targetEmail || user?.email || "").toLowerCase();
    if (!email || !textNodesReady) return;
    try {
      localStorage.setItem(
        `naumi:canvas-text-nodes:${email}`,
        JSON.stringify(
          textNodes.map((node) =>
            node.status === "generating" ? { ...node, status: "idle" } : node
          )
        )
      );
    } catch {
      /* local fallback is best effort */
    }
  }, [textNodes, textNodesReady, targetEmail, user?.email]);

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
    for (const a of arts) {
      const k = projectKey(a, byId);
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
  }, [projects, activeKey, creatingNew, browsing, works]);

  // ?node=<作品id>:跳到该图所在项目并选中聚焦(管理员从后台点图进来时)
  useEffect(() => {
    const node = pendingNodeRef.current;
    if (!node || projects.length === 0) return;
    pendingNodeRef.current = null;
    const openWithoutSelection = openPendingNodeWithoutSelectionRef.current;
    openPendingNodeWithoutSelectionRef.current = false;
    const proj = projects.find((p) => p.members.some((m) => m.id === node));
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
  }, [projects]);

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
        addPendAtScreen(center.x, center.y, null, false);
        setGenerationMode(
          key === "detail" ? "detail" : key === "views" ? "triptych" : "standard"
        );
        setEditPrompt(
          t(
            key === "detail"
              ? "canvas.workflowDetailPrompt"
              : key === "views"
                ? "canvas.workflowViewsPrompt"
                : "canvas.workflowHeroPrompt"
          )
        );
        wantFocusPendPrompt.current = true;
      }, 0);
    });
  }
  useEffect(() => {
    if (active) setCreatingNew(false);
  }, [active]);
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
  }, [user, readOnly]);

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
    const prev = worksRef.current?.find((art) => art.id === id);
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
  }, [user, readOnly, pushUndo]);

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
  }, [user, readOnly]);

  const requestNodeRename = useCallback((id: string, label: string) => {
    if(readOnly || nodeSettingsRef.current[id]?.locked)return;
    if (readOnly) return;
    setSelectedId(id);
    setSelectedPendId(null);
    setSelectedTextId(null);
    setNodeRenameValue(label);
    setRenamingNodeId(id);
  }, [readOnly]);

  const extractVideoToCanvas = useCallback((id:string,action:VideoPlayerAction)=>{
    if(readOnly||!user||nodeSettingsRef.current[id]?.locked)return;
    const source=worksRef.current?.find(item=>item.id===id),node=videoNodesStore.getNode(id),project=activeProjectRef.current?.key;
    if(!project||!source?.videoUrl&&!node?.displayResultId&&!node?.lastResultId)return;
    setVideoMedia({id,projectKey:project,initial:action});
  },[readOnly,user,videoNodesStore.getNode]);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!active) return { nodes: [], edges: [] };
    return layoutGraph(
      active.members,
      t("canvas.rootBadge"),
      onNodeDimensions,
      onArtworkCanvasResize,
      onArtworkCanvasRatioRepair,
      requestNodeRename,
      extractVideoToCanvas
    );
  }, [active, t, onNodeDimensions, onArtworkCanvasResize, onArtworkCanvasRatioRepair, requestNodeRename, extractVideoToCanvas]);

  const nodeTypes = useMemo(
    () => ({ art: ArtNode, pend: PendNode, text: TextCanvasNode, videoGeneration:VideoGenerationNode, workflowDecoration: WorkflowDecorationNode, workflowGroup: WorkflowGroupNode }),
    []
  );
  const edgeTypes = useMemo(() => ({ comet: CometEdge }), []);
  const videoTaskStore=useVideoTasks({email:user?.email,projectKey:active?.key,readOnly,request:privateFetchRaw,onCompleted:async(task,project)=>{
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
    void (async()=>{for(let offset=0;offset<ids.length;offset+=100){if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;await mergeWorks(ids.slice(offset,offset+100));}})();
  },[user?.email,targetEmail,activeKey,readOnly,works,videoNodesStore.nodes]);
  const selectedVideo=videoNodesStore.nodes.find(node=>node.id===selectedId)||null;
  const mixedNativeSelection=multiSel.length>1&&(multiSel.some(id=>videoNodesStore.getNode(id))||multiSel.some(id=>id.startsWith("text-"))&&multiSel.some(id=>!id.startsWith("text-")));
  const selected = useMemo(
    () => active?.members.find((a) => a.id === selectedId) ?? null,
    [active, selectedId]
  );

  // Restore only receipts present when this project opens; ordinary live submissions keep their existing placement flow.
  useEffect(()=>{
    if(!user||readOnly||works===null)return;
    const owner=user.email,project=active?.key||"workspace",pending=canvasReceipts(sessionStorage,owner,project);
    if(!pending.length)return;
    let stopped=false,timer:ReturnType<typeof setTimeout>;
    const sync=async()=>{for(const item of [...pending]){if(stopped)return;try{
      if(generationOperationRef.current.has(item.receipt.nodeId))continue;
      const result=await pollImagegen(item.receipt.id);if(stopped)return;
      if(!["succeeded","failed","cancelled","needs_attention"].includes(result.status))continue;
      let y=item.receipt.y;const fresh=result.artifacts.filter(a=>!worksRef.current?.some(w=>w.id===a.artworkId&&w.canvasX!=null&&w.canvasY!=null));
      for(const a of fresh){const response=await privateFetchRaw("/api/artworks/position",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:a.artworkId,x:Math.round(item.receipt.x),y:Math.round(y)})});if(!response.ok)throw new Error("恢复结果位置保存失败");y+=a.height+NODE_LABEL_H+24;}
      if(result.artifacts.length){const ids=result.artifacts.map(a=>a.artworkId),merged=await mergeWorks(ids);if(stopped)return;if(fresh.length)pushAddUndoMany(fresh.map(a=>a.artworkId),merged);}
      if(result.error)flashTip(result.error.message);
      if(result.status!=="needs_attention")clearCanvasReceipt(sessionStorage,item.key,item.receipt.id);
      pending.splice(pending.indexOf(item),1);
    }catch{/* Retain the ID across transient read failures; no POST is issued by recovery. */}}
    if(!stopped&&pending.length)timer=setTimeout(sync,3000);};void sync();return()=>{stopped=true;clearTimeout(timer);};
  },[user?.email,active?.key,readOnly,works===null]); // eslint-disable-line react-hooks/exhaustive-deps

  function completeCanvasReceipt(jobId:string){if(!user||!jobId.startsWith("imagegen-"))return;for(const item of canvasReceipts(sessionStorage,user.email,active?.key||"workspace"))if(`imagegen-${item.receipt.id}`===jobId)clearCanvasReceipt(sessionStorage,item.key,item.receipt.id);}

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
      (task) =>
        task.sourceId === selectedId ||
        task.operationKey === `node:${selectedId}` ||
        task.operationKey === `retry:${selectedId}`
    ) || (!!selectedId && pendNodes.some(node => node.generating && node.operationKey === `node:${selectedId}`));
  // dock 的默认引用图就是当前节点本身：节点链表达真实执行顺序，下一节点应基于当前结果继续。
  // 若要否定当前结果并从原输入重做，使用显式“重做此图”动作生成同级新版本。
  const dockRefs = useMemo<Artwork[]>(() => {
    return selected ? [selected] : [];
  }, [selected]);
  // 用户可在 dock 里"×"掉自动引用图(改用自己上传的);hiddenRefIds 随选中切换清空
  const [hiddenRefIds, setHiddenRefIds] = useState<string[]>([]);
  const visibleDockRefs = useMemo(
    () => dockRefs.filter((r) => !hiddenRefIds.includes(r.id)),
    [dockRefs, hiddenRefIds]
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
    setTextError(null);
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

  // 生成中:在选中节点下方临时插入"生成中"占位节点;
  // 选中时:整条血缘链路点亮(蓝色流光),其余节点/连线变暗。
  const { displayNodes, displayEdges } = useMemo<{
    displayNodes: Node[];
    displayEdges: Edge[];
  }>(() => {
    let baseNodes = nodes;
    let baseEdges = edges;
    // 每个生成任务都有自己的占位节点。后端超过并发上限时自行排队，画布不再全局锁死。
    for (const task of generationTasks) {
      if (!nodes.some((node) => node.id === task.sourceId)) continue;
      const pos = generationTaskPosRef.current[task.id] ?? task.position;
      const previewSize = task.previewSize ?? generationPlaceholderSize("1:1");
      baseNodes = [
        ...baseNodes,
        {
          id: task.id,
          type: "art",
          position: pos,
          style: previewSize,
          data: { id: task.id, pending: true, label: task.label, lightCanvas, ...previewSize,
            generationStage: task.stage, generationStartedAt: task.startedAt,
            generationCount: task.count, generationCompleted: task.completed },
          selectable: false,
          draggable: true,
        },
      ];
      baseEdges = [
        ...baseEdges,
        {
          id: `e-${task.id}`,
          source: task.sourceId,
          sourceHandle: "out",
          target: task.id,
          targetHandle: "in",
          type: "default",
          animated: true,
          selectable: false,
        },
      ];
    }
    const chain = active
      ? lineageChain(active.members, selectedId)
      : new Set<string>();
    const hasSel = !!selectedId && chain.size > 0;
    const displayNodes: Node[] = baseNodes.map((n) => ({
      ...n,
        data: {
          ...(n.data as Record<string, unknown>),
          inChain: hasSel && chain.has(n.id),
          lightCanvas,
      },
      className:
        hasSel && !chain.has(n.id) && !n.id.startsWith("task-")
          ? "cw-dim"
          : undefined,
    }));
    const displayEdges: Edge[] = baseEdges.map((e) => {
      if (e.target.startsWith("task-")) return e;
      if (!hasSel)
        return {
          ...e,
          type: "comet",
          data: { lit: false, dim: false },
          className: undefined,
          animated: false,
        };
      const lit = chain.has(e.source) && chain.has(e.target);
      return {
        ...e,
        type: "comet",
        data: { lit, dim: !lit },
        className: undefined,
        animated: false,
      };
    });
    // 追加占位/空白节点(及其连线:每个 input 一条)
    for (const p of pendNodes) {
      displayNodes.push({
        id: p.id,
        type: "pend",
        position: { x: p.x, y: p.y },
        // RF 的多选状态由 useNodesState 维护；data.selected 只表示当前编辑中的空白节点。
        data: {
          __id: p.id,
          label: p.label,
          uploading: p.uploading,
          progress: p.progress,
          fileInfo: p.fileInfo,
          generating: p.generating,
          generationStage: p.generationStage,
          generationStartedAt: p.generationStartedAt,
          generationSize: p.generationSize,
          generationCount: p.generationCount,
          generationKind: p.taskKind === "video" ? "video" : "image",
          needsAttention: p.needsAttention,
          attentionTitle: p.attentionTitle,
          attentionHint: p.attentionHint,
          attentionAction: p.attentionAction,
          attentionHref: p.attentionHref,
          selected: p.id === selectedPendId,
          lightCanvas,
        },
      } as Node);
      for (const src of p.inputs ?? []) {
        if (!src) continue;
        displayEdges.push({
          id: `e-pend-${src}-${p.id}`,
          selectable: !p.generating && !p.uploading,
          source: src,
          sourceHandle: "out",
          target: p.id,
          targetHandle: "in",
          type: "comet",
          data: { lit: false, dim: false },
        } as Edge);
      }
    }
    for(const videoNode of videoNodesStore.nodes.filter(node=>node.projectKey===activeKey)){
      const task=videoTaskStore.tasks.find(task=>task.id===videoNode.lastTaskId),result=(works||[]).find(art=>art.id===(videoNode.displayResultId||videoNode.lastResultId)),locked=isNodeLocked(videoNode.id);
      displayNodes.push({id:videoNode.id,type:"videoGeneration",position:{x:videoNode.x,y:videoNode.y},selected:videoNode.id===selectedId,draggable:!readOnly&&!locked,
        style:{width:videoNode.width,height:videoNode.height},data:{node:videoNode,title:videoNode.title,prompt:videoNode.config.prompt,content:String(videoNode.revision),width:videoNode.width,height:videoNode.height,status:task?.status,progress:task?.progress,videoUrl:result?.videoUrl||(!videoNode.displayResultId?task?.videoUrl:undefined),
          task,settings:settingsFor(videoNode.id),selected:videoNode.id===selectedId,lightCanvas,locked,readOnly,resultUrl:result?.videoUrl||(!videoNode.displayResultId?task?.videoUrl:undefined),onEdit:(id:string)=>setVideoEditId(id),onHistory:(id:string)=>setVideoHistoryId(id),onGenerate:(id:string)=>setVideoEditId(id),onCancel:(id:string)=>{const current=videoNodesStore.nodes.find(node=>node.id===id);if(current?.lastTaskId)void videoTaskStore.cancel(current.lastTaskId).catch(error=>flashTip(error.message));},
          onProcess:extractVideoToCanvas,onPrompt:async(id:string,prompt:string)=>{const current=videoNodesStore.nodes.find(node=>node.id===id);if(current)await patchVideoNode(id,{config:{...current.config,prompt}});},
          onResize:(id:string,size:{x:number;y:number;width:number;height:number})=>{void patchVideoNode(id,size).catch(error=>flashTip(error.message));}}} as Node);
      for(const input of videoNode.inputs){const source=input.nodeId.replace(/^(?:text|image|video|audio):/,"");if(!displayNodes.some(node=>node.id===source)&&!textNodes.some(node=>node.id===source)&&!videoNodesStore.nodes.some(node=>node.id===source))continue;
        displayEdges.push({id:`e-video-${input.id}-${videoNode.id}`,source,sourceHandle:"out",target:videoNode.id,targetHandle:"in",type:"comet",data:{lit:false,dim:false}} as Edge);}
    }
    for (const textNode of textNodes.filter((node) => node.projectKey === activeKey)) {
      const expanded = expandedTextIds.has(textNode.id);
      const displayWidth = expanded ? Math.min(760, TEXT_NODE_MAX_W) : textNode.width;
      const displayHeight = expanded
        ? Math.min(
            TEXT_NODE_MAX_H,
            Math.max(420, estimateTextNodeHeight({ ...textNode, width: displayWidth }))
          )
        : textNode.height;
      const sourceRefs = (textNode.sourceIds ?? [])
        .map((id) => active?.members.find((member) => member.id === id))
        .filter(Boolean) as Artwork[];
      // 产品绑定(帮写节点)也显示为 @引用芯片 + 连线,与 sourceIds 视觉一致
      const productRefs = (textNode.productIds ?? [])
        .filter((id) => !(textNode.sourceIds ?? []).includes(id))
        .map((id) => active?.members.find((member) => member.id === id))
        .filter(Boolean) as Artwork[];
      displayNodes.push({
        id: textNode.id,
        type: "text",
        position: { x: textNode.canvasX, y: textNode.canvasY },
        data: {
          __id: textNode.id,
          nodeKind: "text",
          title: textNode.title,
          prompt: textNode.prompt,
          content: textNode.content,
          status: textNode.status,
          sourceRefs: [...sourceRefs, ...productRefs].map((reference) => ({
            id: reference.id,
            title: reference.title,
          })),
          selected: textNode.id === selectedTextId,
          lightCanvas,
          expanded,
          width: displayWidth,
          height: displayHeight,
        },
        style: { width: displayWidth, height: displayHeight },
      } as Node);
      for (const sourceId of Array.from(new Set([...(textNode.sourceIds ?? []), ...(textNode.productIds ?? [])]))) {
        if (!active?.members.some((member) => member.id === sourceId) && !textNodes.some(node => node.id === sourceId && node.projectKey === activeKey)) continue;
        displayEdges.push({
          id: `e-image-text-${sourceId}-${textNode.id}`,
          source: sourceId,
          sourceHandle: "out",
          target: textNode.id,
          targetHandle: "in",
          type: "comet",
          data: { lit: false, dim: false },
        } as Edge);
      }
      for (const targetId of textNode.targetIds ?? []) {
        if (!active?.members.some((member) => member.id === targetId)) continue;
        displayEdges.push({
          id: `e-text-${textNode.id}-${targetId}`,
          source: textNode.id,
          sourceHandle: "out",
          target: targetId,
          targetHandle: "in",
          type: "comet",
          data: { lit: false, dim: false },
        } as Edge);
      }
    }
    // 防御:节点/边按 id 去重,并丢弃指向不存在节点的悬空边
    for (let index=0;index<displayNodes.length;index++) {
      const node=displayNodes[index];
      if (node.id.startsWith("pend-") || node.id.startsWith("task-")) continue;
      const settings=nodeSettings[node.id] || DEFAULT_CANVAS_SETTINGS;
      displayNodes[index]={...node,zIndex:settings.order,draggable:nodeSettingsReady && !readOnly && !settings.locked,
        data:{...node.data,settings,readOnly:readOnly || !nodeSettingsReady}};
    }
    for (const manifest of workflowManifests.filter(m => m.projectKey === activeKey)) {
      const origins = new Map(manifest.origins.map(o => [o.id, o]));
      const decorations = new Map(manifest.decorations.map(d => [d.id, d]));
      for (let i = 0; i < displayNodes.length; i++) {
        const node = displayNodes[i], origin = origins.get(node.id), decoration = decorations.get(node.id);
        const artwork = active?.members.find(m => m.id === node.id);
        if (decoration) displayNodes[i] = { ...node, type: "workflowDecoration", zIndex: -50000 + i, connectable: false,
          data: { ...node.data, image: artwork?.image || decoration.image, rotation: decoration.rotation, flipX: decoration.flipX, opacity: decoration.opacity,
            missingAsset: artwork?.source === "workflow-placeholder", onFill: () => artwork && workflowCallbacksRef.current.replace(artwork) } };
        else if (origin) displayNodes[i] = { ...node, data: { ...node.data, workflowPresentation: origin,
          missingAsset: artwork?.source === "workflow-placeholder", onFill: () => artwork && workflowCallbacksRef.current.replace(artwork) } };
      }
      for (const group of manifest.groups) {
        const children = displayNodes.filter(n => group.members.includes(n.id));
        if (!children.length) continue;
        const left = Math.min(...children.map(n => n.position.x)), top = Math.min(...children.map(n => n.position.y));
        const right = Math.max(...children.map(n => n.position.x + Number(n.style?.width || 320))), bottom = Math.max(...children.map(n => n.position.y + Number(n.style?.height || 180)));
        displayNodes.push({ id: group.id, type: "workflowGroup", position: { x: left - 12, y: top - 58 }, style: { width: right - left + 24, height: bottom - top + 70, pointerEvents: "none" },
          draggable: false, selectable: false, connectable: false, focusable: false, zIndex: -60000,
          data: { title: group.title, onSelect: () => workflowCallbacksRef.current.select(children.map(n => n.id)) } });
      }
    }
    // (React Flow 遇到重复 key 或悬空边会抛出 client-side exception → 白屏)
    const nSeen = new Set<string>();
    const finalNodes = displayNodes.filter((n) =>
      nSeen.has(n.id) ? false : (nSeen.add(n.id), true)
    );
    const nIds = nSeen;
    const eSeen = new Set<string>();
    const finalEdges = displayEdges.filter((e) =>
      !e.id ||
      eSeen.has(e.id) ||
      !e.source ||
      !e.target ||
      !nIds.has(e.source) ||
      !nIds.has(e.target)
        ? false
        : (eSeen.add(e.id), true)
    );
    return { displayNodes: finalNodes, displayEdges: finalEdges };
  }, [
    nodes,
    edges,
    generationTasks,
    selectedId,
    selectedPendId,
    selectedTextId,
    active,
    activeKey,
    pendNodes,
    textNodes,
    expandedTextIds,
    lightCanvas,
    nodeSettings,
    nodeSettingsReady,
    readOnly,
    workflowManifests,
    videoNodesStore.nodes,videoTaskStore.tasks,works,extractVideoToCanvas,
  ]);

  // 受控节点状态(支持拖拽);仅当底层数据/位置真正变化时重新灌入,拖拽过程中不重置。
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
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
  // 后台占位出现不移动镜头；用户正在其他节点工作时仍保留当前视野。
  const nodesSig = useMemo(() => displayNodes
    .map(
      (n) =>
        `${JSON.stringify([n.data.image,n.data.videoUrl,n.data.missingAsset,n.data.workflowPresentation,n.data.title,n.data.prompt,n.data.content])}:${JSON.stringify([n.data.generationStage, n.data.generationStartedAt, n.data.generationCount, n.data.generationCompleted, n.data.generationSize, n.data.generationKind])}:${JSON.stringify((n.data as {settings?:CanvasNodeSettings}).settings)}:${n.draggable}:${n.zIndex}:${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}:${
          (n.data as { pending?: boolean }).pending ? 1 : 0
        }:${(n.data as { inChain?: boolean }).inChain ? 1 : 0}:${n.className ?? ""}:${
          Math.round((n.data as { progress?: number }).progress ?? -1)
        }:${(n.data as { uploading?: boolean }).uploading ? 1 : 0}:${
          (n.data as { selected?: boolean }).selected ? 1 : 0
        }:${(n.data as { generating?: boolean }).generating ? 1 : 0}:${
          (n.data as { marked?: boolean }).marked ? 1 : 0
        }:${Math.round((n.data as { width?: number }).width ?? 0)}:${
          Math.round((n.data as { height?: number }).height ?? 0)
        }:${(n.data as { canvasGroupId?: string }).canvasGroupId ?? ""}:${
          (n.data as { status?: string }).status ?? ""
        }:${String((n.data as { label?: string }).label ?? "")}:${String(
          (n.data as { content?: string }).content ?? ""
        ).length}:${(n.data as { lightCanvas?: boolean }).lightCanvas ? 1 : 0}:${((n.data as { sourceRefs?: Array<{ id: string }> }).sourceRefs ?? [])
          .map((reference) => reference.id)
          .join(",")}`
    )
    .join("|"), [displayNodes]);
  const edgesSig = useMemo(() => displayEdges
    .map(
      (e) =>
        `${e.id}:${(e.data as { lit?: boolean })?.lit ? 1 : 0}:${
          (e.data as { dim?: boolean })?.dim ? 1 : 0
        }`
    )
    .join("|"), [displayEdges]);
  useEffect(() => {
    // 数据刷新（如批量标记）时继承 React Flow 当前选择，不从 multiSel 反向灌入，
    // 避免 selected 与 onSelectionChange 互相触发造成 React #185 无限更新。
    setRfNodes((current) => {
      const currentById = new Map(current.map(node => [node.id, node]));
      return displayNodes.map((node) => ({
        ...node,
        selected: currentById.get(node.id)?.selected ?? false,
        // 同尺寸数据更新不会触发 ResizeObserver。保留已有测量，避免任务阶段刷新后
        // React Flow 将其余节点永久设为 visibility:hidden，导致整张画布无法交互。
        measured: currentById.get(node.id)?.measured,
      }));
    });
    setRfEdges((current) => {
      const selected = new Set(current.filter(edge => edge.selected).map(edge => edge.id));
      return displayEdges.map(edge => ({ ...edge, selected: edge.selectable !== false && selected.has(edge.id) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesSig, edgesSig]);

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
  }, [activeKey, user?.email, setRfEdges]);

  function applyArtworkSelection(ids: string[]) {
    setSelectedEdge(null);
    setRfEdges(current => current.map(edge => edge.selected ? { ...edge, selected: false } : edge));
    const valid = new Set(
      ids.filter((id) => active?.members.some((item) => item.id === id)||videoNodesStore.nodes.some(node=>node.id===id&&node.projectKey===activeKey)||textNodesRef.current.some(node=>node.id===id&&node.projectKey===activeKey))
    );
    const next = Array.from(valid);
    setMultiSel(next);
    setRfNodes((current) =>
      current.map((node) => ({ ...node, selected: valid.has(node.id) }))
    );
    setSelectedPendId(null);
    const onlyText=next.length===1&&textNodesRef.current.some(node=>node.id===next[0]);
    setSelectedTextId(onlyText?next[0]:null);
    setSelectedId(next.length===1&&!onlyText?next[0]:null);
  }

  function toggleArtworkBatchSelection(nodeId: string, base = multiSel) {
    const next = new Set(base);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    applyArtworkSelection(Array.from(next));
  }

  // 选中节点在画布坐标系里的屏幕位置；真实图片按原像素尺寸参与停靠计算。
  const nodeScreen = useMemo<
    { left: number; top: number; bottom: number; cx: number } | undefined
  >(() => {
    // 当前用于停靠上下面板的节点:真实选中节点优先,否则选中的空白节点
    const anchorId = selectedId ?? selectedPendId ?? selectedTextId;
    if (!anchorId) return undefined;
    const selNode = rfNodes.find((n) => n.id === anchorId);
    if (!selNode) return undefined;
    const z = viewport.zoom || 1;
    const left = selNode.position.x * z + viewport.x;
    const top = selNode.position.y * z + viewport.y;
    const size = flowNodeSize(selNode);
    return { left, top, bottom: top + size.height * z, cx: left + (size.width * z) / 2 };
  }, [selectedId, selectedPendId, selectedTextId, rfNodes, viewport]);

  // 画布悬浮层需要避开左上项目 chrome、窄屏第二行右上操作区和左下视图工具条。
  // 这里统一定义安全区，避免 Dock 在低高度窗口退化成 top:8 后盖住导航/账户操作。
  const overlaySafeArea = useMemo(
    () => ({
      left: 8,
      right: 8,
      top: canvasSize.width > 0 && canvasSize.width < 768 ? 108 : 64,
      // 窄屏主工具栏位于视图控制条上方，需要同时避开两层底部控件。
      bottom: canvasSize.width > 0 && canvasSize.width < 1000 ? 128 : 84,
    }),
    [canvasSize.width]
  );

  // dock 宽度随可用画布收缩；高分屏、Windows 缩放和窄窗口都以真实 CSS 像素重新布局。
  const preferredDockWidth = 820;
  const dockWidth = canvasSize.width
    ? Math.max(
        1,
        Math.min(
          preferredDockWidth,
          canvasSize.width - overlaySafeArea.left - overlaySafeArea.right
        )
      )
    : preferredDockWidth;
  // 节点中心 x(夹取到画布内,使最宽的 dock 不出界);工具条也用这个中心 → 上下对齐。
  const anchorCenterX = useMemo<number | undefined>(() => {
    if (!nodeScreen) return undefined;
    const cw = canvasSize.width;
    const HALF = dockWidth / 2;
    let cx = nodeScreen.cx;
    if (cw) {
      cx = Math.max(
        HALF + overlaySafeArea.left,
        Math.min(cx, cw - HALF - overlaySafeArea.right)
      );
      // 低高度宽窗口中，尽量把 Dock 推到左下视图工具条右侧。这样可以安全使用
      // 更低的 bottom inset，为 Dock + 节点工具条 + 节点主体腾出完整纵向空间。
      const viewToolbarClearance = 232;
      const maxDockLeft = cw - dockWidth - overlaySafeArea.right;
      if (
        canvasSize.height > 0 &&
        canvasSize.height < 680 &&
        maxDockLeft >= viewToolbarClearance
      ) {
        cx = Math.max(cx, viewToolbarClearance + HALF);
      }
    }
    return cx;
  }, [nodeScreen, canvasSize.width, canvasSize.height, dockWidth, overlaySafeArea]);

  // 底部生成器:节点正下方,中心对齐 anchorCenterX
  const preferredDockStyle = useMemo<
    { left: number; top: number; width: number; maxHeight?: number } | undefined
  >(() => {
    if (!nodeScreen || anchorCenterX == null) return undefined;
    const ch = canvasSize.height;
    const left = anchorCenterX - dockWidth / 2;
    if (!ch) return { left, top: nodeScreen.bottom + 14, width: dockWidth };
    const safeTop = overlaySafeArea.top;
    // 左下视图工具条只占约 216px 宽；Dock 与它横向不相交时保留普通 8px
    // 即可，避免在宽屏无谓压缩用户手动扩展的提示词编辑区。
    // 主工具栏常驻底部；所有生成 Dock 都要预留其高度，不能再依赖“选中时隐藏工具栏”。
    const bottomInset = overlaySafeArea.bottom;
    const safeBottom = Math.max(safeTop + 120, ch - bottomInset);
    // The image action bar is 49.5px in Chromium. When it is clamped to the
    // top safe area (notably 390px wide screens), the node itself can sit
    // underneath it, so positioning the Dock from the node bottom alone lets
    // the two overlays overlap. Reserve the rendered toolbar plus an 8px gap.
    const topbarHeight = 50;
    const topbarTop = Math.max(safeTop, nodeScreen.top - topbarHeight - 12);
    const belowTop = Math.max(
      nodeScreen.bottom + 14,
      topbarTop + topbarHeight + 8
    );
    const belowSpace = Math.max(0, safeBottom - belowTop);
    const nodeToolbarReserve = 70;
    const aboveBottom = nodeScreen.top - nodeToolbarReserve;
    const aboveSpace = Math.max(0, aboveBottom - safeTop);
    const preferredHeight = selectedTextId ? 360 : 310;
    const minimumComfort = selectedTextId
      ? canvasSize.width < 480
        ? 240
        : 218
      : 220;
    // 优先选择能容纳完整自适应输入区的一侧；两侧都不足时选择空间更大的一侧。
    const useBelow =
      belowSpace >= preferredHeight ||
      (belowSpace >= minimumComfort && belowSpace >= aboveSpace);
    if (useBelow) {
      return {
        left,
        top: Math.max(safeTop, belowTop),
        width: dockWidth,
        maxHeight: Math.max(120, belowSpace),
      };
    }
    if (aboveSpace >= minimumComfort) {
      // The top is computed from this height. Allowing the panel to grow beyond
      // it puts a long prompt/footer inside the action bar above the node.
      const maxHeight = Math.min(preferredHeight, aboveSpace);
      return {
        left,
        top: Math.max(safeTop, aboveBottom - Math.min(preferredHeight, maxHeight)),
        width: dockWidth,
        maxHeight,
      };
    }

    // 两侧都放不下时退化为画布内底部 sheet。它始终位于安全区内，
    // 不再覆盖顶部项目 chrome，也不会压住左下视图工具条。
    const availableHeight = Math.max(120, safeBottom - safeTop);
    const sheetHeight = Math.min(preferredHeight, availableHeight);
    return {
      left,
      top: Math.max(safeTop, safeBottom - sheetHeight),
      width: dockWidth,
      maxHeight: sheetHeight,
    };
  }, [
    nodeScreen,
    anchorCenterX,
    canvasSize.width,
    canvasSize.height,
    dockWidth,
    selectedTextId,
    overlaySafeArea,
  ]);

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
    const stackedSafeTop = overlaySafeArea.top + estimatedDockHeight + 70;

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

  // 顶部图像工具条:尽量锚定节点中心，但按自身宽度独立夹取。
  // Dock 在低高度宽屏会为左下视图工具条向右平移；若工具条复用 Dock 中心，
  // 1093×614 下 1077px 宽的操作条会被推到 x=103.5..1180.5 而越出视口。
  const preferredTopbarStyle = useMemo<{ left: number; top: number } | undefined>(() => {
    if (!nodeScreen) return undefined;
    const TBAR_H = 46;
    const cw = canvasSize.width;
    const availableWidth = Math.max(
      1,
      cw - overlaySafeArea.left - overlaySafeArea.right
    );
    const renderedWidth = Math.min(dockMetrics.toolbarWidth || 1088, availableWidth);
    const half = renderedWidth / 2;
    const left = cw
      ? Math.max(
          overlaySafeArea.left + half,
          Math.min(
            nodeScreen.cx,
            cw - overlaySafeArea.right - half
          )
        )
      : nodeScreen.cx;
    const top = Math.max(overlaySafeArea.top, nodeScreen.top - TBAR_H - 12);
    return { left, top };
  }, [nodeScreen, canvasSize.width, overlaySafeArea, dockMetrics.toolbarWidth]);

  // Measure border boxes, not animated transforms. Prompt growth, wrapped chips,
  // scrollbars, zoom and selection changes all share the same collision resolver.
  const docksReady = !!preferredDockStyle && !!preferredTopbarStyle;
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

  const { dock: dockStyle, toolbar: topbarStyle } = useMemo(() => {
    if (!preferredDockStyle || !preferredTopbarStyle || !canvasSize.height || readOnly) {
      return { dock: preferredDockStyle, toolbar: preferredTopbarStyle };
    }
    return separateCanvasDocks({
      dock: textComposerExpanded && selectedTextId
        ? { ...preferredDockStyle, top: overlaySafeArea.top, maxHeight: canvasSize.height - overlaySafeArea.bottom - overlaySafeArea.top }
        : preferredDockStyle,
      toolbar: preferredTopbarStyle,
      dockHeight: textComposerExpanded && selectedTextId
        ? canvasSize.height - overlaySafeArea.bottom - overlaySafeArea.top
        : dockMetrics.dockHeight || (selectedTextId ? 360 : 310),
      toolbarHeight: dockMetrics.toolbarHeight,
      safeTop: overlaySafeArea.top,
      safeBottom: canvasSize.height - overlaySafeArea.bottom,
    });
  }, [preferredDockStyle, preferredTopbarStyle, canvasSize.height, readOnly, dockMetrics, selectedTextId, textComposerExpanded, overlaySafeArea]);

  // 重命名节点:本地改标题 + 落库(节点标签 = 作品 title)
  async function saveNodeRename() {
    const id = renamingNodeId;
    const name = nodeRenameValue.trim();
    setRenamingNodeId(null);
    if (!id || !user || readOnly || !name || isNodeLocked(id)) return;
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

  // 选中节点变化时:Fuser 式——新提示词框留空(只读管理员视图才显示该图原提示词供查看);
  // 比例/风格沿用该节点作默认。「基于上一级重做」会用 carryPromptRef 把上一版提示词带过来。
  useEffect(() => {
    const carried = carryPromptRef.current;
    carryPromptRef.current = null;
    // 预填该节点自己的提示词(可编辑),便于"看着配方改一改再生成";有 carry 的优先用 carry
    setEditPrompt(carried ?? selected?.prompt ?? "");
    const nextRatio = normalizeCanvasRatio(selected?.ratio);
    setGenRatio(nextRatio); // 默认自适应

    setGenStyle(selected?.style || GENERATION_STYLES[0]);
    setGenerationMode("standard");
    setRatioMenuOpen(false);
    setGenError(null);
    setExtraFiles([]);
    setExtraPreviews([]);
    setHiddenRefIds([]); // 切换节点:恢复显示自动引用图
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

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

  // 整表重拉(仅初次加载 / 兜底用)。日常增删改用下面的局部更新,省 egress。
  async function refetchWorks(): Promise<Artwork[]> {
    const account=canvasAccountRef.current;
    const em = targetEmail || user?.email;
    if (!em) return works ?? [];
    try {
      const r = await fetch(`/api/account?email=${encodeURIComponent(em)}`, {
        headers: await authHeader(),
      });
      const d = await r.json();
      if(account!==canvasAccountRef.current)return [];
      const arr = (d?.artworks ?? []) as Artwork[];
      setWorks(arr);
      return arr;
    } catch {
      return works ?? [];
    }
  }

  // 只补指定 id 的几行(创建/连线后):取代整表重拉。返回更新后的 works(供调用方用)。
  // 失败时兜底走整表重拉,保证数据最终一致。
  async function mergeWorks(ids: string[]): Promise<Artwork[]> {
    const account=canvasAccountRef.current;
    const em = targetEmail || user?.email;
    const valid = ids.filter(Boolean);
    if (!em || valid.length === 0) return works ?? [];
    invalidateBrowserData(em);
    try {
      const r = await privateFetchRaw(
        `/api/artworks/get?email=${encodeURIComponent(em)}&ids=${valid
          .map(encodeURIComponent)
          .join(",")}`,
        { cache: "no-store" }
      );
      const d = await expectJsonOk(r, t("canvas.genFail"));
      if(account!==canvasAccountRef.current)return [];
      const fetched = (d?.artworks ?? []) as Artwork[];
      if (fetched.length === 0) return works ?? [];
      let merged = fetched;
      setWorks((current) => {
        const map = new Map((current ?? []).map((w) => [w.id, w]));
        for (const a of fetched) map.set(a.id, a);
        merged = Array.from(map.values()).sort((a, b) =>
          (b.createdAt || "").localeCompare(a.createdAt || "")
        );
        return merged;
      });
      return merged;
    } catch {
      // 单行补取失败 → 兜底整表重拉,确保不漏数据
      if(account!==canvasAccountRef.current)return [];
      return refetchWorks();
    }
  }

  // 本地移除指定 id(删除节点/项目):不重拉,返回更新后的 works。
  function removeWorksLocal(ids: string[]): Artwork[] {
    const set = new Set(ids);
    const next = (works ?? []).filter((w) => !set.has(w.id));
    setWorks(next);
    return next;
  }

  // ── 回收站 ──
  async function openTrash() {
    setSidebarOpen(false);
    setTrashOpen(true);
    setTrashItems(null);
    const em = targetEmail || user?.email;
    if (!em) {
      setTrashItems([]);
      return;
    }
    try {
      const r = await privateFetchRaw(`/api/artworks/trash?email=${encodeURIComponent(em)}`);
      const d = await expectJsonOk(r, t("canvas.genFail"));
      setTrashItems((d?.artworks ?? []) as Artwork[]);
    } catch {
      setTrashItems([]);
    }
  }
  async function trashAction(action: "restore" | "purge", ids: string[]) {
    const em = targetEmail || user?.email;
    if (!em || ids.length === 0 || trashBusy) return;
    setTrashBusy(true);
    try {
      const res = await privateFetchRaw("/api/artworks/trash", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: em, action, ids }),
      });
      await expectJsonOk(res, t("canvas.genFail"));
      // 从回收站列表里移除这些
      setTrashItems((prev) =>
        prev ? prev.filter((w) => !ids.includes(w.id)) : prev
      );
      // 恢复:把它们补回画布工作区
      if (action === "restore") await mergeWorks(ids);
    } catch (e) {
      flashTip(e instanceof Error ? e.message : t("canvas.genFail"));
    } finally {
      setTrashBusy(false);
    }
  }

  // 本地恢复整条记录(撤销删除时已持有完整记录):不重拉,返回更新后的 works。
  function restoreWorksLocal(records: Artwork[]): Artwork[] {
    if (!records.length) return works ?? [];
    const map = new Map((works ?? []).map((w) => [w.id, w]));
    for (const a of records) map.set(a.id, a);
    const next = Array.from(map.values()).sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || "")
    );
    setWorks(next);
    return next;
  }

  // 生成核心:以某节点为底图(图生图)+ 提示词 → 新图作为其子节点。
  async function runGen(
    source: Artwork,
    prompt: string,
    opts?: {
      ratio?: string;
      style?: string;
      count?: number;
      resolution?: string;
      transparent?: boolean;
      ratiogen?: boolean; // 改比例(ChatGPT 式重生成):用节点自身提示词+原图参考按比例重画,无需额外提示词
      extra?: File[];
      baseFile?: File; // 指定底图(用户在 dock 删掉自动引用图、改用自己上传的)
      // dock 里的全部引用图 URL(多图合成时一起送;第一张=主底图,其余=附加参考图)。
      refUrls?: string[];
      // 血缘父覆盖:默认挂在 source 下;多图引用时把它设成"选中节点",新图落在选中节点下方。
      parentId?: string;
      parentIds?: string[];
      operationKey?: string;
      taskLabel?: string;
      taskOffset?: number;
      userPrompt?: string;
    }
  ): Promise<GeneratedResult[]> {
    if (readOnly || !user) return [];
    const text = prompt.trim();
    if (!text && !opts?.ratiogen) return []; // 改比例可无提示词(服务端用固定重构图指令)
    const requestedCount = opts?.ratiogen ? 1 : Math.max(1, opts?.count ?? 1);
    const operationKey = opts?.operationKey ?? `node:${source.id}`;
    if (generationOperationRef.current.has(operationKey)) return [];
    generationOperationRef.current.add(operationKey);
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sourceNode = rfNodes.find((node) => node.id === source.id);
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
    const taskPosition = placeGenerationPreview(preferredPosition, previewSize, rfNodes.map(node => ({ ...node.position, ...flowNodeSize(node) })));
    generationTaskPosRef.current[taskId] = taskPosition;
    setGenerationTasks((current) => [
      ...current,
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
    try {
      // 下载一张图为 File(底图/参考图统一走 /api/download 代理)
      const dlFile = async (url: string, name: string): Promise<File> => {
        const blob = await readBrowserImage(url);
        return new File([blob], name, { type: blob.type || "image/png" });
      };
      // 参考图集合(第一张=主底图,其余=附加参考图一起送给模型):
      //  ① 用户指定上传底图 baseFile  ② 否则 dock 里的全部引用图 refUrls  ③ 都没有→源节点自身图。
      // 这样从"多图合成节点"再生成时,两张原始输入都会被引用,不会丢图。
      const refUrls = (opts?.refUrls ?? []).filter(Boolean);
      const refFiles: File[] = [];
      if (opts?.baseFile) {
        refFiles.push(opts.baseFile);
      } else if (refUrls.length) {
        for (let i = 0; i < refUrls.length; i++) {
          refFiles.push(await dlFile(refUrls[i], `ref-${i}.png`));
        }
      } else {
        refFiles.push(await dlFile(source.image, "base.png"));
      }
      const fd = new FormData();
      fd.append("prompt", text);
      fd.set("imagegenNodeId",operationKey);fd.set("imagegenNodeX",String(taskPosition.x));fd.set("imagegenNodeY",String(taskPosition.y));
      if (opts?.userPrompt?.trim()) fd.append("userPrompt", opts.userPrompt.trim());
      fd.append("category", source.category || "main");
      const requestedRatio = normalizeCanvasRatio(opts?.ratio || source.ratio);
      fd.append("ratio", requestedRatio);

      fd.append("resolution", normalizeCanvasResolution(opts?.resolution || source.resolution));
      fd.append("quality", genQuality);
      fd.append("style", opts?.style ?? "");
      fd.append("count", String(normalizeCanvasCount(opts?.count)));
      if (genModel) {
        // The node owns the ratio/resolution choice. The server repeats this
        // routing as the authoritative guard before calling the upstream model.
        fd.append("model", routeImageModel(genModel, requestedRatio, imageModels));
      }
      if (opts?.transparent) fd.append("transparent", "1");
      if (opts?.ratiogen) fd.append("ratiogen", "1");
      fd.append("email", user.email);
      // 血缘父=选中节点(opts.parentId),新图落其下方;默认仍挂 source。
      fd.append("parentId", opts?.parentId ?? source.id);
      fd.append("parentIds", JSON.stringify(opts?.parentIds ?? []));
      fd.append("origin", "canvas"); // 画布里产出 → 永远留画布(见 projects 过滤)
      // 第一张=主底图,其后是其余引用图 + 用户追加的参考图
      refFiles.forEach((f) => fd.append("image", f));
      (opts?.extra ?? []).forEach((f) => fd.append("image", f));
      const startRes = await privateFetch("/api/generate-image", {
        method: "POST",
        headers: await authHeader(),
        body: fd,
      });
      const start = await readJsonSafe(startRes);
      if (!startRes.ok) throw new Error(start.error || t("canvas.genFail"));
      const jobId: string | undefined = start.jobId;
      if (!jobId) throw new Error(t("canvas.genFail"));
      setGenerationTasks(current => current.map(task => task.id === taskId ? { ...task, stage: "generating" } : task));
      const deadline = Date.now() + 6 * 60 * 1000;
      let newIds: string[] = [];
      let generated: GeneratedResult[] = [];
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        if (Date.now() > deadline) throw new Error(t("canvas.genFail"));
        const pr = await fetch(
          `/api/generate-image?job=${encodeURIComponent(jobId)}`,
          { cache: "no-store", headers: await authHeader() }
        );
        const pj = await readJsonSafe(pr);
        if (pr.ok && pj.user) applyServerUser(pj.user);
        if (!pr.ok) throw new Error(pj.error || t("canvas.genFail"));
        if (pj.status === "done") {
          setGenerationTasks(current => current.map(task => task.id === taskId ? { ...task, stage: "saving" } : task));
          generated = ((pj.images ?? []) as { id?: string; url?: string; width?: number; height?: number }[])
            .filter(
              (image): image is { id: string; url: string; width?: number; height?: number } =>
                !!image.id && !!image.url
            )
            .map((image) => ({ id: image.id, url: image.url, width: image.width, height: image.height }));
          newIds = generated.map((image) => image.id);
          if (!newIds.length) throw new Error(t("canvas.genFail"));
          if (pj.user) applyServerUser(pj.user); // 即时回写余额积分
          break;
        }
        if (pj.status === "error") {
          if(pj.operationStatus==="failed"||pj.operationStatus==="cancelled")completeCanvasReceipt(jobId);
          throw new Error(pj.error || t("canvas.genFail"));
        }
      }
      // 引用和提示词属于当前草稿，后台任务完成不清理它们。
      // 把新节点落到"生成中占位"所在的位置(源节点右侧,或用户拖动后的位置),
      // 这样生成完成后不会跳到自动布局的位置 —— 与图1的占位位置一致。
      const basePos = generationTaskPosRef.current[taskId] ?? taskPosition;
      if (basePos && newIds.length) {
        let resultY = basePos.y;
        await Promise.all(
          newIds.map((id, i) => {
            const y = resultY;
            resultY += (generated[i]?.height || 110) + NODE_LABEL_H + 24;
            return privateFetchRaw("/api/artworks/position", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                email: user.email,
                id,
                x: Math.round(basePos.x),
                y: Math.round(y),
              }),
            }).catch(() => {});
          })
        );
      }
      const fresh = await mergeWorks(newIds); // 补这次新生成的几张(已带上面保存的坐标),不整表重拉
      pushAddUndoMany(newIds, fresh); // 面板生成/三视图/改比例/重做/快捷动作可撤销
      completeCanvasReceipt(jobId);
      if (newIds.length > 0 && newIds.length < requestedCount) {
        flashTip(`请求 ${requestedCount} 张，成功 ${newIds.length} 张；未成功部分已退回积分`);
      }
      // 新结果保留在任务占位位置，用户主动点击才切换选中节点。
      return generated;
    } catch (e) {
      const message =
        e instanceof Error && e.message ? e.message : t("canvas.genFail");
      if (selectedIdRef.current === source.id) setGenError(message);
      else flashTip(`${source.title}：${message}`);
      return [];
    } finally {
      generationOperationRef.current.delete(operationKey);
      delete generationTaskPosRef.current[taskId];
      setGenerationTasks((current) =>
        current.filter((task) => task.id !== taskId)
      );
    }
  }

  // 抠图:不走生成(不重绘主体),调自托管 rembg 服务把主体原样抠出、背景置透明。
  // 同步返回,新节点落在生成占位处,挂在源节点下。
  async function runCutout(source: Artwork, quality: "fast" | "fine" = "fine") {
    if (readOnly || !user) return;
    const operationKey = `node:${source.id}`;
    if (generationOperationRef.current.has(operationKey)) return;
    generationOperationRef.current.add(operationKey);
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sourceNode = rfNodes.find((node) => node.id === source.id);
    const sourceSize = flowNodeSize(sourceNode);
    const taskPosition = sourceNode
      ? { x: sourceNode.position.x + sourceSize.width + X_GAP, y: sourceNode.position.y }
      : { x: 0, y: 0 };
    generationTaskPosRef.current[taskId] = taskPosition;
    setGenerationTasks((current) => [
      ...current,
      {
        id: taskId,
        operationKey,
        sourceId: source.id,
        label: "主体提取中…",
        stage: "generating", startedAt: Date.now(), previewSize: generationPlaceholderSize(source.ratio),
        position: taskPosition,
      },
    ]);
    setGenError(null);
    try {
      const fd = new FormData();
      fd.append("sourceUrl", source.image);
      fd.append("email", user.email);
      fd.append("parentId", source.id);
      fd.append("title", `${source.title || "作品"} · 抠图`);
      fd.append("category", source.category || "main");
      fd.append("ratio", source.ratio || "1:1");
      fd.append("resolution", source.resolution || "1K");
      // 抠图统一发丝级(Replicate),扣 1 积分/张,与抠图页一致
      fd.append("quality", quality);
      const res = await privateFetch("/api/cutout", {
        method: "POST",
        headers: await authHeader(),
        body: fd,
      });
      const j = await readJsonSafe(res);
      if (!res.ok || !j.ok) throw new Error(j.error || t("canvas.genFail"));
      const newId: string | undefined = j.id;
      if (!newId) throw new Error(t("canvas.genFail"));
      if (j.user) applyServerUser(j.user); // 即时回写余额积分(扣 1 分)
      // 落到生成占位处(源节点右侧或用户拖动后的位置),与生成流一致
      const basePos = generationTaskPosRef.current[taskId] ?? taskPosition;
      if (basePos) {
        await privateFetchRaw("/api/artworks/position", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            id: newId,
            x: Math.round(basePos.x),
            y: Math.round(basePos.y),
          }),
        }).catch(() => {});
      }
      const freshCut = await mergeWorks([newId]);
      pushAddUndo(newId, freshCut); // 抠图结果可撤销
      // 后台完成不改变用户当前选中节点。
    } catch (e) {
      const message =
        e instanceof Error && e.message ? e.message : t("canvas.genFail");
      if (selectedIdRef.current === source.id) setGenError(message);
      else flashTip(`${source.title}：${message}`);
    } finally {
      generationOperationRef.current.delete(operationKey);
      delete generationTaskPosRef.current[taskId];
      setGenerationTasks((current) =>
        current.filter((task) => task.id !== taskId)
      );
    }
  }

  // 面板「生成」:用编辑框提示词 + 参数 + 追加参考图(留空=按这张图再生成一张)
  async function generateChild() {
    if (!selected) return;
    if (generationMode === "detail") {
      const references = visibleDockRefs.length ? visibleDockRefs : [selected];
      await generateDetailSequence(selected, references, editPrompt.trim(), extraFiles);
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
          taskLabel: "三视图合成中…",
          userPrompt: feedback || "生成正侧背三视图",
        }
      );
      if (result[0]) await renameGeneratedArtwork(result[0].id, "正侧背三视图");
      return;
    }
    if (generationMode === "split") {
      await generateSplitViews(selected, editPrompt.trim());
      return;
    }
    const text =
      editPrompt.trim() || selected.prompt || FAITHFUL_REGEN_PROMPT;
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
      baseFile: useUploadAsBase ? extraFiles[0] : undefined,
      extra: useUploadAsBase ? extraFiles.slice(1) : extraFiles,
      refUrls: useUploadAsBase ? [] : visibleDockRefs.map((r) => r.image),
      userPrompt: editPrompt.trim(),
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

  /**
   * 扩图/标注编辑共用的结果落地管线:占位节点 + 假进度 → 请求 →
   * 落到源图右侧 → mergeWorks → 撤销记录 → 积分回写(与 applyOcrSegment 同款)。
   */
  async function landEditResult(
    source: Artwork,
    run: () => Promise<Response>,
    label: string
  ): Promise<void> {
    if (readOnly || !user) return;
    const contextEpoch = canvasContextEpochRef.current;
    const contextProjectKey = activeProjectRef.current?.key || null;
    const operationKey = `node:${source.id}`;
    if (generationOperationRef.current.has(operationKey)) return;
    generationOperationRef.current.add(operationKey);
    const sourceNode = rfRef.current?.getNode(source.id);
    const sourceSize = sourceNode ? flowNodeSize(sourceNode) : artworkNodeSize(source);
    const x = (sourceNode?.position.x ?? source.canvasX ?? 0) + sourceSize.width + X_GAP;
    const y = sourceNode?.position.y ?? source.canvasY ?? 0;
    const pendingId = `pend-edit-${browserRandomUUID()}`;
    setPendNodes((current) => [
      ...current,
      {
        id: pendingId,
        operationKey,
        x,
        y,
        parentId: source.id,
        linked: true,
        label: `${label}结果`,
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
    }, 900);
    try {
      const response = await run();
      const data = await readJsonSafe(response);
      if (!response.ok || !data?.id) throw new Error(data?.error || `${label}失败`);
      await privateFetchRaw("/api/artworks/position", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: data.id, x: Math.round(x), y: Math.round(y) }),
      }).then((response) => {
        if (!response.ok) throw new Error(`${label}结果定位失败`);
      });
      const fresh = await mergeWorks([String(data.id)]);
      if (!fresh.some((item) => item.id === String(data.id))) throw new Error(`${label}结果加载失败`);
      if (
        contextEpoch !== canvasContextEpochRef.current ||
        activeProjectRef.current?.key !== contextProjectKey
      ) return;
      pushAddUndo(String(data.id), fresh);
      if (data.user) applyServerUser(data.user);
      // 不抢占用户当前编辑中的节点。
      flashTip(`${label}完成，结果已生成在原图右侧`);
    } catch (error) {
      if (
        contextEpoch === canvasContextEpochRef.current &&
        activeProjectRef.current?.key === contextProjectKey
      ) {
        flashTip(error instanceof Error ? error.message : `${label}失败`);
      }
    } finally {
      window.clearInterval(timer);
      setPendNodes((items) => items.filter((item) => item.id !== pendingId));
      generationOperationRef.current.delete(operationKey);
    }
  }

  async function openVideoNodeFromSelection(blank=false){
    if(!user||readOnly||!canFeature("video"))return;
    try{
      const id=`vnode-${browserRandomUUID()}`,project=active?.key||`tree:${id}`,center=centerScreen();
      const point=rfRef.current?.screenToFlowPosition(center)||{x:0,y:0};
      const model=videoCatalog.find(item=>item.isDefault)||videoCatalog[0];
      const selectedIds=blank?new Set<string>():new Set([...multiSel,...(selectedId?[selectedId]:[]),...(selectedTextId?[selectedTextId]:[])]);
      const choices=videoInputChoices.filter(choice=>selectedIds.has(choice.nodeId));
      const raw={modelId:model?.modelId,providerId:model?.providerId,prompt:blank?"":selected?.prompt||""};
      const config=reconcileVideoSettings(raw,catalogCapability(model)).config;
      const images=choices.filter(choice=>choice.kind==="image").length;
      const proposed=choices.length===0?"text":choices.length===1&&images===1?"single_image":"reference";
      if(catalogCapability(model).modes?.includes(proposed))config.mode=proposed;
      const inputs=videoModeRoles(choices.map(choice=>({id:`ref-${browserRandomUUID()}`,nodeId:choice.nodeId,kind:choice.kind,role:choice.kind==="text"?"context" as const:choice.kind==="video"?"source_video" as const:choice.kind==="audio"?"source_audio" as const:"reference" as const,value:choice.value})),config.mode);
      const created=await videoNodesStore.save(id,{projectKey:project,title:"视频",x:point.x,y:point.y,width:384,height:320,config,inputs});pushUndo({kind:"video-add",records:[created]});
      setCreatingNew(false);setActiveKey(project);setBrowsing(false);setSelectedId(id);setSelectedTextId(null);setSelectedPendId(null);setMultiSel([]);setVideoEditId(id);
    }catch(error){flashTip(error instanceof Error?error.message:"新增视频节点失败");}
  }
  async function patchVideoNode(id:string,patch:VideoPatchFields&{expectedRevision?:number}){
    await videoNodesStore.flush();const before=videoNodesStore.getNode(id);if(!before)throw new Error("视频节点不存在");
    const {expectedRevision,...fields}=patch,from:VideoPatchFields={};for(const key of Object.keys(fields) as Array<keyof VideoPatchFields>)Object.assign(from,{[key]:structuredClone(before[key])});
    const result=await videoNodesStore.save(id,{...fields,expectedRevision:expectedRevision??before.revision});
    if(JSON.stringify(from)!==JSON.stringify(fields))pushUndo({kind:"video-patch",id,from,to:fields});return result;
  }
  async function saveVideoDraft(id:string,draft:VideoNodeDraft){return patchVideoNode(id,{title:draft.title,config:draft.config,inputs:draft.inputs,expectedRevision:draft.expectedRevision});}
  async function generateVideoDraft(id:string,draft:VideoNodeDraft,quote:PublicQuote){
    if(!user||readOnly)throw new Error("无法修改此画布");
    let previous=readVideoReceipt(localStorage,user.email,id);
    if(previous){const response=await privateFetchRaw(`/api/video/tasks?idempotencyKey=${encodeURIComponent(previous.idempotencyKey)}`),data=await response.json();
      if(response.ok&&data.task){if(!["completed","failed","cancelled"].includes(data.task.status)){await videoNodesStore.refresh();await videoTaskStore.refresh();throw new Error("上次视频任务仍在执行，设置尚未提交");}clearVideoReceipt(localStorage,user.email,id,previous.idempotencyKey);previous=null;}
      else if(response.status!==404)throw new Error(data.error||"上次视频提交尚未核实");
      else if(previous.expectedRevision!==draft.expectedRevision)throw new Error("上次提交尚未核实，节点已更新，请先查看任务历史");
      else {const current=videoNodesStore.nodes.find(node=>node.id===id);if(!current||JSON.stringify({title:current.title,config:current.config,inputs:current.inputs})!==JSON.stringify({title:draft.title,config:draft.config,inputs:draft.inputs}))throw new Error("上次提交尚未核实，请先恢复原设置或查看任务历史");}
    }
    const saved=previous&&previous.expectedRevision===draft.expectedRevision?videoNodesStore.nodes.find(node=>node.id===id):await saveVideoDraft(id,draft);
    if(!saved)throw new Error("视频节点不存在");
    const receipt=prepareVideoReceipt(localStorage,user.email,saved);
    const response=await billing.submit(`/api/canvas/video-nodes/${encodeURIComponent(id)}/generate`,{method:"POST",headers:{"content-type":"application/json","x-naumi-canvas":"1"},body:JSON.stringify({expectedRevision:receipt.expectedRevision,idempotencyKey:receipt.idempotencyKey})},quote);
    const data=await readJsonSafe(response);if(!response.ok){if(response.status<500&&!["OPERATION_PENDING","OPERATION_CONFLICT"].includes(data?.code))clearVideoReceipt(localStorage,user.email,id,receipt.idempotencyKey);throw new Error(data?.error||"视频提交失败，请核查任务后重试");}
    saveVideoReceipt(localStorage,user.email,{...receipt,taskId:String(data.taskId)});
    await videoNodesStore.refresh();await videoTaskStore.refresh();await refreshCredits();
  }

  async function selectVideoResult(id:string,artworkId:string|null,expectedRevision:number){
    if(!user||readOnly||isNodeLocked(id))throw new Error("无法替换视频结果");const account=canvasAccountRef.current,project=activeProjectRef.current?.key,key=JSON.stringify([account,id,artworkId]);await videoNodesStore.flush();if(account!==canvasAccountRef.current)throw new Error("账号已切换");
    const current=videoNodesStore.getNode(id);if(!current||current.deletedAt||current.projectKey!==project)throw new Error("视频节点不存在或项目已切换");let attempt=videoResultAttempts.current.get(key);
    if(!attempt){if(current.revision!==expectedRevision)throw new Error("视频节点已更新，请重新选择结果");attempt={operationId:browserRandomUUID(),from:current.displayResultId||null,to:artworkId,operations:[{type:"video-result",id,expectedRevision,expectedArtworkId:current.displayResultId||null,artworkId}]};videoResultAttempts.current.set(key,attempt);}
    const response=await privateFetchRaw("/api/canvas/history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operationId:attempt.operationId,operations:attempt.operations})});const data=await readJsonSafe(response);
    if(!response.ok){if(response.status<500)videoResultAttempts.current.delete(key);await videoNodesStore.refresh();throw new Error(data.error||"结果选择尚未核实，请重试");}videoResultAttempts.current.delete(key);
    if(account!==canvasAccountRef.current||activeProjectRef.current?.key!==project)return;await videoNodesStore.refresh();if(account!==canvasAccountRef.current||activeProjectRef.current?.key!==project)return;
    if(artworkId)await mergeWorks([artworkId]);if(account!==canvasAccountRef.current||activeProjectRef.current?.key!==project)return;pushUndo({kind:"video-result",id,from:attempt.from,to:attempt.to});
  }

  async function onExpand(ratio: string) {
    const source = selected;
    setExpandOpen(false);
    if (!source) return;
    await landEditResult(
      source,
      () =>
        privateFetch("/api/canvas/expand", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ artworkId: source.id, ratio, anchor: expandAnchor }),
        }),
      "扩图"
    );
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
      for (let i = 0; i < images.length; i++) {
        const x = Math.round(baseX + i * 40);
        const y = Math.round(baseY + i * 40);
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
            x: Math.round(baseX + images.length * 40),
            y: Math.round(baseY + images.length * 40),
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
    await landEditResult(
      source,
      () => privateFetch("/api/canvas/annotate", { method: "POST", body: formData }),
      "标注编辑"
    );
    setAnnotateArtwork(null);
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
    const controller=new AbortController();assistantController.current?.abort();assistantController.current=controller;
    assistantLiveSessionId.current=id;
    assistantSessionId.current=id;setAssistantSteps([]);setAssistantOutcome("running");setAssistantBusy(true);setAssistantResponding(false);setAssistantInput("");setAssistantError(null);assistantRetry.current=null;
    let recalled = false;
    try{
      for(;;){
        const response=await privateFetchRaw(`/api/canvas/assistant?projectKey=${encodeURIComponent(activeKey||"workspace")}&id=${encodeURIComponent(id)}`,{signal:controller.signal});
        const data=await expectJsonOk(response,"历史对话读取失败");
        if(controller.signal.aborted||assistantController.current!==controller)return;
        setAssistantArtworkId(data.session.anchorId||null);setSelectedId(data.session.anchorId||null);setSelectedTextId(null);
        setAssistantTurns(data.session.turns);
        const steps=new Map<string,AgentOrbStep>();
        const historySteps=data.session.steps||[], currentTurn=historySteps.findLastIndex((step:{type:string})=>step.type==="canvas_turn");
        for(const step of historySteps.slice(Math.max(0,currentTurn)))if(["tool_start","tool_end"].includes(step.type))steps.set(step.id,{id:step.id,tool:step.tool,label:agentToolLabel(step.tool, locale === "en"),summary:agentToolSummary(step.summary),status:step.type==="tool_start"?(data.session.running?"running":"error"):step.isError?"error":"done"});
        setAssistantSteps([...steps.values()].slice(-10));
        setAssistantOutcome(restoredOrbOutcome(data.session));
        {
          orbCue({ type: "restore", recall: !recalled, running: !!data.session.running, outcome: restoredOrbOutcome(data.session), attention: data.session.attention, phase: agentOrbState(!!data.session.running, restoredOrbOutcome(data.session), [...steps.values()]) });
          recalled = true;
        }
        if(!data.session.running){if(data.session.error)setAssistantError(data.session.error);const ids=data.session.turns.flatMap((turn:AssistantTurn)=>(turn.artifacts||[]).map(art=>art.id));if(ids.length)await mergeWorks(ids);break;}
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


  async function sendAssistantMessage() {
    const text = assistantInput.trim();
    if (assistantBusy || !text) return;
    const members = active?.members ?? [];
    const source = members.find((artwork) => artwork.id === assistantArtworkId);
    const anchorId=source?.id||"";
    const previousAttempt = assistantRetry.current;
    const history = previousAttempt?.input === text && previousAttempt.anchorId === anchorId ? previousAttempt.history : [
      ...assistantTurns,
      { id: `as-u-${Date.now()}`, role: "user" as const, content: text },
    ];
    const attempt = previousAttempt?.input === text && previousAttempt.anchorId === anchorId ? previousAttempt : {
      input: text, anchorId, history,
      body: JSON.stringify({ mode: "agent", skill: assistantSkill ? { id: assistantSkill.id, revision: assistantSkill.revision } : null, sessionId: assistantSessionId.current, turnId: browserRandomUUID(), anchorId, projectKey: activeKey||"workspace", contextIds: source?assistantContext(members, source.id).map((artwork) => artwork.id):[], messages: history.map(({ role, content }) => ({ role, content })), imageModelId: chosenFeatureModel("canvas.image") || genModel, ratio: genRatio === "auto" ? source?.ratio || "1:1" : genRatio, resolution: genResolution, quality: genQuality }),
    };
    assistantRetry.current = attempt;
    const epoch = ++assistantRequestEpoch.current;
    setAssistantError(null);
    setAssistantBusy(true);
    setAssistantResponding(false);
    setAssistantSteps([]); setAssistantOutcome("running");
    orbCue({ type: "submit" });
    const controller = new AbortController();
    const acceptedSession = assistantSessionId.current;
    assistantLiveSessionId.current=acceptedSession;
    let serverSessionId = acceptedSession;
    assistantController.current = controller;
    const artifactIds = new Set<string>();
    let orbFailureCode: string | undefined;
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
      setAssistantTurns(history);
      setAssistantInput("");
      // SSE 流式:追加一条空助手消息,随 delta 逐段填充
      setAssistantTurns((current) => [
        ...current,
        { id: `as-a-${Date.now()}`, role: "assistant", content: "" },
      ]);
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
          if(type==="open"){serverSessionId=String(data.sessionId||acceptedSession);assistantLiveSessionId.current=serverSessionId;}
          if(type==="done" && data.ok===true)completed=true;
          if (type === "attention") {
            const attention = data.kind === "waiting" || data.kind === "restricted" ? data.kind : undefined;
            if (attention) orbCue({ type: "attention", kind: attention });
            else if (data.kind === "resolved") orbCue({ type: "attention-resolved", tool: String(data.tool || "") });
          }
          if (type === "delta") {
            if (Date.now() - lastOrbDelta > 650) { lastOrbDelta = Date.now(); orbCue({ type: "delta" }); }
            setAssistantResponding(true);
            text += (data.text as string) || "";
            setAssistantTurns((current) => {
              const copy = [...current];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: text };
              return copy;
            });
          } else if (type === "error") {
            if (typeof data.code === "string") orbFailureCode = data.code;
            streamError = (data.error as string) || (data.message as string) || "画布助手暂时不可用";
          } else if (type === "tool_start" || type === "tool_end") {
            orbCue(type === "tool_start" ? { type: "tool-start", tool: String(data.tool || "") } : { type: "tool-end", error: !!data.isError });
            setAssistantResponding(false);
            const id = String(data.id || data.tool), label = agentToolLabel(String(data.tool || ""), locale === "en");
            setAssistantSteps(current => {
              const next: AgentOrbStep = {id,label,tool:String(data.tool || ""),summary:agentToolSummary(data.summary),status:type === "tool_start" ? "running" : data.isError ? "error" : "done"};
              return current.some(step => step.id === id) ? current.map(step => step.id === id ? next : step) : [...current, next];
            });
          } else if (type === "artifacts" && Array.isArray(data.artifacts)) {
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
    } catch (error) {
      if (epoch !== assistantRequestEpoch.current) return;
      if(acceptedSession!==assistantSessionId.current)return;
      if (assistantRetry.current === attempt) setAssistantInput(text);
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

  async function generateSplitViews(source: Artwork, feedback: string) {
    const viewSet = `views:${source.id}:${Date.now()}`;
    const front = await runGen(source, viewPrompt("正面", feedback), {
      ratio: genRatio,
      style: genStyle,
      count: 1,
      resolution: genResolution,
      parentId: source.id,
      refUrls: [source.image],
      operationKey: `${viewSet}:front`,
      taskLabel: "生成正面锚点…",
      userPrompt: feedback ? `正面视图：${feedback}` : "生成正面视图",
      taskOffset: 0,
    });
    const anchor = front[0];
    if (!anchor) return;
    await renameGeneratedArtwork(anchor.id, "正面视图");
    const shared = [source.image, anchor.url];
    const [side, back] = await Promise.all([
      runGen(source, viewPrompt("侧面", feedback, true), {
        ratio: genRatio,
        style: genStyle,
        count: 1,
        resolution: genResolution,
        parentId: source.id,
        parentIds: [anchor.id],
        refUrls: shared,
        operationKey: `${viewSet}:side`,
        taskLabel: "生成侧面视图…",
        userPrompt: feedback ? `侧面视图：${feedback}` : "生成侧面视图",
        taskOffset: 1,
      }),
      runGen(source, viewPrompt("背面", feedback, true), {
        ratio: genRatio,
        style: genStyle,
        count: 1,
        resolution: genResolution,
        parentId: source.id,
        parentIds: [anchor.id],
        refUrls: shared,
        operationKey: `${viewSet}:back`,
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
    pend?: Pend
  ) {
    if (!user || readOnly) return;
    const operationKey = pend ? `pend:${pend.id}` : `node:${source.id}`;
    if (generationOperationRef.current.has(operationKey)) return;
    generationOperationRef.current.add(operationKey);
    const count = Math.max(1, Math.min(MAX_GENERATION_COUNT, genCount || 1));
    const sourceNode = rfRef.current?.getNode(source.id);
    const sourceSize = flowNodeSize(sourceNode);
    const basePosition = pend
      ? { x: pend.x, y: pend.y }
      : sourceNode
        ? { x: sourceNode.position.x + sourceSize.width + X_GAP, y: sourceNode.position.y }
        : { x: 0, y: 0 };
    const taskId = `task-detail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    generationTaskPosRef.current[taskId] = basePosition;
    setGenerationTasks((current) => [
      ...current,
      {
        id: taskId,
        operationKey,
        sourceId: source.id,
        label: fmt(t("canvas.detailProgress"), { done: 0, total: count }),
        stage: "preparing", startedAt: Date.now(), previewSize: generationPlaceholderSize(genRatio), count, completed: 0,
        position: basePosition,
      },
    ]);
    if (pend) {
      setPendNodes((current) =>
        current.map((node) => (node.id === pend.id ? { ...node, generating: true } : node))
      );
    }
    setGenError(null);
    try {
      const form = new FormData();
      const maxArtworkRefs = Math.max(0, MAX_TOTAL_IMAGES - uploadedRefs.length);
      const arts = referenceArts.slice(0, maxArtworkRefs);
      for (let index = 0; index < arts.length; index++) {
        const artwork = arts[index];
        const blob = await readBrowserImage(artwork.image);
        form.append(
          "image",
          new File([blob], `detail-ref-${index + 1}.png`, {
            type: blob.type || "image/png",
          })
        );
      }
      uploadedRefs.slice(0, MAX_TOTAL_IMAGES - arts.length).forEach((file) =>
        form.append("image", file)
      );
      if (form.getAll("image").length === 0) {
        throw new Error(t("canvas.detailNeedRefs"));
      }
      form.append("prepared", "1");
      if (genModel) form.append("model", genModel);
      form.append("text", feedback);
      form.append("platform", "taobao");
      form.append("lang", "zh");
      form.append(
        "format",
        ["1:1", "4:3", "16:9", "9:16"].includes(genRatio)
          ? genRatio
          : "aplus-web"
      );
      DETAIL_MODULE_ORDER.slice(0, count).forEach((module) => form.append("module", module));
      form.append("email", user.email);
      form.append("origin", "canvas");
      const lineage = arts.length ? arts : [source];
      form.append("parentId", lineage[0].id);
      form.append("parentIds", JSON.stringify(lineage.slice(1).map((artwork) => artwork.id)));

      const startedResponse = await privateFetch("/api/aplus", {
        method: "POST",
        headers: await authHeader(),
        body: form,
      });
      const started = await readJsonSafe(startedResponse);
      if (!startedResponse.ok || !started.jobId) {
        throw new Error(started.error || t("canvas.genFail"));
      }
      const deadline = Date.now() + 20 * 60 * 1000;
      let shots: Array<{ id: string; status: string; url?: string | null }> = [];
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        if (Date.now() > deadline) throw new Error(t("canvas.genFail"));
        const pollResponse = await privateFetch(
          `/api/aplus?job=${encodeURIComponent(started.jobId)}`,
          { cache: "no-store" }
        );
        const poll = await readJsonSafe(pollResponse);
        if (!pollResponse.ok) throw new Error(poll.error || t("canvas.genFail"));
        const done = Number(poll.done || 0);
        setGenerationTasks((current) =>
          current.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  label: fmt(t("canvas.detailProgress"), { done, total: count }),
                  stage: poll.status === "done" ? "saving" : "generating", completed: done,
                }
              : task
          )
        );
        if (poll.status === "error") { if (poll.user) applyServerUser(poll.user); throw new Error(poll.error || t("canvas.genFail")); }
        if (poll.status === "done") {
          shots = (poll.shots ?? []) as typeof shots;
          if (poll.user) applyServerUser(poll.user);
          break;
        }
      }
      const ids = shots
        .filter((shot) => shot.status === "done" && shot.id && shot.url)
        .map((shot) => shot.id);
      if (!ids.length) throw new Error(t("canvas.genFail"));
      const fresh = await mergeWorks(ids);
      const freshById = new Map(fresh.map((art) => [art.id, art]));
      let detailY = basePosition.y;
      await Promise.all(
        ids.map((id) => {
          const y = detailY;
          detailY += artworkNodeSize(freshById.get(id) ?? { width: NODE_W, height: 110 }).height + 24;
          return privateFetchRaw("/api/artworks/position", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              email: user.email,
              id,
              x: Math.round(basePosition.x),
              y: Math.round(y),
            }),
          }).catch(() => {});
        })
      );
      if (pend) {
        setPendNodes((current) => current.filter((node) => node.id !== pend.id));
        setSelectedPendId((current) => (current === pend.id ? null : current));
      }
      pushAddUndoMany(ids, fresh);
      // 详情序列完成后保留用户当前选择。
    } catch (error) {
      const message = error instanceof Error ? error.message : t("canvas.genFail");
      if (pend ? selectedPendIdRef.current === pend.id : selectedIdRef.current === source.id) setGenError(message);
      else flashTip(`${source.title}：${message}`);
      if (pend) {
        setPendNodes((current) =>
          current.map((node) => (node.id === pend.id ? { ...node, generating: false } : node))
        );
      }
    } finally {
      generationOperationRef.current.delete(operationKey);
      delete generationTaskPosRef.current[taskId];
      setGenerationTasks((current) => current.filter((task) => task.id !== taskId));
    }
  }

  async function retrySelected() {
    if (!selected) return;
    const feedback = editPrompt.trim();
    const originalPrompt = selected.prompt || FAITHFUL_REGEN_PROMPT;
    const prompt = `${originalPrompt}${
      feedback && feedback !== originalPrompt
        ? `\n本次重做要求：${feedback}`
        : "\n重新生成一个新版本，严格保持产品身份和关键细节。"
    }`;
    const parent = selected.parentId
      ? active?.members.find((item) => item.id === selected.parentId) ?? selected
      : selected;
    const retried = await runGen(parent, prompt, {
      ratio: selected.ratio || genRatio,
      style: selected.style || genStyle,
      count: 1,
      resolution: selected.resolution || genResolution,
      parentId: selected.parentId || selected.id,
      parentIds: selected.parentIds ?? [],
      refUrls: [selected.image, ...(parent.id === selected.id ? [] : [parent.image])],
      operationKey: `retry:${selected.id}`,
      taskLabel: "按要求重做中…",
      userPrompt: feedback || selected.prompt || "重做当前图片",
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
    void runGen(selected, selected.prompt || "", {
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
  async function runDelete(ids: string[]) {
    if (!user || readOnly) return;const account=canvasAccountRef.current;
    if (!nodeSettingsReady || ids.some(isNodeLocked)) { flashTip(L("请先解锁选中的节点","Unlock selected nodes first")); return; }
    const uniqueIds = Array.from(
      new Set(
        ids.filter(
          (id) => id && !id.startsWith("pend-") && !id.startsWith("task-")
        )
      )
    );
    if (!uniqueIds.length) return;
    const deleting = new Set(uniqueIds);
    const artworkRecords = (works ?? []).filter((work) => deleting.has(work.id));
    const textRecords = textNodes.filter((node) => deleting.has(node.id));
    const videoRecords=videoNodesStore.nodes.filter(node=>deleting.has(node.id));
    const artworkIds = artworkRecords.map((record) => record.id);
    const textIds = textRecords.map((record) => record.id);
    const videoIds=videoRecords.map(node=>node.id);
    if (!artworkIds.length && !textIds.length&&!videoIds.length) return;
    setSelectedId(null);
    setSelectedTextId(null);
    setSelectedPendId(null);
    try {
      const response = await privateFetchRaw("/api/canvas/nodes/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artworkIds, textIds,videoIds,operationId:browserRandomUUID() }),
      });
      await expectJsonOk(response, t("canvas.genFail"));if(account!==canvasAccountRef.current)return;

      if(videoRecords.length){pushUndo({kind:"mixed-delete",artworks:artworkRecords,textNodes:textRecords,videoNodes:videoRecords});await videoNodesStore.refresh();}
      else if (artworkRecords.length && textRecords.length) {
        pushUndo({
          kind: "mixed-delete",
          artworks: artworkRecords,
          textNodes: textRecords,
        });
      } else if (artworkRecords.length) {
        pushUndo({ kind: "delete", records: artworkRecords });
      } else if (textRecords.length) {
        pushUndo({ kind: "text-delete", records: textRecords });
      }

      removeWorksLocal(artworkIds);
      if (textIds.length) {
        setTextNodes((current) =>
          current.filter((node) => !deleting.has(node.id))
        );
      }
      setMultiSel((current) => current.filter((id) => !deleting.has(id)));

      // 只有当前项目的媒体与文字节点都被删空时才退回项目网格。
      const activeProjectKey = active?.key ?? activeKey;
      const remainingArtwork =
        active?.members.some((member) => !deleting.has(member.id)) ?? false;
      const remainingText = activeProjectKey
        ? textNodes.some(
            (node) =>
              node.projectKey === activeProjectKey && !deleting.has(node.id)
          )
        : false;
      const remainingVideo=videoNodesStore.nodes.some(node=>node.projectKey===activeProjectKey&&!deleting.has(node.id));
      if (activeProjectKey && !remainingArtwork && !remainingText&&!remainingVideo) {
        setActiveKey(null);
        setCreatingNew(false);
        setBrowsing(true);
      }
    } catch (e) {
      flashTip(e instanceof Error ? e.message : t("canvas.genFail"));
    }
  }

  // A history step is persisted atomically before any local state or stack changes.
  const historyBusyRef = useRef(false);
  const [historySaving,setHistorySaving] = useState(false);
  const historyAttemptsRef = useRef(new WeakMap<UndoAct, {operationId:string;operations:Array<Record<string,unknown>>}>());
  async function applyHistory(act: UndoAct, undo: boolean) {
    const account=canvasAccountRef.current;
    if (act.kind === "pending-link") {
      const pending = pendNodesRef.current.find(node => node.id === act.id);
      if (!pending || pending.generating || pending.uploading) throw new Error(L("节点已开始生成或已移除", "Node is generating or no longer exists"));
      setPendNodes(current => current.map(node => node.id === act.id ? { ...node, ...act[undo ? "from" : "to"] } : node));
      return;
    }
    await Promise.all(Array.from(textSaveQueuesRef.current.values()));
    await videoNodesStore.flush();
    const side = undo ? "from" : "to";
    let operations: Array<Record<string, unknown>> = [];
    const videoPatch=(id:string,fields:VideoPatchFields)=>{const current=videoNodesStore.getNode(id);if(!current)throw new Error("视频节点不存在，请刷新画布");operations.push({type:"video-patch",id,expectedRevision:current.revision,fields});};
    const position=(id:string,point:{x:number;y:number},text=id.startsWith("text-"))=>{if(videoNodesStore.getNode(id))videoPatch(id,point);else operations.push({type:"position",id,text,...point});};
    const visibility = (records: Artwork[], visible: boolean) => records.forEach(record => operations.push({type:"visibility",id:record.id,visible}));
    const texts = (records: CanvasTextNode[], visible: boolean) => records.forEach(node => operations.push(visible ? {type:"text-restore",node} : {type:"text-delete",id:node.id}));
    const videos=(records:CanvasVideoNode[],visible:boolean)=>records.forEach(node=>operations.push({type:"video-visibility",id:node.id,visible}));
    if(act.kind==="video-patch")videoPatch(act.id,act[side]);
    else if(act.kind==="video-result"){const current=videoNodesStore.getNode(act.id);if(!current)throw new Error("视频节点不存在");operations.push({type:"video-result",id:act.id,expectedRevision:current.revision,expectedArtworkId:act[undo?"to":"from"],artworkId:act[side]});}
    else if(act.kind==="video-add")videos(act.records,!undo);
    else if (act.kind === "move" || act.kind === "text-move") position(act.id,act[side],act.kind === "text-move");
    else if (act.kind === "move-many") act.moves.forEach(move => position(move.id,move[side]));
    else if (act.kind === "canvas-group") act.changes.forEach(change => operations.push({type:"group",id:change.id,value:change[side]}));
    else if (act.kind === "mixed-delete" || act.kind === "workflow-add" || act.kind === "mixed-add") { const visible = act.kind === "mixed-delete" ? undo : !undo; visibility(act.artworks,visible); texts(act.textNodes,visible); if(act.kind==="mixed-delete"||act.kind==="mixed-add")videos(act.videoNodes||[],visible); }
    else if (act.kind === "delete" || act.kind === "add") visibility(act.records,act.kind === "delete" ? undo : !undo);
    else if (act.kind === "text-delete" || act.kind === "text-add") texts(act.records,act.kind === "text-delete" ? undo : !undo);
    else if (act.kind === "parent") operations.push({type:"parent",id:act.targetId,parentId:act.parentId,add:undo ? !act.added : act.added});
    else if (act.kind === "text-patch") operations.push({type:"text-patch",id:act.id,fields:act[side]});
    else if (act.kind === "rename") operations.push({type:"rename",id:act.id,title:act[side]});
    else if (act.kind === "art-size") operations.push({type:"size",id:act.id,...act[side]});
    else if (act.kind === "mark") act.changes.forEach(change => operations.push({type:"mark",id:change.id,marked:change[side]}));
    else if (act.kind === "node-settings") operations.push({type:"node-settings",id:act.id,text:act.text,video:act.video,settings:act[side]});
    else if (act.kind === "workflow-fill") operations.push({type:"workflow-asset",id:act.id,assetOperationId:act.assetOperationId,filled:!undo});
    let attempt=historyAttemptsRef.current.get(act);
    if(!attempt){attempt={operationId:browserRandomUUID(),operations:structuredClone(operations)};historyAttemptsRef.current.set(act,attempt);}
    const operationId=attempt.operationId;operations=attempt.operations;
    const response=await privateFetchRaw("/api/canvas/history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operationId,operations}),signal:AbortSignal.timeout(20_000)});
    await expectJsonOk(response,t("canvas.genFail"));if(account!==canvasAccountRef.current)throw new Error("画布账号已切换");
    // All operations below are local applications of an already committed transaction.
    for (const op of operations) {
      const id=op.id as string;
      if(op.type==="video-patch"||op.type==="video-visibility")continue;
      if (op.type === "visibility") {
        if (op.visible) {
          const records = act.kind === "mixed-delete" || act.kind === "workflow-add" || act.kind === "mixed-add" ? act.artworks : (act as {records:Artwork[]}).records;
          const record = records.find(record=>record.id===id);
          if (record) setWorks(current=>[...(current || []).filter(node=>node.id!==id),record]);
        } else setWorks(current=>current?.filter(node=>node.id!==id) ?? current);
      } else if (op.type === "text-restore") {
        const node=op.node as CanvasTextNode;
        setTextNodes(current=>[...current.filter(item=>item.id!==node.id),node]);
      } else if (op.type === "text-delete") {
        setTextNodes(current=>current.filter(node=>node.id!==id));
        setSelectedTextId(current=>current===id ? null : current);
      } else if (op.type === "node-settings") {
        const next={...nodeSettingsRef.current,[id]:op.settings as CanvasNodeSettings};
        nodeSettingsRef.current=next;setNodeSettings(next);
      } else if (op.type === "position" && op.text) setTextNodes(current=>current.map(node=>node.id===id ? {...node,canvasX:op.x as number,canvasY:op.y as number} : node));
      else if (op.type === "text-patch") setTextNodes(current=>current.map(node=>node.id===id ? {...node,...op.fields as TextPatchFields} : node));
      else if (op.type === "workflow-asset" && act.kind === "workflow-fill") setWorks(current=>current?.map(node=>node.id===id ? act[side] : node) ?? current);
      else setWorks(current=>current?.map(node=> {
        if (node.id!==id) return node;
        if (op.type === "position") return {...node,canvasX:op.x as number,canvasY:op.y as number};
        if (op.type === "group") return {...node,canvasGroupId:op.value as string|null};
        if (op.type === "rename") return {...node,title:op.title as string};
        if (op.type === "size") return {...node,canvasX:op.x as number,canvasY:op.y as number,canvasWidth:op.width as number,canvasHeight:op.height as number};
        if (op.type === "mark") return {...node,marked:op.marked as boolean};
        if (op.type === "parent") {
          const parentId=op.parentId as string;
          const parents=new Set(node.parentIds || []);
          let primary=node.parentId;
          if (op.add) { if (!primary) primary=parentId; else if(primary!==parentId) parents.add(parentId); }
          else { if(primary===parentId) primary=null; parents.delete(parentId); }
          return {...node,parentId:primary,parentIds:Array.from(parents)};
        }
        return node;
      }) ?? current);
    }
    if(operations.some(op=>op.type==="video-patch"||op.type==="video-visibility"||op.type==="video-result"))await videoNodesStore.refresh();
    for(const op of operations) {const id=(op.id || (op.node as CanvasTextNode|undefined)?.id) as string; unsavedTextRef.current.delete(id);}
    setUnsavedTextCount(unsavedTextRef.current.size);
    historyAttemptsRef.current.delete(act);
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
  async function doUndo() {
    if (!undoStack.length || historyBusyRef.current || readOnly) return;
    historyBusyRef.current=true;
    setHistorySaving(true);
    const act=undoStack[undoStack.length-1];
    try {
      await applyHistory(act,true);
      setUndoStack(stack=>stack.filter(item=>item!==act));
      setRedoStack(stack=>[...stack,act]);
    } catch (error) { flashTip(error instanceof Error ? error.message : t("canvas.genFail")); }
    finally { historyBusyRef.current=false; setHistorySaving(false); }
  }
  async function doRedo() {
    if (!redoStack.length || historyBusyRef.current || readOnly) return;
    historyBusyRef.current=true;
    setHistorySaving(true);
    const act=redoStack[redoStack.length-1];
    try {
      await applyHistory(act,false);
      setRedoStack(stack=>stack.filter(item=>item!==act));
      setUndoStack(stack=>[...stack,act]);
    } catch (error) { flashTip(error instanceof Error ? error.message : t("canvas.genFail")); }
    finally { historyBusyRef.current=false; setHistorySaving(false); }
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
      await Promise.all(Array.from(textSaveQueuesRef.current.values()));
      const response=await privateFetchRaw("/api/canvas/history",{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({operationId:browserRandomUUID(),operations:[{type:"node-settings",id,text:id.startsWith("text-"),video:!!videoNodesStore.getNode(id),settings:to}]}),signal:AbortSignal.timeout(20000)});
      const data=await expectJsonOk(response,L("属性保存失败","Failed to save properties"));
      const next={...nodeSettingsRef.current,[id]:to};
      if(!data.persisted)localStorage.setItem(`naumi:node-settings:${user.email.toLowerCase()}`,JSON.stringify(next));
      nodeSettingsRef.current=next;setNodeSettings(next);pushUndo({kind:"node-settings",id,text:id.startsWith("text-"),video:!!videoNodesStore.getNode(id),from,to});return true;
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
    if(file && (file.size>MAX_UPLOAD || !["image/png","image/jpeg","image/webp"].includes(file.type))){flashTip(L("请选择12MB以内的PNG、JPEG或WebP","Choose a PNG, JPEG or WebP up to 12MB"));return;}
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
  async function runProjectDelete(p: Project, ids: string[]) {
    if (!user) return;const account=canvasAccountRef.current;
    setSidebarOpen(false);
    try {
      const response=await privateFetchRaw("/api/canvas/nodes/delete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectKey:p.key,operationId:browserRandomUUID()})});
      await expectJsonOk(response,t("canvas.genFail"));if(account!==canvasAccountRef.current)return;await videoNodesStore.refresh();if(account!==canvasAccountRef.current)return;
      if (p.key === activeKey) {
        setActiveKey(null);
        setSelectedId(null);
        setSelectedTextId(null);
        setCreatingNew(false);
        setBrowsing(true);
      }
      setNames((prev) => {
        const next = { ...prev };
        delete next[p.key];
        return next;
      });
      removeWorksLocal(ids); // 服务端成功后再本地移除整组
      setTextNodes((current) =>
        current.filter((node) => node.projectKey !== p.key)
      );
    } catch (e) {
      flashTip(e instanceof Error ? e.message : t("canvas.genFail"));
    }
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
      await refetchWorks();
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
  async function onConnect(conn: {
    source?: string | null;
    target?: string | null;
  }) {
    // 连到了某个目标节点 → 多输入(标记避免误弹新建菜单)
    connectedRef.current = true;
    const source = conn.source;
    const target = conn.target;
    if (!source || !target || source === target) return;
    if (source.startsWith("task-") || target.startsWith("task-")) return;
    const videoTarget=videoNodesStore.nodes.find(node=>node.id===target);
    if(videoTarget){
      if(readOnly||isNodeLocked(target))return;
      const choice=videoInputChoices.find(item=>item.nodeId===source);if(!choice||videoTarget.inputs.some(input=>input.nodeId===source))return;
      try{await patchVideoNode(target,{inputs:videoModeRoles([...videoTarget.inputs,{id:`ref-${browserRandomUUID()}`,nodeId:choice.nodeId,kind:choice.kind,role:choice.kind==="text"?"context":choice.kind==="video"?"source_video":choice.kind==="audio"?"source_audio":"reference",value:choice.value}],videoTarget.config.mode)});}catch(error){flashTip(error instanceof Error?error.message:"视频引用保存失败");}return;
    }

    // 连到空白占位节点 → 加为它的输入(客户端)
    if (target.startsWith("pend-")) {
      if (pendNodesRef.current.some(node => node.id === target && (node.generating || node.uploading))) return;
      setPendNodes((prev) =>
        prev.map((p) =>
          p.id === target
            ? {
                ...p,
                inputs: Array.from(new Set([...(p.inputs ?? []), source])),
              }
            : p
        )
      );
      return;
    }
    if (source.startsWith("pend-") || target.startsWith("pend-")) return;
    if (target.startsWith("text-")) {
      if (source.startsWith("text-")) { await updateTextReference(target, source, true); return; }
      const art = active?.members.find((member) => member.id === source);
      const textNode = textNodes.find((node) => node.id === target);
      if (!art || !textNode) return;
      // 多选了 ≥2 个文字节点时:这次连线=批量绑定产品图(全部连接 + @产品图前缀)
      const batchTextIds = multiSel.filter((id) => id.startsWith("text-"));
      if (batchTextIds.length >= 2 && batchTextIds.includes(target)) {
        const targets = batchTextIds
          .map((id) => textNodes.find((node) => node.id === id))
          .filter(
            (node): node is CanvasTextNode =>
              !!node && (!activeKey || node.projectKey === activeKey)
          );
        await Promise.all(targets.map((node) => bindProductToTextNode(node, art)));
        flashTip(fmt(t("canvas.productBound"), { n: targets.length }));
        return;
      }
      // 已绑产品的节点再连一张图 = 换绑产品图
      if ((textNode.productIds ?? []).length) {
        await bindProductToTextNode(textNode, art);
        return;
      }
      void updateTextReference(target, source, true);
      return;
    }
    if (source.startsWith("text-")) {
      const textNode = textNodes.find((node) => node.id === source);
      if (!textNode || target.startsWith("text-")) return;
      const updated: CanvasTextNode = {
        ...textNode,
        targetIds: Array.from(new Set([...(textNode.targetIds ?? []), target])),
        updatedAt: new Date().toISOString(),
      };
      setTextNodes((current) =>
        current.map((node) => (node.id === updated.id ? updated : node))
      );
      void persistTextNode(updated);
      return;
    }
    // 连到已有真实节点 → 多输入,写库(带防环)
    void addParentToNode(target, source);
  }
  // 多输入:给目标节点追加父节点(防环:源不能是目标的后代)
  async function addParentToNode(targetId: string, sourceId: string) {
    if (readOnly || !user || !active) return;
    const byId = new Map(active.members.map((m) => [m.id, m]));
    const parents = (id: string): string[] => {
      const m = byId.get(id);
      if (!m || m.source === "canvas-add") return [];
      const ps: string[] = [];
      if (m.parentId && byId.has(m.parentId)) ps.push(m.parentId);
      for (const pid of m.parentIds ?? [])
        if (pid && byId.has(pid)) ps.push(pid);
      return ps;
    };
    // target 是否是 source 的祖先?是则连接会成环,跳过
    const up = [sourceId];
    const seen = new Set<string>();
    let guard = 0;
    while (up.length && guard++ < 2000) {
      const id = up.pop() as string;
      if (id === targetId) {
        flashTip(t("canvas.linkCycle"));
        return;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      up.push(...parents(id));
    }
    try {
      const res = await privateFetchRaw("/api/artworks/parents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          id: targetId,
          parentId: sourceId,
        }),
      });
      await expectJsonOk(res, t("canvas.genFail"));
      pushUndo({
        kind: "parent",
        targetId,
        parentId: sourceId,
        added: true,
      }); // 连线可撤销(undo=剪断)
      await mergeWorks([targetId]); // 只补受影响的目标节点这一行
    } catch (e) {
      flashTip(e instanceof Error ? e.message : t("canvas.genFail"));
    }
  }
  // 剪断连线:把 source 从 target 的父节点(primary / parent_ids)里移除
  async function cutEdge(edge: { id: string; source: string; target: string }) {
    if (readOnly || !user || historyBusyRef.current || cuttingEdgesRef.current.has(edge.id)) return;
    const pending = pendNodesRef.current.find(node => node.id === edge.target);
    if (edge.source.startsWith("task-") || edge.target.startsWith("task-") || pending?.generating || pending?.uploading) return;
    if (!rfEdges.some(current => current.id === edge.id)) return;
    cuttingEdgesRef.current.add(edge.id);
    setEdgeCut(null);
    try {
      if (pending) {
        const inputs = pending.inputs.filter(id => id !== edge.source);
        const to = { inputs, parentId: pending.parentId === edge.source ? inputs[0] ?? null : pending.parentId, linked: inputs.length > 0 };
        pushUndo({ kind: "pending-link", id: pending.id, from: { inputs: [...pending.inputs], parentId: pending.parentId, linked: pending.linked }, to });
        setPendNodes(current => current.map(node => node.id === pending.id ? { ...node, ...to } : node));
      } else if(videoNodesStore.getNode(edge.target)){
        const node=videoNodesStore.getNode(edge.target)!;if(isNodeLocked(node.id))return;
        const inputs=node.inputs.filter(input=>input.nodeId.replace(/^(?:text|image|video|audio):/,"")!==edge.source);
        await patchVideoNode(node.id,{inputs:videoModeRoles(inputs,node.config.mode)});
      } else if (edge.source.startsWith("text-") || edge.target.startsWith("text-")) {
        // A product binding draws the same line as a reference: remove both fields.
        // Complete queued text saves first so an older draft cannot recreate the edge.
        await Promise.all(Array.from(textSaveQueuesRef.current.values()));
        const inbound = edge.target.startsWith("text-");
        const textNode = textNodesRef.current.find(node => node.id === (inbound ? edge.target : edge.source));
        if (!textNode) return;
        const from = textPatchOf(textNode);
        const to = inbound ? { ...from, sourceIds: from.sourceIds?.filter(id => id !== edge.source), productIds: from.productIds?.filter(id => id !== edge.source) }
          : { ...from, targetIds: from.targetIds?.filter(id => id !== edge.target) };
        const response = await privateFetchRaw("/api/canvas/history", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ operationId: browserRandomUUID(), operations: [{ type: "text-patch", id: textNode.id, fields: to }] }),
          signal: AbortSignal.timeout(20_000),
        });
        await expectJsonOk(response, t("canvas.genFail"));
        pushUndo({ kind: "text-patch", id: textNode.id, from, to });
        setTextNodes(current => current.map(node => node.id === textNode.id ? { ...node, sourceIds: to.sourceIds, productIds: to.productIds, targetIds: to.targetIds } : node));
        const draft = unsavedTextRef.current.get(textNode.id);
        if (draft?.updatedAt === textNode.updatedAt) {
          unsavedTextRef.current.delete(textNode.id);
          setUnsavedTextCount(unsavedTextRef.current.size);
        }
      } else {
        const res = await privateFetchRaw("/api/artworks/parents", {
          method: "DELETE", headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: user.email, id: edge.target, parentId: edge.source }),
          signal: AbortSignal.timeout(20_000),
        });
        await expectJsonOk(res, t("canvas.genFail"));
        pushUndo({ kind: "parent", targetId: edge.target, parentId: edge.source, added: false });
        await mergeWorks([edge.target]);
      }
      setRfEdges(current => current.filter(item => item.id !== edge.id));
      setSelectedEdge(current => current?.id === edge.id ? null : current);
    } catch (e) {
      // Keep the persisted line and its selection on failure; retry remains available.
      flashTip(e instanceof Error ? e.message : t("canvas.genFail"));
    } finally {
      cuttingEdgesRef.current.delete(edge.id);
    }
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
      setEditPrompt(textSource?.content || textSource?.prompt || "");
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
      await Promise.all(Array.from(textSaveQueuesRef.current.values()));
      if (unsavedTextRef.current.size) throw new Error(L("请先保存未保存的文字节点", "Save pending text changes first"));
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
      let frames = 0;
      const fitArrangedView = () => {
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
  async function duplicateArt(a: Artwork) {
    if (readOnly || !user || duplicateBusyRef.current.has(a.id)) return;
    duplicateBusyRef.current.add(a.id);
    const contextEpoch = canvasContextEpochRef.current;
    const contextProjectKey = activeProjectRef.current?.key || null;
    // 落点:源节点当前位置右下偏移
    const sn = rfNodes.find((n) => n.id === a.id);
    const sx = sn?.position.x ?? a.canvasX ?? 0;
    const sy = sn?.position.y ?? a.canvasY ?? 0;
    try {
      const r = await privateFetchRaw("/api/artworks/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          parentId: activeRootId(), // 归当前项目(但 source=canvas-add 不画线)
          x: Math.round(sx + 40),
          y: Math.round(sy + artworkNodeSize(a).height + 30),
          src: {
            id: a.id,
            image: a.image,
            videoUrl: a.videoUrl ?? null,
            title: `${a.title} 副本`,
            category: a.category,
            prompt: a.prompt,
            style: a.style,
            ratio: a.ratio,
            resolution: a.resolution,
            width: a.width,
            height: a.height,
            canvasWidth: a.canvasWidth,
            canvasHeight: a.canvasHeight,
          },
        }),
      });
      const d = await readJsonSafe(r);
      if (!r.ok || !d?.id) throw new Error(d?.error || t("canvas.genFail"));
      const fresh = await mergeWorks(d?.id ? [d.id] : []);
      if (!fresh.some(artwork => artwork.id === d.id)) {
        if (pendingNodeRef.current === d.id) pendingNodeRef.current = null;
        flashTip(locale === "en" ? "Node copied. Refresh the canvas to view it." : "节点已复制，请刷新画布查看");
        return;
      }
      if (contextEpoch === canvasContextEpochRef.current && (activeProjectRef.current?.key || null) === contextProjectKey) {
        if (active) setSelectedId(d.id);
        else {
          pendingNodeRef.current = d.id;
          setWorks(current => current ? [...current] : fresh);
        }
        pushAddUndo(d.id, fresh);
      }
    } catch {
      flashTip(locale === "en" ? "Could not duplicate this node. Please try again." : "复制节点失败，请重试");
    } finally {
      duplicateBusyRef.current.delete(a.id);
    }
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
  function uploadRoot(files: FileList | null) {
    const picked = Array.from(files ?? []);
    if (rootUploadRef.current) rootUploadRef.current.value = "";
    if (readOnly || !user || browsing || !picked.length) return;
    const box = canvasAreaRef.current?.getBoundingClientRect();
    const center = rfRef.current?.screenToFlowPosition({
      x: (box?.left ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.top ?? 0) + (box?.height ?? 0) / 2,
    }, { snapToGrid: false }) ?? { x: 0, y: 0 };
    const ctx = uploadCtxRef.current ?? {
      parentId: activeRootId(), x: center.x - NODE_W / 2, y: center.y - NODE_H / 2,
    };
    uploadCtxRef.current = null;
    const scope = importScopeRef.current;
    if (ctx.parentId) scope.rootId = ctx.parentId;
    const id = ++importSeqRef.current;
    const email = user.email;
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
    const occupied = [...rfNodes.map(node => node.position), ...scope.positions];
    const columns = Math.min(4, Math.ceil(Math.sqrt(valid.length)));
    const entries = valid.map((file, i) => {
      const pos = {
        x: Math.round(ctx.x + (i % columns) * (NODE_W + X_GAP)),
        y: Math.round(ctx.y + Math.floor(i / columns) * (NODE_H + Y_GAP)),
      };
      while (occupied.some(p => Math.abs(p.x - pos.x) < NODE_W + 24 && Math.abs(p.y - pos.y) < NODE_H + 24)) {
        pos.y += NODE_H + Y_GAP;
      }
      occupied.push(pos);
      scope.positions.push(pos); // Reserve immediately, including batches still in the queue.
      return { file, pos };
    });
    setImageImports(current => [...current.filter(batch => !batch.finished || batch.errors.length > 0), {
      id, total: picked.length, done: failures.length, success: 0, errors: failures, finished: false,
      phase: "optimizing", originalBytes: valid.reduce((sum, file) => sum + file.size, 0),
      uploadBytes: valid.reduce((sum, file) => sum + file.size, 0), uploadedBytes: 0,
    }]);
    const run = async () => {
      const prepared = await prepareImageUploads(entries.map(entry => entry.file), 3);
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
      let baseY = ctx.y + NODE_H / 2 - (firstCanvasSize.height + NODE_LABEL_H) / 2;
      const existingRects = [
        ...rfNodes.map((node) => {
          const size = flowNodeSize(node);
          return { x: node.position.x, y: node.position.y, width: size.width, height: size.height };
        }),
        ...scope.rects,
      ];
      while (existingRects.some((rect) =>
        baseX < rect.x + rect.width + 24 && baseX + batchWidth + 24 > rect.x &&
        baseY < rect.y + rect.height + 24 && baseY + batchHeight + 24 > rect.y
      )) {
        baseY = Math.max(...existingRects.map((rect) => rect.y + rect.height + Y_GAP));
      }
      entries.forEach((entry, index) => {
        entry.pos.x = Math.round(baseX + relative[index].x);
        entry.pos.y = Math.round(baseY + relative[index].y);
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
            }
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
      await Promise.all(Array.from({ length: Math.min(4, entries.length - next) }, async () => {
        while (next < entries.length) await upload(next++);
      }));
      const added = ids.filter((value): value is string => !!value);
      scope.rects = scope.rects.filter((rect) => rect.owner !== id || !!ids[rect.index]);
      if (added.length) {
        // Background uploads must not drag the user back after they switch projects.
        if (importScopeRef.current === scope) {
          openPendingNodeWithoutSelectionRef.current = true;
          pendingNodeRef.current = added[0];
        }
        const fresh = await mergeWorks(added);
        if (importScopeRef.current === scope) pushAddUndoMany(added, fresh);
      }
      setImageImports(current => current.map(batch => batch.id === id ? {
        ...batch, finished: true, phase: "done", uploadedBytes: batch.uploadBytes,
      } : batch));
    };
    // Batches stay ordered; after root creation, each batch uses up to four uploads.
    scope.queue = scope.queue.then(run, run).catch(() => {
      setImageImports(current => current.map(batch => batch.id === id ? {
        ...batch, finished: true,
        errors: [...batch.errors, { name: t("canvas.importSync"), message: t("canvas.importSyncFailed") }],
      } : batch));
    }).finally(() => {
      const reserved = new Set(entries.map(entry => entry.pos));
      scope.positions = scope.positions.filter(pos => !reserved.has(pos));
    });
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
  async function addFromHistory(a: Artwork) {
    if (readOnly || !user || !historyPicker || historyAddingRef.current) return;
    historyAddingRef.current = true;
    setHistoryAddingId(a.id);
    setHistoryPickerError(null);
    const contextEpoch = canvasContextEpochRef.current;
    const contextProjectKey = activeProjectRef.current?.key || null;
    let parentId: string | null = null;
    if (active) {
      const ids = new Set(active.members.map((m) => m.id));
      const root = active.members.find(
        (m) => !(m.parentId && ids.has(m.parentId))
      );
      parentId = root?.id ?? active.members[0]?.id ?? null;
    }
    const pos = historyPicker;
    try {
      const r = await privateFetchRaw("/api/artworks/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          parentId,
          x: Math.round(pos.x),
          y: Math.round(pos.y),
          src: {
            id: a.id,
            image: a.image,
            videoUrl: a.videoUrl ?? null,
            title: a.title,
            category: a.category,
            prompt: a.prompt,
            style: a.style,
            ratio: a.ratio,
            resolution: a.resolution,
            width: a.width,
            height: a.height,
            canvasWidth: a.canvasWidth,
            canvasHeight: a.canvasHeight,
          },
        }),
      });
      const d = await readJsonSafe(r);
      if (!r.ok || !d?.id) throw new Error(d?.error || t("canvas.genFail"));
      const fresh = await mergeWorks(d?.id ? [d.id] : []);
      if (!fresh.some(artwork => artwork.id === d.id)) {
        if (pendingNodeRef.current === d.id) pendingNodeRef.current = null;
        setHistoryPicker(null);
        flashTip(locale === "en" ? "Artwork added. Refresh the canvas to view it." : "作品已添加，请刷新画布查看");
        return;
      }
      if (contextEpoch === canvasContextEpochRef.current && (activeProjectRef.current?.key || null) === contextProjectKey) {
        if (active) setSelectedId(d.id);
        else {
          pendingNodeRef.current = d.id;
          setWorks(current => current ? [...current] : fresh);
        }
        pushAddUndo(d.id, fresh);
      }
      setHistoryPicker(null);
    } catch {
      setHistoryPickerError(locale === "en" ? "Could not add this artwork. Please try again." : "添加失败，请重试");
    } finally {
      historyAddingRef.current = false;
      setHistoryAddingId(null);
    }
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
    // 选中新空白节点 → 自动出生成 dock(图3:加节点即可直接写提示词生成)
    setSelectedId(null);
    setSelectedTextId(null);
    setSelectedPendId(id);
    focusEditableCanvasArea({ x: wx, y: wy, width: NODE_W, height: NODE_H });
    return pend;
  }
  // 将框选图片作为同一个新节点的多输入。新节点沿用现有生成 Dock，用户可继续
  // 写提示词、选比例/数量后生成；Images API 单次最多接收 6 张参考图。
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
    setEditPrompt("");
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
  // 底部工具条:＋ 添加空白节点(画布中心)
  function toolAddNode() {
    if (readOnly) return;
    const c = centerScreen();
    addPendAtScreen(c.x, c.y, null, false);
  }
  const unsavedTextRef=useRef(new Map<string,CanvasTextNode>());
  const textSaveQueuesRef=useRef(new Map<string,Promise<unknown>>());
  const [unsavedTextCount,setUnsavedTextCount]=useState(0);
  async function persistTextNode(node: CanvasTextNode) {
    if (!user || readOnly) return node;
    unsavedTextRef.current.set(node.id,node);
    const save=async()=> {
      try {
        const response=await privateFetchRaw("/api/canvas/text-nodes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(node),signal:AbortSignal.timeout(20_000)});
        const data=await expectJsonOk(response,t("canvas.genFail"));
        if(unsavedTextRef.current.get(node.id)===node) {
          unsavedTextRef.current.delete(node.id);
          if(data?.node) setTextNodes(current=>current.map(item=>item.id===node.id && item.updatedAt===node.updatedAt ? data.node as CanvasTextNode : item));
        }
        setUnsavedTextCount(unsavedTextRef.current.size);
        return data?.node || node;
      } catch(error) {
        setUnsavedTextCount(unsavedTextRef.current.size);
        flashTip(t("canvas.saveFailed") + (error instanceof Error ? `：${error.message}` : ""));
        return null;
      }
    };
    const queue=(textSaveQueuesRef.current.get(node.id) || Promise.resolve()).then(save);
    textSaveQueuesRef.current.set(node.id,queue);
    return queue.finally(()=>{if(textSaveQueuesRef.current.get(node.id)===queue) textSaveQueuesRef.current.delete(node.id);});
  }
  async function updateTextReference(
    textNodeId: string,
    sourceId: string,
    add: boolean
  ) {
    const textNode = textNodes.find((node) => node.id === textNodeId);
    if (!textNode || sourceId === textNodeId || (!active?.members.some((member) => member.id === sourceId) && !textNodes.some(node => node.id === sourceId && node.projectKey === textNode.projectKey))) return;
    if (add) {
      const todo = [textNodeId], visited = new Set<string>();
      while (todo.length) { const id = todo.pop()!; if (id === sourceId) { flashTip("不能形成循环连线"); return; }
        if (visited.has(id)) continue; visited.add(id); todo.push(...rfEdges.filter(edge=>edge.source===id).map(edge=>edge.target)); }
    }
    const current = textNode.sourceIds ?? [];
    if (add && !current.includes(sourceId) && ((sourceId.startsWith("text-") ? current.length >= 200 : current.filter(id => !id.startsWith("text-")).length >= 5))) {
      flashTip(t("canvas.textReferenceLimit"));
      return;
    }
    const sourceIds = add
      ? Array.from(new Set([...current, sourceId]))
      : current.filter((id) => id !== sourceId);
    const updated: CanvasTextNode = {
      ...textNode,
      sourceIds,
      updatedAt: new Date().toISOString(),
    };
    if (sourceIds.join("\u0000") !== current.join("\u0000")) {
      pushUndo({
        kind: "text-patch",
        id: textNode.id,
        from: textPatchOf(textNode),
        to: textPatchOf(updated),
      });
    }
    setTextNodes((items) =>
      items.map((item) => (item.id === updated.id ? updated : item))
    );
    await persistTextNode(updated);
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
    const viewport = rfRef.current?.getViewport() ?? viewportRef.current;
    const z = viewport.zoom || 1;
    const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const projectKey = options?.forceNewProject
      ? `tree:${id}`
      : active?.key || activeKey || `tree:${id}`;
    const now = new Date().toISOString();
    const node: CanvasTextNode = {
      id,
      projectKey,
      title: options?.title || t("canvas.textGenerate"),
      prompt: options?.prompt || "",
      content: "",
      status: "idle",
      canvasX: (screenX - viewport.x) / z - 150,
      canvasY: (screenY - viewport.y) / z - 88,
      createdAt: now,
      updatedAt: now,
      width: TEXT_NODE_DEFAULT_W,
      height: TEXT_NODE_DEFAULT_H,
      sourceIds: Array.from(new Set(options?.sourceIds ?? [])).slice(0, 5),
      targetIds: [],
    };
    setTextNodes((current) => [...current, node]);
    setActiveKey(projectKey);
    setCreatingNew(false);
    setBrowsing(false);
    setSelectedId(null);
    setSelectedPendId(null);
    setSelectedTextId(id);
    setTextPrompt(options?.prompt || "");
    setTextError(null);
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

  function commitTextNodeContent(id: string, content: string) {
    if(readOnly || isNodeLocked(id))return;
    const node = textNodes.find((item) => item.id === id);
    if (node) {
      const updated = {
        ...node,
        content: content.slice(0, 12000),
        updatedAt: new Date().toISOString(),
      };
      // 内容真的变了才记撤销(失焦不改动则不入栈)
      if (node.content !== updated.content) {
        pushUndo({
          kind: "text-patch",
          id,
          from: textPatchOf(node),
          to: textPatchOf(updated),
        });
      }
      setTextNodes((current) => current.map((item) => (item.id === id ? updated : item)));
      void persistTextNode(updated);
    }
  }
  async function generateTextNode() {
    if (!selectedText || readOnly || !nodeSettingsReady || isNodeLocked(selectedText.id) || !textPrompt.trim() || selectedText.status === "generating") return;
    const prompt = textPrompt.trim();
    const pending: CanvasTextNode = {
      ...selectedText,
      prompt,
      title: prompt.replace(/\s+/g, " ").slice(0, 22) || t("canvas.textGenerate"),
      status: "generating",
      updatedAt: new Date().toISOString(),
    };
    setTextError(null);
    setTextNodes((current) =>
      current.map((node) => (node.id === pending.id ? pending : node))
    );
    try {
      const response = await privateFetch("/api/canvas/text-generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, sourceIds: pending.sourceIds ?? [] }),
      });
      const data = await readJsonSafe(response);
      if (!response.ok || !data?.text) {
        throw new Error(data?.error || t("canvas.textGenerateFail"));
      }
      const completed: CanvasTextNode = {
        ...pending,
        content: String(data.text),
        status: "completed",
        updatedAt: new Date().toISOString(),
      };
      setTextModel(String(data.model || textModel));
      setTextNodes((current) =>
        current.map((node) => (node.id === completed.id ? completed : node))
      );
      await persistTextNode(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("canvas.textGenerateFail");
      const failed: CanvasTextNode = {
        ...pending,
        status: "failed",
        updatedAt: new Date().toISOString(),
      };
      setTextNodes((current) =>
        current.map((node) => (node.id === failed.id ? failed : node))
      );
      setTextError(message);
      await persistTextNode(failed);
    }
  }

  // ===== 竞品反推 → 智能帮写 → 成套生成 链路 =====

  // 绑定/换绑文字节点的产品图:productIds 记录绑定,@产品图 行刷新到内容开头
  async function bindProductToTextNode(node: CanvasTextNode, art: Artwork) {
    const updated: CanvasTextNode = {
      ...node,
      productIds: [art.id],
      content: withProductMention(
        node.content || "",
        art.title || t("canvas.productNode")
      ),
      updatedAt: new Date().toISOString(),
    };
    pushUndo({
      kind: "text-patch",
      id: node.id,
      from: textPatchOf(node),
      to: textPatchOf(updated),
    });
    setTextNodes((items) =>
      items.map((item) => (item.id === updated.id ? updated : item))
    );
    await persistTextNode(updated);
  }

  // 批量反推:每张竞品图右侧生成一个"逆向提示词"文字节点(2 路并发,失败节点保留可重试)
  async function reversePromptsForSelection(arts: Artwork[]) {
    if (readOnly || !user || !activeKey || promptMining || !arts.length) return;
    setPromptMining(true);
    setCtxMenu(null);
    try {
      const positions = new Map(
        (rfRef.current?.getNodes() ?? []).map((node) => [
          node.id,
          {
            x: node.position.x,
            y: node.position.y,
            w: flowNodeSize(node).width,
          },
        ])
      );
      const queue = [...arts];
      let done = 0;
      const worker = async () => {
        while (queue.length) {
          const art = queue.shift();
          if (!art) break;
          const pos = positions.get(art.id) ?? {
            x: art.canvasX ?? 0,
            y: art.canvasY ?? 0,
            w: NODE_W,
          };
          const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const now = new Date().toISOString();
          const node: CanvasTextNode = {
            id,
            projectKey: activeKey,
            title: t("canvas.reverseTitle"),
            prompt: "",
            content: "",
            status: "generating",
            canvasX: Math.round(pos.x + pos.w + X_GAP),
            canvasY: Math.round(pos.y),
            createdAt: now,
            updatedAt: now,
            width: TEXT_NODE_DEFAULT_W,
            height: TEXT_NODE_DEFAULT_H,
            sourceIds: [art.id],
            targetIds: [],
            productIds: [],
          };
          setTextNodes((current) => [...current, node]);
          try {
            const response = await privateFetch("/api/canvas/text-generate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                mode: "reverse",
                prompt: "",
                sourceIds: [art.id],
              }),
            });
            const data = await readJsonSafe(response);
            if (!response.ok || !data?.text) {
              throw new Error(data?.error || t("canvas.reverseFail"));
            }
            const completed: CanvasTextNode = {
              ...node,
              content: String(data.text),
              status: "completed",
              updatedAt: new Date().toISOString(),
            };
            setTextNodes((current) =>
              current.map((item) => (item.id === id ? completed : item))
            );
            void persistTextNode(completed);
            pushUndo({ kind: "text-add", records: [completed] }); // 反推节点可撤销
          } catch (error) {
            const failed: CanvasTextNode = {
              ...node,
              status: "failed",
              updatedAt: new Date().toISOString(),
            };
            setTextNodes((current) =>
              current.map((item) => (item.id === id ? failed : item))
            );
            void persistTextNode(failed);
            flashTip(
              `${art.title || t("canvas.imageNode")}：${
                error instanceof Error ? error.message : t("canvas.reverseFail")
              }`
            );
          }
          done++;
        }
      };
      await Promise.all([worker(), worker()]);
      flashTip(fmt(t("canvas.reverseDone"), { n: done }));
    } finally {
      setPromptMining(false);
    }
  }

  async function batchRunImages(arts: Artwork[]) {
    if (readOnly || !arts.length || batchRunBusy) return;
    setBatchRunBusy(true);
    setCtxMenu(null);
    const queue = [...arts];
    let done = 0;
    const sharedPrompt = editPrompt.trim();
    const worker = async () => {
      while (queue.length) {
        const art = queue.shift();
        if (!art) break;
        const prompt = sharedPrompt || art.prompt || FAITHFUL_REGEN_PROMPT;
        const result = await runGen(art, prompt, {
          ratio: genRatio === "auto" ? art.ratio || "1:1" : genRatio,
          style: genStyle,
          count: genCount,
          resolution: genResolution,
          parentId: art.id,
          refUrls: [art.image],
          operationKey: `batch-run:${art.id}:${Date.now()}`,
          taskLabel: "批量运行中…",
          userPrompt: sharedPrompt,
        });
        if (result.length) done++;
      }
    };
    try {
      await Promise.all([worker(), worker()]);
      flashTip(`批量运行完成 ${done}/${arts.length}`);
    } finally {
      setBatchRunBusy(false);
    }
  }

  // 智能帮写:每个反推节点右侧生成成对的帮写节点(@产品图 前缀 + 已绑产品)
  async function assistWriteForNodes(textNodeIds: string[], product: Artwork) {
    if (readOnly || !user || !activeKey || assistBusy) return;
    const byId = new Map(textNodes.map((node) => [node.id, node]));
    const sources = textNodeIds
      .map((id) => byId.get(id))
      .filter(
        (node): node is CanvasTextNode =>
          !!node && node.projectKey === activeKey && !!stripMentionLines(node.content || "")
      );
    if (!sources.length) {
      flashTip(t("canvas.assistNeedContent"));
      setProductPicker(null);
      return;
    }
    setAssistBusy(true);
    setProductPicker(null);
    try {
      const rfNow = rfRef.current?.getNodes() ?? [];
      const queue = [...sources];
      const worker = async () => {
        while (queue.length) {
          const src = queue.shift();
          if (!src) break;
          const rf = rfNow.find((n) => n.id === src.id);
          const x =
            (rf ? rf.position.x : src.canvasX) +
            (src.width || TEXT_NODE_DEFAULT_W) +
            X_GAP;
          const y = rf ? rf.position.y : src.canvasY;
          const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const now = new Date().toISOString();
          const node: CanvasTextNode = {
            id,
            projectKey: activeKey,
            title: t("canvas.assistTitle"),
            prompt: "",
            content: "",
            status: "generating",
            canvasX: Math.round(x),
            canvasY: Math.round(y),
            createdAt: now,
            updatedAt: now,
            width: TEXT_NODE_DEFAULT_W,
            height: TEXT_NODE_DEFAULT_H,
            sourceIds: src.sourceIds ?? [],
            targetIds: [],
            productIds: [product.id],
          };
          setTextNodes((current) => [...current, node]);
          try {
            const response = await privateFetch("/api/canvas/text-generate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                mode: "assist",
                prompt: stripMentionLines(src.content || ""),
                sourceIds: src.sourceIds ?? [],
                productIds: [product.id],
              }),
            });
            const data = await readJsonSafe(response);
            if (!response.ok || !data?.text) {
              throw new Error(data?.error || t("canvas.assistFail"));
            }
            const completed: CanvasTextNode = {
              ...node,
              content: withProductMention(
                String(data.text),
                product.title || t("canvas.productNode")
              ),
              status: "completed",
              updatedAt: new Date().toISOString(),
            };
            setTextNodes((current) =>
              current.map((item) => (item.id === id ? completed : item))
            );
            void persistTextNode(completed);
            pushUndo({ kind: "text-add", records: [completed] }); // 帮写节点可撤销
          } catch (error) {
            const failed: CanvasTextNode = {
              ...node,
              status: "failed",
              updatedAt: new Date().toISOString(),
            };
            setTextNodes((current) =>
              current.map((item) => (item.id === id ? failed : item))
            );
            void persistTextNode(failed);
            flashTip(
              `${src.title}：${
                error instanceof Error ? error.message : t("canvas.assistFail")
              }`
            );
          }
        }
      };
      await Promise.all([worker(), worker()]);
      flashTip(t("canvas.assistDone"));
    } finally {
      setAssistBusy(false);
    }
  }

  // 由帮写节点生成自己产品的图:纯产品(仅产品图作参考) / 复刻(附带竞品图+防抄袭约束)
  async function generateImagesFromTextNodes(
    textNodeIds: string[],
    mode: "pure" | "replicate"
  ) {
    setGenImageMenu(null);
    if (readOnly || !user || !active) return;
    const byId = new Map(textNodes.map((node) => [node.id, node]));
    const targets = textNodeIds
      .map((id) => byId.get(id))
      .filter((node): node is CanvasTextNode => !!node && node.projectKey === activeKey);
    if (!targets.length) return;
    const rfNow = rfRef.current?.getNodes() ?? [];
    await Promise.all(
      targets.map(async (node) => {
        const productId = (node.productIds ?? [])[0];
        const product = active.members.find((member) => member.id === productId);
        const body = stripMentionLines(node.content || "");
        if (!product) {
          flashTip(`${node.title}：${t("canvas.textNoProduct")}`);
          return;
        }
        if (!body) {
          flashTip(`${node.title}：${t("canvas.textNoContent")}`);
          return;
        }
        const competitors =
          mode === "replicate"
            ? (node.sourceIds ?? [])
                .filter(
                  (id) =>
                    id !== productId &&
                    active.members.some((member) => member.id === id)
                )
                .slice(0, MAX_TOTAL_IMAGES - 2)
            : [];
        // 输入顺序:产品图第一(=edit 主底图/血缘主父) → 复刻模式的竞品图 → 本文字节点
        const inputs = [productId, ...competitors, node.id];
        const seq = pendSeqRef.current++;
        const rf = rfNow.find((n) => n.id === node.id);
        const x =
          (rf ? rf.position.x : node.canvasX) +
          (node.width || TEXT_NODE_DEFAULT_W) +
          X_GAP;
        const y = rf ? rf.position.y : node.canvasY;
        const pend: Pend = {
          id: `pend-${Date.now()}-${seq}`,
          x: Math.round(x),
          y: Math.round(y),
          parentId: productId,
          linked: true,
          label: `${t("canvas.imageNode")} ${seq}`,
          uploading: false,
          progress: 0,
          inputs,
        };
        setPendNodes((current) => [...current, pend]);
        const prompt = mode === "replicate" ? `${body}${REPLICATE_GUARD}` : body;
        await generatePend({ pend, prompt, forceStandard: true });
      })
    );
  }
  // 底部工具条:🕘 从生成历史选择(画布中心)
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
    setPendNodes((prev) => prev.filter((p) => p.id !== id));
    setSelectedPendId((cur) => (cur === id ? null : cur));
  }
  // 空白节点生成(文生图 / 合并多输入):用 dock 的提示词 + 输入图(若有)生成,填充本节点
  async function generatePend(opts?: {
    pend?: Pend;
    prompt?: string;
    ratio?: string;
    forceStandard?: boolean;
  }) {
    if (readOnly || !user) return;
    // 可传入指定的空白节点(拉线「生成衍生图」用,避免依赖尚未刷新的 state)
    const pend = opts?.pend ?? pendNodes.find((p) => p.id === selectedPendId);
    if (!pend || pend.generating) return;
    const text = (opts?.prompt ?? editPrompt).trim();
    const inputArts = pend.inputs
      .map((id) => active?.members.find((m) => m.id === id))
      .filter(Boolean) as Artwork[];
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
        return;
      }
      await generateDetailSequence(inputArts[0], inputArts, text, [], pend);
      return;
    }
    if (!text && !pend.inputs.length) {
      flashTip(t("canvas.pendNeedPrompt"));
      return;
    }
    const operationKey = `pend:${pend.id}`;
    if (generationOperationRef.current.has(operationKey)) return;
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
      inputArts[0]?.prompt?.trim() ||
      FAITHFUL_REGEN_PROMPT;
    setGenError(null);
    const generationSize = generationPlaceholderSize(opts?.ratio || genRatio);
    const generationPosition = placeGenerationPreview({ x: pend.x, y: pend.y }, generationSize,
      (rfRef.current?.getNodes() ?? rfNodes).filter(node => node.id !== pend.id).map(node => ({ ...node.position, ...flowNodeSize(node) })));
    setPendNodes((prev) =>
      prev.map((p) => (p.id === pend.id ? { ...p, generating: true, generationStage: "preparing", generationStartedAt: Date.now(),
        ...generationPosition, generationSize, generationCount: normalizeCanvasCount(genCount) } : p))
    );
    try {
      const fd = new FormData();
      fd.append("prompt", promptToUse);
      fd.set("imagegenNodeId",operationKey);fd.set("imagegenNodeX",String(generationPosition.x));fd.set("imagegenNodeY",String(generationPosition.y));
      fd.append("category", "main");
      const requestedRatio = normalizeCanvasRatio(opts?.ratio || genRatio);
      fd.append("ratio", requestedRatio);

      fd.append("resolution", genResolution);
      fd.append("quality", genQuality);
      fd.append("style", genStyle ?? "");
      fd.append("count", String(normalizeCanvasCount(genCount)));
      if (genModel) fd.append("model", genModel);
      fd.append("email", user.email);
      fd.append("origin", "canvas"); // 画布里产出 → 永远留画布
      if (activeKey?.startsWith("tree:")) {
        fd.append("projectGroupId", activeKey.slice("tree:".length));
      }
      // 主父 = 第一个输入;其余进 parentIds
      if (inputArts.length) {
        fd.append("parentId", inputArts[0].id);
        fd.append(
          "parentIds",
          JSON.stringify(inputArts.slice(1).map((a) => a.id))
        );
      }
      // 把每个输入图下载后作为参考图一起送(图生图/合并);无输入=纯文生图
      for (const a of inputArts) {
        try {
          const blob = await readBrowserImage(a.image);
          fd.append(
            "image",
            new File([blob], "ref.png", { type: blob.type || "image/png" })
          );
        } catch { /* Existing optional reference behavior is retained. */ }
      }
      const startRes = await privateFetch("/api/generate-image", {
        method: "POST",
        headers: await authHeader(),
        body: fd,
      });
      const start = await readJsonSafe(startRes);
      if (!startRes.ok) throw new Error(start.error || t("canvas.genFail"));
      const jobId: string | undefined = start.jobId;
      if (!jobId) throw new Error(t("canvas.genFail"));
      setPendNodes(current => current.map(p => p.id === pend.id ? { ...p, generationStage: "generating" } : p));
      const deadline = Date.now() + 6 * 60 * 1000;
      let newIds: string[] = [];
      let generatedSizes: { id: string; width?: number; height?: number }[] = [];
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        if (Date.now() > deadline) throw new Error(t("canvas.genFail"));
        const pr = await fetch(
          `/api/generate-image?job=${encodeURIComponent(jobId)}`,
          { cache: "no-store", headers: await authHeader() }
        );
        const pj = await readJsonSafe(pr);
        if (pr.ok && pj.user) applyServerUser(pj.user);
        if (!pr.ok) throw new Error(pj.error || t("canvas.genFail"));
        if (pj.status === "done") {
          setPendNodes(current => current.map(p => p.id === pend.id ? { ...p, generationStage: "saving" } : p));
          generatedSizes = ((pj.images ?? []) as { id?: string; width?: number; height?: number }[])
            .filter((image): image is { id: string; width?: number; height?: number } => !!image.id)
            .map((image) => ({ id: image.id, width: image.width, height: image.height }));
          newIds = generatedSizes.map((image) => image.id);
          if (!newIds.length) throw new Error(t("canvas.genFail"));
          if (pj.user) applyServerUser(pj.user); // 即时回写余额积分
          break;
        }
        if (pj.status === "error") {
          if(pj.operationStatus==="failed"||pj.operationStatus==="cancelled")completeCanvasReceipt(jobId);
          throw new Error(pj.error || t("canvas.genFail"));
        }
      }
      // 把生成结果落到空白节点的位置
      if (newIds.length) {
        const livePosition = rfRef.current?.getNode(pend.id)?.position ?? generationPosition;
        let generatedY = livePosition.y;
        await Promise.all(
          newIds.map((id, index) => {
            const y = generatedY;
            generatedY += (generatedSizes[index]?.height || 110) + NODE_LABEL_H + 24;
            return privateFetchRaw("/api/artworks/position", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                email: user.email,
                id,
                x: Math.round(livePosition.x),
                y: Math.round(y),
              }),
            }).catch(() => {});
          })
        );
        // 已有项目不跳转；新画布仅在用户仍选中本占位时打开首个结果项目。
        if (selectedPendIdRef.current === pend.id) {
          if (!activeKey) pendingNodeRef.current = newIds[0];
        }
      }
      const fresh = await mergeWorks(newIds);
      setPendNodes((prev) => prev.filter((p) => p.id !== pend.id));
      completeCanvasReceipt(jobId);
      setSelectedPendId((current) => (current === pend.id ? null : current));
      pushAddUndo(newIds[0] ?? null, fresh);
      if (newIds.length && inputTextNodes.length) {
        // 提交只冻结输入内容；完成时链接合并到实时节点，保留期间的编辑和其他任务链接。
        const inputIds = new Set(inputTextNodes.map(node => node.id));
        const updatedTextNodes = textNodesRef.current.filter(node => inputIds.has(node.id)).map(node => ({
          ...node,
          targetIds: Array.from(new Set([...(node.targetIds ?? []), ...newIds])),
          updatedAt: new Date().toISOString(),
        }));
        const linksById = new Map(updatedTextNodes.map(node => [node.id, node.targetIds]));
        const mergeLinks = (current: CanvasTextNode[]) => current.map(node => linksById.has(node.id) ? {
          ...node, targetIds: Array.from(new Set([...(node.targetIds ?? []), ...linksById.get(node.id)!])),
        } : node);
        textNodesRef.current = mergeLinks(textNodesRef.current);
        setTextNodes(mergeLinks);
        await Promise.all(updatedTextNodes.map((node) => persistTextNode(node)));
      }
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : t("canvas.genFail");
      if (selectedPendIdRef.current === pend.id) setGenError(message);
      else flashTip(`${pend.label}：${message}`);
      setPendNodes((prev) =>
        prev.map((p) => (p.id === pend.id ? { ...p, generating: false } : p))
      );
    } finally {
      generationOperationRef.current.delete(operationKey);
    }
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
      void mergeWorks([body.id]).then(fresh => pushAddUndo(body.id!, fresh));
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
  async function duplicateCanvasNodes(ids:string[]){
    if(!user||readOnly)return;const epoch=canvasContextEpochRef.current,account=canvasAccountRef.current;
    const projectKey=!browsing&&!creatingNew?active?.key:undefined,fingerprint=JSON.stringify([user.email,ids,projectKey]);let operationId=copyAttemptsRef.current.get(fingerprint);
    if(!operationId){operationId=browserRandomUUID();copyAttemptsRef.current.set(fingerprint,operationId);}
    try{
      const response=await privateFetchRaw("/api/canvas/nodes/copy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ids,projectKey,operationId})});const data=await expectJsonOk(response,"复制节点失败");if(epoch!==canvasContextEpochRef.current||account!==canvasAccountRef.current)return;
      const fresh=await mergeWorks(data.artworkIds||[]);if(epoch!==canvasContextEpochRef.current||account!==canvasAccountRef.current)return;setTextNodes(current=>{const wanted=new Set((data.textNodes as CanvasTextNode[]).map(node=>node.id));return [...current.filter(node=>!wanted.has(node.id)),...data.textNodes];});await videoNodesStore.refresh();if(epoch!==canvasContextEpochRef.current||account!==canvasAccountRef.current)return;
      pushUndo({kind:"mixed-add",artworks:fresh.filter(art=>(data.artworkIds||[]).includes(art.id)),textNodes:data.textNodes,videoNodes:data.nodes,projectKey:data.projectKey});
      setCreatingNew(false);setActiveKey(data.projectKey);setBrowsing(false);setSelectedId(null);setSelectedTextId(null);setSelectedPendId(null);setMultiSel(Object.values(data.idMap));const selection={ids:Object.values(data.idMap) as string[],projectKey:String(data.projectKey),owner:user.email.toLowerCase()};pendingNodeSelectionRef.current=selection;window.setTimeout(()=>{if(pendingNodeSelectionRef.current===selection)pendingNodeSelectionRef.current=null;},1500);copyAttemptsRef.current.delete(fingerprint);
    }catch(error){flashTip(error instanceof Error?error.message:"复制节点失败");}
  }
  async function pasteNode() {
    if(nodeClipRef.current){await duplicateArt(nodeClipRef.current);return;}
    const clip=readGenericNodeClip();if(clip){await duplicateCanvasNodes(clip.ids);return;}
  }

  // 拖拽后记住节点坐标(本地即时生效 + 异步持久化)
  function saveNodePosition(id: string, x: number, y: number) {
    if (isNodeLocked(id)) return;
    if (readOnly || id.startsWith("task-") || !user) return;
    setWorks((prev) =>
      prev
        ? prev.map((w) =>
            w.id === id ? { ...w, canvasX: x, canvasY: y } : w
          )
        : prev
    );
    privateFetchRaw("/api/artworks/position", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, id, x, y }),
    }).catch(() => {});
  }

  async function saveManyNodePositions(moves:Array<{id:string;from:{x:number;y:number};to:{x:number;y:number}}>){
    if(readOnly||!user||!moves.length||historyBusyRef.current)return;
    moves=moves.filter(move=>!isNodeLocked(move.id));if(!moves.length)return;
    historyBusyRef.current=true;setHistorySaving(true);const act:UndoAct={kind:"move-many",moves};
    try{await applyHistory(act,false);pushUndo(act);}catch(error){const positions=new Map(moves.map(move=>[move.id,move.from]));setRfNodes(current=>current.map(node=>positions.has(node.id)?{...node,position:positions.get(node.id)!}:node));flashTip(error instanceof Error?error.message:t("canvas.saveFailed"));}
    finally{historyBusyRef.current=false;setHistorySaving(false);}
  }

  function rememberManyNodeDrag(nodes: Node[]) {
    selectionDragStartRef.current =
      nodes.length > 1
        ? Object.fromEntries(
            nodes.map((node) => [
              node.id,
              { x: node.position.x, y: node.position.y },
            ])
          )
        : {};
  }

  function finishManyNodeDrag(nodes: Node[]) {
    if (nodes.length <= 1) return false;
    const starts = selectionDragStartRef.current;
    selectionDragStartRef.current = {};
    if (readOnly || !user) return true;
    const moves = nodes
      .filter(
        (node) =>
          !node.id.startsWith("pend-") &&
          !node.id.startsWith("task-") &&
          starts[node.id]
      )
      .map((node) => ({
        id: node.id,
        from: starts[node.id],
        to: { x: node.position.x, y: node.position.y },
      }))
      .filter(
        (move) =>
          Math.round(move.from.x) !== Math.round(move.to.x) ||
          Math.round(move.from.y) !== Math.round(move.to.y)
      );
    if (moves.length) saveManyNodePositions(moves);
    return true;
  }

  // 生成完成后自动平移聚焦到新节点
  useEffect(() => {
    if (!focusId || !rfRef.current) return;
    if (!rfNodes.some((node) => node.id === focusId)) return;
    rfRef.current.fitView({
      nodes: [{ id: focusId }],
      duration: 600,
      maxZoom: 1.2,
      padding: 0.6,
    });
    setFocusId(null);
  }, [focusId, rfNodes]);

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
      expandOpen ||
      !!videoEditId ||
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

  const loading = persistMode === "server" && works === null;

  // dock 里的「比例·分辨率」按钮(对齐参考站图1)。面板用 portal 渲染到 body,
  // 脱离 dock 的 overflow-hidden(否则向上展开的分辨率行会被裁掉)。
  const openRatioMenu = () => {
    setRatioMenuOpen((v) => !v);
  };
  const generationParameters = canvasModelParameters(imageModels.find(m => m.id === genModel)?.generationParameters);
  function openImagegenPanel(){
    if(!canFeature("generate"))return;
    const images=active?.members.filter(a=>!a.videoUrl&&(selectedBatchIds.includes(a.id)||a.id===selected?.id))||[];
    const point=selected?rfRef.current?.getNode(selected.id)?.position:rfRef.current?.screenToFlowPosition({x:window.innerWidth/2,y:window.innerHeight/2});
    setImagegenPanel({inputs:images.map((a,i)=>({artworkId:a.id,role:i===0?"edit-target":"reference",url:cdnUrl(a.image),label:a.title})),sourceNodeId:selected?.id||active?.members[0]?.id,x:(point?.x||0)+(selected?.canvasWidth||selected?.width||300)+50,y:point?.y||0});
  }
  async function mountImagegenResult(result:ImagegenResult){
    if(!imagegenPanel||!result.artifacts.length)return;
    const artifacts=result.artifacts.filter(a=>!works?.some(w=>w.id===a.artworkId&&w.canvasX!=null&&w.canvasY!=null));
    if(!artifacts.length)return;
    let y=imagegenPlacement.current.get(result.operationId)??imagegenPanel.y;
    for(const artifact of artifacts){const response=await privateFetchRaw("/api/artworks/position",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:artifact.artworkId,x:Math.round(imagegenPanel.x),y:Math.round(y)})});if(!response.ok)throw new Error("结果已保存，画布位置保存失败");y+=artifact.height+NODE_LABEL_H+24;}
    imagegenPlacement.current.set(result.operationId,y);
    const ids=artifacts.map(a=>a.artworkId),fresh=await mergeWorks(ids);pushAddUndoMany(ids,fresh);
  }
  const activeImageModelLabel =
    imageModels.find((item) => item.id === genModel)?.label || (canvasImageCatalogError ? "模型加载失败" : "模型加载中");
  const modelControl = (disabled = false) => (
    <DarkSelect
      dir="up"
      light={lightCanvas}
      value={genModel}
      disabled={disabled || imageModels.length < 2}
      options={imageModels.map((item) => ({
        value: item.id,
        label: (
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <ModelIcon modelId={item.id} modelName={item.label} size={16} />
              <span className="truncate">{item.label}</span>
            </span>
            {!item.supportsEdit && (
              <span className="text-[10px] text-[#697180]">{t("canvas.modelTextOnly")}</span>
            )}
          </span>
        ),
      }))}
      onPick={pickGenerationModel}
      triggerClass="canvas-ui-control flex h-8 max-w-[190px] cursor-pointer items-center gap-1.5 rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold disabled:cursor-default disabled:opacity-70"
      trigger={
        <>
          <ModelIcon modelId={genModel} modelName={activeImageModelLabel} size={15} />
          <span data-testid="canvas-generation-model" className="truncate" title={t("canvas.dockModelHint")}>
            {activeImageModelLabel || t("canvas.dockModel")}
          </span>
        </>
      }
    />
  );
  const ratioControl = (
    <button
      ref={ratioBtnRef}
      type="button"
      onClick={openRatioMenu}
      className="canvas-ui-control flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold transition-colors"
    >
      📐
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
                {CANVAS_RATIOS.filter(r => generationParameters.ratios.includes(r.id)).map((r) => (
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
      {unsavedTextCount>0 && <div role="alert" className="fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-500 bg-background px-4 py-3 text-sm shadow-lg">
        <span>{t("canvas.unsavedChanges")} ({unsavedTextCount})</span>
        <button className="font-semibold underline" onClick={()=>void Promise.all(Array.from(unsavedTextRef.current.values()).map(node=>persistTextNode(node)))}>{t("canvas.retrySave")}</button>
      </div>}
      {historySaving && <div className="fixed inset-0 z-[190] cursor-wait" aria-label={t("canvas.savingChanges")}>
        <div role="status" className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-background px-4 py-3 text-sm shadow-lg">{t("canvas.savingChanges")}</div>
      </div>}

      {ratioMenu}
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

                  isAdmin={accountIsAdmin}
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
                boxSelectMode && "canvas-box-select",
                canvasTool === "hand" && "canvas-hand-tool",
                linking && "canvas-linking"
              )}
              connectionRadius={32}
              nodes={rfNodes}
              elevateNodesOnSelect={false}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(inst) => {
                rfRef.current = inst;
                viewportRef.current = inst.getViewport();
                setViewport(viewportRef.current);
              }}
              onMove={(_, vp) => {
                viewportRef.current = vp;
                // React Flow already moves its viewport. Only anchored docks/zoom
                // need React updates during a gesture, not the whole empty-selection page.
                if (selectedId || selectedPendId || selectedTextId || viewport.zoom !== vp.zoom) setViewport(vp);
              }}
              onMoveEnd={(_, vp) => { viewportRef.current = vp; setViewport(vp); }}
              onNodeClick={(event, node) => {
                if (canvasTool === "hand") return;
                if (node.id.startsWith("task-")) return;
                setSelectedEdge(null);
                setRfEdges(current => current.map(edge => edge.selected ? { ...edge, selected: false } : edge));
                if (node.id.startsWith("pend-")) {
                  // 选中空白节点 → 出文生图/合并 dock
                  setSelectedId(null);
                  setSelectedTextId(null);
                  setSelectedPendId(node.id);
                  return;
                }
                if (node.id.startsWith("text-")) {
                  setSelectedId(null);
                  setSelectedPendId(null);
                  setSelectedTextId(node.id);
                  return;
                }
                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                  setSelectedId(null);
                  setSelectedPendId(null);
                  setSelectedTextId(null);
                  return;
                }
                const grouped = active?.members.find((item) => item.id === node.id);
                const groupMembers = grouped?.canvasGroupId
                  ? active?.members.filter(
                      (item) => item.canvasGroupId === grouped.canvasGroupId
                    ) ?? []
                  : [];
                if (groupMembers.length > 1) {
                  const memberIds = new Set(groupMembers.map((item) => item.id));
                  setSelectedId(null);
                  setSelectedPendId(null);
                  setSelectedTextId(null);
                  setMultiSel(Array.from(memberIds));
                  setRfNodes((current) =>
                    current.map((item) => ({
                      ...item,
                      selected: memberIds.has(item.id),
                    }))
                  );
                  return;
                }
                setSelectedPendId(null);
                setSelectedTextId(null);
                setSelectedId(node.id);
              }}
              onNodeDoubleClick={(_, node) => {
                if(videoNodesStore.nodes.some(item=>item.id===node.id)){setVideoEditId(node.id);return;}
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
                      if (edge.selectable === false) return;
                      const rect =
                        canvasAreaRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      setEdgeCut({
                        id: edge.id,
                        source: edge.source,
                        target: edge.target,
                        x: ev.clientX - rect.left,
                        y: ev.clientY - rect.top,
                      });
                    }
              }
              onEdgeMouseLeave={readOnly ? undefined : () => setEdgeCut(null)}
              onPaneClick={() => {
                setSelectedId(null);
                setSelectedPendId(null);
                setSelectedTextId(null);
                clearCanvasSelection();
                setCtxMenu(null);
                setEdgeCut(null);
              }}
              onMoveStart={() => {
                if (spawnMenu) setSpawnMenu(null);
                // 菜单遮罩处理用户点击关闭；程序化视口动画不应取消右键菜单。
              }}
              onNodeContextMenu={onNodeContextMenu}
              onPaneContextMenu={onPaneContextMenu}
              onSelectionChange={({ nodes: sel, edges: selEdges }) => {
                const ids = sel.filter(n => n.type !== "workflowGroup").map((n) => n.id).sort();
                // 只在选中集合"真的变化"时才更新,否则会和受控选中态形成无限 setState 循环(React #185)
                setMultiSel((prev) => {
                  const sortedPrev = [...prev].sort();
                  return sortedPrev.length === ids.length &&
                    sortedPrev.every((v, i) => v === ids[i])
                    ? prev
                    : ids;
                });
                // 连线选中态:同防抖处理,只有真的变化才更新
                const edge = selEdges[0];
                if (edge && ids.length === 0) {
                  setSelectedId(null);
                  setSelectedTextId(null);
                  setSelectedPendId(null);
                }
                setSelectedEdge((prev) => {
                  const next = edge
                    ? { id: edge.id, source: edge.source, target: edge.target }
                    : null;
                  return prev?.id === next?.id ? prev : next;
                });
              }}
              onSelectionStart={() => {
                setSelectedId(null);
                setSelectedPendId(null);
                setSelectedTextId(null);
                setCtxMenu(null);
              }}
              onNodeDragStart={(_, node, draggedNodes) => {
                dragStartRef.current = {
                  id: node.id,
                  x: node.position.x,
                  y: node.position.y,
                };
                rememberManyNodeDrag(draggedNodes);
                groupedDragStartRef.current = null;
                skipSelectionDragStopRef.current = false;
                const artwork = active?.members.find((item) => item.id === node.id);
                const groupMembers = artwork?.canvasGroupId
                  ? active?.members.filter(
                      (item) => item.canvasGroupId === artwork.canvasGroupId
                    ) ?? []
                  : [];
                if (
                  groupMembers.length > 1 &&
                  multiSel.length === groupMembers.length &&
                  groupMembers.every((item) => multiSel.includes(item.id))
                ) {
                  const positions = new Map(
                    rfNodes.map((item) => [item.id, item.position])
                  );
                  groupedDragStartRef.current = {
                    anchorId: node.id,
                    starts: Object.fromEntries(
                      groupMembers.filter(item=>!isNodeLocked(item.id)).map((item) => [
                        item.id,
                        positions.get(item.id) ?? {
                          x: item.canvasX ?? 0,
                          y: item.canvasY ?? 0,
                        },
                      ])
                    ),
                  };
                  skipSelectionDragStopRef.current = true;
                }
              }}
              onNodeDrag={(_, node) => {
                const grouped = groupedDragStartRef.current;
                if (!grouped || grouped.anchorId !== node.id) return;
                const anchorStart = grouped.starts[node.id];
                if (!anchorStart) return;
                const dx = node.position.x - anchorStart.x;
                const dy = node.position.y - anchorStart.y;
                setRfNodes((current) =>
                  current.map((item) => {
                    const start = grouped.starts[item.id];
                    if (!start) return item;
                    return {
                      ...item,
                      position:
                        item.id === node.id
                          ? { ...node.position }
                          : { x: start.x + dx, y: start.y + dy },
                    };
                  })
                );
              }}
              onNodeDragStop={(_, node, draggedNodes) => {
                if (node.id.startsWith("task-")) {
                  // 生成中占位:每个任务独立记住拖到的位置。
                  generationTaskPosRef.current[node.id] = {
                    x: node.position.x,
                    y: node.position.y,
                  };
                  setGenerationTasks((current) =>
                    current.map((task) =>
                      task.id === node.id
                        ? { ...task, position: { ...node.position } }
                        : task
                    )
                  );
                  return;
                }
                if (node.id.startsWith("pend-")) {
                  setPendNodes((prev) =>
                    prev.map((p) =>
                      p.id === node.id
                        ? { ...p, x: node.position.x, y: node.position.y }
                        : p
                    )
                  );
                  return;
                }
                const grouped = groupedDragStartRef.current;
                if (grouped && grouped.anchorId === node.id) {
                  const anchorStart = grouped.starts[node.id];
                  groupedDragStartRef.current = null;
                  skipSelectionDragStopRef.current = false;
                  selectionDragStartRef.current = {};
                  if (!anchorStart) return;
                  const dx = node.position.x - anchorStart.x;
                  const dy = node.position.y - anchorStart.y;
                  const moves = Object.entries(grouped.starts)
                    .map(([id, from]) => ({
                      id,
                      from,
                      to: { x: from.x + dx, y: from.y + dy },
                    }))
                    .filter(
                      (move) =>
                        Math.round(move.from.x) !== Math.round(move.to.x) ||
                        Math.round(move.from.y) !== Math.round(move.to.y)
                    );
                  const positions = new Map(moves.map((move) => [move.id, move.to]));
                  setRfNodes((current) =>
                    current.map((item) => {
                      const position = positions.get(item.id);
                      return position ? { ...item, position } : item;
                    })
                  );
                  saveManyNodePositions(moves);
                  return;
                }
                if(videoNodesStore.nodes.some(item=>item.id===node.id)){
                  if(finishManyNodeDrag(draggedNodes))return;
                  void patchVideoNode(node.id,{x:node.position.x,y:node.position.y}).catch(error=>flashTip(error.message));return;
                }
                // React Flow 从某个已选节点发起多选拖动时，只触发 onNodeDragStop，
                // 第三个参数才是整组节点；onSelectionDragStop 不会触发。
                if (finishManyNodeDrag(draggedNodes)) return;
                if (node.id.startsWith("text-")) {
                  const current = textNodes.find((item) => item.id === node.id);
                  if (!current) return;
                  const from = { x: current.canvasX, y: current.canvasY };
                  const moved: CanvasTextNode = {
                    ...current,
                    canvasX: node.position.x,
                    canvasY: node.position.y,
                    updatedAt: new Date().toISOString(),
                  };
                  setTextNodes((items) =>
                    items.map((item) => (item.id === moved.id ? moved : item))
                  );
                  if (Math.round(from.x) !== Math.round(moved.canvasX) || Math.round(from.y) !== Math.round(moved.canvasY)) {
                    pushUndo({ kind: "text-move", id: moved.id, from, to: { x: moved.canvasX, y: moved.canvasY } });
                  }
                  void persistTextNode(moved);
                  return;
                }
                const st = dragStartRef.current;
                if (
                  st &&
                  st.id === node.id &&
                  (Math.round(st.x) !== Math.round(node.position.x) ||
                    Math.round(st.y) !== Math.round(node.position.y))
                ) {
                  pushUndo({
                    kind: "move",
                    id: node.id,
                    from: { x: st.x, y: st.y },
                    to: { x: node.position.x, y: node.position.y },
                  });
                }
                saveNodePosition(node.id, node.position.x, node.position.y);
              }}
              onSelectionDragStart={(_, selectedNodes) => {
                rememberManyNodeDrag(selectedNodes);
              }}
              onSelectionDragStop={(_, selectedNodes) => {
                if (skipSelectionDragStopRef.current) {
                  skipSelectionDragStopRef.current = false;
                  selectionDragStartRef.current = {};
                  return;
                }
                finishManyNodeDrag(selectedNodes);
              }}
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
              deleteKeyCode={null}
              panOnDrag={boxSelectMode ? [1] : [0, 1]}
              selectionOnDrag={boxSelectMode}
              selectionMode={SelectionMode.Partial}
              selectionKeyCode={boxSelectMode ? null : "Shift"}
              multiSelectionKeyCode={["Control", "Meta", "Shift"]}
              panActivationKeyCode="Space"
              panOnScroll
              zoomOnScroll={false}
              zoomOnPinch
              zoomActivationKeyCode={["Control", "Meta"]}
              snapToGrid={snapGrid}
              snapGrid={[16, 16]}
              onlyRenderVisibleElements={rfNodes.length > 60}
            >
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
          {!browsing && !readOnly && edgeCut && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ left: edgeCut.x, top: edgeCut.y }}
            >
              <span className="canvas-ui-surface flex h-8 w-8 items-center justify-center rounded-full border shadow-lg backdrop-blur">
                <Scissors className="h-4 w-4" />
              </span>
            </div>
          )}

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

                      isAdmin={accountIsAdmin}
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

                  {canFeature("generate")&&<button type="button" aria-label="图像创作" disabled={readOnly} onClick={openImagegenPanel} className="canvas-ui-action flex h-8 items-center rounded-md px-2 text-xs">图像创作</button>}
                  <CanvasActionMenu label={t("canvas.toolbar.addToCanvas")} light={lightCanvas}
                    open={addMenuOpen} onOpenChange={open => { setMoreToolsOpen(false); setAddMenuOpen(open); }}
                    triggerIcon={Plus} iconOnly triggerTestId="canvas-add-node-button" menuTestId="canvas-create-menu"
                    triggerClassName="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:h-9 sm:w-9"
                    items={[
                      { id: "text", icon: Type, label: t("canvas.toolbar.addText"), hint: t("canvas.toolbar.addTextHint"),
                        onSelect: () => { const c = centerScreen(); addTextNodeAtScreen(c.x, c.y); } },
                      { id: "video-node", icon: Video, label: "新增视频节点", disabled: readOnly || !canFeature("video"), onSelect: () => { void openVideoNodeFromSelection(true); } },
                      { id: "image-node", icon: ImagePlus, label: t("canvas.toolbar.addImageNode"), hint: t("canvas.toolbar.addImageNodeHint"),
                        onSelect: toolAddNode },
                      { id: "upload", icon: Upload, label: t("canvas.uploadImage"), hint: t("canvas.toolbar.uploadHint"),
                        onSelect: () => { const c = centerScreen(); triggerUpload(c.x, c.y); } },
                      { id: "history", icon: Clock, label: t("canvas.fromHistory"), hint: t("canvas.toolbar.historyHint"), onSelect: toolHistory },
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

              {mixedNativeSelection&&!readOnly&&<BatchSelectionToolbar label={L("节点操作","Node actions")} selectionLabel={L(`已选择 ${multiSel.length} 个节点`,`${multiSel.length} nodes selected`)} clearLabel={t("canvas.batchClear")} testId="mixed-node-batch-bar" onClear={()=>clearCanvasSelection(true)}>
                <button type="button" className="canvas-ui-action rounded-lg px-3 py-2 text-xs" onClick={()=>copyCanvasSelection(multiSel)}>{t("canvas.copyNode")}</button>
                <button type="button" className="canvas-ui-action rounded-lg px-3 py-2 text-xs" disabled={historySaving||multiSel.some(isNodeLocked)} onClick={()=>void duplicateCanvasNodes(multiSel)}>{t("canvas.duplicate")}</button>
                <button type="button" className="canvas-ui-action rounded-lg px-3 py-2 text-xs" disabled={historySaving||multiSel.some(isNodeLocked)} onClick={()=>batchDelete(multiSel)}>{t("canvas.delete")}</button>
              </BatchSelectionToolbar>}
              {selectedBatchArts.length > 1 && !readOnly && !mixedNativeSelection && (
                <BatchSelectionToolbar
                  label={t("canvas.batchActions")}
                  testId="image-batch-bar"
                  selectionLabel={fmt(t("canvas.batchSelected"), { n: selectedBatchArts.length })}
                  clearLabel={t("canvas.batchClear")}
                  onClear={() => clearCanvasSelection(true)}
                >
                  <button
                    type="button"
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
                    onClick={createMergeNodeFromSelection}
                    className="flex h-9 items-center gap-1.5 rounded-xl canvas-ui-primary px-3 text-xs font-semibold text-white transition-colors hover:opacity-90"
                  >
                    <Combine className="h-4 w-4" />
                    {t("canvas.batchGenerate")}
                  </button>
                  <button
                    type="button"
                    disabled={batchRunBusy}
                    onClick={() => void batchRunImages(selectedBatchArts)}
                    title={t("canvas.batchRunImages")}
                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold canvas-ui-action transition-colors disabled:opacity-45"
                  >
                    {batchRunBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {t("canvas.batchRunImages")}
                  </button>
                  <button
                    type="button"
                    disabled={promptMining}
                    onClick={() => void reversePromptsForSelection(selectedBatchArts)}
                    title={t("canvas.batchRunText")}
                    className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold canvas-ui-action transition-colors disabled:opacity-45"
                  >
                    {promptMining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Type className="h-4 w-4" />}
                    {t("canvas.batchRunText")}
                  </button>
                  <button
                    type="button"
                    disabled={promptMining}
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
                    disabled={stitching}
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
                    disabled={zipping}
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
                    onClick={() =>
                      setGenImageMenu({
                        textNodeIds: selectedTextBatchNodes.map((node) => node.id),
                      })
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
          {imageImports.length > 0 && (
            <div className="absolute right-3 top-[108px] z-40 max-h-[40%] w-80 max-w-[calc(100%-24px)] overflow-y-auto rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm md:top-16" data-testid="canvas-import-status" aria-live="polite">
              {imageImports.map(batch => (
                <div key={batch.id} className="border-b border-slate-100 p-3 last:border-0">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {!batch.finished && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span className="flex-1">{batch.finished ? t("canvas.importDone") : t("canvas.importBusy")} {batch.done} / {batch.total} · {t("canvas.importSuccess")} {batch.success}{batch.errors.length ? ` · ${t("canvas.importErrors")} ${batch.errors.length}` : ""}</span>
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
                  aria-label={`${t("canvas.toolbar.zoom")} ${zoomPercentLabel(viewport.zoom)}`}
                  aria-expanded={zoomMenuOpen}
                  className="rounded-lg px-1.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {zoomPercentLabel(viewport.zoom)}
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
                      { key: "image", icon: "🖼️", label: t("canvas.spawnImage") },
                      { key: "upload", icon: "⬆️", label: t("canvas.spawnUpload") },
                      ...(!spawnMenu.sourceId.startsWith("text-")
                        ? [{ key: "text", icon: "T", label: t("canvas.textGenerate") }]
                        : []),
                    ].map((it) => (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => void spawnNode(it.key)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                      >
                        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-secondary text-[15px]">
                          {it.icon}
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
                          disabled={readOnly}
                          onClick={createMergeNodeFromSelection}
                        />
                        <Sep />
                        <FeatureVisible feature="generate"><Item
                          label={t("canvas.batchRunImages")}
                          disabled={batchRunBusy || readOnly}
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
                          disabled={readOnly}
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
                        <Item label="视频设置" disabled={mutationDisabled} onClick={()=>setVideoEditId(videoNode.id)}/>
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
                        <FeatureVisible feature="generate"><Item label={t("canvas.toolbar.textToImages")} disabled={mutationDisabled || textNode.status === "generating"} onClick={() => setGenImageMenu({ textNodeIds: [textNode.id] })} /></FeatureVisible>
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
                          onClick={() =>
                            addPendAtScreen(ctxMenu.x, ctxMenu.y, null, false)
                          }
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

          {/* 顶部图像工具条：统一使用16px Lucide线性图标，颜色继承画布主题。 */}
          {(selected || selectedPend) &&
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
              {canFeature("generate")&&<button type="button" disabled={readOnly} onClick={openImagegenPanel} className="canvas-ui-action flex h-[34px] items-center gap-1 rounded-[9px] px-2 text-[12px] font-semibold">图像创作</button>}
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
                  { id: "video", icon: Video, label: t("canvas.toolbar.video"), hint: t("canvas.toolbar.videoHint"),
                    disabled: readOnly, onSelect: () => { void openVideoNodeFromSelection(); } },
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
                onClick={() => setGenImageMenu({ textNodeIds: [selectedText.id] })}
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

          {/* 重命名节点:在节点标签处弹出内联输入(✏️ 触发),失焦/回车确定、Esc 取消 */}
          {renamingNodeId &&
            (selected || selectedText) &&
            renamingNodeId === (selected?.id ?? selectedText?.id) &&
            nodeScreen && (
              <div
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

          {/* 底部生成器(配方):选中节点正下方居中,横向 dock(原型 dock) */}
          {canFeature("generate") && selected && selectedBatchArts.length <= 1 && !propertiesOpen && (
            <div
              data-testid="image-node-dock"
              key={`dock-${selected.id}`}
              ref={panelRef}
              style={dockStyle ?? { left: 12, bottom: 12, maxHeight: "60%" }}
              className="canvas-ui-surface canvas-dock-entry absolute z-10 flex max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-[18px] border"
            >
              {/* dbody:风格/标记/聚焦 chips + 引用图 + 提示词(对齐原型 .cz-dock .dbody) */}
              <div className="min-h-0 overflow-y-auto px-4 pb-1.5 pt-3.5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {!readOnly && (
                    <>
                      <DarkSelect
                        dir="up"
                        light={lightCanvas}
                        value={genStyle}
                        options={GENERATION_STYLES.map((s) => ({
                          value: s,
                          label: s,
                        }))}
                        onPick={(v) => setGenStyle(v)}
                        triggerClass="canvas-ui-control flex cursor-pointer items-center gap-1.5 rounded-[10px] border px-2.5 py-2 text-[12.5px] transition-colors"
                        trigger={
                          <>
                            🧊
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
                        ⊡ {t("canvas.dockFocus")}
                      </button>
                    </>
                  )}
                  {/* 引用图:上一级父节点的图(本节点由此生成);多输入则全部显示。
                      悬停右上角"×"可移除(改用自己上传的参考图) */}
                  {visibleDockRefs.map((ref) => (
                    <div
                      key={ref.id}
                      className="group relative h-[46px] w-[46px] flex-none overflow-hidden rounded-[9px] border border-[var(--canvas-ui-border)]"
                    >
                      <button
                        type="button"
                        title={ref.title}
                        onClick={() =>
                          setLightbox({ src: ref.image, alt: ref.title })
                        }
                        className="block h-full w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <CachedImage
                          src={cdnUrl(ref.image)}
                          alt={ref.title}
                          className="h-full w-full object-cover"
                        />
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() =>
                            setHiddenRefIds((prev) =>
                              prev.includes(ref.id) ? prev : [...prev, ref.id]
                            )
                          }
                          aria-label={t("canvas.removeImage")}
                          className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl-md bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!readOnly &&
                    extraPreviews.map((src, i) => (
                      <div
                        key={i}
                        className="relative h-[46px] w-[46px] flex-none overflow-hidden rounded-[9px] border border-[var(--canvas-ui-border)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <CachedImage
                          src={src}
                          alt={`ref ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeExtra(i)}
                          aria-label={t("canvas.removeImage")}
                          className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl-md bg-black/65 text-white"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  {!readOnly && (
                    <>
                      <input
                        ref={extraInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        onChange={(e) => pickExtra(e.target.files)}
                      />
                      {extraFiles.length < MAX_TOTAL_IMAGES - 1 && (
                        <button
                          type="button"
                          onClick={() => extraInputRef.current?.click()}
                          title={t("canvas.toolbar.addReference")}
                          aria-label={t("canvas.toolbar.addReference")}
                          className="canvas-ui-action flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[9px] border border-dashed border-[var(--canvas-ui-border)] transition-colors hover:!border-[#6366f1]/60"
                        >
                          <Upload className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                  <span className="canvas-ui-muted ml-1 min-w-0 flex-1 truncate text-[12px]">
                    {fmt(t("canvas.dockRef"), {
                      n: visibleDockRefs.length + extraFiles.length,
                      name: selected.title,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    aria-label={t("canvas.close")}
                    className="canvas-ui-action flex h-6 w-6 flex-none items-center justify-center rounded-full transition-colors"
                  >
                    <X className="h-4 w-4" />
                </button>
                </div>

                {/* 提示词:短内容至少约 5 行，长内容自适应增长，超过上限后内部滚动。 */}
                <Textarea
                  ref={promptAreaRef}
                  aria-label="节点提示词"
                  value={editPrompt}
                  readOnly={readOnly}
                  placeholder={readOnly ? "" : t("canvas.promptPlaceholder")}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  className="canvas-ui-text min-h-[112px] max-h-[220px] resize-none overflow-y-hidden border-0 bg-transparent px-0 py-0.5 text-sm leading-relaxed shadow-none placeholder:text-[var(--canvas-ui-muted)] focus-visible:ring-0"
                />
                {genError && (
                  <p className="pb-1 text-xs font-medium text-red-400">
                    {genError}
                  </p>
                )}
              </div>

              {/* dbar:模型 / 比例·清晰度 / 数量 + 积分 + 发送(对齐原型 .dbar) */}
              {!readOnly && (
                <div className="canvas-ui-divider flex flex-none flex-wrap items-center gap-2 border-t bg-transparent px-3.5 py-2.5">
                  {modelControl(false)}
                  <DarkSelect
                    dir="up"
                    light={lightCanvas}
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
                  <ImageQualityControl compact feature="canvas.image" modelId={genModel} resolution={genResolution} />
                  {generationMode === "standard" || generationMode === "detail" ? (
                    <ImageCountControl
                      value={genCount}
                      onChange={setGenCount}
                      light={lightCanvas}
                    />
                  ) : (
                    <span className="canvas-ui-control inline-flex h-8 items-center rounded-[9px] border px-2.5 py-0 text-[12.5px] font-semibold">
                      🖼 {generationMode === "split"
                        ? t("canvas.viewNodesCount")
                        : t("canvas.viewSheetCount")}
                    </span>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => void retrySelected()}
                    disabled={selectedGenerating}
                    title={t("canvas.retryImageHint")}
                    className="canvas-ui-control flex h-10 items-center gap-1.5 rounded-[11px] border px-3 text-[12.5px] font-semibold disabled:opacity-45"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("canvas.retryImage")}
                  </button>
                  <button
                    type="button"
                    onClick={generateChild}
                    disabled={selectedGenerating}
                    title={t("canvas.generate")}
                    aria-label="生成"
                    className="canvas-ui-primary flex h-10 w-10 flex-none items-center justify-center rounded-[11px] text-[18px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {selectedGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "↑"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 空白节点生成 dock(文生图 / 合并多输入):选中空白节点时出现(图3 旁支节点) */}
          {canFeature("generate") && selectedPend && !readOnly && (
            <div
              data-testid="pending-node-dock"
              ref={panelRef}
              key={`pdock-${selectedPend.id}`}
              style={dockStyle ?? { left: 12, bottom: 12 }}
              className="canvas-ui-surface canvas-dock-entry absolute z-10 flex max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-[18px] border"
            >
              <div className="min-h-0 overflow-y-auto px-4 pb-1.5 pt-3.5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {pendInputArts.length > 0 ? (
                    pendInputArts.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        title={a.title}
                        onClick={() => setLightbox({ src: a.image, alt: a.title })}
                        className="h-[46px] w-[46px] flex-none overflow-hidden rounded-[9px] border border-[var(--canvas-ui-border)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <CachedImage
                          src={cdnUrl(a.image)}
                          alt={a.title}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))
                  ) : (
                    <span className="canvas-ui-muted flex h-[46px] items-center rounded-[9px] border border-dashed border-[var(--canvas-ui-border)] px-3 text-[12px]">
                      🅰️ {t("canvas.pendText2img")}
                    </span>
                  )}
                  <span className="canvas-ui-muted ml-1 min-w-0 flex-1 truncate text-[12px]">
                    {generationMode === "detail" && pendInputArts.length > 0
                      ? fmt(t("canvas.pendDetail"), {
                          refs: pendInputArts.length,
                          count: genCount,
                        })
                      : pendInputArts.length > 0
                        ? fmt(t("canvas.pendMerge"), { n: pendInputArts.length })
                        : t("canvas.pendNewImage")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedPendId(null)}
                    aria-label={t("canvas.close")}
                    className="canvas-ui-action flex h-6 w-6 flex-none items-center justify-center rounded-full transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Textarea
                  ref={pendPromptRef}
                  aria-label="节点提示词"
                  value={editPrompt}
                  placeholder={t("canvas.pendPromptPlaceholder")}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  className="canvas-ui-text min-h-[112px] max-h-[220px] resize-none overflow-y-hidden border-0 bg-transparent px-0 py-0.5 text-sm leading-relaxed shadow-none placeholder:text-[var(--canvas-ui-muted)] focus-visible:ring-0"
                />
                {genError && (
                  <p className="pb-1 text-xs font-medium text-red-400">
                    {genError}
                  </p>
                )}
              </div>
              <div className="canvas-ui-divider flex flex-none flex-wrap items-center gap-2 border-t bg-transparent px-3.5 py-2.5">
                {modelControl(false)}
                <DarkSelect
                  dir="up"
                  light={lightCanvas}
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
                <ImageQualityControl compact feature="canvas.image" modelId={genModel} resolution={genResolution} />
                <ImageCountControl
                  value={genCount}
                  onChange={setGenCount}
                  light={lightCanvas}
                />
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => void generatePend()}
                  disabled={selectedPendGenerating}
                  title={t("canvas.generate")}
                    aria-label="生成"
                  className="canvas-ui-primary flex h-10 w-10 flex-none items-center justify-center rounded-[11px] text-[18px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {selectedPendGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "↑"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 文字生成节点：布局与图片节点一致，配色跟随画布黑/白主题。 */}
          {selectedText && selectedTextBatchNodes.length <= 1 && !readOnly && !propertiesOpen && !isNodeLocked(selectedText.id) && (
            <div
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
              className={cn(
                "canvas-dock-entry absolute z-20 flex min-h-[218px] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-[18px] border shadow-2xl",
                textComposerExpanded ? "resize-none" : "resize-y",
                lightCanvas
                  ? "border-[#dfe4ea] bg-white text-[#252933] shadow-[0_18px_45px_rgba(7,12,24,0.18)]"
                  : "border-[#40444f] bg-[#191b21] text-[#e7e9ee]"
              )}
            >
              <div
                ref={textComposerBodyRef}
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
                <button
                  type="button"
                  onClick={() => {
                    if (textComposerDockRef.current) {
                      textComposerDockRef.current.style.height = "";
                    }
                    setTextComposerManuallySized(false);
                    setTextComposerExpanded((expanded) => !expanded);
                  }}
                  aria-label={textComposerExpanded ? "收起文字编辑窗口" : "展开文字编辑窗口"}
                  title={textComposerExpanded ? "收起编辑窗口" : "展开编辑窗口"}
                  className={cn(
                    "mt-0.5 flex h-7 w-7 flex-none items-center justify-center transition-colors",
                    lightCanvas
                      ? "text-[#8a93a0] hover:bg-[#f1f3f5] hover:text-[#303641]"
                      : "text-[#9aa1ae] hover:bg-[#1f2229] hover:text-white"
                  )}
                >
                  {textComposerExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTextId(null)}
                  aria-label={t("canvas.close")}
                  className={cn(
                    "flex h-7 w-7 flex-none items-center justify-center rounded-full transition-colors",
                    lightCanvas
                      ? "text-[#8a93a0] hover:bg-[#f1f3f5] hover:text-[#303641]"
                      : "text-[#9aa1ae] hover:bg-[#1f2229] hover:text-white"
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
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
              {textError && (
                <p className="px-12 pb-2 text-xs font-medium text-red-400">{textError}</p>
              )}
              <div
                data-testid="text-node-dock-footer"
                className={cn(
                  "flex min-h-12 flex-wrap items-center gap-2 border-t px-3.5 py-2.5",
                  lightCanvas ? "border-[#edf0f3]" : "border-[#2a2d36]"
                )}
              >
                <TextModelSelect feature="canvas.text-generate" compact dark={!lightCanvas} direction="up" />
                <span className="flex-1" />
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
                  onClick={() => setGenImageMenu({ textNodeIds: [selectedText.id] })}
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
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    lightCanvas ? "text-[#547886]" : "text-[#6bd7ec]"
                  )}
                >
                  ◆ {selectedTextRefs.length}/5
                </span>
                <button
                  type="button"
                  onClick={() => void generateTextNode()}
                  disabled={!textPrompt.trim() || selectedText.status === "generating"}
                  title={t("canvas.textGenerate")}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-[11px] transition-opacity hover:opacity-90 disabled:opacity-45",
                    lightCanvas ? "bg-[#20242c] text-white" : "bg-white text-[#111]"
                  )}
                >
                  {selectedText.status === "generating" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-base font-semibold">↑</span>
                  )}
                </button>
              </div>
            </div>
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
            contextImages={anchor ? assistantContext(active?.members ?? [], anchor.id).map(artwork => ({ id: artwork.id, title: artwork.title, image: cdnUrl(artwork.image) })) : []}
            selectedSkill={assistantSkill} onSkillSelect={skill => { setAssistantSkill(skill); assistantRetry.current = null; }} skillAccountKey={user?.email || ""} skillSessionId={assistantSessionId.current} turns={assistantTurns} input={assistantInput} busy={assistantBusy} error={assistantError} steps={assistantSteps} english={locale === "en"} responding={assistantResponding} attention={orbCompanion.model.attention} onStop={() => void stopAssistantTask()}
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
            onClearReference={()=>{setAssistantArtworkId(null);setSelectedId(null);setSelectedTextId(null);assistantRetry.current=null;}}
            onNewChat={() => { orbCue({ type: "reset" }); assistantSessionId.current = browserRandomUUID(); setAssistantSteps([]); setAssistantOutcome("idle"); setAssistantTurns([]); setAssistantInput(""); setAssistantError(null); assistantRetry.current = null; }}
            historyLoader={async () => { const response=await privateFetchRaw(`/api/canvas/assistant?projectKey=${encodeURIComponent(activeKey||"workspace")}`);const data=await expectJsonOk(response,"历史记录读取失败");return (data.sessions||[]).map((session:{id:string;title:string;updatedAt:string;anchorId:string})=>({...session,turns:[]})); }}
            onRenameHistory={async(id,title)=>{await expectJsonOk(await privateFetchRaw(`/api/canvas/assistant?projectKey=${encodeURIComponent(activeKey || "workspace")}&id=${encodeURIComponent(id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({title})}),"会话改名失败");}}
            onDeleteHistory={async(id)=>{await expectJsonOk(await privateFetchRaw(`/api/canvas/assistant?projectKey=${encodeURIComponent(activeKey || "workspace")}&id=${encodeURIComponent(id)}`,{method:"DELETE"}),"删除会话失败");if(assistantSessionId.current===id){orbCue({ type: "reset" }); assistantSessionId.current=browserRandomUUID();setAssistantTurns([]);setAssistantSteps([]); setAssistantOutcome("idle");}}}
            onRestoreChat={(turns,id) => { if(id){void restoreAssistantConversation(anchor?.id||"",id);return;}orbCue({ type: "reset" }); assistantSessionId.current=browserRandomUUID();setAssistantSteps([]); setAssistantOutcome("idle");setAssistantTurns(turns);setAssistantInput("");setAssistantError(null);assistantRetry.current=null; }}
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
      {/* 生成图片:纯产品 / 复刻竞品构图 两种模式 */}
      {canFeature("generate") && genImageMenu && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setGenImageMenu(null)}
        >
          <div
            data-testid="gen-image-menu"
            className="flex w-full max-w-md flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-semibold">{t("canvas.genModeTitle")}</h3>
            <button
              type="button"
              onClick={() => void generateImagesFromTextNodes(genImageMenu.textNodeIds, "pure")}
              className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/60"
            >
              <ImageIcon className="mt-0.5 h-4 w-4 text-primary" />
              <span>
                <span className="block text-sm font-semibold">{t("canvas.genModePure")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("canvas.genModePureDesc")}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                void generateImagesFromTextNodes(genImageMenu.textNodeIds, "replicate")
              }
              className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/60"
            >
              <ScanSearch className="mt-0.5 h-4 w-4 text-primary" />
              <span>
                <span className="block text-sm font-semibold">{t("canvas.genModeReplicate")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("canvas.genModeReplicateDesc")}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setGenImageMenu(null)}
              className="mt-1 self-end rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              {t("canvas.close")}
            </button>
          </div>
        </div>
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
              {trashItems === null ? (
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

      {videoEditId&&videoNodesStore.nodes.find(node=>node.id===videoEditId&&node.projectKey===activeKey)&&(()=>{const node=videoNodesStore.nodes.find(node=>node.id===videoEditId)!;return <VideoSettingsDialog key={node.id} node={node} models={videoCatalog} choices={videoInputChoices} light={lightCanvas} readOnly={readOnly||isNodeLocked(node.id)} onClose={()=>setVideoEditId(null)} onSave={async draft=>{await saveVideoDraft(node.id,draft);}} onGenerate={(draft,quote)=>generateVideoDraft(node.id,draft,quote)} onImport={async files=>{try{const choices=await videoAssetStore.upload(files,node.projectKey);await mergeWorks(choices.map(choice=>choice.nodeId));return choices;}catch(cause){if(cause instanceof VideoAssetImportError&&cause.choices.length)await mergeWorks(cause.choices.map(choice=>choice.nodeId));throw cause;}}} onLoadMoreAssets={videoAssetStore.loadMore} canLoadMoreAssets={!!videoAssetStore.nextCursor}/>;})()}
      {videoMedia&&videoMedia.projectKey===activeKey&&<MediaActionsDialog key={`${user?.email}:${videoMedia.projectKey}:${videoMedia.id}`} initial={videoMedia.initial} sourceId={videoMedia.id} projectKey={videoMedia.projectKey} choices={videoInputChoices.filter(choice=>choice.available&&choice.kind!=="text").map(choice=>({id:choice.nodeId,title:choice.title,kind:choice.kind as MediaInputChoice["kind"],url:choice.value}))} light={lightCanvas} readOnly={readOnly||isNodeLocked(videoMedia.id)} jobs={mediaJobStore.jobs} historyError={mediaJobStore.error} canLoadMore={!!mediaJobStore.nextCursor} onLoadMore={mediaJobStore.loadMore} onQuote={mediaJobStore.estimate} onSubmit={mediaJobStore.submit} onCancel={mediaJobStore.cancel} onClose={()=>setVideoMedia(null)}/>}
      {videoHistoryId&&videoNodesStore.nodes.find(node=>node.id===videoHistoryId&&node.projectKey===activeKey)&&<VideoHistoryPicker key={`${user?.email}:${activeKey}:${videoHistoryId}`} email={user?.email} projectKey={activeKey} node={videoNodesStore.getNode(videoHistoryId)} projects={projects.map(project=>({key:project.key,name:project.name}))} assets={videoAssetStore.assets} canLoadMoreAssets={!!videoAssetStore.nextCursor} onLoadMoreAssets={videoAssetStore.loadMore} request={privateFetchRaw} light={lightCanvas} readOnly={readOnly||isNodeLocked(videoHistoryId)} onClose={()=>setVideoHistoryId(null)} onSelectResult={(id,revision)=>selectVideoResult(videoHistoryId,id,revision)} onReuseSettings={async snapshot=>{const node=videoNodesStore.getNode(videoHistoryId),account=canvasAccountRef.current,epoch=canvasContextEpochRef.current;if(!node||readOnly||isNodeLocked(node.id))throw new Error("无法修改视频设置");const draft=videoHistoryDraft(snapshot);await mergeWorks(draft.choices.filter(choice=>choice.kind!=="text").map(choice=>choice.nodeId));if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)throw new Error("账号或项目已切换");await saveVideoDraft(node.id,{title:node.title,config:draft.config,inputs:draft.inputs,expectedRevision:node.revision});if(account!==canvasAccountRef.current||epoch!==canvasContextEpochRef.current)return;setVideoHistoryId(null);setVideoEditId(node.id);}} onSent={async result=>{await mergeWorks([result.artworkId,...(result.artworkIds||[]),...(result.inputArtworkIds||[])]);await videoNodesStore.refresh();await videoAssetStore.refresh();}} onRetried={async()=>{await videoNodesStore.refresh();await videoTaskStore.refresh();await refreshCredits();}} onProcess={(id,action)=>{const account=canvasAccountRef.current;void mergeWorks([id]).then(()=>{if(account===canvasAccountRef.current)extractVideoToCanvas(id,action);}).catch(error=>flashTip(error instanceof Error?error.message:"媒体加载失败"));}}/>}
      {imagegenPanel&&<ImagegenPanel entry="canvas" inputs={imagegenPanel.inputs} modelId={genModel} sourceNodeId={imagegenPanel.sourceNodeId} onClose={()=>setImagegenPanel(null)} onResult={result=>{void mountImagegenResult(result).catch(e=>flashTip(e instanceof Error?e.message:"结果已保存，请刷新画布"));}}/>}
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
