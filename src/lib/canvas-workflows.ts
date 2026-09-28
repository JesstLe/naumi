import {
  detectWorkflowFormat,
  extractWorkflowInputs,
  type ApiWorkflow,
} from "@/lib/comfyui/workflow";

// ---------------------------------------------------------------------------
// 画布工作流互操作契约(见 docs/CANVAS_WORKFLOW_INTEGRATION.md):
// ComfyUI API 图 → 校验/依赖扫描(inspect) → 标准 manifest(normalize)。
// 本模块只做纯解析,不执行;执行走 /api/comfyui/run(BYOC 端点适配)。
// 适配器声明:同一份 manifest 可路由的运行环境(本地/云/AutoDL 实例)。
// ---------------------------------------------------------------------------

export type WorkflowAdapterId = "comfyui-local" | "comfy-cloud" | "autodl-app";

export const WORKFLOW_ADAPTERS: {
  id: WorkflowAdapterId;
  label: string;
  description: string;
}[] = [
  {
    id: "comfyui-local",
    label: "自托管 ComfyUI",
    description: "本机 / NAS / 自租 GPU 上的 ComfyUI,填 API 地址即可",
  },
  {
    id: "comfy-cloud",
    label: "Comfy Cloud",
    description: "ComfyUI 官方云(REST API),密钥由端点配置提供",
  },
  {
    id: "autodl-app",
    label: "AutoDL 实例",
    description: "AutoDL 市场应用启动后的 ComfyUI 映射地址,当 comfyui-local 用",
  },
];

/** 模型类输入字段名(常见 loader 节点);值为文件名即记为模型依赖。 */
const MODEL_INPUT_KEYS = new Set([
  "ckpt_name",
  "checkpoint_name",
  "vae_name",
  "lora_name",
  "lora_name1",
  "lora_name2",
  "unet_name",
  "model_name",
  "clip_name",
  "clip_name1",
  "clip_name2",
  "control_net_name",
  "controlnet_name",
  "ipadapter_file",
  "upscale_model",
  "upscale_model_name",
  "bnb_nm_stacked",
]);

function isOutputClass(classType: string): boolean {
  return /^Save/i.test(classType) || /^VHS_VideoCombine/i.test(classType);
}

export type WorkflowDependency = {
  kind: "model" | "custom-node";
  id: string;
  nodeId?: string;
};

export type WorkflowInspection = {
  ok: boolean;
  error?: string;
  nodeCount: number;
  outputNodes: string[];
  dependencies: WorkflowDependency[];
  requiredNodes: string[];
};

/** 校验 API 图并扫描依赖:模型依赖可从输入值直接读出;custom-node 依赖只能
 *  在运行时与端点 /object_info 比对(此处先按 class_type 记为待核对清单)。 */
export function inspectComfyWorkflow(workflow: unknown): WorkflowInspection {
  const empty: WorkflowInspection = {
    ok: false,
    nodeCount: 0,
    outputNodes: [],
    dependencies: [],
    requiredNodes: [],
  };
  if (detectWorkflowFormat(workflow) !== "api") {
    return {
      ...empty,
      error: "不是 ComfyUI API 格式(需要节点 ID 为键、{class_type, inputs} 为值的 JSON)",
    };
  }
  const api = workflow as ApiWorkflow;
  const requiredNodes: string[] = [];
  const outputNodes: string[] = [];
  const dependencies: WorkflowDependency[] = [];
  for (const [nodeId, node] of Object.entries(api)) {
    requiredNodes.push(node.class_type);
    if (isOutputClass(node.class_type)) outputNodes.push(nodeId);
    for (const [field, value] of Object.entries(node.inputs ?? {})) {
      if (!MODEL_INPUT_KEYS.has(field) || typeof value !== "string") continue;
      if (!value || value.includes("[") || Array.isArray(value)) continue;
      dependencies.push({ kind: "model", id: value, nodeId });
    }
  }
  if (!outputNodes.length) {
    return {
      ok: false,
      error: "没有输出节点(SaveImage/视频输出),执行后不会有产物",
      nodeCount: Object.keys(api).length,
      outputNodes,
      dependencies,
      requiredNodes,
    };
  }
  return {
    ok: true,
    nodeCount: Object.keys(api).length,
    outputNodes: outputNodes.sort(),
    dependencies,
    requiredNodes: Array.from(new Set(requiredNodes)).sort(),
  };
}

export type WorkflowManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  source: "comfyui-api";
  workflow: ApiWorkflow;
  dependencies: WorkflowDependency[];
  inputs: ReturnType<typeof extractWorkflowInputs>;
  outputs: { nodeId: string }[];
  compatibleAdapters: WorkflowAdapterId[];
};

/** 标准化为可保存/分享的 manifest;compatibleAdapters 一期恒为三种(任何
 *  ComfyUI 兼容端点都能跑),细分兼容(显存/节点缺失)由运行时 inspect 报告。 */
export function normalizeComfyWorkflow(
  workflow: unknown,
  options: { name?: string } = {}
): WorkflowManifest {
  const checked = inspectComfyWorkflow(workflow);
  if (!checked.ok) throw new Error(checked.error || "工作流不合法");
  const api = workflow as ApiWorkflow;
  const name = (options.name || "").trim() || "未命名工作流";
  return {
    schemaVersion: 1,
    id: `local/${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    name,
    source: "comfyui-api",
    workflow: api,
    dependencies: checked.dependencies,
    inputs: extractWorkflowInputs(api),
    outputs: checked.outputNodes.map((nodeId) => ({ nodeId })),
    compatibleAdapters: WORKFLOW_ADAPTERS.map((a) => a.id),
  };
}
