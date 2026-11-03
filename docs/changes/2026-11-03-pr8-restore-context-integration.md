# PR #8：正式整合 restore 草稿合同修复

## 输入与复现

- PR #8 固定基线：`d09b93a77591cdfda52806886a648b871db000bb`。旧头 Core / Verify 成功不覆盖本次已复现的真实 PG 反例，也不构成新整合头的 CI。
- 原始证据 `output/refactor-r9v-handoff-audit-20261101/COMMANDS.json`、`verify-restore-equal.ts` 和运行入口按 SHA 复制保存，原文件不改。
- 在自有本机 PostgreSQL 16 容器重跑原反例，基线 exit 1：`BEFORE_BASE=1 AFTER_BASE=3 BEFORE_REVISION=1 AFTER_REVISION=2`；正式 runtime/repository 回归也 exit 1：历史恢复将 `base4/revision1` 推进到 `base6/revision2`。

## 模块、公共接口与状态归属

- 普通 merge 纳入 PR #9 固定头 `71202c9c07c3b95b777b22c02238dac6786486f1`，不重新实现已经审阅的修复。
- `runtime.publish` 复制标量输入，将经 stage fingerprint 验证的原 `draftId` 传给 `markApplied(id, digest, publishedDraftId?)`；repository 仅对该 draft ID + actor 加锁，并保留原 digest 条件。
- `runtime.restore` 不携带来源草稿。历史内容或当前内容与工作草稿相同时，restore 都保留完整草稿 ID、内容、base 与 revision。
- active version、publication 回执、容量、视频冻结、审计与正常 publish 草稿续接仍在原事务。UNKNOWN 沿原 ID 和回执核对，不重做 activation；旧 applied 回执不再次推进草稿。
- 普通 merge 同时纳入 PR #10 固定头 `d5101f257ee51a05c003c0f1ede2c059c36236a6` 的 Router source 四场景正式回归和经复核的文档计数归属。共享 runner 实现不回退。

## 主线整合门禁与协作

- 2026-11-03 fetch 的 `origin/main` 为 `3ac639d95b6dd0ae6983cb55c1dce3e43092fd44`；相对共同祖先引入 278 个路径，试整合产生 14 个冲突文件，涉及 Canvas 拆分 owner、工具回执、视频工作流、媒体与报价。
- 试整合仅发生在独立实验工作树，冲突与尝试补丁标为 `UNVALIDATED_NOT_FOR_PUSH` 后已 abort；**本交付不包含该主线整合或实验修改**。共享 `E:/Workspace/naumi-refactor-20261024` 的分支、索引、源码与原产物保持不动。
- 本轮先把真实 PG 修复正式推进 PR #8，不把未验证的跨模块主线功能与修复捆绑。主线冲突仍是后续任务，不记成已解除。

## 集中验证、四产物与退出状态

验证与独立副本回滚结果以 `output/pr8-restore-integration-20261103/VERIFICATION.txt`、`COMMANDS.json`、`DELIVERY.json` 为准；完整修复源码、二进制差异、首写前全树 hash 防护的可执行回滚脚本与报告均需重开核验后交付。

原反例、正式 36 项上下文回归、模型 config/publication/admin/execution/review/flow/batch/health/performance 及 8 项 coverage 均 exit 0；Router owner 146 项、共享 runner 20 case / 373 check 通过。实际 typegen、非增量 TypeScript 5,082 个输入、定向 lint 和 diff-check exit 0，输入逐 raw hash 保持。性能脚本只度量本机 PG 夹具，不是整体性能或容量验收。

**继承失败不销账：** `verify-model-management.ts:63` 对同一个已 applied 的管理操作重复读取，预期 200、实际 409；完整 d09 基线和整合版均 exit 1，原日志保留。本次不把它写成通过。首轮 health 子进程缺少 react-server condition 的 harness 失败已保留；修正继承环境后整个 health 模块 exit 0，产品代码未为该 harness 改动。

原反例的 `JSON.stringify` 诊断 flag 对属性顺序敏感，修复版曾打印 0 但原 `assert.deepEqual` 通过。原脚本与输出均保留；独立审计副本仅将诊断比较改成 `isDeepStrictEqual`，业务断言不改，基线/修复/回滚按同一脚本复验，避免拿序列化顺序冒充业务变化。真实 Go/整浏览器、完整 core、生产镜像及线上验收只按实际新执行证据登记，历史结果不改标为当前头。

**整体仍 ACTIVE。** 本轮不合 main、不部署，也不解除本线程 47 HOLD。R04 最终语义复核、同案例页面矩阵、当前完整 core / 固定 Web+Worker / 运行性能验收和主线冲突仍需闭合；超过 48 小时未合主线的原因保留为上述未完成门禁。
