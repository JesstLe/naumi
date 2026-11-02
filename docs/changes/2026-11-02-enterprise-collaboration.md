# 企业通讯、画布授权复用与现有桌面入口

## 当前状态

- 2026-11-02 用户确认“开始吧，这几个需求一起上”。原版 `/canvas` 是核心入口，`/desktop` 共用，不要求用户先进入桌面页。
- 开始基线 `2094431d4ee7465d3dc9f76c86b80b56012fa63b`；刷新 origin/main 后快进至 `56453c50e21f74e2746060240b4ee9df4b5aa667`，保留主线工具修复；开始时 tracked 工作树干净。
- 本次首先固定下面的公共接口和任务分工。接口类型不是已实现 API，不代表功能已完成、已整合或已发布。
- 账号只读盘点和旧设计稿在 ignored `output/enterprise-workflow-sharing-20261102/`；涉及成员邮箱的私密清单不进入 Git。

## 模块与职责

1. 通讯模块：企业通讯录、在线状态、私聊/群聊、持久消息、未读/搜索/引用/转发/撤回、附件及实时通知。
2. 画布共享模块：作者对明确内容的预览授权、申请/批准/拒绝、版本快照、接收者独立副本与来源。
3. 界面模块：根级客户端生命周期、原版画布消息入口、浮动/展开聊天窗、画布分享操作、DesktopShell 增量整理。

依赖：UI → HTTP 应用用例 → 所属领域服务 → 现有企业身份/数据库/私有存储。通讯与共享各自拥有数据表；不复制供应商、计费或任务执行体系。两者共用企业域的窄身份适配；共享服务不调用通讯服务、不修改消息表，消息发布通过共享公开校验接口读取获准卡片，保持单向依赖。

## 已确认交付范围

- 同企业成员免加好友，在线/离开/离线，姓名/岗位/搜索；私聊、群聊与 @。
- 富文本（Markdown 子集按钮，禁止原始 HTML）、截图粘贴、拖放图片/文件，ZIP/RAR/7z 及工作文件上传下载。
- 上传进度、取消、重试、分块续传；会话文件列表；离线消息、未读定位、搜索、引用回复、多选转发、撤回、置顶/免打扰。
- 原版画布页面入口、可拖动可缩放小窗、大窗，切换路由后草稿/会话/上传继续；来消息不抢焦点、不改变画布选中/视口/生成任务。
- 作品/所选节点/画布分享卡片；成员申请，作者选择明确内容后批准，创建申请者独立可编辑画布；复制不执行供应商或扣费。
- DesktopShell 保留导航、原项目 key 和卡片；消除双头部，补消息/成员/申请入口，修正项目快捷列表排序和选中态，不新建另一套项目系统。
- 当前批不加入语音视频通话、远程控制或机器人，不承诺已读回执。

## 公共接口合同 v1

类型唯一来源：`src/lib/collaboration/contracts.ts`。本轮三模块不得各自另造同名 wire 形状；必要新增字段采用 optional，破坏性调整由父线程集中更新。

所有接口前缀 `/api/collaboration`；非 bootstrap 请求以 query `enterpriseId` 绑定企业（包括 POST/PATCH/PUT），不从客户端成员名单推断身份。JSON 失败 `{error:string,code?:string,uncertain?:boolean}`；401/403/404/409/413/503 分开；private/no-store。写操作检查同源。服务端以真实用户会话鉴权，平台管理员 cookie 不成为私聊权限。

### 通讯（后端负责人）

- `GET /bootstrap?enterpriseId?` → `CollaborationBootstrap`。未归属企业的已登录用户得到空 enterprises/成员/会话，而不是假造个人企业。members 首批最多100，余下用 members 游标；conversations 首批50。
- `GET /members?enterpriseId&q&cursor` → `CollaborationPage<CollaborationMember>`。
- `GET /conversations?enterpriseId&cursor` → `CollaborationPage<CollaborationConversation>`。
- `POST /conversations?enterpriseId`，`{clientId,kind,memberIds,title?}` → `{conversation}`；direct 与本人/同一对方幂等，group 创建请求幂等。
- `PATCH /conversations/:id?enterpriseId`，`{pinned?,muted?,title?,addMemberIds?,removeMemberIds?,leave?}` → `{conversation}`；成员变更检查当前群权限。新增成员从加入时起读取，退出立即失去访问。
- `GET /conversations/:id/messages?enterpriseId&cursor&q&kind=files` → `CollaborationPage<CollaborationMessage>`；cursor opaque，历史按稳定键翻页，不无限加载全表。
- `POST /conversations/:id/messages?enterpriseId`，`CollaborationSend` → `{message}`。同 sender/conversation/clientId 相同 payload 返回原消息，异 payload 409；ACK 未知沿用原 clientId，不能另造消息。
- `POST /conversations/:id/read?enterpriseId`，`{messageId}` → `{ok:true}`。服务端验证消息属于可读区间且游标单调。
- `POST /messages/:id/withdraw?enterpriseId` → `{message}`；只允许本人撤回，正文/附件原权限同步失效；记录 tombstone 不作为历史消失。
- `POST /forward?enterpriseId`，`{clientId,messageIds,conversationIds}` → `{messages:CollaborationMessage[]}`。转发先读取自己有权访问的源消息，正文重新发送、引用原附件（服务端仅在源可读且新接收者同企业时建立新授权）；共享卡片不因转发扩大授权。
- `POST /presence?enterpriseId`，`{sessionId,state:"online"|"away"|"offline"}` → `{ok:true}`。TTL + 多页 session 合并，客户端心跳/活动更新与后端到期合成状态；重连不产生一串上线弹窗。
- `GET /events?enterpriseId&cursor`：authenticated fetch SSE；`event: update` 的 data 为 `CollaborationEvent`，`event: heartbeat` 只保活。事件只作失效通知，正文通过鉴权读取；断线补读，游标落后可 reset。不得每个用户常占 PG 连接，不以每人高频全量查询冒充实时；连接、监听、订阅、计时器须有关闭和重连清理，租户变更需断开旧流。

### 附件（通讯后端负责人）

- `POST /uploads?enterpriseId`，`{clientId,conversationId,name,bytes,mime}` → `{upload:CollaborationUpload}`。
- `GET /uploads/:id?enterpriseId` → `{upload}`；`PUT /uploads/:id?enterpriseId&part=N` 为二进制分块 → `{upload}`；块有界、幂等且内容校验，重试不静默覆盖另一内容。
- `POST /uploads/:id/complete?enterpriseId` → `{attachment:CollaborationAttachment}`；`DELETE /uploads/:id?enterpriseId` → `{ok:true}`。客户端只在 complete 确认后发送消息；取消清理只处理本上传。
- `GET /attachments/:id?enterpriseId` 为下载；`&preview=1` 只支持已确认可内联的图片/视频，其他类型始终 attachment/nosniff，危险 SVG/HTML 不内联执行；Range 用于视频/大文件。
- 随机私有 storage key，原文件名只作为展示；ZIP/RAR/7z 不自动解压/执行；公共 `/media` 路由不得绕过聊天附件鉴权。优先复用私有存储后端，以小块/流式方式完成，不全量 concat 大文件，不借用 image-only 上传规则。
- 资源上限应配置化、上传前返回明确错误；文件不默默过期。未完成上传 TTL 清理由该模块限批负责；完成文件由消息引用拥有，不能删掉仍被转发引用的文件。

### 共享（画布共享后端负责人）

- `GET /shares?enterpriseId&direction=received|sent&cursor` → `CollaborationPage<CanvasShare>`；只读作者/申请者各自相关记录，不向普通成员泄露全库画布。
- `POST /shares?enterpriseId`，`CanvasShareCreate` → `{share}`。request 可仅选择作者；offer 必须由实际作者选择 source，并针对一个接收者建立预览授权。
- `GET /shares/:id?enterpriseId` → `{share}`；`POST /shares/:id?enterpriseId`，`CanvasShareChange` → `{share}`。
- `GET /shares/:id/preview?enterpriseId` 只输出该接收者获准的预览，标题/封面不能由任意第三方读取；审批前不返回提示词和可执行完整流程。
- offer → requested → approved/rejected；成员直接申请为 requested，作者批准时选择 source。版本 CAS＋operationId 幂等；批准事务创建新项目和来源记录，一次点击/网络重试/并发批准只生成一个副本，结果项目 key 仅申请者可打开。
- approved 后撤回分享不删除对方已经形成的独立副本；UI 解释真实状态，不声称远程销毁。
- 消息只存 shareId，卡片详情独立鉴权。共享模块导出 `validateShareForMessageTx(tx, actorId, enterpriseId, conversationMemberIds, shareId):Promise<void>`；只有作者/申请者参与的 direct 对话可挂此卡，群聊转发不扩大授权；共享模块不写消息表。
- 源文件删改后已批准副本及媒体引用仍独立可读。只复制可编辑内容/参数/布局/连线和明确依赖，重新映射 ID，不复制旧运行状态、任务/operation/quote/token/nonce/凭据/扣款或外部成员的私有引用。
- 各原生节点类型按已有 copy 用例审查（图片/文字/视频/导演/角色/场景/音频/多轨）；不支持的实体明确失败，禁止悄悄漏掉节点后报告完整成功。

### 共用身份接口（通讯后端负责人，供共享复用）

`src/lib/enterprise/collaboration-access.ts` 导出（两业务模块只依赖企业域身份，不相互借用内部状态）：

```ts
type CollaborationScope = {
  enterpriseId: string; actorId: string; ownerId: string;
  memberIds: ReadonlySet<string>;
};
withCollaborationScope<T>(email: string, enterpriseId: string,
  run: (tx: PoolClient, scope: CollaborationScope) => Promise<T>): Promise<T>;
authorizeCollaborationRequest(request: Request): Promise<{email:string} | Response>;
collaborationFailure(error: unknown): Response;
```

普通员工的通讯目录权限不是 view_records 管理权限；必须验证真实活跃企业成员/负责人（账号 banned/expiry、membership expiry/status、企业/owner grant），不因为管理员可见企业就加入他人的私聊。复用已有企业域入口，在同一 tx 完成授权与写入；禁止事务内递归 getPool checkout；存储流读取放在释放 DB 连接后。不要直接调用管理快照把 phone/note/积分/账单发给通讯录。

### 前端（界面负责人）

根级 `CollaborationProvider` 与 `useCollaboration()`；公开 `open(CollaborationOpen?)`、`share(CollaborationShareIntent)`、`unread`、`available`。Provider 挂在认证/Toast provider 下，不挂 CanvasClient 或路由 key 内。旧用户异步续体必须 account+enterprise generation fence；停止旧订阅/上传、清理所有旧用户内存草稿，不把 A 的状态带到 B（包括 A→B→A）。同用户切路由保留状态；刷页面持久草稿按账号/企业/会话隔离。

原版画布页面消息入口、节点/所选流程/画布分享只调用窄 hook，不把聊天状态堆进 CanvasClient。DesktopShell 和 DesktopHome 复用该能力与现有项目身份，不再造 UI/数据系统。源代码实际入口、快捷键冲突与 portal 冒泡需检查，聊天输入不触发画布删除/撤销/粘贴。

## 分工与路径所有权

| 模块 | 独占路径 | 交付 |
|---|---|---|
| 父线程 | 本记录、`src/lib/collaboration/contracts.ts`、最终集成验收 | 统一接口、串行合并、构建/发布 |
| 通讯后端 | `src/lib/collaboration/*`（不含 contracts.ts）、`src/lib/enterprise/collaboration-access.ts`、`src/app/api/collaboration/*`（不含 shares/）、专属 scripts/docs | 消息/在线/附件、窄身份接口、真实 PG/HTTP 验证 |
| 画布共享 | `src/lib/canvas-sharing/*`、`src/app/api/collaboration/shares/*`、必要 canvas copy/media 窄扩展、专属 scripts/docs | 申请审批、快照/副本/媒体、幂等/权限验证 |
| 界面 | `src/components/collaboration/*`、`src/app/layout.tsx`、CanvasClient 窄接线、desktop 文件、专属 scripts/docs | 完整可操作浅色聊天与分享 UI、React19 浏览器验证 |

跨任务不得改对方文件或自行改合同。缺另一模块时以合同明确 fixture 做集中测试，并如实标记；父整合后必须用真实模块替代 fixture 做双账号联调。

## 集中验收与进度

- [x] 刷新 main、现有能力复核、公共合同与路径划分。
- [ ] 通讯/附件实现与模块集中验证。
- [ ] 授权共享/独立副本实现与模块集中验证。
- [ ] 原版画布/Desktop UI 实现与浏览器验证。
- [ ] 两账号/两浏览器端到端：在线、私聊群聊、离线重连、ZIP 上传下载 hash、路由切换、成员停用、多账号 fence。
- [ ] 作者选择 → 预览 → 申请 → 批准 → 接收者新画布 → 重载 → 独立编辑；重复批准单副本、源媒体删除不破坏副本、新任务/扣款计数均0。
- [ ] 完整类型检查/固定构建、main 普通 merge/push、四产物、copy-only hashguard rollback。
- [ ] 目标站版本/功能/旧槽排空/回滚材料验收。默认103；47维持现状，功能实现不自行解除47暂缓发布决定。

接口/文档验证不是消息和权限测试。首次并行交付未到齐之前，保持“实施中”，不把契约、mock UI、HTTP200或Git提交当作上线。

## 2026-11-02 第一模块交回：通讯后端

- 固定实现 `b40cd63e2531bc13811dd45006f74b3260084249`，26 个新增任务文件；父合同与本记录保持作者基线。父集成分支普通 merge 后 `9a169cdafee22f6b14e9f67e424d5f0ff8cbdbbd`；尚未合共享 main、push 或发布。
- 模块记录：[通讯后端](2026-11-02-enterprise-collaboration-server.md)。消息 clientId/fingerprint、成员 joined_seq/left_seq/read_seq、上传不可变块清单、企业有序 event_heads 为本次主要状态字段。
- 作者集中真实 PG＋实际路由 HTTP：`COLLABORATION_RESULT cases=20 passed=20 failed=0 tier=LOCAL_PG_ACTUAL_ROUTES_HTTP suppliers=0`，exit0；`FIXTURE_CLEANUP=PASS remaining=0`。共享校验为明确 external-port fixture，父真实共享接线仍待复验。
- 基线及副本回滚后均 `COLLABORATION_BASELINE=MISSING_FEATURE routes=0 implementation=0`，exit2，表示准确恢复原缺功能状态。回滚命令 exit0、删除26个新增路径；later-edit guard exit73、零写入。源实现保持修改状态。
- 完整类型检查 exit2 的唯一作者报告缺项为尚未合入的 `@/lib/canvas-sharing/service`，未记为通过。完整 build、原版画布和 Desktop 浏览器联调未执行。
- 父已复制并逐文件 hash 核对作者完整 ignored 证据到 `output/enterprise-collaboration-integration-20261102/server/`，重新读取四产物；保留作者失败迭代、fixture资源回执及 rollback 副本，不依赖未来清理子 worktree 后消失的路径。
- 已向另两个原实现任务发送固定后端提交和实际分页/上传/SSE接口信息。首批通讯录100人、会话50条，界面须加载后续游标，不遗漏第101位成员。
- 保留后续事项：源码独立复核、真实共享卡片联调、已上传文件引用回收策略、部署媒体挂载/代理 body 与 SSE idle限制核验；不将本地HTTP通过等同生产容量。

## 2026-11-02 第二模块与父集成修复

- 画布共享固定提交 `c7e1e88ee7f565c77d3d89a5c774c23cf6b62680` 已普通 merge，修复前集成基线 `416615e0dfd41e42870378cd2792367aacb60df5`。作者18文件、23组真实PG/native repository/私有存储验证；身份仍为明确fixture。作者完整证据130文件已复制到 `output/enterprise-collaboration-integration-20261102/sharing/`，逐文件hash一致，四产物重开。
- 父新增 `scripts/verify-enterprise-collaboration-integration.{mjs,ts}`：不替换企业身份或共享模块，用实际签名cookie、真实企业/成员/负责人grant、真实双方route、回环HTTP/SSE、私有存储与原画布项目/文字读取写入接口联调。
- 修复前实际发现两个根因：①分享创建/申请/批准无 durable shares 事件，`SHARE_EVENTS durable=0 streamed=0`；②分享额外按内部 Request.url 比较 Origin，合法反向代理 Host/HTTPS 归一化后仍 `SHARE_ORIGIN` 403。首次代理测试被 undici 重写 Host，已在本地代理fixture显式归一化 Host再复现，保留两次日志。
- 父修复：公共事务事件 outbox 收敛到 `src/lib/enterprise/collaboration-events.ts`，消息与共享单向依赖同一企业基础接口；共享创建/状态变化与事件同事务提交，重放不额外发事件，收件人限定作者/申请者。事件表初始化在checkout前，媒体流I/O仍在DB连接归还后。
- 分享来源规则复用现有 `teamMutationOrigin` 的实际Host/forwarded protocol逻辑；保留显式企业public origin的额外固定校验，跨站仍403。
- 同一最终10组矩阵：BASELINE `passed=7 failed=3`、exit1；3项失败属于上述2个根因（其中1项为事件写失败整体回滚断言）。MODIFIED（普通池仅1槽）`passed=10 failed=0 real_scope=1 real_sharing=1 real_routes=1 supplier_calls=0`、exit0；`SHARE_EVENTS durable=3 streamed=3`。副本ROLLBACK恢复相同3项失败及原hash，源保持修复版。准确命令/完整stdout/stderr/exit由封包脚本写入修复四产物。
- 集成用例实际覆盖作者offer→真实分享卡片→申请→批准→接收者新项目→原文字API独立编辑、同请求不重复、第三人/外企/两人群聊拒绝、源文件删除后目标hash保持、即时停用/grant关闭、撤回不删已成副本、事件写失败整体回滚、供应商与账本新增0。
- 修复后作者通讯20组及共享23组各集中复跑一次均通过；两套保留原外部fixture的证据层级，新增10组才是双方真实接线。修复前合并双模块全项目tsc已实际exit0；最终UI整合仍须再做一次集中类型检查/固定构建。
- 资源：各轮一个自有256MiB/1CPU随机端口PG，SELECT1就绪，finally按完整ID+label停止删除及volume清理；没有同时启动本父任务多个数据库，无生产连接或真实模型调用。
- 父修复证据：`output/enterprise-collaboration-integration-20261102/repair-artifacts/{MODIFIED_FILE.tar,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`。封包/回滚入口为 `node scripts/verify-enterprise-collaboration-integration.artifacts.mjs`。当前仍待UI交回、独立复核、浏览器双账号端测与main/发布，不将后端集成通过写成整批完成。

## 2026-11-02 UI交回与独立复核修复

- UI固定提交 `c141ab694609bce8545a2e3cb74608356c8d5ac7` 已普通 merge；修复前集成基线 `aa9e4d2956cabd67ce78107c3ce66633c986e66c`。三个实现模块均已进入本任务分支，仍未合共享main或上线。
- UI作者23文件、React19＋双身份HTTP合同fixture浏览器29项通过、pageerror0、完整tsc通过；真实Canvas背景/认证为fixture，实际双方后端尚待浏览器集中联调。草稿可刷新恢复，上传仅覆盖当前应用生命周期/跨路由暂停续传；刷新后的File字节恢复及未加载会话的全量未读合计尚未实现，不能写成已支持。
- UI证据54文件已逐hash归档到 `output/enterprise-collaboration-integration-20261102/ui/`；独立后端审查16文件归档到 `output/enterprise-collaboration-review-fixes-20261102/independent-review/`。没有删除子任务或审查现场。
- 独立复核发现2个P1与1个P2，父直接复现修复：①`conversationTx`先锁会话，再以新READ COMMITTED语句读当前成员，退群锁竞争读写均404、committed_rows=0；②event poll固定本次查询的订阅者集合/起点，新加入旧cursor留待下一轮追赶，实际card_delivered由false变true；③complete在归还DB连接后逐块流式核对长度/hash，缺块返回409并将该块ready清为false以便同上传续传，不再ready后发送再断流。
- 最后完成事务复核原不可变块清单；完整文件从不concat到内存，单次仅流读取一个块、保留256B嗅探头。暂时网络失败不冒充文件不存在、不删除已确认业务文件。
- 原反例通过 `scripts/verify-enterprise-collaboration-review-fixes.{mjs,ts}` 固化：BASELINE输出 `COLLABORATION_REVIEW_BASELINE=REPRODUCED findings=3 healthy_controls=5 suppliers=0`，exit0只表示3缺陷复现；MODIFIED输出 `COLLABORATION_REVIEW_FIXES=PASS repaired_findings=3 healthy_controls=5 suppliers=0`，exit0。缺块恢复后逐字节下载hash通过；未完成附件发消息沿原语义403，首次脚手架误期望409已修正并保留失败日志。
- 修复后三模块真实HTTP集成仍10/10，通讯原20组集中回归通过。审查回归脚本首轮tsc出现target不支持 `1n`，已改为 `BigInt(1)`；产品改动没有该诊断，最终检查以typecheck-final日志为准。
- 本切片四产物目录 `output/enterprise-collaboration-review-fixes-20261102/repair-artifacts/`，逐文件原/改hash、完整命令及literal输出、独立副本回滚和后改零写入记录均由对应artifacts脚本保存。恢复副本重新出现原3反例，源码保持修复。
- 下一步：实际组件＋真实双方后端浏览器端测、共享快照/审批独立复核、固定生产构建及发布。当前只声明源码整合和已列本地验收，未声明全站容量或上线。

## 2026-11-02 共享独立复核四项修复

- 独立审查固定共享候选 `c7e1e88e`，验证树 `e8ff9d67bffb4ac7ed3ade3c68db9257b7d724ee`，确认 P1×1、P2×3。报告/HTTP_TRACE/VERIFICATION等20个直接证据文件已逐hash归档至 `output/canvas-sharing-review-fixes-20261102/independent-review/`；没有复制依赖目录或清理审查工作树。
- P1：作品所属项目按实际group_id、suite batch及旧parent血缘解析并加锁复核，再检查规范项目/单对象/不可变creation-output证据；调用方传入tree:作品id不再绕过既有B企业归属，外部batch依赖同样拒绝。合法本企业别名继续可用，旧无group的外国祖先项目也被识别。
- P2：执行授权字段按规范化单词识别，合法数值token预算（max_tokens等）保留；accessToken、APIKey、clientSecret、嵌套authorization、jobId五组仍422且无副本，不靠删除原凭据拒绝规则放行。
- P2：多轨必需素材闭包以artworkId为准，历史canvasSourceId不再强制拉入已删除场景；若来源节点已纳入复制则remap，否则移除旧活连线，保留实际图片、剪辑参数和独立作品。
- P2：单独分享或显式选择隐藏图片历史结果时去掉隐藏source marker，接收者实际CanvasClient项目聚合由0变1；作为父节点内部历史的两版本仍保留。只采用实际原Client计算函数提取，不把计算验证写成浏览器点击验收。
- 父复用独立真实企业schema＋原生密码登录＋实际路由/仓库/存储反例，固化为 `scripts/verify-canvas-sharing-review-fixes.{mjs,ts}`。测试专用 `.d.ts` 只声明原CanvasClient项目计算端口；runner动态提取实际函数，未放产品stub。
- BASELINE/ROLLBACK输出 `phase=BASELINE checks=12 failures=0 findings=4 real_scope=1 real_login=1 supplier_calls=0`，exit0含义是原4问题成功复现及健康对照通过；MODIFIED `phase=MODIFIED checks=12 failures=0 findings=4 real_scope=1 real_login=1 supplier_calls=0`、exit0含义是4个反例均按修复预期改变。详细响应和HTTP_TRACE留在各phase目录。
- 实际变化：foreign alias/batch批准200→403，接收者不再收到TENANT_B提示词；max_tokens批准422→200并保留1024；来源场景已删的合法多轨422→200；隐藏历史结果批准后项目数0→1。源修改/并发单副本/COMMIT ACK未知保留committed媒体/成员停用/源删除后目标可读等健康对照保持。
- 原23组共享native回归再次集中通过；全项目tsc实际exit0。首次搬移review harness的生成文件相对import深度错误发生在创建PG前，已修正为当前root路径并保留BASELINE失败日志，没有改生产代码凑通过。
- 四产物与原始hash、精确命令/输入/literal输出/exit、独立副本回滚和后改零写入保护保存在 `output/canvas-sharing-review-fixes-20261102/repair-artifacts/`，入口 `node scripts/verify-canvas-sharing-review-fixes.artifacts.mjs`；源码保持修复版。
- 真实浏览器联调仍由原并行任务推进，本轮没有额外新建审查或测试任务，没有部署或连接生产。
