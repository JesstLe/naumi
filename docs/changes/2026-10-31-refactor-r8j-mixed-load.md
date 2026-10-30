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
