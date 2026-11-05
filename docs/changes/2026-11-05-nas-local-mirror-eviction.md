# NAS 已确认媒体的本地副本回收（2026-11-05）

## 背景与结论

47 根分区 96%（69G 中 63G 已用，可用 3.1G）。逐文件对照 `app_media_assets`：本地 `/opt/naumi-staging/data/media` 共 44,092 个文件 / 37.04 GiB，**100% 已 `remote_ready=true` 且字节数一致**，补传队列 0；其中 28.56 GiB 为最近 7 天写入。

根因：`NAUMI_NAS_DEFER_UPLOAD=1` 时新对象先落本地（`object-storage/runtime.ts` writeStoredObject），`media-assets/mirror-recovery.ts` 补传成功后只置 `remote_ready=true`，从不回收本地副本；10-20 NAS 迁移的“删除本地重复副本”门禁也从未执行。结果是每个对象本地与 NAS 各一份，本地盘约每天 +4G。可用空间低于 4GiB 后写入已自动改为远端优先（生成响应需等隧道），隧道异常时的本地兜底可能写满磁盘。

## 模块与职责

- **媒体资产模块（media-assets）**：唯一负责本地副本生命周期。新增 `media-assets/mirror-eviction.ts` 的 `evictVerifiedLocalMirrors()`，由既有 `recoverMediaMirrors()` 在同一 `media-mirror` 单飞后台通道内、补传之后调用；回收失败只告警，不影响补传。
- **对象存储读取（object-storage/managed-read.ts、media/response.ts）**：本地副本在“已校验存在”与“读取”之间被回收（ENOENT）时，对 NAS 已确认的对象回退 NAS 原件，不再返回错误/404。

## 公共接口、依赖方向、数据/状态/事务归属

- `evictVerifiedLocalMirrors({scan?, readbacks?, retentionHours?})` → `{scanned, evicted, bytesEvicted, absent, deferred, mismatch, remoteUnconfirmed}`；`localMirrorRetentionHours(env)`：未设 48 小时，`off` 关闭，非法值回落 48。环境变量 `NAUMI_NAS_LOCAL_MIRROR_RETENTION_HOURS`。
- 依赖：media-assets → object-storage（`fetchStoredObject`、`MEDIA_DIR`、`safeKey`）、platform/db。无反向依赖。
- 数据：`app_media_assets.local_evict_after timestamptz`（仅扩展，可空）：NULL=尚未检查；未来时间=领取/重试；`'infinity'`=本地已无副本。部分索引 `app_media_asset_local_evict_idx`。`registerMediaMetadata` / `registerOriginalWithPreviewsTx` 冲突更新时重置为 NULL，重写的 key 重新进入检查。旧槽不认识该列，读写不受影响。
- 回收条件（缺一不可）：`remote_ready`，创建超过保留期，本地为普通文件且大小=目录字节数，本地 SHA256=目录 SHA256，NAS GET 全量读回 SHA256 与字节数一致，回收前 ino/size/mtime/ctime 未变。领取用 `FOR UPDATE SKIP LOCKED` + 领取时间戳 CAS；NAS 读回在事务外。每次扫描最多 200 行、5 次 NAS 读回；超预算行置 NULL 下次继续；NAS 不一致/缺失 60 分钟后重试；本地与目录不一致 24 小时后重试且**永不删除**。
- 不删除目录行、NAS 对象、目录树、数据库或卷；不调用供应商、不涉及计费。

## 本次实现与迁移状态

- 代码：`src/lib/media-assets/mirror-eviction.ts`（新）、`mirror-recovery.ts`、`writer.ts`、`media-assets-schema.ts`、`object-storage/managed-read.ts`、`media/response.ts`。
- 运维工具：`scripts/ops/nas47_media_dedupe.py`（47 一次性清理所用同一文件，SHA256 前缀 `a8ffba5deeb8c8f7`）。
- 迁移状态：代码在 `codex/nas-local-mirror-eviction`，**未发布**。47 仍为“维持配置、合并后暂缓发布”，线上程序仍是 `6eddec90`，新回收逻辑在下一次获授权的蓝绿发布后才生效；在此之前本地副本会继续增长（约 4G/天），需要按需重复一次性清理。

## 47 一次性清理（已执行，2026-11-05）

用户授权“依次执行”。工具 `scripts/ops/nas47_media_dedupe.py`，证据目录 `/opt/naumi-staging/evidence/media-dedupe47-20261105/`（`pilot/`、`full/`：`verified.jsonl`、`retained.jsonl`、`evicted.jsonl` 含逐文件 INTENT/DELETED、`EVICTION_RESULT.json`、`df-before.txt`）。

- 先压缩已轮转的 nginx `access.log.1`（634MB→122MB，解压 SHA256 一致后删原文件）并 `apt-get clean`（112MB），持三锁 28 秒：3.1G→3.6G。
- 校验（只读、不持锁，systemd 临时单元，nice/idle IO）：只取 48 小时前写入的文件；要求目录 `remote_ready`、字节数一致、本地 SHA256=目录 SHA256=NAS GET 全量 SHA256，且过程中文件未变。不存在 key 的 NAS 探测返回 404（确认失败路径可识别）。
- 试点：均匀抽样 200 个，200/200 通过；删除 200 个/167MB，删除后 /media 无 5xx、Web 日志无读取错误。
- 全量：43,665/43,665 通过（39,214,324,468 字节），not_ready/catalog_mismatch/nas_missing/nas_error/nas_mismatch/changed/error 全为 0，耗时 2,185 秒。
- 删除：88 批 ×≤500，每批持三把 47 部署锁、重读目录、重验 ino/size/mtime_ns 并重算本地 SHA256，fsync INTENT→unlink→fsync DELETED，批间释放锁 3 秒。结果 deleted=43,665、bytesDeleted=39,214,324,468，retained 全为 0；INTENT 与 DELETED 各 43,665 行。
- 结果：根分区 96%/3.1G 可用 → **40%/40G 可用**。本地媒体剩 686 个文件/662MB（48 小时内新写入，保留作 NAS 故障兜底）。删除后 `/media` 122×200、1×499（客户端断开），全站 5xx 为 0，Web/Worker 无 ENOENT/读取失败日志；Web、Worker、DB、site-control 容器与恢复/看门狗定时器正常。
- 未动：数据库、卷、NAS 对象、目录行、Docker 镜像/容器（6 轮中最旧一轮仍被 current.json 回滚引用）、发布证据、Hub 资源。没有发布、没有改配置、没有调用供应商。

## 验证命令、结果及证据层级

本机隔离 PostgreSQL 16（临时目录、127.0.0.1:65441）+ 本机 HTTP NAS 夹具，`NODE_OPTIONS=--conditions=react-server`：

- `scripts/verify-media-mirror-eviction.ts`：33 项 PASS（未确认不回收、保留期内保留、超期读回后回收、回收后读取与 /media 路由走 NAS、完成行不重扫、NAS 字节不一致/404 保留并延后、本地损坏保留、读回预算、关闭开关、重注册重置、双扫描器各回收一次）。
- 变异验证：去掉 NAS 读回 → 失败于“aged copy evicted after NAS readback”；去掉本地 SHA → 失败于“corrupt local copy retained”。恢复后重新 PASS。
- 相邻回归：`verify-p0-nas-delivery.ts` PASS、`verify-p0-media-recovery.ts` PASS、`verify-storage-resilience.cjs` 20 项 PASS。
- `tsc --noEmit` 全量 exit 0；变更文件 eslint exit 0。
- `scripts/verify-refactor-runner.mjs` 在本机 exit 1：写死 `D:/DEV/Git/bin/bash.exe`，未改动的基线同样失败，属环境问题，未计为通过。
- 证据层级：隔离 PG/HTTP 夹具；未构建发布镜像、未在 47 上运行新代码。“检查→读取之间被回收”的竞态回退为代码审阅，没有确定性竞态测试。

## 未完成项与下一步

1. 获授权后按蓝绿流程发布本修复（47 发布前仍须先解决磁盘余量 ≥10GiB 的门槛——本次清理后已满足）。
2. 发布后核对 `local_evict_after` 推进、`MEDIA_MIRROR_EVICTION_DEFERRED` 告警数量与磁盘曲线。
3. nginx 日志约 600MB/天（高频轮询接口），可另行评估去掉 `delaycompress` 或不记录轮询接口，需授权改服务器配置。
