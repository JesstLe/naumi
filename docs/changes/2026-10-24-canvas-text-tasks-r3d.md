# R3D：文字生成、反推与帮写的任务所有权

2026-10-24；工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
完整基线：`fec5372dc9f6da16b42cdd03352073fa1f474baf`。原源码、四个既有文件的原字节及 SHA-256 已在修改前保存。

## 结构与调用变化

- `text-task-request.ts` 只构建普通文字、反推及帮写的 typed 请求和新节点；两处 mention 规则迁入此纯模块复用。
- `text-task.ts` 是一笔文字创作的所有者：保留原 request、既有 retained billing submission、已知答案、保存进度和单次创建历史。没有新建计费、供应商或文档系统。
- `text-task-controller.ts` 按账号/工作空间/项目/节点区分任务，批量操作复用现有 `runSelectionBatch`；未知结果不会被新 prompt 覆盖。
- `use-canvas-text-tasks.ts` 只订阅状态并连接当前 scoped ports，不复制文字文档。
- Canvas 的 `generateTextNode`、`reversePromptsForSelection`、`assistWriteForNodes` 都调用同一任务；删除三份 submit/parse/save/error 编排和两个独立 batch busy state。错误按当前文字任务展示，失败派生节点通过现成按钮“继续原任务”恢复。

Canvas **9575 → 9342 行**。AST 对照：173 个保留函数正文不变，4 个函数改变，2 个 mention helper 迁出；图像、视频和计费函数正文保持。行数仅辅助检查，实质是三种入口共用同一任务和原结果续存逻辑。

## 对用户直接有用的行为

1. **文字已生成但保存失败**：答案保留、仍然可见；继续原任务只补保存，不重新购买/生成。
2. **响应丢失**：沿原 operation、原 body、原报价恢复。真实 BillingProvider 原本已有 client-intent 防重，本轮没有将其描述成“以前没有防重”；本轮补齐 task 层原答案和完整报价的保留。
3. **切项目**：已受理任务完成后写回原文档，不覆盖新项目或模型控件；未开始的批次停止启动。账号/工作空间变化后不写新文档，返回原身份可显式续存答案。
4. **任务途中编辑**：保留后来修改的 content、width、sourceIds；删除的节点不复活。
5. **反推和帮写**：只有保存成功才登记一次 text-add undo，原 source/product 关系和 `@产品图` 内容保留。
6. **请求身份**：第一次请求交由既有 BillingProvider 读取持久 client intent，不预先随机覆盖；每节点独立 intent slot，两个节点相同 prompt 不混成一笔。已知明确拒绝后可发起新意图，unknown 不换号生成。

既有报价、真实余额、账号/工作空间/素材归属及历史事务继续使用原模块；没有新增积分确认或业务限额。

## 集中验证

证据目录：`output/refactor-r3d-20261024/`。精确命令、输入、literal、退出状态和四产物见 `VERIFICATION.txt`。

| 层次 | 实际结果 |
|---|---|
| 完整旧源码 handler + 实际 BillingProvider callbacks | 3 场景 / 15 检查；保存重试会再次生成，unknown 已有 client-intent cache，切项目丢弃已返回结果 |
| 新任务 + 实际 BillingProvider callbacks | 18 场景 / 77 检查；原答案续存、原价 3 而非 current 99、scope ABA、双击、编辑/删除、两节点独立身份、持久 intent 恢复 |
| 真实隔离 PG | 24 检查；实际账务/receipt、文字 HTTP 持久化，供应完成响应丢失无重复执行，保存重试 paid POST=0；原价 3、余额不足 402、其他 owner 409、单次 consume |
| 实际 text-generate handler | text-only、拒绝 image response、reasoning 隔离、single call、structured text 均通过，loopback 模型服务 |
| 真实 Next/Edge 控件 | 6 项；普通文字保存恢复、unknown 原 operation、反推、undo/redo、帮写及产品引用 |
| 相邻 owner | history 67/184、text document 21/58、interaction 34/92、task boundaries 74/369、node operations 19/59、image tasks 46/176 均通过 |
| 相邻真实控件 | 文字历史 12、普通生图 5 通过 |
| 类型/lint | 最终全项目 `tsc --noEmit --incremental false` exit 0；定向 lint exit 0，Canvas 原有 8 个 warning，新模块 0 |

最终核心 18/77、PG24、Next6 和 tsc 均在最后请求身份调整后运行。相邻控件 12+5 在该调整前运行，原日志分别保留。PG 的模型推理是 fixture port，账务、回执、文字持久化是真实实现；浏览器 API 是 loopback fixture，实际 text-generate handler 在另一个脚本单独验证，不合并冒充生产整链验收。

## 失败原件与证据纠正

- `BASELINE_FIRST.log` 使用简化 billing fixture，曾误得 unknown=NEW_OPERATION；更换实际 BillingProvider callbacks 后，权威 `BASELINE_FINAL.log` 为 `UNKNOWN=CLIENT_INTENT_CACHE`。旧日志保留，不用其结论证明产品缺陷。
- `BASELINE_CLIENT.log` / `MODIFIED_CLIENT.log`：VM callback 作用域发生重复 submit 声明，exit 1；block 隔离后修正。
- `MODIFIED_ACTUAL.log`：实际异步 hash 尚未让两 lane 进入就断言两请求，exit 1；改有界等待，不改变产品并发逻辑。
- `PG_FIRST.log`：fixture 只设单价未启用收费 tariff，实际 consume 为空；显式启用隔离 tariff 后真实扣 3。
- `PG_FINAL.log` / `PG_DEBUG.log`：fixture 未建立 source 作品，实际输入归属检查拒绝；补隔离库归属作品后通过。
- `BROWSER_FIRST.log`：5 项后 dock 遮挡下个点击目标；按实际 UI 关闭 dock 后完成 6 项，不用 force 点击。
- T3 preview 两次 `Preview automation snapshot timed out after 15000ms.`，之后使用仓库 Edge 验证流程；自有预览页已关闭。

## 回滚和留存边界

四产物为 `MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。独立完整源码副本先覆盖 modified 归档，再回滚 4 个既有文件、移除 8 个新增文件，校验原哈希并重跑相同 3/15 基线；真实工作树保留重构实现。归档逐文件哈希与当前源码一致，全部产物重新打开检查。

本轮自有 Next 14359/14360、PG 65446 已停止，随机 schema/池关闭，自有容器已删除，tsconfig 原字节恢复；`CLEANUP.json` 已回读确认无上述监听。

明确留到后续的工作：

- task 答案与完整 quote 主要保留于当前会话，不是跨刷新完整任务 journal；原 BillingProvider 持久 intent 继续存在。
- 旧版无 node-slot 的历史 client intent 升级到新 slot 尚未做迁移验证，最终 R6/上线兼容验收须覆盖。
- 用户走全局文字“重试保存”后，task error/undo 状态仍在显式 task 恢复时收敛，尚无自动监听保存确认。
- 多 tab CAS、unknown 历史/删除与后续写入交错、全租户 SQL 策略、旧 source-extraction/fixture 债务、完整 production build 和容量实测仍未完成。
- R3 UI 组合仍有剩余，R4—R6 继续；本模块不是整个项目的完成结论。

本轮是上次 main 同步后的第 **1** 个模块。只提交/推送独立重构分支，不合入 main、不部署，不接管其他发布线程。

```text
继续 codex/core-refactor-20261024 的整体重构：复用现成任务/文档/历史 owner，
先核对真实依赖和固定基线，再迁移一个闭合职责并删除旧副本。
保持原 operation、冻结报价、答案续交、归属和幂等账务。
模块完成后集中验证、原失败留存、独立副本回滚、选择性提交；不启动发布。
```
