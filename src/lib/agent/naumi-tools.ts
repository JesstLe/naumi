import {creationToolArguments,creationImageForm,type CreationSettings} from "./creation-settings";
import {webBytes} from "@/platform/bytes/web";
import {withAgentToolAttempt,agentToolAttempt,AgentToolHttpError} from "./tool-errors";
import {appendOriginalRequest} from "./execution-evidence";
import {creationContinuationHeader} from "@/lib/saas/creation-context";

import { assertAgentToolAccess } from "@/lib/feature-access/server";
import { Type, type TSchema } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {createCanvasVideoTools} from "./canvas-video-tools";
import {VIDEO_PRODUCTION_PROMPT} from "../video/production-prompt";
import {CANVAS_VIDEO_WRITE_TOOLS} from "./canvas-context";
import { createCreativeTools } from "./creative-tools";
import { CREATIVE_AGENT_TOOLS, CREATIVE_TOOL_FEATURES } from "./creative-tool-catalog";
import type { CanvasAgentContext } from "./canvas-context";
import { dataUrlToBytes, isManagedImageUrl } from "../object-storage/runtime";
import { readManagedObject } from "../object-storage/managed-read";
import {managedAgentReference} from "./managed-reference";
import { AgentHarness, validateToolArguments, HarnessError } from "./harness";
import { assertInternalAgentPath, assertMediaUrl, publicImageBytes, readBoundedBytes } from "./harness-network";
import { signAgentContinuation, CONTINUATION_HEADER } from "@/lib/release-runtime/accepted-context";
import {SHARED_IMAGEGEN_TOOLS,agentImagegenRequest} from "../imagegen/agent-request";
import {executeAgentImagegen,imagegenAgentStage} from "../imagegen/agent-executor";
import {planImagegen} from "../imagegen/plan";
import {planImagegenBatch} from "../imagegen/batch";
import type {PreparedCanvasVideoWorkflow} from "../video/canvas-workflow";
import type {ImagegenPlan} from "../imagegen/types";

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
  plan_video_script: 120_000,
  plan_video_shot: 120_000,
  plan_video_storyboard: 240_000,
  extend_video: 300_000,
  edit_video: 300_000,
  creative_tool: 300_000,

  inspect_images: 100_000,
  read_only: 15_000,
} as const;

export const AGENT_SYSTEM_PROMPT = `你是 Naumi 智能体 —— 电商 AI 出图工作站的任务助手。你可以调用站内工具完成图片生成与处理。

## 可用工具
1. search_templates / list_my_artworks / get_balance:只读,不消耗积分。
2. generate_image:文生图/图生图。参数 prompt(必填)、ratio、resolution、count、model。用户指定模型优先；参数不匹配时用 list_image_models 查询真实目录，不把某个模型的限制说成全部工具不可用，不猜模型ID。计费金额以系统当前报价为准。
3. retouch_product:商品精修。参数 image_url、options(数组)、text。计费金额以系统当前报价为准。
4. recolor_product:产品换色。参数 image_url、color(如 #27AE60)、strength(20-100)。计费金额以系统当前报价为准。
5. inspect_images:读取参考图片和文字，不能用生成结果质检代替读图。
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

## 可用工具(视频生成与持久媒体制作)
- list_video_models / list_video_workflows：查询真实模型能力和本人自备工作流输入。
- create_video_node / get_video_config / set_video_config / set_video_prompt / set_video_references：实际画布节点和有序引用，保存不代表生成。
- generate_video / extend_video / edit_video：画布使用已保存节点与revision；工作台传完整config和inputs，结果留工作台。
- get_video_task / cancel_video_task：恢复实际任务、全部产物和停止请求。
- process_video / get_video_media_task / cancel_video_media_task：持久媒体处理、多输入、多输出和真实进度。
${VIDEO_PRODUCTION_PROMPT}

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
2. 生成/编辑工具按实际报价计费，只读工具不扣积分；同一任务参数相同不要重复调用。
3. 工具返回的图片 URL 用 Markdown 图片语法展示:![描述](url)。
4. 长耗时工具(套图/A+)先告知用户等待时间。
 5. A+ 必须分两步：先调用 generate_aplus 展示每张白底母图，等待用户逐张确认；用户说某张不合格时调用 review_aplus_source(action=redo)并原样带上修改要求；只有全部通过后才调用 continue_aplus_generation。不得替用户默认通过母图。
 6. 生成完成后直接展示真实产物，由用户验收。不要自动调用视觉质检，不声称已验收或未通过，不因视觉检查重做或重复收费。需要修改时等待用户明确要求。读取用户提供的参考图仍可使用 inspect_images。
 7. 任务完成后用中文简要说明修改与产物；仅在工具返回真实扣费时说明费用，不输出任务总结模板或视觉验收段落。
 8. 与图片生成无关的问题直接回答,不要调用工具。`;

export function createNaumiTools(req: Request, agentEmail = "", getCred?: () => { cookie: string; authorization: string; creationSettings?:CreationSettings;imageQuality?: string;originalRequest?:string;billingVersion?:number;billingCredits?:number;billingOperationId?:string;imagegenPlan?:ImagegenPlan;videoWorkflow?:PreparedCanvasVideoWorkflow;imageSkill?:ImagegenPlan["request"]["skill"] }, acceptedModelContext?: string | (() => string), canvas?: CanvasAgentContext, harness?: AgentHarness, taskContext?: () => {request:string;references:string[]}|undefined): AgentTool[] {
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
    assertInternalAgentPath(path, init?.method || "GET");
    const cred=credGetter(),selected=creationImageForm(path,init?.body,"creationSettings" in cred?cred.creationSettings:undefined);
    if(selected)init={...init,body:selected.body,headers:{...init?.headers,...selected.headers}};
    // 安全规则:只读 GET 指数退避重试(≤3);收费/写请求严禁自动重试
    // (防重复扣费);HTTP 错误属确定性失败,一律不重试。
    const isRead = !init?.method || init.method === "GET";
    const attempts = isRead ? 3 : 1;
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      if (signal?.aborted) throw new Error("aborted");
      try {
        const continuation=await signAgentContinuation(agentEmail,path,init?.method||"GET");
        const attempt=agentToolAttempt(),previouslySubmitted=attempt?.mayHaveSubmitted??true;
        if(!isRead&&attempt)attempt.mayHaveSubmitted=true;
        const res = await fetch(base + path, {
          ...init,
          signal,
          redirect: "error",
          headers: { ...(init?.headers ?? {}), ...authHeaders(), ...(selected?.headers||{}), ...creationContinuationHeader(), "x-naumi-client-entry": "agent", ...(continuation?{[CONTINUATION_HEADER]:continuation}:{}) },
        });
        const bytes = await readBoundedBytes(res, 2 * 1024 * 1024);
        const data = JSON.parse(bytes.toString("utf8") || "{}");
        if (!res.ok) {
          if(attempt&&res.status>=400&&res.status<500&&res.status!==409)attempt.mayHaveSubmitted=previouslySubmitted;
          throw new AgentToolHttpError(
            harness?.publicText(String(data?.error || `工具接口返回 ${res.status}`)) || "工具接口调用失败",
            res.status,typeof data?.code==="string"&&/^[A-Z][A-Z0-9_]{0,79}$/.test(data.code)?data.code:undefined,
            attempt&&!attempt.mayHaveSubmitted?false:"unknown"
          );
        }
        return harness ? harness.sanitize(data) : data;
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
    const managed = await managedAgentReference(raw, [base, new URL(req.url).origin], agentEmail);
    if (managed) {
      if (signal?.aborted) throw new Error("aborted");
      return new File([webBytes(managed.bytes)], "reference.png", {type:managed.contentType});
    }
    if(canvas?.imageUrls.includes(raw)){
      const inline=dataUrlToBytes(raw),object=inline?{bytes:inline.bytes,contentType:inline.contentType}:isManagedImageUrl(raw)?await readManagedObject(raw,MAX_IMAGE_BYTES):null;
      if(object){if(signal?.aborted)throw new Error("aborted");if(!/^image\/(png|jpeg|webp)$/i.test(object.contentType)||object.bytes.length>MAX_IMAGE_BYTES)throw new Error("参考图片格式或大小不支持");return new File([Buffer.from(object.bytes)],"reference.png",{type:object.contentType});}
    }
    const u = assertSafeImageUrl(raw);
    assertMediaUrl(raw, base);
    if (u.origin !== base) {
      const remote = await publicImageBytes(u, ALLOWED_IMG_HOST_RE, MAX_IMAGE_BYTES, signal);
      return new File([webBytes(remote.bytes)], "reference.png", { type: remote.contentType });
    }
    const res = await fetch(u.toString(), {
      signal,
      redirect: "error", // 禁跨重定向(防绕过白名单)
      headers: u.origin === base ? authHeaders() : {},
    });
    if (!res.ok) throw new Error(`图片拉取失败(${res.status})`);
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!/^image\/(png|jpeg|webp)$/i.test(type)) {
      throw new Error(`不支持的图片类型: ${type || "未知"}`);
    }
    const buf = await readBoundedBytes(res, MAX_IMAGE_BYTES);
    if (buf.length > MAX_IMAGE_BYTES) throw new Error("图片超过 12MB 上限");
    return new File([webBytes(buf)], "image.png", { type: type || "image/png" });
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
          details: { count: items.length, urls: items.map(a=>a.url), publicSummary: `返回 ${items.length} 个作品` },
        };
      },
    },
    {
      name: "list_image_models",
      label: "图片模型能力",
      description: "只读查询当前生图模型目录、可编辑能力和参考图上限。maxReferenceImages是已启用通道中声明的最大数量，referenceLimitVerified=false表示声明尚未验证；最终以计划/工具回执为准。不修改全局默认配置。",
      parameters: Type.Object({}), executionMode: "sequential",
      execute: async (_id,_params,signal) => {
        const d=await withToolTimeout("read_only",()=>internal("/api/models?feature=image.generate",signal),signal);
        return {content:[{type:"text",text:JSON.stringify(d)}],details:{publicSummary:"已读取当前图片模型能力"}};
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
        count: Type.Integer({minimum:1,maximum:4, description: "生成张数 1-4,默认 1" }),
        model: Type.Optional(
          Type.String({
            description:
              "生图模型 id。用户明确选择优先；否则从list_image_models真实目录选择适合参考数量/参数的模型，不猜ID。省略使用当前默认。",
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
        fd.append("text",appendOriginalRequest(p.text||"",taskContext?.()?.request));
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
        fd.append("text",appendOriginalRequest(p.text||"",taskContext?.()?.request));
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
        fd.append("text",appendOriginalRequest(p.text||"",taskContext?.()?.request));
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
        fd.append("text",appendOriginalRequest(p.text||"",taskContext?.()?.request));
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
                source:canvas?"canvas":"workbench",projectKey:canvas?.video?.projectKey,artworkId:canvas?.anchorId||undefined,
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
        if(d.taskId)return {content:[{type:"text",text:`自备视频任务已提交：${d.taskId}。请查询实际状态，Worker继续恢复。`}],details:{taskId:d.taskId,cost:d.cost,publicSummary:"自备视频任务已提交"}};
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
            images: images.map((im) => im.url), videos: videos.map(v=>v.url),
            publicSummary: `工作流出图 ${images.length} 张/视频 ${videos.length} 个`,
          },
        };
      },
    },
    {
      name: "inspect_images",
      label: "读取图片",
      description: "只读识别用户给出的图片、逐字提取可见文字并比较构图/颜色。不会生成图片，不把未读清内容补写为事实。",
      parameters: Type.Object({image_urls:Type.Array(Type.String(),{minItems:1,maxItems:6}),question:Type.String({minLength:1,maxLength:2000})}),
      replay: "safe", executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p=params as {image_urls:string[];question:string};
        const d=await withToolTimeout("inspect_images",async owned=>{
          const fd=new FormData();fd.append("mode","inspect");fd.append("goal",p.question);
          for(const url of p.image_urls)fd.append("reference",await urlToFile(url,owned));
          return internal("/api/agent/verify-image",owned,{method:"POST",body:fd});
        },signal);
        if(typeof d.description!=="string"||!d.description.trim())throw new Error("读图未返回有效内容，请核对该次工具错误，不推断素材为空");
        return {content:[{type:"text",text:d.description}],details:{publicSummary:"图片读取完成",inspectionStatus:"completed"}};
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
  const videoTools=createCanvasVideoTools({actor:agentEmail,canvas,internal,preparedWorkflow:()=>{const cred=credGetter();return "videoWorkflow" in cred?cred.videoWorkflow:undefined;},confirmation:()=>{const cred=credGetter();return "billingVersion" in cred&&typeof cred.billingVersion==="number"&&"billingCredits" in cred&&typeof cred.billingCredits==="number"?{version:cred.billingVersion,credits:cred.billingCredits}:undefined;}});
  const all=[...tools,...creative,...videoTools];
  for(const tool of all)if(SHARED_IMAGEGEN_TOOLS.has(tool.name)){
    const legacyExecute=tool.execute,existing=(tool.parameters as unknown as {properties:Record<string,TSchema>}).properties;
    tool.parameters=Type.Object({...existing,ratio:Type.Optional(Type.String({pattern:"^(auto|[1-9]\\d{0,5}:[1-9]\\d{0,5})$",description:"默认auto。仅用户明确指定比例才填写数字比例。自适应跟随本次构图关键图的实际宽高，不按上传顺序，也不默认方图。"})),frame_image_url:Type.Optional(Type.String({description:"本次构图关键图的URL，必须来自image_urls。产品替换场景选布局参考图，产品图仅提供主体；风格/色彩图不决定画幅。多图任务根据用户意图与图像内容确定，确有歧义时询问用户，不猜测。"})),image_urls:Type.Optional(Type.Array(Type.String(),{maxItems:32})),input_roles:Type.Optional(Type.Array(Type.Union(["edit-target","reference","insert","style"].map(v=>Type.Literal(v))),{maxItems:32,description:"与image_urls逐一对应；修改已有图必须有edit-target。换产品时原布局图=edit-target，新产品=insert，配色图=style。不要全部标reference。"})),mask_url:tool.name==="inpaint_image"?existing.mask_url:Type.Optional(Type.String()),background:Type.Optional(Type.Union([Type.Literal("transparent"),Type.Literal("opaque")])),use_case:Type.Optional(Type.String()),augment:Type.Optional(Type.Boolean()),batch_prompts:Type.Optional(Type.Array(Type.Object({key:Type.Optional(Type.String({pattern:"^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$"})),name:Type.Optional(Type.String({minLength:1,maxLength:100})),prompt:Type.String({minLength:1,maxLength:6000})}),{minItems:1,maxItems:100})),batch_concurrency:Type.Optional(Type.Integer({minimum:1,maximum:5})),batch_attempts:Type.Optional(Type.Integer({minimum:1,maximum:3})),batch_fail_fast:Type.Optional(Type.Boolean()),local_process:Type.Optional(Type.Boolean({description:"仅在用户要求转换格式、缩小尺寸或控制底色去背景时开启；处理原图，不调用收费模型"})),chroma:Type.Optional(Type.Object({keyColor:Type.Optional(Type.String({pattern:"^#[a-fA-F0-9]{6}$"})),tolerance:Type.Optional(Type.Integer({minimum:0,maximum:255})),autoKey:Type.Optional(Type.Union(["none","corners","border"].map(v=>Type.Literal(v)))),softMatte:Type.Optional(Type.Boolean()),transparentThreshold:Type.Optional(Type.Number({minimum:0,maximum:255})),opaqueThreshold:Type.Optional(Type.Number({minimum:0,maximum:255})),edgeFeather:Type.Optional(Type.Number({minimum:0,maximum:64})),edgeContract:Type.Optional(Type.Integer({minimum:0,maximum:16})),spillCleanup:Type.Optional(Type.Boolean())})),output_format:Type.Optional(Type.Union(["png","jpeg","webp"].map(v=>Type.Literal(v)))),compression:Type.Optional(Type.Integer({minimum:0,maximum:100})),compression_mode:Type.Optional(Type.Union([Type.Literal("local"),Type.Literal("native")])),flatten_color:Type.Optional(Type.String({pattern:"^#[a-fA-F0-9]{6}$"})),downscale_max_dim:Type.Optional(Type.Integer({minimum:64,maximum:8192})),input_fidelity:Type.Optional(Type.String()),moderation:Type.Optional(Type.String()),width:Type.Optional(Type.Integer({minimum:64,maximum:5120})),height:Type.Optional(Type.Integer({minimum:64,maximum:5120}))});
    tool.execute=async(id,args,signal,onUpdate)=>{
      if((args as any)._category)return legacyExecute(id,args,signal,onUpdate);
      const cred=credGetter(),prepared="imagegenPlan" in cred?cred.imagegenPlan:undefined;
      const sharedRequest=prepared?undefined:await agentImagegenRequest(tool.name,args as Record<string,any>,agentEmail,canvas,cred.imageQuality,"imageSkill" in cred?cred.imageSkill:undefined,"originalRequest" in cred?cred.originalRequest:undefined);
      const plan=prepared||await (sharedRequest!.mode==="batch"?planImagegenBatch:planImagegen)(sharedRequest!,agentEmail);
      if(!prepared&&plan.totalCredits>0&&harness)throw new Error("请先通过系统图像计划报价后执行");
      return executeAgentImagegen(plan,agentEmail,signal,result=>onUpdate?.(imagegenAgentStage(result)));
    };
  }
  // Every billed tool can accept the same explicit confirmation field, including legacy adapters.
  for(const tool of all){
    const schema=tool.parameters as unknown as {properties?:Record<string,TSchema>};
    if(schema.properties&&!schema.properties.confirm)tool.parameters=Type.Object({...schema.properties,confirm:Type.Optional(Type.Boolean({description:"仅用户明确确认本次报价后设为true"}))});
  }
  all.push({name:"list_agent_tools",label:"创作工具目录",description:"只读查询创作中心可调用的工具、参数与入口；不创建收费任务。",parameters:Type.Object({}),execute:async()=>({content:[{type:"text",text:JSON.stringify({entries:CREATIVE_AGENT_TOOLS,tools:describeNaumiTools(all)})}],details:{publicSummary:"创作工具目录已读取"}})});
  return all.map(tool => {
    const execute = tool.execute;
    return { ...tool, execute: (id, args, signal, onUpdate) => withAgentToolAttempt(async () => {
      const credentials = credGetter();
      await assertAgentToolAccess(agentEmail, tool.name, canvas ? "canvas" : "workbench", new Request(req.url, { headers: { cookie: credentials.cookie, authorization: credentials.authorization } }));
      validateToolArguments(tool.parameters, args);
      if (signal?.aborted) throw new HarnessError("RUN_INACTIVE", 409);
      const effectiveArgs=creationToolArguments(tool.name,args as Record<string,unknown>,"creationSettings" in credentials?credentials.creationSettings:undefined);
      if (!harness) return execute(id, effectiveArgs, signal, onUpdate);
      return harness.execute(tool.name, args, id, signal, async owned => {
        const result = harness.sanitize(await execute(id, effectiveArgs, owned, onUpdate ? result => onUpdate(harness.sanitize(result)) : undefined));
        // Keep raw details for owned output mounting; only text goes back to the model.
        return {...result, content:result.content.map(part => part.type === "text" ? {...part,text:`[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify(part.text)}\n[/UNTRUSTED_TOOL_RESULT]`} : part)};
      });
    }) };
  });
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
    write: CANVAS_VIDEO_WRITE_TOOLS.has(t.name) || !!CREATIVE_TOOL_FEATURES[t.name] || !/^(search_|list_|get_|plan_|verify_|check_|inspect_)/.test(t.name),
    timeoutMs: (TOOL_TIMEOUT_MS as Record<string,number>)[t.name] || (/^(search_|list_|get_|plan_)/.test(t.name) ? TOOL_TIMEOUT_MS.read_only : TOOL_TIMEOUT_MS.creative_tool),
  }));
}
