import "server-only";

// ---------------------------------------------------------------------------
// OpenAI videos 协议客户端(站级配置:VIDEO_API_BASE_URL/KEY/MODEL)。
// 一批聚合商(88API 等)已把 Seedance/Wan/Kling/H3 统一成该协议:
//   POST {base}/v1/videos          → {id, status}
//   GET  {base}/v1/videos/{id}     → {status, progress}
//   GET  {base}/v1/videos/{id}/content → 视频字节
// 图生视频:multipart(form: prompt/model/seconds/size + input_reference 文件)。
// 纯文生视频走 JSON。两者上游行为一致。
// ---------------------------------------------------------------------------

export type VideoClientConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type VideoTaskStatus = "queued" | "in_progress" | "completed" | "failed";

export function resolveVideoConfig(): VideoClientConfig | null {
  const baseUrl = (process.env.VIDEO_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.VIDEO_API_KEY || "").trim();
  const model = (process.env.VIDEO_API_MODEL || "").trim();
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl, apiKey, model };
}

export function videoCost(): number {
  const n = Number(process.env.VIDEO_TASK_COST || "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

type CreateInput = {
  prompt: string;
  seconds: string;
  size: string;
  /** 图生视频的参考图(可选) */
  image?: { bytes: Buffer; mime: string; filename: string };
};

export async function createVideoTask(
  cfg: VideoClientConfig,
  input: CreateInput
): Promise<{ upstreamId: string; requestBody: string }> {
  let res: Response;
  if (input.image) {
    const form = new FormData();
    form.append("model", cfg.model);
    form.append("prompt", input.prompt);
    form.append("seconds", input.seconds);
    form.append("size", input.size);
    form.append(
      "input_reference",
      new Blob([new Uint8Array(input.image.bytes)], { type: input.image.mime }),
      input.image.filename
    );
    res = await fetch(`${cfg.baseUrl}/v1/videos`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } else {
    res = await fetch(`${cfg.baseUrl}/v1/videos`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        prompt: input.prompt,
        seconds: input.seconds,
        size: input.size,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(
      detail?.error?.message || `视频服务创建任务失败(${res.status})`
    );
  }
  const data = (await res.json()) as { id?: string };
  if (!data?.id) throw new Error("视频服务未返回任务 ID");
  return {
    upstreamId: data.id,
    requestBody: JSON.stringify({ model: cfg.model, prompt: input.prompt, seconds: input.seconds, size: input.size }),
  };
}

export async function getVideoStatus(
  cfg: VideoClientConfig,
  upstreamId: string
): Promise<{ status: VideoTaskStatus; progress: number; error?: string }> {
  const res = await fetch(`${cfg.baseUrl}/v1/videos/${encodeURIComponent(upstreamId)}`, {
    headers: { authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`查询视频任务失败(${res.status})`);
  const data = (await res.json()) as {
    status?: string;
    progress?: number;
    error?: { message?: string } | string;
  };
  const raw = (data.status || "").toLowerCase();
  const status: VideoTaskStatus =
    raw === "completed"
      ? "completed"
      : raw === "failed"
        ? "failed"
        : raw === "queued"
          ? "queued"
          : "in_progress";
  const errText =
    typeof data.error === "string"
      ? data.error
      : data.error?.message || undefined;
  return { status, progress: Number(data.progress ?? 0), error: errText };
}

export async function fetchVideoContent(
  cfg: VideoClientConfig,
  upstreamId: string
): Promise<{ buffer: Buffer; mime: string }> {
  const res = await fetch(
    `${cfg.baseUrl}/v1/videos/${encodeURIComponent(upstreamId)}/content`,
    {
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(180_000),
    }
  );
  if (!res.ok) throw new Error(`取回视频失败(${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.byteLength) throw new Error("视频内容为空");
  if (buffer.byteLength > 200 * 1024 * 1024) throw new Error("视频超过 200MB 上限");
  const mime = res.headers.get("content-type")?.split(";")[0] || "video/mp4";
  return { buffer, mime };
}
