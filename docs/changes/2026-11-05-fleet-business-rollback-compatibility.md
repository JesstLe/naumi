# Fleet 业务查询：保留状态的回退兼容性审计

> 后续状态：本文的源码链和纯内存输出固定描述 `92bc0166` 审计时点。后续 [心跳协商修复](2026-11-05-fleet-business-heartbeat-negotiation.md) 处理了无条件发送 `business:1` 的路径；它没有解决本文的旧 consumer/保留业务行问题，也没有建立可用生产 rollback image floor。该 Major 和正式发布 gate 继续保持未完成。

## 状态与证据边界

- 审计对象为 PR #11 的 Fleet 业务查询切片。只读核对时工作树 HEAD 为 `92bc0166e8458a949de3ab017767f01a096294da`；`git diff --quiet 429a3d85470e0217647532845882d3b0ad1b274f HEAD -- src` 返回 0，生产 `src` 与已审 `429a3d85` 相同。
- 对照版本固定为 pre-PR base `268076b7fb4900509817af7321ad34a85698c86c`。本文的 `base:` 行号来自该版本的 `git show`，不指当前工作树同号行。
- CodeRabbit 主评论的架构段来源为 `output/fleet-business-fixture-clock-20261105/NOTIFIED_429_MAIN.json`。本文复核了其中三条 conditional downgrade 路径，不把评论的风险分级当作实际生产事件证明。
- 本轮没有 SSH、生产 SQL、服务启动、流量切换或生产回退。没有证明现场已经发生披露、心跳故障或控制命令阻塞，也没有核验实际 rollback image、当前流量路由及 retained business 行。
- 103/47 发布与 main 合并状态、当前 SHA 的 CI/复审覆盖需要对应 owner 单独核验。本文不以本地源码审计代替这些结果，也不建立正式 rollback floor 或实现新 gate。

## 已证明的三条条件路径

### 1. 旧 generic Fleet GET 可返回保留的业务结果

源码链：

1. `base:src/app/api/admin/fleet/route.ts:4-6`：GET 经 `fleetOperator()` 后直接返回 `fleetSnapshot(actor)`。
2. `base:src/lib/fleet/server.ts:25-34`：已登录账号存在有效 `read` grant 时可进入 delegated operator 路径。
3. `base:src/lib/fleet/server.ts:104-113`，关键 `:109`：generic history 选择 `c.operation,c.result`；目标实例只要求有效 `read` grant，额外能力限制仅覆盖 `creations.list/creations.media`。`business.query` 未被排除，因而其结果可随查询返回。
4. 当前 `src/lib/fleet/business-contracts.ts:18-36`：业务快照可以包含账号标识、余额/积分、订单金额与支付时间、账本变动等字段；这不是只含控制命令状态的记录。

成立条件为：业务 command/result 已写入且保留、旧 central 正在服务该 GET、账号对该实例有有效 read grant，并且该记录进入按创建时间降序返回的 latest 100。latest 100 是范围限制，不是 business 授权隔离。本文确认该源码路径，没有证明这些条件已在生产同时成立。

当前版本的对应边界为 `src/lib/fleet/server.ts:110-112`：generic history 在 LIMIT 前排除业务行；`:124-129` 的专用 `fleetReadCommand()` 按 command/instance/type 限定，并复核 `read + business`、账号未停用和实例启用状态。回退旧 central 会丢失这些边界，即使数据库本身完全保留。

### 2. 旧 strict heartbeat schema 拒绝新 connector 的 business:1

- `base:src/lib/fleet/contracts.ts:32-33` 的 `statusSchema.strict()` 没有 `business` 字段，poll schema 嵌套此 schema。
- `base:src/lib/fleet/server.ts:151` 在 heartbeat update 和 command dispatch 之前解析 poll body；新字段导致 schema 拒绝。
- 当前 `src/lib/fleet/local-status.ts:56,64` 明确发出 `business:1`；当前 `src/lib/fleet/contracts.ts:35-36` 接受可选 `business:1`。
- `docs/changes/2026-11-04-fleet-business-protocol.md:42` 记录的是先新 central、再新 connector 的升级顺序；该升级兼容性不等于支持任意反向降级。

因此，先回退到旧 central、仍保留新 connector 的顺序存在 heartbeat 不兼容。本文没有观察生产连接因此失败。

### 3. 只回退 connector 不能解除旧 central 的业务队头阻塞

- `base:src/lib/fleet/server.ts:166` 按 `created_at,id` FIFO 选第一条 queued/leased command，没有 business capability、业务 freshness 或控制优先级分流。
- `base:src/lib/fleet/server.ts:176-179` 在 queued 或租约到期时更新租约，然后将记录中的 operation 送入 `signCommand()`。
- `base:src/lib/fleet/contracts.ts:6-16` 的 operation union 不含 `business.query`；`:29` 的 command schema 引用它；`:60-62` 签名前执行 `commandSchema.parse()`，因此新类型被拒绝。
- `base:src/lib/fleet/server.ts:182` 对异常执行事务 rollback。该次租约更新不会提交，原业务队头仍保留，下次 poll 可再次遇到同一记录，后排 `users.ban` 得不到派发。尚未过期的业务租约也会占据旧 FIFO 头部，到期后进入上述解析失败路径。
- 旧 connector 同样在 `base:src/lib/fleet/connector.ts:18-20,90-92` 使用旧 command/operation parser。回退 connector 本身不会清除 central 已保留的新类型记录。

成立条件包括：旧 central 生效、相应实例保留队头 queued/leased business command，且存在后排控制命令。本文确认旧 schema 和调度事务的组合路径，没有运行生产队列或证明生产 ban 已被阻塞。

当前 `src/lib/fleet/server.ts:185` 只向明确广告支持的 connector 选择新鲜业务读，并优先控制类；`:198` 使用支持 business 的签名合同。当前 `src/lib/fleet/contracts.ts:7-8` 将业务 query 纳入 operation union。这些当前边界不能替旧 image 提供兼容保证。

## 已执行的纯内存探针

以下探针在前一只读审计阶段执行；本文档补录阶段没有重跑测试。探针通过 `git show 268076b:<path>` / 当前文件读取实际 TS 模块，用现有 TypeScript 将其及依赖递归转译到内存后执行，没有写入源码、fixture 或构建文件，也未连接数据库或生产服务。

输入使用公开合成值：合法 UUID、`fixture-root`、`fixture@example.test`、公开 fixture signing token；status 含合法 source/version/storage/nas/connector，并分别携带或完全移除 `business:1`。业务操作为 `business.query`、`view=usage`、`days=30`、当时有效 `asOf`、`page=1`、空 search；ban 对照为 `users.ban`、`banned=true`、`expectedBanned=false`。

字面相关输出如下，探针进程 exit 0：

```text
BASE_268_STATUS_BUSINESS1=false
HEAD_STATUS_BUSINESS1=true
BASE_268_STATUS_NO_BUSINESS=true
BASE_268_SIGN_BUSINESS=REJECTED_ZodError
HEAD_SIGN_BUSINESS=SIGNED
BASE_268_SIGN_BAN=SIGNED
CONTRACT_PROBE_EXIT=0
```

这证明旧/new parser 对相同业务类型及新 heartbeat 的不同处理；它不是 retained-state PostgreSQL/HTTP 回退演练，也不是实际镜像验证。generic GET 的条件披露链由前述真实源码 SQL 核对确认，本阶段没有新跑数据访问集成测试。

## 现有 preparation 的实际回退解析与 HOLD

准备目录为 `output/fleet-business-data-20261104/deploy103-preparation/`。

### 默认硬停仍有效

- `MODIFIED_FILE.py.template:8-12` 固定 `PREPARATION_ONLY=True`，在 ops imports/HostTransaction 之前 exit 78。
- 前一只读审计实际执行下列原命令：

```text
python -B output/fleet-business-data-20261104/deploy103-preparation/MODIFIED_FILE.py.template output/fleet-business-data-20261104/deploy103-preparation/CONFIG_TEMPLATE.json --validate-only
stdout: PREPARATION_ONLY:ROOT_FILL_AND_REVIEW_REQUIRED
exit: 78
```

- `CONFIG_TEMPLATE.json:12-13`、`MODIFIED_FILE.py.template:48-50,68` 固定的 `268076b`/旧 image 是 historical predecessor 绑定，不是经 retained-state 验证的兼容 rollback target。
- `ROOT_FILL_REQUIREMENTS.json:24-35` 和 `verify-preparation.py:20-31,46-54` 尚未要求一个受支持 central rollback image floor 及其保留状态矩阵证据。现有 exit 78 是总体 preparation HOLD，不应表述成已经实现专门的 business downgrade gate。

### 实际调用的是 mapping.Release.rollback，不是旧 refactor 回切实现

- `MODIFIED_FILE.py.template:147` 定义 `Release(mapping.Release)`；`:301-307` 在异常分支调用继承的 `release.rollback()`。
- 其 hash-pinned 来源为 `E:/Workspace/naumi-refactor-main-owner-sync-20261103/output/deploy-refactor-103-268076b-20261104/ops-bundle.tar.gz` 内 `ops/release103_mapping.py:241-253`。该方法在 ingress 已改变后不恢复旧代码/入口；它保留新候选及原始 receipts，进入 `CLEANUP_PENDING` 或 `UNKNOWN`。只有未切换、gateway 仍匹配原前像、原 worker 已暂停且没有未知 operation 时才恢复原 worker。
- 同一 bundle 中 `ops/release103_refactor.py:317-336` 存在另一个程序/入口回切实现，但它不是本模板解析到的 rollback 方法，不能据其名称推断当前会自动执行旧 central downgrade。
- `PREPARATION.md:54-55` 明确不自动回旧代码、不恢复数据库、不重放 accepted tasks；copy route rollback 不等于生产业务兼容。
- `MODIFIED_FILE.py.template:256-288` 的 rollback check 是检查模式，`:285-287` 明确 `liveRollbackExecuted=false`、`businessCompatibilityEstablished=false`；`ROLLBACK.sh:5-15` 只允许两个隔离 rehearsal copy 路径并先做 hash guard。

结论：当前 preparation 没有发现自动回切到 `268076b` 的有效执行路径；但保留旧容器、备份和副本字节恢复均没有建立生产降级兼容性。保持 `PREPARATION_ONLY=True` 和发布 HOLD，直至 owner 取得正式候选、流量、保留状态及镜像兼容证据。本文不修改 guard，也不宣称这些缺口已关闭。

## 旁路 candidate 的时间窗口

条件风险不一定始于正式 cutover：如果新 candidate 的真实业务页面/native API gate 与旧 public central 共享 command 数据库，candidate gate 可能在切换前已经持久化 business command/result，而旧 public GET 仍按旧规则服务。此时前述业务结果暴露条件窗口可以早于 cutover。

这只是由共享 DB 和并行服务条件推出的发布窗口，不是已确认的现场拓扑或事件。发布 owner 需要明确 candidate 与 public 的数据库关系、实际写入时点及流量归属；不能仅依据“网关尚未切换”推断尚无 retained business 状态。

## 最窄下一步验证矩阵：待执行，不是已实现 gate

先由 owner 选择实际可构建、可识别的 central rollback 候选，记录 source SHA、immutable image identity 和镜像内实际产品字节。保留 `268076b` 作为预期不兼容负面对照。不得只按 SHA 大小、时间或 git ancestry 填写最低兼容版本，也不得仅把当前源码 PASS 文本绑定到一个未测试 image。

在同一隔离 retained-state fixture 中使用下列最小数据：一个实例、一个只有 read grant 的 delegated operator、一个已完成且含合成金融快照的业务 command、一个 queued 业务 command、一个仍持租约的业务 command 及其源 receipt，以及排在业务读之后的合成 `users.ban` 控制。保持原 command/lease/receipt identity，不删除结果、不清队列、不恢复 DB，不执行积分调整或付费操作。

| 验证项 | 必须观察的结果 | 现有覆盖与缺口 |
| --- | --- | --- |
| 保留成功业务结果后读取 generic GET | read-only operator 不收到 business result；正常控制历史仍可见 | `scripts/verify-fleet-business-queue-compat.ts:85-110` 已覆盖当前版本 history/scoped 权限；未绑定实际 rollback image |
| 保留新 heartbeat 后连接 rollback central | `business:1` 不破坏认证后的正常 poll/控制派发；旧 heartbeat 仍兼容 | 纯内存契约探针已有旧版本反例；未完成实际 image/HTTP 矩阵 |
| queued/leased 业务记录在前、ban 在后 | 合成 ban 可按支持合同派发/完成；原业务 ACK、lease 与幂等 receipt 不被伪造或重置 | 当前 queue verifier 的 `:111-112` 接入控制优先级；未演练实际 rollback image 和两种顺序 |

上述三项分别覆盖两种顺序，每个中间态都检查 generic GET、heartbeat、ban 及保留的 command/receipt：

1. **central-first**：新 central + 新 connector 已留下状态 → central 切到 rollback 候选、新 connector 暂时保留 → 再换旧 connector。不能只检查最终旧/旧组合而跳过新 heartbeat 中间态。
2. **connector-first**：新 central + 新 connector 已留下状态 → 先换旧 connector、新 central 暂时保留 → central 再切到 rollback 候选。旧 connector 的不广告 business 能力不能代替对 retained queued/leased 行的检查。

fixture 必须保留每一步的实际 image identity、输入、响应/结果、退出状态和 retained-state 前后证据。只有通过该矩阵的具体 central 构建才可作为受支持 rollback 候选证据；它仍不自动证明生产路由或现场状态满足发布条件。

本记录不实现新 gate、不设计清理或取消协议、不增加生产开关、不授权回退/部署。下一步应先收齐当前 SHA 的 CI 和复审结果，再由发布 owner 在现有 preparation 中完成正式兼容准入与现场证据闭包。
