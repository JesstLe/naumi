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
  generate_aplus: 600_000,
  read_only: 15_000,
} as const;

export const AGENT_SYSTEM_PROMPT = `你是 Naumi 智能体 —— 电商 AI 出图工作站的任务助手。你可以调用站内工具完成图片生成与处理。

## 可用工具
1. search_templates / list_my_artworks / get_balance / verify_image_output:只读,不消耗积分。
2. generate_image:文生图/图生图。参数 prompt(必填)、ratio(1:1/3:4/4:3/16:9/9:16)、resolution(1K/2K)、count(1-4)。计费按张数×分辨率(1K=6/张)。
3. retouch_product:商品精修。参数 image_url、options(数组)、text。计费 6 积分。
4. recolor_product:产品换色。参数 image_url、color(如 #27AE60)、strength(20-100)。计费 6 积分。
5. replicate_hot:爆款复刻。参数 product_image_url、reference_image_url、degree(high/style)、text。计费 6 积分。
6. generate_suite:一键电商套图(13 张,约 3-6 分钟,计费 78)。参数 image_url(多张逗号分隔)、platform、text。
7. generate_aplus:A+ 详情页。参数 image_url、platform、lang、format、modules(数组)、text。计费=模块数×6。

## 工作规则
1. 用户消息里的商品图以 URL 形式出现(格式:[商品图] <url> 或工具返回的图片 URL);工具的图片参数必须传入,用户没给就先要,不要编造 URL。
2. 每次工具调用都有积分成本;同一任务参数相同不要重复调用。
3. 工具返回的图片 URL 用 Markdown 图片语法展示:![描述](url)。
4. 长耗时工具(套图/A+)先告知用户等待时间。
5. 每个生成/精修/换色/复刻/套图/A+ 任务产出后，必须调用 verify_image_output 检查至少一张代表图；套图/A+ 优先检查首图和最后一图。未通过时明确列出问题，最多只允许在结果明确失败且不会重复扣费不明时重做一次。
6. 任务完成后用中文简要总结:做了什么、视觉检查结果、产出哪些图、扣了多少积分。
7. 与图片生成无关的问题直接回答,不要调用工具。`;

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

  const tools: AgentTool[] = [
    // ── 只读(0 积分) ──
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
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          prompt: string;
          ratio?: string;
          resolution?: string;
          count?: number;
        };
        const fd = new FormData();
        fd.append("prompt", p.prompt);
        fd.append("ratio", p.ratio || "1:1");
        fd.append("resolution", p.resolution || "1K");
        fd.append("count", String(Math.min(Math.max(p.count || 1, 1), 4)));
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
        "一键电商套图:1 主图 + 4 副图 + 8 详情页,约 3-6 分钟,计费 78 积分。耗时工具,先提醒用户等待。",
      parameters: Type.Object({
        image_url: Type.String({
          description: "商品图 URL(可上传正面/侧面/背面多张,用逗号分隔)",
        }),
        platform: Type.Union(
          [
            Type.Literal("taobao"),
            Type.Literal("amazon"),
            Type.Literal("pdd"),
            Type.Literal("independent"),
          ],
          { description: "上架平台,默认 taobao" }
        ),
        text: Type.String({ description: "主标题与卖点文案,选填" }),
      }),
      executionMode: "sequential",
      execute: async (_id, params, signal) => {
        const p = params as {
          image_url: string;
          platform?: string;
          text?: string;
        };
        const fd = new FormData();
        const urls = p.image_url.split(",").map((u) => u.trim()).filter(Boolean);
        for (const u of urls) fd.append("image", await urlToFile(u, signal));
        fd.append("platform", p.platform || "taobao");
        if (p.text) fd.append("text", p.text);
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
      label: "A+ 详情页",
      description:
        "A+ 详情页:按勾选模块逐张生成,计费=模块数×6 积分。耗时约每模块 1-2 分钟。",
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
            return pollJob(
              "/api/aplus",
              created.jobId,
              TOOL_TIMEOUT_MS.generate_aplus,
              signal
            );
          },
          signal
        );
        const urls2: string[] = (d.shots ?? [])
          .filter(
            (s: { status: string; url?: string }) => s.status === "done" && s.url
          )
          .map(
            (s: { url?: string; label?: string }) => `${s.label}: ${s.url}`
          );
        return {
          content: [
            {
              type: "text",
              text: `A+ 详情页完成 ${urls2.length} 个模块:\n${urls2.join("\n")}`,
            },
          ],
          details: { urls: urls2, publicSummary: `A+ 完成 ${urls2.length} 个模块` },
        };
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

  return tools;
}
