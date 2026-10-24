# R1B：共享模型/参数准备与单快照报价

工作树：`E:/Workspace/naumi-refactor-20261024`；分支：`codex/core-refactor-20261024`。
完整基线：`a8d7c4bd2d2c3599f0493e35d22338731088b035`。整体目标仍是可继续开发的完整模块化 Naumi，不以本阶段完成替代全项目交付。

## 实际调用和职责变更

| owner | 负责 | 已迁移的调用者 |
|---|---|---|
| `billing/runtime.ts` | 原配置实例、版本、metering 和管理兼容入口 | 管理配置、quotation、旧 server re-export |
| `billing/quotation.ts` | 以 typed actor/selection 准备身份、价格及完整报价；不创建 Request、不解析 headers | imagegen、cutout、Canvas task、video、旧 HTTP facade |
| `billing/server.ts` | HTTP 身份/headers、原 quote ID 读取和兼容导出 | 旧 API、客户端报价入口；目录仍不解析 default model |
| `model-config/model-selection.ts` | public model / preset / feature option / tool scope 的唯一身份选择 | 报价、执行器、图片准备与 planner |
| `model-config/image-quality-selection.ts` | 默认档、旧抠图标签、未知标签和未开放档位的统一规则 | 报价、HTTP preparation、Canvas/Agent/workbench planner |
| `model-config/image-preparation.ts` | 输入事实、参数、实际分辨率与请求值的统一准备 | HTTP 无已准备合同的旧请求、新 imagegen plan |
| `model-config/prepared-image-contract.ts` | 私有准备结果的版本/digest/feature/binding 合同 | planner 保存；执行验证与消费 |
| `model-config/snapshot-reader.ts` | 当前操作只取一次 model snapshot，优先复用已冻结上下文 | 新报价与旧兼容 reader |
| `model-config/availability.ts` | 管理配置是否启用的原判断 | 目录、设置、视频、报价等，不再依赖整个 requests.ts |

未新增数据库表、工作流框架、微服务、运营限额或积分确认。旧公开方法通过薄 adapter/re-export 继续兼容，没有保留两份实际计价实现。

### 新计划保存准备结果，而不是执行时再按默认值重选

`ImagegenPlan.steps[].preparedImage` 保存私有的版本、digest、feature/binding、模型、facts、原请求参数和候选通道集合。`publicImagegenPlan` 删除该字段及原私有 BillingQuote；浏览器仍只拿原公开计划和 quote ID。

- `plan → prepareImageOperation → saved preparedImage`。
- `generation-operation / cutout-operation → withModelOperation → executor.resolve` 消费原准备事实，关闭再次分辨率选择和 preset 重解释。
- 执行仍校验原版本/digest、模型/用途、候选集合及现有通道准入；不把已准备理解为绕过 owner、余额或停用通道检查。
- 历史 plan 没有此字段时继续经原准备 adapter 解释；没有批量改写旧记录。
- HTTP 与 typed 执行共享同一准备函数。高层透明两步规划、蒙版/画幅及供应商 wire 过滤仍由现有领域模块负责，不吞并成万能函数。

## 本轮发现并关闭的具体差异

### 1. 一笔报价重复读 current，可能混用两个发布版本

旧 `managedBillingModel` 与 `freezeBusinessQuote` 各读一次 registry。测试在第一读之后真实发布新的业务价，旧实现返回新发布 **9 积分**，虽然身份阶段使用的是前一个快照。

新版在 quotation owner 只读一次，然后把同一 `models` 传入身份和价格计算。相同出版时序返回原选中快照 **3 积分**，modelVersion 同源。

实际对照：`MODEL_READS=2 → 1`，`MID_PUBLICATION_PRICE=9 → 3`。没有全局缓存 mutable current，也没有添加用户确认。

### 2. 显式所选模型被外层 scope 覆盖

旧 matching scope 快路忽略了显式 requested model。在 model A 的执行上下文内查询 model B 的价格，会拿到 A 的身份与价格。

新版只有明确选中的模型与 scope 匹配时才复用它；不同模型按同一冻结 snapshot 解析。真实 PG 验证 A/3 与 B/9；不改管理员单价。

### 3. `standard` 在旧 HTTP 可回退，planner 却拒绝

旧报价引擎本来就将未知质量按 medium 定价，但 imagegen planner 用原 `standard` 模拟通道而失败。此次共享实际规则：Canvas、Agent、workbench 的 planner 都生成 medium 准备事实和一致报价，原标签仅保留审计。没有把“旧报价本来会拒绝 standard”写成缺陷事实。

`" HIGH "` 的大小写/空白也在统一准备阶段归一化，而不是让价引擎误认未知值后按 medium 计价。原 quote identity 的质量比较同样做语义规范化，真正不同的 low 继续冲突；原 operation 指纹未改。

### 4. 已保存报价的 raw 标签不能再次影响执行默认档

HTTP opaque quote 的原始质量标签只是审计信息；准备时使用原 quote.facts.quality，不拿标签按新的环境默认值重选。新 plan 直接消费 preparedImage。改变环境 default 后，原 medium wire 和原价继续保持。

## 证据

核心脚本：`scripts/verify-image-preparation-refactor.ts`。完整 baseline source 与修改版使用同一个新增 harness；不是仅投影若干源文件。

- **BASELINE：29 checks，exit 0**。复现双 model read、伪造 Request、scope 覆盖、planner 不识别质量别名、发布中途混价。
- **MODIFIED：45 checks，exit 0**。model read=1，synthetic Request=0，发布中途仍原价；三入口共享 quality；prepared 合同私有且版本校验；旧 plan 仍可交付；一次供应商和账务语义保持。
- 两次已交付任务分别是当前保存 plan 与明确的新 operation 旧格式 plan；`SUPPLIER_CALLS=2`，不是同任务重提。
- 当前客户价发布为 17 后，原任务仍按 3 扣款，重试 supplier delta=0。
- 结构检查14项：直接读取实际源码，quotation 不含 Request/Response/headers；质量测试已从复制逻辑改为调用实际共享函数。

沿用的集中回归：

- Canvas 模型/报价真实 PG **23**；离线路由 **36**（原35 + 显式选择优先用例）；catalog/client **22 groups**。
- 分辨率回退实际 PG/HTTP/应用 APIB：4K请求→2K执行、原报价12不变、5个 loopback posts、重复任务不重放。
- 生图执行、22项原回执、49项抠图真实入口：通过。
- 图片去确认 **25/74**；Agent pricing **58**；workbench **13 groups**：通过。
- 真实 business routing、SSE费用、unknown、结果恢复、单次账务：通过。
- 画幅选择 **70**、admission/recovery **53**、质量规则 **5**、入口一致性和 billing facts：通过。
- 全项目 TypeScript、改动 TS/TSX ESLint 的最终命令/退出码见 VERIFICATION。

PG 容器 `naumi-refactor-r1b-pg-20261024` 是本任务独占，绑定127.0.0.1:65439；所有供应商请求都去 loopback fixture。没有外部供应商付费、产品发布或业务库变更。

## 失败原始记录和验收变化

保留 GROUP_RESULTS、FOLLOWUP_RESULTS、ADAPTED_RESULTS、COMPLETE_RESULTS 等最初输出，不改写为全绿：

- 初次 baseline verifier 错以为原报价 standard facts 仍为 standard，实际旧引擎已输出 medium；修正测试描述，保留原失败。
- 中途发布 fixture 初次用了不符合原 business schema 的 fixed 计价；改用 schema 允许的 cny-fixed，仍通过真实发布链，不改生产 validation。
- 旧 AST/VM 脚本引用迁出的函数位置、mock 少导出及缺少合法发布别名/绑定；修改为读取真实新 owner，补全 fixture 元数据，不复制生产准备逻辑。真实 PG 验证不依赖这些 VM 替身。
- version-pinned 非法规格仍拒绝，因统一准备而更早返回分辨率错误；原“没有支持”文案断言改为同一失败语义的错误集合，不改成成功。
- 入口一致性旧脚本仍要求未知质量拒绝，和已经合入的 quality fallback 冲突。本轮改为检查实际默认档与原值审计；原失败日志保留。
- catalog AST helper 同步读 billing/runtime 与 failure；固定旧 Canvas 源文件从原 git 对象恢复并校验，未伪造文件。

## 剩余整体任务

本轮交付的是 **R1B 核心图片准备与报价边界**。不是“所有领域已模块化”：

- 整个跨域静态 SCC 仍 **60**（上一轮55，提取多个实际职责文件导致数量增加）；video环20、imagegen动态恢复分量10未消除。运行依赖仍须 R4 数据/配置 owner 改造，不用新文件数粉饰为解环。
- planner 的透明多步策略、通道真正执行准入仍保留；后续可以继续收敛纯计算重复，但不能拿通道 availability 代替原计价合同。
- text/video 的执行域及工作台文字的内部 Request 兼容载体未在本轮重写；它们已经复用 typed quotation。其余执行适配在 R5/R6。
- R2 正常/原结果恢复交付统一、R3 Canvas 分域、R4 DB/控制面和热路径 DDL、R5 Worker 与 runtime/scripts、R6外层结构仍未完成。
- 未构建或部署产品 Web；脚本/PG通过不等同完整 UI、10万活跃容量或线上稳定验收。

## 交付与下一步

四产物：`output/refactor-r1b-20261024/{MODIFIED_FILE.tar,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`。完整原始 archive、SHA清单、独立 rollback copy 同目录；只对副本恢复，保留当前新版。

模块计数到3（R1A1、R1A2、R1B）；按协作约定刷新并普通合入 origin/main，结果以 VERIFICATION 为准。没有把重构分支合回 main。

```text
下一模块 R2：在同一重构工作树统一正常出图和 stored-delivery 恢复的本地交付 continuation。
先核对 generation-runtime、stored-delivery、delivery-checkpoint、账务和作品提交的实际顺序。
目标是只有一个处理/保存/作品/结算 owner；旧任务原字节、原ID与quote继续有效。
不重放 unknown 或已完成供应商请求；删除重复交付逻辑，不只搬文件。
完整模块后集中跑4故障点、实际PG原字节恢复和一次结算；更新整体台账和副本回滚。
```
