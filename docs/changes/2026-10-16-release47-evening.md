# 47主站与香港103今晚18:30单次上线 / 2026-10-16

## 用户授权与调度
- **最新覆盖：用户已明确回答“本次接受短维护迁移，保留任务和数据”。本次18:30允许短维护，不以本轮无感蓝绿或legacy完整排空为已通过；之后恢复标准蓝绿。** 原下述常规蓝绿标准仍用于后续更新；本次按单次维护迁移记录，不修改旧进程计数为0以通过原门禁。
- 用户2026-10-16北京时间13:32明确：今晚18:30直接上线，届时无人使用，并要求解决本轮全部已列待解决问题。
- **最新用户新增“可以顺便更新到香港站，香港站无人用”：本窗口按47.105.59.142→103.30.76.93顺序执行。** 授权覆盖本轮修复后的双站发布，无需再次请求同一发布确认；不扩大到其他站点、购买资源或破坏性数据迁移。两站数据/媒体/凭据独立，不互相同步或覆盖。
- T3调度已创建，绑定当前线程3e153cf4-dc4a-4aab-853b-0bccd1905a87。
- scheduledTaskId: scheduled-task:command:mcp:653ace73-a7fb-4307-b5b9-a247be31d240:schedule-task:release47-20261016-1830-bjt-once
- nextRunAt: 2026-10-16T10:30:00.000Z，即北京时间2026-10-16 18:30。
- 当前调度标题已更新为“主站47＋香港103今晚18:30上线（2026-10-16单次）”；沿用同一scheduledTaskId，不创建重复预约。
- 调度器底层按周五18:30触发，任务提示词限定2026-10-16当晚且要求第一次执行立即禁用本调度；不是每周发布授权。过期不执行，不创建第二个同目标调度。

## 本轮问题清单及完成标准
1. 内存：以最新MemAvailable、cgroup anon/file/peak、候选真实业务峰值核算；47不构建，保留至少1GiB主机余量。受控旁路一个Web+同image Worker；无序增加实例或依赖Swap不通过。
2. 旧槽：逐容器固定ID/image/启动时间、Nginx动态及内部引用、系统服务/Worker调用图。只退役证据充分且自然排空的槽；没有引用不等于会话/任务已结束。
3. Worker：新领取与已接受工作分开；旧tick自然完成，新Worker暂停启动，持久控制CAS/幂等，UNKNOWN使用原operation回执核对，不重复发送tick/供应商任务。
4. Agent与App：活动请求、Agent会话、App后台任务及租约可核实；SSE/steer/stop继续归属原实例。旧实例无控制端点时标legacy/unknown，需迁移方案实证，不以数据库历史或TCP0冒充完整排空。
5. 旧客户端：静态JS/CSS原字节保留，RSC/ServerAction兼容验证，原画布保存和任务查询跨切流可用，不强刷。
6. 统一执行器：完整计划/三锁/基线CAS/备份/旁路就绪/切流/故障切回/排空/收敛状态闭合；不是只安装门禁再报告阻断。
7. 用户功能：Skills账号隔离/点击拖放/独立包装页/画布布局进度批次/BI作品权限和模型链/比例完整画幅/禁用通道与原路GET恢复，受影响功能集中验收。

## 已有产物复用
- worktree E:/Workspace/naumi-release47-20261016；branch codex/release47-integrated-20261016。
- 固定业务source5405d23，BUILD_VERSION1792127247，image sha256:8f2b379b386f3b910dfa7cff93ddbfa7403558c4285c1d48aea54650c5c9f857；后续代码改变须重新固定SHA、构建及相应验收。
- 最新文档ae95750；源码/镜像/patch/原始hash/BASELINE100-MODIFIED118-ROLLBACK100位于E:/Workspace/naumi/output/release47-integrated-20261016。
- 上轮26项集中回归及本机新镜像密码登录/导入/保存/390px通过；不是正式生产验收。
- 13:23实时基线只是历史快照：13容器；MemAvailable2119MiB；公网f4b3df1/1791989816；active模型配置117。18:30全部重读。
- 共享主目录18项未提交后台UI仍受保护；吉祥物仅设计及他人暂存Dock不擅自导入。

## 执行原则
- 用户预期无人使用不是后台已排空证据；18:30仍核查实际活动。
- 每次服务器变更蓝绿、共持三锁：/opt/naumi-staging/releases/deploy.lock、/opt/naumi-reverse-hub/releases/deploy.lock、/opt/reference-workbench/deploy.lock。
- 不原地重启在线槽、不回灌DB/媒体、不重放已接受或未知付费任务、不并行清退、不输出秘密。
- 当前生产未变更。后续每个模块记录实现/测试/未完，最终记录实际生产版本、Web/Worker image、内存、连续性、旧槽停止与回滚证据。

## 本次短维护迁移补充（用户明确接受后）
- 白天继续本地整合、固定构建和模拟演练，18:30才进入维护；不提前切线上入口。
- 开始前新鲜核对三锁、主机identity、全容器ID/image/启动时间、Nginx完整闭合、来源配置/媒体、独立后台与任务账本；获取可读一致性备份及原配置回退材料。
- 维护仅阻止新创作/新任务，不修改用户数据库、积分、媒体或供应商任务ID。公网入口维护与容器内部任务分开，不能认为维护503等于Worker已暂停。
- 旧5fc Worker是fetch+setInterval，无SIGTERM handler或tick回执。若先冻结旧tick caller，明确记录为冻结迁移而非自然排空；已发HTTP的App执行需继续核查。不要同时恢复旧caller和新版Worker。
- 核查每个旧Web的NAUMI_VIDEO_WORKER环境；非0可能存在本机20秒扫描，不能只停外部Worker后声称领取关闭。
- 原非终态任务逐表留存，关联原供应商ID/冻结参数/价格/账本与租约；区分可GET恢复、从未提交、有供应商幂等保障、未知提交及纯内存执行。未知/已接受任务禁止重新POST。尚未持久的Agent/工具/文本结果仍须等待或保留原进程，用户接受维护不等于允许丢失结果。
- 可恢复未终态保持原记录，不回灌备份，不靠批量error/退款/清租约来宣告完成；无法确认的单独保留清单与原槽，迁移及清理状态分开。
- 候选同image Web/受控Worker限资源启动；Worker初始paused，核对恢复边界后再resume。原任务恢复和用户新任务并行前检查原归属与幂等。
- 恢复公网前核对真实版本、登录/DB/私有媒体、Skills/包装/画布/BI权限、旧页保存读回及原任务查询。失败切回原程序入口，保留当前DB/媒体/任务账本，不回灌、不重放。
- 已核实的旧槽逐一关闭自启及退役；仍执行或未知的原槽留存并记录CLEANUP_PENDING，不批量停止基础服务/其他负责人实例。

## 下午整合进展（阶段结果，不代表生产上线）
- 已集成Worker持久tick回执7ae3e4f、host原UUID GET-only核对781eded、Agent账号/boot所有权与租约6a66783、真实进程HTTP preload f34dc29、网关/静态闭合02770c8、全量只读盘点d214b1e及tick-Web preload boot绑定ec9f1de。
- 已只读采集6旧Web完整static、原alias字节和4个nginx源文件精确bytes/realPath/SHA；未采集prerender预览密钥。真实旧canvas镜像c952f4a流式取回本地，242561341字节，SHA2569347e7a7051102ffad3441050558a91918f598830a72e988637c692814b3f33e；47无写入/构建。
- 真实6旧static+5405候选并集717文件/10892916字节，无同URL冲突。旧页面在新API保存/undo/redo/PG读回已通过；跨build主动Next Link出现MPA reload，不能称RSC无感通过，维护兼容边界继续实测。
- 本机新Web初轮约270.5MiB cgroup峰值是合成测试观测，不是最终候选或生产重负载峰值；最终版本仍需重新固定构建及资源验收。
- 新后台已接受promise/claim租约、Agent续行proof模块正在独立实现；legacy任务只读快照/比对及统一维护执行器正在收尾。
- 已核对18:30预约enabled=true/nextRunAt=2026-10-16T10:30:00Z，并追加用户本次维护许可，触发后仍立即禁用避免周循环。

## 香港站新增范围与实时准备
- 103只读现场文档：`docs/changes/2026-10-16-release103-evening.md`。两站独立持各自锁及baseline，47三锁、103现有Naumi/Hub两锁；本轮不因默认旧文档连接其他主机。
- 103公网真实8af8ee6/1791975598，machine-id SHA26721373f7ecea7a5a9173a43bb017cd362d1f7ed9864b402874576a9e4fee35；31运行/38总容器，RAM7941MiB、可用约1053MiB，Swap近耗尽。保持至少1GiB余量，不能直接加三新槽或在103构建。
- 103有真实普通、desktop、enterprise三编译前缀，原R2/private、账号/积分/配置/媒体保留。需同固定最终业务SHA的三种构建，不能用47普通image覆盖三类型；Fleet门户13062独立保留。
- 103完整Nginx有65locations/21端口，历史static回退链最长8级；无引用不等于可停。只读采集当前完整static/原磁盘root和exact配置，先物化原URL字节再移除历史进程依赖。103候选配置适配及维护恢复另行实测。
- 103直连SSH及本机SOCKS曾banner EOF；经已授权47仅SSH direct-tcpip中继到103，独立固定hostkey与DPAPI认证只读成功。没有借用废弃主机；两站未做任何发布写入。

## 最终候选复核中
- 首次下午完整Linux固定9138b0ab316e768802db96f26214a3115bb56e9a / 1792131956已构建成功，完整TypeScript0。此image尚不可交付：后续真实middleware整合审阅发现GET tick receipt被feature gate提前401，虽直接route59项通过，真实入口尚需精确修复。
- 原9138和5405镜像、各失败日志作为历史证据保留，根等待业务修复后重新固定公开条目/业务SHA并重建；不将旧构建签成最终版本。
