# 创作详情真实 UUID 来源表兼容（2026-10-23）

## 发现与修复

根任务在固定 B3a71c08 Linux 镜像的真实 Web、独立 Postgres、combined Worker 联合验收中发现：Worker 初始化真实 app_imagegen_batches 后，平台和企业创作详情返回 503。来源恢复查询将 UUID 型 b.id 与 text 型 app_creation_links.target_id 直接比较，即使当前创作没有批次链接也会在 PostgreSQL 解析时报 operator does not exist: uuid = text。此前无批次表的库未触发此分支。

只将来源表 ID 转为文本：b.id::text=l.target_id。不反向把多种来源共用的 target_id 转为 UUID，避免非 UUID 链接导致转换失败。查询仍限定 actor 和冻结创作 family，保持只读，不写历史、不调供应商、不重放任务。

同类 JOIN 已按真实 source schema 核对：app_video_workflow_runs.id 是 UUID，已有 r.id::text；app_image_jobs、app_video_tasks、app_canvas_image_tasks、app_artworks、app_billing_operations 的 id 均为 text。本次无需改其他 JOIN 或来源 schema。

## 集中回归

verify-saas-creations.ts 先调用真实 ensureImagegenBatches，再用 PostgreSQL catalog 确认 id 类型为 uuid。修前该脚本首个普通创作详情稳定复现 503；修后完整脚本通过，包括原有权限、撤权、分页、账务及媒体断言。另插入真实 UUID batch/item、待补写素材和同 family 内非 UUID 历史链接，平台与企业详情均 200，准确恢复一个素材。

测试脚本使用既有 127.0.0.1:55439 隔离 cluster，每次新建独立 saas_creation_fixture_* 数据库；未改 saas_admin_fixture 原预览库。调用真实 route handler 和真实数据库，非 Linux HTTP 复验。

证据（忽略目录 output/saas-admin-20261022/verification/）：

- verify-saas-creations-uuid-schema.log：SAAS_CREATION_READER_PASS，real_imagegen_uuid_schema=1、uuid_batch_recovery=1、heterogeneous_link_ids=1，supplier_calls=0。
- verify-video-reference-media-post-head.log：供应商 HEAD 补丁已有回归经 esbuild 打包后执行，309 断言、6 次本机 loopback HTTP，外部 HTTP、数据库和付费调用均 0。测试隔离进程环境补 NODE_ENV=test，解决新合入脚本的 ProcessEnv 类型错误；业务 reference-media.ts 未改。
- types-uuid-source-join.log：正式 tsc --noEmit --pretty false 退出 0，日志为空。

测试包在 ignored output 中编译，只 bundle 纯 JS，pg/sharp/next/react 外置；未修改 Dockerfile、候选元数据或生产设置。

## 未完成与同步

原 B3 联合验收不能记为全通过：13/17 HTTP 组通过；真实 Web tick、combined Worker 重启和双队列排空由根任务取得独立证据。修复后的最终固定镜像全量 Linux build、真实 HTTP/Worker 联合复验、47 旁路/发布均等待根任务执行。本补丁不代表已上线。

这是整合验收纠错，功能同步计数仍 0；当前整合基线 a2f33cbf，未触 main 或发布锁。
