# 后台异常巡检启用与定向排查

## 约定

用户要求启动定时巡检并排查发现的问题；继续不部署、不合重构分支。工作树 `E:/Workspace/naumi-admin-anomaly-triage-20261026`，分支 `codex/admin-anomaly-triage-20261026`，基线 main `368c93e2343c57a330a0db6831ccbef01283ed6d`。线上只读采集，不调用生成/恢复入口、不清UNKNOWN、不改业务状态。

## 定时任务

已创建“Naumi47 后台异常巡检（每15分钟，只读）”，enabled=true、interval=900000ms、绑定当前交互线程。首次计划 `2026-10-26T03:33:48.312Z`（北京时间11:33:48）；创建时lastRunStatus=never。定时工具在没有活动turn时执行，因此计划时间不等于已完成一次采集。

启动命令：

```powershell
python -B scripts/ops/run_admin_anomaly_watch.py --identity C:/Users/13357/.t3/userdata/task-evidence/all-branches-release47-20261023/ssh-private/identity.pem --known-hosts C:/Users/13357/.t3/userdata/task-evidence/all-branches-release47-20261023/ssh-private/known_hosts --ssh ssh.exe --node node --minimum-interval-seconds 900
```

凭据只读现有受保护文件，不打印或写入仓库。新旧观察账本已接续到本工作树 `output/admin-anomaly-watch-20261026/ledger/cases.json`。任务每轮只运行一次，采集失败保留原日志，不将部分数据标健康；新异常进入同一benchmark台账，未见旧案例不自动关闭。不自动修改产品或上线。

## 起点证据与待查

11:08单次检查：Web0641ce2e，Worker旧af22且paused/uncertain，原tick unknown；15条子done父未收尾、54条长时间无更新、近24h八个失败父任务。上述计数只是该观察时点，需逐ID新鲜复核，不把父子行相加为独立请求。

已确定采集器缺陷：硬编码旧Web名会读取旧接口；OFFSET在多个只读事务之间会重复/漏取正在变化的行。先修当前nginx入口精确绑定及固定主键分页，再验证实际收集。后续记录源码断点、真实只读证据、本地复现/回归及剩余问题。


## 只读排查结果

固定11:08观察的104个源任务，重新读取128份父/子状态、39份对应供应记录、原tick回执及精确活动记录；原始账号/任务ID只在ignored private证据，不提交。15个子done父pending仍全部存在，各子账务已settled。5个父任务创建于当前Web启动之后，且这5个都有同任务admission key的UNKNOWN；全15个中6个有精确UNKNOWN，2个仍留已过期lease token。另9个未找到同key未结束活动，不能把“没有UNKNOWN”写成已恢复；旧Worker未扫描与旧版本未主动唤醒仍是历史断点。

Web在10:33—10:58的33条数据库连接等待超时，已按真实运行chunk/hash定位到release store的transaction获取连接及detachBackgroundActivity受理。这个池max=2、等待5秒。DB没有同窗口statement-timeout错误；不能将池等待超时伪称服务器SQL超时。现场只读同一REPEATABLE READ快照执行旧/新候选SELECT：595.254ms→4.750ms，双向集合差异0（各1行）；只是本次暖缓存SELECT比较，不是线上DELETE或完整容量验收。旧清理扫描仍增加池占用，main已有查询优化但尚未部署；尚无原错误stage记录逐一证明5个UNKNOWN都由哪条SQL引发。

8个近期失败父任务分类已闭环到原供应记录：4个transport-unknown/ECONNRESET（客户预占已释放、收费0），2个response-received/HTTP200且供应报告1/2个输出，但本地checkpoint未完成、无可直接恢复的原像素证明（账务hold，保留10/24预占），1个上游HTTP400拒绝（charged0），1个无供应调用记录且Web日志fetch failed（预占释放、charged0；具体输入读取/准备环节仍待更细证据）。供应响应摘要/数量不等于本地图片可读；未重新查询供应商、未发送生成或释放剩余hold。

原Worker tick服务端phase也为unknown，completed_at和result均NULL，并非“服务端已经completed而客户端漏收到”。因此本轮不执行完成回执reconcile、不清UNKNOWN、不改Worker。54条超时观察的相关源行另分为父等待未完成子、任务级UNKNOWN、已发出但未核实的付费尝试、无执行checkpoint等；源行有父子重叠，不作为新增请求数。

## 最小本地修改

1. collector从实际nginx公网根location选择唯一loopback Web，显式跳过同文件HTTP→HTTPS跳转，并在结束前重验网关与boot；不沿用旧容器名。
2. 先固定最多2001个候选PK，再100个一组投影，任意缺失/重复/替换直接失败；各读语句维持15秒/1秒锁超时。近期父任务统计与Worker状态纳入报告。
3. 运行器为成功、SSH失败、分析失败和超时写独立RESULT及LATEST_RUN；台账接续且只对新案例/明显积压增长/运行状态改变/采集失败通知，不把窗口未见当已解决。
4. `finishActivity`先提交真实完成回执和session idle，再做原限定100条历史清理；清理失败仅固定脱敏提示，不撤销已完成工作。真正动作失败、关键完成事务失败仍unknown。原UNKNOWN未改，保留窗口、范围、owner/boot核对都没放宽。
5. `DurableImageJobs.kick`在领取lease后、实际执行前绑定失败时，只释放自己刚领的token；别人的token与原活动UNKNOWN仍保留，实际用户回调/供应入口不执行。
6. 后台失败日志只增加scope/action-or-finish/白名单错误码，记录PG_POOL_TIMEOUT，不输出SQL/提示词/凭据；原异常与状态语义保留。

本轮不是通用UNKNOWN恢复器，没有绕过原受理门槛。代码预防后续失败，不自动修好已经UNKNOWN的历史任务。AW05—AW07已加入既有admin-anomalies benchmark，历史closure均保持OPEN。

## 执行与验证

手动执行修正后正式巡检入口通过：服务器观察11:31:39，589级有界样本更新为292逻辑异常/359观察，当前Web绑定13116/0641ce2e。这是人工首跑，不冒充计划自动触发；创建任务后的首次自动执行仍以调度器lastRunStatus为准。

原始失败留存：旧采集器新契约测试missing API/缺失败回执；首次新网关解析未考虑同文件HTTP308，修正并新增回归后通过；只读EXPLAIN最初多行JSON解析错误保留。它们没有触发线上写操作。

集中回归和副本回滚最终结果见 output/admin-anomaly-triage-20261026/VERIFICATION.txt；实际供应商调用0，业务写入0、线上恢复0、部署0。产品只改3个既有文件，不引入重构分支或新后台执行器。


## 集中验收完成

12个入口均符合预期：collector13项（后补队列合并用例另验）、benchmark/capture26项、Worker23项、真实PG finish隔离8组、父收尾25组、原清理SQL语义与故障25组、tick receipt59项、drain-status、postaccept142项、parent SQL19项、实际imagegen执行/background routing与完整TypeScript。history benchmark新增基线/修改对照后6/6 EXPECTED，仍PARTIAL exit2，因为线上历史OPEN没有由本地fixture核销。

调度核验：11:33:50、11:48:52两个自动触发已投递到当前线程队列；当前交互仍运行，所以startedAt=null。调度器的lastRunStatus=succeeded是投递状态，不是已采集成功。已补最短900秒采集间隔，防排查结束后积压触发连续扫描；跳过不更新最后实际采集时间，不会永远延后。手动11:31首轮是真实采集证据；后续自动运行以各run/RESULT.json核对。


最终采集器（含触发积压合并）14/14通过；11:55:12再次实跑PASS：567行、285逻辑异常/352观察，随后立即重投返回SKIPPED RECENT_RUN=1 / exit3，真实线上读取未重复。新旧案件均保留，数量下降不等于本轮已修复线上。公开脱身份样本写入 `docs/benchmarks/admin-anomaly-triage-observations-20261026.json`，原始证据仍只在ignored目录。

交付四产物位于 `output/admin-anomaly-triage-20261026/`；ROLLBACK只恢复精确标记的独立副本。本轮提交推送专用修复分支，不合重构、不自动更新main或发布；后续整合/上线与现场历史恢复分开验收。
