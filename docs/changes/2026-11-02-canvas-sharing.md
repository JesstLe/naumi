# 画布授权复用模块

## 基线与交付边界

- 固定准备基线：`09437aaa6f8babfc0e52b28ad049ca72122492a0`。工具已建立本任务 worktree / `t3/canvas-sharing-module`；未另建 worktree、委派、修改父树。
- 唯一 wire 合同：`src/lib/collaboration/contracts.ts`；父记录：`2026-11-02-enterprise-collaboration.md`。两者保持原样。
- 本模块只新增共享领域、shares HTTP、一个 canvas-owned 显式插入 repository、专属测试与本记录；未修改 CanvasClient、desktop、根 layout、聊天消息后端、身份模块或 billing。
- 基线探测：`src/lib/canvas-sharing/service.ts` 缺失，输出 `BASELINE=MISSING_CANVAS_SHARING_SERVICE`、exit `42`。这是缺功能，不是基线业务测试通过。
- task-only commit 交给父线程串行整合；本任务不 push、不合 main、不部署、不访问服务器、不调用供应商、不操作原用户数据。

## 模块与职责

| 文件 | 职责 |
|---|---|
| `canvas-sharing/domain.ts` | 严格输入、可辨识错误、内容指纹、参与人约束 |
| `schema.ts` | 在事务外初始化现有 native/schema 与本模块四张表 |
| `snapshot.ts` | 单语句读取八类节点一致视图、逐行加锁复核、明确选择/依赖闭包、creation/media 边界、不可执行快照 |
| `copy.ts` | 在授权事务里调用 native repositories 创建副本及新 tenant creation 证据 |
| `canvas/sharing-repository.ts` | canvas-owned 显式 artwork/text 字段插入，禁止整行跨账号复制 |
| `media.ts` | 原生私有存储独立对象、hash 核实、逐对象有界复制、journal 补偿、PNG-only 预览 |
| `service.ts` | 申请/主动分享/批准/拒绝/撤回、CAS、操作指纹、列表/卡片与消息挂载校验 |
| `application.ts` | 外部企业身份事务边界及素材 I/O 两阶段编排 |
| `http.ts` 与 shares routes | 同源、bounded JSON、会话/企业、错误状态、no-store |

### 公共接口、依赖方向、数据/状态/事务归属

生产身份唯一入口为 `src/lib/enterprise/collaboration-access.ts` 的 `withCollaborationScope`、`authorizeCollaborationRequest`、`collaborationFailure`。没有产品成功 stub、没有第二套账号/企业/作品系统。`ShareScope` 是同一合同的内部结构类型，不做授权替身。

HTTP 保持父合同：

```text
GET  /api/collaboration/shares?enterpriseId&direction=received|sent&cursor
POST /api/collaboration/shares?enterpriseId                 CanvasShareCreate -> {share}
GET  /api/collaboration/shares/:id?enterpriseId              -> {share}
POST /api/collaboration/shares/:id?enterpriseId              CanvasShareChange -> {share}
GET  /api/collaboration/shares/:id/preview?enterpriseId      -> image/png
```

`application.ts` 导出 `createShare(email,enterpriseId,input)`、`changeShare(email,enterpriseId,id,input)`、`getShare(...)`、`listShares(...,direction,cursor?)`、`getSharePreview(...)`。类型沿用父 wire。

`service.ts` 精确导出：

```ts
validateShareForMessageTx(
  tx: PoolClient,
  actorId: string,
  enterpriseId: string,
  conversationMemberIds: readonly string[],
  shareId: string,
): Promise<void>
```

消息模块在已授权的同一事务中、且 `conversation.kind === 'direct'` 时调用；该函数核对企业、作者+申请者**恰好两个且不重复**、发信者在双方内、分享未 rejected/revoked。群聊即使只剩两个成员，也必须由消息模块先拒绝：父合同参数只有成员集合，不携带 conversation kind，本模块不反向读取消息表。错误含 `status` / `code`；父整合需确认通讯错误映射保留 403 而不是包装成成功卡片。

本模块表：`app_canvas_shares`、`app_canvas_share_operations`、`app_canvas_share_copies`、`app_canvas_share_media_staging`。前 3 张拥有授权状态、操作身份、来源证据；staging 是对象补偿 journal。实际项目、节点、作品、媒体及 creation 使用已有表和 native writer。消息表不写入共享内容。

## 实现过程与授权不变量

1. 成员申请只需作者身份；不读取作者私有画布列表。作者 offer 必须指定真实自有 project 与明确 source；`artwork` 要求一个明确 artwork ID，`workflow` 可指定节点集合或整个画布。
2. `offered -> requested -> approved/rejected`；作者可撤回 offered/requested/approved。直接申请初始为 requested。批准必须由作者选择 source，或复用作者已明确选择的 offer source。
3. 按企业+actor+operationId 锁住幂等身份，JSON canonical 内容指纹包含 action/share/expectedVersion/source。相同操作返回同一 share 的当前卡片；不同内容 409。写状态采用 expectedVersion CAS，share copy 以 shareId 唯一；重复/并发批准只有一个项目。
4. 每次操作重新使用活跃成员 scope；作者与申请者均须在 scope 中。目录权限不是作品读取权限。结果 key 只返回申请者；作者无新项目访问权。
5. share GET/list 不输出 source、snapshot、prompt、完整参数、素材 URL。预览只给当前双方：明确图片经过解码、清 EXIF、缩放重编码 PNG；无图节点用已授权标题/几何生成浅色 PNG 布局图，不返回正文/提示词。存储读取仅 canonical managed key，不 fetch 任意 URL。长预览读取后再校验 membership/revoke。
6. 批准分为：授权事务冻结 snapshot → 释放连接 → journal 记录唯一目标 key、逐项读取源 bytes/hash 核验并复制 → 新授权事务复核 source digest/CAS/参与者并一次落库。两个账号按稳定顺序加锁。没有事务内嵌套 checkout、没有持 DB 连接做媒体流读取。
7. 新媒体 key 与源完全不同，catalog owner 为接收者。旧作品/源对象真删除不影响目标。媒体复制失败、最后一项 native insert 失败、并发落败均通过 journal 清理自有 staging；COMMIT ACK 不明时先读 journal，committed 永不删除。清理失败保留 `cleanup_pending`，后续批准限批收敛过期 journal；`cleanupExpiredShareMedia(limit=5)` 可供现有维护入口调用。
8. 批准写新 tenant project context、新 `canvas-copy` creation、output links、explicit-no-charge 链及 succeeded 证据，不复制原 creation/账单/任务/operation/token。媒体原生 decoder_version=1 evidence 随同同 hash bytes 复制，支持接收者立即进行音频/多轨编辑；这不是复制执行任务。
9. approved 后 revoke 只撤回分享/预览能力。已形成的副本和 resultProjectKey 保留，不声称远程删除。

## 原生 node-copy 全类型盘点与迁移

原 `src/lib/canvas/node-copy.ts` 是同账号用例：图/文字使用整行 JSON record merge，视频/导演/角色/场景/音频/多轨用 native save，保留源媒体地址及部分 adoption/job 上下文。此路径没有改成跨账号；本模块只复用其 native repository 能力。

| 类别 | 授权副本行为 |
|---|---|
| 图片/作品（含生成视频/音频 artwork） | 明确列白名单，复制 prompt/展示参数/布局；新 id、group/project、内部 group、parent/parentIds；`canvas-add` 隐式项目锚不扩展为素材依赖；保留隐藏版本/编辑标记；原 source/creation/任务元数据不复制 |
| 图片历史 | 复制已有历史资产及当前选择，版本身份重映射，所有版本素材独立复制；operation_id/attachment 不复制，revision 从 0 开始 |
| 文字 | prompt/content/布局/样式及 source/product refs 重映射，向未选择的下游 targetIds 不扩散；generating 清为 completed/idle |
| 视频 | config/有序引用/元素/分镜/参数保留；引用 id、artworkId、storageKey、URL、nodeId、textNodeId 重映射；last_task/last_result 清空，已完成展示作品映射为 display_result_id |
| 导演 | 机位、角色对象、关键帧 ID 与引用重映射；背景/输出作品独立；sceneReference 已冻结正文/媒体保留，历史或已删除 scene 只保留新命名空间冻结来源，不冒充当前 live scene |
| 角色 | 描述、外观、默认外观、明确参考作品保留；外观 local ID 为节点内身份，新 node ID 改变完整引用身份 |
| 场景 | 描述、状态、背景投影、默认状态保留；所有参考素材 remap；state local ID 同上 |
| 音频 | 原 source/edit 参数保留、render 清空。未经过任务的原音 adoption 可 remap；旧 job 绑定 adoption 清空，已完成音频作为接收者普通 artwork 保留，下游引用改指该独立音频 |
| 多轨 | 轨道/clip ID、artworkId/canvasSourceId、剪辑/淡变/音量/画面参数 remap；render/adopted job 回执不继承；已完成成片独立保留，下游改指该结果作品 |

音频/多轨旧“已采用”状态不是可转移的任务授权。接收者继续编辑拥有原编辑参数和现成输出作品；再次生成/采用新结果需由接收者明确执行，复制不会启动处理或扣款。

## 集中验证与证据层级

运行：`node scripts/verify-canvas-sharing.mjs`。

- harness 每次最多一个自有 `postgres:16-alpine`，`256 MiB / 1 CPU`、随机 `127.0.0.1` 端口、唯一 label，实际 TCP `SELECT 1` 就绪，finally 按 name+label 精确删除并检查零残留。
- 真 schema / SQL / native repositories / creation writer / 本地 object storage / HTTP Request-Response handlers；图片实际 sharp 解码，视频/音频由 FFmpeg 生成并完整 decode、FFprobe 建证据，不使用假媒体 payload。
- 外部企业 scope/auth 是**测试专用** `scripts/verify-canvas-sharing.scope-fixture.ts`，esbuild 仅将缺失外部合同绑定到 fixture；fixture 用 PG current membership/ban 检查。生产依赖仍直接 import 企业模块，未写其文件。企业 entitlement/真实 cookie/两浏览器联调必须由父整合后验收。
- 禁止全部 outbound fetch 的计数断言为 0；真实 supplier/generation/billing 调用 0。
- Node `v24.19.0`、React/ReactDOM `19.3.0`，只读使用已有匹配依赖，未安装或修改共享 node_modules。发现 lucide package CJS/ESM 包装冲突后测试打包入口改用官方 ESM，未改库文件。
- 集中已覆盖 23 组：八类节点、角色/场景/音频/多轨引用、图片历史、原项目 hash/任务/账务保持、独立编辑、同操作/不同操作并发单副本、指纹冲突零写、第三人/外企/停用、creation tenant、源变化 CAS、任意 URL/执行秘密拒绝、选定依赖范围、失败整体回滚、真实源媒体删除、过期补偿 fencing、PG 微秒分页、HTTP 同源/授权/预览、连接池归还，以及首次 shares 请求前的伪造消息卡片拒绝（不在外部事务内初始化 schema）。
- 模块 TypeScript 检查对缺失企业接口使用与父合同相同的外部 `.d.ts`，实际业务 imports 均正常检查；无产品 stub。父真实模块合入后的全项目构建/真实身份联调不在此结果内。

首次集中测试发现依赖 CJS 包装问题后修正测试打包；边界复核追加 decoder evidence、PNG-only 无图预览、PG 微秒 cursor、私有存储 gate 和更多并发/清理场景后集中复测。没有反复全项目 build。

### 通讯固定提交只读接口复核

用户提供后端 `b40cd63e2531bc13811dd45006f74b3260084249` 后，只读检查其 worktree 的真实 `enterprise/collaboration-access.ts`、`collaboration/http.ts` 和 `service.ts`：scope 字段一致；http 动态 import 本模块 validator；service 在调用前以 `row.kind !== 'direct'` 拒绝群聊（包括两人群）；`collaborationFailure` 保留本模块 `status`/`code`。未合入该分支、未改其文件；这是实际源码接口对照，不提升为真实 cookie 或整合运行验收。

## 未完成项与明确失败边界

- 父负责真实身份接线、消息 kind=direct gate、UI 双账号联调及集成全构建/发布。本任务没有页面验收、线上验收或容量结论。
- artwork source 必须是实际自有作品；`nodeIds` 外的陌生节点、外人/外企业对象、缺失依赖、未受控外部 URL、私人执行工作流（Comfy/workflowTaskId 等）、含执行秘密配置、导入工作流 decorations/变换均显式 4xx 整单失败，不返回部分副本。
- 跨项目只自动纳入明确引用的自有 artwork；跨项目 text/video/scene/character 等先加入当前画布，否则显式失败，不扫描别人的或作者其他完整画布。
- 支持服务器已经持久化的 native 内容；浏览器未保存的 image draft/referenceBindings 不在父 source wire 中，父 UI 应先保存，后分享。本模块不猜测 sessionStorage 内容。
- 音视频须有原生 decoder_version=1 证据；复制不调用媒体 Worker。应用媒体复制要求 `MEDIA_PRIVATE=1`。默认单对象 64 MiB、总 256 MiB；分别 `CANVAS_SHARE_OBJECT_BYTES` / `CANVAS_SHARE_TOTAL_BYTES`，上界 250 MiB / 1 GiB；超限 413，不截断。
- 最多 200 个节点含依赖、200 个图片历史版本、8 MiB snapshot；超限明确失败。不是十万活跃用户容量验收。
- 批准副本与来源记录属正常业务数据。代码回滚不删已批准副本、不回灌 DB/媒体、不回放任务；DDL 是增量保留表，兼容旧版。

## 四产物与恢复证据

`output/canvas-sharing-evidence/` 是 ignored 本地证据目录，交付 `MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。最终 fixed commit、SHA256 清单、原合同 hash、精确 baseline/modified/rollback 命令及 literal 输出由交付脚本写入 VERIFICATION 并重开检查。

回滚仅在另外的带专用标记副本执行：先验证所有目标的修改版 hash，再做任何写入；后续编辑不匹配 exit 73、零写；禁止指向本任务源工作树。恢复后重新运行基线缺功能探测 exit 42；源工作树始终保留修改版，task-only commit 后 tracked clean。
