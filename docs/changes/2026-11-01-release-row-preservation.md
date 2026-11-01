# 47 发布：全原行业务指纹补充保全证据

## 当前稳定版：v2 原生 PK 分页（取代 v1 整表物化实现）

父实际首跑证明 v1 的小行验证不足：`app_image_jobs` 首表在约 **15.17 秒**触及 `statement_timeout`，只输出 begin/table，exit 3。原始 `23-fingerprint-error/raw` 继续保留，未改作成功。

v2 在**同一个原只读 RR 事务**里改为 128 行原生类型 PK keyset 页：先只取本页 PK，再关联这 128 条完整原行并计算 hash。每页重新按剩余全局期限设置 timeout，默认 **15 秒单句、60 秒总期限均不变**；没有 OFFSET，没有缩小表或原行范围，也没有改成只 hash 部分字段。

- 先在同一 MVCC snapshot 中获取有界、可证明精确的表 count；末尾页累计数量必须与该 count 完全相同。
- `page_keys AS MATERIALIZED` 仅物化窄 PK 页，不物化全表 hash。首个页使用 `true`，后续页只使用原生类型的 `ROW(pk)>ROW(cursor)` 范围条件；不保留会导致索引从头过滤的“游标为空 OR 大于游标”条件。
- 每页保留序号、真实行数/输出字节、最后 PK、成功标记。解析器检查页行数、最后 PK、漏页、重复 key、全表 count、首尾 MVCC 和完整结束。
- 服务端分别累计真实行字节及 **row+page 帧的 wireBytes**，保留固定目录/首尾帧余量；解析器再次从原始输出逐字节核对累计值和总输出上限。
- 达到预算时，先前有效页仍可作为 incomplete 证据保留，但失败页不输出原行，整表/整体绝不获得 complete。v1 单表 all-or-nothing 测试的“小于 100KB”期待已改为检查实际 2MiB 上限和未输出全表；最终“不完整必须拒绝”断言保持。
- 证据 `version=2`、`kind=whole-business-row-fingerprints-v2`；v1 与 v2 不混合比较。`collect/parse_output/compare` 调用接口不变。

最终集中验证 **28/28 PASS、exit 0、18.060 秒**。1 GiB 真实逻辑 JSON payload（TOAST 可压缩合成数据）在相同、更严格的 1 秒单句期限下：旧整表 hash exit 3 / statement timeout；v2 为 2,048 行、16 页完整通过，SQL **3,174.827 ms**。此反例没有 sleep、模拟成功或提高期限。100,000 小行 v2 输出 **16,983,986 bytes**，SQL **1,408.841 ms**。另实测 JSONB 嵌套、bytea 任一字节、numeric 最低小数位和 UTF-8/emoji 变化均被完整行 hash 检出。

首轮分页集中运行曾保留上述旧“小于 100KB”测试期待而失败；其他页覆盖检查通过。另检查发现 OR 条件的 100k 样本需 18.454 秒，随后去掉 OR、使用真正的 PK 范围条件，最终集中复验通过。失败及改进原因不隐藏。

## 背景与范围

父发布线程在 47 使用主线的原任务图采集器再次触及 60 秒期限；原失败证据仍保留，不把它改成 PASS，也不提高原图采集器的行数或时间预算。

本切片提供另一种更直接、严格的命题：**本轮前置快照中，既有任务保全清单的每一条业务原行，在后置快照中仍然存在且完整行内容未变。** 新增行可以报告但不伪装成原行；任何原行变化，即使是合法任务完成，也必须交回父线程逐项按原任务证据审定，比较器不会自动放行。

固定输入基线为 `e2f562556ea6e71370619686e1fc8d4c634ef5e7`。代码在父独立发布分支 `codex/release47-main-20261101-r1` 实现，未操作服务器、Git 提交、业务数据或付费接口。

## 模块与接口

- `scripts/ops/release47_row_fingerprints.py`：只读 SQL 生成、完整输出验证、全原行严格比较，以及 `HostTransaction.run` 适配。
- `scripts/ops/test_release47_row_fingerprints.py`：纯协议反例与独占本地 PostgreSQL 集中验证。
- 复用 `release47_task_snapshot.KEYS` 的业务表与逻辑身份定义，不复制或修改业务状态语义。
- 明确排除 `app_release_activities`、`app_release_session_owners`、`app_worker_tick_receipts` 三种高频发布观察表。父必须用其独立精确证据保全这些原始观察，不能据本工具把 UNKNOWN 清掉。

```python
import release47_row_fingerprints as rows

before = rows.collect(
    tx.run, db_identity, tx.save,
    evidence_label='before-main',
)
assert before['collection']['status'] == 'complete'

# 经授权的发布、验收动作由父执行；本模块不执行。
after = rows.collect(
    tx.run, db_identity, tx.save,
    evidence_label='after-main',
)
comparison = rows.compare(before, after)
# missing / changed / schemaChanged / unknownTables 任一非空均不通过。
assert comparison['preservationVerified']
```

纯接口是 `build_sql(...) -> bytes`、`parse_output(raw, ...) -> snapshot`、`compare(before, after) -> report`。证据 label 不得重复用于同一个 `tx.save` 目录；省略时生成独立 UUID 名称。

## SQL 与一致性合同

1. 全部表在**同一个 `READ ONLY REPEATABLE READ` 事务**读取；首尾绑定同一数据库、数据库 OID、PostgreSQL system identifier、server version、schema、MVCC snapshot、只读与隔离级别。
2. 读取实际 `pg_catalog` 主键和列定义，不把业务逻辑键误当物理 PK。缺表、缺 PK、缺业务身份字段、不是普通/分区表均保持明确未知；不把缺失解释为零行。
3. 每张业务表按原生 PK 顺序以 keyset 页连续推进，每个原行只计算一次 hash；COUNT 只读取窄键，不提前处理完整行。数据库计算 `SHA256(convert_to(to_jsonb(row)::text,'UTF8'))`；包括完整 payload、snapshot、账务、供应商状态与结果字段，不靠进展字段白名单忽略变化。
4. 仅返回物理主键、业务键和 SHA-256，不传出提示词、凭据、图片字节或供应商响应正文。`to_jsonb` 是 PostgreSQL 逻辑行表示，不冒称堆页物理字节比较。
5. 默认新证据预算为总行数 **250,000**、输出 **64 MiB**、总事务 **60 秒**、单语句最多 **15 秒**；配置只能缩小。SQL 在每表/每页前更新剩余期限，在服务端记录全局行数及实际 row/page 输出字节；超预算停止输出该页原行并将集合判为 incomplete。为固定目录和首尾帧预留 1 MiB，解析器另检查实际输出总字节。
6. 首尾缺失、截断、表顺序错、重复 PK、空身份/坏 hash、行数不符、MVCC/数据库/期限漂移一律拒绝。前后各重读 Docker 完整身份；数据库实例替换使结果失效。
7. 原来已有 `ADDITIVE_TABLES` 中的业务表，只有父显式指定 `allow_absent_tables`，才接受同一事务 `to_regclass` 证明的不存在；其他缺表不提供忽略入口。原先不存在的已审新增表出现时，其行列为新增，不称旧数据。
8. 返回对象包含内容 SHA。重开后若状态、表内容等被修改而没有原证据一致性，比较拒绝；该 hash 是证据一致性检查，不是数字签名。

## 比较语义与证据边界

- 原 PK 缺失：`missing`，不通过。
- 同 PK 完整行 hash 或业务身份变化：`changed`，不通过；不区分“看起来合法”的状态进展。
- 表 schema/PK/逻辑身份字段变化：`schemaChanged`，不通过，须另验收实际兼容迁移。
- 新 PK：`added`，明确报告；只增加新行且原行/结构完整保持时可以通过。
- 原 UNKNOWN、pending、账务预占等只作为原行字节保留，不推断未受理、完成、退款或可重放。

本工具不需要递归闭包，是因为它比较清单内**所有**原行业务数据，而不是先筛选某个 active 子图。它不证明原基线已经没有悬空引用，不覆盖清单外的全部数据库表，也不代替媒体原对象字节、Worker 执行结束、线上功能或容量验收。它不删除或改写原图采集器的 incomplete 结果。

## v1 原始集中验证记录（小行通过，不代表线上大 JSON 通过）

命令：

```powershell
python scripts/ops/test_release47_row_fingerprints.py --postgres
```

最终结果：**25 tests / OK / exit 0**，总约 **7.947 秒**。包括：

- 原行不变、新行报告、删除/变化失败，合法 pending→done 也列 changed。
- 缺表、显式新增表不存在、缺 PK、schema 变化、原始 key/业务 key/null/hash 校验。
- 重复 key、表顺序、计数、MVCC、数据库、截断、预算和证据被改写反例。
- 实际 PostgreSQL 16 按 bigint 原生 PK 输出 `2` 在 `10` 之前，而不是字符串顺序。
- 真实 payload 和供应商任务身份变化被检测。
- 全局行数和输出字节预算在服务端拒绝；输出超预算场景不传出原大列表。
- **100,000 条小型整行指纹**真实 PG：输出 **16,884,820 bytes**，SQL **678.003 ms**，完整通过。这是独占本地合成样本，不是生产大图片 JSON 性能或 10 万活跃用户能力证明。
- 数据库容器重启/身份漂移拒绝；两次 collect 的证据文件名不同，不与 `tx.save(O_EXCL)` 冲突。

测试容器使用唯一完整 ID 和专属 label、`--network none`、512 MiB/1 CPU；完成后仅停止并删除该容器。真实供应商与生产操作均为 0。首次实现的 21 项集中验证同样通过，最终增加收尾完整性/预算/规模用例后一次集中复验为 25 项。

## 父集成与未完成项

父继续负责实际 47 前后采集、固定发布制品、原观察和媒体保全、变动原行的精确业务证据、独立副本回滚、Git 集成及线上发布。此文件不宣称父现场采集已经通过或上线已经完成。
