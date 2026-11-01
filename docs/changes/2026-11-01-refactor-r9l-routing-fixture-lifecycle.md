# R9L：业务路由验证的发布与失败清理职责

## 基线与实际失败

基线7a7e0176，5354个原始文件已冻结。旧Image在business-routing阶段等满1小时取消；本轮直接运行原完整脚本，只读观察真实接口/PG，未改变返回、时钟、重试或限流。

原脚本在约1.8秒已尝试第二次发布并ROLLBACK，随后PG池关闭、随机schema删除。进程仍保留自有fixture的一对loopback HTTP连接：finally等待server.close，但上游响应被它自己的release闸门扣住。确认该状态和进程身份后停止自有fixture，原非通过退出及清理记录保留；不是因观察超时就宣称任务已结束或重新提交。

只改测试清理顺序的诊断副本释放/等待原pending请求后，真实错误立即返回：PUBLISH_STALE_DRAFT_BASE409，草稿基于v1、当前v2。原apply复用同一操作者草稿，第一次发布后其base仍为v1。失败清理又遮住该异常，构成完整本地复现链。未取得旧GitHub内部完整栈，不把本地栈冒充远端已下载证据。

## 实现与归属

- 每个合成发布是一次新编辑，使用基于当前版本的新fixture actor/draft；第一actor保留，原草稿持久化断言不变。显式断言basedOnVersion等于current，不传acceptStaleBase、不删除/改写旧草稿。
- 原上游等待与提交终态竞赛；若请求在上游到达前已返回，输出原HTTP状态/响应诊断，不永远等started，不换操作号重提。
- verifier拥有其阻塞闸门和原pending请求：finally先release并await原请求，再关闭PG/HTTP和删除自己创建的临时目录；不取消真实后台或付费任务。
- 两个fixture-only失败开关分别触发上游已到达后的异常、以及移除单个测试请求cookie导致实际401。独立验证入口运行真实脚本/PG/HTTP，保留预期child exit1，核对pending供应请求分别为1和0、清理完整。
- 新失败生命周期入口加入同源core目录及独立证据端口；目录219项不等于已执行通过。Image原正常业务命令保留。

## 保持与未完成

产品源码、管理员stale-draft/CAS、客户冻结50积分与usage1积分、原operation/未知不重放/实际结算/成本/回退及后处理断言保持。全部原业务断言逐项核对，不为旧测试恢复用户定价重复确认，也不放宽生产限流或CI时长。

原/新集中执行、故障终态、类型和副本回滚的命令、输入、literal及exit归output/refactor-r9l-20261101的VERIFICATION/DELIVERY。完整219新head CI、main普通整合与首页剩余SSE owner继续分别验收；整体ACTIVE、未部署、47HOLD。
