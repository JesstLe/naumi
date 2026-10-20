# 生图千人负载第二轮：编排连接池、真实接口与冷连接

## 任务与基线
- 用户「继续」千人并发与内部生图可靠性。沿用独立codex/image-routing-reliability-20261020，基线401faa895554a7abd33341ded0d46ce9f8fbd1db；开工origin/main仍3f940b86且已包含。
- 不动共享checkout；不向47在线用户压测，不进行SSH/三锁/候选/配置发布/收费供应商调用。
- E盘约1GiB，不在E生成新构建缓存/副本证据。output/image-routing-load-v2-20261020为指向D:/naumi-validation/routing-load-v2-20261020的本任务junction；源码继续本worktree，历史第一轮证据不覆盖。

## 发现与修复
- imagegenSubmission占用业务Pool的一个事务连接以持有取消锁，再调用getImageJob/run内部业务查询；五个并行submit占满max5后全部等待同一Pool的新连接。基线实际PG finished0/runs0/waiting5/idle0/total5，数据库并无普通SQL互锁，所以看起来只是一直转圈。
- 批次同样持父row lock调用submitAcceptedImagegen，跨五个批次有同类耗尽风险。
- 新增进程内按业务Pool对象共享、每个协调Pool最多4连接的imagegen协调Pool，仅承载上述协调事务；普通业务查询Pool保持原max5，不以无限扩池掩盖问题。两个池配置与数据库相同，协调Pool继承SSL/search_path等；application_name可单独观测。
- 取消与提交仍使用同一数据库advisory key/父row lock；不移除锁、不提前释放、不重排收费提交；batch事务与取消事务统一在协调Pool，避免跨池占锁后反向等业务Pool。
- 协调Pool允许空闲退出，保留关闭函数供隔离验收/进程退出；idle连接错误不包含连接串或秘密。

## 已完成验证
- 同一实际PG探针：修改后5个并行编排约70ms完成，业务Pool waiting0/idle5；取消必须等待正在提交的原锁，取消后新步骤0、已开始恢复继续；5并行批次各产生1持久子回执，取消保留已受理子任务。子kick仅在该批次探针暂停，避免把探针当供应商执行验收。
- Windows相同最小HTTP1000冷连接：200232/ECONNREFUSED768；Linux Node24同一脚本、不预热不重试：2001000，约789ms。观察说明此前结果有平台/连接环境差异；不直接推定47同样通过，未改用户Windows网络设置。
- 隔离Linux实际Next路由函数负载：1000不同有效用户/各自cookie，1000同时冷POST /api/imagegen（包含真实解析、重新plan、版本/报价确认、DB持久化、父子调度），成功1000；1000GET原任务全部成功；25原ID重提不新增父任务；跨用户404。P50=8607ms/P95=8963ms/P99=8991ms，POST完成9120ms，带查询12347ms，RSS366MiB。
- 供应商本地容量预占，8个执行槽，1000个父任务保留，子生成进入有界队列；供应商POST0、消费账本0、内部5000、处理结束无活跃lease残留。
- 上述负载使用HTTP bridge直接调用实际route handlers，不包含Next middleware、Nginx、TLS、用户上传图像及真实供应商执行，不冒充47完整整站SLA或真实千图吞吐。

## 集中验收与交付
- 原批次完整生成/取消/单次结算、实际容量排队route、postprocess DB、第一轮148项路由及1000队列回归、完整TypeScript全部通过。Linux当前源码Next生产build通过，91页生成；依赖镜像238b5a0d，package/package-lock哈希与工作区一致。不是正式发布镜像构建，既有lint warning保持。
- 最终版修改探针复验finished5/runs5/waiting0，87ms，exit0。基线最终版探针finished0/runs0/waiting5，3120ms，预期断言exit1。早期基线fixture清理遇到backend error及pool.end等待，已修正测试清理并重跑；原日志保留。
- 实际副本回退、前序23文件修复保持、新增修改hash与四产物最终结果见D:/naumi-validation/routing-load-v2-20261020/VERIFICATION.txt。
- 再次fetch origin/main=3f940b8618797ddf8a9eddf908b47896f48f2a72，仍为HEAD祖先，无需合并。
- 功能同步计数0→1；推送本任务增量，不合main/发布。
