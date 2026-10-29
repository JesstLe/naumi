# 发布任务快照有界采集（2026-10-29）

## 模块与职责

本轮独占 `scripts/ops/release47_task_snapshot.py` 及专属测试；基线 `3b6a5279b4364590954751e8f5b5c9d566010806`，工具提供 worktree `t3-5d85cea8` / 分支 `t3/release47-snapshot-pagination`。父线程统一 A/D 编号与串行整合。本模块只生成保留性证据，不提交/重放/恢复任务，不变更 COMPLETE 门禁或历史债。

已读当前 AGENTS、协作规则、容量审计第七章末、RELEASE_LIFECYCLE 及 e1878018 发布记录。那轮的 17,955 个 ID 集合一致不等于 frozen context、供应商绑定、父子闭包和账务保留已验证。本任务没有线上操作；47 运行版本仍按父线程记录 e1878018 / 1793247893，不在本任务重新探测。

## 真实复现

- 独占 PostgreSQL 16 fixture，loopback 随机端口、`naumi.fixture=capacity-release-snapshot` label、固定完整容器 ID；仅合成数据。所有测试 subprocess 使用大小写无关环境白名单，保留 SYSTEMROOT，不读项目 env 或生产凭据。
- 256 个历史终态大 snapshot（每行 1 MiB images 加 256 KiB paid result）及父/子两行。原 graph EXPLAIN 的物化 CTE 实际 258 行，筛后仅 1 行；selection 同样先投影全部 258 行。原语句 376.446 / 101.007 ms 是本机该样本观测，不是生产性能。
- 活动 `imagegen-parent` 引用终态 `gen-child`，原 collector 仅采父行；子行原 frozen prompt/paid child gatewayIdentity 变化仍未被比较发现。
- 逆序 10 层 supplier parent_call_id 链在原四轮扩张后缺失节点；后端 LIMIT 不构成前置读取预算。
- 已选中的 batch child operation ID 保持不变、仅把 batch_id 改为另一父批次，原 compare 仍通过。真实独立复现后补入 batch_id 投影和原绑定比较。
- 上述是本轮可复现的源码/真实 PG 缺口。新增预算契约在旧版失败不单独计为生产 bug。

## 公共接口、依赖方向、数据与一致性

`collect_task_snapshot(command, db_identity, private_save, ..., budget=None)` 保留调用方接口与只读命令注入；新增可收紧的全局 budget。不新增 DB 驱动、服务、表、索引或生产 DDL。`current_activity_collector` 的 release_activities 实例过滤仍生效，不扩展成业务任务过滤。

1. 从 pg_catalog 校验真实 PK；复合 UUID/int 用原生列元组游标，不按 created_at、不用 OFFSET，不把业务 child_operation_id 当实际 batch PK。
2. 每页先 `page_keys AS MATERIALIZED (... ORDER BY native_pk LIMIT page_rows)`，再投影状态和必要关系 ID。图中只保留小的 status/childJobIds/operationIds/直接关联列；不传图片结果或原始供应商 receipt。paid root 与 indexed child IDs 一并进入图。
3. 有界图上做固定点闭包而非固定四轮，保留原 active 状态定义；显式 children.jobId 双向连通。原 ID 是独立 seed，即使已终态仍直读原行。缺失显式 child 留 unknown。
4. selected IDs 通过 `jsonb_populate_record` 转成真实键类型后直接探测；先限定键，再计算原 frozen digest。保留原 top-level paid binding，增加 indexed child binding、batch_id 与父→child 原引用；新增引用允许，已有引用变化不当普通进度。
5. ledger 与 billing 全表保护摘要仍是原 SHA256 leaf 双 64-bit sum 算法，但按 PK 页累加，不用一条无界全表 JSON 聚合。比较摘要并不替代选中原 ledger 行比较。
6. 一次采集仍是同一个 READ ONLY REPEATABLE READ 事务，避免跨页把新增、删除或状态变化拼成假一致快照。事务不是无限长搬图：全程 60 秒硬预算、每句不超过原 5/15 秒且受剩余时间约束、锁等待 1 秒、idle 5 秒；证明输出和图字节均受限。没有跨事务重试或自动扩大预算。
7. 有界 traversal state 只放事务本地 GUC，COMMIT/失败退出即释放，不创建 TEMP 或持久表。psql `gexec` 只执行生成的 SQL 页；客户端保留原 command/锁调用链，不旁路开连接。

默认上限：page 128 行、scan 100,000 行、selected 全局 20,000 行、2,048 页、graph 8 MiB、proof 8 MiB、单页输出 1 MiB、root 40,000（同时保留 row_limit×8）、总时长 60 秒。单表 row_limit 保留 1..5,000。预算不是生产容量宣称；超出即 incomplete，不截断后报完整。

## 保留性与失败

- 预算结果在私有 `collection` 中记录计数、每页条数/字节、状态；所有已存在表在整体失败时不标 observed。`preservationVerified=false`；drainProven 始终 false。
- SQL timeout/连接错误仍抛出原采集错误，private_save 先写 `task-preservation-incomplete-v2`（false、SQL hash、预算、prior hash）。不把失败标成空表或清除旧 UNKNOWN。
- proof v2 增补了父子/嵌套绑定证据；缺失这些字段的旧 image proof 不追认成完整 v2；v2 与缺失完整 collection v2 的旧 baseline 混比同样返回 unknown。历史原件不改写，也不因此清历史债。
- 已明确账务 reservation 消失仍要求原有人工 conservation review；没有放宽为自动完成。

## 验证命令、结果及证据层级

最终专属集中回归共 **37 项**，同一个测试脚本、同样的合成输入：

- BASELINE：17 通过 / 20 失败，exit 1；不是 20 个生产 bug，失败集合包含新增分页/预算/证据能力契约。
- MODIFIED：37 通过 / 0 失败，exit 0。
- 关键覆盖：大 TOAST snapshot 与前置页 EXPLAIN；重复 created_at；原生 UUID/int 复合 PK；业务 identity 与 batch PK 分离；正反父子与 10 层固定点闭包；nested paid / batch 绑定；frozen context；原 ID 终态与新增行；删除原行；旧 UNKNOWN 未见不关闭；同一 MVCC snapshot 下并发新增/删除、下轮确切检测；每个全局预算、真实 statement timeout 留证；缺少 PK、缺失 child、旧证据、未支持深层 paid 结构均 incomplete；恰好 5,000 行、5,001 行、9 MiB proof 拒绝；full 模式小记录和原 512 KiB 单表字节上限。
- 原模块单元：21 通过 / 1 旧 isolated fixture case 未执行（它绑定另一历史数据库名称，本轮不读取该库）。本轮真实 PG 由上述专属 37 项承担，不把 skipped 记为通过。
- 既有窄调用方/门禁 fixture：normal-policy 37、enterprise-history 4、completed-image-proof 4 均通过。它们是 Python fixture，不升级为真实发布验收。
- 最终源码兼容 Python 3.10：初稿在本机 Python 3.14 可解析，但实际 3.10 编译发现 f-string 表达式语法问题；仅提取表达式常量，12 组生成 SQL 与修改前逐字节一致，再用真实 Python 3.10 运行本轮 BASELINE/MODIFIED 全套。临时解释器放本任务 ignored output，不修改系统 Python 配置。
- `git diff --check` 与两份 Python 源码 py_compile 通过；只针对本模块集中验证，没有无关 Next 构建。

复用入口（默认新建独占本机 PG、随机 loopback 端口、专属 label，结束停删自己的容器）：

```powershell
python scripts/ops/verify_release47_snapshot_pagination.py --phase MODIFIED --output output/snapshot-pagination-check
```

本轮实际 `--module`、`--fixture-id`、解释器路径、每条 SQL input/stdout/stderr/exit 保存在 `output/capacity-release-snapshot/PHASES.json` 和 `delivery/<PHASE>/RESULT.json`。受控 fixture `2f65edd1...` / loopback 57147 由本线程创建，最终停止回执在 VERIFICATION.txt。测试不访问任何业务 HTTP / 浏览器 / 供应商。

### 四产物与副本恢复

本工作树 ignored `output/capacity-release-snapshot/`：

- `MODIFIED_FILE.tar`：本任务四个源码/测试/文档文件，不含 env。
- `DIFF_FILE.patch`：本任务全部变更。
- `VERIFICATION.txt`：BASELINE/MODIFIED/ROLLBACK 精确命令、input、literal stdout/stderr、exit、hash 与重开结果。
- `ROLLBACK.sh`：可执行，仅允许该目录 `rollback-copies/` 内带独立 marker 的副本；预检所有 modified hash，后来编辑触发 exit 73、零写入。恢复原两文件并删除副本新增两文件，源码工作树保留修复。

原 collector SHA256：`bd09e0c5cac7ee145c64ffec75fc057c409f9da770cf284fccfe8bbf79e26b95`。恢复脚本绝不操作 DB 或线上容器；ROLLBACK 阶段复跑同套真实本地 PG，恢复原版行为的结果以 VERIFICATION 为准，不能把恢复旧缺陷的 exit 1 写成修改版失败。

本任务层级是 Python 源码、SQL、真实隔离 PG；不含 HTTP、浏览器、实际供应商、生产容量或完整发布生命周期验收。不复用其他任务 PASS。

## 未完成项与下一步

本切片固定提交交父线程独立复核和串行整合，未在共享 main 合并或推送；四产物执行回执与提交 SHA 在最终交接中。45 笔手术、线上索引、历史债、生产完整快照与容量验收仍挂账。本工作树不推/合共享 main、不 PR、不部署。


### 接手续办提示

```text
仅复核当前固定提交的 release47_task_snapshot.py 与专属 PG 回归。先核对 VERIFICATION 与原/改 hash，确认 37 项实际输入和回滚副本结果；不要沿用其他任务 PASS。原 ID 集合、旧 v1 proof、分页 incomplete 都不升级为 preservationVerified。后续实际采集须重新取得完整 v2 baseline，按原锁/生命周期协议执行；此提交不解除历史债、不触发部署。A/D 编号由父线程统一分配。
```
