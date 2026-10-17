# 2026-10-16 18:30预约47主站：最新main已切流，旧槽收敛待闭合

## 实际结论

- 本预约已禁用，enabled=false/nextRunAt=null；本轮只操作47.105.59.142。香港103即时旧事务不接管、不重部署、不换UUID；120/旧179/101无连接。
- 47公网当前业务**7bdcd8b644e8771646003f68055585f257df40f0 / BUILD_VERSION1792146767 / v2026.10.16-183247**；Web与Worker同image`sha256:14a8d2ab2c76068569a8c9fe9dde81fc581166f9d108e8dbf8b347ca09cd7375`。
- canonical `release47-window-20261016-main7bd` / **MIGRATED_CLEANUP_PENDING revision34**。迁移/公网启用已完成；旧槽退役、自动重启恢复没有完成，不标COMPLETE。
- 北京时间19:00:05进入维护，19:14:23开放新入口并resume新Worker；约14分18秒维护。本次是用户接受的短维护迁移，不是零reload蓝绿。
- 原HostTransaction/37143从基线至最终回执持三锁，19:25前后close exit0；独立只读同时取得三把原锁再释放，`ALL_THREE_LOCKS_RELEASED=YES/REMOTE_EXIT=0`。

## 最新来源与现场

18:30刷新main发现全部开发分支已合入7bdcd8b，故0614不作为最新。独立任务worktree快进后构建两目标image；构建/type/main46、旧Next两轮save/undo/redo/PG读回与HK三UI6877本机QA通过。47只上传其单image257014781bytes/SHA9697edf90fe9fe62e843aa9e2f93cf871ea805f3d7d292314bd00158bcff0835；香港image未因本预约上传。最终切换前及19:25 fetch仍main7bd，未覆盖共享checkout18项未提交、不推main。

生产新Web CID3f946131945971760e53803fbe8c6eaf4cc5ee762fa14db77f0b99f6a8d1c810，13100仅loopback，preload boot5bddd90b-355c-4b3d-ac59-eae52d4f3806；新Worker CID74f0d5cac3883f0bad4daf2e477a56497b25b3c1c6c8b0e9d33d836db98d2119，boot35005a02-7a04-4ea4-bca3-0118144810e0，直连该新Web。初始draining/paused，真实验收与preservation后open/resume，最后IDLE、activeTicks0、unresolvedTicks0、实际tick complete与serverReceipt持久hash。未知旧tick/旧Agent仍不称0。

## 数据、内存与旧槽

- canonical备份40399465bytes/SHA6876b5d5ceb77dbb694da85a2a474b5c84ebc3483e4cc9c675d7f07043a052e4；TOC/hash/full pg_restore --file=/dev/null核验，未restoreDB。
- baseline、切流前与切流后23表原任务proof比较：preservationVerified/noMissingJobs/noOriginalSupplierMutation=true，violations/unknownTables空；切后允许1新关联行，0原状态转换，drainProven=false。不改任务error、不清租约、不退款/重POST凑完成。
- 原main和五个历史Web保留原CID/image/StartedAt；原caller只pause保留，未宣称自然排空。七个baseline对象未退役，基础服务/工作台17847保持。
- 初期1845MiB可用，GC不足；对确认旧进程每个仅一次GC、一次有限reclaim，全部原身份/Task proof保持。内核不支持swappiness参数的失败/EAGAIN等证据保留；最终仅reclaim期间临时vm.swappiness0->60，finally恢复0并复读。旧内存有约258MiB分页，不能称无缺页/无停顿。
- **维护前实际MemAvailable2171MiB，门槛896+128+1024=2048，不把Swap加RAM**；19:20可用1832MiB，新Web峰396.78MiB(416051200bytes)、Worker48.03MiB(50360320bytes)，新容器swap0/events0/OOMfalse。Web仍896/heap512，不采用失败512档，不外推高并发上限。

## 生产验收，不以本机QA代替

1. 已有native admin会话仅私有Cookie文件；未创建/改密/提权。真实生产candidate119项：Skills multipart导入→revision2编辑→精确GET，包装action:save→revision2→精确GET，画布API save/undo/redo持久读回，1x1PNG原字节SHA一致/匿名拒绝、已有媒体可读。
2. T3原生浏览器通过临时本机loopback SSH代理访问candidate，代理仅注入既有Cookie；无公网候选端口。实际Skills文件选择导入private；实际DOM DataTransfer drop导入private。无frontmatter错误文件一次400保留，正确文件成功，不把失败当通过。
3. 包装交互页填写简报并点击保存云端，项目f53e5e9f-cae8-4e3e-9295-fb085828a8b6/v1读回。画布打开本runId项目、编辑文本、点击撤销读原文，再点击重做读新文`Browser save 47 release 20261016-1916`，无保存告警。
4. 独立已有另一原生账号：三份个人Skill均不出现在目录、包装项目404、原媒体404、真实`/api/admin/bi`404；没有注册/改权限。早先测试不存在`/api/bi/overview`不作为BI权限证据，已改真实路径重新核验。
5. 六项同boot/真实response collector通过；原匿名/media401字面`Not found`，初始spec错断言error导致失败，显式原UUID FAILED_READONLY关闭（不是验收通过），新不可变spec重采。直接candidate不含旧chunk是架构预期；通过真实Nginx对**1029份旧新静态逐HTTP+SHA全部一致**，旧721保留；共用旧字体另在candidate验证。
6. 公网https://47.105.59.142/api/version浏览器和服务器读回最新7bd/1792146767，healthDBok、已有登录可用；公网包装页实际水合标题/版本和PNG已取。未额外调用付费模型或供应商探测。

## 现场修复与未收尾

- baseline原UUID2d37f220-9604-4e4b-8324-72f3bdb7ed20因合法systemd字面\xHH/●解析与允许47分层盘点失败；窄修保留原UUID/plan/CAS及无before前提重采。系统服务目录仍partial，不把它当retirement/drain。
- 新Web自身health/version正常，最初CLI probe继承NODE_OPTIONS重复preload导致143；仅docker exec CLI -e NODE_OPTIONS=隔离，PID1 observer/原boot/镜像不改。原web-verify UUID修复重读ACK。
- 失败只读collector原request/hash保留，严格新协议记录FAILED_READONLY；未手改canonical凑PASS。最终所有操作有ACK或明确失败关闭，无UNKNOWN pending。
- **新Web/Worker restart=no**：现工具无正式policy晋升，新boot默认draining、未知Worker需GET reconcile后受控resume。未临时docker update破坏含restartPolicy的identity绑定，未声称自动重启自愈/HA。需后续独立journalled同boot policy提升与新boot恢复验收。
- 旧Agent/工具/后台完整排空不可证，七对象CLEANUP_PENDING；禁止批停/强杀。后续发布被canonical债务阻断，不叠新实例。

## 工件与回退

本机真实证据根：`E:/Workspace/naumi/output/release47-evening-20261016/window-1830`；私有canonical/完整payload/secret不提交。四件：`handoff/MODIFIED_FILE.json`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh`。MODIFIED保留新版；副本BASELINE35/MODIFIED46/ROLLBACK35 tests exit0，22路径还原hash；第一次source缺件失败原log保留。它们是隔离副本/协议验收，不是实际生产回退。

远端evidence `/opt/naumi-staging/evidence/release47-window-20261016-main7bd`；**可执行700 `ROLLBACK-main7bd.sh`**，SHA35279ba81b69e7f38cb9dddf511300e3db18f9cc6c462b42521bf7d6fb290f30；九模块fixed recovery包SHA01a2527328131aabbe51eef8c0f79a91f8d8ed76165f8de41183ab892d8c53ab已安装并Linux import/sh -n通过。脚本重取同三锁、核原manifest/current/revision，原UUID不重发新动作；先新Worker drain及GET核清unknown，再兼容原入口/程序、恢复旧caller，不回灌DB/媒体、不重POST。生产本轮未实际执行回滚，原Oct16日期绑定授权保留。

资源材料/最后两个成功版本及原备份保留；本轮只新增一个新Web/同imageWorker，无批量容器清理。新架构成功切流1次，历史空间维护累计计数未据此猜测归零。SSH验证/上传、QA代理自有进程已结束，常规Chrome未操作。
