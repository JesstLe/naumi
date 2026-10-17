# 103画布视频：回滚入口封闭与联合验收

## 范围

开工fetch origin/main，起点f7af0eb2e1e00f494e302d5e94bb860f471dd8fe。继续Task16，复用固定e997b290b39fc9df63e4c3b6387fa008b7b0e18d / 1792200281 / 普通镜像9fea589fed46a283fe8601d2771d0517077ce176708bdc9ff9e7226693c20f1e。不修改业务源码、不重建未变化镜像；没有连接/发布103、持生产部署锁或增加发布计数。

## 实现

- 新release_rollback_ingress.py通过固定Python只读程序读取/run/nginx.pid及/proc，绑定master和worker的PID/startTicks，记录正在退出的worker数。回滚先持久保存原始worker集合；维护切换后等待原始worker退出且没有正在退出的worker，最长30秒，未排空保持HOLD，不发送终止信号。后续重试保留原始集合，不把新一代worker重新记作旧集合。
- LiveAdapter从计划中已有、逐文件SHA校验的open转换严格反向生成rollback-seal：完整候选文件闭包→原维护文件闭包，只交换原patch前后SHA，使用已有gateway CAS/语法/full-dump验证/意图日志/失败自动恢复。没有重新渲染维护配置、扩展修改路径或改写已封存v4制品。衍生描述符绑定完整原open描述符，重复操作仍核对原始意图。
- 四个实际loopback TLS入口/api/version、/api/health、/desktop、/enterprise必须503，禁止系统代理。切换前后的所有配置文件和nginx -T摘要都再次核验。观察到maintenance字节不等于reload已接收，原worker排空及实际HTTP探测也必须通过。
- 回滚顺序：关闭候选自动恢复→封闭入口→排空调用Worker→关闭App/媒体准入→读取新业务证明→再次核对维护封闭→maintenance到原入口→再次读取业务证明→恢复旧调用Worker。已恢复入口但canonical ACK丢失时，只允许同一操作UUID、完整原始写入意图和精确目标闭包重观测，不在这个恢复入口偷偷发起新的回退。
- 在真实固定Next中发现原控制辅助node进程继承NODE_OPTIONS，重复安装HTTP observer会报RELEASE_HTTP_OBSERVER_START_FAILED。仅app_status/control/verify短命辅助进程显式-e NODE_OPTIONS=，正式Web入口及原预加载保持，不改变镜像/环境/监控覆盖。

本路径仅在开放前业务状态与当前完全一致时安全回退。新增业务、Agent归属、未知租约、正在处理请求、旧boot工作仍会拒绝；不支持把已变化任务无条件交给旧版，不清理任务换取通过。历史47路径保持既有回退流程。

## 集中验收

首组62项，60通过、2历史Nginx跳过；新增canonical丢失封闭回执恢复与辅助进程清NODE_OPTIONS后，受影响四组66项，64通过、2历史跳过。覆盖原PID复用/不同master、活动worker超时不转成功、四个503缺一拒绝、open严格反向完整文件CAS、patch哈希篡改、封闭/证明失败禁止旧入口及旧调用Worker恢复、两次业务核对、原始封闭意图跨会话恢复。没有重复无变化的完整应用E2E。

追加保护以实际rollbackIngressIntent.fromCandidate为准：即使缺少openGateway/app-open回执也不能跳过原始基线要求。相关8项会话测试通过，未重跑未变化的其他模块。

独立Linux固定Next9fea、真实Nginx65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10、Python a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1、PG0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4，内部网络、无公网发布端口、无正式凭据/业务挂载：

1. 真实Next初始draining，通过真实控制API/HTTP preload状态建立原始业务基线；worker tick表执行当前源码精确DDL，没有运行实际调用Worker。
2. 候选入口真实/api/version返回e997 commit。制造已接受的慢HTTP请求，维护reload后原Nginx worker仍在时封闭验证HOLD。
3. 释放合成慢请求，原响应完整返回finished-original-request；按原UUID重观测封闭意图，原worker退出、四入口503、完整维护闭包通过。
4. 通过真实Next控制API关闭准入，实际只读PG业务核对通过后恢复合成旧入口。模拟入口已生效、canonical ACK未保存，按同一写入UUID和原意图恢复；真实HTTP返回old-fixture。再次业务核对通过。
5. 新增一条已完成合成业务行后，真实业务核对拒绝。原冻结行quote仍为6，没有回灌数据库或重放任务；保留新增行直到销毁整个独立测试DB。

实际Next boot e10c6371-31e7-4a63-a5af-2ed6f94b85ad。首轮因观察器冲突失败的目录/诊断保留，修正后v2通过。此联合验收使用最小私有Nginx配置及合成旧HTTP入口，不冒充103的51类生产路由包或实际旧调用Worker验收；51类路由、4249静态字节、两种原字节回滚仍引用独立已完成的v4 Nginx验收。生产连接、供应商调用、任务重放全部0。测试容器/匿名volume/网络按精确CID和自有label清理。

证据：output/canvas-video-fusion-20261013/checkpoint-d/rollback-ingress-20261017/，Linux原件/var/tmp/video-rollback-ingress-20261017-v2。剩余历史UI可恢复退役、103真实RAM、锁内备份/候选联动/上线、最终审计继续推进。34/34应用能力不等于这些发布门槛已经完成。

## 复核与实际制品来源

Native独立新上下文完整读取8份来源152574字节，逐份workspace/声明/内嵌SHA匹配，最终重读无漂移，结论No actionable findings in the specified safety/correctness paths。其实际读取联合测试结果但没有代跑测试，也未把此结果解释为生产51类路由或旧调用Worker上线验收。

fromCandidate补充保护的独立复核完整读取2份来源98611字节、逐份workspace/声明/内嵌SHA一致，结论No actionable findings in this bounded follow-up；确认新增条件只会阻止不具备原始证明的回退，不产生新的回退许可。两轮复核原文、源快照及SHA材料均留存。

另外实际只读重开已封存v4包，使用当前gateway_material生成反向输入：完整3文件候选闭包、单文件改动、原维护文件逐字节相等；候选dump58ccbc9c093124b01c617e639d2865b69904ab265e6cd5f7699b69476c62d19f反向到维护dumpc852c3a098c689769face5c23f7b184d0e11b74b1f8cfe565a115664048883dd。结果v4-reverse-source-result.json，仅证明真实封存材料与衍生转换一致，不替代实际Linux行为测试。未修改v4包、静态素材或原封存SHA。
