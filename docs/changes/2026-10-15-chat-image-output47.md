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
