# Fleet：默认关闭新入队与 retained-state 回退拒绝

## 状态与本次切片

review `5774904378` 覆盖 `2a871374`，指出 preparation HOLD 没有约束真实 producer，旧 consumer 仍可能在同表遇到 business.query 队头或金融快照。本切片把必要拒绝落到公共写边界和列明的 tracked 恢复入口，不再只依赖文档。

**当前仍是 PREPARATION ONLY / HOLD。** 新业务 admission 硬性关闭，没有可用 flag/permit 开启路径。源码中的回退计数 guard 是必要保护，不是正式 image floor、外部 producer 冻结或生产 cutback 许可。未 SSH、未部署103/47、未合 main、未清理业务行、未恢复 DB、未重放任务。

## 模块、依赖与状态归属

### 公共 producer

- `server.requireFleetBusinessAdmission()` 对 `business.query` 抛 `FleetError(503)`，消息为“跨站业务查询仍处于兼容准备阶段”。
- `enqueueCommand()` 在实际 schema/bootstrap、pool checkout、advisory/instance lock、command/audit INSERT 之前调用它。generic Fleet POST 和业务 coordinator 共用该边界；root、委托账号、heartbeat、环境标记均不能放行。
- `business-central` 将受控 Fleet 503 映射为 `unknown + 原准备消息`，严格无 data；不把未确认状态改成零。
- 控制类型仍使用原事务、授权、fingerprint/稳定 ID 重放及冲突规则。既有 business 行的 getter、签发、原 lease ACK 和源 receipt 不改，因此已经受理的历史状态不被删除或伪造终态。
- 后续要开放新业务 producer，必须另行实现并验证真实 release issuer/legacy-consumer admission；本提交没有临时开启方式。

### 只读恢复 guard

`scripts/ops/release_fleet_business_guard.py` 的入口先 `tx.pin()` 复核实际 DB container identity，内部读取明确的 DB user/database context，再调用有界 psql。SQL 使用 RR READ ONLY、statement/lock/idle transaction timeout、pg_catalog search_path 和显式 schema/table，统计**全部状态**的 business.query，不按 queued/leased 过滤。

独立的实际输出解析器拒绝空流、坏 JSON、重复 key、额外字段/输出、错误 database/schema/table、非 read-only/非 RR、负数/非整数计数。任意 retained 行抛 `FLEET_BUSINESS_ROWS_BLOCK_LEGACY_ROLLBACK`；DB identity 漂移、缺表、超时、上下文缺失等保持 unknown 并拒绝，不当成零。异常不回显 psql 输出或环境。

公开 SQL、解析与计数规则只为复用实际验证，不接收 caller 的 clear flag/count；HostTransaction 入口仍必须完成 pin/context/read。

## 本轮实际接线范围

| tracked 方法 | 拒绝点 |
| --- | --- |
| `release103_refactor.Release.rollback` | 首部，早于新版本 drain、旧 start/restart policy、逆网关及 resume |
| `release103_refactor.Release.gateway(False)` | 直接逆网关调用兜底；不替代启动前检查 |
| `release103_staged.Release.rollback` | 首部，早于 retained old 启动和 inverse gateway |
| `release103_mapping.Release.rollback` | pre-switch 原 worker resume 前；post-switch 仍不回旧代码 |
| `release_site_control.Release.rollback` | 仅103的 pre-switch 原 worker resume 前；47不增加该 gate |
| `release103_authorized_ui_retirement.execute` 异常恢复 | restore intent/start 前；失败进入既有 reconciliation，保留原错误 |
| `release_legacy_ui_retirement.restore_one` | 103必须提供 reviewed DB identity，否则 start/policy 恢复前拒绝；47原语义保持 |
| `release_runtime_ui_retirement.restore_one` | 103必须提供 DB binding，retained/unknown 时零 old-start |

没有把 metadata/copy-only 的 `release103_gateway` 或 stopped-container spec 生成器误当 live restore 修改。

## 测试的三层含义

1. **真实公共拒绝**：actual enqueue 的 source-function/真实合同矩阵检查 root、委托、已有 ID 与伪开启标记均被503拒绝、零业务写；正常控制入队/重放/冲突不变。真实 central HTTP 同时覆盖业务 POST 的 unknown/HOLD、generic Fleet POST 的503及零新行。
2. **明确的 retained-row 集成**：`scripts/lib/fleet-business-retained-fixture.ts` 仅允许显式 isolated flag、loopback:65298、两个固定 central fixture DB，事务内再核对 current_database，只为测试插入此前受理的 business 历史行。它不在 src、不是生产 admission。已有真实 PG/HTTP getter/dispatch/ACK/expiry/7-42-49 正向矩阵改为具名历史行 seed，公开 API 先真实证明 HOLD/零新行，绝不把 fixture 插入称为公共 admission 成功。
3. **回退边界**：有限 HostTransaction/psql 测试执行实际 guard 和指定恢复方法，retained/unknown 时验证零旧 start/policy/逆路由/resume；真实本地 PG 使用同一 SQL/解析器/计数规则检查空表、控制行、queued/leased/succeeded/failed/blocked/未知状态及缺表。实际本地 fixture 缺显式 POSTGRES_USER，完整 HostTransaction guard 正确拒绝；没有修改 inspect 元数据来假装通过。因此该实际 PG 证明不包括完整生产 DB-context/HostTransaction 正向链。

`verify-fleet-business-next-browser.mjs` 已改为真实 HOLD 断言：remote unknown/无data、global不完整、local7保留，且 command ID 集合不变，不暗中seed。纯 UI/hook 正向 snapshot fixture 明确标为 finite retained-snapshot 展示。浏览器和服务若未在本轮实际启动，记录为未执行，不借脚本存在宣称验收。

## 运行证据

本地集中实测：公共 admission 原版20项中11失败、修改版20/20；实际旧 rollback 方法在有限host fixture且retainedRows=1时仍触发3次旧start及1次新drain，修改版均为0；Python118个测试中117通过、1个既有Linux flock测试在Windows跳过；真实本地PG SQL/解析/计数10场景通过；实际公共API拒绝和历史行集成protocol159、central HTTP70通过；心跳114、预算73、UI contract75、真实ReactDOM hook20、时钟32及全库tsc通过。原preparation仍exit78。

159/70的正向业务读取均明确为历史保留行fixture，不代表公共新admission开放；local7/remote42/total49不是生产数据。Next/browser本轮仅语法检查，未启动服务或浏览器，也没有新截图/线上验收。

根的完整命令、输入、字面 stdout/stderr、退出状态、原始 hash、实际副本恢复和 later-edit 零写守卫，以及四份产物的复开结果统一存于作者本地：

`output/fleet-business-admission-guard-20261105/final/VERIFICATION.txt`

同目录 COMMANDS 是完整根运行记录。子任务早期 Python 记录另保留为 `OPS_AGENT_COMMANDS.json`，其工具只暴露 merged observed-tail，stdout/stderr 不可分时按 null 记录，不补造全文。首次加入旧 gateway suite 因缺历史 nginx capture 失败，未伪造该文件；最终有界命令的118个测试明确不包含该缺 capture 的额外 suite。根实际重跑这118个测试并保存完整流。

初次真实PG harness误以为历史fixture有显式POSTGRES_USER，在调用guard前发生KeyError，失败保留；修正验证分层后，真实SQL/解析和完整guard拒绝未知分别记录。有限回退基线 harness 的 Windows 默认解码失败亦保留，显式UTF-8重跑后才作为有效原版反例。响应预算矩阵首次因新增常量 import 不在其有限I/O export表而编译失败；业务 coordinator 改为复用既有公开 FleetError503消息映射后重测，不添加生产 bypass。

## 仍未建立的生产闭包

- 已部署/历史 `ops-bundle.tar.gz`、output controller/operator、导出的旧恢复 spec 外部执行器、手工 Docker/systemd/nginx 不会因 tracked 代码变化自动获得 guard。正式 ops bundle 需要重打包、更新完整 manifest/pins并验证实际 adapter。
- count=0 只是读取时的有界观察，不证明外部旧 producer 已冻结，也不是并发 admission issuer。本版新代码硬性不产生新行；任何仍运行的外部旧开放版本必须由发布 owner 识别、冻结/排空和验证。
- pinned DB container/default database 的代码检查不等于现场 central 连接的完整归属证明；schema、实际 app DB、全部 consumer/路由闭包仍需 fresh证据。
- 尚无实际 immutable recovery image 与 retained-state 两顺序 cutback 验收；本版不会发行 permit，也没有正式 floor。
- 原 preparation `PREPARATION_ONLY=True`、exit78继续保留，不能仅删除 guard 或填写 SHA 就执行。

这些缺口不因本地源码拒绝、有限host测试或真实本地SQL通过而关闭。CodeRabbit check success、Git合并、source-copy rollback 和生产安全回退分别记录。
