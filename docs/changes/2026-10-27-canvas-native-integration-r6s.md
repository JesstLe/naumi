# R6S：原生导演节点整合与 Canvas 视频提交编排

## 来源与目标

独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。原树 `95e08bd11520a51a0cc49791c60721f55fa397dc` 的 4671 文件及原始字节 SHA256 已完整保存并回读。主线来源固定 `2fb3e8d95232db31ac649ba372e1b732e885597c`，8 个增量提交、34 个变化路径，普通 merge 整合。

<span style="color:red">本独立分支超过 48 小时保留是用户明确要求持续整体重构；本轮不合 main、不部署、不接发布锁。</span>

## 职责与依赖

- 保留主线原生导演编辑、Three.js/WebM 编码、原节点工程与输出能力，不用主线旧 Canvas/db 单体覆盖本树。导演节点 schema 归原 canvas storage-schema，由既有 application persistence 组装；repository 保留原 SQL/事务/图锁/CAS，改为依赖实际 pool、snapshot-value、作品和创作权限 owner。
- 导演展示归 scene projection 与稳定 renderer registry；项目归 project-catalog；历史合同/命令归 history-contract/model/controller；复制、删除和项目删除归原 node operations。保留图片／文字 CAS、原回执、共享事务与混合 undo，不复制另一套 inline 逻辑。
- 导演背景连线和输出作为后续输入的转换归原 link command。剪贴板继续原身份/工作空间合同，拖动继续原单 gesture/history owner。
- `video/canvas-draft` 是编辑器与应用共用的已保存节点 draft 合同；`video/canvas-submission` 只编排单任务 receipt 查询、持久化后提交、batch 分流与刷新，不拥有节点、任务、账务或轮询状态。Canvas 保留文档 save/undo 和界面组装；batch/receipt 的原 storage key、原 body、原报价与 idempotency 保持。
- 每次视频提交使用既有视图 epoch/workspace 身份；异步保存后不继续在另一视图提交，受理后即便切走也保存原 task receipt，只停止过期视图刷新。成功 HTTP 响应缺少真实 task ID 时保留原 operation，避免把 `undefined` 当任务编号保存。

## 实施状态与验收

六个冲突路径共 27 个冲突块按 owner 解决，主线正常合入的原函数与新渲染模块保留。原完整树和中间冲突文本保存于 `output/refactor-r6s-20261027`；首次归档观察器未使用 `git ls-files -z`，遇到中文路径失败，原 partial tar 保留，修正后完整 4671 文件回读通过，没有修改产品处理该错误。

实现已进入集中验证阶段。新增原/新视频编排对照覆盖单任务/BYOC/批次、报价与 revision 回调、原 task 查询、预检拒绝/未知响应、原 body 复用、迟到受理回执及过期视图；导演采用主线规则、真实 WebGL 和完整应用 PG/媒体/后续视频测试，在本树重新运行，不引用主线留存 PASS 冒充本次通过。

最终固定源码、core、真实应用、完整 Linux 包、四产物、独立副本回滚与 Git/清理结果随实际运行补录。整体项目目标保持 active。
