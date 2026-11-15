# 原生客户端版本身份与有界RSC渲染器所有权

## 模块与职责

基线main c3787b774626a69b6145e10df7d64563b39d6d0b。103只读连接本轮仍SSH认证前关闭exit255、HTTP版本空响应exit52，未取得实际启用配置。本片处理A19已复现的跨build导航：Next15.5.28原生deploymentId会令客户端带x-deployment-id，无需改写BUILD_ID或RSC b。

## 决策与公共接口

buildDeploymentId以真实source/version/UI flavor形成身份，未版本化本地构建保持原行为；Next本身产生/校验BUILD_ID。client-renderer只识别GET＋RSC1＋四个已审查页面路径（canvas/dashboard/works/video），有非空Next-Action时退出。普通HTML、API、生成POST和Server Actions始终走当前版本，不进入读取回退，不重试未知受理。

client_renderer_routes纯函数返回HTTP/server片段、所需mapHashBucketSize、activeRetained和notBeforeRetire。既有完整网关owner必须将桶大小与现有设置取足够值，不能重复插入同名全局指令；本地单文件夹具无既有设置。最多一个保留渲染器、最长900秒；标识/端点/期限校验，已过期条目移除。当前路由清除私有期限头，保留路由覆盖期限头，用户不能通过传头延长网关期限。原中间件在鉴权/功能检查后拒绝过期协议读409，只有只读命名location接收该响应或旧renderer不可达并退回当前；Next保留原生跨build升级。该期限不是模型、任务或用户许可。

旧renderer只用于有期限的已审查RSC页面。页面之外、未知身份和没有原生身份的旧版本退回当前，可能执行Next原生文档升级；现有tab草稿恢复保持。Server Actions不在本路由覆盖范围，不从GET验收推断POST兼容。目标站旧renderer生命周期、全页面/全业务采集、显式清理窗口仍由原发布owner负责，notBeforeRetire不是自动停机器。

## 依赖与实现

Nextconfig只导入纯构建身份函数；middleware只调用纯协议读期限判断。网关配置生成归ops，不导入视频/模型/账务。测试适配沿用原完整Nginx CAS/语法/原子写/reload、静态并集、Worker、格式guard和lifecycle CLI，不新建发布器。只在显式renderer-affinity＋严格浏览器路径启用；默认路径保持。

两个固定测试包可以来自相同源码、不同构建版号，故验证器核对真实image/commit/version元组及真实Next deploymentId/BUILD_ID，不以commit必须不同代替构建身份。旧→新→回旧浏览器仍要求原始文档数1、零升级；记录原生请求头与实际renderer响应头，两方向必须匹配。额外短窗口真实时间到期检查验证RSC GET返回当前200、路由可剪除、五类生成/账务表不变。

## 验证与退出状态

集中纯规则、真实Nginx/固定Next/Edge、期限、任务/账务、独立副本和回滚结果以 E:/Workspace/naumi/output/client-renderer-ownership-20261115/VERIFICATION.txt 为准。不是给旧包注入原生身份；首次带身份版本之前的旧浏览器不获虚假零刷新承诺。本片不是实际目标站发布，47 HOLD，103隔离线保持，生产配置/付费/部署0。总目标ACTIVE，实际启用绑定/上游/目标站蓝绿继续未完成。

## 集成发现与修正

首对固定包e648f72d中，真实严格浏览器11项已通过（两个方向0次文档升级、两个上下文各1份原始文档、原生deployment header与实际renderer匹配），但期限检查失败，整个runtime仍exit1，未宣称完整通过。保留STRICT2与DIAGNOSTIC原失败/7槽/schema/network清理。DIAGNOSTIC记录期限已过仍返回保留renderer200；读取实际镜像Next15.5.28的server/web/adapter.js确认Node middleware先提取并删除Flight headers，导致原守卫再次读取RSC字段得不到原事实。

修正使用网关覆盖的私有只读上下文与期限；ordinary/current/fallback均清除这些私有头，保留RSC命名location独立设置，原Native Flight头和b不改写。Node不从框架已删除的头重新猜请求类型。client-protocol.json是TS与Python共用的唯一路径/头名/窗口/桶大小事实源，Node及ops均消费它；新合同反控覆盖没有RSC原头但有可信网关上下文，以及超长窗口。重建最终固定包后再执行完整严格与期限验收，首对旧包不被冒称包含修正。

最初真实nginx -t还发现长deploymentId超过默认map桶，原失败保留；接口显式返回所需128桶大小，既有owner负责与完整配置合并，未靠忽略语法检查继续。最初fixture缺本地MP4在创建槽前已终止并清理，补复用原fixture字节，不改媒体实现。
