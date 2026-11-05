# 保留业务查询的时间戳不阻断控制派发

## 模块、调研与基线

- PR #11 审查 `5777655567` 对提交 `5c3c9584b7908b27a2a1862f5f03814602540b5d` 提出 diff 外意见：`connectorExchange` 的候选选择直接把保留 `business.query.operation.asOf` cast 为 `timestamptz`，非法时间会在排序之前让事务失败，连同后排控制命令一起无法派发。
- 本地真实 Zod 契约接受 `0000-02-29T00:00:00Z`，PostgreSQL 16.15 拒绝 year zero。相同风险还包括非法日历、超范围年月、非法时间、垃圾文本及错误 JSON 类型；公共新入队 HOLD 不会修复已经保留的行。
- 基线为上述 `5c3c9584`，分支 `codex/fleet-business-data-103-20261104`。修改前已保存四路径的原始字节、SHA-256 或不存在状态到 `output/fleet-business-retained-timestamp-20261105/original/` 与 `ORIGINAL_HASHES.json`；已刷新 origin/main，未整合或发布整条重构线。

## 职责、依赖与实现

- 修改只属于中央派发候选选择，不改变 producer admission、业务读模型、签名、权限、连接器执行器或账务写入。
- 对业务行使用 `CASE WHEN capability AND format-match AND pg_input_is_valid(asOf,'timestamp with time zone') THEN asOf::timestamptz > cutoff ELSE false END`。格式匹配为下述后续审查补强；只有 UTC 业务格式和 PostgreSQL 日历/范围验证都通过才进入 cast，避免依赖 AND/OR 求值顺序，也不复制日期/月长/闰年解析器。
- 原来的控制优先、各类 `created_at,id` FIFO、严格 `>` 时效边界、活跃控制租约、原租约 ACK、重复终态与冲突拒绝规则保持。非法时间行只从该次派发候选中跳过，不删除、不修改 operation/fingerprint/state/lease/result。
- 依赖 PostgreSQL 16 的 `pg_input_is_valid`。仓库根 compose、staging compose 与本 CI 均固定 `postgres:16-alpine`，本地 fixture 实测 `server_version_num=160015`；本轮未读取或迁移生产数据库版本。
- CI 仅新增定向 runner 步骤与结果上传路径，不改任何阈值或账户配置。

## 验证设计与证据层级

- 新增 `scripts/verify-fleet-business-retained-timestamp.mjs`，读取实际 server / contracts / business-contracts / business-support。它完整提取实际 `connectorExchange`、schema readiness、control enqueue、鉴权 body 解析及相关函数，运行真实 PostgreSQL 事务和认证的 loopback HTTP poll/ACK；仅应用 schema bootstrap 与 rate limiter 是有限替代。
- runner 只连接显式隔离标志允许的 `127.0.0.1:65298/postgres`，拒绝 URL query/fragment。它每轮创建自己随机命名的 `fleet_timestamp_<uuid32>` 数据库，验证物理库名后建 fixture；先关 HTTP 与 Pool 再只删除该 owned 数据库，不重置已有 protocol/source 数据库或容器。
- 覆盖十类非法 `asOf` × queued/leased × business-capable/legacy status，共 40 组；检查控制仍签名派发、租约提交及非法保留行的完整身份/状态不变。另覆盖有效时间、严格时效边界、未来时间的既有行为、控制 FIFO/活跃租约、有效读 FIFO、错误/重复/冲突 ACK 和 bearer 验证。
- 合成保留历史只在已证明身份的随机 fixture 库里直接插入；公共 `enqueueCommand` 仍执行实际硬性 HOLD，并验证其在 pool 访问及建表前拒绝新业务查询。控制入队保持实际实现。测试只验证派发/ACK，不执行收到的用户变更，不冒充真实源业务查询或线上数据验收。
- 实际父提交基线复现 **235 项 / 55 失败**，exit 1；包括 year-zero 使 business-capable poll 返回错误、控制保持 queued，事务发生回滚。随机数据库已实际删除。
- 初次修改后矩阵有 6 项 FIFO/后续 ACK 断言失败：fixture 只固定了第二个控制的创建时间，首个控制仍用真实 DB 时钟，运行超过一秒后顺序可能反转。现为两个控制都写入明确的固定先后时间，断言与产品 SQL 均未放宽；初版 runner、235/55 基线及 235/6 失败输出分别保留为 `INITIAL_RUNNER_FIFO`、`BASELINE_INITIAL_FIFO`、`MODIFIED_INITIAL_FIFO`，之后用同一最终 runner 重测父提交和修改后版本。

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
node scripts/verify-fleet-business-retained-timestamp.mjs --baseline=5c3c9584b7908b27a2a1862f5f03814602540b5d --output-dir=output/fleet-business-retained-timestamp-20261105/tests/baseline
node scripts/verify-fleet-business-retained-timestamp.mjs --output-dir=output/fleet-business-retained-timestamp-20261105/tests/modified
```

工作目录为 `E:/Workspace/naumi-fleet-business-data-103-20261104`。修改后 PG/HTTP、既有 heartbeat negotiation、公共 admission、focused ESLint、全库 TypeScript、runner 语法及差异检查统一集中运行；确切命令、环境输入、stdout/stderr、退出码和副本回滚结果见本轮 `final/VERIFICATION.txt`。

集中验证结果：最终相同 runner 的父提交为 **235/55、exit 1**，修改后为 **235/0、exit 0**；114 项 heartbeat negotiation、20 项公共 admission 检查、server.ts ESLint、全库 TypeScript、runner 语法及差异检查全部通过。运行 PostgreSQL 16.15；各轮随机测试库均已确认删除，既有 protocol/source fixture 未重置。

## 交付与未完成项

- 四份产物位于 `output/fleet-business-retained-timestamp-20261105/final/`：`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。仅指定独立 rehearsal 副本可回滚，先校验全部文件及必需依赖；任一 later edit 拒绝且零写。实际工作树保留修复。
- 副本回滚读取真实恢复的 server 与依赖，重新复现 235/55 基线；每次 PG/HTTP 验证均使用自己的随机库并实际清除。缺源立即失败，不回退工作树。记录 Git/本地/CI/生产为不同证据层级。
- 公共 `business.query` admission 继续硬性关闭；共享队列的生产 consumer/回退闭包、正式 image floor 等既有未完成项及 `PREPARATION ONLY / HOLD` 均不变。
- 本轮无合 main、103/47 发布、SSH、生产 SQL、permit 发行、钱包或账务合并、任务重放。Actions 账户门禁与新 SHA 审查另行核对；本地 PG/HTTP 通过不替代远端 CI 或生产验收。

## 后续 Major：PG 可解析但业务格式非法的时间

- 审查 `5777891898` / `4475014407` 对提交 `7f5687f79aa5228fee14637ef4897146f6083dd8` 指出：`now`、`infinity`、带 offset、缺秒等值可能通过 PostgreSQL cast/freshness，却在 `signCommand` 的真实 Zod command schema 解析时失败；queued 行反复回滚，leased 行也可能凭有效租约挡住后面的业务读。
- 本轮在原 CASE 的 WHEN 中增加绑定参数 `$4` 的 UTC 格式匹配，要求四位年、完整日期、大写 T/Z、00–23 时、00–59 分秒和可选任意长度小数秒；不允许相对/非有限值、offset、缺秒、大小写放宽或空白。格式来自当前真实 `fleetBusinessQuerySchema` 的 `z.string().datetime()` 行为，runner 同时验证真实 Zod 与 PG 的接受差异；日历/年份范围仍由 `pg_input_is_valid` 校验。
- SQL 为固定文本，instance/capability/cutoff/格式均通过 bind parameters 传入，不插入调用者文本。声明格式值在实际 `connectorExchange` 函数内定义，既有真实函数提取 runner 自动携带，不增加隐式全局依赖或修改生产 schema。
- 原 235 项矩阵保持，新增 16 类 PG-valid/Zod-invalid 值 × queued/leased（32 组），真实先派发并 ACK 控制，再核对后面的有效业务读取可签名派发、租约提交及坏行的全字段不变。另保留 legacy 不开放业务路径，并覆盖无小数秒、1 位与 9 位小数秒、0001/2000 闰日/9999 等真实业务格式及原有时效比较。
- 真实父提交在同一最终 runner 中复现 **523 项 / 55 失败、exit 1**，包括 `now` / `infinity` queued 签名失败和 leased 占住队首；原有非法 PostgreSQL 时间、控制优先与 ACK 矩阵继续通过。每轮仍只使用并删除自己的随机 fixture DB。
- 修改后 **523 项全部通过、exit 0**；114 项 heartbeat、20 项 admission、server ESLint、全库 TypeScript、runner 语法及差异检查均通过。此前原生 PG cast 保护与本次业务格式保护同时保留，未关闭或弱化已有断言。
- 首次写入前保存本轮三路径原始字节/hash到 `output/fleet-business-retained-timestamp-format-20261105/original/` 与 `ORIGINAL_HASHES.json`。本轮只修改 server、既有 PG/HTTP runner 与本记录；现有 CI 已运行该 runner，无需再改配置或阈值。
- 四份产物、真实 BASELINE / MODIFIED / ROLLBACK 命令、环境和输出独立保存在该目录的 `final/`，旧轮封存不覆盖。副本回滚恢复实际旧 server/runners/docs，再以当前 523 项 runner 读恢复源码复现该基线；后续修改零写拒绝、缺源在创建 DB 前失败。
- 本修复只约束时间字段，不声称完整损坏 operation 的通用修复。公共 admission、原 ACK 与生产发布 HOLD 保持，不执行合 main、部署、生产 SQL、permit 或任务重放。

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
node scripts/verify-fleet-business-retained-timestamp.mjs --baseline=7f5687f79aa5228fee14637ef4897146f6083dd8 --output-dir=output/fleet-business-retained-timestamp-format-20261105/tests/baseline
node scripts/verify-fleet-business-retained-timestamp.mjs --output-dir=output/fleet-business-retained-timestamp-format-20261105/tests/modified
```
