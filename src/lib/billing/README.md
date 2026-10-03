# 统一计费模块

后台入口 `/admin/billing`，新任务价格以 `/api/billing/quote` 为准。客户端只接收安全的商品和报价投影，供应商成本、条件规则和管理员记录仅在管理接口返回。

| 修改内容 | 位置 |
| --- | --- |
| 初次安装的兼容默认值 | `bootstrap.json`；只用于第一次初始化 |
| 在用价格、成本、规则、商品、赠送及有效期 | 后台发布的 `app_billing_config_versions`，当前指针 `app_settings.billing_config_version` |
| 功能标识 | `rules/registry.ts` |
| 参数与配置校验 | `rules/schema.ts`、`validation.ts` |
| 报价和结算公式 | `quote.ts`、`costs.ts` |
| 预占、扣款、到账和人工核对 | `service.ts`、`repository.ts` |
| 登录事实、服务器运行模式 | `server.ts` |
| 同步工具接入 | `synchronous.ts` |
| 持久任务接入 | `task-operation.ts`、领域任务原事务 |
| HTTP 提交去重和浏览器重试身份 | `intent.ts`、`client-intent.ts` |
| 注册、兑换和人工到账 | `entitlements.ts` |
| 用户报价展示 | `client.tsx`、`preview.tsx`、`products.tsx` |
| 历史无报价任务和测试辅助 | `legacy.ts`，必须显式传入配置 |
| 成本审计 | `audit.ts`；依据已提交流水和冻结报价 |

新入口注册 FeatureId，增加初始兼容价和后台标签；创建任务前从真实登录态调用 `quoteForRequest(request, {feature,quantity,...})`，验证显示版本。原任务创建事务调用 `reserveTx`，完成产物的原事务调用 `settleTx`。异步任务持久化完整报价，后台恢复不读取最新价格，也不重新提交结果未知的供应商操作。旧任务的数字金额只用于旧任务，不得覆盖新任务报价。

`metering=off` 或 `features[id].enabled=false` 表示不收站内积分，不表示停用该工具。关闭销售只影响新订单，已支付订单仍按创建时商品快照到账。

金额单位：商品售价为人民币分；积分为非负整数；估计成本及汇率为百万分之一单位的十进制整数字符串；比例为基点。不要用浮点数换算成本。成本加成是选定成本项的单位售价，功能的 image/item/task 单位决定数量乘法。

执行 `npm run verify:billing-all` 前设置隔离的本地 PostgreSQL URL 和 `NAUMI_VERIFY_ISOLATED_DB=1`。运行真实浏览器验收用 `npm run verify:billing-ui`，先启动同一 fixture 配置的本地应用；所有供应商验收请求必须保持本地 mock。
