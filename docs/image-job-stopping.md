# 图片任务停止等待与预占释放

## 2026-10-08 修复

- 不改默认 TDH 供应商、实际模型、模型配置版本、积分价格与媒体存储。
- 同步直连生图发生未知结果且没有可安全重放契约时，业务结束等待，不重新生成；未交付且没有已保存的成功阶段结果的任务，事务化释放它自己尚存的积分预占。
- 客户侧失败与供应商费用未知分开：原 paidOperations、supplier_calls、原报价和冻结模型版本不删除；供应商成本仍待确认，不记零。
- 有已保存的部分成功结果，或已完成扣费的任务，保护结果和扣费，进入停止加载的核对状态；不直接退款或重生成。
- 真正可重放的 Router/APIMart 任务继续使用原任务身份恢复。超分阶段保持原恢复机制。
- 工具箱、画布和 Agent 共用生成接口；内部 needs_attention 对轮询返回 error，自动恢复列表不再包含暂停任务。
- 原生旧快照不会直接重提；未交付任务释放预占。worker启动异常同样落入明确终止/核对状态。
- 原生生图页面30分钟超时清除本页任务缓存，避免刷新重入同一加载循环。

## 数据与接口

无需 DDL 迁移。任务 snapshot 增加 failureCode、customerBilling、supplierCostStatus、creditsReleased、stoppedAt；复用账务 reconciliation 保存客户释放证据，result.state=unknown明确供应商结果未知。

生成/套图/A+查询接口继续使用兼容的 done/error/pending 协议；needs_attention转为error并保留后台实际状态。非本人访问仍403。

## 测试

`scripts/verify-image-job-stopping.ts` 使用独立本地PostgreSQL和HTTP mock，覆盖断连、重复关闭并发、预占隔离、旧任务、租约保护、部分成功、可恢复路由、真实route调用、未授权访问、正常出图和已扣费保护。不得使用生产生成POST代替模拟测试。

## 发布与回滚

使用固定版本镜像与scripts/deploy-release.sh，发布前备份配置和数据库，记录卡住任务ID。由新版worker处理原直连未知任务，发布后逐笔核验业务error、billing released、reservation不存在、原供应商未知证据仍在。回滚只恢复代码，不把已经释放的预占重新扣回、不删除任何原调用证据。构建及线上验收结果保存在output/image-pending-release-20261008/VERIFICATION.txt。

## 尚未变更

此次不调整数据库DNS配置；DNS历史错误已有证据但不足以归因每笔故障。此次不增加真实收费测试，不并入独立定价微服务。
