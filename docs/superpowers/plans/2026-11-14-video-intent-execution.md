# 视频意图解析执行文档（2026-11-14）

状态：待实施的可执行规格。本轮只交付文档；不改线上配置、不提交生成任务、不迁移历史数据。

前置结论（已在前序排查确认，本文不重复论证，仅引用）：

- 47 排查报告：`output/video-node-preflight47-audit-20261113/REPORT.md`（v154：21 个启用模型中 18 个 modes 仅 text、limits 全 0；8 个旧节点 mode=text 带媒体输入；Seedance 2.5 能力已列模式但旧 codec 以"视频模式不属于已核验组合"拒绝；整对象相等的能力升级器挡住字段级修复）。
- 架构决策（2026-11-13 已确认）：撤掉平行的"能力闸门"，收敛为一条请求编译链——**模型能否执行某种输入，由实际负责构造供应商请求的适配器决定**；意图解析是纯函数、只做一次、不调用大模型；用户显式选择保留，默认值不再冒充显式事实。

本文回答"解析意图怎么做"：给出字段设计、完整决策表、解析代码、请求示例、逐文件改造清单与验收标准，可直接按此开发。

---

## 1. 现状链路与病灶定位（基线 ecb05900）

```text
画布连线/上传/提及
  └─ link-command.ts:113 → attachVideoInputs (mode-selection.ts:67)     ① 连线时把模式写进 config.mode
草稿编辑
  └─ compact-composer.tsx:34 currentVideoIntent → VideoModeSelect        ② 前端意图徽章（展示层）
  └─ validateVideoSettings (client-settings.ts:93) → normalizeVideoInput ③ 前端预检（契约同款，禁用生成按钮）
提交
  └─ api/canvas/video-nodes/[id]/generate → submitCanvasVideo (node-submission.ts:16)
       └─ 归属/前序完成检查（VIDEO_DEPENDENCY_PENDING / VIDEO_INPUT_UNAVAILABLE）
       └─ createVideoGeneration (creation.ts:39) → 冻结能力（executor.resolve + runBundle）
            └─ createValidatedVideo (submission.ts:53) → capability = 冻结或 resolveVideoCapability
                 └─ normalizeVideoInput (contract.ts:56)                 ④ 服务端契约（唯一权威校验）
                      └─ buildVideoCreate (submission.ts:88) 按 providerConfig.videoProfile 选 codec
                           └─ apib-verified.ts:56-58 expectedMode 单值校验  ⑤ 旧核验分支二次否决
```

四个病灶（与报告 P1 一一对应）：

| # | 位置 | 病灶 |
|---|---|---|
| ① | `client-settings.ts:62` `reconcileVideoSettings`：`!next.mode → next.mode = modes[0]` | **把"未选择"写成 modes[0]（smoke 配置下即 text）**，默认值变成永久显式事实；`attachVideoInputs` 也会写 mode。旧节点 mode=text 的来源就在这两处 |
| ② | 前端 `supportsVideoIntent` + ③ 预检 | 与服务端契约重复的能力否决：前端按 limits/帧标志先行拒绝，配置滞后时误拦（"文生视频不能带媒体参考"） |
| ④ | `contract.ts:50` `inferredMode` | 服务端推导只看角色、不看能力，且因前端总写 mode 几乎不触发；auto 与 explicit 无法区分 |
| ⑤ | `apib-verified.ts` | 新任务仍被路由到旧核验 codec，`expectedMode` 单值 + 单参考素材限制（:71/:73）再次拒绝 |

## 2. 核心设计

### 2.1 字段语义：`config.mode` 三态

`CanvasVideoNode.config.mode?: VideoMode`（`video-node-schema.ts:12` 已是 optional，**schema 不需要改**）：

| 值 | 语义 | 谁写入 |
|---|---|---|
| `undefined` | **自动**：按实际输入推导，UI 显示派生意图＋"自动"标记 | 无人写入；初始即未定义 |
| 合法 `VideoMode` | **显式**：用户点过模式徽章（`selectVideoIntent`） | 仅用户操作写入 |
| `"text"` 且带媒体 | **陈旧默认**（历史 reconcile/attach 写入的假显式）。text＋媒体在任何能力下都不可提交（`contract.ts:100`），因此这不是一种合法的显式状态，恢复规则见 §5 | 旧代码写入；恢复时清除 |

不新增持久化字段（不加 `modeSource` 到节点草稿——未定义即自动，语义自足）。任务侧新增一个**只读审计字段** `modeSource: "auto" | "explicit"`：由契约层在归一化时产出，随现有任务参数（与 mode 同层）持久化，供结果侧展示与审计；不参与任何执行判断。

### 2.2 解析的唯一归属：新模块 `src/lib/video/intent.ts`

- **纯函数**，只 import `capability-schema` 与 `references` 的类型，零 I/O、零 LLM、零 fetch——客户端（mode-selection/client-settings）与服务端（contract）都能 import，不存在循环依赖（client-settings 目前 import contract，反向不可行）。
- 决策表、媒体签名、陈旧默认清除三个函数一次定义，两端共用，**杜绝前端/服务端各自理解一次输入**。

### 2.3 显式优先、推导兜底、能力缺口点名

- 显式模式**原样保留**，交给契约层做媒体适配校验（`MODE_INPUT_MISMATCH` 族），解析层不静默改用户选择。
- 自动推导按输入签名选**当前能力可表达**的意图（允许降级，如 single_image→reference），只影响"用哪种方式编译这批素材"，不换模型、不丢素材、不猜提示词。
- 数量上限（`limits.images/videos/audios`）为执行硬约束：`null`/缺省视为未声明，推导时算"不可表达"，报**点名缺失能力**的错误（推动配置发布，而不是放行后在上游炸）。帧角色标志（`supportsFirstFrame` 等）沿用现有约定：仅 `=== false` 视为禁用，`null` 不拦（与 `supportsVideoIntent` 现行为一致）。

## 3. 完整决策表

媒体签名 `sig = mediaSignature(inputs)`：`{images, videos, audios, firstFrame, lastFrame, sourceVideo}`（firstFrame/lastFrame 只统计**用户显式指定**的帧角色；sourceVideo 指角色为 `source_video` 的视频）。

`supports(mode)` = `cap.modes.includes(mode)` 且该模式的媒体适配通过（数量上限按上节规则）。

### 3.1 自动推导（config.mode 未定义）

| # | 输入签名 | 派生结果（wire mode / 展示意图） | 角色处理 | 说明 |
|---|---|---|---|---|
| A1 | 无媒体 | `text` / 文生视频 | — | |
| B1 | 1 图，普通角色 | `single_image`；不支持则降 `reference`/图片参考 | 保持 reference；编译时首图按现有 `contract.ts:111` 记 `first_frame` | 最常见图生路径 |
| B2 | 1 图，显式 `first_frame` | `single_image` | `first_frame` | 与 B1 同结果，角色已由用户指定 |
| B3 | 2 图，first+last 均显式 | `frames_required` / 首尾帧 | `first_frame`+`last_frame` | 唯一能产生帧模式的输入签名 |
| B4 | 2 图，均为普通角色 | `reference` / 图片参考 | 保持 `reference` | **两张普通图片不得冒充首尾帧** |
| B5 | 1 显式 first + 1 普通图 | `reference` / 图片参考 | 保持原角色 | 半指定不升级为帧模式 |
| B6 | ≥3 图（任意角色，未满 B3） | `reference` / 图片参考 | 保持原角色 | |
| C1 | 含视频，`source_video` 角色且无图片 | `video_edit`（cap 允许时），否则 `reference`/全能参考 | 保留 `source_video` | |
| C2 | 含视频（其他组合，含图/音混合） | `reference` / 全能参考 | source_video 角色保留 | |
| D1 | 仅音频 | `reference` / 全能参考（尊重用户 preference 修饰） | `source_audio` | |
| E1 | 任意签名 + 能力无任一可表达模式 | **错误 `VIDEO_INTENT_UNREPRESENTABLE`**，消息点名：媒体签名＋缺失能力（如"该模型未声明参考输入能力（limits.videos 未配置），无法承接 1 个视频参考"） | — | 这是配置发布问题浮出，不是用户错误 |

### 3.2 显式模式（config.mode 已定义）

| # | 输入 | 行为 |
|---|---|---|
| F1 | 显式 X，媒体与 X 适配 | `X / explicit`，角色按 `videoModeRoles` 归一 |
| F2 | 显式 X，媒体不适配（如 text＋图、single_image＋视频） | **不改模式**，契约层按现有错误码拒绝（`MODE_INPUT_MISMATCH` 等），前端如实展示 |
| F3 | 显式 text 且带媒体 | 即"陈旧默认"（§2.1）：**在连线/保存/提交时清除为未定义**并按 §3.1 重新派生，UI 提示"已按当前素材恢复生成模式"。理由：text＋媒体永不合法，不存在被覆盖的合法显式状态 |

### 3.3 显式与自动的转换规则

- 用户点模式徽章 → `selectVideoIntent` 写入 `config.mode`（唯一显式来源，不变）。
- 换模型后显式模式不被新模型支持：`reconcileVideoSettings` **清除为未定义**（回到自动）并记 `changes`（"生成模式"），**不再写入 `modes[0]`**——这是病灶①的根除点。
- 自动状态下增删素材：派生结果随输入实时变化，UI 徽章跟随，无任何持久化写入。

## 4. 解析代码（可直接落库）

### 4.1 `src/lib/video/intent.ts`（新文件，全部内容）

```ts
import type { VideoMode } from "./capability-schema";
import type { VideoCreationIntent } from "./mode-selection"; // 仅 type import，避免运行时环
// 若要彻底零依赖，可将 VideoCreationIntent 的定义搬入本文件再由 mode-selection re-export（推荐，见 §6 清单）。

export type IntentMediaInput = { kind: "image" | "video" | "audio"; role: string };

export type MediaSignature = {
  images: number; videos: number; audios: number;
  firstFrame: boolean; lastFrame: boolean; sourceVideo: boolean;
};

export type DerivationCap = {
  modes?: readonly VideoMode[] | null;
  limits?: { images?: number | null; videos?: number | null; audios?: number | null } | null;
  supportsFirstFrame?: boolean | null; supportsLastFrame?: boolean | null; supportsFrameAudio?: boolean | null;
};

export type DerivedIntent =
  | { ok: true; mode: VideoMode; display: VideoCreationIntent; source: "auto" | "explicit" }
  | { ok: false; code: "VIDEO_INTENT_UNREPRESENTABLE"; reason: string };

export function mediaSignature(media: readonly IntentMediaInput[]): MediaSignature {
  const images = media.filter(m => m.kind === "image").length;
  return {
    images,
    videos: media.filter(m => m.kind === "video").length,
    audios: media.filter(m => m.kind === "audio").length,
    firstFrame: images > 0 && media.some(m => m.kind === "image" && m.role === "first_frame"),
    lastFrame: images > 0 && media.some(m => m.kind === "image" && m.role === "last_frame"),
    sourceVideo: media.some(m => m.kind === "video" && m.role === "source_video"),
  };
}

const limit = (v: number | null | undefined) => (v == null ? 0 : v); // 未声明 = 0：数量上限是执行硬约束

function supports(sig: MediaSignature, cap: DerivationCap, mode: VideoMode): boolean {
  if (!cap.modes?.includes(mode)) return false;
  if (mode === "text") return !sig.images && !sig.videos && !sig.audios;
  if (mode === "single_image")
    return sig.images === 1 && !sig.videos
      && (!sig.audios || cap.supportsFrameAudio === true)
      && limit(cap.limits?.images) >= 1 && cap.supportsFirstFrame !== false;
  if (mode === "frames_required")
    return sig.firstFrame && sig.lastFrame && sig.images === 2 && !sig.videos
      && (!sig.audios || cap.supportsFrameAudio === true)
      && limit(cap.limits?.images) >= 2
      && cap.supportsFirstFrame !== false && cap.supportsLastFrame !== false;
  if (mode === "video_edit")
    return !!sig.videos && !sig.images && limit(cap.limits?.videos) >= 1;
  if (mode === "reference")
    return sig.images <= limit(cap.limits?.images) && sig.videos <= limit(cap.limits?.videos)
      && sig.audios <= limit(cap.limits?.audios) && (sig.images + sig.videos + sig.audios > 0);
  return false; // extend/motion_control/lip_sync 等扩展模式仅由显式选择进入，不做自动推导
}

export function deriveVideoIntent(
  media: readonly IntentMediaInput[], cap: DerivationCap,
  explicitMode?: VideoMode, preference?: "image_reference" | "omni_reference",
): DerivedIntent {
  const sig = mediaSignature(media);
  if (explicitMode) {
    // 显式选择原样保留；媒体适配由契约层校验（MODE_INPUT_MISMATCH 族），解析层不改用户选择。
    const reference = explicitMode === "reference" && !sig.videos && !sig.audios;
    return { ok: true, mode: explicitMode, display: reference ? (preference ?? "image_reference") : explicitMode as VideoCreationIntent, source: "explicit" };
  }
  if (!sig.images && !sig.videos && !sig.audios) return { ok: true, mode: "text", display: "text", source: "auto" };
  const fits = (mode: VideoMode) => supports(sig, cap, mode);
  if (sig.videos) {
    if (sig.sourceVideo && !sig.images && fits("video_edit")) return { ok: true, mode: "video_edit", display: "video_edit", source: "auto" };
    if (fits("reference")) return { ok: true, mode: "reference", display: "omni_reference", source: "auto" };
  } else if (sig.audios) {
    if (fits("reference")) return { ok: true, mode: "reference", display: "omni_reference", source: "auto" };
  } else {
    if (sig.firstFrame && sig.lastFrame && sig.images === 2 && fits("frames_required"))
      return { ok: true, mode: "frames_required", display: "frames_required", source: "auto" };
    if (sig.images === 1) {
      if (fits("single_image")) return { ok: true, mode: "single_image", display: "single_image", source: "auto" };
      if (fits("reference")) return { ok: true, mode: "reference", display: "image_reference", source: "auto" };
    } else if (fits("reference")) {
      return { ok: true, mode: "reference", display: "image_reference", source: "auto" };
    }
  }
  const wanted = [sig.videos && "视频", sig.audios && "音频", sig.images && `${sig.images} 张图片`].filter(Boolean).join("＋");
  return { ok: false, code: "VIDEO_INTENT_UNREPRESENTABLE",
    reason: `当前模型能力无法承接本次输入（${wanted || "无媒体"}）：modes=${cap.modes?.join("/") || "未声明"}，limits.images=${cap.limits?.images ?? "未声明"}，limits.videos=${cap.limits?.videos ?? "未声明"}，limits.audios=${cap.limits?.audios ?? "未声明"}；请在模型配置中发布对应能力，或更换模型` };
}

/** 陈旧默认恢复：text＋媒体永不合法，清除为自动推导。连线、保存、提交三处共用。 */
export function staleDefaultMode(config: { mode?: VideoMode }, media: readonly IntentMediaInput[]): boolean {
  return config.mode === "text" && media.some(m => m.kind !== "text");
}
```

要点：

- 推导**只读** `modes`、三类数量上限、三个帧标志；时长/分辨率/画幅完全不在解析职责内（它们归 `reconcileVideoSettings` 按有效模式收敛，逻辑不变）。
- `extend/motion_control/lip_sync/video_edit`（无 source_video 签名时）**不自动推导**——这些模式的语义（对哪段视频续写/哪张图做运动控制）无法从输入签名安全得出，必须显式选择。
- 函数确定性：同输入同能力必同输出。这是"提交/报价两遍归一化结果一致"不变式的基础（§7 验收 V6）。

### 4.2 契约层接入：`contract.ts` `normalizeVideoInput`

```ts
// 替换 contract.ts:50-55 的 inferredMode 与 :79 的取值逻辑
const media = (refs: {kind:string;role:string}[]) => refs;   // parsedRefs.data 本身即 IntentMediaInput
const explicit = typeof raw.mode === "string" ? (aliases[raw.mode] || raw.mode) as VideoMode : undefined;
const derived = deriveVideoIntent(parsedRefs.data, derivationCap(cap), explicit);
if (!derived.ok) reject(derived.code, derived.reason, "mode");
const mode = derived.mode;                       // auto/explicit 在此定案
// …原 :80 起的能力/媒体适配校验全部保留（它们针对显式与编译事实，是真正的契约）…
// 返回值新增 modeSource: derived.source
return { ...input, mode, modeSource: derived.source, references: refs, providerOptions, omittedProviderOptions };
```

- `inferredMode` 删除（逻辑被吸收；别名表 `aliases` 保留）。
- `:100` 的 `text＋refs → MODE_INPUT_MISMATCH` 自动路径下不可达（推导不会产出 text＋媒体），显式路径仍然生效——行为只收紧不放松。
- `NormalizedVideoInput` 增加可选 `modeSource?: "auto" | "explicit"`；`createValidatedVideo` 将其随任务参数持久化（与 mode 同层）。

### 4.3 草稿层接入：`client-settings.ts`

```ts
// reconcileVideoSettings 增加可选第三参 media?: IntentMediaInput[]（所有现有调用方手边都有 inputs）
// 病灶①修复：不再写 modes[0]
if (next.mode && !modes.includes(next.mode)) { changes.push("生成模式"); delete next.mode; }
const effective = next.mode ?? (media ? deriveVideoIntent(media, cap).mode ?? undefined : undefined);
// 时长/分辨率/画幅按 effective 收敛（videoDurations/videoResolutions 传 effective，其余逻辑不变）
```

`videoNodeCreationDefaults`、`attachVideoInputs`、`selectVideoIntent`、换模型路径全部改为传 `media` 调用。

### 4.4 连线与提交流

- `attachVideoInputs`（mode-selection.ts:67）**不再写 `config.mode`**：仅附加输入、按 `mediaFits` 拒绝明显超限、对 `staleDefaultMode` 命中的草稿清除陈旧 text 并返回提示文案。原"连线即改模式"的行为由派生展示取代（用户看到的徽章即单图/参考，但 config 保持未定义）。
- `submitCanvasVideo`（node-submission.ts）在 `resolveCanvasNodeInputs` 之后、`createVideoGeneration` 之前套用同一条规则：`if (staleDefaultMode(config, resolved.media)) config = {...config, mode: undefined}`——服务端兜底，旧节点不保存也能直接生成成功。
- 节点写路径（`api/canvas/video-nodes/[id]/route.ts` → service）：保存时同样套用 `staleDefaultMode`，使旧草稿在用户明确编辑/保存时落盘为自动态；**不写任何批量迁移脚本，不动 `deletedAt` 节点与 `app_video_tasks` 历史**。

### 4.5 前端展示层

- `compact-composer.tsx:34`：`currentVideoIntent` 改为委托 `deriveVideoIntent`（含 reference→image_reference/omni_reference 的展示拆分与 preference 透传）；`config.mode` 未定义时徽章旁标"自动"。
- `mode-select.tsx`：`supportsVideoIntent` **仅用于徽章可用性/换模型箭头**（affordance），不再构成提交否决；提交前的唯一判断是 `validateVideoSettings` 里的 `normalizeVideoInput`（契约同款，本就是单一事实）。
- 陈旧默认恢复与换模型清除模式时，用 composer 现有 notice 通道提示"已按当前素材恢复生成模式/生成模式已回到自动"。

### 4.6 旧核验 codec 的处置（依赖配置发布切片）

`apib-verified.ts` 的 `expectedMode` 限制**不改代码**：它继续服务已冻结历史任务的恢复（语义不得漂移）。新任务停止进入该分支的方式是发布层动作——配置发布切片把 21 个型号的 `videoProfile` 切到已文档化的 `apib-video-v2/v3`（`buildVideoCreate` 按 `providerConfig.videoProfile` 选 codec，`wire.ts` 无需改动）。本切片在 `apib-verified.ts:9` 的 profiles 注释处补一行"legacy: 仅服务已冻结任务，新发布不得指向"。若需硬护栏，可在 `video-family-capability-upgrade` 的发布预检里拒绝把 legacy profile 发布给新版本（属配置切片范围）。

## 5. 旧节点兼容（对应报告 P1-3）

| 场景 | 行为 |
|---|---|
| 打开旧草稿（text＋媒体）不操作 | 不改写；徽章按 F3 规则在**展示层**即按自动派生显示（读时派生，不落盘） |
| 编辑并保存 | `staleDefaultMode` 清除 mode 落盘，revision 正常 +1，notice 提示 |
| 直接点生成（未保存） | 提交流服务端兜底清除并派生，一次成功 |
| 同步生成参数被冻结的历史任务 | 完全不动（冻结快照不含派生逻辑变更；`modeSource` 只对新任务写入） |
| 两张普通图片的旧节点 | 恢复为图片参考（B4），**绝不**解释成首尾帧 |
| 旧节点的模型 | 不自动更换；能力不足时按 E1 点名报错，引导配置发布或用户显式换模型 |

## 6. 逐文件改造清单

| 文件 | 改动 | 风险 |
|---|---|---|
| `src/lib/video/intent.ts` | **新增**：`mediaSignature` / `deriveVideoIntent` / `staleDefaultMode` / `VIDEO_INTENT_UNREPRESENTABLE`；`VideoCreationIntent` 类型定义迁入此处，`mode-selection.ts` re-export | 纯新增 |
| `src/lib/video/contract.ts` | 删 `inferredMode`；`normalizeVideoInput` 接 `deriveVideoIntent`；`NormalizedVideoInput.modeSource`；E1 错误透传（422） | 行为变更核心；靠 V1-V7 门禁兜住 |
| `src/lib/video/client-settings.ts` | `reconcileVideoSettings` 不写 modes[0]、加 `media` 参数；`videoNodeCreationDefaults` 用派生模式校验 | 时长/分辨率收敛逻辑不动 |
| `src/lib/video/mode-selection.ts` | `attachVideoInputs` 不写 mode＋陈旧清除；`currentVideoIntent` 委托派生；`selectVideoIntent` 不变；re-export intent 类型 | UI 行为变化＝徽章随输入联动 |
| `src/lib/canvas/link-command.ts` | 透传（attach 返回值用法微调） | 低 |
| `src/lib/video/node-submission.ts` | 提交前 `staleDefaultMode` 兜底清除 | 旧节点直通 |
| `src/app/api/canvas/video-nodes/[id]/route.ts`（写路径 service） | 保存时 `staleDefaultMode` 清除 | 落盘迁移的唯一入口 |
| `src/lib/video/submission.ts` | 任务参数持久化 `modeSource` | 只增字段 |
| `src/components/canvas/video/compact-composer.tsx` | 徽章委托派生＋"自动"标记＋恢复/清除 notice | 展示层 |
| `src/components/canvas/video/mode-select.tsx` | `supportsVideoIntent` 降级为 affordance | 展示层 |
| `src/lib/video/providers/protocols/apib-verified.ts` | 仅注释标记 legacy（不改逻辑） | 无 |
| `scripts/verify-video-intent-parse.ts` | **新增**门禁（§7） | 纯新增 |

不在本切片（依赖/后续）：`video-family-capability-upgrade.ts` 逐字段升级（配置切片）、`capabilities.ts` 非托管兜底目录收敛、47 配置发布 v2/v3 profile、结果侧展示 modeSource。

## 7. 请求示例

### 7.1 自动单图（B1）

节点（保存态，mode 未定义——新节点天然如此）：

```json
{ "config": { "modelId": "video-apib-seedance-2-0-fast", "durationSeconds": 5, "resolution": "720p", "aspectRatio": "16:9", "prompt": "产品旋转展示" } }
```

连线 1 张图片后提交（POST `/api/canvas/video-nodes/{id}/generate`，body 仅 `expectedRevision/idempotencyKey`），服务端冻结后的归一化请求：

```json
{ "mode": "single_image", "modeSource": "auto", "durationSeconds": 5, "resolution": "720p",
  "references": [{ "kind": "image", "role": "first_frame", "artworkId": "art_…" }] }
```

（前提：配置切片已为该型号发布 `limits.images ≥ 1` 与 `single_image`；当前 v154 未发布时报 E1 点名错误——这是本切片的**预期诚实行为**，不是回归。）

### 7.2 两张普通图片 ≠ 首尾帧（B4）

输入 2 张 role=reference 的图片 → `mode: "reference"`、`modeSource: "auto"`、展示"图片参考"，两张图全部随请求编译；**不**产出 `frames_required`，不丢第二张图。

### 7.3 显式首尾帧（F1）

用户点"首尾帧"徽章 → `config.mode="frames_required"` 落盘（唯一显式写入）；素材不足时契约层按现有 `FRAME_INPUT_MISMATCH` 拒绝并提示补图——不静默降级。

### 7.4 旧节点恢复（F3）

线上旧节点 `{ "mode": "text", inputs: [1 image] }`：打开 → 编辑 → 保存 → 落盘为无 mode（自动），notice"已按当前素材恢复生成模式"；直接生成同样成功；任务参数带 `modeSource: "auto"`。

### 7.5 能力缺口点名（E1）

Seedance 2.0 Fast 当前 v154 能力（modes=["text"], limits 全 0）＋ 1 图输入 → 422：

```json
{ "error": "当前模型能力无法承接本次输入（1 张图片）：modes=text，limits.images=未声明…请在模型配置中发布对应能力，或更换模型",
  "code": "VIDEO_INTENT_UNREPRESENTABLE", "fields": ["mode"] }
```

对比现状的"文生视频不能带媒体参考"——从用户操作错误变成可行动的配置缺口提示。

## 8. 验收标准

| # | 验收项 | 证据形式 |
|---|---|---|
| V1 | 决策表 A1,B1,B2,B3,B4,B5,B6,C1,C2,D1,E1,F1,F2,F3 逐一通过（合成能力＋合成输入，纯函数级） | 新门禁 `scripts/verify-video-intent-parse.ts`（tsx 直跑，无 DB），逐 case 断言 mode/display/source/角色 |
| V2 | 契约集成：`normalizeVideoInput` 在 B1/B4/F3/E1 输入下产出与 V1 一致的 mode＋modeSource；显式 text＋图仍报 `MODE_INPUT_MISMATCH` | 同门禁（用合成 cap 走真实 contract 模块） |
| V3 | 无二次否决：`intent.ts` 及其依赖闭包内 grep 无 fetch/openai/anthropic/LLM import；`mode-select.tsx` 不再含提交期校验 | 门禁内置 grep 断言 |
| V4 | 同输入等价：同一媒体集合以不同顺序/来源（连线、上传、提及）构造，归一化请求逐字段相等 | 门禁（打乱输入顺序断言） |
| V5 | 陈旧恢复：text＋媒体草稿经保存路径清除 mode；经提交路径不清除草稿也能成功；历史任务行不受影响（不触库的等价单测＋现有 `verify-canvas-video-submission.cjs` fixture 扩展一个 legacy case） | fixture 门禁 |
| V6 | 幂等一致：`videoInputDigest` 对 auto 任务两次归一化摘要一致（推导确定性） | 门禁 |
| V7 | 既有门禁不回归：`verify-canvas-video-submission.cjs`、`verify-canvas-video-dock.cjs`、`verify-video-dock-continuity.cjs`、tsc、build | 命令输出 |
| V8 | 线上整链路（依赖配置切片后）：图片输入→保存刷新→提交→回执→结果落原节点→接下一节点，47 实际发布配置验收 | 发布轮次的验收记录（本切片不宣称） |

## 9. 实施顺序与切片边界

1. **P0（本规格可直接开工）**：`intent.ts` ＋ contract/client-settings/mode-selection/node-submission/写路径 ＋ V1-V7 门禁。落地后系统行为：自动推导正确、显式保留、陈旧恢复、缺口点名——在 v154 现状下即消除误拦与假显式，E1 错误是诚实信号。
2. **P1**：composer/mode-select 展示层（自动标记、notice）。
3. **P2（配置发布切片，另行任务）**：逐字段能力升级计划（修复整对象相等问题）→ 发布 21 型号 v2/v3 profile 与完整能力。完成后 B1 类请求真正出片，apib-verified 自然退出新任务路径。
4. **P3**：结果侧/任务列表展示 modeSource；非托管兜底目录收敛。

P0+P1 不依赖 P2，可先行合入；两切片在 §8 V8 处会合验收。本文件按仓库规则随实施进展更新状态行与偏差记录。
