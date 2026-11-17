import "server-only";
import {supplierCostFetch} from "../supplier-cost/collect";
import {modelAwareOpenAI} from "../model-config/clients";
import {markBillingUpstream} from "../billing/synchronous-operation";
import {observeOpenAI} from "@/lib/bi/model-calls";
import {toFile} from "openai";
import {getOpenAIBaseUrl} from "../openai-base";
import {CutoutOutputError} from "./cutout-types";
import {IMAGEGEN_MAX_PIXELS} from "./image-limits";

async function loadSharp(): Promise<typeof import("sharp").default | null> {
  try {
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp").default;
    } & typeof import("sharp");
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

// 解析社区模型的最新版本哈希(进程内缓存,pm2 重启即刷新)。
const REPLICATE_VERSION_CACHE = new Map<string, string>();
async function resolveReplicateVersion(
  model: string,
  token: string
): Promise<string> {
  const cached = REPLICATE_VERSION_CACHE.get(model);
  if (cached) return cached;
  const r = await fetch(`https://api.replicate.com/v1/models/${model}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Replicate 模型查询失败 ${r.status}`);
  const j = (await r.json()) as { latest_version?: { id?: string } };
  const version = j.latest_version?.id;
  if (!version) throw new Error("Replicate 模型无可用版本");
  REPLICATE_VERSION_CACHE.set(model, version);
  return version;
}

// Replicate 托管 GPU 上的 BiRefNet(顶配,发丝级,按次付费)。
// 输出可能是「透明 PNG」或「灰度 mask」——运行时探测:带 alpha 直接用;
// 否则用 sharp 把 mask 当 alpha 合成回原图,保证拿到真正的透明底图。
export async function cutoutReplicate(
  bytes: Buffer,
  type: string,
  token: string,
  model: string
): Promise<Buffer> {
  const dataUri = `data:${type || "image/png"};base64,${bytes.toString(
    "base64"
  )}`;
  // men1scus/birefnet 是社区模型 → 必须用版本哈希走 /v1/predictions
  // (/v1/models/.../predictions 仅限官方模型,社区模型会 404)。
  const version = await resolveReplicateVersion(model, token);
  // Prefer:wait 尽量同步拿结果(热启动 ~8s,冷启动更久则下面轮询)。
  markBillingUpstream("started");
  const costFetch = supplierCostFetch(fetch,{providerId:"replicate",protocol:"replicate",baseUrl:"https://api.replicate.com",apiKey:token,wireModel:model,phase:"cutout",observeTaskGets:true});
  const create = await costFetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ version, input: { image: dataUri } }),
  });
  let pred = (await create.json()) as {
    status?: string;
    output?: string | string[];
    error?: string;
    detail?: string;
    urls?: { get?: string };
  };
  if (!create.ok) {
    markBillingUpstream([400,401,403,404,422,429].includes(create.status)?"rejected":"unknown");
    throw new Error(pred?.detail || pred?.error || `Replicate ${create.status}`);
  }
  // 没在 wait 窗口内完成 → 轮询(冷启动场景)
  const deadline = Date.now() + 110_000;
  while (
    pred.status &&
    pred.status !== "succeeded" &&
    pred.status !== "failed" &&
    pred.status !== "canceled"
  ) {
    if (Date.now() > deadline) throw new Error("Replicate 超时");
    if (!pred.urls?.get) break;
    await new Promise((r) => setTimeout(r, 2000));
    const g = await costFetch(pred.urls.get, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    pred = await g.json();
  }
  if (pred.status !== "succeeded") {
    markBillingUpstream(pred.status==="failed"||pred.status==="canceled"?"rejected":"unknown");
    throw new Error(`Replicate 失败:${pred.error || pred.status || "未知"}`);
  }
  const outUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  markBillingUpstream("succeeded");
  if (!outUrl || typeof outUrl !== "string") {
    throw new Error("Replicate 未返回图片");
  }
  const dl = await fetch(outUrl);
  if (!dl.ok) throw new Error("下载 Replicate 结果失败");
  const outBuf = Buffer.from(await dl.arrayBuffer());

  // 探测输出类型:已是透明 PNG 直接用;否则当 mask 合成回原图。
  const sharp = await loadSharp();
  if (!sharp) throw new CutoutOutputError();
  const outMeta = await sharp(outBuf,{limitInputPixels:IMAGEGEN_MAX_PIXELS}).metadata();
  const output = await sharp(outBuf,{limitInputPixels:IMAGEGEN_MAX_PIXELS}).toColourspace("srgb").ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let cleared=0,visible=0,partial=0,grayscale=true;
  for(let i=0;i<output.data.length;i+=4){
    const r=output.data[i],g=output.data[i+1],b=output.data[i+2],a=output.data[i+3];
    if(a===0)cleared++;else visible++;
    if(a<255)partial++;
    if(r!==g||g!==b)grayscale=false;
  }
  if(cleared&&visible)return outMeta.format==="png"?outBuf:await sharp(outBuf,{limitInputPixels:IMAGEGEN_MAX_PIXELS}).png().toBuffer();
  // Only an actual grayscale mask may replace alpha. A color result or a
  // pseudo-transparent checkerboard is not a mask and must not become one.
  if(partial||!grayscale)throw new CutoutOutputError();
  // mask 路径:缩放到原图尺寸 → 作为 alpha 通道合成
  const original = await sharp(bytes,{limitInputPixels:IMAGEGEN_MAX_PIXELS}).rotate().removeAlpha().toColourspace("srgb").raw().toBuffer({resolveWithObject:true});
  const w=original.info.width,h=original.info.height;
  const maskRaw = await sharp(outBuf,{limitInputPixels:IMAGEGEN_MAX_PIXELS})
    .resize(w, h, { fit: "fill" })
    .removeAlpha().greyscale()
    .raw()
    .toBuffer();
  // Materialize RGB before joinChannel: removeAlpha().joinChannel() on the
  // same lazy Sharp pipeline can discard the newly joined alpha channel.
  return await sharp(original.data,{raw:{width:w,height:h,channels:3}})
    .joinChannel(maskRaw, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer();
}

// 兜底:gpt-image 透明底(主要用于本地开发没有自托管服务时)。
export async function cutoutOpenAI(
  bytes: Buffer,
  type: string,
  apiKey: string,
  model: string
): Promise<Buffer> {
  const client = observeOpenAI(modelAwareOpenAI({
    apiKey,
    baseURL: (await getOpenAIBaseUrl()) || undefined,
    timeout: 120_000,
    maxRetries: 0,
  }));
  // 先用 sharp 规整成干净 PNG,避免 "Invalid image file"
  let png = bytes;
  try {
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp").default;
    } & typeof import("sharp");
    const sharp = mod.default ?? mod;
    png = await sharp(bytes).rotate().png().toBuffer();
  } catch {
    /* sharp 不可用 → 用原图 */
  }
  const fileType = png === bytes ? type || "image/png" : "image/png";
  const file = await toFile(png, "input.png", { type: fileType });
  const r = await client.images.edit({
    // Managed execution selects the actual published image model and mapping.
    model: model || "gpt-image-1",
    image: file,
    prompt: "精确沿原图主体边缘移除背景，尽量保留主体外形、文字、颜色和细节，输出带真实 alpha 通道的透明 PNG。背景区域必须完全透明；不要绘制灰白棋盘格、方格、白色底板或任何用于表示透明的图案。",
    n: 1,
    size: "auto" as "1024x1024",
    background: "transparent" as const,
  });
  const b64 = r.data?.[0]?.b64_json;
  if (!b64) throw new Error("抠图未返回结果");
  return Buffer.from(b64, "base64");
}
