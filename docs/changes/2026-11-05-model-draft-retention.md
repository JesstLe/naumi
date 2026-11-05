# P2-2 模型管理操作草稿清理（2026-11-05）

依据：[管理后台评估](../design/admin-architecture-review-20261105.md) A1。基线 main `f3a67db2`。

## 问题

模型管理页每执行一次操作，都会以 `<管理员>#mvp:<操作编号>:<指纹>` 为 actor 创建一份专用草稿。整份配置会写入 10 张草稿子表，而且之后从不删除。103 已经发布到 v117，积压的草稿副本随操作次数线性增长。

## 核实

- 操作发布成功（applied）之后，同一操作编号的重放读取的是发布回执（`app_model_publications`），归属校验读取的是不可变版本里的 actor（`app_model_config_versions`），都不会再读这份草稿（`management-access.ts` 中 receipt 分支和 `publicationResponse`）。
- 结果为 staged、unknown 或 failed 的操作，恢复时需要草稿；普通管理员草稿（完整配置中心使用）与此无关。

## 本次实现

- 新增 `model-config/draft-retention.ts` 的 `pruneAppliedOperationDrafts(pool, limit=25, minAgeSeconds=600)`：
  - 只删除"按 actor 能解析出操作编号，且该操作已发布成功"的专用草稿；子表随之级联删除。
  - 10 分钟保护期，给刚完成的发布留出余量。
  - 使用 `FOR UPDATE SKIP LOCKED`，避开正在使用的行。
- 模型管理页每次操作发布成功后，顺带清理最多 25 份；失败不影响本次结果。103 上的积压会随日常操作逐步清完，**不新建定时任务**。

## 验证（隔离 schema；零外网、零供应商调用）

- 新增 `npm run verify:model-draft-retention`：13 项通过。
  - 删除：已发布成功的旧草稿及其子表行被删除；单次调用受数量上限约束；重复执行不会多删。
  - 保留：结果未知的、没有发布记录的、刚发布成功的、普通管理员的草稿都保留；激活版本不变。
- 回归通过：model-management（重放、恢复、跨操作冲突）、model-publication（含 RESTORE_PRESERVES_DRAFT）、model-config、model-batch、model-admin、image-parameter-plan-pg，以及 `verify-model-management-ui`（整页浏览器，含 CROSS_ROUTE_OPERATION_REPLAY、LEGACY_PENDING_RECOVERY）；tsc、eslint。
- 说明：回归中的草稿都在保护期内，所以"先清理、再重放"这一顺序是通过上面的代码核实保证的，没有被这些回归直接覆盖。
- 证据层级：隔离库；**未发布**。103 上的实际清理量要等发布后才能核对。

## 交接

```text
模块与职责：model-config 草稿生命周期（专用操作草稿的保留规则）。
公共接口、依赖方向、数据/状态/事务归属：pruneAppliedOperationDrafts(pool, limit, minAgeSeconds)；只删 app_model_drafts（子表级联）；不改版本、发布记录与计费。
本次实现与迁移状态：完成；无 schema 变更。
验证命令、结果及证据层级：见上；未发布。
未完成项与下一步：发布后核对 103 草稿数量下降；P2 拆分 management-access、统一接口守卫。
```
