import "server-only";

import { assertUserImageBaseUrlAllowed } from "@/lib/user-image-provider";
import type { ApiWorkflow } from "@/lib/comfyui/workflow";

// ---------------------------------------------------------------------------
// ComfyUI HTTP 客户端(BYOC:算力在用户自备端点上,站内不扣积分)。
// 协议:POST /prompt 排队 → 轮询 /history/{id} → /view 拉产物;输入图先传
// /upload/image。SSRF 策略复用 BYOK 供应商同款(私网需显式开
// USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK,兼容本机/NAS 端点)。
// ---------------------------------------------------------------------------

export type ComfyEndpoint = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  isActive: boolean;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 300 * 1024 * 1024; // 单产物上限 300MB(视频)

function normalizeBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function comfyFetch(
  endpoint: Pick<ComfyEndpoint, "baseUrl" | "apiKey">,
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (endpoint.apiKey) headers.set("authorization", `Bearer ${endpoint.apiKey}`);
  const res = await fetch(`${normalizeBase(endpoint.baseUrl)}${path}`, {
    ...rest,
    headers,
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  return res;
}

/** 校验并规范化端点地址(保存与运行前都调用;DNS 级内网拦截复用 BYOK 策略)。 */
export async function assertComfyEndpointAllowed(baseUrl: string): Promise<string> {
  const base = normalizeBase(baseUrl);
  const parsed = new URL(base); // 先做格式校验
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("端点地址仅支持 http/https");
  }
  await assertUserImageBaseUrlAllowed(base);
  return base;
}

/** 连接测试:GET /object_info,返回节点类名列表(缺件报告数据源)。 */
export async function fetchObjectInfo(
  endpoint: Pick<ComfyEndpoint, "baseUrl" | "apiKey">,
  signal?: AbortSignal
): Promise<string[]> {
  const res = await comfyFetch(endpoint, "/object_info", { signal });
  if (!res.ok) {
    throw new Error(
      endpoint.apiKey && res.status === 401
        ? "端点连接成功但鉴权失败，请检查密钥"
        : `连接端点失败(${res.status})，请确认 ComfyUI 已启动且允许跨域/直连`
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  return Object.keys(data ?? {});
}

/** 上传输入图,返回 /prompt 里 LoadImage 应填的名称(含 subfolder 前缀)。 */
export async function uploadImage(
  endpoint: Pick<ComfyEndpoint, "baseUrl" | "apiKey">,
  bytes: Buffer,
  filename: string,
  mimeType: string,
  signal?: AbortSignal
): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);
  form.append("overwrite", "true");
  const res = await comfyFetch(endpoint, "/upload/image", {
    method: "POST",
    body: form,
    timeoutMs: 60_000,
    signal,
  });
  if (!res.ok) {
    throw new Error(`上传图片到端点失败(${res.status})`);
  }
  const data = (await res.json()) as { name?: string; subfolder?: string };
  if (!data?.name) throw new Error("端点未返回上传结果");
  return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

/** 排队执行,返回 prompt_id;/prompt 的校验错误会整理成可读摘要。 */
export async function queuePrompt(
  endpoint: Pick<ComfyEndpoint, "baseUrl" | "apiKey">,
  workflow: ApiWorkflow,
  clientId: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await comfyFetch(endpoint, "/prompt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { error?: { message?: string; node_errors?: Record<string, unknown> } }
      | null;
    if (data?.error?.node_errors && Object.keys(data.error.node_errors).length) {
      const first = Object.entries(data.error.node_errors)[0];
      throw new Error(`工作流校验失败:节点 ${first[0]}(${workflow[first[0]]?.class_type ?? "?"}) 不存在或参数无效`);
    }
    throw new Error(data?.error?.message || `排队失败(${res.status})`);
  }
  const data = (await res.json()) as { prompt_id?: string };
  if (!data?.prompt_id) throw new Error("端点未返回任务 ID");
  return data.prompt_id;
}

export type ComfyOutput = {
  filename: string;
  subfolder: string;
  type: string;
  /** 由文件扩展推断,图片/视频分流入库或直链 */
  mime: string;
};

function mimeFromFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "mp4") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return "application/octet-stream";
}

/** 轮询任务直到完成/失败/超时;成功时汇总全部产物文件。 */
export async function pollHistory(
  endpoint: Pick<ComfyEndpoint, "baseUrl" | "apiKey">,
  promptId: string,
  opts: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {}
): Promise<ComfyOutput[]> {
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (opts.signal?.aborted) throw new Error("已取消");
    const res = await comfyFetch(endpoint, `/history/${encodeURIComponent(promptId)}`, {
      timeoutMs: 15_000,
      signal: opts.signal,
    });
    if (res.ok) {
      const data = (await res.json()) as Record<
        string,
        | {
            status?: { completed?: boolean; status_str?: string; messages?: unknown[] };
            outputs?: Record<string, Record<string, { filename: string; subfolder?: string; type?: string }[]>>;
          }
        | undefined
      >;
      const entry = data?.[promptId];
      if (entry?.status) {
        const statusStr = entry.status.status_str ?? "";
        if (statusStr === "error") {
          throw new Error("工作流执行失败，请到端点 ComfyUI 控制台查看节点报错");
        }
        if (statusStr === "executing" || !entry.status.completed) {
          if (entry.outputs && Object.keys(entry.outputs).length > 0) {
            // 部分产物已就绪但仍在跑:继续等
          }
        }
        if (statusStr === "success" || entry.status.completed) {
          const outputs: ComfyOutput[] = [];
          for (const files of Object.values(entry.outputs ?? {})) {
            for (const [kind, list] of Object.entries(files)) {
              if (!Array.isArray(list)) continue;
              for (const f of list) {
                if (!f?.filename) continue;
                outputs.push({
                  filename: f.filename,
                  subfolder: f.subfolder ?? "",
                  type: f.type ?? "output",
                  mime: kind === "images" || kind === "gifs"
                    ? mimeFromFilename(f.filename)
                    : mimeFromFilename(f.filename),
                });
              }
            }
          }
          return outputs;
        }
      }
    }
    if (Date.now() > deadline) {
      throw new Error("工作流执行超时(4 分钟)。视频类任务请稍后到端点历史中取回");
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 2_500));
  }
}

/** 拉取产物文件字节。 */
export async function fetchOutput(
  endpoint: Pick<ComfyEndpoint, "baseUrl" | "apiKey">,
  output: ComfyOutput,
  signal?: AbortSignal
): Promise<{ buffer: Buffer; mime: string }> {
  const qs = new URLSearchParams({
    filename: output.filename,
    subfolder: output.subfolder,
    type: output.type,
  });
  const res = await comfyFetch(endpoint, `/view?${qs.toString()}`, {
    timeoutMs: 120_000,
    signal,
  });
  if (!res.ok) throw new Error(`取回产物失败(${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.byteLength || buffer.byteLength > MAX_OUTPUT_BYTES) {
    throw new Error("产物文件为空或超过 300MB 上限");
  }
  return { buffer, mime: res.headers.get("content-type")?.split(";")[0] || output.mime };
}
