# 新建图片节点纯文字生图回归追溯与补验收

## 模块与职责
- 用户反馈：新建图片节点直接输入文字不出图，连接前置图片后可以生成。
- 本轮负责合入遗留的编辑拉伸修复，并复查上述新节点链路。继续使用独立 `codex/canvas-edit-aspect-20261028`，不触碰共享 checkout 或 `canvas-action-menu`。
- 自动画幅属于 `imagegen/frame-ratio`；调用方在报价/冻结之前解析，模型准入和实际参数编译继续使用已发布映射。输入归属、任务幂等、已冻结回执均保持。

## 当前实现与历史定位
- 同类缺陷：`automaticFrameRatio` 在无输入图时提前返回，留下 `ratio=auto`；枚举比例通道不接受 auto。连接参考图会解析为实际比例，因此表面呈现为“必须先连接图片”。
- `ac96076b88115688ee9a75417a1cb2146356e21a`（2026-10-17 11:06 +08:00）加入无输入图提前返回的解析逻辑，是漏处理分支的引入点。
- `e6ce5a28210b06a1f895ea99a882e065129f674e`（2026-10-19 11:58 +08:00）新增异步图片通道契约，`apimartImageParameters` 校验枚举比例；auto 不在枚举中即报 MODEL_INCOMPATIBLE。
- `e449b36783661c58e93e1decaee9b6cb99c81ac6`（2026-10-19 17:11 +08:00）把该通道检查提前到计划准入，成为无可用通道错误。`bc6af06d` 后续参数计划编译同样要求真实比例。这是解析缺口与通道契约组合，不是有意新增前置图片要求，也不是原位重新生成功能引入。
- 本轮同步主线时发现 `83455f61fc3a2b0e52ea2ed5d83bbca4c43e37eb`（2026-10-29 14:35 +08:00）已经修复该分支：无图 generate 解析为 1:1，显式比例、参考图比例、edit/cutout/postprocess 与实际像素不变。本轮复用其代码，没有重复覆盖同事实现。
- 上述日期为代码提交时间；没有用户任务 ID/线上请求体，不将它写成该用户首次遇到问题的部署时间。

## 集中验证与证据层级
- `node scripts/verify-canvas-model-admission.cjs --source-root E:/Workspace/naumi/output/canvas-reported-issues-20261029/before --baseline --output-root <evidence>/prompt-admission-baseline`：`CANVAS_MODEL_ADMISSION=REPRODUCED CHECKS=10 SUPPLIER_CALLS=0 NETWORK=0 EXIT=1`。包含两种实际脱敏配置模型的纯文 auto 失败正例，以及 OCR 原始缺陷。
- 最新源码：`node scripts/verify-canvas-model-admission.cjs --output-root <evidence>/prompt-admission-modified`：`CANVAS_MODEL_ADMISSION=PASS CHECKS=16 SUPPLIER_CALLS=0 NETWORK=0 EXIT=0`。真实计划、simulator、编译器；配置/DB/报价边界为 fixture。
- `node --conditions react-server --import tsx scripts/verify-canvas-text-only-pipeline.ts`：独立本机 PostgreSQL、真实 plan/opaque quote/durable parent-child/APIMart HTTP 适配/存储/兼容 GET/结算，`TEXT_ONLY_PIPELINE=PASS INPUTS=0 RATIO=1:1 HTTP_STATUS=200 ARTWORKS=1 SETTLED_OPERATIONS=1 REPLAY_POSTS=0 LOCAL_SUPPLIER_CALLS=1 REAL_SUPPLIER_CALLS=0`。原请求仍为 auto，冻结计划为 1:1，引用上传次数 0，原图不变；具体 3:4 正控通过。
- 实际 Next Canvas 浏览器：点击“新建图片节点”，不连接图片，输入“一只白色猫在木桥边，保持自然日光”，自适应/1K 点击生成。实际请求 `inputs=[]`、`mode=generate`、`ratio=1:1`；一次提交、结果解码和节点显示通过。浏览器 API/图片回执是本地 fixture，未调用真实 AI。真实账务/存储闭环由前一项独立验证，不混写成线上端到端。
- 调试中缺本地 Router secret、未初始化 creation schema、fixture 返回 URL 字符串而非该协议规定的数组导致的失败，均保留原输出；修正的是测试装配，不修改业务代码掩盖失败。

## 未完成项与下一步
- 本轮最终固定 SHA、远端 main 归属、哈希回滚与截图在 `E:/Workspace/naumi/output/canvas-edit-aspect-20261028/VERIFICATION.txt`。
- 47 发布暂停继续有效；本轮不发布、不重放用户任务。线上是否包含这项主线修复须以实际运行版本判断。
