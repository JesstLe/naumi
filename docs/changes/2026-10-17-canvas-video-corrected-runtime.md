# 主线整合后的固定视频运行候选

## 最新替换候选：bb98187

63df的最大IO并发反例已使其失去最终发布资格，旧包保持审计用途并标注禁止部署。替换业务源bb98187a58b4e588f250d77799b1725183541af8 / 1792224867的三镜像已构建完成；普通cb9e28ec872cd3ddac5f723c9299bca6f715ae7e5388ddf83ad3585c69fbfbdb已完成不覆盖运行时代码的实际媒体HTTP大文件并发及独立原生沙箱验收，详见[流式哈希](2026-10-17-canvas-video-streamed-hashing.md)。

新编译standalone App的受影响media/tasks集中验收通过，测试源来自固定bb归档，SDK package-lock匹配，UID1001执行，独立PG沿用已校正的768MiB/tmpfs512MiB。媒体模块覆盖真实App/Worker/DB和实际产物，原生Linux沙箱使用上段独立门禁；任务模块覆盖并发只创建一次、完成只结算一次、排队取消不提交、未知受理保持、完整重试、自备工作流持久化0积分。两组退出0，未复跑此前已通过且本次未改的整套协议/浏览器模块。证据compiled-app-bb98187-media-tasks-20261017/COMPLETE.json、media.log、tasks.log及CLEANUP.json，生产连接/外部付费调用0。

Task16最终候选恢复门禁另已直接完成：c05/1791911575 → bb/1792224867 → c05/1791911575 → bb/1792224867，全部实际编译Linux运行时、UID1001和独立恢复PG。原534列及类型/旧行在692列新增结构后保持；旧运行时实际创建完成任务、冻结默认值和完整任务行保留，账号/账本/模型/计费哈希一致，私有媒体字节/Range/双账号及签名原字节/篡改/过期通过，旧unknown tick不重提，媒体Worker排空恢复与新尾帧沿旧账单完成。实际pg_dump/pg_restore备份193817字节、SHAa7443dcc53662cc5c1860a3a2ec3b9a20507c0af6c81287dfd6a532242b3497a；仅本机独立fixture，未回灌103。compiled-app-bb98187-rollback-20261017/COMPLETE.json、restore.json及output/.../rollback-caa35e19-3a96-4c72-a575-7b85312b0520/result.json均通过，容器按原随机label/ID清理。该结果明确替换「bb尚无实际兼容往返」的缺口，真实视频质量仍未验收。

运行源码差异也已实际核对：63df→bb在src、video-fusion、video-media-worker、package/lock、Dockerfile和Next配置范围，仅media-engine.mjs改变（8增2删）；bb→当时main在src/scripts/package/lock/Dockerfile范围无变化，后续仅更新coverage验收绑定/交付状态及文档，不改变内嵌产品运行代码。差异回执bb-runtime-source-delta.json保存于checkpoint-d/main-sync-20261017。此核对用于说明哪些原验收仍有来源依据，不将未重复执行的旧界面/协议回执说成bb新跑的结果。

新发布材料已在prepared-bb98187-video-unified-20261017/work完成封存：实际普通镜像提取392份编译静态，3946旧URL与305新URL形成4251并集，冲突0；来源共18个原容器静态与1个磁盘静态根、9357份原文件。实际Linux Nginx通过原51类路由、候选/维护各4251份逐HTTP SHA/MIME、原静态保留、Fleet9类、TLS/转发头及原3配置恢复。四态CAS通过4次转换、拒绝3种错误源状态，仅改site一个文件，3份源闭包摘要保留。fixture是路由后端，不充当实际Next/DB验收；实际App结论来自上方独立固定运行测试。

run-bb-final-package与seal-bb-final-package均已终态0（原session6468/49842不再运行），最终seal对真实测试输入、包内闭包/静态清单及每个归档成员回读核验；Nginx结果SHA712a9e3c9e85d0f89f78c114c0eb916ec514e63c2421532b0941bbf5ea598327。只使用*-verified.tar.gz：公共部署13966001字节，SHA4765014a5cb4c07e90b2d91270f8876f8ccd51e3ee87d652c9e1dff77ac645e9；私有回滚36360字节，SHA478de98c859dc79e6a57ed4b3896303241d51cbb1bdc813547fada06ef4762e5。两包解至同根，readyToDeploy仍false，切流前须新事务刷新现场基线，不复用容量维护前的boot pin。

两包与125成员的受保护验收回执快照已私有暂存103的/opt/naumi-staging/evidence/canvas-video-prestage-bb98187-verified-20261017，服务器逐大小/SHA回读通过（上传session54072终态0），未解包或启动服务。回执快照222505字节、SHA94e89b86d56145a2f93b4c8de0cd5c1ec5ae2dea3c54c2450dca153b7e3bb0e3，含55份登记材料、验证源码和新候选运行回执；明确不含全部原始媒体/浏览器录像，不是生产验收，也保留其封存当时pending状态。结合下段固定镜像，共257251813字节新材料已暂存；旧候选包仍禁止部署。

仅普通运行镜像的离线包已导出，243026947字节，SHA09b5669bd2ccca05411db866a25e61e947fbaafac97a6f9bf7e3a84dc4cfbacb；逐blob摘要已核验。现已传至103的/opt/naumi-staging/evidence/canvas-video-prestage-bb98187-image-20261017-0900，目录0700/文件0600，服务器回读大小/SHA一致。仅私有暂存，未解包、导入镜像、改变服务或占发布锁；47仅作为既有SSH TCP中继。新静态/网关/回滚包单独生成并验证，不改写旧63包或以其回执冒充bb验收。用户已选103临时增加至少1GiB内存，保持原5120MiB完整发布预算，云控制台入口信息待补充；当前未扩容或切流。下文是原63阶段事实。

## 来源与完成范围

本轮先 fetch origin/main，任务分支与 a6a87ec 主线一致。固定业务源码为 63df208771f91a98d21384c99b320f2d5e869811，版本 1792219221；后续文档提交不改变候选。三界面 Linux 镜像已全部构建，原构建会话26668正常退出。普通镜像 sha256:2534baf3247937eb510a72bb9ed31368418a610da7162ce2bc1de16367bc0151。归档源码 SHA c694efb6ea5b32cf80e61c7416294a1051e0f9dd190d77060f6108ee45443917。

实际运行 React/DOM19.3.0、Next15.5.27、Node24.21.0。SDK与候选的 Node 二进制 SHA 同为 7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c，package-lock匹配；测试脚本和源码从本次固定归档只读装入，启动的是新候选的 standalone server.js。

## 集中验收

- 实际编译 App 的 workflow-freeze 与 tasks 通过。首轮协议组失败：隔离测试 PostgreSQL256MiB/tmpfs384MiB出现两次真实OOM，证据及原失败结果保留。没有将该失败记为成功。
- 仅重跑失败的 application-protocols，隔离 PG 改为768MiB/tmpfs512MiB。41个profile、53个协议场景全部通过，会话4088正常退出，结束时PG OOMKilled=false。已通过的两组未重复运行。生产资源设置未修改。
- 同一新编译 Web 进程承载普通/桌面/企业界面，实际浏览器2569项通过，1176份三前缀静态请求核对；登录、私有媒体、跨账号隔离、中文画布保存与刷新通过，页面及静态错误0。Web限制896MiB，峰值439619584字节，cgroup OOM事件0。两个截图已查看，fixture已清理。
- 真实Linux Nginx集中验证通过：51类原路由、Fleet9类、TLS/转发头、4251份静态资源字节及MIME、维护503和恢复原配置。原旧静态资源保持。此网关fixture后端仅验证路由；实际App/DB结论来自上述独立应用测试。

全部使用本机独立模拟供应商、测试数据库及素材，生产连接和外部供应商调用均为0。真实视频API额度与视频质量没有验收。

## 证据与交付边界

外部证据根目录为 E:/workspace/naumi/output/canvas-video-fusion-20261013/：

- candidate-63df208771f91a98d21384c99b320f2d5e869811：三镜像元数据、构建日志、固定归档。
- compiled-app-63df208-20261017：首轮两组通过、协议失败及OOM原始证据。
- compiled-app-63df208-protocols-v2-20261017：53项成功日志、COMPLETE/RESULTS、结束状态与CLEANUP。
- unified-browser-63df208-20261017：浏览器断言、截图、内存与清理回执。
- prepared-63df208-video-unified-20261017：候选定义及部署包；最终封存状态以 FINAL_PACKAGE_REPORT.json 为准。

网关本机结果位于 /var/tmp/nginx63-5e46340276f84a8ab2981e9648fef1cc/results.json；已与本次4251资源及三份精确源配置绑定并封存通过：四条CAS转换成功、三类错误状态拒绝、原三份配置哈希恢复，原始渲染材料与验证后归档分开保留。验证报告 SHA b9fa39e6b953184ce3828400aef595abd49a05bb96a4f6e30692de717d8c356a。

103未安装此候选、未切流、未停止历史UI、未增加发布计数，也未持发布锁。此前e997包的私有暂存属于旧候选。用户已明确批准维护退役无入口旧UI，保留数据库、媒体、容器与回滚，并接受历史内存态无法完整证明；该授权不生成完整排空证明。最新只读预检可用2922.55MiB，8个现用服务正常，尚未停止旧UI。新63df候选的实际数据库恢复及旧新往返已补齐，下节单独记录；旧e997的只读部署检查器回执仍属于旧候选，不冒充新版现场检查。最终发布及线上验收尚未完成。

## 新候选封存与私有暂存

新包与镜像均已实际上传103，并在服务器重新读取全部归档字节核对SHA、大小、root所有权与权限：

|制品|字节|SHA256|
|---|---:|---|
|主Web固定镜像归档|243035704|d3bc5fd72aa61db9f556b03f11266267087e54a87c793b1675db140e41460654|
|验证后部署包|13966515|d779ed0dc37fe7fdef531fab393efeb41bde25fffec13e924e454e4fa78013ee|
|验证后私有回滚包|36370|ac22ca85c6576a7695ab6c391caea357fc16551b013409c857dad8b444e7e77e|

镜像暂存在 /opt/naumi-staging/evidence/canvas-video-prestage-63df208-image-20261017-0720；配置包暂存在同级 canvas-video-prestage-63df208-package-20261017-0740。两目录0700、归档0600，不解包、不导入、不启动、不reload、不占发布锁；总计257038589字节。连接通过已授权47 TCP relay到103，仅转发连接，未在47执行业务命令。

本地镜像归档全部OCI blobs复核，index明确指向固定镜像2534。首次包装器因末行CR导致heredoc结束符被Python当名称，归档和逐blob核验已完成后报错；保留错误日志、修正LF，并对同一现存归档重新校验总SHA及OCI index，没有重复导出或将包装器失败忽略为成功。

原始回执在本任务 checkpoint-d/main-sync-20261017/corrected-image-upload.log、corrected-package-upload.log、corrected-final-package-report.json、corrected-final-nginx-results.json、corrected-four-state-cas-results.json。此处暂存不是实际应用发布，103原业务版本保持。

## 新63df编译运行的恢复与回退

原生隔离Linux、UID1001、最新固定候选2534与原c05上传修补镜像5aa实际往返通过。旧版源fixture从既有本任务容器提取，.fixture-source-commit明确c05，旧版初始化534列；新增DDL后692列，原列类型/旧行保持。旧版实际创建完成任务后先停App，将本轮独立PG完整pg_dump，再pg_restore至另一随机命名测试数据库，原任务和保护快照一致后继续验收。

实际版本顺序为 c05/1791911575 → 63df/1792219221 → c05/1791911575 → 63df/1792219221。测试覆盖私有媒体字节及Range、两账号权限、签名原字节/篡改/过期、模型/计费/账号账本哈希、冻结默认值及完整任务行、旧Runtime tick保留未知状态、未知受理不重提、媒体Worker排空恢复、新尾帧使用旧计费完成。全部通过，真实供应商调用0，生产基线未刷新。

证据：compiled-app-63df208-rollback-20261017/ 下的 COMPLETE.json、RESULTS.json、restore.json、fixture.dump、restore-list.txt，以及 output/canvas-video-fusion-20261013/checkpoint-d/rollback-d11a25b1-0d3b-4fcc-af32-c57dd09e06e2/result.json。备份193829字节，SHA 4873784d245322e36e7b5bdad40e7ea921ec43e247b21e4f13349cac72f6507d。结束按随机label确认并删除本轮SDK/PG，CLEANUP.json已保存。没有重用生产数据库或在103启动测试。

本轮收尾再次fetch发现main新增5b62918（README现状整理），仅README与独立文档改变；保留并整合该提交，不因此重建业务源63df或重复通过的应用验收。

最新103容量维护：12个无入口历史UI已在备份/两锁内停止过，因仍低于5120MiB而恢复；全部同CID、原配置/策略/声明网络与原版本200已核对，两锁释放。没有安装或切换新候选。历史“未停止UI”为当时阶段记录，当前实际结果以[授权容量维护](2026-10-17-canvas-video-authorized-capacity.md)顶节为准。
