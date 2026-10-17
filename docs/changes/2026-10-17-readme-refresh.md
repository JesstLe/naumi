# README 按当前 main 更新

## 范围与基线

- 日期：2026-10-17。
- 开工已 fetch origin/main，源码基线 `a6a87ec4`。
- 独立分支 `codex/readme-latest-20261017`，独立 worktree；共享目录 `codex/admin-ui-modernization` 的其他同事未提交内容保持原样。
- 本轮只更新 README 与本记录；不修改业务源码、配置、依赖、数据库、镜像、服务器或公开更新目录。

## 核对与修正

| README 内容 | 核对来源 |
|---|---|
| Next.js 15.5.27、React19.3.0、React Flow12 | package.json、package-lock.json |
| Node24 与独立 FFmpeg 媒体运行环境 | Dockerfile |
| 当前28个工具入口、品牌包装策略、参考工作台名称 | src/lib/tool-meta.ts、src/app/tools/packaging-strategy/page.tsx、src/app/batchshot/page.tsx |
| 统一图像计划、能力校验、参考图角色/画幅、移除重复创作面板 | src/lib/imagegen/、2026-10-17对应变更记录 |
| 视频节点Dock和媒体任务 | src/components/video/、src/lib/video/media-job-schema.ts、视频Dock变更记录 |
| 通道/已配置模型健康、6h/全系统12次上海自然日预算、独立Worker | src/lib/model-health/contracts.ts、targets.ts、service.ts、scripts/model-health-worker.mjs、deploy/model-health-worker.compose.yml |
| 元数据独立实测证据及人工优先 | src/lib/supplier-models/imagegen-observations.ts、imagegen-access.ts |
| 账号隔离的浏览器图片字节缓存 | src/components/cached-image.tsx、src/lib/browser-image-cache.ts |
| db/app/video-worker/media-worker四服务与pgdata/appdata/mediajobs卷 | docker-compose.yml |
| 安装器生成三把独立密钥，npm预处理与框架修补 | install.sh、package.json、scripts/patch-next-body.mjs、build-reference-workbench.mjs |
| 发布生命周期、Worker交接、真实排空与候选/上线区分 | docs/RELEASE_LIFECYCLE.md、src/lib/release-runtime/、scripts/video-worker.mjs、.github/workflows/docker.yml |

## 图片与状态边界

- 保留已有2026-10-13真实截图和manifest，不裁切、不生成新图，不把旧图片改称最新版。
- 明确旧工具中心图片27项与当前源码28项的区别。
- 不把同事未合入工作、历史fixture或其他站点结果写成当前全站已启用。
- 本轮没有实时连接服务器，不更新各实例当前版本，不声称整站排空或无感发布已经完成。
- 公开更新目录仍按自身维护规则，本轮文档维护不新增面向用户的已发布功能条目。

## 验证与交付

集中检查 README 相对链接、锚点和图片文件，package/lock依赖版本、Docker Node版本、工具目录数量、默认Compose服务/卷、环境字段与npm脚本，以及git diff空白检查。文档变更不执行付费供应商调用、不启动业务Worker或进行全量业务构建。

本地忽略证据目录 `output/readme-refresh-20261017/` 保留原文SHA、修改后副本、DIFF_FILE、VERIFICATION.txt和可执行ROLLBACK.sh；回滚仅在另一个副本恢复原文，不改当前README。共享checkout未切分支、未暂存他人文件。

这是文档更新，不增加功能迭代或发布维护计数。提交前再次刷新origin/main；如远端变化，在任务worktree整合并重新集中核验，不覆盖同事源码。
