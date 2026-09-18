"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, PlugZap, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProviderView = {
  configured: boolean;
  enabled: boolean;
  protocol: "openai-images" | "chat-completions";
  baseUrl: string;
  hasKey: boolean;
  keyMasked: string;
  models: string[];
  defaultModel: string;
  publicKeyPem: string;
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

export function ImageProviderClient() {
  const { user, ready } = useAuth();
  const { openAuth } = useAuthModal();
  const [loaded, setLoaded] = useState(false);
  const [publicKeyPem, setPublicKeyPem] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [protocol, setProtocol] = useState<ProviderView["protocol"]>("openai-images");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [keyMasked, setKeyMasked] = useState("");
  const [modelsText, setModelsText] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const models = useMemo(
    () =>
      Array.from(
        new Set(
          modelsText
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ),
    [modelsText]
  );

  useEffect(() => {
    if (ready && !user) openAuth("sign-in");
  }, [ready, user, openAuth]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/account/image-provider", {
          headers: await authHeader(),
          cache: "no-store",
        });
        const data = (await response.json()) as ProviderView & { error?: string };
        if (!response.ok) throw new Error(data.error || "读取失败");
        if (cancelled) return;
        setPublicKeyPem(data.publicKeyPem || "");
        setEnabled(data.enabled);
        setProtocol(data.protocol);
        setBaseUrl(data.baseUrl || "");
        setHasKey(data.hasKey);
        setKeyMasked(data.keyMasked || "");
        setModelsText((data.models || []).join("\n"));
        setDefaultModel(data.defaultModel || data.models?.[0] || "");
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
  }, [user]);

  useEffect(() => {
    if (!models.length) setDefaultModel("");
    else if (!models.includes(defaultModel)) setDefaultModel(models[0]);
  }, [models, defaultModel]);

  async function save() {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        enabled,
        protocol,
        baseUrl: baseUrl.trim(),
        models,
        defaultModel,
      };
      if (apiKey.trim()) {
        if (window.crypto?.subtle && publicKeyPem) {
          payload.encryptedApiKey = await encryptSecret(apiKey.trim(), publicKeyPem);
        } else {
          payload.apiKeyPlain = apiKey.trim();
        }
      }
      const response = await fetch("/api/account/image-provider", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ProviderView & { error?: string };
      if (!response.ok) throw new Error(data.error || "保存失败");
      setHasKey(data.hasKey);
      setKeyMasked(data.keyMasked || "");
      setApiKey("");
      setMessage({ ok: true, text: enabled ? "已保存并启用，生图页和画布可选择自定义模型" : "配置已保存" });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        action: "test",
        baseUrl: baseUrl.trim(),
      };
      if (apiKey.trim()) {
        if (window.crypto?.subtle && publicKeyPem) {
          payload.encryptedApiKey = await encryptSecret(apiKey.trim(), publicKeyPem);
        } else {
          payload.apiKeyPlain = apiKey.trim();
        }
      }
      const response = await fetch("/api/account/image-provider", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { models?: string[]; error?: string };
      if (!response.ok) throw new Error(data.error || "连接失败");
      const discovered = data.models || [];
      if (discovered.length) {
        setModelsText(discovered.join("\n"));
        if (!discovered.includes(defaultModel)) setDefaultModel(discovered[0]);
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

  async function clear() {
    if (!window.confirm("清除后将恢复使用站点默认图片模型，确定继续？")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/account/image-provider", {
        method: "DELETE",
        headers: await authHeader(),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "清除失败");
      }
      setEnabled(false);
      setBaseUrl("");
      setApiKey("");
      setHasKey(false);
      setKeyMasked("");
      setModelsText("");
      setDefaultModel("");
      setMessage({ ok: true, text: "已清除，恢复使用站点默认图片模型" });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "清除失败" });
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !user || !loaded) {
    return <div className="px-5 py-16 text-sm text-c-text3">正在读取图片接口配置…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-7 sm:px-6 lg:px-8">
      <Link href="/account" className="inline-flex items-center gap-1.5 text-sm text-c-text3 hover:text-c-text">
        <ArrowLeft className="h-4 w-4" /> 返回账号中心
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold text-c-text">图片生成接口</h1>
          <p className="mt-1 text-sm text-c-text3">为当前账号接入 OpenAI 兼容的图片生成服务。</p>
        </div>
        <label className="flex items-center gap-2 border border-c-border bg-c-card px-3 py-2 text-sm text-c-text shadow-card">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4 accent-[var(--c-success)]"
          />
          启用我的图片接口
        </label>
      </div>

      <div className="mt-5 border border-c-border bg-c-card p-5 shadow-card sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-c-text">
            接口协议
            <select
              value={protocol}
              onChange={(event) => setProtocol(event.target.value as ProviderView["protocol"])}
              className="h-10 w-full border border-c-border2 bg-white px-3 text-sm outline-none focus:border-acc"
            >
              <option value="openai-images">OpenAI Images API</option>
              <option value="chat-completions">Chat Completions 生图</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium text-c-text">
            默认模型
            <select
              value={defaultModel}
              onChange={(event) => setDefaultModel(event.target.value)}
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

        <label className="mt-5 block space-y-1.5 text-sm font-medium text-c-text">
          API Base URL
          <Input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://your-image-api.example.com/v1"
          />
        </label>

        <label className="mt-5 block space-y-1.5 text-sm font-medium text-c-text">
          API Key
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={hasKey ? `当前 ${keyMasked}，留空保持不变` : "粘贴 API Key"}
          />
          <span className="flex items-center gap-1.5 text-xs font-normal text-c-text3">
            <KeyRound className="h-3.5 w-3.5" /> 浏览器加密传输，服务端按账号加密保存，不会回显完整 Key。
          </span>
        </label>

        <label className="mt-5 block space-y-1.5 text-sm font-medium text-c-text">
          可用模型
          <textarea
            value={modelsText}
            onChange={(event) => setModelsText(event.target.value)}
            placeholder="每行一个，例如：\ngpt-image-2\ngemini-3.1-flash-image-square"
            className="min-h-32 w-full resize-y border border-c-border2 bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-c-text4 focus:border-acc"
          />
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
            保存配置
          </Button>
          <Button
            variant="outline"
            onClick={() => void testConnection()}
            disabled={busy || testing || !baseUrl.trim() || (!hasKey && !apiKey.trim())}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            测试并读取模型
          </Button>
          {hasKey && (
            <Button variant="outline" onClick={() => void clear()} disabled={busy || testing} className="ml-auto text-c-danger">
              <Trash2 className="h-4 w-4" /> 清除配置
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
