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

## 集中验证（待最终固定源码封版）

目前已观察到：baseline 实际 handler/PG 31 检查复现重复创建和媒体事务占用；新实际 handler/PG 63 检查通过，覆盖并发胜出、取消、准备/SQL 故障、目标中途删除、原回执、账本不变、61/100/200 素材。客户端实际 owner/document-scope 的初次完整 12 组/45 检查通过；随后增加模板原回执 GET 和 modal 视图案例，将在固定源码统一复测。

保留尝试记录：端口整合初次 tsc 的重复声明/类型导入错误已经修正；Windows tar 非 ASCII 路径提取失败改为 Python 读取原 archive；客户端 fixture 初次缺 atob，只有六组日志但 exit 0，明确记为 INCOMPLETE，未作为通过。fixture 已补实际 Web API 和未结束 watchdog，不以 exit 0 代替完成标记。

## 未完成项

- 此切片最终集中回归、类型/lint、架构图及独立副本回滚材料待封版。
- workflow placeholder fill 自身的媒体处理事务仍沿既有实现，本次只闭合整批导入；后续原生节点 lifecycle 切片再处理对应变化传播。
- 全应用固定候选、完整性能/INP/容量、远端 required CI 的实际强制证据、最终主线整合与整体退出仍未完成。
- 不把局部 PG/浏览器组件 fixture 写成线上实测或 10 万活跃容量已达成；本轮没有供应商付费调用和生产发布，47 HOLD 保持。
