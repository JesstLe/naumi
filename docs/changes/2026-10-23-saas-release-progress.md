# SaaS 后台整合与47交付进度

本轮用户授权：“后台你觉得验收通过之后 合并所有分支然后上线47服务器做真实验收”。顺序为本地验收、整合完成的业务分支、47三锁蓝绿与真实验收。没有把47业务库复制回本机；原本机预览与新建Linux验收库均为明确fixture。

## 已完成

- 平台、租户详情、企业后台按批准三张图实现。本机设计与交互passed；A11慢请求在卸载时Abort、A12实际账号切换清图片/要求/未保存草稿均有浏览器证据，见`design-qa.md`与58项矩阵。
- 原GPT-6.1 Sol high负责人完成所有入口创作证据、冻结上下文/账务/恢复及权限修订，源码冻结`467ad6ce`；根任务已整合画布参考、视频批量、Agent恢复、模型新增、供应商运营及视频协议分支。独立销售站和历史回滚分支按盘点理由排除，不覆盖共享checkout或他人WIP。
- 最新六profile整合专项及受影响模块12组、类型通过；`607fffde`修复local匿名素材读取绕过冻结SHA。应用/PG测试的上游与媒体HTTP明确是fixture，没有冒称可播放影片或真实供应商。
- SaaS发布适配沿用同一三锁/canonical/CAS/备份/统一整站切流与排空；修复旧helper不安全回切，并保留UNKNOWN。按已审核PRD12采用受控维护降级，没有提供兼容旧业务程序回滚。最新Linux+实际Node门禁193组无skip通过；真实Nginx TLS52项本机降级验证通过，均不能替代47现场证据。
- 合入视频最终预算`5d568c7b`：候选Web1536MiB、最终2048MiB、combined Worker1024MiB、主机余量1024MiB，三阶段MemAvailable/旧anon预算。SaaS不再复用NAS历史3GiB方法，前序必须是真实2GiB/1GiB完成发布。

## 首次固定Linux候选

完整源码`b3a71c087bb58077960988001be3f63c9e92bc4f`，BUILD_VERSION`1792699394`；按原Dockerfile完整Linux构建成功，同镜像Web/Worker制品`sha256:a2b848a74b1f5ecba596fdd87fb3cf289c56c826a970ea9d7fe3eb8ff77e446b`，archive SHA256`72f463903c304c661df5b745b6bd1c9a747a39dd06f39608926435a930a90180`。依赖锁`f769ef08…`，Dockerfile`131340ed…`。证据在忽略目录`output/saas-linux-build-20261023/`。

真实combined/native验收`56b40e33-a910-4512-97cd-b740bebb0def`通过：PID1 root、扫描uid1001、媒体supervisor与无能力隔离native子进程、只读根/noexec tmp、无对外端口、内部网络、实际视频完整解码、原UUID幂等、重启对齐、双队列排空、正常停止和零OOM。已存在的真实上游视频仅用于本机解码，本轮供应商调用0。扫描接收器在该组为明确mock，不能作为真实App/数据库执行证明。峰值约396.21MiB仅代表这一个样例，不据此削减1GiB Worker预算。

随后同镜像真实Web＋全新PG＋真实combined Worker验收发现UUID批次表与TEXT证据链接直接JOIN导致详情503，已用真实DDL回归并在`149654bc`修复；首次镜像不能发布。seed harness早期依赖裁剪/本地PG SSL失败记录保留，未作为产品通过。

## 第二次候选与最终修订

`a48e201f58ef4f7e086f5f187f2ff8f49fef868d`完整Linux构建通过，Image `sha256:d4c6795db948638bd5660a24ef47d12b79cefa383a6a5ed85e92a884dd136607`，证据`output/saas-linux-final-20261023/`。实际Web/PG/Worker验证已覆盖真实密码登录、平台/企业权限、UUID详情、双cookie、原图GET/HEAD/Range、真实Web扫描tick、重启和排空。18个HTTP组通过17个，唯一失败为harness错误预期provider-ops权限拒绝403；实际既有`biAuthorize`合同返回404，已修正harness，未把该轮记为全部通过。签名参考素材实际GET200/HEAD200/Range206/RangeHEAD206，HEAD空body且冻结SHA一致。后续变更/owner守卫、SQL回执与UNKNOWN步骤等待最终轮完整执行。

进一步真实双Worker共享目录复现：旧Worker确认退休并删除终态目录后，新Worker仍持有8项终态缓存，导致新POST永久429假满。`4fdaf698`仅在严格核验共享退休回执后清理本进程terminal Map；不删除共享业务目录，不清queued/processing/unknown。Windows实际7个Node进程、38断言、60秒collector及symlink/坏回执等负例通过，原combined91断言与正式类型通过，供应商/数据库调用0；fixture engine不能冒称native解码。最终固定镜像将补Linux真实进程与完整联合验收，因此a48也不是最终候选。

最新Linux+官方Node发布门禁216组无skip通过，见`ops-final-abort-linux.log`。供应商HEAD修复及严格失败候选退役工具已整合至`859d1ef9`；最终构建前已重新fetch，origin/main仍`7b1e970c`且是当前祖先。

## 当前阻断与下一步

## 066候选本地验收通过（后续真实冷启动缺口待整合）

固定源码`06665b7ec21db89bba7ae75ed5c2068effad39fa`，版号`1792699394`，同版Web/Worker镜像`sha256:1bad930983b941059c28698ca2acd6b2daab9c27c777d2e91064ef22a954c643`，归档SHA256`528fe7ee0e098ae5e6f76a4c5ffcea3b82febef06284c2e621e3281fb1892f1e`。原Dockerfile完整正式构建与公开更新说明检查通过，依赖锁未改变。独立审查未发现退休修复引入的可定位P0/P1/P2。

- 实际Web＋新建PG＋同版combined Worker：`ee737eae-8c4b-4ba5-a7d9-e8563facaa25`通过18/18 HTTP组，包含真实密码登录/跨租户与成员权限/双cookie不提权/UUID详情/3份图片/内部Worker鉴权。实际PG保留2个完成且同commit的tick回执，真实进程重启、双队列排空和正常退出通过。
- 签名参考素材GET200、HEAD200、Range206、RangeHEAD206及原字节SHA通过；实际同长度篡改GET/HEAD503、改owner GET404，原文件与owner已恢复。UNKNOWN为明确本地持久状态故障注入，真实进程重启后保持暂停/媒体排空/未解决项，resume409、退出2；没有模拟真实上游已接受结果。
- 实际native/combined：`eacc47ca-4016-47d2-9d37-ebddf40704d5`通过完整视频解码与隔离、原UUID幂等、重启/排空/正常退出/零OOM。既有真实视频243465字节，SHA`c7aeff63…`；扫描Web是明确mock，不能代替上一组真实数据库证据。单样例峰值399.77MiB，不降低1GiB预算。
- Linux固定镜像原Worker代码＋只读挂载的同源码测试入口：7个真实Node进程、38断言、实际60秒collector、symlink及坏回执负例通过；仅本组engine为fixture，不能冒称native。

完整本机证据与固定hash审核材料在`output/saas-linux-release-20261023/LOCAL_ACCEPTANCE.json`及同目录日志/结果。所有本地验证供应商调用0、47连接0，隔离容器/网络已清理；没有把fixture库同步线上。该记录仅证明已列检查在066镜像通过，不是47生产通过。

### 真实页面发现的新阻断

47前序R2程序已COMPLETE并启用模型配置135后，负责人在真实GUI发现视频目录冷加载时创建节点未受ready gate约束，实际只保存空prompt/providerOptions，默认模型缺失；原UUID/JSON证据保留，未用harness补选模型掩盖。供应商Sol子任务拥有canvas-client.tsx修复，本任务不并行修改该文件。R3会同时整合本轮共享媒体退休最小补丁（仅worker/test两文件，patch SHA`186f34af…`），并补combined→combined前序2GiB/1GiB严格证明。**066因此不发布**，旧本地结果保留并标记SUPERSEDED；收到冷启动及发布控制修复后重新整合、分配高于真实已发布版本的版号、固定完整Linux镜像并集中复验。直到前序最终真实节点验收、旧槽退役和三锁释放，不连接47、不push main、不叠候选。

供应商线程先执行其已授权47视频发布，本任务未连接47、未持锁、未启动47候选、尚未push main。其首次候选在切流前发现实际签名素材HEAD悬挂（GET和Range正常），负责线程接管`reference-media.ts`，整合最小HEAD与local-SHA补丁，先安全收尾唯一失败候选，再新候选发布。旧站未因该旁路失败切流。

因此上述B3是首次本地候选证据，**不是最终可上线SaaS候选**。收到HEAD修复后先整合并固定新commit/Image，补实际HEAD验证，再做最终联合验收；不得明知缺陷仍发布B3，不复用原失败操作ACK，不overlay在线程序，不重投付费任务。

最终47发布须在前序program/config/节点真实验收COMPLETE、旧槽退役且三锁释放后，重新读最新main/所有业务分支、线上固定镜像/当前模型配置与凭据/原journal和公网入口闭包。保留供应商新profile及后续任务，不能恢复旧配置134。生成本地验收与真实入口盘点的固定hash材料后，用`bash scripts/deploy-release.sh --lifecycle publish47-saas --config ...`走旁路、整站切流、实际排空停止和真实验收。当前R04后继构建、R05线上、R06现场恢复门禁尚未完成，未声称发布成功。

## 后继整合继续进行

供应商`6983282c7b5bfc415fccf35e526d87ec4f03f2fa`已合入`1306065f914e4c89485c93543976b552775d3b2a`，只公开更新说明冲突，保留双方条目；本轮未发布条目改为`1792702991`，高于对方R3拟定`1792702873`。4fd媒体两文件完全相同，自动合并没有重复修改。Sol只读复核四类新建入口/重试/防重复/历史模型及batch冻结上下文，当前实际函数抽取277检查、原client settings/视频batch、正式全项目类型通过；实际浏览器须后继固定程序验证。Linux官方Node24下发布门禁219组全部通过，日志`ops-r3-integrated-linux.log`，未发现本轮合并新增可定位P0/P1/P2。

供应商随后在真实第5组发现GeekKling参考图片URL需要图片后缀，extensionless签名地址被校验拒绝，故698同样不作为发布候选。其HEAD负责人拥有`reference-media.ts`最小MIME后缀/严格绑定/旧extensionless兼容修复；根任务未并行修改该文件、未开始后继镜像构建。原第5组UUID为creation_unknown且无upstream ID，保留持久证据，等待明确受理/费用事实，不重投或清状态冒充排空。前4组真实节点通过，后续两组未提交；本轮没有调用供应商。新最终source及真实47收尾回执到齐后再固定后继镜像，不使用066旧审核材料放行。

`979cdca9ca403e2afbc7eb6afed306441e7d8b9f`的MIME绑定修复已完整合入`4dbecb1e2c5cda4ee9bd1998b62f09632aa49b15`，本轮待发布条目调整`1792703533`，保留供应商最新`1792703343`并移除双方被替代的未发布版号。根复跑689断言/21次实际loopback HTTP通过；独立只读安全审查未发现新P0/P1/P2，核对严格canonical MIME、旧裸URL兼容、owner/SHA/TTL/HEAD/Range及SaaS2GiB/1GiB门禁保持。证据`r4-reference-mime.log`。新Linux harness已准备实际Web的新`.webp`、旧裸地址及错/双后缀GET/HEAD验证，尚未执行，不把旧066的裸URL检查当新后缀通过。

本机真实CUA复核空目录重试：菜单“重试视频模型”可点击，刷新后仍为空画布，日志视频节点POST前后均0；截图/JSON为`output/saas-design-qa/cold-catalog-empty-retry-r3.*`，开发服务/fixture身份，非固定Linux或生产验收。正常32模型默认仍由277函数fixture证明，待真实目录GUI验证。

供应商线程转述同一用户已选择“跳过”原05费用核查，UNKNOWN/pending/原UUID继续保留，不重投/退款。06/07为原定纯文、无references，已由其按独立continuation做首次提交。根只查公开资料：Geek官方billing仅有聚合信息；New API[日志文档](https://docs.newapi.pro/zh/docs/guide/feature-guide/user/log)与[当前认证源码](https://github.com/QuantumNous/new-api/blob/main/middleware/auth.go)支持Authorization头的只读`GET /api/log/token`，但不能据此证明Geek同版，也不能从缺日志推断未扣费。已给负责人来源，本任务未调用47或供应商。

程序排空与费用事实分开核对：未知费用不能改成0；只有现有真实请求/accepted activity/Agent/lease/newAdmissions零与任务hash保护都通过，才能按原门禁推进。根提出若对方R3尚未登记/创建，可由一次整合SaaS候选接续R2完整发布，采用原批准的无旧业务回退/受控维护恢复；这仍待对方交接，尚未获得47发布所有权、没有连接/拿锁/推main。
