# 2026-10-24 服务器稳定性与性能优化

## 目标与固定基线

- 目标：减少已确认的空转数据库/CPU开销和并发重复计算，使相同正常业务负载下服务器更稳定；不新增用户侧业务限额、价格确认或收费任务重放。
- 任务分支：`codex/server-stability-performance-20261024`；源码基线：`905c8c635e41ff3f4443d43db9776d1db3aab469`。
- 原通用文字生图分支 `codex/canvas-general-text-to-image-20261023` 与提交 `f6f738eaa409e966920c83b987156a1d335ea5ca` 保留；设计预览不是本次产品实现范围。
- 发布：独立本地优化先验证、提交推送；不把目标自动扩大为生产改配置/扩容/切流。当前线上保持已有固定版本，后续发布仍需明确协调与三锁蓝绿门禁。

## 现场只读观察（2026-10-24 00:36—00:38 Asia/Shanghai）

- 47 Web/Worker均为`e609c115164a68c5b3f88f353603237eed351d1d` / build`1792760965` / image`sha256:1bb8dbfd2f310f566922863fe0868ed9e9b28b6cc6f889360f645018732bcb6c`。
- 单完整Web、单Worker及5个基础服务运行；约4102MiB MemAvailable，Swap使用0，根盘64%，Web和Worker cgroup `max/oom/oom_kill=0`。
- 采样瞬间Hub CPU约107%、业务PG约86%；这只是快照，不把单次值直接归因为全部CPU问题。公网health/version均200，约17ms/13ms。
- 首次脚本误用了不存在的Worker名称，exit1；原失败文件保留。修正为已核对的完整Worker名称后exit0，无远程写入、锁、候选、重启、切流或供应商调用。

## 模块一：已完成活动的有界清理

### 已确认热点

`src/lib/release-runtime/store.ts:finishActivity`每次完成事务执行一条清理SQL。旧OR条件把15分钟request和7天accepted-work混在一个按finished_at的索引遍历内。现场约693286条finished accepted-work仍在7天保留期，原SELECT候选扫描滤除约693420行，buffers约237411块，耗时413.426ms。

### 候选方案与边界

先分别查询两种类型各最多100条过期候选，再合并按finished_at取全局最多100条；沿用现有索引，不新增DDL。旧/新均只删除finished request超过15分钟或finished accepted-work超过7天的记录，不删active/unknown、Agent历史、owner、boot或业务任务；总上限仍100，仍在原完成事务。

现场仅执行新SELECT的EXPLAIN ANALYZE，耗时8.573ms、buffers1065块。它是未写入的只读候选计时，不是产品已部署收益，也不是全站容量承诺。

### 验收目标

- 隔离真实PG下保留集、边界和全局100上限等价，事务回滚行为不变。
- 约70万保留期内活动、无过期记录的典型热点场景，扫描buffer/完成事务成本明显下降，目标至少90%；保留冷/热原始数值，不只报告最快结果。
- 并发、过期混合与重复时间戳不触及active/unknown，不改变原有结束/租约语义。

## 模块二至五：减少重复读取与池自等待

- 三个只读审查分别核对高频DB/鉴权、后台轮询/内存、目录/配置缓存；结果和实施选择随后更新，不盲目给所有设置增加TTL缓存。
- 已选同轮模块：OpenAI/SMTP设置4/5逐键读→单次批读（不加TTL）；`/api/config`一请求三次模型快照→一次并传给目录投影（保留价格提示）；冻结计费`byVersion`同版本并发复用、最多64项、独立副本返回、失败不保留（不缓存current指针）。
- 另查到媒体/工作流session advisory锁占普通5连接池并嵌套借连接，可形成池自等待；独立协调池最小修复与定向真实PG验证纳入本轮。保持锁键和业务租约，解锁失败丢弃连接。
- 本机隔离PG容器初始化后，Docker Desktop/daemon整体退出，fixture随之正常fast shutdown，非OOM；容器/API失败记录保留。父继续完成不依赖DB的验证，真实PG部分等待本地测试环境恢复，不借机向生产写测试数据。
- 运行中的Web/Worker不在本轮被重启或原地修改；付费供应商调用0。
- 冻结版本100并发实际repository模块计数：SELECT从100降至1；最多64项LRU，失败不保留，旧失败不得删除较新的promise，每次返回独立副本。当前指针依然每请求读库，发布CAS不变。
- 配置接口实际GET/`publicCatalog` AST验证：每请求当前模型快照3→1，管理模式不再读取未使用的旧设置；保留功能目录价格提示、用户默认、旧模式回退及下一请求立即观察新版本。
- 协调池进程内共享最多2连接，普通业务池仍5；slot满时立即只读返回，未获取client的checkout失败也作为预执行繁忙结束，避免未开始业务就因5秒排队超时留下永久unknown。真实try_lock异常、传输不明及供应商未知不放宽。
- 另修复既有明确媒体Worker 429忙碌拒绝：在嵌套dispatch activity内部处理成无操作完成，而非先标unknown再由外层吞掉；保持同一原job后续可恢复。真实AST反例：原`BUSY_UNKNOWN=1 RETRY_ATTEMPTS=1 STATE=queued`，新`BUSY_UNKNOWN=0 RETRY_ATTEMPTS=2 STATE=processing`；模糊连接失败仍unknown，不重放。

## 集中验收与证据边界

- 清理：真实PostgreSQL16.15，baseline/modified各24组通过；执行原始AST `finishActivity`/`transaction`及原SQL，覆盖strict边界、NULL、active/unknown、Agent、全局100、并列时间戳、并发和事务失败回滚。
- 70万行隔离PG包括统计信息新鲜和留存窗口变动两场景。新鲜统计场景旧/新均约0.4—0.6ms，无夸大普遍加速；窗口变动后旧SELECT191.433—239.751ms，新2.857—3.307ms，原完成事务203.599—225.319ms，新7.541—11.022ms。未清OS缓存，不称冷机容量验收。
- 真实47只读同一REPEATABLE READ事务三轮：旧619.682/600.098/1327.920ms，新8.174/5.377/16.137ms，候选双向差异0；中位数降98.681%，逻辑buffer约237194→1065（降99.551%）。仅SELECT/EXPLAIN，无生产DELETE、索引、DDL或配置写入；收益尚未部署。
- 设置实际AST等价比较78组通过；baseline72组、modified75组；OpenAI4→1、SMTP5→1，单键仍1，无值缓存。
- 配置实际模块/AST14组通过；计费发布/恢复、模型注册、1000次模型并发与视频账务/租约真实PG既有回归通过；runtime memory与worker runtime各自已有套件通过。
- 锁池实际helper/调用点AST＋原生PG9组通过，覆盖两持锁/三只读后重入、五独立池屏障、普通池读、跨进程相同key互斥及错误连接丢弃；busy媒体回归12条断言通过。该测试不是真实付费供应商或线上视频质量验收。
- 独立窄review首轮发现新锁池排队超时P2，修后复审确认关闭；后续另发现既有媒体429的同类永久unknown，纳入上述最小修复。最终第三轮`blocker=none`仅覆盖本次增量，不扩大为全项目缺陷归零。
- 原`verify-video-reliability.mjs`静态脚本在纯905c8c6副本和修改版均因`pollAndSettle body exists`失败，保留两份exit1，不称全部套件全绿，不为本轮修改无关service。
- 类型和完整Next构建在隔离副本执行；保留已有Hook/img提示及Windows standalone symlink告警，不称可部署Linux镜像。最终源码hash绑定构建记录。
- 独立副本回滚、封存和Git状态以`VERIFICATION.txt`最终记录为准；本轮不创建生产候选、不切流、不持47锁。
- 回滚脚本实际在有标记的任务副本执行：8个原文件逐字节恢复、7个新增文件删除；实际恢复副本再跑配置14、设置72、清理PG24组均PASS，live工作区保持修改版。四制品为`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`，其绝对路径及SHA/命令/输入/stdout/退出码均写入最终记录。
- 最终独立副本完整Next15构建91页，exit0，耗时54.01秒；最终TSC stdout/stderr为空、exit0；9份产品源码与构建副本逐份hash匹配。构建前后两个中间版本的记录独立保留，不用中间结果替代最终源码验证。

## 后续优先项

- 前台视频GET绕过`next_poll_at`退避的静态缺口单列后续，需覆盖取消及时性与原UNKNOWN查询合同，不在本轮顺手改供应商轮询语义。
- 不因单次CPU快照指控Hub全部开销；真实全链路负载、24小时长稳及最终固定Linux镜像蓝绿验收仍需单独执行。

## 证据

ignored目录：`output/server-stability-performance-20261024/`，保存只读原始stdout/exit、基线备份、修改与性能对比、回滚和最终验收。原失败材料不覆盖。
