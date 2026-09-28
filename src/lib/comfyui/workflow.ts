// ---------------------------------------------------------------------------
// ComfyUI 工作流解析(纯函数,无 IO):格式检测、输入提取、参数覆盖。
//
// 一期只支持 API 格式(节点 id 为键、{class_type, inputs} 为值)——编辑器格式
// 的 widgets_values 是按位置序列化的,离线转换需要端点 /object_info 的输入
// 定义,误映射会静默改坏参数;因此明确拒绝并给导出指引(二期接 object_info
// 再做转换)。输入提取是 curated 白名单:图片槽/文生文提示词/种子/常用尺寸,
// 其余参数由用户在 ComfyUI 侧调好再导出(工作流=配方)。
// ---------------------------------------------------------------------------

export type ApiWorkflow = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }>;

export type WorkflowInputs = {
  /** LoadImage 节点:运行时映射画布选中的图 */
  images: { nodeId: string; label: string; current: string }[];
  /** CLIPTextEncode 文本(按下游 sampler 连接推断正/负向) */
  texts: { nodeId: string; label: string; role: "positive" | "negative" | "text"; current: string }[];
  /** 数值种子(每次运行默认重掷) */
  seeds: { nodeId: string; field: string; current: number }[];
  /** 常用尺寸/批量(存在才展示) */
  numerics: { nodeId: string; field: string; label: string; current: number }[];
  /** 工作流引用的全部节点类(缺件报告用) */
  requiredNodes: string[];
};

export type WorkflowOverrides = {
  /** ComfyUI /upload/image 返回的图片名(含 subfolder 前缀),按 images 顺序对应 */
  imageNames?: string[];
  texts?: Record<string, string>;
  seeds?: Record<string, number>;
  numerics?: Record<string, Record<string, number>>;
};

const SAMPLER_CLASSES = new Set([
  "KSampler",
  "KSamplerAdvanced",
  "SamplerCustom",
  "SamplerCustomAdvanced",
  "basic_string",
]);

const NUMERIC_FIELDS: Record<string, string> = {
  width: "宽",
  height: "高",
  length: "帧数",
  batch_size: "批量",
};

/** 判断 JSON 是否为 API 格式;编辑器格式返回 "ui" 由调用方给指引。 */
export function detectWorkflowFormat(value: unknown): "api" | "ui" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // 编辑器格式:顶层带 nodes 数组(litegraph)
  if (Array.isArray(record.nodes)) return "ui";
  // API 格式:值均为 {class_type, inputs}
  let hit = 0;
  let checked = 0;
  for (const v of Object.values(record)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    checked += 1;
    const n = v as Record<string, unknown>;
    if (typeof n.class_type === "string" && n.inputs && typeof n.inputs === "object") hit += 1;
  }
  if (checked > 0 && hit === checked) return "api";
  return null;
}

function nodeTitle(node: ApiWorkflow[string], nodeId: string): string {
  return node._meta?.title?.trim() || `${node.class_type} ${nodeId}`;
}

/** 从 API 工作流提取可编辑输入(curated 白名单)。 */
export function extractWorkflowInputs(api: ApiWorkflow): WorkflowInputs {
  // 正负向判定:找 sampler 的 positive/negative 连线来源
  const textRole = new Map<string, "positive" | "negative">();
  for (const node of Object.values(api)) {
    if (!SAMPLER_CLASSES.has(node.class_type)) continue;
    for (const [field, target] of [
      ["positive", "positive"] as const,
      ["negative", "negative"] as const,
    ]) {
      const ref = node.inputs[field];
      if (Array.isArray(ref) && typeof ref[0] === "string") {
        if (!textRole.has(ref[0])) textRole.set(ref[0], target);
      }
    }
  }

  const images: WorkflowInputs["images"] = [];
  const texts: WorkflowInputs["texts"] = [];
  const seeds: WorkflowInputs["seeds"] = [];
  const numerics: WorkflowInputs["numerics"] = [];
  const requiredNodes = new Set<string>();

  for (const [nodeId, node] of Object.entries(api)) {
    requiredNodes.add(node.class_type);
    const title = nodeTitle(node, nodeId);

    if (node.class_type === "LoadImage") {
      images.push({
        nodeId,
        label: title,
        current: typeof node.inputs.image === "string" ? node.inputs.image : "",
      });
      continue;
    }
    if (/^CLIPTextEncode/.test(node.class_type)) {
      const role = textRole.get(nodeId) ?? "text";
      texts.push({
        nodeId,
        label: title,
        role,
        current: typeof node.inputs.text === "string" ? node.inputs.text : "",
      });
      continue;
    }
    for (const [field, value] of Object.entries(node.inputs)) {
      if (typeof value !== "number") continue;
      if (field === "seed" || field === "noise_seed") {
        seeds.push({ nodeId, field, current: value });
      } else if (NUMERIC_FIELDS[field] && Number.isInteger(value) && value > 0) {
        numerics.push({ nodeId, field, label: NUMERIC_FIELDS[field], current: value });
      }
    }
  }

  return { images, texts, seeds, numerics, requiredNodes: Array.from(requiredNodes).sort() };
}

/** 深拷贝并把覆盖值写回工作流;imageNames 按提取顺序逐个填入 LoadImage。 */
export function applyWorkflowOverrides(
  api: ApiWorkflow,
  overrides: WorkflowOverrides
): ApiWorkflow {
  const next: ApiWorkflow = JSON.parse(JSON.stringify(api));
  const inputs = extractWorkflowInputs(next);

  inputs.images.forEach((slot, index) => {
    const name = overrides.imageNames?.[index];
    if (name) next[slot.nodeId].inputs.image = name;
  });
  for (const slot of inputs.texts) {
    const value = overrides.texts?.[slot.nodeId];
    if (typeof value === "string" && value.trim()) {
      next[slot.nodeId].inputs.text = value;
    }
  }
  for (const slot of inputs.seeds) {
    const value = overrides.seeds?.[slot.nodeId];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[slot.nodeId].inputs[slot.field] = Math.floor(value);
    }
  }
  for (const slot of inputs.numerics) {
    const value = overrides.numerics?.[slot.nodeId]?.[slot.field];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      next[slot.nodeId].inputs[slot.field] = Number.isInteger(slot.current)
        ? Math.floor(value)
        : value;
    }
  }
  return next;
}

/** 端点 object_info 的键集合 → 工作流缺件清单。 */
export function missingNodes(required: string[], objectInfoKeys: string[]): string[] {
  const have = new Set(objectInfoKeys);
  return required.filter((cls) => !have.has(cls));
}

