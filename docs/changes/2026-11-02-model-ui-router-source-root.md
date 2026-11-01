# 经典模型浏览器验收：Router 来源路径归属

## 验证快照索引（2026-11-02 审阅更正）

本文记录历史执行快照，不是任意后续提交的通过声明。初次修复结果仅属于 `525c06199b41af58e818ff447eb21a3ac171caed`；本次实际重跑仅绑定清洁提交 **`ba272da7957d97ccd3838d66c352c327a20a2988`**。后续纯文档修订只保持代码字节，不表示在新 SHA 上重跑整版。

| 记录 | 执行输入与结果 | 证据 |
| --- | --- | --- |
| 初次修复（历史） | 基线 `61ef32c` → 修改版 `525c061`；owner128，共享 runner20场景／367检查 | `output/model-ui-router-source-root-20261102/` |
| 冲突整合（历史） | 暂存合并源码上的 owner146、共享 runner20场景／370检查；代码哈希随后桥接至 `ba272da7`，不是本次新执行 | `output/pr10-conflict-base-sync-20261102/MODIFIED_COMMANDS.json`、`TESTED_CODE_HASHES.json` |
| 本次 reviewed-head 复验 | 清洁 `ba272da7` 的正式 owner 实际输出 **146 项检查**，含两 profile × 相对／绝对路径四种文件读取场景 | `output/pr10-review-validation-snapshot-20261102/OWNER_BA_COMMAND.json`、`owner-ba/RESULT.json` |

四个新增 Router 文件读取场景每个有6项断言，24 项已包含在实际146项内，不再次相加为170。脚本执行中故意注入的 checker／setup／timeout／cleanup FAIL 是被验证的失败分支，不改标成功。

两个文件的职责和比较范围不同：

- 共享 **实现文件** `scripts/verification/model-management-ui-runner.mjs`，raw SHA256：`be4f9867ec3f4190e998a6e1cec872e54e354e1273a25e3264197df1a46c16dd`。其字节与固定目标 `3775c5e8ba30fe09b4908d1a2a699a131bb7b6cd` 一致。
- 正式 **回归入口** `scripts/verify-model-ui-runner.mjs`，raw SHA256：`7a40d98bd22be655d6bd975777b61b766584fafdb07e40724bec5ce4660e6bee`。回归入口与目标回归脚本不同，新增实际文件读取场景；“与目标一致”不指该入口。

本次复验不重跑历史共享 runner20／370、离线 Go、TypeScript、完整 Next／PG 或浏览器整版。它们各自只适用原证据中的执行输入。旧头 `ba272da7` 的远端 Core／Verify 通过也不自动扩展到后续文档提交；新头 CI 独立记录。本次修正文档及其独立副本回滚的四项交付产物见 `output/pr10-review-validation-snapshot-20261102/VERIFICATION.txt`。

## 初次修复：实际入口与反例（历史快照）

初次修复前的执行基线为 `61ef32cc18a6cd14948743f2c7c00bb4846b781e`。当时 Image 验收在第18步 `Business admin publication and feature model browser acceptance` 失败，原始注释为 `Fixture Router build failed`。工作流传入相对 `NAUMI_VERIFY_ROUTER_SOURCE=output/model-config-20261004/router-source`，而共享 runner 将 fixture cwd 切到隔离源码副本；pinned Router 的输出目录不属于该源码副本。

受控反例调用原共享 runner 与真实 `spawnSync(go build)`：Router 位于调用方输出目录，子进程仍收到相对路径，Go 启动尝试因 cwd 不存在返回 `status=null/error=ENOENT`，fixture setup 失败。该实验没有启动 Next、连接 PG 或请求供应商；本地回环数据库 URL 仅满足原 fixture 入口校验。

## 职责与实现

- 调用方拥有外部固定 Router checkout 的路径，runner 拥有 source copy、IPC、随机端口和子进程清理。
- runner 只在组装 childEnv 时按原 caller root 解析 `NAUMI_VERIFY_ROUTER_SOURCE`。相对路径正确指向原输出目录；绝对路径保持其目标；缺省语义与调用方 env 对象保持。
- fixture 仍在隔离源码副本执行，不把 Go 源码复制进每个源码副本，不修改 Router、供应商、数据库、生产存储或任务协议。
- 现有 `verify-model-ui-runner.mjs` 已注册到 core，新增两 profile × 相对/绝对路径四种实际子进程场景。原成功、checker失败、setup失败、超时、cleanup失败、后续编辑、外来marker和端口检查保留。

## 初次修复的验证与交付（仅 `525c061`）

基线、修改版、独立副本回滚、真实离线 Go 构建、正式生命周期验证、语法/lint检查及四件重开产物，见 `output/model-ui-router-source-root-20261102/VERIFICATION.txt` 和 `DELIVERY.json`。这些受控验证不替代新提交的真实 Next/PG/Go/浏览器 CI。

本任务独立工作树，不覆盖 `E:/Workspace/naumi-refactor-20261024` 中正在进行的付费断线浏览器验收，也不混入另一份草稿上下文修复。历史3fa作业的1小时超时及后续路由生命周期修复另行保存；取消不是通过，后续被跳过的步骤不计完成。未合main、未部署，47HOLD。

## 初次修复的集中验证（仅 `525c061`，非当前累计计数）

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

本节只描述当时冲突整合的历史执行，完整命令流保存于 `output/pr10-conflict-base-sync-20261102/VERIFICATION.txt`。原始 `525c061` 的 owner128 与离线最小 Go 编译通过；暂存合并源码上的正式生命周期146、共享 runner20场景／370检查、两个 MJS 的 Node 语法、定向 eslint 及 worktree/index diff-check 全部 exit0。执行时的 Git 头和脏／暂存状态按原命令记录保留；四个测试输入哈希随后桥接至 `ba272da7`，不冒称这些历史命令在最终提交上重跑。本次清洁 `ba272da7` 的 owner146复验见顶部索引。四种文件读取与 Canvas 原 startup budget 检查保留，但不以 child／IPC／HTTP 和离线最小 Go 代替完整 Next／PG／浏览器验收。

该历史目录的四项交付产物为 `MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`，另存完整基线档、原始命令流和 SHA 清单。独立副本恢复、patch 字节精确重放、活动工作树拒绝和后续编辑零写入保护只适用原目录 manifest 绑定的源码，不延伸为本次文档新头的执行结果。

回滚只作用于显式独立源码副本，恢复本轮原始头的全部文件字节与原本已修好的 Router 行为；文件回滚不改写 Git 历史，原始两提交的图上冲突仍可复现。活动工作树保留合并版。普通提交/推送后等待既有 PR 检查通知，不把候选推送写成合main或生产发布；47 暂缓发布状态保持。

### 推送前刷新目标

当时推送前再次 fetch 发现目标由 `c2ab041` 前进至固定的 `3775c5e8ba30fe09b4908d1a2a699a131bb7b6cd`，新增管理员入口时序修复及其记录。先保留已验证的正常冲突合并提交，再普通 merge 该目标，未重写历史、未覆盖共享 checkout；第二轮合并没有未解决路径。“四个已测输入 raw SHA 不变”仅比较目标刷新前后两个本地阶段，见 `TESTED_CODE_HASHES.json`，不是声明四个文件都与目标文件相同。仅共享实现文件与该固定目标一致；正式回归入口对目标有新增断言，具体哈希见顶部索引。管理员 hook 与回归原样保留；相对该固定目标只增加 Router 文件读取回归与本文档。
