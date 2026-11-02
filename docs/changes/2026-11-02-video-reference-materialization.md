# 全能参考：复用现有音视频的解码类型与存储签名一致性

## 模块与职责

- 任务基线：`2b990949421214802ae900e34f2baf6869f78443`，工作树 `naumi-canvas-video-modes-20261102`。
- 本切片只改 `src/lib/video/reference-materialization.ts`；`assets.ts`、冻结合同、Token 格式、供应商 codec、计费与数据库结构保持。
- `assets.importVideoAsset` 负责登记实际解码后的素材类型；`media-inspection.verifiedOwnedMedia` 负责归属、真实字节 SHA256、完整解码探测；reference materialization 负责输入授权和本次外部地址。原存储 MIME 是已有对象/签名身份，实际解码 MIME 是本次模型输入的媒体类型，两者不强制相同。

## 已复现问题

视频 MIME 的 MP4 文件可以只有音轨。已有导入链路会把这种文件正确登记为 `kind=audio`、`mimeType=audio/mp4`，原对象仍为 `content_type=video/mp4`。旧引用链路在读取真实解码结果前，以原对象 MIME 与用户引用 kind 比较，导致已登记音频再次选择时被拒。

只移除这一比较仍不完整：旧 proxy materialization 随后要求 `asset.content_type === ref.mimeType`，仍会在签名之前拒绝。直接把原对象 MIME 改写为音频则改变已有对象/冻结签名身份，并非必要修复。

此外，旧链路允许真实探测结果为 0/未知的音频时长进入请求，参考总时长校验可能把它算成 0。本次在取得真实 probe 后统一拒绝非有限或非正的音视频时长。

## 公共接口、依赖与状态归属

- `authorizeVideoReferences(actor, request)` 公共返回结构保持，仍返回稳定 `/media/` 地址、原 artworkId/key、真实 MIME/bytes/SHA/duration。
- 新私有 `resolveAuthorizedVideoReferences` 在同次调用内保留原对象的 key/SHA/bytes/MIME/owner/public 快照，不接受客户端传入、不跨请求缓存、不写数据库。
- `materializeVideoReferences` 在给地址/内联数据前重新核对上述原对象身份；签名仍使用原存储 MIME，Token 验证、有效期 900 秒、ownerHash、大小和 SHA 约束原样保留。
- 私有 presign 模式需要补传已有对象时，仍使用原存储 MIME；proxy 模式和已远端就绪的媒体不重传。
- 真实字节与资产登记的 SHA/bytes 不一致时拒绝，不把变化后的文件静默视为新输入。
- 所有正常素材仍按本人作品读取和实际媒体流复用；不复制已登记音视频、不创建新供应商任务、不重新扣费。

## 本次实现

1. 基于 `verifiedOwnedMedia().mimeType` 校验 `ref.kind`，不依赖浏览器或早期上传的 MIME 标签。
2. 校验真实 SHA/bytes 与当前原对象元数据一致，音视频 duration 有限且大于 0。
3. 将实际解码类型和存储签名身份分离；签名前重新核对原元数据，保留后续修改/owner/public 变化的拒绝行为。
4. 相同逻辑覆盖顶层 references 和 elements 中嵌套 references。

## 集中验证

脚本：`scripts/verify-video-multimodal-materialization.cjs`。实际完整产品模块包括 assets、media-inspection、reference-materialization、reference-media-token、reference-media handler、contract 等；DB/对象存储是隔离 fixture，媒体处理服务边界改为本机 FFmpeg 完整流解码及 FFprobe。真实生成音轨 MP4、视频 MP4、PNG 输入。没有监听服务或外网请求。

```text
node scripts/verify-video-multimodal-materialization.cjs --source-root E:/Workspace/naumi/output/canvas-video-modes-20261102/materialization/BASELINE --baseline --output-root E:/Workspace/naumi/output/canvas-video-modes-20261102/materialization/baseline
VIDEO_MULTIMODAL_MATERIALIZATION=REPRODUCED CHECKS=2 REAL_MEDIA_DECODE=1 REUPLOADS=0 SUPPLIER_CALLS=0 NETWORK=0
exit 0

node scripts/verify-video-multimodal-materialization.cjs --output-root E:/Workspace/naumi/output/canvas-video-modes-20261102/materialization/modified
VIDEO_MULTIMODAL_MATERIALIZATION=PASS CHECKS=16 REAL_MEDIA_DECODE=1 REUPLOADS=0 SUPPLIER_CALLS=0 NETWORK=0
exit 0
```

覆盖音轨 MP4 旧作品直接复用、普通视频/图片/音频混合顺序、完整 GET/Range/HEAD 原字节、存储 MIME 签名、Token 到期/损坏、伪造 kind、异主/外站 URL/错 key、客户端伪造 bytes/duration、真实大小与时长超额、未知/0/NaN/Infinity 时长、冻结字节改变、SHA/bytes/MIME/owner/public 签名前变化、嵌套元素输入及原请求不可变。每份报告保存实际加载产品文件路径与 SHA256。

## 边界与后续

- 该验证不等于真实 PostgreSQL、媒体 Worker 远程部署或供应商出片验收；整模块类型、视频业务集成、UI、最终主线与部署状态由父任务集中记录。
- 原生 `audio-node:` / `timeline-node:` 绑定分别要求 `source_audio` / `source_video`。模式/用途 UI 不应将这类绑定一律改成 reference；本切片不改原生绑定规则。
- 47 HOLD 和 103 映射实验分支隔离保持；没有生产配置、任务、媒体或费用操作。
