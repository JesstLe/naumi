# 2026-10-17 47 服务器旧容器退役（第一步+第二步完成）

## 摘要

47.105.59.142 完成 7 个旧 Web + 1 个暂停旧 Worker 的证据核验与停止，全程线上无中断。可用内存 **1.44GiB → 4.52GiB**，Swap 占用 257MiB → 约 0。容器、镜像、发布目录回滚材料全部保留，未删除任何资源。锁在操作期间持有，结束后自动释放。

## 退役证据（五轮只读核验，2026-10-17 09:10–09:16）

1. nginx 全量配置（含 `$naumi47_compat_api` / `$naumi47_compat_page` / `$naumi47_auth_login_backend` 三个 map）只引用回环端口 **13100**（新统一Web）与 **17847**（宿主 uvicorn reference-workbench）；无任何配置指向 13052–13073。
2. 24 小时访问日志约 34.6 万条：`/legacy-workbench/*`、`/workbench-history.js`、`/workbench-zip.js`、`/workbench`、`/single`、`/chat-image`、`/login`、`/admin` 零命中；`/api/auth/login`（9 次）与 compat-api（1068 次）均按 map 路由到 13100/17847。
3. 活动连接：13xxx 端口仅 1 条且目标为新 Web；旧端口 0。
4. 应用库（naumi-staging-db-1）唯一连接方为新统一 Web（10 idle）；`app_release_session_owners` 0 行；`app_release_activities` 23934 finished、仅 1 条 unknown（background-promise-unconfirmed，属新 Web）；无任何行归属旧容器。
5. 残留风险声明：旧镜像不暴露排空接口，"进程内无后台工作"由无入口流量+无DB连接+无任务归属间接证明，残余风险极低但非零。

## 执行记录（持 staging + reverse-hub 双 deploy.lock）

基线护栏：新 Web/Worker 均为 7bdcd8b644e8771646003f68055585f257df40f0 且运行未暂停、/api/version 与 /api/health 通过后才开始。

逐个 `docker stop -t 30`，每停一个后核验 version+health（全部 200、db ok）：

| 容器 | 端口 | 回收内存 | 停后健康 |
|---|---|---|---|
| naumi47-public-worker-5fc5efe79267（暂停Worker） | - | 53MiB | 通过 |
| naumi47-auth-login-9f5ad4f05bc7 | 13063 | 50MiB | 通过 |
| naumi47-green-5fc5efe79267 | 13052 | 525MiB | 通过 |
| naumi47-r2-image-main-20261015 | 13068 | 179MiB | 通过 |
| naumi47-apib-async-main-20261015 | 13072 | 172MiB | 通过 |
| naumi47-apib-async-native-20261015 | 13073 | 172MiB | 通过 |
| naumi47-geeknow-unlimited-native-20261015 | 13071 | 498MiB | 通过 |
| naumi47-geeknow-unlimited-main-20261015 | 13070 | 1.478GiB | 通过 |

终态：运行容器 7 个 = 新 Web + 新 Worker + redis/new-api-postgres/new-api-app/reverse-hub/naumi-staging-db-1。8 个已停容器状态 `exited`、策略 `unless-stopped`（重启机器不会自启）。回滚方式：`docker start <name>`。

## 未完成项（下一步）

1. **新 Web/Worker 仍为 `restart=no`**：自动重启恢复未验收，需改策略并做一次真实拉起验收（含短暂停启，需确认窗口）。
2. **canonical release-lifecycle 仍为 `MIGRATED_CLEANUP_PENDING / rev34`、`legacyDrainProven=false`、`retired=[]`**：本次未手工改状态文件，待下次发布窗口或显式任务经生命周期工具更新，避免与工具约定脱节。
3. **`app_supplier_cost_jobs` 6 条卡死任务**：4 条 queued（attempts=0、无租约，最老 2026-10-09）+ 2 条 needs-attention（attempts=20，需人工核原始凭据），需单独决定重放或作废。
4. 退役规则写入 `docs/RELEASE_RUNBOOK.md`（一个 Web + 一个 Worker 不变式、停旧槽前置条件清单）。
5. `2d3e2ee2`（新增节点三选一/统一模型选择）已合入 main 未上线，待上述完成后按蓝绿流程发布。

## 证据文件

本机 `E:/Workspace/naumi/output/server47-retirement-20261017/`：`REPORT.md`（账目）、`ACCOUNTING*.json` ×5、`RETIRE_RECEIPT.json`、`retire-raw2.log`。全部远端命令经既有受保护凭据通道执行，凭据未写入任何输出。
