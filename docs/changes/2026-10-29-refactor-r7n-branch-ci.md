# R7N：重构分支实际触发已有核心回归

## 基线与职责

工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`，完整源码基线 `a5843faa66f98ffe8c6fb3b439b8b5d57c7840e5`。本片属于交付验证链，不改产品业务或增加运营护栏。原始5080文件hash与R7M最终归档一致；先保存原始字节再修改，不使用Git LF归档替代工作树原字节。

## 调研与实现

- 现有 `refactor-regression.yml` 已具备隔离PG、同SHA checkout、固定核心catalog、原始日志与artifact。但push只监听main，当前重构分支推送并不选择该workflow。默认分支manual dispatch404与私有仓库protection403是不同问题，不据此推断普通分支Actions不可执行。
- 仅在已有push.branches添加精确 `codex/core-refactor-20261024`；保留main、paths、PR/reusable/dispatch入口、仓库判定、只读权限、同SHA命令与artifact命名。
- 扩展既有 `verify-refactor-runner.mjs` 的静态wiring检查：精确分支列表、镜像push仍main-only、只读权限、仓库判定、核心命令与artifact同SHA。原真实子进程的失败码、缺marker、源码变化、wrong SHA、dirty、resume/tamper等用例不变。
- 没有新建runner、发布job、凭据、长期监听器或PR；没有更改仓库公开性、付费计划或分支保护。

## 集中本地验证

1. 新verifier读取保存的旧workflow：预期exit1，字面 `ACTIVE_REFACTOR_BRANCH_PUSH_NOT_CONFIGURED`，确认原配置不满足分支push要求；不是把缺陷复现记为业务通过。
2. 当前workflow与既有runner：`REFACTOR_RUNNER=PASS mode=MODIFIED cases=12 checks=172`，exit0；`WORKFLOW=STATIC BRANCH_PUSH=CONFIGURED IMAGE_PUSH=MAIN_ONLY NETWORK=0`。12组包括真实隔离Git子进程，不是远端Actions执行。
3. `git diff --check` exit0；应用2072个src/services文件对基线逐字节一致。此纯CI切片不重复完整core、tsc、镜像构建和产品浏览器；R7M完整应用证据仍绑定924f6d85，不重标成本片新构建。

命令、完整字面输出、实际退出码、远端push与run/job状态、独立副本回滚及四产物在 `output/refactor-r7n-20261029/`。远端是否成功必须以精确head SHA对应的真实run/job为准，本地解析YAML不证明远端执行。正常推送后检查；若存在真实账户/额度/运行失败，原文留存，不购买计划或重复重跑掩盖它。

## 状态与下一步

整体重构ACTIVE。此分支超48小时因用户明确要求独立目录持续整体重构；未合回main、未部署，47 HOLD。本片fetch到origin/main `956b7238fa375e992e0ac594c47cdba5c9d95f50`，比已整合主线新增6提交，另列后续产品整合，不混入本片CI差异。Canvas剩余应用编排与变化传播、同机同数据同构建INP/混合容量、最终整版main交付和历史MEDIA_STATE_WRITE_FAILED根因仍待完成。


## 实际远端结果（2026-10-29）

触发源码 `328d0c0980d35878846e5d3be0b16a8bdd10eba9` 正常push后，GitHub已真实创建 [Core refactor regression #40880058058](https://github.com/JesstLe/naumi/actions/runs/40880058058)，event=push，精确head/branch/workflow全部匹配。只有该回归workflow，没有触发Docker镜像发布。证明分支选择入口已经生效，但远端回归**未执行**：core job `123468866209` 在3秒内failure，runner_id=0、steps=[]。

原始failure annotation：

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

因此本片状态是**分支触发修复并已验证，远端全量仍受账户问题阻断**，不是远端core125通过，也不是产品回归失败。保存run/job/check/annotations全部原始JSON，不重复rerun、不改费用或仓库公开性，不用静态PASS替代这条失败。有效远端绿灯、required protection仍未完成；历史403与此次明确账户失败分别保留。
