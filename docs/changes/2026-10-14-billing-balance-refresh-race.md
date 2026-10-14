# 余额镜像刷新并发修复

画布视频最终保护审查取得GitHub连接器的实际CI日志：3da1b28的Image gateway run 38521699230、job 115712641091在verify-billing-review.ts的混合旧新结算断言失败，余额镜像90、预期89。CLI此前下载日志EOF不是测试通过，也不是实际失败原因。

根因在db.refreshBalance：先读活批次本金，再单独更新app_users.credits_total。第二条语句等待账号锁期间，另一结算可以提交新本金；旧刷新随后用旧值覆盖镜像。新增balance-refresh用例实际持有账号行锁，让读取等待，再在持锁事务内把本金/镜像从100改成99。旧实现稳定得到100，失败日志保留在checkpoint-d/balance-refresh-before-fix.log。

修复使刷新先取得账号行锁，再用后续语句的新快照计算并更新余额镜像，在同一事务中返回结果。保留原批次过期处理、预留积分、计费价格、扣退费规则、流水和历史任务，不修改数据库结构。

本机独立新建fixture数据库运行完整verify-billing-all的18组检查，65099 exit0；确定性balance-refresh、原混合结算recovery、资金不足保留结果、恢复结算、退款/重放/冻结及原画布检查通过，性能检查无错误。不可把Windows本机通过当作Linux CI整体通过；修复提交后仍需读取实际新run终态。证据checkpoint-d/billing-all-wallet-refresh.log及ci-38521699230-diagnostic.json。没有连接103或发布。

另取得95b43c5的旧CI run 38508694570、job 115671986162日志：Billing admin browser acceptance保留“登录并生成”及未加载价格输入。启动脚本直接运行standalone，却未复制客户端static/public资源。按[Next.js官方standalone说明](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)，补复制，并在开始浏览器测试前实际请求一个构建JS资源；缺构建时在创建数据库schema前拒绝。该缺口与日志表现一致，属于待CI验证的原因判断，当前未声称完整管理浏览器回归已通过。业务断言、鉴权及报价检查保持。
