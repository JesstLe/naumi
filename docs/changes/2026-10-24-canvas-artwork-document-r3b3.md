# R3B3：作品文档、读取状态与结果同步

日期：2026-10-24。独立目录 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。
基线：`383339cdd0c6b6b270be1122c04760c9fba38323`。本模块实现及下述验收完成；整体重构继续，不合 main、不部署。

## 实际职责迁移

- `canvas/artwork-document.ts`：唯一作品图状态、初次读取、显式刷新、按 ID 同步、当前状态增删、回收站读取/恢复、读取票号与本地删除记录。
- `artwork-document-model.ts`：响应形状核验、排序、远程记录与读取期间本地字段修改的合并。
- `use-canvas-artwork-document.ts`：React 订阅与生命周期适配，页面不再另存一个作品 state。
- `browser-data-cache.ts`：复用现有有界 metadata cache，不新建第二个 IndexedDB。默认与显式 document 读取均按 workspace 分区；同账号/同 workspace 的作品页与 Canvas 仍共享缓存。请求可注入捕获上下文，auth 前后与共享 in-flight 返回时检查 currentness。
- Canvas 原 `loadCurrentAccount`、作品加载 Promise 分支、`refetchWorks`/`mergeWorks` 实现、删除/恢复数组重建、回收站网络处理已迁出；保留窄适配函数和界面选择/导航。
- 生成、上传、历史、工作流导入均消费同一作品文档；同步失败被任务 controller 接住，重试只补原结果，不重新生成。

主组件 **11872 → 11747 行**；新 owner 101 行、纯 model 21 行、React hook 19 行。行数不是完成标准：核心变化是多个消费者共享一个已提交文档状态，不再由闭包中的 works 与异步 React setter 各自返回不同结果。

## 行为与边界

1. 读取错误不变成空作品或旧列表的成功返回。初次失败不触发“空项目”导航；已有图保留并给明确重试。
2. 按 ID 补取失败不自动扩大成整账号重读。缺少部分请求 ID 会报告同步不完整；重复同步只 GET 原 ID。
3. 读取期间移动、标记、重命名等字段变更保留，同时接受未改字段的服务器更新；较晚发起的已完成读取优先于较早响应。
4. 本地确认删除及较新完整读取的“记录不存在”都阻止旧响应复活节点。回收站明确恢复、历史恢复或已提交快照可重新加入。
5. 返回值直接取 owner 当前图，不依赖还没刷新的 worksRef。旧闭包删除也不丢掉稍后新增的节点。
6. auth 等待期间账号/workspace A→B→A 或调用方 currentness 失效不发 GET；退出挂载后不写入图。
7. 401/403 后不继续显示被拒绝的私有图；其他读取失败保留已知作品。浏览器 metadata 缓存继续排除 user、余额、发票与未知字段。
8. 后台大列表按 100 ID 分段读取；这是已有查询的内部拆分，不是新增用户数量限制。

这不是服务端多 tab CAS，也未解决所有乐观写入回滚次序。它保护的是客户端读取与当前文档合并，服务端权限/事务仍由原 handler/repository 执行。

## 集中验证

证据：`output/refactor-r3b3-20261024/`，实施前复制生产原字节并归档完整基线。

- 真实 Canvas 函数 + 实际 document/cache A/B：BASELINE **14 cases / 23 checks**，MODIFIED **26 cases / 49 checks**，exit 0。基线 PASS 表示复现原问题。
- 真实 PG **14 checks**：实际 owner → 实际 account/get/trash handler → 隔离 PG；局部归属负例、恢复、迟到读保留编辑、零供应商调用通过。
- 真实 Next Canvas/Edge **8 checks**：初次读取失败和重试、两节点并行、选择/草稿保留、定位恢复、空白节点、结果同步失败与原任务继续、receipt 清理。重试新增生成 POST=0。
- 真实浏览器 IndexedDB/cache **20 checks**：缓存命中/刷新、跨 tab 失效、退出清理、配额回退、pending 不缓存、敏感字段排除、workspace 分区和 stale context 零网络。普通缓存三参数接口兼容，同 workspace 缓存共享已单独验证。
- 上轮图片任务 **46/176**、历史 **67/184**、文字文档 **21/58** 通过；上传可见性、媒体队列检查通过。
- 全项目 TypeScript exit 0；定向 lint exit 0，新提取 setter 的三个回调依赖已补齐，原十条 Canvas hooks warnings 保持，模块零 warning。
- 独立副本回滚恢复原文件哈希及基线行为，实际工作树保持新版；四产物与命令字面输出见 VERIFICATION。

## 原始记录与剩余项

- 首轮 lint 多出三条 setWorks dependency warning，补真实依赖，不禁用规则；缩放前快照改为更新前读取，避免同步 store 通知影响撤销基线。
- 同步对照补了“较新的完整读取返回空，较旧 ID 响应随后到达”的负例；缺失本身也记录 read ticket，避免旧响应恢复已删除行。
- 协作预览两次 snapshot 返回 `Preview automation snapshot timed out after 15000ms.`；使用仓库既有 Edge 脚本。仅关闭本轮 tab，其他页面不动。
- 本轮没有全项目 production build、全租户 SQL 审计、多 tab 写入 CAS 或规模负载验证。R3B2 未知历史响应与后续写入交错、R2 IMAGEGEN_NO_CHANNEL、旧 text-image verifier 缺 pinned 原快照仍保留。
- 后续 R3B4 继续详情 A+/同步编辑任务；R3C 渲染交互；R4—R6 数据 owner/控制面/Worker/其他模块及最终完整候选验收。

本轮为上次 main 同步后的第 **2** 个功能模块（R3B2、R3B3）。开工/提交前刷新 origin/main；不将局部通过扩大为完整项目或线上完成。自有 loopback Web/PG、连接与 schema 已清理，Next 对 tsconfig 的机械变更已核对并恢复原字节。
