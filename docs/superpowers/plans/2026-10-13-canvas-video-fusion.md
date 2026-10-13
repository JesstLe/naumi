# Canvas Video Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将两个固定上游快照的完整画布视频能力融合到Naumi，并使用可播放素材模拟供应商，完成真实应用端到端验收后发布103。

**Architecture:** 扩展现有视频领域、后台模型配置、数据库租约/计费和Worker。以持久视频节点连接画布、Agent和工作流，各入口共享能力校验及冻结请求。协议和媒体处理按独立模块拆分，图片生成接口保持。

**Tech Stack:** React/react-dom19.3.0、Next15.5.27、TypeScript、Zod、PostgreSQL/pg、Node24、FFmpeg/FFprobe、Playwright、现有Docker固定镜像发布流程；不引入Vue或第二套账号/积分系统。

**Spec:** [2026-10-13-canvas-video-fusion-design.md](../specs/2026-10-13-canvas-video-fusion-design.md)。用户2026-10-13已确认“按方案继续”；用户已确认计划并选择当前会话Native顺序实施；执行状态以进度记录为准。

## Global Constraints

- 用户最新AGENTS新增约定：UI不要加入无用口号或冗余说明；测试在一个大模块完成后集中执行，避免高频小步测试；每推进一个模块更新对应文档，记录实现、未完成、调研及证据。本约定优先于技能示例中每2—5分钟红绿测试的频率。
- 来源固定：IC `68b37db04b9083c3ff0af67ffe362f85d04d1f9f`，TF `ae9e5f1ac4f37713b902fed7fa5ca87819b324ae`；不能用旧完成记录替代本轮证据。
- 保留已稳定画布生图、统一后台模型配置、鉴权、任务冻结及计费；不新增前端硬编码模型目录。
- 管理员显式定义 > 有来源的供应商定义 > 已有经过证据支持的适配器兼容声明；禁用、不发送、false和0均保留。
- 超量、空引用、未完成前序、重复冲突角色、非法规格或失效素材，在提交/预扣前明确报错；取消静默截断。
- 本站鉴权/任务/Worker/DB/媒体/积分真实执行；仅供应商提交、轮询、结果、错误被独立模拟。真实视频API质量/额度/限流不记通过。
- 用户追加：分阶段合并，不等整轮结束；A/B/C等大模块验收通过后可先整合主线，未验收代码保留任务分支，完整上线复核与D交付门槛保持。
- 独立`codex/canvas-video-fusion-20261013`；刷新main/完成分支，选择性提交，不切换/重置共享checkout，不强推main。每累计3个成功功能任务同步一次主线并记录。
- 仅发布`103.30.76.93`；120已废弃不连接，香港/101不连接。目标站Naumi/Hub双锁、备份、固定镜像、基线防倒退及回滚贯穿发布。
- 配置/元数据、账号、DB、媒体、私有R2、ComfyUI保持；不覆盖人工价/积分售价、测试DB不回灌正式DB。
- 当前103维护计数2；下一次成功发布盘点/允许范围清理，保留当前+最近两个成功版本及7天备份。
- 适用AGPL/MIT版权/许可和来源保留；凭据仅在既有安全载体及进程内，不进入源码、元数据或日志。

## Review Focus

1. 引用含文字且重排/删除：两种编号规则必须仍指向真实素材；由任务2/11的测试固定。
2. 上游提交超时、用户请求停止、Worker租约并发：不重复提交/扣费/退款；由任务9的数据库及HTTP场景固定。
3. 后台刷新与旧任务恢复：旧能力/参数映射/渠道保持冻结，新签名不改变素材身份；由任务3/4/9固定。
4. 下载长度/MIME不可靠且处理失败：损坏字节不落成功作品，付费已成功任务可恢复；由任务10固定。
5. 无作品锚点的新视频项目及Agent关闭SSE：结果仍归属原项目，跨账号拒绝；由任务8/12/13固定。

## 大模块验收节奏与持续记录

任务内测试代码先写好并登记，不在每个小步骤运行。各任务的Run命令是所属检查点执行清单，不是要求逐任务即时运行；任务Step5明确归入哪个检查点。常规开发只做必要的类型/接口判断和git diff检查，环境保护检查仍在启动测试资源前执行。

| 检查点 | 完成范围 | 集中验收 |
|---|---|---|
| A 后台视频大模块 | Task1—9全部完成 | 素材/能力/目录/所有协议/工作流/节点/任务及相关配置、数据库、幂等结算脚本一次 |
| B 媒体处理大模块 | Task10完成 | 真实FFmpeg/FFprobe、媒体权限/损坏/长度/取消/多输出及内存一次 |
| C 画布与Agent大模块 | Task11—13完成 | 设置/引用/高级UI、任务恢复/播放器/媒体动作、Agent及受影响图片交互回归一次 |
| D 全矩阵与交付 | Task14比较差异收敛、所有功能完成 | Task15真实应用全路径E2E及一次生产构建；Task16隔离回滚；Task17上线必须健康/版本/受影响功能验证 |

检查点失败只重跑修复影响的用例；新的接口/共享层变化才重跑受影响大模块。上线验证和回滚门槛不能省略。每个任务结束更新`docs/changes/2026-10-13-canvas-video-fusion-progress.md`对应行，记录代码SHA、做了什么、未完成、调研纠正、测试尚未执行/已执行及证据，不靠会话记忆。三个功能任务的main同步与测试检查点不同，fetch/整合不强制重复全量测试。

最新用户粘贴AGENTS包含历史120/101地址；本会话直接指定的103及仓库最新退役120记录作为本轮具体发布目标沿用。发布前仍刷新最新状态；不根据历史地址重新连接已废弃120或旧101。

## 文件边界与公共接口

旧`src/components/canvas/canvas-client.tsx`只负责接线/状态组合；视频表单、引用、镜头、播放器和媒体动作独立组件。保留旧`src/lib/video/service.ts`入口，规范化/参考/任务取消/媒体处理分别拆出。`db.ts`只修改必须共享事务的任务预留/完成接口；新增视频节点SQL放独立repository，避免单文件继续膨胀。

| 文件/目录 | 职责 |
|---|---|
| `src/lib/video/contract.ts`、`capability-schema.ts`、`capabilities.ts` | 模式/节点/引用/请求schema、字段来源与能力校验 |
| `src/lib/video/references.ts`、`prompt.ts`、`camera.ts` | 已拥有素材、顺序/编号、角色、分镜/摄影提示词 |
| `src/lib/supplier-models/video-access.ts`及现有discovery/repository | 独立供应商视频资料与可追溯兜底 |
| `src/lib/video/providers/wire.ts`、`protocols/` | 协议请求/响应构造；复用现有安全transport及成本观察 |
| `src/lib/canvas/video-node-{schema,repository,service}.ts` | 节点持久化、revision、账号/项目权限、任务关联 |
| `src/lib/video/{cancellation,media,media-jobs}.ts` | 取消竞态、真实媒体核验和处理任务 |
| `src/components/canvas/video/` | 视频生成节点、参数、引用、分镜、元素、播放器、媒体动作 |
| `src/lib/agent/canvas-video-tools.ts` | 节点查询/配置/生成/停止/媒体操作工具 |
| `src/lib/video/workflow.ts` | 视频工作流manifest、变量、依赖及执行 |
| `scripts/video-fusion/` | 原始素材、供应商HTTP模拟、隔离DB/App/Worker、断言及证据 |
| `scripts/verify-video-fusion-*.ts/.mjs` | 对应任务的可运行验证，不使用字符串搜索冒充行为测试 |

以下所有新接口由所属任务实现并测试，不是当前已经存在的函数。

## Task 1: 可播放素材与隔离验收骨架（V19、S01的基础）

**Files:** Create `scripts/video-fusion/{assets.mjs,supplier.mjs,fixture.ts,harness.ts}`、`scripts/verify-video-fusion-fixture.ts`；Modify `package.json`。产物写忽略的`output/canvas-video-fusion-20261013/fixtures`，不提交MP4或凭据。

**Interfaces:** `createVideoFixture(): Promise<Fixture>`；`Fixture`包含`baseUrl`、`refs`、`request<T>(account,method,path,body?)`、`dbCount(table,where)`、`balance(account)`、`supplierCalls()`、`setScenario(name)`、`stop()`。refs包含本账号image/video/audio作品与storageKey；account为`a|b`。输出`CAP_RICH`常量和媒体manifest供后续测试导入。

- [ ] Step 1：编写素材真实性/隔离拒绝测试，纳入后台模块检查点A，不逐步执行：

```ts
import assert from "node:assert/strict";
import { createVideoFixture } from "./video-fusion/harness";
const h = await createVideoFixture();
try {
  const r = await h.request<{code:string}>("b","GET",`/media/${h.refs.image.storageKey}`);
  assert.equal(r.status,404);
  assert.ok(h.refs.video.durationSeconds >= 4);
  assert.ok(h.refs.video.hasVideoStream);
  assert.equal(await h.dbCount("app_video_tasks",{}),0);
} finally { await h.stop(); }
```

Run `npx tsx --conditions react-server scripts/verify-video-fusion-fixture.ts`。环境前置保护始终拒绝未配置、非fixture DB、正式服务URL；feature断言在检查点A运行。

- [ ] Step 2：`assets.mjs`用参数数组生成原始素材；为横/竖/方形、4/8/12/15/30秒以及带/不带音轨生成manifest，FFprobe实测后计算SHA256。

```js
const args=["-n","-f","lavfi","-i",`testsrc2=size=${width}x${height}:rate=24`,
  "-f","lavfi","-i","sine=frequency=440:sample_rate=48000",
  "-t",String(seconds),"-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",
  "-movflags","+faststart",outputPath];
// spawnSync("ffmpeg",args,{windowsHide:true}); exitCode!=0立即终止；无音轨用-an。
```

- [ ] Step 3：实现独立supplier HTTP状态机：每个scenario固定创建/轮询/取消/媒体下载响应；创建返回实际任务ID，轮询按`queued→processing→completed`推进，成功URL返回manifest匹配的视频。记录wire body、素材实际读取和提交次数；提供审核拒绝、429/5xx、提交已接受但断连接、取消不支持、重定向、坏MIME/断流场景。日志删去认证及签名查询参数。
- [ ] Step 4：fixture创建独立namespace DB/App/Worker、两用户/测试积分/测试后台配置；认证会话只在内存。DB必须有fixture标记且名称前缀`naumi_video_fixture_`；资源加本任务label。所有供应商credential为生成的fixture密钥，服务只出站到fixture和测试素材服务；正式模型出站拒绝。Linux环境使用独立网络/媒体目录，Windows本地DB检查兼容已有`NAUMI_VERIFY_ISOLATED_DB=1`。

```ts
export const CAP_RICH = {
  modes:["text","single_image","frames_required","first_optional","last_optional","reference","video_edit","extend","motion_control","lip_sync"],
  durationResolutionMap:[{durations:[4,8,12],resolutions:["720p","1080p"]}],
  aspectRatios:["16:9","9:16","1:1"], audio:"optional",
  limits:{images:30,videos:10,audios:10}, supportsMultiShot:true,
  supportsElements:true,supportsNegativePrompt:true,supportsWatermark:true,
} as const;
```

- [ ] Step 5：登记Step1脚本及FFprobe/跨用户/调用数断言到检查点A，检查产物路径与隔离标记；素材流程在A统一验收。选择性提交这5个脚本和package.json，记录生成命令/素材授权为本任务自行生成。

## Task 2: 完整能力、请求和两种引用编号（V02—V07、V09—V11）

**Files:** Create `src/lib/video/{contract,capability-schema,references,prompt}.ts`、`scripts/verify-video-fusion-contract.ts`、`docs/licenses/canvas-video-fusion/{SOURCES.md,Toonflow-MIT.txt,Infinite-Canvas-AGPL-3.0.txt}`；Modify `src/lib/video/{types,capabilities}.ts`、`src/lib/model-config/schema.ts`。

**Interfaces:** `VideoMode`为Task1的10种模式；`VideoModelDefinition`含合法模式、durationResolutionMap、比例/自动时长、音频状态、参考数量/字节/时长、高级参数schema、是否需要prompt及来源。`OrderedInput={id,nodeId,kind:'text'|'image'|'video'|'audio',role,value}`。`resolveVideoCapability({manual,vendor,adapter})`返回`ResolvedVideoCapability`及每字段来源；`normalizeVideoInput(raw,cap)`返回规范请求或类型化422；`numberVideoInputs(inputs)`返回`all/byKind`。

- [ ] Step 1：编写检查点A的测试断言，确保0/false不兜底、不裁参考、首帧可选单图实际为尾帧、时长/分辨率联动、文字不占IC媒体编号：

```ts
import { CAP_RICH } from "./video-fusion/harness";
import { resolveVideoCapability, normalizeVideoInput, numberVideoInputs } from "../src/lib/video/contract";
const cap=resolveVideoCapability({manual:{limits:{images:0},audio:"disabled"},vendor:CAP_RICH});
assert.equal(cap.limits.images,0); assert.equal(cap.audio,"disabled");
assert.throws(()=>normalizeVideoInput({mode:"reference",references:Array(31).fill({kind:"image",id:"x"})},CAP_RICH),/参考/);
const order=numberVideoInputs([{id:"t",nodeId:"t",kind:"text",role:"context",value:"对白"},{id:"i",nodeId:"i",kind:"image",role:"reference",value:"/media/i.png"}]);
assert.equal(order.all[1].index,2); assert.equal(order.byKind.image[0].index,1);
```

Run `npx tsx --conditions react-server scripts/verify-video-fusion-contract.ts`；在检查点A统一执行，不在每个小步骤重复运行。

- [ ] Step 2：实现nullable未知字段和来源解析；仅`undefined`代表未维护，`null`是明确未知，omit表示不发送。model schema新增可选`capabilities.video`和`parameterMap.videoProfile`，不对旧配置注入默认字段，旧digest保持。

```ts
function prefer<T>(manual:T|undefined,vendor:T|undefined,adapter:T|undefined) {
  return manual!==undefined ? {value:manual,source:"admin"} :
    vendor!==undefined ? {value:vendor,source:"vendor"} :
    adapter!==undefined ? {value:adapter,source:"adapter"} : {value:null,source:"unknown"};
}
```

- [ ] Step 3：显式模式和角色校验；first_optional一图分配last_frame，last_optional一图分配first_frame；frames_required须恰好两图，无视频/音频。reference不把普通图片改成首帧。auto只在cap明确支持时接受旧`seconds=-1`；lip_sync/extend只有cap.requiresPrompt=false时可空prompt。所有超量/超长/重复角色拒绝，不用slice。
- [ ] Step 4：按完整orderedInputs编译TF标记及按类型IC标记，元素引用、镜头文字独立关联；删除/重排后失效标记422。自定义分镜时长之和等于本次合法总时长，支持小数；非法组合预扣前拒绝。
- [ ] Step 5：登记模式/自动时长/超长对白/元素边界及旧配置/冻结脚本到检查点A；实际吸收的源码/Skill逐项写来源40位SHA、文件与适用许可，保留AGPL/MIT全文及MIT版权行；未复制的能力参考明确为行为参考。本任务结束更新模块记录。选择性提交所属文件。

## Task 3: 后台视频能力、公开目录及供应商资料（V05、V06、S01）

**Files:** Create `src/lib/supplier-models/video-access.ts`、`src/components/admin/model-config/video-capability-editor.tsx`、`scripts/verify-video-fusion-config.ts`；Modify `src/lib/supplier-models/{types,discovery,repository}.ts`、`src/lib/model-config/{runtime,execution,projection,runtime-schema}.ts`、`src/components/admin/model-config/{upstream-editor,provider-editor}.tsx`、`src/components/admin/model-management/model-management.tsx`、`src/app/api/video/catalog/route.ts`。

**Interfaces:** `supplierVideoDefinition(providerId,wireModel): Promise<{definition,sourceRevision}|null>`；后台capabilities.video与Task2同schema。公开catalog只返回用户可用的公开模型ID、标签、ResolvedVideoCapability及报价信息；执行快照带冻结video定义/videoProfile/sourceRevision。

- [ ] Step 1：测试手工audio=false/图片数0/omit优先、模型禁用与公开/上游ID隔离，以及v1发布后v2供应商资料刷新不改变v1执行；归入本任务所属大模块检查点集中执行。

```ts
const h=await createVideoFixture();
try {
 const before=await h.request<any>("a","GET","/api/video/catalog");
 const forbidden=before.body.models.find((x:any)=>x.id==="disabled-model");
 assert.equal(forbidden,undefined);
 assert.ok(before.body.models.every((x:any)=>!JSON.stringify(x).includes("fixture-secret")));
} finally { await h.stop(); }
```

Run `npx tsx --conditions react-server scripts/verify-video-fusion-config.ts`。

- [ ] Step 2：supplier `parameterMetadata.video`按Task2校验，独立来源修订，公开目录/密钥可访问目录/实际测试证据分别写入；上游源码声明标documented且带固定源码链接，未知价格为null/status unknown，不自动覆盖管理draft或客户价。
- [ ] Step 3：后台增加模式、时长规格组合、音频/参考/高级参数编辑，显示每项来源和未知；videoProfile为技术协议配置，终端模型选择仍来自公开目录。发布校验拒绝互相冲突的泛用maxReferenceImages与video.limits声明。
- [ ] Step 4：catalog和执行统一调用resolveVideoCapability；任务预留时冻结完整cap/Profile/来源，不在旧任务恢复时重新读当前vendor资料。保留旧配置JSON字段及已有供应商映射。
- [ ] Step 5：配置/目录/发布脚本纳入检查点A，后台浏览器保存/重新加载/手机纳入检查点C；本任务结束更新模块记录。提交文件并记录第一次主线同步点。

## Task 4: 共享协议wire与私有素材提交（P01—P08公共部分、S01）

**Files:** Create `src/lib/video/providers/wire.ts`、`scripts/verify-video-fusion-wire.ts`；Modify `src/lib/video/{references,service}.ts`、`src/lib/video/providers/{config,adapter,direct,openai-videos}.ts`。

**Interfaces:** `VideoWireContext={provider:VideoProviderRuntimeConfig,profile:string,request:VideoGenerationRequest}`；`VideoWireRequest={path,method:'POST'|'GET'|'DELETE',body?:unknown,encoding:'json'|'multipart'|'none'}`；`buildVideoCreate(ctx)`、`buildVideoPoll(ctx,upstreamId)`；`materializeVideoReferences(actor,request,adapter)`返回同身份/角色/顺序的提交副本；`decodeVideoCreated/Polled(profile,payload)`返回现有adapter类型。

- [ ] Step 1：写wire测试：嵌套元素的私有素材和普通references都在fixture供应商真正读到；未授权素材预扣前404；旧任务资料更新后请求体仍v1；归入本任务所属大模块检查点集中执行。

```ts
const calls=h.supplierCalls();
assert.ok(calls.some(c=>c.phase==="reference-read"&&c.assetId===h.refs.image.id));
assert.equal(calls.filter(c=>c.phase==="create"&&c.operationId===operationId).length,1);
assert.ok(calls.every(c=>!c.loggedHeaders?.authorization));
```

operationId由该测试本次`crypto.randomUUID()`生成，h为Task1fixture；Run `npx tsx --conditions react-server scripts/verify-video-fusion-wire.ts`。

- [ ] Step 2：复用submitQueuedVideoTask已有canReadMedia/本地镜像/R2签名；将所有输入（普通、首尾、元素）归一后授权。冻结storageKey/作品ID，不冻结作为永久地址的签名URL；提交时按同账号授权更新短期URL。multipart走已拥有字节。材料失败发生在reservation前或保持可恢复queued，不冒充上游已失败。
- [ ] Step 3：协议transport保持已配置域名/DNS/密钥保护；创建观察supplierCostFetch，轮询不计生成费用。未知/HTML/缺ID和无结果completed严格分类；未知提交保留needs_attention。为可支持协议发送稳定idempotencyKey，声明none时不自动重提。
- [ ] Step 4：advanced参数以typed profile映射，保留false/0/omit，不把任意providerOptions spread覆盖model/prompt/授权；结果URL和rawResponse脱敏，支持仅本来源允许的下载鉴权与重定向策略。
- [ ] Step 5：wire/现有协议脚本与至少8个实际素材读取场景登记检查点A；更新实现/未完成项，选择性提交，未声明真实供应商验收。

## Task 5: IC原有协议和高级Kling分支（P01—P04、V07/V09/V10/V11）

**Files:** Create `src/lib/video/providers/protocols/{openai-compatible,ark,kie,apimart,gemini,minimax}.ts`、`scripts/verify-video-fusion-ic-protocols.ts`；Modify `wire.ts`、model-config/schema.ts及provider config/adapter注册。

**Interfaces:** 每个模块导出对应`build<Protocol>Create(ctx)`、`decode<Protocol>Created(payload)`、`build<Protocol>Poll(ctx,id)`、`decode<Protocol>Poll(payload)`，wire按冻结profile分派。新增profile来自固定源码分支，管理配置选择真实协议；不凭终端模型名称增加虚假能力。

- [ ] Step 1：测试fixture对以下每分支校验实际请求体及状态/下载，归入本任务所属大模块检查点集中执行：OpenAI Videos、Grok2API `/videos/generations`、CogVideoX3字段、Agnes帧数/首尾/多媒体；Ark多参/首尾；KIE/API Mart Kling2.6/3/Omni text/image/reference/transformation、motion-control；Gemini operation；MiniMax/METASO content。

```ts
assert.equal(arkBody.content.find((x:any)=>x.role==="last_frame").image_url.url,lastFrameURL);
assert.equal(klingBody.multi_prompt.reduce((n:number,s:any)=>n+Number(s.duration),0),12);
assert.equal(motionBody.character_orientation,"image");
assert.equal(geminiPoll.done,true);
```

上述body/poll分别由build/decode对应模块产出，URL来自Task1素材；Run `npx tsx --conditions react-server scripts/verify-video-fusion-ic-protocols.ts`。

- [ ] Step 2：OpenAI保持实际multipart读取与content取回；Grok/Cog/Agnes各自endpoint/num_frames/fps/body按固定源文件构造，持续处理当前冻结模板/兼容版响应。Ark content角色正确发送camera_fixed/seed/generate_audio/watermark及合法规格，未配置的字段不发送。
- [ ] Step 3：Kling单独构造multi_prompt、shot_type、element_list及image/video/audio参考，不同Omni变体使用不同数量/字段；motion-control显式图片与运动视频和character_orientation，4K/pro/std受profile约束。
- [ ] Step 4：Gemini correct operation name与selected model URL、受保护媒体下载；MiniMax实际create/query及响应错误；协议官方/代理两种响应的fixture各覆盖，不靠万能`firstUrl`搜任意字符串。
- [ ] Step 5：所有分支/不可用组合/raw脱敏/计费次数/冻结断言登记检查点A，更新实现记录。选择性提交；协议模拟与模型效果分开写证据。

## Task 6: TokenDance、tfRouter与Compshare完整分支（P06—P08）

**Files:** Create `src/lib/video/providers/protocols/{tokendance,tfrouter,compshare}.ts`、`scripts/verify-video-fusion-new-protocols.ts`；Modify wire、注册/schema及supplier资料采集。

**Interfaces:** 沿Task5 build/decode签名；`upstreamId`保留gateway协议前缀，具体profile写冻结快照；`ProtocolVideoAssets`含明确video/image/audio输出及错误。

- [ ] Step 1：测试全部来源分支及非默认模型路由，归入本任务所属大模块检查点集中执行：TokenDance seedance generations、Kling text2video/image2video/motion-control/omni-video、Wan3、HappyHorse、MiniMax v2；tfRouter video generate/status，Kling与非Kling metadata；Compshare H3、ModelVerse Hailuo/Vidu/Wan/Seedance、Vidu extend/lip-sync及首尾模式。

```ts
assert.equal(tokenPoll.path,"/kling/v1/motion-control/job-1");
assert.equal(tfPoll.body.taskICode,"job-1");
assert.equal(viduExtend.parameters.vidu_type,"extend");
assert.equal(viduLip.parameters.vidu_type,"lip-sync");
```

由每模块`build...Poll/Create`产出；Run `npx tsx --conditions react-server scripts/verify-video-fusion-new-protocols.ts`。

- [ ] Step 2：TokenDance路径按profile而非通用/videos处理，返回ID保留protocol/ID二者，轮询succeed/expired/violation映射；余额/密钥额度错误带公开原因，不暴露密钥；所需上游署名header保留。
- [ ] Step 3：tfRouter创建`video/generateVideo`、状态POST `video/getVideoStatus`；Task IC返回string/data分支正确恢复。Compshare区分H3与ModelVerse路径和请求格式；upload/refs/image/first-last/audio/video按源码各body构建。lip-sync音频/文字与extend输入通过cap规范化，不强迫添加无意义提示词。
- [ ] Step 4：录入可取得完整公开目录/参数/价格和固定源码声明；访问目录与真实测试保持unknown，不写fixture为verified supplier。价格未知/倍率不是绝对采购价；资料刷新不触动已发布人工映射。
- [ ] Step 5：各分支wire/素材读取及metadata来源/修订/无凭据断言登记检查点A；更新模块记录，选择性提交，第二次主线同步点。

## Task 7: 视频工作流及串并行执行（P05、V13、V16）

**Files:** Create `src/lib/video/workflow.ts`、`scripts/verify-video-fusion-workflow.ts`；Modify `src/lib/comfyui/{client,workflow}.ts`、`src/lib/canvas-workflows.ts`、`src/app/api/comfyui/run/route.ts`、provider AutoDL/RunningHub模块及任务服务。

**Interfaces:** `VideoWorkflowPlan={id,projectKey,nodes:{id,request,dependsOn:string[]}[]}`；`validateVideoWorkflow(plan)`；`scheduleVideoWorkflow(actor,plan): Promise<{runId,taskIds}>`；`resumeVideoWorkflow(runId)`。既有ComfyUI endpoint凭据从原安全载体读，固定workflow/input映射进任务快照。

- [ ] Step 1：写失败测试：A→B链A完成前B创建次数0；C为独立分支可执行；A失败B明确blocked；两次resume不重复任务；AutoDL非默认workflow和RunningHub错误响应正确，归入本任务所属大模块检查点集中执行。

```ts
const before=h.supplierCalls();
assert.equal(before.filter(c=>c.nodeId==="B"&&c.phase==="create").length,0);
assert.equal(before.filter(c=>c.nodeId==="C"&&c.phase==="create").length,1);
await resumeVideoWorkflow(runId); await resumeVideoWorkflow(runId);
assert.equal(h.supplierCalls().filter(c=>c.nodeId==="A"&&c.phase==="create").length,1);
```

runId由本测试schedule返回，h为本测试独立fixture；Run `npx tsx --conditions react-server scripts/verify-video-fusion-workflow.ts`。

- [ ] Step 2：检测环、自引用、重复节点、缺变量和未授权素材；规范manifest同时表示视频模型任务及ComfyUI图执行。拓扑ready条件必须是实际completed且产物可读，不是prompt已写或queued。每节点operationId由runId/nodeId确定，刷新重放仍唯一。
- [ ] Step 3：ComfyUI/AutoDL/RunningHub实际上传、prompt/queue/history/results与video/audio输出分别适配，multi-output保存全部，不只取第一张图片；错误节点、丢失output、停止及新旧映射测试。保留现有图片ComfyUI路径。
- [ ] Step 4：批量配置模板有变量/来源列表、每任务独立状态，兄弟失败保持成功结果；串行请求从前序真实视频/抽帧结果补充引用，再冻结B，而非先冻结虚假URL。进度从真实子任务状态聚合。
- [ ] Step 5：工作流及ComfyUI脚本登记检查点A；更新真实视频执行实现和未完成项，选择性提交，证明本轮工作流为实际视频执行而非素材剪贴板导入。

## Task 8: 持久视频节点和项目归属（V01、V17、V24、S01）

**Files:** Create `src/lib/canvas/video-node-{schema,repository,service}.ts`、`src/app/api/canvas/video-nodes/route.ts`、`src/app/api/canvas/video-nodes/[id]/route.ts`、`scripts/verify-video-fusion-nodes.ts`；Modify `src/lib/db.ts`中的video reservation事务、`src/app/api/video/tasks/{route,[id]/send-to-canvas/route}.ts`、canvas历史/删除服务。

**Interfaces:** `CanvasVideoNode={id,projectKey,revision,title,x,y,width,height,config,inputs,lastTaskId,lastResultId,deletedAt}`；`listVideoNodes(actor,projectKey?)`、`saveVideoNode(actor,node,expectedRevision)`、`authorizeVideoProject(actor,key)`、`associateVideoTaskTx(client,nodeId,revision,taskId)`；`saveVideoNode`过期409。reservation新增事务回调`onReserved(client,task)`，节点关联在commit前执行，旧调用不传回调则原行为。

- [ ] Step 1：DB测试空白节点刷新、跨用户404、revision冲突409、事务失败余额/节点/任务均不变、tree/batch归属；归入本任务所属大模块检查点集中执行。

```ts
const created=await h.request<any>("a","POST","/api/canvas/video-nodes",nodePayload);
const stale=await h.request<any>("a","PATCH",`/api/canvas/video-nodes/${created.body.node.id}`,{expectedRevision:0,title:"旧窗口"});
assert.equal(stale.status,409);
const other=await h.request("b","GET",`/api/canvas/video-nodes/${created.body.node.id}`);
assert.equal(other.status,404);
```

nodePayload为本测试新建tree项目、revision0和Task1素材输入；Run `npx tsx --conditions react-server scripts/verify-video-fusion-nodes.ts`。

- [ ] Step 2：新表幂等DDL、账号+ID唯一、project索引；旧node_settings表/schema不改为视频配置。保存规范schemaJSON及revision，移动只修改坐标/尺寸，删除使用软删除以支持撤销；操作ID幂等，不重放生成。
- [ ] Step 3：项目授权查询本账号实际视频/文字/作品，生成节点ID不成为作品parent_id；result group_id或suite batch_id保留目标项目，media parentIds保留所有拥有的来源。完成任务、result、作品和结算关联采用现有幂等事务并验证不会部分成功。
- [ ] Step 4：任务列表按actor/project/node过滤，包括无作品来源；工作台send-to-canvas选择目标并写实际关联，重复发送同一目标幂等，跨项目复用明确保存副本/引用，不移动别人素材。历史撤销/恢复和节点复制重映射内部ID。
- [ ] Step 5：节点/数据库/旧设置/项目归属断言登记检查点A；更新模块记录，提交。

## Task 9: 共享提交、停止、重试与结算竞态（V15、V17、V18、S01）

**Files:** Create `src/lib/video/cancellation.ts`、`src/app/api/video/tasks/[id]/cancel/route.ts`、`scripts/verify-video-fusion-tasks.ts`；Modify `video/{service,repository,worker,types}.ts`、`src/lib/db.ts`相关事务、generate/tasks/retry/resolve routes及billing视频接线。

**Interfaces:** `submitCanvasVideo(actor,{nodeId,expectedRevision,idempotencyKey,billingConfirmation})`；`requestVideoCancellation(actor,id)`返回`{taskId,cancellationRequested,status,supplierCancellationSupported}`；public view增加公开cancel信息。旧queued/processing/needs_attention/completed/failed/cancelled兼容，取消请求不等于终态。

- [ ] Step 1：真实DB/HTTP测试重复提交、并发Worker、排队取消与提交争用、提交成功但连接断开、未知提交重试、取消不支持、失败/完成结算幂等；归入本任务所属大模块检查点集中执行。

```ts
const [one,two]=await Promise.all([submit(),submit()]);
assert.equal(one.taskId,two.taskId);
assert.equal(h.supplierCalls().filter(c=>c.phase==="create").length,1);
const balanceBefore=await h.balance("a");
await pollTwice();
assert.equal(await h.balance("a"),balanceBefore);
```

submit以同一本测试UUID调用真实POST，pollTwice驱动fixture独立Worker两轮，均定义在本测试内；Run `npx tsx --conditions react-server scripts/verify-video-fusion-tasks.ts`。

- [ ] Step 2：提交读取本账号节点revision和全部规范输入；报价/能力错误422或价格确认409在reservation前返回。HTTP/Agent/workflow都走同一入口；完整prompt/原始输入冻结，不截成1000字。
- [ ] Step 3：queued取消与领取使用同一行锁/租约，可靠未提交才退款；已提交记录cancellationRequestedAt并调用可用cancel adapter一次，确认前继续核对。无取消能力保持真实处理中，UI显示“已请求停止/后台核对”，不宣称费用已撤销。
- [ ] Step 4：Worker恢复使用冻结配置、原operationId；未知提交needs_attention只允许有证据的人工resolve。retryOf创建新任务，旧输入/能力展示，当前报价/模型确认后重新冻结；旧任务/旧结果只读。计费保留用户人工规则和冻结版本，无额外默认媒体处理收费。
- [ ] Step 5：后台大模块完成，执行检查点A的全部专项脚本及相关配置/数据库验收一次；断线/重启后提交1次、settle/refund1次，失败只重跑受影响项；选择性提交，第三次主线同步点。

## Task 10: 真实视频核验和安全媒体处理（V19—V23、S01）

**Files:** Create `src/lib/video/{media,media-jobs}.ts`、`src/app/api/video/media-jobs/route.ts`、`src/app/api/video/media-jobs/[id]/route.ts`、`scripts/video-media-worker.mjs`、`scripts/verify-video-fusion-media.ts`；Modify `video/{service,result-download}.ts`、extract route、Dockerfile、docker-compose.yml、固定镜像发布/回滚脚本。

**Interfaces:** `probeVideo(asset):Promise<{durationSeconds,width,height,videoCodec,audioCodecs}>`；`MediaJobRequest={action:'frame'|'extract_audio'|'separate'|'trim'|'concat'|'ffmpeg'|'ffprobe',inputs:string[],outputs:string[],timestamp?,start?,end?,args?:string[]}`；`createMediaJob(actor,request):{jobId}`、`getMediaJob(actor,id)`、`cancelMediaJob(actor,id)`。引用为已拥有node/artwork/storage身份，FFmpeg参数使用`asset:0`/`output:0`等虚拟路径，App解析后传工作目录文件。

- [ ] Step 1：测试可播放视频流/精确duration、首/当前/尾帧、音轨/分离/裁剪/拼接/多输出；错误MIME/损坏/Content-Length偏小/断流、越界时间/无音轨/其他账号及取消；归入本任务所属大模块检查点集中执行。

```ts
assert.equal(probe.videoCodec,"h264"); assert.equal(probe.width,1280);
assert.ok(Math.abs(trimmed.durationSeconds-2)<0.12);
assert.equal(separated.video.audioCodecs.length,0);
assert.ok(separated.audio.durationSeconds>3.9);
assert.equal((await h.request("b","GET",`/api/video/media-jobs/${jobId}`)).status,404);
```

probe/trimmed/separated由本测试实际媒体输出FFprobe取得；Run `npx tsx --conditions react-server scripts/verify-video-fusion-media.ts`。

- [ ] Step 2：结果读取器按实际流长度限额，声明长度只辅助，异常释放reader；FFprobe确认真实video流后成功结算，尺寸/时长入作品/结果元数据。上游已成功但落存储失败保持可恢复证据/needs_attention，不盲退款；owner在私有媒体写入时显式绑定。
- [ ] Step 3：实现受控内部media-worker服务：固定同源码镜像、独立执行进程、只挂本任务媒体处理临时目录，不挂DB/供应商/R2/正式媒体/配置。父进程认证内网job请求；FFmpeg子进程使用清理后的环境及每job独立非root UID，目录0700、只读输入/唯一输出，readonly根FS及无外部网络读取协议，阻断/proc其他进程/跨job文件。App保有账号鉴权、正式存储及DB，worker只处理复制进去的授权字节。新服务仅内部端口，不开放公网，不挂Docker socket。
- [ ] Step 4：媒体job支持取消/真实进度/错误，参数数组不经过shell。裁剪验证`0<=start<end<=duration`，重新编码H.264/AAC+faststart；分离保留原视频并输出音轨和静音视频。原生FFmpeg支持多输入/多输出、滤镜/图片序列/HLS/DASH/拼接及FFprobe/编码器查询，App对所有输出校验并转存，不给Agent直接访问服务器文件或执行shell。输出已拥有作品和原视频血缘。
- [ ] Step 5：媒体大模块完成，执行检查点B一次：媒体脚本/内存检查，并在fixture内验证job取消杀死处理进程、临时目录清理、跨job/服务器敏感路径拒绝、原视频SHA不变。发布脚本新增media-worker候选生命周期/健康/回滚，作为本轮明确Compose变更清单；不是只改NAUMI_IMAGE。选择性提交。

## Task 11: 画布视频设置、引用及高级节点UI（V01—V11、V16）

**Files:** Create `src/components/canvas/video/{generation-node,settings-panel,reference-list,shot-editor,element-editor,camera-settings,source-attribution}.tsx`、`src/lib/video/camera.ts`、`scripts/verify-video-fusion-settings.mjs`；Modify canvas-client、globals.css及i18n字典。

**Interfaces:** `GenerationNode({node,capability,onSave,onGenerate,onCancel})`；`VideoSettingsPanel({config,capability,onChange})`；`ReferenceList({inputs,onReorder,onRoleChange,onRemove})`；`compileVideoCamera(camera):string`。所有提交用Task8/9接口；无前端provider key、无静默能力兜底。

- [ ] Step 1：Playwright测试空白新增视频节点/选择图生入口；首尾规则、文字混排编号、模型联动、音频关闭、分镜/元素/运动控制/摄影设置和390px弹层；归入本任务所属大模块检查点集中执行。

```js
await page.getByRole("button",{name:"新增视频节点"}).click();
await page.getByLabel("视频生成模式").selectOption("first_optional");
await page.getByLabel("视频描述").fill("保留动作和对白的完整片段");
await expect(page.getByTestId("video-reference-role").first()).toHaveText("尾帧");
await expect(page.getByRole("button",{name:"生成视频"})).toBeEnabled();
```

Run `node scripts/verify-video-fusion-settings.mjs`，用Task1真实fixture数据/登录态。

- [ ] Step 2：节点及项目列表合并持久video节点、文字和作品；位置/尺寸、连线、选择、多选/拖动/复制/锁定/撤销走既有画布操作，视频prompt可编辑并保留revision；面板和表单独立于canvas-client内巨型JSX。
- [ ] Step 3：引用缩略图显示role/完整顺序和每类编号，重新排序/交换首尾/移除后编译预览一致；无内容前序明确不可生成；模式匹配未知支持显示来源/无法确认。参数仅展示后台合法选项，时长换分辨率、模型换规格明确归一，不在提交时偷偷替换。
- [ ] Step 4：分镜编辑支持文字节点/时间块及总时长；元素多媒体分组、Kling运动控制朝向；摄影机/镜头/焦距/光圈编译提示词并保存/复制，关闭时不残留旧摄影文本。样式沿用Naumi主题、Dock和overlay快捷键隔离。沿已有设置/关于位置提供简洁的开源来源链接，实际吸收时保留原作者/许可标识；不添加宣传口号、长说明或遮挡操作的弹窗。
- [ ] Step 5：桌面390px表单/图片工具条/快捷键断言登记检查点C；更新实现记录，界面大模块尚未全部完成时不重复跑浏览器。选择性提交。

## Task 12: 画布任务恢复、播放器和媒体动作（V17—V24）

**Files:** Create `src/components/canvas/video/{use-video-tasks,player,media-actions,history-picker}.tsx`、`scripts/verify-video-fusion-canvas.mjs`；Modify canvas-client、video-studio-client和成果下载/复用接线。

**Interfaces:** `useCanvasVideoTasks({email,projectKey,nodes,onResults})`按Task8列表恢复；`VideoPlayer({url,metadata,onExtract,onProcess})`；UI请求Task10 job，轮询真实进度。结果合并以稳定artwork/task ID去重。

- [ ] Step 1：浏览器真实提交→刷新→Worker完成→播放；切换项目等待、两窗口同时恢复、历史重试/停止、时间轴、音量/全屏、下载/Range、三种抽帧/音轨/裁剪；归入本任务所属大模块检查点集中执行。

```js
await page.getByRole("button",{name:"生成视频"}).click();
await page.reload();
await expect(page.getByTestId("canvas-video-node").locator("video")).toBeVisible();
const playable=await page.locator("video").first().evaluate(v=>({state:v.readyState,duration:v.duration}));
if(playable.state<2||!(playable.duration>0))throw new Error("视频尚不可播放");
```

Run `node scripts/verify-video-fusion-canvas.mjs`，供应商由Task1固定成功/失败场景。

- [ ] Step 2：pending、queued、processing、needs_attention、终态使用真实task状态；本地动画只表示等待，不冒充上游百分比。刷新/Agent退出仍按原项目恢复；已删除节点的后台结果留历史，不凭旧response重新插入当前项目。
- [ ] Step 3：播放器完整时间轴/播放暂停/音量/全屏/下载；已拥有媒体请求保持私有鉴权和Range。历史选择/替换指向新素材，旧结果SHA和作品不覆盖；媒体job产物保存并加入原项目血缘，可用于下轮生成。
- [ ] Step 4：视频工作台采用同cap/请求参数，完整历史/失败详情/报价确认/重试/删除/发送目标；多次send同项目幂等，工作台未发送前不隐式进入画布。
- [ ] Step 5：恢复/播放器/媒体动作及现有媒体控件脚本登记检查点C；更新模块记录，保留跨项目回调0误挂载断言。选择性提交，第四次主线同步点。

## Task 13: Canvas Agent全视频制作工具和Skill（V12—V16、S02）

**Files:** Create `src/lib/agent/canvas-video-tools.ts`、`src/lib/video/production-prompt.ts`、`scripts/verify-video-fusion-agent.ts`、`scripts/verify-video-fusion-agent.mjs`；Modify `agent/{canvas-context,canvas,naumi-tools,harness,creative-tool-catalog}.ts`、canvas agent activity及视频Skill目录。

**Interfaces:** `createCanvasVideoTools({actor,canvas,internalRequest}):AgentTool[]`；工具`get_video_config/set_video_config/set_video_prompt/set_video_references/generate_video/get_video_task/cancel_video_task/plan_video_shot/plan_video_storyboard/extend_video/edit_video/process_video`；video上下文保存projectKey/nodeId/revision/公开视频cap/orderedInputs，image上下文原样。

- [ ] Step 1：工具行为测试查询/修改实际节点→生成→关闭SSE→Worker完成→恢复原项目；重复工具调用只一个task；续写等待A完成，错误先向用户显示；归入本任务所属大模块检查点集中执行。

```ts
const tool=createCanvasVideoTools(deps).find(t=>t.name==="get_video_config")!;
const result=await tool.execute("lookup",{nodeId});
assert.equal(result.details.projectKey,projectKey);
assert.ok(!JSON.stringify(result).includes("apiKey"));
```

deps为本fixture认证internalRequest与video上下文，nodeId/projectKey来自Task8节点；Run `npx tsx --conditions react-server scripts/verify-video-fusion-agent.ts`和`node scripts/verify-video-fusion-agent.mjs`。

- [ ] Step 2：视频工具读取当前模型/节点合法规格，使用Task8/9/10，harness准入沿用户视频意图与已有授权；视频工具不借用imageModelId或硬编码4/8/12。输出task/node/project关联与公开摘要，raw provider/凭据不可进入模型上下文。
- [ ] Step 3：融合单镜头、多镜头、剧本资产/片段、分镜拼图、续写硬切/同机位、前传/编辑restyle/partial/replace/replot、声音角色规则；完整对白保留、每片段prompt落可编辑节点。已明确授权具体阶段沿用，不每次工具调用重复询问；缺少真实素材/用户阶段选择时真实等待。模型不支持前传/编辑时明确反馈，不以文生冒充。
- [ ] Step 4：在当前canvas保存依赖/结果，不读整图无限上下文；Agent独立段可并行、连续段按前序真实产物推进，配置/引用变更更新节点，restart/session恢复不会重提。多输入多输出FFmpeg工具使用Task10虚拟文件和job状态。
- [ ] Step 5：画布/Agent大模块完成，执行检查点C一次：两agent脚本、界面/媒体/恢复及相关SSE/Harness/图片Skill回归；生成图、工具活动、小球/侧栏及390px不回退。选择性提交。

## Task 14: 在线演示站实操与上游对照（用户2026-10-13追加要求）

**Files:** Create `docs/changes/2026-10-13-canvas-video-demo-comparison.md`、`scripts/video-fusion/comparison.json`；证据截图/操作录制写本任务output，修改Naumi组件只针对确认的差异，不改上游源快照。

**Interfaces:** comparison行`{capabilityId,sourceCommit,siteUrl,observedVersion,steps,upstreamEvidence,naumiEvidence,result,limitation}`；result区分观察一致/差异/不可进入/未实测，无法获取线上版本记unknown。

- [ ] Step 1：从官方repo/主页确认站点归属及当前入口。IC固定README有`https://infinite-canvas-cpco.onrender.com`配置跳转示例，网页抓取暂返回Internal Error；不能断定是当前68b37db在线部署。TF官方README公开的是教程、插件市场及模型平台`https://api.toonflow.net/`，目前未确认公开可操作画布demo；`toonflow.ai`等同名站不能直接视为HBAI项目。
- [ ] Step 2：使用浏览器工具实际访问确认的入口，记录URL、页面/登录要求及可获取版本。按V01—V24操作新增节点、模式/规格、引用排序、首尾、分镜/元素、停止/历史及媒体动作，保存截图和步骤；不把页面200或宣传截图当操作通过。已有账号/授权可用时沿用，需要凭据的步骤记录限制并向用户索取所需信息，不能使用Naumi密钥去第三方演示站。
- [ ] Step 3：官方demo可操作的步骤使用与Naumi相同素材/设置比对。demo需付费API才能触发时，先比对可访问交互；本轮视频额度约束保持。正式视频效果仍未验收，若无可进入demo，固定上游源码在独立无正式凭据环境启动作为可操作参考，并标为本地上游实操而非在线demo通过。
- [ ] Step 4：把实操发现对应到矩阵ID，差异修复后重跑所属任务；展示语义/输入能力对齐，样式保持Naumi体系。来源版本不同的差异先核对固定快照，不盲把另一fork新增能力纳入或把真实缺口排除。

```json
{"capabilityId":"V02","observedVersion":"unknown","steps":["新增视频节点","首帧可选仅一图","检查尾帧角色"],"result":"未实测","limitation":"计划记录，执行后填实际证据"}
```

- [ ] Step 5：comparison不存在“未实测”冒充通过的行；所有可进入的线上视频操作均有截图/步骤与Naumi对应。不可进入/配额限制记录具体证据及已采用的本地上游比对。选择性提交comparison文档/清单及实际必要修复。

## Task 15: 全矩阵真实应用E2E及保护回归（V01—V24、P01—P08、S01/S02）

**Files:** Create `scripts/verify-video-fusion-e2e.mjs`、`scripts/video-fusion/coverage.json`、`docs/changes/2026-10-13-canvas-video-fusion-acceptance.md`；Modify先前各专项测试以修复实际遗漏。

**Interfaces:** coverage每ID关联source/implementation/test/scenario/API/DB/media/browser证据和状态。E2E驱动真实App/Worker/DB，不stub本站接口；supplierCalls有wire/素材读取证据，正式模型calls=0。

- [ ] Step 1：为34项逐项建立具体用例及断言，缺少某项则脚本退出非0；用户视角完整路径包含：空白文生；单图/所有首尾；混合排序；高级分镜/元素/运动；Agent单镜/分镜/连续链/编辑；批量工作流；失败/重试/取消/未知核对；真实播放/下载/抽帧/音轨/分离/裁剪/拼接；再引用；工作台发送；两账号及配置冻结。

```js
const required=[...Array.from({length:24},(_,i)=>`V${String(i+1).padStart(2,"0")}`),
 ...Array.from({length:8},(_,i)=>`P${String(i+1).padStart(2,"0")}`),"S01","S02"];
for(const id of required) {
 const row=coverage.find(x=>x.id===id);
 if(!row||row.state!=="application-e2e-passed"||!row.evidence.length)throw new Error(`未完成 ${id}`);
}
```

- [ ] Step 2：每成功场景验证实际request、素材fetch、任务/intent/供应商receipt/作品/result关联、媒体FFprobe/哈希、余额差额/结算次数；每失败验证不会假完成/重复扣退费。Docker/App/Worker重启、网页刷新、项目切换及并发窗口真实执行。协议分支测试的body断言必须先核对覆盖真实cap模式，不能只跑通万能fixture。
- [ ] Step 3：桌面1366×768、1600×1000及390×844；Win/macOS交互分支、已稳定生图/Agent/模型显示/私有R2/剪贴板/快捷键/拖动缩放回归。实体Mac/Safari未测明确记录；图片生成供应商本轮可用素材模拟回归，原有真实生图完成证据保持，不因视频测试声明新收费生图验证。
- [ ] Step 4：集中运行下列命令；先准备并验证隔离环境，任何DB测试不指向生产：

```text
node scripts/verify-video-fusion-e2e.mjs
npm run verify:video-providers
npm run verify:video-postgres
npm run verify:video-reliability
npm run verify:video-memory
npm run verify:model-config
npm run verify:model-execution
npm run verify:react19-upgrade
npx tsc --noEmit
npm run lint
git diff --check
```

`npm run build`在Task16固定Linux镜像中执行一次；此处不先做一次重复本机生产构建。若编译故障或后续产品改动，需要重新构建的是受影响候选，不能省略最终固定镜像构建。

- [ ] Step 5：记录全部结果及限制；任一矩阵项未实现/无行为证据不允许发布为“完整融合”。修复后重跑受影响测试，绿色后不无理由重复全量；选择性提交证据文档/清单，第五次主线同步点。

## Task 16: 固定候选和兼容回滚验收

**Files:** Modify `scripts/deploy-release.sh`、`scripts/staging/deploy-fixed-image.sh`及本轮必要media-worker部署配置；Create `docs/changes/2026-10-13-canvas-video-fusion-release.md`；证据包在103本任务evidence目录。

**Interfaces:** 当前运行BASE_COMMIT/IMAGE、CANDIDATE_COMMIT/IMAGE、配置/媒体/DB保护指纹、兼容DDL清单、media-worker新增Compose范围、ROLLBACK脚本及演练结果。

- [ ] Step 1：刷新origin/main/完成分支，排除四历史回滚；普通merge整合最新业务。在首次固定构建/上线之前完成整分支review：Native采用一次新上下文review，Subagent-driven采用各任务review后的整分支review，范围含所有产品/协议/媒体/数据库/部署脚本。发现问题修复并重跑受影响项，选择性提交后确认clean40位SHA。盘点构建资源，>80%/可用<10GiB只清确认无用本任务缓存；源码包及镜像SHA256留存。
- [ ] Step 2：只在103独立候选环境构建Linux固定镜像，限CPU/内存，App/Worker和media-worker使用同源码版；开启已生效NEXT_PUBLIC_MEDIA_VARIANTS构建flag。既有正式DB/媒体/配置不作为构建输入，fixture不复用正式挂载。
- [ ] Step 3：新DDL只增加字段/表，不破坏旧镜像读写；在独立恢复的测试副本演练旧镜像及新镜像切换，旧任务和私有媒体可读且无重复执行。包含新增media-worker停止/复用/兼容处理，旧镜像不接无法处理的新任务；回代码不回灌DB/媒体。
- [ ] Step 4：本轮rollback在`--check`下检查候选身份、材料、配置基线及任务状态，不修改运行环境；真实演练在隔离副本。用户103直接发布授权保持，具体发布前基线仍需持锁重新核对。
- [ ] Step 5：所有材料和演练通过，记下构建/实际SOURCE_COMMIT/同版镜像标签/固定回滚引用；不把构建通过当作已发布。提交代码及说明。

## Task 17: 103发布及真实线上受影响功能验收

**Files:** 本轮固定release/backup/rollback/acceptance材料；Modify迁移README与AGENT_COLLABORATION最新状态。

**Interfaces:** `scripts/deploy-release.sh --staging-fixed-image`既有流程扩展media-worker，Naumi/Hub双锁从新基线读到最终健康/功能验收全程持有。运行变化或同事先发布即停止切换并重新整合。

- [ ] Step 1：锁内记录最新App/Worker/media-worker/版号、活跃图/视频/Agent任务与配置指纹；保护生产账号、模型/价格/草稿/元数据、媒体、R2及ComfyUI。备份env/Compose/可读DB/media清单，验证回滚引用和备份可读。
- [ ] Step 2：检查源main/候选固定和运行基线无变化；先完成候选旁路健康及所需服务预热，再按当前用户允许的103发布条件切换。若连续性条件有变化，按RELEASE_RUNBOOK落实可验证切流/排空，不能先停在线App或把直接重建描述成无感。
- [ ] Step 3：核验公网真实/api/health、/api/version、同版App/Worker及内部media-worker健康，DB容器/生产挂载连续；原生账号视频目录/配置节点/历史/播放/私有素材/媒体处理和生图/Agent页面桌面390px。收费视频提交不调用，模拟E2E只在隔离服务；未配置真实视频通道时明确标未真实出片。
- [ ] Step 4：保护指纹/媒体原件/账号/积分配置前后对照，真实线上测试新增的本任务媒体单独列出。发布失败按本轮兼容rollback切回，保留诊断；不能声称未成功版本已上线。
- [ ] Step 5：维护计数达到3后持同锁盘点并清允许范围缓存/失败候选，保留当前+近两成功镜像/7天备份/在用任务与他人目录。记录释放字节/保留版本/计数归零，删除本轮临时凭据副本，释放两锁并核验。

## Task 18: 全目标完成审计和交接

**Files:** 覆盖/验收/发布文档、迁移README、协作记录及已实现代码。

**Interfaces:** 交接包含业务SHA/镜像/实际版本、34项source→implementation→行为证据、演示站或本地上游比较、供应商模拟范围、真实供应商未测、回滚命令/材料及空间维护计数。

- [ ] Step 1：逐条重新读spec和coverage，检查V/P/S各ID实现及实际测试，不只读绿色状态。检查请求/任务/媒体/账单/截图的关联是真实，协议分支无漏项，源码/线上版本一致。
- [ ] Step 2：确认设计所有额外约束都有证据：false/0/omit、未知能力、冻结/重试、父级/项目、媒体归属/Range、取消竞态、FFmpeg原生多输出、工作流实际视频、演示对比、图片与ComfyUI保护、版权/来源。
- [ ] Step 3：核验Task16上线前完整分支review及所有修复已在实际候选中；后续若产品/部署代码改变，再审对应改动并更新候选。每个review结论引用实际代码/行为，不用review文本替代运行证据，不到上线后才第一次review。
- [ ] Step 4：合并前最后fetch/整合，普通推main及任务分支，确保持久状态/完整交接，源码文档更新不另发布镜像。需要的托管worktree继续保留，无用副本用archive_worktree保留快照再归档。
- [ ] Step 5：只有全部实现、模拟应用E2E、线上交付、回滚及保护证据满足完整目标后才标complete。真实供应商质量/额度仍按用户允许的模拟边界明确未测；任何实际功能/E2E/发布缺口不缩小目标为已做部分。

## 覆盖映射与计划自检

| 范围 | 负责任务 |
|---|---|
| V01 | 8/11/12/15 |
| V02—V04 | 2/4/11/15 |
| V05—V07 | 2/3/4/5/6/11/15 |
| V08 | 11/15 |
| V09—V11 | 2/5/6/11/15 |
| V12 | 13/15 |
| V13 | 7/9/13/15 |
| V14/V15 | 9/13/15 |
| V16 | 7/11/13/15 |
| V17/V18 | 8/9/12/15 |
| V19—V23 | 1/10/12/13/15 |
| V24 | 8/12/15 |
| P01—P04 | 4/5/15 |
| P05 | 4/7/15 |
| P06—P08 | 3/4/6/15 |
| S01 | 1/2/3/4/8/9/10/15/16/17 |
| S02 | 11/12/13/15/17 |
| 在线演示站追加比对 | 14/15/18 |
| 发布/回滚/空间/交接 | 16/17/18 |

自检结论：34项及追加演示比对都有负责任务；接口类型/名字在上游任务定义；5项Review Focus各有行为测试；未将素材/协议/当前图像证明冒充新视频E2E。计划阶段没有执行测试或创建媒体/产品代码；此文档中的测试代码为执行时使用的具体断言。

执行建议：Native，由当前会话顺序完成共享契约和接线，按A/B/C/D集中验收，固定构建/上线前做一次新上下文完整分支review。此功能的能力、节点、冻结和计费接口紧密相连，这种方式能保持同一上下文并减少跨任务接口偏差，符合用户敏捷与减少高频测试的约定。用户也可选择Subagent-driven逐任务实现及独立review；功能测试仍按大模块集中，无论方式都必须完成全部18项与34项矩阵，不改变范围。

