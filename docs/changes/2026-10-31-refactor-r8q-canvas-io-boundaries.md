# R8Q：Canvas 图片元数据与视频提示词 I/O 归属

## 模块与调研

基线 `e5d89345a2f6b3f37125aeb28656b54a3e7fe3be`，独立工作树 `E:/Workspace/naumi-refactor-20261024`。完整原始源码与 raw SHA 保存于 `output/refactor-r8q-20261031/BASELINE.json`、`BASELINE_SOURCE.tar`，不操作旧 C: checkout。

Canvas 的剩余两处直接网络细节分别是图片 decode 后尺寸回写和视频提示词优化。DOM 观察、节点展示与事件绑定仍属于 UI，不为减少行数机械拆分。

## 本次实现与接口

- `artwork-document.recordDimensions(id,width,height)` 拥有尺寸取整/有效性、作品图的本地投影、每个账号/工作空间文档的一次写入去重，以及通过既有 `canvasDocumentFetch` 的元数据持久化。它不是画布布局 resize，不进入 undo/history，也不修改任务或图片版本。
- 尺寸正常请求的 URL、POST JSON 和 1…8192 范围保留；只读视图仍可显示解码尺寸但不写服务端。非有限数值不再编码为 JSON null。明确 HTTP 失败/网络失败释放该条标记，只有下次实际观察才可能再写，不自动重试。
- 原组件的 `dimensionSyncRef` 生命周期跨账号/工作空间，且 HTTP 非 2xx 不会释放；归入既有文档 Bucket 后不跨文档抑制正常回写。原文档 scope 在认证等待期间仍核对账号/工作空间 epoch；项目导航不应取消同一作品文档的元数据写入。
- `prompt-optimizer-client.optimizeCanvasVideoPrompt(request,prompt,signal)` 拥有视频优化 wire 和响应解释。继续注入既有 `privateFetchRaw` 认证适配器，保留 `idea/mode=optimize/tool=canvas-video`、AbortSignal、JSON/空响应/非JSON错误语义和原文保留文案；不改 image/text 的优化行为或模型选择。
- Canvas 页面只绑定 `recordDimensions` 和视频优化回调，不再拥有这两条 URL、body、响应解析或去重状态。没有万能 manager、第二套作品图或新的任务系统。

## 依赖与数据归属

页面 → 既有作品 document / 提示词 browser adapter → 既有 scoped HTTP / 注入认证 request。作品读写、版本/CAS、权限及服务器事务仍由原模块拥有；没有跨模块直接写表、另开连接、计价修改、供应商调用或付费 POST 重放。

## 验证与未完成项

完成本业务切片后集中执行原实现/新实现对照、现有作品文档与提示词回归、完整类型和定向 lint；结果及副本回滚以同目录 `VERIFICATION.txt` 为准，执行前不预填通过数字。

R8P 整版 core 135 PASS / 1 FAIL / 57 NOT_RUN 仍 OPEN；本切片不替代 full core / runtime / 原生 GUI 或生产验收，不重复启动上一轮内存耗尽的完整测试。整体 ACTIVE，未合 main、未部署，47 HOLD。菜单/属性面板的重复 selection 投影继续列为下一具体审查项。

## 集中验证结果

固定应用/定向验收源码 `00a94230a9e1746a3d0d88b834b7bdcc6f06ce0d`。原实现33用例/82检查，修改33用例/89检查，26组正常元数据/视频/图片/文字优化trace逐项EXACT；7个异常观测在本地明确端口归零（跨账号/工作空间抑制2、HTTP失败标记不释放1、NaN编码为null1、认证等待后的ABA/卸载迟到POST3）。这是可执行夹具观察，不是生产故障率。

实际文档owner→原dimensions/account/get/trash handler→隔离PG共23检查，尺寸取整写入、同文档去重、只读仅本地投影、外账号metadata不变、匿名401均通过。原作品文档26用例49检查、主图片生成57用例129检查及原UNKNOWN一次POST/恢复链、原场景30用例103检查、原prompt API27检查和真实SDK/route19检查，以及作品字段/20并发/18 writer矩阵，均在10个受影响入口集中执行。原runner结果PARTIAL/exit2，10PASS/0FAIL/0NOT_RUN/0reuse；catalog196只是注册总数，不是全196已执行。

完整类型exit0，5087个实际compiler/config/dependency输入前后逐raw SHA相同；lintexit0，既有warning保留。仅改变3个原产品文件、无新增产品文件，其他2133个原src/services raw SHA保持。baseline e5d89345，当前main仍e2f56255；计数0→本产品模块1/3，未合main、未部署、47 HOLD。

首次受影响回归3PASS/1FAIL/6NOT_RUN，旧作品文档VM缺`performance`，已对完整原始副本复现相同exit1；仅向两份既有VM提供真实单调时钟，不替换cache或改业务断言，随后固定新source集中执行10项。原失败日志、基线复现及自有PG清理保留。没有把该旧夹具故障写成产品回归通过。

回滚及归档以本片VERIFICATION/MANIFEST/ROLLBACK_RESULT为准。整体退出继续OPEN；R8P历史135/1/57不跨source当当前通过，本片未建新镜像、未运行runtime177或产品browser92。
