# R6X：主线原生音频与既有模块 owner 整合

## 固定输入与状态

- 工作区：`E:/Workspace/naumi-refactor-20261024`；分支 `codex/core-refactor-20261024`。
- 重构基线 `840a81b4ddd531f600ba885db3b4a27648d5d0e2`。
- 本轮固定 main 输入 `4345de529e7ca46b29207f93dbb85034044affd1`，27 commits / 74 paths。
- 4770 个原始文件已归档并记录 SHA；证据在 `output/refactor-r6x-20261028/`。
- 当前为合并整合，尚未提交；不合 main、不部署。整体重构目标继续，47 HOLD 不变。

## 模块、接口和状态归属

1. `audio/project` 维护纯音频工程、编辑和媒体任务配方；`canvas/audio-actions` 维护创建/编辑/上传/渲染/采用的浏览器用例。Canvas 只组装 scope、节点 store、history、素材和原媒体任务 ports，不重新持有音频渲染尝试或采用集合。
2. `use-audio-nodes` 负责 React 订阅、节点读取和 CAS 请求；`useAudioResultAdoption` 仅调度实际 action owner，不另写自动采用业务规则。账号/工作空间与视图 epoch 复用 `CanvasDocumentScope`。
3. 音频历史、移动、连线、选择、复制、删除和 settings 进入原 history/node-operations/scene-projection；不新增平行历史或任务引擎。回执和 UNKNOWN 保留原 operation。
4. 音频 schema 由 `canvas/storage-schema` 唯一拥有，`application/persistence` 显式启动。音频 repository 使用平台 pool、叶子快照合同，依赖不回流 db 大出口。
5. 素材/媒体证据读取在事务内使用原 tx；音频节点、graph lock、素材访问和 history 写入保持同一事务。
6. 主线 initialize-only 坐标进入原 artwork writer，复用其锁和原写入约束；删除没有调用方的平行 placement SQL owner。
7. 自动比例报价进入纯 `freezeBusinessQuoteForModel` / quotation owner，原 accepted/frozen 报价不重算。APIMart 异步 response format 与净化错误证据保留主线修复。
8. 多轨仅整合主线已完成的纯工程、预览与 FFmpeg 配方；未完成节点/API/editor 保持禁用，不以整合冒充功能完成。

## 本轮实现记录

- 13 处 merge 冲突的原始 stage1/2/3 已留存；正文按各既有 owner 迁移。
- 初次准备正则误截的输出在测试前发现，已从原索引重建，记录为 INVALIDATED；未作为验证输入。
- 补齐音频的 history refresh、复制/删除接收、纯音频项目、深链、选择、拖动、剪贴板、settings 和空项目判断。
- 自动采用读取 flush 后节点并使用 expectedRevision，避免用旧编辑字段搭配新 revision 覆盖；自动采用同时比较来源和编辑。
- 成功写入后的历史可归入原 document；当前视图效果仍受 scope guard 控制。

## 验证状态

本轮已执行的定向检查（完整固定候选仍待 core/image/runtime/browser）：

- TypeScript 初次发现两个 Canvas 接线遗漏，已修复；整合后 `tsc --noEmit --incremental false` exit 0。
- audio owner 18 组 / 67 检查；graph/history/node/actions 实际模块，UNKNOWN render 保持同 operation，采用 CAS，创建双击收敛。
- position 真实 handler、原 writer、完整 PG schema/native auth：旧版 8 组 / 25 检查复现 initialize 覆盖；新版同 8 组 / 25 检查保留原坐标，包括并发手动移动、部分坐标和隐藏作品。
- persistence 三阶段 36 检查，显式 startup owners=42，热态 owner DDL=0；原报价、钱包预占、UNKNOWN 和待执行任务保留，付费重放 0。
- 自动报价 7 组、APIMart 8 组、结果采用 6 组、历史 67/184、Canvas 原 task caller 47/179、node operations PG 32 检查通过。
- 原生音频纯规则 53、多轨纯规则/真实 FFmpeg 74 检查通过；多轨 UI 未启用。
- React/Edge 真 DOM + 实际 document/task/result/receipt owner 的延期 view 场景通过：原任务 receipt 收尾，不丢另一节点草稿/焦点。
- lint exit 0，保留既有 warnings；四类源码/擦除后 SCC 集合已归零，lib→app 两个 fixture、lib→UI 一个 toast 历史边单列。
- 架构扫描确实发现新 audio-references 经 db facade 带回 6 文件动态 SCC；已改用平台 pool / creation-access，未以 dynamic import 掩盖循环。

初始 verifier 的模板括号、esbuild sync/plugins、billingFailure 与 history 音频 port 遗漏均为测试准备错误，原日志保存在 MODULE_INITIAL，修正后分别通过；两次扫描前的索引遗漏保留原日志。旧 R6W 的 73/125/37 不作为本轮数字。

## 未完成项

集中修正受影响 verifier 的真实 owner 消费、42 schema-owner 启动矩阵、原生音频/报价/结果位置/多轨验证；完成 merge 索引、固定候选、正式镜像与 runtime/browser、全局四产物/副本回滚及远端 SHA。完整项目的退出台账、required CI 与性能证据仍继续。

**长分支说明：** 本重构分支超过 48 小时仍保留，是持续整体重构专线，用户要求独立完整重构版本；本轮不将它合 main 或部署。主线增量按固定 SHA 普通整合，整体退出审计另行记录。
