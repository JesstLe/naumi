# 无限画布工作流与插件集成方案

更新日期：2026-09-28  
状态：完成外部产品调研、完成第一阶段互操作契约；工作流执行器与市场 UI 待后续迭代。

## 1. 结论

Naumi 不应把 AutoDL、ComfyUI 的完整编辑器直接塞进现有画布，也不应让浏览器直接安装任意插件。正确方向是保留现有轻量无限画布，在其上增加三层能力：

1. **工作流模板层**：一键创建可编辑的 Naumi 原生工作流，或导入 ComfyUI API 格式 JSON。
2. **运行适配层**：同一份标准化工作流可路由到自托管 ComfyUI、Comfy Cloud、AutoDL 上已启动的 ComfyUI 实例。
3. **受控插件层**：插件先经过清单解析、版本锁定、依赖与风险扫描，再由隔离 Runner 安装；前端只显示能力和缺失依赖，不执行安装脚本。

用户最终看到的入口应该是：`工作流市场 → 查看依赖 → 一键配置 → 补充输入 → 运行 → 结果回到当前画布`。

## 2. 实际调研

### AutoDL 应用市场

2026-09-28 实际查看 `https://www.autodl.art/app/market/`：

- 市场当时展示 232 个应用，并提供 ComfyUI、电商、视频、训练等标签。
- 应用不是单个 JSON 文件，而是**可复现环境包**：镜像版本、GPU 规格、磁盘、模型库、插件、启动命令和预制工作流一起交付。
- “ComfyUI 云绘通用版”页面展示应用版本、启动命令、部署应用、7TB 模型库以及 80/90+ 套预制工作流；更新记录同时维护 ComfyUI、插件、CUDA/PyTorch 与工作流。

可借鉴的核心不是租 GPU 的页面，而是：**版本化应用包 + 明确依赖 + 一键部署 + 可更新 + 使用量/热度证据**。

### ComfyUI

官方文档确认：

- 工作流是节点图 JSON，但浏览器 Save Format 与 API Format 不同；API 调用需要以数字节点 ID、`class_type`、`inputs` 为核心的 API Format。
- 工作流要运行还依赖素材、Custom Nodes、Python 包、模型；只导入 JSON 并不等于可运行。
- 自定义节点通常需要代码仓库和 `requirements.txt`，依赖冲突可能污染整个 Python/CUDA 环境。
- 执行主入口是兼容的 `POST /api/prompt`；返回 `prompt_id` 与 `node_errors`。Comfy Cloud 使用 `X-API-Key`，同时支持上传资产、状态、结果等配套 API。
- 官方还提供 global subgraph blueprint 概念，可把复用子图作为节点包提供。

## 3. Naumi 现状

当前项目已经有：

- 图片节点、文字节点、连线、多输入、血缘、成组、撤销、保存与恢复。
- 四个“通用工作流”卡片，但目前只是创建一个预填提示词的图片/文字节点，不是可分享、可导入、可校验、可版本化的工作流。
- 文生图、详情图组、三视图、文案生成等业务执行能力。

因此缺口不是再造节点编辑器，而是：

- 工作流 manifest 与版本；
- 输入/输出插槽；
- 依赖解析与兼容检查；
- Runner/Adapter；
- 安装、运行、升级、回滚记录；
- 市场与分享入口。

## 4. 推荐架构

### 4.1 统一 Manifest

```json
{
  "schemaVersion": 1,
  "id": "seller/product-hero@1.2.0",
  "name": "商品主图工作流",
  "source": "comfyui-api",
  "workflow": { "3": { "class_type": "KSampler", "inputs": {} } },
  "dependencies": [
    { "kind": "custom-node", "id": "ComfyUI_IPAdapter_plus", "version": "2.0.0" },
    { "kind": "model", "id": "flux1-dev.safetensors", "sha256": "..." }
  ],
  "inputs": [{ "id": "product", "type": "image", "required": true }],
  "outputs": [{ "id": "hero", "type": "image" }],
  "adapters": ["comfyui-local", "comfy-cloud", "autodl-app"]
}
```

关键原则：工作流定义、运行环境、用户密钥分离；模型必须能记录校验值或稳定资源 ID；节点插件必须锁定来源和版本。

### 4.2 Runner Adapter

统一接口：

```ts
interface WorkflowRunnerAdapter {
  inspect(manifest): Promise<CompatibilityReport>;
  prepare(manifest): Promise<PrepareResult>;
  run(manifest, inputs, operationKey): Promise<RunHandle>;
  status(runId): Promise<RunStatus>;
  cancel(runId): Promise<void>;
  outputs(runId): Promise<WorkflowOutput[]>;
}
```

第一批适配器：

- `naumi-native`：现有文案、详情图组、三视图等管线。
- `comfyui-local`：用户或团队自托管实例，`/prompt`、上传、历史和结果读取。
- `comfy-cloud`：官方云 API。
- `autodl-app`：不把 AutoDL 当成工作流格式；把它视为一个可提供 ComfyUI API URL 的运行环境。

### 4.3 插件安装

插件包清单至少包含：仓库 URL、commit/tag、许可证、节点类列表、Python 依赖、系统依赖、所需模型、支持的 ComfyUI 版本、GPU/显存需求、健康检查和卸载/回滚方法。

执行规则：

1. 在临时容器中 clone 固定 commit。
2. 静态扫描安装脚本、入口与依赖。
3. 生成 SBOM 和锁文件。
4. 在独立 Python 环境安装并启动健康检查。
5. 通过 `/object_info` 等能力清单核对工作流所需 `class_type`。
6. 成功后生成不可变 Runner 镜像；失败直接销毁。
7. 密钥只在 Runner 运行时注入，不写入工作流和市场包。

不要在 Naumi Web/Next.js 进程里 `git clone + pip install`，也不要让一个用户的插件进入其他用户正在使用的共享 Python 环境。

## 5. 一键配置流程

1. 用户从市场选择工作流，或上传 ComfyUI **API Format** JSON。
2. 系统解析节点图并显示：节点数、输入、输出、模型、素材、插件、Python 依赖。
3. 选择运行位置：Naumi 托管 / 团队 ComfyUI / Comfy Cloud / AutoDL 实例。
4. `inspect` 返回绿/黄/红兼容报告：已具备、可自动准备、需用户提供。
5. 自动准备可控依赖；模型只从白名单/内容寻址缓存获取。
6. 在画布创建“工作流组”：输入节点、参数节点、运行节点、输出占位节点。
7. 运行状态以 operationKey、runId、进度和逐节点错误持久化。
8. 生成结果作为当前项目的子节点回流，保留工作流版本、参数、输入和运行器证据。

## 6. 市场 UI

采用浅色、克制的线性工作台，可参考 GitHub Marketplace / Linear 的信息密度，而不是复制 AutoDL 的 GPU 配置侧栏：

- 顶部：搜索、业务分类、运行环境筛选。
- 卡片：矢量 Logo、名称、作者、版本、适配器、验证状态、安装数/成功率、更新时间。
- 详情：可视流程缩略图、输入输出、依赖表、资源估算、版本记录、权限说明。
- 主按钮：`一键配置到画布`；次按钮：`先检查兼容性`。
- 不展示无用宣传句，不使用大量重复大圆角、紫色渐变或玻璃特效。

## 7. 开发顺序

### P0：首个可交付闭环

- 已完成：导入 ComfyUI API JSON、编辑器格式拒绝与正确导出指引。
- 已完成：输入参数提取、模型/节点依赖扫描、标准 manifest。
- 已完成：账号隔离的 ComfyUI 端点和工作流持久化。
- 已完成：端点连通测试、`object_info` 缺件检查、上传、提交、轮询和图片结果回流画布。
- 已完成：选中图片节点后的浅色工作流面板，支持端点、导入、参数和运行。
- 待完成：异步持久化任务、取消、断线恢复、视频节点和内置模板 manifest 化。

### P1：市场与共享

- 工作流发布、版本、复制、收藏、评分/成功率。
- 私有团队市场与公开市场分离。
- 参数映射 UI、密钥引用、模型别名与兼容矩阵。

### P2：托管插件与 AutoDL

- 隔离 Runner 构建队列、插件白名单、SBOM、镜像缓存、回滚。
- AutoDL 只做实例供给/部署引导与 API endpoint 绑定；不能依赖页面自动化作为生产协议。
- 子图/节点包市场和跨工作流复用。

## 8. 本轮代码落点

- `src/lib/canvas-workflows.ts`：ComfyUI API graph 校验、模型依赖扫描、标准 manifest、三种运行适配器声明。
- `src/lib/comfyui/workflow.ts`：API/UI 格式识别、输入提取、参数覆盖和缺失节点检查。
- `src/lib/comfyui/client.ts`：端点保护、`object_info`、上传、排队、轮询和产物读取。
- `src/app/api/comfyui/endpoints`、`workflows`、`run`：端点、工作流库和 BYOC 执行闭环。
- `src/components/canvas/canvas-comfy-dialog.tsx`：浅色工作流配置面板。
- `src/components/canvas/canvas-client.tsx`：从选中节点打开工作流并把产物挂回原图右侧。
- `src/lib/db.ts`：账号隔离的端点和工作流持久化。
- `scripts/canvas-workflow-contract-smoke.ts`：格式、输入、覆盖和缺件报告冒烟测试。

这一步先固定互操作边界，避免未来把市场 UI、插件安装与画布内部状态硬编码到一个超大组件。
