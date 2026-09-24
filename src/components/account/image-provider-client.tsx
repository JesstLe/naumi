"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  KeyRound,
  Loader2,
  PlugZap,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";
import { IMAGE_PROVIDER_PRESETS } from "@/lib/image-provider-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Protocol = "openai-images" | "chat-completions";

type ProviderView = {
  id: string;
  name: string;
  isActive: boolean;
  protocol: Protocol;
  baseUrl: string;
  hasKey: boolean;
  keyMasked: string;
  models: string[];
  defaultModel: string;
};

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function encryptSecret(plain: string, pem: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "spki",
    pemToDer(pem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    key,
    new TextEncoder().encode(plain)
  );
  let binary = "";
  const bytes = new Uint8Array(encrypted);
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

const PROTOCOL_LABEL: Record<Protocol, string> = {
  "openai-images": "Images API",
  "chat-completions": "Chat 生图",
};

export function ImageProviderClient() {
  const { user, ready } = useAuth();
  const { openAuth } = useAuthModal();
  const [loaded, setLoaded] = useState(false);
  const [publicKeyPem, setPublicKeyPem] = useState("");
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // 右栏编辑表单(草稿;selectedId=null 表示新建未保存)
  const [formName, setFormName] = useState("");
  const [formProtocol, setFormProtocol] = useState<Protocol>("openai-images");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formModelsText, setFormModelsText] = useState("");
  const [formDefaultModel, setFormDefaultModel] = useState("");
  const [formActivate, setFormActivate] = useState(false);
  const [editingKey, setEditingKey] = useState({ hasKey: false, keyMasked: "" });

  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = providers.find((p) => p.id === selectedId) ?? null;
  const isNewDraft = selectedId === null;
  const activeProvider = providers.find((p) => p.isActive) ?? null;

  const models = useMemo(
    () =>
      Array.from(
        new Set(
          formModelsText
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ),
    [formModelsText]
  );

  useEffect(() => {
    if (ready && !user) openAuth("sign-in");
  }, [ready, user, openAuth]);

  function selectProvider(provider: ProviderView | null) {
    setSelectedId(provider?.id ?? null);
    setMessage(null);
    if (provider) {
      setFormName(provider.name);
      setFormProtocol(provider.protocol);
      setFormBaseUrl(provider.baseUrl);
      setFormModelsText(provider.models.join("\n"));
      setFormDefaultModel(provider.defaultModel || provider.models[0] || "");
      setFormActivate(provider.isActive);
      setEditingKey({ hasKey: provider.hasKey, keyMasked: provider.keyMasked });
    } else {
      setFormName("");
      setFormProtocol("openai-images");
      setFormBaseUrl("");
      setFormApiKey("");
      setFormModelsText("");
      setFormDefaultModel("");
      setFormActivate(false);
      setEditingKey({ hasKey: false, keyMasked: "" });
    }
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/account/image-provider", {
          headers: await authHeader(),
          cache: "no-store",
        });
        const data = (await response.json()) as {
          providers?: ProviderView[];
          publicKeyPem?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "读取失败");
        if (cancelled) return;
        setPublicKeyPem(data.publicKeyPem || "");
        const list = data.providers || [];
        setProviders(list);
        // 默认选中激活方;没有激活的选第一个;都没有则进入新建草稿
        const initial = list.find((p) => p.isActive) ?? list[0] ?? null;
        if (initial) selectProvider(initial);
      } catch (error) {
        if (!cancelled) {
          setMessage({ ok: false, text: error instanceof Error ? error.message : "读取失败" });
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!models.length) setFormDefaultModel("");
    else if (!models.includes(formDefaultModel)) setFormDefaultModel(models[0]);
  }, [models, formDefaultModel]);

  async function applyProviders(next: ProviderView[], preferId?: string) {
    setProviders(next);
    const target = preferId
      ? next.find((p) => p.id === preferId)
      : next.find((p) => p.id === selectedId);
    if (target) {
      setSelectedId(target.id);
      setFormName(target.name);
      setFormProtocol(target.protocol);
      setFormBaseUrl(target.baseUrl);
      setFormModelsText(target.models.join("\n"));
      setFormDefaultModel(target.defaultModel || target.models[0] || "");
      setFormActivate(target.isActive);
      setEditingKey({ hasKey: target.hasKey, keyMasked: target.keyMasked });
    }
    setFormApiKey("");
  }

  /**
   * key 传输加密:仅 RSA-OAEP 密文,不再提供明文降级。
   * WebCrypto 仅 secure context(HTTPS / localhost)可用——不满足时返回 null,
   * 由调用方提示更换访问方式,而不是把明文放进请求体。
   */
  async function encryptApiKey(): Promise<Record<string, string> | null> {
    const secret = formApiKey.trim();
    if (!secret) return {};
    if (window.crypto?.subtle && publicKeyPem) {
      return { encryptedApiKey: await encryptSecret(secret, publicKeyPem) };
    }
    return null;
  }

  async function save() {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const keyPayload = await encryptApiKey();
      if (keyPayload === null) {
        setMessage({
          ok: false,
          text: "当前访问方式不支持加密传输（需 HTTPS 或 localhost）。请换用加密访问后保存 API Key。",
        });
        return;
      }
      const payload = {
        ...(selectedId ? { id: selectedId } : {}),
        name: formName,
        activate: formActivate,
        protocol: formProtocol,
        baseUrl: formBaseUrl.trim(),
        models,
        defaultModel: formDefaultModel,
        ...keyPayload,
      };
      const response = await fetch("/api/account/image-provider", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        providers?: ProviderView[];
        savedId?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "保存失败");
      await applyProviders(data.providers || [], data.savedId);
      setMessage({
        ok: true,
        text: formActivate
          ? "已保存并设为当前使用，生图页和画布可选择自定义模型"
          : "配置已保存",
      });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string) {
    setActivatingId(id);
    setMessage(null);
    try {
      const response = await fetch("/api/account/image-provider", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ action: "activate", id }),
      });
      const data = (await response.json()) as { providers?: ProviderView[]; error?: string };
      if (!response.ok) throw new Error(data.error || "切换失败");
      await applyProviders(data.providers || []);
      setMessage({ ok: true, text: "已切换当前使用的供应商" });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "切换失败" });
    } finally {
      setActivatingId(null);
    }
  }

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    try {
      const keyPayload = await encryptApiKey();
      if (keyPayload === null) {
        setMessage({
          ok: false,
          text: "当前访问方式不支持加密传输（需 HTTPS 或 localhost）。请换用加密访问后测试。",
        });
        return;
      }
      const payload = {
        action: "test",
        ...(selectedId ? { id: selectedId } : {}),
        baseUrl: formBaseUrl.trim(),
        ...keyPayload,
      };
      const response = await fetch("/api/account/image-provider", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { models?: string[]; error?: string };
      if (!response.ok) throw new Error(data.error || "连接失败");
      const discovered = data.models || [];
      if (discovered.length) {
        setFormModelsText(discovered.join("\n"));
        if (!discovered.includes(formDefaultModel)) setFormDefaultModel(discovered[0]);
      }
      setMessage({
        ok: true,
        text: discovered.length
          ? `连接成功，发现 ${discovered.length} 个模型；点击保存后生效`
          : "连接成功，但 /models 没有返回模型，请手动填写模型名",
      });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "连接失败" });
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    if (!selectedId) return;
    if (!window.confirm(`确定删除供应商「${selected?.name || ""}」？此操作不可恢复。`)) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/account/image-provider?id=${encodeURIComponent(selectedId)}`,
        { method: "DELETE", headers: await authHeader() }
      );
      const data = (await response.json()) as { providers?: ProviderView[]; error?: string };
      if (!response.ok) throw new Error(data.error || "删除失败");
      setProviders(data.providers || []);
      const next = (data.providers || []);
      selectProvider(next.find((p) => p.isActive) ?? next[0] ?? null);
      setMessage({ ok: true, text: "已删除" });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "删除失败" });
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(presetKey: string) {
    const preset = IMAGE_PROVIDER_PRESETS.find((p) => p.key === presetKey);
    setPresetOpen(false);
    selectProvider(null);
    if (preset) {
      setFormName(preset.name);
      setFormProtocol(preset.protocol);
      setFormBaseUrl(preset.baseUrl);
      if (preset.sampleModels.length) {
        setFormModelsText(preset.sampleModels.join("\n"));
        setFormDefaultModel(preset.sampleModels[0]);
      }
    }
  }

  function applyJsonImport() {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonText) as {
        name?: unknown;
        baseUrl?: unknown;
        apiKey?: unknown;
        protocol?: unknown;
        models?: unknown;
      };
      if (!parsed.baseUrl || typeof parsed.baseUrl !== "string") {
        throw new Error("缺少 baseUrl 字段");
      }
      setPresetOpen(false);
      selectProvider(null);
      setFormName(typeof parsed.name === "string" ? parsed.name : "导入的供应商");
      setFormProtocol(parsed.protocol === "chat-completions" ? "chat-completions" : "openai-images");
      setFormBaseUrl(parsed.baseUrl);
      if (typeof parsed.apiKey === "string" && parsed.apiKey) setFormApiKey(parsed.apiKey);
      const importedModels = Array.isArray(parsed.models)
        ? parsed.models.map(String).filter(Boolean)
        : [];
      if (importedModels.length) {
        setFormModelsText(importedModels.join("\n"));
        setFormDefaultModel(importedModels[0]);
      }
      setMessage({ ok: true, text: "已从 JSON 填入表单，确认无误后点保存" });
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "JSON 解析失败");
    }
  }

  if (!ready || !user || !loaded) {
    return <div className="px-5 py-16 text-sm text-c-text3">正在读取图片接口配置…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-6 lg:px-8">
      <Link href="/account" className="inline-flex items-center gap-1.5 text-sm text-c-text3 hover:text-c-text">
        <ArrowLeft className="h-4 w-4" /> 返回账号中心
      </Link>
      <div className="mt-4">
        <h1 className="text-[26px] font-bold text-c-text">图片生成接口</h1>
        <p className="mt-1 text-sm text-c-text3">
          为当前账号接入 OpenAI 兼容的图片服务：可保存多个供应商，一键切换当前使用的上游；用自己的接口生成不消耗站内积分。
        </p>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[300px_1fr]">
        {/* 左栏:供应商列表(cc-switch 式) */}
        <div className="border border-c-border bg-c-card p-3 shadow-card">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[13px] font-semibold text-c-text2">
              供应商 ({providers.length})
            </span>
            {activeProvider && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                当前：{activeProvider.name}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className={cn(
                  "group cursor-pointer rounded-xl border p-3 transition-colors",
                  provider.id === selectedId
                    ? "border-acc bg-acc-tint"
                    : "border-c-border bg-c-subtle hover:border-c-border2"
                )}
                onClick={() => selectProvider(provider)}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-c-text">
                    {provider.name}
                  </span>
                  {provider.isActive ? (
                    <span className="flex flex-none items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      <Check className="h-3 w-3" /> 当前
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={activatingId === provider.id || busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void activate(provider.id);
                      }}
                      className="flex flex-none items-center gap-1 rounded-full border border-c-border2 px-2 py-0.5 text-[10px] font-semibold text-c-text3 opacity-0 transition-opacity hover:border-acc hover:text-acc group-hover:opacity-100 disabled:opacity-40"
                    >
                      {activatingId === provider.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Star className="h-3 w-3" />
                      )}
                      设为当前
                    </button>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-c-text3">
                  <span className="rounded bg-c-card px-1.5 py-0.5 font-medium">
                    {PROTOCOL_LABEL[provider.protocol]}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{provider.baseUrl}</span>
                </div>
                <div className="mt-1 text-[11px] text-c-text3">
                  {provider.models.length} 个模型
                  {provider.defaultModel ? ` · 默认 ${provider.defaultModel}` : ""}
                </div>
              </div>
            ))}
            {!providers.length && (
              <div className="rounded-xl border border-dashed border-c-border px-3 py-6 text-center text-[12px] leading-relaxed text-c-text3">
                还没有供应商。
                <br />
                点击下方按钮，从预设开始配置。
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => {
              setJsonText("");
              setJsonError(null);
              setPresetOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> 新增供应商
          </Button>
        </div>

        {/* 右栏:编辑表单 */}
        <div className="border border-c-border bg-c-card p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[16px] font-bold text-c-text">
              {isNewDraft ? "新增供应商" : `编辑 · ${selected?.name ?? ""}`}
            </h2>
            {selected?.isActive && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                当前使用中
              </span>
            )}
          </div>

          <label className="mt-4 block space-y-1.5 text-sm font-medium text-c-text">
            名称
            <Input
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              placeholder="例如：我的 302 中转"
            />
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium text-c-text">
              接口协议
              <select
                value={formProtocol}
                onChange={(event) => setFormProtocol(event.target.value as Protocol)}
                className="h-10 w-full border border-c-border2 bg-white px-3 text-sm outline-none focus:border-acc"
              >
                <option value="openai-images">OpenAI Images API</option>
                <option value="chat-completions">Chat Completions 生图</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium text-c-text">
              默认模型
              <select
                value={formDefaultModel}
                onChange={(event) => setFormDefaultModel(event.target.value)}
                className="h-10 w-full border border-c-border2 bg-white px-3 text-sm outline-none focus:border-acc"
              >
                {models.length ? (
                  models.map((model) => <option key={model}>{model}</option>)
                ) : (
                  <option value="">请先填写模型</option>
                )}
              </select>
            </label>
          </div>

          <label className="mt-4 block space-y-1.5 text-sm font-medium text-c-text">
            API Base URL
            <Input
              value={formBaseUrl}
              onChange={(event) => setFormBaseUrl(event.target.value)}
              placeholder="https://your-image-api.example.com/v1"
            />
          </label>

          <label className="mt-4 block space-y-1.5 text-sm font-medium text-c-text">
            API Key
            <Input
              type="password"
              value={formApiKey}
              onChange={(event) => setFormApiKey(event.target.value)}
              placeholder={
                editingKey.hasKey
                  ? `当前 ${editingKey.keyMasked}，留空保持不变`
                  : "粘贴 API Key"
              }
            />
            <span className="flex items-center gap-1.5 text-xs font-normal text-c-text3">
              <KeyRound className="h-3.5 w-3.5" /> 浏览器加密传输，服务端按账号加密保存，不会回显完整 Key。
            </span>
          </label>

          <label className="mt-4 block space-y-1.5 text-sm font-medium text-c-text">
            可用模型
            <textarea
              value={formModelsText}
              onChange={(event) => setFormModelsText(event.target.value)}
              placeholder="每行一个，例如：\ngpt-image-2\ngemini-3.1-flash-image-square"
              className="min-h-28 w-full resize-y border border-c-border2 bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-c-text4 focus:border-acc"
            />
          </label>

          <label className="mt-4 flex items-center gap-2 text-sm text-c-text">
            <input
              type="checkbox"
              checked={formActivate}
              onChange={(event) => setFormActivate(event.target.checked)}
              className="h-4 w-4 accent-[var(--acc)]"
            />
            保存后设为当前使用（生图页/画布将使用这个上游）
          </label>

          {message && (
            <div
              className={`mt-4 flex items-start gap-2 border px-3 py-2.5 text-sm ${
                message.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {message.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" /> : null}
              {message.text}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-c-border pt-4">
            <Button variant="primary" onClick={() => void save()} disabled={busy || testing}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isNewDraft ? "保存供应商" : "保存修改"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void testConnection()}
              disabled={busy || testing || !formBaseUrl.trim() || (!editingKey.hasKey && !formApiKey.trim())}
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              测试并读取模型
            </Button>
            {selected && (
              <Button
                variant="outline"
                onClick={() => void remove()}
                disabled={busy || testing}
                className="ml-auto text-c-danger"
              >
                <Trash2 className="h-4 w-4" /> 删除
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 新增供应商弹窗:预设网格 + JSON 导入(cc-switch「从 OpenAI / JSON 导入」对应物) */}
      {presetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPresetOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h3 className="text-base font-bold text-foreground">新增供应商</h3>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setPresetOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                从预设开始
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {IMAGE_PROVIDER_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset.key)}
                    className="rounded-xl border border-border bg-secondary/40 p-3 text-left transition-colors hover:border-acc"
                  >
                    <span className="block text-[13.5px] font-bold text-foreground">
                      {preset.name}
                    </span>
                    <span className="mt-0.5 block line-clamp-1 text-[11px] text-muted-foreground">
                      {preset.baseUrl || "手动填写地址"}
                    </span>
                    {preset.note && (
                      <span className="mt-1 block text-[11px] text-muted-foreground/80">
                        {preset.note}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                从 JSON 导入
              </p>
              <textarea
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                rows={4}
                placeholder={`粘贴配置，例如：\n{"name":"我的中转","baseUrl":"https://api.example.com/v1","apiKey":"sk-...","protocol":"chat-completions","models":["gpt-image-2"]}`}
                className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] leading-5 outline-none focus:border-acc"
              />
              {jsonError && (
                <p className="mt-1.5 text-[12px] font-medium text-red-500">{jsonError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setPresetOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={applyJsonImport} disabled={!jsonText.trim()}>
                导入 JSON
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
