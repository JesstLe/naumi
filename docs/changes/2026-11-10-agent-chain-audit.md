# Agent 全链路审计：16 项可复现问题

## 结论与边界

本轮在 main `5bf0d9195954a2339e160452a869b084ee1a4e72` 上审查站内工作台、画布 Agent、共享 runtime/Harness、工具与计费、会话持久化、发布归属，以及外部 HTTP/CLI/MCP 网关。确认 **16 项代码路径问题：P1 7 项、P2 9 项**。P1 表示应优先修复的权限边界、核心链路阻塞、运行状态/历史丢失或收费未知状态风险；不表示已在生产发生或已造成重复扣费。

这次是审计，**没有修改产品实现，没有修复或发布上述问题**。结论来自当前源码、实际模块/函数的受控复现和既有回归；没有访问生产数据库、真实用户会话或供应商。不能据此断言所有线上问题已穷尽，也不能用本地用例替代真实 PostgreSQL、多实例和供应商验收。

合并前刷新到 `6d475a6ce906d2f794c8f0b7711eb99ee4e7db44`：新增内容为管理员查询和画布文字布局，未改变本报告问题所在的 Agent 链路文件。最终审计来源 SHA 与源码哈希另见证据 JSON；主线整合不代表业务发布。

## 链路与职责

| 链路段 | 本轮核对的主要入口/模块 | 发现与已有机制 |
| --- | --- | --- |
| 工作台发送、附件、SSE、恢复 | `workbench-client.tsx`、`workbench-session.ts`、`workbench-attachments.ts`、`/api/agent` | 账号作用域回归通过；历史限额、部分内容保留、终态处理存在问题 |
| 画布执行、结果挂载、历史/控制 | `agent/canvas.ts`、`canvas-history.ts`、`/api/canvas/assistant` 及 control | 有项目/账号授权和收费结果挂载；初始持久化失败及跨槽历史操作有缺口 |
| Agent 编排与模型上下文 | `runtime.ts`、`model-config/pi.ts`、`response-policy.ts`、`stream-recovery.ts` | 有模型版本冻结、输入/输出边界、取消和文本续写；事件游标及工作台视觉载入存在问题 |
| 工具执行和计费 | `naumi-tools.ts`、`canvas-video-tools.ts`、`creative-tools.ts`、`billing/agent.ts`、`harness.ts` | 有严格参数、权限、写操作不重试、报价及回执；错误元数据和 A+ 网关预算不一致 |
| 图片/视频/媒体回执 | `execution-evidence.ts`、图像执行器、视频/媒体查询边界 | 识别到正式任务/作品身份；媒体处理输出容器漏收集 |
| 外部接入 | `agent-gateway/*`、对应 Route、`public/agent/naumi.mjs` | 有令牌哈希、撤销、限流、预算行锁、防重及 accepted-work；上传权限、未知结果和回放摘要有缺口 |
| 多实例与排空 | `release-runtime/http.ts`、Agent activity、会话 repository | 执行/控制可按持久归属转发；历史读取/改名/删除未统一接入 |

此表是本轮调用链覆盖，不是宣称逐一完成所有工具的真实供应商验收。Bridge 注册器当前没有生产调用方；不把未启用的 CodexBridge 占位当作正在运行的故障。

## 已确认问题

| ID | 优先级 | 问题 | 触发与实际影响 | 首要修复模块 |
| --- | --- | --- | --- | --- |
| A01 | P1 | 历史消息校验会阻断正常续聊 | 任一历史 assistant 正文超过 4000 字，或工作台历史超过 100 条，下一轮被 `INPUT_INVALID` 拒绝 | Harness / 历史请求契约 |
| A02 | P1 | 事件缓冲截断破坏 SSE/轮询游标 | 第 401 个事件删除前 200 条，仍按旧数组下标读取，漏发工具结果/错误等事件 | runtime 事件游标 |
| A03 | P1 | 画布初始保存失败后永久忙碌 | 设置两个 running 标志后 CAS/DB 保存抛错，没有执行清理，后续任务持续 409 | 画布执行生命周期 |
| A04 | P2 | 工作台中断会覆盖已输出正文 | SSE 报错替换为“执行失败”；无 final 的 EOF 替换为“无回复”并尝试保存 | 工作台流式接收 owner |
| A05 | P2 | 工作台把截断回复作为正常 final | `stopReason=length` 未进入失败/可续写处理 | 工作台服务端终态 |
| A06 | P2 | 工作台忽略权威工具拒绝，仍返回模型声明 | 已有 restricted attention，final 仍采用模型正文，可能继续显示“完成” | 工作台服务端终态 |
| A07 | P2 | 工作台上传参考图未直送视觉模型 | 相对 `/media/` 及普通公网本站 URL 被视觉读取器静默跳过 | 工作台视觉适配 |
| A08 | P1 | 只读令牌可通过 uploads 写入作品库 | 上传 Route 只检查 inspect 权限，没有检查 token write scope | 外部网关上传权限 |
| A09 | P2 | Harness 丢失确定性拒绝的错误信息 | 下游 402/400 等经过包装后变成普通 Error，网关分类为 failed/unknown，预算不能按 rejected 释放 | Harness 错误契约 |
| A10 | P1 | CLI 将未知提交结果映射为普通失败码 | `state=failed,error.submitted=unknown` 返回退出码 1，而非约定的 5 | CLI 终态分类 |
| A11 | P1 | 收到响应头前断网会丢失恢复编号 | `streamCall` 的 request 在保护块之外；MCP 自动生成的 operationId 不随异常返回 | CLI/MCP 提交恢复 |
| A12 | P2 | 媒体处理产物漏入统一回执 | `details.job.outputs[].url` 没有被 resultMediaUrls 遍历，CLI 自动下载列表为空 | 工具结果标准化 |
| A13 | P2 | 免费 A+ 母图准备也占用付费预算 | 实际准备不扣分，但 preparedBilling 带后续模块报价，网关先占一次、继续生成再占一次 | 计费报价与网关预算 |
| A14 | P2 | 外部网关把质检不可用标成成功 | verify 返回 verificationStatus=unavailable 而不抛错，网关统一写 succeeded | 网关结果归类 |
| A15 | P2 | 回放摘要漏掉会影响执行的原始要求 | 相同 tool/arguments/operationId、不同 request，返回旧结果而非冲突 | 网关幂等语义 |
| A16 | P1 | 历史生命周期只检查当前进程，绕开远端运行归属 | 另一槽执行时可显示失败，并允许删除正在执行的会话记录 | 历史 Route / 持久归属 |

### A01：长回复后下一轮被拒绝

证据：[harness.ts:55–60](../../src/lib/agent/harness.ts#L55)、[workbench-session.ts:298](../../src/lib/agent/workbench-session.ts#L298)。接收器先校验整个 history/messages，每条正文不超过 `messageChars=4000`，但允许模型输出 `outputChars=196608`；工作台把全部已有正文作为下一轮 history 发回。Route 后面的 `slice(-10)` / 画布 `slice(-12)` 无法救回已经被拒的请求。

实际 `readHarnessBody` 复现：一条 4001 字 assistant 历史配一条短追问返回 `INPUT_INVALID`；101 条短历史同样被拒。不是模型上下文超限。修复应区分新用户输入、持久历史与客户端历史提示的限额，优先使用服务端历史，不能靠截掉用户原稿掩盖。

### A02：事件数组截断后游标失效

证据：[runtime.ts:400–405](../../src/lib/agent/runtime.ts#L400)、[runtime.ts:619–625](../../src/lib/agent/runtime.ts#L619)、[工作台 flush](../../src/app/api/agent/route.ts#L204)、[画布 flush](../../src/lib/agent/canvas.ts#L141)。两个 push 路径都在超过 400 条时 `splice(0,200)`，SSE 和 GET 的 since 却是原数组下标。

实际 append 函数复现：游标 400，加入 tool_end 后数组长度 201，事件真实存在但 `slice(400)` 返回空。截断发生在流运行中时会漏发新事件；跨回合累计也能触发。应采用单调事件序号及缓冲起点，并为落后游标提供持久快照续接，不只是把缓冲调大。

### A03：持久化失败留下不可再用的会话

证据：[canvas.ts:139–140](../../src/lib/agent/canvas.ts#L139)。先令 `running=true; canvasExecuting=true`，再 await 初始持久化；用于清理的 finally 位于随后才创建的流中。

实际 `runCanvasAgentLocal` 受控 CAS 拒绝后，两个标志仍为 true，模型调用为 0。后续 `getOrCreateSession` 会把它当成活动会话复用；GC 也排除活动会话。需要让初始 CAS、流创建和启动前取消共享同一生命周期清理规则，保留“未提交”和已有任务不重放的不变量。

### A04：流式中断丢失当前可见内容

证据：[workbench-session.ts:429–475](../../src/lib/agent/workbench-session.ts#L429)。收到 error 直接抛出，catch 用一个无 steps 的“执行失败”覆盖末条消息；无 final 的正常 EOF 使用 `reply || '(无回复)'`，没有退回已积累的 streamed，也没有将缺终帧标为未知。

实际 workbench owner 分别接收 delta→error、delta→EOF，均丢失该段正文；EOF 路径还调用 autosave。这证明当前客户端投影错误，不等于已经覆盖了服务端权威历史（服务端 serverOwned 仍能保护已有记录）。应保留 partial/steps，并从原 session 查询终态，不重发生成。

### A05、A06：工作台与画布终态规则分叉

证据：[工作台 route.ts:220–229](../../src/app/api/agent/route.ts#L220)，对照 [画布 streamInterruption/attention](../../src/lib/agent/canvas.ts#L174)。工作台只识别 error/aborted，不处理 length；也仅以 attention 是否存在作为空回复分支条件，没有使用 restricted 的权威回复。

实际 handlePut 受控模型终态：length 输出 final 且无 error；restricted 已发“operation denied”时，final.reply 仍为模型的“model claims complete”。画布已有相应纠正逻辑，修复应收敛公共终态判断，避免再维护两套不一致规则。

### A07：附件在视觉入口被静默丢弃

证据：[workbench-attachments.ts](../../src/lib/agent/workbench-attachments.ts)、[工作台 images 请求](../../src/lib/agent/workbench-session.ts#L327)、[resolveVisionImages](../../src/lib/agent/runtime.ts#L668)。上传返回的媒体 URL 原样传入；读取器却先 `new URL(raw)`，相对地址抛错后静默忽略；绝对本站公网地址又因不同于 INTERNAL_APP_ORIGIN 且不是外部图床白名单被忽略。

实际函数复现：相对媒体 0 张、公网站点媒体 0 张、内部 origin 对照 1 张。后续模型可能通过 inspect_images 工具兜底，因此结论限定为“附件未直接进入模型视觉输入”，不声称所有识图工具不可用。应复用已具备归属校验的 managed reference 读取能力，保留认证和读取失败的可见反馈。

### A08：只读令牌上传写入

证据：[uploads route.ts:11–20](../../src/app/api/agent-gateway/v1/uploads/route.ts#L11)、[saveAgentUpload](../../src/lib/agent-gateway/media.ts#L81)。有效 read-only caller 通过 inspect_images 功能检查即可调用持久化上传；该路径生成媒体并执行 addArtworks。

实际 Route 复现使用已鉴权 `scopes=['read']`，返回 201，调用保存端口一次。没有真实写数据库，**也没有证明只读令牌能绕过付费生成**。需要明确并一致实施“只读”的副作用边界；若产品确实允许只读令牌上传，应独立授权并在契约中明确，不能继续以查询权限隐式授权作品写入。

### A09：确定性 HTTP 拒绝变成 unknown

证据：[naumi-tools internal](../../src/lib/agent/naumi-tools.ts#L176)、[harness.ts:169](../../src/lib/agent/harness.ts#L169)、[gateway failure](../../src/lib/agent-gateway/executor.ts#L138)。internal 已标记 deterministic/status/code，Harness 再抛普通 Error 时只保留脱敏文案。网关设计中的确定性 4xx 分支因此接不到元数据。

实际 Harness＋分类器复现：同一 402 在包装前为 rejected/submitted=false，包装后为 failed/submitted=unknown。calls 的预算统计排除 rejected、不排除 failed，因此已确认未提交的请求也会保守占用预算。修复应保留可公开的结构化错误字段，不放松对真正未知状态的防重保护。

### A10、A11：CLI/MCP 的未知结果恢复不完整

证据：[exitForCall](../../public/agent/naumi.mjs#L185)、[streamCall](../../public/agent/naumi.mjs#L81)、[MCP callTool](../../public/agent/naumi.mjs#L337)。

- A10 实际退出码函数对 failed＋submitted=unknown 返回 1；文档约定 5 才是必须先查 status 的未知状态。外部自动化若按约定处理错误码，可能把未知收费任务当成确定失败重试；本轮没有实际重复提交收费任务。
- A11 发送 POST 的 await 位于 streamCall 的 try 之外；服务端已收包但响应头未到即断网时，异常没有 operationId。实际受控 fetch 抛错返回退出码 5，却无结构化 detail 或可查询编号。CLI 尚可能从 stderr 人工找回；MCP 编号由 callTool 内部随机生成，调用方拿不到它。

应在请求发出前留存操作身份，并让从连接建立到完整回执的所有异常都携带该身份和提交状态。MCP 可增加原操作恢复契约，不能只提醒“先查状态”却不给编号。

### A12：媒体处理产物未被统一收集

证据：[resultMediaUrls](../../src/lib/agent/execution-evidence.ts#L8)、[媒体查询工具](../../src/lib/agent/canvas-video-tools.ts#L111)、[publicMediaJob](../../src/lib/video/media-jobs.ts)。遍历白名单有 task/result/resultAssets，没有 job/outputs；实际媒体接口返回 job.outputs。

实际生产提取函数对 `details.job.outputs=[{url:'/media/video-result.mp4'}]` 返回空数组。影响统一产物回执、knownMedia 和 CLI `--out` 自动下载；原始工具 JSON 仍含 URL，不能表述为文件消失。应按正式产物 schema 统一收集，并测试图片、音频、视频及多文件输出。

### A13：A+ 免费准备占用并重复计算令牌预算

证据：[billing/agent.ts:113–115](../../src/lib/billing/agent.ts#L113)、[serverQuote](../../src/lib/agent-gateway/executor.ts#L89)。余额检查对 generate_aplus 使用 cost=0，但 preparedBilling.billingCredits 仍为后续模块报价；网关直接拿该字段作为本次预算占用。

受控报价 24 的实际 precheck/serverQuote 复现：用户余额 0 仍允许免费准备，网关却记报价 24；接着 continue_aplus_generation 再保留正式报价。每日预算为 24 的完整 A+ 流程因此可能在真正生成前被拒。**这是额度重复占用，不是证明账本重复扣分。**需区分当前步骤费用、未来阶段冻结报价和令牌额度预留。

### A14：质检 unavailable 被外部网关标 succeeded

证据：[verify_image_output 的异常返回](../../src/lib/agent/naumi-tools.ts#L1264)、[runReserved](../../src/lib/agent-gateway/executor.ts#L169)，对照 runtime 对 `verificationStatus==='unavailable'` 的错误识别。

实际 runReserved 复现把 unavailable 结果写为 succeeded。此状态只说明工具函数返回，不代表完成了质检；不能让外部 Agent 据此视为质量检查完成。应把工具执行、质检结论、异步任务受理/完成分开，不以是否抛异常作为唯一成功标准。

### A15：幂等摘要未覆盖原始要求

证据：[beginGatewayCall](../../src/lib/agent-gateway/executor.ts#L185)、[tool-session taskContext](../../src/lib/agent-gateway/tool-session.ts)、[appendOriginalRequest](../../src/lib/agent/execution-evidence.ts#L58)。request 参与生成/验收要求，但摘要只包含 tool/arguments；workspace 也未进入 calls 台账或摘要。

实际 beginGatewayCall＋摘要函数复现：同 operationId 的 request 从红背景改成蓝背景，返回 replay，不是 409。旧结果未重复执行，防重本身仍在；缺陷是不同语义被当成同一请求。应冻结并核验影响执行的 request/空间上下文。跨租户权限影响需另做真实隔离库验证，本轮不宣称已复现越权泄露。

### A16：多实例历史读写绕过活动归属

证据：[canvas-history.ts:54–72](../../src/lib/agent/canvas-history.ts#L54)、[canvas sessionHistory](../../src/app/api/canvas/assistant/route.ts#L325)、[workbench session DELETE](../../src/app/api/agent/session/route.ts#L123)、[legacy bypass](../../src/lib/agent/legacy-runtime.ts#L25)。当前启用 release runtime 时 legacy 转发关闭；执行与控制有 routeAgentToOwner，历史读取/改名/删除没有统一接入持久 owner。

实际 canvasAgentHistory 复现“持久层有未结束轮次、当前槽无内存 session”：GET 返回 running=false/status=failed；DELETE 返回 200 并调用删除。若真正 owner 仍在另一槽运行，随后保存会因记录被删除而 CAS 失败。CAS 可防复活，不能弥补误删。此处为受控双槽状态复现，未启动真实两个 Web/PG。应由会话生命周期统一核验全局活动/未知归属，所有历史写入口使用同一规则，不通过停掉旧槽掩盖。

## 能力缺口、风险和已排除项

以下不并入上述 16 项缺陷计数：

- **已知能力缺口**：CLI/MCP 客户端没有 workspace 参数/请求头适配，HTTP 网关已有 `x-naumi-workspace` 契约；只靠 CLI 当前无法显式选择共享站企业空间。专属站固定空间是另一种情况。
- **已知能力缺口**：角色、场景、原生 3D 导演台、音频、多轨编辑器的完整创建/编辑操作尚未与 Agent 工具注册表对齐；包装 3D 不能代替导演台，视频媒体处理不能代替多轨工程编辑。这与已合入的 [Agent 创作平台 PRD](../prd/2026-11-10-agent-creation-platform.md) 及其 P1–P7 待实施状态一致。节点菜单已统一不等于 Agent 工具覆盖已完成。
- **需压力验证的风险**：uploads 在缺失/伪造 Content-Length 时先完整 `request.formData()`，随后才校验 File.size；12MB 限制不是流式读取上限。应补 chunked 大包的内存/拒绝测试，本轮未发送大包或做线上压力测试。
- **恢复保证边界**：runtime 编排仍在进程内；网关过时 running 仅派生 unknown，调用台账未自动关联下游最终状态进行对账。已有图片/视频 Worker 的恢复不等于整轮模型编排自动恢复；应按原操作身份读取结果，禁止以自动重发掩盖。
- **已排除旧问题**：当前 createRuntimeSession 已读取持久 revision，saveAgentSession 有 CAS 和禁止晚到更新复活已删除记录；2026-10-27 的“缓存不查库直接覆盖历史”不能照搬为现存缺陷。A16 是另一个历史操作归属缺口。
- **已排除误判**：getOpenAISettings 会读取当前 model execution 的凭据；工作台的“模型接口未配置”检查不能仅凭名称认定仍依赖旧密钥。configuredPiModels stamp 含 modelVersion，不能把旧模型配置常驻直接当成已确认问题。
- **已有保护仍保留**：严格 schema、显式工具许可、同一运行的写调用防重、内部端点白名单、外部图片 DNS/IP 检查、令牌哈希/撤销、预算行锁、会话 CAS 和账号 epoch 均有实现/相关回归；局部通过不证明所有权限/并发路径无缺陷。

## 验证记录

复现脚本：[audit-agent-chain-20261110.cjs](../../scripts/audit-agent-chain-20261110.cjs)。它有意断言当前错误行为，输出 `BUG_REPRODUCED`，**不是修复验收脚本**；修复后应将相应用例转换为正向回归。

```powershell
$env:AGENT_AUDIT_OUT='E:/workspace/naumi/output/agent-chain-audit-20261110'
node --conditions react-server scripts/audit-agent-chain-20261110.cjs
```

结果：`REPRODUCED=16 REPAIRED=0 NETWORK=0 DB=0 SUPPLIER=0`。脚本执行实际模块或通过 TypeScript AST 提取的实际生产函数，认证、持久化、模型及网络为显式测试端口。证据包含基线 SHA、源码 SHA256 和每项观察结果，不包含真实用户数据。

| 检查 | 本轮结果 | 证据层级 |
| --- | --- | --- |
| verify-agent-harness.ts | 104 checks 通过 | 实际 Harness 单元边界 |
| verify-agent-without-keyword-gate.ts | 88 checks 通过 | 实际 Harness / 工具策略 |
| verify-agent-stream-timeline.ts | 29 checks 通过 | 时间线 reducer / 持久恢复投影 |
| verify-agent-activity.ts | 通过 | 活动/终态标签规则 |
| verify-agent-original-request.cjs | 12 checks 通过 | 4 个实际 multipart 解析函数 |
| verify-workbench-recovery.cjs | 47/47 通过 | 实际 WorkbenchClient + React 19 + Chromium + loopback HTTP；认证/后端为 fixture |
| verify-agent-chat-attachments.cjs | **未通过：测试基础设施失效** | transpile 单文件后用 new Function 执行，新增 input-references import 需要 require；在产品断言前报 require is not defined |
| verify-capacity-agent-streams.cjs | **未通过：测试基础设施失效** | stub:@/platform/db/pool 缺 getPool 导出，新增 rate-limit 依赖使 bundle 失败；未进入路由用例 |

完整日志、`reproductions.json`、浏览器回归证据位于 `E:/workspace/naumi/output/agent-chain-audit-20261110/`。隔离测试依赖来自现有 `E:/workspace/naumi-quality/node_modules`，不改共享依赖。

当前 PATH 未提供 Docker/psql，本轮未连接 PostgreSQL；需要隔离 PG 的 session-repair、harness-runtime、gateway smoke、真实双实例/租户/余额/并发验收未运行。没有把这些历史 PASS 当成本次结果。仅新增审计脚本与文档，不重复全量业务构建。

## 修复顺序与验收门槛

1. **会话和内容可靠性（A01–A07、A16）**：先修输入/历史契约、单调事件游标、初始化清理和全局生命周期，再统一工作台/画布终态与 partial 恢复、视觉引用。补长回复续聊、事件跨 400、CAS 拒绝、双槽历史读写及断流实测。
2. **外部接入权限与未知状态（A08–A11、A15）**：统一只读写入边界、保留结构化错误、操作编号和未知状态贯穿 CLI/MCP；验证 header 前断网、同 UUID 异参/异 request、失败/未知都不重放。
3. **回执和预算（A12–A14）**：正式媒体 schema 统一收集、A+ 阶段额度不重复占用、质检 unavailable 可辨认；用真实隔离数据库核对报价、预算台账、钱包和结果下载。
4. **补验收基础设施与覆盖清单**：修复两份过时测试替身；按现有 PRD 逐项补原生节点/项目/多媒体工具，不以扩写提示词代替能力接入。最后再做真实 Agent/供应商及授权目标站验收。

以上是建议的责任模块和顺序，未给缺少实测依据的人日估算，也未启动修复或部署。

## 交接

模块与职责：Agent 全链路审计与缺陷复现。

公共接口、依赖方向、数据/状态/事务归属：未修改产品接口和业务数据；复现从调用入口沿现有 owner 查证，不新增产品写入器。

本次实现与迁移状态：新增本报告、可执行复现脚本，在产品总台账及网关文档加入审计入口；16 项产品问题保持待修。

验证命令、结果及证据层级：如上；最终整合 SHA、变更文件和任务资源清理状态记录于证据目录 `DELIVERY.json`。

未完成项与下一步：按优先级修复，补真实隔离数据库/双槽/供应商测试。未发布；47 暂缓发布决定和各站计数不变。审计文档与脚本不计功能迭代或成功发布。
