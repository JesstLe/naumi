# 历史只读UI收敛：有限审计/单CID动作模块（非排空证明）

## 当前结果与边界
新增 `scripts/ops/release_legacy_ui_retirement.py` 和6项集中fixture测试。**没有服务器连接、真实stop/start或容量回收；今晚47/HK容量问题仍未解决，legacy未知内存Agent保持运行。**

- CLI只有离线`audit`，不存在execute/stop自动扫描或批处理命令。结果可以是HOLD；未通过不会修改容器。
- `audit(manifest, observations, artifactRoot)`返回`legacyCoverage=partial-nonpersisted-observation`、`ordinaryDrainReceipt=null`；没有调用普通assert_drain，没有构造AgentSessions=0或acceptedTasks=0。
- root将来在同一个HostTransaction锁域内可显式调用`retire_one`，一次仅一个完整固定CID；`restore_one`一次仅启动同一保留CID。工具不创建SSH、不获取第二套部署锁、不发现候选、不改网关、不恢复DB/媒体、不提交供应商请求。
- 生产实际socket/pg_stat_activity/完整引用/持久任务collector和不可变证据生成尚由root接线，本模块只定义严格输入契约。当前仅模拟适配器证明调用顺序与拒绝分支；**没有声称生产端到端收敛已经实现。**

## 输入与拒绝条件
manifest固定host/hash、完整CID/image/startedAt、Config+mount hash、network hash、预期commit/version、带到期时间的本次单CID维护授权、维护bundle报告及完整原静态manifest/实际安装路径。

1. 原HostTransaction需仍持有全部锁：核对target/host hash、stack、lock_fds数量、`/proc/self/fd`真实锁路径和fdinfo内核FLOCK WRITE；没有继承锁不得进动作。
2. 当前`nginx -T`精确等于已验收file-static maintenance dump；原静态manifest每URL均在保留集、逐文件hash吻合。一次有限host Python只读核对全部已安装文件SHA/size，避免每文件一个进程。
3. 角色证据不是“uiOnly=true”：从创建startedAt至最后观测连续epoch，绑定原始部署route记录、实际强制default-deny/仅受控Nginx ingress策略、实际image的app-path/server-actions/启动完整module closure审计。存在未解析dynamic import、Agent/task API、非只读API、自动timer/worker/子进程入口或不完整epoch均`UNPROVEN_VOLATILE_WORK`。
4. 两次真实观测相隔至少30秒，库函数自己记录monotonic clock、Docker实际身份/Cmd/env、当前dump及task proof。socket须完整目标netns且无nonidle；pg_stat_activity须覆盖全部目标IP/application身份且无active/idle-in-transaction/未归属事务；目标进程树仅标准`node server.js`且无Agent子进程；全Docker/effective-systemd/internal配置引用审查无引用，并绑定原始采集工件SHA。
5. task collector须给完整持久ownership证明，目标accepted/Agent归属清单为空、unknown ownership为空、preservation SHA前后不变。**这不是非持久Agent排空；role lifetime未闭合仍拒绝，不把socket零当任务零。**
6. 无original static覆盖、未启用维护、错误CID/source/network、过期授权、间隔不足、任务变化、未知内部引用或未知进程均HOLD，不以用户维护例外掩盖未知。

## 六个历史UI：当前应HOLD
|端口|已有职责文档|能证明的内容|仍缺失|
|---|---|---|---|
|13028/29/30|2026-10-13-browser-image-cache.md|创建/切流仅UI/cache/媒体读取；动态创作/Agent/Worker留原core|完整Next app中仍有Agent/API能力；全生命周期不可绕过ingress证明、历史fallback对所有URI处理、内部直接IP调用及内存Agent归属未闭合|
|13031/32/33|2026-10-14-canvas-performance-70.md 模块8|限定20项UI/static/只读media/version，企业与创作写API留原端|同上；创建计划文档并不是从未承接Agent的可执行隔离证明|

实际重读文档SHA（本分支文件字节）：
- browser-image-cache：`a38c5c50a1706c30c83f2565588bd8be83b567c0e3afdfc771e37f5315154ab9`
- canvas-performance：`e46caa914a9fdab1ec70e5ed2f5c0b8554094ed7ce0c8959c8c2717d254dde9d`

这些只是可供主控审阅的来源锚点，不能使六槽eligible。完整Next中实际app-path含`/api/agent`等时，即使人为role声明全部true也由工具拒绝。输入本轮未提供的全生命周期网络策略不得现编一份回溯当既成事实。

## 有限动作与恢复
- `retire_one(tx, manifest, root, observe, task_proof)`：检查锁/维护/原URL全hash→两次30秒观测→audit→再次维护/身份CAS→先落盘单CID原像和restart/ports/任务/资源intent→`docker update --restart=no CID`→`docker stop --time=-1 CID`。Docker无限graceful timeout**没有SIGKILL升级**；客户端wait只允许30—300秒，超时保留UNKNOWN并要求人工reconcile，不追加kill或重复stop。
- 真实stop后检查Running=false、OOM=false、exit非137、原Config/mount/ports不变、restart=no、任务proof前后不变；保存真实MemAvailable/SwapFree，但Swap不计RAM。不rm容器/image/volume。
- `restore_one`先检查真实MemAvailable预算（>=1024MiB，实际须root填旧槽峰值+reserve），原CID/config/image/mount/ports/network绑定，单个docker start后必须实际health/version/commit/static hash probe成功，才恢复原restartPolicy。
- 恢复预算不足时保持maintenance；**本工具不会为了重启旧槽而自动停止新候选**。root必须先验证本轮新候选accepted/Agent归属为空，按原session安全停止其精确CID释放RAM，再逐一恢复旧CID。原完整fallback全部恢复后才能另用已验收CAS链回原公共网关；此模块不会提前reload。
- graceful进程退出本身可能丢失未证明的内存状态，故角色闭包缺失绝不执行；补录一张drain receipt或延长socket等待并不能填该缺口。

## 测试证据与未实现项
集中命令：`python scripts/ops/test_release_legacy_ui_retirement.py -v`，6 tests PASS / exit0。
- 文档-only、未知accepted归属、真实完整Next Agent路径反例均HOLD。
- 29秒间隔、动态网关/非idle socket/DB事务/Agent子进程/内部引用/缺原始采集工件拒绝。
- 严格的**虚构只读服务**闭包fixture可进入显式单CID动作，检查一次stop的`--time=-1`、restart=no、原CID恢复及policy还原，无rm/force/DB写。
- 未知角色fixture在进入任何Docker变更之前HOLD；无原锁拒绝。

尚未实现/未验收：真实生产collector接线、内核锁现场验收、六槽历史证明补齐、真实stop/start或信号退出测试、任何容量收益。模块可加入ops安装包作为**默认只审计、缺证据HOLD的有限接口**，不能作为今晚容量已经解决的发布依据。

最小离线调用：
```powershell
python scripts/ops/release_legacy_ui_retirement.py --manifest PINNED_SINGLE_CID.json --observations TWO_RAW_BOUND_OBSERVATIONS.json --artifact-root PRIVATE_EVIDENCE_ROOT --output NEW_AUDIT_REPORT.json
```
没有自动stop参数。主控先检查报告缺口，再决定后续独立审计任务。
