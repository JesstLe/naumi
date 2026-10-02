# AI Gateway 生产验收 — 2026-10-02

已使用固定版本镜像与 `scripts/deploy-release.sh` 协调发布。维护入口、停 worker、核对旧付费任务、完成冷备后先装 Router，再启动 App 验收，最后恢复 worker 和 Nginx。

| 项目 | 结果 |
| --- | --- |
| App 固定提交/镜像 | `4260aec8092ffeabf525f77b941934498ebbc8a3` |
| Router 提交/运行版本 | `849b016f08a683a301f5608b65aece7db4fc117e` |
| 公网 `/api/version` | `1790954737`，工作站直接 HTTP 验证 |
| 健康/运行 | 数据库、存储和图片配置健康；App/DB/视频 worker 运行；Router/New API active |
| 页面 | 首页、生图、画布、套图、A+、视频均 200 |
| 有效匿名付费请求 | 生图、画布、套图、A+ 均 401，没有供应商调用 |
| 模型目录 | New API 与 Router 的 auto/economy/standard/premium 一致 |
| 配置/媒体 | 环境及供应商价格保持；`naumi_appdata` 保留 |
| 数据数量 | 停机前后用户 74、作品 1926 |
| 执行账本 | `/var/lib/naumi-gateway/router/operations.db`，0600，服务账号所有 |

Naumi CI：[37026793555](https://github.com/JesstLe/naumi/actions/runs/37026793555)。固定镜像：[37026790606](https://github.com/JesstLe/naumi/actions/runs/37026790606)，digest `sha256:ed6a70b33fa8c10d8a61491f595a70686965df3cc4be6c40a6c6a3b405c26025`。Router race/vet、配置权限回归及二进制 CI：[37028561408](https://github.com/JesstLe/naumi-router/actions/runs/37028561408)。服务器隔离环境已用实际 New API + Router + 模拟供应商验证 JSON/multipart；没有真实付费供应商实测。

备份：`/opt/naumi/backups/gateway-20261002T151424Z`，包含 PostgreSQL、SQLite、一份 5.9G 媒体备份、停机数据库和按 mtime/ctime 收集的媒体增量、环境及 Nginx。归档读取和校验通过。`/opt/naumi/ROLLBACK_RELEASE.sh` 与备份中的 `RECOVER_APP.sh` 通过 `--check`。回滚 App 时保持维护和 worker 暂停；已有账本任务不能换回忽略账本的旧 Router。网关冷备和服务单元备份保留于 `/opt/naumi-gateway/backups`。

生产 App：`/opt/naumi/releases/4260aec8092f-20261002-234110`；网关：`/opt/naumi-gateway/releases/849b016f08a6-20261002T154103Z`。后续文档提交不改变这两个已部署代码版本。

当前只有一条 APIMart 生产路由，默认模型仍 `gpt-image-2`。能力过滤、规则分类、规格估价、并发及熔断已具备；更多上游和实际节省需要核实价格与质量后接入。其余直接 SDK 工具尚未全部兼容 Router，此次未全局切换。New API 的内部额度重放仍可能重复记账，保持私有网关。

原独立只读媒体迁移容器 `naumi-media-migration` 在发布期间结束，退出码 2，无捕获日志；本次未改动或重启它。媒体卷和备份完整，迁移任务需要独立排查。本地忽略目录 `output/gateway-fix-20261002` 保存无密钥发布清单和验收输出；临时 SSH 私钥副本已清理。
