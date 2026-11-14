# RFC：统一输入驱动的视频编译架构

- 日期：2026-11-14。
- 状态：架构决策与实施边界已记录；业务实现、迁移与发布均未开始。本文不是上线验收记录。
- 审阅基线：origin/main `4b49996077066c2b8e85058bc03df6faa7e3757c`。
- 范围：Canvas、Workbench、Workflow/批次、Agent、Storyboard、全部视频协议、管理后台与历史任务。
- 优先关系：本文整合并取代[视频意图解析 v2／并行 v3 提案](../superpowers/plans/2026-11-14-video-intent-execution.md)作为后续实施依据。旧文完整保留供历史追溯，执行冲突以本文§15为准；静态型号表最高裁决、旧描述默认为政策以及仅画布范围不再执行。
- 非目标：不建设新的调度/计费平台，不改图片/音频领域，不将模块化单体拆成服务，不在本轮发版或发起收费测试。

## 1. 决策与完成定义

> 一个可信输入事实源、一个视频请求编译入口、一份冻结执行计划；多供应商协议各自实现，不再拥有多套相互覆盖的能力裁决。

“模型能力描述”不再具有独立执行许可权。目录元数据、文档是否完整、是否进行 smoke 测试不再否决已发布且可映射的请求。编译器判断输入与已绑定协议的可表达性及真实组合约束，执行层记录上游的实际受理/成功/失败；编译成功不冒充供应商成功。

管理员有权配置目标通道、参数映射、默认值与明确的产品限制；管理员描述不改变协议物理实现。资料里漏填、null、旧 smoke 的 0/false 不被解释成管理员主动禁止。另一方面，未知也不被伪造为支持：协议缺映射应报告适配缺口，而不是猜字段发请求。

本次重构完成必须同时满足：所有新视频生成入口接入同一编译底座；旧多重能力裁决退出新任务；历史计划兼容；前后节点和资产链路不退化。只增加 compile 包装函数、内部继续串联旧 normalize/能力判断，不算完成。

## 2. 现状与证据边界

当前目录过滤、草稿协调、服务端 normalize、workflow freeze 与 codec 各自重新解释请求。关键基线位置：

| 事实 | 当前源码 |
|---|---|
| manual/vendor/adapter 取首个非空字段，旧描述可覆盖有效适配定义 | [contract.ts:13](../../src/lib/video/contract.ts#L13)、[model-definition.ts:16](../../src/lib/video/model-definition.ts#L16) |
| 模式候选/素材数量直接依赖 modes/limits | [mode-selection.ts:19](../../src/lib/video/mode-selection.ts#L19)、[mode-selection.ts:45](../../src/lib/video/mode-selection.ts#L45) |
| 连线时依据模型能力改模式/角色 | [link-command.ts:102](../../src/lib/canvas/link-command.ts#L102) |
| 前端 normalize 失败直接成为生成禁用原因 | [client-settings.ts:93](../../src/lib/video/client-settings.ts#L93)、[settings-dialog.tsx:84](../../src/components/canvas/video/settings-dialog.tsx#L84) |
| 服务端授权前后 normalize；codec 再 normalize | [submission.ts:74](../../src/lib/video/submission.ts#L74)、[apib-documented.ts:13](../../src/lib/video/providers/protocols/apib-documented.ts#L13) |
| 工作流冻结与工作台仍有独立入口 | [workflow-freeze.ts:33](../../src/lib/video/workflow-freeze.ts#L33)、[video-studio-session.tsx:51](../../src/components/video/video-studio-session.tsx#L51) |
| 旧 smoke codec 用 expectedMode 限制请求 | [apib-verified.ts:58](../../src/lib/video/providers/protocols/apib-verified.ts#L58) |

[11月13日47审计](../changes/2026-11-13-video-node-preflight47-audit.md)的21个模型、18个text-only、8个旧text+媒体节点，是当日只读快照；本RFC不将其写为今日线上现状。[v2变更记录](../changes/2026-11-14-video-intent-compile-v2.md)明确只是文档，不构成实现。

本轮穷举旧判断符号，得到的调用清单保存在交付证据中；匹配既含声明也含调用，不把文本匹配数当故障数。协议注册清单以 [protocols/index.ts](../../src/lib/video/providers/protocols/index.ts) 为准，另包含 [adapter.ts](../../src/lib/video/providers/adapter.ts) 中无 videoProfile 的 direct/openai 旧路径。

## 3. 必须分离的五种数据

| 对象 | 所有者 | 职责/权力 |
|---|---|---|
| `VideoDraft` | 节点或工作台草稿 | 用户意图、参数、素材身份/顺序/角色；允许未完成编辑，保存不要求可执行 |
| `AdapterContract` | video Profile + 版本化绑定 | 定义协议可表达的输入、条件约束、字段映射；describe/compile 同源 |
| `ModelBinding` | 模型配置发布模块 | 选择供应商/精确wire型号/profile版本、参数映射与默认值；人工已发布配置优先，资料兜底 |
| `ExecutionPolicy` | 显式管理操作 | 开关/运营数量上限等产品限制；有actor、理由、修订，不混入模型“支持性”错误 |
| `CapabilityEvidence` | 供应商资料/测试/运行观测 | 文档、wire映射、smoke、生产证据；不具有许可权 |

### 3.1 旧数据与显式限制

- **旧 capabilities.video 不自动迁移为 ExecutionPolicy。** 无论值是 text-only、images=0 还是 supportsFirstFrame=false，都不能仅凭字段形态判定管理员意图。
- 既有管理员明确禁用的模型/通道状态继续生效；已审计、有明确主动操作来源的功能限制可逐项迁移。
- 对无来源字段保留原像和迁移清单：记录“历史描述/意图未知”，不静默转成政策，也不抹除原记录。迁移期间的限制由独立显式政策表示，不靠再解释旧字段。
- 模板与人工配置逐字段分离，保留价格、积分售价、路由、凭据、字段send=omit、false和0的显式语义；供应商同步不覆盖人工绑定。
- 内置型号JSON作为绑定种子/资料来源，丧失第二裁决权。沿用已有协议的新型号通过配置发布；只有新协议结构需要代码。绝不要求“一型号一类/一if分支”。
- 已发布绑定与政策、Profile引用作为一个一致的配置修订激活；不先放开UI再在另一轮切codec。

### 3.2 未知不是拒绝，也不是虚构支持

未知资料、未实测：UI准确标示证据状态，不隐藏已配置通道或凭此禁用生成。绑定可表达、显式政策允许且真实输入合法时可以提交；没有协议映射则返回 `PROFILE_MAPPING_MISSING`。真实上游明确拒绝某组合记为有范围的观测，不根据一次超时或宽泛image/vision错误把整个型号永久降级。

## 4. 五层与单向依赖

```text
Canvas / Workbench / Agent / Storyboard
    -> 视频应用用例 prepare/preview/submit
       -> Input Resolver（访问与媒体基础设施通过窄接口）
       -> compileVideoRequest（纯领域/Profile规则）
       -> 现有 Execution Engine（计费、任务、队列、供应商I/O）
       -> Artifact Graph（现有结果入库、选片与画布引用）
```

1. **Canvas Graph**：图、连线、素材身份、顺序、角色和用户选择；连线逻辑不读模型能力。类型/循环/归属规则可留，连线允许保留暂不可执行草稿。
2. **Input Resolver**：解析具体已选作品、文字、真实媒体元数据及权限；不能用用户提交的URL/bytes冒充可信事实。复用媒体模块，不在领域编译器内拉网络/读DB。
3. **Video Compiler**：统一入口＋各族Profile；推导有效操作、映射字段、应用真实约束，产出计划与结构化诊断。
4. **Execution Engine**：编排报价、幂等受理、预占、排队、发送、查询与结算，执行计划而非重新读最新能力。
5. **Artifact Graph**：任务产出稳定资产；节点保留配置与选片；结果作为下一节点素材。保持现有领域模块所有权，不建全局manager或事件总线。

领域Profile不依赖React、Next Route、DB、具体网络客户端；Route只鉴权/解析/响应映射。基础设施实现不得反向引用页面。模块拆分不拆计费事务、不新增内部HTTP自调用。

## 5. 公共接口（目标契约，不是已实现代码）

以下TypeScript表达职责；辅助类型在实现中由video公开接口导出，不要求逐类型建文件。

```ts
interface VideoModelProfile {
  profileId: string;
  version: number;
  describe(binding: PublishedModelBinding): VideoInputContract;
  compile(input: ResolvedVideoDraft,
          contract: VideoInputContract): VideoCompileResult;
}

type VideoCompileResult =
  | { ok: true; plan: CompiledVideoPlan }
  | { ok: false; diagnostics: VideoDiagnostic[] };

interface CompiledVideoPlan {
  schemaVersion: number;
  identity: {
    publicModelId: string; wireModel: string; connectionId: string;
    profileId: string; profileVersion: number;
    bindingRevision: number; policyRevision: number;
  };
  intent: VideoIntent;
  requestedParameters: VideoRequestedParameters;
  effectiveParameters: VideoEffectiveParameters;
  inputManifest: ResolvedInputManifest;
  wireTemplate: VideoWireTemplate;
  billingFacts: VideoBillingFacts;
  digest: string;
}

// 统一门面：解析政策结果与编译诊断，但不把政策说成模型能力。
function compileVideoRequest(args: {
  profile: VideoModelProfile;
  binding: PublishedModelBinding;
  policy: ExecutionPolicy;
  draft: ResolvedVideoDraft;
}): VideoCompileResult;
```

- Profile按协议族复用，不强行统一Kling、Seedance、Veo、Hailuo的wire格式；模型差异尽量为绑定中的数据。describe与compile共享约束定义，不能各维护一套支持布尔值。
- 通用参数与素材槽由describe驱动现有组件；新增9图/3视频/2音频、首尾、多镜头和条件规格不应要求修改画布或逐入口加型号if。若协议引入全新交互范式，需明确新增通用控件，不能承诺任何未知交互都零UI修改。
- `wireTemplate`支持JSON、多段上传和工作流DAG；素材槽使用稳定AssetRef，不是必须提前得到供应商upload id的原始body。序列化/上传完成后才形成实际wireRequest。
- 编译器仅映射一次：用户选择、有效语义值、wire值分别保存，不能把4K->2K映射后的2K回灌再映射。报价读取有效事实；不把采购价倍率误当采购价。
- Compiler处理确定性纯数据；媒体检查与上传在Resolver/执行适配器，显式分界。一次提交对同一已冻结输入只进行一次语义编译；上传后的字节校验、身份重检不是另一套能力裁决。
- 旧wire枚举/注册机制可渐进复用；新计划引用版本，旧plan/profile版本由兼容reader维持。

## 6. 用户意图、草稿和错误

### 6.1 字段语义与自动推导

新写入使用可选 `intentPreference`；`config.mode`仅由旧schema兼容reader读取。有效mode/intent属于任务编译产物，不再同时承担用户偏好与协议模式。

| 输入 | 默认处理 |
|---|---|
| 无媒体 | 文生 |
| 一张普通图 | 绑定合同声明的默认图像语义；可唯一确定时编译为图生/图片参考，不假定所有模型都把它当首帧 |
| 两张普通图 | 图片参考候选，绝不自动冒充首尾帧；若协议只接受显式首尾，提示选择用途 |
| 明确首帧+尾帧 | 首尾帧；数量/类型不满足时准确报缺口 |
| 来源视频 | 按显式意图或合同默认操作编译为编辑/参考；语义不唯一则请求选择 |
| 视频+音频/仅音频 | 按该合同的参考/配音等显式规则，不随意套通用模式 |
| extend/motion/lip-sync | 保留显式语义；不能仅按素材数量猜续写/运动/口型 |

- 旧mode=text+媒体且无显式偏好：按真实输入与冻结绑定推导，不批量重写历史任务。
- 旧非text结构性mode无来源证据时，兼容为保守保留的显式偏好，避免改用户原意；缺素材报告问题，不静默降级。用户可明确切回自动。
- 切模型不删输入、提示词、角色或高级字段，不自动换另一个模型；不兼容参数以诊断保留，用户确认修改后才改草稿。
- 不用LLM决定协议模式。Agent负责表达意图，依然走相同契约。

### 6.2 诊断分类

`VideoDiagnostic`含category、code、field/inputId、reason、actionable、contractRevision；普通UI显示简明原因，管理员查看详细来源，不展示内部密钥/原始调试负载。

| 类别 | 例子 | 含义 |
|---|---|---|
| input | INPUT_ROLE_NOT_MAPPABLE / ASSET_NOT_READY | 输入缺失、角色或真实素材问题 |
| mapping | PROFILE_MAPPING_MISSING / PARAMETER_MAPPING_MISSING | 本站协议适配缺口，不叫模型不支持 |
| constraint | INPUT_COMBINATION_INVALID | 有明确来源的真实协议组合约束 |
| policy | EXECUTION_POLICY_DISABLED | 管理员明确关闭，不冒充供应商限制 |
| dependency | DEPENDENCY_PENDING | 工作流前序未产出，暂不能最终编译 |
| upstream | 上游结构化拒绝/超时/受理未知 | 运行观测，不反写成全局支持布尔值 |

## 7. 预览、正式提交与执行冻结

### 7.1 同编译器，不同副作用

- 预览由video公共应用用例提供。目标Route为 `POST /api/video/compile-preview`（工作台/独立Agent）与 `POST /api/canvas/video-nodes/[id]/compile-preview`（节点）；两者只负责入口鉴权/项目与revision绑定，调用同一prepare/compile用例，不给画布新增专用编译逻辑。这些端点本轮尚未实现。
- 请求包含草稿和输入身份，服务端自行解析授权。返回诊断、intent、有效参数、计费事实、draftDigest与配置修订；不返回凭据/可复用私有下载地址。
- 预览不创建任务、不扣费/预占、不占业务幂等键、不触发供应商上传或付费生成；媒体元数据从既有可信缓存读取，必要探测仍有范围控制且不落用户创作任务。
- UI防抖/取消旧请求，旧digest响应不覆盖新草稿；预览网络失败不写入“模型不支持”。正式提交仍重做当前身份、资产及修订检查。
- 同输入、同素材版本、同binding/policy/profile版本：预览与提交intent/facts/诊断相同；若输入/修订变化则明确重预览，不能用陈旧预览当授权。
- 按确定的本地错误可阻止无效提交，但只能消费编译诊断；不能另以旧cap/verified否决。保存草稿始终不要求请求可执行。

### 7.2 冻结、队列与未知受理

提交顺序沿用现有幂等/事务机制：认证与输入解析 -> 绑定/政策快照 -> 编译 -> 报价事实/确认 -> 幂等受理与预占/计划持久化 -> 队列。失败不得留下孤立扣费；同操作编号不同计划摘要冲突，同摘要返回原回执。

冻结profile版本、绑定/政策/价格修订、请求语义、具体素材身份/版本、角色顺序和计费事实；wire模板可加密存储。短期签名URL、upload receipt等属于每次合法执行的物化信息，不能被当作长寿命冻结事实。刷新地址必须仍绑定同一授权资产，不能偷换素材或重新推导模式。

执行器不重新读取最新modes、limits、目录状态或价格解释已受理计划；仍可重检访问撤销/真实性等独立事实。约束被违反则明确失败，不通过另开编译和重提来掩盖。受理未知按既有UNKNOWN/needs_attention核查原操作，不因编译重构自动换通道/换模型重发。

公共型号多通道复用既有路由：受理前可做纯候选编译，选中一份可执行计划后直接冻结，不对它重复编译；禁止拿一条文生通道的定义裁掉整个公共型号。选择须遵守显式路由、报价/成本约束，不自动更换用户型号。候选探索不发供应商请求，受理后不因失败/未知切通道重放。

任务重启恢复与用户显式重试分开：恢复继续原计划；显式重试只有已失败/取消才可创建新操作，沿用现有确认/报价语义并保存retryOf。旧任务若选择迁往新绑定，必须展示这是新执行，不把新Profile伪装成旧任务原样回放。历史任务行与原计费回执不改写。

### 7.3 工作流未来输入（不能用/media/pending假装真实素材）

工作流计划阶段可能尚无前序成片，无法声称最终请求已编译：冻结绑定、文本、依赖槽、约束与报价上界，状态为 `dependency_pending`，不伪造已完成资产的MIME/时长。

前序完成后Resolver绑定具体产物 -> 验证冻结约束 -> 按原绑定/Profile最终编译一次 -> 沿既有阶段确认与幂等受理提交。不能读新目录重新选能力，也不能在冻结阶段和阶段提交各重编译一次语义。超出原授权价格/规格时进入既有确认路径，不静默增扣。失败不得重放已完成前序节点。

## 8. 管理后台、政策迁移与证据

### 8.1 后台职责

后台分别编辑ModelBinding和ExecutionPolicy；供应商资料在只读/导入参考区，不能因为“未验证”隐藏已启用绑定。手工字段映射优先于资料默认；映射要通过Profile结构验证，但不被本地型号名单再次覆盖。

显式政策只能限制合同可表达的操作，不能发明代码未实现的上传/序列化机制；若已有通用codec可表达新增字段/型号，管理员可发布映射扩展，无须先修改内置目录。政策和绑定变更均审计，资料同步与政策编辑分开。

### 8.2 证据不是一枚verified开关

Documented、Wire-mapped、Smoke-tested、Production-confirmed作为**可并存、独立且有范围的证据记录**，不是强制升级的许可等级。每项关联provider/channel、wire model、Profile/合同修订、输入签名/规格、时间、脱敏回执与结果；一条文生成功不能代表首尾/多参考全部实测。

Smoke-tested缺失不能阻止已配置请求；Production-confirmed不是永久保证；没有文档也不等于不能映射。上游错误按明确类型、型号/通道/组合记录，网络超时不能自动转换成全局否定能力。过期证据标记时间，不反写当前已发布绑定。

## 9. 全入口迁移矩阵（完成标准不是只修Canvas）

| 入口/边界 | 基线实现 | 目标与退出条件 |
|---|---|---|
| Canvas连线 | [link-command.ts](../../src/lib/canvas/link-command.ts) | 去除模型cap依赖；只编排输入身份/顺序/显式角色；undo/CAS保持 |
| Canvas编辑器 | [compact-composer.tsx](../../src/components/canvas/video/compact-composer.tsx)、[mode-select.tsx](../../src/components/canvas/video/mode-select.tsx)、[settings-dialog.tsx](../../src/components/canvas/video/settings-dialog.tsx)、[settings-panel.tsx](../../src/components/canvas/video/settings-panel.tsx) | 共用合同投影/编译预览，去除模式执法和静默参数删除 |
| Canvas单次/批次 | [node-submission.ts](../../src/lib/video/node-submission.ts)、[canvas-batch.ts](../../src/lib/video/canvas-batch.ts) | 同Resolver/Compiler；原revision、回执与账务不变量保持 |
| Workbench | [video-studio-session.tsx](../../src/components/video/video-studio-session.tsx)、[generate route](../../src/app/api/video/generate/route.ts) | 工作台预览/提交用同用例；禁止仅画布获新语义 |
| Workflow/DAG | [workflow-freeze.ts](../../src/lib/video/workflow-freeze.ts)、[workflow.ts](../../src/lib/video/workflow.ts)、[canvas-workflow.ts](../../src/lib/video/canvas-workflow.ts) | 接入§7.3，去独立能力否决；冻结前序绑定、每阶段只最终编译一次 |
| Agent | [canvas-video-tools.ts](../../src/lib/agent/canvas-video-tools.ts)、[naumi-tools.ts](../../src/lib/agent/naumi-tools.ts) | canvas/standalone、generate/edit/extend/run_workflow同底座；不在tool schema复制支持名单 |
| Storyboard | [storyboard-restructure.tsx](../../src/components/canvas/video/storyboard-restructure.tsx)、[storyboard-tools.ts](../../src/lib/agent/storyboard-tools.ts) | 分镜拆合保留意图/素材；预览不静默重写规格，执行复用Workflow |
| BYOC | [byoc.ts](../../src/lib/video/byoc.ts)、[byoc-recipe.ts](../../src/lib/video/byoc-recipe.ts)、[workflow-inputs.ts](../../src/lib/video/providers/protocols/workflow-inputs.ts) | ComfyUI/RunningHub/AutoDL采用DAG/输入槽Profile，不强行套普通模型模式；编辑导入不因未配置端点被拦，执行依赖另报准确错误 |
| 目录与模型配置 | [capabilities.ts](../../src/lib/video/capabilities.ts)、[model-definition.ts](../../src/lib/video/model-definition.ts)、[video-family-capability-upgrade.ts](../../src/lib/model-config/video-family-capability-upgrade.ts) | 目录只投影，fallback不造数；旧升级职责退出，价格/路由/凭据不误迁移 |
| 提交/执行兼容 | [creation.ts](../../src/lib/video/creation.ts)、[submission.ts](../../src/lib/video/submission.ts)、[runtime.ts](../../src/lib/video/runtime.ts) | 新plan单链；旧快照专用reader；恢复/取消/租约/结算保持 |
| 显式重试 | [retry route](../../src/app/api/video/tasks/[id]/retry/route.ts) | 原操作核查与新操作重试分离；覆盖旧快照、BYOC、retryOf和报价确认 |
| 结果/下游 | [video-result-composer.ts](../../src/lib/canvas/video-result-composer.ts)、[video-node-service.ts](../../src/lib/canvas/video-node-service.ts) | 复用displayResultId/lastResultId与资产身份；不重写已正确的结果/Dock系统 |

新模块建议收敛在video内：公开compile/prepare接口、Profile契约与Resolver适配器；不机械复制service/repository/interface三件套。所有新入口适配完成后再移除兼容入口；每项记录实际调用方清零证据。输入schema、video-node-schema、workflow-schema、task参数与模型配置schema同时纳入迁移，不能只改编译调用而漏掉入口字段解析，导致intentPreference被旧strict schema丢弃/拒绝。

## 10. 全协议覆盖与历史退出

基线实际组合根为[protocols/index.ts](../../src/lib/video/providers/protocols/index.ts)；动态注册表不能替代以下逐族验收。

| 协议族 | 现有实现 | 处置 |
|---|---|---|
| APIB图像/多模态/分镜 | apib-documented、apib-multimodal-v3、multimodal-v3-input、apib-storyboard-v4 | 去各自normalize/静态资料二次裁决，保留真实字段/条件规则为Profile实现 |
| Geek图像/H3/多模态 | geek-documented、geek-h3-documented、geek-multimodal-v3 | 同上；不能遗漏H3或共用multimodal帮助函数 |
| OpenAI兼容及直接实现 | openai-compatible、openai-videos、direct；包括grok2api/cogvideox3/agnes/agnes-v25别名 | 同底座，旧无videoProfile路径也有迁移项，不因未注册codec漏掉 |
| Ark/Gemini/MiniMax/Metaso | ark、gemini、minimax | 独立Profile，保留各自媒体/异步响应/取消差异 |
| Kie/APIMart | kie、apimart | 全部已注册generic/kling/omni/motion子profile列入实例化测试，不按族名一例代全族 |
| TokenDance/TFRouter/CompShare | tokendance、tfrouter、compshare | 展开其导出profile常量逐项覆盖，保留字段差异 |
| 工作流运行时 | autodl、runninghub、comfyui | 输入槽/DAG序列化，冻结模板与映射；上传/端点检查不混成模式能力 |
| 旧smoke profile | apib-verified、geek-verified | 冻结历史继续兼容；新任务路由退出需显式审查绑定并原子发布，不因名称旧就直接全站禁用 |

Profile编译入口统一不等于实现代码同质化。新增profile要提供同源describe、compile、响应处理与fixture；现有注册机制优先复用，避免另建第二注册平台。

## 11. 删除/保留边界与退出凭据

| 旧职责 | 新任务处置 | 历史/兼容约束 |
|---|---|---|
| supportsVideoIntent / videoIntentModels独立许可 | 删除执法，UI消费投影/预览 | 旧入口逐项迁移后清零引用 |
| mediaFits模型能力门控 / attach自动mode写入 | 连线只附加素材；显式用途保留 | 不破坏undo与输入排序 |
| validateVideoSettings中的能力否决 | 删除，结构反馈可保留 | 不把删前端当完整修复 |
| reconcile自动切mode/删字段 | 改成显式变更提案/诊断 | 保存/切模型不丢草稿 |
| resolveVideoCapability的执行权 | 从执行链移除；仅旧读兼容/资料投影 | 管理员映射权保留，旧描述不当政策 |
| 多次normalize里的模型语义重解释 | 迁为一次Profile编译 | 授权后物理校验、上传后完整性检查保留 |
| fallbackCapability及按名猜测 | 删除虚构能力 | 不以unknown冒充false或true |
| whole-object能力升级器 | 取消能力模板升级职责 | 管理配置模块继续拥有版本CAS/原子发布 |
| codec静态型号表的独立最高上限 | 种子/绑定数据，不能覆盖有效发布映射 | 真正无法表达字段要准确报错 |

保留身份归属、项目权限、素材完成/真实类型与必要可解码性、实际大小/时长、引用去重、角色一致、协议硬约束、明确政策、报价/积分/幂等/任务冻结与UNKNOWN恢复。校验应复用可信元数据和内容哈希，避免每次敲字全量解码视频；元数据缺失不伪造0。

## 12. 数据迁移、灰度与回滚

- 扩展/回填/收缩：增加plan schema/version、intentPreference、绑定/政策引用与证据结构时保留旧字段reader；原历史任务不改写。实际SQL必须在实现切片独立列出并测试，本文不虚构已完成迁移。
- 路由切换单位为已发布绑定修订：同一新操作仅选一个引擎；不得“新编译失败就偷偷调用旧体系”，更不得双发供应商比较。
- 可在无任务/无收费的离线/影子编译比较诊断；影子编译不是另一个执行门禁，不写节点/扣费。已有旧受理任务按旧版本完成。
- 灰度按站点和绑定显式登记，不自动推广47/103。目标站实际版本、配置与运行实例发布前重新核对，持锁蓝绿发布，遵循现行runbook。
- 回滚应用/入口不回灌数据库或媒体；新plan由保留版本reader继续消费或排空，不能把新plan喂给未知旧worker。缺兼容reader的版本不得作为回滚候选。
- 收缩删除以调用方清零、无旧任务债务、历史读取/回放证据和足够回滚窗口为条件；旧profile仅可在实际历史引用清零并保留可恢复材料后退役。

## 13. 实施顺序与每阶段退出条件

| 阶段 | 交付 | 退出条件 |
|---|---|---|
| P0 核心 | 统一契约/诊断、可信Resolver、Profile编译、Binding/Policy/Evidence分离、计划版本 | 纯函数/结构/权限边界与迁移语义通过；无旧描述自动转政策 |
| P1 全入口 | Canvas、Workbench、Workflow/批次、Agent、Storyboard、BYOC与预览 | 所有入口共享新底座；未来依赖不假装已完成；无旁路新能力裁决 |
| P2 全协议与发布准备 | §10全部族/子profile迁移；显式绑定切换计划、历史reader | 每个在用协议有fixture，未迁移项显式列为未完成；旧任务wire快照不变 |
| P3 清场 | 旧mode兼容、旧函数执行引用清零、fallback/升级器职责退出 | AST/调用清单及新/旧任务分界通过，无新旧双重执法 |
| P4 E2E/站点发布 | 真实App/DB/Worker/资产链及有授权的上游实测、蓝绿与回滚 | 编译/上游受理/成片/资产/账务分层验收，未验项保留待完成 |

以完整业务切片推进，集中测受影响模块；不为每个小helper反复全量构建。P1/P2可按明确绑定分批实现，但全范围完成前不宣称全视频架构已替换。没有未归属的临时补丁：每项归video/模型配置/媒体/计费既有责任模块。

## 14. 验收矩阵（待实现，不是本轮通过清单）

| ID | 必须证明 |
|---|---|
| A01 | 错误旧modes/limits、verified缺失、smoke缺失不否决已发布可映射请求；明确政策仍有效 |
| A02 | 旧描述无来源不自动变政策；人工字段/价格/路由/send=omit保留；同步不覆盖 |
| A03 | 同协议新增型号只发布Binding即可；新协议结构缺失准确报mapping错误，不按型号正则猜 |
| A04 | describe与compile共用约束；预览/正式提交在同digest和修订下intent/facts/诊断一致 |
| A05 | 预览零任务/零账务/零业务幂等/零供应商调用；陈旧响应不覆盖新草稿，预览失败不持久降级 |
| A06 | 连线/上传/提及同素材、角色和顺序得到等价计划；有语义顺序变化时不错误排序成相等 |
| A07 | text+媒体旧节点恢复自动；两张普通图不变首尾；明确偏好缺素材准确报告、不丢素材 |
| A08 | 切模型/保存刷新/多选/锁定不丢提示词、引用或参数；已有Dock连续性不回归 |
| A09 | 权限/跨项目/待完成/伪造元数据/真实超限/错误角色/重复ID仍拒绝；不每次编辑全解码 |
| A10 | §9所有入口同输入得到等价计划；Agent不能绕过权限/账务或建立独立模式规则 |
| A11 | §10每个注册profile实例＋direct/openai无profile路径均有真实序列化fixture；JSON/multipart/DAG全部覆盖 |
| A12 | 工作流未来绑定在依赖完成后只最终编译一次；冻结绑定不漂移，超报价需原有确认，前序不重放 |
| A13 | 请求/有效/wire参数分开，4K->2K等映射恰好一次；账务事实与实际执行规格对应 |
| A14 | 重复/并发/超时/重启/UNKNOWN不重复受理或扣款；新计划worker消费、租约与取消通过 |
| A15 | 旧冻结任务wire/价格/文本/素材快照及poll/cancel恢复不变；显式retryOf不覆写原任务 |
| A16 | 签名URL过期可按同资产身份物化，不能借机读最新能力或换模型/素材 |
| A17 | 生成完成 -> 选历史结果 -> 接下一节点 -> 再生成，资产/父子回执/账务/用户展示一致 |
| A18 | 编译成功、上游受理、成片保存、选片采用分别验收；证据有通道/合同/输入范围，不把一次文生泛化 |
| A19 | 蓝绿新旧Web/Worker与plan版本兼容，回滚不回灌DB/媒体、不重放未知付费任务 |

复用已有[Canvas提交门禁](../../scripts/verify-canvas-video-submission.cjs)、[Dock门禁](../../scripts/verify-canvas-video-dock.cjs)、[结果连续性门禁](../../scripts/verify-video-dock-continuity.cjs)、[冻结权威门禁](../../scripts/verify-video-frozen-source-authority.ts)、[协议门禁](../../scripts/verify-video-fusion-application-protocols.ts)、[Storyboard工作流门禁](../../scripts/verify-storyboard-workflow-contract.ts)。实现阶段新增计划/政策/迁移/全入口测试，再运行tsc、build与实际应用/DB/Worker验收。旧测试如有既存失败需保留基线，不改产品迎合过时fixture。

## 15. 并行 v3 整合与差异裁定

编写期间main从4b499960推进到4962cb29，另一个任务将原计划升级为并行v3。本RFC保留其全文和交付记录，并吸收全入口、Profile接口、政策分离及证据区分；为避免两份规范并行执法，以下明确统一：

| 并行v3表述/未定项 | 当前统一裁定 |
|---|---|
| 每型号Profile＋代码/JSON作为输入空间 | Profile按协议族复用，ModelBinding承载型号/字段差异；同协议型号配置可扩展，内置JSON不是额外否决 |
| policy初始全空、全部旧字段统一标smoke | 不自动迁移能力描述；但已有明确禁用继续保留，其他字段按来源保留原像/迁移清单，不将所有人工字段擅自判为smoke |
| evidence四级梯 | 四类独立、可并存且限定通道/规格/版本的证据；不能变成隐形许可等级 |
| 一张普通图总是首帧、视频总是编辑 | 按绑定默认语义；不唯一时请求选择，不能用计数误判用户意图 |
| retry一律重放冻结body，缺body转人工 | 必须区分原任务恢复与显式新操作重试；当前retry Route本身调用createVideoGeneration创建新任务。按§7.2保留既有retryOf/报价确认语义，旧任务恢复不重编译；不因新规格缺原始body让原有可重试任务全部失效 |
| 最终body直接冻结 | 冻结语义计划/素材身份与Profile版本；签名URL/upload id在合法执行时物化，不能因过期失效或读取新能力而变语义 |
| Workflow冻结前最终编译 | 未产出素材只冻结绑定/依赖/上界，依赖完成后按原绑定最终编译，见§7.3 |
| 按族分批，未轮到维持现状 | 可以渐进交付，但全入口/全协议退出清单全部验收前不得声称架构替换完成 |

上述是文档规范整合，不是业务变更。若后续要改变现行显式重试的费用/路由语义，应单列用户确认与回归，不混进“校验重构”。

## 16. 本轮交付与下一步

本轮只核对源码、编写RFC、整合并行v3并标记替代关系、做文档/引用/差异校验；未新增compileVideoRequest、intentPreference或预览端点实现，未迁移节点/配置/历史任务，未发起供应商调用或发布。

下一步按P0起步，并以P1全入口/P2全协议清单约束范围。实现细化计划从本文拆出，不能重新照旧v2开工。真实付费端到端和站点上线分别登记，不由文档合main自动授权。

## 附录 A：旧判断符号基线清单

以下为本轮源码匹配的全部文件。共68处匹配、19个文件，含导入、声明及调用，数字不代表68个独立缺陷。实现时逐项登记旧入口是否退出新任务，不只搜索新增compile函数是否存在。

- [src/components/canvas/video/compact-composer.tsx](../../src/components/canvas/video/compact-composer.tsx)：基线行 10, 11, 38, 50, 58。
- [src/components/canvas/video/mode-select.tsx](../../src/components/canvas/video/mode-select.tsx)：基线行 9, 24, 34, 55。
- [src/components/canvas/video/settings-dialog.tsx](../../src/components/canvas/video/settings-dialog.tsx)：基线行 11, 84。
- [src/components/canvas/video/settings-panel.tsx](../../src/components/canvas/video/settings-panel.tsx)：基线行 6, 21。
- [src/components/canvas/video/storyboard-restructure.tsx](../../src/components/canvas/video/storyboard-restructure.tsx)：基线行 5, 25, 37。
- [src/components/video/video-studio-session.tsx](../../src/components/video/video-studio-session.tsx)：基线行 11, 40, 51。
- [src/lib/canvas/link-command.ts](../../src/lib/canvas/link-command.ts)：基线行 19, 113。
- [src/lib/video/capabilities.ts](../../src/lib/video/capabilities.ts)：基线行 7, 119, 142, 148, 153, 225, 242, 259。
- [src/lib/video/client-settings.ts](../../src/lib/video/client-settings.ts)：基线行 6, 42, 59, 93, 107。
- [src/lib/video/contract.ts](../../src/lib/video/contract.ts)：基线行 13, 56。
- [src/lib/video/mode-selection.ts](../../src/lib/video/mode-selection.ts)：基线行 2, 19, 29, 41, 42, 45, 67, 72, 73, 77, 85, 90。
- [src/lib/video/model-definition.ts](../../src/lib/video/model-definition.ts)：基线行 3, 20, 25。
- [src/lib/video/providers/protocols/apib-documented.ts](../../src/lib/video/providers/protocols/apib-documented.ts)：基线行 2, 13。
- [src/lib/video/providers/protocols/apib-storyboard-v4.ts](../../src/lib/video/providers/protocols/apib-storyboard-v4.ts)：基线行 2, 17。
- [src/lib/video/providers/protocols/geek-documented.ts](../../src/lib/video/providers/protocols/geek-documented.ts)：基线行 2, 13。
- [src/lib/video/providers/protocols/geek-h3-documented.ts](../../src/lib/video/providers/protocols/geek-h3-documented.ts)：基线行 2, 10。
- [src/lib/video/providers/protocols/multimodal-v3-input.ts](../../src/lib/video/providers/protocols/multimodal-v3-input.ts)：基线行 3, 21。
- [src/lib/video/submission.ts](../../src/lib/video/submission.ts)：基线行 19, 53, 74, 80。
- [src/lib/video/workflow-freeze.ts](../../src/lib/video/workflow-freeze.ts)：基线行 12, 59, 61。
