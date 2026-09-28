import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

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
  read_only: 15_000,
} as const;

export const AGENT_SYSTEM_PROMPT = `你是 Naumi 智能体 —— 电商 AI 出图工作站的任务助手。你可以调用站内工具完成图片生成与处理。

## 可用工具
1. search_templates / list_my_artworks / get_balance / verify_image_output:只读,不消耗积分。
2. generate_image:文生图/图生图。参数 prompt(必填)、ratio(1:1/3:4/4:3/16:9/9:16)、resolution(1K/2K)、count(1-4)、model(仅当用户明确点名生图模型时填写)。计费按张数×分辨率(1K=6/张)。
3. retouch_product:商品精修。参数 image_url、options(数组)、text。计费 6 积分。
4. recolor_product:产品换色。参数 image_url、color(如 #27AE60)、strength(20-100)。计费 6 积分。
5. replicate_hot:爆款复刻。参数 product_image_url、reference_image_url、degree(high/style)、text。计费 6 积分。
6. generate_suite:一键电商套图。默认智能生成 13 张；用户指定数量/版式时传 structure=custom 与 shots。每张 6 积分。
 7. generate_aplus:A+ 第一步，只提取白底商品母图并返回待审核图片与 job_id。参数 image_url、platform、lang、format、modules(数组)、text。
 8. review_aplus_source:审核一张母图。approve=通过；redo=带用户要求只重做这一张。
 9. continue_aplus_generation:全部母图通过后继续生成 A+，此时计费=模块数×6。
 10. generate_packaging_3d:把模切线/刀版图折叠为包装 3D 产品效果图。参数 image_url、package_type、view、material、background、resolution、text。

## 可用工具(ComfyUI 工作流 · 用户自备算力端点,不扣站内积分)
- list_comfy_workflows:只读。列出用户已导入的 ComfyUI 工作流(id/名称/输入概况)。要跑工作流前先调它拿 workflow_id。
- run_comfy_workflow:在用户自己的 ComfyUI 端点上执行工作流。参数 workflow_id(必填)、prompt(正向提示词,可选)、image_url(用户给的[商品图] URL,工作流有图槽时传)、seed/width/height/length(可选)。
  注意:算力在用户端点,不消耗积分;执行可能数分钟(视频更久);产物图片用 Markdown 展示,视频给下载链接。用户没配端点或没导入工作流时,引导去画布选中图片点「工作流」配置,不要反复重试。

## 可用工具(视频生成 · 站内 OpenAI videos 协议,按次计费)
- generate_video:文生视频/图生视频。参数 prompt(必填,描述画面与运镜)、image_url(可选,用户消息里的[商品图]作首帧参考)、seconds(4/8/12,默认 4)、size(横屏 1280x720/竖屏 720x1280)。
  注意:需要站内已配置视频服务(未配置时报错就引导联系站长);一次生成约 1-3 分钟;完成后产物是画布视频节点,同时给用户视频下载链接;计费按次(失败自动退)。

## 可用工具(鱼塘任务 · 澜序协作 — 营销单/刷任务派发系统)
- yutang_summary:只读。汇总鱼塘任务全景:今日任务数、待回传订单、评价进度、各店铺分布。
- yutang_list_tasks:只读。按筛选条件列出任务(状态/负责人/店铺/关键词)。
- yutang_get_task:只读。查单个任务详情(含订单与评价状态)。
- yutang_create_task:写。创建放单任务(店铺/商品图/宝贝ID/关键词/单数/价格/时段/要求)。计费 0 但产生真实业务动作,创建前必须与用户确认内容。
- yutang_update_task:写。修改任务(状态/负责人/备注等)。修改前与用户确认改动点。

## 可用工具(差评巡检 — 淘宝/天猫评价监控)
- review_history:只读。按商品ID查历史评价台账(差评/数量变化)。数据源为本地台账,不开浏览器。
- review_demo:只读。生成演示巡检报告(展示报告形态)。在线采集需人工授权浏览器,Agent 不自动触发。

## 可用工具(SCM 上架 — 阿里健康新品发布·资料体检)
- scm_preflight:只读。校验商品资料 JSON 是否齐备可上架(供应商/品牌/条码/图片槽位/类目),输出大白话缺件清单。用户要上架时先跑这个。
- scm_doctor:只读。SCM 环境体检(专用浏览器/登录状态)。
⚠️ 自动填表与提交发布不开放给 Agent——按 skill 两道闸门,需人工在浏览器核对后执行。

## 工作规则
0. 鱼塘工具的修改类操作(create/update)会直接改动真实业务数据——执行前必须向用户复述将要做出的改动并获得确认;用户已明确指令时可直接执行并汇报结果。
0.5 大额计费确认闸:当一次工具调用预计花费 ≥20 积分(套图、A+、多张/2K 生图等)时,系统会拦截第一次调用并提示报价。此时必须先向用户报出预计积分数,等用户明确同意后,再携带 confirm=true 重新调用同一工具;用户拒绝或犹豫就不要执行,改为给出更小规模的替代方案。
1. 用户消息里的商品图以 URL 形式出现(格式:[商品图] <url> 或工具返回的图片 URL);工具的图片参数必须传入,用户没给就先要,不要编造 URL。
2. 每次工具调用都有积分成本;同一任务参数相同不要重复调用。
3. 工具返回的图片 URL 用 Markdown 图片语法展示:![描述](url)。
4. 长耗时工具(套图/A+)先告知用户等待时间。
 5. A+ 必须分两步：先调用 generate_aplus 展示每张白底母图，等待用户逐张确认；用户说某张不合格时调用 review_aplus_source(action=redo)并原样带上修改要求；只有全部通过后才调用 continue_aplus_generation。不得替用户默认通过母图。
 6. 每个生成/精修/换色/复刻/套图/A+ 任务产出后，必须调用 verify_image_output 检查至少一张代表图；套图/A+ 优先检查首图和最后一图。未通过时明确列出问题，最多只允许在结果明确失败且不会重复扣费不明时重做一次。
 7. 任务完成后用中文简要总结:做了什么、视觉检查结果、产出哪些图、扣了多少积分。
 8. 与图片生成无关的问题直接回答,不要调用工具。`;

export function createNaumiTools(req: Request, agentEmail = "", getCred?: () => { cookie: string; authorization: string }): AgentTool[] {
  // 双凭证:可变 getter —— 每次工具执行时读取最新 cookie/authorization,
  // 常驻会话的凭证刷新(runtime 层 existing.cred = cred)即刻生效,无需重建 Agent。
  const credGetter =
    getCred ??
    (() => ({
      cookie: req.headers.get("cookie") ?? "",
      authorization: req.headers.get("authorization") ?? "",
    }));
  // 内部 origin:INTERNAL_APP_ORIGIN env(容器内固定) > 请求 origin > 容器缺省
  const envOrigin = (process.env.INTERNAL_APP_ORIGIN || "").replace(/\/+$/, "");
  const reqOrigin = new URL(req.url).origin;
  const base = envOrigin || reqOrigin || "http://127.0.0.1:3000";

  const authHeaders = (): Record<string, string> => {
    const cred = credGetter();
    return {
      cookie: cred.cookie,
      ...(cred.authorization ? { authorization: cred.authorization } : {}),
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
          headers: { ...(init?.headers ?? {}), ...authHeaders() },
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
      if (d.status === "error") throw new Error(d.error || "任务失败");
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

  // ── 鱼塘任务(澜序协作)API 封装:独立登录会话,凭据来自 env ──
  const YT = (process.env.YUTANG_API_BASE || "http://host.docker.internal:8766").replace(/\/+$/, "");
  const YT_USER = process.env.YUTANG_USER || "h13365319844";
  const YT_PASS = process.env.YUTANG_PASS || "renda2026";
  let ytCookie = "";
  let ytLoginAt = 0;

  async function ytLogin(signal?: AbortSignal): Promise<string> {
    if (ytCookie && Date.now() - ytLoginAt < 3_600_000) return ytCookie;
    const res = await fetch(YT + "/api/login", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: YT_USER, password: YT_PASS }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error("鱼塘登录失败: " + (data.error || res.status));
    const m = (res.headers.get("set-cookie") || "").match(/fishpond_session=([^;]+)/);
    if (!m) throw new Error("鱼塘登录未返回会话");
    ytCookie = "fishpond_session=" + m[1];
    ytLoginAt = Date.now();
    return ytCookie;
  }

  async function ytApi(path: string, signal: AbortSignal | undefined, init?: RequestInit): Promise<any> {
    const cookie = await ytLogin(signal);
    const res = await fetch(YT + path, {
      ...init,
      signal,
      headers: { ...(init?.headers || {}), cookie },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "鱼塘接口 " + path + " 返回 " + res.status);
    // GET /api/state 返回 {ok, state:{tasks,orders,...}, version}:剥壳取 state
    if (path === "/api/state" && data && typeof data === "object" && "state" in data) {
      return data.state ?? {};
    }
    return data;
  }

  function ytBrief(t: any): string {
    const total = Number(t.qty) || 0;
    const done = Number(t.completed) || 0;
    return (t.store || "未知店铺") + " · " + (t.productName || t.note || "无备注")
      + " · 负责人:" + (t.owner || "—") + " · " + done + "/" + total + " 单 · " + (t.status || "");
  }

  const yutangTools: AgentTool[] = [
    {
      name: "yutang_summary",
      label: "鱼塘·任务全景",
      description:
        "只读。鱼塘任务系统全景:总任务数、状态分布、B端回传订单数、评价进度、店铺分布。用户问『鱼塘怎么样/今天几单/任务进度』时调用。",
      parameters: Type.Object({}),
      executionMode: "sequential",
      execute: async (_id, _params, signal) => {
        const st: any = await withToolTimeout("read_only", () => ytApi("/api/state", signal), signal);
        const tasks: any[] = st.tasks || [];
        const orders: any[] = st.orders || [];
        const reviews: any[] = st.reviews || [];
        const byStatus: Record<string, number> = {};
        const byStore: Record<string, number> = {};
        for (const t of tasks) {
          byStatus[t.status || "未知"] = (byStatus[t.status || "未知"] || 0) + 1;
          byStore[t.store || "未知"] = (byStore[t.store || "未知"] || 0) + 1;
        }
        const lines = [
          "任务总数:" + tasks.length,
          ...Object.entries(byStatus).map(([k, v]) => "  " + k + ":" + v),
          "B端已回传订单:" + orders.length,
          "评价记录:" + reviews.length,
          "店铺分布:" + Object.entries(byStore).map(([k, v]) => k + "(" + v + ")").join(", "),
        ];
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { publicSummary: "汇总 " + tasks.length + " 个任务 / " + orders.length + " 单 / " + reviews.length + " 条评价" },
        };
      },
    },
    {
      name: "yutang_list_tasks",
      label: "鱼塘·任务列表",
      description:
        "只读。按条件筛选任务:状态(待执行/进行中/已完成)、负责人、店铺、宝贝ID或关键词。最多返回 20 条。",
      parameters: Type.Object({
        status: Type.String({ description: "状态过滤,选填" }),
        owner: Type.String({ description: "负责人过滤,选填" }),
        store: Type.String({ description: "店铺过滤,选填" }),
        keyword: Type.String({ description: "宝贝ID/关键词,选填" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p: any = params;
        const st: any = await withToolTimeout("read_only", () => ytApi("/api/state", signal), signal);
        let tasks: any[] = st.tasks || [];
        if (p.status) tasks = tasks.filter((t: any) => (t.status || "").includes(p.status));
        if (p.owner) tasks = tasks.filter((t: any) => (t.owner || "").includes(p.owner));
        if (p.store) tasks = tasks.filter((t: any) => (t.store || "").includes(p.store));
        if (p.keyword) tasks = tasks.filter((t: any) => JSON.stringify(t).includes(p.keyword));
        const shown = tasks.slice(0, 20).map((t: any, i: number) => (i + 1) + ". " + ytBrief(t) + " [id=" + t.id + "]");
        return {
          content: [{ type: "text", text: "匹配 " + tasks.length + " 个任务:\n" + (shown.join("\n") || "(无)") }],
          details: { publicSummary: "命中 " + tasks.length + " 个任务" },
        };
      },
    },
    {
      name: "yutang_get_task",
      label: "鱼塘·任务详情",
      description: "只读。单个任务详情:基本信息、关联订单回传、评价状态。",
      parameters: Type.Object({
        task_id: Type.String({ description: "任务 id(从列表获得)" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p: any = params;
        const st: any = await withToolTimeout("read_only", () => ytApi("/api/state", signal), signal);
        const task = (st.tasks || []).find((t: any) => String(t.id) === String(p.task_id));
        if (!task) throw new Error("任务 " + p.task_id + " 不存在");
        const orders: any[] = (st.orders || []).filter((o: any) => String(o.taskId) === String(p.task_id));
        const reviews: any[] = (st.reviews || []).filter((r: any) =>
          orders.some((o: any) => String(o.id) === String(r.orderId)));
        const lines = [
          "任务:" + (task.store || "") + " " + (task.productName || task.note || ""),
          "负责人:" + (task.owner || "—") + " · 状态:" + (task.status || "—"),
          "数量:" + (task.completed || 0) + "/" + (task.qty || 0) + " 单",
          "关联订单:" + orders.length + " 条",
          ...orders.slice(0, 10).map((o: any, i: number) =>
            "  " + (i + 1) + ". 订单号:" + (o.orderNumber || "(未回传)") + " 金额:" + (o.amount || "—")),
          "评价:" + reviews.length + " 条",
        ];
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { publicSummary: "任务详情(" + orders.length + " 单)" },
        };
      },
    },
    {
      name: "yutang_create_task",
      label: "鱼塘·创建任务",
      description:
        "写操作。创建放单任务:店铺、商品图、宝贝ID、关键词、单数、价格、执行时段。会生成真实派单——创建前必须向用户复述任务内容并获得确认。",
      parameters: Type.Object({
        store: Type.String({ description: "店铺名称" }),
        product_image_url: Type.String({ description: "商品图 URL" }),
        product_id: Type.String({ description: "宝贝ID" }),
        keyword: Type.String({ description: "搜索关键词" }),
        qty: Type.Number({ description: "单数" }),
        price: Type.String({ description: "单价,如 51.90" }),
        hours: Type.String({ description: "执行时段,如 09-14" }),
        note: Type.String({ description: "补充要求,选填" }),
        owner: Type.String({ description: "负责人,选填" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p: any = params;
        const fd = new FormData();
        fd.append("image", await urlToFile(String(p.product_image_url), signal));
        const task: Record<string, unknown> = {
          store: p.store,
          productId: p.product_id,
          keyword: p.keyword,
          qty: p.qty,
          price: p.price,
          note: p.note || "",
          owner: p.owner || "主账号",
          hours: p.hours || "00-23",
          status: "待执行",
          createdAt: Date.now(),
        };
        fd.append("task", JSON.stringify(task));
        await withToolTimeout("read_only",
          () => ytApi("/api/state", signal, { method: "POST", body: fd }),
          signal);
        return {
          content: [{ type: "text", text: "任务已创建:" + p.store + " " + p.keyword + " x" + p.qty + " 单" }],
          details: { publicSummary: "创建任务:" + p.keyword + " x" + p.qty },
        };
      },
    },
    {
      name: "yutang_update_task",
      label: "鱼塘·修改任务",
      description:
        "写操作。修改已有任务字段(状态/负责人/备注等)。只提交被修改的单个任务。修改前必须向用户复述改动内容。",
      parameters: Type.Object({
        task_id: Type.String({ description: "任务 id" }),
        fields: Type.String({ description: '要改的字段 JSON,如 {"status":"已完成"}' }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p: any = params;
        const st: any = await withToolTimeout("read_only", () => ytApi("/api/state", signal), signal);
        const task = (st.tasks || []).find((t: any) => String(t.id) === String(p.task_id));
        if (!task) throw new Error("任务 " + p.task_id + " 不存在");
        const fields = JSON.parse(p.fields) as Record<string, unknown>;
        Object.assign(task, fields);
        const fd = new FormData();
        fd.append("task", JSON.stringify(task));
        await withToolTimeout("read_only",
          () => ytApi("/api/state", signal, { method: "POST", body: fd }),
          signal);
        return {
          content: [{ type: "text", text: "任务 " + p.task_id + " 已更新:" + Object.keys(fields).join(", ") }],
          details: { publicSummary: "更新任务字段:" + Object.keys(fields).join("/") },
        };
      },
    },
  ];

    // ── 差评巡检(本地适配器 3966,复用 tmall-review-monitor skill) ──
  const RM = (process.env.REVIEW_MONITOR_BASE || "http://host.docker.internal:3966").replace(/\/+$/, "");

  async function rmApi(path: string, signal: AbortSignal | undefined, body?: unknown): Promise<any> {
    const res = await fetch(RM + path, {
      method: body ? "POST" : "GET",
      signal,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "巡检接口 " + path + " 返回 " + res.status);
    return data;
  }

  // ── SCM 上架(本地适配器 3967,复用 scm-product-listing skill 的安全部分) ──
  const SCM = (process.env.SCM_LISTING_BASE || "http://host.docker.internal:3967").replace(/\/+$/, "");

  async function scmApi(path: string, signal: AbortSignal | undefined, body?: unknown): Promise<any> {
    const res = await fetch(SCM + path, {
      method: body ? "POST" : "GET",
      signal,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "SCM 接口 " + path + " 返回 " + res.status);
    return data;
  }

  const scmTools: AgentTool[] = [
    {
      name: "scm_preflight",
      label: "SCM·资料体检",
      description:
        "只读。校验商品资料是否齐备可上架:必填项(供应商主体/品牌/品名/类目路径/13位条码/图片槽位 main,unfold,back,license)、条码 EAN-13 合法性与占用、可选项默认行为提示。输出大白话缺件清单。用户表达上架意图时先调用此工具。",
      parameters: Type.Object({
        product: Type.Record(Type.String(), Type.Unknown(), {
          description: "商品资料对象:supplier(供应商主体)、brand、itemName(品名)、category(类目数组,如 [医疗器械,保健理疗])、barCode(13位条码)、images({main,unfold,back,license} 图片路径)",
        }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p: any = params;
        const d: any = await withToolTimeout(
          "read_only",
          () => scmApi("/preflight", signal, { product: p.product }),
          signal
        );
        return {
          content: [{ type: "text", text: d.report || "体检完成" }],
          details: { publicSummary: d.ok ? "资料齐备可开跑" : "体检完成,有待补项" },
        };
      },
    },
    {
      name: "scm_doctor",
      label: "SCM·环境体检",
      description: "只读。检查 SCM 专用浏览器与登录状态,输出大白话报告(如'未登录,请在浏览器手动登录一次')。",
      parameters: Type.Object({}),
      executionMode: "sequential",
      execute: async (_id, _params, signal) => {
        const d: any = await withToolTimeout(
          "read_only",
          () => scmApi("/doctor", signal),
          signal
        );
        return {
          content: [{ type: "text", text: d.report || "体检完成" }],
          details: { publicSummary: "SCM 环境体检完成" },
        };
      },
    },
  ];

  const reviewTools: AgentTool[] = [
    {
      name: "review_history",
      label: "差评巡检·历史查询",
      description:
        "只读。按商品ID(6-15位数字)查历史评价台账:各商品评论数变化、新增差评内容、严重度。数据来自本地台账;无历史时返回 not_found。用户问『差评/评价变化/巡检结果』时调用。",
      parameters: Type.Object({
        items: Type.Array(Type.String(), { description: "商品ID数组" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p: any = params;
        const d: any = await withToolTimeout(
          "read_only",
          () => rmApi("/history", signal, { items: p.items }),
          signal
        );
        const lines = (d.items || []).map((it: any) => {
          if (it.status === "not_found") return `${it.item_id}: 尚无历史数据`;
          const rows: any[] = it.rows || [];
          const neg = rows.filter((r) => r.negative);
          return `${it.item_id}: ${rows.length} 条记录,${neg.length} 条差评` +
            (neg.slice(0, 3).map((r) => "\n  · " + (r.content || "").slice(0, 60)).join(""));
        });
        return {
          content: [{ type: "text", text: "查询结果:\n" + lines.join("\n") }],
          details: { publicSummary: "查询 " + ((d.items || []).length) + " 个商品台账" },
        };
      },
    },
    {
      name: "review_demo",
      label: "差评巡检·演示报告",
      description: "只读。生成演示巡检报告,展示巡检报告的形态(商品/变化/新增差评/建议)。在线采集需人工授权,Agent 不触发。",
      parameters: Type.Object({}),
      executionMode: "sequential",
      execute: async (_id, _params, signal) => {
        const d: any = await withToolTimeout(
          "read_only",
          () => rmApi("/demo", signal, {}),
          signal
        );
        return {
          content: [{ type: "text", text: d.ok ? "演示报告已生成(见 skill reports/api-demo.md)" : "演示生成失败" }],
          details: { publicSummary: "生成演示巡检报告" },
        };
      },
    },
  ];

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
        "文生图/图生图:按提示词生成电商商品图。计费=count×分辨率档(1K=6/张,2K=9/张)。",
      parameters: Type.Object({
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
        resolution: Type.Union([Type.Literal("1K"), Type.Literal("2K")], {
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
              "预算确认标记。本次调用预计花费 ≥20 积分时,必须先向用户报价并获得明确同意,再携带 confirm=true 调用;小额或已确认过则可省略。",
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
        };
        const fd = new FormData();
        fd.append("prompt", p.prompt);
        fd.append("ratio", p.ratio || "1:1");
        fd.append("resolution", p.resolution || "1K");
        fd.append("count", String(Math.min(Math.max(p.count || 1, 1), 4)));
        if (p.model) fd.append("model", p.model);
        const d = await withToolTimeout(
          "generate_image",
          async () => {
            const created = await internal("/api/generate-image", signal, {
              method: "POST",
              body: fd,
            });
            return pollJob(
              "/api/generate-image",
              created.jobId,
              TOOL_TIMEOUT_MS.generate_image,
              signal
            );
          },
          signal
        );
        const urls: string[] = (d.images ?? []).map((im: { url: string }) => im.url);
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
        "商品精修:增强光泽、修复瑕疵、提升清晰度、色彩校正。商品与构图不变,只提升质感。计费 6 积分。",
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
        "产品换色:把商品主体换成目标颜色,形态纹理光影背景不变。计费 6 积分。",
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
        "爆款复刻:参照爆款参考图的构图风格,把商品原图的产品放进去。计费 6 积分。",
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
        "一键电商套图:默认 1 主图 + 4 副图 + 8 详情页；也可按用户要求自定义每张的类型、标题、比例与内容。每张 6 积分。",
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
              "预算确认标记。套图通常花费较高(每张 6 积分),必须先向用户报出总预计积分并获得明确同意,再携带 confirm=true 调用。",
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
              "预算确认标记。A+ 按模块计费通常 ≥20 积分,必须先向用户报出总预计积分并获得明确同意,再携带 confirm=true 调用。",
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
    // ── 视频生成(OpenAI videos 协议,站内计费,失败自动退) ──
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
视频链接: ${url}
请把该链接原样给用户(可下载)。`,
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
        const fd = new FormData();
        fd.append("image", await urlToFile(p.image_url, signal));
        fd.append("goal", p.goal.slice(0, 1200));
        const result = await withToolTimeout(
          "read_only",
          () =>
            internal("/api/agent/verify-image", signal, {
              method: "POST",
              body: fd,
            }),
          signal
        );
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

  return [...tools, ...yutangTools, ...reviewTools, ...scmTools];
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

export function describeNaumiTools(tools: { name: string; description: string }[]): NaumiToolView[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {},
    write: false,
    timeoutMs: 0,
  }));
}
