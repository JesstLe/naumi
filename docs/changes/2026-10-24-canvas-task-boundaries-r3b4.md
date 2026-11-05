# R3B4：详情与同步编辑任务、共享结果落地

日期：2026-10-24。独立目录 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
基线 `93dc86c8d2b8b0a8a87e7e44ba8bd98328871e00`。本模块本地实现、集中验证及独立副本回滚已完成；整体重构继续，不合 main、不发布。

## 职责迁移与删除

| 唯一职责 | 实现 | 实际消费者 |
|---|---|---|
| 原始归一化请求、完整公开报价、原 operation | `billing/client-submission.ts` | Canvas A+、抠图、扩图、标注 |
| 详情参考图/角色/模块/血缘表单 | `canvas/detail-task-request.ts` | 已有图片与空白节点详情入口 |
| 详情 submit/poll/recover/partial | `canvas/detail-task-controller.ts` | `generateDetailSequence` UI 适配 |
| typed 同步编辑请求和结果身份 | `canvas/edit-task.ts` | `runCutout` / `onExpand` / `submitAnnotations` |
| 位置、作品同步、关联、一次撤销 | `canvas/result-attachment.ts` | 普通生图、详情、同步编辑三类任务 |
| 每次尝试的 actor/project/workspace/epoch | 现有 `image-task-scope.ts` 增量 | 任务查询、定位、显式原项目恢复 |

- Canvas 删除两套请求/轮询/落地编排，保留选择、占位与拖动、进度展示。主组件 **11747 → 11576 行**。
- 普通图片 controller 删除自有定位/合并/undo 副本，改用同一 attachment；未再建统一万能 task、事件总线或第二个账务系统。
- `privateFetch` 继续负责现有 frame choice、质量归一化、模型选择及报价准备。新 retained submission 在首次准备后冻结它的输出，不绕过当前钱包/授权与服务端回执。
- BillingProvider 仅改变显式 operation 与缓存的优先顺序：显式原 operation 优先，避免同内容另一任务的缓存替换它。首次普通提交仍使用原 fingerprint/localStorage 防重机制。

## 实际行为

1. 已知 A+ job 的轮询失败只 GET 原 job；已知结果的 metadata、position、merge 失败只续接原作品，不重建生成。
2. 未知提交响应允许用户显式再次取得同 operation 的原回执，不自动重试，不重新报价，不换原请求字节。没有 job ID 时使用既有 receipt-first POST，不冒称全程零 HTTP POST；真实 PG 验证未再次执行生成。
3. 原 3 积分报价在 current 改为 99 后仍保持 3；已结算回执重读只有一笔 consume。真实余额不足、他人原 operation、他人作品位置继续拒绝。
4. partial/error 已有结果先交付并只登记一次 undo，任务仍失败/部分完成。`done` 但不足请求数量也不报全部成功；再次检查只查询原任务。
5. 三类 attachment 共享顺序：位置成功→作品可读→关联成功→undo。已确认的位置不在后续同步重试中反复覆盖；详情仍按显示节点高度＋24 纵排，普通生图和单图保留各自原 wire。
6. 请求跨项目/账号/workspace ABA 或卸载后不继续落图；已收到的 job/result ID 保留。原项目的显式恢复捕获新 epoch，不让旧 continuation 自动复活。
7. 同步编辑与空白详情保留 session-local 占位、拖动位置和原 retry。不同 workspace 不显示旧占位；详情 source 卡绑定可见域。当前选中节点、后续草稿及新开的标注面板不被任务完成抢占。
8. 没有增加积分确认、业务额度或用户操作审批。

## 集中验收

目录：`output/refactor-r3b4-20261024/`。四产物、完整命令/输入/字面输出/exit/哈希见 `VERIFICATION.txt`。

- 实际 Canvas 五入口、实际 BillingProvider 回调与新 owner：完整基线 **74 场景/172 检查**，新版 **74 场景/369 检查**，exit 0。baseline PASS 表示复现旧行为，不表示旧业务正常。
- 基线详情 poll/position/merge/metadata 失败后的 POST 为 2；新版为 1。基线 partial 重试重复 undo；新版保持 1。未知提交重试维持原 operation/价格/字节；并发 retry 合并为一次运行。
- 正常/显式角色 **7 组 wire** 字段顺序、文件名/type/字节、血缘一致。
- **真实隔离 PG 21 检查**：实际同步账务 owner、原 intent、原生 artwork get/position handler；响应丢失、原价/一次结算、余额/归属、详情原 job 与定位续接。供应商执行和 A+ job 执行是 fixture ports，非完整生产供应商验收。
- **真实 Next Canvas/Edge 5 项**：扩图控件→定位失败→原结果重试；详情控件→轮询失败→原 job 恢复；当前选择/草稿保留；实际撤销。
- 现有普通生图真实浏览器 **5 项**通过：双任务、选择/草稿、定位恢复、空白节点、receipt 清理。
- 相邻 owner 回归：普通图片 **46/176**、历史 **67/184**、文字 **21/58**、作品 **26/49**；nonblocking annotation contract 通过。
- 全项目 TypeScript exit 0；lint exit 0，原 Canvas 10 条 hooks warnings 保留，新模块零 warning。
- 三个旧详情/编辑 CLI 改为委托实际入口 verifier，避免继续抽取已移除的页面闭包。完整旧树原始失败日志已保留：detail `__dirname` setup 失败；edit/lifecycle 旧 `uncertain` 期望与基线实际 `failed` 不符。没有改 baseline 来伪造通过。

## 原始失败、边界与后续

- 新 verifier 首轮 VM 缺 `process`、baseline 引用 alias 未绑定；已补 fixture。PG 首轮 VM 缺 `process`、第二轮误用 ledger `amount`（真实字段 `delta`），均 cleanup 后修正。TypeScript 首轮只报 fixture `ArtworkRecord`/nullable quote 类型；lint fixture `module` 命名已改为 `projected`。失败日志不覆盖。
- 协作预览两次 `Preview automation snapshot timed out after 15000ms.`，改用仓库既有独立 Edge；第一次定位误写“扩图”，按实际控件“扩展画面”修正。未改产品控件迁就脚本。
- 旧 `verify-image-billing-client.ts` 在完整基线和新版均因其 workspace stub 缺 `currentWorkspaceRevision/WORKSPACE_SELECTION` 而构建失败（0 场景），不算通过。本轮实际 BillingProvider submit/quoteAndSubmit 回调由主 verifier 覆盖；完整旧 SSR suite 仍留候选债务。
- session-local task owner 不是新增跨浏览器持久任务库；已有服务端回执/作品不删除，完整刷新后的全入口统一恢复后续继续。多 tab CAS、未知历史写入交错及全租户 SQL 审计未在此轮完成。
- R2 旧 `IMAGEGEN_NO_CHANNEL` 与 R3B2 旧 text-image 缺 pinned 快照继续留存，不宣称全 suite 通过。
- 下一阶段 R3C 渲染/交互分责，随后 R4 数据/事务/配置控制面、R5 Worker/codec、R6 其余业务及最终完整候选 build/性能/容量验收。10 万活跃仍是目标，不是吞吐实测结果。

本轮为 main 同步后的第 **3** 模块（R3B2/B3/B4）。完成后按约定刷新并普通整合 origin/main、计数归零；工作保持独立候选，不改线上服务。

R3B4 三模块同步已执行：`git fetch origin main` 与 `git merge --no-edit origin/main` 均 exit 0，origin/main=`905c8c635e41ff3f4443d43db9776d1db3aab469`，普通 merge 返回 `Already up to date.`；累计计数归零。本轮没有把候选合入 main。
