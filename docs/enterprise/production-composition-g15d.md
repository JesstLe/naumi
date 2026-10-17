# G15-D 完整生产Web与Linux工作流组合

后续入口代理、跨版本切换及旧静态资源验证见[G15-E](proxy-lifecycle-g15e.md)。全局退休仍受既有生命周期未知项约束，不由本阶段镜像验收代替。

## 目标与架构

沿用原18482产品HTML和同一Naumi源码，不再以Next开发服务器作为本阶段验收对象。构建项目原Dockerfile的完整standalone Web，包含既有媒体运行层、Worker脚本和静态资源，再与独立工作流运行镜像组合验收。没有新增企业专用Web代码分叉、精简路由集或管理员壳。

正式架构仍遵守单完整Naumi Web与其独立Worker的约定；工作流API/通知Worker是独立业务服务。此构建不授权为某个功能长期叠加第二个Naumi Web，也不接管现有服务器或用户实例。

## 构建实现

`scripts/build-enterprise-web.mjs`默认要求干净Git提交。只从Git已跟踪/未忽略源码建立独立上下文，排除.env及数据/输出/依赖目录；原.dockerignore继续作用。开发候选需显式`--allow-development true`，最终交付再从干净提交构建。

根Dockerfile仅增加`NODE_BASE_IMAGE`构建参数，默认值保持原值。该构建器传入已核验的Node24 bookworm镜像摘要到所有阶段，不复制另一套Dockerfile。原npm ci、Next请求体修补、prebuild资源生成、完整next build、媒体运行环境和nonroot runner均保留；没有关闭类型检查或跳过失败页面。

构建记录：完整Git SHA、sourceDirty、上下文源码hash、原HTML hash、固定基础镜像、实际Image ID和BUILD_VERSION。构建版本取固定提交时间，不把当前时钟当作源码版本。依赖测试镜像标签同时纳入Node基础摘要、锁文件和修补脚本hash，避免不同依赖环境共用标签。

```powershell
node scripts/build-enterprise-web.mjs --output ABSOLUTE_BUILD_OUTPUT
node scripts/verify-enterprise-production.mjs --output ABSOLUTE_EVIDENCE_OUTPUT
# 开发候选显式添加 --allow-development true；正式交付省略。
# 可显式复核既有构建：--web-report ABSOLUTE_WEB_BUILD_JSON
```

指定已有构建时核对实际image/deps标签的Image ID与构建报告。正式验证要求Web和工作流来自同一当前完整Git提交且sourceDirty=false；不能把旧构建报告当作新提交已经验收。

## 实际容器组合

验收器创建本轮唯一的内部Docker网络、PostgreSQL实例及测试卷。源库source_composition与工作流库workflow_composition是两个不同数据库；没有导入真实公司的库、原Excel或媒体。

|组件|实际运行方式|
|---|---|
|测试驱动|仅测试镜像包含源码、tsx及初始化工具，UID1000；不挂Docker socket|
|Naumi Web|原完整生产镜像，默认CMD node server.js，UID1001；没有测试登录路由|
|工作流API|实际运行镜像，runtime serve，UID1000；独立低权限数据库账号|
|访问方式|共享本轮数据库网络命名空间的127.0.0.1；无宿主端口发布，内部网络阻止外部供应商连接|
|数据与凭证|仅合成账号/密码/签名密钥，生成于测试卷或内存；不进入生产镜像和交付归档|
|资源限制|Web1536MiB、API512MiB、PG512MiB、驱动1024MiB，分别限制CPU；这是验收约束，不是目标服务器容量结论|

测试驱动先使用显式迁移/初始化命令建立合成身份，随后由宿主启动两个未改写的生产镜像。驱动只有在服务实际就绪后才开始HTTP验收。Web运行环境由同一受保护组合配置映射，公共Origin与Host仍按G15-C严格核验。

## 验收矩阵

在上一阶段9组实际HTTP检查基础上增加生产Web的/api/version完整提交核对，共10组：

- 公共Origin/Host、伪造forwarded、跨站和缺失Origin负例。
- 组合预检的错误端口、数据库、来源实例、企业集合、模式、密钥和HTML拒绝；HTTP200但槽位错误仍拒绝。
- 原生口令登录、HttpOnly会话和匿名跳转，不注入签名cookie。
- 同一原产品HTML字节；员工、个人、其他企业隔离。
- 需求审批、发布认领执行、真实上传下载、设计验收、运营签收及贡献事实。
- Naumi合成生成账号/提示词/6积分记录读取、签名关联且不重复扣费。
- 账号/映射撤销、切号、来源企业停用和源/工作流持久化分离。
- 实际standalone Web返回构建记录中的完整Git SHA，不以标签或HTTP200代替版本。

同时核对容器实际Image ID、UID、只读根、cap_drop、no-new-privileges与无宿主端口。成功路径由工作流drain/stop停机，Web在已完成全部测试请求后发送正常SIGTERM并记录退出码；未将这一行为冒充整站Agent/SSE/在途任务排空或Nginx蓝绿。失败清理仅处理本轮唯一前缀和标签的合成容器/卷/网络。

## 当前实施状态

开发候选已完成原完整Dockerfile的生产构建、完整类型检查、90个静态页面生成及standalone导出；10组Linux生产镜像组合验收通过，Web/API观察退出码均0。最终干净提交、固定镜像导出、模块回归和代码副本回滚以本轮VERIFICATION.txt为准。

原开发态组合验收入口保留，新增external-services测试协议只存在于测试驱动。应用路由、登录和源授权未增加fixture开关。生产镜像不包含初始化脚本入口或测试配置。

## 交付、恢复与后续

固定Web与工作流镜像可一并导出到PRODUCTION_IMAGES.tar；归档需重新读取manifest/config/层文件并核对标签、提交、产品hash、releaseId和Image ID记录。代码副本回滚恢复本轮之前文件hash与基线测试，不回灌真实数据库。真正上线的回退仍要根据现场当前在线版本和兼容性单独准备，不能用此合成验收覆盖现场基线。

本轮没有改动18482预览、真实schema8/364行/292附件，也没有连接生产服务器。真实企业/人员/真名花名/钉钉映射、聚水潭等配置仍待明确。

下一阶段：在组合已成立的基础上验证入口代理、目标配置和完整蓝绿状态；对4核8GiB测量Naumi Web/原Worker、工作流API/通知Worker、DB/Redis/代理及双槽峰值。当前企业受影响链路通过，不等于画布视频/Agent等所有Naumi功能都完成了新的运行环境验收。总目标ACTIVE。
