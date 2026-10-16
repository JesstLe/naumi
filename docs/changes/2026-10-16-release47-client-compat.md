# 2026-10-16 · 47旧客户端资源与统一Nginx候选

## 状态与边界
- 基线：`96a0fa5`；独立分支 `codex/release47-client-compat-20261016`。本模块只操作本机副本，不连接服务器，不读生产数据库/运行环境密钥，不调用供应商，不创建/停止线上容器。
- 已实现：完整`nginx -T`词法/AST/include闭合校验、明确旧Naumi源到统一候选的proxy/map重写、精确canvas覆盖退出、17847兼容与TLS/security字节保留、完整静态清单/冲突拒绝/原字节副本、真实构建manifest协议盘点。
- 明确未完成：真实旧build浏览器跨切流RSC解析、真实原画布保存与持久化读回。脚本和报告始终返回`oldClientComplete=false`；静态保留、模拟保存或状态200均不升级为完整旧客户端通过。
- 用户的18:30发布、锁、容量、就绪、切流、Agent/Worker交接和旧槽退役由主控统一执行器负责；此脚本不自动安装或reload。

## 输入与输出契约
入口：`scripts/ops/release_client_compat.py`，Python标准库，无第三方运行依赖。

```python
Dump(full_nginx_T_text: str)
# .files = {absoluteConfigPath: capturedBody}, .nodes/.root；校验所有文件include可达
alias_inventory(Dump) -> [{"url": URL, "path": absoluteAliasFile, "configFile": path}]

collect_assets(
    sources=[(label, Path("copied/.next/static"))],
    aliases=[("/_next/static/chunks/hash.js", Path("real-alias-bytes.js"))],
) -> manifest
materialize_assets(manifest, Path("new-distinct-union-output")) -> None
verify_assets(manifest, Path("union-root")) -> int

patches, after_full_dump, report = render_gateway(
    full_nginx_T_text,
    "/etc/nginx/sites-enabled/reference-workbench",
    "http://127.0.0.1:13100",  # 示例；执行器现场确认端口再确定
    ["http://127.0.0.1:" + str(port) for port in
     (13070, 13071, 13068, 13063, 13052, 13072, 13073)],
    "/var/www/naumi-client-assets/RELEASE_ID", manifest,
)
write_gateway_bundle(
    full_nginx_T_text, patches, after_full_dump, report, output_new_directory,
    source_files={absoluteConfigPath: exactOriginalDiskBytes},
)
```

- `patches`为修改文件到新body的映射；报告含完整-T前后SHA、变动endpoint、保留alias、legacy例外、路由声明及未完成协议验收项。
- **精确CAS**：`nginx -T`给每节追加separator换行，截取的body不等于原磁盘文件。`write_gateway_bundle`必须收到精确原文件bytes，验证capture==raw或raw+单换行后才写bundle；`report.patches[].beforeSha256/afterSha256`是精确磁盘前像/后像。enabled软链对应的available文件由主控核实，逻辑key仍为dump中的enabled路径。
- 输出新目录内保留`before/<absolute-path>`、`after/<absolute-path>`、`nginx.before.txt`、`nginx.after.txt`、`report.json`；不给现场写权限，不执行reload。执行器必须核对**所有完整配置文件**新鲜快照/哈希、逐修改文件CAS、旁路`nginx -t`及原文件回滚，而不只是信任报告声明。
- CLI：`inspect --dump ...`、`assets --source LABEL=ROOT --alias URL=FILE --output NEW_DIR`、`verify-assets --manifest ... --root ...`、`gateway --dump ... --site ... --candidate-origin ... --old-origin ... --static-root ... --manifest ... --source-root EXACT_CONFIG_TREE --output NEW_DIR`。
- `compare-builds --old-manifests PRIVATE_CAPTURE.json --candidate-next COPIED_NEXT_ROOT --output NEW_REPORT.json`只读取必要BUILD_ID/server-reference/app-build记录，验证base64原字节SHA/size，返回buildID、静态URL和action数量，不回显`encryptionKey`或预览密钥。

## 严格路由规则
- 完整主配置必须恰好一个http块；文件段唯一、精确include缺失/循环/未可达段拒绝；glob不跨目录；动态include、未知代理endpoint/变量map、未知canvas改写指纹均拒绝，不猜测。
- 只对显式old origins替换proxy_pass参数和`$naumi47_*`兼容map输出；不全局替换127端口，不改基础服务。`$naumi47_compat_api`与`$naumi47_auth_login_backend`动态路径保留，17847分支按原优先级保持。
- 统一main/API/login/canvas/reference-workbench/router-capacity落到候选；旧17847的登录、页面、`/legacy-workbench/`、历史JS、zipJS及兼容API例外保持，非Naumi服务器配置原字节保持。登录真实归属仍由应用鉴权，不把referer/cookie路由选择当鉴权。
- 只移除符合已知指纹的`location = /canvas` HTML/RSC sub_filter覆盖；旧chunk的精确alias原文保留，alias URL必须进入静态清单。
- 为完整`/_next/static/`命名空间添加只读union alias，JS/CSS继承完整mime类型；immutable cache。新location显式复制目标server的add_header，避免Nginx子级add_header取消父级安全header继承。
- TLS证书路径、协议、登录防伪头、cookie secure、超时/SSE无缓冲、ACME/HTTP跳HTTPS等保留；现有不认识的静态命名空间路由拒绝人工确认。

## 静态资源规则
- 按canonical URL逐文件SHA256/size盘点、同URL同bytes去重、合法新URL追加；同URL不同bytes立即`STATIC_URL_CONFLICT`，物化前不写输出。
- 禁止symlink/目录穿越/编码歧义；分块哈希，不一次载入全部资源；单源100000文件上限。新增独立输出目录、临时目录复制并校验后原子rename，不覆盖源。
- 旧资源必须从**每个实际被服务的旧Web构建**及Nginx alias真实字节收集，不能只按当前主页面或manifest推测；旧和新完整静态树都要提供。
- 本机5405实际镜像静态树+既有真实canvas修改alias：391个文件/6,417,949 bytes，逐字节SHA验证通过；旧生产Web完整静态树未在本模块取得，不能把这391项当作完整旧资源验收。

## 真实47只读捕获与协议盘点
- 主控提供本地`nginx-full.txt`：17038 bytes，SHA256 `f854851f4c836f2bd4e12425e5ea0944c23c9fd44a7021fa81912b00f37a97e8`；4文件闭合，实际重写8处endpoint、移除精确canvas覆盖1处、保留chunk alias1处。
- 该完整真实-T的baseline与candidate均在本机Linux Nginx通过`nginx -t`。仅测试副本重定位include/本机测试证书/Alpine用户名；生成器输出本身保持真实TLS与安全配置。测试不是现场Nginx验收。
- 6个旧Web的真实server-reference manifest node/edge计数全部0；5405候选亦0，因此这组构建没有ServerAction条目。当前产品源码`use server`搜索为空；未把该结论推广为未来构建自动兼容。
- 两种旧buildID：`meWOIx3Jx07ZDCSQ0kHrj`、`l2feJNLcsP_N4NvFX_gO8`；5405候选`lkgzrQ3p7mMFxp3hoRyqV`。旧app-build静态URL并集360，候选367，共用40，仅旧320；仅同一构建名/HTTP200不能证明bytes相同。
- 现有Next配置没有deploymentId，已打开的旧页面没有可靠client-build header归属。真实RSC不得只靠新增cookie/header假定兼容；后续需真实旧页面跨切流解析模块、保存并读回原operation/节点，或经过鉴权的明确build归属方案。

## 集中验证与回滚
- `python scripts/ops/test_release_client_compat.py -v`：16 tests PASS，含完整实际-T、include/map、多端口、未知配置拒绝、URL冲突/篡改/复制竞态、精确前像CAS、副本回滚、action摘要无密钥。
- `NAUMI_COMPAT_REAL_DUMP=... python scripts/ops/test_release_client_compat_nginx.py NEW_OUTPUT_DIR`：Linux Nginx 128MiB/0.5CPU；mock后端96MiB/0.5CPU。12路由case、真实TLS/regex/map与全量捕获nginx -t、3静态原SHA/JS mime/immutable、旧payload跨reload保存/读回同operation且1条、匿名/他账号401、非Naumi17848保持、精确配置/路由回滚及保存数据不回灌通过。
- 该oldclass/newclass是明确模拟后端：RSC wire仅版本归属标记，不是实际Next解码器；`realOldClientComplete=false`。0生产连接/0供应商请求。所有测试容器/自有网络按fixture标签核对后清理。
- 输出`output/client-compat47-20261016/`保留副本四件套、原始SHA、完整结果和实际构建摘要；ignored、不提交。实际脚本始终保留修改状态，回滚仅在独立copy测试。
- 初轮验证发现并修正：测试按全文搜索sub_filter误中注释；Docker29 internal网络不发布host port；reload ACK先于旧worker accept循环退出导致瞬时混合。最终按AST检查/普通专用fixture网络/受限稳定等待后集中复验通过，未改发布判定掩盖失败。

## 主控现场待完成
1. 全三锁内取得新鲜完整nginx -T与每个变更文件精确bytes；复核enabled→available软链。
2. 收全部旧Web实际static树和alias原bytes，与最终候选整树执行冲突检测/复制/再验证；保留最近两版回滚依赖。
3. 使用固定**最终业务候选**manifest重新比较（本记录5405只是当前本机历史候选），执行完整旁路nginx -t与实际登录/DB/媒体/受影响功能。
4. 真实旧页面RSC解码、原画布operation保存与持久化readback、任务查询跨切流通过后，主控才可生成old-client-compatibility验收；否则继续记录明确未完成，不用static-only升级。
5. 平滑切流、连续观测、入口切回与排空退役由统一执行器处理，本模块不停止任何业务服务。

## 14:16 本机真实旧Next → 5405候选补充实测（非线上发布）

### 真实输入及资源
- 主控只读取得并核验旧canvas镜像，本机load后精确image `sha256:c952f4a407e0404e86c950003c905c1bf26f877b6b6a2558118d70dd534c9737`，真实版本`f4b3df127f2fcaf37f9cd866a480f3c6fd4b2358 / 1791989816`；未用mock替代旧Web。
- 新镜像为既有本机5405候选 `sha256:8f2b379b386f3b910dfa7cff93ddbfa7403558c4285c1d48aea54650c5c9f857`，`5405d23fa37a5de27ed5f2f9e2aa87e43d8eeb97 / 1792127247`；不是主控后续最终镜像的验收。
- 全新隔离PG 192MiB / 0.5CPU，两个Web各1536MiB / 1.5CPU、Node heap1024MiB；Nginx128MiB / 0.5CPU。没有Worker或供应商配置，代理阻止生图/Agent提交，浏览器只允许loopback。独立headless Edge全新context，未操作Chrome/CDP用户会话。
- 主控补齐6个旧Web实际static树、真实alias和精确配置文件：7个树源（6旧+5405）union **717文件 / 10,892,916 bytes**，无URL字节冲突；精确原文件bytes CAS bundle已生成并通过。不再缺旧only320项字节。

### 真正通过与明确失败
- 页面从真实旧Web加载，种入一个实际PostgreSQL文字节点，真实旧React textarea进入未保存编辑状态。
- 仅Nginx旁路reload到真实5405：document唯一marker不变、未保存textarea内容原样保留；没有主动刷新旧页面。
- 旧React blur处理器向新Web真实API保存，`persisted=true`且GET/数据库内容精确一致；旧undo/redo通过真实history接口，操作UUID两条各仅一条DB记录，恢复/重做内容精确。
- 用户主动点击Next Link到新dashboard时，Next发现buildId不同而执行**MPA完整文档导航**；严格零reload RSC连续性测试失败，保留`STRICT_RSC_CONTINUITY_FAILURE.json/.png`。同旧build对照导航document marker保持，说明不是链接本来就总整页导航。
- 按主控传达的**用户本次短维护特例**继续核验：MPA正常落目标dashboard并hydrate；原登录cookie值SHA不变，session仍原账号；重新进入canvas时已保存内容精确，pageerror=0；入口回滚旧Web后数据继续保留，无DB回灌。
- 结论是`PASS_FOR_MAINTENANCE_BOUNDARY`、`zeroReloadRscContinuity=false`，不是无感RSC跨版通过；没有改框架build校验或伪造buildId。

### 可复用脚本（最终镜像需再跑）
```powershell
$env:NAUMI_REAL_COMPAT_OUTPUT='output/client-compat47-real-next-20261016'
$env:NAUMI_REAL_COMPAT_NEW_IMAGE='naumi:release47-5405d23fa37a' # 最终镜像换此参数
$env:NAUMI_REAL_COMPAT_OLD_IMAGE='sha256:c952f4a407e0404e86c950003c905c1bf26f877b6b6a2558118d70dd534c9737'
$env:NAUMI_REAL_COMPAT_WEB_MEMORY='1536m'
$env:NAUMI_REAL_COMPAT_HEAP_MB='1024'
# 先用assets子命令把全旧+该候选真实static物化到 $OUTPUT/all-real-static-union
python scripts/ops/test_release_client_real_next.py start
node scripts/ops/test_release_client_real_next.mjs
python scripts/ops/test_release_client_real_next.py memory
python scripts/ops/test_release_client_real_next.py inspect
python scripts/ops/test_release_client_real_next.py cleanup
```
脚本只接受新建runtime状态；固定镜像ID和合成账号，创建专用fixture标签网络/容器；`bootstrap`校验PG标签后仅在本轮合成库配置本地管理员hash/清理本轮文字；不存供应商凭据。`cleanup`逐个标签核验后只删自有fixture。Web测试失败也应执行memory/inspect/cleanup，不把遗留测试实例误作线上槽。

### cgroup实际负载（最终打包脚本一轮）
- old：peak294,821,888 bytes（281.2MiB）；current224,874,496；anon214,052,864；file0。
- new5405：**peak428,154,880 bytes（408.3MiB）**；current341,852,160；anon327,598,080；file1,912,832。
- PG：peak123,600,896（117.9MiB）；Nginx peak10,964,992（10.5MiB）。
- 全部`memory.events low/high/max/oom/oom_kill/oom_group_kill=0`；原始完整stat/events/采样时间已落盘。这是单用户画布编辑+dashboard/返回canvas的合成负载峰值，不等于生产峰值或1536档可直接改896；未执行896m/heap512压测。
- 初轮新Web峰334.1MiB不是最终上界；后续dashboard/导航负载达到408.3MiB，交接保守采用较大已观测值。最终候选还要按真实就绪/业务负载和主机至少1GiB余量重算。

### 证据及清理
- `output/client-compat47-real-next-20261016/`：browser-result.json、memory-final.json、真实DB/容器摘要、严格RSC失败和同build对照、实际浏览器截图、全旧static union/exact CAS bundle；截图已打开检查，全部ignored。
- 过程中的隔离库SSL显式disable、合成库历史guard配置和首启配置问题已纠正；隐藏链接选择器错误已改为真实可见aside链接。没有修改产品源码去补绿。
