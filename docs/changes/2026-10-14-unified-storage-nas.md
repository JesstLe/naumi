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

## 协作审查补齐（模块一后续）
对端审查指出remote_ready在配置切local时的SHA/local版本冲突及deleteImageByUrl抛错的fire-and-forget回归，已修复并新增隔离DB配置回退测试：保留remote_ready=true的原图/thumbnail/preview三项清单→GET200通过。代理清单附SHA cacheVersion；新版200/旧版409和断网下载文件名通过。db删除、工作流/竞品导入回滚明确catch并记录无秘密固定pending日志，底层未知异常仍保留。

任务分支已push d3876a9并合origin/main28c646e（整合SHA4f55b48）；main尚未合入本任务。首次本任务build exit0、编译/88页通过，但父checkout与独立依赖导致ESLint插件冲突告警，不能称Lint通过。后续修复仍需重新最终构建。

独立rollback-copy355c428已应用任务补丁后执行ROLLBACK.sh，输出ROLLBACK_PATCH=PASS、git diff exit0；最初bash路径错误导致回滚未执行，已更正为D:/DEV/Git/bin/bash.exe并实际完成，不用此前普通读取成功冒充代码恢复。

## 企业目标最新指定
用户经协作会话补充：企业NAS用于47.105.59.142。仅47独立部署配置启用S3/proxy；103现有存储配置和媒体不改。本轮不部署、不迁移、不启动或开放47 Naumi。已阅读大陆站准备交接：Naumi仍为私有准备且App/Worker未启用；原Python参考工作台独立运行，TS适配层不覆盖或宣称已适配那个服务。NAS endpoint/桶/凭据/常开网关网络待核验；IP不进入业务代码分支。

最终集中检查追加同key实际更新的三变体旧清单409、新清单200与SHA相等；真实db.deleteArtwork+远端403验证无unhandledRejection，输出STORAGE_CLEANUP_PENDING。NAS503也可读镜像。独立ESLint实际exit0（任务受影响文件）、tsc exit0；Next15.5.27 --no-lint构建单独通过88页，lint不是跳过后冒称。后续新增修复需最后一轮构建。

## 正式端到端位置与当前验收口径
用户进一步指定“到时候端到端测试也是去47服务器”：47.105.59.142为企业NAS正式E2E环境。本机MinIO/DB/Chromium只计开发回归，不替代47真实NAS。待47应用和NAS独立部署配置就绪后，覆盖真实上传/生成保存、画布/作品原图与变体、重开/刷新缓存、下载/ZIP、参考图、账号隔离与NAS异常回退。收费模型测试按届时已确认的47消费约定执行；不测试103生产写入，不覆盖47原参考工作台。本轮47真实E2E未执行，保持待验收，不以目标站指定自动部署。

## 可重跑的开发验收命令
一次性MinIO（只绑定回环19374，fixture-only凭据）和PostgreSQL（回环19375）由本任务Docker容器提供，无生产挂载：
```powershell
$env:DATABASE_URL='postgresql://fixture:fixture-only@127.0.0.1:19375/fixture'
$env:NAUMI_VERIFY_ISOLATED_DB='1'
npx tsx --conditions react-server scripts/verify-unified-storage.ts
npx tsx --conditions react-server scripts/verify-storage-minio.ts
npx tsx --conditions react-server scripts/verify-storage-nas-proxy.ts
npx tsx --conditions react-server scripts/verify-storage-local-rollback.ts
npx tsx --conditions react-server scripts/verify-private-media-db.ts
node scripts/storage-s3-contract.mjs
npx tsc --noEmit
```
真实S3测试固定为本机独立fixture endpoint，不读取生产存储env。私有/回退测试使用随机隔离schema，结束清除；容器验证后删除，不保留测试服务到生产。

## 最终验收范围与交付
固定实现提交19a2da3；此前374e518与7b4d8ff包含协作修复，普通整合最新main d6f53dc，无业务冲突。本地写入也走统一适配器；真实MinIO签名PUT包含Content-Type/Content-Length约束成功。

集中协议/应用回归、配置切local三变体、同key更新三变体409→200与摘要、异步清理403无未处理拒绝、独立类型和受影响文件ESLint通过。Chromium缓存与团队/企业回归的真实通过记录见上文；未改浏览器缓存算法及稳定ID。固定Next生产构建单独使用--no-lint避免父目录依赖冲突，实际lint单独exit0，不能把构建参数解释为全库lint已通过。

文档/配置示例和代码交付满足本轮开发范围；47企业NAS E2E、真实NAS网关、生产数据迁移/部署均未执行，后续按用户明确指令开展。103存储未改、原Python工作台未改。

提交/推送与main整合另附实际SHA；合main只让后续构建带上代码，不代表已上线。同步功能计数本模块1，合并前fetch并整合main后归零；成功发布次数0。
