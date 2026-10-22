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
