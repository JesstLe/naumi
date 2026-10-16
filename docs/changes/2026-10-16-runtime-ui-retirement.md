# 单历史UI runtime维护库（2026-10-16）

## 已实现

新增 `scripts/ops/release_runtime_ui_retirement.py`；旧 `release_legacy_ui_retirement.py` 字节不改。仅103、精确13028—13033六个原CID/image/StartedAt，单次只操作一个CID；core13012不在清单。库无CLI、SSH或自动发现停机入口。

- `retire_one(tx,manifest,artifact_root,observe,task_proof,inspect_maps,final_references)`：持原HostTransaction全部kernel FLOCK；两次真实采集由库计monotonic且相隔至少30秒；准确进程/完整netns socket/PG active及事务/原始引用证据；完整task snapshot preservation哈希前后比较。
- 显式环境 `NAUMI_VIDEO_WORKER=0`、标准node Cmd、完整实际来源module/后台启动审阅、native `new Map`且全局Map/prototype未篡改证据；并非因完整Next保留Agent API即拒绝。
- 已切文件化维护gateway、原URL静态全集与安装文件原字节验证；Inspector扫描后再次核验当前gateway/static及真实引用。
- 适配真实Inspector schema1：all-enumerated-context-native-map-prototypes、per-context-sum-upper-bound；跨realm重复计数不当漏扫，要求worker发现0、无pending/unknown、Inspector已关闭。报告附root采集的containerIdentity、hostPid、namespaceTargetPid=1和auditorSha256；不把容器PID1误当host PID。
- **当前真实collector无idle title/messages/events内容投影**：任意非零idle session（包括tmp）均保留HOLD；不以DB枚举冒充内存Maps为空，不伪造持久化匹配。
- 首次意图O_EXCL保存原CID/image/完整网络观测/端口/restartPolicy/任务和真实RAM；docker update restart=no，然后只有 `docker stop --time=-1 CID`，绝不SIGKILL兜底。未知结果留journal并禁止重复stop/start。
- `restore_one(tx,manifest,intent,probe,required_available_mib=...)`：实际RAM门槛、原保留CID、原端口/网络声明配置、真实health/version/static probe、恢复原restart policy（含on-failure重试次数）。不切回gateway、不回灌DB、不重放已接受任务。
- 本地真实Docker证实stop/start后EndpointID等runtime分配变化；恢复核对网络ID/aliases/Links/IPAMConfig/DriverOpts/GwPriority，保存原与新runtime网络差异，不错误要求EndpointID不变。

## manifest与collector对接

manifest字段见集中fixture。policy=`legacy-ui-runtime-maintenance-v1`、ordinaryDrainReceipt=null；sourceAudit为hash-bound完整实际源图审阅报告。`observe(tx,m,index)`字段：processTree、socketCoverage/socketNonIdle、databaseCoverage/databaseActiveOrTransactions、referenceCoverage/references、staticHashesVerified、rawEvidence。task_proof coverage=`complete-persisted-ownership`，targetOwnedAcceptedTasks=[]、unknownOwnership=[]、preservationSha256为真实完整任务比较的保全摘要。Inspector callback返回hash-bound descriptor，root在JSON报告附containerIdentity/hostPid/namespaceTargetPid/auditorSha256；final_references提供新鲜真实引用证据。缺失/unknown即HOLD，不自动补零。

这些是运行时维护决策门槛，不是普通complete-drain receipt；真实source/background和引用collector仍由root对接，库单元fixture不代替生产验收。父任务后续选择更直接的维护迁移不由本库改变授权、入口或生产现场。

## 集中验证

- baseline旧库：6 tests OK。
- Windows新库：16 tests OK，Linux kernel-lock测试skip1。
- Linux容器新库：16 tests全OK，包含真实HostTransaction双锁和/proc kernel FLOCK校验。
- 隔离local node Docker实测：graceful SIGTERM输出`GRACEFUL_TERM`、exit0/OOMfalse、同CID start、原unless-stopped policy恢复PASS；NETWORK_JSON_EQUAL=False，已修正restore网络声明校验。容器随后graceful stop并删除；不涉及业务容器。
- 本模块未执行生产Inspector、退休、恢复或供应商调用。未声称生产退休验收完成。
