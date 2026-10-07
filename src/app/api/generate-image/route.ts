import { getPool } from "@/lib/db";
import { readManagedObject } from "@/lib/storage";
import { runPostprocess, PostprocessPending } from "@/lib/media-postprocess";
import { currentModelExecution } from "@/lib/model-config/context";
import {withBillingIntent} from "@/lib/billing/intent";
import {auditSettledImage} from "@/lib/image-quality-request";
import { resolveConfiguredImageQuality } from "@/lib/model-config/image-quality";
import { modelAwareOpenAI } from "@/lib/model-config/clients";
import { observeOpenAI, withBiRequest } from "@/lib/bi/model-observer";
import { imageQualityCost } from "@/lib/image-quality-request";
import {quoteForRequest} from "@/lib/billing/server";
import {assertQuotedVersion,requestQuoteConfirmation,billingErrorResponse} from "@/lib/billing/request";
import {BillingError} from "@/lib/billing/types";
import { DurableImageJobs, imageWorkerAuthorized } from "@/lib/durable-image-jobs";
import { NextResponse } from "next/server";
import { provenanceEntry } from "@/lib/artwork-provenance";
import OpenAI, { toFile } from "openai";
import { CATEGORY_IMAGES, img } from "@/lib/images";
import {
  MAX_GENERATION_DIMENSION,
  resolutionForLongSide,
  resolutionLongSide,
} from "@/lib/mock-data";
import {
  dbEnabled,
  addArtworks,
  ensureTemplateRoot,
  getUser,
  isBanned,
  getImageJobChargedCredits,
  sweepStaleReservations,
} from "@/lib/db";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { resolveUserEmail } from "@/lib/admin-auth";
import { safeError } from "@/lib/api-error";
import {
  storageEnabled,
  uploadImage,
  dataUrlToBytes,
} from "@/lib/storage";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { getStyleGuide } from "@/lib/prompt-config";
import {
  getImageModelCatalog,
  getUserDefaultImageModel,
  isOpenAIImagesEditModel,
  type ImageModelDescriptor,
} from "@/lib/image-model-catalog";
import { routeImageModel } from "@/lib/image-model-routing";
import { resolveImageQuality, isQualityUnsupportedError } from "@/lib/image-quality";
import { generateNewApiImage } from "@/lib/new-api-image";
import { imageGatewayFields, ImageOperationPending, withImageIndex } from "@/lib/image-gateway";
import {
  assertUserImageBaseUrlAllowed,
  getUserImageProvider,
  freezeUserImageProvider,
  restoreUserImageProvider,
  upstreamUserImageModel,
  USER_IMAGE_MODEL_PREFIX,
} from "@/lib/user-image-provider";

// ---------------------------------------------------------------------------
// Image generation / editing endpoint.
//
// - No uploaded image -> text-to-image (images.generate).
// - Uploaded product image -> image-to-image (images.edit), so the user's
//   real product is preserved and re-composed per the prompt/style.
// - Style + ratio are baked into the prompt AND the request size so the
//   selected options actually change the output.
// - OPENAI key / DATABASE_URL / R2_* each upgrade behaviour; missing config
//   degrades to mock.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 120;

export type GeneratedImage = {
  id: string;
  url: string;
  gradient: string;
  prompt: string;
  ratio: string;
  createdAt: string;
  width?: number;
  height?: number;
  processingKind?: "base" | "resize" | "native" | "ai-upscale";
  postprocessStatus?: "succeeded" | "failed-kept-base" | "pending";
  execution?: { quality: string; upstream: string; reason: string; platformFunded: boolean };
};

type GenImage = { buf: Buffer; type: string };
type GenParams = {
	compiledPrompt?: string;
  prompt: string;
  // 落库用的「用户原始提示词」:仅用户自己输入的内容(图裂变/融图客户端拼了系统词进 prompt,
  // 这里单独传原始词),用于 addArtworks 落库,避免系统提示词被同行抄袭。模型调用仍用完整 prompt。
  userPrompt: string;
  category: string;
  ratio: string;
  resolution: string;
  style: string;
  qualityDefault?: string;
  billingVersion?:unknown;
  billingCredits?:unknown;
  quality: string; // 请求质量档:low/medium/high/xhigh/max/auto;通道不支持时提交前回退默认档,请求值只入审计
  count: number;
  transparent: boolean; // 透明底(抠图):gpt-image background:transparent PNG
  ratiogen: boolean; // 改比例(ChatGPT 式重生成):用节点自身提示词+原图参考,按目标比例重画再裁切,无需额外提示词
  email: string;
  images: GenImage[];
  parentId: string; // 血缘:本次生成所基于的作品 id(图生图底图来源),无则空串
  parentIds: string[]; // 多输入:额外父节点 id(合并多张参考图时,除 primary 之外的)
  // 来自模板库「做同款」:模板 id/图/提示词,用于在血缘里建"模板原图"根节点
  templateId: string;
  templateImage: string;
  templatePrompt: string;
  origin: string; // "canvas"=在画布里产出(永远留画布);空=生图页/工具等普通产出
  entry?: string;
  projectGroupId: string; // 纯文字画布生成首张图片时沿用当前画布项目
  model: string;
  targetWidth: number;
  targetHeight: number;
};

const MAX_IMAGES = 6;

// gpt-image 出图质量默认值与回退逻辑收敛到 src/lib/image-quality.ts:
// 不设=默认 auto≈最高=最慢(实测 1K 要 50~150 秒),默认 medium 快很多、
// 质量仍够电商商用;env OPENAI_IMAGE_QUALITY 调,能力开关见该模块注释。

const GRADIENTS = [
  "from-rose-100 to-slate-100",
  "from-lime-100 to-emerald-100",
  "from-amber-100 to-orange-100",
  "from-sky-100 to-teal-100",
  "from-emerald-100 to-teal-100",
  "from-stone-100 to-amber-100",
];

// Concrete descriptors so the picked style visibly changes the result.
function sizeFor(ratio: string, model: string): string {
  // OpenAI gpt-image-1 接受 size: "auto",让模型自选最合适的输出尺寸。
  // DALL·E 3 不支持 auto,退化成方图。
  if (ratio === "auto") return model === "dall-e-3" ? "1024x1024" : "auto";
  // 通用方向判断:任意 "w:h" 比例都能映射到 gpt-image 支持的三种尺寸(横/竖/方)。
  const [rw, rh] = ratio.split(":").map(Number);
  const k = rw > 0 && rh > 0 ? rw / rh : 1;
  const portrait = k < 0.95;
  const landscape = k > 1.05;
  if (model === "dall-e-3") {
    if (landscape) return "1792x1024";
    if (portrait) return "1024x1792";
    return "1024x1024";
  }
  if (landscape) return "1536x1024";
  if (portrait) return "1024x1536";
  return "1024x1024";
}

function buildPrompt(p: GenParams, styleGuide: Record<string, string>): string {
  // 默认风格:完全透传用户提示词,不附加任何内容——输出由用户提示词完全决定。
  const styleDesc =
    p.style && p.style !== "默认" ? styleGuide[p.style] || p.style : "";
  if (!styleDesc) return p.prompt;
  // 选了具体风格:仅在用户提示词后追加该风格描述(风格表后台可改)。
  return `${p.prompt}，${styleDesc}`;
}

function mockImages(p: GenParams): GeneratedImage[] {
  const pool = CATEGORY_IMAGES[p.category] ?? CATEGORY_IMAGES.main;
  return Array.from({ length: p.count }).map((_, i) => ({
    id: `gen-${Date.now()}-${i}`,
    url: img(pool[i % pool.length], 1000),
    gradient: GRADIENTS[(Date.now() + i) % GRADIENTS.length],
    prompt: p.prompt,
    ratio: p.ratio,
    createdAt: new Date().toISOString(),
  }));
}

// 某些模型(非 gpt-image-1 的代理/三方模型)不支持 background:transparent,
// 会返回 400 "Transparent background is not supported for this model"。
// 命中该错误时去掉透明底参数重试,保证抠图动作至少能正常出图。
function transparentUnsupported(e: unknown): boolean {
  const msg =
    (e as { message?: string })?.message ??
    String((e as { error?: { message?: string } })?.error?.message ?? "");
  return /transparent background is not supported/i.test(msg);
}

// 改比例(ChatGPT 式重生成)固定指令:不需要用户额外提示词。
// 仿 ChatGPT「用不同宽高比生成此图片」:拿节点自身提示词 + 原图当参考,
// 在目标比例下重画一张(同主体/风格/配色,自然重构图),而不是补四周。
const RATIO_HINT =
  "Re-render this image at the new target aspect ratio. Keep the same subject, style, colours, lighting and overall look as the reference image; naturally re-frame and recompose to fill the new proportions — do not stretch, squash, distort, letterbox or crop the subject out. Photorealistic, cohesive, high quality, no borders, no frames, no added text.";

// 改比例时送给模型的提示词:有节点自身提示词就带上(更贴近原意图),没有就只用重构图指令。
function ratioPrompt(p: GenParams): string {
  const base = (p.prompt || "").trim();
  return base ? `${base}. ${RATIO_HINT}` : RATIO_HINT;
}

// 把图按精确目标比例裁切(gpt-image 只出方/横/竖三种原生尺寸,
// 9:16、4:3 这类精确比例靠出最近原生尺寸后再裁切得到 —— 即 ChatGPT 同款做法)。
// attention 选窗:对齐画面"最有趣"的区域(主体/人脸),替代固定正中心,贴边内容不被硬裁。
async function cropToRatio(buf: Buffer, ratio: string): Promise<Buffer> {
  const [rw, rh] = ratio.split(":").map(Number);
  if (!(rw > 0 && rh > 0)) return buf;
  try {
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp");
    } & typeof import("sharp");
    const sharp = mod.default ?? mod;
    const meta = await sharp(buf).metadata();
    const W = meta.width || 0;
    const H = meta.height || 0;
    if (!W || !H) return buf;
    const target = rw / rh;
    const cur = W / H;
    let cw = W;
    let ch = H;
    if (cur > target + 0.01) cw = Math.round(H * target); // 太宽 → 裁掉左右
    else if (cur < target - 0.01) ch = Math.round(W / target); // 太高 → 裁掉上下
    else return buf; // 已是目标比例
    cw = Math.min(cw, W);
    ch = Math.min(ch, H);
    // cw×ch 只有一维小于原图,fit:cover 缩放系数为 1,等价于纯裁切;
    // attention 让 sharp 找主体定窗口(找不到显著区域时自动回退中心)。
    return await sharp(buf)
      .resize(cw, ch, { fit: "cover", position: sharp.strategy.attention })
      .png()
      .toBuffer();
  } catch {
    return buf; // sharp 不可用 → 退回未裁切(仍是最近原生比例)
  }
}

// 留白补比例:不裁任何内容,用指定背景把短边补到目标比例。
// 透明底(抠图)补透明、纯色底(白底图)补同色 —— 视觉无缝且主体完整。
async function padToRatio(
  sharp: typeof import("sharp"),
  buf: Buffer,
  ratio: string,
  background: { r: number; g: number; b: number; alpha?: number }
): Promise<Buffer> {
  const [rw, rh] = ratio.split(":").map(Number);
  if (!(rw > 0 && rh > 0)) return buf;
  const meta = await sharp(buf).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;
  if (!W || !H) return buf;
  const target = rw / rh;
  const cur = W / H;
  let cw = W;
  let ch = H;
  if (cur > target + 0.01) ch = Math.round(W / target); // 太宽 → 上下补白
  else if (cur < target - 0.01) cw = Math.round(H * target); // 太高 → 左右补白
  else return buf; // 已是目标比例
  return await sharp(buf)
    .resize(cw, ch, { fit: "contain", background, kernel: "lanczos3" })
    .png()
    .toBuffer();
}

// 检测纯色边框(白底图/影棚纯色底):缩到 32×32 采样四边,与均值偏差均小于阈值
// 视为纯色边,返回该颜色用于无缝留白;不纯返回 null(回退裁切)。
// 误判代价极低 —— 补的就是边框本色,视觉上仍然无缝。
async function detectUniformBorder(
  sharp: typeof import("sharp"),
  buf: Buffer
): Promise<{ r: number; g: number; b: number } | null> {
  try {
    const { data, info } = await sharp(buf)
      .resize(32, 32, { fit: "fill" })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels < 3) return null;
    const at = (x: number, y: number) => {
      const i = (y * 32 + x) * info.channels;
      return { r: data[i], g: data[i + 1], b: data[i + 2] };
    };
    const samples: { r: number; g: number; b: number }[] = [];
    for (let i = 0; i < 32; i++) {
      samples.push(at(i, 0), at(i, 31), at(0, i), at(31, i));
    }
    const n = samples.length;
    const mean = samples.reduce(
      (acc, c) => ({ r: acc.r + c.r / n, g: acc.g + c.g / n, b: acc.b + c.b / n }),
      { r: 0, g: 0, b: 0 }
    );
    const uniform = samples.every(
      (c) =>
        Math.abs(c.r - mean.r) < 14 &&
        Math.abs(c.g - mean.g) < 14 &&
        Math.abs(c.b - mean.b) < 14
    );
    return uniform
      ? { r: Math.round(mean.r), g: Math.round(mean.g), b: Math.round(mean.b) }
      : null;
  } catch {
    return null;
  }
}

async function openaiImages(
  p: GenParams,
  apiKey: string,
  modelIn: string,
  cutoutModel: string,
  baseUrl?: string,
  opts?: { auditUpstream?: string; providerFallback?: boolean }
): Promise<GeneratedImage[]> {
  // 透明底只 gpt-image-1 支持(gpt-image-2 实测不支持 background:transparent),走抠图模型;
  // 其余生图走默认模型(gpt-image-2)。普通生图的兜底已统一 v2,不再落 v1。
  const model = p.transparent ? cutoutModel || "gpt-image-1" : modelIn;
  const client = observeOpenAI(modelAwareOpenAI({
    apiKey,
    baseURL: baseUrl || (await getOpenAIBaseUrl()) || undefined,
    // Generation runs as a background job (no CDN constraint), so allow a
    // long single attempt. No retry — a retry after timeout would double the
    // wait and blow past the client's poll deadline.
    timeout: 280_000,
    maxRetries: 0,
  }, !opts?.auditUpstream?.startsWith("byok:")));
  const prompt = p.compiledPrompt || (p.ratiogen ? ratioPrompt(p) : buildPrompt(p, await getStyleGuide()));
  const size = sizeFor(p.ratio, model);
  const canEdit = p.images.length > 0 && isOpenAIImagesEditModel(model);
  // 出图质量:解析结果=实际执行档。通道未接入质量参数时在提交前回退为默认档
  // (env OPENAI_IMAGE_QUALITY,缺省 medium);内测仍按请求档测试价计费。
  const q = (p.quality || p.qualityDefault || resolveConfiguredImageQuality("").executed) as
    | "low"
    | "medium"
    | "high"
    | "auto";
  // 默认档:上游报错不识别 quality 参数时,同一通道先退回默认档重试一次。
  const qDefault = (p.qualityDefault || resolveConfiguredImageQuality("").executed) as typeof q;

  type UpstreamImage = { b64_json?: string; url?: string; execution?: GeneratedImage["execution"] };
  let data: UpstreamImage[] = [];

  // 兼容服务经常接受 n>1 却只返回 1 张。统一拆成 count 次 n=1，既能保证
  // 用户选择的数量真实执行，也能在个别请求失败时保留其余成功结果。
  async function fanOut(
    worker: (index: number) => Promise<UpstreamImage>
  ): Promise<UpstreamImage[]> {
    const settled: PromiseSettledResult<UpstreamImage>[] = new Array(p.count);
    let cursor = 0;
    // 每个 job 最多只向全局闸门提交 4 个活动 worker，避免一个 8 图任务
    // 预先占满等待队列，让稍后提交的其他节点长期排在它后面。
    const workerCount = Math.min(p.count, GEN_MAX_CONCURRENT);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < p.count) {
          const index = cursor++;
          try {
            settled[index] = {
              status: "fulfilled",
              value: await (async () => {
                return withImageIndex(model, index, () => withGenSlot(() => worker(index)));
              })(),
            };
          } catch (reason) {
            settled[index] = { status: "rejected", reason };
          }
        }
      })
    );
    const succeeded: UpstreamImage[] = [];
    const failed: unknown[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") succeeded.push(result.value);
      else failed.push(result.reason);
    }
    // Wait for all workers to settle, then preserve the complete job. Router
    // replays successful indices when the worker later recovers this batch.
    const pending = failed.find((error) => error instanceof ImageOperationPending);
    if (pending) throw pending;
    if (failed.length > 0) {
      console.error(
        `[generate-image] partial upstream failure: requested=${p.count} succeeded=${succeeded.length} failed=${failed.length}`,
        failed.map((reason) =>
          reason instanceof Error ? reason.message : String(reason)
        )
      );
    }
    if (succeeded.length === 0) {
      const first = failed[0];
      throw first instanceof Error ? first : new Error("OpenAI 未返回图片");
    }
    return succeeded;
  }

  // 改比例(ChatGPT 式重生成):拿节点自身提示词 + 原图当参考,按目标比例重画一张,
  // 出图后裁切到精确比例。同主体/风格/配色,自然重构图 —— 无接缝、无羽化、不限于 3 种形状。
  // 不需要用户额外提示词(ratioPrompt 已带固定重构图指令),只生成 1 张。
  if (p.ratiogen && p.images[0] && isOpenAIImagesEditModel(model)) {
    const ref = await normalizeForEdit(Buffer.from(p.images[0].buf));
    const r = await withGenSlot(async () =>
      client.images.edit({
        ...imageGatewayFields(model, true),
        model,
        image: await toFile(Buffer.from(ref), "ref.png", {
          type: "image/png",
        }),
        prompt,
        n: 1,
        size: size as "1024x1024" | "1536x1024" | "1024x1536",
      })
    );
    const b64 = r.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI 未返回图片");
    const cropped = await cropToRatio(Buffer.from(b64, "base64"), p.ratio);
    return [
      {
        id: `gen-${Date.now()}-0`,
        url: `data:image/png;base64,${cropped.toString("base64")}`,
        gradient: GRADIENTS[0],
        prompt: p.prompt,
        ratio: p.ratio,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  if (canEdit) {
    // Image-to-image: keep the user's product(s), recompose per prompt/style.
    // gpt-image accepts multiple reference images (up to MAX_IMAGES).
    const normalized = await Promise.all(
      p.images.map((im) => normalizeForEdit(Buffer.from(im.buf)))
    );
    const editOnce = async (transparent: boolean, quality: typeof q) => {
      // 每次请求重新创建 File。兼容服务读取 multipart 流后，File 不可安全地
      // 在并发请求或透明底降级重试之间复用。
      const files = await Promise.all(
        normalized.map((png, i) =>
          toFile(Buffer.from(png), `product-${i}.png`, { type: "image/png" })
        )
      );
      return client.images.edit({
        ...imageGatewayFields(model, true),
        model,
        image: files,
        prompt,
        n: 1,
        size: size as "1024x1024" | "1536x1024" | "1024x1536",
        quality,
        ...(transparent ? { background: "transparent" as const } : {}),
      });
    };
    data = await fanOut(async () => {
      let r;
      let executedQuality: string = q;
      try {
        r = await editOnce(p.transparent, q);
      } catch (e) {
        if (p.transparent && transparentUnsupported(e)) {
          r = await editOnce(false, q); // 退回不透明底重试
        } else if (q !== qDefault && isQualityUnsupportedError(e)) {
          // 上游不识别 quality 参数:同通道退回默认档重试,出图不受影响
          console.error(`[gen-quality-fallback] 同通道退默认档 model=${model} req=${q}`);
          r = await editOnce(p.transparent, qDefault);
          executedQuality = qDefault;
        } else throw e;
      }
      const image = r.data?.[0];
      if (!image) throw new Error("OpenAI 未返回图片");
      return { ...image, execution: { quality: executedQuality, upstream: opts?.auditUpstream || `default:${model}`, reason: opts?.providerFallback ? "provider-fallback" : executedQuality !== q ? "quality-downgrade" : "generated", platformFunded: !opts?.auditUpstream?.startsWith("byok:") } };
    });
  } else {
    const generateOnce = async (transparent: boolean, quality: typeof q) => {
      if (model === "dall-e-3") {
        return client.images.generate({ model, prompt, n: 1, size });
      }
      return client.images.generate({
        ...imageGatewayFields(model),
        model,
        prompt,
        n: 1,
        size,
        quality,
        ...(transparent ? { background: "transparent" as const } : {}),
      });
    };
    data = await fanOut(async () => {
      let r;
      let executedQuality: string = q;
      try {
        r = await generateOnce(p.transparent, q);
      } catch (e) {
        if (p.transparent && transparentUnsupported(e)) {
          r = await generateOnce(false, q); // 退回不透明底重试
        } else if (q !== qDefault && isQualityUnsupportedError(e)) {
          // 上游不识别 quality 参数:同通道退回默认档重试,出图不受影响
          console.error(`[gen-quality-fallback] 同通道退默认档 model=${model} req=${q}`);
          r = await generateOnce(p.transparent, qDefault);
          executedQuality = qDefault;
        } else throw e;
      }
      const image = r.data?.[0];
      if (!image) throw new Error("OpenAI 未返回图片");
      return { ...image, execution: { quality: executedQuality, upstream: opts?.auditUpstream || `default:${model}`, reason: opts?.providerFallback ? "provider-fallback" : executedQuality !== q ? "quality-downgrade" : "generated", platformFunded: !opts?.auditUpstream?.startsWith("byok:") } };
    });
  }

  const imageRunId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const images = data.map((d, i) => ({
    id: `gen-${imageRunId}-${i}`,
    url: d.b64_json
      ? `data:image/png;base64,${d.b64_json}`
      : (d.url ?? ""),
    gradient: GRADIENTS[i % GRADIENTS.length],
    prompt: p.prompt,
    ratio: p.ratio,
    createdAt: new Date().toISOString(),
    execution: d.execution,
  }));
  if (images.length === 0) throw new Error("OpenAI 未返回图片");
  return images;
}

async function newApiFlowImages(
  p: GenParams,
  model: string,
  settings?: { baseUrl: string; apiKey: string }
): Promise<GeneratedImage[]> {
  const basePrompt = p.ratiogen ? ratioPrompt(p) : buildPrompt(p, await getStyleGuide());
  const prompt = p.transparent
    ? `${basePrompt}. Use a transparent background and return a PNG with alpha.`
    : basePrompt;
  const references = p.images.map((image) => ({
    buffer: Buffer.from(image.buf),
    mimeType: image.type || "image/png",
  }));
  const settled = await Promise.allSettled(
    Array.from({ length: p.count }, (_, index) => withImageIndex(model, index, () => withGenSlot(async () => {
      const result = await generateNewApiImage({ model, prompt, images: references, settings });
      return {
        id: `gen-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${index}`,
        url: `data:${result.contentType};base64,${result.buffer.toString("base64")}`,
        gradient: GRADIENTS[index % GRADIENTS.length], prompt: p.prompt, ratio: p.ratio,
        createdAt: new Date().toISOString(),
      } satisfies GeneratedImage;
    })))
  );
  const images: GeneratedImage[] = [];
  const failures: unknown[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") images.push(result.value);
    else failures.push(result.reason);
  }
  const pending = failures.find((error) => error instanceof ImageOperationPending);
  if (pending) throw pending;
  if (failures.length) {
    console.error(
      `[generate-image] New API partial failure: requested=${p.count} succeeded=${images.length} failed=${failures.length}`,
      failures.map((reason) =>
        reason instanceof Error ? reason.message : String(reason)
      )
    );
  }
  if (!images.length) {
    const first = failures[0];
    throw first instanceof Error ? first : new Error("New API 生图分组未返回图片");
  }
  return images;
}

// 把图生图的输入图统一重编码成干净的 PNG(sRGB/8bit),修复:
//  · 真实格式是 JPEG/WEBP 却按 .png 上传 → OpenAI "Invalid image file"
//  · CMYK / 16bit / 带怪异色彩配置 → "or mode" 报错
//  · 手机照片 EXIF 旋转
// sharp 不可用时退回原图(不让生成中断)。
async function normalizeForEdit(buf: Buffer): Promise<Buffer> {
  try {
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp");
    } & typeof import("sharp");
    const sharp = mod.default ?? mod;
    return await sharp(buf).rotate().png().toBuffer();
  } catch {
    return buf;
  }
}

// 所有比例都落到精确画幅；自定义宽高则进一步输出精确像素尺寸。
// 上游只支持方/横/竖三档，最终画幅由本地 Sharp 统一保证。
// 策略:真透明底(抠图)与纯色底(白底图)优先"留白补比例"保主体完整;
// 其余场景图用 attention 裁切(对齐主体选窗,不硬裁贴边内容)。
async function enforceOutputShape(
  images: GeneratedImage[],
  p: GenParams
): Promise<GeneratedImage[]> {
  return Promise.all(images.map(async (image) => {
    const decoded = dataUrlToBytes(image.url);
    if (!decoded) return image;
    try {
      const mod = (await import("sharp")) as unknown as { default?: typeof import("sharp") } & typeof import("sharp");
      const sharp = mod.default ?? mod;
      const input = Buffer.from(decoded.bytes);
      const meta = await sharp(input).metadata();
      // 留白底色:抠图(真带 alpha)补透明;纯色边框补同色;其余走裁切。
      // transparent 请求但上游没给 alpha(降级重试的不透明图)时不算透明底。
      const padBackground: { r: number; g: number; b: number; alpha?: number } | null =
        p.transparent && meta.hasAlpha
          ? { r: 0, g: 0, b: 0, alpha: 0 }
          : await detectUniformBorder(sharp, input);
      let output: Buffer;
      if (p.targetWidth > 0 && p.targetHeight > 0) {
        output = await sharp(input)
          .rotate()
          .resize(p.targetWidth, p.targetHeight, {
            fit: padBackground ? "contain" : "cover",
            background: padBackground ?? undefined,
            position: "centre",
            kernel: "lanczos3",
          })
          .png()
          .toBuffer();
      } else if (p.ratio && p.ratio !== "auto") {
        output = padBackground
          ? await padToRatio(sharp, input, p.ratio, padBackground)
          : await cropToRatio(input, p.ratio);
      } else return image;
      return { ...image, url: `data:image/png;base64,${output.toString("base64")}` };
    } catch {
      return image;
    }
  }));
}

async function attachImageDimensions(images: GeneratedImage[]): Promise<GeneratedImage[]> {
  let sharp: typeof import("sharp");
  try {
    const mod = (await import("sharp")) as unknown as { default?: typeof import("sharp") } & typeof import("sharp");
    sharp = mod.default ?? mod;
  } catch { return images; }
  return Promise.all(images.map(async (image) => {
    const decoded = dataUrlToBytes(image.url);
    if (!decoded) return image;
    try {
      const meta = await sharp(Buffer.from(decoded.bytes)).metadata();
      return { ...image, width: meta.width, height: meta.height };
    } catch { return image; }
  }));
}

// Upscale generated images to the chosen resolution tier's long side.
// gpt-image only outputs ~1024-1536px natively, so 2K/4K/5K are produced by
// resizing server-side with sharp (high-quality Lanczos). If sharp is missing
// or anything fails, we keep the original image so generation never breaks.
async function upscaleImages(
  images: GeneratedImage[],
  resolution: string
): Promise<GeneratedImage[]> {
  const target = resolutionLongSide(resolution);
  if (!target) return images; // 1K / unknown -> native size
  let sharp: typeof import("sharp");
  try {
    // sharp is a CJS `export =` module; under Node ESM the callable lands on
    // `.default`, but the static type has no `default` — cast to read it.
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp");
    } & typeof import("sharp");
    sharp = mod.default ?? mod;
  } catch {
    return images; // dependency unavailable -> degrade gracefully
  }
  return Promise.all(
    images.map(async (image) => {
      const decoded = dataUrlToBytes(image.url);
      if (!decoded) return image; // url-based result -> can't resize here
      try {
        const input = Buffer.from(decoded.bytes);
        const meta = await sharp(input).metadata();
        const longSide = Math.max(meta.width ?? 0, meta.height ?? 0);
        if (!longSide || longSide >= target) return image;
        const scale = target / longSide;
        const out = await sharp(input)
          .resize({
            width: Math.round((meta.width ?? 0) * scale),
            height: Math.round((meta.height ?? 0) * scale),
            kernel: "lanczos3",
            fit: "fill",
          })
          .png()
          .toBuffer();
        return {
          ...image,
          url: `data:image/png;base64,${out.toString("base64")}`,
        };
      } catch (e) {
        console.error(
          "[upscale] failed, keeping original:",
          e instanceof Error ? e.message : e
        );
        return image;
      }
    })
  );
}

async function persistToStorage(
  images: GeneratedImage[]
): Promise<GeneratedImage[]> {
  if (!storageEnabled) return images;
  return Promise.all(
    images.map(async (image) => {
      const decoded = dataUrlToBytes(image.url);
      if (!decoded) return image;
      try {
        const ext = decoded.contentType.split("/")[1] ?? "png";
        const url = await uploadImage(
          decoded.bytes,
          decoded.contentType,
          `generations/${image.id}.${ext}`
        );
        return { ...image, url };
      } catch (e) {
        console.error(
          "[R2] upload failed, keeping inline image:",
          e instanceof Error ? e.message : e
        );
        return image;
      }
    })
  );
}

// 解析 parentIds(表单里以 JSON 字符串传)
function parseIds(raw: string): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseCount(value: unknown, fallback = 4): number {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), 8);
}

function parseDimension(value: unknown): number {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : -1;
}

async function parseParams(request: Request): Promise<GenParams | null> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const f = await request.formData();
    const s = (k: string) => (f.get(k) ?? "").toString();
    const images: GenImage[] = [];
    for (const file of f.getAll("image")) {
      if (file instanceof File && file.size > 0) {
        images.push({
          buf: Buffer.from(await file.arrayBuffer()),
          type: file.type || "image/png",
        });
      }
      if (images.length >= MAX_IMAGES) break;
    }
    return {
      prompt: s("prompt").trim(),
      billingVersion:f.get("billingVersion")??undefined,billingCredits:f.get("billingCredits")??undefined,
      userPrompt: s("userPrompt").trim(),
      category: s("category") || "main",
      ratio: s("ratio") || "1:1",
      resolution: s("resolution") || "1K",
      style: s("style"),
      quality: s("quality").trim() || request.headers.get("x-naumi-image-quality") || "medium",
      count: parseCount(s("count")),
      transparent: s("transparent") === "1",
      ratiogen: s("ratiogen") === "1",
      email: s("email").trim(),
      images,
      parentId: s("parentId").trim(),
      parentIds: parseIds(s("parentIds")),
      templateId: s("templateId").trim(),
      templateImage: s("templateImage").trim(),
      templatePrompt: s("templatePrompt").trim(),
      origin: s("origin").trim(),
      entry: provenanceEntry(s("entry"), "generate"),
      projectGroupId: s("projectGroupId").trim(),
      model: s("model").trim(),
      targetWidth: parseDimension(s("targetWidth")),
      targetHeight: parseDimension(s("targetHeight")),
    };
  }
  const j = (await request.json()) as Partial<GenParams>;
  return {
    prompt: (j.prompt ?? "").trim(),
    billingVersion:j.billingVersion,billingCredits:j.billingCredits,
    userPrompt: (j.userPrompt ?? "").trim(),
    category: j.category || "main",
    ratio: j.ratio || "1:1",
    resolution: j.resolution || "1K",
    style: j.style ?? "",
    quality: j.quality ?? request.headers.get("x-naumi-image-quality") ?? "medium",
    count: parseCount(j.count),
    transparent: !!j.transparent,
    ratiogen: !!j.ratiogen,
    email: (j.email ?? "").trim(),
    images: [],
    parentId: (j.parentId ?? "").trim(),
    parentIds: Array.isArray(j.parentIds) ? j.parentIds : [],
    templateId: (j.templateId ?? "").trim(),
    templateImage: (j.templateImage ?? "").trim(),
    templatePrompt: (j.templatePrompt ?? "").trim(),
    origin: (j.origin ?? "").trim(),
    entry: provenanceEntry(j.entry, "generate"),
    projectGroupId: (j.projectGroupId ?? "").trim(),
    model: typeof (j as Partial<GenParams>).model === "string" ? (j as Partial<GenParams>).model!.trim() : "",
    targetWidth: parseDimension((j as Partial<GenParams>).targetWidth),
    targetHeight: parseDimension((j as Partial<GenParams>).targetHeight),
  };
}

// --- Async job store ------------------------------------------------------
// Persisted snapshots and leased execution survive process restarts.
type Job = {
  status: "pending" | "done" | "error" | "needs_attention";
  images?: GeneratedImage[];
  user?: Awaited<ReturnType<typeof getUser>>;
  creditsUsed?: number;
  mock?: boolean;
  mode?: string;
  persisted?: boolean;
  error?: string;
  createdAt: number;
  sourceUrl?: string | null;
  /** 质量审计:请求档 vs 实际执行档与回退原因(通道不支持时回退默认档)。 */
  quality?: { requested: string; executed: string; fallbackReason: string | null; executedQualities?: string[] };
};
const JOBS = new DurableImageJobs<Job>("generate");

// 生成并发闸:同时最多 GEN_MAX_CONCURRENT 个真实图片请求打上游,超出的排队。
// 闸门按“单张请求”而不是按 job 计数，因此多个节点并发或单 job 生成 8 张时，
// 全站总并发仍不会超过该值。单 fork 实例,模块级状态即可。
const GEN_MAX_CONCURRENT = Math.max(1, Number(process.env.GEN_MAX_CONCURRENT) || 4);
let genActive = 0;
const genWaiters: Array<() => void> = [];
function acquireGenSlot(): Promise<void> {
  if (genActive < GEN_MAX_CONCURRENT) {
    genActive++;
    return Promise.resolve();
  }
  return new Promise((resolve) => genWaiters.push(resolve));
}
function releaseGenSlot(): void {
  const next = genWaiters.shift();
  if (next) next(); // 槽位直接转交给下一个排队者(genActive 不变)
  else genActive = Math.max(0, genActive - 1);
}
async function withGenSlot<T>(work: () => Promise<T>): Promise<T> {
  await acquireGenSlot();
  try {
    return await work();
  } finally {
    releaseGenSlot();
  }
}

async function runJob(
  jobId: string,
  p: GenParams,
  apiKey: string,
  imageModel: ImageModelDescriptor,
  cutoutModel: string,
  defaultModel: string,
  userProvider: { baseUrl: string; apiKey: string; model: string } | null,
  useDb: boolean,
  cost: number
) {
  let billingSettled = false;
  try {
    const saved = await JOBS.get(jobId);
    let images: GeneratedImage[];
    if (saved?.images?.length) images = saved.images;
    else {
    if (imageModel.provider === "user-chat-completions" && userProvider) {
      images = await JOBS.paidOperation(jobId, "flow:" + userProvider.model, { id: jobId }, () => newApiFlowImages(p, userProvider.model, {
        baseUrl: userProvider.baseUrl,
        apiKey: userProvider.apiKey,
      }));
    } else if (imageModel.provider === "user-openai-images" && userProvider) {
      // 质量参数回退:BYOK 上游报错不识别 quality(连默认档也不收)时,切换默认
      // API(td key)+默认档重试一次,与老链路出图完全一致;计费不变。
      images = await JOBS.paidOperation(jobId, userProvider.model, { id: jobId, managedGateway: false, resolution: p.resolution as "1K" | "2K" | "4K", quality: p.quality, preserveIdentity: p.images.length > 0 }, async () => {
        try {
          return await openaiImages(
            p,
            userProvider.apiKey,
            userProvider.model,
            userProvider.model,
            userProvider.baseUrl,
            { auditUpstream: `byok:${userProvider.model}` }
          );
        } catch (e) {
          if (!apiKey || !defaultModel || !isQualityUnsupportedError(e)) throw e;
          console.error(`[gen-quality-fallback] BYOK 不支持质量参数,回退默认 API: job=${jobId} provider=${userProvider.model}`);
          // 使用提交时固化的默认档，成功结果中保留供应商回退信息。
          return openaiImages(
            { ...p, quality: p.qualityDefault || resolveConfiguredImageQuality("").executed },
            apiKey,
            defaultModel,
            cutoutModel,
            undefined,
            { auditUpstream: `default:${defaultModel} (from byok:${userProvider.model})`, providerFallback: true }
          );
        }
      });
    } else if (imageModel.provider === "new-api-flow" && !p.transparent) {
      images = await JOBS.paidOperation(jobId, "flow:" + imageModel.id, { id: jobId }, () => newApiFlowImages(p, imageModel.id));
    } else {
      images = apiKey
        ? await JOBS.paidOperation(jobId, p.transparent ? cutoutModel || "gpt-image-1" : imageModel.id, {
            id: jobId, resolution: p.resolution as "1K" | "2K" | "4K", quality: p.quality,
            task: p.category === "detail" ? "detail" : p.images.length ? "product" : "draft",
            preserveIdentity: p.images.length > 0,
          }, () => openaiImages(p, apiKey, imageModel.id, cutoutModel, undefined, { auditUpstream: `default:${imageModel.id}` }))
        : mockImages(p);
    }
    // Chat-completions channels have no quality parameter; audit their default tier.
    if (imageModel.provider === "user-chat-completions" || imageModel.provider === "new-api-flow") {
      images = images.map(image => ({ ...image, execution: {
        quality: p.qualityDefault || "medium",
        upstream: userProvider ? `byok:${userProvider.model}` : `flow:${imageModel.id}`,
        reason: p.quality !== p.qualityDefault ? "quality-downgrade" : "generated",
        platformFunded: !userProvider,
      } }));
    }
    const scope = currentModelExecution("image"), post = scope?.businessOption?.postprocess;
    if (post?.enabled) {
      images = await Promise.all(images.map(async (image,index) => {
        const decoded = dataUrlToBytes(image.url);
        const bytes = decoded ? Buffer.from(decoded.bytes) : (await readManagedObject(image.url,64*1024*1024)).bytes;
        const result = await runPostprocess({ id: `${jobId}:postprocess:${index}`, parentId:jobId, email:p.email, modelVersion:scope!.frozen.modelVersion, bytes, policy:post });
        return { ...image,url:result.url,width:result.width,height:result.height,processingKind:result.kind,postprocessStatus:result.status };
      }));
    } else {
    images = await enforceOutputShape(images, p);
    if (!(p.targetWidth > 0 && p.targetHeight > 0)) {
      images = await upscaleImages(images, p.resolution);
    }
    }
    images = await attachImageDimensions(images);
    images = images.map((image, index) => ({ ...image, id: `art-${jobId}-${index}` }));
    images = await persistToStorage(images);
    await JOBS.patch(jobId, { images });
    }
    // Persist the first uploaded source image so "再次生成" can restore it.
    let sourceUrl: string | null = saved?.sourceUrl || null;
    if (!sourceUrl && p.images[0] && storageEnabled) {
      try {
        const first = p.images[0];
        const ext = (first.type || "image/png").split("/")[1] || "png";
        sourceUrl = await uploadImage(
          first.buf,
          first.type || "image/png",
          `sources/${jobId}.${ext}`
        );
      } catch {
        /* non-fatal */
      }
    }

    await JOBS.patch(jobId, { sourceUrl });
    let user: Awaited<ReturnType<typeof getUser>> = null;
    if (useDb) {
      const title =
        p.prompt.length > 16 ? `${p.prompt.slice(0, 16)}…` : p.prompt;
      const batchId = `b-${jobId}`;
      // 血缘父节点:优先用显式 parentId;否则若来自模板「做同款」,在用户名下
      // 找/建该模板的"模板原图"根节点,本次生成挂它下面。
      let parent: string | null = p.parentId || null;
      if (!parent && p.templateId && p.templateImage) {
        parent = await ensureTemplateRoot(p.email, {
          templateId: p.templateId,
          image: p.templateImage,
          prompt: p.templatePrompt || p.prompt,
          title: p.templatePrompt || p.prompt,
        }).catch(() => null);
      }
        await addArtworks(
          p.email,
          images.map((im) => ({
            id: im.id,
            title,
            category: p.category,
            // 落库只存用户原始提示词(有就用,空则退回完整 prompt),保护系统提示词不外泄。
            prompt: p.userPrompt || p.prompt,
            status: "completed",
            image: im.url,
            gradient: im.gradient,
            style: p.style || null,
            ratio: p.ratio || null,
            resolution: p.resolution || null,
            source: sourceUrl,
            parentId: parent,
            parentIds: p.parentIds.filter((x) => x && x !== parent),
            groupId: p.projectGroupId || undefined,
            origin: p.origin || null,
            creationProvenance: { version: 1, operation: "generate", entry: p.origin === "canvas" ? "canvas" : provenanceEntry(p.entry), ref: jobId, evidence: "server-route" },
            width: im.width ?? null,
            height: im.height ?? null,
            processingKind: im.processingKind ?? null,
            postprocessStatus: im.postprocessStatus ?? null,
          })),
          batchId
        );
      // 按提交时的单张报价结算；部分成功和后续配置变化不会重算价目。
      const actualCost = userProvider ? 0 : images.length * (cost / p.count);
      await JOBS.settleResults(jobId, actualCost, `生成 ${images.length} 张图`,{state:"succeeded",items:images.map(image=>({id:image.id,state:"succeeded",executedQuality:image.execution?.quality||p.quality||"medium",platformFunded:image.execution?.platformFunded}))});
      billingSettled = true;
      user = await getUser(p.email).catch(() => null);
    }


    // Audit successful, settled images using persisted execution metadata.
    const chargedCredits = await getImageJobChargedCredits(jobId);
    for (const image of images) {
      const execution = image.execution || { quality: p.quality || p.qualityDefault || "medium", upstream: userProvider ? `byok:${userProvider.model}` : `default:${imageModel.id}`, reason: "generated", platformFunded: !userProvider && !!apiKey };
      await auditSettledImage(p.email,chargedCredits/images.length,{requested:saved?.quality?.requested||"medium",executed:execution.quality as import("@/lib/image-quality").ExecutedQuality,fallbackReason:null},jobId,image.id,p.resolution,execution);
    }
    const executedQualities = images.map(image => image.execution?.quality || p.quality || p.qualityDefault || "medium");
    const quality = saved?.quality ? { ...saved.quality, executed: new Set(executedQualities).size > 1 ? "mixed" : executedQualities[0], executedQualities,
      fallbackReason: images.some(image => image.execution?.reason === "provider-fallback") ? "provider-fallback" : images.some(image => image.execution?.reason === "quality-downgrade") ? "upstream-unsupported" : saved.quality.fallbackReason } : undefined;
    await JOBS.set(jobId, {
      status: "done",
      images,
      user,
      creditsUsed: chargedCredits,
      mock:
        !apiKey &&
        !userProvider &&
        imageModel.provider !== "new-api-flow",
      mode: p.images.length > 0 ? "edit" : "generate",
      persisted: useDb,
      createdAt: Date.now(),
      quality,
    });
  } catch (e) {
    if (e instanceof ImageOperationPending || e instanceof PostprocessPending) {
      const exhausted = e instanceof PostprocessPending && (await getPool().query("SELECT 1 FROM app_media_postprocess WHERE operation_id=$1 AND attempts>=3",[e.operationId])).rowCount;
      await JOBS.patch(jobId, { status: exhausted ? "needs_attention" : "pending", error: e.message });
      return;
    }
    if ((await JOBS.get(jobId, false))?.images?.length) throw e;
    if (useDb && !billingSettled) await JOBS.settleResults(jobId, 0, "图片生成失败",{state:"failed",items:[]});
    // 原始上游 message 可能含 openai/gpt/quota 等字样,经 safeError 净化后再落库,
    // 避免随 GET 轮询回传给用户暴露所用模型。详细原因只打服务端日志。
    console.error(
      "[generate-image] job failed:",
      e instanceof Error ? e.message : e
    );
    await JOBS.set(jobId, {
      status: "error",
      error: safeError(e, "图片生成失败,请稍后重试"),
      createdAt: Date.now(),
    });
  }
}

async function kickGeneration(id: string) {
  await JOBS.kick(id, async (payload) => {
    const p = payload.p as GenParams;
    const settings = await getOpenAISettings();
    if (payload.byok && typeof payload.byokSnapshot !== "string") {
      await JOBS.patch(id, { error: "旧任务缺少自定义接口快照，已暂停提交，请联系管理员核查" });
      return;
    }
    const provider = payload.byok ? restoreUserImageProvider(p.email, payload.byokSnapshot as string) : null;
    const imageModel: ImageModelDescriptor | undefined = provider ? {
      id: p.model, label: `自定义 · ${upstreamUserImageModel(p.model)}`,
      provider: provider.protocol === "chat-completions" ? "user-chat-completions" : "user-openai-images",
      supportsEdit: provider.protocol === "chat-completions" || upstreamUserImageModel(p.model).startsWith("gpt-image"),
    } : (await getImageModelCatalog(p.email)).find((model) => model.id === p.model);
    if (!imageModel) throw new Error("任务模型暂时不可用");
    if (payload.byok && !provider) throw new Error("自定义图片接口暂时不可用");
    if (provider) await assertUserImageBaseUrlAllowed(provider.baseUrl);
    await runJob(id, p, settings.apiKey, imageModel, settings.cutoutModel, settings.model,
      provider ? { ...provider, model: upstreamUserImageModel(p.model) } : null,
      dbEnabled && !!p.email, Number(payload.cost));
  });
}

async function handleObservedPost(request: Request) {
  if (imageWorkerAuthorized(request)) {
    const body = await request.json();
    if (typeof body.workerJobId !== "string") return NextResponse.json({ error: "无效任务" }, { status: 400 });
    await kickGeneration(body.workerJobId);
    return NextResponse.json({ ok: true });
  }
  let p: GenParams | null;
  try {
    p = await parseParams(request);
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!p) {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  // 改比例(ratiogen)用固定重构图指令,可以没有用户提示词;其余路径仍要求 prompt。
  if (!p.prompt && !p.ratiogen) {
    return NextResponse.json({ error: "prompt 不能为空" }, { status: 400 });
  }
  const hasCustomWidth = p.targetWidth !== 0;
  const hasCustomHeight = p.targetHeight !== 0;
  if (
    hasCustomWidth !== hasCustomHeight ||
    p.targetWidth < 0 || p.targetHeight < 0 ||
    p.targetWidth > MAX_GENERATION_DIMENSION || p.targetHeight > MAX_GENERATION_DIMENSION ||
    (hasCustomWidth && (p.targetWidth < 64 || p.targetHeight < 64))
  ) {
    return NextResponse.json(
      { error: `自定义尺寸需同时填写 64–${MAX_GENERATION_DIMENSION} 的宽和高` },
      { status: 400 }
    );
  }
  if (hasCustomWidth) p.resolution = resolutionForLongSide(Math.max(p.targetWidth, p.targetHeight));
  if (p.images.some((im) => im.buf.length > 12 * 1024 * 1024)) {
    return NextResponse.json(
      { error: "单张上传图片过大（请 < 12MB）" },
      { status: 400 }
    );
  }

  try {
  const { apiKey, model: defaultModel, cutoutModel } = await getOpenAISettings();
  const ip = clientIp(request);

  // 按 IP 限流:防脚本化刷接口烧 token。生图较重,30 次/10 分钟足够真实用户。
  if (!rateLimit(`gen:${ip}`, 30, 600_000)) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429 }
    );
  }

  // 先解析真实登录账号，再生成该账号专属模型目录；不能让客户端用 email 指向他人配置。
  let actorEmail: string | null = null;
  if (dbEnabled) {
    actorEmail = await resolveUserEmail(request);
    if (!actorEmail) {
      return NextResponse.json(
        { error: "请先登录后再生成" },
        { status: 401 }
      );
    }
    p.email = actorEmail;
  }

  const userDefaultModel = actorEmail
    ? await getUserDefaultImageModel(actorEmail)
    : null;
  const catalog = await getImageModelCatalog(actorEmail);
  const requestedModel = p.model || userDefaultModel || defaultModel;
  const model = routeImageModel(requestedModel, p.ratio, catalog);
  const imageModel = catalog.find((item) => item.id === model);
  if (!imageModel) {
    return NextResponse.json(
      {
        error: model.startsWith(USER_IMAGE_MODEL_PREFIX)
          ? "自定义图片接口已停用或模型已移除，请到账号中心重新配置"
          : "所选生图模型不可用，请刷新模型列表后重试",
      },
      { status: 400 }
    );
  }
  if (model !== requestedModel) {
    console.info(
      `[gen-model-route] requested=${requestedModel} routed=${model} ratio=${p.ratio} resolution=${p.resolution}`
    );
  }
  if (p.images.length > 0 && !imageModel.supportsEdit) {
    return NextResponse.json(
      { error: "所选模型不支持参考图生成，请切换图生图模型" },
      { status: 400 }
    );
  }
  let userProvider: { baseUrl: string; apiKey: string; model: string } | null = null;
  let byokSnapshot: string | undefined;
  if (
    imageModel.provider === "user-openai-images" ||
    imageModel.provider === "user-chat-completions"
  ) {
    const configured = actorEmail ? await getUserImageProvider(actorEmail) : null;
    const upstreamModel = upstreamUserImageModel(imageModel.id);
    if (
      !configured ||
      !configured.baseUrl ||
      !configured.apiKey ||
      !configured.models.includes(upstreamModel)
    ) {
      return NextResponse.json(
        { error: "当前账号的自定义图片接口配置不完整，请重新保存后再试" },
        { status: 400 }
      );
    }
    await assertUserImageBaseUrlAllowed(configured.baseUrl);
    byokSnapshot = freezeUserImageProvider(p.email, configured);
    userProvider = {
      baseUrl: configured.baseUrl,
      apiKey: configured.apiKey,
      model: upstreamModel,
    };
  }
  const useDb = dbEnabled && p.email.length > 0;
  // 改比例只出 1 张,固定按 1 张计费(防止 count 被改大而超扣)。
  if (p.ratiogen) p.count = 1;
  // BYOK(用户自带接口)豁免计费:算力与费用都发生在用户自己的上游,
  // 站内不预扣、不结算、不记流水。
  // 按请求质量基础价叠加尺寸差价，提交时固定报价。
  // 选档→扣费→结算链路;请求档进任务审计,恢复/重放后结算口径不变。
  const qualityAudit = resolveConfiguredImageQuality(p.quality);
  const billingQuote=useDb?await quoteForRequest(request,{feature:"image.generate",quantity:p.count,quality:qualityAudit.requested||"medium",resolution:p.resolution,modelId:imageModel.id}):undefined;
  if(billingQuote)assertQuotedVersion(requestQuoteConfirmation(request,p),billingQuote);
  const cost = billingQuote?.requestedCredits ?? (userProvider ? 0 : p.count * await imageQualityCost(qualityAudit, p.resolution));

  if (dbEnabled && (await isBanned(p.email, ip))) {
    return NextResponse.json(
      { error: "账号或 IP 已被封禁，请联系管理员" },
      { status: 403 }
    );
  }

  if (useDb) await sweepStaleReservations(billingQuote?.staleReservationMinutes).catch(() => {});
  const jobId = `job-${crypto.randomUUID()}`;
  // 质量参数:入口即解析。p.quality 固化为实际执行档(恢复/重放确定性),
  // 请求档与回退原因进任务审计快照,供后台核对「请求了什么、跑了什么」。
  p.quality = qualityAudit.executed;
  p.qualityDefault = resolveConfiguredImageQuality("").executed;
  p.compiledPrompt = p.ratiogen ? ratioPrompt(p) : buildPrompt(p, await getStyleGuide());
  p.model = imageModel.id;
  try {
  await JOBS.create(jobId, p.email, { status: "pending", createdAt: Date.now(), quality: qualityAudit }, { p, cost, byok: !!userProvider, byokSnapshot }, cost, true,billingQuote);
  } catch(error) {
    const message=error instanceof Error ? error.message : "";
    return NextResponse.json({error:safeError(error,"任务保存失败，请稍后重试")},{status:message.includes("积分不足") ? 402 : 503});
  }
  await kickGeneration(jobId).catch(error=>console.error("[image-job] deferred kickoff:",error instanceof Error ? error.message : "unknown"));

  return NextResponse.json({ jobId });
  } catch (e) {
    // 兜底:任何未预期异常都回 JSON,避免前端拿到纯文本 500("Internal Server Error")
    if(e instanceof BillingError)return billingErrorResponse(e);
    return NextResponse.json(
      { error: safeError(e, "生成服务暂时不可用,请稍后重试") },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("active")) {
    const email = await resolveUserEmail(request);
    if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    return NextResponse.json({ jobs: await JOBS.active(email) });
  }
  const jobId = new URL(request.url).searchParams.get("job");
  if (jobId) {
    if (dbEnabled && (await resolveUserEmail(request))?.toLowerCase() !== await JOBS.owner(jobId)) {
      return NextResponse.json({ error: "无权查看此任务" }, { status: 403 });
    }
    const job = await JOBS.get(jobId, false);
    if (!job) {
      return NextResponse.json({
        status: "error",
        error: "任务不存在或已过期，请重试",
      });
    }
    if (job.status === "done") {
      return NextResponse.json({
        status: "done",
        ok: true,
        images: (job.images || []).map(({ execution, ...image }) => image),
        user: job.user,
        creditsUsed: job.creditsUsed,
        mock: job.mock,
        persisted: job.persisted,
        quality: job.quality,
      });
    }
    if (job.status === "error") {
      return NextResponse.json({ status: "error", error: job.error });
    }
    return NextResponse.json({ status: "pending", error: job.error || "" });
  }

  // 健康检查:绝不暴露模型名/上游供应商/密钥来源(铁律:绝不泄露所用模型)。
  const { apiKey } = await getOpenAISettings();
  return NextResponse.json({
    status: "ok",
    ready: !!apiKey,
    db: dbEnabled,
    storage: storageEnabled,
  });
}

async function createSubmission(request: Request) {
  return withBiRequest(request, () => handleObservedPost(request));
}

export async function POST(request:Request){return withBillingIntent(request,()=>createSubmission(request));}
