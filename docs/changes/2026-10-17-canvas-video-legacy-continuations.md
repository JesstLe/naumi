# 画布视频发布：历史 UI 的执行延续与启动入口

## 本轮结论

先同步 origin/main，基线 1b80da5。不能用「有效租约为 0，加 Agent Map 为空」证明所有在途任务已结束。此次核查得到具体反例，同时完成范围明确的定时器/原生请求只读补采。没有停止旧 UI，没有释放 RAM，没有发布新应用；没有持有发布锁。

## 固定源码与生命周期复核

对 Git 3bbebee2cfe31e884268c539373b81afff263207 的原始源码和 103 精确 13033 容器实际编译代码交叉复核。选定 11 份完整文件共 232252 字节，全部逐文件核对原采集 manifest 的 SHA；独立 Native 复核完整读取、字节数、内嵌文本和 SHA。证据在忽略目录 output/canvas-video-fusion-20261013/checkpoint-d/legacy-source-ownership-20261017/，sources.json SHA b55e2f6902f8923049b9a2ea47c0b38a4e3bd14797dece6ec620cb24959b0083。

- 根布局 src/app/layout.tsx 第 19 行在模块加载时调用 startVideoWorker()。只查 lib 目录会遗漏该调用，不能把「只有声明」当事实。原始 worker 与实际编译模块 55044 均在创建 interval/timeout 前检查 NAUMI_VIDEO_WORKER=0；该值在目标容器明确配置。这证明此启动路径被禁用，不代表对扫描函数的直接调用被禁用，也不取消既有执行。
- 图片 kick() 在 120 秒租约后创建 25 秒心跳并分离执行 Promise。心跳失败只停心跳，不取消 handler；因此租约过期后仍可能执行。finally 停心跳、等待队列写入，再按 token 释放租约。pending 释放后保留 10 秒延后重查、token=NULL；此前两个未来时间戳不能称为两条正在执行任务。
- Agent CREATING 管到创建 finally，SESSIONS 保存构造后的会话；但旧 GC/删除只检查 running/canvasExecuting，不等待 persistPending/toolResultsPending。旧工具超时包装会拒绝外层 Promise，而部分内部业务继续使用外层 signal，因此超时也不是内部完成证据。
- 供应商扫描的准备/入队发生在租约前，部分账单对账发生在释放租约后；视频 workflow 另有 PG advisory lock。图片和供应商租约计数不覆盖这些全部路径。PiBridge 有独立闭包状态；本轮原始拥有者源码搜索仅找到 getAgentBridge 声明，尚未用它宣称全部闭包无活动。

拥有者 src 的 TypeScript AST 初步库存读取 857 份源码、parseDiagnostics=0，识别到根布局启动调用。它只是源码调用库存，不是整个第三方闭包审计或可退役许可。未把已采集 2568 份文件的 SHA 完整性冒充自治审查完成。

## 已实现的补采

audit_legacy_agent_scopes.mjs 新增可选 --observe-native-continuations；默认行为保持。仍通过同一个已验证 Node 二进制的 process getter、getBuiltinModule 和内置源码校验获取可信函数。可选 setTimeout/_getActiveRequests 被替换时 HOLD，同时保留已经验证的 Inspector 关闭函数，不调用应用替代函数。

通过可信内置 timers 导出函数的 Closure 描述符取得 Timeout/Immediate 构造器，复核函数文本、加载脚本及同二进制 native 源 SHA。只读 Inspector 查询原型匹配对象，每类最多 2048 项；只读取数据描述符、销毁状态和回调位置。绑定函数最多展开 4 层 Inspector [[TargetFunction]]，不调用回调，不读取参数。脚本上限 2 MiB、逐脚本缓存摘要。原生 _getActiveRequests 只返回计数。回执仅含摘要/位置/计数，未输出用户标识、环境值、任务参数。

范围始终为 default-node-builtin-timer-prototypes-and-native-active-request-snapshot；allApplicationContinuationsObserved=false、ordinaryDrainReceipt=null。改变对象原型可隐藏匹配项，因此即使观察计数为零也不能提升为全量延续已空。对象/回调为 Proxy、状态或来源不可判断时 HOLD。

## 验证与实际 103

隔离 Linux 首批 12 个既有分支回归通过。可选补采首轮识别出 Node HTTP 定时器的绑定回调缺少直接位置，修正为只读有界展开；最终 7 个新增分支全部通过：空业务状态、未引用的 interval/已销毁 timer、恶意 timeout 导出、恶意 native-request 导出、Proxy 回调、阻塞 FIFO 的 activeRequests=1、被改变原型而隐藏的 timer 仍只报 PARTIAL。Proxy/应用副作用计数均 0、目标存活且非 OOM；可选导出异常仍实际关闭 Inspector。没有重复运行无关完整业务套件。

最终审计器 SHA 753f9a9e7fffb66e0f8eea5d72a3fe37c5604e218ed6d257428ac991cb81ca9e；fixture cbc91880058fb5f944c05bc3f84b484348f6fc5f4ccd0e86a17edab3652056ea。独立 Native 完整读取两份源和 SHA 后未发现可操作问题。最终 7 份固定 SHA 实测回执在 checkpoint-d/native-continuations-20261017/linux-final/。

2026-10-17 06:02:34 UTC，实际 103 目标 CID 0b8ff61f47f23d781f3d156e0c84685854d02551bdd17138b07616a8968e4685，image 8f6d2dc56ef6dc92a666108311a35081ef13ebbe69cc3f0b5d902e9b0f1f8b03，boot 2026-10-16T22:23:13.894146717Z、host PID2422 保持。实际 helper 运行 32171ms，M/N 各 0，native activeRequests=0，Timeout 匹配 1 个活动项、Immediate 0；唯一回调 URL 摘要对应 node:_http_server，加载源码摘要 cd81e1020a8f2b3f6731b2db28648d889ec99db4fbff45ed608821bcc4209be9 与同 Node 内置源一致，boundDepth=1，unknown=0。没有在本次匹配范围观察到业务源码定时器。

Inspector 实际关闭，2568 份执行源共 57401078 字节再次核对，Config/挂载/网络/boot/PID 与完整 Nginx 摘要保持，未写 DB 或停容器。包装器已直接复用版本化 Docker 绑定库，避免另一个同名但不同算法的摘要。传输含 Python SyntaxWarning，原文单独保留为 transport.log；提取唯一 JSON 回执，不因解析警告重启采集。规范 JSON 回执 SHA 2c0af796a18fcb9ea9a0074bb6d7d52bb523f766811ba68c2fa583f74bb5a29e。

06:04:31 UTC 的后续独立只读 REPEATABLE READ 回执确认，目标 PG 连接/活动事务 0，网络命名空间只有 3000 与 Docker DNS 监听，无在途 TCP。此前 05:52:32 快照 pending9/needs_attention2、tokenHeldAndLive=0、deferredWithoutToken=0；旧核心 Worker 仍可合法更新延后重查时间，不能要求全库所有行摘要在观察间不变。历史 billing26/supplier158 等未终态记录继续原样保留，未推定其归属为目标进程。

## 下一步与验收边界

这次补采关闭了具体定时器/原生请求观察缺口，没有证明全部 Promise 或请求延续已空，不满足停服授权条件。接下来只补齐可达的拥有者延续边界：worker-tick、图片/批次处理、Agent route/harness 清理和桥接实际调用，绑定固定编译源；与当前入口/内部调用排除、任务冻结/付费意图/不确定状态的完整保留及兼容恢复证据共同形成退役方案。不要把所有历史供应商记录都变终态作为门槛，不删除/结算/重放历史未知任务，也不追求任意未使用依赖的绝对静态证明。完成可恢复串行退役后，再实测 RAM、执行 103 锁内发布和线上验收。
