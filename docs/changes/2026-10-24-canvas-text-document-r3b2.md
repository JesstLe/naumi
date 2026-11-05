# R3B2：文字文档、保存队列与草稿恢复

日期：2026-10-24。分支 `codex/core-refactor-20261024`，目录 `E:/Workspace/naumi-refactor-20261024`。
完整基线：`a3fee7f5b5e6a37bbe77c0fa29d00d26d806e561`。本模块实现与下述验收已完成；整体重构继续，没有合 main 或部署。

## 新 owner 与实际调用迁移

- `canvas/text-document.ts` 拥有文字文档快照、已确认内容、未保存草稿、按节点串行保存、账号/workspace 队列、加载/错误/恢复状态和历史写入屏障。
- `canvas/text-document-model.ts` 拥有 DTO、归一化、默认尺寸、草稿缓存形状、合并与字段重放；不依赖 React、DB 或计价。
- `canvas/document-scope.ts` 从历史模块提升为文档共享上下文：账号/workspace epoch 与项目 epoch 分开，auth 前后检查，使用原项目/workspace headers。历史协议保留在 `history-scope.ts`，没有复制第二套上下文算法。
- `use-canvas-text-document.ts` 是 React 订阅适配；页面通过 `useSyncExternalStore` 读取实际 owner。没有新增全局状态库或通用事件总线。
- Canvas 旧 `textNodes` state、文字加载分支、localStorage effect、`unsavedTextRef`、`textSaveQueuesRef` 和内联保存循环已删除；`persistTextNode` 只委托实际 document.save。
- 历史模块通过窄 `CanvasTextHistoryPort` 与文档协作，不再直接操作文字 setter 或未保存 Map。属性/文字剪线/整理/撤销仍用原历史 owner。
- 原节点和项目删除接入同一屏障，先排空已有文字保存，再删除并清理草稿；后来排队的旧保存不复活删除节点。
- workflow import、Agent 接受的文字和节点复制使用 `accept` 合入已持久化快照，不把已成功结果误记为未保存。

主组件 **11936 → 11872 行**。新 owner 132 行、model 40 行、scope 41 行、React hook 25 行；职责与并发次序比净行数更重要。核心生成、计价和供应商执行未修改。

## 用户可观察行为

1. 保存请求在 auth 等待期间遇到账号/workspace A→B→A 会失效；项目切换不冒充账号切换，已编辑原项目仍用原项目身份保存。
2. 同一节点串行，不同节点可并行。历史事务先排空前序保存，再提交；后来的保存只叠加边界之后发生的字段修改，不用旧整节点快照覆盖撤销结果。
3. 历史成功后的独立视频刷新在屏障外执行，显示刷新不占着文字写入队列。
4. 未保存草稿按 actor/owner/workspace 缓存；恢复会合并服务器结果和本域草稿，不自动重 POST。原个人缓存仅用于同账号 personal 兼容，不导入其他 workspace。
5. HTTP 失败、响应格式异常和正常空数据分开。读取失败保留缓存文档并显示“重新加载文字”，不再把它标成加载成功。
6. 服务器保存响应晚于新编辑时保留新草稿；读取响应晚于成功保存/删除时不覆盖新结果。
7. 无 DB 的明确 `persisted:false` 模式仍可本地保存；localStorage 写失败时保留未保存状态，不谎称成功。

## 实际验收

证据目录 `output/refactor-r3b2-20261024/`；原字节在实施前复制并计算 SHA，完整 Git 基线另有归档。

- A/B verifier 调真实 Canvas `persistTextNode`、`applyHistory` 和真实模块；React/auth/storage/HTTP 是本地控制端口。BASELINE **10 cases / 22 checks**，MODIFIED **21 cases / 58 checks**，均 exit 0，前者是旧行为复现。
- 正常文字保存 body 与原版一致。新增场景覆盖账号/工作空间 ABA、队列隔离、读写交错、丢失保存回执后的读取识别、个人缓存迁移、历史删除及新草稿保留。
- 真实 PG **16 checks**：实际 owner → 实际 text/history Request handler → 隔离数据库；保存/撤销/尺寸更新最终为 `content=before,width=600`，身份/输入负例及零供应商调用通过。
- 真实 Next Canvas/Edge **12 checks**：继承 R3B1 七项，并新增失败保存、刷新找回草稿、重试清理、读取失败显示旧文字及重新加载。实际页面不发生成 POST。
- R3B1 **67 cases / 184 checks** 与 R3A **46 cases / 176 checks** 继续通过。原文本 blur、智能布局验收通过。
- 全项目 tsc exit 0；定向 lint exit 0，旧 Canvas 十条 hooks warnings 保持，新模块零 warning。副本回滚恢复旧文件及旧行为；实际工作树保留新版。

## 保留的失败与未关闭事项

- 初次 A/B fixture 把 legacy load effect 放在没有 privateFetchRaw 的 VM 作用域；已绑定真实旧函数。原始 `BASELINE_FIRST.log` 保留。
- 第二次基线预期错误地假设旧 UI 保留 typed；实际旧 history 将内容与尺寸一起覆盖为 before/380。修正用例预期为真实行为，没有改基线源码。
- 浏览器第二轮 fixture reset 未清空 historyApplied 和文字种子，得到 `Expected: 1 / Received: 6`；修复 fixture reset，原失败日志/截图保留，最终十二项通过。
- 协作预览两次 snapshot 返回 `Preview automation snapshot timed out after 15000ms.`，使用既有 Edge 脚本；只关闭本轮自有 tab。
- `verify-canvas-text-image-integration.cjs` 完整旧 verifier 在本轮 baseline 与 modified 均因缺少 pinned 的 `output/canvas-general-text-image-20261023/before/...` 而 setup exit 1、执行 0 cases。没有伪造旧快照或删除断言。该脚本对共享默认尺寸的新定位已单独用真实 AST 验证为 380；完整 suite 仍待补齐原证据后执行。
- 本轮没有给服务端图片/文字引入多 tab CAS，也没有完成全租户 SQL 过滤审计。客户端 actor/workspace 队列隔离不等于这些服务端问题已关闭。
- 原历史事务已提交但响应未知、随后另一文字写入交错的全链路语义，仍需后续持久化合同/CAS 验收；本轮通过的是已知提交/已知拒绝的排队及字段重放，不扩大为所有断网窗口已关闭。
- 全站作品初始读取错误路径、详情/同步编辑任务、渲染交互、R4—R6 及完整 build/性能/容量验收继续。旧 R2 IMAGEGEN_NO_CHANNEL fixture 债务保持。

## 进度与回滚

本轮为上次 main 同步后的第 **1** 个功能模块；开工已 fetch，origin/main 仍为 `905c8c635e41ff3f4443d43db9776d1db3aab469`，已在当前分支祖先内。后续按三模块约定继续。
四产物、每个命令/输入/literal/exit、精确哈希及独立副本恢复记录见 `VERIFICATION.txt`、`MANIFEST.json`。本轮只操作自有 loopback Web/PG fixture，结束后停止/清理并恢复 tsconfig 原字节。
