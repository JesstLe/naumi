# 画布清晰度修复 r7 发布

模块与职责：画布媒体表示选择；47 站固定 Web/Worker 蓝绿发布。

公共接口、依赖方向、数据/状态/事务归属：`canvasMediaVariant(screenWidth, pixelRatio)` 按设备像素选择表示，画布组件消费此规则；原始素材和生成任务归属不变。部署沿用原三锁会话、生命周期 CAS 和逐操作回执，不重放已受理任务。

本次实现与迁移状态：
- 主线固定提交 `712b0a70b8c887c3eaa457da3181baf1d2c79a91`，构建版本 `1794018574`。
- 镜像 `sha256:0660641b5070f303061753ef74bf4e656f090f30272124b38ff268f2a0a508a6`。
- 画布节点不再选择 512px 缩略图；显示宽度超过 400 设备像素使用原图，其余使用 1600px 预览。角色、场景、导演卡片恢复原图。4 倍采样是选择策略，不代表已证明所有图片视觉无损。
- 企业页面恢复 `private, no-cache`，保留认证及回源 ETag 校验。
- 接续中断的 `release47-main-20261107-r7` 会话，从步骤 06 开始；前五步没有重跑，备份和供应商任务没有重放。

验证命令、结果及证据层级：
- `drive47.py step 06-affected-acceptance ...`：候选/前任各 120 次画布节点 GET 全部 200，序列化错误 0；企业页面 200 后带 ETag 请求为 304/0 字节；账户用户视图 231 字节；工作台状态 200。
- 步骤 07 保存八张表原始任务身份及供应商绑定快照，供切后核对；不声称完整行字节不变。
- 步骤 08 平滑切流、旧 Worker 排空；步骤 09 新 Worker 完成一次真实扫描回执，无未知 tick。
- 原始证据：服务器 `/opt/naumi-staging/evidence/release47-main-20261107-r7/`；本地 `E:/workspace/naumi/output/release47-main-20261107-r7/`。

最终验收（2026-11-07 10:46 CST）：
- 本轮 `reconciledMainReleases[release47-main-20261107-r7].phase=COMPLETE`；保留旧生命周期历史字段，不把旧历史状态改成新的完成记录。
- r6 长连接等待约 219 秒后排空；transport、admission、observations、owners、unfinishedActivities、domain、worker 全部通过，两次排空证明后停止旧 Web/Worker，restart=no。
- 步骤 11：八张表原始身份/供应商绑定均保留；用户自然新增图片任务 4、供应商调用 2、计费操作 2、账本 2；模型/计费配置 hash 不变。
- 步骤 14：公网 60 次节点 GET 全部 200，序列化错误 0，公网完整版本匹配；JSON gzip 保持。此探测走公网 vhost，但未验证 TLS 证书链。
- 步骤 16：新 Worker 已完成 17 次扫描；未知 tick/活动、遗留未完成活动、长空闲事务、锁等待均为 0。恢复监督绑定同一镜像的新 Web/Worker，并重新启用 timer。
- 步骤 17：仅移除已停止、restart=no、无其他容器引用的 1106-r2 Web/Worker 及镜像，保留 r7/r6/r5/r4/r3 五轮。服务器磁盘 58% → 57%，约 29 GiB 可用；本地 C 约 71.6 GiB、E 约 156.5 GiB 可用，本轮没有删除本地构建产物。成功发布本轮 +1，累计计数未从历史可靠恢复，未擅自归零。
- 10:47:03 发布会话记录 `LOCKS_RELEASED`；恢复监督服务随即执行成功（exit 0），timer active，三锁同时非阻塞获取成功。证据见本地 `postflight.json`。
- 交接文档在独立分支 `codex/r7-release-record-20261107` 编写；同步主线至 `e0baa029ad5c5af5bcd41be4fdf4a5a4c4c57fdc`。切流后新合入的 Agent Gateway 不在本次固定镜像内，不作为已上线能力。

未完成项与下一步：此次续接没有主动新增收费生成，也没有完成用户真实素材的浏览器视觉对比。工作日全天性能/错误率对比、账户读路径写库、数据库统计扩展仍按原模块记录跟进。
