# R8J：完整候选持续混合生成与入队校准

## 模块与职责

基线 `dd4fa4dcc049732b95062903c73d01d90705908e`，独立重构目录/分支保持。上轮R8I完成后工作树干净，普通fetch后主线待整合0。本轮不继续机械拆UI，而补整体退出要求中的真实持续生成/保存/媒体负载证据；这是验证能力切片，不把新增测试文件冒充产品源码结构改造。

现有 `benchmark-imagegen-pipeline`仅本地Sharp像素处理；R8I完整产品的180秒soak只有短时混合读取，不构成持续入队容量。本轮复用 `verify-refactor-runtime.py` 的同固定生产Dockerfile Web+Worker、原auth/HTTP/隔离PG/存储/原FFmpeg sandbox，新增mixed suite，不另建任务、保存或账务实现。生产src/services保持不改，复用R8I固定镜像，全部production导入与镜像源逐hash校验。

## 接口与依赖

- `mixed-load.mjs`只拥有该benchmark的时钟驱动到达计划、分位及队列斜率，不是产品队列。
- `refactor-mixed-fixture`只在setup使用原领域导入。负载全走原WebHTTP；独立load容器承担调度、PG只读观察和最终PNG校验，不占用Web/Worker的Node资源预算。
- 原runtime driver唯一管理自有容器/网络/固定镜像/排空清理；原observer新增opt-in per-PID文件，不改变原默认SERVER.json。只给确实加载observer的Node进程发SIGUSR2，不给FFmpeg/native子进程发信号。
- 原provider默认行为不变；mixed opt-in增加可定位原operation的3秒合成响应、1K/2K实际像素及有限供应商并发观测。未调用真实供应商，未改生产池/并发/后台价格。

## 负载口径与不变量

固定2个隔离个人账号，真实钱包各10000 fixture积分，服务端原报价图片6积分/本地媒体2积分。default产品通道并发4、image lanes和Web/Worker1536MiB/2CPU不调大。warmup30秒、control60秒、steady180秒、surge60秒、recovery120秒；时钟计划165个图片、12个原生媒体、1800读取、450保存。surge2图/秒超过合成4路×3秒供应商理论约1.33图/秒；停止新进入后观察排空，积压不隐藏成丢任务。

报价、受理、回执、读、写、媒体分别统计；记录scheduled/actual开始与迟到，不因后端慢而降低offered数。每次生成POST前固定原operation，超时/失ACK只GET原编号，不创建替代任务。最终逐个核对parent/child/owner、一次供应商call、像素/可读原图、一次consume、原价及预占归零，媒体HTTP→PG→原FFmpeg→字节和尺寸也实际校验。

## 验证与未完成

旧CLI真实执行 `--suite mixed` 返回argparse exit2、尚无该模式；这是**验证覆盖缺失**，不是产品旧容量缺陷复现。命令/输出在output/refactor-r8j-20261031/BASELINE_MODE.log。实现完成后集中执行driver合同、类型、smoke、calibration及原runner回归；尚未执行的结果不写成已通过。

本轮是本地受控图像/图片FFmpeg混合样本，不等于生产7天业务到达率、所有视频/音频规格、30分钟2倍峰值、24小时长稳、租户公平或10万活跃用户容量。建议SLO保留为建议，不修改阈值凑通过。有效远端CI、main整合、生产验收和47HOLD继续分开。


### 首轮smoke准备失败及修正

首次真实smoke在负载开始前，独立load容器访问Worker控制口`worker:3001`被ECONNREFUSED；该口有意只绑定localhost。未开放控制端口或修改生产绑定，改由既有Docker orchestration通过worker内localhost执行原resume/drain。自有栈已完整清理。观测还确认Next会改进程标题，不能按argv0=“node”筛选；改查/proc/exe，并采Worker全部Node子进程的RSS/VmHWM。Worker原子进程环境白名单会移除任意NODE_OPTIONS，保持不变：event-loop仅覆盖Web和控制父进程，执行子进程以/proc/cgroup观测，缺口明示，不向子进程强塞preload，也不给FFmpeg发SIGUSR2。


### 第二轮smoke的真实反例

原图片链20/20交付、412读/103保存实际完成，媒体POST返回422 INVALID_MEDIA_STREAM且零媒体账务，整轮仍exit1。public模式的底层uploadImage本就不登记mime资产，fixture仅写对象却未沿原registerMediaAsset登记，真实媒体入口正确拒绝未核验类型；补原asset登记，不改产品护栏。billing操作表同时有setup的signup/admin零价操作，验收改为保存前态并验证其逐行不变，仅按新业务操作增量与consume核对，不删除前态冒充空表。

原生媒体Web→Worker依赖既有共享scratch目录，mixed原先只沿基础runtime组件样本的独立tmpfs，未提供Web侧共享准备区。mixed模式改为自有output/scratch bind同时挂Web/Worker，保留原750MiB可用空间检查，不降低预算或修改生产路径；内存/CPU/池/供应商并发不改。Worker控制仍loopback-only。


### 第三轮smoke：交付已完成，纠正账务观测字段

20张图片和1个原生媒体均实际完成，媒体HTTP202、FFmpeg512×512PNG落盘与公开回执均已取得；整轮仍exit1。checker错误要求已结算image job的历史reserved_cost=0，而生产语义保留原授权金额；真正可用余额占用在app_billing_operations.reserved_credits、legacy reservation与wallet credits_used中。改为检查原billing operation settled/charged=6/reserved=0、legacy reservation空、wallet占用0，不改生产字段。fixture默认video.process tariff.enabled=false，仅改pricing仍为0；显式启用本轮隔离fixture的2积分本地媒体价并在setup调用真实mediaBillingQuote断言后才启动负载，生产后台价格不变。原失败与清理记录保留。


## 本片最终结论（R8J）

R8I固定应用 `c146956e66f3bef0442a60cc38ceeb893abb8a93` / 同完整Web、Worker镜像 `sha256:85a6a68afb93c074c6a7e7aa90733b0e5492c2d658fdb207cd29716d343332e1`。本片仅增加验证/离线分析与文档，所有src/services保持原始字节；未更改产品通道并发、模型/价格、真实余额、任务、供应商、图像质量或业务限制。

### 实际450秒结果

- 实际165张图片、12个原生图片FFmpeg任务、1800读取、450次真实画布保存；165张逐张校验原operation、父子任务/owner、原价6积分、供应商调用一次、PNG实际像素与可读作品。12个媒体实际HTTP→PG→FFmpeg→512×512字节/输出回执，原价2积分。
- 177笔consume/1014积分，原setup账务逐行保持，最终live reserve、legacy reservation与wallet在途占用均0，未完成父任务0；UNKNOWN不换编号重POST。非图像/音频/视频规格未扩成已验收。
- steady180秒以0.25图/秒进入45张并全交付：受理p95 22.78ms，读取6.35ms，保存13.24ms，原GET轮询观察端到端p95 4028ms。surge60秒以2图/秒进入120张并最终全交付：受理p95 30.96ms，读取6.43ms，保存10.56ms，端到端p95 70022ms/max94015ms。
- 突发执行等待最高48、未完成父任务最高52；停止新图后在398.022秒采到归零，即约68.022秒排空，采样间隔约2秒，不当精确完成时刻。积压区间合成HTTP槽占用约77.05%，但unfinished parent不等于dispatch-ready；先定位现有调度/lease/provider等待，不据此直接认定唯一瓶颈或增大并发。
- 不能把局部建议SLO全未超标误作用户等待已解决：建议阈值主要覆盖受理/读/保存/供应商返回后发布，并未给端到端70秒定义通过门槛。保留1次原operation GET404：发生在对应POST返回前，之后同编号成功；它不是未受理证明，未触发生成重提。
- Web/Worker运行中cgroup current采样峰值403.46/547.14MiB，内核终身峰值412.27/627.22MiB；各1536MiB/2CPU不变。采样进程本身从离线产品进程列表排除，原始记录不改。eventloop是76个单窗口p95的分布而非合并总体p95；包括启动和最终校验窗口，Web曾观察到1904.21ms max，未冒称load-only或生产尾延迟。Worker executor未注入preload，保持原环境白名单，只有父控制进程eventloop和全部真实子进程RSS/cgroup覆盖。

### 证据口径修正与集中验证

原450秒的`INPUT.json`把mixed网络标为internal，但EVENTS实际创建的是无宿主端口的普通自有bridge。原文件、命令与测量不重写；`CALIBRATION_NETWORK_CORRECTION.json`记录此误标，不能将该轮冒称内核禁止外连。最终驱动改为仅browser使用普通bridge，runtime/mixed均`--internal`。定向103秒最终smoke实际internal bridge，20张图+1个FFmpeg任务全交付、21笔/122积分、原像素/账务/零重提/排空通过，自有容器、network与PG tmpfs已清理。450秒数字仍只归原450秒运行，不拼成网络修正后的重测。

离线报告唯一拥有raw读取、去重、分位/cohort、资源与排空分析；缺样本、缺内存、缺供应商slot信息不显示0成功。新增合同11组通过；原runner、自有生产源/镜像逐hash桥接及原provider默认模式真实HTTP回归集中执行。默认provider6组验证hold/release/原PNG像素、edits、Comfy、404与计数，固定镜像`--network none`，不启动新供应商实现。原runtime全套尝试因同源full-core timeline向量缺失在负载前exit1，保留原门禁，不用subset/旧SHA伪造PASS；本片full runtime/完整core仍NOT_RUN。最终类型/lint、执行命令与四产物/独立副本回滚以VERIFICATION/DELIVERY为准。

所有失败准备/账务字段误读、网络记录错误、默认runtime缺向量均保留。450秒不是30分钟过载、24小时长稳、七天生产到达率、租户公平或10万活跃容量；真实供应商与私有R2验收未由fixture代替。下一步继续Canvas Shell剩余组合收敛，并基于现有调度归属定位突发等待；最终同固定源码完整core/runtime、有效CI、main整版整合/生产验收仍待。整体ACTIVE、未合main未部署，47 HOLD。**分支超过48h因用户要求独立整体候选，整版退出未满足；本片封版不等于完整重构结束。**
