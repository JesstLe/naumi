# 公开模型身份编辑与兼容迁移

## 范围与基线

- 用户批准将前台公开 ID 与显示名称按需对齐，供应商实际请求型号继续独立维护。
- 基线 `6ff417ebcdbeef2119c17b891d24c1532e240c2a`，任务分支 `codex/public-model-identity-20261110`。
- 47 站维持配置、合并后暂缓发布。本任务不修改 47/103 在线配置，不进行收费供应商调用。

## 模块与职责

- `management-identity`：公开模型身份迁移用例，更新家族及配置内引用。
- `public-identity`：无 I/O 的版本内旧 ID 解析、既有尺寸契约标识；目录、前端选择、准备/执行入口复用。
- `billing-identity`：根据选定模型快照投影计费规则引用；金额、规则顺序与持久化计费快照保持不变。
- 管理 UI 使用现有身份弹窗和发布会话，提供显示名称、公开 ID、使用显示名称作为 ID；原 label-only `rename` 协议保留。

## 公共接口、依赖与事务

- POST `/api/admin/model-management`：`action:identity, id, expectedVersion, rowId, publicId, label`，沿用既有权限、同站检查、独立草稿、锁、CAS、Router 发布和操作回执。
- `previousIds?: string[]` 属于版本化公开模型，草稿新增 nullable `previous_ids` JSONB 列；旧快照未添加默认字段，摘要不变。新旧 ID 全局不可冲突；历史别名顺序保留最初尺寸语义。
- 当前配置引用整体随一次模型版本激活；独立计费模块不新增第二次发布事务。报价使用模型版本与计费版本的组合，冻结后恢复不读取 current 进行身份替换。
- 冻结计划仍重新编译并检查相等，未取消 `EXECUTION_MISMATCH`。尺寸兼容来自原模型快照，实际 wire model 仍由该版本上游配置决定。

## 实现与迁移状态

- 实现与集中验收已完成；主线整合信息见下方。
- 无硬编码 `gpt-image-2 → image2.5` 全局替换；上线后管理员可将该行两个字段都填 `image2.5`，使用相同完整迁移流程。
- 旧画布选择与旧请求 ID 解析为当前入口，原模型启停、可见性及工具范围继续检查。历史任务/账本不回填，旧目录仅保留在历史版本。
- 不重命名实际供应商模型，不复制旧供应商能力证据到新实际模型。

## 验证与证据层级

- 新增 `scripts/verify-public-model-identity.ts`：真实本机隔离 PostgreSQL，覆盖身份发布/草稿往返、引用迁移、旧新 ID 定价、免费/清除售价、实际钱包成功/失败/重试、权限、CAS 并发、未知响应核对、配置回退与历史任务恢复；供应商与 Router 为隔离替身。
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`：通过。
- 新增身份集成：通过；另检查 24 组质量/分辨率原价一致，APIMart 成本预设别名经校验/安装后不丢失，本地 HTTP 实际收到 `wire-image-one` 而非新公开 ID。
- 既有 `verify-model-management`、`verify-model-management-concurrency`、`verify-model-management-credit-pricing`、`verify-model-management-quality-parameters`、`verify-image-model-family-routing`：通过；冻结参数正例及 `EXECUTION_MISMATCH` 负例保持。
- 既有 `verify-model-publication`、`verify-imagegen-contract`、`verify-apimart-default-preset`、`verify-apimart-preset-entries`、`verify-model-credit-source`：通过；均为本机隔离环境。
- `node scripts/verify-public-model-identity-ui.mjs`：真实 React 组件与 CSS、HTTP fixture；独立字段、一键对齐、非法 ID、冲突保留输入、发布和刷新后新入口、实际型号保持、390px 无横向溢出通过。桌面及手机截图已实际打开检查。
- `node scripts/verify-model-management-refactor.mjs --out <证据目录>`：33 检查、18 快照通过，原操作编号/未知结果核对等既有交互保持；测试结束已关闭自有浏览器和回环服务。
- 发现并修复：旧改名弹窗提交即关闭导致冲突丢失输入；新身份操作保留弹窗直至成功或结果未知，明确拒绝保留输入。成本预设安装原先重建模型对象会丢失新别名字段，现明确保留并加回归。
- 实际外部供应商调用为 0；本地模拟 HTTP 返回有效 PNG，仅验证实际请求/响应路径，不代表生产出图。
- 证据目录：`E:/workspace/naumi-task-evidence/public-model-identity-20261110`。本地集成通过不代表线上部署或真实供应商出图验收。

## 回退与未完成项

- 代码未部署前不发布带 `previousIds` 的线上配置；旧代码的严格 schema 不认识新增字段。
- 配置回退仍通过既有版本发布/restore，不直接修改版本表、任务或账本。新旧版本的在途任务都必须由支持两种快照的代码继续恢复。
- 身份迁移后若另行修改售价，回退旧模型配置前须核对当前计费规则是否已使用新 ID；不能把旧模型配置单独恢复当成完整回退，也不能回灌历史账本。回退材料需同时记录模型、计费和程序版本。
- `previousIds` 暂不自动清理；退出条件为确认旧画布/调用方不再提交该 ID，并完成相应版本化迁移，不以时间到期猜测。
- 待完成：合入 main、清理本任务工作树。47 发布及在线 `image2.5` 配置激活继续暂停。

## 主线同步

- 开工基线 `6ff417ebcdbeef2119c17b891d24c1532e240c2a`，合并前刷新至 `b678fa7042f4f528608ad96a62f476f398ef8a9d`；新增为同事画布 Dock 修复，无同文件冲突。
- 本轮为一个模型身份业务切片；整合主线后功能同步计数归零。无服务器发布，成功发布/空间维护计数不增加。
- 本任务只清理自有分支、工作树和测试进程；共享 checkout 分支、他人未提交文件及依赖目录保持。
