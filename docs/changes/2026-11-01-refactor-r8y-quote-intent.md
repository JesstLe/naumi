# R8Y：报价意图保存与原预览读取归属

## 基线与已复现问题

基线 `4d8a1160d28a28f93cfea78a2263407dcd26f20c`，完整5329个原始文件/hash/tar在 `output/refactor-r8y-20261031`。首个真实隔离PG基线复现：同一owner/operation/输入/作用域8个并发预览，产生8行报价及两种售价；实际原报价预览HTTP入口加载同一行3次。baseline31检查通过只是复现，不是正常业务验收。

诊断中的账号/权限/项目读取并非全都可删：归属插入前后核对仍有时序意义，本轮保留。没有将上一轮UI负载下prepare尾延迟+17.98%擅认成这些读取的根因。

## 模块职责与公共接口

- `imagegen/quotes.ts`唯一拥有报价保存、原合同读取、完整性/当前权限及素材检查、公开报价投影。新增`readOriginalImagegenQuote`让plan route只解析/鉴权、优先复用原报价，缺失才进current planner；读取或授权错误不回退重报价。
- `imagegen/operation-id.ts`作为现有持久身份叶模块，为**新报价**派生owner/operation/fingerprint/scope绑定的opaque UUID，复用原hash-UUID算法；原`imagegenStepId`正文和历史子任务ID不改。
- 新报价用已有主键与`ON CONFLICT(id) DO NOTHING`选择并发胜出合同；冲突读取并校验完整原行，而不是更新价格/plan。现有随机quote ID仍优先读取，历史重复行不删除、不改写；显式旧quote引用继续按原合同恢复。
- 计划与私有完整BillingQuote在首次await前clone，调用者后续对象变更不改变本次冻结内容。内存路径同步check/insert，同一意图也只产生一个新报价ID。
- 无新增schema、事务、advisory lock、配置、业务限额或用户确认；不持连接跨planner/素材I/O，也不改钱包、真实余额、任务、lease、供应商和UNKNOWN。

曾考虑的事务锁草稿会增加SQL往返和legacy proof连接传递；在modified验收前已删去，`creation-scope.ts`恢复原始raw字节。最终只改3个产品文件，并非新增一层护栏。

## 集中验证与证据边界

新增 `scripts/verify-imagegen-quote-intent.ts` 并接原refactor catalog。真实PG/实际quote owner、原始HTTP handler正文、当前feature policy/素材repository和内存实现执行；plan对象、handler鉴权与current planner为明确fixture ports，不冒称完整产品或供应商验收。原price verifier的current plan route依赖改跟随真实current quote owner；OWNED_FIVE历史投影与业务断言保留，不复制helper实现。

先做完整职责切片，再集中跑基线/修改/normal trace、原价/权限/输入/显式取消、并发/对象变更/SQL故障/读失败、历史随机ID与单连接legacy proof。后续类型/相关入口、同固定源码镜像/core/runtime/browser及性能按实际结果更新；208注册数量不等于已执行。

准备阶段三次失败原日志留存：CJS顶层await、fixture账号owner路径/文字列名、初始signup赠额两行operation未按前后增量比较。它们均已独立清理自有PG，不写成产品缺陷或成功业务。

当前产品实现完成：原/新19用例50检查通过，normal轨迹一致；真实PG并发8行→1行、内存8ID→1ID、原报价读取3→1、调用者迟到改价99→原6完整冻结。

原价--simplify实入口/真实PG已通过：5笔真实结算、62 fixture积分、5次loopback PNG供应商POST、预占归零；另2个已受理batch仅验证冻结计划，4个item保持queued，未冒充其交付。初次调用未带--simplify进入历史确认协议而失败，保留原日志。当前协议另在原4d完整副本复现旧fixture同actor复用v1草稿、向v2发布被正确拒绝；仅使用新fixture actor创建当前基线草稿，未改生产stale draft保护。旧脚本硬编码3笔/38积分、expired-not-accepted及缺失账单默认12的假证据已改成真实5笔/62积分读回和明确接受状态。新增断言最初误把发布后预览的批次28写成24，失败保留；最终绑定原server preview28，不信客户端宣称24。

实际命令、literal、exit及未完成项以本轮证据为准；完整固定源码208/runtime/browser/性能尚待执行。实际命令、literal、exit、全量hash、copy-only回滚及四产物以本轮VERIFICATION/DELIVERY为准。整体ACTIVE，PR8仍draft，未合main/未部署，47 HOLD。生产容量、历史事故与有效CI继续独立保留。
