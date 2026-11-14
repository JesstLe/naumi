# 统一视频编译架构实施台账（持续目标）

## 目标与完成定义

状态：ACTIVE；业务重构尚未完成。用户2026-11-14明确要求“制定目标全部搞定”，已建立持续目标，不能用文档、类型定义、局部测试或main合并冒充整体交付。

唯一规范：[统一视频编译RFC](../architecture/2026-11-14-video-compiler-rfc.md)。实施基线main `1fbe7610b5d3e589e892394187f95f6cbfde6d3e`，独立工作树 `E:/Workspace/naumi-video-compiler-p0-20261114`，分支 `codex/video-compiler-p0-20261114`。

完成必须包含P0核心、P1全入口、P2全协议/历史兼容、P3旧裁决退出、P4 A01–A19与应用/DB/Worker/资产账务/回滚验收；完成切片普通合main，发布及实际上游证据分层登记。47明确暂停不由本目标自动解除，103隔离实验线不得混入主线，不暗中发起收费测试。

## 模块职责、接口与数据归属

- video拥有Draft/Intent/Profile/Compile/CompiledPlan；model-config拥有发布Binding/Policy与来源审计；媒体模块拥有资产访问、内容哈希与真实probe；任务/计费继续拥有幂等、预占、租约、结算、UNKNOWN；Canvas拥有节点与选片关系。
- 入口->应用用例->Resolver/Profile纯规则->既有I/O适配单向依赖。不拆计费事务，不新增内部HTTP自调用，不为每个函数机械增加层级。
- 目标公开接口VideoModelProfile、compileVideoRequest、CompiledVideoPlan已在P0核心实现；现有生成入口/路由尚未接入，不预支全链路状态。

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
| P0核心 | 进行中：核心、发布Binding冻结、真实Resolver、公共预览已实现；正式提交/持久计划待接入 | 新合同/Resolver/Profile/Plan及Policy/Evidence分离有实际代码与集中测试 |
| P1全入口 | 公共compile-preview已接入；生成入口与UI均待迁移 | Canvas、Workbench、Workflow/批次、Agent、Storyboard、BYOC、恢复/重试同底座 |
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
