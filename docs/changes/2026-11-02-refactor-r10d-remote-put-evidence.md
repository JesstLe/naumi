# R10D：同一付费任务的远端对象 PUT 故障验收

## 调研结论与本轮边界

基线为 `08731a4a2f7ee8d68fe59e8086caec7a6479f0e3`，完整 5401 个原始源码文件及归档 SHA 已冻结。本轮补退出矩阵 M06 原先明确缺失的远端网络写边界，不以本地 `writeFile` 失败代替 S3 PUT 失败。

原产品已经具备正确的本地镜像／内联持久化与补传行为。新 verifier 在原始产品上完成六场景基线后均成功，因此本轮**产品代码修改为零**，不为重构数量再引入一套存储、任务或补偿框架。

## 职责、公共接口与事务归属

- `object-storage/adapter` 只承担 AWS 签名 HTTP 和对象协议；`runtime.writeStoredObject` 负责远端失败后的真实本地落盘，不包含生成或账务。
- `image-jobs/result-storage` 与 `image-job-codec` 拥有内部 paid checkpoint 的身份绑定、哈希／长度校验和有界内联保留。素材公共读取仍拒绝内部 checkpoint 前缀。
- `imagegen/complete-image-delivery` 共享正常／恢复交付，消费已有付费字节，写最终对象／作品并沿原 operation 结算；不重新请求供应商。
- `media-assets/mirror-recovery` 沿现有 catalog、retry 时间戳与摘要 claim 补传，只写对象／catalog，不调用 planner、生成入口或账务。
- 测试从真实 plan／submit／GET handler 出发，原 PG、租约、cookie、作品、钱包与 media handler 全部保留；仅供应商响应和远端存储 HTTP 响应由 fixture 控制。

上述依赖没有倒置为存储模块调用生成或钱包；也没有拆开已有事务、增加嵌套借连接或引入 manager。源码静态归属与本轮运行证据分别成立，不以这条调用链的审阅代替全仓语义耦合审阅。

## 六个同任务场景

1. 正常远端 PUT 正对照。
2. 实际签名 PUT 返回 403，checkpoint／交付对象均落本地镜像。
3. 实际签名 PUT 返回 503，保持原图及原价交付。
4. fixture 确实保存 PUT 字节后断开 socket，模拟对象 ACK 丢失；保留本地镜像和 pending catalog，后续只补传同一不可变 key。
5. paid checkpoint 远端写成功，仅最终 `image-delivery` PUT 返回 503；最终对象本地交付。
6. 远端 PUT 拒绝，同时以本任务 temp 路径的真实文件阻挡本地目录写入；paid bytes 走原 codec 内联持久化，最终原图也沿既有 inline fallback 交付。

每个场景都从一次真实供应返回开始，不 seed done、不替换产品写入函数；记录原 operation／父子 ID、供应 POST 数、原 PNG SHA、作品 ID、原公开 GET 状态、真实账本／预占、故障前后 catalog、签名 HTTP trace 和独立进程读回。恢复远端后调用原 mirror recovery，核对远端字节、原 paid snapshot、原回执与账本保持。

这是真实适配器对本机 HTTP 对象 fixture 的协议／故障验证，不是 MinIO、真实云 S3/R2 或生产网络验收；未模拟 120s 网络超时，也未覆盖 NAS proxy 写可用性策略。公开 handler 的 `done`／无错误语义已读回，**未运行实际浏览器 UI**，不能把本轮六场景拼成 M06 所有维度已关闭。

## 基线与迁移

原产品基线六场景已实际通过，每场景供应一次、作品一张、消费一笔 6 积分、原字节完全一致；六个独立进程均从原 paid checkpoint 读回。旧 catalog 未登记本专项，这不是旧产品失败；不把 `BASELINE PASS` 写成缺陷复现。

首个 baseline 尝试在第六场景失败，是 fixture 错用只接受 managed URL 的读取器去读合法 inline 产物；改用产品原 `readCanvasOutput`，保留原失败记录，并在所有 5401 原始文件仍完全一致时重跑完整六场景通过。没有修改产品读取或放宽字节断言。

新用例登记到原 `generation` 组，沿原 runner 的逐 case 输出目录端口；总 catalog 226，generation 23，登记数不等于已执行数。最终原顺序组／类型／lint／副本回滚与源码绑定以本轮 `VERIFICATION.txt` 和 `DELIVERY.json` 为准，不预记结果。

## 未完成项与退出条件

整体 ACTIVE。M06 实际页面、持续网络故障、其他故障矩阵、当前完整 226 同源 CI、全仓模块语义审阅及最终候选合 main 继续；本线程不发布。旧 R10C 的产品修复及固定镜像浏览器证据保留原 source，不改标本轮新增的网络故障 UI 结果。

四产物使用完整原始归档和显式独立副本；回滚恢复原 catalog／runner 并删除新 verifier 和模块文档，验证旧产品同样能完成六场景但未登记本专项，实际工作树继续保留新验收覆盖。

## 集中验收已执行

固定应用／验收源 `99e22ca054bab0cc52392893a307c7d7f45a6e10` 的原顺序 generation 23 个子命令单次全部 PASS／exit0，0FAIL、0NOT_RUN、0reuse；顶层按局部范围合同仍为 PARTIAL／exit2，不写成完整226通过。新六场景在该组实际执行，逐case证据端口生效，六笔消费共36积分、供应POST6、独立进程恢复6；原 paid snapshot／远端对象摘要／账本补传前后保持。

原 runner 真子进程20场景370检查 PASS；全项目非增量 tsc 与定向 lint 均 exit0，5111编译器输入及4配置绑定。全部2152产品文件与原087／已构建db3a完整镜像raw一致，本轮没有重新构建或重新运行浏览器；旧102浏览器保持原 source 和原场景，不给本轮网络故障增加虚假的UI覆盖。

generation执行源与后续最终文档提交分开绑定；原退出审计、模块迁移和当前工作区只补本轮索引。四产物、副本5401原始hash恢复、原六场景重新执行与自有PG清理按最终VERIFICATION／DELIVERY实际记录。
