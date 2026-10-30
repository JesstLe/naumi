# R8D：整体重构的固定机器性能对照

## 原始要求与当前状态

原退出要求继续为 `REFACTOR_MIGRATION.md` 第5节：固定规模的UI响应与排除供应商耗时的准备/入队p95、PG查询、RSS，不以历史PASS或180秒读取替代；10%为原建议调查阈值，不是新业务护栏。

本轮源码基线 `2fb9da5a8f22c9b229898f26293dc70db26d4ad6`，完整5240原文件raw hash/tar保存在 `output/refactor-r8d-20261030`。比较原应用为首个重构实现前 `4478cdca88a6e52b5db186d30ace4ef8724263c7`，产品源码及package与已整合的质量/Canvas定价修复 `9fc2845` 一致。候选复用R8C完整镜像，应用 `290b3772`；不改任何src/services字节。

## 测量归属

- 复用 `benchmark-ui-performance.mjs`，新增显式完整镜像入口。旧受控API模式保留，不把它包装成真实PG模式。
- `refactor-performance-fixture` 在各自源码下编译，仅用各版本原数据API建立300图片节点、20文字节点、12张确定性1024px PNG、固定6积分报价；不替换业务handler。
- 浏览器使用真实登录、真实Next/ReactFlow和HTTP；相同1440×1000、4倍CPU节流、5Mbps/80ms，冷/暖页和原生工具切换/平移，保留既有虚拟化。
- 相同measurement-only preload观察原HTTP完成、真实PG查询、20ms RSS与Linux终身VmHWM、10ms事件循环分布，不更改SQL、响应或任务路由。
- 5轮交替先后顺序，每次仅一个自有完整Web/PG栈；实际读取60次、报价准备30次。UI与报价准备不提交付费执行，不以此声称供应链/入队或10万用户容量已验收。
- EventTiming结果标为实验室交互延迟/会话INP估计，不冒充真实用户field INP。

## 已发现的准备边界

原版完整Dockerfile两次在npm下载ECONNRESET终止，第二次同时存在apt网络失败；原日志保留。原锁与当前锁有82项差异，不能把依赖升级算成架构收益。随后建立明确标注的“原应用字节＋当前已缓存运行依赖”测量镜像：应用源不变，测量配方不是原历史发行版。

该配方首次遗漏原Dockerfile全局NODE_BASE_IMAGE定义，随后已纠正。使用当前依赖分别触发原测试脚本的BlobPart和原产品Sharp类型不兼容；这些失败原样保留，**没有产出可测量的matched-deps镜像**。随后从主机恢复原锁的Linux/glibc依赖，缺失包下载后逐一核对原SHA512，最终offline npm ci成功。原应用及原锁完整构建通过，未修改产品或跳过类型检查；唯一测量配方变化是deps预安装运输，原build/runtime阶段保持。原版与候选的82项依赖差异仍单列，结果只支持整体候选对照，不把全部变化归因于模块化。

## 实际复现与修复：公开本地媒体规格错配

真实320节点校准的前两次环境错误分别是fixture全外部依赖打包导致lucide CJS加载失败、探测子进程继承release preload；第三/四次定位setup root创建私有文件而Web uid1001读EACCES。以上均为验证准备问题，已修正，原失败和自有资源清理保留，不算产品缺陷。

之后实际Web/PG浏览器取得冷/暖交互样本和90次真实API结果，但公开本地MEDIA_PRIVATE=0下缩略图请求稳定返回409。源码链为：manifest按thumbnail生成版本→response只在private分支解析variant→公开路径仍读原图→用缩略图版本校验原图，因此409。该次性能运行exit1，不能称测量通过或把回退原图耗时当基线。

修复将规格选择归`media/representation`，manifest与response共用同一key+asset；私有素材仍先检查原始key归属，再解析派生规格。真实manifest/response＋文件/Sharp专项：原38检查复现2个公开variant错误409，新44检查错误409为0，字节、MIME、过期版本409、私有匿名401/外账号404及拒绝前零元数据读取保持。尚待固定新镜像的真实浏览器验收。

当前尚未取得成对性能结果，不宣称性能改善、10%目标达成或整体退出。后续以实际测量决定是否存在待修瓶颈；既有UNKNOWN、原operation、报价、钱包与scope规则保持。整体ACTIVE，未合main未部署，47 HOLD。

## 固定候选最终记录

固定应用/本地验收源码 `3e90ff3595e2b347fcf907121cd64103aa635169`，同完整生产镜像Web/Worker包 `sha256:a650b2b5471c26f05e5451f2df43b0ada719c889d481fdf0170afe0747286472`。真实320节点校准抓到公开本地媒体manifest选择缩略图但response读取原图的409，已收敛`media/representation`，私有源先授权、清单与字节共用key/asset；不删cacheVersion、不交错账号、不降低图像质量。实际handler+文件+Sharp原38复现2个409→新44检查0，私有401/404和过期409保留；新完整镜像公开模式冷暖2页＋60读取/30准备实际通过，HTTP错误0、付费POST0、供应商0/消费0。

复用原benchmark补真实登录/PG/HTTP模式，原受控API模式保留。重构前4478应用/原锁固定镜像与候选在同机、相同320节点/12图、1440×1000、4倍CPU、5Mbps/80ms下5轮交替、每栈3页，10个隔离栈；每侧15页、150准备、300读取，输入原图hash完全相同。两侧统一私有本地模式，公开模式409另作原/新真实反例，不把已知错误回退耗时塞进性能基线。visualReadyMs p95 7319.65→8231.40；labSessionInpMs p95 2544.00→2328.00；prepareMs p95 19.76→17.58；readMs p95 19.14→20.62；rssPeakMiB p95 381.52→417.46；eventLoopP95Ms p95 10.51→10.52。超过原建议10%调查阈值的指标：{"visualReadyMs": 12.46, "coldVisualReadyMs": 12.46, "warmVisualReadyMs": 29.15, "interactionLatencyMs": 12.5}；保留为真实剩余项，不靠调阈值宣称整版退出。

82项锁记录差异单列，因此结果是整体候选对照、不是纯架构因果归因。实验室EventTiming不等于真实用户field INP；20ms RSS与kernel终身VmHWM分别记录；15页/5冷样本不能当生产尾延迟或10万活跃用户容量。旧镜像恢复经过网络/类型投影失败，最终回到原锁，完整类型/build通过，无产品补丁或跳过门禁；每次准备失败及清理保留。8个受影响入口全部新执行PASS，subset为PARTIAL/exit2，不冒充完整170；类型/lint既有38warning、四SCC0。

原5240hash与完整5247源码/字节patch/独立副本恢复旧38检查和2个409、later-edit零写入及远端以R8D DELIVERY/VERIFICATION为准。仅2个既有产品文件改变，1个新规格owner，其余原产品文件hash保持；未改钱包、任务、冻结合同、Canvas组件或业务限额。整体ACTIVE，未合main未部署，47 HOLD；本片是主线同步后2/3模块。剩余Canvas下载/呈现、INP/退化调查、入队/长时混合容量、有效CI、最终main整合与生产验收继续。


完整命令、exit、逐样本、原始失败及scope分类以VERIFICATION与PERFORMANCE_COMPARISON为准。
