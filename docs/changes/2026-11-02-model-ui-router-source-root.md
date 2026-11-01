# 经典模型浏览器验收：Router 来源路径归属

## 实际入口与反例

基线为 `61ef32cc18a6cd14948743f2c7c00bb4846b781e`。新头 Image 验收在第18步 `Business admin publication and feature model browser acceptance` 失败，原始注释为 `Fixture Router build failed`。工作流传入相对 `NAUMI_VERIFY_ROUTER_SOURCE=output/model-config-20261004/router-source`，而共享 runner 将 fixture cwd 切到隔离源码副本；pinned Router 的输出目录不属于该源码副本。

受控反例调用原共享 runner 与真实 `spawnSync(go build)`：Router 位于调用方输出目录，子进程仍收到相对路径，Go 启动尝试因 cwd 不存在返回 `status=null/error=ENOENT`，fixture setup 失败。该实验没有启动 Next、连接 PG 或请求供应商；本地回环数据库 URL 仅满足原 fixture 入口校验。

## 职责与实现

- 调用方拥有外部固定 Router checkout 的路径，runner 拥有 source copy、IPC、随机端口和子进程清理。
- runner 只在组装 childEnv 时按原 caller root 解析 `NAUMI_VERIFY_ROUTER_SOURCE`。相对路径正确指向原输出目录；绝对路径保持其目标；缺省语义与调用方 env 对象保持。
- fixture 仍在隔离源码副本执行，不把 Go 源码复制进每个源码副本，不修改 Router、供应商、数据库、生产存储或任务协议。
- 现有 `verify-model-ui-runner.mjs` 已注册到 core，新增两 profile × 相对/绝对路径四种实际子进程场景。原成功、checker失败、setup失败、超时、cleanup失败、后续编辑、外来marker和端口检查保留。

## 验证与交付

基线、修改版、独立副本回滚、真实离线 Go 构建、正式生命周期验证、语法/lint检查及四件重开产物，见 `output/model-ui-router-source-root-20261102/VERIFICATION.txt` 和 `DELIVERY.json`。这些受控验证不替代新提交的真实 Next/PG/Go/浏览器 CI。

本任务独立工作树，不覆盖 `E:/Workspace/naumi-refactor-20261024` 中正在进行的付费断线浏览器验收，也不混入另一份草稿上下文修复。历史3fa作业的1小时超时及后续路由生命周期修复另行保存；取消不是通过，后续被跳过的步骤不计完成。未合main、未部署，47HOLD。

## 已完成的集中验证

- 相同受控目录归属反例：原 runner 的真实 Go 启动尝试因 cwd 失效返回 `status=null/error=ENOENT`，exit1；修改版实际离线最小 Go 模块编译 exit0，fixture/checker/IPC清理通过。
- 已注册生命周期回归：128 检查通过，原104项保留，新增两profile × 相对/绝对路径四场景；caller env、隔离copy cwd和外部marker均核对。
- 原统一runner合同：20场景、367检查通过；两个MJS的Node语法检查、定向lint、diff-check均exit0。
- 原2,149个产品文件raw SHA全部保持；只改变两个验收MJS并新增本文档。未重跑全项目TypeScript、完整Next构建或整版core，不借用旧通过冒充新头验收。
- Go实验编译的是离线最小模块，不冒充完整pinned Router/Next/PG/浏览器。新头真实CI仍须独立完成。

## PR #10 目标分支冲突整合（2026-11-02）

### 基线与职责归属

- 本轮原始 PR 头为 `525c06199b41af58e818ff447eb21a3ac171caed`，固定目标为 `c2ab04139e262214e457dfbc86542ff33f9d0555`（`codex/core-refactor-20261024`）。原始头已包含上文 Router 路径修复；本轮基线缺陷是两个 MJS 的内容冲突，不再把原始 Go ENOENT 当成本轮现象。
- `git merge-tree --write-tree --messages <原始头> <固定目标>` 返回 exit1，实际普通 `git merge --no-commit <固定目标>` 同样在共享 runner 与正式回归脚本产生两处内容冲突。5,388 个原文件的 raw SHA 和完整原档另存于 `output/pr10-conflict-base-sync-20261102/`，未覆盖原任务证据。
- 目标分支已独立包含相同 caller-root 解析，并新增 business-ui Canvas 准备。共享 runner 直接保留固定目标的完整字节，不复制第二套实现；调用方路径归属、原始 env 不写回、隔离 source copy、runId/IPC 所有权和清理合同继续保留。

### 合并决策与迁移状态

- 正式回归合并保留目标分支的 `routerSource`/`userCookie` metadata、相对/绝对路径 metadata 检查及 `/canvas` 准备与原 startup budget 检查。
- 同时保留本 PR 两 profile × 相对/绝对路径四种实际文件读取场景，逐项检查外部 marker、子进程 cwd、绝对路径和调用方 env；不是只检查传入字符串。
- 成功、checker7、setup 失败、超时、cleanup 失败、后续开发者编辑、外来 fixture 与外来端口全部保留。其余目标提交按正常 merge 整合；本轮相对固定目标只增强正式回归与本文档，没有另改产品源码。
- 本 PR 不导入另一条 restore-context 修复，不把 Router 验收通过视为历史 restore 草稿合同已完成整合。

### 验证、证据与后续

本轮集中结果和完整命令流保存于 `output/pr10-conflict-base-sync-20261102/VERIFICATION.txt`。基线原始 owner128 与实际离线最小 Go 编译通过；合并版正式生命周期 **146 检查**、共享 runner **20 场景／370 检查**、两个 MJS 的 Node 语法、定向 eslint 及 worktree/index diff-check 全部 exit0。四种实际文件读取场景与 Canvas 原 startup budget 检查均保留。受控 child/IPC/HTTP 和离线最小 Go 不替代新头完整 Next/PG/浏览器 CI；本轮未执行全量 TypeScript、Next 构建或真实 PG 回归。

四产物为 `MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`，另存完整基线档、原始命令流和 SHA 清单。独立副本恢复、patch 字节精确重放、活动工作树拒绝和后续编辑零写入保护的实际结果以同目录最终报告为准，不提前把这些步骤记成通过。

回滚只作用于显式独立源码副本，恢复本轮原始头的全部文件字节与原本已修好的 Router 行为；文件回滚不改写 Git 历史，原始两提交的图上冲突仍可复现。活动工作树保留合并版。普通提交/推送后等待既有 PR 检查通知，不把候选推送写成合main或生产发布；47 暂缓发布状态保持。
