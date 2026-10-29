# 47 站容量与稳定性隐患台账（持续增量）

建立日期：2026-10-29。维护人：JesstLe + agent 会话。
维护方式：**持续探索源码，不断发现不断增量补充**。每条记录带编号、位置、状态；修复后更新状态与证据，不删条目。
触发背景：10-26 至 10-29 三天内四起全站级事故（排队 wedge ×3、apib 欠费 402 全站生图失败、tick 503 worker 死锁 ×2、dataUrlToBytes 正则爆栈交付失败），逐一排查后发现全部指向同一类根因——**单机小负载时代的容量参数与数据路径从未按 10 万用户目标校准**。本台账是系统性挖掘的总账。

## 当前状态索引（2026-10-30 增量核实）

**整项审计未完成。** 最新业务/工具整合 main `2a315f8964463f3a1b9b10459d1b4578d39492f8`，包括本轮 A15 父修、A53–A55 与存储验收器纠正、A62闭包重复扫描优化。47实际运行仍为 `b79c8c39 / 1793281629`；本轮没有再次切换业务镜像。已完成的切片和剩余整项分别登记，下面历史段落不覆盖本索引。

**本轮新增闭环：** A15同key多实例滑窗＋回收调度完成源码/真实PG/82调用验证并合main；A53–A55三项迟到响应修复后34、39、原独立15场景全部通过并合main。存储probe按实际落点修复后，47真实上传→NAS/HTTP/Range/下载/匿名拒绝→清理已通过。A62超时点已优化，47一次只读整采48.101s完成图与闭包，但选中33815条超过原20000预算，仍明确incomplete，未靠抬限额写成通过。

**阅读顺序：本索引 → 第七章对应增量 → 模块文档与原始证据。** 一至六章及第七章早期段落是建立时的历史快照，原“待修／待复核／已上线”不代表当前状态；不删除原记录。尤其“双份主池”“503等于未受理”“无回执直接放行”“删Worker状态”“固定使用R2”等旧推论，以第七章的事实校正和现行发布规则为准，不作为操作步骤。初始“前端轮询量小无害”也不适用于已复现的 A50 生命周期问题。

### 已完成的切片与未关闭的总项

- **X1 / A25**：企业列表窄键分页已整合，有上一轮发布证据；状态摘要、非空状态过滤、anomaly 路径的剩余投影和线上索引验收仍开放。见 [X1](2026-10-29-capacity-x1-bi-detoast.md)。近期主线又改了 BI 相关路径，后续复核须从上述新基线读取，旧局部结论不覆盖新增路径。
- **X2 / A3、A16、A28、A29**：心跳有界退避、锁后/提交前 fencing 已整合，有上一轮发布证据；没有把风险表述升级为已发生同 operation 双扣费，也未宣称所有租约/视频通道已验收。见 [X2](2026-10-29-capacity-x2-lease-fencing.md)。
- **X3 / A1、A2、A23、A26、A27**：单普通池工厂、tick 专池和首批连接修复已有发布记录；后续普通业务池、工作台/账务事务清理已随 b79c8c39 发布。v2未受理协议及 A35 健康投影修复已合 main，**默认仍v1、v2未启用**。见 [tick隔离](2026-10-29-capacity-x3-tick-isolation.md)、[v2](2026-10-29-capacity-x3-nonacceptance.md)、[普通连接](2026-10-29-capacity-runtime-clients.md)、[账务事务](2026-10-29-capacity-billing-transaction-lifecycle.md)。
- **X4 / A30 与图片 A31**：已修复线性 Markdown 解析及重复像素转换，已有上一轮发布记录；指定 supplier/reverse-hub 两处 Base64 正则未复现爆栈，已纠正，不列作待强行替换缺陷。视频直接8MiB输入的公开入口可达性、mask/跨交付重复读取仍待核查。见 [X4](2026-10-29-capacity-x4-linear-parsing.md)、[图片管线](2026-10-29-capacity-image-pipeline.md)。
- **X5 / A32–A34**：root 图字节外置、结果引用归属和选择性恢复源码已随 b79c8c39 发布；本站存储/共享媒体、兼容reader回滚、历史迁移/孤儿保留仍开放。见 [X5](2026-10-29-capacity-x5-boundaries.md)。
- **A35–A41**：健康投影、视频保存意图隔离/跨节点重试、FIFO必要前缀、Agent SSE/Markdown、BI非积分冗余批次锁均已合 main；不是全部画布保存、全部账务热路径或全部客户端生命周期完成。见 [复核修正](2026-10-29-capacity-review-followups.md)、[FIFO](2026-10-29-capacity-billing-hotpaths.md)、[Agent](2026-10-29-capacity-agent-streams.md)、[BI](2026-10-29-capacity-bi-user-mutation.md)。
- **A42–A49**：发布采集器分页、期限、原集合/绑定证明及fixture清理已修并合 main。collection/proof v3 仍须在未来实际发布时重采基线，旧v1/v2与历史债不追认。见 [采集器](2026-10-29-capacity-release-snapshot.md)。
- **A50–A55**：A50–A52已随 b79 发布；A53–A55上传/改名/删除续体在本轮源码闭环、已合main待发布，新增34、原39与原独立15项全部通过。见 [恢复](2026-10-29-capacity-workbench-recovery.md)、[本轮归属修复](2026-10-30-capacity-workbench-mutations.md)。

### 仍开放的执行队列（不以默认值直接判定缺陷）

以下均由本容量审计父线程维护；本次登记不表示已启动新的子任务。先完成有确定反例的窄切片，再按真实负载校准。

1. **已修待发布：A15、A53–A55。** 本轮已集中验收并合main；后续实际镜像发布和线上验证单列，不再重复派已修源码。运行配置固定7e5ece5f的独立复核与A60窄切片为后续执行对象。
2. **账务/BI待审与已量化剩余：** 重复SUM/expire、全局用户管理advisory锁、日志保留、其他事务调用方；X1剩余投影和线上索引。已修 A38 FIFO 与 A41 非积分批次锁不重复列为未修；余额SUM仍扫描活候选，不据此声称O(1)。
3. **媒体/视频/运行参数待校准：A4–A8、A10–A13、A17、A20、A22、B3。** 媒体并发1、libuv2、视频20s/3条、协调池2、派发并发4/硬顶8、旧同步工具路线、轮询与超时、媒体大小契约仍须逐调用链审计和隔离量化；不机械调大池/并发或统一所有租约。X5瘦身不自动证明可放开媒体并发。
4. **配置/运营/多实例：A9、A14、A15、A18、A21。** bootstrap与人工维护优先级、受理状态下的重试语义、A15部署/多实例实际容量、余额低水位/402反馈、低优先命名收口继续开放。A15进程内Map及长短窗缺口已源码闭环。未启用全局重试，未新增运营限制。
5. **客户端/长流：A19及后续。** 文字/复合画布草稿、其他保存队列、视频全量读取/恢复轮询、大JSON/data URL、长会话持久化/RSS、事件裁剪游标和画布另一套流；Agent服务端SSE与A50只覆盖各自切片。
6. **已有回归失败与集成验收：** enterprise401/404、PUBLISH_STALE_DRAFT_BASE、postaccept loader、delivery-retry、Harness-runtime ROUTER_UNAVAILABLE及accepted-timeout波动保留原/改对照；真实认证/完整Next、多实例、完整业务链与生产峰值容量尚未整体验收。
7. **发布与历史债：A7、A24相关。** X3 v2启用、X5实际reader回退、v3采集、45笔手术、在线索引、UNKNOWN、历史CLEANUP_PENDING及accepted-timeout根因均未由本轮关闭；不会靠删除状态或把本地通过记为生产完成来关账。

**部署证据边界：**47已于2026-10-29按用户明确授权切至 `b79c8c39 / 1793281629`，详见 [实际发布](2026-10-29-release47-capacity-batch-r2.md)。本轮有限线上存储验收没有换业务镜像；旧Worker已停，旧Web两条UNKNOWN仍保留且draining，恢复器指新pair，生命周期保持CLEANUP_PENDING。

**编号不是完成率：**A1–A62 包含初始假设、已纠正事实、已修切片和待审项；D编号是症状链。不能按编号或脚本断言数推算生产故障数、已修问题数或整站完成百分比。原80项产品总台账也未因此全部关闭，见 [产品总台账](../PRODUCT_READINESS_100K.md)。

### GLM共享增量并账与编号映射（同日追加）

共享树 `E:/Workspace/naumi/docs/changes/2026-10-29-capacity-audit.md` 为未跟踪文件，后续增量未进入main；其A26–A31、D11–D13与本文件既有编号碰撞。原文件只读保留；快照SHA256 `a8145a080e6ae445e3167de92e6d9061451a77c4743d01e623bb09079e6ce3fb` 存父证据 `ledger-refresh/GLM_SHARED_LEDGER.md`。此处使用“GLM-原号”保留来源，本文件既有编号不重写。

| GLM原号 | 本总账编号 | 当前可核事实与执行状态 | 负责人/下一步 |
|---|---|---|---|
| A26 / X6 / D11 | **A56 / X6 / D38** | A12查询/下载局部修复及父进度解析已合main`956b7238`；五模型基线合成成功，线上无结果原报告仍未归因 | 继续核实际运行版本/冻结请求/原task；不把supplier_calls零行当未提交证明 |
| A27 / D12 | **A57 / D39** | 固定`6ad2fb38`改为完整默认帧解码的单像素验证输出；父39项语义与原图/变体hash保持，复制回滚核验 | 父验收通过；本轮固定提交与整合回执单列，实际容量/部署另列，不是删验证 |
| A28 | **A58** | 上传route/helper/media-variants已共享64M原图policy，40M处理/64Mi Agent metadata/64MiB字节职责分别保留 | 本上传职责内收敛已验证，不降低规格，不宣称全站像素统一 |
| A29 | **A59** | BI access/model/management日志保留为开放项；未见自动保留不等于获准删除审计/账务证据 | 后续独立切片：读写/查询/关联盘点，有界归档与可验证保留，先本地证明；不挂watchdog自动删90天 |
| A30 | **A60** | “236/136处”是GLM快照计数，未本轮全库复算；已修heartbeat/事务不重复计数，业务容错catch不机械全改 | 分级审计计费/租约/交付/准入；固定短诊断/计数，保留原异常/幂等，不输出凭据/大参数 |
| A31 | **A61** | reverse-hub JPEG候选编码待确认当前调用可达性；GLM报告服务停用为外部状态，未远程复核 | 媒体后续切片，先查实际链路/质量与内存，不因“停用”删代码或启动服务 |
| D13 / C07等 | **D40** | `83455f61`已确认为最新main祖先；C07/显式选模/反推批次与后续canvas修复各有文档；实际运行版本尚未本轮核对 | 纳入下一固定候选验收，不重复改已修代码，不把合main称上线 |

并账校正：①X4真正修的是New API图片URL/Markdown重复扫描，不是证实并替换指定两处b64_json爆栈。②X5及下午FIFO/BI/Agent等不在本线程已保存的`e1878018`发布范围，“7项全部上线”待真实运行版本证据，不按汇报计数。③credit_batches对应本总账A38/A41，不是A11派发默认并发。④GLM报告45/45已补交、watchdog v3启用、Hub停用，与本线程旧挂账/发布记录存在时间差；标为**外部报告待核验，禁止重复执行手术**，不据此恢复watchdog或删除UNKNOWN。⑤A4/A5/A6/A9/A10/A12等常量仍存在已源码核对；修复应以瓶颈/语义验证为准，不把“改数字”当完整修复。

本次接续排队：第一组X6/A56（含其轮询与错误证据），第二组A57/A58上传内存/像素职责，第三组A4–A6/A8–A11/A20运行参数与调度；A15分布式限流、A59日志保留、A60吞错分级、A53–A55客户端续体及其他开放项继续由父线程串行安排，全部保持在账。派发成功句柄另记本地DISPATCH_PLAN，不把计划文字当任务已运行。

---

## 一、总模型：连接持有分析（10-29 定稿）

**结论：架构骨架是异步任务模式（正确），但数据路径把它打成了"高危户型变种"——不是等图焊死连接，是搬图焊死连接。**

正确的部分（勿改）：
- 生图入口短事务入队即返（`image-job-repository.ts` enqueue：INSERT+预占积分，毫秒级）
- worker tick 回执：accept（短事务）→ **scan 在事务外** → complete（短事务）（`worker-tick-receipts.ts:116-122`）
- 派发：claim 独立短事务（120s 租约），调供应商时不持连接（apib 异步 1s 返回 task_id）

三个高危实现：
| # | 问题 | 证据 | 量化 |
|---|---|---|---|
| B1 | **图片字节存在 snapshot jsonb**，每次状态 patch 整行重写 | `paidOperations.result` 存 data URL；`image-job-repository.ts:31` `UPDATE SET snapshot=$2` | **app_image_jobs 17,482 行=1,843MB，均 105KB/行，2K 任务 5-6MB**；任务生命周期 5-8 次 patch=几十 MB 写入；单条 UPDATE 从 1ms 膨胀到 100-300ms，连接持有膨胀 100 倍 |
| B2 | 交付链路在 DB 反复横跳 | 上游下载(≤32MB)→base64 写 snapshot→读出→sharp→写回→API 吐 data URL | 每张 2K 图在 DB 进出 4-6 次 |
| B3 | 12 个老工具路由同步等图 | cutout/avatar/tryon/dewatermark/dewrinkle/extract/garment/garment3d/style/recolor/aplus/suite，timeout 120-280s 各写各的 | 等图不持连接但占 Node 并发+MB 级内存 buffer |

峰值账本：`5 连接 × 100-300ms/事务 ≈ 25 事务/秒有效吞吐`，峰值需求（60 并发提交+交付搬字节+tick 扫描+BI）远超 → 池排队 3 秒超时 → tick 503 → worker wedge。DB CPU 仅 24%（很闲），但 IO/锁被 MB 级写放大吃满。

修复方向优先级：
1. **图字节出库**：对象存储直链（R2 配置现成未全量用），snapshot 只存几十字节引用 → patch 回毫秒级，池占用降一个数量级。治本。
2. 12 个老路由异步化并入 execution 队列（core-refactor 重构线已覆盖）。
3. 池参数/tick 隔离（见二、护栏清单）治标。

---

## 二、硬编码容量参数清单（三轮全库扫描，origin/main 基线）

### 🔴 高风险（9 处）——事故链路直接相关

| # | 位置 | 硬编码值 | 问题 | 状态 |
|---|---|---|---|---|
| A1 | `src/lib/db.ts:57` | 主池 `max: 5` | web+worker 各 5 连接，峰值被长事务占满；tick 503 wedge 元凶。**注意 `src/lib/db/connection.ts:13` 有第二个 max:5 副本，改要两处一起** | 待修 |
| A2 | `src/lib/release-runtime/worker-tick-receipts.ts:57-60` | connect 竞态 3s + lock_timeout 500ms + statement_timeout 3s + idle_in_tx 5s | tick 受理全链路超时按小负载定标，峰值必 503 → worker 自暂停死锁（已爆发 5 次，10-29 峰值测试再次实锤） | 待修 |
| A3 | `src/lib/image-job-repository.ts:11` + `durable-image-jobs.ts:376` | **执行租约 120s vs 路由超时 280s**，心跳 25s 续约，**catch 里 clearInterval 心跳一次失败即永久停止** | 2K 真实耗时 60-180s；DB 抖动一次→租约过期→任务被二次 claim→**双执行/双扣费窗口**。与幂等扣费设计冲突，定时炸弹 | 待修·紧急 |
| A4 | `scripts/video-worker-with-media.mjs:25` | 媒体交付并发 `assert===1` 禁改 | 全站画布媒体处理串行；"用户体感 2-3 分钟、80% 耗在交付"的直接元凶之一 | 待修 |
| A5 | `scripts/ops/release47_controls.py:32` | `UV_THREADPOOL_SIZE=2`（Node 默认 4）固化在部署脚本 | DNS/fs/TLS/sharp 全挤 2 根线程；峰值 fs 排队→搬字节变慢→池占用更久→恶性循环。MALLOC_ARENA_MAX=2 可留（小机合理） | 待修 |
| A6 | `src/lib/video/worker.ts:16-17` | `SCAN_INTERVAL_MS=20_000` + `BATCH=3` | 视频恢复每 20 秒只捞 3 条，积压吞吐上限 9 条/分钟 | 待修 |
| A7 | `src/lib/release-runtime/store.ts:11` | 发布池 `max:2` + statement_timeout 8s | 批量清理/手术 UPDATE（实测需 20s+）必超时（10-26 手术教训） | 待修 |
| A8 | `src/lib/video/coordination-pool.ts:34` | 协调池 `max:2` + query_timeout 5s | 视频协调专用池过小 | 待修 |
| A9 | `src/lib/model-config/bootstrap.ts:23` | 通道出厂 `maxConcurrent: 4` + timeoutMs 90-280s | v152 的 apib=64 是管理员手工调的；**下次新通道 bootstrap 又回 4**，容量配置会静默回潮 | 待修 |

### 🟡 中风险（15 处）——负载高时退化

| # | 位置 | 值 | 问题 | 状态 |
|---|---|---|---|---|
| A10 | `src/lib/image-job-queue.ts:14` | 派发并发默认 4、硬顶 8 | 60 并发时派发本身是瓶颈，上限写死 | 待修 |
| A11 | `src/lib/image-job-queue.ts:7` | 队列默认 generate:16/suite:4/aplus:4/imagegen:16 | 唯一有 env 覆盖的（NAUMI_IMAGE_JOB_CONCURRENCY_*），但默认值无人知晓、无文档 | 待修 |
| A12 | `src/lib/model-config/apimart-preset.ts:187` | apib 轮询 pollMs 2000 无退避 | 100 在途=3000 次上游查询/分钟 | 待修 |
| A13 | 生图各 route | 超时 280/240/230/200/120s 每路由各写各的 | 同一供应商同一模型，cutout(120s) 用户先被掐死 | 待修 |
| A14 | 全站 OpenAI 客户端十余处 | `maxRetries: 0` | 瞬时抖动零重试直接失败给用户（failure-ux-spec 已识别） | 待修 |
| A15 | `src/lib/rate-limit.ts`（整个文件） | 进程内存版限流，注释自认"非分布式够用" | 蓝绿双槽并存期各算各的；多实例即失效；Map 有 60s sweep | 待修 |
| A16 | `durable-image-jobs.ts:376` | 心跳 25s 无退避 | 配合 A3，只容忍 ~4 次连续失败 | 待修 |
| A17 | `src/lib/db.ts:5756` | canvas 租约 330s 与执行租约 120s 两套标准 | 无统一租约配置源 | 待修 |
| A18 | `provider-balance.ts:14` | 余额缓存 5min/错误 30s/探测 12s | 数值合理，但**无低水位告警钩子**（10-28 欠费事故零预警） | 待修 |
| A19 | `app/api/agent/route.ts:167` | SSE pushEvents 700ms | 100 并发会话=140 内部事件/秒 | 观察 |
| A20 | `image-job-repository.ts:14-15` | claim 容量检查与并发上限耦合在同一 SQL | 并发闸门值源自 A11 defaults，改并发要动三处 | 待修 |
| A21 | `fleet/release-relay.ts:10` | 30s/20KB 平铺魔数 | 合理但无命名 | 低优 |
| A22 | 图片下载上限 32/48/32MB 三处不一致 | apimart-preset:161、channel-image-response:25、reverse-hub-images:115/159 | 有 readBounded 防护，数值应收口 | 待修 |
| A23 | `db.ts` vs `db/connection.ts` | 两处独立 max:5（同 A1） | 配置漂移温床 | 待修 |
| A24 | worker 状态持久化陷阱 | docker restart 的 SIGTERM 触发优雅停机**把旧状态写回** /release-state/worker.json | 删状态文件复活 worker 必须 stop→删→start，顺序错=白删（10-28/10-29 两次验证） | 待修·运维姿势写进 runbook |

### ⚪ 低风险/有意保守（6 处，记录不修）

- 文件大小类：图片 12MB / JSON 2MB / brand-logo 2MB / 模板 8MB（readBounded 全覆盖，数值一致）
- OCR `maxAttempts` 正经重试（`canvas/ocr/route.ts:32`，好例子）
- 前端轮询 1s/4s/5s/10s/30s（量小无害）
- auth 登录限流 10 分钟窗口（DB 版，`auth-login-limit.ts`，分布式正确）
- fixture-server 测试专用
- `feature-access` 30s 刷新

---

## 三、事故根因存档（已闭环，保留证据链）

### C1. apib 欠费 402 全站生图失败（10-28 17:00 ~ 10-29 09:20）
- 直发实锤：`insufficient balance (current: 0.045074 USD, required: 0.050000)`，token_id=152064
- 表现：flare/sunburst/gemini 全 402 → pre-submission-failed ×105 → 兜底文案"请调整图片或描述后重试"误导员工反复改提示词
- 充值 $200 后秒恢复；22 员工、105 次调用受影响，全部 0 积分结算（无人被扣钱）
- 排查链可复用：`app_supplier_calls.state='pre-submission-failed'` + evidence httpStatus → 容器内 node 解密 key（aesKey=sha256(SETTINGS_SECRET)，AES-256-GCM）→ `GET api.apib.ai/v1/user/balance`
- **教训：管理后台余额页（/api/admin/bi/provider-ops）在欠费时余额 API 也 402→显示"通道异常"掩盖真因。必须加低余额告警+402 专项文案**（对应 A18）

### C2. tick 503 → worker 死锁暂停（10-28 至 10-29 共 5 次，峰值测试再证实）
- 链路：峰值 DB 池忙 → tick accept 3s 拿不到连接 → 503（A1+A2）→ worker 自暂停；若 503 发生在回执 INSERT 前 → DB 无回执行 → reconcile 409 → resume 被 UNKNOWN gate 挡 → 死锁，watchdog 也救不了
- 复活姿势（已两次验证）：`docker stop`（等完全退出）→ 宿主机删挂载源 `<slot>/worker/*.json` → `docker start` → resume（容器内 node fetch 127.0.0.1:3001/control，header `x-video-worker-secret`；容器无 curl/wget）
- watchdog 陷阱：deploy.lock 被持有时 watchdog 整体跳过（`flock -w 10 || exit 0`），**发布/峰值测试期间 wedge 无人自动救**
- 根治（未做）：①tick accept 503=服务端从未受理，worker 应重试不 pause；②reconcile 遇 DB 无回执行应放行清 lastTick；③tick 专用小池（控制面隔离）；重构线 PG NOTIFY 合入后整个机制消失

### C3. dataUrlToBytes 正则爆栈交付失败（10-28 发现，修复已上线）
- 根因：`^data:([^;]+);base64,([A-Za-z0-9+/=]+)$` 对 650 万字符 base64 V8 爆栈；图已生成存在 checkpoint，仅交付阶段炸
- 修复 `codex/fix-dataurl-stack-20261028`（indexOf+逐字符校验版）已合并 main 并随 image-stability-20261029 槽上线（容器 chunk 实证无正则）
- **同款残留隐患（新增发现）**：`chunks/35552.js` 两处 `/^[A-Za-z0-9+/\s]+={0,2}$/.test(b64_json)` ——supplier 响应解码与 reverse-hub artifact 路径，对 MB 级 b64_json 同样可能爆栈，待换非正则校验
- 10-28 存量 45 笔图全在 checkpoint，手术方案已备（等 deploy.lock），B 批 83 笔 0 积分结算无需手术

### C4. 三次排队 wedge（10-26/27，已闭环）
- 固定 admission key 卡 unknown（b1a0c5df 已修）、boot draining 陷阱（docker start 后需 `UPDATE app_release_boots SET admission='open'`）、跨版本身份断言
- 详见记忆 naumi-47-queue-wedge-20261026

---

## 四、操作→症状→根因因果链（站长/客服/维护者对号入座用）

> 每条格式：**做了什么操作 → 出现什么现象 → 背后根因（对应编号）**。新案例按同格式追加。

| # | 操作 | 症状 | 根因链 |
|---|---|---|---|
| D1 | **管理中心查询任务列表（时间窗开到天/周级）** | **整机卡死**（web/nginx/SSH 全变慢，几分钟后自愈或重启） | 查询 Filter 含 `snapshot->>'status'` 等 jsonb 运算符 → PG 必须把每行 snapshot **整体解压（detoast）**；时间窗索引自带 `COALESCE()` 表达式与查询写法不匹配 → 优化器弃用索引 → **全表 17,482 行 seq scan × 平均 105KB/行（2K 任务 5-6MB）≈ 1.8GB 瞬时内存+全表 IO** + UNION ALL 三表 + 每行 2 个 ledger 相关子查询 → 7GB 小机内存爆/swap → 全容器卡死。EXPLAIN 实证 Seq Scan（10-29）。对应 B1+A25。**规避：大窗口查询一律走 DB 限定查询（只选 id/email/created_at，不碰 snapshot）** |
| D2 | **峰值流量/压测/集中提交生图** | worker 自暂停、全站生图停摆（已爆发 5 次） | 5 连接池（A1）被 MB 级 patch 事务（B1）占满 → worker tick accept 3s 拿不到连接 → 503（A2）→ worker 自暂停；若 503 发生在回执 INSERT 前 → DB 无回执行 → reconcile 409 → resume 被 UNKNOWN gate 挡 → **死锁，watchdog 也救不了**。临时解=stop→删状态文件→start→resume（见 A24 姿势） |
| D3 | **2K 分辨率 + 多参考图生成** | 前端显示失败，但图已生成（预占积分挂着） | dataUrlToBytes 正则对 ~650 万字符 base64 爆栈（已修，C3）；**残留同款**：supplier 响应与 reverse-hub 路径两处 `/^[A-Za-z0-9+/\s]+={0,2}$/.test(b64_json)` 对 MB 级串同样可能 RangeError |
| D4 | **供应账户余额耗尽** | 全站报"请调整图片或描述后重试"，员工反复改提示词 | 402 被兜底分类成 REQUEST_REJECTED（C1）；余额查询接口欠费时也 402 → 后台显示"通道异常"掩盖真因；无低水位告警（A18）。**排查链：app_supplier_calls.state='pre-submission-failed' + evidence.httpStatus=402 → 直查上游余额** |
| D5 | **服务器/容器 docker start 拉起（非蓝绿）** | 派发空转、队列停滞、无人报错 | 新 boot 准入卡 `draining` → 所有 claim 被静默拒 → 扫描空转。修复=`UPDATE app_release_boots SET admission='open'`（C4） |
| D6 | **worker 卡死时删状态文件后 `docker restart`** | worker 仍然 paused，白删 | restart 的 SIGTERM 触发优雅停机**把旧状态写回文件**（A24）。必须 stop→删→start |
| D7 | **发布/峰值测试持 deploy.lock 期间 worker wedge** | 无人自动救，生图停摆持续到人工介入 | watchdog `flock -w 10 \|\| exit 0` 拿不到锁**整体跳过**（D2+A24 复合） |
| D8 | **长任务（2K 60-180s）执行中遇一次 DB 抖动** | **双执行/双扣费风险**（尚未实测爆发） | 心跳 25s 续约 catch 里 `clearInterval` = 一次失败永久停跳（A3）→ 120s 租约过期（A3）→ 下一 tick 二次 claim 同一任务 |
| D9 | **生图提交高峰排队变慢** | 体感 2-3 分钟（上游只要 20-40s） | 有效吞吐 ≈ 5 连接 × 100-300ms/事务 ≈ 25 事务/秒（B1 patch 整行重写）；交付占 80% 时间另有媒体单并发 assert（A4） |
| D10 | **画布媒体处理高峰** | 交付排队、占满任务全程 80% 耗时 | 媒体 worker `assert(并发===1)` 禁改（A4）+ 图字节在 DB 进出 4-6 次（B2） |

---

## 五、修复班车建议（按依赖排序）

1. **紧急**：A3 租约/心跳错配（双扣费风险）——心跳失败改退避重试而非 clearInterval；租约 ≥ 路由超时
2. **止血**：A1 池 max 收口 env（PGPOOL_MAX，两处一起改）、A2 放宽+tick 专用池、A9 bootstrap 出厂值与现行配置对齐、**A25 created_at 索引（CONCURRENTLY 在线加）+ admin 查询两段式改造**
3. **治本**：B1 图字节出库（R2 直链）→ 顺带解决 A4 媒体单并发的内存顾虑后可放开并发；snapshot 瘦身后 D1/D2/D9 全部缓解
4. **配套**：低余额告警（A18/C1）、402 专项文案、容量参数启动自检+健康页展示、A24/D5/D6 复活姿势进 RELEASE_RUNBOOK
5. **随重构线消化**：B3 老路由异步化、A6/A10/A12、tick 机制整体废弃（PG NOTIFY）

---

## 六、请 Codex 详查清单（交接请求，2026-10-29）

以下事项本台账已完成"现象定性+代码定位+量化取证"，需要 Codex 做代码级详查与修复方案设计。每条附验证入口。

**X1. admin/BI 查询与 TOAST detoast（D1/A25）——最优先**
- 现象已实锤（EXPLAIN Seq Scan + 17,482 行×105KB），详查范围：
  a. `src/lib/bi/repository.ts` 全部引用 `snapshot`/`parameters` jsonb 列的查询（operationSource/operationSummary/operationList/anomalyWatch 等），逐一评估 detoast 放大倍数
  b. `app_canvas_image_tasks.parameters`、`app_video_tasks` 是否同样存大字段（参考图/结果），量化
  c. 设计修复：两段式查询（先窄列筛时间窗+分页，再取当页 snapshot）或 status/stage/error 提升为 STORED 生成列（注意 ALTER 全表重写需发布窗口），或直接借 B1 瘦身
  d. 顺带核对 7 个 `app_bi_jobs_*` 部分索引表达式与查询写法的匹配性（本次 COALESCE 不匹配即翻车点）
- 验证入口：`EXPLAIN SELECT j.id FROM app_image_jobs j WHERE j.created_at>=now()-interval '1 day' AND j.snapshot->>'status'='done'` → Seq Scan

**X2. 租约/心跳双执行窗口（A3/D8）——资金风险**
- `src/lib/image-job-repository.ts:11`（120s）vs `generate-image` 280s 路由超时 vs 2K 真实 60-180s
- `src/lib/durable-image-jobs.ts:375-377` heartbeat catch 即 clearInterval
- 详查：是否存在二次 claim 后 paidOperations 幂等键兜底？若有，双扣费窗口是否实际被防住（读 checkpoint 提交协议）；若无，补防线
- 修复方向：心跳退避重试；租约时长与任务超时对齐或心跳续约加余量告警

**X3. tick 通道与池隔离（A1/A2/D2）——已爆发 5 次**
- 方案已给三件套：池 env 化（两处 max:5 一起）、tick 专用小池、worker 503=未受理重试不 pause + reconcile 无回执放行
- 详查点：`worker-tick-receipts.ts` bounded() 的池来源（当前共用主池）；worker 侧 `runtime` 状态机对 503 的分支（`lib/worker/`）

**X4. 大正则残留（D3/C3）**
- 两处 `/^[A-Za-z0-9+/\s]+={0,2}$/.test(b64_json)`（supplier decode-base64、reverse-hub artifact），换非正则校验
- 顺查全库其他对用户可控大字符串（base64/URL/JSON）执行 `.test/.exec/.match` 的正则

**X5. 交付/媒体路径（A4/B2/D9/D10）**
- R2 直链改造的落点（snapshot 只存引用、API 剔 data URL）已有方向，请出实施切片；媒体并发放开的前置=图出库后内存核算

**统一验收口径**：每项修复合入后，在 47 以峰值（60 并发）复测 D1（admin 大窗查询不卡）、D2（tick 不 503）、D8（kill -9 DB 一次长任务无双 claim）。

---

## 七、增量记录区（新发现按日期追加于此线以下）

### 2026-10-29 增量
- **A25（🔴）admin/BI 查询 detoast 卡死整机（D1）**：`bi/repository.ts:83-103` operationSource Filter 引用 snapshot jsonb 运算符 → 全表 detoast 1.8GB；时间窗索引因 COALESCE 表达式不匹配未被使用（EXPLAIN 实证 Seq Scan）。修复=created_at 索引 CONCURRENTLY + 两段式查询 + B1 瘦身。详查请求=X1。（发现者：主会话）
- **D1-D10 因果链十条**成文（第四章），供客服/站长对号入座。

<!-- 格式：
### 2026-MM-DD 增量
- A26 `文件:行` 值 → 问题一句话（发现者：xxx）
- D11 操作→症状→根因
- X6 新详查请求
-->



### 2026-10-29 第二棒接手：X1–X5 全部纳入本线程（基线 7c459136）

模块与职责：本线程接手第六章 X1–X5，父线程独占总台账编号、证据校正及固定提交整合。此前“已指派 Codex”不代表别的会话已经认领或完成。

- 基线：`7c4591361514309b0af1cef295c0c138e84b47c4`；原台账按字节从共享根复制，历史章节保留，当前判断在本节追加。共享工作树和原台账不作修改。
- X1：admin/BI 查询 detoast；首批派发对象 Claude Opus 5.5。拥有 BI 查询切片，保留 `eb1290b7` 同事务连接复用；验证筛选、排序、分页、总数、父子和权限语义。
- X2：租约/心跳、fencing、paidOperations 幂等；首批派发对象 Codex。拥有 image-job-repository / durable-image-jobs 持久化核心，区分重复执行风险与实际重复扣费。
- X3：tick 回执、运行时与池隔离；首批派发对象 Codex。拥有 worker-tick-receipts / worker-runtime / db/connection，验证迟到连接回收与明确未受理协议。
- 本次入账时首批状态为“待实际派发”；真实 taskId/link/status 由本工作树 ignored `output/capacity-audit-wave2-20261029/DISPATCH_PLAN.json` 记录，创建成功不等于修复完成。
- X4：首个可用槽处理大 base64 正则和线性解析；X5：等待 X2 固定持久化接口，使用现有本站 storage 适配迁出 snapshot 中的图字节，不默认指定 R2 或公开直链。
- 新领域下一切片优先图片 sharp / postprocess / 缩略图管线；随后自动保存/传输、账务热路径、运行时/日志、Agent/视频/上传持续入队。子任务使用独立文档，不重复编辑本总账，不再委派。

事实校正与待证项：

1. **A1/A23 的“双份主池”在本基线已过时。** 当前 `src/lib/db.ts` 从 `@/lib/db/connection` 导入并重导出 `getPool`；普通主池由 `src/lib/db/connection.ts` 创建，`max:5` 只有该实现。池隔离和总连接预算由 X3 另行验证，不再按“两处一起调大”执行。
2. B1 表尺寸、行数、100–300ms、D1/D9 量化来自原记录的历史观察，本轮未重测。表总尺寸除行数不等同逐行 snapshot 大小，Seq Scan 本身不证明所有行都执行 detoast；`5 / 事务耗时` 只是粗略模型，不是本轮容量实测。
3. D8 的心跳错误与租约失效是 X2 的验证对象，二次 claim 风险不等同重复付费已发生；需检查 checkpoint、供应商受理状态、结算唯一性和旧 owner fencing。单纯加长租约不作为闭环。
4. C2/X3 中“503=未受理”及“无回执即可放行”不是通用结论；HTTP 503、单次 GET 404 均不构成付费任务可重放证据，保留 UNKNOWN 与原始回执。历史删状态/手动 open 操作不移植为自动恢复方案。
5. sharp.clone 不直接证明全幅 raw 像素复制；100MP×RGBA≈400MB 仅为像素账，不等同 RSS；libuv 不承载全部 HTTP/TLS 工作。以真实调用路径和隔离实测校正。
6. A14 的 maxRetries=0 可能承担已受理防重放语义，按调用协议审查，不全局打开重试。X5 不把“R2 已配置”当作当前站实际存储已验证。

公共接口与数据/事务归属：X1 复用现有授权事务；X2 拥有任务状态与付费幂等；X3 拥有控制面回执及连接生命周期；X5 待 X2 接口稳定后接入。跨切片变更由父线程串行协调。

验证及状态：本次仅台账原字节复制、追加内容/差异和副本回滚校验；业务修复、隔离 PG/并发验收和固定提交尚待子任务返回，不计功能迭代或线上完成。每项交付 baseline/modified/rollback 的命令、输入、实际输出与退出码，并保留 MODIFIED_FILE、DIFF_FILE、VERIFICATION.txt、可执行 ROLLBACK.sh。

未完成项与下一步：实际启动 X1/X2/X3 后记录真实任务句柄；回传后审查并串行整合，接续 X4/X5 与图片管线。47 用户 HOLD 持续：本轮先无 SSH；不部署、切流、重启、业务写、清 UNKNOWN、付费调用或生产故障注入；45 笔手术和 created_at 在线索引仅挂账。GLM 仍在处理现场。


### 2026-10-29 第二棒首批整合：X1 / X2 / X3 与父线程复核

模块与职责：父线程串行普通 merge 固定提交 X1 `074533f5255d623b210362c71d240d651816d6f0`、X3 `547de0b85040962ba4858e62f69b5b8de31990cc`、X2 `c7b050e4d63548fd80587ea1a95989b30860ea5c`。下述为本地隔离复核，不是线上容量或部署结论。用户已明确排除全部 Opus 模型；X1 的两次 Opus 尝试保留失败/取消证据，实际功能交付来自 Codex。

#### 已证实并修复的切片（总项不自动关闭）

- **A25 / D1 / X1 子项**：企业 `queryEnterpriseOperations` 先展开 UNION 的 JSON/账务再分页，现改为保留授权/日期/原状态语义的窄键筛页、MATERIALIZED 页屏障及当页投影。父线程实际 PG 复测 362 条授权候选/每页 7 条：无状态筛选账务聚合 362→7，shared block accesses 9,925→876；数值是同一隔离合成样本的执行计划累计访问，不是生产 RSS、唯一页或容量上限。45 组语义检查、撤权/总数/MVCC、跨源同 ID 与父子物理行均保留。管理 `queryBi(operations)` 基线本来已有窄键分页；源码只定义 4 个 app_bi_jobs_* 索引（3 partial+1 expression），线上“7个”未实测。状态摘要/非空状态筛选/anomaly 的 detoast 前置仍开放。
- **A3 / A16 / D8 / X2 子项**：120s 租约和25s正常心跳保持，单次错误后用单飞1/2/4/8s有界退避；本地期限不可逆失效，迟到成功不复活。取行锁后以 PG clock_timestamp 验证，钱包等待后的结算在同一事务复检。root/child paid入口、hold/evidence均保留token与checkpoint fencing。父线程复测真实PG并发及实际应用HTTP/route/计费通过；8路同operation结算仍为1笔6积分，不把风险写成已证明同operation双扣费。子任务280秒实际时钟续租证据已重开检查，父线程不重复记作新的280秒实测。
- **A1 / A23 / A2 / D2 / X3 子项**：只有一个普通池工厂；进程Symbol单例与同代配置冻结，业务池默认5不变，tick回执专池默认2。预算15是每Node进程5+2+其他池8的源码预算，不是生产余量。父线程复测业务池饱和时tick GET/read/accept/complete通过，迟到checkout基线已释放而非本轮新增修复；503/404/timeout仍保持UNKNOWN。可靠未受理凭据及有界恢复协议继续开放。

#### 父线程新编号与修复

- **A26 / D11：借出连接断开触发未处理 error，Node 退出。** X3 的 tick连接已修；父线程进一步发现X2故障包装器替真实Client绑定了error listener，不能证明真实心跳路径存活。直接使用真实普通池Client，只终止本机测试刚借出的backend，已提交X2版进程exit1（Unhandled 'error' event）；补上 heartbeatImageJob 借出期间监听、坏连接销毁及保留原错误，修改版exit0且下一次真实续租成功。新增 `scripts/verify-image-heartbeat-connection.cjs` 无测试监听掩盖该缺陷。副本恢复原hash后再次重现exit1。普通业务仓储其他借出路径不在本切片，继续运行时审计，不声称全库断连已闭环。
- **A27：ROLLBACK失败仍归还不确定会话。** tick切片受控复现后release(true)；父线程心跳补丁同样只在确认回滚成功时普通归还。原错误保留，不把回滚失败降为正常busy。
- **A28 / D12：行锁/钱包锁等待越过租约，旧时间判断让旧owner继续提交。** X2的锁后及提交前复检在原事务中回滚扣减/ledger/预占/settled，父线程真实PG复核通过；不等同已发生生产双扣费。
- **A29：无owner或intent后失租仍进入执行回调、旧owner hold/evidence回写。** X2新增执行上下文/DB preflight与回写fencing，父线程复测对应回调0次。preflight和外部HTTP不是原子事务，已进入外部调用仍以原operation/accepted/unknown协议核对，不提供exactly-once承诺。

#### 集中验证与证据

父线程证据均在当前worktree ignored `output/capacity-audit-wave2-20261029/`：
- `review-x1-x3/integration/VERIFICATION.txt`：X1 BASELINE/MODIFIED/ROLLBACK各45组；X3基线/回滚14组、修改19组；原回执59项、scoped pool7项、WorkerRuntime25+真实进程1项；全项目TypeScript exit0（使用项目React19.3依赖），四文件copy-only回滚恢复原行为。
- `review-x2/PARENT_VERIFICATION.json`：X2基线/修改/恢复、原生终态4项、真实本地HTTP/route/计费并发、全项目TypeScript；原始子任务四产物及280秒日志另存副本。
- `parent-heartbeat/VERIFICATION.txt`：父线程新缺口BASELINE/修改/副本回滚/恢复、真实Client断连后下一次续租及租约回归；产物MODIFIED_FILE、DIFF_FILE、可执行ROLLBACK.sh均重开。

既有失败保留：企业集成401≠404已在X1原版/修改版复现，未改鉴权断言；X2扩展review在A+ redo及5个race后遇PUBLISH_STALE_DRAFT_BASE，整套未通过。X3子任务React18缺依赖的全项目类型检查失败保留，父线程使用匹配React19依赖后的组合源码tsc通过，二者不是同一环境结论。

接口与后续：X5复用kick/get(id,false)/set/patch/paidOperation/settle，不改operation、attemptToken或收费身份；holdImageJobBilling(id,token)为唯一既有签名变化。接续X4大base64线性解析、X5现有storage外置图片、sharp图片处理；X1剩余状态投影、X3未受理协议、两套扩展fixture及其他领域仍排队。完整Next生产构建与线上验收未执行，47 HOLD/无SSH保持，45笔手术和在线索引仍仅挂账。三个功能模块已到同步点，合主线前再次fetch并记录最终固定SHA到本地计划。


### 2026-10-29 X4：大字符串解析结论校正与真实修复

- **C3 / D3 / X4校正**：指定的两处 supplier/reverse-hub Base64 字符类在Node24.19、1/8/44MiB有效串/尾部非法/Unicode空白及真实4,202,552字符PNG转换中未复现爆栈。保留原文件及格式契约，不将“类似正则”当已证实RangeError。
- **A30 / D13：New API畸形Markdown图片起始符导致二次方扫描。** 实际 `new-api-image.ts::extractImageUrl` 的全局Markdown正则反复从未闭合 `![` 开始扫描；原函数1MiB样本子进程5秒超时，真实本地HTTP→原响应转换10秒超时。改为单向扫描并保留最后完整Markdown图片优先、最后裸URL次之、嵌套与空白兼容，裸URL路径不再物化全量match数组。固定提交 `238e45d99cd2857eb3e7ded14075ba67c0de2db8`，父线程已普通merge并复核。
- 父线程独立复测：12,066组原兼容性、46组Base64、66组真实本地HTTP/像素均通过；另加150,000组固定种子169029差分对照通过。基线与回滚各3组超时（exit1），修改版0失败（exit0），PNG原字节和实际RGB像素一致。实际脚本、输出及hash在父worktree ignored `output/capacity-audit-wave2-20261029/review-x4/VERIFICATION.txt`；四产物已重开，源码仍为修改版。
- 原测试加载器 `verify-image-postaccept-diagnostics.cjs` 缺少 `../model-config/local-image-rejection`，子任务在基线和修改版均exit1；保留QA后续，不用补桩伪装通过。Hub ledger为内存fixture，不冒称真实PG事务。
- 视频 `auxiliaryMediaBytes` 的8MiB直接输入RangeError，仅作后续可达性核验：公开schema上限512KiB且该范围正常，未证明线上可达；Agent harness相似Markdown替换作为Agent/前端传输后续候选。
- 本次未改imagegen/sharp、durable存储、供应商调用/计价/fencing。X5和图片管线仍在各自任务中；首个空位转向X3可靠未受理证明缺口。本次功能同步计数1/3；47 HOLD持续，生产动作0。


### 2026-10-29 图片处理首切片：复用已解码RGBA

- **A31 / D14：imagegen后处理初检的中间PNG往返及chroma重复解码原输入。** 固定提交 `01618bcfc58c32110c497bdb3c06e334f2582481`，仅postprocess/pixels/chroma与专属验证。复用独占规范化RGBA进行chroma和初始透明检查；原alpha上限在已有matte循环捕获，仅边缘处理时分配。普通不缩图成功路径观测从decode4/encode2/metadata3变为2/1/2；chroma不缩图5/2/4变为2/1/2；实际缩图保持3/2/2。计数是实际sharp pipeline调用，不是libvips内部缓存后的codec调用量。
- **否决反例保留**：子任务首版全raw缩图虽像素相同，却在12MP独立进程样本中出现RSS回退。最终真实缩图保留一次无损中间PNG，仅移除不必要初检解码；不调低质量/像素限额、不改全局concurrency/cache。`BENCHMARK-first-raw.json`、最终30个独立进程样本及RAW-RSS-PROBES均已父线程重开；这些仍是子任务本地量化，不冒充父线程重新做了30次测量或生产容量。
- 父线程重跑41个场景：27个成功输出编码字节/RGBA/尺寸/透明事实等价，14个拒绝保持相同错误；基线预算27项不满足（exit1），修改预算全过（exit0），独立副本回滚恢复原3文件hash和27项重复转换（exit1）。最终实际编码输出仍重新解码验收，保留全透明/透明像素消失/JPEG背景/EXIF/ICC/动画/坏图及资源上限约定。
- 实际调用方transformImage(imagegen/resize)、localEditSchema、mask→postprocess及原后处理/contract/intent回归通过；全项目TypeScript通过。没有PG/HTTP/对象存储端到端或完整Next构建，不把像素纯函数验证扩成全链路交付结论。
- 父线程初次Python启动器按大小写过滤Windows环境变量，漏保留SYSTEMROOT，Node启动阶段CSPRNG断言退出134；改为环境变量名大小写无关白名单后正常执行，原记录保留 `INITIAL_WINDOWS_ENV_FAILURE.txt`。业务代码未为该启动器问题改动。
- 证据：当前worktree ignored `output/capacity-audit-wave2-20261029/review-image/`，含四产物及父线程精确命令/输入/stdout/stderr/exit。外部函数签名和返回字段不变；未动X5存储/付费checkpoint、授权和fencing。
- 未完成：mask/input-assets及跨交付边界重复读取、媒体并发与整站峰值仍待独立验证。X5和X3未受理证明继续各自推进，下一可用槽开始前端画布保存/传输审计。功能同步计数2/3；47 HOLD持续，生产动作0。


### 2026-10-29 发布后续办：运行版本与 X5 审查修复

- **状态校正**：上一节“47 HOLD/未部署”是当时状态。用户随后明确腾出发布窗口并授权终止旧阻塞实例；47 已运行 `e1878018 / 1793247893`，含 X1/X2/X3 控制池/父心跳补丁/X4/图片处理。公开入口、NAS、权限及真实 tick 已验收，三锁释放。历史 scoped `CLEANUP_PENDING` 未伪造完成，完整记录见 `2026-10-29-release47-capacity-e1878018.md`。本次继续审计没有生产操作，不连续发布。
- **A32 / B1/B2 / D15 / X5**：Buffer/child 原已有外置，真正缺口为 root 汇总 data URL/base64 重入 snapshot。X5 `36909cfb` 复用本站 storage，结果引用携带位置/hash/大小，失败保留 inline，无悬空引用；不强制 R2 或公开直链。真实隔离样本 1,182,147-byte PNG：root JSON 从 3,152,658→910，root+child 4,729,715→2,609，原字节/像素不变；这是 JSON 字节数，不是生产 TOAST/RSS/吞吐。
- **A33 / X5 P1（已修未部署）**：用户对象型 style 可保留新内部 marker，payload 解码读取另一已知 job checkpoint。父修 `4040c679` 给 result decode 绑定真实 job；payload 无结果权限，storage I/O 前核对 key job hash，新 marker 强制 hash/size；JSON 文字字段及 parentIds 真类型校验。原版确定性复现读取 1 次，修复读 0 次；原生签名 Cookie POST 400，实际历史恶意 payload create/kick 回调0、另一账号作品0。未声称未知 key 可枚举。
- **A34 / D16 / X5 P2（已修未部署）**：已存在完整最终图/root，但无关坏 child 引用使整体 snapshot decode 提前失败。父修先纯选择 checkpoint、保留原 allDone/UNKNOWN 规则，再仅 hydrate 必要 URL；真实 PG/媒体恢复 final/root 两例通过，必要引用缺失仍失败、供应商增量0。
- X5 同次集中验证：原存储及本地 S3、native HTTP/PG/授权/结算、并发 route 以及终态4项、全项目 TypeScript通过。此前 accepted-timeout 波动本轮同原断言通过，原失败日志继续留存，根因未闭环。旧 postaccept loader 缺 image-plan-runtime、delivery-retry error≠done 均在修前/修改版复现，不能称这些套件全绿。
- X5 新四产物与原/改/回滚精确命令输出位于父 worktree ignored `output/capacity-audit-wave2-20261029/x5-boundaries/`；独立文档 `2026-10-29-capacity-x5-boundaries.md`。副本回滚恢复原 hash/两个缺陷，后来编辑 guard exit73且0写入，修改源码保持；本地55435 fixture已停止。
- **X3 v2 独立审查**：固定 `5d8d116b` 真实PG/HTTP与34个Worker回归、18组协议矩阵、91组合fixture通过，复核发现1项P2：negative物理accepted_at被两处既有健康查询当“已受理”。该提交尚未整合，先修默认v1旧schema兼容的读取投影；不可排除全部phase=unknown。报告在独立 review 的 `output/capacity-x3-review/REVIEW.md`，不把默认未启用协议写成上线。
- 并行已实际派发：X3 v2独立review、画布保存 `613cf62b` 独立review、发布 task snapshot 固定主键有界采集实现。总台账编号仍由父线程分配。47线上不动；45笔surgery/在线索引、账务sum/事务长度、运行时连接生命周期、Agent/SSE/视频上传、前端其他保存与传输继续排队。
- X5后续上线前仍需：本站实际存储/共享媒体边界与兼容reader回滚，历史数据迁移/孤儿保留另切片；本次合主线不代表这些已验收。


### 2026-10-29 X3 v2 与画布保存独立复核收尾

- X3 v2 `5d8d116b` 与画布保存 `613cf62b` 已普通合入父任务隔离分支，独立审查提出3项问题，父线程直接修复并集中验证。协议v1仍默认，47本轮不改、不重新发布。
- **A35 / D17：negative tombstone被健康查询误记为受理活动。** enterprise/admin两处读取先查询pg_attribute列能力，再只看nonacceptance_at为空的记录；避免整行to_jsonb读取result JSON，兼容尚未惰性迁移的v1 schema。原running/completed/accepted-unknown都保留；negative-only显示0/null，混合真实unknown显示1。真实独占PG四类基线/修改/回滚验证通过，tombstone不删、扫描0。
- **A36 / D18：配置409后的位置200误删配置草稿。** queue成功ACK只确认本意图；新的明确保存覆盖旧拒绝意图全部写字段时才替代，x/y不代替config/inputs，uncertain不删。实际Hook+设置/拖动调用+原未保存提示JSX+Chromium/HTTP复现修前dirty0/草稿删除/flush成功，修后dirty1/草稿保留/flush拒绝，刷新后仍可恢复；显式完整配置重存后正确清除。
- **A37 / D19：首节点永久409使其他节点的显式重试饿死。** retryPending按节点隔离，A失败保留其顺序与CAS但继续B，最终汇报失败；两次按钮原请求A,A，修后A,B,A，B恢复、A保留dirty，无后台新增重试。
- 父线程集中验证：画布边界8组（包括明确替代、nonce、A/B/A、预算、账号空间ABA、StrictMode/卸载）、原生PG/HTTP/Hook23组；X3协议真实PG/实际route18组，扫描10/合成付费callback10、真实供应商0；Worker34/34；全项目tsc exit0。模拟auth/service与真实PG仓储层级分开，不冒称完整生产浏览器验收。
- 仅副本回滚恢复原3源码hash、三个原问题，并删除副本新增3文件；后来编辑guard exit73且0写入。四产物与精确命令/input/stdout/stderr/exit在父ignored `output/capacity-audit-wave2-20261029/review-followups/`；文档 `2026-10-29-capacity-review-followups.md`。
- 事实校正：此前并发派发第三个 release collector 的调用最终返回 `parent_not_active`，没有成功taskId，不能把“调用已提交”记成实际开工；本轮下一批重新实际派发并记录返回句柄。画布与X3两个review确已完成，两个代码切片修复后方可合主线。
- 下一批：release任务快照有界读取、账务余额sum/长事务/BI保留、Agent会话SSE/Markdown/上传，独立职责分工。历史生产容量/完整生命周期、45笔手术与在线索引继续挂账。既有fixture与accepted-timeout波动未自动关闭。


### 2026-10-29 普通业务连接生命周期父线程复核

- 固定提交 `19f19d9d27b4ff5c54a36c40ebb6844719503c87` 已由父线程普通合入隔离分支，改动仅普通池连接监听、工作台事务封装及专属测试/文档。不是重复登记此前X3 tick/heartbeat修复。
- **A26 / D11 普通业务池扩展切片**：物理connect事件安装一次Client error listener并处理Pool idle error，防止借出无查询、空闲、关闭中、执行中连接断开演变成Node未处理error退出；不提前release、不重试SQL、不调整业务池5或总预算。按坏物理连接WeakSet去重固定短日志，不输出参数/凭据。
- **A27 工作台子项**：真实事务backend被终止后，原ROLLBACK断连异常覆盖原57P01；中间connection-only对照preserved=false，完整修改preserved=true且release(true)。正常成功/业务失败/SQL错误仍沿原同一事务，回滚成功复用健康连接。
- 父线程本轮重跑真实PG/Node矩阵：基线/副本恢复各5个故障子进程exit1、4个正常exit0；修改9/9 exit0；connection-only中间对照另跑9组。正常20并发事务、100次callback、25次模块重载、迟到checkout、关闭围栏/下一代池均检查。测试只kill刚借出的本机fixture backend，无生产故障注入。
- 父线程内存/Worker/v2/真实重启回归38/38，全项目tsc exit0。子任务依赖不齐导致的36项同基线诊断仍保留，父线程通过基于匹配React19的另一环境，不抹除原失败。未跑HTTP/浏览器/生产容量，不将这些列为通过。
- 四产物及完整精确命令/输入/字面输出/exit位于父ignored `output/capacity-audit-wave2-20261029/runtime-parent/`。副本恢复2原hash/原故障；后来编辑guard exit73/WRITES=0。所有自有fixture已移除，源码与修改副本保持。
- 本轮未连接或修改47，未部署；45笔手术和在线索引仍挂账。账务热路径与发布采集器由已派发独立任务继续；下一空位推进Agent会话/SSE和Markdown可达性，避免扩大本连接补丁。

### 2026-10-29 账务 FIFO 热路径父线程闭环

- **A38 / D20：小额扣减先锁/传回 owner 全部活批次，跨批次逐条 UPDATE。** 固定子提交 `7e148a6542a35902adc72d727b3574f685dc80ca`；现代 `debitTx` 和兼容 `deductPrincipalFIFO` 共享原事务内的 FIFO 前缀 UPDATE，保留 owner-first 锁、冻结报价、operation/ledger 幂等、部分成功/BYOK、UNKNOWN hold、租约失效整笔回滚。没有扩大连接池或新增索引/余额缓存。
- 父线程从 `9aaf16af` 普通整合并核对全部运行时批次写入，五个兼容入口均在同一事务先锁 owner；未发现新依赖环。现代 FIFO 排序保持，legacy 相同到期/创建时间新增确定 `id` tie-breaker，旧并列顺序原本未定义。人工导入/测试脚本的直接写入不计为正常运行时路径，本轮不执行它们。
- 父独占 PG（55489）原/改/修改副本/回滚各语义11/11。1万活批次扣6：原返回1万行、无关尾锁55P03；修改聚合返回1行、尾锁空闲。跨60批次扣600的扣减SQL为61→1。仍扫描/排序 owner 活候选，不是O(1)，同owner完整事务中位耗时没有全面改善，未推断生产吞吐。
- 父原生 wallet、balance-refresh、recovery、billing rules 均exit0；X2实际仓储/账务租约回归exit0，同operation一笔-6、失租不扣、UNKNOWN留hold。父React19.3全项目tsc exit0；子React18 import失败及36诊断保留。补充大于int32的窗口累计与事务跨到期原/改/恢复三版均通过，不宣称改变钱包镜像上限或旧now()语义。
- 仅副本恢复2原hash/原性能预算失败；later-edit guard73/0写入，源码和MODIFIED_FILE保持修复。四产物及原生命令/输入/输出/exit在父ignored `output/capacity-audit-wave2-20261029/billing-parent/`，独立模块文档第7节补父验收。父容器停止、端口关闭。
- **未完成仍明确保留**：重复expire/refresh扫描（5次请求仍25SQL）、BI访问日志保留、完整生产容量；源码另发现BI用户管理调用方仍全活批次加锁，即非积分动作也走，待定向复现，不计新实测编号。release collector与Agent流任务继续独立推进。47无SSH/生产操作，新增main修复未部署；45笔手术、在线索引和accepted-timeout历史波动未关闭。

### 2026-10-29 Agent SSE / Markdown 父线程复核闭环

- **A39 / D21：工作台SSE取消过早释放running、持久化期间漏abort、初始化及enqueue异常资源清理缺口。** 固定子提交 `fbe30f4e9dd378602f905eb2d5a018ae76c3f482` 保留running到原prompt/runtime收尾；transport立即清理、GET只读、已受理持久工具不删除或重放。两个700ms interval合成一个pump，原780000ms期限不变；旧两个轮询不等于每tick都发心跳。
- **A40 / D22：Harness.publicText图片Markdown替换重复扫描。** 同原媒体白名单/输出上限下改为两次单向扫描，inline→reference顺序保持。父12,009差分通过；192KiB未闭合起点样本原/恢复3秒超时，修改原字节保持。这是合成函数/HTTP/runtime证据，不是生产RPS。
- 父同步main `3ea76ef6`保留并行画布修复后普通整合。额外首帧enqueue故障seam复现子版清理后仍建timer并启动prompt，父加closed提前退出。此同步start边界尚未证明普通网络可达，作为A39初始化鲁棒性覆盖，不新增事故编号。
- 父route/Harness/local HTTP集中20项：原/恢复8失败exit1，子版1新增边界失败，父修改/修改副本0失败exit0。真实PG/runtime6项：原/恢复2项接纳断言失败，修改全过。新增真实PG行锁阻塞creation结果写入，模型已agent_end仍持running；取消后修改PUT409，解除锁原结果succeeded，modelStarts1，无付费调用。不是重复执行/双扣费证明。
- 父真实会话修复58项、会话控制/账号/项目隔离、network15、Harness104、stream-intent356、timeline29、tool-trace25、activity及全项目tsc均exit0。旧Harness-runtime原/改仍`ROUTER_UNAVAILABLE/not_submitted`失败；保留原日志和首次父gate清理观测竞态，未绕旧断言。
- 四产物与精确命令/输入/输出/exit位于父ignored `output/capacity-audit-wave2-20261029/agent-parent/`；副本恢复2原hash、移除1新helper、原行为复现，later-edit guard73/0写入。父PG55490停止且端口关闭，源码保持修改。详见模块文档父验收节。
- 长会话持久化/RSS、事件裁剪游标、前端恢复轮询卸载及画布流仍待独立切片。release collector `2cd03246`已交付待父复核，BI用户管理在独立任务验证中。47无SSH/部署，45笔手术/在线索引/accepted-timeout历史波动均未关闭。

### 2026-10-29 BI 用户编辑父线程闭环

- **A41 / D23：BI非积分编辑也锁并传回全部活积分批次。** 固定实现 `8b969fb8cd42c367309d85c7416c9ed6407e3517` 只修改`manageBiUser`：非零delta才窄SUM，profile/ban/role/reset-password/create0不再读取批次；原owner锁、同Tx、nonce/actor/HMAC、版本CAS、last-admin/自身保护、双审计和既有FIFO前缀扣减保持。非积分审计原本没有余额字段，不是删除审计换性能。
- 独立review普通merge `18b45047`，无新增可复现阻断项。真实PG三版各21组、额外各6组、原生BI与tsc通过；父重开报告/原trace/断言并核对源码hash一致。额外6组是review证据，非父复跑；包含合成金额与reservation边界、原now()保持和成功trace的单backend再断言，不计为新事故。
- 父从main `2f2c57e0` 普通整合，业务源码未再改。父独占55523实际原/改/修改副本/回滚各21/21 exit0，原生`BI_MANAGEMENT=PASS`、全项目tsc exit0。四非积分动作原返回10000行/尾锁55P03，修改批次SQL0/尾锁FREE，owner锁始终55P03；积分动作调用方SUM仅返回1行，仍有底层扫描和20条总SQL，不宣称O(1)或所有延迟改善。
- 副本回滚恢复原单文件hash及原返回/尾锁，later-edit guard73/0写入；修复源码保持。父四产物及完整命令/输入/输出/exit在ignored `output/capacity-audit-wave2-20261029/bi-mutation-parent/`；独立模块文档补父验收。父fixture停止、55523关闭，review55517已移除。
- 全局管理advisory锁、重复聚合/expire、BI审计保留和其他回滚连接边界仍未修复。发布collector等待独立review，工作台Agent客户端恢复轮询卸载为下一源码候选。47无SSH/部署，45笔手术/在线索引/UNKNOWN与历史波动仍挂账。

### 2026-10-29 发布采集器独立审查与父修复

- 固定子提交`2cd03246`在父基线main`2c2d194e`普通整合；独立审查REQUEST_CHANGES的2项新增P2与5项既有缺口均由父直接处理，未放宽COMPLETE/历史保护门禁，47无操作。
- **A42 / D24：原采集器全表snapshot先投影、闭包遗漏和原绑定不足。** 原生PK先限页，再小图/选中proof；有界固定点包含终态child、反向父、十层supplier链、原ID与batch绑定。父EXPLAIN保留258行原物化与32行新页对照。
- **A43 / D25：新增总期限实现复用旧statement额度。** 每SQL/生成页前重算剩余时间，初始timeout也受总限；2s预算受控1.5+1.6s延迟，子版约3.343s、修复约2.125s后psql3拒绝并留false证据（含本机Docker开销）。不宣传精确进程硬实时。
- **A44 / D26：新增fixture冷启动/清理异常丢RESULT且漏停PG。** 显式start受finally管理、TCP目标库SELECT1就绪；drop/stop/rm独立尝试，原错与清理错分开留存。实际PG除零清理故障仍移除自有容器，启动/stop异常另有单元覆盖。
- **A45 / D27（既有P1）**：paid root/child状态未留证导致started→queued被忽略；v3留state并按小表核推进，缺未派发/恢复证据的回退不追认。**A46 / D28（既有P1）**：冻结billing ledger_id进入原行证据，避免换指针仍通过。
- **A47 / D29（既有P2）**：未选历史ledger变更被新增数量掩盖；私有有界原ID→行SHA256逐原集合验证，纯新增仍允许，修改/删除加新增拒绝，公网仅指纹。**A48 / D30（既有P2）**：UNKNOWN state/phase无消解证据变终态拒绝，tick negative/accepted原字段冻结，历史exact-hash不变。**A49 / D31（既有P2）**：full模式falsey非object不再转空object。
- collection/image proof能力为v3；旧v1/v2或缺完整原集合的证据不回填、不追认。父37矩阵原/恢复17pass20fail，修复37pass；真实PG15定向组及10单元、原snapshot21pass1skip、normal37/enterprise4/completed-image4回归通过。保留性反例控制器PASS只代表符合各版预期，不等于旧版保护健全。
- 并行验证遇Windows1455资源不足与GBK终端异常，原失败/SQL/清理错误保留。仅核验并补清理本任务完整ID，串行复测；四产物/原改hash/副本回滚恢复2原文件移除3新增验证文件、later-edit73/0写入均在父ignored`release-snapshot-parent/`。修复源码保持，所有自有PG收尾移除，未操作其他容器。
- 此次是源码/本地真实PG/Python门禁fixture，不是生产容量或完整蓝绿验收。47下一发布须真实重采v3基线；45手术/在线索引/UNKNOWN/CLEANUP_PENDING/accepted-timeout旧波动保持。工作台客户端恢复轮询任务继续独立推进。

### 2026-10-29 A27 账务事务清理子项

- 固定实现`8f5a3606c2408f656434f448e81c5cc1eaa5741e`由父从main`cb1d2f49`普通整合。仅`withBillingTransaction`的ROLLBACK失败分支保留原抛出值、标记discard并finally恰好一次release；同一client上的BEGIN/action/COMMIT、健康复用和无自动replay保持。沿用**A27账务子项**，不重复计普通池listener或pg已有死连接淘汰。
- 父独占PG55527四轮串行：原/恢复14场景8pass6fail（exit1），修改/修改副本14pass（exit0），六项是同一清理问题的边界断言。修改48checkout/48release、active release0；24并发8成功16预期业务/SQL失败、峰值5。父只读源码/relay复核与父实际PG结果分层。
- 真实TCP relay吞COMMIT回包：服务器已提交和约束拒绝两例分别durable1/0，客户端均未知，action1次、原异常对象保持。另real-commit+adapter-ack拒绝seam证明后续ROLLBACK成功也不构成未提交证明；没有新增UNKNOWN状态机、重扣、重发或清hold。queryable但未清洁的ROLLBACK失败是显式SQL dispatch seam，不报告为生产自然SQL错误。
- 父原生rules/wallet/X2与全项目tsc均exit0；X2单operation一笔-6、UNKNOWN留hold、原租约fencing保持。五行固定断连日志无敏感参数；非Error sentinel直接验证成功回滚路径，不夸大矩阵覆盖。
- 父四产物与完整命令/input/literal/exit在ignored`billing-tx-parent/`；副本恢复1原hash及原六项失败、later-edit73/0写入，修复源码保持。四个父自有PG完整ID均移除、55527关闭，55432原连接未触碰。47无SSH/部署，其他事务调用方、45手术/在线索引/UNKNOWN和历史债继续挂账；工作台review仍待回执。

### 2026-10-29 工作台恢复轮询及独立复核修正

- **A50 / D32：客户端恢复观察在卸载/账号切换后继续GET，迟到续体覆盖会话与busy。** 固定子实现`dd93e342`从父main`9ab916c1`普通合入，单owner覆盖history→live→poll→final history，账号/会话代际、AbortController、timer/listener和已有发送/保存/插话边界统一清理。8次重挂原24请求/8timer残留，最终16请求/0timer/0listener；是本地场景，不推断全站/RSS硬上界。
- **A51 / D33（新增P2）：未载入目标历史失败误挡门户/原已settled会话并吞输入。** 父增加owner.installed/previousUnavailable；失败目标不占用当前会话围栏，但原unknown跨失败目标仍保留。门户只在send已本地安装原提示到消息后清草稿；被拦入口保留输入并给可见反馈，不把本地接纳当服务端receipt。
- **A52 / D34（新增P2）：cached user的ready=false→true被误判换号，清掉已受理SSE UI。** scope按真实email稳定；ready失效只清只读观察并保留当前未知，真实换号/ABA/卸载仍失效旧scope。显式/URL发送均保持原sessionId、结果及原身份保存。顺带修复既有匿名未ready URL先消费问题，不另凑新增回归。
- 父原29断言保留并补10场景：原版/恢复各39项7pass32fail、子候选30pass9fail，父修/修改副本39pass0fail。独立15项未改断言：原/恢复7pass8fail、候选8pass7fail、父修12pass3fail；剩余chat upload/rename/remove迟到跨账号问题两版均有，继续挂账，不伪称独立套件全绿。完整tsc exit0、stdout/stderr空。
- 证据为实际React19/WorkbenchClient/WorkbenchSessions、Chromium、原生timer与loopback HTTP；auth/backend/非相关UI为fixture，无PG/付费调用/完整Next/生产验收。恢复自身PUT/POST0；39矩阵12次mock PUT/10次POST均为显式发送/保存测试。显式stop一次DELETE、后端仍running时新显式发送409保持；脱离旧SSE只drain、不新发取消或重放。
- 父四产物、原改hash、所有原始stdout/stderr/exit位于ignored`workbench-parent/`；copy-only恢复1原文件、移除2新增文件、原32及独立8项失败集合恢复；后来编辑与真实源码目标guard均73/0写入，源码/修改快照仍为父修。细节见模块父验收节。47无SSH/部署，45手术、在线索引、UNKNOWN/CLEANUP_PENDING/accepted-timeout与长流/RSS仍保留。

### 2026-10-29 增量文档核对与遗漏登记（纯文档）

- 本次补齐顶部当前状态索引、原始X1–X5和A编号的剩余范围、产品总台账入口；历史正文保留，旧“待复核/待修”不再作为当前状态入口。当前 main `e9ef9ff6` 已包含本线程 `a5fe1c67`，已修部分不会因旧文字重新归类为未修。
- **A53 / D35（既有P2、已复现待修）**：`workbench-client.tsx::uploadOne / onChatPaste / chat file input`。操作：A账号提交附件上传，响应未到时切B；症状：迟到响应仍给B当前UI加入A的附件URL。实际独立R12在原版、候选和父修版均失败；仅证明本地UI续体串扰，未证明真实媒体越权读取。负责人：本容量审计父线程；下一切片。
- **A54 / D36（既有P2、已复现待修）**：`workbench-client.tsx::renameSession`。操作：A在真实历史抽屉改名，HTTP未完成时切B；症状：迟到503把B的error改为`fixture-503`。原/改一致，不属于A50–A52新增回归，不推断后端跨账号写入。负责人同上。
- **A55 / D37（既有P2、已复现待修）**：`workbench-client.tsx::removeSession`。操作：A删除历史，HTTP未完成时切B；症状：迟到失败写入B的错误态。真实按钮原/改均复现，待补齐异步归属并验证成功/失败/卸载/ABA。负责人同上。
- 三项证据引用父线程已执行且未改断言的 `output/capacity-audit-wave2-20261029/workbench-parent/{BASELINE_INDEPENDENT,MODIFIED_INDEPENDENT_FINAL,ROLLBACK_INDEPENDENT}/RESULT.json`；修改版12通过/3失败、原/恢复7通过/8失败均exit1。本次只重开记录及当前源码定位，没有再次运行浏览器或宣称新修复。
- 文档契约、相对链接、保留原文、Git差异与hash-guarded副本回滚证据放 `output/capacity-audit-wave2-20261029/ledger-refresh/`。只改本台账与产品总台账，不增加业务迭代/发布次数，不操作生产。

### 2026-10-29 X6 / A12 适配器局部闭环与未归因报告保留

- 固定子提交`e326374b`由父从main`c328f01c`普通合入；生产改动仅apimartImagesFetch的原task查询期限/退避/临时GET失败及失败下载body取消。头/体GET受剩余期限约束，等待裁剪到原预算；无进展2秒基数至8秒上限，状态/进度变化恢复快查；不扩大240秒上限、外层恢复预算或唯一生成POST。
- 父实际25项在原版9失败、子候选1失败、父修全过。新增反例发现parseReceiptJson保留数值为字符串，子候选progress类型检查使退避复位失效；父只解析此调度提示，不改金额/回执/UNKNOWN，沿用A12。真实GET断连、回执ID错配、持续503和进度复位补查均有证据。
- 五个模型的基线合成generate/edit/recover本来成功；原生Gemini/Seedream链路仍含上传→唯一POST→原task查询/下载→checkpoint→中断后恢复→私有媒体/用户作品→原报价一笔-6。模型/认证/backend为合成或本地模块，不是实际供应商与生产配置验收。**A56/X6线上“即梦/香蕉无结果”的原报告仍开放，不把A12局部修复当全部根因已解决。**
- 异步核心53/格式8/冻结参数PG16/参数计划25/受理身份PG18/异步账务通过；旧Seedream脚本原/改仍默认png断言失败，保留而不改绿。父准备期Windows动态import路径失败及tsc1.5GiB堆exit134均留证，最终类型和副本回滚结果见父ignored`x6-parent/VERIFICATION.txt`及[模块记录](2026-10-29-capacity-x6-adapter.md)。上传、运行参数等原派任务继续独立，不据本次回执关闭其他条目。

### 2026-10-29 A57/D39 上传解码内存父验收

- 固定`6ad2fb38`从父main`956b7238`普通合入；父未再改产品源码。无previews验证从全幅raw输出改为完整默认帧解码→单像素丢弃输出，保留failOn、64M上限、原字节及真正预览制作。metadata不冒充完整解码，browser previews原图仍沿原metadata路径。
- 父实际Sharp/route/storage/asset编排，原/改各39项，原图/thumbnail/preview SHA/尺寸/响应逐项保持，只有validationBytes不同。父PNG/WebP三并发各原改一次（四个独立进程），每组三次完整上传的raw输出1,536,000,000→768,000,009bytes；采样RSS下降但PNG耗时增加，保留全部结果，不外推生产容量。子36进程原始测量仅作为子证据，未重复认领。
- A58仅将同一原图验证/变体的64M常量收敛到已有policy；40M处理、64Mi Agent读取及64MiB字节预算保留职责，不通过缩小规格或改品质掩盖开销。未添加猜测阈值的并发门禁。
- 父完整tsc exit0、stdout/stderr空；副本恢复2原源码/移除新增helper及任务文件，原39项和原raw行为恢复，later-edit/source-root guard拒绝且0写入。准确命令/输入/输出/exit及四产物见ignored`upload-parent/`和[模块记录](2026-10-29-capacity-upload-memory.md)。无真实PG/生产/供应商调用；运行参数固定`7e5ece5f`尚待独立复核，不混作本项通过。


### 2026-10-29 47 发布窗口新增真实规模核查
- 用户本轮明确要求更新线上，并确认“现在没人用，允许直接切”；本轮只针对已确认47，先固定 main `b79c8c39` / BUILD_VERSION `1793281629` 完成 Linux 构建和镜像 smoke；实际切流状态见 [本轮发布记录](2026-10-29-release47-capacity-batch-r2.md)。不把 main 合并当上线。
- **A62 / D41：发布观察历史的筛选未前推至原生分页，真实规模令保留采集失效。** 当前 caller 已限定 old/new instance seed，但百万行 activity 仍先参与 scan；当前 pair 118169 条中未 finished 仅2。全图此前还会包含已 completed 的 tick 叶节点，真实 tick 表约46397行。现场只读采集在60s截止正确 fail-closed、无完整证明；不是生产业务写入失败，也没有错误放行。
- 本轮窄修复正在把无闭包入边的观察叶节点原生活动态/原ID筛选前推，同时保持原实例历史 exact-hash、业务表全范围、原任务ID终态追踪与 UNKNOWN 规则；默认预算、60s和scan100000不放宽。默认与明确审阅的page/graph资源上限分离将以真实规模和本地PG验证留证。
- 此条在真实复测完成前保持进行中；A15、运行配置review、A53–55、A59–61及其他容量/生产验收开放项不因本次发布准备关闭。


### 2026-10-29 23:47 发布实况与后续
- **47已切至b79c8c39 / 1793281629**，Web/Worker同固定镜像，公网version200、原生账号/DB/历史/3页Chromium通过，Worker真实tick complete200。恢复器已指新pair并在释放锁后执行成功。
- 旧Worker已停；旧Web的2个UNKNOWN观察原样保留且无入口，`DEPLOYED_CLEANUP_PENDING`，不是全局COMPLETE。完整快照图闭包超时与存储probe `DURABLE_LOCAL_BYTES` 继续开放；未清UNKNOWN/未重放/未回灌。详见[本次增量](2026-10-29-release47-capacity-batch-r2.md)。
- A62/D41范围修复已普通合main778fcf75，新增真实PG27、旧37和单元21+skip通过，父四产物与副本回滚完成；生产完整闭包性能仍未闭环，不能按本地通过划掉整个条目。
- A15收到固定652f4b07，尚未合main/上线；父独立只读审查REQUEST_CHANGES，发现每进程每分钟仅回收64桶导致持续不同key积压，需父修正后PG集中验收。运行配置7e5ece5f仍待独立整合验收，不混本次镜像。


### 2026-10-30 父线程继续推进（实际完成与开放边界）
- **A15**：固定子652f4b07＋父c73afaec普通合main a3580da8。父修满64后续请求继续、COMMIT后才发布冷却、单pool单回收占用者；保留一请求一条64候选SQL。真实PG持续到达、清理SQL/COMMIT故障、并发无重叠、共享窗口及实际route矩阵通过；82 AST与246 gate通过。全项目tsc一次exit0，覆盖同时完成的工作台修改。75文件副本恢复原Map双进程10/5和长窗误清理；后来编辑/坏payload均0写入。未上线A15，不把新旧混跑视作统一额度。
- **A53–A55 / D35–D37**：固定父3eeaa89e，工作台上传/粘贴/门户及rename/delete全部绑定账号/视图代际；ABA/卸载/会话切换取消观察资源、不重放后台请求。原13/34、改34/34、恢复原21失败；原39与独立15全部通过。副本恢复原hash，所有自有HTTP/Chromium退出，父重开hash并核对源码。源码已合main，线上仍b79。
- **存储probe旧失败已关闭**：固定1b2cd959，低空间remote-first原本合法，旧probe误把deferFlag当全local。修后9/9，回滚恢复原6项失败；有限47实测媒体目录空闲4,201,209,856 bytes，三对象均remote-ready/local0，真实NAS/HTTP/Range206/download/匿名401及清理通过，生成供应商调用0、业务镜像不变。不是修产品降质或换存储策略。见[存储验收](2026-10-30-nas-storage-probe.md)。
- **A62/D41性能子项**：固定bbcdcf61合main2a315f89，missing-child成员检查由每历史图重扫chosen改为一次ID maps；原预算下本地81981节点原超15s、改约4.86s，9组和旧37通过，副本恢复原超时。47真实只读整采48.101s完成图/闭包，scan81991、graph16,266,389bytes、roots26186；但selected33815超20000，返回unknown-selected-budget（image7827、supplier5500、costjobs4032等）。脚本exit0只表示成功留证，preservationVerified仍false。没有扩selected/row_limit，也不回填上轮发布证明。后续需处理真实历史证明规模，不以新性能改善关闭整个A62。
- **旧Web两条UNKNOWN已只读定位**：都是durable-image的recovery-dispatch-scan协调观察，键不对应具体image job，outcome为background-promise-unconfirmed；没有据此清状态或宣称付费任务未受理。旧槽收敛仍待独立证据/现行门禁处理。
- 首次Git schannel握手失败后仅本次命令改用既有OpenSSL后端正常fetch；没有关闭TLS校验或改全局Git配置。47只读采集首次遇部署锁占用即退出，后续独立重新获取三锁后执行并释放，没有抢占锁。
