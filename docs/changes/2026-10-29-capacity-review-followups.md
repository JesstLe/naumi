# 容量审计复核收尾：画布保存意图与 tick 健康读取

## 模块、基线与职责

父线程将 X3 v2 `5d8d116b`、画布保存 `613cf62b` 普通合入本线程隔离分支，修复基线 `4468f4f58470e95ab06d22e10c0b6ad5cf7b4f4b`；仅修两个独立复核中确认的 3 项问题。没有把独立 review 的 PASS 当作产品通过，也没有修改共享脏树。

- 画布保存队列拥有同节点意图顺序、原 nonce/CAS、失败 journal 与 dirty；服务端仍拥有授权、事务、回执与 revision。
- Worker 负凭据由原 receipt 主键 fence 拥有；健康页只投影真实受理活动，不改状态或协议。
- 当前变更不部署、不连接生产。47 保持此前 `e1878018 / 1793247893`。X3 协议默认仍为 1，合入不代表启用 v2。

## R1 / P1：配置草稿被位置 ACK 误删

原新增队列在任意保存成功后无条件 `failed.delete(id)`，并删除之前 `uncertain=false` 的草稿。另一个标签页先更新节点，本地配置 409 后拖动位置，位置保存 200 会把配置草稿与全局 dirty 一起删除，刷新后丢失恢复入口。

修复：

- 对应意图 ACK 才清掉自身 failed/pending/journal。
- 新的明确保存只有覆盖旧拒绝意图的全部 top-level 写字段时，才在成功 ACK 后替代旧意图；仅 x/y 或 title 不代替 config/inputs。
- 与仓储的字段替换语义一致（config/inputs 是完整字段替换），忽略 expectedRevision 元数据，不合并或重写旧 CAS。
- 只替代当前意图之前、已明确未提交的旧意图；uncertain 不删除。还有 pending 时继续显示未保存状态。
- 原设置保存入口可通过明确重新编辑并提交当前 revision 的完整配置替代拒绝草稿。未新增自动 rebase、静默覆盖或全局丢弃按钮。

同一真实 Hook/调用函数/提示栏的 Chromium+HTTP fixture：原 afterDirty=0、afterDraft=false、afterFlush=true；修复 afterDirty=1、afterDraft=true、afterFlush=false，刷新后仍 dirty=1。服务器配置保持远端版本，不把本地草稿伪装为已提交。

## R2 / P2：一个节点冲突阻断其他节点重试

原 `retryPending()` 跨节点循环直接 await，A 永久409就退出，B的503恢复草稿永远不被重试。

修复按节点隔离错误：A失败只停止A后续意图；继续B等节点；最终抛回首个失败，使 UI 和 flush 保留未确认状态。节点内原顺序、nonce/CAS、有限自动重试预算和卸载/账号生命周期不变。

两次真实“重试保存”按钮操作：修前请求 A,A，B未保存；修后 A,B,A，B的回执核对成功，A仍dirty，未偷改A的revision。

## X3 / P2：negative 被显示为已受理 tick

v2 tombstone为旧 schema/check兼容保留物理 accepted_at，但它并非受理。两个健康读取以前只看时间，negative-only会显示 recentTicks=1/observed。

只修改 enterprise health 和 admin health SQL：先通过 pg_attribute 查询列能力，再用窄列 `nonacceptance_at IS NULL` 排除负凭据，兼容未惰性迁移的旧 v1 schema。没有采用 `to_jsonb(t)` 整行转换，避免为判定一个时间字段读取历史 receipt 的 result JSON。保留所有真正 accepted 后 running/completed/unknown，不删除 tombstone，不改 accepted_at、phase、证明或恢复协议。

真实独占 PostgreSQL 4类对照：旧schema空表、v1三类accepted、negative-only、negative+accepted-unknown。修前negative-only为1、混合为2；修后0和1，真实accepted时间保持，原行保留，扫描/供应商调用0。

## 集中验证与证据

主证据：当前工作树 ignored `output/capacity-audit-wave2-20261029/review-followups/`。

- `scripts/verify-canvas-save-boundaries.cjs`：基线/修改8组，包含两个缺陷、明确完整配置替代、同尾合并/A→B→A、丢响应nonce、重试预算、账号/空间ABA、StrictMode/卸载/重载。实际 React hook、原调用函数和原提示 JSX、独占 Chromium/HTTP；服务端为显式 CAS/auth fixture，非完整线上 Canvas。
- `scripts/verify-canvas-save-transport.cjs`：父线程重新执行23组真实 React/HTTP/独占PG仓储回归，23通过、0失败；未改变服务端鉴权语义。
- `scripts/verify-tick-health-negative.cjs`：两真实读取模块SQL和实际receipt store在独占PG，基线/修改各4类，退出0；BASELINE PASS仅表示原误报成功重现。
- 完整 X3协议矩阵、Worker回归和全项目类型检查的最终命令/输出见 VERIFICATION，不用以上局部检查替代。
- 只测试本地随机端口/本任务55469 fixture；不读取生产.env或连接资料。所有自有HTTP、浏览器及测试数据库结束后停止。

原hash保留，四产物为 MODIFIED_FILE、DIFF_FILE、VERIFICATION.txt、可执行 ROLLBACK.sh。仅对固定独立副本全文件hash guard回滚，恢复原草稿误删/跨节点阻断/负凭据误报，修复源码保持。后来编辑保护拒绝前不写任何目标。

## 未完成与后续

完整 Next 多bundle实际启动、Linux组合容器、v2正式配置与滚动入口、线上业务容量未由这次完成；历史v1 UNKNOWN不升级、不补签、不自动resume。其余画布文字保存/轮询、发布采集器、账务/运行时/Agent/视频上传继续独立切片。已有postaccept与delivery-retry fixture失败、accepted-timeout历史波动仍保留。
