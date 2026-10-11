"use client";
import type { ModelProvider, UpstreamModel } from "@/lib/model-config/types";
import { Choice, NumberField, Panel, TextField, Toggle, Chips } from "./fields";
const qualities = ["low", "medium", "high", "xhigh", "max", "auto"];
const resolutions = ["1K", "2K", "4K"];
export function UpstreamEditor({
  model: m,
  providers,
  costs,
  onChange,
}: {
  model: UpstreamModel;
  providers: ModelProvider[];
  costs: { key: string; currency: string; unit: string; source: string }[];
  onChange: (m: UpstreamModel) => void;
}) {
  const edit = (patch: Partial<UpstreamModel>) => onChange({ ...m, ...patch }),
    c = m.capabilities;
  const capability = (patch: Partial<typeof c>) =>
    edit({ capabilities: { ...c, ...patch } });
  const mapping = (
    type: "quality" | "resolution",
    key: string,
    value: string,
  ) => {
    const values: Record<string, string> = { ...m.parameterMap[type] };
    if (value) values[key] = value;
    else delete values[key];
    edit({ parameterMap: { ...m.parameterMap, [type]: values } });
  };
  return (
    <Panel title={m.label || m.id}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="上游标识" value={m.id} disabled onChange={() => {}} />
        <TextField
          label="上游显示名称"
          value={m.label}
          onChange={(label) => edit({ label })}
        />
        <Choice
          label="所属供应商"
          value={m.providerId}
          options={providers.map((p) => ({
            value: p.id,
            label: p.name || p.id,
          }))}
          onChange={(providerId) => edit({ providerId })}
        />
        <TextField
          label="实际提交的模型名"
          value={m.model}
          onChange={(model) => edit({ model })}
        />
        <Choice
          label="模型类型"
          value={m.modality}
          options={[
            { value: "image", label: "图片" },
            { value: "text", label: "文字 / 视觉" },
            { value: "video", label: "视频" },
          ]}
          onChange={(modality) =>
            edit({ modality: modality as UpstreamModel["modality"] })
          }
        />
        <Choice
          label="上游成本引用"
          value={m.costRef || ""}
          options={[
            { value: "", label: "未登记成本" },
            ...costs.map((x) => ({
              value: x.key,
              label: `${x.key} · ${x.currency}/${x.unit} · ${x.source}`,
            })),
          ]}
          onChange={(value) => edit({ costRef: value || undefined })}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <Toggle
          label="启用上游模型"
          value={m.enabled}
          onChange={(enabled) => edit({ enabled })}
        />
        <Toggle
          label="能力已核验"
          value={c.verified}
          onChange={(verified) => capability({ verified })}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        {(
          [
            "generate",
            "edit",
            "vision",
            "transparent",
            "preserveIdentity",
            "textAccuracy",
          ] as const
        ).map((key) => (
          <Toggle
            key={key}
            label={
              {
                generate: "生成",
                edit: "参考图编辑",
                vision: "视觉输入",
                transparent: "透明背景",
                preserveIdentity: "保持产品身份",
                textAccuracy: "准确生成文字",
              }[key]
            }
            value={c[key]}
            onChange={(value) => capability({ [key]: value })}
          />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          label="质量能力等级（1–5）"
          value={c.qualityRank}
          min={1}
          max={5}
          onChange={(qualityRank) => capability({ qualityRank })}
        />
        <NumberField
          label="最大参考图数量"
          value={c.maxReferenceImages}
          max={32}
          onChange={(maxReferenceImages) => capability({ maxReferenceImages })}
        />
        <NumberField
          label="预估延迟（毫秒）"
          value={c.expectedLatencyMs}
          max={900000}
          onChange={(expectedLatencyMs) => capability({ expectedLatencyMs })}
        />
      </div>
      <Chips
        label="实际支持的质量档位"
        values={qualities.map((value) => ({ value, label: value }))}
        selected={c.qualities}
        onChange={(values) =>
          capability({ qualities: values as typeof c.qualities })
        }
      />
      <Chips
        label="实际支持的原生尺寸"
        values={resolutions.map((value) => ({ value, label: value }))}
        selected={c.nativeResolutions}
        onChange={(values) =>
          capability({
            nativeResolutions: values as typeof c.nativeResolutions,
          })
        }
      />
      <details>
        <summary className="cursor-pointer text-sm">质量与尺寸参数映射</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {qualities.map((key) => (
            <TextField
              key={key}
              label={`${key} 对应的上游质量值`}
              value={
                m.parameterMap.quality?.[
                  key as keyof NonNullable<typeof m.parameterMap.quality>
                ] || ""
              }
              onChange={(value) => mapping("quality", key, value)}
            />
          ))}
          {resolutions.map((key) => (
            <TextField
              key={key}
              label={`${key} 对应的上游尺寸值`}
              value={
                m.parameterMap.resolution?.[
                  key as keyof NonNullable<typeof m.parameterMap.resolution>
                ] || ""
              }
              onChange={(value) => mapping("resolution", key, value)}
            />
          ))}
          <TextField
            label="上游版本参数"
            value={m.parameterMap.version || ""}
            onChange={(value) =>
              edit({
                parameterMap: {
                  ...m.parameterMap,
                  version: value || undefined,
                },
              })
            }
          />
        </div>
      </details>
      <p className="text-xs text-c-text3">
        质量档位与原生尺寸需要真实核验。OpenAI 图片协议的原生 2K / 4K
        必须填写尺寸映射。成本金额统一在计费管理维护，此处只引用。
      </p>
    </Panel>
  );
}
