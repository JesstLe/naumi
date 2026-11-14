# 视频意图解析执行文档 v2 —— 编译即能力（2026-11-14）

状态：待实施的可执行规格。本轮只交付文档；不改线上配置、不提交生成任务、不迁移历史数据。

**v2 版本说明**：v1（同日早间版本）的定位是"把多道闸门读同一份数据、和谐一致"，经验证这不满足"一击毙命"的要求——闸门数量一个没少，47 仍需先补齐能力配置发布才可用。v2 替换为击毙版决策：**能力声明作为执行闸门这一类别整体删除，编译器成为唯一判断点**。v1 中仍然成立的部分（模式不落盘、纯函数推导、两张普通图片≠首尾帧、旧节点兼容）原样保留并被本决策强化；v1 中"契约层能力对照保留""47 需要能力配置发布"两点被反转。文末附 v1→v2 对照表。

前置事实（不再论证，仅引用）：

- 47 排查报告 `output/video-node-preflight47-audit-20261113/REPORT.md`：v154 下 21 个启用模型中 18 个 modes 仅 text、limits 全 0；8 个旧节点 mode=text 带媒体；Seedance 2.5 能力已列模式但被旧 codec 以"视频模式不属于已核验组合"拒绝；整对象模板相等升级器挡住字段级修复。
- 回执来源的逐型号契约已入库：`src/lib/model-config/video-family-capabilities.json`（32 条，含 47 全部在用型号），由 `apib-documented.ts:1` 直接读取执行——**"以编译为准"的资料基础已经存在**，v2 不是新建体系，是删掉挡在它前面的东西。

代码基线：origin/main `9430289a`。本文所有 file:line 均按该基线核对。

---

## 1. 决策

> **一个请求能不能执行，只由一个地方说了算：实际构造供应商请求的编译器（wire codec 及其逐型号输入空间）。**
> **"能力声明"（modes / limits / 帧标志 / 时长分辨率矩阵）作为执行闸门，这一类别整体删除；它降级为展示元数据与管理端收紧项。**
> **"模式"不再是持久状态、不再是校验维度；它是编译产出的一个标签，外加用户可给的一个偏好。**

三条铁律：

1. **不支持的唯一来源是物理事实**——编译器/协议映射不接受这份输入（"此协议单请求最多 1 张首帧图"）。"资料里没写""没验证过""管理员没填"都不构成"不支持"，都不得拦截。
2. **一份能力事实只存一份、只在一处使用**——逐型号输入空间只存 `video-family-capabilities.json`（回执来源，随代码版本化），编译时使用；管理端只能**收紧**（限制数量上限、关闭某模式），**永远不能发明能力**（不能把编译器不支持的东西填成支持）。
3. **同一个编译器，两种调用**——提交时真编译（产生任务），设置面板预览时干跑（dry-run，不产生任务、不计费）。UI 不再复制任何判断逻辑，只展示编译器说过的话。

## 2. 为什么这是毙命级

47 事故的完整因果链：

```text
冒烟测试只验证了文生
  → 测试值被写成能力配置（modes=["text"], limits 全 0）
  → 前端读它拦一次 → 契约层读它再拦一次 → 旧协议分支又拦第三次
```

三层拦截读的是**同一份错误数据**。v1 方案让三层"读同一份并且把数据改对"——数据仍会错（发布漏填、模板冲突、升级器误判），错了仍全线误拦。v2 让"能力数据错误"**丧失拦截能力**：配置里 modes 填错、limits 漏填，都拦不住一个编译器编得出来的请求。

对 47 的直接后果：**"补齐 21 个模型能力配置并发布"这个任务消失**。发布只剩一件事——把 profile 路由从 legacy `apimart-apib-*` 切到 `apib-video-v2/v3`（配置里现成字段），图生/参考立即按编译器契约执行。

## 3. 删除清单

| # | 位置 | 现状职责 | v2 处置 |
|---|---|---|---|
| D1 | 前端预检 `validateVideoSettings`（`client-settings.ts:93`，调 normalizeVideoInput 后禁用生成按钮） | 第二套能力否决 | **删除执法**。按钮禁用只保留非能力原因：素材未完成（`choices.available`，本就独立于能力矩阵）、未选模型。能力相关的界面反馈改走 dry-run 编译结果 |
| D2 | `supportsVideoIntent`（`mode-selection.ts:19`） | 前端能力矩阵判断 | 降级为徽章渲染数据（哪个 chip 亮、是否提示换模型），无否决权。数据源改为编译器输入空间的展示投影 |
| D3 | 契约层能力对照段（`contract.ts:80-158` 中按 `cap.modes`/`cap.limits`/帧标志/时长分辨率矩阵比对的全部分支：`UNKNOWN_VIDEO_CAPABILITY`、`MODE_INPUT_MISMATCH` 族、`UNSUPPORTED_DURATION/RESOLUTION/ASPECT_RATIO`、`REFERENCE_LIMIT_EXCEEDED` 族等） | 第三套能力否决 | **逐分支处置**：结构类（id 去重 :97、角色类型一致 :115-118）保留于瘦身层；与能力数据比对类（:80、:100-133、:135-142 等全部走 cap 的分支）迁入编译器 space-fit，数据源换 json 契约；依赖 cap 数值的事实类（提示词长度上限 :83）同样改由 json 条目供给。"文生视频不能带媒体参考"这一错误从产品中消失——没有持久"文生"状态，该矛盾不再产生 |
| D4 | 能力配置的执行角色（`model-definition.ts:16-20` `resolveVideoCapability({manual, vendor, adapter})` admin 优先） | 管理端布尔值拥有最高执行解释权 | **优先级翻转**：adapter（json 契约）为基准；manual/vendor 只能收紧（对数值取 min、对模式做减集）。展示元数据（label、默认值）不受限 |
| D5 | 旧核验 codec 新任务路由（`apib-verified.ts` 的 `expectedMode` 单值校验 :56-58、单参考限制 :71/:73） | 第四套否决，47 拒绝现场 | 不改代码；新任务不再路由（发布只切 profile）。已冻结历史任务照旧回放，语义零漂移 |
| D6 | `capabilities.ts:119-140` `fallbackCapability`（给未收录模型编造一套宽松能力） | 未知＝编造 | **删除**。未知型号报"型号没有对应的公开参数契约"（`apib-documented.ts` 现有行为），不造数 |
| D7 | 整对象模板相等升级器（`video-family-capability-upgrade.ts`） | 改一个字段导致整套不能升级 | **删除**。输入空间随代码版本化后，"升级配置能力"这个概念本身消失；管理端草稿只剩收紧项与路由/价格/凭据，无模板匹配问题 |

## 4. 保留清单（物理校验，与能力无关）

以下检查有独立事实来源，全部保留，且大多已在正确位置：

- 身份、项目与素材归属、素材真实存在与完成状态（`node-submission.ts:44-48`，`VIDEO_DEPENDENCY_PENDING`/`VIDEO_INPUT_UNAVAILABLE`）；
- 素材物理属性：真实格式/字节数/时长是否超出**编译器声明**的输入空间（数据源从 cap.limits 换为 json 契约，检查本身保留）；
- 输入结构有效性：字段类型、文本长度上限、素材 id 去重、角色与素材类型一致（`references.ts` superRefine 已有）、URL 合法性；
- 供应商协议硬约束：一次请求最多几张图、分辨率→wire 模式映射是否存在（`apib-documented.ts` 现有的逐型号物理检查，全部保留）；
- 计费：报价、幂等受理、预占、防重放、租约（报价事实从编译产出读取，顺序不变）；
- 冻结语义：已受理任务按冻结上下文执行，不受后续发布影响。

## 5. 新链路：五步，一处判断

```text
素材＋参数＋用户显式偏好（intentPreference，可选）
 → ① 身份、归属、素材完成度                    【保留，非能力】
 → ② 编译：按逐型号输入空间分类意图 → 构造上游请求体
      └ 唯一能力判断点；产出 = 请求体 + 意图标签 + 计费事实
 → ③ 冻结编译产出 → 报价（读编译事实）→ 幂等受理
 → ④ 排队执行冻结请求体（不再读最新配置重新解释任务）
 → ⑤ 结果落原节点 → 可作下一节点素材
```

### 5.1 编译器契约（唯一判断点的形状）

```ts
// src/lib/video/compile.ts（新聚合入口；实现主体已在 apib-documented.ts 等 codec 中）
export type CompileInput = ValidatedVideoInput;            // 结构校验后的输入（§4 前半：类型/长度/去重/角色一致）
export type InputSpace = VideoModelDefinition;             // 已含管理端收紧的逐型号输入空间（§7：json 基准 + 收紧，构建时完成）

export function compileVideoRequest(input: CompileInput, space: InputSpace,
  preference?: VideoCreationIntent):
  | { ok: true; body: VideoWireRequest; intent: VideoCreationIntent /* 意图标签 */;
      facts: { durationSeconds: number; resolution: string; aspectRatio?: string } /* 计费事实 */ }
  | { ok: false; error: VideoContractError }               // 全部为物理原因，文案点名可行动的缺口
```

- `intent` 分类器＝v1 的 `deriveVideoIntent` 纯函数（决策表见 §6），**re-home 为编译器内部步骤**，同时以同源模块供 UI 展示投影复用。纯规则、零 LLM、零 I/O，同输入同能力必同输出。
- 校验分两层、各只跑一遍：**结构校验**（字段类型、文本长度、id 去重、角色与素材类型一致——瘦身后的 `normalizeVideoInput`，先于编译）与 **space-fit 校验**（素材计数/字节/时长/时长分辨率组合是否落在输入空间内——编译器内部，数据源为 json 契约）。管理端收紧在 `InputSpace` 构建处生效（§7），编译函数本身不再接收收紧参数。
- 编译**只跑一次**：现状 `submission.ts:74/:80` 先 normalize 两次、`apib-documented.ts:13` 在 codec 内**第三次** normalize——v2 收敛为：结构校验一次＋编译（含 space-fit）一次（预览与提交共用同一函数）。

### 5.2 双调用：提交与 dry-run 预览

- 提交：`POST /api/canvas/video-nodes/[id]/generate`（现有），内部走 ②-⑤。
- 预览（新增）：`POST /api/canvas/video-nodes/[id]/compile-preview`，同一编译函数干跑——不落任务、不计费、不占幂等键，返回 `{intent, facts, error?}`。设置面板防抖调用，替代被删的前端预检。**同一函数两种调用，不存在第二套判断。**

## 6. 意图：决策表与字段语义

### 6.1 字段语义（比 v1 更彻底）

| 字段 | v2 语义 |
|---|---|
| `config.mode` | **UI 偏好，永不执法**。`undefined`＝自动（默认）；有值＝用户上次点过的模式 chip，仅为重开面板时恢复显示与作为 `intentPreference` 传入编译器。reconcile/attach **永远不写**（v1 病灶①的写入口直接删除，而非"清除陈旧值"） |
| 任务参数 `intent` + `modeSource` | **编译产出标签**，随冻结上下文持久化，供结果侧展示与审计；不参与任何后续判断 |
| `app_video_tasks` 历史行 | 完全不动；冻结任务按原 provider_snapshot 回放（legacy codec 保留于此用途） |

### 6.2 决策表（分类器规则，不变项自 v1 原样保留）

媒体签名 `sig`：图片/视频/音频计数 + 是否存在**用户显式指定**的 `first_frame`/`last_frame` 角色 + `source_video`。

| # | 输入签名 | 意图（编译标签） | 说明 |
|---|---|---|---|
| A1 | 无媒体 | 文生 | |
| B1 | 1 图，普通角色 | 单图 | 编译时该图记 `first_frame`（wire 语义） |
| B2 | 2 图，first+last 均显式 | 首尾帧 | 唯一产生帧模式的签名 |
| B3 | 2 图，均普通角色 | 图片参考 | **绝不冒充首尾帧** |
| B4 | 1 显式帧角色 + 普通图，或 ≥3 图 | 图片参考 | 半指定/多图不升级 |
| C1 | 含 `source_video` 且无图片 | 视频编辑 | |
| C2 | 含视频/音频（其他组合） | 全能参考 | |
| D1 | 仅音频 | 全能参考 | |
| E1 | 签名在输入空间中无任何可编译模式 | 编译错误，点名缺口 | 如"该型号契约未声明参考输入（limits.videos 未配置），无法承接 1 个视频参考；请更换模型或补充契约"。是**契约缺口**信号，不是用户错误 |
| F1 | 任意 + 用户显式偏好 X | X（若物理可编译） | 显式偏好被尊重 |
| F2 | 显式偏好 X（帧类/编辑类等结构性偏好）但素材物理不满足 | 编译错误，明说缺什么 | 不静默降级、不换模型、不丢素材 |
| F3 | 偏好为 `text` 且带媒体（历史字段值的唯一遗留形态） | 视同未给偏好，按自动分类 | text＋媒体本就不可编译；旧节点无需恢复规则即自然归位 |

结构性显式偏好（帧类/编辑类）与素材矛盾时**报错不降级**（F2）；`text` 偏好带媒体视同未给偏好（F3）；自动路径允许在输入空间内降级（B1 单图→图片参考）。`extend/motion_control/lip_sync` 无显式偏好不自动推导（其语义无法从输入签名安全得出）。

## 7. 输入空间的唯一来源与优先级翻转

```text
基准：video-family-capabilities.json 逐型号条目（回执来源，随代码版本化、测试覆盖）
  ↓ 管理端收紧（只能更严）：数量上限取 min；模式做减集；不得新增模式/上限
  ↓ 展示投影（只读）：目录页 chip 可用性、默认时长/分辨率提示
```

- `model-definition.ts:16-20` 的 `resolveVideoCapability` 改为上述方向（现 admin 优先、可发明能力）。
- 管理端"能力编辑"界面语义变为**收紧编辑器**：只能关、只能降上限；界面明示"完整能力由已核验契约定义"。
- 新型号接入流程＝给 json 增加一条回执条目 + 对应 codec 分支，随代码评审与门禁上线；不再依赖管理员先填对布尔值。

## 8. UI 变化

- 模式 chip：可用性来自展示投影（D2），选中写入 `config.mode`（偏好）。
- 生成按钮禁用条件只剩：素材未完成 / 未选模型 / 未登录；能力问题由 dry-run 预览的内联错误呈现。
- 换模型：显式偏好不被新模型支持时**清空偏好回自动**（提示一句），不再写 `modes[0]`。
- 旧节点（mode=text＋媒体）：字段降级为偏好后，text 偏好与带媒体输入在编译时按自动分类处理——**矛盾状态自然消失**，无需恢复规则、无需迁移脚本。历史任务不受影响。

## 9. 逐文件改造清单

| 文件 | 改动 |
|---|---|
| `src/lib/video/intent.ts` | **新增**（自 v1 保留）：`mediaSignature`/`deriveVideoIntent`/意图标签类型；纯函数 |
| `src/lib/video/compile.ts` | **新增**：编译聚合入口（§5.1 签名）；内部＝intent 分类 + codec 构建 + 物理校验 |
| `src/app/api/canvas/video-nodes/[id]/compile-preview/route.ts` | **新增**：dry-run 端点（登录+同源+归属校验，无计费无任务） |
| `src/lib/video/contract.ts` | 删能力对照段（D3）；`normalizeVideoInput` 瘦身为物理校验＋调用 compile；`mode` 从输入字段变为产出字段 |
| `src/lib/video/submission.ts` | 三次校验收敛为一次 compile；任务参数持久化 `intent`+`modeSource` |
| `src/lib/video/client-settings.ts` | 删 `validateVideoSettings` 执法（D1）；`reconcileVideoSettings` 删 mode 写入（仅保留时长/分辨率/画幅按有效意图收敛）；`videoNodeCreationDefaults` 用 dry-run 结果校验 |
| `src/lib/video/mode-selection.ts` | `attachVideoInputs` 不再写 mode（仅附加素材）；`supportsVideoIntent` 降级展示（D2）；`selectVideoIntent` 写偏好 |
| `src/lib/video/model-definition.ts` | 优先级翻转（D4）：adapter 基准 + manual/vendor 收紧 |
| `src/lib/video/capabilities.ts` | 删 `fallbackCapability`（D6）；`documentedVideoCapability` 保留为 json 的旧格式投影 |
| `src/lib/video/providers/protocols/apib-documented.ts` | 成为编译主体；删除内部第二次 `normalizeVideoInput`（:13，由 compile 入口统一） |
| `src/lib/video/providers/protocols/apib-verified.ts` | 注释标记 legacy：仅冻结回放；发布预检拒绝新版本指向（随 P2） |
| `src/lib/model-config/video-family-capability-upgrade.ts` | 删除（D7），调用方改为直接读 json 契约 |
| `src/components/canvas/video/compact-composer.tsx`、`mode-select.tsx` | chip/自动标记/dry-run 错误内联展示；按钮禁用条件收窄 |
| `scripts/verify-video-intent-compile.ts` | **新增**门禁（§10） |

不在本切片（另行任务）：非 video 模态的同构收敛（image 已有类似演进）、结果侧展示、47 实际发布执行。

## 10. 验收标准

| # | 验收项 | 证据 |
|---|---|---|
| V1 | 决策表 A1-F3 逐 case：合成输入×json 真实条目，断言意图标签与请求体关键字段 | 新门禁 `scripts/verify-video-intent-compile.ts`（纯函数+真实 json，无 DB） |
| V2 | 物理校验保留项不回归：超字节/超时长/重复 id/角色类型不符/未完成素材仍被拒（错误码不变） | 同门禁 |
| V3 | **删除回归 pin**：`UNKNOWN_VIDEO_CAPABILITY`、`MODE_INPUT_MISMATCH`、`UNSUPPORTED_DURATION/RESOLUTION` 在新链路不再出现（门禁内文本搜索断言）；`FRAME_INPUT_MISMATCH`/`FRAME_ROLE_MISMATCH` 语义 relocated 为编译错误（可更名），断言其不再按能力矩阵判断 | 同门禁 |
| V4 | 同输入不同顺序/来源（连线/上传/提及）→ 编译产出逐字段相等 | 同门禁 |
| V5 | dry-run ≡ 提交：同一输入两种调用的 intent/facts/错误完全一致；dry-run 不产生任务、不计费、不占幂等键 | 门禁 + fixture |
| V6 | 管理端收紧有效、放宽无效：收紧在 InputSpace 构建处使 limits 变小/模式减集并生效；试图放大 limits 或新增 modes 对编译零影响 | 门禁（D4 断言） |
| V7 | 冻结回放不变：legacy codec 对既有冻结任务样例输入构建的请求体逐字节不变 | 门禁内新增 legacy 请求体快照断言 |
| V8 | 既有门禁不回归：`verify-canvas-video-submission.cjs`、`verify-canvas-video-dock.cjs`、`verify-video-dock-continuity.cjs`、tsc、build | 命令输出 |
| V9 | 47 端到端（依赖 P2 发布后）：图生输入→保存刷新→提交→回执→结果落节点→接下一节点，用 47 实际发布配置验收 | 发布轮次验收记录（本切片不宣称） |

## 11. 实施顺序

1. **P0 编译器统一**（本切片核心）：`intent.ts`＋`compile.ts`＋contract 瘦身＋submission 单次校验＋V1-V7 门禁。落地即消除全部能力误拦（配置错误不再有否决权）。
2. **P1 UI**：dry-run 端点＋chip/自动标记＋按钮条件收窄＋偏好语义。
3. **P2 47 发布**：仅切 profile 路由（legacy→v2/v3）＋发布预检拒绝 legacy 指向；不含能力补齐（该任务已消失）。
4. **P3 清场**：删 `video-family-capability-upgrade.ts`、`fallbackCapability`、旧能力编辑入口改收紧编辑器。

P0/P1 与 P2 解耦可先行；47 恢复图生只需 P0+P1+P2，不再依赖任何能力数据发布。

## 12. 风险与代价（如实）

- 编译错误文案成为唯一用户可见错误来源，需按 §6-E1 标准逐条重写（一次性工作，集中在 json 条目对应 codec 分支）；
- json 契约的完备性责任转移到代码评审与门禁（V1 直接跑真实 json，缺失即红）；
- 管理端能力编辑界面需改语义（收紧编辑器），有少量后台改造；
- 多供应商族（geek/tokendance/compshare 等）按同一模式逐族收敛，工作量大但机械，可按 v2/v3 已有 codec 分批。

## 13. v1 → v2 对照

| 主题 | v1（已替代） | v2 |
|---|---|---|
| 核心思路 | 让前端/契约/配置读同一份能力数据并保持一致 | 能力数据丧失执行权；编译器唯一判断 |
| 契约层能力对照（contract.ts:80-158） | "全部保留" | **删除**（D3），物理校验保留 |
| config.mode | 三态（含陈旧默认恢复规则） | 偏好字段，永不执法；陈旧矛盾自然消失 |
| 意图 | 解析产物，喂给契约校验 | 编译产出的标签＋输入偏好 |
| 47 恢复图生 | 需先发布 21 型号完整能力 | 只切 profile 路由 |
| 能力升级器 | 另行任务修复 | 概念删除（D7） |
| 前端预检 | 保留（契约同款） | 删除执法，dry-run 同编译器替代 |
| 保留不变 | 纯函数推导、决策表、两张普通图≠首尾帧、显式优先、历史冻结不动、无 LLM | 同左，且更彻底 |
