# R9Q：历史供应商兜底与逐图检查点的兼容边界

## 模块与职责

继续整体重构的 Image 放行链，基线 `8980b12275563d7a967f0396f3965027fce191ff`。独立工作树 `E:/Workspace/naumi-refactor-20261024`、分支 `codex/core-refactor-20261024`；不操作共享 C 盘工作树。整体 ACTIVE，47 HOLD。

- `generation-provider.ts` 集中已经受理的历史 BYOK 请求的质量拒绝/平台兜底策略；新 BYOK 入口仍保持退役，不重新开放。
- `generation-runtime.ts` 只编排同一任务、同一原报价的执行、交付与结算。
- `image-gateway.ts` 产生原图与兜底尝试的不同子身份；`image-jobs/runtime.ts` 继续拥有租约、检查点写入与拒绝证据。供应商策略不直接修改检查点或数据库。
- 同一个顶层 paid operation 下使用 `:image:<n>` 与 `:image:<n>:provider-fallback`。不添加第二个顶层 root，避免 delivery checkpoint 聚合重复图片，不建立平行任务引擎。

## 实际复现与实现

原 `credit-billing` 的 partial fixture 持有第一个请求，却等待排在它后面的第二个请求，实际20秒超时。改为观察真实第一请求到达、核对原预占，再切换 metering 并释放；不延长 timeout，不删除原价/账务断言。

新 BYOK 创建应返回409 / `USER_IMAGE_PROVIDER_DISABLED`、供应0；历史兼容 fixture 改用真实加密 owner envelope、完整输入与实际原始零价合同。该 fixture 在未修改产品的基线上实际复现 `image-index-original-rejection`、`error != done` / exit1。

根因是旧 BYOK 原尝试的逐图拒绝已经持久化，平台兜底却复用原子身份。现将兜底限定为同 root 下的独立子尝试；只有冻结数量对应的全部原子均明确400质量拒绝，才允许创建兜底尝试。保存有界 `failureReason=quality-unsupported`，不保存供应商原始错误内容；重启时重建相同分类，继续读取已保存的兜底子结果。

原通道任一 UNKNOWN、普通拒绝或成功图片都不授权整批换通道；fallback 自身结果未知也不重新 POST。用户未取得图片时的终止/预占释放与供应商未知/成本待核对继续分开，未恢复旧用户等待护栏。

## 验证与未完成

集中验证结果与字面命令统一写入 `output/refactor-r9q-20261101/VERIFICATION.txt`。新增完整真实租约的断点已经通过：兜底 child 已保存原字节，在 root result 写入前注入 lease-lost，随后新 Worker 读取同 child 完成交付，原字节一致、额外供应POST0、一个 root、原报价和一次结算。

保留原所有 tariff/分辨率、partial、降档、审计、隐私、meter-off 检查；增加多图、混合400+UNKNOWN、质量拒绝+普通拒绝及平台 UNKNOWN 的负例。最终原顺序 `image-gateway → credit-billing → global-image-quality → private-bi → bi-management → admin-access → single-product` 单次fail-fast实际7/7 PASS、exit0；credit单项37场景、实际拦截的非loopback transport次数0。全部fixture连接/自有PG与HTTP清理通过。全项目非增量TypeScript及五个受影响TS文件lint实际exit0；编译器输入及四配置逐字节绑定。CI always artifact 增加只含安全JSON的 credit evidence，失败不再只有一个红色作业状态。

首轮新断点验收真实失败exit1：新Worker在旧租约刚释放时立即kick，正常10秒恢复cooldown尚未到期，因此空claim后等待超时。只修测试为只读观察原cooldown到期再显式kick，不清空lease、不POST循环、不增加timeout；保留原失败记录。定向完整credit exit0后，最终固定脚本在上述七条完整顺序中再次实际通过。副本回滚、原始5361 raw hashes恢复、baseline fixture投影对照与最终source以本轮四产物实际记录为准。

完整 Image CI、最新 main 整合和整体退出要求仍分别验收；不以当前模块通过代表整站或10万活跃容量已通过。没有外部供应商、SSH、生产或部署锁操作。

**分支已超过48小时：当前延迟原因是同一PR的完整有效CI及最终main整合尚未闭合。** 不以普通push代替最终成果；下一应用职责优先旧生成页submit/poll/result投影（F02），随后首页列表/上传（F01）与后台发布恢复（F03），不再机械拆行。
