# 2026-10-20 最新分支集中整合

## 范围与基线

用户要求“拉取最新分支并合并”。仅同步与合并源码，不启动构建发布、连接服务器、迁移数据库或调整在线配置。

- 共享目录 `E:/workspace/naumi` 开工为 `codex/admin-model-mvp` / `3bb3c6ff`，仅有5个未跟踪浏览器日志/快照；保留这些文件和原分支名。
- 复用本会话干净的独立工作副本，在 `codex/branch-integration-20261020` 整合；原 HEAD 为 `1f72984c`。
- `git fetch origin --prune` 后主线为 `3f940b8618797ddf8a9eddf908b47896f48f2a72`；先快进主线，再整合同事独立分支。不强推、不自动stash、不覆盖未提交内容。

## 已整合的13条分支

| 分支（均为 codex/ 前缀） | 本次核对提交 |
| --- | --- |
| image-routing-reliability-20261020 | 8f5716c8 |
| assistant-live-feedback-20261020 | d64494d4 |
| multi-reference-frame-20261020 | b0e74179 |
| kejun-image-failure-20261020 | c3fa3a5a |
| agent-chat-attachments-20261020 | e899be55 |
| browser-reference-upload-20261020 | 6ddfcb6e |
| enterprise-workflow-foundation-20261016 | 3f041b92 |
| nas47-tunnel-20261020 | 494ae077 |
| nas47-cutover-20261020 | f511a5ce |
| apib-seedream-publication47-20261020 | 166977f3 |
| release103-staged-20261020 | 9a261d83 |
| release103-resolution-20261020 | d8803b56 |
| nas-storage-s3first-20261020 | d2ba45fc |

部分分支互相包含；按祖先关系整合，不重复实现。四条历史 rollback-compat 分支继续排除。合并源码不代表企业独立线上服务、NAS接入、历史媒体迁移或发布生命周期债务已完成，具体边界沿用各模块交接。

## 冲突处理

- 助手面板同时保留图片追加/删除入口和真实活动状态；CanvasClient同时传递附件、上传状态与 `assistantActivity`。
- 上传批次保留已导入节点同步进度，同时保留会话切换检查，避免切换后将图片附到错误对话。
- 图像提交器同时保留原任务回执追踪、混合比例的显式画幅选择、浏览器有界参考图适配。预算按本次实际文件数分摊；画幅由适配前原图尺寸决定，不以缩小后的传输尺寸覆盖用户构图。
- 不同画幅取消/账号项目切换时不生成新任务；已有回执继续原ID，不增加付费POST。
- 更新合并涉及的测试合同：助手真实提交函数fixture增加附件上下文和独立媒体读取边界；多图测试使用真实原始文件尺寸，故意令上传接口回传正方形尺寸，以确认构图不会被传输尺寸覆盖。

## 集中验证

- 本工作副本依赖陈旧，初次类型检查发现缺少新主线的 `three` / `@types/three`；按现有锁文件执行 `npm ci --ignore-scripts --no-audit --no-fund`，再执行框架既有 `patch-next-body.mjs`，不改依赖声明或锁文件。
- 完整 `tsc --noEmit --incremental false` 通过。
- 助手图片追加合同34项、实时反馈29项、参考图计划70项、多图画幅46项，以及画布上传位置/聚焦回归通过。
- 实时反馈首轮fixture缺少新附件上下文及媒体读取边界，已补齐；画幅脚本需要通过 `NODE_OPTIONS=--conditions=react-server` 运行。错误记录不冒充产品通过，修正后上述脚本全部通过。
- 多图验收覆盖原图共同比例、混合比例选择、显式比例、取消、会话切换、非法选择及恢复不重复提交；外部供应商调用0。
- `git diff --check` 及最终分支祖先覆盖检查用于核对合并结果。没有重复运行同事完整数据库/浏览器/服务器验收，没有执行生产构建或发布。

## 收尾

提交前再次刷新远端主线，普通推送整合分支和 main；随后仅在共享目录满足可快进且无已跟踪修改时执行 `git merge --ff-only origin/main`，保留未跟踪浏览器文件。同步结果以最终Git回执为准。

本轮无新增功能模块，功能迭代同步计数归零；未增加成功发布次数或占用部署锁。
