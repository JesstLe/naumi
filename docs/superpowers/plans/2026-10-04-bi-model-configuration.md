# BI 模型与路由配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有私有 BI 中通过表单管理供应商、真实模型、对外映射、用途绑定和生图混合路由，让发布后的配置实际控制新任务执行，并保证旧任务、凭据和账务可恢复。

**Architecture:** 沿用 PostgreSQL 保存结构化草稿、凭据与发布状态，发布时生成不可变内部快照。Naumi 按版本解析模型与用途；独立 Router 通过仅内网开放的管理接口准备和激活版本，已接受的任务保留原版本、供应商和凭据引用。价格与成本只引用同事的统一计费模块，不增加第二份金额表。

**Tech Stack:** 现有 Next.js 14、TypeScript、React、pg、Zod、PostgreSQL 16；现有 Go Router、bbolt 持久执行状态；Node crypto 和 Go crypto；现有固定镜像发布与回滚流程。无需新增配置中心服务或后台 JSON 编辑器。

**Spec:** `docs/superpowers/specs/2026-10-04-bi-model-configuration-design.md`。2026-10-04 用户已批准数据库配置中心、BI 表单管理和版本发布方案。本计划待审阅，建议由当前会话连续执行。

## Global Constraints

- 用户界面全部通过表单操作，不增加高级 JSON 编辑器；JSONB 仅用于内部快照和受限规则字段。
- 工作在 `codex/bi-model-configuration` 的独立工作目录，已同步 `58ef509`；不包含同事尚未提交的改动。最终集成同步其已验收计费提交。
- Router 文件路径以 `Router:` 表示 `JesstLe/naumi-router` 正式源码仓库；2026-10-04 已读取 main `ce399b9`、线上 `849b016`，实施前再次核对分支和线上版本，保留全部已发布行为。
- 新增已支持协议的供应商、模型或候选组合无需部署；新协议需要适配器。配置不能执行任意脚本。
- 当前 5K 后处理不能标为供应商原生 5K；原生能力、平台放大、请求质量和实际质量分别记录。
- 供应商密钥单独加密、不回显、不写日志和仓库；历史凭据引用不可覆盖或在有在途任务时删除。
- BYOK 保持账户私有作用域与独立信任边界；用户填入 Router 别名不能取得平台持久任务恢复权限。
- 同事模块唯一负责用户售价、预占、结算、赠送、商品、有效期与上游成本配置。
- 模拟只计算候选，不发付费生成请求；结果未知保留预占并核查，不通过重新生成修复配置同步。
- 沿用 AGENTS.md 的直接发布授权：固定版本镜像、先备份、准备协调回滚、验证真实版本与受影响功能，保留数据库、媒体和生产配置。

## Review Focus

1. 配置发布与当前版本指针更新之间断网：显示结果未知，同一操作编号核对恢复，新任务不能使用未准备的版本（Task 3）。
2. 旧供应商被禁用、密钥被轮换后恢复已接受任务：查询原任务 ID，不重新生成，也不换成新账户查询（Task 2、4）。
3. 后台改价或改成本与模型发布同时发生：冻结两个版本，只引用一份成本，未知或积分成本不能伪装成可比较货币成本（Task 3、4）。
4. 多个历史配置版本同时执行：同一供应商账户的并发与冷却状态合并，不因每版本新建限额而超量（Task 2）。
5. 文字、视频、编辑能力或缺省用途不匹配：草稿保留并明确校验错误；普通用户目录、响应与缓存不能泄露内部配置（Task 1、4、5）。

## Task 1: PostgreSQL 注册表、草稿、凭据与现行配置导入

**Files:** Create `src/lib/model-config/{types,schema,repository,credentials,bootstrap,bindings,fixture}.ts`、`scripts/verify-model-config.ts`；Modify package.json 仅增加 `verify:model-config`。不要修改同事正在改的 db.ts；迁移通过新模块调用 `ensureSchema()` 后独立运行。

**Interfaces:**

```ts
type Modality = "image" | "text" | "video";
type ModelSnapshot = {version:number; digest:string; config:ModelConfig};
type ModelDraft = {id:string; revision:number; basedOnVersion:number; config:ModelConfig};
type ModelFacts = {
  task:"draft"|"product"|"detail"|"layout"; quality:string; resolution:string;
  needsEdit:boolean; preserveIdentity:boolean; needsText:boolean; nativeResolution:boolean; references:number;
};
interface ModelConfigRepository {
  current():Promise<ModelSnapshot>;
  byVersion(version:number):Promise<ModelSnapshot>;
  draft(actor:string):Promise<ModelDraft>;
  saveDraft(input:{id:string;expectedRevision:number;config:ModelConfig;actor:string}):Promise<ModelDraft>;
  stage(input:{id:string;draftId:string;expectedRevision:number;expectedVersion:number;actor:string;reason:string}):Promise<ModelPublication>;
  publication(id:string):Promise<ModelPublication>;
  history(limit:number):Promise<ModelVersionSummary[]>;
  markApplied(id:string,digest:string):Promise<ModelSnapshot>;
}
```

`ModelConfig` 使用设计文档的 providers/upstreamModels/publicModels/pools/bindings 合同。补充直接目标 `{type:"upstream",id:string}`；pool 只允许 image。能力与规则用严格对象枚举，不允许任意请求头、脚本或覆盖任务/账务字段。`ModelPublication` 为 `{id,version,digest,phase,errorCode?}`，phase 为 `staged|preparing|activating|applied|failed|unknown`。版本概要只返回版本、操作者、原因、摘要、阶段和时间。

- [ ] **Step 1: 创建隔离 fixture 和失败测试。** `createModelFixture()` 校验 `NAUMI_VERIFY_ISOLATED_DB=1` 及 DATABASE_URL 主机为 127.0.0.1，创建 UUID 前缀专用测试 schema，通过 pool 的 search_path 隔离，返回 `{repo,config,sql,cleanup}`。有效 config 由下列最小组合组成：provider `p1` 使用 `openai-images`、地址 `http://127.0.0.1:<mockPort>/v1`、测试凭据引用；真实模型 `u1` 生成/编辑、medium/high、原生 1K/2K、rank3；对外模型 `image-a` 直连 u1；`image.generate` 和 `image.edit` 绑定 image-a。模拟服务器由 node:http 创建，仅 fixture 允许该 loopback 地址。

```ts
const f=await createModelFixture();
try {
  const old=await f.repo.current(); const draft=await f.repo.draft("admin@example.test");
  const renamed=structuredClone(draft.config); renamed.publicModels[0].label="新名称";
  await f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:renamed,actor:"admin@example.test"});
  assert.equal((await f.repo.current()).digest,old.digest,"保存草稿不影响执行");
  await assert.rejects(f.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:renamed,actor:"admin@example.test"}),/草稿已更新/);
  const broken=structuredClone(renamed); broken.publicModels[0].target={type:"upstream",id:"missing"};
  assert.throws(()=>validateModelConfig(broken),/不存在/);
} finally {await f.cleanup();}
```

- [ ] **Step 2: 运行** `npm run verify:model-config`，先看到缺失实现导致失败。随后建表和实现仓库：

```sql
CREATE TABLE app_model_drafts(id uuid PRIMARY KEY,revision bigint NOT NULL,based_on_version bigint NOT NULL,actor text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app_model_credentials(id uuid PRIMARY KEY,provider_id text NOT NULL,key_enc text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app_model_config_versions(version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,operation_id uuid UNIQUE NOT NULL,actor text NOT NULL,reason text NOT NULL,config jsonb NOT NULL,digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app_model_config_state(singleton boolean PRIMARY KEY CHECK(singleton),active_version bigint REFERENCES app_model_config_versions(version));
CREATE TABLE app_model_publications(id uuid PRIMARY KEY,version bigint NOT NULL REFERENCES app_model_config_versions(version),expected_version bigint NOT NULL,request_fingerprint text NOT NULL,phase text NOT NULL,error_code text,updated_at timestamptz NOT NULL DEFAULT now());
```

草稿结构化表为 `app_model_providers`、`app_model_upstreams`、`app_model_public_models`、`app_model_pools`、`app_model_candidates`、`app_model_rules`、`app_model_bindings`：均包含 draft_id FK 和各自稳定 id，复合主键 `(draft_id,id)`；候选用 `(draft_id,pool_id,upstream_id)` 主键，引用相同草稿内的 pool 与 upstream；绑定引用 public_model。规则条件和受限参数映射可用 JSONB，名称、协议、启停、端点、凭据引用、目标类型等为明确列。读取草稿组装 ModelConfig；保存先严格校验，在一事务内锁草稿、核对 revision、按依赖顺序更新全部子表再递增 revision。任何失败全部回滚。

- [ ] **Step 3: 实现验证与凭据。** 供应商上限100、真实模型600、对外模型200、pool100、规则总数1000、候选每池50；完整序列化配置≤512KiB；ID 为 `[A-Za-z0-9][A-Za-z0-9._:-]{0,99}`；名字≤100字符；超时1000..900000ms，并发1..256。协议只允许已实现协议；引用存在、默认绑定能力匹配、启用对象有凭据。图片质量和分辨率使用现有枚举；规则只允许设计规定条件。reject URL 用户名/密码/query/hash/metadata 地址，禁止跳转；内网端点需服务端允许列表。使用现有 RSA 解密和 AES-GCM 落库，返回 `{id,providerId,configured:true}`，不返回密文/指纹/密钥片段。provider_ref轮换创建新 UUID，旧行不修改。

- [ ] **Step 4: 导入现行配置。** `bootstrapModelConfig()` 读取现有主图设置、Flow、文字默认/别名/白名单、视频配置，导入稳定 ID 和凭据引用，保留现有默认值与适配器行为。Router 只读导入现行 route/provider/policy；无法识别的能力标记 unverified，并保持现行兼容调用，不可虚构能力后自动启用新池。bootstrap 使用 advisory lock 一次初始化 active pointer；不执行供应商生成、不改账务。无数据库演示保持旧路径；尚未完成首启配置时继续首启流程，不初始化残缺注册表。已完成配置的生产环境初始化失败明确503。

- [ ] **Step 5: 添加并运行测试**：所有重复 ID、错模态、无有效默认、无凭据、视频绑图片、pool 递归、URL token/metadata、并发草稿冲突、账务成本不进入公开 config、迁移幂等、初始化保留当前默认。为 fixture 测试专用凭据值设置唯一 marker，断言返回/日志无该 marker。测试通过后提交 `feat: store versioned model registry in PostgreSQL`。

## Task 2: Router 版本存储、专用管理接口与旧任务恢复

**Files:** Router: Create `internal/configuration/{types,store,credentials,runtime}.go`、`internal/api/configuration.go`、相应 `_test.go`；Modify `internal/api/{server,execution}.go`、`internal/domain/image.go`、`internal/execution/store.go`、`internal/routing/{engine,health}.go`、`cmd/server/main.go`；补充配置示例与内部管理代理示例。不改 New API 的收款/计费功能。

**Interfaces:**

```go
type PreparedConfig struct { Digest string; ModelVersion uint64; BillingVersion uint64; Config Projection; Credentials []SealedCredential }
type RuntimeSnapshot struct { Digest string; Engine *routing.Engine; Providers provider.Registry }
func (m *Manager) Prepare(input PreparedConfig) error
func (m *Manager) Activate(id, expectedDigest, digest string) error
func (m *Manager) ByDigest(digest string) (*RuntimeSnapshot,error)
func (m *Manager) Status(id string) (PublicationStatus,error)
```

`Projection` 包含 image routes、public aliases及其候选/策略/约束、provider配置与凭据引用；不包含用户售价。`SealedCredential` 为 `{ref,providerID,ciphertext}`；ciphertext 使用独立 `MODEL_CONFIG_ENVELOPE_SECRET` 的 AES-256-GCM，seal/open采用相同明确 envelope `{iv,tag,ct}` base64格式，不复用用户供应商 token 或账务 secret。Go 仅在服务端运行时解密；状态文件仅持久化密文，权限0600。生成请求新增 `naumi.config_digest`，为服务端准备的64位hex摘要；旧无摘要请求沿用 legacy runtime，不能因读取 active 指针破坏旧恢复。

- [ ] **Step 1: 写失败测试。** Go 测试在 `t.TempDir()` 中建立 Manager/bbolt、`httptest.NewServer` 两个模拟供应商和独立管理监听器。模拟供应商原子计数 create/poll，返回稳定 task ID。测试 `prepare` 的普通生成 token 必须401，正确管理 token 可准备、激活、重复同 ID 不重复写入；同 ID不同摘要409。管理监听器与生成 Handler 分开，管理 token 长度≥32且不同于生成 token；未配置管理密钥时管理服务不开启。

```go
func TestConfigSwapKeepsAcceptedTask(t *testing.T) {
  f := newConfigurationFixture(t) // 同文件定义：temp store、两个httptest供应商、两套准备配置
  f.PrepareAndActivate("first", f.V1)
  id := f.StartAcceptedOperation(f.V1.Digest)
  f.PrepareAndActivate("second", f.V2) // V2禁用原供应商，使用新凭据引用
  f.ResumeOperation(id)
  if f.CreateCountOld()!=1 || f.CreateCountNew()!=0 {t.Fatal("accepted operation was resubmitted")}
  if f.PollCredentialRef()!=f.V1.CredentialRef {t.Fatal("original credential was not retained")}
}
```

- [ ] **Step 2: 运行** `go test ./internal/configuration ./internal/api` 观察失败；实现原子持久准备、幂等激活、摘要校验与状态读取。接口为 `POST /internal/config/prepare`、`POST /internal/config/activate`、`GET /internal/config/publications/{id}`、`POST /internal/config/simulate`、`GET /internal/config/legacy`。legacy仅返回去密钥后的注册表，凭据导入通过独立密文接口；严格body大小512KiB、拒绝未知字段，错误只返回code及安全字段路径。

- [ ] **Step 3: 绑定执行版本。** 新 operation 在接受前存 digest，指纹包含该摘要；已存在 operation 读取其原 digest，不覆盖旧记录。持久化候选、供应商ref、credential_ref，provider Registry 按历史 digest构建；未知提交只查询原供应商，fallback仅沿已冻结候选且 `provider.CanFallback` 明确确认安全。legacy operation保持原身份检查；原密钥确实不可用时返回恢复待核查，不自动切账户。外部 POST/body中的未知 config_digest拒绝，不回退active。

- [ ] **Step 4: 共享容量与真实路由配置。** 从配置读取公开 aliases 和约束，移除四种别名的固定识别限制；保留现有quality、native4K、参考图、编辑、文字、主体能力过滤和price矩阵。`SharedHealth` 以实际 provider账户/endpoint身份作为key，历史snapshot共享同一限额与冷却；变更上限不使已占用名额消失，多个有效版本的安全上限取最严格值直到旧引用结束。模拟只读，不 Acquire，不更新健康，不调用供应商。

- [ ] **Step 5: 补齐测试并提交。** 覆盖旧记录迁移、重启、轮换/禁用、错误密文、unknown不fallback、无任务ID不重提、跨版本并发limit2只允许总计2、新自定义alias、规则未匹配、无合格候选、每质量×原生尺寸/编辑过滤。运行 `go test -race ./...`、`go vet ./...` 及现有配置验证，提交 `feat: manage immutable router configurations privately`。

## Task 3: Naumi 发布协调、成本引用与只读模拟

**Files:** Create `src/lib/model-config/{runtime,router-client,projection,coordinator,access}.ts`；Create `src/app/api/admin/bi/model-config/{route.ts,draft/route.ts,validate/route.ts,simulate/route.ts,versions/route.ts,credentials/route.ts}`；Create `scripts/verify-model-publication.ts`；Modify package.json仅追加命令。使用 Task 1 schema增加 Router投影表，不改计费版本存储。

**Interfaces:**

```ts
type RoutingSimulation={eligible:{upstreamId:string;providerId:string;rank:number}[];excluded:{upstreamId:string;codes:string[]}[];modelVersion:number;billingVersion:number};
type RouterProjection={digest:string;modelVersion:number;billingVersion:number;payload:unknown};
interface ModelRuntime {
  current():Promise<ModelSnapshot>; byVersion(version:number):Promise<ModelSnapshot>;
  publicCatalog(modality:Modality):Promise<{version:number;models:PublicModelSummary[];bindings:Record<string,string>}>;
  prepareExecution(input:{snapshot:ModelSnapshot;billing:ConfigSnapshot}):Promise<RouterProjection>;
  simulate(input:{draftId:string;facts:ModelFacts;publicModelId:string}):Promise<RoutingSimulation>;
  publish(input:{id:string;draftId:string;expectedRevision:number;expectedVersion:number;reason:string;actor:string}):Promise<ModelPublication>;
  restore(input:{id:string;targetVersion:number;expectedVersion:number;reason:string;actor:string}):Promise<ModelPublication>;
}
```

`ConfigSnapshot` 直接 import同事 billing/types。`PublicModelSummary` 只含对外id、label、modality、可用操作和供用户选择的尺寸/质量；不包含protocol、upstreamModel、providerId、costRef、endpoint、候选或credentialRef。

- [ ] **Step 1: 用 Task 1 fixture 写失败测试。** `FakeRouterControl` 是本文件定义的管理模拟HTTP server，只支持prepare/activate/status，按标志在“已激活但响应断开”时destroy socket，计数管理调用，保存id/digest；没有生成路由。验证恢复调用与配置指针：

```ts
const p=await f.runtime.publish({id,draftId:d.id,expectedRevision:d.revision,expectedVersion:old.version,reason:"发布验收",actor});
assert.equal(p.phase,"unknown"); assert.equal((await f.repo.current()).version,old.version);
f.router.disconnectAfterActivate=false;
const recovered=await f.runtime.publish({id,draftId:d.id,expectedRevision:d.revision,expectedVersion:old.version,reason:"发布验收",actor});
assert.equal(recovered.phase,"applied"); assert.equal(f.router.publicationCount(id),1);
assert.equal(f.router.generationRequests,0);
```

- [ ] **Step 2: 实现发布持久状态。** 用PG advisory锁与版本compare staging；request_fingerprint使用HMAC，重试需同actor/参数；外部HTTP不持有长数据库事务。准备成功核摘要→激活Router→核状态→短事务CAS active pointer并记录访问审计。阶段持久化，状态未知保留，重试先查询已有状态。存在未决发布时拒绝另一个发布409，保留其草稿；不能跳过未决事务导致两套active指针。恢复历史也创建新版本与新审计。

- [ ] **Step 3: 编译成本投影。** `app_model_router_projections(model_version bigint,billing_version bigint,digest text,phase text,PRIMARY KEY(model_version,billing_version))` 缓存已准备的不可变组合；模型snapshot引用billing costs，只从ConfigSnapshot取得rate。priority池允许未知成本并标未记录；lowest-cost池要求每个有效候选有同一基准可比较货币估计，credits成本拒绝。USD按该rate既有cnyPerUnitMicros转为整数CNY微元、CNY直接用；不猜汇率、不用浮点金额。Router新成本字段携带currency与amountMicros，legacy USD继续原策略，不能把CNY填入现有USD字段。数量、质量、尺寸、generate/edit匹配成本引用，缺项明确错误。

- [ ] **Step 4: 同步计费版本。** `prepareExecution` 输入一次读取的模型和计费快照，按二元版本键prepare Router projection，不读取后来的current。计费改成本后新任务得到新组合；旧任务保留旧组合。配置发布更新模型active，投影仅prepare，不激活改变用户任务默认。prepare不可用返回503和重试指引，付费调用尚未开始。多实例去重与两次断网恢复均测，不能把成本数值重新输入模型表单。

- [ ] **Step 5: 管理API和测试。** 复用biAuthorize、sameSiteBiMutation、private/no-store headers；GET current/history、PUT draft、POSTvalidate/simulate/publish/restore/credentials严格参数；正文不记录。只有服务端配置能选Router管理URL，浏览器不能指定任意控制地址。测匿名普通伪造过期404、跨站403、非法400、并发409、重放不重复、数据库日志失败回滚、公开脱敏、cost-only变化及模拟零供应商请求。通过后提交 `feat: publish and simulate model configurations safely`。

## Task 4: 图片、文字/视觉、视频执行统一引用配置与快照

**Files:** Create `src/lib/model-config/{execution,clients}.ts`、`scripts/verify-model-execution.ts`；Modify `src/lib/{image-model-catalog,image-gateway,durable-image-jobs,image-edit,text-models,new-api-image,image-quality,image-quality-request,settings,openai-base}.ts`、`src/lib/video/{service,types,capabilities}.ts`、`src/lib/video/providers/{config,adapter,openai-videos,direct}.ts`；Modify `src/app/api/config/route.ts`、`src/app/api/text-models/route.ts`、`src/app/api/video/catalog/route.ts`、`src/app/api/generate-image/route.ts`、suite/aplus与画布任务执行入口；按扫描补齐 Agent、视觉、OCR、标题、竞品等实际调用文件。计费审计改动与同事已提交版本集中集成。

**Interfaces:**

```ts
type ExecutionModel={modelVersion:number;billingVersion:number;publicModelId:string;modality:Modality;target:{type:"upstream"|"pool";id:string};credentialRef?:string;routerDigest?:string};
async function resolveExecutionModel(input:{binding:string;requestedModelId?:string;snapshot:ModelSnapshot;billing:ConfigSnapshot;facts:ModelFacts;email:string}):Promise<ExecutionModel>;
async function withExecutionModel<T>(model:ExecutionModel,run:()=>Promise<T>):Promise<T>;
async function clientForExecution(model:ExecutionModel):Promise<{client:OpenAI;wireModel:string}>;
```

ExecutionModel可存任务JSON，不含密钥。AsyncLocalStorage只缓存该操作固定解析结果；没有上下文的老任务走显式legacy compatibility，不把任意别名当持久Router。新的调用必须传固定执行model，不能在分片/恢复时再次读取current。

- [ ] **Step 1: 写失败测试。** 本地HTTP供应商记录model、quality、endpoint和凭据标记（标记只在fixture RAM计数，不打印）；创建v1任务后发布v2并轮换secret，恢复v1、创建v2：

```ts
const oldTask=await f.imageTask.create({modelId:"image-a",quality:"high",resolution:"2K"});
await f.publishReplacement({wireModel:"image-b",credentialRef:f.newCredential});
await f.imageTask.resume(oldTask.id);
assert.deepEqual(f.calls.map(x=>x.wireModel),["image-a"]);
await f.imageTask.createAndComplete({modelId:"image-a",quality:"high",resolution:"2K"});
assert.equal(f.calls.at(-1)!.wireModel,"image-b");
assert.equal((await f.readFrozenModel(oldTask.id)).modelVersion,oldTask.modelVersion);
```

`imageTask` 在fixture文件中以真实 generate-image/任务repo建立；HTTP返回有效PNG fixture，对未知请求返回202/断线，由测试注入并验证不重新调用create。suite/aplus测试使用真实任务服务，不复制生产计费公式。

- [ ] **Step 2: 图片目录与执行同时改。** 主目录从publicCatalog生成，合并账户自己的BYOK；默认来自bindings。修改固定Gateway正则为冻结目标type/capability判断；兼容旧四个alias的legacy上下文。Flow调用仍用其协议，真实modelId来自配置；编辑/普通工具使用clientForExecution。每张fanout保留同version且稳定operation ID；A+审核、画布队列、BYOK失败兜底均持久化平台兜底配置，恢复时不重新选current。已有gatewayIdentity绑定旧端点/密钥的记录保持原检查，版本任务改为不可变credentialRef身份。把默认原生quality和模型能力一起读取，公开config按当前默认模型给出能力摘要，逐模型能力随目录返回；现有image-quality退档/后处理和账务合同保留，不以全局环境开关假装所有模型支持相同参数。

- [ ] **Step 3: 文字与视觉绑定。** `requestedTextModel` 改为服务端解析注册表的async入口；逐个改调用者await，不只更新目录。Agent桥接、竞品、suite/aplus、OCR兜底、标题与验证图的model/endpoint/key均来自同一ExecutionModel，视觉输入需capabilities.vision，禁止静默走文字模型。供应商不支持该输入时返回明确错误，配置保持可修改。

- [ ] **Step 4: 视频与容量。** 现有8协议适配器保留，provider目录/模型能力和配置工厂由注册表生成；旧函数同步→async改造所有调用者。新task parameters加入ExecutionModel/credentialRef；poll/fetchResult使用byVersion与原ref，不读取新的默认或新密钥。已有providerOptions/idempotency策略冻结规则保持，新版本不能改变旧任务POST幂等策略。视频状态未知只轮询或人工核查。文字/视频仅直连映射，表单不能创建不支持的跨模态混合池。

- [ ] **Step 5: 与计费快照和BI衔接。** 一次拿billing与model快照，客户端过期模型版本需409并保留输入；业务操作账务仍由billing.service执行，不新增扣费。BI记录publicModelId/modelVersion/billingVersion/routerDigest/provider/actual wire model/executed quality；成本回执缺失显示估计或未记录。实际执行provider改变不让固定价重算；cost-plus和授权上限遵守已冻结的计费合同，不能在fallback后超授权。

- [ ] **Step 6: 完成并提交。** 覆盖真实模拟供应商的图片/编辑/13工具/画布、suite/aplus审核后变更、Agent文字/视觉、视频轮询、native与BYOK、所有旧任务格式、cost-only更新、未知不重复POST、不同版本并发、质量尺寸矩阵。运行新增model-execution及原有credit/global-image-quality/image-gateway、video-providers、video-postgres、private-bi/bi-management验证，通过后提交 `refactor: execute registered models by frozen configuration`。

## Task 5: BI 管理表单、发布状态和可追踪的模型组成

**Files:** Create `src/components/admin/model-config/{manager,provider-editor,upstream-editor,public-model-editor,pool-editor,binding-editor,publication-panel}.tsx`、`manager.module.css`；Create `scripts/model-config-ui.config.ts`、`scripts/model-config-ui.spec.ts`；Modify `src/components/admin/bi/dashboard.tsx`仅集成菜单与独立组件；适当扩展已有BI审计列。与同事最终成本审计改动按最新提交合并。

**Interfaces:** `ModelConfigManager` 无后台JSON输入，消费管理API的 `{snapshot,draft,publications,costKeys}`；局部表单更新ModelConfig对象，保存发送expectedRevision，发布发送draftId/revision/expectedVersion/id/reason；提交相同操作id不重复发布。`costKeys`仅管理员读取当前billing costs的ID与单位/来源，用选择器引用，不出现第二套金额编辑。

- [ ] **Step 1: 写UI失败用例。** fixture使用独立DB、本地原生管理员与普通账户，供应商为localhost模拟；通过已有登录cookie fixture机制建立会话，不使用生产凭据。测试：

```ts
await page.goto("/admin/bi");
await page.getByRole("button",{name:"模型与路由配置",exact:true}).click();
await page.getByRole("button",{name:"新增模型",exact:true}).click();
await page.getByLabel("上游模型标识").fill("fixture-new-image");
await page.getByLabel("对外名称").fill("验收图片模型");
await page.getByRole("button",{name:"保存草稿",exact:true}).click();
await expect(page.getByText("草稿已保存，当前执行配置未改变",{exact:true})).toBeVisible();
await page.getByRole("button",{name:"查看发布差异",exact:true}).click();
await page.getByLabel("发布原因").fill("界面验收新增模型");
await page.getByRole("button",{name:"发布配置",exact:true}).click();
await expect(page.getByRole("status")).toContainText("已生效");
```

完整模型输入需在用例中选择现有fixture供应商、模态image、目标model、能力等必填字段，不依赖未知默认值。跨站/普通账户由API测试覆盖，UI普通入口404。

- [ ] **Step 2: 沿用BI视觉实现。** 深蓝侧栏 `#19324c`、蓝色交互 `#2563eb`、页面 `#f3f6fb`、白色表单、正文 `#1e293b`、边界 `#dbe3ee`；沿用现有中文无衬线字体与focus样式。主区为分类列表与详情编辑，候选组成用展开列表而非重复指标卡。窄屏抽屉和分组表单，长ID可折行；已生效/未保存/待应用/失败状态用文字与图标，不只靠颜色。

- [ ] **Step 3: 完成业务表单。** 协议选项只显示支持协议；密钥输入沿用现有RSA加密组件并提交到专用credentials API，不回显。质量、尺寸和参考能力有限选项；创建路由选择真实模型、排序策略、能力条件和条件优先级，模拟显示每个候选的排除原因、是否命中，不生成图片。模型详情展示完整候选组成与作用入口。编辑不改active，导航未保存有提示。原admin-settings的供应商/模型编辑改为此管理入口；模型中心激活后旧settings模型写接口返回409与新入口指引，首启及未迁移实例保留旧设置，禁止两套可编辑来源。

- [ ] **Step 4: 发布与失败状态。** 发布前展示新增/删除/禁用/映射/默认/规则变化及成本版本；busy禁止重复点击，unknown保留同ID允许核查/重试；409保留草稿并提供刷新对比，validation精确定位字段。轮询只在pending且当前页面可见时运行，停止离开页面轮询；发布成功显示服务端已确认版本与摘要概要。历史恢复也先差异确认和填写原因。正在使用的旧凭据只能停用新用途，不提供永久删除按钮。

- [ ] **Step 5: UI验收并提交。** 覆盖新增同协议供应商/模型、候选展开、选择成本项、非法能力、并发冲突、断网unknown与恢复、恢复历史、键盘操作和390px窄屏。按computer-use技能通过cua_repl真实验收，截图使用测试数据。生产密钥/真实权限变更不用于UI测试。构建、类型及UI通过后提交 `feat: manage models and routing through BI forms`。

## Task 6: 完整集成、GitHub 验证和协调发布

**Files:** Create `docs/model-configuration-maintenance.md`、`scripts/verify-model-config-coverage.ts`；Modify `.github/workflows/image-gateway.yml`、Router工作流及部署脚本/私有管理代理配置；生产验收记录放ignored output，非敏感说明写 `docs/superpowers/model-configuration-production-<实际日期>.md`。保留AGENTS.md与既有deploy-release.sh主流程。

- [ ] **Step 1: 同步并审查最终分支。** 读取计费现场最新状态，等待其共享文件提交与验收；不复制其未提交文件，不并行部署生产。以其最终账务提交rebase模型分支，修复共享BI导航、provider成本字段、公开目录和默认binding冲突。若需要跨任务发送协调消息，先获得用户明确授权；读取状态不需要额外授权。

- [ ] **Step 2: 覆盖扫描与验证。** 扫描所有 `new OpenAI`、getOpenAISettings、requestedTextModel、configuredVideoProviders、固定Router正则及环境变量模型入口，逐项给出legacy-bootstrap/managed执行/明确排除的依据。coverage验证实际适配器命中，不以“导入model-config”作为通过。执行Naumi `npx tsc --noEmit`、`npm run build`、model-*全部验证、同事billing-*全部验证及现有生图/视频/画布/BI/隐私/发布回滚回归；Router `go test -race ./...`、`go vet ./...`、New API转发JSON与multipart config_digest回归。测试不调用真实付费上游。

- [ ] **Step 3: 维护文档与性能。** 说明新增供应商/模型/候选、发布、版本核查、成本引用、旧任务、密钥换新、未知状态处理与新协议适配边界。对500个fixture新任务分别串行/并发10记录解析耗时、配置SQL数、Router prepare次数和失败数；当前配置读取每任务各1份，按二元版本缓存解析/投影，旧任务执行不查current。无每秒全配置轮询、无每张图重新初始化版本。出现连接池排队或重复prepare先修复，不能以缓存旧指针掩盖实时变更。

- [ ] **Step 4: 审阅后推送两仓库并生成固定制品。** commit前diff/check确保无原私钥、密文凭据、env/生产文件和忽略归档混入；创建PR时按工具要求attach_artifact。检查两仓库CI、不可变Naumi镜像和Router二进制摘要；不使用未验证latest部署。建议当前会话执行本计划，不主动派生实施子任务，独立审查方式按用户选择执行。

- [ ] **Step 5: 准备备份与兼容回滚。** 通过现有保护私钥副本SSH helper核对实时app/Router版本、计费发布状态与任务数；备份PostgreSQL、生产env、Nginx、媒体清单/增量、Router bbolt执行与配置状态、New API状态；备份源必须可校验恢复。新增管理token与envelope secret通过受保护env文件部署，不日志回显。先部署向后兼容Router，保留legacy runtime；新Naumi健康及后台迁移验证完成后再开放管理入口。停写维护期间冻结发布，新模型配置未激活前不得接收新格式任务。

- [ ] **Step 6: 发布并验证。** 使用固定Naumi镜像和deploy-release.sh，Router使用现有固定版本发布流程；私有管理代理只允许精确config路径与需要的方法，原BI读取代理保留。线上只读核对app/Router实际版本、配置摘要、管理员/普通/匿名边界、公开目录、管理模拟、账户/积分/媒体指纹，验证原页面健康和worker镜像；不改真实用户角色/密码/余额、不发真实付费生成。成功后恢复访问与worker，记录备份/回滚位置。服务器或安全迁移阻塞时明确报告未发布。

- [ ] **Step 7: 验证协调回滚。** 隔离环境创建新配置任务再回滚：旧Naumi不能处理新格式任务时暂停入口和worker，保留新版本任务待兼容worker完成/核查，不重发；旧Router只能接legacy请求，现有新digest任务必须保留对应新版恢复服务。回滚按钮不能自动丢弃配置状态、数据库或媒体。线上不以清库恢复冒充版本回滚。提交维护与实际发布记录，最后报告可配置项、实际版本、验收与限制。

## 计划自查与执行方式

- 结构化数据库、表单、内部快照、管理权限、两版本成本、旧凭据、旧任务、视频/文字能力、私网接口、回滚均有明确任务。
- Review Focus的五类问题分别进入Task 1–5的测试；模拟无付费请求与共享并发有直接断言。
- Tasks 1–6 已完成实现、验证与生产发布；实际版本、备份和验收边界见 [生产验收记录](../model-configuration-production-2026-10-04.md)。任务条目保留原实施步骤。
- 推荐当前会话自行连续执行，便于统一两个仓库、计费接口与恢复合同。计划审阅后使用 executing-plans；不让用户再选择JSON或数据库等已批准技术细节。
