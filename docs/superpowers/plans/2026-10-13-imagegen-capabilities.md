# Naumi 图像能力共用层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将来源包19类图像流程及缺失控制接入Agent、画布和工作台；节点原始提示词可自动触发对应能力，无须先点能力按钮。

**Architecture:** 在 `src/lib/imagegen/` 提供共享目录、输入契约、意图、能力解析及执行适配器。收费生成继续使用既有生成/编辑任务、冻结模型通道和账本，确定性像素处理复用现有媒体后处理记录。各入口仅提供素材和要求，读取同一计划、进度与不可变产物。

**Tech Stack:** Next.js 15.5.27、React 19.3.0、TypeScript、Zod、PostgreSQL、Sharp、现有OpenAI/Router适配器、私有R2和local镜像；沿用同事已完成的React19升级，不引入另一套任务/计费框架。

**Spec:** [已批准设计](../specs/2026-10-13-imagegen-capabilities-design.md)，包含用户审阅后明确补充的提示词自动触发。

## Global Constraints

- 保留已有12个官方Skill ID、个人记录、修订、选择校验及旧接口默认行为；新增命名不用mvp。
- 管理员显式配置优先，上游有来源资料兜底；false、0、明确禁用和“不发送”均为有效配置。
- supported/unsupported/unknown三态与证据日期分别保存，未知不能等同支持；模型名称不能证明能力。
- 素材角色为 `edit-target`、`reference`、`insert`、`style`、`mask`；蒙版对应首个编辑目标。
- 初版确定性本地后处理为0积分；生成与AI抠图沿用现有报价、大额确认、冻结配置和预留/结算/退款规则。
- 同一operationId的重复请求返回原任务/作品；相同ID不同内容拒绝。上游已受理但超时不能自动重放收费任务。
- 透明格式为PNG/WebP；JPEG需明确背景色并确认扁平化。缩小不能冒充原生高分辨率或AI高清放大。
- 不执行用户Python、不恢复自带图片API、不写凭据/签名链接到仓库或日志；保留Apache-2.0来源及改动说明。
- 集中验收一次，发现问题后仅复测受影响项；不对每张Skill卡重复收费生图。
- 后续默认103工程及验收；120已废弃，不再连接或推广，香港/101不自动操作。
- 发布先读 `docs/RELEASE_RUNBOOK.md`，连续可用蓝绿工程为独立发布依赖，未满足时交付代码/验收证据并如实报告未上线；不以当前重建流程绕过门槛。

## Review Focus

1. 节点要求“透明底”自动执行，而否定、引号印字、询问和前次继承设置不误触发（任务2）。
2. 当前控件与提示词冲突、指定家族无合格透明/蒙版通道：扣费前说明，不静默换模型或丢参数（任务2、3、5）。
3. 跨账号参考图/蒙版/批次ZIP及超大像素、错误蒙版尺寸：鉴权和解码检查先于模型与像素处理（任务4、5、6）。
4. 重复提交、已受理超时、取消与领取竞态、存储失败：不重放、不重复扣退、刷新可恢复，成功结果保留（任务5、6）。
5. 存在alpha通道但全不透明、全部透明、JPEG扁平化与边缘残色：按实际像素报告，保留原版本（任务4、8）。

---

## 文件与责任地图

| 范围 | 新建文件 | 修改已有文件 |
|---|---|---|
| 目录/契约 | `src/lib/imagegen/catalog.ts`、`schema.ts`、`types.ts`；`vendor/imagegen/LICENSE.txt`、`NOTICE.md` | `src/lib/image-skills/catalog.ts`、`server.ts`；`scripts/verify-image-skills.ts`；`package.json` |
| 意图/提示 | `src/lib/imagegen/intent.ts`、`prompt.ts`；`scripts/verify-imagegen-intent.ts` | `src/app/api/generate-image/route.ts` |
| 能力/参数 | `src/lib/imagegen/capabilities.ts`、`parameters.ts`；`scripts/verify-imagegen-capabilities.ts` | `src/lib/supplier-models/types.ts`、`specifications.ts`；`src/lib/model-config/schema.ts`、`types.ts`、`execution.ts`、`context.ts`；`src/lib/image-gateway.ts`；`src/components/admin/model-management/supplier-model-library.tsx` |
| 像素处理 | `src/lib/imagegen/postprocess.ts`、`chroma.ts`；`scripts/verify-imagegen-postprocess.ts` | `src/lib/media-postprocess.ts`；`src/lib/canvas-local-image-edit.ts` |
| 执行/任务 | `src/lib/imagegen/plan.ts`、`dispatch.ts`、`adapters.ts`、`generation-core.ts`；`src/app/api/imagegen/route.ts`、`src/app/api/imagegen/plan/route.ts`；`scripts/verify-imagegen-execution.ts` | `src/app/api/generate-image/route.ts`、`src/app/api/inpaint/route.ts`、`src/app/api/cutout/route.ts`；`src/lib/image-edit.ts`、`durable-image-jobs.ts`、`image-job-repository.ts` |
| 批次 | `src/lib/imagegen/batch.ts`、`batch-repository.ts`；`src/app/api/imagegen/batches/[id]/route.ts`、`src/app/api/imagegen/batches/[id]/download/route.ts`；`scripts/verify-imagegen-batch.ts` | `src/lib/db.ts`；`src/lib/durable-image-jobs.ts` |
| UI/Agent | `src/components/imagegen/imagegen-panel.tsx`、`input-roles.tsx`、`batch-progress.tsx`、`imagegen.module.css`；`src/lib/imagegen/client.ts`；`scripts/verify-imagegen-ui.mjs` | `src/lib/agent/naumi-tools.ts`、`creative-tools.ts`；`src/components/canvas/canvas-client.tsx`、`batch-selection-toolbar.tsx`；`src/components/home/workbench-client.tsx`；`src/components/image-skills/skill-book.tsx` |
| 验收/交接 | `scripts/verify-imagegen-contract.ts`、`verify-imagegen-real.ts`；`docs/changes/2026-10-13-imagegen-capabilities.md` | 本计划勾选状态；`docs/AGENT_COLLABORATION.md` |

路径均相对于本任务worktree。`src/lib/durable-image-jobs.ts` 和 `image-job-repository.ts` 是已有任务实现；不要创建名称相近的第二套账本。现有 `src/lib/media-postprocess.ts` 已保存付费底图、租约和重试，必须扩展复用。新目录浏览器模块只导入catalog/schema/types，不导入Sharp、pg、server-only或供应商凭据。

## Task 1: 19类目录、兼容契约与来源

**Files:** 目录/契约行全部文件；新测试 `scripts/verify-imagegen-contract.ts`。

**Interfaces:** 产出 `IMAGEGEN_USE_CASES`、`imagegenRequestSchema`、`ImagegenRequest`、`Intent`、`CapabilitySet`、`ImagegenPlan`、`ImagegenResult`；后续签名中的这些类型均从 `src/lib/imagegen/types.ts` 导出。ID采用UUID；请求不包含email、API密钥或供应商地址，owner由服务端鉴权得到。

- [x] **Step 1: 写失败断言。** 测19个精确slug而不是只检查数组长度；旧12个ID仍可解析，旧个人Skill无新字段可读取，错误模式/引用角色拒绝。

```ts
import assert from "node:assert/strict";
import { IMAGEGEN_USE_CASES } from "../src/lib/imagegen/catalog";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";
assert.equal(new Set(IMAGEGEN_USE_CASES.map(x => x.id)).size, 19);
assert.ok(IMAGEGEN_USE_CASES.some(x => x.id === "background-extraction"));
assert.equal(imagegenRequestSchema.safeParse({version:1,mode:"exec-python"}).success,false);
```

- [x] **Step 2: 运行失败测试。** `npx tsx --conditions react-server scripts/verify-imagegen-contract.ts`；预期缺少新模块失败。
- [x] **Step 3: 实现类型、Zod契约和目录。** 以下为共享核心定义；Zod用strictObject逐字段验证并导出对应类型，不接受未知服务器控制字段。批次上限100子项、每项variants1—4；JSONL导入最多256KiB、单行prompt最多6000字。无外部路径和命令。

```ts
export type InputRole = "edit-target"|"reference"|"insert"|"style"|"mask";
export type ImagegenRequest = {
  version:1; operationId:string; entry:"agent"|"canvas"|"workbench";
  mode:"generate"|"edit"|"batch"|"postprocess"; prompt:string;
  useCase?:string; skill?:{id:string;revision:number}; augment:boolean;
  modelId?:string; sourceNodeId?:string;
  inputs:{artworkId:string;role:InputRole}[];
  parameters:{quality?:string;resolution?:string;ratio?:string;
    width?:number;height?:number;inputFidelity?:string;moderation?:string};
  output:{format:"png"|"jpeg"|"webp";compression?:number;
    background?:"transparent"|"opaque";backgroundOrigin?:"current-ui"|"inherited"|"skill";
    flattenColor?:string;downscaleMaxDim?:number;name?:string};
  variants:number; batch?:{items:{key:string;name:string;prompt:string}[];
    concurrency:number;maxAttempts:number;failFast:boolean};
  chroma?:{keyColor:string;tolerance:number;autoKey:"none"|"corners"|"border";
    softMatte:boolean;transparentThreshold:number;opaqueThreshold:number;
    edgeFeather:number;edgeContract:number;spillCleanup:boolean};
};
export type Intent = {
  background:"transparent"|"opaque"|null;
  operation:"generate"|"edit"|"cutout"|"postprocess";
  useCase?:string; conflicts:string[];
  requirements:{name:string;value:string;source:"prompt"|"ui"|"skill"}[];
};
export type CapabilityKey = "edit"|"mask"|"transparent"|"inputFidelity"|
  "outputFormat"|"outputCompression"|"moderation"|"pixelSize";
export type CapabilityEvidence = {state:"supported"|"unsupported"|"unknown";
  values?:string[];source:string;checkedAt:string};
export type CapabilitySet = Partial<Record<CapabilityKey,CapabilityEvidence>>;
export type ImagegenPlan = {
  request:ImagegenRequest; intent:Intent; fingerprint:string;
  modelVersion:number;billingVersion:number;
  steps:{key:string;operation:Intent["operation"];modelId?:string;
    eligibleUpstreamIds:string[];parameters:Record<string,string|number|boolean>;
    credits:number}[];
  totalCredits:number; confirmationRequired:boolean; warnings:string[];
};
export type ImagegenResult = {
  operationId:string;jobId:string;
  status:"queued"|"running"|"pending"|"needs_attention"|"succeeded"|"failed"|"cancelled";
  stage:"planning"|"generating"|"editing"|"postprocessing"|"saving"|"done";
  artifacts:{artworkId:string;url:string;width:number;height:number;
    mime:string;transparentPixels:number;totalPixels:number}[];
  chargedCredits:number;error?:{code:string;message:string};
};
```

目录逐行落实设计19项；generate11/edit8全部有 `id,label,mode,existingSkillIds,tool`，tool只填已接通动作或新共用动作。旧12项增加可选useCase而不改ID；新增缺项Skill类别有对应中文标签。复制许可并记录原包SHA、文件来源、移植范围；源包脚本不纳入执行路径。ZIP参考资料只在开发时读取，网站导入采用本站结构化数据。
- [x] **Step 4: 运行contract及现有Skills测试。** 更新原测试硬编码12/13为明确的旧ID兼容断言和完整新目录期望，保留归属、修订、历史测试。`npm run verify:image-skills` 与新contract均通过。
- [x] **Step 5: 选择性提交目录/契约和相应测试。** `git commit -m "feat: define shared image capabilities and preserve skill identities"`。

## Task 2: 提示词自动触发与角色化提示

**Files:** `intent.ts`、`prompt.ts`、`verify-imagegen-intent.ts`；在生成route解析userPrompt后新增调用；先只校验/记录，执行接线由任务5完成。

**Interfaces:** 消费任务1类型；产出 `resolveImagegenIntent(request:ImagegenRequest):Intent`、`compileImagegenPrompt(request:ImagegenRequest,intent:Intent):string`。不收费、不使用第二个LLM分类器，不修改用户原文。

- [x] **Step 1: 写实际意图矩阵测试。** 使用Zod默认值产生完整请求；每条只改变prompt和output。自动透明、去背景结合素材、否定、印字、询问、冲突必须分别断言。

```ts
import assert from "node:assert/strict";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";
import { resolveImagegenIntent } from "../src/lib/imagegen/intent";
const base={version:1,operationId:"1472c152-3faa-4f06-a047-815e3f34848f",
  entry:"canvas",mode:"generate",inputs:[],parameters:{},output:{format:"png"},
  augment:false,variants:1};
for (const [prompt,expected] of [
  ["画一只透明底鹈鹕","transparent"],["请输出 transparent background PNG","transparent"],
  ["不要透明底，改白底","opaque"],["在图片上写‘透明底图’",null],
  ["透明底是什么意思？",null]] as const) {
  assert.equal(resolveImagegenIntent(imagegenRequestSchema.parse({...base,prompt})).background,expected);
}
const conflict=imagegenRequestSchema.parse({...base,prompt:"透明背景",
  output:{format:"png",background:"opaque",backgroundOrigin:"current-ui"}});
assert.ok(resolveImagegenIntent(conflict).conflicts.length>0);
const inherited={...conflict,prompt:"不要透明，换成白底",
  output:{format:"png" as const,background:"transparent" as const,backgroundOrigin:"inherited" as const}};
assert.equal(resolveImagegenIntent(inherited).background,"opaque");
```

- [x] **Step 2: 运行 `npx tsx --conditions react-server scripts/verify-imagegen-intent.ts`。** 预期缺少resolver失败。
- [x] **Step 3: 实现可追踪的指令解析。** 先按中文/英文标点分句，将成对引号、代码区和印字内容标成literal；询问/比较句不转执行。明确negation绑定同一句的背景词；“不要不透明/无背景”作为独立正例；同次出现互斥指令生成conflicts而不猜测。目录维护19个明确用例别名，匹配执行动词+目标；编辑类别要求edit-target，缺目标产生具体冲突。风格引用不当编辑目标。宽泛“好看一点”保留生成/编辑原模式，不自动选择高级工具。

```ts
// 决策核心，promptBackground由前述句法匹配得出；无匹配返回null。
const fromPrompt:Intent["background"] = promptBackground;
const fromUI = request.output.background ?? null;
const explicitUI = request.output.backgroundOrigin === "current-ui";
const conflicts = explicitUI && fromPrompt && fromUI && fromPrompt !== fromUI
  ? ["提示词背景要求与本次选择的背景选项冲突"] : [];
const background = fromPrompt ?? fromUI;
```

在实现中将上述core封装在resolver内，定义 `promptBackground` 为句法解析结果；原文单独落库，compiledPrompt仅组织用途、编号角色、构图、光线、文字、不变量、avoid。有mask只说明已传用户mask，不能伪造mask。augment=false保持详细原文；true仅补足排版/描述，不添加品牌/事实。用户内容放入数据区域，不能改变鉴权、账本、模型或工具权限。
- [x] **Step 4: 跑意图测试。** 增加同句双重否定、多轮白底覆盖透明、参考图文字含透明而用户没要求、空prompt、模糊冲突、19个明确指令到目录映射、不可注入模型ID断言；均通过。
- [x] **Step 5: 提交。** `git commit -m "feat: resolve image capabilities from explicit node prompts"`。

## Task 3: 元数据能力、通道过滤与实际参数

**Files:** 能力/参数行全部文件。已有parameterMap保持原质量/分辨率策略；新增 `imagegen` 可选冻结字段，不改变schemaVersion1或旧snapshot含义。

**Interfaces:** 消费 `Intent`、`CapabilitySet`、既有 `UpstreamModel`；产出 `resolveImagegenCapabilities(manual:CapabilitySet|undefined,supplier:CapabilitySet|undefined):CapabilitySet`、`eligibleImagegenChannels(intent:Intent,candidates:{id:string;capabilities:CapabilitySet}[]):string[]`、`mapImagegenParameters(request:ImagegenRequest,capabilities:CapabilitySet,map:Record<string,string>):Record<string,string|number|boolean>`。在ModelFacts加入可选imagegenRequirements，ExecutionModel冻结同一信息，单个fallback候选独立检查。

- [x] **Step 1: 写false/0/omit与路由断言。** 人工unsupported覆盖采集supported；缺人工key才兜底；refresh不能改冻结值；A不支持mask/B支持只选B，没合格透明候选返回空。

```ts
import assert from "node:assert/strict";
import { resolveImagegenCapabilities,eligibleImagegenChannels } from "../src/lib/imagegen/capabilities";
const supported={state:"supported" as const,source:"文档",checkedAt:"2026-10-13"};
const unsupported={...supported,state:"unsupported" as const};
assert.equal(resolveImagegenCapabilities({transparent:unsupported},{transparent:supported}).transparent?.state,"unsupported");
assert.deepEqual(eligibleImagegenChannels({background:"transparent",operation:"generate",
  conflicts:[],requirements:[]},[{id:"A",capabilities:{transparent:unsupported}},
    {id:"B",capabilities:{transparent:supported}}]),["B"]);
```

- [x] **Step 2: 运行 `npx tsx --conditions react-server scripts/verify-imagegen-capabilities.ts`。** 预期模块缺失失败。
- [x] **Step 3: 实现来源分层及冻结映射。** supplier元数据通过 `parameterMetadata.imagegen` 保存三态枚举和证据；manual独立，采集不能覆盖。管理员表单显示“人工设置/来源兜底/未知”及字段和值，不让用户猜size还是resolution。关键读法如下；不使用 `||` 合并有意义的false/0。

```ts
export function resolveImagegenCapabilities(manual:CapabilitySet|undefined,
  supplier:CapabilitySet|undefined):CapabilitySet {
  const result:CapabilitySet={};
  for (const key of ["edit","mask","transparent","inputFidelity","outputFormat",
    "outputCompression","moderation","pixelSize"] as const) {
    const value = manual && Object.hasOwn(manual,key) ? manual[key] : supplier?.[key];
    if(value !== undefined) result[key]=structuredClone(value);
  }
  return result;
}
```

支持输出格式本地转码与原生参数区别：PNG/WebP/JPEG可本地处理，不意味着供应商接受output_format。actual字段只能来自已确认的白名单路径和枚举；未知input_fidelity/moderation/compression不发送。mask实测/人工明确支持后才能选；最大参考数仍沿现有capabilities字段。记录原生尺寸矩阵与后处理尺寸，保留默认imagePreset及显示档映射。执行context和gateway在每个候选上验证强制字段，原供应商优先级/权重保持；不能以池合并能力证明所有候选支持。禁止`__proto__`、认证、URL、任意嵌套字段映射。
- [x] **Step 4: 跑新capabilities及 `verify:model-execution`、已有元数据默认映射测试。** 在fixture调用真实schema/发布/执行路径，验证旧snapshot可读、参数冻结、unsupported与unknown不发、人工0压缩合法、quality omit不被新字段恢复；无生产调用。
- [x] **Step 5: 提交。** `git commit -m "feat: freeze sourced image capabilities for each supplier route"`。

## Task 4: 确定性去底色、格式与真实alpha

**Files:** 像素处理行全部文件；NOTICE记录来源算法的TS移植。

**Interfaces:** `processImagegenPixels(bytes:Buffer,request:Pick<ImagegenRequest,"output"|"chroma">):Promise<{bytes:Buffer;mime:string;width:number;height:number;transparentPixels:number;totalPixels:number}>`；`inspectImagegenPixels(bytes:Buffer):Promise<{width:number;height:number;transparentPixels:number;totalPixels:number}>`；`removeChroma(bytes:Buffer,options:NonNullable<ImagegenRequest["chroma"]>):Promise<Buffer>`。既有media-postprocess增加可选imagegen policy，不破坏原resize/native policy或恢复记录。

- [x] **Step 1: 写合成像素断言。** 用Sharp构建绿色边框、红色中心4×4PNG，既有alpha保留、soft边缘、自动key两法、spill、contract/feather、全透明/全不透明各有像素断言。

```ts
import assert from "node:assert/strict";
import sharp from "sharp";
import { processImagegenPixels,inspectImagegenPixels } from "../src/lib/imagegen/postprocess";
const opaque=await sharp({create:{width:4,height:4,channels:4,
  background:{r:255,g:0,b:0,alpha:1}}}).png().toBuffer();
assert.equal((await inspectImagegenPixels(opaque)).transparentPixels,0);
await assert.rejects(()=>processImagegenPixels(opaque,{output:{format:"jpeg",background:"transparent"}}));
const webp=await processImagegenPixels(opaque,{output:{format:"webp",compression:0}});
assert.equal(webp.mime,"image/webp");
```

- [x] **Step 2: 运行 `npx tsx --conditions react-server scripts/verify-imagegen-postprocess.ts`。** 预期新模块缺失失败。
- [x] **Step 3: 移植受控像素算法并复用不可变保存。** 静态PNG/JPEG/WebP，输入≤12MiB、解码≤40,000,000像素，EXIF旋转后校验，动图拒绝。来源默认值：key=#00ff00/tolerance=12/auto=none/soft=false/transparent=12/opaque=96/feather=0/contract=0/spill=false；阈值升序、feather0—64、contract0—64。hard matte使用最大RGB距离，soft按来源阈值插值；与旧alpha取较低值，保留前景。border/corners取实际采样众数；contract/feather只作用mask；spill只作用半透明边缘，不全图去绿。

```ts
const {data,info}=await sharp(bytes,{limitInputPixels:40_000_000})
  .rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true});
let transparentPixels=0;
for(let i=3;i<data.length;i+=info.channels) if(data[i]<255) transparentPixels++;
const totalPixels=info.width*info.height;
// hasAlpha只表示存在通道，不能代替这项统计。
```

PNG/WebP保留alpha；JPEG仅在flattenColor显式有效时flatten。compression按用户控制转为真实encoder值，并在产物证据记录映射；downscale用inside且withoutEnlargement，不改原始作品。命名只能下载名，禁止路径。全透明视为错误；已有透明少量/边缘可在界面显示比例，复杂语义效果留真实验收判断。`app_media_postprocess`扩展保存actualMIME、alpha统计/新policy、阶段及原图URL；用原租约/幂等机制恢复CPU与存储，不再次生图。本地版本用现有owner/operation fingerprint/血缘机制。
- [x] **Step 4: 跑像素测试及现有本地编辑/后处理验证。** 加入12MiB与40M边界、动画、伪PNG、mask尺寸错误、原图SHA不变、JPEG背景色、缩小禁止放大、并发同ID仅一版本；通过。
- [x] **Step 5: 提交。** `git commit -m "feat: add immutable chroma and image output processing"`。

## Task 5: 统一计划、既有计费任务与端到端适配

**Files:** 执行/任务行全部文件；为旧route抽出必要的生成核心到 `src/lib/imagegen/generation-core.ts` 供adapter调用，导出的Next route只保留HTTP约束，不从route模块导出任意helper。旧路径继续兼容。

**Interfaces:** `planImagegen(request:ImagegenRequest,owner:string):Promise<ImagegenPlan>`；`submitImagegen(request:ImagegenRequest,owner:string,confirmation?:{billingVersion:number;credits:number;confirmed:boolean}):Promise<ImagegenResult>`；`getImagegenResult(operationId:string,owner:string):Promise<ImagegenResult|null>`。`executeImagegenStep(plan:ImagegenPlan,stepKey:string,owner:string):Promise<ImagegenResult>` 由adapters产出；dispatch仅调它，绝不再次预留。generation-core产出 `submitGenerationCore(plan:ImagegenPlan,stepKey:string,owner:string):Promise<ImagegenResult>`，新adapter和旧HTTP适配均调用该核心，原收费过程只发生一次。与HTTP对接：POST `/api/imagegen/plan`只读；POST `/api/imagegen`提交；GET同路径`?operationId=`查本人结果。

- [x] **Step 1: 写隔离执行fixture。** 沿用 `scripts/model-config-fixture.ts` 和原Skills-execution HTTP/provider spy。将真实原生generate/edit/mask payload与账本、任务、作品连起来，不能仅mock返回成功URL。断言普通旧画布prompt自动走透明方案、无候选收费0。

```ts
// fixture在本脚本定义：http调用新/旧route、隔离PG、fake供应商计数。
const first=await fixture.submit({prompt:"画一只透明底鹈鹕",operationId:fixture.id});
const duplicate=await fixture.submit({prompt:"画一只透明底鹈鹕",operationId:fixture.id});
assert.equal(first.jobId,duplicate.jobId);
assert.equal(fixture.supplierSubmissions,1);
assert.equal(await fixture.settledOperations(),1);
await assert.rejects(()=>fixture.submit({prompt:"画一棵树",operationId:fixture.id}),/冲突/);
await assert.rejects(()=>fixture.readAsOtherOwner(first.operationId),/不存在|权限/);
```

fixture定义实际提供 `submit(input:{prompt:string;operationId:string}):Promise<ImagegenResult>`、`id:string`、`supplierSubmissions:number`、`settledOperations():Promise<number>`、`readAsOtherOwner(id:string):Promise<ImagegenResult>`；输入有完整默认契约。用owner隔离真实DB/路由，执行计数来自供应商HTTP收到的请求，不由submit函数自行加一。
- [x] **Step 2: 运行 `npx tsx --conditions react-server scripts/verify-imagegen-execution.ts`。** 缺少新route/plan时失败。
- [x] **Step 3: 实现plan与submit顺序。** 鉴权/同源→schema→意图/冲突→素材归属和解码→候选/必要参数→报价→要求确认→冻结→任务/执行。dry-run仅读取配置和已授权素材，模型、写表、扣款0。透明原生无候选时可建立生成+已有AI抠图两步，必须所选家族生成、展示抠图模型/总价且工具范围允许；没有这条完整路径则提交前返回具体原因。纯底色已有图可走0积分chroma，不用AI虚构纯色判定。

```ts
const intent=resolveImagegenIntent(request);
if(intent.conflicts.length) throw new Error(intent.conflicts.join("；"));
// planImagegen将请求、意图、每步合法候选和报价固定为同一个fingerprint。
// submit只接受与已报价参数相同的请求，原quoteForRequest/版本确认规则保持。
```

移除生成route中transparent静默换cutoutModel/gpt-image-1与失败后省略透明的分支；强制透明必须native或明确组合。新旧接口的原始userPrompt都进入resolver，内部组合步骤带冻结意图避免重复解析/二次套pipeline。复用 `withBillingIntent`、DurableImageJobs的create/paidOperation/settleResults及gateway安全回执；规划父操作自身不扣款，收费子步骤使用稳定ID和各自既有账本，总额确认覆盖所有子步骤。新增任务元数据保存plan/hash、Skill修订/用户原文/角色/实际字段/模型通道/实际输出，缺历史字段显示未记录。

素材由owner受保护读取，不把预览缩略图作为模型输入；编辑按输入顺序传，mask透明重绘区核验同尺寸。上游确认未受理/终态失败才fallback；started/accepted回执丢失为pending/needs_attention，先查原任务，不触发第二付费调用。保持既有不可重放直连接口释放/人工核查政策，不把未知接受状态伪造为失败证据。原图成功而R2失败恢复相同本地字节；强制透明后处理失败保存base但整体不能标透明成功。
- [x] **Step 4: 跑执行fixture、`verify:billing-image-jobs`、`verify:image-gateway`和现有Skills execution。** 注入accepted timeout、终态失败、R2错误、双击、跨账号mask、引用超过通道上限、dry-run、价格版本变化。核对任务和ledger真实行，无收费供应商调用。
- [x] **Step 5: 提交。** `git commit -m "feat: execute shared image plans through existing billed jobs"`。

## Task 6: 独立提示词批次、恢复、取消与下载

**Files:** 批次行全部文件。`src/lib/model-config/batch.ts`属于后台配置批量操作，本任务不复用它作为生图队列。

**Interfaces:** `submitImagegenBatch(request:ImagegenRequest,owner:string):Promise<{id:string;children:string[]}>`；`readImagegenBatch(id:string,owner:string):Promise<{id:string;status:string;items:ImagegenResult[]}|null>`；`cancelImagegenBatch(id:string,owner:string):Promise<void>`；`runImagegenBatchTick(id:string):Promise<void>`。子项稳定operationId由父UUID+key生成UUIDv5形式SHA256截取后设置version/variant位；variants与多prompt明确分开。

- [x] **Step 1: 写2成功/1拒绝/1未领取及取消竞态测试。** 同批次刷新、Worker重启、同key重复、原prompt变更拒绝；各子任务报价/账本和成功作品独立。

```ts
await fixture.startBatch(["商品白底","背面草图","拒绝样本","未提交样本"]);
await fixture.cancelDuringClaim();
await fixture.restartWorker();
assert.equal(await fixture.callsFor("商品白底"),1);
assert.equal(await fixture.callsFor("未提交样本"),0);
assert.equal(await fixture.successfulArtworkCount(),2);
assert.equal(await fixture.batchCredits(),await fixture.sumChildCredits());
```

该脚本fixture提供上述函数，实际使用隔离PG、两个并发tick和HTTP假上游。`cancelDuringClaim`用事务屏障控制领取顺序，不能依赖sleep碰概率。
- [x] **Step 2: 运行 `npx tsx --conditions react-server scripts/verify-imagegen-batch.ts`。** 预期批次service缺失失败。
- [x] **Step 3: 实现仅关联与调度表。** 新建app_imagegen_batches和app_imagegen_batch_items，表扩展由ensureSchema兼容创建；不迁移旧账本。表字段至少owner/父ID/key/child_operation_id/请求hash/状态/lease及timestamps；unique(parent_id,key)、unique(child_operation_id)。

```sql
SELECT i.child_operation_id
FROM app_imagegen_batch_items i JOIN app_imagegen_batches b ON b.id=i.batch_id
WHERE i.batch_id=$1 AND i.state='queued' AND b.state='running'
FOR UPDATE OF b,i SKIP LOCKED LIMIT 1;
```

取消和领取共享父行锁，取到子项提交后只轮询，不重新submit；并发默认5且受管理员现有队列上限进一步约束，用户请求不能提高上限。maxAttempts只控制可确认未受理的失败次数，1—3；failFast阻止后续领取并保留成功/已受理项。已有任务Worker恢复同时处理batch，不启动无租约第二轮询器。

JSONL解析只接受key/name/prompt和已允许参数；导入先预览，不执行代码/网络/收费。批次下载按owner校验每个作品，输出原图而非缩略，语义名去路径/控制字符，同名加序号；ZIP仍是鉴权API不能公开直链。失败明细/取消状态下载不伪造图片。
- [x] **Step 4: 跑批次测试。** 验证跨ownerZIP403、非法JSONL、100项边界、selected image不同prompt与同prompt4variants、两个tick、failFast、pending不重放、操作取消后重启仍停止。
- [x] **Step 5: 提交。** `git commit -m "feat: persist image batches with safe cancellation and downloads"`。

## Task 7: Agent、直接画布和工作台共用交互

**Files:** UI/Agent行全部文件；只在大型canvas-client中接入口与已有节点落图函数，不整体重写画布。

**Interfaces:** 浏览器 `previewImagegen(request:ImagegenRequest):Promise<ImagegenPlan>`、`startImagegen(request:ImagegenRequest,confirmation?:{billingVersion:number;credits:number;confirmed:boolean}):Promise<ImagegenResult>`、`pollImagegen(operationId:string):Promise<ImagegenResult>`；`ImagegenPanel` props为 `{entry:ImagegenRequest["entry"];inputs:ImagegenRequest["inputs"];modelId?:string;sourceNodeId?:string;onResult:(result:ImagegenResult)=>void;onClose:()=>void}`。Agent工具适配调用任务5服务，不把owner暴露给模型。

- [x] **Step 1: 写真实handler与浏览器断言。** `verify-imagegen-ui.mjs`沿项目现有UI fixture/浏览器连接方式，启动隔离测试站，确认空白画布创作、多选角色、蒙版、批次和当前节点提示词路径；不只检查卡片HTML。

```js
await page.getByLabel('节点提示词').fill('画一只透明底鹈鹕');
await page.getByRole('button',{name:'生成',exact:true}).click();
await page.getByText('透明背景').waitFor();
// fixture接收的原始请求没有先点击透明按钮，结果alpha来自生成/后处理字节。
assert.equal(await fixture.outputTransparentPixels()>0,true);
await page.reload();
assert.equal(await fixture.supplierSubmissionCount(),1);
```

新增UI组件的真实标签与上述选择器对齐；现有节点prompt/生成控件补可访问名称。fixture定义这两个计数方法并从测试HTTP回执/作品字节统计，不借DOM状态当alpha证据。
- [x] **Step 2: 运行 `node scripts/verify-imagegen-ui.mjs`。** 预期新面板/自动执行流程不存在失败。
- [x] **Step 3: 实现共用控件和服务client。** 入口默认显示用途、提示词、模型、比例、分辨率、质量；高级显示适用的透明/蒙版/格式/压缩/尺寸，未知放说明；后台未开放档位直接不呈现。输入角色列表数字对应实际wire顺序；mask用既有画笔/选区，并展示“透明区域重绘”。Skill选择填流程不直接submit。

```tsx
// ImagegenPanel中的计划提示使用服务器返回数据，不在浏览器猜供应商能力。
{plan && <div role="status">
  {plan.intent.background === "transparent" && <span>已识别：透明背景</span>}
  <span>{plan.steps.map(s => s.operation === "cutout" ? "抠图" :
    s.operation === "generate" ? "生成" : s.operation === "edit" ? "编辑" : "处理输出").join(" → ")}</span>
  <span>{plan.totalCredits} 积分</span>
</div>}
```

Agent generate_image/inpaint/cutout/融合等复用共用适配；扩展schema暴露角色、mask、格式等合法选项，保持工具权限、提示词防注入、模型范围/大额确认。工具result区分文本/图片；真实stage驱动整理/生成/后处理/保存和Agent orb，不一直显示思考。直接节点普通提交经过相同计划；预览按可见交互触发并去抖，不每次键入执行收费模型。

作业持久ID用于刷新恢复/停止；完成作品按已有parent/sourceNode关联落画布，不抢焦点，多个输出可批次下载。原图/透明变体保留媒体按需加载。浮层沿已有dock锚点，max-height受viewport、overflow-y auto，wheel在面板不传画布缩放；390px以抽屉呈现，可键盘关闭/回焦点。可显示实际参数和原生/后处理区别，不暴露凭据。
- [x] **Step 4: 跑桌面及390px一次UI集成。** 验证输入透明自动执行、否定不误触发、冲突提示、模型切换隐藏不支持参数、角色/mask、报价/确认、双击、刷新、取消/部分失败、不可变版本/原图ZIP、面板滚动与老画布保存。Agent测试真实工具handler到假HTTP上游；保留原Skills选择历史断言。
- [x] **Step 5: 提交。** `git commit -m "feat: expose shared image workflows in canvas agent and workbench"`。

## Task 8: 一次集中验收、分支整合与103发布交接

**Files:** `scripts/verify-imagegen-real.ts`；`docs/changes/2026-10-13-imagegen-capabilities.md`；协作记录与本计划状态。

**Interfaces:** real脚本只通过已有登录/业务接口运行少量授权调用，证据输出忽略目录 `output/imagegen-capabilities-20261013/`，仓库仅保存脱敏结论/实际SHA、费用、未验收项。

- [x] **Step 1: 刷新main/同事完成分支。** `git fetch origin`，保存本任务提交再普通合并origin/main；核对新完成业务提交，排除四条历史rollback-compat。共享checkout和未提交工作保持。冲突集中解决，触及的新模块只跑必要验证。
- [x] **Step 2: 集中运行受影响契约与Linux固定候选构建。** 新增npm脚本分别映射上述7个TS验证和UI验证；一次运行新测试集、既有Skills/计费/模型/媒体受影响检查。固定Linux镜像执行项目build与类型检查，保留源码SHA/imageID/version。不因文档构建镜像，不循环重复无关同事测试。
- [x] **Step 3: 编写并运行少量真实输出验收。** 复用同一输入覆盖生成、蒙版编辑、多图、透明；19类逐项记录复用路径与支持状态，不各生图一次。自动透明必须从普通节点提示词提交。透明验收代码为：

```ts
const actual=await inspectImagegenPixels(downloadedOriginal);
assert.ok(actual.transparentPixels>0 && actual.transparentPixels<actual.totalPixels);
assert.ok(["image/png","image/webp"].includes(actualMime));
assert.equal(actual.width,storedWidth);
assert.equal(actual.height,storedHeight);
```

`downloadedOriginal`为通过本站已鉴权原图接口取得的Buffer；actualMime/storedWidth/storedHeight来自任务真实产物记录。核对人物/文字/局部编辑语义保留，蒙版传输证据、多图顺序、实际字段、模型通道和账本；不成功不标通过。高级选项无合格通道记录阻塞及后台维护方法，不伪造所有供应商已支持。
- [x] **Step 4: 检查独立蓝绿发布依赖。** 完整读取runbook并查最新工程进度/证据；只有旧槽持续服务、会话/Worker幂等交接、旧资源/Next协议及expand DDL连续验收可用才发布。缺少则记录具体发布阻塞并保留已验证候选，不为图像功能临时先停旧站或自动扩张成蓝绿工程任务。2026-10-14检查结论：完整工程缺失，按要求保留固定候选、释放部署锁，Step5尚未实施。真实输出及19类具体未实测语义见changes记录，不声称全部内容语义通过。
- [ ] **Step 5: 按已授权目标发布103并验收。** 可发布时全程持Naumi/Hub锁，核对基线、备份可读/回滚、空间门槛；构建及切流前再次fetch。同一固定App/Worker镜像旁路真实就绪→平滑切换→排空；最终公网鉴权、版本、模型选择、普通节点自动透明、任务和私有媒体通过；不覆写独立数据、旧DB或配置。清理只按规定范围/计数，不用无筛选prune。
- [ ] **Step 6: 记录真实结论并普通推送main。** 交接分开代码完成、真实功能验收、上线/阻塞状态，列费用及测试范围、尚未知供应商、发布维护/功能同步计数。只在目标真验收后算成功发布；发布锁最终退出。未满足发布依赖的代码提交不能写成已上线。

## 自检与执行交接

设计覆盖：目录19项与CLI控制由任务1/3/6/7承接；提示词自动触发任务2/5/7；像素处理/许可任务1/4；计费/冻结/幂等/媒体任务3/5/6；直接入口与交互任务7；真实验收/连续发布依赖任务8。保留旧12项、个人Skills与历史兼容，各自测试随所有者任务。

五项Review Focus均有具体回归归属；无客户端内置image_gen、任意脚本执行、模型名称推断、第二账本或已受理收费重放。任务代码为核心契约/断言与决策片段，执行时补齐列出的完整算法/路径，不能用通过片段测试代替整条交付标准。

建议当前会话执行：8个任务沿同一请求/冻结计划顺序推进，避免重复上下文交接；集中验收后一次独立整分支审阅。用户选择分任务委派时，改用对应执行技能。当前仅计划完成，产品代码与发布均未完成。
