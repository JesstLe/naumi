# R7P：文字生图菜单与串行应用归属

## 当前状态

2026-10-30，独立 `codex/core-refactor-20261024`。完整原字节基线 `962abdf698cbe4577f8b1ac0b30dbd4d99953d23`；普通接入 main `1ff8f39a0b2069b2f49e282efe1cbdfeb6e662de`，合并检查点 `4d5bafc0eed10cfe5d5f81b31d76fd6d6db041d2`，无冲突。主线带入发布观测及公开更新记录，不执行发布。整体重构 ACTIVE；本片未合 main、未部署，47 HOLD。

## 职责、接口、依赖和状态归属

- `canvas/text-image-inputs` 保有文字/引用图遍历、全批校验、组合/逐条及产品模式提示词规则。新增纯 `countTextImageReferences`，只计算菜单引用数量，不发请求。
- `canvas/text-image-runs` 拥有菜单快照、按现有 `CanvasDocumentScope.key` 隔离的提交 busy、全批验证后串行调用既有空白图片应用。接口为 `bind(scope)` 后的 `open / close / referenceCount / run / isCurrent / subscribe / getSnapshot`。
- `use-canvas-text-images` 只把 owner 快照接到 React；组件保留五个真实 UI 入口、文案映射和窄端口组装。原有 account/workspace/project/ABA 身份由 document scope 负责，不再在组件复制文字生图专属 revision。
- 实际任务创建、冻结报价、operation、提交回执、UNKNOWN、结果续交、作品链接、history 和账务继续归 `image-runs` 及现有任务/文档模块。新 owner 不持久化任务，不使用新 HTTP、全局事件总线、计费或队列系统。
- 依赖单向：Canvas UI → React adapter → 文字生图应用 → 纯输入规则；应用通过已有 `generatePend` 端口进入空白图片应用。规则不依赖 React/Next/数据库。

## 调研与实现

原组件用一个全局 `textImageSubmittingRef` 锁住所有项目。A 项目一笔在途时，B 项目也被拒绝打开菜单；旧 finally 还会写当前视图的全局 submitting。改为所属 scope bucket 同步准入、finally 只归还原 bucket。旧 scope 回调仍须经过现有 document/view epoch 和组件 epoch，A→B→A 不复活旧菜单或购买回调。

提示词/引用/顺序/几何保持原有行为：先验证全批；未知、失败、取消或 false 不启动下一笔；组合生成一笔，逐条串行；保留 image+text lineage、parent、原 sequence 和 graph 位置。没有裁切提示词、减少引用、降低出图质量、改价或自动重放。

## 验证与证据层级

已完成本片集中验证，最终整片固定矩阵与回滚封存继续执行，权威结果写入 `output/refactor-r7p-20261030/DELIVERY.json`：

- `verify-canvas-text-image-runs.cjs`：完整原归档 56 场景/183 检查，新版 58 场景/204 检查，54 组共同 prompt/reference/lineage/sequence/geometry/error 轨迹精确一致。旧版跨项目 busy 确实复现；新版 B 独立提交、A 迟到 finally/错误不干扰 B，A→B→A 原在途状态保留且不重购。真实 Canvas 函数及完整应用/作用域模块执行；`generatePend` 为截获边界，PG/网络均为 0，不冒称完整图片管线。
- `verify-canvas-text-image-inputs.ts`：72 组纯输入规则与引用计数通过，未裁减引用/提示词或改动原产品模式。
- `verify-canvas-text-image-native.cjs`：8 项实际 Next 页面/React hook 检查通过。真实点击单段取消零提交、两段合并一笔与两个文字反向链接、逐条按原顺序串行、A 在途切 B 开菜单、A 完成不关闭 B 菜单、B 提交使用自身文字作用域。HTTP 为既有隔离 loopback fixture，PG0/供应商0/pageerror0；不是生产或真实余额验收。
- 全项目 TypeScript `--noEmit --incremental false` exit0；Next lint exit0，原有 39 warnings 保留。
- 合入 main 的 `test_release47_activity_scope.py`：26 项真实隔离 PostgreSQL 检查通过，完整 cleanup；未执行发布。
- 原生验收的五次失败尝试原样留存：textarea/已选节点使 Ctrl-add 失效；固定 pane 点击落到新结果/浮层；项目卡的可访问名称包含预览文字而非 title。最终以节点标题、空白 pane 的 DOM hit-test 和真实卡片 title 定位，无业务函数注入、无放宽断言、无产品修改。

本片两个离线入口已加入唯一核心 catalog，扩为 132。完整核心结果、架构与四产物副本回滚以最终 `DELIVERY.json` 为准；脚本库存不记成已执行。

历史 `verify-canvas-text-image-integration.cjs` 把 2026-10-23 的五个私有函数和 FormData 字面写法当结构契约；R7O 后共享图片执行已迁移，这些结构断言不再代表当前业务边界。本片新 verifier 以实际 Canvas 薄入口和整个 owner 模块为对象，仍需保留全部输入、作用域、停止及不重购断言，不为旧私有函数恢复耦合。

## 固定版本收尾与仍开放项

- 应用固定 `60734e087129830961f126bbf36d5a0be88e70fa` 已推独立分支；末次文档提交只补本段及整体索引，应用/脚本与该固定源码逐字节相同。原始输入副本5093文件保持，最终19路径差异包含正常接入main的7路径，不把它们认领为R7P新产品实现。
- **完整核心仍为 PARTIAL：同SHA聚合131 PASS / 1 FAIL / 0 NOT_RUN，不是全绿。** 第一轮84/1/47；既有scene-application在执行拖拽前因deep-link/fit竞争导致源手柄y34被顶部遮挡。原脚本与R7O字节相同。相同SHA续验通过了连线、图片/全景导演及混合事务，但在最后冻结后副本POST遇到本地ECONNRESET。没有自动重放该未知POST，没有删断言或修改产品连线。两次exit1与cleanup原样保留，该整版门禁OPEN。
- 被其早停挡住的47项用原catalog和同一source-bound runner继续；中途T3进程重启，确认原runner/子进程不存在、两loopback端口关闭后，只停止该次确切label/name/ID容器并删除自有env。3个已完成PASS经原日志SHA校验复用；其余44项重执行。最后47项均PASS，该分组仍exit2/PARTIAL，不冒称解除scene门禁。
- 架构四类SCC均0；原lib→app两条fixture边和billing client→toast一条保留。Canvas为5303行，菜单/串行状态的变化归属集中，不以行数充当整体完成度。
- 实际Next UI的2077个应用文件与固定应用字节相同。最终B项目菜单截图已打开核读；一份合并菜单截图存在既有HTTP fixture缺失workflow-group读合同的提示，不据此宣称工作流分组验收通过。
- 远端Actions `https://github.com/JesstLe/naumi/actions/runs/40988364577` 绑定607源码，runner0/steps0，账户支付/支出限制；本地结果不改写为远端CI通过。
- 四产物、完整原字节patch、副本回滚、原56场景恢复及later-edit零写入检查以同目录VERIFICATION/DELIVERY为准。源码工作树保留新版。R7P没有重建完整Linux镜像，旧R7M镜像不改标成新版本。

整体重构保持ACTIVE，未合main、未部署，47 HOLD。下一片优先核对本地图像crop/replace意图与结果应用归属，继续Canvas视图组装及最终整版构建/性能验收；scene门禁与required CI真实阻塞继续记录，未被本片局部通过关闭。
