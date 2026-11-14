# 视频编译链：发布工具 direct Worker 接入

## 模块与职责

发布创建/启动仍由 `release47_controls.py`、候选 Web 由 `release47_host.py`、切换/回滚由原 normal controller/rollback、异常恢复由原 supervisor 负责。本次不新建控制器，不接服务器，不改变视频编译/任务/计费所有者。

## 已复现的问题

基线 `3d1069649a2e30ac477b2d10613f820183a03e40`：候选 Web 已设置 `NAUMI_APPLICATION_TASK_EXECUTION=worker`，原 `clone_worker` 仍创建 HTTP tick caller，未传 DATABASE_URL/SETTINGS_SECRET、执行目标仍为 Web。因此 Web 不执行任务，发布出来的 Worker 也不执行应用任务。既有独立 direct Worker 进程验证不能证明这个发布创建器正确。

同一实际创建函数反例：`RELEASE_DIRECT_PROJECTION=FAIL MODE=http DATABASE_PROJECTED=0 SELF_TARGET=0`，exit1。修改版返回 direct/1/1，exit0。可回滚源码副本将恢复原误配置，不改变业务数据库。

## 实现与迁移状态

1. 根据候选 Web 的**实际部署角色**决定 http/direct，不依据模型能力、名称或 smoke。原 local Web 的 HTTP Worker 路径与历史配置不变。
2. direct 配置调用固定 Web 包中已有 `directWorkerEnvironment`；Python 不复制一份凭据白名单。结果只在内存和私有临时 env-file 中，创建后清理，不进入命令参数或公开日志。显式 NAS 延迟投递标记一并投影。
3. 应用 Worker 身份指向自己，内部应用地址仍指向对应 Web。原 handoff 继续核对真实 direct 状态，supervisor 读取 direct 状态时复用同一核对并转换为原 Hold。
4. 执行器共享候选 Web 的既有媒体存储挂载，覆盖 local 结果和 S3/R2 失败后的镜像/落盘；不复制其他 Web 目录。combined 模式移除冲突的 `/data` 只读 tmpfs，仅在原有媒体挂载目的地处共享。
5. 普通 direct scanner 为 UID1001/只读根/无 capabilities、512MiB JS heap、1GiB容器；combined 保持原 PID1/root supervisor + 非root scanner + 原生 media 的资源/权限边界。原生媒体子进程不取得数据库或设置加密密钥。
6. `clone_web(...application_task_execution=...)` 支持明确的 local/worker 部署角色；normal 发布配置通过 `applicationTaskExecution` 投影到新槽，不修改原槽。资源以所选/继承的实际角色预算，登记采用真实 HostConfig Memory。
7. 独立旧 direct scanner 的显式恢复沿用其实际模式与资源，不退回128MiB HTTP caller；combined 存在未明旧tick时不以另一新scanner冒充恢复，该决定在回滚日志/排空前检查，原UNKNOWN不清除。

## 公共接口、依赖与归属

- `direct_worker_environment(tx, web_row)`：固定包投影，返回 http 的 None 或 direct 应用环境。
- `direct_media_mount(web_row)`：识别唯一可写媒体持久挂载；缺失/冲突给出部署结构错误，不对模型能力作判断。
- `_validate_direct_worker` / 原 combined validator：创建、启动前后验证固定镜像、环境、资源、身份与共享挂载。
- 方向是发布编排→现有角色/配置适配；产品 JS 投影继续拥有凭据白名单。DB/任务/计费事务归属未改变。

## 验证与证据层级

证据根 `E:/Workspace/naumi/output/video-worker-release-mode-20261115`：

- Linux 旧 controls27、Host14、direct专项10（测试发现导入旧13项，日志总23）、normal policy37、supervisor22、旧profile guard23、handoff4集中验证。精确最终数量以各命令日志为准，不把导入重复项累计成独立新增。
- 实际 Docker/固定包/隔离PG验证使用**真实 clone_worker/start_worker/handoff**，不是替换产品函数。普通与combined各一个真实standalone Web、一个真实direct Worker；实际409证明Web没有接HTTP扫描，真实resume/tick/drain、停启保留drain、共享媒体字节和子进程UID/环境分离，20 checks；任务/ledger均0。
- 最终版本、独立副本回滚、命令/输入/逐字输出/退出状态与哈希，以四产物 `VERIFICATION.txt` 为准。测试适配器把 Docker CLI 意图映射到本地 Docker API，socket只进入夹具，不进入产品。
- 先前失败均保留：测试 exec 忘记清空 preload 导致 observer 端口冲突、fixture未适配inspect/操作日志目录、proc转义及跨UID读取权限。修正夹具后重验，不把这些误记为产品失败或用放宽容器权限通过。
- 本次 proof image 仅覆盖配置投影脚本，基于已有固定Web/Worker包，不是新的完整主线生产构建。真实创建/控制/空扫描通过不代替收费生成、账务与整站切换验收。

## 未完成与下一步

新整站固定构建与带任务的发布创建器链路、Nginx/旧资源/完整回滚、全部启用绑定/环境路线以及实际授权供应商仍需继续。原目标P0–P4/A01–A19不收窄，不因本片main整合关闭。

47 HOLD 保持；站点访问/生产配置迁移/付费调用/部署均0，总目标ACTIVE。
