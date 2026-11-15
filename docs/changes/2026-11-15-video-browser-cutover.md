# 固定视频程序：真实浏览器跨Nginx切流与回滚

## 模块与职责

基线main cbfefd057965ab45c1a583f654e54a30df7cae68。既有真实Nginx/CAS/静态并集/Worker/lifecycle事务已经通过，但HTTP200不能证明旧浏览器的React/RSC连续性。本片只扩展本地发布验证器，不更改产品编译/能力/参数、部署控制器或生产Nginx配置。

## 公共接口、依赖与状态归属

可选 `--browser-port` 必须有明确旧镜像和网关回滚路径，端口1024–65535，仅映射127.0.0.1。原无参数路径不发布端口、不等待浏览器，保持既有行为。测试网关对这个显式非标准浏览器端口转发原始Host含port；非浏览器路径保留原$host。实际网关CAS/语法/静态文件并集/reload和格式回滚守卫仍调用原owner，不另建发布器。

本地原子文件握手只覆盖old/new/rollback三阶段，token/phase/ok必须完全匹配，错误或超时不记通过。每阶段对比实际五类生成/账务表数量，浏览器不得创建任务或收费。浏览器通过原Canvas项目菜单及Next Link导航，不注入DOM/React/router，不替换成功HTTP响应；页面生命期读取performance.timeOrigin和主frame文档请求数量，RSC从实际请求header、响应content-type/slot/status识别。

夹具只在随机schema明确设置管理员口令以完成原首启锁；不绕过/setup、鉴权或功能授权。原未设置首启状态的CLI夹具能跑API但页面正确跳转/setup，首次失败已保留；正式验收在真实首启已完成的夹具状态进行。

## 验收设计与当前实现

- 旧包先真实水合Canvas，保留用户未保存的视频描述。
- 原Nginx完整CAS/语法校验及平滑reload切新；原浏览器文档和未保存描述保留。经实际项目菜单/工作台/作品/视频工作台Next Link导航，观察新槽实际RSC，不能用静态200或预取缓存冒充。
- 同一入口创建新包的独立浏览器上下文，保留另一份未保存描述。
- 原兼容守卫恢复旧槽并回切；新文档/描述保留，再通过实际Next Link导航观察旧槽RSC。严格模式要求两原文档均不得隐式整页刷新，旧新资源不丢、pageerror为0。
- 原任务冻结/未知受理/价格/资产/账务、旧Worker恢复、lifecycle CLEANUP_PENDING/CAS/终态检查保持，浏览器阶段前后五表数量不变。

旧包a554b6a0/1794696860（image638c66ec），新包be535f6e/1794704116（image5d45aa0d），保留包7ce2f729（imageac0aadbe），都是实际完整固定程序，不替换产品文件。此结论只覆盖该版本对和本地输入范围，不能泛化任意旧Web或所有业务。

## 验证与证据

七项纯夹具反控覆盖无参数无动作、阶段/种子、原子回执、失败/错token/错phase/非bool、生成增量、Host按显式参数传递；这些不是浏览器证明。原direct/handoff/static/格式/lifecycle测试集中保留，static有一项因无真实站点捕获跳过，不写零跳过。Linux-only fcntl测试不在Windows伪造模块，转到原只读Linux测试容器运行，原平台错误保留。

完整实际runtime/Edge、源与独立副本、命令/输入/literal输出/exit、原哈希和hashguard复制回退以 `E:/Workspace/naumi/output/video-browser-cutover-20261115/VERIFICATION.txt` 为准。早期contenteditable控件不能用toHaveValue、Canvas隐藏顶导航不能强制点击；驱动分别改用真实可编辑文本和实际可见项目菜单，原失败/清理保留，不强制点击、不改产品布局。

## 未完成项

本地浏览器连续性不是目标站TLS/公网/真实生产collector全业务覆盖。103当前连接入口仍待回复，启用Binding/env-only清单/迁移、授权真实上游和目标站蓝绿保持开放。总目标ACTIVE，47 HOLD与103独立实验线保持；生产配置/付费/站点操作/部署0。

## 已确认的严格零刷新反证

实际第四轮中，旧画布在切流时保持原文档与未保存描述，随后通过可见的真实项目菜单Next Link进入新槽/dashboard。新槽RSC返回200/text-x-component，但随后出现同一路径HTML文档请求；performance.timeOrigin改变，主frame文档数1→2，原严格模式失败。没有JS异常/资源404，不应把页面最终可用称为零刷新。该反证保留在STRICT_RSC_DOCUMENT_UPGRADE.log及原第四轮事件JSON。

保留严格默认检查，新增明确的 `--browser-observe-upgrades` 审计参数来继续记录两个方向及原完整任务/账务/lifecycle；输出AUDIT并显式strictNoReload=false，不把这个参数当修复或PASS。严格模式仍拒绝noReload=false回执，单元反控覆盖；不改写Next RSC的build标识、不关闭框架保护、不对生产添加黏性旧槽。

后续须按A19决定并实现受支持的跨build会话/草稿兼容策略，再用默认严格模式复测；本片不关闭零刷新连续性。浏览器在用户主动离开画布时发生文档升级，与切流瞬间强刷画布分开记录。

## 最终源与独立副本结果

源 FINAL_AUDIT 与独立副本 COPY 均完成实际旧→新→回旧观察：每份10项浏览器观察、64项既有Nginx/独立Worker/lifecycle事务检查。两个上下文各documentRequests=2，共2次跨build文档升级，strictNoReload=false；AUDIT命令exit0只代表观察完成，默认严格标准仍FAIL。切流瞬间原文档和未保存描述均保留，两个方向均能通过原保存按钮把描述、4K和1秒参数准确保存到另一版本服务端；pageerror=0，chunk404=0，浏览器阶段五表数量不变。原事务各4任务、3笔视频账本、41 fixture积分，UNKNOWN不重放、回滚不回灌资产或账务；各自7个临时槽、schema、网络及浏览器已清理。

实际读取两份镜像中的Next15.5.28源码，fetch-server-response.js明确在getAppBuildId()!==response.b时执行doMpaNavigation(res.url)。旧BUILD_ID=I8RHK-0mH4Gj1HYTT38QV，新BUILD_ID=DlphN29FY3qPkk3rqFquW；真实新槽200/text-x-component的RSC body包含后者。NEXT_BUILD_IDENTITY_PROOF.json记录两镜像命令、原输出和响应摘要。这定位了主动跨版本导航升级的框架分支，不等于已解决严格零刷新要求；不改写框架身份或移除保护。

集中回归：新夹具7项、原direct/handoff/static/格式守卫通过；static16项中1项无真实站点捕获而跳过。原Linux-only lifecycle7项在只读network=none测试容器通过，Windows缺fcntl原始失败保留。源码及独立副本完整tsc通过，核心137项在baseline/modified/restored分别通过。独立副本8文件原哈希/原不存在状态恢复，装配探针false→true→false，可执行ROLLBACK.sh通过语法与hashguard核对；源码及ZIP保留修改版。以上不关闭A19，总目标ACTIVE。
