# 视频编译架构验收账本

本账本对照 [RFC §14](../architecture/2026-11-14-video-compiler-rfc.md) 的原始 A01–A19；不改变完成范围。代码在 main、函数测试、本地真实 Web/Worker、真实供应商、生产发布是不同证据层级。历史日志只证明其固定版本，不自动升级为当前源码或线上通过。

## 当前完整应用切片

`scripts/verify-video-compiler-process.ts --projected-worker-env` 启动本工作树的真实 Next dev、独立应用 Worker 生产 bundle、独立媒体 Worker，使用随机隔离 PG schema 和本地供应商 HTTP。不是 Route 函数直调，不模拟应用 Worker，也不是生产构建/公网蓝绿。

14 个检查覆盖：真实中间件/用户 Cookie/API，预览五类表零副作用、旧错误元数据不否决、预览和任务 planDigest 一致、同操作并发重试、跨用户读取拒绝、受理后型号/凭据/售价变更不漂移、生产白名单投影、真实签名媒体读取与篡改拒绝、Worker drain/两次重启、原回执查询落片、父子资产、取消前零发送、显式 retryOf 单次新执行、LIVE lease 不抢占、原 sending/UNKNOWN 不重放，以及三个已完成任务三笔账本（7+17+17=41）。

证据目录 `E:/Workspace/naumi/output/video-compiler-process-20261114`，最终包日志及退出状态以 `VERIFICATION.txt` 为准。`--browser` 增量是实际 `/video` 页面，不替换组件/HTTP；4项真实Edge/React检查已独立通过，pageerror0、额外生成0，不由上述 API 检查代替。

## 真实画布增量（2026-11-14）

本轮切片见 [画布历史与下游记录](2026-11-14-video-compiler-canvas.md)。`--canvas-browser` 在同一真实Next/PG/独立Worker底座上新增原生ReactFlow拖线和历史选片，HTTP/组件替换0；独立解包副本已完成14项进程＋4项工作台＋10项Canvas，exit0，pageerror0；最终证据 `E:/Workspace/naumi/output/video-compiler-canvas-20261114/copy-runtime/run-8c912f38-f7ab-4d09-b309-b1f7f1deb67b`。

已复现并修复两个产品问题：新解析器隐式采用未完成任务的旧结果；工作台历史发送到画布后，项目任务列表漏掉已完成原任务而使Dock永久等待核查。前者保留显式历史选片正控，后者用Canvas发送关联补齐查询而不改变原冻结projectKey/参数/报价。

## Workflow/Storyboard/BYOC独立进程增量

[本轮模块记录](2026-11-14-video-compiler-workflow-process.md)新增真实HTTP→独立Worker：8个托管工作流run/13项检查，以及ComfyUI实际上传、冻结DAG、poll/view成片、零积分/重试/Canvas工作流8项检查。源码进程运行 `run-fc6b955a-cab4-468d-87ad-05f10b5cdaf7` exit0；独立解包副本 `copy-runtime/run-bd5ebced-e3f4-4cce-8d26-9bdd8a5bc808` 同时串联4项工作台/10项Canvas，总49项，exit0；完整命令、逐字输出及回滚见 `video-compiler-workflow-process-20261114/VERIFICATION.txt`。

新发现并修复应用Worker白名单漏传显式私网端点策略，基线Web受理而Worker任务queued、上传和prompt0、tick UNKNOWN；仅恢复已配置变量传播，不默认允许私网，不传给native媒体子进程。

## Agent / RunningHub / AutoDL 真实进程增量

[本轮模块记录](2026-11-14-video-compiler-agent-process.md)补齐真实 `/api/agent`→运行时/Harness/报价→签名内部HTTP→独立Worker，以及RunningHub/AutoDL的真实上传或签名素材、冻结工作流、回执后重启、取消/显式重试和UNKNOWN不重发。Agent 6项、两远程协议10项，既有产品校验和协议未改动。

源工作树首次组合中Agent6项已通过；远程协议定向运行 `remote-targeted-runtime/run-3d74b54e-bb93-4ace-be9e-36e5a0c6fe2d` 完成14项底座＋10项增量，exit0。独立解包最终组合 `copy-runtime/run-14eb3aee-d67b-4625-96c1-c479aa90c66a` 已完整通过65项，exit0，账本20笔330 fixture积分、12子进程退出、随机schema移除；全命令和六路径回滚记录在 `E:/Workspace/naumi/output/video-compiler-agent-process-20261114/VERIFICATION.txt`；旧驱动缺draftRevision/错误Authorization断言的失败日志保留，不算产品缺陷或通过证据。

## 冻结预算 HTTP 确认修复

[模块记录](2026-11-14-video-compiler-budget-process.md)：真实HTTP受理后设置显式历史欠授权检查点（授权1、实际17；不伪造状态/任务/确认），独立Worker准确停下，但基线GET仍暴露旧金额，按旧金额确认200后持续needs_confirmation。修复通过独立 `confirmation_quote` 持久化所需报价，原加密冻结预算与公开原预算不变；版本陈旧/金额不足/非整数确认409且不改状态。旧无提案记录仍能经既有路径恢复。

源工作树预算7项＋底座14＋Workflow13通过，独立副本扩展预算10项已通过，其中成本加成cap匹配为纯规则检查，其余为实际HTTP/Worker；独立解包最终75项组合exit0，测试账本21笔347积分、预算新增1笔17，13子进程退出；十路径回滚重现旧行为、原App138通过。完整命令与回滚回执见 `E:/Workspace/naumi/output/video-compiler-budget-process-20261114/VERIFICATION.txt`。真实付费成本加成供应商或新准入自然涨价不由此fixture证明。

## 三媒体输入等价及Worker持久状态修复（2026-11-15）

[本轮模块记录](2026-11-14-video-compiler-input-equivalence.md)：真实Canvas上传、ReactFlow拖线、@提及，同一PNG/MP4/WAV分别经三条入口生成，原素材身份、默认角色、请求/有效参数、计费与语义wire等价；混合image/audio/video顺序及提示词引用随重排/重载保持；跨用户预览拒绝、删除提及不静默改指向。输入21项、10任务170 fixture积分。

完整六路径解包副本 `video-compiler-input-equivalence-20261114/copy-runtime/run-4d5e0317-ea2a-4d9e-807e-561d6811bda2`：96项通过、exit0，31笔517 fixture积分、三浏览器上下文关闭、13子进程退出，供应商真实取回的12份输入字节SHA相符。三条路径的本地行ID不同，未声称planDigest/短期URL逐字相等，也未覆盖全部结构化素材。首次组合暴露Windows状态原子rename EPERM→WORKER_CONTROL_FAULT；仅增加同源同目标有界710ms重试，不重发任务，Worker49项和真实500控制通过；持续失败仍暂停并拒绝resume，六路径回滚恢复基线故障。完整命令/输出/哈希见该证据目录VERIFICATION.txt。

## A01–A19 逐项状态

| ID | 当前证据 | 仍需完成或证据边界 |
|---|---|---|
| A01 | 核心/发布执行/1,741 App 的 poison modes/limits/verified 正控与显式政策反控；本轮真实 HTTP+Worker 普通图片成功 | 每个生产通道显式发布绑定和真实上游不由本地正控代替 |
| A02 | 绑定迁移79项、实际管理19项，原能力/价格/映射/旧版本不变，send=omit 与独立政策保持 | 线上资料同步和人工维护数据继续由目标站实际版本验收 |
| A03 | 任意新 wire 型号的显式 JSON recipe、本轮 future-process-video 实际发送；缺 Binding/字段准确诊断 | 未知协议不得猜映射；实际环境专用路线仍需列出/迁移 |
| A04 | describe/compile 共用 Profile；实际 Next 预览摘要与受理 planDigest 相等，冻结后配置变更不漂移 | 全部入口和所有 Profile 的等价证据仍分层记录，不从一个输入泛化 |
| A05 | 实际 Next 预览前后 tasks/creations/billing operations/reservations/ledger 数量相等、供应商0；现有 React 测试覆盖陈旧响应/账号和修订 | 陈旧响应的受控 React 测试不冒充所有真实 Web 交互 |
| A06 | 可信输入/顺序/角色核心测试及 Canvas/上传/Agent App 输入路径 | 本轮真实三媒体上传/连线/@提及21项及混合顺序通过；本地行ID不作语义等价依据；字符/场景/多轨等结构化组合仍逐项验收 |
| A07 | 原 text+image 自动意图、两普通图保留reference、明确偏好报缺素材；实际 Next 的 text+普通图进入 single_image | 真实浏览器端口拖线已通过；全部历史输入形态仍逐项保留，不以单条reference概括首尾帧等组合 |
| A08 | 原 UI/图谱18项、实际 React/Edge10项、Dock连续性受控检查；本轮真实Next工作台历史参数展示/复用/390px/当前报价4项通过 | 本轮真实Canvas已覆盖切模型/保存/重载/生成前后Dock/锁定解锁/两节点多选与右键/390px；三媒体上传/提及/拖线等价和混合重排本轮通过；更多结构化节点组合继续 |
| A09 | PG/HTTP 跨用户拒绝、媒体身份/hash/真实解码、结构/角色/数量约束；本轮实际签名输入字节及篡改404；新增5种当前未完成状态不可隐式使用旧结果、显式历史可用；实际HTTP queued反控 | 新增三媒体跨用户实际预览422且零任务/账务/供应商增量、移除提及后生成禁用；完整物理边界仍逐维验收，不能把已授权URL当真实解码 |
| A10 | Canvas/Workbench/Workflow批次/Agent/Storyboard/BYOC/重试共享编译底座；真实Agent入口新增图生/编辑/续写/原编号恢复/预检错误/会话持久化6项 | 真实Next/独立Worker已有Canvas DAG、原生Workflow、批次、正式Storyboard采用/生成、ComfyUI BYOC/重试，新增RunningHub/AutoDL；完整Storyboard操作和全入口页面矩阵继续，不从Agent工作台入口泛化全部Canvas Agent操作 |
| A11 | 注册57个 wire Profile 的分族序列化、上传/JSON/multipart/DAG；ComfyUI、RunningHub、AutoDL新增真实Next/独立Worker上传或签名素材、冻结与结果回执 | 注册覆盖≠所有在用配置已迁移；全部生产启用配置和env-only仍需明确审计/迁移，不能从本地显式recipe推断线上已配置 |
| A12 | 真实PG Workflow22项：future slots、真实前序时长、静态hash、冻结报价确认、批次/不重放 | 已新增真实Next+独立Worker的8run/13项：冻结型号/路径/文本/原价、前序真实产物/时长、重启/回执、批次、Storyboard采用旧片、取消/UNKNOWN/拒绝；新增真实HTTP待确认报价、拒绝陈旧确认、并发确认/Worker恢复、旧无提案记录恢复、取消待确认阶段；欠授权历史检查点显式seed，未冒称新准入自然涨价或真实成本加成供应商验收 |
| A13 | 本轮实际 requested4K→effective2K→wire2k 恰好一次，历史恢复4K；冻结原价7、后续新任务17，账本三笔41 | 更多映射组合由各Profile固定输入测试；不把wire值回填用户选择 |
| A14 | 本轮独立应用Worker、持久tick原身份、原任务重启/UNKNOWN/LIVE lease/取消/显式重试，生产环境投影实际运行；Worker组合49项及Windows真实500次控制/501状态写入；本地原子替换EPERM有界重试且耗尽保持故障 | 新增Workflow/BYOC的独立Worker重启与UNKNOWN不重放；当前进程为Windows、停机前drain，Linux活动发送中断/真正多槽回滚仍需新固定版本验收 |
| A15 | 服务端专项实际持久化加密v2 stage及新发布后恢复；原文本/模型/价格/回执不变，伪造阶段拒绝；本轮v3显式retryOf | 历史v2与新v3混合独立Worker/新旧Web发布组合仍待实际验收 |
| A16 | 原媒体token/版本/过期测试；本轮Worker物化真实签名URL，供应商fixture经真实Next媒体路由读取原字节，篡改404 | 时间推进的过期测试与实际公网CDN/存储恢复分别验收，不把本地域名别名当公网可达 |
| A17 | 本轮真实Next受理→独立Worker落片→结果作为下一Canvas节点source_video→再次落片，父子资产/单账本通过 | 已新增真实浏览器选旧历史→ReactFlow拖线→下一节点提交→独立Worker落片，冻结资产/parent/单账本一致；当前为本地供应商fixture，非真实付费上游 |
| A18 | 编译、供应商fixture受理、成片真实解码保存、账务分别核对，结果含真实输入字节hash | 真实付费供应商质量/成功率和用户采用仍未验，不能标Production-confirmed |
| A19 | 已有源码副本回退/扩展字段兼容、真实发布控制回执与版本准备门禁；本轮独立Worker重启 | 固定生产构建、新旧Web/Worker双槽、排空/切回/旧资产、目标站蓝绿和实际发布仍未验 |

## 发布与总目标

总目标继续 ACTIVE。47 HOLD 保持；生产配置迁移0、付费0、部署0。下一步按上述缺口推进，不以 main 合并、14个检查、任意一份绿色报告取代完整 RFC 退出。后续通过项追加实际固定版本、命令、输入范围与回执；失败不擦除、不降格为无关项。
