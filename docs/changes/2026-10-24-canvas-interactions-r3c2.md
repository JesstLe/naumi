# R3C2：画布选择、拖动与连线命令

日期：2026-10-24。工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
完整基线 `bf29b4de9db847e548d448a716e4d0fa35c34302`；保留 R0—R3C1 全部改动，不合入 main、不操作发布现场。

## 实际职责迁移

| 新 owner | 负责内容 | 原调用方/删除项 |
|---|---|---|
| `selection.ts` / `use-canvas-selection.ts` | 单一选择快照，点击/Flow 选择映射、相同集合不重复更新 | 替代五份 selection useState，保留稳定兼容 setter；Ctrl/Meta/Shift、文字/占位、命名组与右键批量语义保留 |
| `drag-controller.ts` / `use-canvas-drag.ts` | 一次手势的原 scope、起点、组偏移和结束命令；临时任务坐标独立处理 | 删除四份 gesture ref 与单图/单文字/视频/多选的重复拖动保存分支 |
| `link-command.ts` | 图片父边、文字引用/输出、批量产品绑定、视频角色、pending 边编译 | 原 onConnect/cutEdge/updateTextReference 接同一编译入口；不再独立 POST parents 或直接 text save |
| `history-controller.ts` | 沿用原 action、operation、冻结请求和事务，新增交互提交顺序 | 移动、连线与原属性/整理/undo 共用队列；unknown 先按原 body 读回执再执行下一步，确定 4xx 拒绝不登记 undo |
| `parent-link.ts` | 隐藏项目归属与显式引用边、真实环检测 | direct DB API、history repository 和本地投影共用，不再三份不同规则 |

主组件从 **10300 行降至 9800 行**；不是以行数当验收指标。新增 `text-patch-many` 只编译到已有 history wire 的多个 `text-patch`，一笔事务/一条 undo；没有新增 API、SQL 表、事件总线或平行保存系统。
AST 对照确认其余 **173 个函数正文保持不变**；仅 4 个交互函数改变、6 个旧函数删除、1 个编排入口新增，生成/报价/供应商函数未改。

## 已复现并关闭的具体不一致

1. **canvas-add 项目归属被历史剪线清掉。** 原 direct API 会保留 `parent_id`，旧 history/local reducer 会清空；同 primary 的显式引用也没存进 `parent_ids`。现 add 始终保存显式边，cut 保留 canvas-add primary；非 canvas-add primary 仍按原规则移除。
2. **隐藏归属造成伪环。** history 原递归跟随所有 primary；现在与 direct API 一样，仅跟随显式输入。真实环继续拒绝。
3. **单节点先改文档/先记 undo，再发现保存失败。** 单图、文字、多选、命名组和视频均发 `move-many`，只在事务成功后应用文档并记 undo；失败只回退仍匹配本次坐标的视图，不覆盖后续拖动。
4. **失败手势丢掉原 operation。** history owner 在当前会话保留 unknown 请求，后续交互、整理/属性和 undo 都先恢复原 body；同 action 并发仍只发一次。账号/workspace epoch 变化后不复用旧身份。
5. **批量产品图绑定逐节点写入。** 同一次选择绑定现合为一笔原子 history 请求，失败不出现部分绑定或虚假 undo。内容编辑/正常取消、供应商和计费逻辑不变。

`use-canvas-scene` 只保留待确认位置的 view overlay；它不是第二份文档。scope 切换和迟到响应有独立检查，拖动中的位置不会被旧失败回退覆盖。

## 集中验证与证据层次

证据目录：`output/refactor-r3c2-20261024/`。

- 完整基线源码与原文件字节先保存。实际旧 handler/model **10 场景 / 28 检查**，明确复现旧行为；新版实际 owner/调用方 **33 场景 / 89 检查**。
- 真实隔离 PG、真实 history HTTP handler、direct parent API：基线 **26 检查**，新版 **28 检查**；项目归属、真实/伪环、owner、混合原子移动、批量文字 rollback、原 operation 单回执通过。
- 既有真实 PG history suite **20 检查**通过，包含混合事务、并发 video CAS、重复回执和归属。
- 真实 Next + React Flow **12 项**：保存拒绝不产生 undo、单图/文字拖动、Ctrl/Meta/Shift、多选与命名组、真实端口连线、Delete 剪边、原子双文字绑定、原操作恢复及 undo/redo。
- 相邻真实 Next：文字/历史 **12**、详情/同步编辑 **5**、普通生图 **5**。场景 renderer **6** 项在最终 history 队列收拢前已通过；该轮只改队列时没有再重复这 6 项，最后一版的交互/文字/详情/普通生图均已重新执行。
- 相邻 owner：history **67/184**、text **21/58**、artwork **26/49**、任务 **74/369**、图片 **46/176**、scene **30/98**、节点 SSR **32 组**通过。
- 全项目 TypeScript exit 0；模块 lint exit 0，保留基线的 **8 条** Canvas hook warning，没有禁用规则或新增 warning。
- 供应商/生产调用 **0**。Next API 数据使用本地 fixture，不冒充真实 PG 浏览器或线上验收；PG 检查单独执行并标记。
- 独立全源码副本回滚：恢复既有文件原 hash、移除本轮新增文件，并重新运行基线行为脚本；实际工作树保持修改版。具体命令/literal/exit 见 `VERIFICATION.txt`。

## 原始失败和未完成

- 首轮 PG baseline/modified 均在 fixture 坐标断言失败：`addArtworks` 不保存传入的 canvasX，实际为 null。为隔离数据显式写入 `10/20` 后集中重跑，生产实现未为断言修改；两份 exit 1 原日志保留。
- 首轮选择 hook 接线引入四条稳定 setter 的 ESLint dependency warning，已补依赖；最终仍为原八条。
- AST 对照的首次检查误把最外层 `CanvasClient` 也纳入“保留子函数正文”名单，因此 exit 1；明确单独统计被重构的组件容器后，173 个其余函数不变，原失败日志保留。
- T3 preview 同一页面 snapshot 两次均返回 `Preview automation snapshot timed out after 15000ms.`；使用仓库独立 Edge 控件流程，未操作用户其他页面。
- 首次相邻任务/图片 verifier 沿默认目录回写了两份 ignored `MODIFIED_RESULT.json`，本轮另存其副本并记录在 `EVIDENCE_ROUTING.json`；不把这些回写称为旧提交的重新封存。
- 新串行交互队列覆盖本组件生命期，不是跨刷新持久化编辑日志；跨 tab CAS、全租户 SQL 策略审计、旧测试债务、全候选 production build 和容量实测仍未完成。
- 选择的其他兼容 setter、键盘、菜单/节点创建/复制删除以及批处理/助手编排仍有代码在 CanvasClient；R3 整体尚未收尾。下一切片收拢节点操作，之后继续 R4 DB/配置和 R5/R6。

## 交付与后续

四产物：`MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`，均重新打开并检查内容/哈希。
本轮刷新 `origin/main` 仍为 `905c8c635e41ff3f4443d43db9776d1db3aab469`；同步后模块计数为 **2**，下一完整模块后按约定普通整合。
自有 Next 14355/14356 已关闭，65444 自有 PG 容器已删除，随机 schema/连接清理完毕；`tsconfig.json` 仅 fixture include/格式改动，已还原原字节。
整体重构继续，交付目标仍是完整可运行候选，不以本模块通过宣称全项目完成或十万用户容量达标。

```text
继续任务：在独立 worktree 推进 R3 下一完整模块。
基线：读取本模块固定提交、REFACTOR_MIGRATION 和真实 Git 状态。
保持：selection/drag/link owner、历史原 operation 和事务、冻结原价、结果续交。
动作：将节点创建/复制删除/批处理实际调用收拢，不造新保存或收费通道。
验收：完整模块后集中对照；真实控件、原回执、失败/ABA、独立副本回滚。
发布：不合 main，不接管其他线程锁；先交付并推送独立候选。
```
