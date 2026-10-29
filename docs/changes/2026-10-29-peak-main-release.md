# 47 最新 main 继任发布（2026-10-29）

## 任务与固定版本

- 用户本轮明确要求“拉取最新远端然后合入main，上线”，解除本任务 47 暂缓发布；仅处理 47，不修改103。
- origin/main 与本地 main 已从 eca93b8b 刷新到 `43d469498c111223408238c505c5febf76482a78`。远端未合入项只有重构线与专用历史回滚分支，未合并它们；共享 checkout 的既有未提交内容保留。
- 发布前真实线上已是 `06dbf79b0e7b93000e64df6412fd4bc4b3fd7745`，不是昨天准备的旧候选。本轮固定构建版号 `1793236756`，来源为最新 main 43d46949。
- 最新源码相对在线仅两个应用文件变化：`enterprise-navigation.ts` 与 `middleware.ts`，显式维护浏览器 authority 的 hostname/port，避免旧书签跳到内部3000端口；凌晨企业历史/健康与已合入 NAS 连接释放修复保留。

## 模块与职责

- 应用改动属于站点导航，未改计费、供应商、排队上限、企业配置或业务数据归属。
- 本轮操作器复用现有 enterprise-history/site-control/host 发布流程，仅绑定当前授权与一条精确未受理 tick 的保留交接；不创造第二套恢复系统。
- canonical 状态/操作 intent/receipt 使用原状态文件 revision CAS，持 Naumi/Hub/参考工作台三锁和生命周期锁。原 UNKNOWN、历史活动及旧回执不改成功，不回灌数据库、不重放收费请求。

## 发布前真实异常

- 09:00 旧 Worker 同 boot 的一次扫描请求返回503，耗时3016ms，随后 paused/UNKNOWN；本任务09:09才开始持锁。
- 固定 tick 在数据库中无受理回执；同 Worker 此前672条回执均completed。当前扫描promise=0、媒体running/queued=0，旧Web活动会话0，域租约/事务/advisory locks均0。503的具体底层起因尚未由日志证实，不把它冒称NAS泄漏或供应商异常。
- 切流前和旧槽退役前再次核验同instance/boot/tick、无入库回执、真实请求/任务/会话排空；原本地UNKNOWN保留，新实例使用独立状态接管。
- 旧 worker-watchdog.timer 仍配置批量改写 unknown/running 回执与活动。原文件留证；本轮退役该重复timer/service，真实固定实例恢复supervisor保留并重绑定。停用旧脚本不等于已实现任意UNKNOWN自动自愈。

## 集中验证与回滚

- 固定 main Linux完整构建 exit0，122.75秒；隔离镜像37份JS/CSS实取200，未调用收费供应商。
- enterprise authority回归、NAS连接释放13项、S3与弹性读图、history/site发布器测试通过；精确tick继任正反门禁10项通过。
- 实际旧middleware表达式重现 `https://47.105.59.142:3000/admin?view=health`，新版返回无内部端口的公网地址。
- 四产物与原文件hash保存在本机ignored `output/release47-peak-20261029-r1/`。独立副本回滚恢复4351份原文件hash，旧跳转行为重现；固定MODIFIED_FILE不变。该回滚不是生产数据库回滚或生产故障演练。
- 初次用新helper契约检验旧版因helper未存在退出1；保留记录，并另用真实旧middleware表达式验证实际行为。未把预期基线失败称为健康。
- 昨日 `verify-reference-workbench.ts` 的自动报价断言在原始/修改基线上均失败，已记录为继承问题，未删断言。该既有失败不纳入本次导航修复通过项。

## 现场容量与发布进展

- 初始可用RAM约4.7GiB，双槽完整峰值预算3584MiB＋主机保留1024MiB，Swap不计RAM；实际候选前复测。
- 磁盘81%、约12.54GiB可用。核对最近5轮恢复材料；尝试审阅更旧传输包时其保留镜像未完成核验，故无删除。无docker prune，未动备份/媒体/凭据。
- 一致性数据库备份、候选、真实登录/浏览器/NAS、静态资源并集、蓝绿切换、旧槽退役、最终任务保留证明及锁释放均以本轮最终回执追加为准。本文当前段不把已构建写成已上线。

## 本轮状态

发布正在同一个持锁事务中推进，最终结果待追加。

## 发布中断与已恢复（09:43—09:54 上海时间）

- 09:34:48网关切到43d46949/1793236756；旧Worker/Web在执行排空证据核验后分别退出，均restart=no。旧Worker因刻意保留原未受理UNKNOWN正常返回业务定义的exit2，媒体退出COMPLETE；核对停前停后状态完全相同后，按原operationId确认停止事实，未伪记tick完成。
- 首次创建候选被launcher的releaseId前缀校验拒绝，尚未产生Docker实例，两个预创建目录为空。留证后使用仅接受本批次固定身份的薄适配继续原操作；未跳过镜像/内存/boot/CAS门禁。候选蓝绿及新旧静态并集已实际完成。
- 切流后，生产后台历史查询事务持有用户行共享锁，却从同一个max=5连接池借第二条连接查询模型回执。其他连接等待该用户行排他锁，形成应用层连接池/行锁循环；不属于PG可自动检测的纯SQL死锁。健康与画布分别真实超时12秒/10秒，约201个HTTP请求积压。版本接口不查DB仍200，不能据此判站点健康。具体根因与本地修复见 `2026-10-29-enterprise-history-pool-deadlock.md`。
- 09:43:25核对后仅终止一个长期idle-in-transaction的后台读取backend：绑定PID/backend_start/xact_start/客户端IP/原查询，确认无RowExclusive等写锁且真实挡住其他会话；PostgreSQL回滚读取事务释放锁。未重启Web/整机、未清库、未重放生成。其后公网画布200约0.375秒、health200约0.263秒。
- 09:45观察到另一操作流对新Worker做reconcile/resume及重启，启动boot发生变化。这不是本事务动作；Docker事件原样本地留证。后续09:50真实数据库completed回执ok=true、HTTP200，Worker paused=false；不把外部干预归为本任务自动恢复，不把原缺失回执写completed。
- 用户确认“GLM仍在处理，先别切换”。立即停止进一步发布/重启，只做本地根因修复与隔离验证；09:54补记 `CLEANUP_PENDING_USER_HOLD`，三个部署锁均实际获取核验FREE。
- 已恢复后Chromium公网画布、记录页面、健康书签与移动健康页面可打开，177份静态响应200、pageerror0。保留旧HTML模拟旧客户端对新公网资源/API访问，`/api/projects`200；不是原用户未保存画布的真实端到端连续性证明。记录页页面壳通过不表示全部记录数据加载与筛选都已验收。
- 切流早期84次连续采样均200只覆盖其窗口；窗口之后确有上述公开超时事故，所以本轮**不宣称零中断、不标完整发布成功**。最初browser networkidle/固定2秒水合/测试Response.status()调用错误均留证，改为DOM业务条件与正确属性后重测，不将测试脚本错误算业务修复。
- NAS真实新上传/Range/清理验收、最后业务任务全图保留对比尚未执行。原始数据库备份1,349,370,594字节pg_restore list可读；恢复supervisor已指向当前pair，旧批量改写UNKNOWN的watchdog inactive/disabled。真实新Worker正在扫描不等于所有历史任务已恢复。
- 当前唯一已切流应用源仍43d46949；本地连接池死锁修复尚未上线。磁盘85%、约10.30GiB可用，备份/近期恢复材料均保留；没有删除任何试图核验但未满足条件的旧包。
- 本轮最终状态：`CLEANUP_PENDING_USER_HOLD`。不创建另一候选、不自动解锁HOLD、不重新切换。工作区20项旧修改hash保持，证据在本机ignored `output/release47-peak-20261029-r1/remote/`。

## 本地根因修复交接

已普通合入远端main的功能修复为 `eb1290b70b4e10c04a90e487e82d27bc93927782`；真实PG同池5连接互等复现/修正、企业历史/图片/权限回归、tsc及副本回滚通过。修复未再发布，用户要求保持现场不切换；GLM继续处理。任务分支清理不改变这一HOLD，不能把main新SHA当线上版本。
