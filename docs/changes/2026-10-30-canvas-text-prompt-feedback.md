# 画布文字、提示词优化与 OCR 首次打开修复

## 范围与固定基线

- 统一工作树：`E:/Workspace/naumi-canvas-feedback-20261030`；本模块开始基线 `3065cf964e53ccac9865ab8b26d7da6359dcec94`。
- 覆盖截图中的“文字模型未返回正文”“AI 帮写失败”、普通文字节点错误提示串用反推语义，以及在线改字首次打开时已显示模型却提示没有可用模型。
- `codex/model-mapping-103-20261029` 及后继实验线保持独立；本模块未读取、复制或整合其产品增量，没有修改生产配置、路由、价格或任务。

## 已确认的源码缺陷与证据边界

1. **非流式调用收到 SSE，被 SDK 当作字符串返回。** 原 `modelAwareOpenAI` 直接把兼容接口的 `text/event-stream` 响应交给 OpenAI SDK。调用方没有设置 `stream:true` 时，真实 SDK 返回字符串而非 completion 对象。实际 `text-generate` 路由因 `choices` 不存在返回 `TEXT_OUTPUT_EMPTY`；实际 `prompt-assist` 路由读取 `resp.choices[0]` 抛错后返回泛化帮写失败。隔离本地 HTTP 以同一 SSE 复现两条路径，每次只收到一个 POST。
2. **结构化正文不完整兼容。** 提示词优化直接 `.trim()`，正文为 `[{type:"output_text",text:"…"}]` 时抛错；通道预处理也只接受字符串正文。现在三处统一读取明确 answer text，不把 reasoning、图像或 tool arguments 当作正文。
3. **OCR 首次打开存在目录加载竞态。** 弹层打开后立即提交 OCR，但 `TextModelSelect` 的目录由后续 effect 才加载。既有脱敏配置 v152 有可见视觉模型、没有 `vision.ocr` 默认 binding。首请求未携带实际选中模型时报“当前用途没有可用模型”，目录稍后加载使界面看起来已有选中模型。本次让 OCR 提交等待与选择器相同的 published catalog/inflight 和选择解析；不猜供应商能力、不新增后台默认绑定。
4. **托管文字或 OCR 连接仍错误依赖旧全局 Key。** 已有冻结 model scope 可提供连接，但路由先判旧全局 key 为空返回 503。只在真实 frozen scope 存在时允许进入既有 managed client，实际 key/model/endpoint 仍来自该 scope。
5. **普通文字失败没有持久化具体错误。** `generateTextNode` 的失败只写 status，页面回退用“重新选择原图反推”。父集成 patch 补存实际错误、运行/成功清旧错误；通用失败文案改为重试，普通文字写作不再被产品图改写工作流占据主操作。

上述是当前源码的可达缺陷和隔离复现，不代表已读取截图发生时供应商的原始 HTTP 响应。没有把 SSE 兼容缺口断言为所有生产空正文的唯一原因。真正空正文、拒绝、只给图片、reasoning-only 和截断回复仍明确失败，未伪造正文或自动二次请求。

## 模块与职责

- `model-config/chat-completion-response.ts`：仅处理非流式 chat POST 对应的 SSE 回包，按 SSE 事件与 UTF-8 增量解码，聚合 choice、tool/function fragments 和 usage，返回标准 JSON completion。请求字节、模型、路由、参数、认证及 `stream:true` 原行为保持。
- 聚合有 4 MiB 上限、终态凭据检查、错误事件拒绝和 reader 释放；异常不重发 POST。不新增 Responses API 协议、不改图片参数映射。
- `model-config/channel-text-response.ts`：结构化 answer content 和大小写 Content-Type 正确识别；保留原通道路由/健康/额度语义。
- `canvas-text-output.ts`：统一答案读取；仍拒绝图片/拒绝/截断，reasoning 不进入用户正文。
- `model-config/feature-client.ts`：新增 `ensureFeatureModelSelection(feature)`；动作与选择器复用同一目录加载及筛选，失效默认 ID 不被当作有效选择。
- `prompt-assist`、`text-generate`、`ocr`：上述适配与原请求校验、正文保护、身份/引用权限一起工作。
- `canvas-client.tsx` 由父统一整合。建议 patch 位于证据根 `text-client.patch`，保留原反推结果和商品改写能力；商品改写入口移至文字节点“更多”，普通文字主操作聚焦文字创作栏。

## 集中验证

测试脚本：`scripts/verify-canvas-text-prompt-feedback.cjs`，支持 `--source-root`、`--output-root` 和 `--baseline`。逐个实际加载文件记录绝对路径与 SHA256；指定根必须提供真实文件，不回退到修改版文件。

```powershell
node scripts/verify-canvas-text-prompt-feedback.cjs --source-root E:/Workspace/naumi/output/canvas-feedback-20261030/text-prompt/baseline-source --output-root E:/Workspace/naumi/output/canvas-feedback-20261030/text-prompt/baseline-final --baseline
node scripts/verify-canvas-text-prompt-feedback.cjs --output-root E:/Workspace/naumi/output/canvas-feedback-20261030/text-prompt/modified-final
```

基线为完整 `git archive 3065cf96` 解压，包含原 client/route/helper，而非只替换接口 stub。实际 OpenAI SDK 和真实 HTTP 服务执行；认证、配置、账务、观测和媒体为隔离边界，真实供应商调用 0，生产写入 0。

- Baseline：预期 `REPRODUCED CHECKS=4 EXIT=1`，其中标准 JSON 正控成功。
- Modified：`CANVAS_TEXT_PROMPT_FEEDBACK=PASS CHECKS=19 REAL_SDK=YES REAL_ROUTES=YES SUPPLIER_CALLS=0 EXIT=0`。包括 SSE 分片和大小写 Content-Type、截断/错误/图片/reasoning/上限、单 POST、tool calls/usage、正常 stream、结构化正文、托管 scope、实际通道正文预处理与 SDK 接合，以及 OCR 并发目录一次请求。
- 首轮测试装配失败为 resolver 把 `src/lib/db` 目录当文件读取（EISDIR），随后限定 `isFile()`；没有修改产品断言或隐藏失败记录。
- 父负责最终完整 CanvasClient 浏览器、类型检查、独立副本回滚和 main 集成；本模块结果不替代生产实测。

## 未完成项

- 截图对应具体供应商原响应与发生时版本未取证，不能据本地复现称线上所有文本问题已闭合。
- 本次不重放原付费或状态未知任务，不修写旧文字内容；旧失败节点重试采用用户明确操作。
- 47 发布暂停保持；本模块代码与测试不表示线上已更新。
