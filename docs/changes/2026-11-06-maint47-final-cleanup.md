# 47 遗留记录全面清理、供应商成本扫描修复与看门狗保护（2026-11-06）

用户要求“全部清理干净，不留尾巴；你觉得该怎么办就怎么办”。会话 `maint47-final-cleanup-20261106`，证据 `/opt/naumi-staging/evidence/maint47-final-cleanup-20261106/`，本地步骤 `output/maint47-final-cleanup-20261106/steps/`；全程持三把锁，结束已释放。

## 已执行（47）

- **备份**：`pg_dump` 1,388,002,739 字节，复核可读，未恢复。
- **6 个已停止实例的 6,034 条未完成 release 记录**（10-17～10-28）逐类核实后收尾（单事务 CAS + 条数校验）：参考图操作已完成 5,681；参考图批次已关闭 90；批次已终态 96（成功 86、部分 8、失败 2）；本次关闭批次 44；缩略图已存在 110、可在读取时再生成 3；扫描占位（参考恢复/媒体补传/供应商成本）4；已停止实例上的 Agent/请求 3；冻结历史副本上的占位 3。对应 session owner 置 idle。
- **5 个属于 47 的卡住批次**（10-26 参考工作台）：12 个从未提交的排队子任务取消、扣 0；批次经系统自身逻辑收尾为 2 个“部分完成”、3 个“已取消”，对应 5 个参考工作台操作自动变为 `done`；取消项无新任务、无供应商调用。
- **2 个 10-23 批次（4b405647、f8bd2396）及其参考操作是从 103 复制的只读历史副本**（`naumi_staging_guard.origin_rows` + 冻结触发器），按站点数据独立原则原样保留；系统不会执行它们。首次事务因触发器整体回滚，已核实未生效并对账为 `RECONCILED_ROLLED_BACK`，再按排除后的范围执行。
- **发布记录**：`anomaly-repair-20261026-r1`、`project-scope-20261026-r1`、`site-control-capacity-b79c8c39-20261029-r2`、`peak-20261029-r1`、`main-20261106-r2` 附新证据（关联实例均已停止、无未完成活动、无未知任务轮次、单一 Worker r3、恢复监管绑定 r3）标为 `COMPLETE`。
- **根状态不改**：`MIGRATED_CLEANUP_PENDING` 是 `release47_recovery_supervisor.recovery_binding` 的锚点（要求 `phase == 'MIGRATED_CLEANUP_PENDING'`），改动会使崩溃自动恢复失效；它不是遗留垃圾。
- **镜像/容器保留**：保留最近 5 轮（r3、r2、1103-r1、1102-r2、1102-r1）与 site-control 基础设施；删除 1101-r1、capacity-1029-r2/r1 三轮容器与镜像，以及 10-14 迁移遗留、无任何引用的 `reverse-hub-new-server` 容器和其 2.9G 镜像。释放 4.11G，磁盘 63%。备份 4 份均在 7 天内，全部保留；卷未动。
- **看门狗保护**：`/opt/naumi-staging/releases/worker-watchdog.sh` v4 在任一部署锁被持有时直接跳过（r3 发布中它曾恢复/硬复活受发布控制而暂停的 Worker）；持锁状态下实测跳过且 Worker 未变。副本入库 `scripts/ops/naumi47-worker-watchdog.sh`（SHA256 `3379bccd…`）。

## 清理中发现的代码缺陷与修复

释放 10-17 遗留的 `supplier-scan` 占位后，供应商成本扫描首次运行即报 `55000 STAGING_IMPORTED_HISTORY_READ_ONLY`，并在 r3 上留下新的 UNKNOWN 占位：账户 `53043720…` 的对账任务 key `staging:usage:<账户>` 被 103 复制来的冻结行占用，`INSERT … ON CONFLICT DO UPDATE` 触发冻结器，整次扫描中止——该扫描自 10-17 起实际从未成功。

- 修复（`src/lib/supplier-cost/scan.ts`）：该 key 为导入历史时，本站改用 `…:site` key；不触碰冻结行。
- 回归 `scripts/verify-supplier-scan-imported-history.ts`（复刻 47 的冻结触发器）：**基线复现 55000**；修复后 4 项 PASS（扫描完成、冻结行逐字节不变、本站任务存在、重复扫描复用同一 key）。`verify-supplier-cost.ts` 原有全量 PASS；`tsc`、eslint exit 0。
- 发布与 r3 上该 UNKNOWN 占位的收尾见下方 r4 记录。

## r4 发布（`release47-main-20261106-r4`，COMPLETE）

- 固定版本：commit `2527928c`，BUILD_VERSION `1793971090`，镜像 `sha256:72d9f8ea…`；蓝绿流程同 r3（三把锁、候选旁路启动、平滑 reload 切流、排空、旧槽 `restart=no` 停止）。
- r3 上唯一的 UNKNOWN 占位（`supplier-scan`，即上文 55000 冲突所致）凭证据收尾：日志含 `scope=supplier-scan stage=action code=55000`、无成本任务租约、r3 Worker 已静止；之后 r3 Web/Worker 退役。
- 受影响功能验收：r4 上供应商成本扫描完成、无新 UNKNOWN，本站使用 `…:site` 任务 key，冻结的导入行逐字节不变。
- 保留轮次：删去最早的 1102-r1，保持最近 5 轮。
- 最终只读核对：未完成活动、UNKNOWN 活动、非 idle 会话、未知 Worker 轮次均为 0；r4 后无 5xx。
- 执行中的教训（已写入运行手记）：Worker 的 `lastTick` 可能为 null，读取前需判空；循环步骤要检查真实退出码，不能被管道掩盖；“未知轮次”应按 `phase='unknown'` 统计，不能把进行中的轮次计入。

## 清理后复查发现的遗留（转入后续切片）

- 63 笔挂起计费（60 笔 0 积分文字/助手/OCR，3 笔付费）及 140 余条停在排队/运行/待核查的创作记录；补传通道每轮固定 2 条，跟不上当日写入（积压约 5,100 条）。根因修复与清理见 `2026-11-06-sync-terminal-consistency.md`。
