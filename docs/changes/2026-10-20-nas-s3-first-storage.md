# 2026-10-20 存储改为远端优先（S3-first）写入与读取

## 背景

47.105.59.142 已打通到 NAS Garage S3 的反向隧道（docs/changes/2026-10-20-nas-tunnel-47.md），媒体迁移到
bucket `naumi47-media-20261020` 进行中。切换应用存储前，`writeStoredObject` 的"本地镜像优先"会让每个新对象
先落应用盘再尝试远端，47 的磁盘（约 69G，其中业务媒体 38G）无法止涨；私有媒体读取也优先打本地盘。

## 改动（src/lib/storage.ts）

1. `writeStoredObject`：配置远端驱动时**先写远端**，成功即不写本地镜像（remoteReady=true，磁盘止涨）；
   远端失败回退本地镜像（remoteReady=false），付费结果永不丢弃——与旧版相同的兜底不变量，只是方向反转。
   仅本地驱动行为不变。
2. `readManagedObject`：远端驱动下**远端优先读取**，远端 404/异常回退本地镜像（覆盖迁移期与远端短时故障
   期间的本地写入）；本地镜像的"超限/路径非法"类错误不被远端错误掩盖。仅本地驱动行为不变。
3. 新增内部 `readLocalMirror` 收拢本地读取逻辑，原语义（路径穿越防护、大小上限）保持。

## 兼容性核对

- `/media/*` 伺服路由（src/app/media/[...path]/route.ts）已按 DB `remote_ready` 决定远端代理/本地镜像，
  新语义天然兼容：远端成功→代理远端；远端失败→本地镜像伺服。
- `recoverMediaMirrors`（NOT remote_ready 重试）读取路径为远端优先：已在远端的对象读回来后重写远端幂等无害，
  未上远的镜像对象照常补传。
- `ensureMediaVariants` 变体经 `writeStoredObject` 同样远端优先，缩略图不再吃应用盘。
- `importLegacyMedia` 保持 remoteReady=false（不谎报远端就绪），由恢复任务按需补齐。
- presigned 直传仅在 redirect 模式启用；Garage 隧道端点仅容器网可达，47 部署必须 `MEDIA_REMOTE_ACCESS=proxy`。
- 蓝绿回滚：旧槽代码本地优先写回镜像，新槽写入的远端对象旧槽经 ENOENT 回退路径仍可读，双向兼容。

## 47 切流环境（发布时应用，密钥不进仓库）

STORAGE_DRIVER=s3、S3_ENDPOINT=http://172.18.0.1:13947、S3_BUCKET=naumi47-media-20261020、
S3_REGION=garage、S3_FORCE_PATH_STYLE=true、MEDIA_PRIVATE=1、MEDIA_REMOTE_ACCESS=proxy、
MEDIA_DIR=/data/media（本地镜像兜底保留）、S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY 取自
/root/.nas47-garage.json；清空遗留 R2_* 变量。Web 与 Worker 同步设置。

## 验收

- 类型检查与构建通过（本 worktree：npm ci + tsc --noEmit + next build）。
- 发布后验收（另记）：真实登录/画布/生成链路、新对象仅落 NAS、远端 404 回退本地伺服、隧道断开时新写入落
  本地镜像且 remote_ready=false、恢复任务补传成功。

## 关联

- 隧道与凭据：docs/changes/2026-10-20-nas-tunnel-47.md、output/nas47-tunnel-20261020/（忽略目录）
- 迁移与清理证据：output/nas47-ops-20261020/（忽略目录）
