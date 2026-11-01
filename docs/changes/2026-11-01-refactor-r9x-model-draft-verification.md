# R9X：发布草稿的两种冲突验收

## 实际反例

R9V 的 b24 Image 在 Registered model execution and private control-plane regressions 步骤实际失败。原 blob 日志返回 EOF，因此不认定远端唯一 child 根因。以完整 b24 源码在独立 PG 重跑原顺序，coverage/config/publication/admin 通过，第五项 execution 在第 209 行失败：期待 PUBLISH_STALE_DRAFT_BASE，实际 DRAFT_CONFLICT。完整 02ff7975 基线同命令也复现 exit1。

R9V 已正确推进发布者本人未修改草稿的 basedOnVersion 和 revision。旧脚本却继续拿该发布者发布前的 revision 作为“陈旧基线草稿”输入，先触发了旧页面 CAS 拒绝。两种拒绝保护都应该验证，不应为旧断言通过而停止更新 revision 或放宽 CAS。

## 实现与职责

仅修改 verify-model-execution.ts 的夹具与对应断言：

- 在首次发布前创建另一管理员未发布的草稿，保留真实旧 basedOnVersion；后续按其有效 revision 提交，继续严格要求 PUBLISH_STALE_DRAFT_BASE。
- 发布者本人的旧页面仍使用原 saved revision，另行严格要求 DRAFT_CONFLICT。
- 原图片/文字/Agent/视频、旧凭据、别名、任务归属、冻结报价、供应请求数和回执恢复断言保留。没有把失败错误码改成任意二选一，没有跳过测试。
- 产品源码 2149 文件全部与 02ff7975 raw-identical；包含 R9W 首次 paid checkpoint 修复，不更改服务端发布策略。

## 集中验证与交付

原顺序 11 命令单次全部 exit0：coverage、config、publication、admin、execution、tools、router-contract、performance、review、flow、shared-capacity。真实 PG/回环供应，Node→固定 Go Router wire 和共享账户 slot 实际执行；不等于外部付费质量或生产负载验收。

基线失败、修改后完整顺序、原业务断言 AST 对照、类型输入、四件产物、完整副本恢复原 5381 hash 及旧失败行为，以 output/refactor-r9x-20261101/VERIFICATION.txt 和 DELIVERY.json 为准。R9W 的五类首写断点和原/新账务日志仍归 R9W，不改写旧报告。

完整目录仍为 223 项；本轮未在本机重跑整个目录。新固定头的实际 CI、main 普通整合及其余九类故障退出仍需逐项验收。整体 ACTIVE，main 未合、部署 0、47 HOLD。
