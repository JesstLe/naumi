# R7A：模板与工作流导入职责闭合

## 基线与边界

- 独立目录：`E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 切片基线：`51297d8db5a63a9951b0cd3a539cb93d8521b0ec`。
- 相邻主线：`eca93b8b10d51f7debeff3a446e89fe66d35031f`（上一轮已整合 b6b5af3b 之后的 4 提交），随本切片整合，不另启动一轮主线追赶。
- 整体目标持续 ACTIVE；本分支超过 48 小时尚未合回 main，原因是用户要求在独立目录持续交付完整重构版本，对比期间不替换共享主线。此状态不是已上线。
- R6Z 的 `MEDIA_STATE_WRITE_FAILED` 原始 errno/根因仍为 `OPEN_NOT_REPRODUCED`，本切片没有关闭它。

## 模块职责与公共接口

### 模板 / JSON 作品导入

- `canvas/template-imports.ts` 拥有模板查找、冻结创建意图、原操作编号、未知受理恢复、已知 ID 同步与一次历史记录。
- `use-canvas-template-imports.ts` 是 React 生命周期适配。Canvas 只提供已有 document merge、history record 和导航端口。
- `canvas/artwork-import.ts` 拥有 JSON 导入的输入/来源/目标归属以及原子持久化；`/api/artworks/add` 仅解析协议、入口认证与响应映射。multipart 原图上传协议不另造。
- 重复 JSON 导入复用现有 `app_canvas_node_copies`；没有增加第二套任务、历史或 receipt 表。receipt 与作品、位置在一个事务中提交；同 op 内容不一致拒绝，已删除节点不复活。
- `GET /api/artworks/add?operationId=...` 只恢复原回执。未知响应显式重试先读回执；只有确实没有回执时才提交原 body / 原 operation。已知 ID 的同步失败只重读作品。
- 旧调用者可省略 operationId，保留一次性创建兼容；模板新入口始终携带 operationId。

### 工作流导入

- `canvas/workflow-import-contract.ts` 是共享协议；`workflow-import-media.ts` 拥有下载、SVG 惰性化、像素验证/占位。
- `canvas/workflow-import.ts` 拥有导入生命周期及原有原子 receipt。旧 `canvas-workflow-import.ts` 保留实际脚本/调用者需要的兼容导出；新入口不反向依赖该 facade。
- 先用短事务读取已有回执/检查目标；下载、解码、上传不占连接/事务/账号 advisory lock；最终事务重新检查回执胜出者、目标及工作空间，再原子发布所有图片、文字、属性和 manifest。
- 并发准备使用各自随机节点 key；输家只清理自己上传的 key，返回胜出的当前记录。提交 acknowledgement 不明时保留可能已发布字节，不从 catch 中删除胜出结果。
- `GET /api/canvas/workflow-import?operationId=...` 复用原 receipt/current-row 读取：恢复已补图片、已编辑位置/文字/属性，不重建已撤销节点。
- `workflow-imports.ts` 拥有 NDJSON、原身份、取消/重试与流释放；`use-workflow-paste.tsx` 只渲染进度/重试/关闭，不用新 render 的 callback ref 接管旧请求。

### 文档 / 视图 / 历史归属

- 复用 `CanvasDocumentScope`：同账号/工作空间允许项目导航后的文档提交；账号/工作空间 epoch 变化不落入新文档。
- 视图导航另外检查原 scope 与原 modal/gallery 呈现身份；关闭/重开界面不抢回焦点。
- 历史继续由现有 history controller 按目标项目记录；没有新的 undo stack。
- 工作流文档提交可在离开项目后完成，导航、提示与 fitView 仅属于仍有效的原视图。延迟 React updater 也检查 documentCurrent。

## 相邻主线整合

- 重生成进度落入 `scene-projection.ts` 和真实 `nodes/artwork-node.tsx`，保留原几何、连线与图像。
- 拒绝 NAS 流的取消/释放落入 `object-storage/managed-read.ts`、`media/response.ts`；`storage.ts` 和 media route 继续是薄兼容入口。
- 保留缓存 decoded-reference handoff 及工作台大结果单次读取。main 原测试的 managed-read 查找改为识别实际 owner，仍执行原 socket/大结果断言，不跳过案例。
- 三处合并冲突的 1/2/3 stages 保留在 `output/refactor-r7a-20261028/merge-stages/`。

## 固定源码集中验证

固定测试源码 `b3dc22e7e1c79e9e3828aa8a11cbd8434bdf660b`，完整源 digest `d86de39c325d8d3caeab0010304ae7e86b3ef4c100fe762adc4dd80c4a989e32`。之后只补文档，不替换实际产品字节。

- 43 个受影响入口全部实际执行通过，exit 0，**不是完整 core 96 入口重跑**；复用已有 runner，不另建测试框架。原报告的 scoped `PARTIAL` 表示非完整 core，不是某个案例未执行。报告：`output/refactor-r7a-20261028/focused-final/REPORT.json`。
- 旧实际 JSON handler / PG：31 检查复现重复创建、媒体准备占有账号锁；旧客户端两实际函数的 2 组 / 5 检查复现迟到导航及跨工作空间提交。
- 新实际 JSON / NDJSON handler / PG：63 检查；原 ID、同 op 并发、原回执 GET、当前行读回、源/目标归属、目标中途删除、取消、准备失败、SQL 原子回滚、并发首份发布胜出和输家文件清理均通过；61/100/200 素材可导入；账本不变、供应商/外部调用 0。
- 实际两个客户端 owner + 真实 document scope：14 组 / 50 检查；包含 auth 前后工作空间切换、账号切换、同项目 modal 变更、已知 ID 只读取、未知结果先读原回执、确无回执时同原 body / operation、无换号自动重提、NDJSON 无末尾换行及取消后的迟到完成。
- 原 history 67 组 / 184 检查、node operations 真实 HTTP/PG 32、交付续交 73、原位重生成/图片版本/原参数/价格与账务等直接受影响链路通过。
- 相邻主线：真实 socket 13 检查通过；实际 PG/HTTP 23,079,275 B 图片工作台单次读取 9 检查；真实 React、HTTP、IndexedDB、Edge 解码预览 17 检查通过。它们不是完整 Canvas 产品浏览器验收。
- 全项目 `tsc --noEmit --incremental false` exit 0；`next lint` exit 0、现有整体 38 条 warning 保留（含本次 manifest effect 的 scope 依赖提示，业务已按 documentCurrent / actor-workspace 捕获；后续 manifests owner 收敛时一起清理，不用禁用规则掩盖）。四类 SCC 均 0。
- 新两项 verifier 接入同一 refactor required catalog，catalog 从 94 到 96；配置接入不等于 GitHub 已实际强制放行。

保留所有失败/准备记录：初次 tsc 重复声明/类型导入错误已修正；Windows tar 非 ASCII 路径提取失败改为 Python 读取原 archive；客户端 fixture 初次缺 atob，只有六组日志但 exit 0，明确记为 INCOMPLETE，补齐 Web API 和未结束 watchdog 后完整通过；集中 runner 的最初导入路径错误保留为 setup failure。

第一轮固定源码集中回归 27 通过后在锁测量断言停止，原报告与 exit 1 完整保留。旧探针用 `pg_try_advisory_xact_lock`，四路 prepare 的探针自身会互相竞争，测量有污染；现在只读 `pg_locks` 的同一 64-bit advisory key，不改变被测锁状态。修改仅是 verifier，不改产品实现；最终 43 个入口从头实际执行通过，没有把旧失败重写为通过。

最终四产物、字节级 patch 应用、完整独立副本回滚及 later-edit guard 见 `output/refactor-r7a-20261028/DELIVERY.json` / `VERIFICATION.txt`；实际工作树保留重构版，不回滚本目录。

## 未完成项

- workflow placeholder fill 自身的媒体处理事务仍沿既有实现，本次只闭合整批导入；后续原生节点 lifecycle 切片再处理对应变化传播。
- 全应用固定候选、完整性能/INP/容量、远端 required CI 的实际强制证据、最终主线整合与整体退出仍未完成。
- 不把局部 PG/浏览器组件 fixture 写成线上实测或 10 万活跃容量已达成；本轮没有供应商付费调用和生产发布，47 HOLD 保持。
