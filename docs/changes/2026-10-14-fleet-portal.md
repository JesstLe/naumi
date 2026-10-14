# 103中央控制台限定路由服务

## 本轮范围
按完整fleet目标准备103中央管理服务，47/NAS另待实机接入。103已运行多槽老业务，本次只部署独立fleet portal，不切主站首页/画布/生图/Agent/SSE/Worker/存储，不开放新机公网端口或关闭Cloudflare。

## 实现与集中验收门槛
- 独立Next浅色管理页复用FleetManager/AdminCenterShell、原管理员鉴权和同103数据库fleet表。不复制用户账号/积分/企业库。`FLEET_UI_BUILD=1`隔离资源`/fleet-assets`，旧/_next资源不替换。
- portal的ensureSchema仅只读验证既有auth/user/settings列，绝不在多版本生产站运行全main业务迁移。fleet独立表仍用原加法迁移；缺业务列直接失败，另在正式兼容迁移流程处理，不通过访问管理页触发重写业务数据。
- `FLEET_PORTAL_ONLY=1`只允许管理页、fleet admin/status/releases、固定connector poll/ack、健康和版本；所有生成/上传/Agent/账号修改/任意应用路由404。Nginx只引入限定路由，不把全main未验收业务入口暴露。
- 固定Linux非root镜像无媒体执行包、生成后台或Worker，发布dispatch/scheduler默认0。运行env只从103原App提取DB/鉴权必要字段，不带模型/R2/S3密钥，不改原env。
- 本机生产Linux镜像→隔离DB→真实浏览器1440/390和namespace资源→匿名/普通账号/跨实例拒绝与生成路由隔离集中验收。不能仅凭构建绿发布。
- 103上线全程Naumi/Hub两锁，读取最新容器/CID/镜像/网关/env及用户/余额基线、可读备份；固定旁路端口和资源限额、真实管理鉴权测试后Nginx语法/平滑reload。已有业务槽、静态/在途/worker保持。失败只回退网关和本任务服务，不恢复旧数据库。

## 当前状态
开发/构建准备中，未发布103管理路由，47现有站点和NAS均未更改。开工fetch main 1bdcb86，工作区任务分支独立，共享checkout保持；本轮发布计数未增加。正式目标active，20:00生产调度仍未启用。
