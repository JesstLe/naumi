import { DurableImageJobs, imageWorkerAuthorized } from "@/lib/durable-image-jobs";
import { appendImageGatewayFields, imageOperationQuality, ImageOperationPending, isImageGatewayModel } from "@/lib/image-gateway";
import { NextResponse } from "next/server";
import { insufficientCreditsMessage } from "@/lib/commerce";
import { toVisionDataUrl } from "@/lib/vision-image";
import OpenAI from "openai";
import { requestedTextModel } from "@/lib/text-models";
import { POINTS_PER_IMAGE } from "@/lib/mock-data";
import { safeError } from "@/lib/api-error";
import {
  dbEnabled,
  addArtworks,
  getUser,
  isBanned,
  touchReservation,
  sweepStaleReservations,
  listArtworksByIds,
} from "@/lib/db";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { getImageModelCatalog, resolveImageModel } from "@/lib/image-model-catalog";
import { generateNewApiImage } from "@/lib/new-api-image";

// ---------------------------------------------------------------------------
// A+ 详情页生成:上传商品图(1-3 张) → 勾选内容模块 → AI 规划 + 图生图逐张出图。
// 三层 pipeline:
//   第 0 层:逐张清理实拍环境，生成白底商品母图。
//   第 1 层:视觉 LLM 按勾选模块规划每张图的定制提示词(平台/语言感知)。
//   第 2-N 层:gpt-image 图生图,每张 = 白底母图(参考,保一致) + 模块提示词。
// 异步 job + 逐张进度轮询,积分按张预留、失败按比例退。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

type ShotRole = string; // module key: hero/selling/scene/angles/story/compare
type ShotSpec = {
  role: ShotRole;
  label: string;
  ratio: string;
  prompt: string;
};
type ShotResult = ShotSpec & {
  id: string;
  status: "pending" | "done" | "error";
  url?: string;
  gradient: string;
};
type SourceResult = {
	redoOperationId?: string;
  id: string;
  label: string;
  status: "preparing" | "review" | "approved" | "redoing" | "error";
  url?: string;
  version: number;
  feedback?: string;
  error?: string;
};

// 当前兼容网关会拦截同一任务的并发 images.edit 请求。A+ 一次最多 9 次图像编辑，
// 这里宁可串行稳定完成，也不让白底母图或详情模块因 403 整批失败。
const CONCURRENCY = 1;
const PER_SHOT_TIMEOUT = 240_000;
const SHOT_RETRIES = 3;
const SOURCE_RETRIES = 2;

const GRADIENTS = [
  "from-rose-100 to-slate-100",
  "from-lime-100 to-emerald-100",
  "from-amber-100 to-orange-100",
  "from-sky-100 to-teal-100",
  "from-emerald-100 to-teal-100",
  "from-stone-100 to-amber-100",
];

// 可勾选的内容模块(key 与前端一致)。
const APLUS_MODULES: Record<string, { label: string; hint: string }> = {
  hero: { label: "首屏主视觉", hint: "一屏抓住眼球的商品主视觉,传递核心价值" },
  selling: { label: "核心卖点图", hint: "突出 1-2 个差异化卖点,配标注文案" },
  scene: { label: "使用场景图", hint: "把商品放进真实使用场景" },
  angles: { label: "多角度图", hint: "多角度呈现商品外观与细节" },
  story: { label: "品牌故事图", hint: "传递品牌理念与质感氛围" },
  compare: { label: "效果对比图", hint: "使用前后 / 有无本品的对比" },
  craft: { label: "工艺制作图", hint: "展示工艺制作过程" },
  size: { label: "尺寸尺码图", hint: "展示规格信息" },
  specs: { label: "规格/参数表", hint: "展示详细商品数据" },
  accessories: { label: "配件/赠品图", hint: "明确收货所有物品" },
  series: { label: "系列展示图", hint: "多色或多 SKU 展示" },
  ingredients: { label: "商品成分图", hint: "展示配方/材质/成分" },
  assurance: { label: "售后保障图", hint: "说明质保退换政策" },
  usage: { label: "使用建议图", hint: "说明使用方法与建议" },
};

const PLATFORM_LABELS: Record<string, string> = {
  amazon: "亚马逊(欧美跨境,简约英文风,符合亚马逊 A+ 规范)",
  taobao: "淘宝/天猫(中文精品详情页风格)",
  pdd: "拼多多(直白促销风)",
  independent: "独立站(现代品牌感,英文)",
};

// 图片比例档(7 档,对齐竞品):三种 A+ 版式 + 显式比例。
// gpt-image 仅支持 1024x1024 / 1536x1024 / 1024x1536,按最接近档位映射。
function sizeFor(format: string): "1024x1024" | "1536x1024" | "1024x1536" {
  if (format === "1:1") return "1024x1024";
  if (format === "9:16" || format === "aplus-mobile") return "1024x1536";
  return "1536x1024";
}

const RATIO_DESC: Record<string, string> = {
  "aplus-web": "高级 A+ 横版模块(约 3:2),构图舒展,适合 Web 端详情页",
  "aplus-mobile": "高级 A+ 移动端竖版模块(约 2:3),信息纵向排布",
  "aplus-basic": "标准(普通)A+ 横版模块(约 3:2),按平台基础 A+ 规范,简洁合规",
  "1:1": "正方形(1:1)",
  "4:3": "横版 4:3",
  "16:9": "宽幅 16:9",
  "9:16": "竖版 9:16",
};

function fallbackShots(modules: string[], lang: string): ShotSpec[] {
  const langNote =
    lang === "en"
      ? "画面文案用简约英文短语"
      : "画面文案用精炼中文营销语";
  return modules.map((m) => {
    const meta = APLUS_MODULES[m] ?? { label: m, hint: "" };
    return {
      role: m,
      label: meta.label,
      ratio: "1:1",
      prompt:
        `在完整保留上传商品(包装、品牌、文字、外观)不变的前提下,生成一张 A+ 详情页模块图:${meta.hint}。` +
        `整图(含文字)由你直接渲染,${langNote},文字排版精美、清晰无错别字,高级商业视觉,层次分明、留白得当。`,
    };
  });
}

// 第 0 层:视觉 LLM 按勾选模块规划提示词。失败回退蓝图。
async function planShots(
  client: OpenAI,
  firstImage: { buf: Buffer; type: string },
  extra: string,
  platform: string,
  lang: string,
  format: string,
  modules: string[],
  textModel: string
): Promise<ShotSpec[]> {
  try {
    const dataUrl = await toVisionDataUrl(firstImage.buf, firstImage.type);
    const moduleDesc = modules
      .map((m) => `- ${m}:${APLUS_MODULES[m]?.label ?? m}(${APLUS_MODULES[m]?.hint ?? ""})`)
      .join("\n");
    const sys =
      "你是资深电商 A+ 详情页设计师。看懂上传商品(品类、卖点、人群、场景)后," +
      `为下列每个模块各写一条「给图生图模型直接出整图(含文字)」的完整提示词。平台风格:${PLATFORM_LABELS[platform] ?? "通用电商"}。` +
      "每条提示词必须:①以『在完整保留上传商品(包装/品牌/文字/外观)不变的前提下』开头;" +
      "②写清画面内容、构图与版式;③写出要渲染的具体文案(与商品相关,不套空话),文字清晰无错别字;" +
      "④语言要求:" + (lang === "en" ? "画面文案全英文,简洁专业。" : lang === "zh" ? "画面文案全中文。" : "文案语言跟随平台习惯。") +
      "⑤版式比例:" + (RATIO_DESC[format] ?? RATIO_DESC["aplus-web"]) + ";" +
      '只输出 JSON:{"shots":[{"module","label","prompt"}...]},shots 数量与模块一一对应、顺序一致。';
    const user =
      `模块列表:\n${moduleDesc}\n` +
      (extra ? `商品补充信息:${extra}\n` : "") +
      "请规划这套 A+ 详情页。";
    const resp = await client.chat.completions.create({
      model: textModel,
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            { type: "text", text: user },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 3000,
    });
    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      shots?: { module?: string; label?: string; prompt?: string }[];
    };
    const byKey = new Map<string, { label: string; prompt: string }>();
    for (const s of parsed.shots ?? []) {
      if (s.module && s.prompt) {
        byKey.set(s.module, { label: s.label || APLUS_MODULES[s.module]?.label || s.module, prompt: s.prompt });
      }
    }
    // 严格按勾选模块顺序输出,缺的用蓝图补
    return modules.map((m) => {
      const hit = byKey.get(m);
      if (hit) return { role: m, label: hit.label, ratio: "1:1", prompt: hit.prompt };
      return fallbackShots([m], lang)[0];
    });
  } catch {
    return fallbackShots(modules, lang);
  }
}

// 部分 OpenAI 兼容网关会拦截 openai-js SDK 构造的 images.edit multipart，
// 但接受标准原生 FormData。这里直接按官方字段提交，并兼容单图 image / 多图 image[]。
async function editImagesMultipart(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  images: { buf: Buffer; type: string }[],
  size: "1024x1024" | "1536x1024" | "1024x1536"
): Promise<Buffer> {
  const form = new FormData();
  const field = images.length === 1 ? "image" : "image[]";
  images.forEach((image, index) => {
    form.append(
      field,
      new Blob([new Uint8Array(image.buf)], {
        type: image.type || "image/png",
      }),
      `product-${index + 1}.${image.type.includes("jpeg") ? "jpg" : "png"}`
    );
  });
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", size);
  form.append("quality", imageOperationQuality(process.env.OPENAI_IMAGE_QUALITY || "medium"));
  appendImageGatewayFields(form, model);
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(PER_SHOT_TIMEOUT),
  });
  const raw = await response.text();
  if (!response.ok) {
    let detail = raw.slice(0, 500);
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
      detail =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error?.message || detail;
    } catch {
      /* keep compact raw detail */
    }
    throw Object.assign(new Error(`${response.status} ${detail}`), { status: response.status });
  }
  const parsed = JSON.parse(raw) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const output = parsed.data?.[0];
  if (output?.b64_json) return Buffer.from(output.b64_json, "base64");
  if (output?.url) {
    const download = await fetch(output.url);
    if (!download.ok) throw new Error(`图片下载失败 ${download.status}`);
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error("图片接口为空返回");
}

async function editWithSelectedProvider(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  images: { buf: Buffer; type: string }[],
  size: "1024x1024" | "1536x1024" | "1024x1536"
) {
  const descriptor = await resolveImageModel(model);
  if (descriptor?.provider === "new-api-flow") {
    const result = await generateNewApiImage({
      model,
      prompt,
      images: images.map((image) => ({
        buffer: image.buf,
        mimeType: image.type || "image/png",
      })),
    });
    return result.buffer;
  }
  return editImagesMultipart(apiKey, baseUrl, model, prompt, images, size);
}

// 生成一张,返回 PNG buffer(与套图同管线)。
async function genOneShot(
  apiKey: string,
  baseUrl: string,
  model: string,
  spec: ShotSpec,
  productImages: { buf: Buffer; type: string }[],
  size: "1024x1024" | "1536x1024" | "1024x1536"
): Promise<Buffer> {
  let images = productImages;
  let prompt = spec.prompt;
  const descriptor = await resolveImageModel(model);
  // 兼容网关可能忽略 size、转而沿用第一张参考图纵横比。横版 A+ 先放一张无内容
  // 的横版画布锚点，商品白底图随后提交；提示词明确锚点不是商品，避免模型画出空卡片。
  if (size === "1536x1024" && descriptor?.provider !== "new-api-flow") {
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp");
    } & typeof import("sharp");
    const sharp = mod.default ?? mod;
    const anchor = await sharp({
      create: {
        width: 1536,
        height: 1024,
        channels: 3,
        background: { r: 248, g: 250, b: 252 },
      },
    })
      .png()
      .toBuffer();
    images = [{ buf: anchor, type: "image/png" }, ...productImages];
    prompt =
      "第一张输入图仅用于锁定 3:2 横版画布比例，不是商品，也不要把空白画布画成卡片；" +
      "后续输入图才是必须保持一致的白底商品参考。最终输出必须为横版 A+ 模块。" +
      spec.prompt;
  }
  return editWithSelectedProvider(
    apiKey,
    baseUrl,
    model,
    prompt,
    images,
    size
  );
}

// A+ 生成前先把每张实拍图清理成独立白底母图。这样后续多图参考里不会把办公桌、
// 风扇、手部等环境杂物误学进详情图，也能让正面/侧面/背面三个视角保持一致。
async function prepareWhiteSource(
  apiKey: string,
  baseUrl: string,
  model: string,
  image: { buf: Buffer; type: string },
  feedback = ""
): Promise<Buffer> {
  const basePrompt =
    "精确提取上传照片中的单个商品主体，移除背景、桌面、人物、手、风扇、电脑、零食及所有杂物，" +
    "放置在纯白色无缝电商摄影背景上。完整保留商品真实瓶型、比例、透明材质、瓶盖、现有品牌字样、" +
    "标签布局、条码或背标视角，不翻译、不改写、不新增包装文字。商品竖直居中、全貌完整、四周留白，" +
    "仅添加自然柔和的浅灰接触阴影。不得增加道具、底座、边框、文案、水印或第二个商品。";
  const prompt = feedback
    ? `${basePrompt}\n本次返工必须重点满足用户要求：${feedback.slice(0, 500)}`
    : basePrompt;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= 0; attempt++) {
    try {
      return await editWithSelectedProvider(
        apiKey,
        baseUrl,
        model,
        prompt,
        [image],
        "1024x1536"
      );
    } catch (e) {
      lastError = e;
      if (attempt < SOURCE_RETRIES) {
        await new Promise((r) => setTimeout(r, 2200 * 2 ** attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("白底母图生成失败");
}

async function persistOne(buf: Buffer, id: string): Promise<string> {
  if (!storageEnabled) {
    return `data:image/png;base64,${buf.toString("base64")}`;
  }
  try {
    return await uploadImage(new Uint8Array(buf), "image/png", `aplus/${id}.png`);
  } catch {
    return `data:image/png;base64,${buf.toString("base64")}`;
  }
}

type SourceRevision = {
  version: number;
  feedback: string;
  url: string;
  createdAt: number;
};

// --- Durable job store, including review inputs and checkpoints ---
type Job = {
  imageQuality?: string;
  status: "pending" | "awaiting_review" | "done" | "error";
  stage: "preparing" | "reviewing" | "generating";
  sources: SourceResult[];
  sourceInputs: { buf: Buffer; type: string }[];
  sourceBuffers: (Buffer | null)[];
  sourceHistory: SourceRevision[][];
  shots: ShotResult[];
  done: number;
  total: number;
  extra: string;
  platform: string;
  lang: string;
  format: string;
  modules: string[];
  email: string;
  model: string;
  textModel: string;
  useDb: boolean;
  cost: number;
  generationStarted: boolean;
  reserved: boolean;
  renderingFinished?: boolean;
  parentId: string;
  parentIds: string[];
  origin: string;
  user?: Awaited<ReturnType<typeof getUser>>;
  creditsUsed?: number;
  error?: string;
  createdAt: number;
};
const JOBS = new DurableImageJobs<Job>("aplus");
async function patchJob(jobId: string, patch: Partial<Job>) { await JOBS.patch(jobId, patch); }

async function runSourcePreparation(jobId: string) {
  const job = await JOBS.get(jobId);
  if (!job) return;
  try {
    const { apiKey } = await getOpenAISettings();
    const baseUrl = (await getOpenAIBaseUrl()) || "https://api.openai.com/v1";
    for (let index = 0; index < job.sourceInputs.length; index++) {
      if (job.sourceBuffers[index]) continue;
      try {
        const buf = await JOBS.paidOperation(jobId, job.model, { id: `${jobId}:source:${index}:initial`, quality: job.imageQuality, task: "product", preserveIdentity: true }, () => prepareWhiteSource(
          apiKey,
          baseUrl,
          job.model,
          job.sourceInputs[index]
        ));
        const id = job.sources[index].id;
        job.sourceBuffers[index] = buf;
        const url = await persistOne(buf, `sources/${id}-v1`);
        job.sources[index] = {
          ...job.sources[index],
          status: "review",
          url,
          version: 1,
          error: undefined,
        };
        job.sourceHistory[index].push({
          version: 1,
          feedback: "首次提取",
          url,
          createdAt: Date.now(),
        });
        await patchJob(jobId, {
          sources: [...job.sources],
          sourceBuffers: [...job.sourceBuffers],
          sourceHistory: [...job.sourceHistory],
        });
      } catch (e) {
        if (e instanceof ImageOperationPending) throw e;
        job.sources[index] = {
          ...job.sources[index],
          status: "error",
          error: safeError(e, "白底母图生成失败，可单独重做"),
        };
        await patchJob(jobId, { sources: [...job.sources] });
      }
    }
    await patchJob(jobId, { status: "awaiting_review", stage: "reviewing" });
  } catch (e) {
    if (e instanceof ImageOperationPending) { await patchJob(jobId, { status: "pending", error: e.message }); return; }
    await patchJob(jobId, {
      status: "error",
      error: safeError(e, "白底母图准备失败，请重新上传"),
    });
  }
}

async function runSourceRedo(jobId: string, index: number, feedback: string) {
  const job = await JOBS.get(jobId);
  if (!job) return;
  try {
    const { apiKey } = await getOpenAISettings();
    const baseUrl = (await getOpenAIBaseUrl()) || "https://api.openai.com/v1";
    const buf = await JOBS.paidOperation(jobId, job.model, { id: job.sources[index].redoOperationId || `${jobId}:source:${index}:redo:${job.sources[index].version + 1}`, quality: job.imageQuality, task: "product", preserveIdentity: true }, () => prepareWhiteSource(
      apiKey,
      baseUrl,
      job.model,
      job.sourceInputs[index],
      feedback
    ));
    const version = job.sources[index].version + 1;
    const id = job.sources[index].id;
    job.sourceBuffers[index] = buf;
    const url = await persistOne(buf, `sources/${id}-v${version}`);
    job.sources[index] = {
      ...job.sources[index],
      status: "review",
      url,
      version,
      feedback,
      error: undefined,
    };
    job.sourceHistory[index].push({ version, feedback, url, createdAt: Date.now() });
    await patchJob(jobId, {
      sources: [...job.sources],
      sourceBuffers: [...job.sourceBuffers],
      sourceHistory: [...job.sourceHistory],
    });
  } catch (e) {
    if (e instanceof ImageOperationPending) { await patchJob(jobId, { error: e.message }); return; }
    job.sources[index] = {
      ...job.sources[index],
      status: "error",
      feedback,
      error: safeError(e, "本张母图重做失败，请再次尝试"),
    };
    await patchJob(jobId, { sources: [...job.sources] });
  }
}

async function runAplusGeneration(jobId: string) {
  const job = await JOBS.get(jobId);
  if (!job) return;
  const set = (patch: Partial<Job>) => patchJob(jobId, patch);
  try {
    const { apiKey } = await getOpenAISettings();
    const client = new OpenAI({
      apiKey,
      baseURL: (await getOpenAIBaseUrl()) || undefined,
      timeout: PER_SHOT_TIMEOUT,
      maxRetries: 0,
    });
    const baseUrl = (await getOpenAIBaseUrl()) || "https://api.openai.com/v1";
    const cleanImages = job.sourceBuffers.map((buf) => ({
      buf: buf!,
      type: "image/png",
    }));
    const size = sizeFor(job.format);
    const specs = job.shots.length ? job.shots : await planShots(
      client,
      cleanImages[0],
      job.extra,
      job.platform,
      job.lang,
      job.format,
      job.modules,
      job.textModel
    );
    const shots: ShotResult[] = specs.map((s, i) => ({
      ...s,
      id: job.shots[i]?.id || `aplus-${jobId}-${i}`,
      status: job.shots[i]?.status || "pending",
      url: job.shots[i]?.url,
      gradient: GRADIENTS[i % GRADIENTS.length],
    }));
    await set({ shots: [...shots], total: shots.length });

    let cursor = 0;
    let doneCount = 0;
    let gatewayPending: ImageOperationPending | undefined;
    const worker = async (): Promise<void> => {
      while (cursor < shots.length) {
        if (job.useDb && job.reserved) {
          await touchReservation(jobId).catch(() => {});
        }
        const idx = cursor++;
        const shot = shots[idx];
        if ((shot.status === "done" && shot.url) || job.renderingFinished) { doneCount++; continue; }
        let ok = false;
        for (let attempt = 0; attempt <= (isImageGatewayModel(job.model) ? SHOT_RETRIES : 0) && !ok; attempt++) {
          try {
            const buf = await JOBS.paidOperation(jobId, job.model, { id: shot.id, quality: job.imageQuality, task: "layout", preserveIdentity: true, textAccuracy: "required" }, () => genOneShot(
              apiKey,
              baseUrl,
              job.model,
              shot,
              cleanImages,
              size
            ));
            const url = await persistOne(buf, shot.id);
            shots[idx] = { ...shot, status: "done", url };
            ok = true;
          } catch (error) {
            if (error instanceof ImageOperationPending) { gatewayPending = error; break; }
            if (attempt < SHOT_RETRIES) {
              const wait =
                Math.min(18000, 2500 * 2 ** attempt) +
                Math.floor(Math.random() * 1500);
              await new Promise((r) => setTimeout(r, wait));
            }
          }
        }
        if (!ok) shots[idx] = { ...shot, status: gatewayPending ? "pending" : "error" };
        doneCount++;
        await set({ shots: [...shots], done: doneCount });
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, shots.length) }, worker)
    );

    if (gatewayPending) throw gatewayPending;
    await set({ renderingFinished: true });
    const okShots = shots.filter((s) => s.status === "done" && s.url);

    let user: Awaited<ReturnType<typeof getUser>> = null;
    if (job.useDb) {
      const failed = shots.length - okShots.length;
      const refund = failed > 0
        ? Math.round((job.cost / shots.length) * failed)
        : 0;
      if (okShots.length > 0) {
      const batchId = jobId;
        await addArtworks(
          job.email,
          okShots.map((s) => ({
            id: s.id,
            title: `A+·${s.label}`,
            category: "detail",
            prompt: "",
            status: "completed",
            image: s.url!,
            gradient: s.gradient,
            style: null,
            ratio: job.format === "1:1" ? "1:1" : size === "1024x1536" ? "2:3" : "3:2",
            resolution: "1K",
            source: "detail",
            parentId: job.parentId || null,
            parentIds: job.parentIds,
            origin: job.origin || null,
          })),
          batchId
        );
      }
      await JOBS.settle(jobId, job.cost - refund, `A+ 详情页 ${okShots.length} 张`);
      user = await getUser(job.email).catch(() => null);
    }


    await set({
      status: "done",
      shots: [...shots],
      done: shots.length,
      user,
      creditsUsed: Math.round((job.cost / shots.length) * okShots.length),
      reserved: false,
    });
  } catch (e) {
    if (e instanceof ImageOperationPending) { await set({ status: "pending", error: e.message }); return; }
    if ((await JOBS.get(jobId, false))?.shots.some((shot) => shot.status === "done")) throw e;
    if (job.useDb) await JOBS.settle(jobId, 0, "详情页生成失败");
    console.error("[aplus] job failed:", e instanceof Error ? e.message : e);
    await set({
      status: "error",
      reserved: false,
      error: safeError(e, "A+ 详情页生成失败,请稍后重试"),
    });
  }
}

async function parseInput(request: Request) {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const prepared = (f.get("prepared") ?? "").toString() === "1";
  const images: { buf: Buffer; type: string }[] = [];
  for (const file of f.getAll("image")) {
    if (file instanceof File && file.size > 0) {
      images.push({
        buf: Buffer.from(await file.arrayBuffer()),
        type: file.type || "image/png",
      });
    }
    if (images.length >= (prepared ? 6 : 3)) break;
  }
  const rawModules = (f.getAll("module") as string[]).map((m) => m.trim());
  const modules = Array.from(new Set(rawModules)).filter((m) => APLUS_MODULES[m]);
  return {
    images,
    extra: (f.get("text") ?? "").toString().trim().slice(0, 600),
    platform: (f.get("platform") ?? "amazon").toString().trim().slice(0, 20),
    lang: (f.get("lang") ?? "auto").toString().trim().slice(0, 10),
    format: (() => {
      const v = (f.get("format") ?? "aplus-web").toString().trim();
      return ["aplus-web", "aplus-mobile", "aplus-basic", "1:1", "4:3", "16:9", "9:16"].includes(v)
        ? v
        : "aplus-web";
    })(),
    modules: modules.length > 0 ? modules : ["hero", "selling", "scene", "angles"],
    email: (f.get("email") ?? "").toString().trim(),
    prepared,
    parentId: (f.get("parentId") ?? "").toString().trim(),
    parentIds: (() => {
      try {
        const value = JSON.parse((f.get("parentIds") ?? "[]").toString());
        return Array.isArray(value)
          ? value.map(String).map((id) => id.trim()).filter(Boolean).slice(0, 5)
          : [];
      } catch {
        return [];
      }
    })(),
    origin: (f.get("origin") ?? "").toString().trim() === "canvas" ? "canvas" : "",
    model: (f.get("model") ?? "").toString().trim(),
  };
}

async function kickAplus(id: string) {
  await JOBS.kick(id, async (_payload, job) => {
    if (!job.imageQuality) { await patchJob(id, { imageQuality: process.env.OPENAI_IMAGE_QUALITY || "medium" }); }
    if (job.stage === "preparing") await runSourcePreparation(id);
    else if (job.stage === "generating") await runAplusGeneration(id);
    else for (let index=0; index<job.sources.length; index++) {
      if (job.sources[index].status === "redoing") await runSourceRedo(id, index, job.sources[index].feedback || "");
    }
  });
}

export async function POST(request: Request) {
  if (imageWorkerAuthorized(request)) {
    const body = await request.json();
    if (typeof body.workerJobId !== "string") return NextResponse.json({ error: "无效任务" }, { status: 400 });
    await kickAplus(body.workerJobId);
    return NextResponse.json({ ok: true });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | { jobId?: string; action?: string; sourceIndex?: number; feedback?: string }
      | null;
    const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
    if (dbEnabled) {
      const tokenEmail=await resolveUserEmail(request);
      const owner=await JOBS.owner(jobId);
      if (!tokenEmail || owner!==tokenEmail.toLowerCase()) return NextResponse.json({error:"无权操作此任务"},{status:403});
    }
    const job = await JOBS.get(jobId,false);
    if (!job) return NextResponse.json({error:"任务不存在，请重新上传"},{status:404});

    if (body?.action === "approve_source") {
      const index = Number(body.sourceIndex);
      const source = job.sources[index];
      if (job.stage !== "reviewing" || !source?.url || !job.sourceBuffers[index]) {
        return NextResponse.json({ error: "这张母图当前无法通过" }, { status: 409 });
      }
      if (source.status === "redoing") {
        return NextResponse.json({ error: "这张母图正在重做" }, { status: 409 });
      }
      try {
        if(job.useDb) {
          const updated=await JOBS.reviewSource(jobId,index,false);
          return NextResponse.json({ok:true,source:updated});
        }
        job.sources[index]={...source,status:"approved",error:undefined};
        await patchJob(jobId,{sources:[...job.sources]});
        return NextResponse.json({ok:true,source:job.sources[index]});
      } catch(error) {return NextResponse.json({error:safeError(error,"审核保存失败，请重试")},{status:409});}

    }

    if (body?.action === "redo_source") {
      const index = Number(body.sourceIndex);
      const source = job.sources[index];
      const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0,500) : "";
      if (job.stage !== "reviewing" || !source || source.status === "redoing") {
        return NextResponse.json({ error: "这张母图当前无法重做" }, { status: 409 });
      }
      if (!feedback) {
        return NextResponse.json({ error: "请填写本张图片的重做要求" }, { status: 400 });
      }
      const ip = clientIp(request);
      if (!rateLimit(`aplus-redo:${jobId}:${ip}`, 12, 600_000)) {
        return NextResponse.json({ error: "重做过于频繁，请稍后再试" }, { status: 429 });
      }
      try {
        if(job.useDb) await JOBS.reviewSource(jobId,index,true,feedback);
        else {
          job.sources[index]={...source,status:"redoing",feedback,redoOperationId:`${jobId}:redo:${crypto.randomUUID()}`,error:undefined};
          await patchJob(jobId,{sources:[...job.sources]});
        }
        await kickAplus(jobId).catch(error=>console.error("[image-job] deferred kickoff:",error instanceof Error ? error.message : "unknown"));
        return NextResponse.json({ok:true});
      } catch(error) {return NextResponse.json({error:safeError(error,"重做保存失败，请重试")},{status:409});}

    }

    if (body?.action === "generate") {
      if (job.stage !== "reviewing" || job.generationStarted) {
        return NextResponse.json({ error: "任务已进入生成阶段" }, { status: 409 });
      }
      if (
        job.sources.some((source) => source.status !== "approved") ||
        job.sourceBuffers.some((buf) => !buf)
      ) {
        return NextResponse.json(
          { error: "请先通过全部白底母图" },
          { status: 409 }
        );
      }
      try {
        if (job.useDb) await JOBS.reserveReviewed(jobId);
        else await patchJob(jobId, { generationStarted:true, reserved:true, status:"pending", stage:"generating" });
        await kickAplus(jobId).catch(error=>console.error("[image-job] deferred kickoff:",error instanceof Error ? error.message : "unknown"));
      } catch (error) {
        return NextResponse.json({ error: safeError(error, "任务启动失败，请稍后重试") }, { status: 409 });
      }
      return NextResponse.json({ ok: true, jobId, total: job.modules.length, cost: job.cost });
    }

    return NextResponse.json({ error: "不支持的任务操作" }, { status: 400 });
  }

  const input = await parseInput(request).catch(() => null);
  if (!input || input.images.length === 0) {
    return NextResponse.json({ error: "请上传至少一张商品图" }, { status: 400 });
  }
  if (input.images.some((im) => im.buf.length > 12 * 1024 * 1024)) {
    return NextResponse.json(
      { error: "单张上传图片过大（请 < 12MB）" },
      { status: 400 }
    );
  }

  const { model: defaultModel } = await getOpenAISettings();
  const model = input.model || defaultModel;
  const imageModel = (await getImageModelCatalog()).find((item) => item.id === model);
  if (!imageModel) {
    return NextResponse.json(
      { error: "所选生图模型不可用，请刷新模型列表后重试" },
      { status: 400 }
    );
  }
  if (!imageModel.supportsEdit) {
    return NextResponse.json(
      { error: "详情图生成需要支持参考图的生图模型" },
      { status: 400 }
    );
  }
  const ip = clientIp(request);
  if (!rateLimit(`aplus:${ip}`, 8, 600_000)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  if (dbEnabled) {
    const tokenEmail = await resolveUserEmail(request);
    if (!tokenEmail) {
      return NextResponse.json({ error: "请先登录后再生成" }, { status: 401 });
    }
    input.email = tokenEmail;
  }
  const useDb = dbEnabled && input.email.length > 0;
  const cost = input.modules.length * POINTS_PER_IMAGE;

  if (input.prepared && useDb) {
    const lineageIds = Array.from(
      new Set([input.parentId, ...input.parentIds].filter(Boolean))
    );
    const owned = await listArtworksByIds(input.email, lineageIds).catch(() => []);
    if (!input.parentId || owned.length !== lineageIds.length) {
      return NextResponse.json(
        { error: "参考节点不存在或无权访问" },
        { status: 400 }
      );
    }
    const groups = new Set(owned.map((artwork) => artwork.groupId || artwork.id));
    if (groups.size !== 1) {
      return NextResponse.json(
        { error: "详情图参考只能来自同一画布项目" },
        { status: 400 }
      );
    }
  }

  if (dbEnabled && (await isBanned(input.email, ip))) {
    return NextResponse.json(
      { error: "账号或 IP 已被封禁，请联系管理员" },
      { status: 403 }
    );
  }
  if (useDb) {
    const account = await getUser(input.email).catch(() => null);
    const balance = account
      ? account.creditsTotal - account.creditsUsed
      : 0;
    if (account && balance < cost) {
      return NextResponse.json({ error: insufficientCreditsMessage }, { status: 402 });
    }
  }

  const jobId = `aplus-${crypto.randomUUID()}`;
  const now = Date.now();
  try {
  await JOBS.create(jobId, input.email, {
    status: "pending",
    stage: input.prepared ? "generating" : "preparing",
    imageQuality: process.env.OPENAI_IMAGE_QUALITY || "medium",
    sources: input.images.map((_, index) => ({
      id: `aplus-source-${now}-${index}`,
      label: input.prepared ? `参考图 ${index + 1}` : `白底母图 ${index + 1}`,
      status: input.prepared ? "approved" : "preparing",
      version: input.prepared ? 1 : 0,
    })),
    sourceInputs: input.images,
    sourceBuffers: input.prepared ? input.images.map((image) => image.buf) : input.images.map(() => null),
    sourceHistory: input.images.map(() => []),
    shots: [],
    done: 0,
    total: input.modules.length,
    extra: input.extra,
    platform: input.platform,
    lang: input.lang,
    format: input.format,
    modules: input.modules,
    email: input.email,
    model,
    textModel: requestedTextModel(request, process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna"),
    useDb,
    cost,
    generationStarted: input.prepared,
    reserved: input.prepared,
    parentId: input.parentId,
    parentIds: input.parentIds.filter((id) => id !== input.parentId),
    origin: input.origin,
    createdAt: now,
  }, {}, cost, input.prepared);
  } catch(error) {
    const message=error instanceof Error ? error.message : "";
    return NextResponse.json({error:safeError(error,"任务保存失败，请稍后重试")},{status:message.includes("积分不足") ? 402 : 503});
  }
  await kickAplus(jobId).catch(error=>console.error("[image-job] deferred kickoff:",error instanceof Error ? error.message : "unknown"));

  return NextResponse.json({
    jobId,
    total: input.modules.length,
    cost,
    next: input.prepared ? "generating" : "review_sources",
  });
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("active")) {
    const email = await resolveUserEmail(request);
    if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    return NextResponse.json({ jobs: await JOBS.active(email) });
  }
  const jobId = new URL(request.url).searchParams.get("job");
  if (!jobId) {
    const { apiKey } = await getOpenAISettings();
    return NextResponse.json({
      status: "ok",
      ready: !!apiKey,
      db: dbEnabled,
      storage: storageEnabled,
    });
  }
  const job = await JOBS.get(jobId, false);
  if (!job) {
    return NextResponse.json({
      status: "error",
      error: "任务不存在或已过期，请重试",
    });
  }
  if (job.useDb) {
    const tokenEmail = await resolveUserEmail(request);
    if (!tokenEmail || tokenEmail.toLowerCase() !== job.email.toLowerCase()) {
      return NextResponse.json({ error: "无权查看此任务" }, { status: 403 });
    }
  }
  const shots = job.shots.map((s) => ({
    id: s.id,
    role: s.role,
    label: s.label,
    ratio: s.ratio,
    status: s.status,
    url: s.url ?? null,
    gradient: s.gradient,
  }));
  return NextResponse.json({
    jobId,
    status: job.status,
    stage: job.stage,
    parameters: { platform:job.platform, lang:job.lang, format:job.format, text:job.extra, modules:job.modules },
    sources: job.sources.map((source, index) => ({
      ...source,
      history: job.sourceHistory[index],
    })),
    done: job.done,
    total: job.total,
    shots,
    user: job.status === "done" ? job.user : undefined,
    creditsUsed: job.status === "done" ? job.creditsUsed : undefined,
    error: job.error,
  });
}
