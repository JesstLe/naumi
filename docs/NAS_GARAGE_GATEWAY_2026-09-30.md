# Naumi 公网服务接入 NAS Garage 存储网关

## 当前状态

- NAS 上运行 Garage `v2.4.1`，镜像固定到已验证的 amd64 digest。
- Garage 只监听 NAS 本机 `127.0.0.1:3900`，未开放路由器公网端口。
- NAS 使用受限 SSH 反向隧道，把 Garage 暴露为 Naumi 主机 Docker 网关 `172.17.0.1:3900`。
- 公网主机的授权密钥仅允许端口转发，并限制监听地址及端口，不能登录 shell。
- 隧道由 NAS 监督脚本保持，DSM 任务计划当前每小时整点检查一次；监督脚本为 SSH 设置 10 秒连接超时，避免卡死进程长期误占 PID。
- Naumi 使用通用 S3-compatible 配置，不写死 Garage，后续可以切换 MinIO、OSS、COS 或 R2。

## Naumi 配置

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=http://172.17.0.1:3900
S3_REGION=garage
S3_ACCESS_KEY_ID=<local secret>
S3_SECRET_ACCESS_KEY=<local secret>
S3_BUCKET=naumi-media
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=
```

`S3_PUBLIC_BASE_URL` 为空时，应用仍返回 `/media/<key>`；读取由 Naumi 的媒体路由代理完成，浏览器无法直接访问 NAS，也不需要公开 bucket。

## 故障边界

- 隧道或 NAS 离线时，新上传会返回存储错误，不会静默写入公网服务器本地媒体盘。
- Garage 容器使用 `unless-stopped` 自动恢复，NAS 隧道另有监督脚本和 DSM 看门狗任务。
- PostgreSQL 仍保留在公网服务器本地磁盘，NAS 只保存对象数据及 Garage 元数据。
- Tailscale 在当前办公网络无法连接其控制面，最终网关链路未依赖 Tailscale。

## 已验证

- S3 Put/Get/Delete 通过。
- Garage 容器重启后对象仍可读取。
- Naumi 容器可访问 `172.17.0.1:3900`。
- 回滚脚本在独立 fixture 容器上通过，生产 Garage 保持运行。
- SMB、Synology Drive、Container Manager 保持运行。

## 应用接入实现

- `src/lib/storage.ts` 已支持通用 `STORAGE_DRIVER=s3`，覆盖上传、读取、HEAD、Range 与删除。
- `/media/<key>` 在 S3 模式下直接流式代理 Garage 响应，不再把整张图片读入 Node Buffer 后再返回。
- 画布引用、竞品分析、套图下载、视频抽帧与模板缓存均通过统一存储接口读取，切换 Garage 后不依赖本机 `MEDIA_DIR`。
- `scripts/verify-storage-driver.ts` 对本地盘及真实 S3 网关执行上传、读取、Range、删除闭环测试。

## 不影响现网的迁移方式

生产应用在迁移期间继续使用 `STORAGE_DRIVER=local`，旧媒体卷保持原样，不边迁移边切换读取来源。后台复制改用固定版本的 rclone，并施加四层约束：

- 单传输、单检查器，带宽默认限制为 `96K`；
- 容器限制为 `0.15 CPU / 128MB RAM / 192MB RAM+Swap`；
- 每 15 秒检查一次 Naumi 本机健康、可用内存和系统盘；连续两次健康失败或资源不足会自动停止；
- 可用内存保护线默认约 `180MiB`，可通过 `MIN_AVAILABLE_KB` 调整；
- 迁移容器无重启策略，服务器重启后不会自行继续。

服务器执行：

```bash
bash scripts/run-storage-migration-safe.sh prepare
bash scripts/run-storage-migration-safe.sh start
bash scripts/run-storage-migration-safe.sh status
```

复制可重复执行，Garage 中尺寸相同的对象会跳过。后台全量复制完成后执行：

```bash
bash scripts/run-storage-migration-safe.sh verify
```

验证通过后再做一次低峰增量同步；只有增量与尺寸核对均通过，才短暂重启应用并切换 `STORAGE_DRIVER=s3`。切换前不删除服务器原媒体卷，回滚时恢复本地驱动即可。

低峰增量命令：

```bash
bash scripts/run-storage-migration-safe.sh incremental
bash scripts/run-storage-migration-safe.sh verify
bash scripts/run-storage-migration-safe.sh rollback-check
```
