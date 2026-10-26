import "server-only";
import { exactImageRequestSize, imageRatioMismatch } from "@/lib/imagegen/request-size";
import { sourceImageDimensions } from "@/lib/imagegen/output-shape";
import { modelAwareOpenAI, managedImageEditFetch } from "@/lib/model-config/clients";
import { observeOpenAI } from "@/lib/bi/model-calls";
import { withQualityFallback, auditSettledImage } from "@/lib/image-quality-request";
import type { ResolvedImageQuality, ExecutedQuality } from "@/lib/image-quality";
import { DurableImageJobs } from "@/lib/image-jobs/runtime";
import { appendImageGatewayFields, imageOperationQuality, ImageOperationPending, isImageGatewayModel } from "@/lib/image-gateway";
import { toVisionDataUrl } from "@/lib/vision-image";
import OpenAI from "openai";
import { safeError } from "@/lib/api-error";
import { getImageJobChargedCredits } from "@/lib/billing/cost-audit-repository";
import { touchReservation } from "@/lib/billing/reservations";
import { addArtworks } from "@/lib/artworks/writer";
import { getUser } from "@/lib/accounts/session";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { resolveImageModel } from "@/lib/image-model-catalog";
import { generateNewApiImage } from "@/lib/new-api-image";

type ShotRole = string;

type ShotSpec = {
  role: ShotRole;
  label: string;
  ratio: string;
  prompt: string;
};

type ShotResult = ShotSpec & {
  width?: number;
  height?: number;
  frameError?: string;
  quality?: ResolvedImageQuality;
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

function ratioFor(format: string): string {
  return format === "aplus-mobile" ? "2:3" : format.startsWith("aplus-") ? "3:2" : format;
}

function sizeFor(format: string, model = "", exact = false, customRatio = false): string {
  if (!exact) {
    if (format === "1:1") return "1024x1024";
    if (format === "9:16" || format === "aplus-mobile") return "1024x1536";
    return "1536x1024";
  }
  const ratio = ratioFor(format), native = exactImageRequestSize(ratio, model, customRatio);
  if (native) return native;
  if (ratio === "auto") return "auto";
  const [w, h] = ratio.split(":").map(Number);
  return w === h ? "1024x1024" : w < h ? "1024x1536" : "1536x1024";
}

const RATIO_DESC: Record<string, string> = {
  "aplus-web": "高级 A+ 横版模块(约 3:2),构图舒展,适合 Web 端详情页",
  "aplus-mobile": "高级 A+ 移动端竖版模块(约 2:3),信息纵向排布",
  "aplus-basic": "标准(普通)A+ 横版模块(约 3:2),按平台基础 A+ 规范,简洁合规",
  "1:1": "正方形(1:1)",
  "4:3": "横版 4:3",
  "16:9": "宽幅 16:9",
  "9:16": "竖版 9:16",
  "3:4": "竖版 3:4", "2:3": "竖版 2:3", "3:2": "横版 3:2",
  "4:5": "竖版 4:5", "5:4": "横版 5:4", "1:2": "竖版 1:2",
  "2:1": "横版 2:1", "21:9": "宽幅 21:9", "auto": "沿用第一张商品参考图的画幅比例",
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

async function editImagesMultipart(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  images: { buf: Buffer; type: string }[],
  size: string
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
  const response = await managedImageEditFetch(baseUrl, apiKey, form, AbortSignal.timeout(PER_SHOT_TIMEOUT));
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
  size: string
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

async function genOneShot(
  apiKey: string,
  baseUrl: string,
  model: string,
  spec: ShotSpec,
  productImages: { buf: Buffer; type: string }[],
  size: string,
  exactFrame = false
): Promise<Buffer> {
  let images = productImages;
  let prompt = exactFrame ? `最终画幅比例：${spec.ratio === "auto" ? "沿用第一张商品参考图" : spec.ratio}。完整保留主体和四边内容，不裁切、不拉伸。${spec.prompt}` : spec.prompt;
  const descriptor = await resolveImageModel(model);
  // 仅历史任务保留旧锚点契约；新版直接传精确 size，不额外占用参考图名额。
  // 兼容网关可能忽略 size、转而沿用第一张参考图纵横比。横版 A+ 先放一张无内容
  // 的横版画布锚点，商品白底图随后提交；提示词明确锚点不是商品，避免模型画出空卡片。
  if (!exactFrame && size === "1536x1024" && descriptor?.provider !== "new-api-flow") {
    const [width, height] = size.split("x").map(Number);
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp");
    } & typeof import("sharp");
    const sharp = mod.default ?? mod;
    const anchor = await sharp({
      create: {
        width,
        height,
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

type Job = {
  quality?: ResolvedImageQuality;
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
  frameVersion?: 1 | 2;
  frameError?: string;
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
  entry?: string;
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
        const quality: ResolvedImageQuality = { ...(job.quality ?? { requested: "medium", executed: (job.imageQuality || "medium") as ExecutedQuality, fallbackReason: null }) };
        const buf = await withQualityFallback(quality, executed => JOBS.paidOperation(jobId, job.model, { id: job.quality ? `${jobId}:source:${index}:initial:quality:${executed}` : `${jobId}:source:${index}:initial`, quality: executed, task: "product", preserveIdentity: true }, () => prepareWhiteSource(
          apiKey,
          baseUrl,
          job.model,
          job.sourceInputs[index]
        )), job.model);
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
    if (e instanceof ImageOperationPending) { await JOBS.handlePending(jobId, e); return; }
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
    const quality: ResolvedImageQuality = { ...(job.quality ?? { requested: "medium", executed: (job.imageQuality || "medium") as ExecutedQuality, fallbackReason: null }) };
    const buf = await withQualityFallback(quality, executed => JOBS.paidOperation(jobId, job.model, { id: job.quality ? `${(job.sources[index].redoOperationId || `${jobId}:source:${index}:redo:${job.sources[index].version + 1}`)}:quality:${executed}` : (job.sources[index].redoOperationId || `${jobId}:source:${index}:redo:${job.sources[index].version + 1}`), quality: executed, task: "product", preserveIdentity: true }, () => prepareWhiteSource(
      apiKey,
      baseUrl,
      job.model,
      job.sourceInputs[index],
      feedback
    )), job.model);
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
    if (e instanceof ImageOperationPending) { await JOBS.handlePending(jobId, e); return; }
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
    const client = observeOpenAI(modelAwareOpenAI({
      apiKey,
      baseURL: (await getOpenAIBaseUrl()) || undefined,
      timeout: PER_SHOT_TIMEOUT,
      maxRetries: 0,
    }));
    const baseUrl = (await getOpenAIBaseUrl()) || "https://api.openai.com/v1";
    const cleanImages = job.sourceBuffers.map((buf) => ({
      buf: buf!,
      type: "image/png",
    }));
    const size = sizeFor(job.format, job.model, !!job.frameVersion, job.frameVersion === 2);
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
      ...(!!job.frameVersion && job.shots[i]?.status !== "done" ? { ratio: ratioFor(job.format) } : {}),
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
            const quality: ResolvedImageQuality = { ...(job.quality ?? { requested: "medium", executed: (job.imageQuality || "medium") as ExecutedQuality, fallbackReason: null }) };
            const buf = await withQualityFallback(quality, executed => JOBS.paidOperation(jobId, job.model, { id: job.quality ? `${shot.id}:quality:${executed}` : shot.id, quality: executed, ratio: shot.ratio, task: "layout", preserveIdentity: true, textAccuracy: "required" }, () => genOneShot(
              apiKey,
              baseUrl,
              job.model,
              shot,
              cleanImages,
              size,
              !!job.frameVersion
            )), job.model);
            // Preserve provider bytes. A mismatch is reported, never cropped or regenerated.
            const dimensions = !!job.frameVersion ? await sourceImageDimensions(buf).catch(() => undefined) : undefined;
            const frameError = !!job.frameVersion ? imageRatioMismatch(ratioFor(job.format), dimensions || {}) : undefined;
            const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
            const divisor = dimensions ? gcd(dimensions.width, dimensions.height) : 0;
            const actualRatio = dimensions && divisor ? `${dimensions.width / divisor}:${dimensions.height / divisor}` : shot.ratio;
            const url = await persistOne(buf, shot.id);
            shots[idx] = { ...shot, ...dimensions, ratio: actualRatio, frameError, status: "done", url, quality };
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
            creationProvenance: { version: 1, operation: "aplus", entry: job.origin === "canvas" ? "canvas" : job.entry || "toolbox", ref: jobId, evidence: "server-route" },
            prompt: "",
            status: "completed",
            image: s.url!,
            gradient: s.gradient,
            style: null,
            ratio: !!job.frameVersion ? s.ratio : job.format === "1:1" ? "1:1" : size === "1024x1536" ? "2:3" : "3:2",
            ...(!!job.frameVersion ? { width: s.width, height: s.height } : {}),
            resolution: "1K",
            source: "detail",
            parentId: job.parentId || null,
            parentIds: job.parentIds,
            origin: job.origin || null,
          })),
          batchId
        );
      }
      await JOBS.settleResults(jobId, job.cost - refund, `A+ 详情页 ${okShots.length} 张`,{state:"succeeded",items:shots.map(shot=>({id:shot.id,state:shot.status==="done"?"succeeded":"failed",executedQuality:shot.quality?.executed||job.imageQuality||"medium"}))});
      user = await getUser(job.email).catch(() => null);
    }


    const committedCharge = await getImageJobChargedCredits(jobId);
    for (const shot of okShots) await auditSettledImage(job.email, committedCharge / okShots.length,
      shot.quality || job.quality || {requested: "medium", executed: "medium", fallbackReason: null}, jobId, shot.id);

    await set({
      status: "done",
      shots: [...shots],
      done: shots.length,
      user,
      creditsUsed: committedCharge,
      frameError: !!job.frameVersion ? shots.find(shot => shot.frameError)?.frameError : undefined,
      reserved: false,
    });
  } catch (e) {
    if (e instanceof ImageOperationPending) { await JOBS.handlePending(jobId, e); return; }
    if ((await JOBS.get(jobId, false))?.shots.some((shot) => shot.status === "done")) throw e;
    if (job.useDb) await JOBS.settleResults(jobId, 0, "详情页生成失败",{state:"failed",items:[]});
    console.error("[aplus] job failed:", e instanceof Error ? e.message : e);
    await set({
      status: "error",
      reserved: false,
      error: safeError(e, "A+ 详情页生成失败,请稍后重试"),
    });
  }
}

async function kickAplus(id: string) {
  await JOBS.kick(id, async (_payload, job) => {
    if (!job.imageQuality) { await patchJob(id, { imageQuality: process.env.OPENAI_IMAGE_QUALITY || "medium" }); }
    if (job.stage === "preparing") await runSourcePreparation(id);
    else if (job.stage === "generating") await runAplusGeneration(id);
    else {
      for (let index=0; index<job.sources.length; index++) {
        if (job.sources[index].status === "redoing") await runSourceRedo(id, index, job.sources[index].feedback || "");
      }
      // A local defer changes awaiting_review to pending. Read the completed
      // checkpoints, not kickoff's stale sources/status, before pausing again.
      const latest = await JOBS.get(id, false);
      if (latest?.status === "pending" && latest.stage === "reviewing" && !latest.sources.some(source => source.status === "redoing")) {
        await patchJob(id, { status: "awaiting_review" });
      }
    }
  });
}

export {APLUS_MODULES,JOBS,kickAplus,patchJob,ratioFor,sizeFor};
