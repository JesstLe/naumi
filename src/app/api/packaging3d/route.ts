import {withBillingRequest} from "@/lib/billing/synchronous";
import {configuredToolCost, synchronousChargedCredits} from "@/lib/billing/synchronous-operation";
import { managedImageEditFetch } from "@/lib/model-config/clients";
import { requestImageQuality, imageQualityCost, withQualityFallback, settleToolImage, recordImageExecutionModel } from "@/lib/image-quality-request";
import type { ResolvedImageQuality } from "@/lib/image-quality";
import { NextResponse } from "next/server";
import { insufficientCreditsMessage } from "@/lib/commerce";
import {reserveCredits, refundCredits} from "@/lib/billing/legacy-credit-reservation";
import {addReservation, settleReservation, sweepStaleReservations} from "@/lib/billing/reservations";
import {dbEnabled} from "@/platform/db/pool";
import {addArtworks} from "@/lib/artworks/writer";
import {getUser} from "@/lib/accounts/session";
import {isBanned} from "@/lib/accounts/repository";
import { clientIp } from "@/lib/ip";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled } from "@/lib/object-storage/runtime";
import { uploadImage } from "@/lib/media-upload";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { resolutionLongSide } from "@/lib/mock-data";
import { safeError } from "@/lib/api-error";

export const runtime = "nodejs";
export const maxDuration = 300;

type Input = {
  quality: ResolvedImageQuality;
  bytes: Buffer;
  type: string;
  email: string;
  packageType: string;
  view: string;
  material: string;
  background: string;
  resolution: string;
  prompt: string;
};

type Job = {
  status: "pending" | "done" | "error";
  owner: string;
  createdAt: number;
  id?: string;
  url?: string;
  creditsUsed?: number;
  user?: Awaited<ReturnType<typeof getUser>>;
  error?: string;
};

const JOBS = new Map<string, Job>();

const PACKAGE_TYPES: Record<string, string> = {
  auto: "Infer the packaging structure from the dieline geometry and panel arrangement.",
  carton: "Assemble it as a folding carton retail box with correctly folded flaps and seams.",
  mailer: "Assemble it as a corrugated mailer or shipping box with realistic board thickness.",
  pouch: "Assemble it as a flexible stand-up pouch with sealed edges and a stable bottom gusset.",
  sleeve: "Assemble it as a paper sleeve wrapped around a simple matching inner product box.",
  label: "Wrap the artwork as a label around a plain cylindrical bottle or jar, inferred from the artwork proportions.",
};

const VIEWS: Record<string, string> = {
  angle: "Show a front three-quarter 45-degree hero view so the front and one side panel are both visible.",
  front: "Show a straight-on front product view with minimal perspective distortion.",
  side: "Show a side three-quarter view emphasizing the package depth and side panel.",
  back: "Show a rear three-quarter view emphasizing the back panel and one side panel.",
};

const MATERIALS: Record<string, string> = {
  matte: "Use realistic matte coated paper or film with soft diffuse reflections.",
  glossy: "Use realistic glossy coated stock with controlled studio highlights.",
  kraft: "Use natural kraft paper or board texture while preserving all printed ink colours.",
  metallic: "Use premium metallic laminated stock with restrained reflections and legible printing.",
};

const BACKGROUNDS: Record<string, string> = {
  white: "Place it on a seamless pure white e-commerce background with a soft contact shadow.",
  gray: "Place it in a clean light-gray product studio with soft directional lighting and a contact shadow.",
  scene: "Place it on a restrained premium retail tabletop scene; keep the package as the only visual focus.",
};

function gcJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  JOBS.forEach((job, id) => {
    if (job.createdAt < cutoff) JOBS.delete(id);
  });
}

async function parseInput(request: Request): Promise<Input | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) return null;
  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  const value = (key: string) => (form.get(key) ?? "").toString().trim();
  return {
    quality: requestImageQuality(request, form.get("quality") ?? undefined),
    bytes: Buffer.from(await file.arrayBuffer()),
    type: file.type || "image/png",
    email: value("email"),
    packageType: value("packageType") || "auto",
    view: value("view") || "angle",
    material: value("material") || "matte",
    background: value("background") || "gray",
    resolution: value("resolution") || "1K",
    prompt: value("prompt").slice(0, 600),
  };
}

async function normalizeImage(bytes: Buffer): Promise<Buffer> {
  const mod = (await import("sharp")) as unknown as {
    default?: typeof import("sharp").default;
  } & typeof import("sharp");
  const sharp = mod.default ?? mod;
  return sharp(bytes, { density: 220 }).rotate().png().toBuffer();
}

async function upscaleTo(bytes: Buffer, resolution: string): Promise<Buffer> {
  const target = resolutionLongSide(resolution);
  if (!target) return bytes;
  const mod = (await import("sharp")) as unknown as {
    default?: typeof import("sharp").default;
  } & typeof import("sharp");
  const sharp = mod.default ?? mod;
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const longSide = Math.max(width, height);
  if (!longSide || longSide >= target) return bytes;
  const scale = target / longSide;
  return sharp(bytes)
    .resize(Math.round(width * scale), Math.round(height * scale), {
      kernel: "lanczos3",
    })
    .png()
    .toBuffer();
}

function buildPrompt(input: Input): string {
  const structure = PACKAGE_TYPES[input.packageType] ?? PACKAGE_TYPES.auto;
  const view = VIEWS[input.view] ?? VIEWS.angle;
  const material = MATERIALS[input.material] ?? MATERIALS.matte;
  const background = BACKGROUNDS[input.background] ?? BACKGROUNDS.gray;
  const extra = input.prompt
    ? ` Additional user requirements: ${input.prompt}`
    : "";
  return [
    "The uploaded image is a flat packaging dieline and print artwork, not a finished product photograph.",
    "Read the cut contours, crease/fold lines, glue tabs, bleed zones and adjacent panels, then fold the dieline into one plausible fully assembled three-dimensional retail package.",
    structure,
    "Map the supplied print artwork panel-by-panel onto the assembled package. Faithfully preserve existing logos, text, barcodes, colours, graphics, spacing and orientation; do not invent, translate, rewrite, mirror, reorder or duplicate artwork.",
    "Construction guides must not remain as visible black or coloured lines on the finished product unless they are clearly part of the printed artwork. Hide glue tabs and internal flaps naturally.",
    view,
    material,
    background,
    "Show exactly one complete assembled package, fully inside frame. No flat dieline, no exploded view, no hands, no rulers, no dimension arrows, no extra products, no added captions or watermarks. Photorealistic commercial packaging mockup with physically believable folds, thickness, seams and shadows.",
    extra,
  ].join(" ");
}

async function generate(input: Input): Promise<Buffer> {
  const { apiKey, model } = await getOpenAISettings();
  if (!apiKey) throw new Error("未配置图像模型 API Key");
  const baseUrl = (await getOpenAIBaseUrl()) || "https://api.openai.com/v1";
  const image = await normalizeImage(input.bytes);
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(image)], { type: "image/png" }),
    "dieline.png"
  );
  form.append("model", model || "gpt-image-2");
  recordImageExecutionModel(input.quality, model || "gpt-image-2");
  form.append("prompt", buildPrompt(input));
  form.append("n", "1");
  form.append("size", "1024x1024");
  form.append("quality", input.quality.executed);
  const response = await managedImageEditFetch(baseUrl, apiKey, form, AbortSignal.timeout(280_000));
  const raw = await response.text();
  if (!response.ok) throw Object.assign(new Error(`图片接口 ${response.status}: ${raw.slice(0, 500)}`), { status: response.status });
  const parsed = JSON.parse(raw) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const output = parsed.data?.[0];
  let bytes: Buffer;
  if (output?.b64_json) bytes = Buffer.from(output.b64_json, "base64");
  else if (output?.url) {
    const download = await fetch(output.url);
    if (!download.ok) throw new Error(`生成图下载失败 ${download.status}`);
    bytes = Buffer.from(await download.arrayBuffer());
  } else throw new Error("图片接口未返回结果");
  return upscaleTo(await normalizeImage(bytes), input.resolution);
}

async function runJob(jobId: string, input: Input, cost: number, useDb: boolean) {
  try {
    const output = await withQualityFallback(input.quality, () => generate(input));
    const id = `pack3d-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    let url = `data:image/png;base64,${output.toString("base64")}`;
    let source: string | null = null;
    if (storageEnabled) {
      try {
        url = await uploadImage(
          new Uint8Array(output),
          "image/png",
          `packaging3d/${id}.png`
        );
        const ext = input.type.includes("svg")
          ? "svg"
          : input.type.includes("webp")
            ? "webp"
            : input.type.includes("png")
              ? "png"
              : "jpg";
        source = await uploadImage(
          new Uint8Array(input.bytes),
          input.type,
          `packaging3d/src-${id}.${ext}`
        );
      } catch (error) {
        console.error(
          "[packaging3d] storage failed:",
          error instanceof Error ? error.message : error
        );
      }
    }

    let user: Awaited<ReturnType<typeof getUser>> = null;
    let charged = false;
    if (useDb) {
      await addArtworks(
        input.email,
        [
          {
            id,
            title: "模切线 3D 产品图",
            category: "packaging3d",
            prompt: input.prompt,
            status: "completed",
            image: url,
            gradient: "from-amber-100 to-slate-100",
            style: input.material,
            ratio: "1:1",
            resolution: input.resolution,
            source,
            parentId: null,
            parentIds: [],
          },
        ],
        `pack3d-${Date.now()}`
      ).catch(() => {});
      try {
        await settleToolImage(input.email, cost, "模切线转 3D 产品图", input.quality, id, input.resolution);
        charged = true;
      } catch {
        // 结算失败时释放占位，避免图片已完成但余额永久卡在“处理中”。
        await refundCredits(input.email, cost).catch(() => {});
      }
      await settleReservation(jobId).catch(() => {});
      user = await getUser(input.email).catch(() => null);
    }
    JOBS.set(jobId, {
      status: "done",
      owner: input.email,
      createdAt: Date.now(),
      id,
      url,
      creditsUsed: charged ? cost : 0,
      user,
    });
  } catch (error) {
    if (useDb) {
      await refundCredits(input.email, cost).catch(() => {});
      await settleReservation(jobId).catch(() => {});
    }
    console.error(
      "[packaging3d] job failed:",
      error instanceof Error ? error.message : error
    );
    JOBS.set(jobId, {
      status: "error",
      owner: input.email,
      createdAt: Date.now(),
      error: safeError(error, "模切线 3D 可视化失败，请检查刀版图后重试"),
    });
  }
}

async function handleObservedPost(request: Request) {
  const input = await parseInput(request).catch(() => null);
  if (!input) {
    return NextResponse.json({ error: "请上传模切线图" }, { status: 400 });
  }
  if (input.bytes.length > 16 * 1024 * 1024) {
    return NextResponse.json({ error: "图片过大，请控制在 16MB 内" }, { status: 400 });
  }
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/i.test(input.type)) {
    return NextResponse.json(
      { error: "当前支持 PNG、JPG、WebP、SVG 模切线图" },
      { status: 400 }
    );
  }
  const ip = clientIp(request);
  if (dbEnabled) {
    const email = await resolveUserEmail(request);
    if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    input.email = email;
  }
  const useDb = dbEnabled && input.email.length > 0;
  const cost = await imageQualityCost(input.quality, input.resolution);
  if (dbEnabled && (await isBanned(input.email, ip))) {
    return NextResponse.json({ error: "账号或 IP 已被封禁" }, { status: 403 });
  }
  if (useDb) {
    const ok = await reserveCredits(input.email, cost);
    if (!ok) return NextResponse.json({ error: insufficientCreditsMessage }, { status: 402 });
  }
  gcJobs();
  const jobId = `pack3dj-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  JOBS.set(jobId, {
    status: "pending",
    owner: input.email,
    createdAt: Date.now(),
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
  void runJob(jobId, input, cost, useDb);
  return NextResponse.json({ jobId, cost });
}

async function billingRoutePost(request:Request){return withBiRequest(request,()=>handleObservedPost(request));}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("job") ?? "";
  const job = JOBS.get(jobId);
  if (!job) {
    return NextResponse.json({ status: "error", error: "任务不存在或已过期" });
  }
  if (dbEnabled) {
    const email = await resolveUserEmail(request);
    if (!email || email.toLowerCase() !== job.owner.toLowerCase()) {
      return NextResponse.json({ error: "无权查看此任务" }, { status: 403 });
    }
  }
  return NextResponse.json(job);
}
import {withBiRequest} from "@/lib/bi/request";

export async function POST(request:Request){return withBillingRequest(request,"tool.packaging3d",()=>billingRoutePost(request));}
