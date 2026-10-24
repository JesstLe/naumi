# R3B1：Canvas 原子文档编辑与历史持久化

日期：2026-10-24。独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。

基线：`cc0e7b03f35a82a008f8a9c8ae2a6d7c57082c5b`。本轮完成 **R3B1**，不是完整 R3B、R3 或全项目重构完成。没有合入 main、部署或调用真实供应商。

## 实际职责迁移

- `canvas/history-model.ts`：22 类编辑动作、文本节点/字段快照、动作→持久化 operation 编译、纯文档投影、首节点项目归属。编译器有 exhaustive 分支，视频 expectedRevision 在首次尝试冻结。
- `canvas/history-contract.ts`：将原服务端 Zod 请求 schema 原样抽出，客户端编译器使用其类型，服务端继续使用同一 schema。原 `canvas-history.ts` 保留兼容导出；事务函数正文未改动。
- `canvas/history-scope.ts`：捕获账号、workspace、项目和 epoch，auth 前后核查；请求使用捕获的 workspace/project headers，不使用等待期间新选择的上下文。
- `canvas/history-controller.ts`：唯一尝试编号/请求体、同一 action 在途去重、原请求重试、原子提交与刷新区分、分域撤销/重做栈。服务端成功后的显示刷新失败只产生同步提示，不再导致撤销记录丢失或本地坐标回退。
- `components/canvas/use-canvas-history.ts`：React 适配，只连接文档 setter、现有 video store、文本队列和 UI 回调；不包含业务计价、生成或新的状态管理框架。React 延迟 updater 内再次核对原账号归属；较新的未保存文本草稿不被晚到历史响应覆盖或清除。
- `canvas-client.tsx`：原历史请求编译、POST、节点修改循环及撤销栈实现删除；撤销/重做、整理、多节点移动、属性设置、文字剪线、视频结果选择使用共享 owner。保留 UI 选择、项目导航与空白项目呈现。

主组件从 **12,130 → 11,936 行**，净少 194 行。行数不是验收标准；实质是 **4 处 `/api/canvas/history` 提交点收敛到 1 处**，22 类操作只有一个编译器，组件不再拥有历史协议。

## 保持与纠正的行为

保持：原 schema、原子事务、owner 检查、视频 CAS、原 operation/fingerprint、50 项当前项目历史/450 项其他项目保留策略、首节点新项目归属、晚到 callback 的原始历史归属、只读控制、原生成与计价路径。

确定纠正（本地 A/B 已复现）：

1. 视频刷新失败不再把已经保存的 move-many/撤销/结果选择当成失败；原撤销记录保留。
2. auth/flush 等待期间账号、项目或 workspace A→B→A，不再提交旧闭包请求。
3. 服务器已提交但响应丢失，下一次使用完整原 operation/body；不在重试前先读取当前视频 revision，节点当前缺失也不阻断原回执核实。
4. 同一 action 的在途调用只发一次历史 POST；没有改成自动重试。
5. 旧响应不覆盖新账号文档；账号切换前已提交的动作仍记录到原域历史。
6. 历史响应不抹掉其后产生的新文本草稿；React 延后执行的 updater 同样检查。

## 集中验收

证据目录：`output/refactor-r3b-20261024/`。

- 完整 Git baseline archive 固定，verifier 按 `HISTORY_SOURCE_ROOT` 加载真实 Canvas 函数；新版执行真实 hook/controller/model，React/HTTP/auth 为受控本地端口，不宣称这部分是真实浏览器。
- BASELINE：64 场景、134 检查，复现旧行为；MODIFIED：67 场景、184 检查通过，exit 0。
- 22 类动作 × 正反方向 = **44 组请求体及本地文档结果逐项相同**。不是只检查源码字符串。
- 真实隔离 PG：20 检查，实际 history HTTP adapter、schema、repository、混合图文视频事务、owner、视频 CAS、同 operation 并发单次提交；随机 schema/连接池/loopback server 清理完毕。
- 真实 Next Canvas + 独立 Edge：7 项，整理事务、失败保持原文档与历史、原 operation 重试、undo/redo、实际文字 blur、文字恢复与重新加载；生成 POST/供应商调用均 0。
- TypeScript 全项目 exit 0；定向 lint exit 0，Canvas 旧 10 项 hooks warnings 与前轮一致，新模块 0 项。文本编辑/智能布局/属性静态入口/R3A 真实 controller 兼容检查通过。
- 独立副本回滚恢复原文件及旧行为；实际工作树保留新版。四产物及最终命令、literal、exit、哈希在 `VERIFICATION.txt` 与 `MANIFEST.json`。

主 verifier 包含实际 Canvas 接线；旧 `verify-canvas-scoped-history.cjs` 改为委托该 verifier，不保留手抄的第二份闭包实现。属性静态脚本只调整动作类型/协议编译器的新位置，不删业务断言。

## 原始失败与验证边界

- 首次 tsc：2 处 React 19 useRef 缺初值、schema 抽出时漏留 repository 仍消费的 videoNodeWriteSchema import；均已修正。原日志 `TSC_FIRST.log`。
- 首次基线 fixture：两个 HTTP response 共用同一个 Response body，导致读取两次；修复 fixture clone，未改变基线行为。原日志 `BASELINE_FIRST.log`。
- 协作预览：两次同一步 `Preview automation snapshot timed out after 15000ms.`，随后按规则使用仓库既有独立 Edge 流程；自有 tab 已关闭。
- Next dev 改动 tsconfig include 顺序并加入 fixture dist；核对只存在该机械变化后恢复原字节。不提交 fixture include。
- 本轮没有全项目 build、负载/容量测试或线上验收；10 万活跃仍是产品目标，不是达成结论。

## 继续项（不藏在本轮完成中）

- R3B2：文字草稿串行保存/恢复、账号/workspace 隔离的队列 owner；与历史事务并发时的写入次序。当前 `persistTextNode` 仍在组件，跨请求文字/图片 CAS 不在本轮引入。
- R3B 后续：详情 A+、同步编辑任务、图片作品加载与合并 owner。
- R3C：renderer/interaction；R4—R6：数据 owner/热 DDL、Worker 与 codec、其他应用模块。
- R2 旧 `verify-imagegen-receipts.ts` 在基线/新版均出现 `IMAGEGEN_NO_CHANNEL` 的 fixture 债务仍保留，本轮没有据局部通过将其关闭。

本轮是上次 main 同步后的第 3 个模块（R2、R3A、R3B1）。收尾已 fetch origin/main，仍为 `905c8c635e41ff3f4443d43db9776d1db3aab469`；普通 `git merge origin/main` 返回 `Already up to date.`，exit 0，整合前后 HEAD 都为 `cc0e7b03f35a82a008f8a9c8ae2a6d7c57082c5b`（本轮实施随后独立提交）。**功能模块计数归零，下一轮从 1 开始。** 不将任务分支自动并入 main。
