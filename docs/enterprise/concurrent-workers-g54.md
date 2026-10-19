# G54 八人并发业务与活跃Worker验收

## 目标

G53只测了顺序业务回归和暂停/待命Worker。本模块补充八个独立原生登录会话并发访问任务/个人看板/周排期/受保护附件，激活工作流Worker实际生成SLA提醒，并恢复真实Naumi Worker取得服务端持久tick回执。保留原18482UI和权限/限流/上传并发限制；仅隔离合成数据库，不访问47业务库或付费供应商。

## 实现

新增`services/enterprise-workflow/tests/concurrent-workers.ts`，由原完整生产组合最后调用；`--active-load true`必须同时启用完整模块和资源测量，不与proxy试验混在同一轮。默认不开启，旧41项范围仍独立可用；开启后加一组完整负载契约，预计42组，最终以实际输出为准。

执行前检查isolated环境、127.0.0.1入口、web-composition安装标识、空connectors和两个实际数据库名source_composition/workflow_composition，不仅信任一个环境布尔值。测试驱动新增内容不进入实际生产镜像。

1. 新建8个合成员工和1个合成主管，来源企业内的上下级不能自指；通过原provision-plan/provision显式绑定新的测试团队和职责，不对真实人名作推断。
2. 主管通过原生schedule-command initialize创建团队工作簿，再设置任务计划；GET不是隐式初始化。
3. 每人原生密码登录、创建需求，由主管受理/拆分/发布/设置计划，员工本人认领/开始；8条需求使用独立版本和命令ID。
4. 8人同时提交各8MiB不同内容文件，共64MiB。服务器仍只有2路上传；仅明确429且error.code=UPLOAD_BUSY时保留同assetId/原字节，限次退避，其他失败立即保留错误。不重试未知5xx/网络结果，不临时调高生产限制。
5. 通过原生SLA预览/保存开启本测试团队的临期提醒，用工作流生命周期activate绑定当前boot/release/slot激活真实Worker，不手工插入提醒表冒充处理结果。
6. 恢复真实Naumi Worker，Web和Worker固定instance/commit匹配；测试库无付费待办，扫描结果必须processed=0，且至少2条真实app_worker_tick_receipts完成，无未决tick。
7. 8个独立会话每秒发一轮，连续40轮，轮流读取个人看板、本人任务、周排期及完整8MiB附件。验证本人任务和执行人范围，80次下载累计640MiB，每次都读取完整字节并核对SHA256，不只看HTTP200。
8. 验证8个任务均有真实SLA occurrence，站内通知生成且clock_key/stage无重复；Worker排空、未知tick0之后退出。任务和附件不转真实绩效或历史验收。

## 计量

新增CONCURRENT_WORKERS.json：成功请求数与包含429的实际尝试数分开、上传退避次数、8路实际在途上限、上传/下载字节、全响应耗时分位、实际SLA任务数/通知数、Naumi完成tick数与未决数。

该报告的耗时读取完整响应体，附件上传的耗时包括明确背压等待；不混同G53 helper到响应头耗时。持续每秒1次/人的节奏意在验证多员工同时工作，不声称最大吞吐、高峰全公司容量或长时稳定性。

资源采样沿用G53固定容器ID/cgroup，保留各自生命周期峰值与依次采样总和的区别。两个Worker不再只是待命，但只有工作流提醒是有实际业务处理的任务；Naumi扫描的是无付费待办的合成来源库。源和工作流库在同一测试PG进程中，与正式两个独立服务的数据拓扑边界仍有区别。

## 迭代记录

- 第一轮合成主管self-supervisor违反源数据库CHECK，修正为企业owner→测试主管→测试员工；不改CHECK。
- 第二轮未创建新团队工作簿就set-task-plan，409；第三轮误以为GET会初始化，404。改用已有schedule-command initialize，不放松WORKBOOK_NOT_FOUND。
- 第四轮已触发真实UPLOAD_BUSY，但负例断言把结构化error.code当字符串。按实际协议提取code，保留429而非屏蔽上传限制。
- 原始失败、容器清理和修复后输出全部保留本轮证据。遇原41项限流仍按既有60秒窗口等待，没有调整限流或通过换身份绕开同一身份限制。

## 验收与未完成

第五轮完整验收成功：42组；8人40轮共320次读，加8次成功上传，合计328个成功响应；6次明确UPLOAD_BUSY重试，总HTTP尝试334。8人循环耗时41.952秒，上传批次1.331秒；完整响应p50约21.04ms、p95约208.49ms、max约1274.27ms（上传包括退避）。完整字节上传64MiB、下载640MiB；8个任务SLA occurrence、8条通知，Naumi实际完成8个tick、未决0，source扫描processed0。

资源44轮、119.806秒；各容器OOM0。当前用量依次采样总和最高816.523MiB，各自生命周期峰值和957.723MiB。采样器沿用初始化时的role标签standby/paused，不代表整个窗口始终待命；激活/排空与实际处理证据记录在CONCURRENT_WORKERS.json，不能仅根据标签判断。原始jsonl由最终汇总代码复算一致。

实际成功轮次、资源数据、同依赖类型基线对照、原ZIP/364行292附件、Git、源码副本回滚见本轮VERIFICATION.txt。原G53本机35条全仓类型诊断不是本轮目标，依旧分别记录是否有新增，不写全仓通过。

未完成：47目标主机双槽/全业务并发、长时高峰与更大附件、真实员工授权/真实企业验收、历史事件下一次处理约定、生产镜像安装及蓝绿。不给本地报告capacityAccepted=true，不据此降低部署资源限制。

```powershell
node scripts/verify-enterprise-production.mjs --allow-development true --measure-resources true --active-load true --web-report FIXED_WEB_REPORT --runtime-report FIXED_RUNTIME_REPORT --output NEW_EVIDENCE_DIRECTORY
```

证据：E:/Workspace/naumi/output/enterprise-concurrent-workers-g54-20261018。应用镜像保持G50固定12d3f8a8，新增测试工具独立提交；同一主干无客户分叉。整体目标ACTIVE。本轮达到G51后第三模块，刷新main整合结果记入最终验证并归零。
