"use client";
import { useState } from "react";
import type { ModelProvider } from "@/lib/model-config/types";
import {
  Choice,
  NumberField,
  Panel,
  TextField,
  Toggle,
  buttonClass,
  inputClass,
  Field,
} from "./fields";
import {encryptCredential} from "./credentials";
export {encryptCredential} from "./credentials";
import type { ProviderCatalogResult } from "@/lib/model-config/catalog";

export function ProviderEditor({
  provider: p,
  protocols,
  onChange,
  saveCredential,
  onSavingChange,
  capacity,
  catalog,
}: {
  provider: ModelProvider;
  capacity?: { maxConcurrent: number; inFlight: number; unlimited?: boolean };
  protocols: string[];
  onChange: (p: ModelProvider) => void;
  saveCredential: (providerId: string, ciphertext: string) => Promise<string>;
  onSavingChange: (saving: boolean) => void;
  catalog?: ProviderCatalogResult & { cached?: boolean; stale?: boolean; lastSuccessAt?: string; configuredModels?: { id: string; label: string }[] };
}) {
  const [secret, setSecret] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const edit = (patch: Partial<ModelProvider>) => onChange({ ...p, ...patch });
  const video = ![
    "openai-images",
    "openai-chat",
    "openai-audio",
    "new-api-flow",
    "apimart-images",
    "fal-images",
  ].includes(p.protocol);
  const options = p.options || {};
  return (
    <Panel title={p.name || p.id}>
      <fieldset disabled={saving} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="供应商标识"
            value={p.id}
            disabled
            onChange={() => {}}
          />
          <TextField
            label="供应商名称"
            value={p.name}
            onChange={(name) => edit({ name })}
          />
          <Choice
            label="接口协议"
            value={p.protocol}
            options={protocols.map((value) => ({ value, label: value }))}
            onChange={(protocol) =>
              edit({
                protocol: protocol as ModelProvider["protocol"],
                options: undefined,
              })
            }
          />
          <TextField
            label="接口地址"
            value={p.baseUrl}
            placeholder="https://api.example.com/v1"
            onChange={(baseUrl) => edit({ baseUrl })}
          />
          <NumberField
            label="请求超时（毫秒）"
            value={p.timeoutMs}
            min={1000}
            max={900000}
            onChange={(timeoutMs) => edit({ timeoutMs })}
          />
          {capacity?.unlimited ? <TextField label="供应商并发上限" value="不限并发" disabled onChange={() => {}} /> : <NumberField
            label="供应商并发上限"
            value={p.maxConcurrent}
            min={1}
            max={256}
            onChange={(maxConcurrent) => edit({ maxConcurrent })}
          />}
        </div>
        <Toggle
          label="允许新任务使用此供应商"
          value={p.enabled}
          onChange={(enabled) => edit({ enabled })}
        />
        <p className="break-all text-xs text-c-text3">
          凭据：{p.credentialRef ? `已配置 · ${p.credentialRef}` : "尚未配置"}
          。轮换后旧任务保留原凭据。历史版本仍在使用时，并发按保留版本的最低限制执行。
        </p>
        {catalog && (
          <div className="border border-c-border bg-c-bg p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">供应商模型目录</span>
              <span className="text-c-text3">{!catalog.fetchedAt ? "尚未读取" : catalog.status === "ok" ? `已发现 ${catalog.models.length} 个` : catalog.status === "empty" ? "接口返回为空" : catalog.error || "暂不可用"}</span>
            </div>
            {catalog.models.length > 0 && <div className="mt-2 flex max-h-60 flex-wrap gap-2 overflow-auto">{catalog.models.map((model) => <span key={model.id} className="break-all border border-c-border bg-white px-2 py-1" title={model.id}>{model.label}{model.label !== model.id ? ` · ${model.id}` : ""}</span>)}</div>}
            {!catalog.models.length && !!catalog.configuredModels?.length && <p className="mt-2 text-c-text3">已配置（不是本次接口发现）：{catalog.configuredModels.map(model=>model.label||model.id).join("、")}</p>}
            {catalog.models.length>0 && catalog.status!=="ok" && <p className="mt-2 text-amber-700">当前显示上次成功目录，本次请求未成功。</p>}
            {catalog.truncated && <p className="mt-2 text-c-text3">目录较大，仅展示前 600 个模型。</p>}
            {catalog.lastSuccessAt && <p className="mt-2 text-c-text3">上次成功读取：{new Date(catalog.lastSuccessAt).toLocaleString("zh-CN")}</p>}
          </div>
        )}
        {capacity && (
          <p className="text-xs text-c-text3">
            当前并发上限：{capacity.unlimited ? "不限" : capacity.maxConcurrent} · 有效执行占用：
            {capacity.inFlight}{capacity.unlimited ? "。" : "。草稿上限在发布后适用，保留版本仍使用最低限制。"}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="新 API 密钥">
            <input
              aria-label="新 API 密钥"
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </Field>
          <button
            type="button"
            className={buttonClass}
            disabled={saving || !secret.trim()}
            onClick={async () => {
              setSaving(true);
              onSavingChange(true);
              setError("");
              try {
                const ref = await saveCredential(
                  p.id,
                  await encryptCredential(secret.trim()),
                );
                edit({ credentialRef: ref });
                setSecret("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "密钥保存失败");
              } finally {
                setSaving(false);
                onSavingChange(false);
              }
            }}
          >
            {saving ? "正在加密保存…" : "加密保存新凭据"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        {video && (
          <details>
            <summary className="cursor-pointer text-sm">
              视频接口适配参数
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(
                ["createPath", "pollPath", "contentPath", "workflowId"] as const
              ).map((key) => (
                <TextField
                  key={key}
                  label={
                    {
                      createPath: "创建路径",
                      pollPath: "查询路径（{id} 为任务标识）",
                      contentPath: "下载路径（{id} 为任务标识）",
                      workflowId: "工作流标识",
                    }[key]
                  }
                  value={options[key] || ""}
                  onChange={(value) =>
                    edit({ options: { ...options, [key]: value || undefined } })
                  }
                />
              ))}
              <Choice
                label="供应商幂等方式"
                value={options.idempotencyStrategy || "none"}
                options={[
                  { value: "none", label: "未验证 / 不支持" },
                  { value: "header", label: "请求头" },
                  { value: "body", label: "请求正文" },
                ]}
                onChange={(value) =>
                  edit({
                    options: {
                      ...options,
                      idempotencyStrategy: value as "none" | "header" | "body",
                    },
                  })
                }
              />
              {options.idempotencyStrategy === "body" && (
                <TextField
                  label="幂等正文字段"
                  value={options.idempotencyBodyField || ""}
                  onChange={(value) =>
                    edit({
                      options: {
                        ...options,
                        idempotencyBodyField: value || undefined,
                      },
                    })
                  }
                />
              )}
              <Toggle
                label="Authorization 使用原始密钥"
                value={!!options.rawAuthorization}
                onChange={(value) =>
                  edit({ options: { ...options, rawAuthorization: value } })
                }
              />
            </div>
            <p className="mt-3 text-xs text-c-text3">
              提交结果不明时暂停核查；声明幂等参数不会触发自动重新付费提交。
            </p>
          </details>
        )}
      </fieldset>
    </Panel>
  );
}
