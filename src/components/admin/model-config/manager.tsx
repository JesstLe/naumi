"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { authHeader } from "@/lib/supabase";
import type {
  ModelConfig,
  ModelDraft,
  ModelSnapshot,
  ModelPublication,
  ModelVersionSummary,
  ModelFacts,
} from "@/lib/model-config/types";
import { ProviderEditor } from "./provider-editor";
import { UpstreamEditor } from "./upstream-editor";
import { PoolEditor, PublicModelEditor } from "./routing-editor";
import {
  configurationChanges,
  type ConfigurationChange,
} from "./configuration-diff";
import {
  buttonClass,
  Choice,
  Field,
  inputClass,
  NumberField,
  Panel,
  TextField,
  Toggle,
} from "./fields";

type AdminState = {
  providerCapacity?: Record<
    string,
    { maxConcurrent: number; inFlight: number }
  >;
  snapshot: ModelSnapshot;
  draft: ModelDraft;
  protocols: string[];
  bindings: Record<string, { modality: string; capability: string }>;
  billingVersion: number;
  costReferences: {
    key: string;
    currency: string;
    unit: string;
    source: string;
  }[];
};
type Validation = {
  valid: boolean;
  expectedVersion: number;
  billingVersion: number;
  changes: { entity: string; id: string; change: string }[];
};
type Operation = {
  path: string;
  body: Record<string, unknown>;
  publication?: ModelPublication;
};
type Simulation = {
  eligible: { upstreamId: string; providerId: string; rank: number }[];
  excluded: { upstreamId: string; codes: string[] }[];
  modelVersion: number;
  billingVersion: number;
};
const tabs = [
  { id: "providers", label: "供应商" },
  { id: "upstreamModels", label: "上游模型" },
  { id: "publicModels", label: "公开模型" },
  { id: "pools", label: "混合路由" },
  { id: "bindings", label: "默认用途" },
  { id: "simulation", label: "路由模拟" },
  { id: "history", label: "发布记录" },
] as const;
type Tab = (typeof tabs)[number]["id"];
const titles: Record<string, string> = {
  "image.generate": "图片生成",
  "image.edit": "参考图编辑 / 画布局部编辑",
  "image.cutout": "图片抠图",
  "agent.text": "Agent 文字",
  "agent.vision": "Agent 视觉",
  "text.generate": "文字生成 / 画布助手",
  "text.title": "商品标题",
  "text.competitor": "竞品分析",
  "vision.reference": "参考图分析",
  "vision.review": "图片结果检查",
  "vision.ocr": "画布文字识别",
  "video.generate": "视频生成",
};
const phases: Record<string, string> = {
  staged: "已保存发布意图",
  preparing: "准备配置",
  activating: "正在应用",
  applied: "已确认生效",
  failed: "失败，未确认生效",
  unknown: "结果待核查，请勿创建重复发布",
};
const exclusions: Record<string, string> = {
  DISABLED: "模型或供应商未启用",
  RULE_UNMATCHED: "未命中路由规则",
  QUALITY_RANK: "质量等级不足",
  QUALITY_UNSUPPORTED: "质量档位不支持",
  EDIT_UNSUPPORTED: "不支持参考图编辑",
  MASK_UNSUPPORTED: "不支持蒙版编辑",
  IDENTITY_UNSUPPORTED: "不能保证产品身份",
  TEXT_UNSUPPORTED: "文字能力不足",
  NATIVE_RESOLUTION: "不支持原生尺寸",
  PIXEL_LIMIT: "超过尺寸能力",
  REFERENCE_LIMIT: "参考图数量超限",
  COST_UNRECORDED: "缺少货币成本",
  COST_CURRENCY: "候选币种不一致",
};
const operationStorage = "naumi:model-config-operation";
function storedOperation(raw: string): Operation | null {
  try {
    if (raw.length > 20000) return null;
    const op = JSON.parse(raw);
    const b = op.body;
    if (
      !["", "/versions"].includes(op.path) ||
      !b ||
      !/^[-a-zA-Z0-9._:]{1,100}$/.test(b.id) ||
      typeof b.reason !== "string" ||
      !b.reason.trim() ||
      b.reason.length > 500 ||
      !Number.isSafeInteger(b.expectedVersion) ||
      b.expectedVersion < 1
    )
      return null;
    if (
      op.path === "/versions"
        ? !Number.isSafeInteger(b.targetVersion) || b.targetVersion < 1
        : typeof b.draftId !== "string" ||
          !Number.isSafeInteger(b.expectedRevision) ||
          b.expectedRevision < 1
    )
      return null;
    if (
      op.publication &&
      (![
        "staged",
        "preparing",
        "activating",
        "applied",
        "failed",
        "unknown",
      ].includes(op.publication.phase) ||
        op.publication.id !== b.id)
    )
      return null;
    return op;
  } catch {
    return null;
  }
}
class AdminError extends Error {
  constructor(
    message: string,
    public code: string,
    public fields: string[] = [],
  ) {
    super(message);
  }
}
function Diff({ changes }: { changes: ConfigurationChange[] }) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-c-border">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="sticky top-0 bg-c-card">
          <tr>
            <th className="p-3">配置项</th>
            <th className="p-3">当前 / 原值</th>
            <th className="p-3">变更后</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.field} className="border-t border-c-border">
              <td className="max-w-64 break-all p-3">{c.field}</td>
              <td className="max-w-64 break-all p-3">{c.before}</td>
              <td className="max-w-64 break-all p-3">{c.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!changes.length && <p className="p-3">无配置变化</p>}
    </div>
  );
}

export function ModelConfigurationManager() {
  const [state, setState] = useState<AdminState | null>(null),
    [config, setConfig] = useState<ModelConfig | null>(null),
    [tab, setTab] = useState<Tab>("providers"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fields, setFields] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [validation, setValidation] = useState<Validation | null>(null),
    [versions, setVersions] = useState<ModelVersionSummary[]>([]),
    [operation, setOperation] = useState<Operation | null>(null),
    [review, setReview] = useState<{
      target?: number;
      changes: ConfigurationChange[];
    } | null>(null),
    [reason, setReason] = useState(""),
    [remote, setRemote] = useState<AdminState | null>(null),
    [newId, setNewId] = useState("");
  const [simulationModel, setSimulationModel] = useState(""),
    [facts, setFacts] = useState<ModelFacts>({
      task: "product",
      quality: "medium",
      resolution: "1K",
      needsEdit: false,
      preserveIdentity: false,
      needsText: false,
      nativeResolution: false,
      references: 0,
      quantity: 1,
    }),
    [simulation, setSimulation] = useState<Simulation | null>(null);
  const lock = useRef(false),
    mounted = useRef(true),
    dialog = useRef<HTMLElement>(null);
  const dirty =
    !!config &&
    !!state &&
    configurationChanges(state.draft.config, config).length > 0;
  const pending =
    !!operation &&
    (!operation.publication ||
      !["applied", "failed"].includes(operation.publication.phase));
  const request = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch(`/api/admin/bi/model-config${path}`, {
      method: body ? (path === "/draft" ? "PUT" : "POST") : "GET",
      cache: "no-store",
      headers: { ...(await authHeader()), "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json();
    if (!res.ok && !(res.status === 422 && data.phase === "failed"))
      throw new AdminError(
        data.error || "模型管理请求失败",
        data.code || "REQUEST_FAILED",
        data.fields || [],
      );
    return data;
  }, []);
  const adopt = useCallback((data: AdminState) => {
    setState(data);
    setConfig(structuredClone(data.draft.config));
    setValidation(null);
    setReview(null);
    setSimulation(null);
    setSimulationModel((current) =>
      data.draft.config.publicModels.some(
        (m) => m.id === current && m.modality === "image",
      )
        ? current
        : data.draft.config.publicModels.find((m) => m.modality === "image")
            ?.id || "",
    );
  }, []);
  const remember = useCallback((value: Operation | null) => {
    setOperation(value);
    try {
      if (value) localStorage.setItem(operationStorage, JSON.stringify(value));
      else localStorage.removeItem(operationStorage);
    } catch {}
  }, []);
  const reload = useCallback(async () => {
    const [data, history] = await Promise.all([
      request(""),
      request("/versions"),
    ]);
    if (mounted.current) {
      adopt(data);
      setVersions(history.versions);
    }
  }, [request, adopt]);
  const action = async (run: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setFields([]);
    setNotice("");
    try {
      await run();
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "操作失败");
        setFields(e instanceof AdminError ? e.fields : []);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void reload().catch((e) => setError(e.message));
    try {
      const saved = localStorage.getItem(operationStorage);
      if (saved) {
        const parsed = storedOperation(saved);
        if (parsed) setOperation(parsed);
        else localStorage.removeItem(operationStorage);
      }
    } catch {}
    return () => {
      mounted.current = false;
    };
  }, [reload]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const navigation = (e: MouseEvent) => {
      const link = (e.target as Element)?.closest(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        link &&
        link.origin === location.origin &&
        link.pathname !== location.pathname &&
        !window.confirm("有未保存的模型修改。离开会丢失本地修改，是否离开？")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigation, true);
    };
  }, [dirty]);
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const history = await request("/versions");
        if (cancelled) return;
        setVersions(history.versions);
        const found = history.versions.find(
          (v: ModelVersionSummary) => v.id === operation!.body.id,
        );
        if (found) {
          remember({ ...operation!, publication: found });
          if (found.phase === "applied") {
            await reload();
            remember(null);
            setNotice(`模型版本 ${found.version} 已确认生效`);
          }
        }
      } catch {
        /* Keep the operation id and explicit recovery control. */
      }
    };
    const timer = setInterval(() => void poll(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pending, operation, request, remember, reload]);
  useEffect(() => {
    if (!review) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = dialog.current;
    if (!root) return;
    const selectors =
      "button:not(:disabled),textarea:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]";
    (root.querySelector(selectors) as HTMLElement | null)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !lock.current) {
        e.preventDefault();
        setReview(null);
      }
      if (e.key === "Tab") {
        const elements = Array.from(
          root.querySelectorAll<HTMLElement>(selectors),
        );
        const first = elements[0],
          last = elements[elements.length - 1];
        if (!first) return;
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !root.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !root.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    root.addEventListener("keydown", key);
    return () => {
      root.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [review]);
  function edit(next: ModelConfig) {
    setConfig(next);
    setValidation(null);
    setSimulation(null);
  }
  async function save() {
    if (!config || !state) throw new Error("配置尚未加载");
    if (!dirty) return state.draft;
    const draft: ModelDraft = await request("/draft", {
      id: state.draft.id,
      expectedRevision: state.draft.revision,
      config,
    });
    setState({ ...state, draft });
    return draft;
  }
  async function execute(op: Operation) {
    remember(op);
    try {
      const publication: ModelPublication = await request(op.path, op.body);
      remember({ ...op, publication });
      setReview(null);
      if (publication.phase === "applied") {
        await reload();
        remember(null);
        setReview(null);
        setReason("");
        setNotice(
          `模型版本 ${publication.version} 已确认生效 · ${publication.digest.slice(0, 12)}`,
        );
      } else if (publication.phase === "failed")
        setError(
          "发布失败，请查看记录并修正配置；当前生效版本以服务器核对结果为准",
        );
    } catch (e) {
      setReview(null);
      setError(
        e instanceof Error
          ? `${e.message}。操作编号已保留，请核查此操作后再继续。`
          : "结果待核查",
      );
      throw e;
    }
  }
  if (!state || !config)
    return (
      <main className="mx-auto max-w-6xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">模型配置中心</h1>
        <p role={error ? "alert" : "status"}>
          {error || "正在读取私有模型配置…"}
        </p>
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => void action(reload)}
        >
          重新读取
        </button>
        <Link href="/admin/bi" className="ml-4 underline">
          返回 BI
        </Link>
      </main>
    );
  const update = <
    K extends "providers" | "upstreamModels" | "publicModels" | "pools",
  >(
    key: K,
    index: number,
    item: ModelConfig[K][number],
  ) =>
    edit({
      ...config,
      [key]: config[key].map((x, i) => (i === index ? item : x)),
    });
  const add = () => {
    const id = newId.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(id))
      return setError(
        "请填写 1–100 字符的标识，只支持字母、数字、点、下划线、冒号和短横线",
      );
    if (
      ["providers", "upstreamModels", "publicModels", "pools"].includes(tab) &&
      config[tab as "providers"].some((x) => x.id === id)
    )
      return setError("此标识已存在");
    if (tab === "providers")
      edit({
        ...config,
        providers: [
          ...config.providers,
          {
            id,
            name: id,
            protocol: "openai-images",
            baseUrl: "https://api.example.com/v1",
            enabled: false,
            timeoutMs: 280000,
            maxConcurrent: 4,
          },
        ],
      });
    else if (tab === "upstreamModels")
      edit({
        ...config,
        upstreamModels: [
          ...config.upstreamModels,
          {
            id,
            label: id,
            providerId: config.providers[0]?.id || "",
            model: id,
            modality: "image",
            enabled: false,
            capabilities: {
              verified: false,
              generate: true,
              edit: false,
              vision: false,
              transparent: false,
              preserveIdentity: false,
              textAccuracy: false,
              qualityRank: 2,
              qualities: [],
              nativeResolutions: [],
              maxReferenceImages: 0,
              expectedLatencyMs: 0,
            },
            parameterMap: {},
          },
        ],
      });
    else if (tab === "publicModels")
      edit({
        ...config,
        publicModels: [
          ...config.publicModels,
          {
            id,
            label: id,
            modality: "image",
            enabled: false,
            visible: true,
            target: {
              type: "upstream",
              id:
                config.upstreamModels.find((u) => u.modality === "image")?.id ||
                "",
            },
          },
        ],
      });
    else if (tab === "pools")
      edit({
        ...config,
        pools: [
          ...config.pools,
          {
            id,
            modality: "image",
            strategy: "priority",
            candidates: [],
            rules: [],
          },
        ],
      });
    setNewId("");
  };
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-c-text sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-c-text3">
            Naumi · 内部管理 · 仅管理员可见
          </p>
          <h1 className="text-2xl font-semibold">模型配置中心</h1>
          <p className="mt-2 text-sm text-c-text2">
            生效版本 {state.snapshot.version} · 计费版本 {state.billingVersion}{" "}
            · 草稿修订 {state.draft.revision} ·{" "}
            {dirty ? "有未保存修改" : "草稿已保存"}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className={buttonClass} href="/admin/bi">
            运营 BI
          </Link>
          <Link className={buttonClass} href="/admin/billing">
            计费与成本管理
          </Link>
        </div>
      </header>
      <p className="text-sm text-c-text3">
        编辑草稿不会影响在线任务。发布后新任务使用新版本，已接受任务保留原模型、路由和凭据。
      </p>
      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm"
        >
          <p>{error}</p>
          {fields.length > 0 && <p>需检查：{fields.join("、")}</p>}
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              void action(async () => setRemote(await request("")))
            }
          >
            读取服务器配置进行对比，保留本地修改
          </button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-c-border p-4 text-sm"
        >
          {notice}
        </p>
      )}
      {operation && (
        <Panel title="发布操作核查">
          <p className="break-all text-sm">
            操作 {String(operation.body.id)} ·{" "}
            {operation.publication
              ? phases[operation.publication.phase]
              : "请求可能已提交，需核查"}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void action(() => execute(operation))}
            >
              核查并继续同一操作
            </button>
            {operation.publication?.phase === "failed" && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => remember(null)}
              >
                关闭失败记录，准备新的发布
              </button>
            )}
          </div>
        </Panel>
      )}
      <nav
        aria-label="模型配置分类"
        className="flex gap-2 overflow-x-auto border-b border-c-border pb-3"
      >
        {tabs.map((t) => (
          <button
            type="button"
            key={t.id}
            aria-current={tab === t.id ? "page" : undefined}
            className={`${buttonClass} whitespace-nowrap ${tab === t.id ? "font-semibold ring-1 ring-c-accent" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <fieldset
        disabled={busy || pending || (!!operation && !operation.publication)}
        className="min-w-0 space-y-5"
      >
        {["providers", "upstreamModels", "publicModels", "pools"].includes(
          tab,
        ) && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <TextField
              label="新配置项标识"
              value={newId}
              onChange={setNewId}
              placeholder="例如 primary-images"
            />
            <button type="button" className={buttonClass} onClick={add}>
              新增{tabs.find((t) => t.id === tab)?.label}
            </button>
          </div>
        )}
        {tab === "providers" &&
          config.providers.map((p, i) => (
            <ProviderEditor
              key={p.id}
              provider={p}
              capacity={state.providerCapacity?.[p.id]}
              protocols={state.protocols}
              onSavingChange={(value) => {
                lock.current = value;
                setBusy(value);
              }}
              onChange={(p) => update("providers", i, p)}
              saveCredential={async (providerId, ciphertext) =>
                (await request("/credentials", { providerId, ciphertext })).id
              }
            />
          ))}
        {tab === "upstreamModels" &&
          config.upstreamModels.map((m, i) => (
            <UpstreamEditor
              key={m.id}
              model={m}
              providers={config.providers}
              costs={state.costReferences}
              onChange={(m) => update("upstreamModels", i, m)}
            />
          ))}
        {tab === "publicModels" &&
          config.publicModels.map((m, i) => (
            <PublicModelEditor
              key={m.id}
              model={m}
              config={config}
              onChange={(m) => update("publicModels", i, m)}
            />
          ))}
        {tab === "pools" &&
          config.pools.map((p, i) => (
            <PoolEditor
              key={p.id}
              pool={p}
              config={config}
              onChange={(p) => update("pools", i, p)}
            />
          ))}
        {tab === "bindings" && (
          <Panel title="默认用途与执行入口">
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(state.bindings).map(([id, purpose]) => (
                <Choice
                  key={id}
                  label={titles[id] || id}
                  value={config.bindings[id] || ""}
                  options={[
                    { value: "", label: "未配置" },
                    ...config.publicModels
                      .filter(
                        (m) => m.enabled && m.modality === purpose.modality,
                      )
                      .map((m) => ({
                        value: m.id,
                        label: `${m.label} · ${m.id}${m.visible ? "" : " · 隐藏"}`,
                      })),
                  ]}
                  onChange={(value) => {
                    const bindings = { ...config.bindings };
                    if (value) bindings[id] = value;
                    else delete bindings[id];
                    edit({ ...config, bindings });
                  }}
                />
              ))}
            </div>
          </Panel>
        )}
        {tab === "simulation" && (
          <Panel title="模拟路由 · 不调用付费上游">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Choice
                label="模拟公开图片模型"
                value={simulationModel}
                options={config.publicModels
                  .filter((m) => m.modality === "image")
                  .map((m) => ({ value: m.id, label: m.label }))}
                onChange={setSimulationModel}
              />
              <Choice
                label="任务用途"
                value={facts.task}
                options={[
                  { value: "draft", label: "草图" },
                  { value: "product", label: "商品" },
                  { value: "detail", label: "详情" },
                  { value: "layout", label: "文字排版" },
                ]}
                onChange={(task) =>
                  setFacts({ ...facts, task: task as ModelFacts["task"] })
                }
              />
              <Choice
                label="请求质量"
                value={facts.quality}
                options={["low", "medium", "high", "xhigh", "max", "auto"].map(
                  (value) => ({ value, label: value }),
                )}
                onChange={(quality) => setFacts({ ...facts, quality })}
              />
              <Choice
                label="请求尺寸"
                value={facts.resolution}
                options={["1K", "2K", "4K"].map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(resolution) => setFacts({ ...facts, resolution })}
              />
              <NumberField
                label="参考图数量"
                value={facts.references}
                max={32}
                onChange={(references) =>
                  setFacts({ ...facts, references, needsEdit: references > 0 })
                }
              />
              <NumberField
                label="出图张数"
                value={facts.quantity || 1}
                min={1}
                max={4}
                onChange={(quantity) => setFacts({ ...facts, quantity })}
              />
            </div>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  "needsMask",
                  "preserveIdentity",
                  "needsText",
                  "nativeResolution",
                ] as const
              ).map((key) => (
                <Toggle
                  key={key}
                  label={
                    {
                      needsMask: "需要蒙版编辑",
                      preserveIdentity: "保持产品身份",
                      needsText: "准确生成文字",
                      nativeResolution: "要求原生尺寸",
                    }[key]
                  }
                  value={!!facts[key]}
                  onChange={(value) => setFacts({ ...facts, [key]: value })}
                />
              ))}
            </div>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                void action(async () => {
                  const draft = await save();
                  setSimulation(
                    await request("/simulate", {
                      draftId: draft.id,
                      publicModelId: simulationModel,
                      facts,
                    }),
                  );
                })
              }
            >
              保存草稿并模拟
            </button>
            {simulation && (
              <div className="space-y-3 text-sm">
                <p>
                  草稿基于模型版本 {simulation.modelVersion} · 成本计费版本{" "}
                  {simulation.billingVersion}
                </p>
                <ol className="space-y-2">
                  {simulation.eligible.map((u, i) => (
                    <li
                      key={u.upstreamId}
                      className="rounded-lg border border-c-border p-3"
                    >
                      {i === 0 ? "首选" : "候选"} {i + 1} ·{" "}
                      {config.upstreamModels.find((x) => x.id === u.upstreamId)
                        ?.label || u.upstreamId}{" "}
                      ·{" "}
                      {config.providers.find((x) => x.id === u.providerId)
                        ?.name || u.providerId}
                    </li>
                  ))}
                </ol>
                {!simulation.eligible.length && (
                  <p>没有符合要求的候选，实际提交将被拒绝。</p>
                )}
                <ul className="space-y-2">
                  {simulation.excluded.map((u) => (
                    <li key={u.upstreamId} className="rounded-lg bg-c-bg p-3">
                      排除{" "}
                      {config.upstreamModels.find((x) => x.id === u.upstreamId)
                        ?.label || u.upstreamId}
                      ：{u.codes.map((c) => exclusions[c] || c).join("；")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        )}
        {tab !== "history" && (
          <div className="sticky bottom-3 flex flex-wrap gap-3 rounded-xl border border-c-border bg-c-card p-3 shadow-lg">
            <button
              type="button"
              className={buttonClass}
              disabled={!dirty}
              onClick={() =>
                void action(async () => {
                  await save();
                  setNotice("草稿已保存，当前生效配置未改变");
                })
              }
            >
              保存草稿
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                void action(async () => {
                  const draft = await save();
                  const result: Validation = await request("/validate", {
                    draftId: draft.id,
                    expectedRevision: draft.revision,
                  });
                  if (result.expectedVersion !== state.snapshot.version) {
                    setRemote(await request(""));
                    throw new Error(
                      "生效版本已被其他管理员更新。请先核对服务器配置，再预览发布差异",
                    );
                  }
                  setValidation(result);
                  setReview({
                    changes: configurationChanges(
                      state.snapshot.config,
                      config,
                    ),
                  });
                  setReason("");
                })
              }
            >
              校验并预览发布差异
            </button>
          </div>
        )}
      </fieldset>
      {tab === "history" && (
        <Panel title="不可变版本与发布记录">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr>
                  {["版本", "状态", "操作者", "原因", "创建时间", "操作"].map(
                    (x) => (
                      <th key={x} className="p-3">
                        {x}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-t border-c-border">
                    <td className="p-3">{v.version}</td>
                    <td className="p-3">{phases[v.phase]}</td>
                    <td className="break-all p-3">{v.actor}</td>
                    <td className="max-w-64 break-words p-3">{v.reason}</td>
                    <td className="p-3">
                      {new Date(v.createdAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={
                          busy ||
                          pending ||
                          v.phase !== "applied" ||
                          v.version === state.snapshot.version
                        }
                        onClick={() =>
                          void action(async () => {
                            const target: ModelSnapshot = await request(
                              `/versions?version=${v.version}`,
                            );
                            setReview({
                              target: v.version,
                              changes: configurationChanges(
                                state.snapshot.config,
                                target.config,
                              ),
                            });
                            setReason("");
                          })
                        }
                      >
                        预览恢复
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {remote && (
        <Panel title="并发修改对比 · 本地修改仍保留">
          <p className="text-sm">
            生效版本 {state.snapshot.version} → {remote.snapshot.version}
          </p>
          <Diff
            changes={configurationChanges(
              state.snapshot.config,
              remote.snapshot.config,
            )}
          />
          <p className="text-sm">服务器草稿与本地修改：</p>
          <Diff changes={configurationChanges(remote.draft.config, config)} />
          <p className="text-sm">
            服务器草稿修订 {remote.draft.revision}
            。请对比后选择，避免覆盖其他管理员的修改。
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                adopt(remote);
                setRemote(null);
                setError("");
              }}
            >
              采用服务器草稿，替换本地修改
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setState(remote);
                setRemote(null);
                setValidation(null);
                setError("");
                setNotice("保留本地修改，并将按已核对的服务器修订保存");
              }}
            >
              采用本地修改作为新草稿
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setRemote(null)}
            >
              继续对比，暂不保存
            </button>
          </div>
        </Panel>
      )}
      {review && (
        <section
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="model-publication-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
        >
          <div className="max-h-[90vh] w-full max-w-4xl space-y-4 overflow-auto rounded-xl bg-c-card p-5">
            <h2 id="model-publication-title" className="text-lg font-semibold">
              {review.target
                ? `恢复版本 ${review.target} 的配置，创建新版本`
                : `发布前差异核对`}
            </h2>
            <p className="text-sm">
              当前模型版本 {state.snapshot.version} ·{" "}
              {review.target
                ? `沿用当前计费版本 ${state.billingVersion}`
                : `已校验计费版本 ${validation?.billingVersion}`}
            </p>
            <Diff changes={review.changes} />
            <Field label="发布 / 恢复原因">
              <textarea
                aria-label="发布 / 恢复原因"
                className={inputClass}
                maxLength={500}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={
                  busy ||
                  !!operation ||
                  !reason.trim() ||
                  !review.changes.length ||
                  (!review.target && !validation)
                }
                onClick={() =>
                  void action(async () => {
                    const body = review.target
                      ? {
                          id: crypto.randomUUID(),
                          targetVersion: review.target,
                          expectedVersion: state.snapshot.version,
                          reason: reason.trim(),
                        }
                      : {
                          id: crypto.randomUUID(),
                          draftId: state.draft.id,
                          expectedRevision: state.draft.revision,
                          expectedVersion: validation!.expectedVersion,
                          reason: reason.trim(),
                        };
                    await execute({
                      path: review.target ? "/versions" : "",
                      body,
                    });
                  })
                }
              >
                {busy
                  ? "正在核查并应用…"
                  : review.target
                    ? "确认恢复为新版本"
                    : "确认发布此草稿"}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => setReview(null)}
              >
                返回编辑
              </button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-500">
                {error}
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
