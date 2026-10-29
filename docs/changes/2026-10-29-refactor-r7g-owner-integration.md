# R7G：主线修复接入既有状态与执行 owner

## 模块与职责

基线2ec5ec85；普通整合固定main3b6a5279（12提交），11处冲突原文在output/refactor-r7g-20261029/CONFLICTS_BEFORE.txt。用户的整体模块化目标继续：新业务修复不能把已拆出的storage/durable-job/Canvas/scan旧单体带回，也不能丢掉主线的真实修复。

本轮先闭合这个跨模块整合，R7F之后剩余的pending/edit占位及恢复编排尚未迁移，不记为已完成。

## 归属与依赖

- 图片持久任务继续归image-jobs/runtime，lease/fencing/queue/checkpoint/released port不变。仅将重复序列化迁入主线image-job-codec。编码输入、付费结果和snapshot保留不同语义；payload不能借结果marker读另一job，原job ID仍参与校验。
- image-jobs/result-storage只负责内部付费checkpoint存取；runtime/managed-read/response/mirror-recovery各自承接X5行为，storage与durable-image-jobs保持兼容facade。最终/root选择先于解码，坏的无关子checkpoint不妨碍原结果续交；原partial及deliveryComplete语义不回退。
- 视频保存仍以唯一六kind native document拥有canonical节点、scope/读合并和命令；VideoNodeSaveQueue只拥有有序保存attempt/journal/未确认草稿，hook仅负责订阅、激活/卸载及beforeunload。不复活另一套视频节点store或copy/history引擎。
- v1/v2 HTTP和direct Worker复用scanApplicationWorkerOnce。direct保留原in-process持久v1回执和background drain；HTTP v2承接域分离认证、capability、boot/commit fencing和受限证明。Web在worker执行模式仍不扫描付费任务。
- Canvas只增加真实视频未保存提示/恢复按钮，原作品/文字读取错误、冲突、history及R7F生成展示owner保持。

## 集成中发现并修正的问题

新保存队列在旧写已经提交但回执丢失时，后到的**未显式提供revision**的新编辑仍取旧缓存revision，恢复旧回执后会与自己刚恢复的写冲突。现在先恢复原body/nonce的回执，再让新隐式revision编辑接续该回执revision；用户明确提供的expectedRevision绝不静默改写。原真实六kind回归及真实HTTP/PG保存回归覆盖该反例。

跨realm异常原message不再被通用保存失败覆盖；HTTP/JSON/网络分类及原operation保持。flush/retryPending均以Promise拒绝返回，不在公开异步接口中同步抛错。

## 验证与证据层级

- 新实际owner A/B：旧3组8检查复现A-B-A塌缩、配置冲突草稿丢失、错误revision被当ACK；新4组11检查全部纠正，且read-only retry以Promise拒绝/POST0。输入是完整基线而非替代owner。
- 当前真实React六hook：68组106检查通过；真实six-kind owner→实际HTTP handler→隔离PG：6组146检查通过，原账本不变。
- 主线真实React/HTTP/PG保存23项通过；真实caller/alert边界8项通过（冲突草稿、非相关position ACK、独立节点恢复、nonce、账号/workspace ABA、StrictMode/卸载）。这是fixture认证/HTTP链，不冒称完整产品浏览器或线上。
- Worker原测试及新nonacceptance单元41项通过；v2真实PG/实际route授权/真实进程18用例通过（合成scan9/付费供应商0），原v1 UNKNOWN不会被新协议升级。
- X5 native实际PG/签名cookie/重启/原字节/一次账务：snapshot681字节、对象788300字节、原回调HTTP1、恢复HTTP0、一笔-6；跨账号job403/media404，payload marker400、跨job拒绝、原final/root无关坏child续交通过。确定边界11项通过。
- health实际PG4用例通过：negative tombstone不计已受理，不影响旧schema与真正UNKNOWN计数。
- tsc/lint/四类SCC、固定SHA受影响矩阵及Worker构建最终结果以VERIFICATION为准。不将早一轮通过跨源码拼接为本轮完整core112/整包Linux/产品上线通过。

## 旧失败、迁移与后续

原失败保留在本轮output：类型路径、跨realm错误、fixture省略workspace订阅/新的auto retry预算、旧schema mock路径和PG断言等。真实队列的隐式revision缺陷修复与fixture准备修复分别记录。

原主线X5/native/check边界和视频测试已接实际owner，不复制本轮新框架。新回归接唯一catalog，X5 native用自有随机PG容器/端口并回收；注册和本地通过不等于远端required CI生效。

<span style="color:#b91c1c">分支超过48小时：用户要求独立整体重构，完整版本退出条件尚未满足，继续候选分支而非把阶段验证冒充整版上线。</span>

完整基线归档、四产物、精确hash/原始输出/退出码、独立副本回滚及远端SHA以output/refactor-r7g-20261029/DELIVERY.json和VERIFICATION.txt为准。整体ACTIVE；下一步继续pending/edit占位及显式恢复的状态归属、INP/容量、有效远端CI和最终main整合退出。历史媒体原生errno根因保持OPEN。
