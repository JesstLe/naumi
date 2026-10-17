# 103画布视频：新运行实例自动恢复与安全关闭

## 范围

本模块继续已批准Task16/17。开工及合并前fetch main，本地与远端4b448ca一致；只改宿主发布工具、测试和文档，业务固定e997b290b39fc9df63e4c3b6387fa008b7b0e18d / 1792200281 / 普通镜像9fea589fed46a283fe8601d2771d0517077ce176708bdc9ff9e7226693c20f1e。没有重新构建无业务变化的镜像，也未连接/安装/切流103或持其部署锁。34/34应用条件及55份证据保持；本模块不等于完整交付或完整回滚。

## 实现

- 发现实际问题：仅给候选Web配置Docker自动重启仍会让每个新boot按容器固定env启动为draining。新增release_runtime_recovery.py在私有/release-state安装launcher、admission.cjs和固定boot-context；HostTransaction仅本目标103媒体绑定分支使用该entrypoint，Cmd仍node/server.js，原47/旧发布路径默认不变。
- 首次没有activation.json时保持draining。已ACTIVE且真实App准入/boot及调用Worker状态核验通过后，显式runtime-finalize写HMAC签名标记，绑定releaseId、instanceId、commit、buildVersion、enabled；恢复进程先验证签名和上下文，再以open或draining加载原固定Node/Next。无效标记在Next之前exit1。shell先单独赋值，避免export掩盖helper失败；helper清NODE_OPTIONS，避免给短命检查进程重复安装HTTP preload。
- Web/调用Worker/媒体三个精确CID的Docker策略只在no与unless-stopped之间更新；不start/stop、不改镜像/env/挂载、不恢复DB或重放任务。持有HostTransaction才允许执行，原操作私有journal绑定CID/image/启动时间等身份，回执丢失后按同一操作重观测，不重复已生效的Web更新。
- 发布会话finish必须先完成runtime-finalize并重新检查实际策略与持久启动标记。策略变化后刷新session内public container identity，原创建回执保留历史意义。
- rollback先把签名标记写为关闭并把自动重启置no，再排空调用Worker和App/媒体。标记以1001:1001、0600私有临时文件完整flush/fsync后原子发布，避免主机在写完与chown之间中断留下App不能读的标记；中断时保留原始字节，不删scratch或业务媒体。
- 原调用Worker已有持久worker.json；unknown/dispatched恢复时仍暂停，不为自动上线清除未知tick/任务。只在其持久状态已恢复运行、无uncertain时允许完成自动恢复设置。当前模块不新增自动resume未知收费工作。

## 复核修正

第一轮Native新上下文48325实际读6份完整来源共139959字节并验证workspace/内嵌/声明SHA，发现2项：会话在进入policy恢复前先用旧restartPolicy做严格pin；启动文件只验内容及无group/other位，未证明UID1001可读/可执行。

已修正：先验证原操作journal及完整CID/image/boot/mount/env，再刷新重观测的public identities并验证App/调用Worker，全部通过后才改标记/策略。真正通过MaintenanceSession.step与LiveAdapter注入Docker更新成功但响应丢失，重载canonical后按原UUID显式reconcile，最终ACK且Web只update一次。验证文件与目录严格要求owner/group1001:1001，目录0700、launcher0500、JS/context0400、marker/caller state0600；不完整安装/缺文件/错模式/错owner一律拒绝，verify不修复。

修正复核65752读3份全文101358字节，全部SHA一致，No actionable findings within the two-correction scope。首轮和修正完整材料保留在checkpoint-d/runtime-recovery[-corrections]-review-source.json/log/verdict.txt。审阅不替代实际执行，不声明整个生产发布通过。

## 集中验收

Linux四组共67项：新恢复/会话11、Host9、原会话35、媒体12；65通过，2项原Nginx用例跳过。追加调用Worker目录权限约束后仅重跑受影响11项通过，没有重复无变化的全业务测试。包括三角色策略/撤销、原意图丢失响应、真实会话重载恢复、boot漂移/uncertain拒绝、操作UUID不可换目标、缺失文件/错权限只拒绝不重建、原子标记中断保留旧字节、finish前置与回滚先关闭恢复策略。

实际独立LinuxDocker固定9fea Next、内部隔离网络、合成PG（192MiB）和Web（896MiB、等额swap cap），没有正式凭据/供应商入口/业务挂载：

1. 首次boot准入draining。
2. 写有效签名标记并设置unless-stopped；通过pidfd只向精确合成目标PID发SIGKILL，Docker自动恢复同一CID/镜像，新boot准入open。不是用手动restart冒充自动恢复。
3. 合成插入一条旧boot accepted-work active记录，再次精确异常退出并自动恢复，新boot仍open但unknownLeases=1；原记录仍active，没有清零或重放。
4. 撤销标记、策略no，保留CID手动stop/start后draining；未知记录仍1。
5. 篡改签名，下一次进程在Next前退出，确认错误标识、exit非0且非OOM，旧active记录未改。

最终实际CID1a0962f5f4dd2ea000c74a7e3fbf92451fb5880fd97b18a39cd7c8f96c49c094，四个boot分别f2d6c46a-b5b7-4c86-b3f8-cb4bba8d873e、b0305657-3b1c-458a-97c9-ece60e9a6a9a、e3fd0c07-7c87-421c-8bf0-fcf1340b3f1d、2f1827d0-00c2-47ea-a3e6-d64c326419ec。结果unexpectedProcessExitsAutomaticallyRecovered=2、productionConnections=0、supplierCalls=0。目标退出后按自有CID/label精确清理测试容器和volume/network；留存私有测试state与证据。重新读取实际执行过的launch.sh/admission.cjs/context并验证当前模板字节与owner/mode一致。

证据：output/canvas-video-fusion-20261013/checkpoint-d/runtime-recovery-20261017/；早期手动重启批次和首轮67项之前的60/65项历史批次外部原样保留，不替代最终真实异常退出结果。实际Next测试覆盖Web启动恢复和未知租约；三个角色的宿主policy更新/丢失响应由单元和会话接线验证，不把它冒充三个正式进程已在线自动恢复。

## 仍需完成

切流后回滚涉及已接受工作，当前新增明确保护：关闭候选准入/自动恢复后，存在openGateway则拒绝切回旧入口，返回POST_ACTIVATION_ACCEPTED_WORK_AUDIT_REQUIRED；尚未实现完整已接受任务归属/回退证明，不接受人为填true的回执，也不改旧任务状态来通过。该保护是未完成交付门槛，不能宣称完整生产rollback已就绪。

后续继续完成这项证明、历史无引用UI来源/会话/任务/引用闭包与精确可恢复退役、真实RAM达到5120MiB、生产备份与锁内蓝绿切换、旧槽排空停止、线上验收/计数/交接。全目标保持active，未新增成功发布次数。
