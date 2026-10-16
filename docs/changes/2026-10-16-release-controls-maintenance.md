# 双站发布控制与本次维护例外 / 2026-10-16

## 状态
- 根集成worktree `E:/Workspace/naumi-release47-20261016`。用户授权18:30主站47→香港103，明确本次短维护并保留任务数据；不改常规蓝绿标准。
- 当前完成的是本地控制模块、固定候选构建与只读现场准备；**两个站点尚未进行发布写入**。
- 共享checkout未提交后台/团队/画布UI仍保持原样，不切换分支，不stash/reset。

## 已实现
- `release47_host.py`：固定target、machine-id SHA及实例ID/image/start/restart CAS；完整事务持锁，47三锁/103两锁；主机保留至少1GiB、不将Swap计RAM；只读备份及pg_restore目录复读；候选同源站配置/媒体挂载、移除审阅过的旧程序overlay、固定commit/build。
- `release47_controls.py`：App状态/boot绑定与CAS原UUID控制，丢响应落UNKNOWN且重试原请求；同image Worker仅携带必要tick secret、直接origin、target instance、私有持久状态并paused启动；不复制DB/上游凭据到Worker。
- 网关整个include闭合和每个原文件精确CAS，logical symlink重新resolve，逐修改文件原子替换保留owner/mode，完整`nginx -t`和`nginx -T` SHA后reload。失败恢复原配置并重新验证；回退失败明确UNKNOWN，不回灌DB。
- `release47_maintenance.py`：只接受2026-10-16北京时间18:30以后且两个已授权目标，精确保存用户本次维护同意语句、禁止DB restore/accepted POST replay。维护配置仅Naumi dispatch503，原17847兼容条件及旧静态字节保留，不启动额外maintenance server。
- legacy HTTP tick caller可经精确脚本SHA审阅后freeze，而非SIGTERM伪装自然排空；App已接受HTTP仍可能执行，receipt保留null/legacy-unknown。Rollback必须先证明新Worker暂停且无不确定tick，再恢复原caller，不能两路poller同时运行。
- `release47_task_snapshot.py`：实际repeatable-read只读一致快照和原关联任务/供应商/冻结上下文/账本保护比较；maintenance的schema已对齐actual `databaseIdentitySha256/noMissingJobs/noOriginalSupplierMutation/preservationVerified/unknownTables`。未知表/缺项不转成成功。

## 集中验证
- `docker run --rm --network none --memory 128m --memory-swap 128m --cpus .5 --mount type=bind,src=E:/Workspace/naumi-release47-20261016/scripts/ops,dst=/work,readonly -w /work python:3.12-alpine python -m unittest test_release47_controls test_release47_host test_release47_maintenance test_worker_handoff test_release47_inventory test_release_client_compat test_release103_inventory -v`
  - `Ran 94 tests in 0.437s / OK (skipped=2)`，exit0。两项需要原现场capture的附加检查不从无capture容器冒充通过；原capture测试由各子模块另行验证。
- `python scripts/ops/test_release47_maintenance_nginx.py output/release47-evening/maintenance-nginx-final`
  - `MAINTENANCE_NGINX=PASS NAUMI=503 LEGACY17847=200 STATIC=200 ROLLBACK=EXACT SUPPLIER_CALLS=0`，exit0。
  - 真实Linux Nginx128MiB和合成后端96MiB，实际TLS/conditional maps/静态/恢复；后端是明确mock，**不是生产任务或零中断排空证据**。
- Windows首轮权限测试不适合POSIX mode语义，已改在Linux执行；首次JSON重试key顺序不一致已规范sort，原UUID原payload重试实测通过。首次fixture的CRLF与nginx-T文本换行不一致导致CAS拒绝，改fixture写原始LF bytes后通过，没有放宽生产CAS。
- 日志 `output/release47-evening/ops-combined-final.log`、`maintenance-nginx-final.log`，初始失败日志保留。

## 仍需最后集成
- 统一一次持锁session/发布phase wiring、两个站点独立真实候选验收与实际维护窗口，必须在新鲜baseline上执行，不以这些局部工具的unit PASS代替。
- 103三编译UI与私有R2、Fleet及多级旧static前缀的专用gateway。香港只有约1GiB可用且Swap近满，先按本次维护方案核对旧角色/任务/静态后迁移，禁止叠加新槽硬压内存。
- 最终业务9138初构建虽然成功，actual middleware审阅发现新增GET tick receipt被feature gate401，修复及实际Next回归后需重新固定构建。5405/9138是历史候选，不标最终发布。
- `acceptedTasks/agentSessions`与未覆盖旧进程继续null/partial；本次维护不制造五零receipt。后续标准蓝绿仍需要完整覆盖与真实在途任务/外部执行器证据。

## 接手命令
```text
先读2026-10-16-release47-evening.md与release103-evening.md，核对单次预约、最新用户指令和子任务实际SHA。
18:30触发先禁用同一调度；两站顺序独立事务，保留任务数据，未知不重发。最终构建与验收绑定新固定业务SHA。
不能将代码合入、静态原字节、health200、局部lease0或mock测试称作生产上线/完整排空。
```
