# R4A5：持久任务数据归属与结算连接自等待修正

## 基线与目标

- 独立工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
- 完整原字节基线 `0d17d482b20d069bff2cdb24a551913bb319e175`，4180 文件与逐文件 SHA 保存在 `output/refactor-r4a5-20261024/BASELINE_SOURCE.tar` / `BASELINE.json`。
- 继续模块化单体；不改公开 API、任务身份、报价、账务含义、供应商 wire、数据库表或恢复策略。不增加用户侧确认或限额。

## 唯一实现与实际消费者

| Owner | 职责 |
|---|---|
| `video/task-types.ts` | 既存任务/结果合同与单一 row mapper |
| `video/task-repository.ts` | owner 查询、列表、历史及结果记录 |
| `video/task-polling.ts` | 原 poll lease、失败计数、已观察结果、存储 checkpoint、扫描与重试时间 |
| `video/task-transitions.ts` | 原子创建/预占、unknown绑定、完成/失败、作品/项目/工作流/creation/账务联动 |
| `canvas/image-task-records.ts`、`image-task-repository.ts`、`image-task-transitions.ts` | 图片编辑任务的合同、lease/防重放、原结果与终态事务 |
| `billing/reservations.ts` | 原预占表维护与排除活跃/unknown任务的清扫 |
| `billing/cost-audit-repository.ts` | 实际已扣金额与原成本审计读写 |

复用已有 owner：FIFO 扣本金进入 `billing/wallet-balance`，计费开关进入 `billing/runtime`，task outcome evidence 进入 `saas/creation-writer`，`setArtworkOrigin` 进入 `artworks/repository`。没有新增万能 store/事务 DSL 或第二个账务引擎。旧 db 与 videoRepo 均为同函数兼容出口，真实消费者 **29 文件 / 85 绑定**已切换。

## 真实复现与修复：持有一条连接时又借第二条

旧 `completeVideoTask`、`failVideoTask`、`completeCanvasImageTask`、`failCanvasImageTask` 在锁住任务后，对无冻结报价的 legacy 任务调用 `creditMeteringEnabled()`。该函数借 query pool 读取 current 计费配置；legacy-auto 还会再次借池读取 settings/多用户开关。

本轮真实 PG 以 query pool max5、4条连接被其他工作持有作为确定条件，四个入口均在第五条连接内等待自己借第二条连接；350ms测试超时返回 `CONFIG_UNAVAILABLE`，任务事务回滚、无新consume。这是**本地夹具复现的缺陷**，不冒充历史线上事故唯一根因。

修复不是加大池，也不是吞掉异常：

1. `ConfigRuntime.current(tx?)` 支持已有事务；默认无参数路径继续原 ensure/lock/read/bootstrap。
2. tx路径使用原 select/validate 与同一 advisory lock；缺初始配置时在调用方事务内 bootstrap，同事务回滚也会回滚 pointer/version。
3. `getSetting(k,tx?)`、`multiUserEnabled(tx?)`、`meteringFor(snapshot,tx?)` 贯穿已有 client，不在内部借新连接、不重新跑 DDL。
4. 四个旧任务终态事务调用 `creditMeteringEnabled(client)`。持有冻结报价时仍首先使用 `task.billing_quote.facts.metered`，**不会调用 current**；测试把 current 函数置为抛错仍能原价完成。

`tx` 是显式、已有的 PoolClient，调用者负责在 BEGIN 前完成 schema 初始化；本轮没有新建连接域或全局缓存。真实配置缺失、错误指针、SQL错误仍报错，不视作0积分或免费。

## 验收

### 完整源码 A/B（非混合投影）

- **BASELINE：3 parts / 78 checks，exit0。** 正常任务/报价/租约断言通过；压力组4条自等待全部复现，原事务无半写入。
- **MODIFIED：3 parts / 226 checks，exit0。** 同池压力4条全部通过；legacy-auto raw settings、同Tx bootstrap提交与回滚、错误指针拒绝通过。
- 并发创建6次仅1次创建、独占lease、owner隔离、原输入指纹冲突、onReserved失败全回滚、冻结报价、current关闭/poison不重价、单次consume、已完成视频产物不覆盖、creation_unknown与hold保留、Canvas原结果与upstreamStarted防重放均通过。
- 新增检查数含新旧出口同函数验证和新Tx覆盖，不冒充148个新增业务场景。

### 既有回归

- `verify-billing-async-tasks`、`verify-video-postgres`：原子创建/预占、未知处理、租约、结果checkpoint、终态、原价、一次退款/结算通过。
- `verify-billing-config`、wallet、platform PG29：配置并发初始化/CAS/恢复、真实余额/unknown hold、事务与独立协调池通过。
- Canvas task boundaries21：原回执、原3积分、单次consume、lost response重放0、job repost0。
- frozen-source双入口：8用例/16入口检查，sources冻结与旧control10回退通过；真实PG，submission execution scope仍为synthetic，workflow依赖actual，界限不扩大。
- model publication、creation writers通过。
- 原登录handler195用户与原settings/schema29/90回归通过；后者使用R4A2保留的settings expectation并核对SHA，不冒充新的旧版执行。
- TypeScript全项目检查和受影响TS lint exit0。

### 明确保留的旧 verifier 债务

`verify-video-reliability.mjs` 在本轮完整旧源码与新版均 **exit1**，同一 `pollAndSettle body exists` 源码文本提取断言；后续断言均未执行。没有把它改成无条件通过，也没有将其他PG结果冒充该脚本全部覆盖。原/新失败与本轮其他成功命令、日志、输入、退出码都留在 VERIFICATION。

## 结构结果

- `db.ts` **3769 → 2361 行**，emitted静态消费者 **87 → 64**。
- 53个声明迁移；旧db保留122个声明，其他37文件370个声明对照保持，例外明确为上述tx参数/配置读取改动与类型定义。
- 原含db的6文件动态环拆开，剩余视频域2文件小环；所有新owner不在SCC。全项目最大20视频协议环、图片恢复12、模型组装8、身份/creation/billing7与其他小环仍在。
- 既有 Canvas late-completion/终态回执、running DDL与跨tab CAS等并未在纯迁移中自动解决；后续按真实行为进一步收敛。

## 交付与下一步

本轮为main同步后的第1模块。继续独立完整重构候选，不合main、不部署。四产物和副本回滚结果位于 `output/refactor-r4a5-20261024`，最终commit/remote/cleanup在 `DELIVERY.json`。继续剩余db的模板/会话/管理用例、R4B初始化与配置组装、R5协议/Worker和完整候选验收。
