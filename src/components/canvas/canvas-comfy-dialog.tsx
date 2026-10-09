"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Cloud,
  Loader2,
  Plus,
  RefreshCw,
  Share2,
  Sparkles,
  Store,
  Trash2,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import { authHeader } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Artwork } from "@/lib/mock-data";

// ---------------------------------------------------------------------------
// 画布 ComfyUI 工作流面板(BYOC 一期):端点管理 + 工作流导入/缺件预检 + 参数运行。
// 自包含所有交互;执行与产物落地由画布侧回调完成(血缘挂树/占位进度在那边),
// 面板负责展示视频产物(画布视频节点属后续里程碑)。
// ---------------------------------------------------------------------------

type EndpointView = {
  id: string;
  name: string;
  baseUrl: string;
  hasKey: boolean;
  isActive: boolean;
};

type WorkflowView = {
  id: string;
  name: string;
  inputs: {
    images: { nodeId: string; label: string; current: string }[];
    texts: { nodeId: string; label: string; role: string; current: string }[];
    seeds: { nodeId: string; field: string; current: number }[];
    numerics: { nodeId: string; field: string; label: string; current: number }[];
  } | null;
  required: string[] | null;
  note: string;
  isPublic: boolean;
  updatedAt: string;
};

type MarketItem = {
  id: string;
  name: string;
  author: string;
  note: string;
  inputs: WorkflowView["inputs"];
  updatedAt: string;
};

export type ComfyRunPayload = {
  workflowId: string;
  texts: Record<string, string>;
  seeds: Record<string, number>;
  numerics: Record<string, Record<string, number>>;
};

export type ComfyRunResult = {
  images?: { id: string; url: string }[];
  videos?: { url: string; mime: string }[];
};

export function CanvasComfyDialog({
  open,
  onClose,
  source,
  onRun,
}: {
  open: boolean;
  onClose: () => void;
  source: Artwork | null;
  /** 由画布实现:占位节点 → 执行 → 图片产物挂树;返回结果供面板展示视频 */
  onRun: (payload: ComfyRunPayload) => Promise<ComfyRunResult>;
}) {
  const [tab, setTab] = useState<"run" | "endpoint" | "import" | "market">("run");
  const [endpoints, setEndpoints] = useState<EndpointView[] | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowView[] | null>(null);
  const [market, setMarket] = useState<MarketItem[] | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [workflowId, setWorkflowId] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [seeds, setSeeds] = useState<Record<string, number>>({});
  const [numerics, setNumerics] = useState<Record<string, Record<string, number>>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ComfyRunResult | null>(null);
  const [error, setError] = useState("");
  // 端点表单
  const [epName, setEpName] = useState("");
  const [epUrl, setEpUrl] = useState("");
  const [epKey, setEpKey] = useState("");
  const [epBusy, setEpBusy] = useState("");
  // 导入表单
  const [wfName, setWfName] = useState("");
  const [wfJson, setWfJson] = useState("");
  const [wfBusy, setWfBusy] = useState(false);
  const [wfReport, setWfReport] = useState("");

  const activeEndpoint = endpoints?.find((e) => e.isActive) ?? null;
  const current = workflows?.find((w) => w.id === workflowId) ?? null;

  const loadEndpoints = useCallback(async () => {
    try {
      const res = await fetch("/api/comfyui/endpoints", { headers: await authHeader() });
      const data = await res.json();
      if (Array.isArray(data.endpoints)) setEndpoints(data.endpoints);
    } catch { /* keep */ }
  }, []);

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/comfyui/workflows", { headers: await authHeader() });
      const data = await res.json();
      if (Array.isArray(data.workflows)) {
        setWorkflows(data.workflows);
        setWorkflowId((cur) => cur || data.workflows[0]?.id || "");
      }
    } catch { /* keep */ }
  }, []);

  const loadMarket = useCallback(async () => {
    try {
      const res = await fetch("/api/comfyui/market", { headers: await authHeader() });
      const data = await res.json();
      if (Array.isArray(data.market)) setMarket(data.market);
    } catch { /* keep */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadEndpoints();
    void loadWorkflows();
    void loadMarket();
    setResult(null);
    setError("");
  }, [open, loadEndpoints, loadWorkflows, loadMarket]);

  // 选中工作流 → 预填表单
  useEffect(() => {
    if (!current?.inputs) return;
    const nextTexts: Record<string, string> = {};
    for (const t of current.inputs.texts ?? []) nextTexts[t.nodeId] = t.current || "";
    const nextSeeds: Record<string, number> = {};
    for (const s of current.inputs.seeds ?? []) nextSeeds[s.nodeId] = Math.floor(Math.random() * 1e15);
    const nextNumerics: Record<string, Record<string, number>> = {};
    for (const n of current.inputs.numerics ?? []) {
      nextNumerics[n.nodeId] = { ...(nextNumerics[n.nodeId] ?? {}), [n.field]: n.current };
    }
    setTexts(nextTexts);
    setSeeds(nextSeeds);
    setNumerics(nextNumerics);
  }, [workflowId, current]);

  if (!open) return null;

  async function saveEndpoint(activate: boolean) {
    setEpBusy(activate ? "save" : "test");
    setError("");
    try {
      const res = await fetch("/api/comfyui/endpoints", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          action: activate ? undefined : "test",
          name: epName || undefined,
          baseUrl: epUrl.trim(),
          apiKey: epKey.trim() || undefined,
          activate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      if (!activate) {
        setEpName(epName || "");
        setWfReport(`连接成功：端点有 ${data.nodeCount} 个节点`);
      } else {
        setEpUrl("");
        setEpKey("");
        await loadEndpoints();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setEpBusy("");
    }
  }

  async function activateEndpoint(id: string) {
    setEpBusy(id);
    try {
      const res = await fetch("/api/comfyui/endpoints", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ action: "activate", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "激活失败");
      await loadEndpoints();
    } catch (e) {
      setError(e instanceof Error ? e.message : "激活失败");
    } finally {
      setEpBusy("");
    }
  }

  async function deleteEndpoint(id: string) {
    await fetch(`/api/comfyui/endpoints?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    await loadEndpoints();
  }

  async function importWorkflow() {
    setWfBusy(true);
    setError("");
    setWfReport("");
    try {
      const res = await fetch("/api/comfyui/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ name: wfName, json: wfJson }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导入失败");
      setWfJson("");
      setWfName("");
      await loadWorkflows();
      if (data.inputs) setWorkflowId((cur) => cur);
      const missing = (data.missing ?? []) as string[];
      setWfReport(
        missing.length
          ? `已导入,但当前端点缺少 ${missing.length} 个节点:${missing.slice(0, 4).join("、")}${missing.length > 4 ? " 等" : ""}。先到端点 ComfyUI 安装对应 custom_nodes 再运行`
          : `导入成功:${data.inputs.images.length} 个图片槽、${data.inputs.texts.length} 个文本输入`
      );
      setTab("run");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setWfBusy(false);
    }
  }

  async function deleteWorkflow(id: string) {
    await fetch(`/api/comfyui/workflows?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    if (workflowId === id) setWorkflowId("");
    await loadWorkflows();
  }

  async function publishWorkflow(id: string, isPublic: boolean) {
    setWfBusy(true);
    try {
      const res = await fetch("/api/comfyui/market", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ action: "publish", id, isPublic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      setWfReport(isPublic ? "已发布到市场，其他人可一键导入" : "已从市场下架");
      await loadWorkflows();
      await loadMarket();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setWfBusy(false);
    }
  }

  async function copyFromMarket(id: string) {
    setWfBusy(true);
    setError("");
    try {
      const res = await fetch("/api/comfyui/market", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ action: "copy", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导入失败");
      await loadWorkflows();
      setWorkflowId(data.savedId || "");
      setWfReport("已导入到我的工作流");
      setTab("run");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setWfBusy(false);
    }
  }

  async function run() {
    if (!workflowId || running) return;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await onRun({ workflowId, texts, seeds, numerics });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "执行失败");
    } finally {
      setRunning(false);
    }
  }

  const tabs = [
    { key: "run" as const, label: "运行" },
    { key: "endpoint" as const, label: "端点" },
    { key: "import" as const, label: "导入" },
    { key: "market" as const, label: "市场" },
  ];

  return (
    <div className="canvas-ui-mask fixed inset-0 z-50 flex items-center justify-center p-4 nv-fade-in" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="ComfyUI 工作流"
        className="canvas-ui-surface canvas-ui-surface-solid flex max-h-[calc(100dvh-2rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--canvas-ui-border)] px-5 py-3.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary/10 text-primary">
            <WorkflowIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-[var(--canvas-ui-text)]">ComfyUI 工作流</h3>
            <p className="truncate text-[11.5px] text-[var(--canvas-ui-muted)]">
              {activeEndpoint
                ? `${activeEndpoint.name} · ${activeEndpoint.baseUrl.replace(/^https?:\/\//, "")}`
                : "先在「端点」页连接你的 ComfyUI"}
            </p>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-[var(--canvas-ui-muted)] hover:bg-[var(--canvas-ui-soft-hover)] hover:text-[var(--canvas-ui-text)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--canvas-ui-border)] px-4 pt-3">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "rounded-t-lg px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
                tab === item.key
                  ? "border-b-2 border-primary text-[var(--canvas-ui-text)]"
                  : "text-[var(--canvas-ui-muted)] hover:text-[var(--canvas-ui-text)]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="nv-panel-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-600">{error}</p>
          )}
          {wfReport && tab !== "import" && (
            <p className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-700">{wfReport}</p>
          )}

          {tab === "endpoint" && (
            <div className="space-y-4">
              {endpoints && endpoints.length > 0 && (
                <div className="space-y-1.5">
                  {endpoints.map((ep) => (
                    <div key={ep.id} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5", ep.isActive ? "border-primary/50 bg-primary/[0.06]" : "border-[var(--canvas-ui-border)]")}>
                      <Cloud className="h-4 w-4 flex-none text-[var(--canvas-ui-muted)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[var(--canvas-ui-text)]">
                          {ep.name} {ep.isActive && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">使用中</span>}
                        </p>
                        <p className="truncate text-[11px] text-[var(--canvas-ui-muted)]">{ep.baseUrl}{ep.hasKey ? " · 已设密钥" : ""}</p>
                      </div>
                      {ep.isActive ? (
                        <span className="grid h-7 w-7 place-items-center text-primary"><Check className="h-4 w-4" /></span>
                      ) : (
                        <button type="button" onClick={() => void activateEndpoint(ep.id)} disabled={epBusy === ep.id}
                          className="rounded-lg border border-[var(--canvas-ui-border)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--canvas-ui-text)] hover:bg-[var(--canvas-ui-soft-hover)] disabled:opacity-50">
                          {epBusy === ep.id ? "…" : "使用"}
                        </button>
                      )}
                      <button type="button" aria-label="删除" onClick={() => void deleteEndpoint(ep.id)} className="grid h-7 w-7 place-items-center text-[var(--canvas-ui-muted)] hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2.5 rounded-xl border border-dashed border-[var(--canvas-ui-border)] p-3.5">
                <p className="text-[12px] font-semibold text-[var(--canvas-ui-text)]">添加端点</p>
                <input value={epName} onChange={(e) => setEpName(e.target.value)} placeholder="名称,如:我的 AutoDL / 家里 NAS"
                  className="canvas-ui-input h-9 w-full rounded-lg border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
                <input value={epUrl} onChange={(e) => setEpUrl(e.target.value)} placeholder="http://127.0.0.1:8188(ComfyUI 地址)"
                  className="canvas-ui-input h-9 w-full rounded-lg border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
                <input value={epKey} onChange={(e) => setEpKey(e.target.value)} placeholder="Bearer 密钥(端点有鉴权才填)"
                  className="canvas-ui-input h-9 w-full rounded-lg border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => void saveEndpoint(false)} disabled={!epUrl.trim() || epBusy !== ""}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--canvas-ui-border)] px-3 text-[12.5px] font-semibold text-[var(--canvas-ui-text)] hover:bg-[var(--canvas-ui-soft-hover)] disabled:opacity-50">
                    {epBusy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    测试连接
                  </button>
                  <button type="button" onClick={() => void saveEndpoint(true)} disabled={!epUrl.trim() || epBusy !== ""}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg canvas-ui-primary px-3 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {epBusy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    保存并使用
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--canvas-ui-muted)]">
                  算力跑在你自己的 ComfyUI 上(本机 / NAS / AutoDL 租卡),不消耗站内积分。内网地址需自托管部署且开启 USER_IMAGE_PROVIDER_ALLOW_PRIVATE_NETWORK。
                </p>
                <button
                  type="button"
                  onClick={() => setGuideOpen((v) => !v)}
                  className="text-[11.5px] font-semibold text-primary hover:underline"
                >
                  {guideOpen ? "收起「怎么获得端点」" : "没有 ComfyUI？看「怎么获得端点」"}
                </button>
                {guideOpen && (
                  <ol className="list-decimal space-y-1.5 rounded-lg bg-[var(--canvas-ui-soft)] px-3.5 py-3 pl-8 text-[11.5px] leading-relaxed text-[var(--canvas-ui-text)]">
                    <li>本机已装 ComfyUI：填 <code className="rounded bg-[var(--canvas-ui-panel-solid)] px-1">http://127.0.0.1:8188</code> 即可（自托管部署才放行内网地址）。</li>
                    <li><b>AutoDL 租卡（推荐，无 GPU 也能跑）</b>：autodl.cn 租一张卡 → 镜像市场选「ComfyUI」官方镜像 → 开机后在「自定义服务」开启端口映射 → 把映射出来的 <code className="rounded bg-[var(--canvas-ui-panel-solid)] px-1">https://xxx.autodl.com</code> 地址填到上面。用完关机即停止计费。</li>
                    <li>群晖 NAS / 家用服务器：Docker 部署 ComfyUI，映射 8188 端口后填局域网地址（需自托管开启内网放行）。</li>
                    <li>ComfyUI 官方云（Comfy Cloud）：API Key 填入密钥框，地址按官方控制台给出的接入点填写。</li>
                  </ol>
                )}
              </div>
            </div>
          )}

          {tab === "import" && (
            <div className="space-y-3">
              <input value={wfName} onChange={(e) => setWfName(e.target.value)} placeholder="工作流名称,如:商品图转视频"
                className="canvas-ui-input h-9 w-full rounded-lg border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-3 text-[13px] outline-none focus:ring-1 focus:ring-primary" />
              <textarea value={wfJson} onChange={(e) => setWfJson(e.target.value)} rows={8}
                placeholder="粘贴 ComfyUI 工作流 JSON(API 格式)。导出方法:ComfyUI 设置 → 勾选开发者模式 → 菜单「Save (API Format)」"
                className="canvas-ui-input w-full resize-y rounded-lg border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-3 py-2.5 font-mono text-[11.5px] leading-relaxed outline-none focus:ring-1 focus:ring-primary" />
              <button type="button" onClick={() => void importWorkflow()} disabled={!wfJson.trim() || wfBusy}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg canvas-ui-primary px-4 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {wfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WorkflowIcon className="h-3.5 w-3.5" />}
                导入工作流
              </button>
            </div>
          )}

          {tab === "market" && (
            <div className="space-y-3">
              <p className="text-[11.5px] leading-relaxed text-[var(--canvas-ui-muted)]">
                社区公开分享的工作流，一键导入到自己的库（深拷贝，互不影响）。在「运行」页点工作流右侧的分享图标可发布你的。
              </p>
              {!market ? (
                <p className="py-3 text-xs text-[var(--canvas-ui-muted)]">读取中…</p>
              ) : market.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--canvas-ui-border)] px-3 py-6 text-center text-xs leading-relaxed text-[var(--canvas-ui-muted)]">
                  市场还空着。导入好用的 ComfyUI 工作流后分享出来，就是第一批。
                </p>
              ) : (
                <div className="space-y-1.5">
                  {market.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl border border-[var(--canvas-ui-border)] px-3 py-2.5">
                      <Store className="h-4 w-4 flex-none text-[var(--canvas-ui-muted)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-[var(--canvas-ui-text)]">{item.name}</p>
                        <p className="truncate text-[11px] text-[var(--canvas-ui-muted)]">
                          @{item.author || "匿名"} · {(item.inputs?.images?.length ?? 0)} 图槽 · {(item.inputs?.texts?.length ?? 0)} 文本
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyFromMarket(item.id)}
                        disabled={wfBusy}
                        className="flex-none rounded-lg canvas-ui-primary px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                      >
                        {wfBusy ? "…" : "一键导入"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "run" && (
            <div className="space-y-4">
              {!activeEndpoint && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700">
                  还没有可用的 ComfyUI 端点。到「端点」页填一个 ComfyUI 地址(AutoDL 租卡或本机均可),再回来运行。
                </p>
              )}
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-[var(--canvas-ui-text)]">工作流</p>
                {!workflows ? (
                  <p className="py-3 text-xs text-[var(--canvas-ui-muted)]">读取中…</p>
                ) : workflows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--canvas-ui-border)] px-3 py-4 text-center text-xs leading-relaxed text-[var(--canvas-ui-muted)]">
                    还没有工作流。到「导入」页粘贴 ComfyUI 的 API 格式 JSON。
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {workflows.map((wf) => (
                      <button key={wf.id} type="button" onClick={() => setWorkflowId(wf.id)}
                        className={cn("flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
                          wf.id === workflowId ? "border-primary/50 bg-primary/[0.06]" : "border-[var(--canvas-ui-border)] hover:bg-[var(--canvas-ui-soft-hover)]")}>
                        <WorkflowIcon className="h-4 w-4 flex-none text-[var(--canvas-ui-muted)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-[var(--canvas-ui-text)]">{wf.name}</span>
                          <span className="block truncate text-[11px] text-[var(--canvas-ui-muted)]">
                            {(wf.inputs?.images?.length ?? 0)} 图槽 · {(wf.inputs?.texts?.length ?? 0)} 文本 · {(wf.inputs?.seeds?.length ?? 0)} 种子
                          </span>
                        </span>
                        <span aria-label="删除" onClick={(e) => { e.stopPropagation(); void deleteWorkflow(wf.id); }}
                          className="grid h-7 w-7 place-items-center text-[var(--canvas-ui-muted)] hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                        <span
                          aria-label={wf.isPublic ? "从市场下架" : "分享到市场"}
                          title={wf.isPublic ? "从市场下架" : "分享到市场"}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!wfBusy) void publishWorkflow(wf.id, !wf.isPublic);
                          }}
                          className={cn(
                            "grid h-7 w-7 place-items-center transition-colors",
                            wf.isPublic ? "text-emerald-600 hover:text-emerald-700" : "text-[var(--canvas-ui-muted)] hover:text-[var(--canvas-ui-text)]"
                          )}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {current?.inputs && (
                <div className="space-y-3">
                  {(current.inputs.images?.length ?? 0) > 0 && (
                    <p className="rounded-lg bg-[var(--canvas-ui-soft)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--canvas-ui-muted)]">
                      将把选中的画布图 <span className="font-semibold text-[var(--canvas-ui-text)]">{source?.title || "当前图片"}</span> 作为输入
                      ({current.inputs.images.length} 个图片槽共用这张图)。
                    </p>
                  )}
                  {current.inputs.texts.map((t) => (
                    <div key={t.nodeId}>
                      <p className="mb-1 text-[12px] font-semibold text-[var(--canvas-ui-text)]">
                        {t.label}
                        {t.role === "positive" && <span className="ml-1.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">正向</span>}
                        {t.role === "negative" && <span className="ml-1.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-500">负向</span>}
                      </p>
                      <textarea value={texts[t.nodeId] ?? ""} onChange={(e) => setTexts((prev) => ({ ...prev, [t.nodeId]: e.target.value }))} rows={2}
                        className="canvas-ui-input w-full resize-y rounded-lg border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                  ))}
                  {current.inputs.numerics.map((n) => (
                    <div key={`${n.nodeId}.${n.field}`} className="flex items-center gap-2">
                      <p className="w-20 flex-none text-[12px] font-semibold text-[var(--canvas-ui-text)]">{n.label}</p>
                      <input type="number" value={numerics[n.nodeId]?.[n.field] ?? n.current}
                        onChange={(e) => setNumerics((prev) => ({
                          ...prev,
                          [n.nodeId]: { ...(prev[n.nodeId] ?? {}), [n.field]: Number(e.target.value) || 0 },
                        }))}
                        className="canvas-ui-input h-9 w-28 rounded-lg border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-3 text-[13px] tabular-nums outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                  ))}
                  {current.inputs.seeds.length > 0 && (
                    <div className="flex items-center gap-2">
                      <p className="w-20 flex-none text-[12px] font-semibold text-[var(--canvas-ui-text)]">随机种子</p>
                      <input type="number" value={seeds[current.inputs.seeds[0].nodeId] ?? 0} readOnly
                        className="canvas-ui-input h-9 w-40 rounded-lg border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] px-3 text-[12px] tabular-nums text-[var(--canvas-ui-muted)] outline-none" />
                      <button type="button" onClick={() => {
                        setSeeds((prev) => {
                          const next = { ...prev };
                          for (const s of current.inputs!.seeds) next[s.nodeId] = Math.floor(Math.random() * 1e15);
                          return next;
                        });
                      }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--canvas-ui-border)] px-2.5 text-[11.5px] font-medium text-[var(--canvas-ui-text)] hover:bg-[var(--canvas-ui-soft-hover)]">
                        <RefreshCw className="h-3.5 w-3.5" /> 换一个
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button type="button" onClick={() => void run()} disabled={!workflowId || !activeEndpoint || running || !source}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl canvas-ui-primary text-[13px] font-bold text-white shadow-btn transition-all hover:opacity-90 disabled:opacity-50">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {running ? "正在执行,视频任务可能需要几分钟…" : "运行工作流"}
              </button>

              {result && (
                <div className="space-y-2 rounded-xl border border-[var(--canvas-ui-border)] bg-[var(--canvas-ui-soft)] p-3">
                  {(result.images?.length ?? 0) > 0 && (
                    <p className="text-[12px] text-[var(--canvas-ui-text)]">✓ {result.images!.length} 张图片已生成在原图右侧</p>
                  )}
                  {(result.videos?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      {result.videos!.map((v) => (
                        <div key={v.url} className="space-y-1.5">
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                          <video src={v.url} controls className="w-full rounded-lg border border-[var(--canvas-ui-border)]" />
                          <a href={v.url} download target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline">
                            下载视频
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
