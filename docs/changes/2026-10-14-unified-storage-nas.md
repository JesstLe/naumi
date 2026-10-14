# 统一存储与 NAS S3 网关实施记录

## 目标与边界
复用统一 local/R2/S3 实现；NAS通过经验证S3网关接入，不引入企业专用业务分叉。本轮仅代码、隔离验收与Git整合，不部署、不连接生产、不迁移媒体。

## 开工状态（2026-10-14）
- origin/main：355c428，已fetch。
- 分支：codex/unified-storage-nas-20261014。
- 独立副本：E:/Workspace/naumi/output/unified-storage-nas-20261014/worktree。
- 共享checkout干净，未切分支、覆盖或stash他人代码。
- 存储已提供 uploadImage/writeStoredObject/fetchStoredObject/readManagedObject/managedObjectExists/deleteImageByUrl/presignStoredObject。
- R2与S3共用aws4fetch，NAS无需专门SDK。私有图片先写本地镜像，注册媒体资产及512/1600变体；remoteReady后鉴权路由签短时URL。
- /media访问在media-assets执行账号授权；私有模式读取优先镜像。IndexedDB与稳定key/路径不能随适配调整变动。
- 关注问题：fetchStoredObject仅remote、local流式读取在路由单独实现；exists把403/网络异常当false；delete远端不处理本地镜像；错误配置可能自动退回local；私有NAS endpoint对浏览器不可达时307需代理策略。
- 本机Docker可用；已有MinIO隔离服务镜像，尚未启动验收。

## 下一模块
1. 完整盘点调用链及既有测试，确定最小接口/配置与远端访问策略。
2. 保持兼容门面，抽离可注入适配器和配置解析；失败状态不伪装对象不存在。
3. 本地/HTTP fixture与真实隔离MinIO契约，Range/签名/错误及独立回滚。
4. 不含秘密的NAS部署示例、接入/回退指南；企业NAS实际环境待验收。
5. 选择性提交、push，刷新main再整合验证；Git合main不等于上线。

## 同步计数
开工同步前origin/main634b895，同步后355c428。本任务已完成功能模块0；没有发布计数变化。

## 模块一实现与集中验收
- 统一ObjectStorage接口已提供put/get（流式和Range）/exists/delete/presign；local、R2、S3用同一门面。SDK只在协议适配层。
- 集中配置解析支持显式驱动、endpoint无凭据校验、bucket/path-style与代理模式校验；不完整自动配置不静默写local。显式远端不完整仍storageEnabled=false，操作拒绝。
- 新MEDIA_REMOTE_ACCESS=proxy贯通/media、图片缓存授权清单、禁用浏览器内网直传；默认redirect保留R2行为。remote_ready失败仍从镜像读；NAS断网无镜像返回503，账号校验前不发远端请求。
- SHA/稳定key/变体/账号缓存身份不改；远端代理版本不套local mtime。删除只有远端确认后才清镜像；HEAD403/5xx/网络失败不会变成false。
- NAS部署文档说明个人电脑非运行依赖、常开网关、私有访问与受控上游参考图、迁移和回退门槛。
- 本机隔离MinIO：真实PUT/GET/HEAD/Range206+416、签名GET+PUT、匿名403、DELETE后404通过。独立PostgreSQL+实际应用路由验证账号/原图和变体SHA/大小、缓存清单代理URL、断网镜像、无镜像503、Agent内联参考图及越权拒绝通过；模型调用0。企业NAS=未测试。
- 现有私有R2上传/变体/账号拒绝/重放/不可改写正式key回归通过（HTTP fixture）。local/R2签名、权限与未知费用无关；没有真实供应商调用。
- Chromium真实IndexedDB集中回归通过：冷1、重开/刷新/浏览器重启0，原图/ZIP字节一致、版本失效、账号与多标签退出、迟到写入、LRU/配额、鉴权失败回退；团队/企业媒体scope拒绝与真实WEBP/授权撤销/409也通过。
- 环境准备问题：共享node_modules是Next14/React18，首次类型与React-server导入失败，已删除仅本任务junction并按本任务lock npm ci安装Next15.5.27/React19.3，再次tsc exit0；第一次Chromium默认1243不存在，改为既有1217实际运行通过。不修改共享依赖。
- 待完成：最终配置与协议集中复测、固定构建、独立基线/回滚copy、最新main整合和推送。没有生产连接或发布。
- 本模块完成1/3，开工SHA355c428；最终整合时刷新main后计数归零。
