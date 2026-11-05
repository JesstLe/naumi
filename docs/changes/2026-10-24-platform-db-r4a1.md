# R4A1：纯数据库连接池与事务基础边界

2026-10-24。独立工作区 `E:/Workspace/naumi-refactor-20261024`；分支 `codex/core-refactor-20261024`。
完整基线：`a579f58ffe7c4f778d4f7e799bca62d3a16c7ed5`。本轮是 R4A 第一阶段，业务数据 owner 和 DDL/组装环继续迁移，不把基础层完成等同 R4A 或全项目完成。

## 实际修改

- `src/platform/db/pool.ts` 是 query Pool 与 `dbEnabled` 的唯一实现。仅依赖 `server-only`、`pg`，导入不连接、不初始化表、不加载业务。保留原惰性单例、环境读取时机、SSL 规则和 `max:5`。
- `src/lib/db.ts` 导入并兼容导出同一 `getPool/dbEnabled`，未建立第二个池；真实 PG 中函数与实例均严格相等。普通业务数据库仍由原 schema 和 repository 负责。
- `src/platform/db/transaction.ts` 接管机械的 checkout → BEGIN → action → COMMIT/ROLLBACK → release。保留原错误传播和 finally，不附加重试、超时、事务DSL或业务校验。
- `billing/service.ts` 的 `withBillingTransaction` 兼容导出为同一函数；`db.ts` 和只需该事务工具的管理入口直接引用基础层。账务 reserve/settle/ledger 的 SQL、锁及原 operation 完全不变。
- `creationTransaction` 在原 `ensureCreationSchema` 后调用共享事务；租户事务在原 `ensureTenantSchema` 后调用共享事务，并仍在 BEGIN 后先执行原 `SET LOCAL statement_timeout='20s'`。
- 迁移 **79 处纯 getPool/dbEnabled 导入**，并移出同文件另外 **3 个混合导入的 dbEnabled 字段**；涉及的账号、模型、供应成本、图片、视频和API消费者保留业务调用。7个单独的业务导入继续显式引用旧门面，没有假装整份业务db已退休。
- `imagegen/coordination-pool.ts` 只改 getPool 来源；保留独立 `max:4`、WeakMap、application_name、error listener 和释放。没有把锁连接与普通 query 池合并。
- `schema-initialization.ts` 未改，其 advisory lock 和“rollback失败仍保留原DDL错误”的语义不被普通事务覆盖。

不修改表、价格、客户积分、冻结报价、operation算法、供应商协议和前端；没有新增用户侧确认、限额或审批。

## 结构变化与未消除的耦合

| 指标 | 本轮前 → 后 |
|---|---|
| 旧 `db.ts` 的 emitted 静态消费者 | **251 → 178** |
| 最大 emitted 静态强连通分量 | **60 → 56** |
| 视频强连通分量 | **20 → 20**，本轮不重写视频 |
| 新基础层业务 import / 环成员 | **0 / 0** |
| 只改 import 的既有产品文件 | **77** |
| 原非目标函数正文 | **535 个保持一致** |

数字来自同一 AST/TS 擦除后扫描方法；新平台文件明确纳入 Git inventory。它们表示依赖方向改善，不是吞吐或线上事故根因证据。剩余56文件环仍包括db/schema、身份/租户、模型配置和账务组装，后续按真实数据owner继续拆；不通过重新分组掩盖环。

## 集中验证

证据根 `output/refactor-r4a-20261024/`。精确命令、输入、literal、退出状态见 `VERIFICATION.txt`。

| 验证 | 实际结果 |
|---|---|
| 原实现 Pool/Tx 对照 | **27 场景 / 157 检查**；实际原函数，pg/socket 为VM port |
| 新基础层与原domain wrapper | **28 场景 / 166 检查**；惰性单例、SSL矩阵、checkout/BEGIN/action/COMMIT/rollback/release故障、schema顺序、tenant timeout、协调池保持 |
| 真实隔离 PG | **基线25 / 新版29检查**；新版另校验旧/新入口函数、实例与Tx别名严格相同 |
| 实际账务 | 两个并发原operation reserve/settle只一笔consume、钱包30→24；真实余额不足402；故障事务无孤立operation；既有wallet suite基线/新版均exit0 |
| 创作及租户 | 实际start/finish、重复事件单次、失败更新回滚、租户创建；既有writer suite完成A/B，含跨租户、原字节/蒙版、证据写失败、视频恢复、canvas终态、冻结batch取消 |
| 实际画布复制/删除/history HTTP + PG | 完整基线和新版均 **32检查**；单图/混合复制、归属、原子删除、undo及回执保持 |
| 池隔离 | 普通5条连接全部借出时，独立协调池仍取得连接并成功查询；所有客户端归还，waiting=0 |
| 类型/lint | 全项目tsc exit0；所有受影响TS产品文件和新PG脚本lint exit0、0warning |

基线PG加载完整基线源码和依赖，不是只投影两个函数。VM故障用例与真实PG的证据层次分开。原 ordinary Tx 的 rollback 错误会覆盖原 action 错误，本轮明确对照保持该行为，不在基础提取时暗改错误合同；schema Tx 的不同错误策略保留。

## 原始失败及修正

1. 初次 import 迁移脚本的广泛正则遇到 `agent/session` 的两个db导入而主动中止，未写该文件。改为AST只迁纯基础绑定；后续审计再识别并迁出3个混合字段，业务导入保持。
2. PG新verifier误把内部 `BillingQuote` 当公开 `credits`，两端均 `undefined !== 6`，exit1；改读实际 `reserveCredits`，并加明确类型。两个失败随机schema/连接均已清理。
3. 第一次tsc exit2来自新脚本的可空lock变量；改为先取得typed client再保存清理引用，产品没有类型错误。
4. 旧 `verify-saas-creation-writers.ts` 在基线/新版均于第123行取消tenant batch时缺原tenant context，返回409 `IMAGEGEN_SCOPE_CONFLICT`。修正测试用同一 frozen tenant 调实际 cancel，仍保留实际worker tick；两端全链通过。基线额外测试文件用修正后的harness，基线产品源码不改；未放宽产品scope检查。
5. 原始失败日志和 `CREATION_FIXTURE_CORRECTION.json` 留存，不把此前未执行的后段断言记为通过。
6. 新pool文件末尾多余空行已清理，运行语句不变。清理报告首次因“空psql输出未生成Tee日志”exit1，发生在自有容器/卷已成功移除之后；重新盘点而非重启，最终CLEANUP=PASS。

## 四产物、回滚、同步

完整基线与原文件SHA在修改前保存；四产物为 `MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。独立完整源码副本覆盖新版归档后回滚：**84 个原文件恢复、5 个新增文件移除**，再运行相同27/157原行为对照；实际工作树保留新版。归档/补丁/源码逐文件核对，所有交付物回读。

本轮仅自有PG容器 `naumi-refactor-r4a-pg-20261024`，端口65447；真实调用前确认本机隔离。结束后核对固定容器ID、匿名卷独占引用和零其他client连接，停止并删除自有容器/匿名卷，最终端口无监听。失败和成功fixture资料均在本轮output，其他数据库/实例未操作。

本轮为 main 同步后的第 **3** 个模块，收尾按约定在任务分支刷新/普通整合 `origin/main` 并归零；实际SHA和命令结果由 `SYNC.json`/`VERIFICATION.txt` 记录。代码只推独立分支，不合入main、不部署。

下一步：R4A2 按owner迁出实际查询和初始化责任，首先核对 `db.ts` 的 schema、settings、identity 与 billing/model composition 之间的真实边；只搬SQL而继续反向import大门面不算解耦。R3外围UI、跨请求CAS、旧intent升级、R4B—R6、完整build/容量仍未完成，整体goal active。

```text
继续独立重构分支R4A2：先画出数据owner/初始化调用顺序，固定当前完整SHA。
不要仅为目录整齐移动SQL后再import整个db；从实际调用方切换并删除旧实现。
保持schema兼容、锁顺序、tenant/owner、原operation/报价和幂等结算；
完整模块集中A/B及真实PG，独立副本回滚、文档和选择性提交，不接管发布。
```
