# R7D：Canvas 生成活动生命周期与主线容量修复整合

## 模块与职责

Canvas 的图片、空白节点、详情批次、同步编辑和 Comfy 工作流保留现有任务控制器。`generation-activity.ts` 只拥有界面活动的原子占用、显式重试资格、失败保留和 finally 释放；不负责报价、网络重试、供应商调用、作品文档或账务。页面继续拥有展示数据、选择与布局，生成控制器继续拥有原表单、任务号、结果与回执。

## 调研与实现

- 普通合入 main `c63ceb1392e1918f8ed9ddfee7389ec2d677a4dd` 的 9 个提交，3 个冲突原文与各 stage 均存入本轮 ignored 证据目录。
- X3 业务池与 tick receipt 池共用唯一 `platform/db/pool` 基础设施 owner；`lib/db/connection` 仅重导出。连接配置按一代冻结，drained close 显式回收。现有统一 worker scan 和任务执行归属判断保留。
- X2 心跳、有界恢复、本地截止期、付费前 lease 检查和 token fencing 进入 `image-jobs/runtime`；兼容 durable facade 不恢复旧单体、不重新导入 imagegen orchestration。失租不改成供应商失败，不释放 UNKNOWN 原预占。
- X1 企业 BI 先按授权与廉价键分页，再做大 JSON/账务投影，继续同一授权事务 client。状态过滤需读取 snapshot 的边界保留，不冒充零 TOAST。
- 五个 Canvas 生产入口统一调用 `createCanvasGenerationActivity`；页面不再自行 add/delete 在途集合。原控制器、服务端 HTTP、钱包事务、冻结报价、operation 身份、prompt/reference、历史和用户选择不变。
- 真实旧入口的布局准备异常会留下已占用 key；新入口把同步布局准备放在占用前，异常保持零提交且不遗留 busy key。异步执行和显式重试仍使用同一原 task；失败卡按原规则保留，成功/取消/不保留的结束路径清理本活动展示。

## 公开接口与依赖

`createCanvasGenerationActivity({operations,operationKey,canRetry,execute,clear?}).run()`；`execute` 获得本活动稳定的 `retry` 和本次 `retain`。初次执行仍由既有 task scope 决定 stale/cancelled；重试资格才读取 canRetry。模块无 React/DB/HTTP/供应商依赖，Set 仅供现有 scene/批运行投影只读观察；生产写入归此 owner。没有事件总线、通用 manager、新表、第二套任务状态机或新增产品护栏。

## 集中验证与迁移状态

实现已接入，集中 A/B、主线 PG、相邻入口与类型检查随后执行；本段不提前填写通过。基线为 R7C 封版完整实际字节 `0e9aaf0210511788a37d27ba691dbd5643926b33`，4931 文件已逐个 hash 校对并复制归档。容量专属 verifier 只迁入实际基础设施/任务 owner 的绑定，不更改业务断言。

## 未完成

整体重构仍 ACTIVE，尚未合回 main/部署。Canvas 剩余回调及视图组合、同场景性能/INP/资源容量、实际 remote required CI、最终整合退出仍在总台账。`MEDIA_STATE_WRITE_FAILED` 历史根因保持 OPEN_NOT_REPRODUCED；本轮 fixture 通过不关闭它。10 万活跃用户仍为建设目标。47 HOLD 保持。

## 首轮集中观察

- 实际五入口 A/B：旧 37 场景 115 检查复现 3 个同步准备异常遗留在途 key，新 38 场景 134 检查通过；重试仍复用同一个 task/controller，UNKNOWN 自动重 POST=0。原图片 47/179、详情/同步编辑 74/369、请求/Comfy 39/88 均通过。
- X2 以完整 R7C 原库/运行时作 baseline，真实 PG 旧失租窗口与单次续租失败停止恢复均复现；迁入新 owner 后续租恢复、锁等待和钱包等待越期回滚、子图付费前失租、旧 owner hold/evidence fencing、原 checkpoint 与未知受理保留均通过。真实借出心跳连接断开子进程 exit0，坏连接0，下一续租成功。
- X3 实际 route 在 5 个业务 client 全占时 GET200、业务 waiter0；19 项包含断连、迟到归还、配置冻结、关池和 HTTP UNKNOWN 对账通过。
- X1 真实 PG 45 个等价查询通过；本机样本页投影 billingLoops 362→7，sharedBlocks 9925→876。此为本 fixture 样本，不外推生产容量或 10 万活跃用户。
- 全项目 TypeScript 初次检查 exit0；源码固定后完整 core、完整同镜像运行/产品入口和最终类型/lint另记，不借用 R7C 旧证据。

### 准备失败与证据纠正

旧 task-boundaries fixture 没绑定 R6Q 的实际 creation-request，首次表现为零 POST；已接真实 request adapter、原 billing callbacks 并把 frame/catalog 等现有端口绑定到独立 fixture namespace，防 VM 全局导出覆盖导致递归。未改生产异常提示或放宽业务断言。新 verifier 的 undefined 比较序列化问题已修正。X2 原夹具缺少已拆出的 platform transaction 绑定及 ledger.created_at，补真实列后 baseline/modified 通过。首次 PG readiness 命中临时 bootstrap server 后暂时退出；已对同一自有容器用 SELECT1 核验，未叠加第二容器。

heartbeat-connection 的 baseline 分支原本专测 X2 提交之后/父补丁之前的借出 Client crash；R7C 更早版本走 pool.query，不具有该触发点，所以首次错误选择源后 child timeout 的结果保留为 INVALID_PRE_X2_SOURCE，不将其写成产品故障。原 R7C 失租/续租差异由完整 X2 A/B 覆盖，父补丁真实连接回归只对已整合实现执行。

旧 generation-concurrency 静态脚本先因长期过时的空白匹配断言失败；日志原样保留，不把它冒充新的运行时并发验收。本轮并发、原 task retry、不同节点及 UNKNOWN 由实际五入口的新 verifier 和原 task-boundaries 覆盖。该静态债务另记，未改业务来满足正则。
