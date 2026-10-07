# 逐次供应商成本与对账

## 实现与数据口径

工具箱、无限画布文字/图片、视频、OCR、抠图、超分复用现有传输层、认证、冻结报价及 worker。混合 Router 通过只读 `/internal/operations/{id}` 导入全部实际 attempts，不把外层 SDK 调用再算一笔费用。供应商成本不会改写用户报价或钱包扣费。

金额为六位定点微单位（PostgreSQL numeric + BigInt）；原始 JSON 金额词法不先经过浮点。状态：pending=费用未知，estimated=真实用量×冻结采购价，reported=供应商报告，reconciled=与聚合账单核对。未知费用不是零，明确零费用可确认为 reported。原币、供应商 credits、人民币快照独立存储。退款、修订、估算被真实费用替代保留 before/after 调整。

### 数据迁移

`scripts/migrations/20261007-supplier-cost-ledger.sql` 与运行时初始化使用相同 additive SQL 和 advisory lock：

| 表 | 用途 |
|---|---|
| app_supplier_accounts | endpoint+key 的账户哈希、原凭据引用、FX、策略 |
| app_supplier_calls | 用户、可选订单、操作、尝试、公开/实际模型、阶段、费用、用量、时间、脱敏证据 |
| app_supplier_call_outputs | 组图子项位置/脱敏标识，共用原任务总成本 |
| app_supplier_query_limits | 跨endpoint别名的同Key查询预约与缓存冷却 |
| app_supplier_cost_adjustments | 修订退款轨迹 |
| app_supplier_cost_jobs | 原任务查询、Router 导入、usage 对账持久队列 |
| app_supplier_callback_inbox | 未验证 callback hint 与去重哈希 |
| app_supplier_usage_runs / app_supplier_usage_buckets | 不可变查询记录、账户/日期/模型聚合差额 |
| app_supplier_admin_audit | 账户策略及手动补查审计 |
| app_supplier_variable_costs | 其他变动费用，不含固定月费 |

operation_id 是业务生成操作，order_id 是可选关联订单；现有 app_orders 是充值订单，不能为生成任务伪造关联。尝试按账户+attempt、账户+task 去重，使用事务和行锁。组图费用挂原任务，不按每张图片重复复制；子阶段可关联 parent_call_id。

## APIMart 文档核验（2026-10-07）

官方材料保存在 `output/supplier-cost-20261007/`，来源：
- https://docs.apimart.ai/en/api-reference/tasks/status.md
- https://docs.apimart.ai/en/api-reference/tasks/webhook.md
- https://docs.apimart.ai/en/api-reference/account/usage.md

轮询 GET /v1/tasks/{id} 使用 data.id/status/cost/credits_cost/completed，usage 使用实际返回值；原生/EXT 共用适配器，EXT 不强制 token。cost 是 USD，credits 是供应商额度，与用户积分分开。提交支持 data.id 和单元素 data[0].task_id。Webhook 使用顶层 id/status/cost/credits_cost，不混用 data。多任务提交需要显式子项映射，不能猜测整笔费用怎样分配。

文档只建议 verify signature，没有公开签名头、算法或 secret 规范。因此回调不直接确认费用；先验证本地任务归属、有界接收、限流、事务入 inbox/outbox，再返回 202，服务端 GET 原任务才确认。未知任务不入账、不触发任意查询。

GET /v1/usage 是聚合账单，不是逐任务明细：scope=key，group_by=model,date，[start,end)，IANA timezone，最大31天；60次/Key/分钟、60秒缓存，近一分钟及缓存可能延迟。默认每小时重叠回查7天、延迟180秒；可配置查询频率、窗口、时区、金额/额度容差。按完成入账时间归属，金额与额度容差只使用定点整数。逐项6位舍入与总计的微差允许合理舍入范围。退款修订重新对账，差异会撤销“已核对”状态。外部手工调用差额标未归属，不强行分配用户。未核验 /v1/logs/export 参数，不实现臆造明细接口。

## 采集、幂等与恢复

真实付费 POST 前先可靠建账；如果建账失败不提交。SDK、observer、gateway 不各记重复费用。HTTP 响应被消费时同步捕获 accounting metadata，超长 base64/string 跳过，仅保留有界元数据和响应哈希，不保存 prompt、图片、URL、headers、密钥。SSE 在收尾获取实际 usage；缺用量仍 pending。采购按张包价不叠加 token；估算价格来自采购快照，绝不取售价。

原任务ID、查询及回调共用 ledger.apply；已经报告的金额不被缺字段回执擦除。worker 使用 PostgreSQL lease/SKIP LOCKED，超时租约可恢复，查询失败指数退避，20次进入 needs-attention。重启扫描已有task ID补全遗漏outbox。只查原任务，不重新生成。成本延迟或 paid status 不明会明确 pending。终态成功任务7天低频回查退款/修订；未知费用继续补查。

Router 导入校验 operation、config digest、账户 identity 与原 credentialRef，通过冻结模型版本读取原凭据。每个真实 attempt 分阶段累计；原模型和回退两笔都保留。旧 Router receipt 不覆盖已得到的 APIMart 查询结果。来源真实费用优先于估算和目录标价。

## 管理后台与接口

入口：`/admin/billing/supplier-cost`，从计费管理进入。四个视图：调用成本明细、成本统计、对账异常、账户与折算。筛选用户、功能、公开/实际模型、操作、关联订单、时间、状态和账户；展开完整调用链、命中规则、冻结版本和退款修订。普通用户以及匿名接口返回404，修改沿用管理员和 same-site 校验，密钥不下发。

- GET /api/admin/supplier-cost：rows、total、stats、accounts、anomalies、jobs。
- GET /api/admin/supplier-cost/operations/{id}：完整链和调整历史。
- POST /api/admin/supplier-cost/actions：account（FX/policy/usageEnabled）、retry（原job key）、usage（账户和start/end）、variable（操作、定点人民币和凭据）。
- POST /api/supplier/apimart/{account}/callback：64KiB上限、限流、归属验证、可靠入队。

收入是冻结积分兑换规则下的计价收入，不冒充充值现金。筛选只限制调用统计；相关操作的收入、交付和利润包含完整调用链，避免筛选低价阶段漏算升级。最多最近500操作，达到上限或未知收入/成本/预算FX时标“暂估／数据未齐”。API价差=计价收入−全链供应商成本；贡献利润再减已登记其他变动成本。固定月费保持独立配置。

### 管理操作

1. 在已有模型配置后台维护采购价格和加密查询凭据，不填写售价作为成本。
2. 在“账户与折算”设置有凭据充值成本或管理员汇率；预算汇率标“折算估计”。每个新调用冻结 FX，修改不重算历史或改变用户报价。
3. 启用 APIMart 周期对账，配置时区/窗口/延迟/容差。凭据必须与原账户哈希一致。
4. 原任务异常从“对账异常→补查任务→查询原任务”恢复；不要重发生成。
5. 非 APIMart 供应商已有真实usage+采购快照时估算，未接通真实费用查询时保持pending，不伪装供应商确认。

可选服务端 env：NAUMI_ROUTER_COST_URL、NAUMI_ROUTER_COST_TOKEN；默认使用 generation URL/token，管理URL仅兼容回退。Compose和release升级透传这两个变量。worker复用视频worker tick，无额外浏览器定时任务。

## 验收与当前边界

仅隔离数据库及本地 HTTP fixture；没有收费API测试：
- npm run verify:supplier-cost：重复回调、竞态、缺usage、真实零、失败收费、迟到、退款、部分成功、混合累计、真实Router协议导入/重复导入、digest错误、重启outbox、31天窗口、未归属、定点精度、非管理员边界、大图元数据。
- npm run verify:business-routing：实际工具/画布传输、独立用户售价、冻结在途报价、重复请求不重复调用或收费、路由回退、流式usage和后处理恢复。
- npm run verify:supplier-cost-ui：真实浏览器筛选/链/数据库刷新、暂估利润、移动端、404边界。
- npx tsc --noEmit；生产镜像构建及回归记录在 output/supplier-cost-20261007/。

fixture不代表已验证真实供应商控制台账单。真实响应核验只能使用既有原任务的只读GET，不发起生成；实际线上核验结果单独记录。尚无可查询原ID或原凭据时明确待确认。

## 发布和回滚

使用固定commit镜像和 scripts/deploy-release.sh；先备份数据库/配置并准备release ROLLBACK.sh。migration为新增表且幂等，不改钱包与媒体卷。不切换存储，不删除NAS/local媒体。回滚只恢复上一代码/配置，不恢复旧DB、不删除成本账本，防止丢失上线后的任务和扣费。旧代码没有新采集器，因此回滚后新调用不再自动采集，历史账本保留；在途任务和补查状态应先核对再做生产回滚。

本次改动、差异、命令/退出码以及回滚演练在 output/supplier-cost-20261007/VERIFICATION.txt；生产部署事实另记，不把本地回滚演练称为生产回滚。
## 用于后续维护的验收提示

```text
检查供应商成本模块时：先查看真实HTTP传输层和冻结报价，不把售价当采购价；仅使用隔离fixture或已有任务的只读GET。覆盖账户+任务幂等、零/缺金额、失败收费、迟到费用、退款轨迹、完整路由链、同Key查询冷却及非管理员边界。验证新的策略不改写在途用户报价。复用既有worker和凭据存储；发布前按release流程验证资源、备份、回滚就绪及NAS配置。
```
