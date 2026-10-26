# R5E：视频受理、持久化执行与读取边界

## 输入和目标

固定基线 `1d2cb9f9d089907c9f9adb6d0127b3eeeba26360`，4343 个文件已完整归档。仍在独立 `E:/Workspace/naumi-refactor-20261024` / `codex/core-refactor-20261024`，不合回 main、不部署。开工刷新 main 为 `368c93e2`；本轮为同步后第2模块。

目标是让既有视频任务在 Web 完成身份/素材/协议预检、原报价和原事务预占后，由独立 Worker 按保存的原任务执行 supplier create/poll/交付。既有表、prepared/sending 标记、取消、unknown、冻结执行和账务不另起实现。

## 实现

- `creation.ts` 持有原公开提交用例；新任务使用已发布的 execution-services 读取模型/计费，不组装管理 server。
- `submission-types.ts` 持有公开提交合同；`queries.ts` 持有只读投影、列表与价格查询。
- `runtime.ts` 持有原 provider 提交、原请求恢复、冻结上下文、轮询、产物交付和重试；`service.ts` 仅保留同函数兼容出口。
- `byoc-context.ts` 持有原私有快照/凭据恢复；BYOC 创建与 runtime 不再互相 import。
- 14 个生产消费者按职责改绑。正常模式仍沿原同步行为；显式部署角色 `NAUMI_APPLICATION_TASK_EXECUTION=worker` 下 Web 不执行 supplier create 或惰性 poll。
- Web 新受理及 BYOC 显式重试使用已有 `leaseSeconds=0` 选项原子保存 ready 任务（`poll_lock_until=NULL`），原本地执行仍默认210秒。没有先通知、再释放锁的丢唤醒窗口；NOTIFY 失败仍由原周期扫描恢复。
- 原 `beginVideoTaskSubmission` 在真实 POST 前把 prepared 改为 sending；sending/unknown 仍不重新收费派发。预提交取消继续原事务结算/退款。
- Worker 在原任务和 workflow 扫描宽度内登记 detached 工作，复用原 release activity 和进程 promise tracker；慢视频不阻塞图片扫描，重复 wake 不无限增加在途 callback；成功结束 release activity 后才发送下一次唤醒，避免原 activity 尚未完成的同键竞争。排空等待所有真实回调结束；没有新队列、新租约系统或用户侧限额。
- Workflow 的 Web 受理只保存原冻结制作链并唤醒；Worker 使用原 stage bundle、原报价和项目归属推进，原依赖/并行/停止规则保留。

输入素材的原有授权、参数规范化和精确协议预检仍在 Web 受理前；本轮不把它描述为所有媒体内存/CPU工作已离开 Web。媒体 runtime 目录迁移及完整容量验证继续后续阶段。

## 集中验收

新增同一份实际源码 fixture 分别编译完整基线和新版；真实 PG、真实视频 HTTP handler、实际独立 Linux Worker、真实钱包/原任务/作品/回执。上游与媒体 inspection 使用明确 loopback HTTP fixture，不把合成视频字节与 probe 回执当原生解码或沙箱证明。

| 验证 | 实际结果 | 证据边界 |
|---|---|---|
| 完整基线进程 | 18 检查；Web create 3、惰性poll执行；consume1/6积分 | 完整旧源码，不是投影 |
| 完整新版进程 | 65 检查；Web create/poll0；独立Worker、原6/current17、BYOC显式重试ready、workflow、取消/余额/unknown/live lease、慢视频公平性、排空/重启、结果hash；consume6/69积分 | 实际PG/handler/子进程；视频字节及inspection均为合成夹具 |
| 新版本地兼容模式 | 18 检查，原同步行为保持 | 没有自动改变部署角色 |
| 图片Worker邻接 | 71 检查；11笔consume66、Web执行0、通知/周期恢复/排空保持 | 实际Linux子进程/PG，合成供应商 |
| 实际Next | 15.5.27，六入口20检查 | 选定入口构建，不是完整产品/standalone镜像 |
| 视频协议 | 完整基线/新版53profiles、2506返回/错误结果逐项相同 | 实际codec+上传函数，HTTP/PG0 |
| 节点选项 | 912wire/1254场景/8251断言 | 模拟wire，不是付费供应商 |
| 旧profile/family/provider | 33SKU802、family886；8协议48模拟HTTP | 未接真实供应商 |
| 冻结来源 | 8例16入口检查、原control10退化 | 实际PG，提交执行scope synthetic，workflow完整依赖 |
| 全项目类型/定向lint | exit0；lint保留2条原React依赖warning、error0 | 不把warning写成零 |

源码对照：7158个原生产声明正文/标记保持，28个迁移；10处明确表达式替换和3个执行归属调度函数列在 BUSINESS_COMPARE.json；10个参数/取消/交付/账务算法文件原字节一致。14个生产消费者已改绑，兼容门面569→6行、生产消费者0；service/byoc动态环拆除，新owner入环0，其余SCC成员保持，最大仍3。依赖环数字不是性能/容量证明。

旧 reliability/task-safety 两脚本在完整基线均exit1（还在按巨型service/db顺序切片，并期待已淘汰单URL/base64分支）。本轮按TypeScript AST读取真实runtime/task/manifest owner，明确标成STATIC_ONLY，不再把自造counter称fault injection；公开DTO执行原函数AST。旧流式下载、幂等领域、未知任务、产物不可覆盖及账务要点归现有协议回归/实际进程和上述owner合同。完整旧失败与迁移初次observer错误保留，不把旧脚本失败改写为通过。

失败留存：原cookie/sign时间、multipart JSON解析、Router夹具secret、128MiB tmpfs、图片成功状态枚举、异步sending/结算时序，以及延迟supplier响应在并发后才分配ID而覆盖另一job，均在证据目录保留原literal；修正的是夹具输入/观察，不放松生产完成语义。

四产物、4343原始hash独立副本恢复、恢复后完整基线行为、补丁重放和task-only提交/远端绑定以 `output/refactor-r5e-20261026/VERIFICATION.txt` / `DELIVERY.json` 的实际结果为准。

## 后续

媒体 runtime 迁移、剩余3文件/小环、外围UI与多tab/CAS、R6完整产品候选/CI/benchmark/容量继续；整体目标 active。
