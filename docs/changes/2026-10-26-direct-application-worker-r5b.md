# R5B — 独立Worker直接执行、原回执恢复与在途回调排空

## 基线与实际目标

独立目录`E:/Workspace/naumi-refactor-20261024`，分支`codex/core-refactor-20261024`。完整基线`4e5686221bd785e61c87e7de8fc2f5864e0e6b3b`，4283个原文件字节/hash保存在`output/refactor-r5b-20261026/BASELINE_SOURCE.tar`、`BASELINE.json`。上一模块R5A已推送，本轮是main同步后第2模块。

R5A已经把套图/A+与四类原任务恢复变成不依赖HTTP route的应用用例，但独立scanner仍只POST Web。本轮接通实际独立进程，并处理一个原HTTP模式不能直接照搬的问题：扫描返回时，一些持租约任务的Promise仍在后台执行，不能据此关闭进程、数据库或宣称排空。

## 实现与职责

- `worker/application.ts`组装原37-owner持久化与release观察，不加载Web的管理资料发现/bootstrap。direct tick在本进程直接调用R5A七阶段scan，无HTTP Request伪造、Web POST或新任务系统。
- `worker/inflight.ts`仅登记原detached Promise并等待实际完成，后续原parent追加的child也一起等待。`DurableImageJobs`两条原后台分支及release的原detached分支接入该集合；原领取、心跳、权限、冻结、结算和unknown算法不变。7129个非目标生产声明token保持。
- `WorkerRuntime`复用既有单飞、原意图先落盘、控制revision/UUID与unknown逻辑，只增加direct dispatch/read/drain窄端口。direct回执的执行者是实际Worker，旧表/JSON的`web`字段继续保存实际执行host；`server.role=worker`明确区分，不冒充Web。direct与HTTP的持久身份不同，旧HTTP state不会静默复用为direct，也不会在direct故障后回退HTTP重提。
- completed tick必须等原本地回调完成并读取实际release活动，排空时再等这些Promise，最后关闭coordination/query/release三个pool。崩溃后只读原PG回执核对，保留原worker boot/tick和暂停状态，不重新执行。
- combined supervisor保留原root媒体/non-root scanner分工。只有direct scanner收到明确执行配置；媒体子进程仍不接收DB、settings或S3秘密。direct scanner不再被旧HTTP caller的12秒grace强杀；先等待scanner退出，再停媒体。direct确认还核对执行模式/实际角色/本地后台数。
- 构建脚本生成`dist/worker/application.cjs`和输入/依赖hash manifest；纯JS依赖打入包，仅`pg@8.20.0`、`sharp@0.34.5`外置。最终bundle为4137396字节、2333个输入、HTTP route输入0。独立包内解析校验拒绝落到开发目录父级依赖。
- Docker构建追加Worker build/standalone依赖验证和COPY，创建属于nextjs的`/release-state`。Compose的video-worker默认direct、同App镜像、复用执行配置和媒体卷、独立持久state；Web内旧计时器维持关闭。关闭grace默认10分钟仅是容器停止预算，不代替真实排空。
- `worker_handoff.py`兼容观察direct执行角色、真实后台数以及direct原回执target。47专用`clone_worker`仍保留原HTTP部署配置，本轮没有改线上环境、旧state目录、部署锁或发布行为；其direct角色配置整合在后续进行，不能把Compose配置验收当作47完成切换。

## 真实验收

固定缓存镜像提供Linux Node24.21与原生依赖，当前bundle/脚本从本轮只读挂载，源码hash与实际输入绑定；不是新的完整App镜像。网络只有本轮内部PG和回环503 Web，无真实供应商或付费调用。

- 完整旧版scanner：8检查，Web503时实际POST1、四任务仍pending、consume0、UNKNOWN暂停，exit0。
- 新版实际独立scanner：29检查，Web POST0，四类原任务完成，三个原合同按单价6结算合计18（current17），scope/live lease/unknown checkpoint保持，exit0。
- 实际钱包事务锁阻塞后发送drain及SIGTERM：32检查，进程未提前退出、不报告tickDrainComplete；释放锁后交付/结算并等待关闭，exit0。
- PG completed后、写本地complete state前实际终止进程：39检查、exit91按注入预期；重启保留原tick/boot、UNKNOWN，再只读核对原PG回执成QUIESCENT，未再次POST/消费。
- 实际combined supervisor、non-root scanner和原生media进程一起启动：31检查，Web POST0、四类任务完成和原价结算，scanner先退出、MEDIA_NATIVE_DRAIN=COMPLETE。
- Linux 31个runtime unit、combined91断言、原drain/handoff/packaged入口通过。Python原handoff30测试及direct补例4测试通过；这些unit/适配测试不冒充原生业务验收。
- 相邻R5A完整PG5/156、持久化PG3/36、实际tick receipts59检查通过；全项目tsc、本轮13个TS/MJS代码文件eslint通过。本文/总台账只在测试后补记录，最终源码绑定以VERIFICATION为准。

## 原始失败与修正

首次包检查实际发现旧standalone缺少Supabase等纯JS外部包，改为打入Worker，仅留下已实际解析/加载的pg/sharp。fixture的模块位置、SSL参数、模拟kill端口和原生scratch tmpfs准备错误均保留原literal；没有通过修改业务价格/租约/unknown规则让测试变绿。

本机Docker Desktop进程曾退出，最终补验记录了named pipe不可用；先核实进程/服务均停止，再启动本机Desktop，并只恢复本轮自有PG。没有重启其他容器。内部网络PG不供Windows host发布端口使用，Windows相邻验收另用本轮独立127.0.0.1 PG。静态扫描对忽略目录的生成bundle有一个预期非tracked引用，单列并由实际build/load/process验证，不将它写成未解释import0。

## 交付与整体接续

最终四产物、原始命令/输入/literal/退出码、独立副本回滚、完整原hash、patch replay、提交及远端证据统一在`output/refactor-r5b-20261026/`。实际工作树保留新版，整体目标active，不合入main、不部署。

本轮证明恢复任务已能在独立Worker进程执行，不表示所有新提交都已经离开Web。新请求首次kick的排队/唤醒整合、47管理式发布的direct配置/资源与state交接、媒体runtime从scripts迁移及Docker联动仍继续；再完成剩余20/小环、外围UI/CAS、完整产品构建/CI/性能和容量验收。保留用户原报价、真实余额、归属及幂等，不新增用户确认或业务限额。
