# 发布任务快照有界采集（2026-10-29）

## 模块与职责

本轮独占 `scripts/ops/release47_task_snapshot.py` 及专属测试；基线 `3b6a5279b4364590954751e8f5b5c9d566010806`，工具提供 worktree `t3-5d85cea8` / 分支 `t3/release47-snapshot-pagination`。父线程统一 A/D 编号与串行整合。本模块只生成保留性证据，不提交/重放/恢复任务，不变更 COMPLETE 门禁或历史债。

父线程现已完成固定子提交 `2cd03246447625a828f352b5539601c4fb3af031` 的独立审查与后续修复，登记 **A42–A49 / D24–D31**，证明能力升级为 **v3**。下面保留原子任务实测；当前行为和父验收见末节。代码整合不是47发布，历史债不追认。

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
5. 原v2 ledger/billing摘要按PK页累加SHA256 leaf双64-bit sum；父v3另把ledger原ID→原行SHA256存入私有有界图，逐原记录比较，合法新增允许。旧摘要计数增长不再作为原历史未改的充分证明；公开结果只给摘要/指纹，不投影私有ID集合。
6. 一次采集仍是同一个 READ ONLY REPEATABLE READ 事务。SQL工作期限默认60秒，初始statement timeout也不超过总期限；初始化后每条SQL前及gexec每页前按事务年龄重新缩短额度，每句仍不超过原5/15秒、锁等待1秒、idle不超过5秒。到期/超时或最终elapsed超过预算不产完整证明。该期限不是远程Docker往返/调度精确毫秒SLA；外层命令传输另保留10秒容错，不将其当SQL新增工作预算。没有跨事务自动重试或扩大预算。
7. 有界 traversal state 只放事务本地 GUC，COMMIT/失败退出即释放，不创建 TEMP 或持久表。psql `gexec` 只执行生成的 SQL 页；客户端保留原 command/锁调用链，不旁路开连接。

默认上限：page 128 行、scan 100,000 行、selected 全局 20,000 行、2,048 页、graph 8 MiB、proof 8 MiB、单页输出 1 MiB、root 40,000（同时保留 row_limit×8）、总时长 60 秒。单表 row_limit 保留 1..5,000。预算不是生产容量宣称；超出即 incomplete，不截断后报完整。

## 保留性与失败

- 预算结果在私有 `collection` 中记录计数、每页条数/字节、状态；所有已存在表在整体失败时不标 observed。`preservationVerified=false`；drainProven 始终 false。
- SQL timeout/连接错误仍抛出原采集错误，private_save 先写 `task-preservation-incomplete-v2`（false、SQL hash、预算、prior hash）。不把失败标成空表或清除旧 UNKNOWN。
- proof v2 增补了父子/嵌套绑定证据；缺失这些字段的旧 image proof 不追认成完整 v2；v2 与缺失完整 collection v2 的旧 baseline 混比同样返回 unknown。历史原件不改写，也不因此清历史债。
- 父v3进一步要求paid状态和全局ledger原集合证明；v1/v2与v3混比不追认，需在新版本重新采集真实before/after。旧私有文件保留。失败记录仍使用可读的`task-preservation-incomplete-v2`容器格式，其中明确false，不代表已取得v3完整证明。
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
核对父v3修复与专属PG/反例回归。先读父VERIFICATION和原/改hash，原ID集合、v1/v2 proof、incomplete都不升级为preservationVerified。后续实际采集须重新取得完整v3 baseline，仍按原锁/生命周期协议执行；代码整合不解除历史债、不触发部署。
```

## 父线程审查修复与验收（2026-10-29）

父基线 main `2c2d194e5284ed640ff96673d2c0f894edde7a63`；先普通合入固定子提交，再直接处理独立review的2项新增P2和5项既有保护缺口。review固定现场见 `C:/Users/13357/.t3/worktrees/naumi/t3-595d77d0/output/capacity-release-snapshot-review/REVIEW.md`。review只作为发现与反例来源，父重新运行以下验收。

### 已闭环对象

- **A42 / D24（原实现）**：筛选前全表snapshot投影、父子/供应商闭包遗漏及嵌套/batch原绑定缺口。保留原生PK页屏障、有界固定点、原ID seed和所有预算；原EXPLAIN物化258行，修改每页page_keys/page为32。
- **A43 / D25（新增P2）**：count和首graph page复用旧statement timeout。初始timeout按总预算收紧，初始化后所有SQL及生成页前重算剩余时间，保持最终elapsed验证与失败落盘。相同1.5s count＋1.6s page延迟、2s预算，父固定子版SQL命令墙钟约3.343s，修复约2.125s并在page超时（含Docker进程开销）；两者psql均exit3、采集均拒绝并落false证据。不是生产耗时或精确2.000s进程SLA。
- **A44 / D26（新增测试器P2）**：临时socket ready不等于最终目标库ready；DROP失败阻断stop/rm/report。fixture初始化改显式start纳入外层try/finally，目标库TCP `SELECT 1`必须返回1，drop/stop/rm分别留错、RESULT独立保存。实际PG注入原runner错误和DROP除零，原错误/清理错误都保留，自有容器仍移除；启动失败和stop失败另有确定性单元覆盖。
- **A45 / D27（既有P1）**：paid root/indexed child状态丢失。proof带原state，按小推进表比较：queued可推进、started可done/rejected，done/rejected不静默回退，未知变化不追认。started→queued在执行器的首次未派发defer分支可能合法，但采集器没有该次持久未受理证据，所以判`PAID_STATE_TRANSITION_UNPROVEN`，不宣称执行器绝对禁止该转换。
- **A46 / D28（既有P1）**：已选billing operation的ledger_id变化。该冻结指针进入native proof/frozen digest；不冻结整个可变billing行，正常结算保持。
- **A47 / D29（既有P2）**：历史未选ledger修改可被数量增长掩盖。每个原ledger ID绑定完整原行SHA256，复用前置PK页和有界图传输；after逐原集合验证，合法新增保持true，旧行修改/删除加新增均false。私有集合字节计入图预算，公开结果只提供指纹；缺原集合证据保持unknown。
- **A48 / D30（既有P2）**：UNKNOWN activity/owner/tick无消解证据变终态。比较state/status/phase及snapshot.status；原unknown变化不计allowed，tick protocol_version/nonacceptance_at/accepted_at冻结，防止accepted-unknown仅改negative标记。保留current-pair过滤、独立历史exact-hash与特定completed-image例外，未给UNKNOWN新增通用豁免。
- **A49 / D31（既有P2）**：full模式`[]/false/null/0/""`被truthiness改成空object。按明确类型校验，非object保持incomplete；缺snapshot字段沿原兼容路径，proof缺标记仍不追认。

### 集中验证、回滚与证据层级

- 父实际CPython **3.10.21**、独占本地PostgreSQL16：原37矩阵BASELINE/ROLLBACK均17pass/20fail、exit1，失败集合一致；修复及最终修改副本37pass/0fail、exit0。旧失败含新增契约，不申报20个生产事故。
- 追加真实PG定向：v2子版15组按“旧漏洞仍可复现”预期通过；父修复15组通过，合法paid推进/ledger纯新增仍true，其余反例拒绝。原基线恢复14组按旧行为通过（原版没有预算参数，2s反例不在该版执行）。包括tick unknown改negative的固定字段保护。
- 父10项单元覆盖状态表、falsey、v2/v3不混证、公开结果不泄露ledger ID、启动失败/清理失败/原错保存。原snapshot21pass/1skip、normal-policy37、enterprise-history4、completed-image-proof4通过。Python fixture不是完整线上发布验收。
- 并行复跑曾遇本机Windows1455页面文件资源不足：副本矩阵35/37、反例DB identity读取和Docker子进程启动失败；清理尝试错误已单列保存。父按该轮RESULT里的完整自有ID核验label并补清理两个容器，未动其他任务；随后串行复测。旧报告目录与execution的prior版本保留，另记录GBK终端输出异常，不抹原失败。
- 仅固定marker副本回滚：恢复2原Python文件hash、移除3个新增验证文件；修改源码/修改快照保持。later-edit guard exit73、零写入，恢复后原37矩阵及旧保留性反例重现。测试器回滚不等同生产状态/DB/媒体回滚，不删历史证据。

父证据根：`output/capacity-audit-wave2-20261029/release-snapshot-parent/`。四产物`MODIFIED_FILE.zip / DIFF_FILE.patch / VERIFICATION.txt / ROLLBACK.sh`，含原/改hash、精确命令/input/stdout/stderr/exit、SQL/EXPLAIN、资源完整ID及恢复记录，已重开核验。自有PG均按完整ID停止/移除；无HTTP/付费供应商/SSH/生产操作。

当前v3只证明这组具体字段与有界观察，不声称任意未来paid schema、任意拓扑/全站容量或无界历史都已覆盖。预算不足继续incomplete；原reservations消失仍须原窄人工conservation流程。实际47执行前须重新采集v3原始基线、保持三锁和原门禁；历史CLEANUP_PENDING、45笔手术、在线索引、UNKNOWN和accepted-timeout波动均不因本修复自动关闭。
