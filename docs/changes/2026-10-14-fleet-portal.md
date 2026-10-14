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

## 2026-10-15集中验收与103私有准备
- 固定ef08d3d / 1791994700、镜像naumi-fleet-portal:ef08d3d（本机OCI index8bd1fe8，实际Linux config9a1bf3d），Node24非root完整Next构建通过，保留既有Hook lint警告。143,422,110字节包SHA25671923eb0b381ba8133889512700d64ba4f3f5074cd84a94d6d8bfb7b1412c2a1；config/manifest/nested OCI index摘要逐层绑定，适配两种Docker存储ID，不靠同名镜像放宽校验。
- 本机真实Linux Next+Nginx+独立DB+独立Chrome1440/390通过：管理注册/凭据关闭/离线队列、匿名401/普通用户403、生成/Agent/注册/画布路由404、/fleet-assets资源23次全部200，pageerror0，无溢出。真实用户行全部字段前后一致，不触发全业务DDL。截图已打开。测试初次匿名断言写403，与正确未登录401不符，仅修测试，未放宽鉴权。
- 独立Linux root准备合同通过双锁、坏包在Docker前拒绝、基线门槛、可读备份、最小env0600、旧服务/网关不变；Docker/DB合同模拟。真实103准备另有回执，不以合同代替。
- 103原admin@admin.com历史登录资料只尝试一次，当前401，不改密码、不伪造会话。已异步询问当前受保护管理员登录路径；公网切流与实例注册等待真实管理员验收，不启用47连接器或20:00timer。
- 首次SFTP在上传脚本时通道断开，实查只留下0字节prepare.py，writer已终止；随后新文件名prepare-verified.py以SSH流式stdin传输成功，完整包SHA核对通过。没有在结果未确认时重启传输或覆盖业务文件；未连接旧120/101/179。
- 103实际全程持Naumi/Hub两锁，保留可读pg_dump与旧网关、旧CID/Image/启动时间，启动384MiB/0.5CPU只读根fs、无cap、loopback13062专用sidecar。真实版本、匿名/生成入口隔离通过；全部原运行容器和旧网关/网站8af8ee6/1791975598不变。派发/调度0、真实管理员验收pending，**没有公网切流**。47/NAS不变；只准备不增加成功发布计数。
- 服务器材料/备份/只读env：/opt/naumi-staging/evidence/fleet-portal-20261015；本机四件套及baseline/modified/rollback、构建/UI/合同/实机回执在output/fleet-portal。源码rollback在独立副本通过、原hash恢复；不回灌生产DB/积分/媒体。任务分支push/普通合main以最后Git回执为准，完整goal仍active。
