# 47 聊天生图：Geeknow 图片出口修复（2026-10-15）

## 根因与事实
- 用户确认“生成小猫”后，`chat-image/confirm` operation `5e1e0036-8b81-42af-be69-deabdc7a83ea` / child `job-d8674744-086e-4192-bc3e-963f1477a812` 失败，原任务账务settled/charged0。
- PromptHubs香蕉主通道403，Geeknow备用POST200且supplier ledger delivered1/usage1447 image output tokens。错误出在completedChannelImage接收结果，而不是文字规划。
- 原先仅把Geeknow API源 `https://www.geeknow.top` 加入现有代理名单，历史aicost.me图片可直连；本次实际响应改用 `https://r2.geeknow.ai`，47直连超时。
- 一次受控原生single诊断捕获200原响应；没有改用户已取消的第一条计划。相同生成图片URL：原生modelEndpointFetch直连ETIMEDOUT；只增加该精确origin到现有MODEL_CONFIG_PROXY_ORIGINS后200、789565字节、1024x1024真实sharp像素解码通过。下载验证不再POST生成。

## 最小修复
- 字段仅 `MODEL_CONFIG_PROXY_ORIGINS`：保留 `https://api.apimart.ai,https://www.geeknow.top`，增量追加 `https://r2.geeknow.ai`。
- 不扩大trusted origins，不改DNS/私网校验、重定向规则、TLS、供应商密钥、渠道权重、模型v114、计费v8、原失败操作及未知任务保护。
- 原生API与全站主要App分别原镜像克隆、同env（仅上述字段不同）、同挂载/网络/静态overlay；先旁路真实功能验收，再持三锁平滑切流。登录13063与legacy17847保持。
- `.env.example` 增加可复用配置说明，避免后续重建漏掉图片域；不是让所有实例默认走47代理。

## 验收/回退计划
- baseline、modified、rollback用同一已生成图片URL测试，无再次供应商POST；独立配置副本ROLLBACK.sh真实还原原SHA，MODIFIED_FILE保持新增origin。
- 真实原生聊天验收使用用户报告的第二条失败消息；仅确认其旧图像操作已终态/charged0后CAS恢复计划，再以新报价/新operation进行一次受控图片生成，原失败operation保持不可变。用户已取消的第一条消息保持取消，不自动恢复。
- 发布前备份可读、精确gateway hash、镜像/配置核对；最终健康、真实像素落库、账本一次、刷新/重新查询不重复生成、匿名私图401、原会话桌面截图。
- 本文初版为计划，发布结果后补。独立任务分支 `codex/chat-image-output47-20261015` 从前轮4a30cdc建立；origin/main仍daf72b2；全部远端已刷新。本任务不连接103/120/179/101。

证据目录：`E:/Workspace/naumi/output/chat-image-output47-20261015/`。原图片响应/私有签名URL只保留受保护服务器证据，不写源码或普通日志。

## 实际上线及用户原会话闭环（15:09后）
- 已发布：core `naumi47-r2-image-main-20261015` /13068，native `naumi47-r2-image-native-20261015` /13069。各自与原路由使用完全相同Image ID（c952f4a… /407f017…），完整env对比仅MODEL_CONFIG_PROXY_ORIGINS增量一个origin；挂载/网络/静态overlay保留。全站/原生两槽同一原图真实GET+解码通过后平滑切流，登录13063和legacy17847保持，旧App不重启。
- 用户已取消第一条猫计划，保持取消。第二条消息（原失败操作5e1e0036…）经精确终态/settled0账务核对、行锁+CAS恢复计划，旧操作与失败记录不动，retryHistory保留旧失败；通过原生quote/confirm接受新的operation `61c06f53-b52f-431b-b59d-8076ecd5deb9`，报价12。
- 本次真实生成成功：`art-job-c92688be-64dc-48ea-a690-59f10d458f14-0`，原图2048×2048 /9,694,235字节，私有媒体持久化；原会话状态done。账本1笔12积分，旧失败0，重复接受2次/反复查询没有新供应商调用或第二笔账务；匿名取图401。
- 主PromptHubs403仍存在，supplier未知费用证据保持；Geeknow备用同次任务200并成功接收/解码，未把主通道也写成已修好。
- 真实浏览器1440/390解码、重载恢复、pageerror0、浏览器新增生图0通过；桌面原会话截图和最终实际小猫均已打开检查。手机保留既有窄布局，不作移动布局改善声明。
- 三锁覆盖备份→两槽旁路→切流→用户原会话真实生成→浏览器验收。399次健康采样0错误、模型v114完整指纹保持、备份pg_restore --list可读、所有原容器保持。最终健康通过、三锁FREE；只读诊断候选已停止，无诊断capture代码进入正式两槽。
- 真实网络证据需区分：直连R2是间歇性失败，不是每次必败；初次baseline和fresh rollback ETIMEDOUT，但后一次fresh baseline曾200。代理样本及两个正式绿槽均200；配置独立副本按SHA确实恢复旧直连分支。首次Linux rollback脚本CRLF已改LF，重新上传并执行通过。
- 本轮真实消费：一次受控single诊断调用在旧下载器失败后客户账务0；随后一次正式原会话生成按已接受报价12结算；各次备用供应商成本保留在supplier账本，不伪造“没有真实供应商调用”或自动补积分。
- 配置四制品、命令/原样输出/退出码/回退：`E:/Workspace/naumi/output/chat-image-output47-20261015/VERIFICATION.txt`；实际原图同目录native-kitten.png，最终交付必须内嵌该已核验文件。服务器guarded回退 `/opt/naumi-staging/evidence/chat-image-output47-20261015/LIVE_ROLLBACK.sh`只切入口，不恢复DB或删除新作品。
- 源码/说明已推本任务分支dab6924；此补充另提交。功能迭代从前轮1→本轮2，origin/main仍daf72b2；本轮成功配置发布增量+1，保留原累计未知说明，不虚填站点总计；52%/32GiB空间充足，没有删除他人构建或业务数据。
