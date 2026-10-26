import "server-only";
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
import { dbEnabled } from "@/platform/db/pool";
import { addArtworks } from "@/lib/artworks/writer";
import { getUser } from "@/lib/accounts/session";
import { storageEnabled } from "@/lib/object-storage/runtime";
import { uploadImage } from "@/lib/media-upload";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { getSuiteSystem, getSuitePlatformHint } from "@/lib/prompt-config";

type ShotRole = "main" | "sub" | "detail";

type ShotSpec = {
  role: ShotRole;
  label: string;
  ratio: string; // "1:1" | "3:4"
  prompt: string; // 含中文营销文案的完整出图提示词(模型直出整图)
  text?: string; // 该张主标题(展示/归档用)
};

type RequestedShot = {
  role: ShotRole;
  label: string;
  ratio: string;
  instruction?: string;
};

type ShotResult = ShotSpec & {
  quality?: ResolvedImageQuality;
  id: string;
  status: "pending" | "done" | "error";
  url?: string;
  gradient: string;
};

const CONCURRENCY = 2;

const PER_SHOT_TIMEOUT = 240_000;

const SHOT_RETRIES = 3;

const GRADIENTS = [
  "from-rose-100 to-slate-100",
  "from-lime-100 to-emerald-100",
  "from-amber-100 to-orange-100",
  "from-sky-100 to-teal-100",
  "from-emerald-100 to-teal-100",
  "from-stone-100 to-amber-100",
];

function fallbackBlueprint(extra: string): ShotSpec[] {
  const base = extra ? `产品/品牌补充信息：${extra}。` : "";
  const lead =
    "在完整保留上传产品(包装、品牌、文字、外观)不变的前提下，把它合成进一张专业、可直接上架的中国电商营销视觉，整图(含文字)由你直接渲染：";
  const tail =
    "硬性要求：①画面带中文营销大标题与卖点短语，文字排版精美、富有设计感，字体多样有层次——主标题用有质感的艺术字/书法体/衬线体，卖点/说明用清晰黑体；②搭配与该产品品类相关的道具/配件/场景元素与图标点缀，高级氛围背景，层次分明、留白得当，超清商业细节；③文案要贴合产品本身、不要套用与产品无关的维度；④所有中文必须清晰、准确、无错别字、无乱码。风格参考天猫/京东精品详情页。" +
    base;
  const mk = (
    role: ShotRole,
    label: string,
    ratio: string,
    desc: string,
    title: string,
    points: string
  ): ShotSpec => ({
    role,
    label,
    ratio,
    text: title,
    prompt: `${lead}${desc}。主标题文案『${title}』，配套卖点文案『${points}』。${tail}`,
  });
  // 通用兜底(品类无关)。仅在 AI 规划失败时启用;角度与文案保持中性,适配任意产品。
  return [
    mk("main", "营销主图", "1:1", "产品作为画面主体居中，四周搭配与该品类相关的道具/配件点缀，高级渐变氛围背景，顶部放主标题、四周放卖点", "匠心之选", "品质保障·值得信赖"),
    mk("sub", "核心卖点", "1:1", "产品居中，突出该产品最核心的卖点/功能优势，商业海报式背景，配卖点排版", "核心卖点", "实力优势·品质之选"),
    mk("sub", "细节做工", "1:1", "产品关键细节/做工/质感特写，干净高级背景，配细节标注", "细节品质", "做工精良·细节用心"),
    mk("sub", "场景使用", "1:1", "产品放进真实使用场景，自然生活氛围，体现使用方式", "真实场景", "贴合日常·好用"),
    mk("sub", "信任背书", "1:1", "产品 + 资质/规格/售后等信任元素的视觉表达，专业可信背景", "品质保障", "正品·安心"),
    mk("detail", "品牌主视觉", "3:4", "竖版详情首屏，产品大图 + 品牌氛围背景，顶部主标题大字", "品质之作", "用心之选·品质生活"),
    mk("detail", "核心卖点", "3:4", "竖版详情图，聚焦该产品最核心的卖点，大标题与说明排版", "核心优势", "实力·品质"),
    mk("detail", "细节特写", "3:4", "竖版详情图，关键细节/做工/质感的高清特写，配细节说明", "细节之处", "精工·讲究"),
    mk("detail", "材质工艺", "3:4", "竖版详情图，体现产品材质/工艺/品质把控的高级质感画面，配说明", "品质工艺", "用料·考究"),
    mk("detail", "功能演示", "3:4", "竖版详情图，展示该产品的功能/使用/安装方式的图示画面，配步骤文字", "使用方式", "简单·上手"),
    mk("detail", "适用人群", "3:4", "竖版详情图，适用人群/使用场景的生活化画面，配场景文案", "适用人群", "广泛·贴心"),
    mk("detail", "规格包装", "3:4", "竖版详情图，规格参数与包装的简洁展示画面，配参数标注", "规格参数", "标准·规范"),
    mk("detail", "信任售后", "3:4", "竖版详情图，品牌信任/资质/售后的视觉，配背书文案", "正品保障", "认证·售后"),
  ];
}

function fallbackCustomBlueprint(
  extra: string,
  requested: RequestedShot[]
): ShotSpec[] {
  const base = extra ? `产品/品牌补充信息：${extra}。` : "";
  const lead =
    "在完整保留上传产品(包装、品牌、文字、外观)不变的前提下，把它合成进一张专业、可直接上架的电商营销视觉，整图含文字由模型直接渲染：";
  const roleGuide: Record<ShotRole, string> = {
    main: "以产品为绝对主体，完成适合作为 Listing 首图或营销主视觉的清晰构图",
    sub: "围绕一个明确卖点、细节或使用场景完成辅助展示图",
    detail: "完成信息层级清楚的详情页模块，兼顾产品展示与说明排版",
  };
  return requested.map((item) => ({
    role: item.role,
    label: item.label,
    ratio: item.ratio,
    text: item.label,
    prompt: `${lead}${roleGuide[item.role]}。本图主题为『${item.label}』。${
      item.instruction ? `用户对本图的要求：${item.instruction}。` : ""
    }${base}根据产品真实品类选择相关道具、场景与卖点，不臆造产品属性；文字清晰准确，构图完整，产品不得裁切。`,
  }));
}

async function planShots(
  client: OpenAI,
  firstImage: { buf: Buffer; type: string },
  extra: string,
  platform: string,
  requested: RequestedShot[] | null,
  textModel: string
): Promise<ShotSpec[]> {
  try {
    const dataUrl = await toVisionDataUrl(firstImage.buf, firstImage.type);
    const base = await getSuiteSystem(); // 后台可编辑的套图规划 system 指令
    const platHint = await getSuitePlatformHint(platform); // 平台风格覆盖段(后台可编辑)
    const platformSystem = platHint ? `${base}

${platHint}` : base;
    const customSystem = requested
      ? `

【最高优先级：用户选择了自定义套图结构。忽略上文固定 13 张、1 主图 + 4 副图 + 8 详情图的数量要求；必须严格输出下面 ${requested.length} 张，顺序、role、label、ratio 均不可改变。你只负责结合产品内容为每张补全高质量 prompt 与 text。用户结构 JSON：${JSON.stringify(requested)}】`
      : "";
    const sys = `${platformSystem}${customSystem}`;
    const user =
      (extra ? `补充信息：${extra}\n` : "") + "请规划这套产品的电商套图。";
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
    const parsed = JSON.parse(raw) as { shots?: ShotSpec[] };
    const shots = (parsed.shots ?? []).filter(
      (s) => s && s.prompt && s.role && s.ratio
    );
    if (requested) {
      if (shots.length !== requested.length) {
        return fallbackCustomBlueprint(extra, requested);
      }
      return requested.map((item, index) => ({
        role: item.role,
        label: item.label,
        ratio: item.ratio,
        prompt:
          shots[index]?.prompt ||
          fallbackCustomBlueprint(extra, [item])[0].prompt,
        text: shots[index]?.text || item.label,
      }));
    }
    // 智能匹配校验数量与角色构成;不达标就回退,保证总是 13 张可控
    const mains = shots.filter((s) => s.role === "main").length;
    if (shots.length >= 13 && mains >= 1) return shots.slice(0, 13);
    return fallbackBlueprint(extra);
  } catch {
    return requested
      ? fallbackCustomBlueprint(extra, requested)
      : fallbackBlueprint(extra);
  }
}

function sizeFor(
  ratio: string
): "1024x1024" | "1024x1536" | "1536x1024" {
  if (ratio === "3:4" || ratio === "9:16") return "1024x1536";
  if (ratio === "4:3" || ratio === "16:9") return "1536x1024";
  return "1024x1024";
}

async function genOneShot(
  apiKey: string,
  baseUrl: string,
  model: string,
  spec: ShotSpec,
  productReference: Buffer,
  productImageCount: number
): Promise<Buffer> {
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(productReference)], { type: "image/png" }),
    "product-reference.png"
  );
  form.append("model", model);
  form.append(
    "prompt",
      (productImageCount > 1
        ? "输入参考图是一张同一产品的多视角拼图，只用于理解产品；成品只展示一个完整产品，不得照搬拼图布局或复制多个产品。"
        : "") + spec.prompt
  );
  form.append("n", "1");
  form.append("size", sizeFor(spec.ratio));
  form.append("quality", imageOperationQuality(process.env.OPENAI_IMAGE_QUALITY || "medium"));
  appendImageGatewayFields(form, model);
  const response = await managedImageEditFetch(baseUrl, apiKey, form, AbortSignal.timeout(PER_SHOT_TIMEOUT));
  const raw = await response.text();
  if (!response.ok) {
    const error = new Error(`图片接口 ${response.status}: ${raw.slice(0, 500)}`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  const parsed = JSON.parse(raw) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const d = parsed.data?.[0];
  if (!d) throw new Error("空返回");
  if (d.b64_json) return Buffer.from(d.b64_json, "base64");
  if (d.url) {
    const res = await fetch(d.url);
    if (!res.ok) throw new Error(`图片下载失败 ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("空返回");
}

async function makeProductReference(
  images: { buf: Buffer; type: string }[]
): Promise<Buffer> {
  const mod = (await import("sharp")) as unknown as {
    default?: typeof import("sharp");
  } & typeof import("sharp");
  const sharp = mod.default ?? mod;
  const tileSize = 960;
  const gap = 32;
  const tiles = await Promise.all(
    images.map((image) =>
      sharp(image.buf)
        .rotate()
        .resize(tileSize, tileSize, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toBuffer()
    )
  );
  if (tiles.length === 1) return tiles[0];
  const columns = Math.min(2, tiles.length);
  const rows = Math.ceil(tiles.length / columns);
  const width = columns * tileSize + (columns + 1) * gap;
  const height = rows * tileSize + (rows + 1) * gap;
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(
      tiles.map((input, index) => ({
        input,
        left: gap + (index % columns) * (tileSize + gap),
        top: gap + Math.floor(index / columns) * (tileSize + gap),
      }))
    )
    .png()
    .toBuffer();
}

const RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "3:4": { width: 1152, height: 1536 },
  "4:3": { width: 1536, height: 1152 },
  "16:9": { width: 1536, height: 864 },
  "9:16": { width: 864, height: 1536 },
};

async function normalizeShotRatio(
  bytes: Buffer,
  ratio: string,
  whiteBackground: boolean
): Promise<Buffer> {
  const target = RATIO_DIMENSIONS[ratio];
  if (!target) return bytes;
  const mod = (await import("sharp")) as unknown as {
    default?: typeof import("sharp");
  } & typeof import("sharp");
  const sharp = mod.default ?? mod;
  const metadata = await sharp(bytes).metadata();
  const sourceRatio = (metadata.width ?? 1) / (metadata.height ?? 1);
  const targetRatio = target.width / target.height;
  if (Math.abs(sourceRatio - targetRatio) / targetRatio < 0.025) return bytes;
  const foreground = await sharp(bytes)
    .resize(target.width, target.height, {
      fit: "contain",
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  if (whiteBackground) {
    return sharp({
      create: {
        width: target.width,
        height: target.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{ input: foreground, gravity: "centre" }])
      .png()
      .toBuffer();
  }
  const background = await sharp(bytes)
    .resize(target.width, target.height, { fit: "cover" })
    .blur(24)
    .modulate({ brightness: 0.88, saturation: 0.82 })
    .png()
    .toBuffer();
  return sharp(background)
    .composite([{ input: foreground, gravity: "centre" }])
    .png()
    .toBuffer();
}

function shouldRetryShot(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("socket")
  );
}

async function persistOne(buf: Buffer, id: string): Promise<string> {
  if (!storageEnabled) {
    // 无存储时退化成 data url(本地 mock)
    return `data:image/png;base64,${buf.toString("base64")}`;
  }
  try {
    return await uploadImage(new Uint8Array(buf), "image/png", `suite/${id}.png`);
  } catch {
    return `data:image/png;base64,${buf.toString("base64")}`;
  }
}

type Job = {
  cost?: number;
  quality?: ResolvedImageQuality;
  imageQuality?: string;
  entry?: string;
  status: "pending" | "done" | "error";
  shots: ShotResult[];
  done: number;
  total: number;
  user?: Awaited<ReturnType<typeof getUser>>;
  creditsUsed?: number;
  mock?: boolean;
  error?: string;
  createdAt: number;
  owner: string;
  renderingFinished?: boolean;
};

const JOBS = new DurableImageJobs<Job>("suite");

async function runSuite(
  jobId: string,
  productImages: { buf: Buffer; type: string }[],
  extra: string,
  platform: string,
  email: string,
  apiKey: string,
  model: string,
  useDb: boolean,
  cost: number,
  requested: RequestedShot[] | null,
  textModel: string
) {
  const set = (patch: Partial<Job>) => JOBS.patch(jobId, patch);
  try {
    const baseUrl = (await getOpenAIBaseUrl()) || "https://api.openai.com/v1";
    const client = observeOpenAI(modelAwareOpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: PER_SHOT_TIMEOUT,
      maxRetries: 0,
    }));

    // 第0层:规划 13 张
    const prior = await JOBS.get(jobId);
    const imageQuality = prior?.imageQuality || process.env.OPENAI_IMAGE_QUALITY || "medium";
    const specs = prior?.shots?.length ? prior.shots : await planShots(
      client,
      productImages[0],
      extra,
      platform,
      requested,
      textModel
    );
    const shots: ShotResult[] = specs.map((s, i) => ({
      ...s,
      id: prior?.shots[i]?.id || `suite-${jobId}-${i}`,
      status: prior?.shots[i]?.status || "pending",
      url: prior?.shots[i]?.url,
      gradient: GRADIENTS[i % GRADIENTS.length],
    }));
    await set({ shots, total: shots.length, imageQuality });

    const productReference = await makeProductReference(productImages);

    // 第1-13层:并发限流逐张生成,完成一张更新一张
    let cursor = 0;
    let doneCount = 0;
    let gatewayPending: ImageOperationPending | undefined;
    const worker = async (): Promise<void> => {
      while (cursor < shots.length) {
        const idx = cursor++;
        const shot = shots[idx];
        if ((shot.status === "done" && shot.url) || prior?.renderingFinished) { doneCount++; continue; }
        let ok = false;
        for (let attempt = 0; attempt <= (isImageGatewayModel(model) ? SHOT_RETRIES : 0) && !ok; attempt++) {
          try {
            const quality: ResolvedImageQuality = { ...(prior?.quality ?? { requested: "medium", executed: (imageQuality) as ExecutedQuality, fallbackReason: null }) };
            const generated = await withQualityFallback(quality, executed => JOBS.paidOperation(jobId, model, { id: prior?.quality ? `${shot.id}:quality:${executed}` : shot.id, quality: executed, ratio: shot.ratio, task: "layout", preserveIdentity: true, textAccuracy: "required" }, () => genOneShot(
              apiKey,
              baseUrl,
              model,
              shot,
              productReference,
              productImages.length
            )), model);
            const buf = await normalizeShotRatio(
              generated,
              shot.ratio,
              platform === "amazon" && shot.role === "main"
            );
            const url = await persistOne(buf, shot.id);
            shots[idx] = { ...shot, status: "done", url, quality };
            ok = true;
          } catch (error) {
            if (error instanceof ImageOperationPending) { gatewayPending = error; break; }
            console.error(
              `[suite] shot failed (${shot.label}, ${shot.ratio}, attempt ${attempt + 1}/${SHOT_RETRIES + 1}):`,
              error instanceof Error ? error.message : error
            );
            // 频率限制/超时等:指数退避 + 抖动后重试,熬过限频窗口(2.5s→5s→10s,封顶18s)
            if (attempt < SHOT_RETRIES && shouldRetryShot(error)) {
              const wait =
                Math.min(18000, 2500 * 2 ** attempt) +
                Math.floor(Math.random() * 1500);
              await new Promise((r) => setTimeout(r, wait));
            } else break;
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
    if (okShots.length === 0) {
      throw new Error("全部套图生成失败，请调整要求后重试");
    }

    // 归档作品库(一个套图 = 一个 batch)
    let user: Awaited<ReturnType<typeof getUser>> = null;
    let charged = 0;
    if (useDb) {
      const batchId = jobId;
        await addArtworks(
          email,
          okShots.map((s) => ({
            id: s.id,
            title: `套图·${s.label}`,
            category: s.role === "detail" ? "detail" : "main",
            creationProvenance: { version: 1, operation: "suite", entry: prior?.entry || "toolbox", ref: jobId, evidence: "server-route" },
            prompt: "",
            status: "completed",
            image: s.url!,
            gradient: s.gradient,
            style: null,
            ratio: s.ratio,
            resolution: "1K",
            // 把 role(main/sub/detail)存进 source(原本为 null;非 URL 不会被
            // regenHref 当作源图带走),作品页据此排序/标注主图/副图/详情。
            source: s.role,
          })),
          batchId
        );
      charged = okShots.length * (cost / (prior?.total || shots.length));
      await JOBS.settleResults(jobId, charged, `一键套图 ${okShots.length} 张`,{state:"succeeded",items:shots.map(shot=>({id:shot.id,state:shot.status==="done"?"succeeded":"failed",executedQuality:shot.quality?.executed||prior?.imageQuality||"medium"}))});
      user = await getUser(email).catch(() => null);
    }


    const committedCharge = await getImageJobChargedCredits(jobId);
    for (const shot of okShots) await auditSettledImage(email, committedCharge / okShots.length,
      shot.quality || prior?.quality || {requested: "medium", executed: "medium", fallbackReason: null}, jobId, shot.id);

    await set({
      status: "done",
      shots: [...shots],
      done: shots.length,
      user,
      creditsUsed: committedCharge,
      mock: !apiKey,
    });
  } catch (e) {
    if (e instanceof ImageOperationPending) { await JOBS.handlePending(jobId, e); return; }
    if ((await JOBS.get(jobId, false))?.shots.some((shot) => shot.status === "done")) throw e;
    if (useDb) await JOBS.settleResults(jobId, 0, "套图生成失败",{state:"failed",items:[]});
    console.error("[suite] job failed:", e instanceof Error ? e.message : e);
    await set({ status: "error", error: safeError(e, "套图生成失败,请稍后重试") });
  }
}

async function kickSuite(id: string) {
  await JOBS.kick(id, async (payload) => {
    const input = payload as unknown as { images: {buf:Buffer;type:string}[]; extra:string; platform:string; email:string; model:string; cost:number; requested:RequestedShot[]|null; textModel:string };
    const { apiKey } = await getOpenAISettings();
    await runSuite(id, input.images, input.extra, input.platform, input.email, apiKey, input.model,
      dbEnabled && !!input.email, input.cost, input.requested, input.textModel);
  });
}

export {JOBS,kickSuite};
export type {RequestedShot,ShotRole};
