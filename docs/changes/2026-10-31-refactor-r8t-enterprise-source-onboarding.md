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

## 实际集中验收

固定应用/接受源码 `d4c7b8d912ec981653462b3785228108ea7ab799`（初版cba7dc34之后仅更正catalog的Node测试reporter匹配词）。原/新34组审计SQL、错误、匿名probe及pure计划trace EXACT，原115检查/修改117检查；两个算法和两份声明字节保持，六个消费者正文除import归属外EXACT。实际完整runtime入口bundle图scripts依赖1→0；全源码AST/编译图原1条runtime和2条tests边均清零，四类SCC0。根src1838个文件raw SHA全不变，其他2133个原src/services文件raw SHA保持；服务原runtime/provision/SQL算法未改。

6个受影响入口同source新执行全部PASS，0FAIL/0NOT_RUN/0reuse；runner保持subset PARTIAL/exit2、completeCore=false。catalog199→203，只是入口注册，不等于全203已执行。原source-audit真实PG及原CLI共13项、原pilot-plan测试3项通过，保留全部断言和原命令。

本轮重新build企业独立服务：45文件、schema39、gitRevision精确绑定上述source、sourceDirty=false，manifest逐SHA核验并归档。原完整runtime接受测试45检查通过，包含实际打包CLI的pilotPlan/pilotApply、源账号撤权后拒绝、Unicode准确账号、target审计失败整事务回滚、并发一次、原command回放、版本CAS、禁止重绑、原source快照不变。原服务实际HTTP/Worker、文件/排空及备份恢复回归也通过，64请求错误0；供应商调用0、扫描mode=disabled。该结果只属于企业独立服务，不当作Naumi完整Web/Worker镜像或runtime177/browser92验收。

根与服务TypeScript均exit0，最终相对类型验收source只改测试catalog匹配词；5088实际compiler/config/dependency原始输入哈希不变，TYPE_SOURCE_BRIDGE单列。lint exit0、原warnings保留；runner自身12cases255checks通过。

首次ignored运行driver的相对路径多写一级，尚未启动测试即报模块找不到；随后原pilot3项实际全通过，但Node默认spec reporter不含TAP的`# fail 0`，runner如实记FAIL。修正catalog为现有CLI测试的稳定名字并仍要求exit0，未改断言；最终6项整组全新执行，没有复用首轮2PASS。失败原报告、日志及搬迁后的原hash映射均保留。类型采集helper最初携带旧source标签，实际输入来自当前工作树；原元数据保留，修正source标签和helper，不改变任何原hash值。首次patch上下文准备错误没有部分写入，也单独记录。

自有source-audit/runtime夹具按原finally清理，精确name/ID清理证据随对应case保存；synthetic CLI输出作为证据保留在各自受控temp目录。最终资源重查与独立副本回滚以四产物为准。本片为主线同步后第1个模块，计数1/3；未合回main、未部署，47 HOLD。

## 整体下一步

WHOLE_EXIT_REQUIREMENTS逐项更新：结构性依赖归属门槛现在都有当前证据，下一步优先当前固定source完整core203，定位实际未通过项，再完成固定Web/Worker镜像、整版runtime177/产品browser92、同机性能/持续容量、有效CI和最终main整合。不得把本片企业服务45项或历史R8P135/1/57跨scope/source当整版通过；整体ACTIVE。
