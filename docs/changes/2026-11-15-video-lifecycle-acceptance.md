# 视频编译架构：实际固定包与 lifecycle CLI 事务验收

## 模块与职责

本片只扩展既有本地发布验证器，不改变编译规则、供应商适配、能力配置、数据库结构或生产发布器。`verify_release_direct_worker.py --lifecycle complete|rollback` 把已有真实 Nginx/Next/独立 Worker/PG 夹具接到原 `bash scripts/deploy-release.sh --lifecycle` 入口；新 `video_release_lifecycle_fixture.py` 只采集随机夹具内的实际事实和调用 CLI，不能由生产控制器导入。

## 公共接口、依赖方向与状态归属

- 依赖为 fixture driver → fixture adapter → 原 lifecycle CLI/controls/格式守卫。生命周期状态、revision CAS、原子落盘、终态及失败语义仍归原 `release_lifecycle.py`；未新增状态机或绕过参数。
- 三把真实文件锁只作用于本次夹具目录，完整保留到进程退出。状态目录名明确为 `fixture-state`；目标为 local fixture，不冒充47或103。
- 容器身份/固定镜像/实际版本、内存、完整 nginx -T 哈希、HTTP槽位、Worker origin、原生媒体状态、旧资产字节、实际SQL及release-runtime记录均来自运行时。
- 排空数字仅在本驱动是随机schema/network唯一任务创建者的受控世界内解释。保留原 `coverage` 的partial字段，不将trackedAcceptedWork/共享数据库统计升级为生产全局Agent/后台覆盖。连接数字指预加载器记录的活动HTTP响应生命周期，不是空闲TCP keepalive数量。
- 缺失、null、bool、字符串0、活动/未知租约、未完成HTTP、未知Agent owner和原生队列均拒绝产生排空0；新建7项集中单元覆盖这些反控。
- 不回灌数据库/媒体，不修改冻结计划、历史账务、UNKNOWN或旧任务；固定程序仍由原媒体/编译/计费模块完成。

## 本次实现与验证

1. 通过真实 CLI 依次begin→ready→switched；旧Web仍运行时finish失败并持久为CLEANUP_PENDING。
2. 下一releaseId的begin被拒，旧revision再次finish被拒且状态字节不变。不是仅检查内存对象。
3. complete场景读取实际Web预加载HTTP统计、PG Agent owner/活动、domain fence/advisory/transaction、Worker及native队列；核实排空后停止旧槽、restart=no；当前同版本Web/Worker保持unless-stopped。保留两个实际历史固定包、真实静态归档/夹具配置/数据库备份与哈希，原格式守卫确认兼容，再由CLI确认COMPLETE。
4. rollback场景执行原Nginx/固定包守卫/程序恢复；确认账务资产/UNKNOWN不变，旧包仍可完成新操作；实际候选停止且restart=no后，CLI确认ROLLED_BACK。
5. 原driver不传新参数仍保留原网关回滚流程；其程序序列化、鉴权、真实签名媒体字节、映射冻结、父子资产/单账本和UNKNOWN不重发断言保持。

固定新包e3fd8626/1794698692（image4d924ead），旧包a554b6a0/1794696860（image638c66ec），第三个保留包7ce2f729/1794692423（imageac0aadbe）。均为已完整构建的不可变程序，无产品覆盖。源码仅增加验收驱动，因此不重复构建同一产品。

集中单元回归131项通过；首次实际complete51项已通过。第一轮驱动在模块加载后修改测试代码造成旧缓存版本仍缺candidate restart policy，CLI正确拒绝，原日志保留；修正夹具后真实CLEANUP_PENDING与完成均通过。完整最终源/独立副本检查数、CLI字面输出/exit、静态与账本数量、回退和整合以 `E:/Workspace/naumi/output/video-lifecycle-acceptance-20261115/VERIFICATION.txt` 及INTEGRATION为准。

## 未完成项

这是本地受控video事务/全网关路径的lifecycle CLI联动证据，不是正常生产controller全业务覆盖、目标站部署、TLS、公网、浏览器/RSC或真实付费供应商验收。生产实际启用Binding/env-only配置审计/迁移、其他高级入口组合、授权真实上游与完整P4仍开放。fixture collector不进入live路径；本片不增加能力门禁或生产部署参数。总目标ACTIVE，47 HOLD，站点操作/生产写入/付费/部署0。
