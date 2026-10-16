# 103本次维护例外：历史UI进程退役与逐一恢复建议

## 边界与实证
- 本文是离线建议，未连接103、未停止或启动其容器。root在15:06补采`MemAvailable1045MiB/SwapFree0`、31运行、Web均`NAUMI_VIDEO_WORKER=0`；本子任务只读材料为14:22:48 CST之后的完整Nginx/容器/cgroup捕获（原UTC06:22:48）。两时刻容量不能当作同一采样的严格算术证明。
- `legacy-assets`已保存20个Nginx引用Web的`.next/static`及真实磁盘root；2684旧URL全部逐SHA保留。6272候选又加入1029个新URL，3713文件在真实本机Linux Nginx的candidate和maintenance配置各逐HTTP SHA/MIME通过。最终业务重新构建时需重做新静态并集，旧2684仍保留。
- 原17个named fallback中，1个是磁盘root，2个同时属于动态核心13012、企业API13027；剩余**14个容器仅在当前Nginx图中被named fallback引用**。该表述不等于它们是仅静态文件服务器，也不等于进程没有Agent/数据库/内部调用。
- 这些镜像是完整Next程序；`NAUMI_VIDEO_WORKER=0`只排除已知视频Worker入口，不能据此证明Agent runner、普通长请求、独立Node子进程或内部HTTP为0。当前捕获没有进程树/持久与非持久Agent归属/调用方完整图/可验收的排空计数。

## 分类（不直接作为stop清单）

### 明确保留
|角色|端口/归属|理由|
|---|---|---|
|原核心App|13012 / `18c31dc9e0cf`|默认API、desktop API、原Worker的`app`别名归属；还有named fallback，不因静态文件化退休|
|上传/生图核心|13038 / `045b6e4848eb`|imagegen/generate-image六条动态路由，接受任务与GET恢复归属需要单独交接|
|企业权限API|13027 / `12249e959bd4`|企业/team/feature-access八条动态路由，不能归类成enterprise静态UI|
|原Worker|`34dc0820026e`|`http://app:3000`实际指13012；新旧Worker交接独立闭环|
|Fleet|13062 / `770dcf7d1f27`|独立门户、API及静态9块原字节保持；不参与Naumi回收|
|基础服务|DB/Redis/Hub/New API/router/proxy/Mihomo/Nginx|本方案不涉及|
|当前普通UI|13039 / `9a9cf8abbb2d`|当前还承接media/cache及只读版本等，不按“旧UI名”直接退役|
|当前desktop/enterprise UI|13040/13041|本次回退入口，优先保留直到新槽验证；即使维护可终止UI也需单独列授权和恢复证据|
|无Nginx引用performance三槽|13035/13036/13037|无引用不是生命周期/内部流量证明，未纳入14个静态替代候选|

### named-fallback-only候选及证据强弱
数字为14:22快照memory.current，不是可承诺回收量；保持原CID/image/完整env及mount/network/restart配置。

|端口|CID前缀|MiB|现有Nginx引用|历史角色依据|
|---|---|---:|---|---|
|13028|6a9b0067cfdf|390.6|`@admin_probe_previous_ui`|缓存旁路普通UI，文档明确创作/Agent核心仍原槽|
|13029|fd6ef62af84f|218.6|`@admin_probe_previous_desktop`|同上desktop|
|13030|b90581dc4bda|211.1|`@admin_probe_previous_enterprise`|同上enterprise UI，企业写API仍13027|
|13031|3efa7ef869be|231.1|`@upload_previous_ui`|performance旁路仅20项UI/static/只读media/version，动态Agent/Worker不换|
|13032|40eeda84f6fb|211.8|`@upload_previous_desktop`|同上desktop|
|13033|0b8ff61f47f2|206.9|`@upload_previous_enterprise`|同上enterprise|
|13019|21cce1b0cd88|468.9|`@enterprise_analytics_assets`|曾承接enterprise/team统计页面与查询，不是纯静态进程；优先级低于以上6个|
|13026|e00c893cc870|171.8|`@imagegen_previous_primary_ui`|当前只有named引用；创建时职责及内部归属仍需补证|
|13025|3244aea0338d|164.8|`@enterprise_previous_assets`|同上，不能仅据容器名判纯UI|
|13024|e81c022b49be|159.0|`@entry_previous_ui_assets`|同上|
|13023|eef975acb8ae|209.7|`@enterprise_r1_assets`|同上|
|13022|2eaaa72dd650|175.0|`@entry_r1_ui_assets`|同上|
|13014|ef8a9f3dd6ad|86.9|`@image_cache_old_desktop`|当前named引用，原desktop程序不是文件服务|
|13016|b53ecc07737c|37.8|`@enterprise_oldest_assets`|旧企业程序，峰值曾536.7MiB、当前有swapcached；current很低不能用peak计回收|

历史角色来源为仓库`2026-10-13-browser-image-cache.md`最终上线/Agent提示、`2026-10-14-canvas-performance-70.md`模块8、`2026-10-13-enterprise-analytics.md`最终发布。历史文档辅助限定创建职责，不替代本次实时进程和调用归属。

14项合计current **2944.015625MiB**、anon **2782.953125MiB**；第一组6项current约1470MiB。`1045+2944≈3989MiB`仅乐观上界，离三Web896×3+Worker128+reserve1024=3840MiB只149MiB，尚未算新启动/保留旧槽/文件缓存回暖和Swap恢复；不能作为可上线预算。使用真实MemAvailable增量，不把同页file cache/共享页或swapcached二次算成释放量。

## 本次维护例外的可执行串行流程
1. root持103相应部署锁，刷新机器/完整Nginx/realPath/CID/image/env SHA/network别名、当前memory与Worker任务归属；制作并验证本103备份。保持原账号、私有R2、媒体与账本；不从47复制数据。
2. 安装已验收文件union到全新只读目录，逐文件SHA和路径/权限核验。用**原→maintenance** CAS并真实`nginx -t`、平滑reload；公开Naumi返回503而Fleet及三静态prefix继续正常。旧Nginx worker持有的请求须记录结束/明确维护中止，不能只看新配置已生效。
3. 第一组6候选逐个做身份与职责复核：无当前业务路由/无`app`或供应商内部服务别名；当前任务/Agent ownership ledger无归属；连接/日志/DB活动与进程树只读检查；没有未落盘Agent承诺。发现归属未知则该个标**未获退役条件**，跳过，不伪报drain=0。
4. 如果root按用户本次维护例外明确选择终止一个已识别的UI-only历史进程，则先落盘一条retire意图：精确CID、image、startedAt、角色证据、unknown项、原restartPolicy、原port/env/mount/network摘要、静态URL覆盖及回退顺序。明确这是**维护中止可能存在的非持久UI请求/内存状态**，不是无损Agent迁移。持续/已接受任务的未知归属不能借此例外重提交或重放。
5. 仅对这一CID发graceful stop，给合理退出时间；捕获exit/oom/是否超时转kill、错误与实际memory变化。若要求不允许丢失未知内存Agent而本槽又没有可核实终态，保留该槽，不升级为强杀。成功后保留容器、镜像、volume和配置，不rm/recreate、不清缓存。复核Fleet/API/原Worker与存储指纹未变，再考虑下一项。没有批量stop命令。
6. 每项后以MemAvailable、memory.events、swap趋势和单槽预算重新决定；只有真实预算满足reserve/峰值门槛才可逐个启动新普通/desktop/enterprise，App与Worker固定同业务image，候选检查失败仍留maintenance。达到预算即止，不为“清干净”继续退役。
7. 条件不满足则在维护内逐项恢复本次已停项，再用**maintenance→原**回滚。若已切candidate，先用candidate→maintenance保持503/静态/Fleet，再移除/停止仅本次已验证空闲的新槽，释放重启原槽预算；不得直接一口气重启全部旧UI。新任务已被接受则先按真实归属/持久凭据GET恢复，不能重放。

## 每项恢复与网关回退顺序
- 使用原保留CID做`docker start <精确CID>`（不是重建、pull浮动tag、或运行新副本）。启动前核对image/port/env/network/mount/restartPolicy与保存摘要一致，且当前没有同端口新槽；不修改R2/DB/账号。
- 每个CID启动后检查Running、OOM/events、实际loopback版本、buildId及必要只读健康/DB；原Api/Worker未停则它们优先持续保留。对其所对应旧静态URL与原配置命名fallback做只读取样；不得用新的alias成功冒充该旧进程已恢复。
- 若要恢复**完整原配置**，需要恢复它引用的全部本次停掉的named-fallback进程后，再检查原closure3文件CAS、保留default软链realPath、`nginx -t`并reload。只恢复原入口而未恢复其fallback链会让旧chunk再次404。
- 新预算导致无法同时重启所有旧UI时，保持503，不提前恢复公共业务；root可另做独立审阅的“原动态入口+文件化旧静态”兼容回退配置，但现有四bundle只保证完整原像，不能冒称这种第五配置已经准备/验收。
- 恢复不是恢复已被终止的非持久内存Agent；此损失边界必须如实记录。任何已接受收费任务依赖既有持久任务/receipt归属恢复，不从旧备份回灌、不重发供应商请求。

## 决策结论
当前可以交付**文件化静态依赖替代和四态exactCAS材料**；当前材料尚未证明任何历史Web完整drain、内部引用或内存Agent清空。第一组六UI具备较强历史创建职责证据，但其可释放容量仍不足本次三新Web预算。建议root把上述串行维护退役作为显式步骤，仅推进已核实的一项；容量或任务归属不闭合则维护内恢复，而不是停核心/Worker凑容量。
