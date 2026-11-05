# R3A：Canvas 图片任务 controller

## 基线与目标

- 独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 完整基线 `c6c8f444317b63f542bdd1d51582725c44e21257`，包含 R1A/R1B/R2。原始归档 SHA256：`30001440df8a48e54efc79554d34fad1ff1e6436846b2d7511fd97af8a645a6b`。
- R3A 实施已有图片再生成、空白/文字节点图片生成的共同任务职责。不是整个 Canvas 拆分结束；详情 A+、同步编辑、文档/历史/持久化与 renderer 继续在 R3 后续拆分。

## 责任归属和实际迁移

| 模块 | 所有权 | 实际调用方 |
|---|---|---|
| `lib/canvas/image-task-request.ts` | typed 图像输入→FormData、顺序参考图/角色、默认值、血缘与项目字段 | `runGen`、`generatePend`；原 `appendComposerReferences` 内实现删除，详情入口沿共享参考写入 helper |
| `lib/canvas/image-task-scope.ts` | owner/project/workspace 快照、workspace revision、await auth 前后 currentness、捕获请求 headers | 两种图片任务的 GET 与位置写入；复用已有 workspace revision，不新增业务护栏 |
| `lib/canvas/image-task-controller.ts` | prepare→原 submit adapter→原 job 轮询→结果定位→document merge→undo→原 receipt 清理；单任务失败状态与恢复 | 两个真实 Canvas 函数、其 dock/placeholder 重试均调用同一个 controller |
| `components/canvas/canvas-client.tsx` | 本轮只保留入口用户意图、占位呈现、选择/草稿与 document adapter | 删除两份 submit/poll/placement/receipt 协调代码，没有另建 mega-hook |

主组件 **12,422→12,130 行**，减少 292 行；三个新职责模块分别 94/70/20 行。行数只表示旧实现确实被替换，不作为性能、可维护性或全仓低耦合的独立证明。

## 行为改善

1. **已知 job 只查原 job。** GET 临时失败后的显式重试不再重入 submit adapter，直接查询原 job。基线只是“重新进入 submit adapter”，底层已有 receipt-first，本报告不把它说成已证实重复供应商调用。
2. **同步恢复也补齐交付步骤。** 定位保存或作品读取失败后，重试保留已知 image IDs、用户拖动后的实时落点，再完成定位/merge/undo，不发生成 POST。
3. **空白节点整批撤销。** 旧代码对多张结果只 `pushAddUndo(first)`；现在所有结果进入同一 add-many history，history 只登记一次。
4. **partial 不清原回执。** R2 的 partial 到前端后不再当全成功清掉 session receipt，现有已交付图片仍显示。逐文字请求队列遇 partial 不继续下一笔购买。
5. **工作空间 A→B→A 和卸载失效。** 用已有 revision 加捕获 owner/project/epoch/mount 判断，覆盖 auth await 后的 GET 和位置写入；不向切换后的画布回写。
6. **控件真正使用原恢复。** 原 dock 只根据 failure 改“重试”文案，但仍调用 `generateChild/generatePend`。现在 dock 与 placeholder 共享同一个 retained controller。其他节点完成不清掉当前节点的失败信息或草稿。
7. **不编造退款承诺。** 部分结果提示改为请求/已交付数量，未基于客户端图片数量宣称“未成功部分已退回积分”；账务结果仍由原账务链负责。

`privateFetch` 的计价、原 `submitCanvasImagegen` receipt-first、服务端 plan/执行/余额/幂等均未改动。旧字段/文件名/文件内容/顺序、质量/比例、透明/重构比例、血缘和显式 reference roles 已做逐场景对照。

## 验证

### 完整源码基线 vs 修改后

`scripts/verify-canvas-image-task-refactor.cjs` 从两份实际 Canvas 源码抽取 `runGen/generatePend`，新版同时加载实际 controller/request/scope 模块。仅网络、auth 等 browser/document port 使用本地 fixture。真实 `client-recovery` sessionStorage 合同被执行；不复制 controller 业务。

- 46 场景、176 检查，baseline/modified 均 exit 0。
- baseline 是旧行为的准确复现：`CONTROLLER=DUPLICATED`、已知 job submit adapter 重入 1、partial receipt 清除、blank undo 仅首张、workspace ABA/unmount 继续写。
- modified：共享 controller、已知 job adapter 重入 0、partial receipt 保留、undo 全部结果、workspace ABA/unmount 停止回写。
- `PAYLOADS.log` 逐场景对照 46 组普通字段、文件顺序、文件内容与文件名完全一致。
- 失败场景包含未开始、未知受理、终态失败、待核查、已有结果、GET 异常、保存/读取失败、取消、切项目、卸载；输入覆盖上传底图、多参考 URL、显式角色、透明、重构比例。

### 真实 Next Canvas 控件

复用 `serve-canvas-placement-fixture.cjs`，为其加入可指定端口/缓存目录及缺少的本地图像响应。启动独占 `14345/14346`，实际加载修改后的 Canvas/ReactFlow/图片任务 controller/receipt 客户端；API 返回本地样本，不连接数据库或供应商。

T3 preview `snapshot` 两次原文为 `Preview automation snapshot timed out after 15000ms.`，因此转用仓库已有 Playwright/Edge 方式，独立浏览器，不操作用户普通浏览器。

`scripts/verify-canvas-image-task-browser.mjs` 实测：

- A 未完成时 B 能独立提交；
- A 完成后 B 的选择、正在编辑草稿保留；
- B 位置写失败，点击真实 dock“重试”补载，生成 POST 数保持 2；
- 空白节点完成并显示结果；
- 实际 sessionStorage receipt 在完整交付后清除。

字面结果：`CANVAS_IMAGE_TASK_BROWSER=PASS CHECKS=5 ACTUAL_NEXT_CANVAS=1 TWO_ENTRIES=1 CONCURRENT=2 RETRY_POSTS=0 RECEIPTS_LEFT=0 SUPPLIER=0`，exit 0。

截图 `output/refactor-r3a-20261024/browser/canvas-results.png` 已打开检查。该图是本地控件验收，不是线上生成或生产验收。布局及 renderer 本轮未改变。

### 兼容脚本与质量

- 旧 `verify-canvas-generation-failure.cjs` 作为 CLI adapter 调用当前实际 owner 验证，旧复制闭包 fixture 退休；36→46 场景覆盖原失败集合且补上恢复/作用域反例。
- `verify-canvas-generation-concurrency.mjs`、`verify-canvas-generation-locks.mjs`、`verify-canvas-generation-progress.cjs` 通过。
- 全项目 TypeScript 通过；定向 lint exit 0。Canvas 原有 10 条 hooks dependency warning 在基线和新版一致，新三个模块无 lint warning；没有删除规则或增加 suppress。
- 初次 fixture 缺 `composerReferences`、TypeScript 非独立 discriminant、两处浏览器旧 selector（关闭/placeholder）的失败日志均保留，修正测试/类型后再运行，不把失败记录抹成全绿。
- Next dev 对 tsconfig 的临时目录 include 改写已和原字节比对后恢复；fixture Web/Next、浏览器均结束，两个独占端口监听为 0。

## 回滚与后续

最终四产物：`output/refactor-r3a-20261024/{MODIFIED_FILE.tar,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`，精确命令/输出/退出码/hash、副本回滚与回滚后 baseline 行为以 VERIFICATION 为准。原文件只在独立副本恢复，工作区保留新版；不迁移数据库或重写浏览器历史格式。

R3A 后续直接推进 R3B document/history/persistence owner，再整理 renderer/interaction；详情 A+ 和同步编辑的原任务状态也需要迁移，不把这两个图片入口代表全部 Canvas。R4—R6、整个候选 build、全面浏览器/性能与容量验收继续有效。R2 留存的旧 batch planner fixture 共同失败继续是候选债务，不在本轮默认为已关闭。

本模块为上次 main 整合后的第 2 次功能迭代；开工/提交前 fetch main，任务分支独立推送，不自动合 main 或部署。
