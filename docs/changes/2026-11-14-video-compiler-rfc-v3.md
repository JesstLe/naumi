# 视频架构统一 RFC v3：输入驱动的视频编译架构（2026-11-14）

模块与职责：视频生成全链路（画布/工作台/工作流/Agent/分镜/BYOC/重试七入口，输入解析、编译、执行、结果资产）。本轮为纯文档交付，未修改业务代码、线上配置或生成任务。

公共接口、依赖方向、数据/状态/事务归属：不涉及（无代码变更）。

本次实现与迁移状态：

- `docs/superpowers/plans/2026-11-14-video-intent-execution.md` 由 v2 升级为 **v3 统一架构 RFC**（取代 v1/v2），按用户最终决策修正 v2 的三个架构漏洞：
  - **问题 A**：AdapterContract（Profile.describe() 输入空间）与 ExecutionPolicy（管理员显式产品限制）彻底分离；**ExecutionPolicy 上线初始为空，旧 `capabilities.video`（smoke 残留 modes=["text"]/limits=0）一律不自动迁移、零执行效力**，需要限制须显式新建并记管理日志——堵死 v2"管理端只能收紧"会继承旧 smoke 数据的漏洞。
  - **问题 B**：入口清单扩为七个（基线 4b499960 逐一核实）：画布 generate、独立工作台 `/api/video/generate`＋`video-studio-session.tsx:51` 预检、`workflow-freeze.ts:61`、Agent `canvas-video-tools.ts`（naumi-tools:53）、分镜 `storyboard-restructure.tsx:22`＋`apib-storyboard-v4`、`tasks/[id]/retry` 冻结回放（**不重编译**，缺失报错转人工）、BYOC Comfy（同接口的 ComfyProfile）。编译器为全部入口共同底座，M2 门禁含 grep 断言。
  - **问题 C**：四级证据梯 Documented / Wire-mapped / Smoke-tested / Production-confirmed 逐 Profile 记录；47 审计的"21 组合编译通过"明确为 Wire-mapped，验收不得写成 Production-confirmed；编译成功与供应商成功分开记账（M5）。
- 核心抽象升级为 `VideoModelProfile`（profileId/version/evidence/describe/compile）＋结构化编译错误（code/field/reason/**actionable** 必填）；编译结果 `{intent, normalizedInput, wireRequest, billingFacts}`；dry-run 与提交共用同一函数；节点新字段 `config.intentPreference`（永不执法），旧 `mode` 只读映射一个周期后删除。
- 五层架构（Canvas Graph / Input Resolver / Video Compiler / Execution Engine / Artifact Graph）；结果资产层已核实设计（displayResultId 选择、前序完成阻断、归属验证、结果接续）原样保留；新增模型＝只实现一个 Profile，其余层零改动。
- 实施顺序 P0（统一编译契约＋政策分离）→P1（七入口统一＋解码探针）→P2（协议族 Profile 化＋47 仅切 profile 路由）→P3（清场）→P4（端到端矩阵验收）。
- 五轮审校修正：E-6 重试改为"一律回放冻结体、缺失报错不重编"（避免重编译改变语义/计费）；§10 解码检查如实标注"现状元数据校验、探针 P1 补齐"；M2 grep 断言精确到"能力判断不出现在入口/前端模块"；另核实 geek-documented/geek-h3-documented 文件与调用点、`/api/video/generate` 及 retry 路由为用户清单之外的补充入口。

验证命令、结果及证据层级：纯规则/文档修改；内容、引用与差异核验完成——入口清单经 grep 逐一落地（normalizeVideoInput 全部调用方、video-studio/storyboard/workflow-freeze/agent 工具行号），file:line 按基线 4b499960 核对。未运行业务构建，不构成功能迭代或发布计数。

未完成项与下一步：按 v3 §11 P0 开工（VideoModelProfile 接口＋compileVideoRequest＋政策分离＋V/M 门禁）；P2 47 发布与 P4 端到端验收另立任务；M5 需真实付费供应商证据，本 RFC 不预支。
