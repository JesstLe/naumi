# R8T：企业源站接入归属与运行时依赖

## 模块、基线和问题

持续整体重构，基线 `c633caeebba7fe99ff7292355af6cb348428759b`，独立工作树 `E:/Workspace/naumi-refactor-20261024`。完整5317个原始raw hashes、归档与副本保存在 `output/refactor-r8t-20261031`。main已刷新并普通整合，实际仍为e2f56255、Already up to date；上一同步后产品模块计数0。

企业工作流的实际部署CLI `tools/runtime.ts` 通过 `runtime-pilot.ts` 调用源站审计，原审计实现却由 `scripts/lib` 拥有；服务测试另从该目录导入审计和接入计划。这不是无效pilot代码：原运行时构建确实打包它，负责在开通前重新检查源站快照、账号和撤权状态。

## 归属、公共接口和依赖

`services/enterprise-workflow/src/source-onboarding` 集中已有源站接入职责，不建立新服务或框架：

- `audit.mjs`：`sourceSite`、`sourceBridge`、`inspectSource`、`probeSource` 和唯一 `SourceAuditError`。
- `pilot-plan.mjs`：纯 `preparePilot`，复用同一审计错误身份和site规则，形成已复核账号到原provision合同的计划。
- 两份原`.d.mts`随实现迁移，不改原类型或业务语义。

运行时 → source-onboarding；现有operator CLI → source-onboarding。CLI继续负责参数、文件/权限、数据库池与输出组装；模块不导入CLI、Next、React、schema初始化器或供应商SDK。六个实际消费者集中迁移，旧`scripts/lib`实现移除，不保留无人使用的转发facade或复制实现。

## 保持不变

原审计与计划算法逐字节保持（计划只改变同模块import路径）；原只读repeatable-read事务、超时、public表查询、ROLLBACK/release、准确企业与账号绑定、快照指纹、错误分类、匿名探测以及CLI参数和产物保持。原source revalidation、target provision原子事务/审计/CAS/幂等由既有runtime/provision负责，不拆事务，不新增写源站路径或HTTP自调用。

## 验证和未完成

完成本模块后集中执行原/新算法、SQL/错误/探测/计划trace对照；复用原source-audit真实PG与CLI测试、pilot-plan CLI测试和完整企业runtime接受测试（含打包后的pilot-plan/pilot-apply）。另执行根与服务类型、runner、架构检查。实际结果后补，不预填PASS。

这是运行代码对scripts反向依赖的归属修正，不是新业务或上线。完整候选core、固定Web/Worker镜像、整版runtime/browser、有效CI、同机性能容量和最终main验收继续OPEN；47 HOLD。
