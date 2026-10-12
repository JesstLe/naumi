import { Type, type TSchema } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createCreativeTools } from "./creative-tools";
import { CREATIVE_AGENT_TOOLS, CREATIVE_TOOL_FEATURES } from "./creative-tool-catalog";
import type { CanvasAgentContext } from "./canvas-context";
import {dataUrlToBytes,isManagedImageUrl,readManagedObject} from "../storage";

// ---------------------------------------------------------------------------
// Naumi Agent 工具集:站内生成能力的 AgentTool 包装,由 pi-agent 编排调用。
//
// 安全约束(硬性):
//   - 内部调用 origin = INTERNAL_APP_ORIGIN env(容器内 127.0.0.1:3000),
//     缺省回退请求 origin;不硬编码
//   - 凭证透传 cookie + authorization,由目标 API 的 resolveUserEmail 判别
//   - urlToFile 有 SSRF 防护(协议/私网/重定向/大小/类型白名单)
//   - 只读 GET 指数退避重试;收费/写请求零自动重试(防重复扣费)
//   - 所有 execute 接收 AbortSignal 并传播到每个 fetch/sleep/poll
//   - 每工具独立超时预算(dsh timeout-policy 思路),超时返回模型可读错误
// ---------------------------------------------------------------------------

const TOOL_TIMEOUT_MS = {
  generate_image: 300_000,
  retouch_product: 240_000,
  recolor_product: 240_000,
  replicate_hot: 240_000,
  generate_suite: 480_000,
  generate_aplus: 360_000,
  review_aplus_source: 360_000,
  continue_aplus_generation: 600_000,
  generate_packaging_3d: 360_000,
  comfy_run: 280_000,
  generate_video: 300_000,
  get_video_task: 15_000,
  list_video_models: 15_000,
  plan_video_shot: 15_000,
  plan_video_storyboard: 15_000,
  extend_video: 300_000,
  edit_video: 300_000,
  creative_tool: 300_000,
  verify_image_output: 100_000,
  read_only: 15_000,
} as const;

export const AGENT_SYSTEM_PROMPT = `你是 Naumi 智能体 —— 电商 AI 出图工作站的任务助手。你可以调用站内工具完成图片生成与处理。

## 可用工具
1. search_templates / list_my_artworks / get_balance / verify_image_output:只读,不消耗积分。
2. generate_image:文生图/图生图。参数 prompt(必填)、ratio(1:1/3:4/4:3/16:9/9:16)、resolution(1K/2K/4K)、count(1-4)、model(仅当用户明确点名生图模型时填写)。计费金额以系统当前报价为准。
3. retouch_product:商品精修。参数 image_url、options(数组)、text。计费金额以系统当前报价为准。
4. recolor_product:产品换色。参数 image_url、color(如 #27AE60)、strength(20-100)。计费金额以系统当前报价为准。
5. replicate_hot:爆款复刻。参数 product_image_url、reference_image_url、degree(high/style)、text。计费金额以系统当前报价为准。
6. generate_suite:一键电商套图。默认智能生成 13 张；用户指定数量/版式时传 structure=custom 与 shots。费用由当前配置和任务数量决定。
 7. generate_aplus:A+ 第一步，只提取白底商品母图并返回待审核图片与 job_id。参数 image_url、platform、lang、format、modules(数组)、text。
 8. review_aplus_source:审核一张母图。approve=通过；redo=带用户要求只重做这一张。
 9. continue_aplus_generation:全部母图通过后继续生成 A+，此时按任务创建时冻结的报价计费。
 10. generate_packaging_3d:把模切线/刀版图折叠为包装 3D 产品效果图。参数 image_url、package_type、view、material、background、resolution、text。

## 可用工具(ComfyUI 工作流 · 用户自备算力端点,不扣站内积分)
- list_comfy_workflows:只读。列出用户已导入的 ComfyUI 工作流(id/名称/输入概况)。要跑工作流前先调它拿 workflow_id。
- run_comfy_workflow:在用户自己的 ComfyUI 端点上执行工作流。参数 workflow_id(必填)、prompt(正向提示词,可选)、image_url(用户给的[商品图] URL,工作流有图槽时传)、seed/width/height/length(可选)。
  注意:算力在用户端点,不消耗积分;执行可能数分钟(视频更久);产物图片用 Markdown 展示,视频给下载链接。用户没配端点或没导入工作流时,引导去画布选中图片点「工作流」配置,不要反复重试。

## 可用工具(视频生成 · 站内多供应商视频协议,按次计费)
- list_video_models:列出当前已配置视频供应商和模型能力。
- plan_video_shot / plan_video_storyboard:只读策划工具，分别规划单镜头和多镜头，不创建任务。
- generate_video:文生视频/图生视频。参数 prompt(必填,描述画面与运镜)、image_url(可选,用户消息里的[商品图]作首帧参考)、seconds(4/8/12,默认 4)、size(横屏 1280x720/竖屏 720x1280)。
- extend_video / edit_video:基于已有视频 URL 创建续写或编辑任务；任务超时也不会重复创建。
- get_video_task:按任务 ID 查询服务端状态。
  注意:需要站内已配置视频服务(未配置时报错就引导联系站长);一次生成约 1-3 分钟;完成后产物是画布视频节点,同时给用户视频下载链接;计费按次(失败自动退)。

## 创作中心完整工具
- 抠图/抠头像：cutout_image / cutout_avatar；高清修复：upscale_image；局部改图：inpaint_image（必须用户提供遮罩）。
- 风格/融合/裂变：transfer_style / fuse_images / generate_variations；去水印：remove_watermark。
- 服装：try_on_clothing / extract_garment / generate_garment_3d / dewrinkle_clothing；印花：extract_print。
- 标题/侵权/印刷：generate_titles / check_image_ip / prepare_print_file。
- 竞品：list_competitor_items → import_competitor_image（有需要时）→ analyze_competitor / replicate_competitor / edit_competitor；使用真实revision与用户选区，不猜测。
- list_agent_tools 可查询各工具入口与schema。Agent任务是编排入口，不递归调用自己。
- 所有工具复用各自现有配置。返回未配置/失败时如实反馈，不把静态产物或示例当完成。

## 工作规则
0.5 大额计费确认闸:当一次工具调用触发系统配置的大额确认门槛(套图、A+、多张/2K 生图等)时,系统会拦截第一次调用并提示报价。此时必须先向用户报出预计积分数,等用户明确同意后,再携带 confirm=true 重新调用同一工具;用户拒绝或犹豫就不要执行,改为给出更小规模的替代方案。
1. 用户消息里的商品图以 URL 形式出现(格式:[商品图] <url> 或工具返回的图片 URL);工具的图片参数必须传入,用户没给就先要,不要编造 URL。
2. 每次工具调用都有积分成本;同一任务参数相同不要重复调用。
3. 工具返回的图片 URL 用 Markdown 图片语法展示:![描述](url)。
4. 长耗时工具(套图/A+)先告知用户等待时间。
 5. A+ 必须分两步：先调用 generate_aplus 展示每张白底母图，等待用户逐张确认；用户说某张不合格时调用 review_aplus_source(action=redo)并原样带上修改要求；只有全部通过后才调用 continue_aplus_generation。不得替用户默认通过母图。
 6. 每个生成/精修/换色/复刻/套图/A+ 任务产出后，必须调用 verify_image_output 检查至少一张代表图；套图/A+ 优先检查首图和最后一图。未通过时明确列出问题，最多只允许在结果明确失败且不会重复扣费不明时重做一次。检查返回 verificationStatus=unavailable 表示检查未完成，不代表图片生成失败或图片不合格；保留并交付已生成图片，说明未自动验收，不因此重生成、重复扣费或宣称检查通过。
 7. 任务完成后用中文简要总结:做了什么、视觉检查结果、产出哪些图、扣了多少积分。
 8. 与图片生成无关的问题直接回答,不要调用工具。`;

export function createNaumiTools(req: Request, agentEmail = "", getCred?: () => { cookie: string; authorization: string; imageQuality?: string;billingVersion?:number;billingCredits?:number;billingOperationId?:string }, acceptedModelContext?: string | (() => string), canvas?: CanvasAgentContext): AgentTool[] {
  // 双凭证:可变 getter —— 每次工具执行时读取最新 cookie/authorization,
  // 常驻会话的凭证刷新(runtime 层 existing.cred = cred)即刻生效,无需重建 Agent。
  const credGetter =
    getCred ??
    (() => ({
      cookie: req.headers.get("cookie") ?? "",
      authorization: req.headers.get("authorization") ?? "",
      imageQuality: req.headers.get("x-naumi-image-quality") ?? "medium",
    }));
  // 内部 origin:INTERNAL_APP_ORIGIN env(容器内固定) > 请求 origin > 容器缺省
  const envOrigin = (process.env.INTERNAL_APP_ORIGIN || "").replace(/\/+$/, "");
  const reqOrigin = new URL(req.url).origin;
  const base = envOrigin || reqOrigin || "http://127.0.0.1:3000";

  const authHeaders = (): Record<string, string> => {
    const cred = credGetter();
    const accepted = typeof acceptedModelContext === "function" ? acceptedModelContext() : acceptedModelContext;
    return {
      cookie: cred.cookie,
      ...("billingVersion" in cred&&cred.billingVersion!==undefined?{"x-naumi-billing-version":String(cred.billingVersion),"x-naumi-billing-credits":String(cred.billingCredits),"x-naumi-billing-operation-id":String(cred.billingOperationId)}:{}),
      "x-naumi-image-quality": cred.imageQuality || "medium",
      ...(cred.authorization ? { authorization: cred.authorization } : {}),
      ...(accepted ? { "x-naumi-accepted-model-context": accepted } : {}),
    };
  };

  async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("aborted"));
      const t = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        },
        { once: true }
      );
    });
  }

  async function internal(
    path: string,
    signal: AbortSignal | undefined,
    init?: RequestInit
  ): Promise<any> {
    // 安全规则:只读 GET 指数退避重试(≤3);收费/写请求严禁自动重试
    // (防重复扣费);HTTP 错误属确定性失败,一律不重试。
    const isRead = !init?.method || init.method === "GET";
    const attempts = isRead ? 3 : 1;
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      if (signal?.aborted) throw new Error("aborted");
      try {
        const res = await fetch(base + path, {
          ...init,
          signal,
          headers: { ...(init?.headers ?? {}), ...authHeaders(), "x-naumi-client-entry": "agent" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw Object.assign(
            new Error(data?.error || `内部接口 ${path} 返回 ${res.status}`),
            { deterministic: true }
          );
        }
        return data;
      } catch (e) {
        if (signal?.aborted) throw new Error("aborted");
        lastErr = e;
        const det = (e as { deterministic?: boolean }).deterministic;
        if (det || i >= attempts - 1) break;
        await sleep(1500 * 2 ** i, signal);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("内部调用失败");
  }

  // ── SSRF 防护的图片拉取 ──
  const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
  const ALLOWED_IMG_HOST_RE =
    /(^|\.)(imgdd\.cc|youmind\.com|cms-assets\.youmind\.com)$/i;

  function assertSafeImageUrl(raw: string): URL {
    let u: URL;
    try {
      u = new URL(raw, base);
    } catch {
      throw new Error("图片 URL 无效");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("仅允许 http/https 图片");
    }
    // 同源(本站 /media/...)直接放行
    if (u.origin === base) return u;
    const host = u.hostname;
    const isPrivate =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith(".local") ||
      host.endsWith(".internal");
    if (isPrivate) {
      throw new Error("不允许访问内网地址");
    }
    if (!ALLOWED_IMG_HOST_RE.test(host)) {
      throw new Error(`图片域名不在白名单: ${host}`);
    }
    return u;
  }

  async function urlToFile(raw: string, signal?: AbortSignal): Promise<File> {
    if(canvas?.imageUrls.includes(raw)){
      const inline=dataUrlToBytes(raw),object=inline?{bytes:inline.bytes,contentType:inline.contentType}:isManagedImageUrl(raw)?await readManagedObject(raw,MAX_IMAGE_BYTES):null;
      if(object){if(signal?.aborted)throw new Error("aborted");if(!/^image\/(png|jpeg|webp)$/i.test(object.contentType)||object.bytes.length>MAX_IMAGE_BYTES)throw new Error("参考图片格式或大小不支持");return new File([Buffer.from(object.bytes)],"reference.png",{type:object.contentType});}
    }
    const u = assertSafeImageUrl(raw);
    const res = await fetch(u.toString(), {
      signal,
      redirect: "error", // 禁跨重定向(防绕过白名单)
      headers: u.origin === base ? authHeaders() : {},
    });
    if (!res.ok) throw new Error(`图片拉取失败(${res.status})`);
    const type = res.headers.get("content-type") || "";
    if (!/^image\/(png|jpeg|webp)$/i.test(type)) {
      throw new Error(`不支持的图片类型: ${type || "未知"}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) throw new Error("图片超过 12MB 上限");
    return new File([buf], "image.png", { type: type || "image/png" });
  }

  async function pollJob(
    path: string,
    jobId: string,
    maxMs: number,
    signal?: AbortSignal
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (signal?.aborted) throw new Error("aborted");
      await sleep(5000, signal);
      const d = await internal(`${path}?job=${encodeURIComponent(jobId)}`, signal);
      if (d.status === "done") return d;
      if (["error","failed","cancelled"].includes(d.status)) throw new Error(d.error || "任务失败");
    }
    throw new Error("任务超时");
  }

  async function pollAplusReview(
    jobId: string,
    maxMs: number,
    signal?: AbortSignal,
    sourceIndex?: number,
    previousVersion?: number
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (signal?.aborted) throw new Error("aborted");
      await sleep(3500, signal);
      const d = await internal(
        `/api/aplus?job=${encodeURIComponent(jobId)}`,
        signal
      );
      if (d.status === "error") throw new Error(d.error || "A+ 任务失败");
      if (typeof sourceIndex === "number") {
        const source = d.sources?.[sourceIndex];
        if (
          source &&
          source.status !== "redoing" &&
          source.status !== "preparing" &&
          (typeof previousVersion !== "number" || source.version > previousVersion || source.status === "error")
        ) {
          return d;
        }
      } else if (d.status === "awaiting_review" || d.status === "done") {
        return d;
      }
    }
    throw new Error("A+ 母图处理超时");
  }

  /** dsh timeout-policy:每工具独立超时预算,超时抛模型可读的结构化错误。 */
  async function withToolTimeout<T>(
    tool: keyof typeof TOOL_TIMEOUT_MS,
    fn: (signal: AbortSignal | undefined) => Promise<T>,
    signal: AbortSignal | undefined
  ): Promise<T> {
    const budget = TOOL_TIMEOUT_MS[tool];
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("aborted"));
      const timeoutController = new AbortController();
      const onAbort = () => timeoutController.abort(signal?.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      const finish = () => signal?.removeEventListener("abort", onAbort);
      const timer = setTimeout(() => {
        timeoutController.abort(new Error("TOOL_TIMEOUT"));
        finish();
        reject(
          new Error(
            `工具超时(${Math.round(budget / 1000)}s)，已停止继续等待。收费请求不会自动重放，请先检查作品库确认结果。`
          )
        );
      }, budget);
      fn(timeoutController.signal).then(
        (v) => {
          clearTimeout(timer);
          finish();
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          finish();
          reject(e);
        }
      );
    });
  }

  function fmtImages(urls: string[]): string {
    return urls.map((u, i) => `![结果${i + 1}](${u})\n${u}`).join("\n");
  }

  // ── 只读(0 积分) ──
  const tools: AgentTool[] = [
    {
      name: "search_templates",
      label: "搜索模板",
      description:
        "只读:搜索站内提示词模板库(不消耗积分),返回模板 id/标题/分类/简介。用户问『有什么模板』时调用。",
      parameters: Type.Object({
        q: Type.String({ description: "关键词(标题/分类/标签),空串=列出全部" }),
        category: Type.String({ description: "按分类过滤,选填" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as { q?: string; category?: string };
        const qs = new URLSearchParams({ pageSize: "12" });
        if (p.q) qs.set("q", p.q);
        if (p.category) qs.set("category", p.category);
        const d = await withToolTimeout(
          "read_only",
          () => internal(`/api/templates?${qs.toString()}`, signal),
          signal
        );
        const list = (d.templates ?? []).map(
          (t: {
            id: string;
            title: string;
            category: string;
            description: string;
            popular?: boolean;
          }) =>
            `${t.popular ? "[热门] " : ""}${t.title}(${t.category}) — ${t.description} [id=${t.id}]`
        );
        const joined = list.join("\n") || "(无匹配)";
        return {
          content: [
            {
              type: "text",
              text: `共 ${d.total} 个模板,当前展示 ${list.length} 个:\n${joined}`,
            },
          ],
          details: { total: d.total, publicSummary: `命中 ${d.total} 个模板` },
        };
      },
    },
    {
      name: "list_my_artworks",
      label: "查我的作品",
      description:
        "只读:列出当前用户最近的生成作品(不消耗积分),返回图片 URL 与标题。需要引用用户已有图片时调用。",
      parameters: Type.Object({
        limit: Type.Number({ description: "返回条数 1-20,默认 8" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as { limit?: number };
        const limit = Math.min(Math.max(p.limit || 8, 1), 20);
        const d = await withToolTimeout(
          "read_only",
          () =>
            internal(`/api/account?email=${encodeURIComponent(agentEmail)}`, signal),
          signal
        ).catch(() => null);
        const items: { url: string; title?: string }[] = (
          d?.artworks ?? []
        ).slice(0, limit);
        if (!items.length) {
          return {
            content: [{ type: "text", text: "作品库暂无作品。" }],
            details: { count: 0, publicSummary: "作品库为空" },
          };
        }
        const list = items.map(
          (a, i) => `${i + 1}. ${a.title || "未命名"} — ${a.url}`
        );
        return {
          content: [{ type: "text", text: `最近作品:\n${list.join("\n")}` }],
          details: { count: items.length, publicSummary: `返回 ${items.length} 个作品` },
        };
      },
    },
    {
      name: "get_balance",
      label: "查积分余额",
      description:
        "只读:查询当前用户积分余额(不消耗积分)。执行收费任务前判断是否够用时调用。",
      parameters: Type.Object({}),
      executionMode: "sequential",
      execute: async (_id, _params, signal) => {
        const d = await withToolTimeout(
          "read_only",
          () =>
            internal(`/api/account?email=${encodeURIComponent(agentEmail)}`, signal),
          signal
        ).catch(() => null);
        const total = d?.user?.creditsTotal;
        const used = d?.user?.creditsUsed;
        if (typeof total !== "number") {
          return {
            content: [{ type: "text", text: "余额查询暂不可用。" }],
            details: {},
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `当前余额:${total - (used || 0)} 积分(累计 ${total},已用 ${used || 0})。`,
            },
          ],
          details: { total, used },
        };
      },
    },
    // ── 写(计费) ──
    {
      name: "generate_image",
      label: "AI 生图",
      description:
        "文生图/图生图:按提示词生成电商商品图。计费由后台当前规则报价，包含数量、模型、质量和尺寸。",
      parameters: Type.Object({
        quality: Type.Optional(Type.Union(["low","medium","high","xhigh","max"].map(value => Type.Literal(value)), { description: "图像质量；省略时使用用户当前所选档位" })),
        image_urls: Type.Optional(Type.Array(Type.String(), {maxItems:5,description:"用户明确提供的参考图URL；画布省略时引用当前图及上游"})),
        prompt: Type.String({ description: "画面描述,越具体越好" }),
        ratio: Type.Union(
          [
            Type.Literal("1:1"),
            Type.Literal("3:4"),
            Type.Literal("4:3"),
            Type.Literal("16:9"),
            Type.Literal("9:16"),
          ],
          { description: "画幅比例,默认 1:1" }
        ),
        resolution: Type.Union([Type.Literal("1K"), Type.Literal("2K"), Type.Literal("4K")], {
          description: "分辨率,默认 1K",
        }),
        count: Type.Number({ description: "生成张数 1-4,默认 1" }),
        model: Type.Optional(
          Type.String({
            description:
              "生图模型 id。仅当用户明确点名某个生图模型时填写;不确定就省略,走站内默认。",
          })
        ),
        confirm: Type.Optional(
          Type.Boolean({
            description:
              "预算确认标记。本次调用预计花费达到后台确认门槛时,必须先向用户报价并获得明确同意,再携带 confirm=true 调用;小额或已确认过则可省略。",
          })
        ),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          prompt: string;
          ratio?: string;
          resolution?: string;
          count?: number;
          model?: string;
          quality?: string;
        };
        const options=params as Record<string,any>;
        const nativeFeature=!!options._category;
        const fd = new FormData();
        if (options._category)fd.append("category",options._category);
        if (p.quality) fd.append("quality", p.quality);
        fd.append("prompt", p.prompt);
        fd.append("entry", "agent");
        fd.append("ratio", p.ratio || canvas?.ratio || "1:1");
        fd.append("resolution", p.resolution || canvas?.resolution || "1K");
        fd.append("count", String(Math.min(Math.max(p.count || 1, 1), 4)));
        if (p.model || (!nativeFeature&&canvas?.imageModelId)) fd.append("model", p.model || canvas!.imageModelId!);
        if (canvas) {
          if(!nativeFeature)fd.append("origin", "canvas");
          if(canvas.anchorId)fd.append("parentId", canvas.anchorId);
          fd.append("userPrompt", p.prompt);

        }
        const refs=Array.isArray(options.image_urls)?options.image_urls:canvas?.imageUrls||[];
        const d = await withToolTimeout(
          "generate_image",
          async scoped => {
            for(const url of refs)fd.append("image",await urlToFile(url,scoped));
            const created = await internal("/api/generate-image", scoped, {
              method: "POST",
              body: fd,
            });
            return pollJob(
              "/api/generate-image",
              created.jobId,
              TOOL_TIMEOUT_MS.generate_image,
              scoped
            );
          },
          signal
        );
        const urls: string[] = (d.images ?? []).map((im: { url: string }) => im.url);
        if(!urls.length||urls.some(url=>typeof url!=="string"||!url))throw new Error("生图任务未返回有效图片，请检查作品库");
        return {
          content: [
            { type: "text", text: `生成 ${urls.length} 张:\n${fmtImages(urls)}` },
          ],
          details: { urls, publicSummary: "生成 1 组图片" },
        };
      },
    },
    {
      name: "retouch_product",
      label: "商品精修",
      description:
        "商品精修:增强光泽、修复瑕疵、提升清晰度、色彩校正。商品与构图不变,只提升质感。计费金额以系统当前报价为准。",
      parameters: Type.Object({
        image_url: Type.String({ description: "商品图 URL" }),
        options: Type.Array(
          Type.Union([
            Type.Literal("gloss"),
            Type.Literal("blemish"),
            Type.Literal("clarity"),
            Type.Literal("color"),
            Type.Literal("perspective"),
          ]),
          {
            description:
              "精修项:gloss=增强光泽,blemish=修复瑕疵,clarity=提升清晰度,color=色彩校正,perspective=修正透视",
          }
        ),
        text: Type.String({ description: "补充要求,选填" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          image_url: string;
          options?: string[];
          text?: string;
        };
        const fd = new FormData();
        fd.append("image", await urlToFile(p.image_url, signal));
        (p.options?.length ? p.options : ["gloss", "clarity"]).forEach((o) =>
          fd.append("option", o)
        );
        if (p.text) fd.append("text", p.text);
        const d = await withToolTimeout(
          "retouch_product",
          () => internal("/api/retouch", signal, { method: "POST", body: fd }),
          signal
        );
        return {
          content: [
            { type: "text", text: `精修完成:\n![精修结果](${d.url})\n${d.url}` },
          ],
          details: { url: d.url, publicSummary: "精修完成,产出 1 张图" },
        };
      },
    },
    {
      name: "recolor_product",
      label: "产品换色",
      description:
        "产品换色:把商品主体换成目标颜色,形态纹理光影背景不变。计费金额以系统当前报价为准。",
      parameters: Type.Object({
        image_url: Type.String({ description: "商品图 URL" }),
        color: Type.String({ description: "目标颜色十六进制,如 #27AE60" }),
        strength: Type.Number({ description: "换色强度 20-100,默认 100" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          image_url: string;
          color: string;
          strength?: number;
        };
        const fd = new FormData();
        fd.append("image", await urlToFile(p.image_url, signal));
        fd.append("color", p.color);
        fd.append("strength", String(p.strength || 100));
        const d = await withToolTimeout(
          "recolor_product",
          () => internal("/api/recolor", signal, { method: "POST", body: fd }),
          signal
        );
        return {
          content: [
            {
              type: "text",
              text: `换色完成(${p.color}):\n![换色结果](${d.url})\n${d.url}`,
            },
          ],
          details: {
            url: d.url,
            publicSummary: `已换色为 ${p.color},产出 1 张图`,
          },
        };
      },
    },
    {
      name: "replicate_hot",
      label: "爆款复刻",
      description:
        "爆款复刻:参照爆款参考图的构图风格,把商品原图的产品放进去。计费金额以系统当前报价为准。",
      parameters: Type.Object({
        product_image_url: Type.String({ description: "商品原图 URL" }),
        reference_image_url: Type.String({ description: "爆款参考图 URL" }),
        degree: Type.Union([Type.Literal("high"), Type.Literal("style")], {
          description: "high=高度复刻构图,style=仅参考风格",
        }),
        text: Type.String({ description: "补充要求,选填" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          product_image_url: string;
          reference_image_url: string;
          degree?: string;
          text?: string;
        };
        const fd = new FormData();
        fd.append("image", await urlToFile(p.product_image_url, signal));
        fd.append("ref", await urlToFile(p.reference_image_url, signal));
        fd.append("degree", p.degree || "high");
        if (p.text) fd.append("text", p.text);
        const d = await withToolTimeout(
          "replicate_hot",
          () => internal("/api/replicate", signal, { method: "POST", body: fd }),
          signal
        );
        return {
          content: [
            { type: "text", text: `复刻完成:\n![复刻结果](${d.url})\n${d.url}` },
          ],
          details: { url: d.url, publicSummary: "复刻完成,产出 1 张图" },
        };
      },
    },
    {
      name: "generate_suite",
      label: "一键电商套图",
      description:
        "一键电商套图:默认 1 主图 + 4 副图 + 8 详情页；也可按用户要求自定义每张的类型、标题、比例与内容。费用由当前配置和任务数量决定。",
      parameters: Type.Object({
        image_url: Type.String({
          description: "商品图 URL(可上传正面/侧面/背面多张,用逗号分隔)",
        }),
        platform: Type.Optional(Type.Union(
          [
            Type.Literal("taobao"),
            Type.Literal("douyin"),
            Type.Literal("amazon"),
            Type.Literal("pdd"),
            Type.Literal("xhs"),
            Type.Literal("global"),
          ],
          { description: "上架平台,默认 taobao" }
        )),
        text: Type.Optional(Type.String({ description: "主标题与卖点文案" })),
        structure: Type.Optional(
          Type.Union([Type.Literal("auto"), Type.Literal("custom")], {
            description: "auto=智能 13 张；custom=严格按 shots 生成",
          })
        ),
        shots: Type.Optional(
          Type.Array(
            Type.Object({
              role: Type.Union([
                Type.Literal("main"),
                Type.Literal("sub"),
                Type.Literal("detail"),
              ]),
              label: Type.String({ description: "图片标题" }),
              ratio: Type.Union([
                Type.Literal("1:1"),
                Type.Literal("3:4"),
                Type.Literal("4:3"),
                Type.Literal("16:9"),
                Type.Literal("9:16"),
              ]),
              instruction: Type.Optional(
                Type.String({ description: "该张内容或版式要求" })
              ),
            }),
            { description: "自定义图片清单，1-20 张" }
          )
        ),
        confirm: Type.Optional(
          Type.Boolean({
            description:
              "预算确认标记。套图通常花费较高(按后台当前报价计费),必须先向用户报出总预计积分并获得明确同意,再携带 confirm=true 调用。",
          })
        ),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          image_url: string;
          platform?: string;
          text?: string;
          structure?: "auto" | "custom";
          shots?: {
            role: "main" | "sub" | "detail";
            label: string;
            ratio: string;
            instruction?: string;
          }[];
        };
        const fd = new FormData();
        const urls = p.image_url.split(",").map((u) => u.trim()).filter(Boolean);
        for (const u of urls) fd.append("image", await urlToFile(u, signal));
        fd.append("platform", p.platform || "taobao");
        if (p.text) fd.append("text", p.text);
        const custom = p.structure === "custom" && (p.shots?.length ?? 0) > 0;
        fd.append("structure", custom ? "custom" : "auto");
        if (custom) fd.append("shots", JSON.stringify(p.shots!.slice(0, 20)));
        const d = await withToolTimeout(
          "generate_suite",
          async () => {
            const created = await internal("/api/suite", signal, {
              method: "POST",
              body: fd,
            });
            return pollJob(
              "/api/suite",
              created.jobId,
              TOOL_TIMEOUT_MS.generate_suite,
              signal
            );
          },
          signal
        );
        const urls2: string[] = (d.shots ?? [])
          .filter(
            (s: { status: string; url?: string }) => s.status === "done" && s.url
          )
          .map((s: { url?: string }) => s.url as string);
        return {
          content: [
            {
              type: "text",
              text: `套图完成 ${urls2.length} 张:\n${fmtImages(urls2)}`,
            },
          ],
          details: {
            urls: urls2,
            publicSummary: `套图完成,产出 ${urls2.length} 张图`,
          },
        };
      },
    },
    {
      name: "generate_aplus",
      label: "准备 A+ 母图",
      description:
        "A+ 第一步:逐张提取白底商品母图，返回待用户审核的图片。此步不扣用户积分；不得自动继续生成。",
      parameters: Type.Object({
        image_url: Type.String({
          description: "商品图 URL,多张用逗号分隔(正面/侧面/背面)",
        }),
        platform: Type.Union(
          [
            Type.Literal("amazon"),
            Type.Literal("taobao"),
            Type.Literal("pdd"),
            Type.Literal("independent"),
          ],
          { description: "上架平台,默认 amazon" }
        ),
        lang: Type.Union(
          [Type.Literal("auto"), Type.Literal("zh"), Type.Literal("en")],
          { description: "文案语言,默认跟随平台" }
        ),
        format: Type.String({
          description:
            "版式:aplus-web/aplus-mobile/aplus-basic/1:1/4:3/16:9/9:16,默认 aplus-web",
        }),
        modules: Type.Array(Type.String(), {
          description:
            "内容模块:hero/selling/scene/angles/story/compare/craft/size/specs/accessories/series/ingredients/assurance/usage",
        }),
        text: Type.String({ description: "商品卖点与要求,选填" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          image_url: string;
          platform?: string;
          lang?: string;
          format?: string;
          modules?: string[];
          text?: string;
        };
        const fd = new FormData();
        const urls = p.image_url.split(",").map((u) => u.trim()).filter(Boolean);
        for (const u of urls) fd.append("image", await urlToFile(u, signal));
        fd.append("platform", p.platform || "amazon");
        fd.append("lang", p.lang || "auto");
        fd.append("format", p.format || "aplus-web");
        (p.modules?.length
          ? p.modules
          : ["hero", "selling", "scene", "angles"]
        ).forEach((m) => fd.append("module", m));
        if (p.text) fd.append("text", p.text);
        const d = await withToolTimeout(
          "generate_aplus",
          async () => {
            const created = await internal("/api/aplus", signal, {
              method: "POST",
              body: fd,
            });
            return pollAplusReview(
              created.jobId,
              TOOL_TIMEOUT_MS.generate_aplus,
              signal
            );
          },
          signal
        );
        const sourceLines: string[] = (d.sources ?? []).map(
          (source: { label?: string; url?: string; version?: number; status?: string }, index: number) =>
            `${index + 1}. ${source.label || `白底母图 ${index + 1}`}（v${source.version || 1}）\n` +
            (source.url ? `![${source.label || `母图${index + 1}`}](${source.url})\n${source.url}` : `状态：${source.status || "失败"}`)
        );
        return {
          content: [
            {
              type: "text",
              text:
                `白底商品母图已准备，请逐张放大审核。任务 job_id=${d.jobId || "见 details"}。\n` +
                `${sourceLines.join("\n\n")}\n\n` +
                "请明确告诉我每张是否通过；不合格时说明第几张和修改要求。我不会在你确认前生成 A+。",
            },
          ],
          details: {
            jobId: d.jobId,
            sources: d.sources,
            publicSummary: `已准备 ${sourceLines.length} 张白底母图，等待审核`,
          },
        };
      },
    },
    {
      name: "review_aplus_source",
      label: "审核 A+ 母图",
      description:
        "审核指定白底母图。approve 表示用户明确通过；redo 表示只重做这一张，必须原样带上用户的修改要求。",
      parameters: Type.Object({
        job_id: Type.String({ description: "generate_aplus 返回的 job_id" }),
        source_number: Type.Number({ description: "母图序号，从 1 开始" }),
        action: Type.Union([Type.Literal("approve"), Type.Literal("redo")]),
        feedback: Type.String({ description: "redo 时必填的用户修改要求；approve 时传空串" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          job_id: string;
          source_number: number;
          action: "approve" | "redo";
          feedback?: string;
        };
        const index = Math.max(0, Math.floor(p.source_number) - 1);
        const before = await internal(
          `/api/aplus?job=${encodeURIComponent(p.job_id)}`,
          signal
        );
        const previousVersion = Number(before.sources?.[index]?.version) || 0;
        const updated = await internal("/api/aplus", signal, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: p.job_id,
            action: p.action === "approve" ? "approve_source" : "redo_source",
            sourceIndex: index,
            feedback: p.feedback || "",
          }),
        });
        if (p.action === "approve") {
          return {
            content: [{ type: "text", text: `第 ${index + 1} 张母图已标记通过。` }],
            details: { jobId: p.job_id, source: updated.source, publicSummary: `第 ${index + 1} 张母图已通过` },
          };
        }
        const d = await withToolTimeout(
          "review_aplus_source",
          () => pollAplusReview(
            p.job_id,
            TOOL_TIMEOUT_MS.review_aplus_source,
            signal,
            index,
            previousVersion
          ),
          signal
        );
        const source = d.sources?.[index];
        const resultText = source?.url
          ? `第 ${index + 1} 张已按要求重做（v${source.version}）：\n![重做后的白底母图](${source.url})\n${source.url}\n请再次确认是否通过。`
          : `第 ${index + 1} 张重做失败：${source?.error || "未知错误"}`;
        return {
          content: [{ type: "text", text: resultText }],
          details: { jobId: p.job_id, source, publicSummary: `第 ${index + 1} 张母图已重做` },
        };
      },
    },
    {
      name: "continue_aplus_generation",
      label: "生成 A+ 详情页",
      description:
        "仅当用户明确通过全部白底母图后调用。使用审核后的母图生成全部 A+ 模块并按模块计费。",
      parameters: Type.Object({
        job_id: Type.String({ description: "已完成母图审核的 A+ job_id" }),
        confirm: Type.Optional(
          Type.Boolean({
            description:
              "预算确认标记。A+ 按模块和当前规则报价,必须先向用户报出总预计积分并获得明确同意,再携带 confirm=true 调用。",
          })
        ),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as { job_id: string };
        const d = await withToolTimeout(
          "continue_aplus_generation",
          async () => {
            await internal("/api/aplus", signal, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId: p.job_id, action: "generate" }),
            });
            return pollJob(
              "/api/aplus",
              p.job_id,
              TOOL_TIMEOUT_MS.continue_aplus_generation,
              signal
            );
          },
          signal
        );
        const urls2: string[] = (d.shots ?? [])
          .filter((s: { status: string; url?: string }) => s.status === "done" && s.url)
          .map((s: { url?: string; label?: string }) => `${s.label}: ${s.url}`);
        return {
          content: [{ type: "text", text: `A+ 详情页完成 ${urls2.length} 个模块:\n${urls2.join("\n")}` }],
          details: { urls: urls2, publicSummary: `A+ 完成 ${urls2.length} 个模块` },
        };
      },
    },
    {
      name: "generate_packaging_3d",
      label: "模切线转 3D",
      description:
        "将一张包装模切线/刀版图识别并折叠为完整 3D 产品效果图，保留印刷文字、Logo、条码、颜色和面板关系。",
      parameters: Type.Object({
        image_url: Type.String({ description: "模切线图 URL" }),
        package_type: Type.Optional(
          Type.Union([
            Type.Literal("auto"),
            Type.Literal("carton"),
            Type.Literal("mailer"),
            Type.Literal("pouch"),
            Type.Literal("sleeve"),
            Type.Literal("label"),
          ])
        ),
        view: Type.Optional(
          Type.Union([
            Type.Literal("angle"),
            Type.Literal("front"),
            Type.Literal("side"),
            Type.Literal("back"),
          ])
        ),
        material: Type.Optional(
          Type.Union([
            Type.Literal("matte"),
            Type.Literal("glossy"),
            Type.Literal("kraft"),
            Type.Literal("metallic"),
          ])
        ),
        background: Type.Optional(
          Type.Union([
            Type.Literal("white"),
            Type.Literal("gray"),
            Type.Literal("scene"),
          ])
        ),
        resolution: Type.Optional(
          Type.Union([
            Type.Literal("1K"),
            Type.Literal("2K"),
            Type.Literal("4K"),
          ])
        ),
        text: Type.Optional(
          Type.String({ description: "成品结构或视觉补充要求" })
        ),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          image_url: string;
          package_type?: string;
          view?: string;
          material?: string;
          background?: string;
          resolution?: string;
          text?: string;
        };
        const form = new FormData();
        form.append("image", await urlToFile(p.image_url, signal));
        form.append("packageType", p.package_type || "auto");
        form.append("view", p.view || "angle");
        form.append("material", p.material || "matte");
        form.append("background", p.background || "gray");
        form.append("resolution", p.resolution || "1K");
        if (p.text) form.append("prompt", p.text);
        const d = await withToolTimeout(
          "generate_packaging_3d",
          async () => {
            const created = await internal("/api/packaging3d", signal, {
              method: "POST",
              body: form,
            });
            return pollJob(
              "/api/packaging3d",
              created.jobId,
              TOOL_TIMEOUT_MS.generate_packaging_3d,
              signal
            );
          },
          signal
        );
        return {
          content: [
            {
              type: "text",
              text: `包装 3D 产品图已生成：\n![包装 3D 产品图](${d.url})\n${d.url}`,
            },
          ],
          details: {
            url: d.url,
            publicSummary: "模切线已生成 3D 产品效果图",
          },
        };
      },
    },
    // ── ComfyUI 工作流(BYOC:用户自备端点,不扣站内积分) ──
    {
      name: "list_comfy_workflows",
      label: "工作流列表",
      description:
        "只读。列出用户已导入的 ComfyUI 工作流:id、名称、图片槽/文本/种子数量。跑工作流前先调它。",
      parameters: Type.Object({}),
      execute: async (_id, _params, signal) => {
        const d = await withToolTimeout(
          "read_only",
          () => internal("/api/comfyui/workflows", signal),
          signal
        );
        const list = (d.workflows ?? []) as {
          id: string;
          name: string;
          inputs?: {
            images?: unknown[];
            texts?: unknown[];
            seeds?: unknown[];
          };
        }[];
        if (!list.length) {
          return {
            content: [
              {
                type: "text",
                text: "用户还没有导入任何 ComfyUI 工作流。请引导:画布选中一张图 → 工具栏「工作流」→「导入」页粘贴 ComfyUI API 格式 JSON。",
              },
            ],
            details: { count: 0, publicSummary: "无工作流" },
          };
        }
        const lines = list.map(
          (w) =>
            `- ${w.id} | ${w.name} | ${w.inputs?.images?.length ?? 0} 图槽 ${w.inputs?.texts?.length ?? 0} 文本 ${w.inputs?.seeds?.length ?? 0} 种子`
        );
        return {
          content: [{ type: "text", text: `共 ${list.length} 个工作流:\n${lines.join("\n")}` }],
          details: { count: list.length, publicSummary: `列出 ${list.length} 个工作流` },
        };
      },
    },
    {
      name: "run_comfy_workflow",
      label: "运行工作流",
      description:
        "在用户自己的 ComfyUI 端点上执行已导入的工作流。不扣站内积分;可能数分钟(视频更久)。先 list_comfy_workflows 拿 workflow_id。",
      parameters: Type.Object({
        workflow_id: Type.String({ description: "list_comfy_workflows 返回的工作流 id" }),
        prompt: Type.Optional(
          Type.String({ description: "正向提示词,填入工作流的正向文本槽" })
        ),
        image_url: Type.Optional(
          Type.String({ description: "输入图 URL(用户消息里的[商品图]);工作流有图槽时传" })
        ),
        seed: Type.Optional(Type.Number({ description: "随机种子,省略则随机" })),
        width: Type.Optional(Type.Number({ description: "输出宽(工作流有该输入时生效)" })),
        height: Type.Optional(Type.Number({ description: "输出高(工作流有该输入时生效)" })),
        length: Type.Optional(Type.Number({ description: "视频帧数(工作流有该输入时生效)" })),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          workflow_id: string;
          prompt?: string;
          image_url?: string;
          seed?: number;
          width?: number;
          height?: number;
          length?: number;
        };
        const d = await withToolTimeout(
          "comfy_run",
          () =>
            internal("/api/comfyui/run", signal, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workflowId: p.workflow_id,
                imageUrl: p.image_url,
                prompt: p.prompt,
                seed: p.seed,
                numericDefaults: {
                  ...(p.width ? { width: p.width } : {}),
                  ...(p.height ? { height: p.height } : {}),
                  ...(p.length ? { length: p.length } : {}),
                },
              }),
            }),
          signal
        );
        const images = (d.images ?? []) as { url: string }[];
        const videos = (d.videos ?? []) as { url: string }[];
        const parts: string[] = [];
        if (images.length) {
          parts.push(`生成 ${images.length} 张:\n${images.map((im) => `![工作流结果](${im.url})`).join("\n")}`);
        }
        if (videos.length) {
          parts.push(`视频 ${videos.length} 个(下载链接):\n${videos.map((v) => v.url).join("\n")}`);
        }
        return {
          content: [{ type: "text", text: parts.join("\n\n") || "执行完成(无产物)" }],
          details: {
            images: images.map((im) => im.url),
            publicSummary: `工作流出图 ${images.length} 张/视频 ${videos.length} 个`,
          },
        };
      },
    },
    // ── 视频生产域：能力目录、策划、查询、生成、续写、编辑 ──
    {
      name: "list_video_models",
      label: "视频模型目录",
      description: "只读：列出当前服务器已配置的视频供应商、模型和能力。",
      parameters: Type.Object({}),
      replay: "safe",
      executionMode: "sequential",
      execute: async (_id, _params, signal) => {
        const data = await withToolTimeout("list_video_models", () => internal("/api/video/catalog", signal), signal);
        const providers = Array.isArray(data.providers) ? data.providers as Array<{ label?: string; models?: Array<{ modelId?: string; modes?: string[]; durations?: number[] }> }> : [];
        const text = providers.map((provider) => `${provider.label || "视频供应商"}: ${(provider.models || []).map((model) => `${model.modelId} [${(model.modes || []).join("/")}; ${(model.durations || []).join("/")}s]`).join("、")}`).join("\n");
        return { content: [{ type: "text", text: text || "当前未配置视频模型" }], details: { providers, publicSummary: "已读取视频模型目录" } };
      },
    },
    {
      name: "plan_video_shot",
      label: "单镜头策划",
      description: "只读：把目标整理为可直接用于生成的单镜头镜头单。",
      parameters: Type.Object({ goal: Type.String(), duration: Type.Optional(Type.Number()), aspect_ratio: Type.Optional(Type.String()) }),
      replay: "safe",
      executionMode: "sequential",
      execute: async (_id, params) => {
        const p = params as { goal: string; duration?: number; aspect_ratio?: string };
        const shot = { type: "single-shot", durationSeconds: p.duration || 4, aspectRatio: p.aspect_ratio || "16:9", prompt: `${p.goal}。单一连续镜头，明确主体动作、机位、运镜、光线、景深和结束状态。` };
        return { content: [{ type: "text", text: `单镜头方案：${shot.prompt}\n时长：${shot.durationSeconds}s；画幅：${shot.aspectRatio}` }], details: { shot, publicSummary: "已完成单镜头策划" } };
      },
    },
    {
      name: "plan_video_storyboard",
      label: "多镜头策划",
      description: "只读：按镜头数量生成连续分镜结构，供多镜头模型或逐镜头生成使用。",
      parameters: Type.Object({ goal: Type.String(), shots: Type.Optional(Type.Number({ minimum: 2, maximum: 8 })), total_duration: Type.Optional(Type.Number()) }),
      replay: "safe",
      executionMode: "sequential",
      execute: async (_id, params) => {
        const p = params as { goal: string; shots?: number; total_duration?: number };
        const count = Math.max(2, Math.min(8, Math.trunc(p.shots || 3)));
        const total = Math.max(count, Math.trunc(p.total_duration || count * 4));
        const stages = ["建立主体与环境", "推进动作与卖点", "完成动作并定格结果"];
        const storyboard = Array.from({ length: count }, (_, index) => ({ index: index + 1, durationSeconds: Math.max(1, Math.round(total / count)), intent: stages[Math.min(stages.length - 1, Math.floor(index * stages.length / count))], prompt: `${p.goal}。镜头 ${index + 1}/${count}，保持主体、材质、光线和空间方向连续。` }));
        return { content: [{ type: "text", text: storyboard.map((shot) => `${shot.index}. ${shot.intent}（${shot.durationSeconds}s）：${shot.prompt}`).join("\n") }], details: { storyboard, publicSummary: "已完成多镜头分镜" } };
      },
    },
    {
      name: "get_video_task",
      label: "查询视频任务",
      description: "只读：按任务 ID 查询状态，不创建新任务。",
      parameters: Type.Object({ task_id: Type.String() }),
      replay: "safe",
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as { task_id: string };
        const data = await withToolTimeout("get_video_task", () => internal(`/api/video/tasks/${encodeURIComponent(p.task_id)}`, signal), signal);
        return { content: [{ type: "text", text: `任务 ${p.task_id}：${data.task?.status || "unknown"}${data.task?.progress !== undefined ? `，进度 ${data.task.progress}%` : ""}${data.task?.videoUrl ? `\n${data.task.videoUrl}` : ""}` }], details: { task: data.task, publicSummary: "已查询视频任务" } };
      },
    },
    ...(["extend_video", "edit_video"] as const).map((toolName) => ({
      name: toolName,
      label: toolName === "extend_video" ? "视频续写" : "视频编辑",
      description: toolName === "extend_video" ? "基于已有视频继续生成后续镜头。" : "基于已有视频按提示词编辑。",
      parameters: Type.Object({ video_url: Type.String(), prompt: Type.String(), provider_id: Type.Optional(Type.String()), model_id: Type.Optional(Type.String()), seconds: Type.Optional(Type.Number()) }),
      executionMode: "sequential" as const,
      execute: async (_id: string, params: unknown, signal?: AbortSignal) => {
        const p = params as { video_url: string; prompt: string; provider_id?: string; model_id?: string; seconds?: number };
        const created = await withToolTimeout(toolName, () => internal("/api/video/generate", signal, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            source: "agent", prompt: p.prompt, providerId: p.provider_id, modelId: p.model_id,
            durationSeconds: p.seconds || 4, seconds: String(p.seconds || 4), resolution: "1280x720",
            references: [{ id: `agent-${toolName}`, kind: "video", role: "source_video", url: p.video_url }],
            providerOptions: { mode: toolName === "extend_video" ? "extend" : "edit" },
          }),
        }), signal);
        const taskId = String(created.taskId || "");
        return { content: [{ type: "text" as const, text: `已创建${toolName === "extend_video" ? "续写" : "编辑"}任务 ${taskId}。任务由后台 worker 继续执行；后续用 get_video_task 查询，避免重复创建。` }], details: { taskId, cost: created.cost, publicSummary: "已创建视频任务" } };
      },
    })) as AgentTool[],
    // ── 视频生成(站内计费,失败自动退) ──
    {
      name: "generate_video",
      label: "视频生成",
      description:
        "文生视频/图生视频(4-12 秒)。站内视频服务,按次计费、失败自动退;生成约 1-3 分钟。有 [商品图] 时传 image_url 做首帧参考。",
      parameters: Type.Object({
        prompt: Type.String({ description: "画面与运镜描述,越具体越好" }),
        image_url: Type.Optional(
          Type.String({ description: "首帧参考图 URL(用户消息里的[商品图])" })
        ),
        seconds: Type.Optional(
          Type.Union([Type.Literal("4"), Type.Literal("8"), Type.Literal("12")], {
            description: "时长秒数,默认 4",
          })
        ),
        orientation: Type.Optional(
          Type.Union([Type.Literal("landscape"), Type.Literal("portrait")], {
            description: "画幅,默认横屏",
          })
        ),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          prompt: string;
          image_url?: string;
          seconds?: "4" | "8" | "12";
          orientation?: "landscape" | "portrait";
        };
        const created = await withToolTimeout(
          "generate_video",
          () =>
            internal("/api/video/generate", signal, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: p.prompt,
                imageUrl: p.image_url,
                seconds: p.seconds || "4",
                size: p.orientation === "portrait" ? "720x1280" : "1280x720",
              }),
            }),
          signal
        );
        const taskId = String(created.taskId || "");
        // 轮询:服务端惰性查上游;completed 时已转存并落画布视频节点
        const deadline = Date.now() + 270_000;
        for (;;) {
          if (signal?.aborted) throw new Error("aborted");
          await new Promise((r) => setTimeout(r, 5_000));
          if (Date.now() > deadline) {
            throw new Error(
              `视频仍在生成中(超 4.5 分钟)。任务 ${taskId} 已保留,请让用户稍后刷新画布查看,不要重复创建。`
            );
          }
          const poll = await internal(
            `/api/video/tasks?id=${encodeURIComponent(taskId)}`,
            signal
          );
          const task = poll.task as
            | { status: string; error?: string; videoUrl?: string; artworkId?: string }
            | undefined;
          if (!task) throw new Error("视频任务丢失");
          if (task.status === "failed") {
            throw new Error(task.error || "视频生成失败(积分已自动退回)");
          }
          if (task.status === "completed") {
            const url = task.videoUrl || "";
            return {
              content: [
                {
                  type: "text",
                  text: `视频已生成并保存为画布视频节点。
![生成视频](${url})`,
                },
              ],
              details: {
                url,
                artworkId: task.artworkId,
                publicSummary: "视频已生成",
              },
            };
          }
        }
      },
    },
    {
      name: "verify_image_output",
      label: "视觉检查",
      description:
        "只读且不扣积分：使用视觉模型检查生成图片是否满足任务目标，包括主体完整、无裁切/变形、文字可读、版式正确。每次图片任务交付前必须调用。",
      parameters: Type.Object({
        image_url: Type.String({ description: "需要检查的站内图片 URL" }),
        goal: Type.String({ description: "用户原始目标和本张图应满足的要求" }),
      }),
      replay: "safe",
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as { image_url: string; goal: string };
        let result: any;
        try {
          // Vision inference is not a quick GET. Bound download + inference together,
          // and propagate the owned timeout signal into both network operations.
          result = await withToolTimeout("verify_image_output", async ownedSignal => {
            const fd = new FormData();
            fd.append("image", await urlToFile(p.image_url, ownedSignal));
            fd.append("goal", p.goal.slice(0, 1200));
            return internal("/api/agent/verify-image", ownedSignal, { method: "POST", body: fd });
          }, signal);
          if (typeof result.passed !== "boolean" || typeof result.score !== "number" || !Number.isFinite(result.score)) throw new Error("Invalid inspection result");
        } catch (error) {
          if (signal?.aborted) throw error;
          return {
            content: [{ type: "text", text: "视觉检查暂未完成，已生成图片保留，本次没有自动验收结果。不要因此重新生成、重复扣费或将图片判为不合格。" }],
            details: { verificationStatus: "unavailable", imageUrl: p.image_url, publicSummary: "视觉检查暂未完成，图片已保留" },
          };
        }
        const issues = Array.isArray(result.issues)
          ? result.issues.map(String).slice(0, 8)
          : [];
        const passed = result.passed === true;
        const text = passed
          ? `视觉检查通过（${result.score ?? 0}/100）：${result.summary || "未发现明显问题"}`
          : `视觉检查未通过（${result.score ?? 0}/100）：${result.summary || "存在交付风险"}\n问题：${issues.join("；") || "未返回具体问题"}\n建议：${result.retryAdvice || "调整提示词后重新生成"}`;
        return {
          content: [{ type: "text", text }],
          details: {
            verificationStatus: passed ? "passed" : "failed",
            passed,
            score: Number(result.score) || 0,
            issues,
            retryAdvice: String(result.retryAdvice || ""),
            publicSummary: passed
              ? `视觉检查通过（${Number(result.score) || 0}/100）`
              : `视觉检查未通过：${issues[0] || "存在交付风险"}`,
          },
        };
      },
    },
  ];

  if (canvas) {
    const generation = tools.find(tool => tool.name === "generate_image")!;
    for (const tool of tools.filter(tool => ["recolor_product", "retouch_product", "replicate_hot"].includes(tool.name))) {
      tool.execute = (id, params, signal, onUpdate) => {
        const p = params as Record<string, unknown>;
        const refs=canvas.imageUrls.length?canvas.imageUrls:typeof p.image_url==="string"&&p.image_url?[p.image_url]:[];
        if(!refs.length)throw new Error("请先提供需要处理的图片");
        const prompt = tool.name === "recolor_product"
          ? `将当前参考图的商品颜色替换为 ${String(p.color || "目标颜色")}，强度 ${Number(p.strength) || 100}。保持商品形态、纹理、文字、光影及背景不变。`
          : tool.name === "retouch_product"
            ? `精修当前参考图：${Array.isArray(p.options) ? p.options.join("、") : "增强质感、修复瑕疵"}。${String(p.text || "")}。保留商品主体和原有构图。`
            : `参考当前图和上游参考图，复刻构图风格，保留当前商品身份。${String(p.text || "")}`;
        return generation.execute(id, { prompt, image_urls:refs, ratio: canvas.ratio, resolution: canvas.resolution, quality: canvas.quality, count: 1 }, signal, onUpdate);
      };
      // Canvas edits share the selected canvas.image model and its quote.
      tool.parameters = Type.Object({ ...(tool.parameters as unknown as {properties:Record<string,TSchema>}).properties, confirm: Type.Optional(Type.Boolean({ description: "仅在用户明确确认本次系统报价后设为true" })) });
    }
  }
  const creative=createCreativeTools({internal,file:urlToFile,timeout:(fn,signal)=>withToolTimeout("creative_tool",fn,signal),generation:tools.find(tool=>tool.name==="generate_image")!,canvas});
  const all=[...tools,...creative];
  // Every billed tool can accept the same explicit confirmation field, including legacy adapters.
  for(const tool of all){
    const schema=tool.parameters as unknown as {properties?:Record<string,TSchema>};
    if(schema.properties&&!schema.properties.confirm)tool.parameters=Type.Object({...schema.properties,confirm:Type.Optional(Type.Boolean({description:"仅用户明确确认本次报价后设为true"}))});
  }
  all.push({name:"list_agent_tools",label:"创作工具目录",description:"只读查询创作中心可调用的工具、参数与入口；不创建收费任务。",parameters:Type.Object({}),execute:async()=>({content:[{type:"text",text:JSON.stringify({entries:CREATIVE_AGENT_TOOLS,tools:describeNaumiTools(all)})}],details:{publicSummary:"创作工具目录已读取"}})});
  return all;
}

/** 底座无关视图:供未来非 pi 底座桥接器复用(当前 PiBridge 直接消费 AgentTool)。 */
export type NaumiToolView = {
  name: string;
  description: string;
  /** TypeBox schema 的 JSON 兼容形态 */
  parameters: Record<string, unknown>;
  write: boolean;
  timeoutMs: number;
};

export function describeNaumiTools(tools: { name: string; description: string; parameters?: TSchema }[]): NaumiToolView[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: (t.parameters || {}) as Record<string,unknown>,
    write: !!CREATIVE_TOOL_FEATURES[t.name] || !/^(search_|list_|get_|plan_|verify_|check_)/.test(t.name),
    timeoutMs: (TOOL_TIMEOUT_MS as Record<string,number>)[t.name] || (/^(search_|list_|get_|plan_)/.test(t.name) ? TOOL_TIMEOUT_MS.read_only : TOOL_TIMEOUT_MS.creative_tool),
  }));
}
