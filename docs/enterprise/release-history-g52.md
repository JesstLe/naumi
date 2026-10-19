# G52 发布历史纠偏与继任版本证据核对

## 为什么做

G50/G51读取47 canonical根字段status=CLEANUP_PENDING、phase=MIGRATED_CLEANUP_PENDING、legacyDrainProven=false，因而把它描述为最近一次发布尚未收尾。继续检查完整current.json、已合入的运维记录和真实服务器证据后确认：原根状态是刻意保留的历史债务，不是最近一次发布状态。

2026-10-18 12:42:24完成的blueGreenSuccessor为release47-alldev-20261018，phase=COMPLETE；实际commit1852b21c5db9ff40332e25d840d98086761209c5，Web/Worker同镜像sha256:d036e1d14f631f167df953b660df97d57e1b866ce37323af5b26839e6afb6932。此前用户对该发布允许保留两项未结事件继续蓝绿；原历史未知项、付费hold、禁止重试/退款/回灌并未消除。

因此本模块纠正的是“最近一次发布仍未完成”的误判，不改变服务器状态，不把历史排空改为true，也不把此前某次发布的授权自动继承为本企业工作流下一次发布授权。

## 实现

新增successor-evidence.py纯只读核验器，collect47.py读取原有同一canonical及固定证据目录，完成：

1. 核对原历史release/phase和继任release/phase、固定commit/image、当次明确事件处理约定及全部操作ACK。
2. 重开PUBLICATION_RECEIPT、任务保留比较、当时当前执行排空、冻结事件材料及supervisor manifest五个文件，记录真实字节hash/size。
3. 不只读PASS字段：复核排空记录中的HTTP请求平衡、已追踪执行数、业务执行租约/事务/advisory锁、Worker暂停/tick/未知状态及session owners；false/null/字符串0不替代整数0。
4. 绑定冻结事件摘要及精确活动ID集合、supervisor canonical摘要、实际nginx -T stdout摘要。
5. 实际docker inspect当前Web/Worker，核对完整ID、镜像、名称及运行状态；Config/HostConfig/Mounts/Networks按原supervisor算法核对静态hash。原始Env仅在主机内参与hash，不输出。
6. 实际inspect两个已退役槽，核对停止、restart=no、原操作回执；当时排空记录必须对应这两个退役槽，而非其他空闲实例。
7. 采集结束再次核对canonical原字节，发现并发改变就放弃此次观测。路径只读、限制大小、禁止软链越界，不执行Docker变更、nginx reload、DB查询、任务重试或状态写入。

该核验只证明历史继任发布的证据与当前固定槽配置一致；liveIncidentReconciliation=false，当前源业务表中历史事件仍需后续独立只读核对，历史产物恢复不因此完成。

## 预检状态设计

`assessReleaseHistory`把“当前有效发布状态”与“历史排空”分开。

|证据|状态与后续|
|---|---|
|无继任发布，根COMPLETE且历史排空均真实0|当前COMPLETE，仍须其他发布门禁|
|继任COMPLETE且证据完整、当前固定槽身份吻合|COMPLETE_WITH_PRESERVED_INCIDENTS；历史排空false；NEXT_RELEASE_INCIDENT_DISPOSITION_REQUIRED|
|只有COMPLETE字符串、缺材料或镜像/槽身份不一致|SUCCESSOR_UNVERIFIED，拒绝认为已完成|
|没有继任且根未完/未知|保留原收尾与未知排空阻断|

startAuthorized始终false。不新增“忽略历史债务”开关、不清状态、不泛化旧的日期限定授权。已向用户提出下一企业工作流发布是否沿用保留隔离事件路线的异步确认，未收到回复时不执行生产。

缺少候选镜像时只报告IMAGE_NOT_LOADED，不再同时生成虚假的REVISION_MISMATCH/PRODUCT_MISMATCH；镜像实际存在而标签不一致时仍拒绝。

## 源码关系核对

刷新origin全部远端引用，共188项。当前线上1852b21c与origin/main f4bf7935均为G50固定应用提交12d3f8a8的祖先。历史rollback/backup/baseline refs单独列入排除清单，不作为业务合并候选；其他引用已包含，或只新增明确的部署工具/文档文件。新应用代码若出现在未包含引用即拒绝复用旧镜像。

本轮SOURCE_RECONCILIATION.json记录每个ref/commit、祖先结果与新增路径，绑定现场Web/Worker镜像集合hash；预检因此消除“线上源码关系未核对”，不等同于候选镜像已上传或生产已更新。工具不读取凭据，也不合入他人未提交内容。

## 集中验证与实际状态

Python4个测试方法覆盖正例、缺失继任、8组无效原始计数、18组材料/身份/状态变异及网关变化；Node34项回归覆盖原33项及继任/历史分离。Windows首次fixture路径使用反斜杠造成文件查找失败，改测试夹具为as_posix后重验通过，原失败日志保留；不修改Linux主机路径来迎合测试。

47真实只读采集成功：5份材料重新打开，errors=[]，2个退役槽停止、当前Web/Worker固定配置一致。历史root仍revision74及原未知项不变。

同一捕获输入对比：旧代码输出successor未报告、EXISTING_RELEASE_NOT_CLOSED；修改版输出COMPLETE_WITH_PRESERVED_INCIDENTS、NEXT_RELEASE_INCIDENT_DISPOSITION_REQUIRED。副本回滚应恢复旧的误分类行为而非把旧测试宣称正确。

资源仍不通过：采样最低4494MiB，当前预算下界4736MiB，差242MiB且未计尚未实测的组合峰值和现有负载增长；磁盘14539MiB。候选两个应用镜像尚未导入47。原18482、真实364行/292附件、正式需求及映射0保持；没有真实试点应用或生产发布。

下一步：按用户对历史事件的选择完成下一轮发布约定/真实事件核对；继续容量测量和独立数据库/真实来源导入准备。保留原UI、同一主干与独立工作流服务，不用“本地通过”替代最终员工登录和业务验收。整体目标ACTIVE。

## 复用

```powershell
python scripts/enterprise-production/test_successor_evidence.py
node --test scripts/test-enterprise-same-host.mjs
# collect47.py与successor-evidence.py同目录运行，或通过现有SSH把两段源码顺序送入stdin；仅输出脱敏观测JSON。
node scripts/enterprise-production/same-host-plan.mjs --plan PLAN_JSON --snapshot FRESH_SNAPSHOT_JSON --output NEW_EVIDENCE_DIRECTORY
```

证据目录：E:/Workspace/naumi/output/enterprise-deployment-closure-g52-20261018。正式输出、基线/修改/恢复命令、Git及原文件hash以VERIFICATION.txt为准。G51同步归零后本轮模块计数1；线上应用镜像仍1852，候选仍12d3，部署工具提交单独记录。
