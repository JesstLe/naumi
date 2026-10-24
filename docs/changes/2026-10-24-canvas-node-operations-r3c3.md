# R3C3：节点生命周期与批处理编排

2026-10-24；独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
基线 `309f11b092ed10c56861a85ced7c9bfa718f428c`；完整源码和原字节先保存。

## 职责与实际调用

- `node-operations.ts` / `use-canvas-node-operations.ts`：单图副本、历史添加、混合复制、选择删除和项目删除的请求/回执所有者。原组件入口均已接线，删除两套复制保存/补取逻辑和组件级 copyAttempts/duplicateBusy。
- `node-copy-contract.ts`：共享纯 DTO/schema，无数据库或服务端 import；旧 mixed copy wire 保持，新增可选 `singleArtwork` 明确表示单图落点、标题及无输入连线。
- `node-copy.ts`：单图复用现成复制事务/幂等记录，坐标与作品一起写入。单图不继承来源节点锁定/属性，保持原单图复制语义；保留 copy provenance 和来源 ID。多类型复制、引用映射与旧 receipt 路径继续使用原实现。
- `node-commands.ts`：删除集合/历史动作以及新文字节点数据构建。文字仍由既有 text document 保存和保留草稿；没有新建文字保存系统。
- `selection-run-controller.ts` / `use-canvas-selection-run.ts`：批处理 run/progress/同步去重归一个 owner。复用既有 `runSelectionBatch` 两路编排及 image/text/pending 任务执行器，不执行供应商或计费。run 绑定 account/workspace/project，旧 run 不写下一项目进度。
- `history-controller.transaction/acknowledge`：复用现有串行边界、文字保存 barrier 和文档 reducer；外部节点 API 已持久化的结果只本地 acknowledge，不重新向 history POST。普通编辑/undo 仍用原 apply/submit。
- video store 增加受当前作用域约束的 `accept`，直接消费实际服务端复制结果；已保存的删除本地 tombstone 不依赖可失败的刷新。原轮询、revision merge 和 video 写入队列保持。

Canvas **9800 → 9575 行**。AST 核查：**171 个函数正文保持，7 个节点操作编排函数改变，1 个选择展示函数新增**；报价、供应商与生成函数正文不变。批运行内部回调仍传原节点参数和 `node:<id>` operationKey。

## 本轮实际修正

1. **复制已成功、作品 GET 失败后再点击会再次创建。** owner 缓存服务端 copy result，后续只补取原 ID；无第二个复制 POST。
2. **混合复制后视频刷新失败导致漏记 undo。** 现在先登记持久操作，并用服务端节点快照投影，不把额外刷新当复制成功条件。
3. **删除/项目删除响应未知时丢掉 operationId。** 冻结原 body 与节点快照，显式重试使用同 operation。确定拒绝不记录成功，未受理/未发出的工作不越过 scope 与最新只读状态。
4. **copy retry 会被新落点/新标题改变身份。** 同一失败意图保留最初 body；成功后才释放该意图，使用户下一次明确复制创建新副本。并发同意图共享一个 Promise。
5. **批运行状态散在组件。** owner 内同步 busy 关闭双击事件间隙，切项目停止尚未开始的工作，已受理任务仍沿既有任务 owner 恢复。

正常 UI、删除确认语义、单图标题/落点、复制选中及创作栏、图片与文字草稿保留。不增加积分确认、业务限额或用户审核。

## 集中验证

证据根：`output/refactor-r3c3-20261024/`，四产物及全部命令/literal/exit 在 `VERIFICATION.txt`。

| 层次 | 实际结果 |
|---|---|
| 完整旧源码 handler 对照 | 4 场景 / 9 检查，复现重复创建、刷新漏 undo、删除换 operation |
| 新 owner + 实际 history/text document | 19 场景 / 59 检查通过，包括 auth ABA、迟到原项目历史、双击去重、排队写入、原结果读取恢复 |
| 真实隔离 PG + copy/delete/history HTTP | 基线 24、新版 32 检查；单图无连线/落点/原字段/provenance，mixed remap，原子删除/恢复，owner负例及 replay |
| 真实 Next 控件 | 11 项：已保存读失败恢复、原 operation unknown、混合复制删除、单次撤销、创建文字、历史添加、批量双击与结果落地 |
| 相邻真实 Next | 交互 12、文字历史 12、详情编辑 5、普通生图 5 通过 |
| 相邻 owner | history67/184、interaction34/92、text21/58、artwork26/49、任务74/369、图片46/176通过；既有selection-run行为/参数脚本通过 |
| 类型/lint | 全项目 tsc exit0；lint exit0，共9个已有warning（Canvas8、video hook1），新模块0 |

浏览器使用 local fixture API，PG 检查单独运行；不将两者混称生产验收。供应商/生产调用0。最后的“排队后只读重检、persisted=false保留”增量已重跑19/59和核心11项控件；相邻交互/文字12+12在该两点之前通过，详情/图片5+5在之后通过，原日志分开留存。

## 失败记录与保留边界

- PG 首轮两端同样失败：fixture 漏必填 gradient；补隔离测试数据后通过，生产不改默认。
- 浏览器三次测试准备问题均保留 exit1：菜单项误当button；键盘删除本来直接执行却等待不存在的确认弹窗；复制后的节点重叠遮住批运行点击目标。分别修 locator、按真实原交互验收、在独立 reset 后验收批运行，未用强制点击掩盖产品失败。
- T3 preview snapshot 两次返回 `Preview automation snapshot timed out after 15000ms.`；改用仓库 Edge 流程并关闭自有页。
- `node-delete.ts` / delete endpoint 原事务未改，旧mixed copy仍保留；模板导入和文件上传仍有独立语义/调用者，没有删除其 `/api/artworks/add`。
- 新 owner 的重试记录是本组件会话内状态，不是跨刷新编辑日志。unknown 删除后又编辑相同文字、原结果重新同步与后续写入交错、多 tab CAS 仍需在后续文档事务阶段统一验证；本轮没有宣称覆盖所有跨请求竞态。
- 全租户 SQL 策略、配置/DB 大依赖环、完整 production build/性能和最终全候选验收仍未完成。R2/R3B2/R3B4原有fixture/source-extraction债务仍按迁移台账追踪。

## 回滚、同步、后续

独立完整源码副本覆盖 modified 归档后执行 `ROLLBACK.sh`，校验原文件哈希与新增文件移除，再执行相同4/9基线；实际工作树保留重构实现。所有四产物重新打开检查。
本轮为上次main同步后的第3模块；刷新 `origin/main` 仍为 `905c8c635e41ff3f4443d43db9776d1db3aab469`，普通 merge 返回 `Already up to date.`，提交后再核实同步，计数归零。未将候选合入 main、未部署。
本轮 Next 14357/14358、PG65445 自有 fixture 已停止/清理，原tsconfig字节恢复。

下一步继续 R3：文字创作/批量内容任务、工具面板与 UI 组合边界，随后 R4—R6。整体目标保持 active，不将本模块或行数下降记为完整重构交付。

```text
继续独立 worktree 的 R3 后续边界，不重做已经完成的任务/历史/交互/node owner。
先固定当前提交、检查真实调用与数据所有者，再删除被替代的组件闭包。
保持原 operation、冻结报价、原结果续交、文档scope与历史唯一事务。
一个完整模块集中验收，保留失败原日志及独立副本回滚；不要启动发布。
```
