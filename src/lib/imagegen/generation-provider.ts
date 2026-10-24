import "server-only";
import {inheritedImageRatio, imageAspectInstruction} from "@/lib/imagegen/aspect";
import {sourceImageDimensions} from "@/lib/imagegen/output-shape";
import {exactImageRequestSize} from "@/lib/imagegen/request-size";
import {currentModelExecution} from "@/lib/model-config/context";
import {resolveConfiguredImageQuality} from "@/lib/model-config/image-quality";
import {modelAwareOpenAI} from "@/lib/model-config/clients";
import {observeOpenAI} from "@/lib/bi/model-calls";
import {toFile} from "openai";
import {CATEGORY_IMAGES, img} from "@/lib/images";
import {getOpenAIBaseUrl} from "@/lib/openai-base";
import {getStyleGuide} from "@/lib/prompt-config";
import {isOpenAIImagesEditModel} from "@/lib/image-model-catalog";
import {isQualityUnsupportedError} from "@/lib/image-quality";
import {generateNewApiImage} from "@/lib/new-api-image";
import {imageGatewayFields, ImageOperationPending, isImageGatewayModel, withImageIndex} from "@/lib/image-gateway";
import type {GenParams,GeneratedImage} from "./generation-types";
import {buildPrompt,ratioPrompt} from "./generation-prompt";
const GRADIENTS = [
  "from-rose-100 to-slate-100",
  "from-lime-100 to-emerald-100",
  "from-amber-100 to-orange-100",
  "from-sky-100 to-teal-100",
  "from-emerald-100 to-teal-100",
  "from-stone-100 to-amber-100",
];

export function sizeFor(ratio: string, model: string, exact = false, customRatio = false): string {
  if (exact) { const size = exactImageRequestSize(ratio, model, customRatio); if (size) return size; }
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

export function mockImages(p: GenParams): GeneratedImage[] {
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

export async function openaiImages(
  p: GenParams,
  apiKey: string,
  modelIn: string,
  cutoutModel: string,
  baseUrl?: string,
  opts?: { auditUpstream?: string; providerFallback?: boolean }
): Promise<GeneratedImage[]> {
  // 透明底只 gpt-image-1 支持(gpt-image-2 实测不支持 background:transparent),走抠图模型;
  // 其余生图走默认模型(gpt-image-2)。普通生图的兜底已统一 v2,不再落 v1。
  const model = modelIn;
  const client = observeOpenAI(modelAwareOpenAI({
    apiKey,
    baseURL: baseUrl || (await getOpenAIBaseUrl()) || undefined,
    // Generation runs as a background job (no CDN constraint), so allow a
    // long single attempt. No retry — a retry after timeout would double the
    // wait and blow past the client's poll deadline.
    timeout: 280_000,
    maxRetries: 0,
  }, !opts?.auditUpstream?.startsWith("byok:")));
  const targetDimensions = await sourceImageDimensions(p.images[0] ? Buffer.from(p.images[0].buf) : undefined);
  const basePrompt = p.compiledPrompt || (p.ratiogen ? ratioPrompt(p) : buildPrompt(p, await getStyleGuide()));
  const effectiveRatio = inheritedImageRatio(p.ratio, targetDimensions);
  const prompt = `${basePrompt}\n\n${imageAspectInstruction(effectiveRatio, targetDimensions)}`;
  const sizingModel = p.ratioContractVersion ? currentModelExecution("image")?.connection.wireModel || model : model;
  const size = sizeFor(effectiveRatio, sizingModel, !!p.ratioContractVersion, p.ratioContractVersion === 2);
  const canEdit = p.images.length > 0 && (currentModelExecution("image")?.capabilities.edit || isOpenAIImagesEditModel(model));
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
    const settled: PromiseSettledResult<UpstreamImage>[] = [];
    // A leased job is one execution unit. Images run in index order; different
    // jobs run concurrently under the DB lane and explicit provider budgets.
    for (let index = 0; index < p.count; index++) {
      try { settled.push({status:"fulfilled",value:await withImageIndex(model,index,()=>worker(index))}); }
      catch(reason) { settled.push({status:"rejected",reason}); if(reason instanceof ImageOperationPending)break; }
    }
    const succeeded: UpstreamImage[] = [];
    const failed: unknown[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") succeeded.push(result.value);
      else failed.push(result.reason);
    }
    // Wait for all workers to settle, then preserve the complete job. Router
    // replays successful indices when the worker later recovers this batch.
    const pending = failed.find((error) => error instanceof ImageOperationPending);
    if (pending && (isImageGatewayModel(model) || succeeded.length === 0)) throw pending;
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
  // 同主体/风格/配色自然重构图，返回后保留完整画面；不靠删边伪装成精确比例。
  // 不需要用户额外提示词(ratioPrompt 已带固定重构图指令),只生成 1 张。
  if (p.ratiogen && p.images[0] && isOpenAIImagesEditModel(model)) {
    const ref = await normalizeForEdit(Buffer.from(p.images[0].buf));
    const r = await client.images.edit({
        ...imageGatewayFields(model, true),
        model,
        image: await toFile(Buffer.from(ref), "ref.png", {
          type: "image/png",
        }),
        prompt,
        n: 1,
        size: size as "1024x1024" | "1536x1024" | "1024x1536",
      });
    const b64 = r.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI 未返回图片");
    const original = Buffer.from(b64, "base64");
    return [
      {
        id: `gen-${Date.now()}-0`,
        url: `data:image/png;base64,${original.toString("base64")}`,
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
    const normalized:Buffer[]=[];
    if(p.imagegen){for(const im of p.images)normalized.push(await normalizeForEdit(Buffer.from(im.buf)));}
    else normalized.push(...await Promise.all(p.images.map(im=>normalizeForEdit(Buffer.from(im.buf)))));
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
        ...(p.mask ? {mask:await toFile(await normalizeForEdit(p.mask.buf),"mask.png",{type:"image/png"})}:{}),
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
        if (!currentModelExecution("image") && !p.imagegen && !p.transparent && q !== qDefault && isQualityUnsupportedError(e)) {
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
        if (!currentModelExecution("image") && !p.imagegen && !p.transparent && q !== qDefault && isQualityUnsupportedError(e)) {
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

export async function newApiFlowImages(
  p: GenParams,
  model: string,
  settings?: { baseUrl: string; apiKey: string }
): Promise<GeneratedImage[]> {
  const targetDimensions = await sourceImageDimensions(p.images[0] ? Buffer.from(p.images[0].buf) : undefined);
  const effectiveRatio = inheritedImageRatio(p.ratio, targetDimensions);
  const basePrompt = `${p.compiledPrompt || (p.ratiogen ? ratioPrompt(p) : buildPrompt(p, await getStyleGuide()))}\n\n${imageAspectInstruction(effectiveRatio, targetDimensions)}`;
  const prompt = p.transparent
    ? `${basePrompt}. Use a transparent background and return a PNG with alpha.`
    : basePrompt;
  const references = p.images.map((image) => ({
    buffer: Buffer.from(image.buf),
    mimeType: image.type || "image/png",
  }));
  const settled: PromiseSettledResult<GeneratedImage>[] = [];
  for (let index = 0; index < p.count; index++) {
    try { settled.push({status:"fulfilled",value:await withImageIndex(model, index, async () => {
      const result = await generateNewApiImage({ model, prompt, images: references, settings });
      return {
        id: `gen-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${index}`,
        url: `data:${result.contentType};base64,${result.buffer.toString("base64")}`,
        gradient: GRADIENTS[index % GRADIENTS.length], prompt: p.prompt, ratio: p.ratio,
        createdAt: new Date().toISOString(),
      } satisfies GeneratedImage;
    })}); } catch(reason) { settled.push({status:"rejected",reason}); if(reason instanceof ImageOperationPending)break; }
  }
  const images: GeneratedImage[] = [];
  const failures: unknown[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") images.push(result.value);
    else failures.push(result.reason);
  }
  const pending = failures.find((error) => error instanceof ImageOperationPending);
  if (pending && (isImageGatewayModel(model) || images.length === 0)) throw pending;
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

export async function normalizeForEdit(buf: Buffer): Promise<Buffer> {
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
