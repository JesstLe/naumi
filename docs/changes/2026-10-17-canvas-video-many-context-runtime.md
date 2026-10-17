# 103画布视频：完整执行环境观察与依赖来源

## 范围与现场

开工fetch origin/main，起点b93ec39。前一模块已完成固定Next/真实Nginx/合成PG入口封闭联合验收，本轮继续发布前容量回收准备，不修改e997业务源码或镜像。

103于2026-10-17 04:29:14 UTC只读刷新：MemAvailable3064860KiB，约2993MiB，低于896MiB Web+128MiB调用Worker+3072MiB媒体+1024MiB主机保留=5120MiB。Swap不计入。Nginx仍fa9ecb10fb1a527a1363008ff3c08920b18ebc7d717b69c3a70d9ac372d31c6e，现行三UI/上传核心/原核心/调用Worker保持。多组无现行网关引用的旧Web仍各占约200–260MiB；没有仅凭这些容量或路由信息停机。

## 审计器改动

- audit_legacy_node_maps.mjs默认16环境保持，原上限32以上必须另加--accept-many-contexts，显式最多512。selected-context输出仍标不完整，原退役/源码证明门禁没有改动。
- Map/条目预算按整轮累计，向每个环境只传剩余额度，不能乘以环境数量。大量环境跳过二次方原型比较，计数仍明确是upper-bound，uniqueCountsGuaranteed不变为true；少量环境保留原比较方式，不支持跨world比较时停止重复尝试。
- cooperative截止时间默认120000ms，显式最多480000ms；进入环境、queryObjects返回、候选处理及最终完成前检查。超时HOLD，清理在预算外完成。V8 queryObjects会强制全堆GC，其固有暂停不能靠客户端截止中断；原警告保留，没有宣称绝无运行时成本。

## 集中验收与复核

实际独立Linux固定9fea Node镜像、network=none、512MiB等额swap cap、无生产连接或供应商：每个合成实例281环境，在最后一个环境放会话，第二种再放pending创建Promise。完整扫描分别84957ms/81096ms，均找到末尾会话1；pending场景准确报告pendingCreating1和OBSERVED_ACTIVE_OR_UNKNOWN，不把活跃记录当空闲。均关闭Inspector、保留测试目标直到验收完成，之后按自有CID/label精确清理。

未显式同意大量环境时，在打开Inspector前拒绝。累计预算反例：前25个环境成功，累计Map72达到预算72；下一环境自身仅3 Maps，却因剩余额度不足拒绝，证明不是沿用单环境上限。关闭Inspector确认。单一最终环境内1800会话、1000ms截止，在处理786个后返回HOLD/AUDIT_CONTEXT_DEADLINE_EXCEEDED，1006ms，Inspector关闭；不在最终环境超时后仍返回成功。

初版复核提出2项P2：最后环境缺截止检查、原预算负例可能在第一环境就超限。已修正并用上述实际反例验收。首轮多环境测试在预算负例的60秒观察超时后失败，保留原材料；不因它超时重启同一活进程，确认终止且清理自有目标后才执行修正批次。

修正Native新上下文完整读取2份来源29636字节，逐份workspace/声明/内嵌SHA一致，结论No actionable findings in the requested corrections and regressions。源码SHA：audit_legacy_node_maps.mjs a886348971bf416309a6b4ef2475c73d6400e056b28172122008952c7dc1b541；fixture3a9cfdbb3b9ef9cbd712da0a73de124ca144445d354e733d4d5335e8910868dc。复核未操作生产或代跑测试。

证据：output/canvas-video-fusion-20261013/checkpoint-d/many-context-maps-20261017/，Linux分别/var/tmp/video-many-context-maps-20261017-v2及/var/tmp/video-many-context-deadline-20261017。many/deadline分目录保存最终结果，平铺历史复制不作为最终总表。

## 实际外部依赖采集

精确13033旧UI，CID0b8ff61f47f23d781f3d156e0c84685854d02551bdd17138b07616a8968e4685、image8f6d2dc56ef6dc92a666108311a35081ef13ebbe69cc3f0b5d902e9b0f1f8b03、boot2026-10-16T22:23:13.894146717Z。只读docker cp其/app/node_modules，经原授权47 TCP中继流式返回，没有在47执行命令/操作服务或在103写文件。

归档76263936字节，SHAc52e3aafe794ef3fc0e54a080ec2f273135af18d471f1c061ce60f9a991913c3；1918份JS/CJS/MJS/package.json，共35450532字节，另16文件留目录/hash，symlink0。逐文件重新读取验证SHA/size，解包前校验路径只在专用目录，拒绝绝对/越界/特殊文件；没有直接不受限tar extract。原始tar和展开来源在外部用户+SYSTEM权限专用目录legacy-ui-13033-vendor-v2-20261017，未提交依赖源码。catalogue SHA737350577ffc89abbed9d2eb6df611359ac8b2e2823c98d33d0176507f5e3947。

首轮把完整Docker State连同健康检查时间戳都当不变量，采集后因正常Health记录变化拒绝；失败tar没有作为成功证据。修正只绑定实际CID/image/PID/StartedAt/Running/Restarting/Paused、Config/Mounts及网关后重采成功，不删除启动身份检查。没有读取正式env值或业务媒体到输出。

加上已有650份编译来源，现有可核对文件共2568；“源码已取得”不等于“所有自治入口及native Map构造已审计”。sourceClosureProven和sourceAutonomousAuditComplete仍false，不生成普通完整排空回执，也没有据此停止旧UI。

## 后续实际280环境回执

原exec80606已确认终止，报告HOLD/AUDIT_CONTEXT_DEADLINE_EXCEEDED：480971ms，只完成278/280；零计数是这次不完整观察，不能当排空。Inspector实际关闭，原容器/image/boot/PID/config/挂载/网络和网关保持，2568文件/57401078字节逐文件重新核对。

按这个实测只将显式预算上限480000→540000，默认120000和其他门禁不变；增加budget-window独立真实Node用例，540000可完成、540001在打开Inspector前拒绝。Native新上下文完整读取2份来源并核对SHA/嵌入字节，No actionable findings in the bounded review。不重跑未变化的全业务E2E或281环境旧用例。

确认原进程终止和Inspector关闭后，另一次实际观察exec60091使用510000ms预算、570s外层和600s只读SSH通道；结果477769ms完成280/280，OBSERVED_MAPS_IDLE，93 Maps/2870条已检查项，会话/创建/运行/画布/tmp/persist/tool-result/unknown全0，Worker isolate0，所有环境集合检查通过，Inspector关闭，实例及网关不变。直接把真实报告交给原inspector_check，运行时这一项PASS；源码自治入口、任务归属、内部调用等其他门禁没有因此自动通过，ordinaryDrainReceipt仍null，没有停止容器或释放部署锁。

完整回执SHA9e8e8818d20ab166fb47e844557448bc13c834eac740edcb2b7d70f2f9f4dce8；证据actual103-full-map-complete.json及actual103-runtime-gate-result.json。原始HOLD单独保留actual103-first-full-attempt.json，不能混成成功。exec80606/60091均terminal，active-observation.json已标明终止结果，文件本身不冒充活进程证据。后续更具体的函数绑定和租约观察见[Agent绑定观察](2026-10-17-canvas-video-agent-scopes.md)。
