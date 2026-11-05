# P2-1 计费发布不得新引入模型报价失败（2026-11-05）

依据：[管理后台评估](../design/admin-architecture-review-20261105.md) A2 后半段。基线 main `22ea1190`。

## 问题

模型发布时会用当前计费配置编译一次路由投影（`access.ts:62`、`management-access.ts:291`），计费发布时却没有反向检查。删掉或改坏某个"最低成本"模型池候选通道所依赖的成本项后，问题要等到执行时（`prepareExecution`）才会以 INVALID_COST 的形式暴露给用户。

103 v117 现状：有 4 个 lowest-cost 模型池，**目前没有被启用的模型使用**，所以线上暂无实际影响；一旦重新启用就会遇到。

## 本次实现

- `billing/catalog.ts` 的 `Deps` 新增可选的 `checkPublication(next, current, tx)`：
  - 在发布锁内、版本校验之后、写入新版本之前执行，抛错即拒绝发布；
  - 重放已有的操作编号时不执行。
  - billing 核心模块不导入 model-config。
- 组装边界 `billing/configuration.ts` 注入 `model-config/billing-publication-check.assertBillingKeepsModelPricing`（动态导入）。所有计费发布入口都经过这里：计费管理页、版本恢复、系统设置，以及模型管理页的"设置积分"。
- 判断规则 `billingChangeBreaksModelPricing(model, current, next)`：
  - 用旧计费和新计费各编译一次投影，**只有旧的能通过、新的不能通过时才拒绝**；
  - 本来就存在的问题不算在这次发布头上，避免环境里信任域名等无关配置造成误拦。
- 只读取已激活的不可变模型版本，不会创建模型注册表。先用 `to_regclass` 判断表是否存在：Postgres 里查询出错会中止整个事务，库里没有模型表时检查直接跳过。
- 拒绝时的提示："此计费配置会使当前模型无法报价：…"（INVALID_CONFIG 400）。

## 验证（零外网、零供应商调用）

- 新增 `npm run verify:billing-publication-check`：10 项通过。
  - 判断规则：新引入的破坏被拒绝；无关改动放行；既有问题不归咎于本次；直连通道不依赖成本项。
  - 发布钩子：拒绝后不产生新版本；钩子收到当前快照；接受时只新增一个版本；重放不重复检查。
  - 无模型表的库：检查不执行，事务仍然可用。
- 回归通过：billing-config、billing-api、billing-rules、billing-wallet、credit-billing、model-publication、model-management、admin-access，以及 `verify-model-management-ui`（整页浏览器，含积分保存与恢复）；tsc、eslint。
- 证据层级：隔离数据库上的真实计费运行时；**未发布**。

## 核实的过时测试（不在本模块修改，交画布负责人）

`scripts/verify-canvas-admin-runtime.ts`，由 `scripts/staging/verify-canvas-admin-module.sh` 引用：

1. `:79` 期望画布生图绑定为 `image.edit`，当前实际为 `image.generate`。这是画布绑定语义的变化，需要负责人确认哪个才是预期，不能为了通过测试改断言。
2. `:112`、`:121` 断言服务端会抛 `MODEL_CHANGED`。当前服务端已经没有任何地方抛这个错误，只有 `billing/client.tsx:195` 还在处理。

评估 A5 中"`/api/admin/mvp*` 无调用方"的说法，按 `docs/admin-model-management.md` 的兼容约定，这些接口需保留给浏览器里的待处理记录重试使用，**不删除**。

## 交接

```text
模块与职责：计费配置发布前的跨模块一致性检查。
公共接口、依赖方向、数据/状态/事务归属：billing Deps.checkPublication（窄接口）；装配点 billing/configuration.ts → model-config/billing-publication-check；在计费发布锁内执行，只读模型版本。
本次实现与迁移状态：完成。
验证命令、结果及证据层级：见上；未发布。
未完成项与下一步：P2 草稿清理、拆分 management-access、统一接口守卫。
```
