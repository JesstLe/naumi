# 47 视频节点家族配置与启用

## 用户授权与边界

用户明确要求“将seedance kling wan h3家族群为视频节点配置并启用”。本任务负责将已取得真实出片证据的四家族型号配置为可选视频节点，并完成47上线验收。

- 上一轮证据：`2026-10-23-provider-video-probe.md`。已实测证据保留33个供应商SKU；本轮启用普通生成32项：Seedance 7、Kling 15、Wan 7、H3 3。Wan视频编辑另1项配置但禁用，不进入节点菜单。
- 不启用未确认的Geek Seedance、未测运动控制、仍待终态的APIB Wan2.7文生，或需要前置task_id的H3 Regeneration。
- 仅开放本轮已测模式、时长、分辨率和引用数量；音轨存在不等于音频开关已经验证。后台以后扩展能力时，由声明与校验控制参数，协议适配不把本轮样例数值固化为常量。
- 旧profile与历史冻结任务语义保留，不重投任何受理不明的收费请求。
- 后台线程负责余额/SaaS其他模块，目前无生产候选或锁；已协调由本任务独立准备完整候选，代码与配置版本分别交接。

## 开工实际基线

47在线 Web / Worker 同Image `600320c4d08b5093e3d27efa91e31bc4cc81596ce0d788e0d01c85bd198a0652`，源码 `0a572167448a91a5a9e2cfc4c73a3b557eb6406c`、BUILD_VERSION `1792674911`。模型配置134，APIB视频provider禁用，当前视频默认为旧Grok；没有`business.video.generate`专用定价，沿用现有视频统一计费规则。

canonical revision608、当前正常发布 `release47-nas-upload-20261022` phase=COMPLETE；根CLEANUP_PENDING属于保留的历史事件，后续只可走已存在的严格正常发布继承门禁，不得清根状态或改状态目录。三锁开工检查均空闲，MemAvailable约3975MiB。候选按下文Web/Worker独立峰值旁路预算，旧槽真实退役后采用下文复核的2GiB上限，不把Swap当RAM。

## 模块进度

1. 已核对33项的协议差异，新增独立APIB/Geek profiles，避免改变旧冻结执行。
2. 集中协议回归33项/802断言、配置链路32启用/1禁用、822断言通过；均为无收费fixture，不冒称本轮线上节点验收。
3. 47真实PG已执行回滚屏障的只读SQL，五类表可读，扫描当时新profile绑定/非终态视频任务/工作流均为0。历史事故未修改。
4. 发现当前私有NAS地址为内网，不能把NAS presign送供应商。新增仅private+proxy使用的限时不透明媒体地址，绑定具体key/SHA/字节数/MIME/权限指纹，最长900秒；GET/HEAD/单Range、撤销/篡改/过期拒绝与真实本地镜像回退201断言通过。仅候选新增已核定公网origin环境变量，旧槽不改动；bucket不开放公网。
5. 配置工具分PLAN/APPLY/VERIFY/ROLLBACK，三锁、固定完整程序和canonical CAS、审阅计划SHA、自己所属的加密凭据、冻结32项能力、显式记录编辑排除项、原UUID恢复及选择性回退；客户积分规则不变。程序发布仍不自动启用模型，待COMPLETE后单独发布不可变配置。
6. 核验47未配置隔离媒体处理服务，现已补齐下文完整产物处理链路；特殊视频编辑模式需要单独的编辑节点验收，本轮保持禁用。静态图片采用原始字节的Sharp真实完整解码探测；动画/视频/音频仍要求原隔离服务，不在Web执行FFmpeg，不伪造探测缓存。
7. Linux固定完整构建、三锁蓝绿、旧槽排空、不可变配置CAS发布、真实节点选择/报价/生成恢复验收尚未完成。公开条目绑定本轮真实BUILD_VERSION 1792696653，未公开供应商、模型、架构或内部资料。

当前不是已启用交付，不据本文件或Git提交声称线上配置已经变更。运行材料位于本任务忽略目录 `output/provider-video-enable-20261023/`，不含可公开凭据。

集中Linux发布门禁回归210项通过（2项按平台条件跳过），真实PG只读扫描通过；完整类型检查通过。尚不等于候选或线上验收。

## 完整结果链路前置的收口

真实代码复核确认所有视频产物在result-assets中都要经过隔离probeMedia并全解码后才保存/结算；47当前没有MEDIA_WORKER_ORIGIN，不能只加供应商配置后宣称可用。因此候选将采用同固定镜像的一个Worker容器，父进程监督扫描子进程与隔离媒体子进程，Web不执行FFmpeg。公开Worker控制3001统一代理扫描内部3003及媒体3002，原控制UUID、UNKNOWN与排空门禁保留，崩溃监督器也经同一入口恢复。

候选预算调整为Web 1536MiB、Worker 1024MiB、主机余量1024MiB（合计3584MiB MemAvailable门槛）；旧槽真正退役后Web采用2048MiB并同步监督器静态指纹，Worker保持1024MiB/单媒体并发。239MiB运行时复制、原生解码和输入临时副本都计入Worker峰值，不把tmpfs或Swap当免费RAM。Worker只读根、独立媒体秘密、精确共享scratch、私有控制，无DB/NAS供应商凭据；仅容器PID命名空间所需cap，KILL用于取消降uid子进程，native仍chroot/dropuid/seccomp。未扩大bucket权限。

这部分仍待固定Linux真实sandbox、候选健康/样片解码与原任务排空验收；没有启动47候选或修改当前服务。

新combined Worker保留容器私有PID命名空间；CAP_KILL只用于监督和取消本容器内降uid子进程。常规退役仍必须先控制drain并取得扫描与媒体队列为零的证据，stop与SIGKILL不替代排空。

最终RAM复核：47实际MemTotal约7270MiB，MemAvailable约3985MiB，旧Web/Worker cgroup current约975/47MiB。3GiB最终Web加新增1GiB Worker和1GiB主机余量，在最乐观释放旧槽全部current时仍不足，故本轮明确最终Web为2048MiB，候选1536MiB；JS heap仍受1152MiB限制。Ready与退役前仅计旧槽anon可释放量做保守预测，退役后再次实测，不把旧filecache或Swap记作新RAM。完整镜像需按此最终提交重新固定。

## 首个旁路候选实测与修复

固定5d568c7b / image a9653626743d1e0c2faaca14e97ea2bef5099c19764acbbbeb3237a9be1ee993的完整Linux构建及真实combined smoke通过；暖态峰值396.80MiB，仍保留此前655.06MiB冷态证据与1GiB预算。47三锁备份可读、镜像导入、原任务快照及唯一候选Web/Worker启动成功；程序停在CANDIDATE，canonical revision626，尚未切流/暂停旧槽/启用模型。

真实合成图上传、私有存储、隔离10.125秒视频全解码和精确清理均成功；签名素材检查在LOCAL_SIGNED_HTTP满60秒失败，失败验证数据已全部清理。随后只读现有归属106B PNG定位：GET 200及SHA一致、Range 206及字节正确，HEAD 15秒无响应头超时；Next fetch的流取消等待阻塞了HEAD返回。原7个操作均ACK并保留UUID，旧站继续服务，未生成付费请求。

修复HEAD为始终只向源请求bytes=0-0，最多两次读取验证1字节及EOF，5秒读取上界；错误源发起释放但不等待悬挂cancel，再验证镜像或503。响应保留客户原始Range元数据且无body。同时整合后台已完成的local存储默认读取冻结SHA校验，防止同长度文件替换绕过校验。集中309断言、6次真实loopback HTTP与独立local驱动子进程回归通过，TS导入图零诊断；不是47新镜像验收。

失败候选已按原UUID与三锁严格排空并停止，Web/Worker均restart=no；原发布登记ROLLED_BACK，preSwitchAbort=COMPLETE，canonical revision636，原7项及新增4项操作均ACK。仅停止本候选，在线NAS Web/Worker、入口、模型134、备份、监督器及历史事故均未改变，没有回灌数据库或重放收费请求。证据为原transaction/VIDEO_PRE_SWITCH_ABORT_RECEIPT.json。

修复后的首次完整Next构建仅发现回归脚本缺少Next要求的NODE_ENV类型字段，现已补test；完整tsc及309断言/真实HTTP回归重新通过。当前待完成r2唯一候选的新固定镜像、真实Next HEAD、完整蓝绿及32项配置CAS/节点验收，不以本文件声称已启用。后台后继SaaS已协调等待本发布，不并行抢47锁；后继combined到combined共享scratch终态缓存清理归后台单独负责，本轮不混入未完成工作。

## R2程序发布与配置启用实际结果

固定完整源859d1ef961c90b578896adf5482ea58d2b0d243a、BUILD_VERSION1792696653、同Web/Worker镜像7a2e5b7622db4a377c8002f9356e0077f165b93e59c0f41403cf6865640e70e3，归档SHA256为6cf50eff0f65864463363343d89ead77f66fa394b72d45bb17082f564ae452af。生产Next构建通过，最终真实combined smoke通过，峰值396.61MiB，未降低1GiB Worker预算。构建前及切流前刷新origin/main均为7b1e970c84006c2fb76f8c1748e96da128e12982。

R2在三锁中完成可读备份、旁路真实上传、GET/HEAD/Range与原生10.125秒视频全解码、真实桌面与390px页面、整站切流、旧槽排空退役、任务保全、2GiB最终Web内存及监督器指纹同步和回退材料检查。2026-10-23 04:48:58 CST登记COMPLETE，canonical revision682，Web 7e7b9cbe141b711326ee0e719eeb2f12ad38297fd3c478ab1b5e73be8763f433、Worker 72059234a5021548bf4de6e5275c11fcdfe84e77554a800df83034631e858576；旧NAS Web/Worker均停止且restart=no，历史两项事件原样保留。根MIGRATED_CLEANUP_PENDING没有被改写为历史事故已完成。浏览器首次本地Paramiko通道断线导致验收超时；恢复自有OpenSSH通道后全部页面重新通过，未因此改变线上实例。

独立不可变模型发布沿原operation c2956135-6eeb-48cf-bd55-62a7f14c7600完成PLAN审阅、APPLY与VERIFY，134→135；32项全部编译与能力冻结校验通过，默认video-apib-seedance-2-0-fast，积分配置版本8保持不变，编辑项仍禁用。配置过程无供应商生成请求。公网签名素材与原生解码再次通过，verification d4bfaea9-b4fe-4d6d-acac-29d2d63467e1，验证数据精确清理。

真实七组视频节点生成、Worker恢复与结算、32项菜单及设置保存/重载/移动端验收仍在进行；不能把上述配置校验或原70项供应商直连成功当成本轮业务节点已全通过。运行证据根为/opt/naumi-staging/evidence/video-family-release47-20261023-r2，配置与程序分别保留receipt。后继后台线程继续等待本轮节点验收和最终交接，不抢锁发布。

## R3收口：真实GUI发现的冷目录创建竞态

R2真实GUI通过加号创建私有空白节点vnode-3dfedefb-da7e-4036-be9b-588b4367c955，目录尚未完成时只保存prompt/providerOptions，缺少modelId/providerId。原JSON和截图已保留，创作栏实际显示“未选择模型”和空时长；没有在验收脚本中手动选默认冒称成功。修复仅为显式新建节点解析默认：目录加载时禁止新建，失败/空目录提供重试动作，核心函数读取最新目录并防并发重复创建，刷新完成不自动创建。旧/未知模型及历史配置不静默回退。277项集中断言、原客户端回归和完整CanvasClient导入图TS零诊断通过，仍须新固定程序真实GUI复验。

R3是combined到combined继承，显式登记predecessorWebMemoryMiB=2048并核验实际前驱cap，保留原缺省3GiB门禁及全部任务/事件/退役核验。153项集中检查及另补3项实际Node协议通过。合入后台已完成的4fdaf698仅媒体worker与验证脚本补丁，补丁SHA256 186f34afbde3594251b9e52ac3b8eb81492a944700b2ea39242e5ee7da4c583f；worker内容SHA与已验收源一致。该补丁只按有效共享retirement回执清理本进程终态缓存，保留active/queued工作，避免后继进程永久占满8个终态槽。复用同内容Linux真实7进程/HTTP/共享scratch/60秒collector的38断言证据；不是原生解码验收，后者仍由固定镜像smoke及旁路实测完成。

R3拟固定新公开版号1792702873，公开条目只说明新建节点默认选项和加载重试修复。当前R3未构建/未发布，模型135继续在线，R2原UUID真实生成仍在推进；不重放历史或本轮已受理请求。

### R2业务节点实测与后缀补充修复

R2原run 095d5940-e5ab-47dd-9158-8e4a9ce2e0b2的APIB四组（Seedance2Fast、Klingv3、Wan2.6I2Vflash、H3Max）已实际完成，视频全解码、结果SHA与单次积分结算均通过。第五组GeekKling带参考图原task vid-fbb995e5-438a-452c-b2cb-009b33b8ee36返回HTTP500、没有上游任务ID，错误为FileInfos[0].Url应为图片类型或asset地址。现限时代理地址缺少文件后缀，APIB能识别但该接口拒绝；根因由真实业务路径发现，不能把原直连成功当应用路径验收。

新增URL使用已冻结真实MIME对应的规范后缀，路由在元数据/存储访问前严格核验签名与后缀匹配；原无后缀短期URL继续有效。原SHA/owner/900秒上限、私有桶、HEAD有界读取均保留，不改媒体字节。689项集中断言与21次本地真实HTTP通过，acceptance CLI亦绑定单一.png并保留篡改签名拒绝。6983282c及1792702873仅本机构建，标为SUPERSEDED、没有上传或发布；最终R3改为1792703343，公开目录移除未发布候选的条目，只保留实际拟发布版本。

第五组原请求当前仍needs_attention/creation_unknown，唯一供应商call 7e4a56d2-c2bf-4eb8-a52f-c3b423bfb39c的费用pending/金额未知；响应SHA c6045d85c9c46bdb529283d9395412f2ac178a2796fcf47f022547eef77be75d。没有not_charged回执，不能推断未受理、退款或重发。正只读核对供应商原日志；剩余第六/七组尚未提交，若继续只允许原run内首次提交这两项。R3完整发布必须保留此原未知边界，不能删除、换UUID或绕排空/回退兼容门禁。
