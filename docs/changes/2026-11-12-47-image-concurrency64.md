# 47 图片任务队列：同镜像调整为 64

## 模块与职责

本次是 47 站运行配置维护，不修改应用代码、不构建或发布 main 的新镜像。用户在本轮明确选择“保持同镜像，改为 64 并发”，沿用其同端口短维护例外；仅本次操作采用该方式，不变更常规蓝绿约定。

四个字段统一设为 `64`：

```dotenv
NAUMI_IMAGE_JOB_CONCURRENCY_GENERATE=64
NAUMI_IMAGE_JOB_CONCURRENCY_IMAGEGEN=64
NAUMI_IMAGE_JOB_CONCURRENCY_SUITE=64
NAUMI_IMAGE_JOB_CONCURRENCY_APLUS=64
```

原值分别为 `4/4/2/2`。`src/lib/image-job-queue.ts` 的值用于各 kind 的数据库租约准入；它们不是所有 kind 合计的全站吞吐量承诺。每次扫描的 dispatch 扇出、供应商容量、资源限制及幂等结算规则均未修改。

## 公共接口、依赖方向、数据及事务归属

- 使用当前 Web `docker inspect` 生成 Docker Engine create 请求，固定不可变 Image ID，不用可变 tag。
- 保留完整 HostConfig、挂载权限和传播属性、三个网络与原网络别名、原进程命令、端口及资源限制。
- 容器 HOSTNAME 由 Docker 重新生成，避免继承旧容器 ID；镜像补入的 `HOSTNAME=0.0.0.0` 与原容器一致，最终实际 Env 差异只有四个队列字段。
- 同端口重建必须沿用原 Web 容器名，因为 Worker `NAUMI_APP_ORIGIN` 引用该名称。不能只换成新名称而保留指向已停止旧容器的恢复入口。
- 配置、任务、媒体、钱包、供应商请求与结算状态继续由原业务模块拥有；本次没有直接改写这些数据，不回灌备份、不重放旧收费任务。

## 本次实现与迁移状态

固定在线镜像：`sha256:16160d114f205b360b9d9fc57821959e67ca2f4ac9e09fbbaf1ee7d134b99aa8`。

固定源码：`f5e8e95ba0746c1cb9eea05d05b596589c7dad04`；build `1794458731`。此前已合 main 的隐藏抠图模型修复不在本镜像内，不能将其写成已在 47 上线。

| 对象 | 实际状态 |
|---|---|
| 当前 Web | `naumi47-web-ui-notes-20261112`，新 ID `909bd1e8ae2ffbc758b91eedf2637d0c33a9129e68f8fafb920fd6271d85c9fe` |
| Web 端口 | `127.0.0.1:13134 -> 3000/tcp`，未改网关 |
| Web 资源 | RAM/Swap 上限各 2 GiB，1.5 CPU，PIDs 256，保持原值 |
| 回滚 Web | `naumi47-web-ui-notes-20261112-old-conc4-20261112`，原 ID `61a4f52338facc91329d0a36dca740f3df9032632d3e633a1a1235c7799043cb`，停止保留，restart=no |
| Worker | `naumi47-worker-ui-notes-20261112`，ID `c9f5d1cb63ed6e6fea2132eee4ef7fbeec5d53dc87c8967639760da0d3bc6393`，未重建、未重启、未改配置 |

全程由同一 SSH 事务持有 Naumi、Hub、参考工作台三个部署锁。切换前通过持久 CAS 控制短暂停止 Worker 恢复扫描及 Web 新的已观测后台领取，等待已观测执行、图片租约、Agent run 和媒体运行任务为零，再执行 Web 替换；之后恢复 Web 准入和 Worker 扫描。没有以扫描 tick 为零冒充所有业务完全排空，原 UNKNOWN 观测保留。

切换于 `2026-11-12 17:35:32.727 +08:00` 开始，到新 Web 就绪约 `44.785` 秒，包含等待旧容器退出的 30 秒。旧容器最终退出码 `137`、`OOMKilled=false`。这是用户接受的中断维护，不是无缝蓝绿验收，也没有证据把实际中断缩写为原方案估算的 10–30 秒。

既有 canonical 生命周期文件（revision 2095、历史 `CLEANUP_PENDING`）及完整 Nginx 配置字节保持不变。本次独立维护回执不清除该历史债务，不将其伪装成正常生命周期 COMPLETE。

## 验证命令、结果及证据层级

本机证据：`E:/Workspace/naumi/output/release47-image-concurrency-20261112/`。

47 私有证据：`/opt/naumi-staging/evidence/release47-image-concurrency-20261112-64-r1/`。完整 inspect 含运行秘密，只在该目录以私有权限保留；公开记录只含白名单配置与哈希。

- `python verify_spec.py`：`SPEC_FIXTURE=PASS CHECKS=31 LIMITS_MOUNTS_NETWORKS=PRESERVED ENV=64/64/64/64 ROLLBACK_COPY=ORIGINAL PRODUCTION_MUTATIONS=0`，exit 0。
- `python verify_env.py baseline`：`BASELINE=PASS ENV=4/4/2/2 IMAGE=f5e8e95b`，exit 0。
- `python verify_env.py modified`：`MODIFIED=PASS ENV=64/64/64/64 SAME_IMAGE=YES`，exit 0。
- `bash ROLLBACK.sh --verify-copy`：`ROLLBACK_COPY=PASS ENV=4/4/2/2 SHA256=ORIGINAL MODIFIED_FILE=64/64/64/64`，exit 0。
- 真实 Docker create 后检查固定 image、进程配置、挂载、网络、端口及全部 Env 差异；Docker 将 `OomKillDisable=null` 规范化为 `false`，其关闭禁杀语义不变，已单独处理并记录，未忽略其他 HostConfig 差异。
- Windows 侧真实公网 `/api/health` 返回 HTTP 200、`db.ok=true`；Worker 从原 `NAUMI_APP_ORIGIN` 读取新 Web 健康通过。
- 观察 302.11 秒、31 个采样点：公网 HTTP 全部 200，Web 未发生 OOM，Worker 扫描持续恢复、`paused=false`、`unresolvedTicks=0`；Web 内存观测峰值 1038.6 MiB（usage 减 inactive_file，2 GiB 上限）。
- 核验 1991 条原有任务：ID、归属账号哈希、kind 均保全，冻结 payload 哈希变化 0；原活动样本 6 条最终均为 done。这证明身份保全与样本完成，不把它写成重复扣费全量审计或 64 路容量测试。
- `17:44:46 +08:00` 最后分类回读有 6 条 pending：3 条 generate 持有效执行租约、3 条 imagegen 处于父任务状态。因此不能把 `status=pending` 一律解读为尚未执行的队列积压；本次没有声称队列清空，也不把观察期新增任务计入原积压清理成果。
- 最终维护回执为 `MAINTENANCE_VERIFIED_64`；四个实际 Env 字段差异、Worker 完整 Config/HostConfig 与进程身份、网关和 canonical 文件哈希均再次核对。SSH 事务实际释放三锁。

可执行 `ROLLBACK.sh` 的生产分支会在三锁下核对精确容器/镜像/网关身份，恢复保留的旧 Web；只测试了独立配置副本的回滚，没有为了演练再次中断生产。

## 未完成项与下一步

- 保留旧 Web 和恢复材料，不在本轮删除旧容器，不触碰 103。
- 配置 64 不等于已完成 64 路收费图片压力验收，也不证明此前排队唯一瓶颈或未来高峰容量。
- 已有历史 UNKNOWN 与 canonical 清理债务继续保留，按原拥有者的流程处理。
- 本次同镜像运行配置变更及文档记录不把 main 的其他修复推广上线。后续新镜像发布应读取当时线上配置，保留本次显式维护值，按正常发布流程重新验收。
