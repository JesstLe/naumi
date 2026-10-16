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
