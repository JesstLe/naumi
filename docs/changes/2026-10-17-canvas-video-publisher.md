# 103 画布视频发布器：媒体生命周期接入

## 范围与当前状态

业务固定镜像保持 e997b290b39fc9df63e4c3b6387fa008b7b0e18d / 1792200281；本模块仅修改宿主发布工具和相应验收，不重新构建无业务变化的 App。功能矩阵仍34/34、55份证据，但生产发布、生产回滚材料与线上验收未完成；没有持103部署锁或切换服务。

沿用已有明确方案，发布拓扑为 unified-web-three-ui：单 Web 原生承载普通、desktop、enterprise URL 界面；原三编译镜像保留回退材料，不能声称三个 Web 进程同时上线。媒体 Worker 使用同业务源码的普通固定镜像。

## 已实现

- 只为本目标增加 canvas-video-fusion-103 授权模式，绑定用户原话、103、原目标会话及 canvas-video-fusion 范围；禁止恢复DB和重放已接受任务。10月16日原有维护窗口及47规则保持，不伪造日期/另一任务ACK，不依赖47发布完成回执。
- 媒体 Worker 3—4 GiB 独立预算计入维护前容量检查，swap不计可用内存；App/调用Worker/宿主保留预算继续保留，不能漏算侧车。
- 实际独立64hex媒体密钥、0600私有intent/env、发布目录内独立scratch；媒体容器不接DB/供应商密钥或业务媒体、不开放端口、只读根、限定chroot/降权能力、no-new-privileges及三个受限tmpfs。App仅新增严格校验的媒体绑定/共享scratch，原数据库和Settings密钥保持。
- 创建/启动回执不确定时按持久intent、精确镜像/名称/标签/secret哈希/网络/挂载/资源重观测；不重启已退出或状态未知的Worker。候选侧车保持draining；先关闭App准入再排空侧车，恢复时先开侧车再开App。
- 回滚遇running/queued/未ACK terminal产物即hold，不删文件；ACK后排空保留侧车和scratch供仍引用它的候选App后续清理。媒体尚未创建或已创建但从未启动时可安全完成相应回滚，不访问不存在的健康接口。

## 复核发现与修复

首次新上下文Node复核实际读取6份完整编号源码（1873行）及基线diff，发现两项：媒体回执丢失后的整个web-create对账误读未创建App；早期rollback误要求媒体存在。已补MEDIA_PREPARING→MEDIA_READY→APP_CREATING→APP_CREATED私有阶段日志；APP_CREATING由clone_web在真正Docker create之前的hook写入，前置媒体/验证失败不会假装App已发送；已发送但结果不确定的App创建继续hold，不盲目重复。

修正复核18007 exit0，Node读取指定完整方法、调用处及实际Linuxprobe/会话单测，6/6源码与workspace SHA一致，结论 No actionable findings within the two-correction scope。回执 media-release-corrections-verdict.txt，不冒充运行/线上验收。

## 集中验收

本机Ubuntu/真实Docker隔离内网，固定9fea589fed46a283fe8601d2771d0517077ce176708bdc9ff9e7226693c20f1e镜像：

1. 四组Linux检查共57项：旧授权5、Host9、维护会话35、新模块8；55通过，2项Nginx相关用例跳过。Windows旧网关路径夹具一项CAS失败、Linux对应项通过，原输出保留；不声称全平台/全Nginx/完整CI绿。
2. 真正通过LiveAdapter.web_create注入媒体Docker create和start成功但响应丢失，再以同operation恢复；只create/start各一次，App之后才创建，重观测App身份相同、阶段最终APP_CREATED。
3. 实际HostTransaction克隆停止的测试App，私有媒体绑定和scratch一致，合成原DB/Settings环境值保持；不启动该App、不连正式DB。
4. 真实固定沙箱Worker完成1280宽素材抽帧，输出SHA核对；排空拒绝新任务，未确认结果时rollback拒绝且PNG字节保持；ACK后可排空保留。准备前和created未启动两条回滚分支均通过。
5. 仅自有internal网络、精确CID和已标记测试目录清理；原合法素材SHA保持。productionConnections=0、productionLocksUsed=false。

证据：工作树 output/canvas-video-fusion-20261013/checkpoint-d/media-release-20261017/，包含batch、actual-linux、各组日志及源码SHA。首轮独立侧车probe与修正后完整web-create probe分别保留，不把前者替代后者。

## 下一步发布门槛

当前103最近只读MemAvailable约3 GiB；按896MiB Web、128MiB调用Worker、3072MiB媒体、1024MiB宿主保留，需要5120MiB，当前不满足。需要从实时Nginx/容器身份生成并验证旧静态保留包，再为可恢复、来源/内存Agent/任务/引用均核清的历史UI安排精确退役，不能按名称或无Nginx引用直接stop。当前已观察到静态alias指向evening-0614f9ae6f91-unified，实际站点仍旧UI；以前“尚未安装静态包”的文档不是实时事实。

还需当前固定单Web三UI实际浏览器验收、完整网关四态CAS/旧静态SHA、当前生产备份与回滚检查、新运行实例自动恢复策略及线上受影响功能验证。以上完成前 delivery gates 保持pending，不开启发布锁窗口。
