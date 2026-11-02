# 企业通讯后端：身份、消息、实时事件与私有附件

## 交付状态与基线

- 固定父基线：`09437aaa6f8babfc0e52b28ad049ca72122492a0`。本实现仅在工具准备的 `t3-a436ec5b` worktree 工作；没有建立其他 worktree、修改父树、委派、push、合主线、发布或连接服务器。
- 开工 `git fetch origin main` 后观测远端为 `6142f05ce160015c1894505367819cc4db3c40a0`；没有把新主线自动合入父固定实现基线，交由父线程集成。
- 公共合同 `src/lib/collaboration/contracts.ts` 和父交付文档保持原样。基线只有 wire types，没有通讯实现或 API；基线测试明确返回缺功能，非既有功能回归通过。
- 本地证据是 **真实 PostgreSQL + 真实 route 导出 + 原生签名用户 cookie + 回环 HTTP + 两个 Node 进程**，不是已部署、浏览器联调或 10 万用户容量认证。

## 模块与职责

| 文件 | 职责 |
|---|---|
| `src/lib/enterprise/collaboration-access.ts` | 企业域共用身份及事务边界、HTTP 登录身份/错误映射 |
| `src/lib/collaboration/schema.ts` | 通讯模块 additive schema，沿用核心 schema 初始化锁 |
| `src/lib/collaboration/service.ts` | 目录、会话、成员区间、消息/转发/撤回、未读、presence |
| `src/lib/collaboration/events.ts` | 持久租户事件序列、进程共享增量轮询、SSE 生命周期 |
| `src/lib/collaboration/uploads.ts` | 上传状态、不可变块清单、附件授权、流式下载、限批清理 |
| `src/lib/collaboration/private-storage.ts` | 复用 local/S3/R2 适配器、受保护对象命名空间、Range/MIME/文件名 |
| `src/lib/collaboration/validation.ts` | 输入、幂等指纹、游标与配置上限 |
| `src/lib/collaboration/http.ts`、`src/app/api/collaboration/**/route.ts`（不含 shares） | 薄 HTTP 入口、共享授权 port 组装 |

依赖：HTTP → 通讯用例 → 企业身份事务 / 模块 SQL / 既有存储适配器。通讯不改账号、作品、画布、计费、供应商执行或企业管理模型；共享模块仅依赖企业域身份接口，不调用通讯内部服务。模块表前缀 `app_collab_`，调用方不跨模块写这些表。

## 公共接口、事务与身份

企业域完整导出父合同要求的接口：

```ts
export type CollaborationScope = {
  enterpriseId: string;
  actorId: string;
  ownerId: string;
  memberIds: ReadonlySet<string>;
};
export function withCollaborationScope<T>(
  email: string, enterpriseId: string,
  run: (tx: PoolClient, scope: CollaborationScope) => Promise<T>,
): Promise<T>;
export function authorizeCollaborationRequest(request: Request):
  Promise<{ email: string } | Response>;
export function collaborationFailure(error: unknown): Response;
```

- `authorizeCollaborationRequest` 只使用原企业登录身份，写请求执行 `teamMutationOrigin`；调用方使用 `instanceof Response` 区分错误响应，平台管理员 cookie 不产生聊天身份。
- `withCollaborationScope` 先完成企业 schema 初始化，再借用现有 **business pool** 一个 client；同一事务内锁定企业开关、负责人 grant、活跃成员/账号、actor feature policy、企业 entitlement，再调用业务写入。普通员工无需 `view_records`。
- `pinnedEnterpriseIds` 复用现有部署范围校验。检查企业/owner grant、账号 banned/expiry、membership status/expiry；不给平台管理员或站点管理员额外会话参与权。
- 回滚失败丢弃该 client，保留原异常。未确认提交映射 `503 {uncertain:true}`；不自动重发、不将未知 ACK 当作未写入。任何存储读写均在业务事务释放 client 后进行。
- `scope.memberIds` 是当前企业负责人和活跃成员的集合，不是管理记录的下属可见集合；没有导出电话、备注、余额或账单。

## HTTP / wire 行为

HTTP 路径、JSON 和类型保持父合同。所有非 bootstrap 请求包含 query `enterpriseId`，响应 private/no-store。实现的路由为：

```text
GET    /api/collaboration/bootstrap
GET    /api/collaboration/members
GET    /api/collaboration/conversations
POST   /api/collaboration/conversations
PATCH  /api/collaboration/conversations/:id
GET    /api/collaboration/conversations/:id/messages
POST   /api/collaboration/conversations/:id/messages
POST   /api/collaboration/conversations/:id/read
POST   /api/collaboration/messages/:id/withdraw
POST   /api/collaboration/forward
POST   /api/collaboration/presence
GET    /api/collaboration/events
POST   /api/collaboration/uploads
GET    /api/collaboration/uploads/:id
PUT    /api/collaboration/uploads/:id?part=N
DELETE /api/collaboration/uploads/:id
POST   /api/collaboration/uploads/:id/complete
GET    /api/collaboration/attachments/:id
```

- 私聊只含本人和一位活跃同企业成员，双方并发创建收敛同一会话；群聊创建、转发批次和上传均持久幂等。群成员最多 100；仅当前群主可增删成员/改名，各成员可退出，群主退出按现有活跃参与者顺序转移。
- 消息以 `(conversation_id,sender_id,client_id)` 唯一，标准化 payload 指纹冲突返回 409；正文确认只在事务 COMMIT 后。未知 ACK 重试原 `clientId` 返回原消息，包括撤回后的 tombstone，不恢复正文或附件权限。
- 会话行锁序列化消息、群加入/退出和撤回。成员 `joined_seq` 界定严格历史下限；退出立即无访问，重新加入开始新区间。历史成员区间另存审计表。
- 引用只指向同会话当前可读且未撤回消息；新加入成员收到的新消息若引用旧历史，其 `replyTo` 返回 null，不暴露旧正文。@ 必须是当前活跃参与者。
- 转发先在固定锁顺序下检查所有源/目标会话；重发正文、显式建立新消息附件授权。撤回源不破坏已合法转发的新授权，撤回所有引用后包括原作者也失去已发布附件访问。多目标批次失败整体回滚。
- 共享卡片在 `http.ts` 组装边界动态加载真实 `src/lib/canvas-sharing/service.ts::validateShareForMessageTx`。只允许 direct；不在通讯源码放成功 stub，不修改共享模块。
- 消息列表每页 50，成员每页 100，会话每页 50；游标绑定企业、actor、查询条件及必要成员区间。消息以会话递增序号分页，成员按身份、会话按固定 UUID 分页；客户端负责所加载会话的置顶/活动展示排序。bootstrap 只给首批，余页必须请求对应目录接口。
- 读游标单调前移、跨会话消息拒绝；unread 排除本人和撤回消息。置顶/免打扰是成员自己的设置，免打扰不等于吞掉消息或清零未读。
- Markdown 原文持久化，HTTP JSON 不渲染 HTML；前端仍须按合同使用禁用原始 HTML 的 Markdown 子集。粘贴、拖拽、上传进度/重试 UI 由界面模块负责，后端通过真实分块状态提供其依赖。

## 在线状态与实时事件

- presence 使用 `(enterprise,actor,sessionId)` + TTL，多个 tab 的有效 `online` 优先于 `away`，全部过期即 `offline`。只在合成状态变化时写成员失效事件；续期不产生重复上线通知。
- 事件为持久失效通知，不带正文。企业 `event_heads` 的事务行锁保证序号分配与提交顺序一致，避免裸 BIGSERIAL 的提交逆序漏读。
- 一个 Node 进程一个 Symbol 持有的 event hub；仅有订阅时每秒用现有 business pool 发 **按企业+序号索引的增量查询**，每企业每批最多 256 事件。没有每用户持久 PG client、LISTEN client、新私有池或 tick 池。
- 同企业订阅复用最小游标；两个进程从相同持久事件读取，离线 cursor 追赶。落后超出保留窗口/游标超前返回 reset；事件只保留最近约 10000 个，限批删旧，不删业务消息。
- SSE 用 authenticated fetch；有 heartbeat、背压关闭、AbortSignal/cancel 退订、无订阅清 timer、故障结束流让客户端重连。每 15 秒批量复核订阅身份；单流最多 5 分钟，强制重新验证登录。正文/附件请求每次即时鉴权，不依赖这个短租约。
- presence 过期清理每批最多 200，事件清理每批最多 500。它们使用普通 pool 的短事务，独立释放，不借用 Worker tick 专用连接。

## 附件、私有存储与清理

- 复用 `storageConfiguration` / `createObjectStorage`，不使用 image-only 上传 API。对象 key 是 `image-job-results/collaboration/<随机上传UUID>/<随机块UUID>`；该原有内部命名空间被 `/media`、`canReadMedia` 和通用 `readManagedObject` 明确拒绝。
- local 使用既有 MEDIA_DIR 的持久挂载。private 且无 publicBase 的 S3/R2 用既有签名对象适配；公开 bucket 配置保留私有文件在 local。响应不返回对象 key、公链或 presigned URL。生产须保持 local 的既有持久媒体挂载在 Web 实例间共享；云端配置变更须保持原对象可读，不静默假装迁移。
- 原文件名仅显示；拒绝路径、Windows ADS/设备名、控制字符和危险双向控制符。随机 UUID 保证同名独立。ZIP/RAR/7z、设计/工作文件一律不解压、不执行。
- 块号从 **0** 开始；每块必须精确等于预期大小，最后块可短。事务先保留不可变 key+SHA256，释放 client 后 put，再事务确认 ready。相同块/同 hash 可重试，另一内容 409，半块不确认；中断后 GET uploadedParts 续传。
- 完成只将所有已确认块封为 ready 清单，不拼接整文件，不建巨型 Buffer。单次输入最多一个配置块，下载逐块逐流输出；Range 可跨块，非法多 Range 返回 416。
- MIME 由首部辨识允许的 raster/video signature；HTML/SVG/脚本扩展始终 octet-stream attachment。所有附件带 nosniff、RFC5987 文件名、sandbox CSP、same-origin CORP；仅已辨识安全图像/视频可 `preview=1` inline。
- 新附件只允许上传者发送到原会话一次；之后读取依据未撤回消息+当前成员区间，转发必须通过明确转发用例获得新授权。
- 取消先 durable tombstone，给在途 PUT 十分钟宽限；模块上传流量每分钟至多触发一次 `cleanupCollaborationUploads`，每批 8 上传/每上传最多 128 块（手动 batch 上限32）。首次 TTL 到期先 fence，再宽限后删。存储失败保留记录下次重试；迟到 PUT 在最终确认发现 tombstone 后补偿删除。没有上传流量时可以由现有维护入口调用导出的 bounded cleanup，不新建定时服务。
- 完成文件不自动过期；任何曾发布或仍存在消息引用的文件均不被上传 reaper 删除。撤回不等于物理远程销毁；后续引用感知的存储回收策略另行处理。

### 配置

| 环境变量 | 默认 | 有效范围 |
|---|---:|---|
| `COLLABORATION_ATTACHMENT_BYTES` | 2 GiB | 1 byte～64 GiB；同时受 16384 块上限约束，bootstrap 返回有效上限 |
| `COLLABORATION_CHUNK_BYTES` | 4 MiB | 64 KiB～16 MiB |
| `COLLABORATION_UPLOAD_TTL_MS` | 24h | 1min～7d，仅未完成上传 |
| `COLLABORATION_PRESENCE_TTL_MS` | 90s | 15s～5min |

`bootstrap.limits` 回传 attachmentBytes/chunkBytes。PUT 请求不受新的整文件 Buffer 限制；超出上限上传前明确 413。

## 集中测试与证据层级

执行：

```powershell
node scripts/verify-enterprise-collaboration-server.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
# 在本任务明确路径已 staged、MODIFIED/TYPECHECK 证据已记录后封装并验证：
node scripts/verify-enterprise-collaboration-server.artifacts.cjs
```

控制器：每次至多创建一个 `postgres:16-alpine`，256 MiB / 1 CPU、随机回环 TCP 端口、唯一 label；TCP `SELECT 1` 确认就绪；finally 校验 label 后按完整 container ID stop/rm。没有读 `.env` 或复用业务数据库。HTTP 网络 fence 拒绝非回环请求，真实供应商调用 0。使用 Node 24.19.0 / React+ReactDOM 19.3.0 / Next 15.5.27 / pg 8.20.0 的只读依赖 junction，没有修改共享 node_modules。依赖的 lucide CJS 标注异常通过测试 bundler 直接打包其原 ESM 入口解决，不改包或 stub UI 模块。

覆盖组：普通员工目录/隐私字段；跨企业、离职、membership/account expiry、owner grant、feature/tenant 开关、平台 cookie、伪造参与者；两进程并发幂等/同 payload replay/异 payload conflict；真实 HTTP 响应丢弃后的 durable 恢复；重启补读；未读/单调 read/置顶/免打扰；群主权限和加入退出重新加入；引用/@；搜索 50+3；成员100+2、会话50+余页；presence 多 tab/TTL；两实例 SSE、断线追赶/reset/关闭与身份失效；ZIP hash/跨块 Range/文件列表；重复/冲突/半块/跨进程续传；HTML/SVG/恶意文件名；同名 RAR/7z；引用授权/转发/撤回/群加入后附件区间；取消/过期限批清理；零字节/图像预览/上限；S3 签名回环对象协议和 R2 adapter Range；并发成员撤销后写入拒绝；仅一个空闲 business client 下成功请求；rollback 故障保留原异常、销毁客户端、tick 池未分配。

外部 port fixture **仅替换尚未整合的共享模块**，在真实 PG fixture 表记录 author/requester，明确拒绝第三方/群转发。它不冒充真实共享实现；生产 http.ts 保留真实 import。

类型检查当前唯一缺项：`src/lib/collaboration/http.ts` 导入的 `@/lib/canvas-sharing/service` 尚未出现在本 worktree（TS2307）。没有删除该调用或添加生产伪 stub；父整合后必须复跑真实共享模块类型/路由/双账号验证。完整 Next build 和浏览器 UI 不在这次本地服务器证明中。

集中运行的字面结果：`COLLABORATION_RESULT cases=20 passed=20 failed=0 tier=LOCAL_PG_ACTUAL_ROUTES_HTTP suppliers=0`，exit0；fixture 回执 `FIXTURE_CLEANUP=PASS remaining=0`。类型检查记录 TS2307，exit2，而非全项目绿灯。

## 四产物与 copy-only 回滚

证据目录：`output/enterprise-collaboration-server/`（ignored，不提交 fixture 或账号数据）。

- `MODIFIED_FILE.zip`：本任务所有源码/路由/测试/模块文档修改版。
- `DIFF_FILE.patch`：只含本任务明确路径的完整 Git diff。
- `VERIFICATION.txt`：基线、修改版、hashguard 拒绝、独立副本 rollback、类型缺项、SHA256 与四产物重新打开记录。
- `ROLLBACK.sh`：可执行 Bash。要求显式独立副本根目录和标记；拒绝源 worktree。全部目标路径/hash 在第一笔写入前统一检查；任一 later edit 则 exit73、零写入；只恢复基线文件/删除本次新增文件。不会动数据库、媒体或已受理业务。

本次目标在基线均不存在；rollback 后复现 `COLLABORATION_BASELINE=MISSING_FEATURE routes=0 implementation=0`、exit2，表示准确恢复缺功能状态，不把此输出说成业务通过。源 worktree 和 MODIFIED_FILE 保持修改版。

## 未完成项与父线程集成

1. 合入实际共享模块，替换测试中的明确 external port fixture 做真实卡片同企业/双方授权校验，并复跑完整类型检查及固定 build。
2. 使用 UI 模块做原版 `/canvas` / `/desktop` 双账号端到端，包括 authenticated fetch SSE、漂浮窗切路由、上传进度/取消/重试与账号 generation fence。原始 HTML 禁止渲染由 UI 同时验收。
3. 用户实际云存储、持久挂载/多实例共享磁盘、断网恢复、Web 代理 request-body/idle timeout 与公网版本验收尚未执行。S3/R2 回环协议验证不是云账号验收。
4. 无 10 万活跃用户压测结论。每 scope 构造活跃 memberIds，事件按租户有序，连接数量未扩大；后续按真实企业大小/消息速率做容量与搜索索引测量，不靠增池掩盖问题。
5. 完成但未发送的附件当前不默默过期；用户可取消。已发布后无引用文件暂保留，不自动物理回收。上传 reaper 为限批按流量触发，不保证无任何流量期间的固定时间清理。
6. 父线程负责审查、主线整合和既有发布流程。本子任务只 task-only commit、clean handoff。
