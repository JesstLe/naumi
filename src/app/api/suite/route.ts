import { NextResponse } from "next/server";
import { toVisionDataUrl } from "@/lib/vision-image";
import OpenAI from "openai";
import { POINTS_PER_IMAGE } from "@/lib/mock-data";
import { safeError } from "@/lib/api-error";
import {
  dbEnabled,
  reserveCredits,
  refundCredits,
  addArtworks,
  getUser,
  isBanned,
  addLedgerEntry,
  addReservation,
  settleReservation,
  sweepStaleReservations,
} from "@/lib/db";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { getSuiteSystem, getSuitePlatformHint } from "@/lib/prompt-config";

// ---------------------------------------------------------------------------
// 一键电商套图：上传产品图(+可选文字) → 自动出 1 主图 + 4 副图 + 8 详情页图。
//
// 两层 pipeline：
//   第0层：视觉 LLM(gpt-4o-mini) 读产品图+文字 → 输出 13 张图的定制中文提示词 JSON。
//          LLM 不可用/失败时回退到写死的蓝图模板(零配置可跑铁律)。
//   第1-13层：gpt-image 图生图,每张 = 产品图(参考,保一致) + 该张的定制提示词。
//          并发限流逐张生成,完成一张即落 R2 并更新进度。
// 异步 job + 逐张进度,复用生图的 jobId+轮询模式(CF 免费版 ~100s 硬超时,套图更长)。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

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
  id: string;
  status: "pending" | "done" | "error";
  url?: string;
  gradient: string;
};

const CONCURRENCY = 2; // 降并发避免 gpt-image 频率限制导致整片失败
const PER_SHOT_TIMEOUT = 240_000;
const SHOT_RETRIES = 3; // 每张失败后最多再重试 3 次(指数退避,扛住尾部限频)

const GRADIENTS = [
  "from-rose-100 to-slate-100",
  "from-lime-100 to-emerald-100",
  "from-amber-100 to-orange-100",
  "from-sky-100 to-teal-100",
  "from-emerald-100 to-teal-100",
  "from-stone-100 to-amber-100",
];

// 写死蓝图(LLM 失败时回退)。13 张:1 主图 + 4 副图 + 8 详情。
// 模型直出整图:每张 prompt 直接要求渲染中文营销文案(字体多样精美),不再做代码叠字。
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

// 第0层:视觉 LLM 读产品图 → 输出 13 张定制提示词。失败回退蓝图。
async function planShots(
  client: OpenAI,
  firstImage: { buf: Buffer; type: string },
  extra: string,
  platform: string,
  requested: RequestedShot[] | null
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
      model: "gpt-5.6-luna",
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

// 生成一张,返回 PNG buffer。模型直接出整图(含中文文案)。
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
  form.append("quality", process.env.OPENAI_IMAGE_QUALITY || "medium");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(PER_SHOT_TIMEOUT),
  });
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

// 把多张产品参考图拼成一张白底联系表，统一以单文件发送给图像接口。
// OpenAI 官方接口支持 image[]，但部分兼容中转只接受 image；单图联系表兼容性更好。
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

// --- Async job store (与生图同款,内存,单 pm2 fork) -------------------------
type Job = {
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
};
const JOBS = new Map<string, Job>();
function gcJobs() {
  const now = Date.now();
  JOBS.forEach((v, k) => {
    if (now - v.createdAt > 30 * 60 * 1000) JOBS.delete(k);
  });
}

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
  requested: RequestedShot[] | null
) {
  const set = (patch: Partial<Job>) => {
    const cur = JOBS.get(jobId);
    if (cur) JOBS.set(jobId, { ...cur, ...patch });
  };
  try {
    const baseUrl = (await getOpenAIBaseUrl()) || "https://api.openai.com/v1";
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: PER_SHOT_TIMEOUT,
      maxRetries: 0,
    });

    // 第0层:规划 13 张
    const specs = await planShots(
      client,
      productImages[0],
      extra,
      platform,
      requested
    );
    const shots: ShotResult[] = specs.map((s, i) => ({
      ...s,
      id: `suite-${Date.now()}-${i}`,
      status: "pending",
      gradient: GRADIENTS[i % GRADIENTS.length],
    }));
    set({ shots, total: shots.length });

    const productReference = await makeProductReference(productImages);

    // 第1-13层:并发限流逐张生成,完成一张更新一张
    let cursor = 0;
    let doneCount = 0;
    const worker = async (): Promise<void> => {
      while (cursor < shots.length) {
        const idx = cursor++;
        const shot = shots[idx];
        let ok = false;
        for (let attempt = 0; attempt <= SHOT_RETRIES && !ok; attempt++) {
          try {
            const generated = await genOneShot(
              apiKey,
              baseUrl,
              model,
              shot,
              productReference,
              productImages.length
            );
            const buf = await normalizeShotRatio(
              generated,
              shot.ratio,
              platform === "amazon" && shot.role === "main"
            );
            const url = await persistOne(buf, shot.id);
            shots[idx] = { ...shot, status: "done", url };
            ok = true;
          } catch (error) {
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
        if (!ok) shots[idx] = { ...shot, status: "error" };
        doneCount++;
        set({ shots: [...shots], done: doneCount });
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, shots.length) }, worker)
    );

    const okShots = shots.filter((s) => s.status === "done" && s.url);
    if (okShots.length === 0) {
      throw new Error("全部套图生成失败，请调整要求后重试");
    }

    // 归档作品库(一个套图 = 一个 batch)
    let user: Awaited<ReturnType<typeof getUser>> = null;
    let charged = 0;
    if (useDb) {
      const batchId = `suite-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
      try {
        await addArtworks(
          email,
          okShots.map((s) => ({
            id: s.id,
            title: `套图·${s.label}`,
            category: s.role === "detail" ? "detail" : "main",
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
      } catch {
        /* non-fatal */
      }
      charged = okShots.length * POINTS_PER_IMAGE;
      const refund = Math.max(0, cost - charged);
      if (refund > 0) await refundCredits(email, refund).catch(() => {});
      if (charged > 0) {
        try {
          await addLedgerEntry(
            email,
            -charged,
            `一键套图 ${okShots.length} 张`
          );
        } catch {
          await refundCredits(email, charged).catch(() => {});
          charged = 0;
        }
      }
      user = await getUser(email).catch(() => null);
    }

    if (useDb) await settleReservation(jobId).catch(() => {});
    set({
      status: "done",
      shots: [...shots],
      done: shots.length,
      user,
      creditsUsed: charged,
      mock: !apiKey,
    });
  } catch (e) {
    if (useDb) {
      await refundCredits(email, cost).catch(() => {});
      await settleReservation(jobId).catch(() => {});
    }
    console.error("[suite] job failed:", e instanceof Error ? e.message : e);
    set({ status: "error", error: safeError(e, "套图生成失败,请稍后重试") });
  }
}

async function parseInput(request: Request) {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const images: { buf: Buffer; type: string }[] = [];
  for (const file of f.getAll("image")) {
    if (file instanceof File && file.size > 0) {
      images.push({
        buf: Buffer.from(await file.arrayBuffer()),
        type: file.type || "image/png",
      });
    }
    if (images.length >= 4) break;
  }
  const structure = (f.get("structure") ?? "auto").toString() === "custom"
    ? "custom"
    : "auto";
  const roleSet = new Set<ShotRole>(["main", "sub", "detail"]);
  const ratioSet = new Set(["1:1", "3:4", "4:3", "16:9", "9:16"]);
  let customShots: RequestedShot[] = [];
  if (structure === "custom") {
    try {
      const raw = JSON.parse((f.get("shots") ?? "[]").toString()) as unknown[];
      customShots = raw.slice(0, 20).flatMap((value, index) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        const role = roleSet.has(item.role as ShotRole)
          ? (item.role as ShotRole)
          : "sub";
        const ratio = ratioSet.has(String(item.ratio))
          ? String(item.ratio)
          : role === "detail"
            ? "3:4"
            : "1:1";
        const label = String(item.label ?? "").trim().slice(0, 40);
        const instruction = String(item.instruction ?? "").trim().slice(0, 240);
        return [{
          role,
          ratio,
          label: label || `自定义图片 ${index + 1}`,
          ...(instruction ? { instruction } : {}),
        }];
      });
    } catch {
      customShots = [];
    }
  }
  return {
    images,
    extra: (f.get("text") ?? "").toString().trim().slice(0, 600),
    platform: (f.get("platform") ?? "taobao").toString().trim().slice(0, 20),
    email: (f.get("email") ?? "").toString().trim(),
    structure,
    customShots,
  };
}

export async function POST(request: Request) {
  const input = await parseInput(request).catch(() => null);
  if (!input || input.images.length === 0) {
    return NextResponse.json({ error: "请上传至少一张产品图" }, { status: 400 });
  }
  if (input.images.some((im) => im.buf.length > 12 * 1024 * 1024)) {
    return NextResponse.json(
      { error: "单张上传图片过大（请 < 12MB）" },
      { status: 400 }
    );
  }
  if (
    input.images.some(
      (im) => !/^image\/(png|jpeg|webp)$/i.test(im.type)
    )
  ) {
    return NextResponse.json(
      { error: "当前仅支持 PNG、JPG、WebP 产品图" },
      { status: 400 }
    );
  }
  if (input.structure === "custom" && input.customShots.length === 0) {
    return NextResponse.json(
      { error: "自定义配置至少保留一张图片" },
      { status: 400 }
    );
  }

  const { apiKey, model } = await getOpenAISettings();
  const ip = clientIp(request);

  // 按 IP 限流:套图一次 13 张更重,8 次/10 分钟。
  if (!rateLimit(`suite:${ip}`, 8, 600_000)) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429 }
    );
  }

  // 生产环境必须凭有效登录态:用 token 里的 email 作准,不信任请求体 email。
  if (dbEnabled) {
    const tokenEmail = await resolveUserEmail(request);
    if (!tokenEmail) {
      return NextResponse.json(
        { error: "请先登录后再生成" },
        { status: 401 }
      );
    }
    input.email = tokenEmail;
  }
  const useDb = dbEnabled && input.email.length > 0;
  // 与前端统一最多 4 张；超出部分在解析阶段截断，防绕过前端多传图。
  const requested = input.structure === "custom" ? input.customShots : null;
  const SHOT_COUNT = requested?.length ?? 13;
  const cost = SHOT_COUNT * POINTS_PER_IMAGE; // 1K 档:13×6 = 78 积分

  if (dbEnabled && (await isBanned(input.email, ip))) {
    return NextResponse.json(
      { error: "账号或 IP 已被封禁，请联系管理员" },
      { status: 403 }
    );
  }
  if (useDb) {
    const ok = await reserveCredits(input.email, cost);
    if (!ok) {
      return NextResponse.json(
        { error: "积分不足，请充值后重试" },
        { status: 402 }
      );
    }
  }

  gcJobs();
  const jobId = `suite-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  JOBS.set(jobId, {
    status: "pending",
    shots: [],
    done: 0,
    total: SHOT_COUNT,
    createdAt: Date.now(),
    owner: input.email,
  });
  if (useDb) {
    try {
      await addReservation(jobId, input.email, cost);
    } catch (error) {
      await refundCredits(input.email, cost).catch(() => {});
      JOBS.delete(jobId);
      return NextResponse.json(
        { error: safeError(error, "积分预扣失败，请稍后重试") },
        { status: 500 }
      );
    }
  }
  void sweepStaleReservations().catch(() => {});
  void runSuite(
    jobId,
    input.images,
    input.extra,
    input.platform,
    input.email,
    apiKey,
    model,
    useDb,
    cost,
    requested
  );

  return NextResponse.json({ jobId, total: SHOT_COUNT, cost });
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("job");
  if (!jobId) {
    // 健康检查:绝不暴露模型名/上游供应商(铁律:绝不泄露所用模型)。
    const { apiKey } = await getOpenAISettings();
    return NextResponse.json({
      status: "ok",
      ready: !!apiKey,
      db: dbEnabled,
      storage: storageEnabled,
    });
  }
  const job = JOBS.get(jobId);
  if (!job) {
    return NextResponse.json({
      status: "error",
      error: "任务不存在或已过期，请重试",
    });
  }
  if (dbEnabled) {
    const email = await resolveUserEmail(request);
    if (!email || email.toLowerCase() !== job.owner.toLowerCase()) {
      return NextResponse.json({ error: "无权查看此任务" }, { status: 403 });
    }
  }
  // 公开字段:不回 prompt 全文(太长),只给前端要的展示数据
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
    status: job.status,
    done: job.done,
    total: job.total,
    shots,
    user: job.status === "done" ? job.user : undefined,
    creditsUsed: job.status === "done" ? job.creditsUsed : undefined,
    mock: job.mock,
    error: job.error,
  });
}
