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
