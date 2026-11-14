# 视频架构统一 RFC v3 —— 输入驱动的视频编译架构（2026-11-14）

> **并行提案已归档，实施入口已统一（2026-11-14）**：本页保留并行v3全文供追溯。当前实施以[统一输入驱动的视频编译架构 RFC](../../architecture/2026-11-14-video-compiler-rfc.md)为准，特别是其§15的差异裁定。不要分别执行两份规格；两份文档均不代表代码已实现。

状态：已由统一RFC整合的并行v3历史提案，不再单独据此开工。本轮只交付文档；不改线上配置、不提交生成任务、不迁移历史数据。**本文取代 v1/v2**：v1（调和多闸门）方向不足；v2（编译即能力）方向正确但存在三个架构漏洞（§15 对照），v3 按最终决策升级为覆盖全部视频入口的统一架构。

代码基线：origin/main `4b499960`。所有 file:line 与入口清单均按该基线逐一核实（§7）。

---

## 0. 决策声明

> **一个输入事实源，一个编译入口，一个执行结果。**
> - 画布（及一切视频入口）负责表达意图和组织素材，不判断模型能力；
> - 模型适配器（VideoModelProfile）负责定义并编译真实协议——**编译器是唯一的模型执行判断点**；
> - 管理配置（ExecutionPolicy）只能表达管理员**显式设置的产品限制**，与适配器契约（AdapterContract）彻底分离，且**不从旧能力数据自动迁移**；
> - UI 从适配器契约派生展示，不自行判断；
> - 执行层冻结编译结果，不再重新解释模型能力；
> - 输出资产回到统一画布图谱，成为下一节点的普通素材。

这次消灭的是错误的架构边界，不是又一个报错点。

## 1. 根因：五套事实，无共享契约

| 层 | 当前职责 | 问题 |
|---|---|---|
| 上游供应商 | 定义真实模型能力 | 实际能力可能远比本站记录丰富 |
| 模型管理配置 `capabilities.video` | Smoke 测试结果被当成完整能力 | "没验证过"被固化为"不支持" |
| 前端模式选择 `supportsVideoIntent` | 依配置隐藏功能 | 配置错→功能消失 |
| 服务端契约 `normalizeVideoInput` | 再次依配置拒绝请求 | 与前端同一份数据的第二次否决 |
| 协议适配器 `apib-verified` 等 | 第三次协议级限制 | 新代码已就位仍走旧分支 |

四个权力关系错误（均已代码核实）：

1. **管理员描述可覆盖适配器能力**。`contract.ts:13-33` `resolveVideoCapability` 按 manual→vendor→adapter 取第一个有值字段：adapter 声明 `["text","single_image","frames_required"]`，管理员只填过 `["text"]`，结果就是 `["text"]`。一份不完整的**描述**否决了适配器真实的**执行能力**。
2. **前端把能力配置当执行许可**。`mode-selection.ts:45-51` `mediaFits` 以 `cap.limits?.images ?? 0` 判断——后台没填即零。链条：连图 → limits.images=0 → mediaFits=false → 不切模式 → 节点停留 mode=text → 提交被 `MODE_INPUT_MISMATCH` 拒绝。
3. **同一请求被解释多次**。`submission.ts:74/:80` 两次 `normalizeVideoInput`，进入 codec（`apib-documented.ts:13`、`geek-documented`、`geek-h3-documented`、`multimodal-v3-input`、`apib-storyboard-v4`）后**第三次**；`workflow-freeze.ts:61` 另有独立入口。结构、能力、协议三类校验混在同一函数里层层重复。
4. **旧协议分支仍在裁决新请求**。`apib-verified.ts:56-58` `expectedMode` 单值校验＋单参考限制（:71/:73）；而 v2/v3 codec 与逐型号契约（`video-family-capabilities.json`，32 条）已入库未启用。

审计实证（`output/video-node-preflight47-audit-20261113/REPORT.md`，v154）：21 个启用模型 18 个仅 text；8 个旧节点 mode=text 带媒体；21 个单图片组合在正确契约下前端＋wire 编译全部通过（**编译能力证据，不等于 21 个型号完成真实付费上游测试**——证据分层见 §4.3）。

## 2. 目标与非目标

**目标**：新增任意视频模型＝实现一个 Profile，画布/节点/前端/服务端/工作流零改动即可全站可用；能力数据错误永久丧失拦截能力；所有视频入口共享同一编译判断；证据状态可查、不混写。

**非目标**：统一各供应商的 wire 格式（Kling/Seedance/Veo/Hailuo 各自的请求结构照旧，只统一编译接口）；重写结果资产层（现有设计保留，§3.5）；修改计费/幂等/租约语义；本轮动线上任何配置。

## 3. 五层架构

```text
Layer 1 Canvas Graph（画布/入口图层）
  节点、连线、素材身份、输入顺序、素材角色、用户意图偏好
  │  不读模型能力，不判断"模型是否支持图片"
  ▼
Layer 2 Input Resolver（输入解析层）
  身份/归属校验、素材完成状态、真实格式/字节/时长/可解码性
  │  输出：ResolvedVideoDraft（可信输入＋真实媒体元数据）
  ▼
Layer 3 Video Compiler（视频编译层）★唯一执行判断点
  按供应商×型号×协议：分类意图 → 映射参数 → 构造真实上游请求体
  │  输出：intent 标签 + normalizedInput + wireRequest + billingFacts
  ▼
Layer 4 Execution Engine（执行层）
  报价（读编译事实）→ 幂等受理 → 积分预占 → 任务冻结 → 队列 → 供应商调用 → 重试
  │  执行已编译的请求，不再读最新配置重新解释
  ▼
Layer 5 Artifact Graph（结果资产层）
  结果入库 → 关联原节点 → 选取结果（displayResultId/lastResultId）
  → 成为下一节点的普通素材（重新解析、重新编译）
```

### 3.5 结果资产层保留项（不因重构破坏）

已核实的良好设计，原样保留：`displayResultId` 优先、`lastResultId` 回退的历史结果选择；前序视频未完成阻断下游提交（`node-submission.ts:44`）；跨用户项目/素材归属验证；完成结果可连接下一视频节点。原则：**视频任务产生媒体资产，资产以稳定身份进入画布图谱；视频任务不直接依赖下一个模型的能力**。

## 4. 核心抽象：VideoModelProfile

### 4.1 接口

```ts
export interface VideoModelProfile {
  profileId: string;             // "apib-video-v3/seedance-2.0" 形式
  version: number;               // 契约版本，随代码发布递增，冻结时记录
  evidence: EvidenceState;       // §4.3 证据梯
  describe(): VideoInputContract;   // 输入空间声明（展示投影的数据源）
  compile(input: ResolvedVideoDraft, policy: ExecutionPolicy): VideoCompileResult;
}
```

统一编译入口，**不统一协议实现**——各 Profile 内部结构完全自由，但必须遵守同一接口：

```ts
export type VideoCompileResult =
  | { ok: true;
      intent: VideoCreationIntent;            // 编译产出的意图标签
      normalizedInput: Record<string, unknown>;
      wireRequest: { method: "POST"; path: string; body: Record<string, unknown> };
      billingFacts: { durationSeconds: number; resolution: string; aspectRatio?: string } }
  | { ok: false;
      error: { code: string; field: string; reason: string; actionable: string } };
// 例：{ code:"INPUT_ROLE_NOT_MAPPABLE", field:"references",
//       reason:"当前协议不能将该素材角色映射为上游请求",
//       actionable:"请选择普通图片参考或更换模型" }
```

### 4.2 双调用：预览与提交共用同一函数

| 场景 | 行为 |
|---|---|
| 用户调整设置 | **Dry-run 编译**（`POST …/compile-preview`）：返回 intent/facts/结构化错误；不落任务、不计费、不占幂等键 |
| 用户提交任务 | **正式编译**：编译一次，结果连同 Profile 版本、请求体、计费事实一起冻结 |

前端不再复制任何判断；"前端说支持、服务端说不支持、协议又说另一回事"在结构上不可能出现。

### 4.3 证据状态梯（每 Profile 记录，不混写）

| 状态 | 含义 |
|---|---|
| `Documented` | 上游文档明确支持 |
| `Wire-mapped` | Naumi 已实现请求映射（json 契约＋codec 分支在库） |
| `Smoke-tested` | 已实际调用测试通过 |
| `Production-confirmed` | 真实生产调用成功（记录回执） |

规则：**没有付费测试 ≠ 不支持；没有文档记录 ≠ 协议不能编译**。真正无法编译才是适配器限制；上游真实拒绝记为供应商执行错误（进通道健康），两者都不回头改输入空间。47 审计的"21 组合编译通过"属 Wire-mapped，验收时不得写成 Production-confirmed。

## 5. AdapterContract 与 ExecutionPolicy 分离（对 v2 问题 A 的修正）

### 5.1 定义

```text
AdapterContract = Profile.describe() 的输入空间：适配器真实可编译的范围
                 （代码＋video-family-capabilities.json，随版本化、门禁覆盖）

ExecutionPolicy = 管理员显式设置的产品限制：默认为空（= 不限制）
                 只能对 AdapterContract 收紧：模式减集、数量上限取 min、关闭某模式

执行空间 = AdapterContract ∩ ExecutionPolicy
展示投影 = AdapterContract（chips 可用性、默认值；叠加 policy 后置灰并标注"管理员已限制"）
```

### 5.2 迁移铁律（v2 的漏洞，v3 堵死）

**旧 `capabilities.video` 一律不得自动迁移为 ExecutionPolicy。** 47 现存的 `modes:["text"], limits:{images:0}` 是 smoke 测试的描述残留，不是管理员决定；若自动解释为"收紧"，图生依旧被拦——只是换了名字犯同一个错。落地规则：

1. ExecutionPolicy 上线初始为**空**（对全部模型零限制，行为立即回到 AdapterContract）；
2. 需要限制某模型时，管理员**显式新建**限制项，写管理日志（who/when/why/before-after），界面明示"完整能力由已核验契约定义，此处仅可收紧"；
3. 旧 `capabilities.video` 字段保留只读展示一个迁移周期，标注"历史 smoke 数据，无执行效力"，之后随 P3 清场删除；
4. 报价、路由（profile 选择）、凭据、并发预算照旧由管理配置管——**政策只管"允许开多大"，契约管"物理能编什么"，互不越界**。

## 6. 意图与节点字段

### 6.1 字段

| 字段 | v3 语义 |
|---|---|
| `config.intentPreference?`（新字段） | 用户意图偏好：`undefined`=自动；有值=用户点过 chip。**永不执法**，仅恢复显示＋传入编译器 |
| 旧 `config.mode` | 只读兼容一个迁移周期：读取时映射为 intentPreference（`text`＋媒体→视同未给，§6.2 F3）；系统永不写入；P3 清场删除字段 |
| 任务快照 `intent`＋`modeSource`＋`profileId/profileVersion` | 编译产出，随冻结上下文持久化；不参与后续判断 |
| `app_video_tasks` 历史行 | 完全不动；冻结任务按原 provider_snapshot 回放（legacy codec 仅此用途） |

### 6.2 决策表（分类器＝编译器内部纯函数，规则不变）

媒体签名：图片/视频/音频计数＋**用户显式指定**的 first_frame/last_frame＋source_video。

| # | 输入签名 | 意图 | 说明 |
|---|---|---|---|
| A1 | 无媒体 | 文生 | |
| B1 | 1 图普通角色 | 单图 | 编译记 first_frame（wire 语义） |
| B2 | 2 图 first+last 均显式 | 首尾帧 | 唯一帧模式来源 |
| B3 | 2 图均普通 | 图片参考 | **绝不冒充首尾帧** |
| B4 | 半指定 / ≥3 图 | 图片参考 | 不升级 |
| C1 | source_video 且无图 | 视频编辑 | |
| C2 | 含视频/音频其他组合 | 全能参考 | |
| D1 | 仅音频 | 全能参考 | |
| E1 | 签名在执行空间无任何可编译模式 | 结构化错误点名缺口 | 契约缺口信号，非用户错误 |
| F1 | 显式偏好 X 且物理可编译 | X | 偏好被尊重 |
| F2 | 结构性偏好（帧/编辑类）物理不满足 | 结构化错误，明说缺什么 | 不静默降级/换模型/丢素材 |
| F3 | 偏好 text 且带媒体（旧字段遗留） | 视同未给偏好，自动分类 | 旧节点自然归位，无需迁移脚本 |

`extend/motion_control/lip_sync` 无显式偏好不自动推导。分类器零 LLM、零 I/O、确定性。

### 6.3 模型切换 UX（输入侧保留项）

不自动删素材、不丢提示词、不把两张图变首尾帧、不自动换模型；偏好不被新模型契约支持时清空回自动＋提示一句；不兼容处由 dry-run 编译明确指出哪个输入不能映射。

## 7. 入口统一（对 v2 问题 B 的修正）：七个入口一张表

编译器必须是**所有**视频生成入口的共同底座。现状判断点逐一核实（基线 4b499960）：

| # | 入口 | 现状能力判断点 | v3 动作 |
|---|---|---|---|
| E-1 | 画布节点 `POST /api/canvas/video-nodes/[id]/generate` → `submitCanvasVideo` → `createVideoGeneration` → `submission.ts:74/:80` 两次 normalize → codec 内第三次 | 主链（v2 已覆盖） | 收敛为 Resolver＋一次编译 |
| E-2 | 独立视频工作台 `POST /api/video/generate`；`video-studio-session.tsx:51` 前端 `validateVideoSettings` 预检（独立计费模式 api-cost-plus 在此层） | 第二套前端预检 | 预检换 dry-run；计费模式保留在执行层 |
| E-3 | 视频工作流 `workflow-freeze.ts:61` 独立 `normalizeVideoInput` | 第三套入口解释 | 冻结前改走编译器（BYOC 见 E-7） |
| E-4 | Agent 视频工具 `src/lib/agent/canvas-video-tools.ts`（`generate_video`，naumi-tools:53） | 复用画布链 | 随 E-1 自动收敛；工具描述改为引用编译预览结果 |
| E-5 | 分镜/Storyboard `storyboard-restructure.tsx:22`（catalogCapability/videoDurations/reconcile）＋ `apib-storyboard-v4` codec 内 normalize | 第四套前端判断＋分镜语义 | 分镜编排保留在 Layer 1；逐镜头提交走统一编译 |
| E-6 | 重试 `POST /api/video/tasks/[id]/retry` | 冻结回放 | 一律回放冻结请求体，**不重编译**（重编译可能改变语义与计费）；冻结体缺失时明确报错转人工，不静默按新版本重编 |
| E-7 | BYOC Comfy `POST /api/video/byoc`（workflow manifest 路径） | 工作流输入映射独立体系 | 同样实现为 `ComfyProfile`（describe=manifest 声明、compile=现有映射），纳入同一接口；不强行套通用契约 |

**验收含义**：任一入口×任一意图组合，编译结果必须一致（§12 M2），否则视为未完成统一。

## 8. 协议族收敛

| 协议族 | 现状 | v3 |
|---|---|---|
| `apib-documented`（apib-video-v2）、`geek-documented`、`geek-h3-documented`、`apib-multimodal-v3`（v3 族，`multimodal-v3-input` 共享输入逻辑） | codec 内各自再 normalize 一次 | 升级为 Profile 实现；内部 normalize 调用全部删除（编译入口统一做） |
| `apib-storyboard-v4` | 分镜专用＋内部 normalize | Profile 化（E-5） |
| `apib-verified`/`geek-verified`（legacy） | 新任务仍可被路由 | 不改代码；发布只切 profile 路由；发布预检拒绝新版本指向 legacy（P2）；仅存冻结回放 |
| openai-videos/gemini/minimax/kie/tokendance/tfrouter/compshare 等其余族 | 各 codec | 按同一模式逐族 Profile 化，可分批（P2+），未轮到的族维持现状但不得新增能力判断 |

## 9. 删除清单

| 现状模块/职责 | 决定 | 原因 |
|---|---|---|
| `supportsVideoIntent` 执行否决（mode-selection.ts:19） | 删执法权→展示投影数据源 | 独立能力矩阵不得裁决执行 |
| `mediaFits` 能力门控（mode-selection.ts:45） | 删 | 连线不得依赖能力声明 |
| `validateVideoSettings` 能力预检（client-settings.ts:93；video-studio-session.tsx:51） | 删执法权→dry-run | 前端不复制判断 |
| `reconcileVideoSettings` 自动写模式（client-settings.ts:62） | 重构 | 不再偷偷重置用户配置；时长/分辨率收敛按有效意图 |
| `resolveVideoCapability` manual 优先（contract.ts:13-33、model-definition.ts:16-20） | 删执行职责 | 描述不得覆盖适配器能力（§5 分离） |
| `fallbackCapability` 造能力（capabilities.ts:119-140） | 删 | 未知型号报"无对应契约"，不造数 |
| 多次 `normalizeVideoInput` | 收敛 | 结构解析一次（Resolver）＋正式编译一次 |
| `video-family-capability-upgrade` 整对象升级器 | 删职责 | 契约随代码版本化，无模板匹配问题 |
| 旧核验 codec 新任务路由 | 停用 | 仅历史冻结回放 |

## 10. 保留清单（物理校验，独立事实）

- 节点/任务归属当前用户与项目；素材真实存在、前序视频已完成；
- 素材 MIME 类型正确；图片/视频/音频可解码性——现状为元数据校验，真实解码探针按 P1 补齐（不信上传声明，信实测）；
- 实际字节数、时长、格式在**执行空间**（契约∩政策）物理限制内；
- 引用 id 去重、角色与素材类型一致、URL 合法；
- 参数类型与数值范围合法（结构层）；
- 上游协议真实约束（一请求最多几张图等）——保留在 Profile.compile 内；
- 报价、幂等、积分预占、防重放、租约、任务冻结；
- 冻结任务回放语义。

## 11. 实施顺序

1. **P0 统一编译契约**（核心）：`VideoModelProfile` 接口＋`compileVideoRequest` 聚合入口＋结构化错误＋Resolver/编译分离＋AdapterContract/ExecutionPolicy 分离（政策初始为空）＋V/M 门禁。
2. **P1 统一全部入口**：E-1～E-7 逐一接入编译服务；前端预检全部换 dry-run。
3. **P2 协议族收敛与 47 发布**：apib/geek/h3/storyboard Profile 化并删内部 normalize；47 只切 profile 路由（legacy→v2/v3）＋发布预检拒绝 legacy；**不含能力补齐**。
4. **P3 清场**：旧节点 text+media 兼容（F3 只读映射）、删重复预检/宽松 fallback/旧升级器/旧 `capabilities.video` 字段，保留冻结回放。
5. **P4 端到端验收矩阵**（§12 M5）。

## 12. 验收标准

| # | 验收项 | 证据 |
|---|---|---|
| V1 | 决策表 A1-F3 逐 case（合成输入×真实 json 契约），断言 intent/wireRequest 关键字段/结构化错误 | 新门禁 `scripts/verify-video-intent-compile.ts`（无 DB） |
| V2 | 物理校验不回归：超字节/超时长/重复 id/角色不符/未完成素材/MIME 不符仍被拒 | 同门禁 |
| V3 | 删除回归 pin：`UNKNOWN_VIDEO_CAPABILITY`/`MODE_INPUT_MISMATCH`/`UNSUPPORTED_*` 不再出现；`FRAME_*` 语义迁移为编译错误 | 同门禁文本断言 |
| V4 | 同输入不同顺序/来源 → 编译产出逐字段相等；确定性（两次编译摘要一致） | 同门禁 |
| V5 | dry-run ≡ 提交（intent/facts/错误全等；dry-run 零任务零计费零幂等占用） | 门禁＋fixture |
| V6 | 政策语义：收紧生效；**放大/新增无效**；政策为空时行为=纯契约；旧 capabilities.video 不产生任何执行效果（§5.2 断言） | 门禁 |
| V7 | 冻结回放：legacy codec 对既有任务样例的请求体逐字节不变；retry 不重编译 | 门禁快照断言 |
| M1 | 证据状态：每 Profile 有 evidence 值；Wire-mapped ≠ Production-confirmed 在验收记录中不混写 | 配置/文档检查 |
| M2 | 入口矩阵：E-1～E-7 × {文生/单图/双图参考/首尾帧/视频参考/音频参考} 编译结果一致；结构解析收敛于 Resolver 单处，能力/协议判断仅存在于 Profile 与编译服务内（门禁 grep 断言：`normalizeVideoInput` 及能力比对分支不出现在入口/前端模块） | 门禁＋grep |
| M3 | 旧节点：text+媒体经 F3 自然归位可直接生成；历史任务零改动 | fixture |
| M4 | 既有门禁不回归：canvas-video-submission/dock/continuity、tsc、build | 命令输出 |
| M5 | P4 端到端（47，P2 发布后）：六类输入×编译成功→真实付费供应商成功→结果资产正确（落原节点→选历史结果→接下一节点→再生成）分别记录；**编译成功与供应商成功分开记账** | 发布轮次验收记录（本 RFC 不宣称） |

## 13. 风险与开放问题

- 编译错误文案成为唯一用户可见错误来源，须按 §4.1 结构逐条重写（actionable 必填）；
- E-2 工作台的 api-cost-plus 计费模式与编译事实的对接需专门用例；
- E-5 分镜的逐镜头参数（时长/分镜结构）在 Layer 1 的编排语义保留，与编译层的边界在实施 P1 时定稿；
- E-7 ComfyProfile 的 manifest 声明粒度（哪些输入空间信息可从 manifest 推导）开放；
- 多协议族 Profile 化工作量大但机械，按族分批，未轮到族冻结现状；
- ExecutionPolicy 的管理 UI（收紧编辑器＋管理日志）为新增后台工作量。

## 14. 与"再修一层"的本质区别

新增一个模型支持 9 图＋3 视频＋2 音频＋首尾帧＋多镜头＋特殊时长组合时：只实现它的 Profile。画布不改、节点不改、前端不加判断、服务端不加校验、工作流不重造。Profile 能编译，全站即可用——这是本次重构要达到的可扩展状态。

## 15. v2 → v3 变更对照

| 主题 | v2 | v3 |
|---|---|---|
| 覆盖范围 | 画布链路 | E-1～E-7 全部入口（工作台/工作流/Agent/分镜/BYOC/重试） |
| 管理配置 | "只能收紧"（旧数据自动继承收紧语义——**漏洞**） | AdapterContract/ExecutionPolicy 分离；**政策初始为空，旧数据不迁移、零执行效力** |
| 证据 | 未分层 | 四级证据梯，验收不混写 |
| 核心抽象 | compile 函数＋json 契约 | VideoModelProfile（describe/compile/version/evidence）＋结构化错误（含 actionable） |
| 节点字段 | config.mode 作偏好 | `config.intentPreference` 新字段；mode 只读映射一个周期后删除 |
| 保留不变 | 决策表、两张普通图≠首尾帧、显式报错不降级、dry-run=提交、冻结回放、物理校验、无 LLM | 同左 |
