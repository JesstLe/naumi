# 香港103晚间更新：只读现场盘点与独立适配 / 2026-10-16

## 本轮授权与执行状态
- 用户最新明确可在本次晚间更新中顺便更新香港站、称香港站无人使用；主控已将今晚顺序调整为47→103。此文不创建第二个调度，不扩大到其他站点，也不将“无人使用”当作Worker/Agent排空证据。
- 本子任务仅**本机离线设计 + 一次103只读补充盘点**；不发布、不占部署锁、不写服务器文件、不改Nginx/env/DB、不创建或停止容器、不启动供应商请求。
- 分支 `codex/release103-evening-readonly-20261016`，基线`8a43f450db4b2da78b8ce5cd806b557cce7a5680`；独立worktree，不改主控47模块或共享工作目录。
- 103是独立站点和独立数据。47镜像可作为固定源码候选的普通UI参考，但47机器身份、端口、17847兼容map、部署锁路径组合、Worker归属、数据库及R2凭据都不能套给103；不做两站业务数据同步/回灌。

## 实际连接证据（不是历史文档推断）
- 主控首次直连103:22出现SSH banner EOF/空banner；本机SOCKS尝试未作为成功记录。最终使用用户已授权47仅作为SSH direct-tcpip中继到103:22，103独立认证及pinned RejectPolicy；没有在47写文件或操作服务。
- 连接凭据由主控既有受保护DPAPI wrapper在内存读取，本文和仓库没有密码/私钥/令牌。
- 主控首次现场材料：本机ignored `E:/Workspace/naumi/output/release103-evening-20261016/inspect103.log`。
- 本子任务补充一次只读采集：`inspect_release103_readonly.py --read-build-files --skip-config`通过主控103-only wrapper以stdin执行；输出存私有本地`inspect103-client-detail.log`，不在远程落脚本。
- 机器身份SHA256：`26721373f7ecea7a5a9173a43bb017cd362d1f7ed9864b402874576a9e4fee35`（独立于47）。公网版本实际`8af8ee6ee83579fed34a01ac5db86326f9602e3e / 1791975598`；DB/存储health OK。不是已发布本轮新版。
- 完整`nginx -T`现场SHA256：`10cda9f769a1696f237d4beb9e1ecc141168ffc9d9612fac9b59039b177193d9`，3个配置文件：主配置、mime.types、`/etc/nginx/sites-enabled/default`。日志print附加的一行换行已去掉并核对原始SHA，不把日志文本SHA误作实际配置SHA。

## 现场容量与容器（补充采样）
- MemTotal 8,131,932 KiB（7941MiB）；MemAvailable **1,078,876 KiB（约1053.6MiB）**；SwapTotal1,485,820KiB、SwapFree仅16KiB。Swap不计候选可用预算；该快照几乎只够保留最低1GiB余量，尚无新槽空间。
- 38个容器记录，31个运行。磁盘约49%使用/62.8GB可用；本子任务没有清理任何容器、镜像、volume、代码或缓存。
- 大内存当前项：原核心App约608,882,688bytes（peak725,221,376）；enterprise analytics约491,700,224（peak1,099,030,528）；旧image-cache-ui409,542,656；upload-fixed-core404,770,816。**有历史名字/占内存不等于可停**；先确认路由/内部调用/在途/静态依赖和主控许可。
- 原始每个运行容器的`memory.current`、`memory.peak`、完整anon/file/kernel/events/stat、固定ID/image/启动时间/restartPolicy、网络别名、环境/存储绑定SHA均在本地受保护捕获，不只看RSS。
- 所有container scope报告的`canStop=false`，`drainStatus=NOT_MEASURED`；没有以无Nginx引用、无用户或TCP计数替代完整排空。

## 三种当前UI：实际构建类型必须保留
|类型|当前端口|容器固定ID|实际image|真实buildID|真实assetPrefix|
|---|---|---|---|---|---|
|普通|13039|9a9cf8abbb2d4f17c22167dcc14a748a252b089003da550d14e340798cb391ef|sha256:e57826387bdb60a4f0371afc2d25e9bc6cb70eb1769b14fd3d12c2cd5c7738d5|-BFn1R57oxyjqZKXnDqhc|空|
|桌面|13040|f4de9b703523b51e2b29039ffc03f880919c84b009640b95bff795648d3e0cdf|sha256:193777ccb65f99ed3d1c4e84f975a73923341c5c746f40bc0f0ef7b8ec482ca2|SsuniSsc32PfDPfnArd1Z|/desktop|
|企业|13041|bfab7fc9e592b0b3351f2917d46d5af0e72c9fe9242d425d51aeacd291fe5034|sha256:2faa002e17c6a16989f53c4611e14dab35ba9a711d34f40a10f654d7c09e3169|DKu3SMDXgFsSXURz6B2LR|/enterprise|

- 三版均source8af8ee6/version1791975598。现场Docker runtime `DESKTOP_UI_BUILD`和`ENTERPRISE_UI_BUILD`为空，**不代表它们是普通UI**；从真实`.next/required-server-files.json`读取到assetPrefix才能确认构建类型。未读取prerender或server-reference加密字段。
- 103本次候选应至少提供同固定业务SHA的普通、desktop、enterprise三种已编译UI及三种静态命名空间；运行时补env不能把普通bundle变成desktop/enterprise bundle。另一种整合方式须单独实现并实测，不在本轮假定存在。
- `/desktop`与`/enterprise`主入口、`/team`、各自`/_next`/版本API、不同API前缀剥离规则必须保留；不能将所有URI无脑转给47普通Web。

## 完整路由与静态引用图
完整现场解析65个location，21个被Nginx引用的回环端口：
`13012,13014,13016,13019,13022,13023,13024,13025,13026,13027,13028,13029,13030,13031,13032,13033,13038,13039,13040,13041,13062`。

- 普通Web/版本/媒体当前13039；desktop UI13040；enterprise UI13041。
- imagegen和generate-image（含desktop别名）当前13038（upload-fixed-core），其业务源c05a923/1791911575不能被误认为未打上传框架补丁。
- 默认`^~ /api/`及desktop API当前13012原核心；enterprise/team/feature-access等精确/前缀API当前13027独立enterprise API，不是13041仅UI。
- Fleet独立门户13062（容器`770dcf7d1f2735b8012461b053404f33cb489c996ec51721bf841cd5c54494cc`），`/admin/deployments`、fleet API与`/fleet-assets/_next/`维持独立；该进程不能混入Naumi新普通Web退役列表。
- 拒绝规则`/api/video/worker/`、desktop worker前缀403及隐藏文件404、X-Forwarded/CF防伪、安全headers、TLS证书与server_name103/naumi.top/www.naumi.top均需保留。

### 已实际确认的旧静态fallback链
- 普通：`13039→13031→13028→13012→13026→13024→13022→磁盘root`。
- desktop：`13040→13032→13029→13014→磁盘root`。
- enterprise：`13041→13033→13030→13027→13025→13023→13019→13016`。
- 最终磁盘root实际为`/var/www/naumi-static-compat-imagegen-20261014`，`try_files $uri =404`。这份非容器旧资源也必须盘点/保留，不能只docker cp当前UI的static。
- 上述链上的多个历史UI仍被404回退实际引用；停任一个都可能令旧页面懒加载chunk404。需按三命名空间逐URL/原SHA保留或明确删除窗口，不能把47普通`/_next/static/`union直接覆盖所有prefix。
- performance三容器13035/36/37本次未见Nginx引用；仅标`web-no-nginx-reference-not-drain-proof`，未停止，也未证明没有内部会话/任务。

## Worker、Agent与基础服务归属
- 原Worker `34dc0820026e7fb415a6363bb51d950d60abfe9d8843c21be5f9342a1f53ff80`，image`sha256:cd344d9164c29b8a8bf318d5af160ed3f2abda3075e3b56112e2d987963a8cd3`，sourcec05a923/build1791911575，origin `http://app:3000`。
- 在共同Docker网络`naumi-staging_default`上，`app`别名精确解析到原App `18c31dc9e0cf324f670c8d97a591c5fa688961f1f3713029ac12a29f0d094211`（端口13012、同image）；不是13038，也不是13039UI。
- 当前Worker没有本轮release-control标记；acceptedTasks/agentSessions/newAdmissions仍未知。仅网络别名证明origin归属，不证明已排空或安全接管。
- Router/model proxy/Mihomo/Nginx服务当前运行，Hub/NewAPI/Redis/Postgres与独立fixture DB保持原职责；不在此只读模块启停或覆盖。

## R2/账号/媒体保护
- 三个当前UI、原App、upload-fixed-core、enterprise API均确认`STORAGE_DRIVER=r2`、`MEDIA_PRIVATE=1`，R2桶/访问凭据presence已确认。未输出其值。
- 这些Web现有storageBindingSha256一致：`6964ad65b48c612e168cc6cfd232d0c24b1fec05602fbd8a0bb8977f9ea5ad44`。固定envSha256、mount路径/读写属性、网络绑定记录独立留存；发布时clone本103正确角色基线，不从47复制.env。
- 不修改R2 endpoint/bucket/CORS/签名密钥，不迁媒体，不把private降公开；数据库、原账号/权限/积分/历史/媒体属于103本机，不被47快照覆盖。只读指纹不是备份；主控正式发布前另做本103可读备份及兼容回滚材料。
- 私有媒体鉴权旧不兼容镜像不得直接恢复公网；保留现有权限保护和相关回退规则，详见历史R2回滚手册，但不能重跑历史单槽部署脚本。

## 新增离线工具与集中验证
- `inspect_release103_readonly.py`：无SSH/凭据实现；由主控固定103 transport送stdin，只读采集公共字段、真实build assetPrefix、cgroup、环境及R2绑定哈希，不回显命令参数/生产凭据，`--skip-config`复用已采完整-T避免重复。没有DB查询、锁获取或服务写操作。
- `release103_inventory.py --dump FULL_T --inventory SANITIZED_JSON --output NEW_SCOPE_JSON`：纯离线，检查103机器身份、完整include闭合、三真实assetPrefix/R2、65location/回退图、Worker共同网络别名；报告readyToDeploy=false/canStop=false。
- 共享的是通用Nginx词法/include解析器，不调用47固定target renderer或修改其脚本。
- `NAUMI103_CAPTURE_ROOT=<本机capture目录> python scripts/ops/test_release103_inventory.py -v`：8 tests PASS，包含真实103快照、错误47目标/错误prefix/R2缺失/端口冲突/fallback循环拒绝、秘密不回显、命令不执行。
- 本轮没有生成103可切流配置、没有声明完整RSC通过；47 c952→5405真实浏览器结果不能冒充103三个实际build的验收。

## 主控后续交付条件
1. 47本次事务按实际结果收尾后，再进入103独立事务；刷新103机器/版本/锁/容量/活动基线。
2. 取得同固定最终SHA的三类UI候选，保留独立Fleet；部署控制器需适配103，不能将47fixed machine-id/ports/map当通用参数。
3. 解决内存真实余量：约1GiB可用并且Swap近耗尽，不在103构建、不叠加三新Web。需要角色/引用/任务自然排空证明或按用户明确本次维护方案迁移；不批量停历史槽来硬凑预算。
4. 三UI旧静态树+fallback磁盘root保留，真实旧页面/保存/登录/R2/桌面/企业权限/回滚各自验收；真实最终候选受影响功能与资源峰值再测。
5. Worker/Agent/App后台工作归属/幂等/已接受任务保存单独闭合。正式发布的备份/数据保护/原配置/R2/MIME/TLS/安全边界必须记录。

当前完成状态：**103实时只读盘点完成，离线适配依据完成；103本轮上线未执行，统一发布执行器尚需103专用实现/验收。**

## 实际旧静态文件已保留（仅本地，未切流）
- 顺序读取20个Nginx引用的非Fleet固定Web容器 `.next/static`，并读取真实磁盘static root；每个容器归档前后CID/image/startedAt/running完全一致，完整Nginx SHA亦保持不变。没有远程写入、启停、Node进程或并发复制。
- 私有本地目录 `E:/Workspace/naumi/output/release103-evening-20261016/legacy-assets` 保存21份原tar.gz、解包字节、逐文件hash、21源manifest、3份精确原配置；Fleet完全排除。
- 真实7637个源文件按实际assetPrefix归并为2684个公共URL、39473610字节、冲突0：普通1028、desktop670、enterprise986。未把不同prefix混成普通静态目录。
- `release103_assets.py`重新验证归档SHA、固定身份和逐文件SHA，拒绝链接、越界、非规范URL及同URL异字节；新目录原子materialize，不覆盖原始capture。
- 集中命令 `NAUMI103_ASSET_ROOT=<legacy-assets> python scripts/ops/test_release103_assets.py -v`：5 tests PASS，包含完整真实capture；CLI literal result `HK_STATIC_UNION=PASS SOURCES=20+DISK1 URLS=2684 CONFLICTS=0 FLEET=EXCLUDED PROTOCOL=NOT_VERIFIED`，exit0。
- 实际union为 `E:/Workspace/naumi/output/release103-evening-20261016/legacy-static-union`；三命名空间文件与manifest已重新核验。仅静态字节保留，不等于103真实Next/RSC、登录、DB或本轮发布验收。
- 下一模块：103独立离线gateway/maintenance/rollback，保留Fleet和TLS/安全规则，并将Naumi API归并到主Web、desktop/enterprise仅保留各自编译UI。服务器仍未改变。

## 103独立gateway / maintenance / rollback离线模块
- 新增 `scripts/ops/release103_gateway.py`，仅离线参数化main/desktop/enterprise三个不同回环origin，不调用47固定renderer，不连接或修改服务器；13110/13111/13112只用于本地fixture，现场端口由持锁主控另定。
- 完整现场dump SHA以及3份真实磁盘文件SHA均固定；65个已知location全量分类，任何未知/遗漏/改动均拒绝。夜间基线刷新后必须重新采集、审阅、重新生成，不允许旧hash override。
- 保留Fleet13062全部9个location原字节；保留既有3个worker/隐藏文件deny原字节；HTTP/TLS、证书路径、域名、body limit等location外指令保持。普通/desktop/enterprise分别转其编译UI，`/team`兼容页仍转enterprise UI；全部Naumi API归main，既有desktop suffix剥离与不剥离语义逐路由保留。
- enterprise增加 `/enterprise/api`和`/enterprise/api/`到main `/api`/`/api/`的明确别名，并新增该前缀worker deny；没有redirect丢弃enterprise UI路径。除Fleet原块以外，Naumi代理使用真实remote_addr覆盖XFF并清空CF-Connecting-IP；修复原desktop/_next没有覆盖XFF导致客户端传入头直通的问题。
- 仅删除17个已知named静态fallback块及其error_page引用；三个`/_next/static/`、`/desktop/_next/static/`、`/enterprise/_next/static/`独立readonly alias指向保留union。非static Next路径仍转正确编译UI，不将旧RSC线协议当静态文件。
- maintenance配置保持Fleet、三静态namespace和deny，其余Naumi请求明确503/Retry-After60/no-store；只对应用户本次短维护例外，不改变以后蓝绿约定。
- 输出candidate/maintenance各自完整before/after、3文件CAS报告、MODIFIED_FILE、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh；脚本只在**另一个本地复制树**先全量CAS再恢复原字节，没有nginx reload。现场`sites-enabled/default`实际指向`sites-available/default`，报告保存realPath；正式执行器须保留软链并核对realPath，不能用fixture tree脚本直接替换现场。
- 集中离线6 tests通过：65类/三UI/mainAPI、maintenance、未知基线拒绝、origin/Fleet/namespace/conflict拒绝、exact原始文件预检、3文件hash与复制rollback及并发改动CAS拒绝。
- 真实本机Linux Nginx fixture采用实际103配置（仅本机worker_processes=1、www-data user和自签SAN证书适配），Nginx128MiB/.5CPU、Python fixture128MiB/.5CPU，固定label，退出只删除本fixture容器。原65类包括17named链逐条test-only内部跳转，candidate三UI/API/TLS/XFF防伪、candidate+maintenance各2684实际HTTP文件SHA、真实bash复制rollback及恢复65类行为均已通过首轮；最终证据路径见下文。
- 模拟backend只证明真实Nginx路由与静态字节，**不等于最终三Next镜像、DB、真实权限或私有R2验收**。最终固定三镜像的新static还必须按各自prefix加入union再生成现场bundle。服务器liveWrites=0。
- 最终集中回归exit0：`python scripts/ops/test_release103_gateway.py -v` 6/6；`NAUMI103_GATEWAY_OUTPUT=output/release103-gateway-real-nginx-20261016-final python scripts/ops/test_release103_gateway_nginx.py`全通过。TLS fixture使用103/naumi.top/127.0.0.1 SAN并启用本地CA证书校验，不仅关闭TLS验证。
- 最终literal结果：`BASELINE=PASS REAL_LINUX_NGINX=YES ORIGINAL_ROUTE_CLASSES=65 FLEET=13062 TLS=YES`；`MODIFIED=PASS REAL_LINUX_NGINX=YES ORIGINAL_CLASSES_ACCOUNTED=65 RETIRED_STATIC=17 FLEET_EXACT=9 UI_ORIGINS=3 API_MAIN=YES STATIC_HASHES=2684 TLS_AND_SPOOF_HEADERS=PASS`；`MAINTENANCE=PASS NAUMI=503 FLEET=13062 STATIC_HASHES=2684 DENIES=PRESERVED`；`ROLLBACK=PASS ORIGINAL_SOURCE_FILES=3 ORIGINAL_ROUTE_CLASSES=65 ORIGINAL_UI_PORT=13039 CANDIDATE_ARTIFACT=UNCHANGED`，exit0。
- 实际bash rollback输入另一份candidate树，literal `ROLLBACK=PASS EXACT_SOURCE_FILES=3 ORIGINAL_BYTES=RESTORED RELOAD=NOT_EXECUTED`、exit0；随后真实Nginx reload原配置并恢复原65类和/api/version→13039。candidate/maintenance产物仍保持改动。
- 最终本地完整产物：`C:/Users/13357/.codex/worktrees/release103-evening-readonly-20261016/naumi/output/release103-gateway-real-nginx-20261016-final/`，含results.json、candidate和maintenance各自四件及完整3文件before/after。8件已全部重新读取，两个fixture容器已按label核验删除，无遗留本fixture容器。配置中`/fixture/union`与13110/11/12仅fixture输入，不可直接现场安装。
