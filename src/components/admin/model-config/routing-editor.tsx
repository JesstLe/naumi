"use client";
import type {
  ModelConfig,
  ModelPool,
  PublicModel,
} from "@/lib/model-config/types";
import {
  Choice,
  NumberField,
  Panel,
  TextField,
  Toggle,
  Chips,
  buttonClass,
} from "./fields";
const qualities = ["low", "medium", "high", "xhigh", "max", "auto"],
  sizes = ["1K", "2K", "4K"];
const modalityLabels = { image: "图片", text: "文字 / 视觉", video: "视频", audio: "声音" };
type Rule = ModelPool["rules"][number];
function RuleEditor({
  rule: r,
  onChange,
  onRemove,
}: {
  rule: Rule;
  onChange: (r: Rule) => void;
  onRemove: () => void;
}) {
  const when = (patch: Partial<Rule["when"]>) =>
    onChange({ ...r, when: { ...r.when, ...patch } });
  return (
    <div className="space-y-4 rounded-lg border border-c-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong className="break-all text-sm">规则 {r.id}</strong>
        <button type="button" className={buttonClass} onClick={onRemove}>
          移除此草稿规则
        </button>
      </div>
      <NumberField
        label="规则优先级（数值越大越优先）"
        value={r.priority}
        max={100000}
        onChange={(priority) => onChange({ ...r, priority })}
      />
      <Chips
        label="适用任务（不选表示全部）"
        values={[
          { value: "draft", label: "草图" },
          { value: "product", label: "商品" },
          { value: "detail", label: "详情" },
          { value: "layout", label: "文字排版" },
        ]}
        selected={r.when.task || []}
        onChange={(values) =>
          when({
            task: values.length ? (values as Rule["when"]["task"]) : undefined,
          })
        }
      />
      <Chips
        label="适用质量（不选表示全部）"
        values={qualities.map((value) => ({ value, label: value }))}
        selected={r.when.quality || []}
        onChange={(values) =>
          when({
            quality: values.length
              ? (values as Rule["when"]["quality"])
              : undefined,
          })
        }
      />
      <Chips
        label="适用尺寸（不选表示全部）"
        values={sizes.map((value) => ({ value, label: value }))}
        selected={r.when.resolution || []}
        onChange={(values) =>
          when({
            resolution: values.length
              ? (values as Rule["when"]["resolution"])
              : undefined,
          })
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            "needsEdit",
            "needsText",
            "preserveIdentity",
            "nativeResolution",
          ] as const
        ).map((key) => (
          <Choice
            key={key}
            label={
              {
                needsEdit: "参考图条件",
                needsText: "文字生成条件",
                preserveIdentity: "产品身份条件",
                nativeResolution: "原生尺寸条件",
              }[key]
            }
            value={r.when[key] === undefined ? "any" : String(r.when[key])}
            options={[
              { value: "any", label: "不限制" },
              { value: "true", label: "需要" },
              { value: "false", label: "不需要" },
            ]}
            onChange={(value) =>
              when({ [key]: value === "any" ? undefined : value === "true" })
            }
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {(
          [
            "preserveIdentity",
            "textAccuracy",
            "nativeResolution",
            "edit",
          ] as const
        ).map((key) => (
          <Toggle
            key={key}
            label={
              {
                preserveIdentity: "要求保持产品身份",
                textAccuracy: "要求准确文字",
                nativeResolution: "要求原生尺寸",
                edit: "要求参考图编辑",
              }[key]
            }
            value={!!r.require[key]}
            onChange={(value) =>
              onChange({ ...r, require: { ...r.require, [key]: value } })
            }
          />
        ))}
      </div>
      <NumberField
        label="最低质量等级（0 表示无额外限制）"
        value={r.require.minQualityRank || 0}
        max={5}
        onChange={(value) =>
          onChange({
            ...r,
            require: { ...r.require, minQualityRank: value || undefined },
          })
        }
      />
    </div>
  );
}
export function PoolEditor({
  pool: p,
  config,
  onChange,
}: {
  pool: ModelPool;
  config: ModelConfig;
  onChange: (p: ModelPool) => void;
}) {
  return (
    <Panel title={`混合路由 · ${p.id}`}>
      <Choice
        label="候选选择策略"
        value={p.strategy}
        options={[
          { value: "priority", label: "按候选顺序" },
          { value: "lowest-cost", label: "按已登记货币成本" },
          { value: "latency", label: "按预估延迟" },
        ]}
        onChange={(strategy) =>
          onChange({ ...p, strategy: strategy as ModelPool["strategy"] })
        }
      />
      <Chips
        label="包含的上游模型"
        values={config.upstreamModels
          .filter((u) => u.modality === "image")
          .map((u) => ({
            value: u.id,
            label: `${u.label} · ${config.providers.find((x) => x.id === u.providerId)?.name || u.providerId}${u.capabilities.verified ? "" : " · 能力待核验"}`,
          }))}
        selected={p.candidates}
        onChange={(candidates) => onChange({ ...p, candidates })}
      />
      <ol className="space-y-2">
        {p.candidates.map((id, i) => (
          <li
            key={id}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-c-bg p-3 text-sm"
          >
            <span className="min-w-0 flex-1 break-words">
              {i + 1}.{" "}
              {config.upstreamModels.find((u) => u.id === id)?.label || id}
            </span>
            <button
              type="button"
              className={buttonClass}
              disabled={i === 0}
              onClick={() => {
                const candidates = [...p.candidates];
                [candidates[i - 1], candidates[i]] = [
                  candidates[i],
                  candidates[i - 1],
                ];
                onChange({ ...p, candidates });
              }}
            >
              上移
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={i === p.candidates.length - 1}
              onClick={() => {
                const candidates = [...p.candidates];
                [candidates[i + 1], candidates[i]] = [
                  candidates[i],
                  candidates[i + 1],
                ];
                onChange({ ...p, candidates });
              }}
            >
              下移
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-c-text3">
        候选列表就是此路由的完整组成。最低成本策略需要统一计费配置中的货币成本；未登记成本和币种冲突不会被当成免费通道。
      </p>
      {p.rules.map((r, i) => (
        <RuleEditor
          key={r.id}
          rule={r}
          onChange={(value) =>
            onChange({
              ...p,
              rules: p.rules.map((x, n) => (n === i ? value : x)),
            })
          }
          onRemove={() =>
            onChange({ ...p, rules: p.rules.filter((_, n) => n !== i) })
          }
        />
      ))}
      <button
        type="button"
        className={buttonClass}
        onClick={() =>
          onChange({
            ...p,
            rules: [
              ...p.rules,
              {
                id: `rule-${crypto.randomUUID().slice(0, 8)}`,
                priority: 0,
                when: {},
                require: {},
              },
            ],
          })
        }
      >
        添加能力路由规则
      </button>
    </Panel>
  );
}
export function PublicModelEditor({
  model: m,
  config,
  onChange,
}: {
  model: PublicModel;
  config: ModelConfig;
  onChange: (m: PublicModel) => void;
}) {
  const targets = [
    ...config.upstreamModels
      .filter((u) => u.modality === m.modality)
      .map((u) => ({ value: `upstream:${u.id}`, label: `上游 · ${u.label}` })),
    ...(m.modality === "image"
      ? config.pools.map((p) => ({
          value: `pool:${p.id}`,
          label: `混合路由 · ${p.id}`,
        }))
      : []),
  ];
  const uses = Object.entries(config.bindings)
    .filter(([, id]) => id === m.id)
    .map(([key]) => key);
  return (
    <Panel title={`用户可选模型 · ${m.label || m.id}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="公开模型标识"
          value={m.id}
          disabled
          onChange={() => {}}
        />
        <TextField
          label="用户看到的模型名称"
          value={m.label}
          onChange={(label) => onChange({ ...m, label })}
        />
        <Choice
          label="公开模型类型"
          value={m.modality}
          options={Object.entries(modalityLabels).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={(modality) =>
            onChange({ ...m, modality: modality as PublicModel["modality"] })
          }
        />
        <Choice
          label="实际执行目标"
          value={`${m.target.type}:${m.target.id}`}
          options={[{ value: "", label: "请选择执行目标" }, ...targets]}
          onChange={(value) => {
            const colon = value.indexOf(":");
            onChange({
              ...m,
              target: {
                type: value.slice(0, colon) as "upstream" | "pool",
                id: value.slice(colon + 1),
              },
            });
          }}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <Toggle
          label="允许新任务使用"
          value={m.enabled}
          onChange={(enabled) => onChange({ ...m, enabled })}
        />
        <Toggle
          label="显示在用户模型选择器中"
          value={m.visible}
          onChange={(visible) => onChange({ ...m, visible })}
        />
      </div>
      <p className="break-words text-xs text-c-text3">
        默认用途：{uses.join("、") || "无"}。隐藏模型仍可用于后台默认绑定。
      </p>
      {m.target.type === "pool" && (
        <details>
          <summary className="cursor-pointer text-sm">
            展开此模型包含的实际候选
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {config.pools
              .find((p) => p.id === m.target.id)
              ?.candidates.map((id) => {
                const u = config.upstreamModels.find((x) => x.id === id);
                return (
                  <li key={id} className="break-words">
                    {u?.label || id} · {u?.model} ·{" "}
                    {config.providers.find((p) => p.id === u?.providerId)?.name}
                  </li>
                );
              })}
          </ul>
        </details>
      )}
    </Panel>
  );
}
