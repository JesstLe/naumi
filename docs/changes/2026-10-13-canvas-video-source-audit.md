# 画布视频融合源码补充审计

日期2026-10-13。状态：设计修订2，等待书面设计审阅。此文件为静态源码证据，不是功能验收报告；没有修改产品实现或调用视频供应商。

基线：Naumi 3f1aa4a（研究分支6048ae7之后补充文档）；IC 68b37db；TF ae9e5f1。完整版本见[设计](../superpowers/specs/2026-10-13-canvas-video-fusion-design.md)。本地忽略目录output/canvas-video-fusion-20261013/source-evidence.json已记录两来源40位SHA及59个相关文件SHA256。

| 发现 | 当前源码证据 | 对实现/验收的影响 |
|---|---|---|
| 视频生成节点缺少独立持久载体 | canvas-node-settings-store.ts的kind CHECK只有text/image；node-settings.ts严格schema | 新增独立视频节点存储，兼容原节点设置；验证刷新、两窗口revision和复制/撤销 |
| 项目由作品血缘和文字节点推导 | canvas-client.tsx projectKey为tree/group/root或suite batch；文字可独立建立tree项目 | 空白视频项目需纳入列表，结果group/batch稳定归属；节点ID不能冒充作品父级 |
| 任务恢复当前按作品来源过滤 | canvas-client.tsx调用/api/video/tasks的sourceIds；db.ts列表过滤source_id | 新节点/项目关联须持久并可按账号项目查询，不能只靠当前选中作品恢复 |
| 画布Agent上下文以图片为主 | agent/canvas-context.ts仅anchorId/imageUrls和imageModelId/画幅/分辨率/质量 | 增加视频节点/模型/多媒体输入上下文，保持图片路径；SSE结束后视频结果仍恢复 |
| Agent结果附着以image_url匹配 | agent/canvas.ts attach只匹配image_url或返回的artworkId，taskId不能附着未来视频 | 以真实持久task/node/project关联恢复；不通过URL猜生成项目 |
| 引用在三处截断 | canvas-client.tsx onGenerateVideo.slice(max)；generate/route.ts.slice(0,20)；service.ts normalizeVideoReferences.slice(0,20) | 必须三层同时消除静默丢素材，能力限制在预扣前明确拒绝 |
| 上游引用编号并非同一规则 | TF useNodeReferences完整入边序列；IC Agent skills/video.ts按媒体分类编号 | 保存稳定原始排序与派生索引，测试含文字混排、重排/删除后的标记 |
| IC UI与Agent首尾表达不同 | canvas-node-generation.ts/UI读取firstFrame/lastFrame；skills/video.ts称Agent无专用字段 | 共享API需暴露真实首尾角色；不能用提示词当首尾参数证明 |
| 当前模型通道只约束部分视频能力 | model-config/schema.ts capabilities主要图片字段；video/capabilities.ts configuredVideoCapability只限制maxReferenceImages | 新视频能力schema及解析优先级必须贯穿后台、公开目录、执行与快照 |
| 基础签名已经存在，高级素材仍需归一 | model-config/transport.ts只保护transport，但service.ts submitQueuedVideoTask已有canReadMedia/镜像与900秒签名，direct.ts使用其转换后URL | 复用已有流程，扩展到元素等嵌套输入；真实mock供应商实际访问素材，不能把基础签名误判为完全缺失 |
| 私有视频上传暂未显式传owner | video/service.ts完成时uploadImage未传owner；storage.ts owner可选；media-assets.ts允许作品DB引用兜底 | 现有作品完成后兜底不等于结果处理中权限已建立；测试两个账号及落库前阶段 |
| 结果暂未检测真实视频流 | result-download.ts检查MIME和大小；service.ts只检查非空后上传/落作品/结算 | E2E必须可播放并FFprobe；损坏结果不能作为成功作品结算 |
| Content-Length预分配存在偏小边界 | result-download.ts按头长度new Uint8Array后直接set，实际总量仅与200MB上限比较 | 验证头偏小、chunked、断流及资源释放，不仅验证声明超限 |
| 发送到画布的已存在结果仅改变origin | tasks/[id]/send-to-canvas/route.ts已有artwork时setArtworkOrigin并reused | 增加实际目标项目归属/引用，重复发送同项目幂等，跨项目复用明确 |
| 现有画布“工作流”包含不同路径 | canvas-workflows.ts是ComfyUI manifest解析；canvas-workflow-import.ts是外部设计素材导入 | 本轮视频工作流必须做真实执行/任务/产物，不把素材导入当视频工作流完成 |

修订2已经把这些问题纳入设计第3节节点/接口/Agent契约、第4节引用规则及第6节媒体核验。所有问题目前仍待实现与验证。

后续状态：用户已回答“按方案继续”，进入实施计划阶段。发布授权沿用。最近一次103只读基线核对见设计；本补充审计及事实修订没有新服务器操作、构建、E2E或发布，不计功能迭代/成功发布次数。
