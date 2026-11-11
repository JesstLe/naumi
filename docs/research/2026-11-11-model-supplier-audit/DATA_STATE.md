# 数据、状态与副作用边界

固定源码 `052665c8cc295cdba04d28a489f8c9cd727c5862`。本表来自源码 DDL/查询，不代表本轮核对过线上实际表结构。完整静态 CREATE TABLE 位置见 `AUDIT_INDEX.json.tables`。

## 1. 数据 owner

| owner | 代表表/记录 | 写入入口与不变量 |
|---|---|---|
| Model registry | app_model_drafts、providers/upstreams/public_models/pools/rules/candidates/bindings、business/image_presets/fixed_costs | repository 保存草稿；actor/revision/base约束；不直接改已发布历史 |
| Model publication | app_model_config_versions、config_state、publications | stage/prepare/activate/markApplied；immutable版本、active CAS、原operation fingerprint |
| Credential store | app_model_credentials | 新ref追加、key_enc、provider绑定；旧ref保留供历史执行读取 |
| Capacity | app_model_provider_budgets、capacity_accounts、provider_leases | 账户别名归并与有效租约；runtime上限不是页面输入即刻生效 |
| Execution projection/audit | app_model_router_projections、execution_stages | 模型/计费组合摘要、准备lease、真实尝试阶段；accepted校验不重编新配置 |
| Channel scheduler | app_model_channel_balances、channel_health、channel_operations | 调度/熔断/原operation pin；不是供应商钱包余额 |
| Provider catalog | app_model_provider_catalog | 目录缓存、来源/成功/错误与stale；不直接启用公开模型 |
| Supplier metadata | app_supplier_model_metadata、metadata_versions、price_points、source_snapshots、video_definitions/versions | 人工修改expectedRevision、来源分离；资料变化不重写执行配置 |
| Billing catalog | app_billing_config_versions；app_settings中的billing_config_version指针 | quote/settlement/rules/products/costs版本发布；跨模型兼容检查；同operation幂等 |
| Billing execution | app_billing_operations、intents、reconciliations、api_cost_reviews；image_billing_quotes | 原quote、scope、预占/结算/未知回执；读新管理UI不重报价旧任务 |
| Credit wallet | app_credit_batches、ledger、gen_reservations、orders | 原业务事务、历史批次/订单冻结、幂等扣款；模型配置页不直写 |
| Image cost audit / BI | app_image_cost_audit、bi_model_calls、bi_access_log | 审计和观察投影；无记录不证明无调用；前台ID≠实际响应模型 |
| Supplier ledger | app_supplier_accounts、calls、call_outputs、cost_adjustments、variable_costs、admin_audit | 真实attempt/task/account绑定，金额/原币/证据来源，修订留痕 |
| Supplier cost recovery | app_supplier_cost_jobs、callback_inbox、query_limits、usage_buckets/usage_runs | outbox、lease、原任务查询/服务端确认，回调不当完整付费结果 |
| Model health | app_model_health_policy、probes、observations、reconciliations | 策略revision、预算、有界探针、未知核对；不等同作品交付验收 |
| Task/media/account | image_jobs、canvas_image_tasks、video_tasks、artworks、creation_records等 | 属各业务owner；后台只投影和调用公共用例，不为改UI跨owner改表 |

DDL入口分别在 `model-config/storage-schema.ts`、`runtime-schema.ts`、`execution-audit-schema.ts`、`catalog-schema.ts`，`supplier-models/schema.ts`、`video-schema.ts`，`supplier-cost/schema.ts`，`model-health/schema.ts` 和 `billing/schema.ts`。现有部分业务owner含历史兼容表/方法，不以表名前缀划分绝对归属。

## 2. 不能合并成一个“成功/失败”的状态

| 状态维度 | 表示什么 | 不证明什么 |
|---|---|---|
| 模型发布applied | 本次模型配置/路由确认生效 | 任意供应商此刻有余额、用户能收到图 |
| Billing版本已发布 | 新报价使用新计费规则 | 已受理任务重新计价 |
| 目录ok | 当前连接读到可访问目录 | 每种参数/参考图/异步协议已实测 |
| 元数据documented/verified | 某版本来源或确认记录 | 已发布映射自动改变、永久有效 |
| 通道healthy | 对应观察窗口/电路状态 | 供应商所有型号可用、已有任务完成 |
| 探针success | 固定scope那次输出满足探针检查 | 用户作品保存/权限/父子任务/账务完成 |
| supplier completed / reported cost | 上游原任务或费用被观察 | 原图已入库可打开、用户已正确结算 |
| unknown | 原身份结果仍不明确 | 免费失败、可以安全另起收费调用 |

状态显示需要证据时间、身份、版本、覆盖范围；不同owner分别核对，不以批量“全绿”覆盖缺证据。

## 3. 请求副作用分类

- `/api/models` / published snapshot：用户侧发布目录读取；不bootstrap/discover/DDL，不触发生成。
- 管理配置GET：管理服务可能显式初始化、创建或读取专属草稿；如 onboarding GET 调用 `repo.draft(actor)`。**不能把全部后台GET统称数据库只读。**
- 目录refresh / supplier metadata sync：可能供应商GET、写缓存/资料，不等于发布模型。
- 余额GET：可查供应商余额并写缓存，有节流/来源范围；没有生成调用。
- 路由/报价模拟：使用草稿和真实规则规划/报价；不POST供应商生成；保存草稿与模拟是不同副作用。
- 健康手动tick：可实际POST供应商生图，有成本，不是普通连通性GET。
- supplier-cost retry/usage：写outbox排队，查原任务/费用，不是重发生成。
- supplier callback：写有界inbox，后续服务端确认，不直接认定可信完成。
- configuration publish：可能影响新任务执行的模型/价格/映射，需原owner的版本、diff、CAS、reconcile。
- application deployment：程序/运行环境蓝绿，是另一条生命周期；管理配置发布不是部署成功。

## 4. 后续实现的接口边界

只增加薄聚合read model和对象化UI；写操作调用原管理用例。常用命令可维护一个统一operation envelope，但modelVersion与billingVersion各自明确，不能把两个owner的非原子步骤藏成单个布尔成功。

所有正式修改在M1开始前保存golden报价/参数/目录、原版本与diff；每个模块集中验证成功/冲突/未知/回退。UI回退恢复组件与入口，配置回退创建新版本；两者均不恢复业务数据库、不重放未知收费请求。
