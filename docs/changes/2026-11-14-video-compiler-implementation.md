# 统一视频编译架构实施台账（持续目标）

## 目标与完成定义

状态：ACTIVE；业务重构尚未完成。用户2026-11-14明确要求“制定目标全部搞定”，已建立持续目标，不能用文档、类型定义、局部测试或main合并冒充整体交付。

唯一规范：[统一视频编译RFC](../architecture/2026-11-14-video-compiler-rfc.md)。实施基线main `1fbe7610b5d3e589e892394187f95f6cbfde6d3e`，独立工作树 `E:/Workspace/naumi-video-compiler-p0-20261114`，分支 `codex/video-compiler-p0-20261114`。

完成必须包含P0核心、P1全入口、P2全协议/历史兼容、P3旧裁决退出、P4 A01–A19与应用/DB/Worker/资产账务/回滚验收；完成切片普通合main，发布及实际上游证据分层登记。47明确暂停不由本目标自动解除，103隔离实验线不得混入主线，不暗中发起收费测试。

## 模块职责、接口与数据归属

- video拥有Draft/Intent/Profile/Compile/CompiledPlan；model-config拥有发布Binding/Policy与来源审计；媒体模块拥有资产访问、内容哈希与真实probe；任务/计费继续拥有幂等、预占、租约、结算、UNKNOWN；Canvas拥有节点与选片关系。
- 入口->应用用例->Resolver/Profile纯规则->既有I/O适配单向依赖。不拆计费事务，不新增内部HTTP自调用，不为每个函数机械增加层级。
- VideoModelProfile、compileVideoRequest、CompiledVideoPlan已实现；新版JSON发布绑定已接入正式提交、Canvas单节点、Worker与重试。未配置execution的历史入口仍沿旧链；全协议/全入口状态以下方最新切片为准。

## P0首轮实查结论

1. `reference-materialization.ts` 已按归属/项目可读性、sha256、字节数和真实媒体类型授权素材。
2. `media-inspection.ts` 的 `verifiedOwnedMedia` 已使用完整解码，并按storage_key+sha256+decoder_version=1缓存probe；不是只有上传MIME声明。复用此能力，不重建第二套媒体检查服务。
3. 当前 `frozenVideoSchema` 冻结definition/sources/profile/sourceRevision，缺少新CompiledPlan判别；需扩展plan reader并保留旧快照，不就地重写历史任务。
4. model-config.parameterMap与视频输入/node/workflow严格schema会拒绝未知新字段；迁移必须与Binding/intentPreference解析同步，不能只新增compile函数。
5. RFC全量范围是所有注册wire profile实例加无videoProfile旧路径，不用一个族的一次fixture代替所有子profile。

## 阶段台账

| 阶段 | 状态 | 完成条件 |
|---|---|---|
| 实施基线/清单 | 已建立 | 入口、逐profile、19项验收与历史边界有持久记录；不代表功能通过 |
| P0核心 | JSON发布绑定已完成prepare/compile/受理/冻结计划/Worker/资产账务闭环；其余Profile与后台政策管理待继续 | 新合同/Resolver/Profile/Plan及Policy/Evidence分离有实际代码与集中测试 |
| P1全入口 | 公共与节点预览、通用生成后端、Canvas单次、Worker恢复与显式重试已接入新版JSON分支；UI及其余入口待迁移 | Canvas、Workbench、Workflow/批次、Agent、Storyboard、BYOC、恢复/重试同底座 |
| P2全协议 | 待实施 | 每个注册profile＋非wire路径有迁移/fixture，旧冻结任务不漂移 |
| P3清场 | 待实施 | 新任务旧裁决/fallback/整对象升级职责退出；调用与配置迁移证据 |
| P4集中验收 | 待实施 | 下表全部分层验证，真实上游/发布无授权时保持未验，不以fixture代替 |
| main整合/上线 | 待完成 | 按完成切片整合，实际站点/version/蓝绿/回滚/授权分别核验 |

## 全入口清单

- [ ] Canvas links
- [ ] Canvas composer
- [ ] Canvas single submission
- [ ] Canvas batch
- [ ] Workbench
- [ ] Workflow DAG/freeze
- [ ] Agent canvas/standalone
- [ ] Storyboard
- [ ] BYOC
- [ ] Model management/catalog
- [ ] Recovery/retry
- [ ] Artifact graph/downstream

## 逐协议实例清单

来源：`VIDEO_WIRE_PROFILES` 基线枚举；共57项，仅是范围计数，不是已通过数量。

- [ ] `openai-videos`
- [ ] `grok2api`
- [ ] `cogvideox3`
- [ ] `agnes`
- [ ] `agnes-v25`
- [ ] `ark`
- [ ] `kie-generic`
- [ ] `kie-kling`
- [ ] `kie-kling-v26`
- [ ] `kie-kling-omni-text`
- [ ] `kie-kling-omni-image`
- [ ] `kie-kling-omni-reference`
- [ ] `kie-kling-omni-transform`
- [ ] `kie-motion-control`
- [ ] `apimart-generic`
- [ ] `apimart-kling`
- [ ] `apimart-kling-v26`
- [ ] `apimart-kling-omni`
- [ ] `apimart-motion-control`
- [ ] `gemini`
- [ ] `minimax`
- [ ] `metaso`
- [ ] `autodl`
- [ ] `runninghub`
- [ ] `comfyui`
- [ ] `tokendance-seedance`
- [ ] `tokendance-kling-text`
- [ ] `tokendance-kling-image`
- [ ] `tokendance-kling-motion`
- [ ] `tokendance-kling-omni`
- [ ] `tokendance-wan3`
- [ ] `tokendance-happyhorse`
- [ ] `tokendance-minimax`
- [ ] `tfrouter-generic`
- [ ] `tfrouter-kling`
- [ ] `tfrouter-kling-omni`
- [ ] `tfrouter-grok`
- [ ] `compshare-h3`
- [ ] `compshare-hailuo`
- [ ] `compshare-vidu`
- [ ] `compshare-vidu-extend`
- [ ] `compshare-vidu-lip-sync`
- [ ] `compshare-wan`
- [ ] `compshare-seedance`
- [ ] `apimart-apib-seedance`
- [ ] `apimart-apib-kling`
- [ ] `apimart-apib-wan`
- [ ] `apimart-apib-h3`
- [ ] `geek-kling`
- [ ] `geek-wan3`
- [ ] `apib-video-v2`
- [ ] `geek-video-v2`
- [ ] `geek-h3-v2`
- [ ] `apib-video-v3`
- [ ] `geek-wan3-v3`
- [ ] `geek-h3-v3`
- [ ] `apib-storyboard-v4`
- [ ] 无videoProfile的openai-videos adapter
- [ ] 无videoProfile的direct adapter

## A01–A19验收台账

| 编号 | 要求 | 状态/证据 |
|---|---|---|
| A01 | 错误旧modes/limits、verified缺失、smoke缺失不否决已发布可映射请求；明确政策仍有效 | 待实施/待验证 |
| A02 | 旧描述无来源不自动变政策；人工字段/价格/路由/send=omit保留；同步不覆盖 | 待实施/待验证 |
| A03 | 同协议新增型号只发布Binding即可；新协议结构缺失准确报mapping错误，不按型号正则猜 | 待实施/待验证 |
| A04 | describe与compile共用约束；预览/正式提交在同digest和修订下intent/facts/诊断一致 | 待实施/待验证 |
| A05 | 预览零任务/零账务/零业务幂等/零供应商调用；陈旧响应不覆盖新草稿，预览失败不持久降级 | 待实施/待验证 |
| A06 | 连线/上传/提及同素材、角色和顺序得到等价计划；有语义顺序变化时不错误排序成相等 | 待实施/待验证 |
| A07 | text+媒体旧节点恢复自动；两张普通图不变首尾；明确偏好缺素材准确报告、不丢素材 | 待实施/待验证 |
| A08 | 切模型/保存刷新/多选/锁定不丢提示词、引用或参数；已有Dock连续性不回归 | 待实施/待验证 |
| A09 | 权限/跨项目/待完成/伪造元数据/真实超限/错误角色/重复ID仍拒绝；不每次编辑全解码 | 待实施/待验证 |
| A10 | §9所有入口同输入得到等价计划；Agent不能绕过权限/账务或建立独立模式规则 | 待实施/待验证 |
| A11 | §10每个注册profile实例＋direct/openai无profile路径均有真实序列化fixture；JSON/multipart/DAG全部覆盖 | 待实施/待验证 |
| A12 | 工作流未来绑定在依赖完成后只最终编译一次；冻结绑定不漂移，超报价需原有确认，前序不重放 | 待实施/待验证 |
| A13 | 请求/有效/wire参数分开，4K->2K等映射恰好一次；账务事实与实际执行规格对应 | 待实施/待验证 |
| A14 | 重复/并发/超时/重启/UNKNOWN不重复受理或扣款；新计划worker消费、租约与取消通过 | 待实施/待验证 |
| A15 | 旧冻结任务wire/价格/文本/素材快照及poll/cancel恢复不变；显式retryOf不覆写原任务 | 待实施/待验证 |
| A16 | 签名URL过期可按同资产身份物化，不能借机读最新能力或换模型/素材 | 待实施/待验证 |
| A17 | 生成完成 -> 选历史结果 -> 接下一节点 -> 再生成，资产/父子回执/账务/用户展示一致 | 待实施/待验证 |
| A18 | 编译成功、上游受理、成片保存、选片采用分别验收；证据有通道/合同/输入范围，不把一次文生泛化 | 待实施/待验证 |
| A19 | 蓝绿新旧Web/Worker与plan版本兼容，回滚不回灌DB/媒体、不重放未知付费任务 | 待实施/待验证 |

## 验证与更新规则

- 完整业务切片后集中跑受影响类型/单元/HTTP/DB/Worker/浏览器检查；不每个小helper跑全量构建。
- 保留baseline/modified/copy-rollback原始命令、输入、结果、退出码、hash与真实产物。物理/安全/计费边界失败同样覆盖，禁止把known baseline失败抹去。
- P0核心133项测试与全量TypeScript检查通过；测试使用纯编译/真实JSON Profile及Resolver/URL物化fixture ports，不冒称应用Route、真实DB/Worker或上游生成已经验收。现有入口尚未切换。付费供应商和正式发布均未执行，不增加发布计数。
- 证据目录：E:/Workspace/naumi/output/video-compiler-p0-20261114；IMPLEMENTATION_STATUS.json与本表同步更新。

## 下一实际动作

P0核心已加入版本化合同、空默认/有审计的显式政策、独立证据schema、输入Resolver端口、确定性意图、JSON协议族Profile、不可变摘要计划与只读reader、JSON临时URL物化。下一步接入现有授权/真实媒体Resolver与发布Binding/Policy存储，补齐Profile绑定种子及计划持久化；不把旧capabilities.video自动转Policy，也不新建以verified或静态型号表执法的门禁。随后按完整入口/协议切片迁移，目标保持ACTIVE直到全部验收。

## P0核心切片：本轮实现

- `execution-contract.ts`：新合同不读旧capabilities；Binding/Policy/Evidence各自schema。限制必须带明确修订/操作来源，不提供旧能力自动转Policy的入口。
- `input-resolver.ts`：先做结构/角色/重复身份检查，再调用应用层拥有的素材/文字授权端口，使用真实hash/MIME/字节/时长；不信用户URL、保留输入顺序和scope。当前真实DB适配组装仍待接入。
- `intent.ts`：旧text+媒体走自动；单图用途依合同默认，不按两图猜首尾；显式结构性偏好保留。
- `profiles/json-profile.ts`：原生构造请求模板，按绑定而非型号名单映射；数量/字节/总时长/参数组合/角色/数组顺序检查集中于Profile；用户值->有效值->wire拼写分开，映射恰好一次。
- `compile.ts`：纯编译门面，绑定版本与政策校验、输入完整消费/真实媒体槽校验、冻结Binding/Policy/规格/作用域，生成SHA256摘要；reader只读原计划，不查询最新配置。
- `profiles/json-materialization.ts`：临时授权URL在执行副本生成，同一asset去重签名；核对冻结sha/bytes/MIME/时长/尺寸，禁止换素材；不改计划、不重编译、不泄露内部异常。
- 保留legacy task reader/codec原状；JSON以外multipart/DAG的计划物化、全部协议和旧任务reader接线仍待后续阶段。
- 验证脚本：`node node_modules/tsx/dist/cli.mjs scripts/verify-video-compiler-core.ts`，输出 `VIDEO_COMPILER_CORE=PASS CASES=133 PRODUCTION_WRITES=0 PAID_CALLS=0`，exit0；`tsc --noEmit --pretty false`无输出，exit0。
- 尚未完成：真实Resolver授权组装、ModelConfig发布字段/后台政策、Canvas/Workbench/Workflow/Agent等全入口、所有实际型号种子与57协议、旧裁决退出、应用/DB/Worker/真实供应商/站点验收。当前不将任何入口标为迁移完成。

### 核心审查补充

- 缺少图片/音频数量声明时不当作0：只要真实字段映射存在，未声明上限不产生虚构数量否决。要求提示词也必须由协议显式声明，不凭默认布尔值封禁图像输入。
- 旧mode=text+媒体按自动处理；新intentPreference=text明确选择仍应报告输入冲突，不能将真实用户选择一概当旧默认。
- 补充参数组合约束、帧数组显式角色顺序、Workspace与无项目Workbench作用域、模板素材槽完整性与同一素材版本一致性。
- 既有回归：VIDEO_CLIENT_SETTINGS通过；CANVAS_VIDEO_SUBMISSION 30场景/121检查通过；VIDEO_MULTIMODAL_MATERIALIZATION 16检查、真实媒体解码通过；均无供应商调用。
- 本切片未切换任何生产调用方：新入口不会让现有前置拦截自动消失。全P0/全目标仍未完成，不把133项核心检查写成A01–A19端到端通过。

本切片作为新增核心模块检查点交付，不自动启用生产入口。后续P0真实授权/模型配置适配从包含该检查点的最新main新开工作树；本次临时工作树在检查点整合且干净后清理。

## P0发布绑定与可信输入切片（2026-11-14）

基线：`ecaf80f631f88354c7f522174b4a416c5e5bd371`；独立分支 `codex/video-compiler-integration-20261114`，工作树 `E:/Workspace/naumi-video-compiler-integration-20261114`。本节覆盖前面核心检查点的“Resolver与发布字段待接入”状态，其他待验项保持。

### 模块与职责

- `parameterMap.videoExecution` 是版本化执行映射；JSON族recipe、显式政策随既有模型发布事务写入不可变配置，冻结modelVersion/modelDigest。既有`videoProfile`只保留查询/回执传输身份，新配置要求协议匹配。
- `published-execution.ts` 将发布数据绑定为ModelBinding/Profile/Policy；不把旧`capabilities.video`、verified、generate、images=0迁移为ExecutionPolicy。只有明确、有操作来源的政策会限制执行。
- `frozen-capability.ts` 新分支冻结recipe/policy；旧分支不变。恢复时同时核对模型修订、摘要与原始冻结映射；历史无execution记录沿原reader读取。
- `prepare-inputs.ts` 复用真实节点/作品/text repository、组合素材展开、项目/工作空间归属与`verifiedOwnedMedia`完整解码/cache；读取实际选中历史结果，不因原节点新任务运行丢掉完成结果。客户端URL、文本和媒体元数据不作事实源。无HTTP上下文也进入个人工作空间规则；登记sha/字节与真实字节不一致仍拒绝。
- `parseVideoExecutionDraft` 在任何组合素材/媒体I/O前集中检查类型、重复身份和角色；不复制结构规则。`prepareVideoExecution` 是preview与后续submit共用prepare/compile应用接口。
- `compile-preview.ts`/`POST /api/video/compile-preview` 使用真实发布配置选择与executor、受控解析、统一编译；返回draftRevision、计划摘要、配置修订、intent和有效/计费参数，不返回wire模板、存储身份或凭据。原生登录、同源、工作空间与现行功能权限检查保留；预览不创建任务/创作记录/账务预占/项目绑定/业务幂等或供应商请求。
- 依赖为Route -> video应用用例 -> model-config发布读取/Canvas与媒体授权接口 -> 纯Resolver/compiler。模型配置和task/billing原事务归属不变。

### 迁移状态

- 新增公共预览入口1个；**现有生成入口迁移仍为0**。Canvas专用预览、前端防抖与陈旧响应保护仍待实现。
- 本切片没有在实际站点发布新的videoExecution配置或切换供应商路由。新版配置的正式生成接入、冻结CompiledPlan持久化与Worker消费是下一完整切片；本切片不是“前置误拦全部修好”。
- 全57 profile/2条无profile路径、Workflow未来依赖、BYOC、Agent、Storyboard、结果资产/账务链及A01–A19完整验收仍待继续。无新增生产数据写入、发布或付费调用。

### 集中验证与证据层级

- `scripts/verify-video-published-execution.ts` 使用真实隔离PostgreSQL、sharp完整PNG解码、实际配置draft/stage/apply/byVersion/freeze/executor、实际Route函数与原生签名会话；不mock业务模块，不宣称已运行Next监听器/浏览器/真实供应商。
- 覆盖旧描述冲突、禁用/政策、版本/recipe篡改、单次参数映射、实际媒体/文本、选片、待完成、重复/角色、跨用户/跨企业、匿名/跨站/撤权、伪造绑定与零受理副作用。原始集中结果和baseline/modified/copy-rollback在 `E:/Workspace/naumi/output/video-compiler-integration-20261114/VERIFICATION.txt`。
- 同时复测核心133项、既有客户端设置、画布提交121项、真实媒体物化与旧冻结来源权威回归；具体exit与literal输出以证据文件为准。没有以局部PASS更新A01–A19为全链路通过。

### 下一步

将正式提交编译结果存入版本化任务，Worker只消费冻结模板并重新物化同身份媒体；保留原来的报价、幂等预占、beginSubmission、UNKNOWN与回执事务。随后按完整入口和协议清单迁移，不在UI继续叠旧能力裁决，也不把本预览当执行授权。

## 正式受理、冻结任务与Worker切片（2026-11-14）

基线：`a4f1e4197e0a95e7570d700c14ae175f496d97ec`；分支 `codex/video-compiled-task-20261114`。本节覆盖上一切片“正式提交和Worker待接入”的状态，但不代表P1全入口、P2全部协议、P3清场或P4全验收已完成。

### 模块、公开接口与依赖

- `withVideoCreationModel` 是Standalone/Canvas共用的模型冻结边界，模型选择在原操作回执查询之后执行。`/api/video/generate`退出通用模型预选择，保留模型请求头的既有优先级，避免已受理回执因最新模型禁用被提前挡住。
- `videoSubmissionDraft` 仅将现有提交形状翻译成统一Draft：保留请求值、输入身份、显式意图与旧mode；不查询能力或决定支持范围。新增参数/意图字段与节点strict schema同步。受控上传以稳定storageKey进入同一可信Resolver，不用临时URL作冻结事实。
- `createCompiledVideo` 只在已发布`videoExecution`分支运行；直接调用prepare/compile一次，按编译结果报价，并使用现有`createVideoTaskWithReservation`事务原子受理。没有调用旧normalize、旧create codec或上游上传。节点revision、项目、回执、工作流关联、报价/预占与creation记录仍在原事务所有者中；关联失败全部回滚。
- 任务`parameters.version=3`保存加密CompiledPlan及明文摘要，Binding/Policy/Profile/素材版本/语义参数随原模型账务bundle冻结。随机加密字节不参与业务指纹，计划摘要仍参与，防止并发相同操作因随机IV冲突。
- `compiled-task.ts`负责可信任务行的版本读取/完整性与任务身份核对、旧消费者投影和显式重试输入；坏v3计划不会降级成legacy请求。v2 reader和BYOC v2继续兼容。
- `materializeCompiledVideoTask`核对原执行作用域与原通道、同一媒体版本/归属，并调用既有媒体授权/签名能力。执行副本只替换URL槽，不读最新modes、节点选片或参数重新编译。
- `VideoProviderAdapter.createCompiled`复用既有凭据、受控传输、费用观测和回执解码；JSON模板不再经过`buildVideoCreate`。poll/fetch/cancel仍走冻结的原transport profile。
- `submission-state.ts`统一已知v2/v3 pre-dispatch检查点；`beginVideoTaskSubmission`仍以行锁写sending后才POST。并发恢复只发一次；未知受理保持needs_attention及预占，不换模型/通道重发。
- Canvas新版分支不先做legacy组合展开/文字编译；统一Resolver展开一次。节点预览`POST /api/canvas/video-nodes/[id]/compile-preview`读取归属和revision，支持未保存Draft，同公共预览/提交共用编译用例；返回draftRevision，UI的防抖/陈旧响应治理仍待下一切片。
- 显式retryOf创建新操作，用原requestedParameters而非effective/wire参数作为新编译输入；原任务、媒体和账务回执不改写。UNKNOWN仍禁止作为新操作自动重试。

依赖保持Route/Canvas应用入口 -> video受理/Resolver/compiler/计划适配 -> 原任务/媒体/账务所有者；不另开扣费事务，不新增内部HTTP自调用，不引入第二供应商注册平台。

### 实际集中证据

`scripts/verify-video-compiled-task.ts`：37项，真实隔离PostgreSQL、真实本地供应商HTTP、独立原生媒体Worker进程、实际ffmpeg完整解码。实际调用生产生成Route函数、Canvas节点服务、节点预览Route函数、retry Route函数、Worker提交/轮询/落盘/账务所有者；未mock业务模块。媒体Worker为显式fixture模式，非生产Linux sandbox；Worker是实际应用Worker用例，不把它写成已验收独立App Worker进程/Next浏览器或付费上游。

- 旧capabilities只有text/images0且generate/verified=false：新版单图受理、存储和账务完成。
- 预览/正式受理计划摘要相同；请求4K -> 有效2K -> wire2k一次映射；受理后发布新path/新价格，原任务仍用原path/原7积分。
- 并发3次受理同回执；并发Worker只1次POST；prepared取消零POST并退款；发送断连转creation_unknown保持预占；后续恢复不重发。
- 媒体真实字节变更、工作空间撤权在POST前失败；错误编译不留任务/预占；节点关联事务失败不留task/bill/creation或revision增量。
- 实际成片落盘、sha匹配、父子资产和单笔账本完成；选已完成历史结果（源节点已有另一个任务）->下游节点再提交->再次成片、节点回执、父子资产和账务全部完成。
- 新任务仍服从显式禁用；已受理HTTP回执在最新型号禁用后仍返回原任务。显式retry route验证保留原请求值，不双重映射；旧v2读取保持。
- 媒体签名刷新生成不同地址但计划摘要/素材版本不变、额外POST=0。一次Windows fixture原子快照写入出现`MEDIA_STATE_WRITE_FAILED`；按既有结果处理恢复重试，不重发生成。未将该观测当作供应商不支持，也未在本切片修改媒体Worker状态存储。

同时集中复测核心133项、发布输入43项、Canvas121项、媒体16项、旧冻结来源权威回归、账务所有权35项和事务生命周期14项；完整命令/输出/exit与baseline/copy-rollback以 `E:/Workspace/naumi/output/video-compiled-task-20261114/VERIFICATION.txt` 为准。账务所有权首次缺少fixture SETTINGS_SECRET失败，提供独立本地fixture密钥后通过，原始失败记录保留。

### 仍未完成

- 全部57个wire profile的请求Profile种子与生产绑定迁移、2条无profile旧路径；本切片只证明可配置JSON编译族与APIB查询/回执transport的实例，不把它泛化成57项已迁移。
- 分镜、元素、工作流结构化输入尚需专用Profile；新版普通JSON入口会准确报告mapping缺口，不静默丢弃。不得现在批量把这些现有配置切入新分支。
- Canvas连线/参数Dock/Workbench UI、Agent与Storyboard、Workflow未来依赖/批次、BYOC和全新旧槽兼容均待继续。UI仍有旧能力预检，因此不宣称用户端所有误拦已消失。
- 真实Next监听/浏览器、独立App Worker进程/重启及有授权的上游和站点发布仍未验收。A01–A19保留分层待验状态。
- 本轮生产数据/配置迁移0、付费上游0、部署0；47暂停及103实验分支隔离不变。

下一步：让前端消费同一合同投影/编译预览，移除连线与参数Dock的独立能力裁决；迁移Workflow未来依赖与结构化Profile，再逐协议/全部入口完成退出清单。下一轮从已合并main继续，不以本JSON闭环代替全目标。

### v3成片规格观察补充

完成JSON执行切片后的消费者核对发现：`resultMetadataWarnings`仍从旧`parameters.request`/顶层读取宽高、声音开关，而v3已将这些语义值冻结在`effectiveParameters`，因此可能漏报成片实际规格差异。本轮改为v3读取冻结有效事实，v2与无版本旧记录保持原读取顺序；不把规格观察变成新的模型能力门禁，也不自动退款或重生成。

补充实际Worker成片测试：请求宽32/有声，受控上游返回真实宽64/无声视频，验证保存`width_mismatch`与`missing_audio`，且原生成、父子回执、账务和恢复仍正常。完整场景由37增至38；最新测试/主线/副本回滚证据继续写入本切片证据目录。前节37项为先前检查点，不覆盖这条新增消费者检查。

## Profile UI / 无损草稿与编译预览切片（2026-11-14）

模块与职责：
- `ui-projection.ts` 从已发布 Profile.describe 投影公共参数控件；公开语义选项，不发布 wire 字段、recipe、供应商连接或凭据。新绑定不重建旧 modes/limits。
- `submission-draft-value.ts` 是预览与正式提交共用的纯 ingress 转换；服务端包装仍注入受控存储 URL 解析。上传身份以引用 ID 稳定命名；真实授权/hash/解码仍归可信 Resolver。
- `ui-draft.ts` 集中原始选择、单字段编辑、仅新建应用默认值与模型切换；新参数落在可保存 JSON 草稿容器。显式未映射值/不完整 JSON/旧模式保留，界面显示采用与编译器相同的旧模式解释，不显示“自动”却暗用旧模式。
- `use-compile-preview.ts` 是 Canvas/Workbench 共用预览编排：防抖、账号/空间/节点修订/模型版本/草稿/重试身份，Abort 与响应 key 双重防陈旧；故障只影响本次预览，不把模型降级成持久“不支持”。
- Canvas连线、Compact Dock、完整设置及Workbench新绑定分支退出旧能力预检/参数重置。断开连线保留剩余首尾角色；两个普通图片保持普通参考；显式模式不隐式补素材或换模型。草稿保存不要求可执行。
- 视频新绑定报价使用编译有效事实，退出图片展示规格/图片降级检查；保留管理员业务价格、managed model credit 覆盖、显式停用与路由成本归属，图片/旧视频路径保持。

公共接口、依赖与状态归属：UI只编辑草稿/调用服务器预览；公共catalog投影由Profile所有者提供；编译/Resolver/任务/计费事务归属不变。前端不编译wire、不持有任务计划、不代替授权或余额检查。暂保留旧目录字段和旧UI分支，只有显式发布videoExecution的新路径采用本切片。未迁移模型不会因代码合main自动换绑定。

集中验证：
- 基线317cc7a8真实连线命令复现：删除另一张图后，显式last_frame变为reference；修改后保留last_frame。
- 实际React/无头Edge组件与预览hook：18项（受控网络端口，不是完整Next App浏览器验收）。覆盖连线/角色、真实模式/模型选择、未知参数可编辑、JSON逐字输入、无损切换、防抖/迟到响应、账号/工作空间/节点修订/模型版本、重试、只读。
- 实际隔离PG+生产catalog/preview Route函数+saveVideoNode服务：原43项加UI投影/纯转换/一次映射/编译摘要/非可执行草稿保存/价格优先级；最终数量以本切片VERIFICATION为准。预览任务/预占/供应商POST均0。
- 原任务38项真实本地HTTP/媒体Worker/ffmpeg/PG闭环、核心133、Canvas121、媒体16、旧冻结来源、账务所有权35与事务14，以及模型价格、目录缓存、完整TypeScript集中回归。
- 证据入口：`E:/Workspace/naumi/output/video-compiler-ui-20261114/VERIFICATION.txt`；包含真实命令/输出/exit、源文件hash、修改包、差异和副本回滚。最初类型检查及定向修复记录保留，不用最终PASS抹去失败记录。

未完成与下一步：
- 本切片完成新JSON绑定的Canvas/Workbench交互接入，不等于全部57个wire profile和2条无Profile路径已迁移。Workflow未来依赖/批次、Agent、Storyboard/元素、BYOC、完整历史恢复退出清单仍继续。
- 完整Next监听/独立App Worker进程/重启、全部A01-A19矩阵、有授权的真实上游和正式蓝绿仍待验。
- 本轮生产配置迁移0、付费0、部署0；47 HOLD、103独立映射实验线隔离继续。总目标保持ACTIVE。

副本验收补记：首次打包副本的浏览器用例在“三次Playwright点击必须只触发一次防抖请求”断言失败，React错误0；点击自动等待的累计时间可能越过250ms防抖窗口。用同一浏览器实际DOM事件、显式15ms间隔提交三个编辑事件，避免把慢测试驱动当作产品回归；保留首次失败回执并在最终包副本重复验证。

## Workflow / 批次延迟素材编译切片（2026-11-14）

模块与职责：
- `VideoModelProfile.prepareDraft` / `prepareVideoDraftConstraints` 为尚无真实产物的阶段提供同源约束/报价事实。准备结果没有最终计划、媒体hash/MIME/字节数；真实阶段只在依赖就绪后由原 `compileVideoRequest` 最终编译一次。JSON Profile的参数/角色映射规则共用，原始4K没有被有效2K回灌。
- `prepareDeferredVideoInputs` 复用可信输入所有者，只排除由工作流声明的未来槽；已有素材仍做归属/hash/真实解码，文字冻结。原单任务/预览完整Resolver入口保持。
- `workflow-compiled.ts` 管理版本1、带摘要的阶段快照：原始草稿、展开后草稿、已有可信素材、未来输入槽、原绑定/政策与报价事实。它不是最终 `CompiledVideoPlan`；没有用/media/pending伪装已完成资产。
- 新阶段加 `compiledVersion=1`。恢复缺失或损坏的新记录明确失败，不落回legacy；旧Stage/BYOC维持兼容reader。现有encrypted frozen_nodes存储足够，无业务SQL迁移。
- `workflow-schema.ts` 接受并保存intentPreference/parameters，修复新版节点经过Workflow入口被strict schema拒绝的缺口。Workflow与Canvas批次新绑定不再执行旧normalize能力裁决；旧路径保留至协议迁移。
- 最终阶段恢复原模型/价格快照；只将已完成的指定前序产物放入声明槽。已有素材版本、顺序、用途、作用域和原始参数均受冻结约束；真实媒体大小/时长在最终编译检查。
- 保留现有调度、依赖、幂等、取消与UNKNOWN语义；未重建队列/计费平台。新版阶段在预占前核对原授权积分上界，超出走既有needs_confirmation/确认Route；只接受该Route持久化的确认，不恢复全局报价二次门禁。

公共接口、依赖与状态归属：
Workflow/Canvas批次应用编排 -> video准备/可信Resolver/Profile编译 -> 原生成任务/计费/结果资产事务。绑定/政策仍归模型配置，已有媒体归资产所有者，未来槽归已接受的制作链。阶段快照在既有加密JSON中存储，最终wire计划依然只归v3任务。媒体签名与上游I/O仍在执行适配器。

集中证据与未完成项：
- 真实隔离PG、本地供应商HTTP、独立媒体Worker进程和ffmpeg：Canvas两阶段先后生成、成片/下游/节点/账务闭环；冻结后更改目录路径/显式禁用/价格不改变原执行；linked text新内容不泄漏到原制作链；2/4批次、取消、并发恢复、UNKNOWN保持、快照损坏、真实时长超限与已有素材变化。最终数量/命令以 `E:/Workspace/naumi/output/video-compiler-workflow-20261114/VERIFICATION.txt` 为准。
- 纯Profile测试证明准备阶段不调用final compile，真正执行只调用一次；明确政策和真实协议约束保持。
- Windows媒体fixture再次观察到 `MEDIA_STATE_WRITE_FAILED`，原结果重试成功且provider create计数不增加；未把它写成Linux生产沙箱通过。最初类型错误和定向修复日志保留。
- 本切片仅迁移已发布新版绑定的普通视频Workflow/Canvas批次；所有57个wire profile、2条无profile旧路径、结构化Storyboard/元素/BYOC、Agent其余入口、完整Next/独立App Worker进程重启及A01-A19全矩阵仍继续。
- 总目标ACTIVE；生产配置迁移0、付费上游0、部署0。47 HOLD和103独立实验线隔离保持；共享checkout不改。

本切片最终候选：制作链22项，连同原单任务38项共60项真实PG/HTTP/媒体Worker闭环；核心137项、发布/预览61项、实际React/Edge18项、Canvas121项、媒体16项、旧冻结来源、账务所有权35项与事务14项集中通过。新增验证包括：超授权零任务/零预占/零POST、过期确认无效、显式持久化确认恢复一次、前序失败阻断下游、原生角色参考只展开一次并冻结。完整TypeScript exit0。生产环境不由这些fixture推定通过。

## Agent / Storyboard 无损编译消费者切片（2026-11-14）

模块与职责：
- `agent-execution.ts` 将Agent预览和报价接到既有 `prepareVideoExecution`；同一回调保留模型/账务快照。不新增工具能力矩阵、内部HTTP或供应商请求。新绑定的generate/edit/extend都按真实输入编译，旧modes/limits不再否决。编辑/续写仍要求来源视频与编译意图一致，不能静默变成文生。
- `canvas-video-tools.ts` 先恢复原操作/活动任务，再做新执行预检；Canvas revision和项目/所有权继续检查。Standalone新绑定直接传有序输入给可信Resolver，不制造第二份过度简化的引用身份。旧模型/BYOC分支待后续协议迁移。
- Agent报价读取编译有效事实；原始参数保持。`creation-settings.ts` 比较/更新参数容器中的用户选择，避免界面已选4K却因顶层缺字段误拦，避免显式修改时新旧字段冲突。图片设置路径保持。
- `storyboard-edit.ts` 归属纯草稿职责：拆镜保留完整配置；合镜只合并描述和可确定的时长，不改分辨率/画幅/false/高级参数。其他设置冲突明确报告，不丢弃第二镜配置。去除author关联时同步重排引用标记，防止指向错误素材。
- Storyboard拆合组件退出 `reconcileVideoSettings` / `videoDurations`，复用Profile时长控件和同一服务器编译预览。诊断、空描述、未知/超范围执行参数和目录故障不阻止可保存草稿。既有保存回执、节点/操作编号和显式恢复保留，无写请求自动重试。镜头列表按原始参数容器展示时长。

接口、依赖与状态归属：
Agent工具/Agent报价 -> video公共准备用例/模型快照 -> 原Resolver/Compiler；没有React/Route反向导入领域。Storyboard组件只编辑草稿/调用公共预览和原节点保存，节点归属、CAS、操作回执及生成事务仍由现有owner负责。预览Hook仅新增可选identity分区（用于无单独email属性的现有scope组件），不将identity当服务端授权。

验证与证据层级：
- 真实隔离PG、实际Agent工具和参数校验器、生产Route函数、真实本地供应商HTTP、独立媒体Worker/ffmpeg：新绑定在text-only/媒体0/未verified的旧资料下完成生成、编辑和续写；报价有效2K、请求4K；缺来源/冲突意图/未知映射零任务/零POST；节点CAS/归属、原回执先于最新禁用恢复、真实草稿保存。不是实际LLM推理或完整Next浏览器验收。
- 实际React/无头Edge拆合组件+预览Hook（仅私有网络端口受控）：参数不丢、false保持、时长13不被协议10上限静默改写、目录故障可保存、诊断不挡草稿、设置冲突可见、丢响应后原编号显式恢复。
- 集中回归涵盖上一切片22项Workflow、原任务38项、核心137、预览61、原UI18、Canvas121、媒体16、账务归属35/事务14、旧冻结来源和Agent创作设置/分镜工具。完整命令/输出/exit及基线/副本回滚见 `E:/Workspace/naumi/output/video-compiler-agent-storyboard-20261114/VERIFICATION.txt`。初始类型错误日志保留，最终结果另记。

未完成：结构化multi-shot/元素/BYOC的真正Profile、全部57个wire profile与2条无profile路径、旧裁决调用清零、完整App/独立应用Worker重启与A01-A19、有授权的外部上游和站点发布仍继续。本切片不冒充全目标结束。生产配置0、付费0、部署0；47 HOLD、103隔离与共享checkout保持。

补充核对：新绑定携带历史工作流来源时，预览也明确报告结构化Profile映射缺口，不忽略workflowTaskId后给出假成功。Agent创作设置脚本本身按无DB/受控网络设计；首次混用PG环境在基线和修改版均触发登录401，移除DATABASE_URL后两边24项通过；保留原始失败，不更改鉴权来让fixture变绿。

本切片最终候选：Agent/无损分镜14项、原Workflow22项、原任务38项，合计74项真实闭环；分镜React/Edge6项、原UI18项、核心137、预览61、Canvas121、媒体16、分镜工具20/结构26、账务归属35/事务14，以及独立无DB创作设置24项通过。基线实际函数另复现：请求4K/应映射2K却按1K报价，edit/extend被旧mode门禁拒绝；只覆盖测试driver，不修改基线产品文件，验证后恢复干净。

## 结构化 JSON 镜头 / 元素完整切片（2026-11-14）

模块与职责：
- 草稿增加可选 `structure`：有序镜头（稳定id、描述、时长、可选文字输入身份）和元素（稳定id、名称、描述、有序素材输入id）。嵌套素材使用原引用id进入同一Resolver，不接受声明的URL/MIME/字节数；重复id、角色/类型冲突、缺失/重复成员在I/O前诊断。
- `profiles/structured-json.ts` 独立负责镜头和元素的真实JSON字段、开关、顺序、数量、单镜头最小值/步长、描述长度和时长总和；`json-profile.ts` 仍负责普通参数/媒体及单次映射。字段由已发布recipe提供，无型号白名单。支持APIMart顶层结构及KIE的input包装、数字/字符串时长；两个既有codec的实际wire正控相等，不代表所有KIE/Omni分支已迁移。
- `send=semantic` 明确区分“有效事实参与计费/UI，但不发送上游字段”与既有 `send=omit`。例如Kling的有效分辨率存在，但wire只发mode，不能为了凑计费事实多发resolution。现有value/omit语义保持。
- `compileVideoRequest` 要求镜头/元素id及顺序完整消费；仅消费flat media不能冒充结构已映射。结构计划使用schemaVersion=2；普通计划仍写1，reader保留旧1且拒绝结构/版本不一致。digest覆盖全部分组、原始参数、真实文字与媒体。
- 镜头关联文字由既有owner解析，编译只用实际内容，不把镜头文字附加到全局prompt。元素所有素材都经过授权/解码/hash，执行物化递归替换嵌套槽；权限和字节绑定并未删除。
- `compiled-structure.ts` 只负责从flat可信manifest投影回镜头/元素给回执、历史与重试；不是第二个compiler。v3提交仍沿原原子任务/预占/creation/节点/工作流事务，元素素材加入原资产血缘和creation输入。Worker执行冻结wire，不走legacy create。
- Workflow冻结/比较包含structure，关联文字保持原内容。延迟输入的静态manifest只保存已有输入事实，完整结构在完整草稿中核对；最终真实依赖就绪后才编译。未声称已实现“未来产物动态加入元素组”的专门绑定UI/协议。
- Profile.describe投影结构编辑信息，不公开wire字段、路径或密钥。现代Canvas/Workbench设置共用现有ShotEditor/ElementEditor，旧能力false/缺数量不再隐藏已配置结构；已有不兼容分组保留。只读保持，legacy编辑行为保持；诊断和真实约束仍来自服务器编译。
- 发现并修复v3历史快照仍读取effective顶层值的缺口：`publicVideoTaskSnapshot` 从已校验冻结计划取原始parameters和镜头/元素分组，不把2K/2k当作原4K输入。损坏v3不落回旧reader。旧v1/v2任务读取分支不变。

公共接口、依赖方向、数据/状态/事务归属：
入口/现有UI -> videoSubmissionDraft -> 同一Input Resolver -> Profile编译 -> 原任务/计费事务 -> 原供应商/媒体物化。镜头文字归text owner，元素归资产owner，结构化草稿/计划归video，模型recipe和显式政策归model-config。纯Profile不导入React、Route、DB或网络；未新增内部HTTP/DI/事件总线。

验证命令、结果与证据层级：
- 基线86f1682a实际输入复现 `STRUCTURED_INGRESS=REJECTED CODE=STRUCTURED_INPUT_MAPPING_REQUIRED`；修改版同输入保留1镜头/1元素/1真实解析入口。基线完整旧链路74项、核心137项通过。
- `verify-video-structured-core.ts`：32项，含完整结构消费、身份/顺序、关联文字、参数边界、嵌套签名/版本变化、显式政策、APIMart/KIE实际codec wire等价。
- `verify-video-compiled-task.ts --structured --agent --workflow`：88项真实隔离PG/应用Route函数/本地供应商HTTP/独立媒体Worker/ffmpeg；新增结构14项，原Agent14、Workflow22和任务38项。结构预览和受理摘要一致、幂等原回执、关联文本/素材越权零副作用、发布与文字变化不改原任务、结果/血缘/账务、历史快照、显式重试、Canvas与Workflow均验证。
- `verify-video-structured-ui.cjs`：7项真实React/无头Edge，验证真实全设置组件；仅网络受控。原编译UI18、无损Storyboard UI6、Canvas121、媒体16、旧冻结来源8案例/16入口、事务14和完整tsc集中验证。
- 完整原始命令、输入、literal结果、exit、哈希和复制回滚见 `E:/Workspace/naumi/output/video-compiler-structured-20261114/VERIFICATION.txt`。初次浏览器driver缺AuthProvider/选择器多匹配、旧冻结检查缺隔离DB环境的失败保留，分别补齐driver/provider/环境；未修改产品鉴权。Windows媒体状态写入重试原日志保留；原结果重试未增加供应商POST，不代表Linux沙箱验收。

未完成与下一步：
- 本切片为可配置JSON结构Profile及其真实消费者，不是57个wire profile和2条无profile路径的整体迁移。各分支条件映射、原供应商文档/实际回执、published bindings审查仍逐项实施，不能只凭通用recipe可表达就算已迁移。
- BYOC ComfyUI/RunningHub/AutoDL仍需真正DAG/槽位/上传Profile及历史reader。此次只审查现状，不把JSON请求包装成工作流Profile；未取消workflows执行入口的准确端点依赖。
- 旧能力裁决/升级/fallback的新任务调用退出，完整Next/App/独立应用Worker进程重启、RFC A01-A19以及外部供应商/站点验收仍继续；目标ACTIVE。
- 本次生产配置写入0、付费上游0、部署0；47 HOLD、103模型映射独立实验分支和共享checkout保持。普通main整合与实际上线分开记录。

补充的延迟输入验收实际发现并修复了一个顺序缺口：没有orderedInputs的结构化Workflow在freeze时把future槽追加到镜头文字/元素后，而最终submission先放普通references再展平结构，导致同一输入被错误判成顺序变化。现在freeze把普通future槽插入结构成员之前，保留各自内部顺序；完整草稿/静态元素仍冻结。新增“已有完成源视频 → 真实future video + 冻结镜头/元素”的实际PG/Worker路径，原始失败与修正结果分别保留。不是放宽身份核对或按集合忽略顺序。

## BYOC / DAG 可执行 Profile 与上传切片（2026-11-14）

模块与职责：
- `workflow-profile.ts` 实现与普通JSON不同的 `workflow-video` Profile：描述保存的DAG和输入槽、纯参数编译、冻结媒体槽、ComfyUI/RunningHub/AutoDL各自wire布局。不读取modes/limits/verified，不使用型号名单；`workflow` 是执行意图，不写入旧config.mode。工作流计划使用schemaVersion=3，普通1和结构2继续读取。
- `parameters.ts` 提取已存在的请求值→有效值→wire值规则供JSON和DAG共用；false/0/omit/semantic与映射边界保持。没有套用JSON create的假媒体或fake mode。
- `workflow-materialization.ts` 只展开原计划媒体/operation/credential槽；应用端复核原访问权与媒体版本，执行端按已冻结recipe上传或签名。`compiled-workflow-upload.ts` 使用真实受控原字节与SHA256内容寻址文件名，避免同一引用id的不同文件覆盖仍在队列的旧素材。临时地址、上传名称和密钥不进入冻结模板。
- PublishedVideoExecution成为真实discriminated union；model-config校验workflow runtime与原查询/结果协议一致。UI从同一describe投影workflow槽位和参数，不虚构普通视频模式或泄露模板/路径/密钥。托管三类工作流仍沿原模型快照、报价、任务/预占/creation事务和结果结算。
- BYOC新提交接到同一Resolver/Compiler和v3任务；显式0积分例外仍归BYOC，不伪造托管模型/报价。byoc snapshot加密冻结执行绑定，任务reader比较原作用域/身份/绑定/政策/digest；恢复不依赖当前端点激活状态或当前工作流版本。取消、sending/UNKNOWN、幂等和显式重试保留。新BYOC取消后不上传/生成；重试沿原配方和原素材版本，不重抽种子或重读修改后的模板。
- `byoc-legacy-submission.ts` 是已经受理但尚无compiledVersion的历史Workflow阶段专用兼容，只有恢复该旧stage的受控上下文可达。新任务不选择它；旧v2任务、旧重试和冻结模板保持原语义。不能把从旧stage恢复的新子任务冒充新版重新解释。
- Workflow新BYOC阶段冻结原绑定、文本、静态真实输入和未来槽，不再用/media/pending或先调用旧create codec。真实上游产物到位后才最终编译。Canvas、工作台、Agent的BYOC生成入口走同一编译应用；Agent不再同时发送伪造URL的简化引用和原生输入。
- BYOC预览复用同一编译器，读取本人保存的文档/输入但不访问object_info、不上传、不导入凭据、不创建任务/预占。显式种子/无随机种子的模板预览与正式计划摘要一致；库工作流未显式设置的随机种子保持旧行为，仅正式受理时抽样冻结，预览digest只代表被检查的模板，不是对未来随机值的授权。UI-format若离线缺少widget定义返回映射诊断，不伪称模型不支持。
- 未配置端点仍可保存、展示、选择工作流；只在运行/执行预览准确报告BYOC_ENDPOINT_REQUIRED。目录不再排除UI-format文档，尚未离线编译的文档仍列出真实节点并可编辑。切换执行入口保留已有草稿参数，不清空配置。

公共接口、依赖与事务归属：
入口/现有UI→video公共preview/submit→可信媒体/文本Resolver→纯Workflow Profile→原任务/creation/计费事务→执行物化/原供应商适配器→原资产图。BYOC endpoint、文档归其现有owner；媒体授权归媒体/creation；凭据只由受保护凭据库恢复。纯Profile不导入React、Route、DB、网络。冻结快照利用已有加密JSON，不新增表、不拆原事务。

验证与证据层级：
- 纯Workflow Profile覆盖三类实际既有codec请求等价、DAG循环/悬空边/槽位覆盖、保留字段、媒体完整消费、上传名称/字节绑定、参数单次映射、显式false/0/omit以及只读公共投影。
- 真实隔离PG、Route/Agent/Canvas/Workflow应用函数、本地multipart上传HTTP、供应商create/poll、独立媒体Worker/ffmpeg验证：BYOC0积分、托管三协议单次账务、无端点保存/运行诊断、预览零网络/零凭据写入、原回执先于最新端点判断、修改模板不改变原任务、取消/UNKNOWN不重提、旧stage/v2兼容、新stage最终编译、原生Agent输入、未来真实成片绑定。
- 实际React/无头Edge：通用预览Hook的BYOC分区、工作流切换旧响应隔离、无端点可选/可编辑、原参数不重置；之前普通/结构/分镜UI回归继续集中验证。不是完整Next服务或独立应用Worker进程重启验收。
- 初始driver错误（缺真实项目、managed fixture错误/v1基址、NodeInfo形状类型和浏览器option hidden/auth bootstrap）保留；原生Agent重复引用入口问题已在产品代码修复。fixture失败不能掩盖为通过。Windows媒体状态写入重试日志保留，provider create不重复。
- 完整基线、修改、打包副本、复制回滚、命令/输入/literal输出/exit/原始哈希以 `E:/Workspace/naumi/output/video-compiler-byoc-20261114/VERIFICATION.txt` 为准。

未完成与下一步：
全部57个wire profile与2条无profile路径的原子绑定迁移/条件规则仍需逐项核实；通用Workflow能力及三协议本地调用不是生产目录已迁移证据。旧新任务能力门禁/整对象升级/fallback的调用退出、全部A01-A19、完整Next/App/独立应用Worker/restart/浏览器、真实上游和发布验收仍在总目标中。UI-format新custom-node需endpoint定义、跨租户/并发边界和随机种子预览语义保持后续全应用验收项。main整合不代表上线；本轮生产配置0、付费0、部署0，47HOLD及103隔离线保持。

本切片集中结果：Workflow Profile纯域30项；BYOC/三类托管工作流新增26项，连同原任务/Agent/结构/Workflow共114项实际PG/HTTP/媒体Worker链路；实际React/Edge预览20项、结构/无端点编辑8项、Storyboard6项；原核心137、结构核心32、发布预览61、Canvas121、媒体16、旧冻结来源8案例/16入口与账务事务14项通过。完整tsc及修改包副本的再次验证见最终证据。新增工作流运行时与旧1/2计划区分为计划schemaVersion3，不与task.parameters.version3混为同一字段。未把预览在未显式种子时的模板digest写成未来随机种子已确定。

## 原生字节协议后续切片

OpenAI Videos、Gemini及无Profile OpenAI接入native-video Profile/计划schemaVersion4；multipart和inlineData在执行时按原素材身份物化，参数映射与现有事务保持。尺寸显式发布，未配置不猜测/降档。模块接口、迁移边界、测试与未完成项详见 [原生切片](2026-11-14-video-compiler-native.md)。全协议与完整App/应用Worker/发布验收继续，不能用这一切片关闭总目标。

## 参考协议族与direct增量

7种参考布局和Ark/MiniMax/Gemini无Profile direct执行组合接到冻结编译链；Agnes精确帧数/时长、MiniMax帧模式实际画幅、内联图片与URL物化及真实默认query差异均保留。详细接口、证据与全范围未完成项见 [参考协议族迁移](2026-11-14-video-compiler-families.md)。本地协议证明不代表生产绑定已切换，目标继续ACTIVE。
