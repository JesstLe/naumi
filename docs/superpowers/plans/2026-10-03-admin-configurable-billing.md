# 后台统一配置计费 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Naumi 当前所有在用计费金额、成本及收费规则接入一个后台配置入口，配置发布后新任务使用新版本，无需改代码或重新部署。

**Architecture:** 在现有应用和 PostgreSQL 内建立配置驱动的计费模块。后台发布不可变配置版本，报价冻结该版本，任务领域在原事务内调用统一账务操作。价格展示、Agent 预检、实际扣费、商品到账和成本分析引用同一套配置；供应商执行和模型路由保持原链路。

**Tech Stack:** Next.js 14.2、React 18、TypeScript、现有 pg/Zod、tsx 断言脚本、Playwright、现有 PostgreSQL 16 CI 服务。没有新增生产服务或通用规则执行依赖。

**Spec:** `docs/superpowers/specs/2026-10-03-billing-module-design.md`

## Global Constraints

- 跟 Naumi 一起运行、构建和发布，使用现有 PostgreSQL。
- 本次重组保留当前生图调用链路、供应商配置和模型选择，不把现有流量接入尚未完成的 Router。
- 默认配置与当前生效规则一致；不调整用户现有积分，不重算历史流水，不启用当前关闭的充值入口。
- 创建任务后报价冻结。后台发布新配置只影响之后创建的任务。
- 用户钱包积分保持整数，订单实际支付金额保持人民币分。
- 后台不执行管理员输入的 JavaScript、SQL 或任意表达式。
- 结算金额不能超过冻结报价的授权金额；余额不能透支，操作不能重复记账。
- 有数据库的生产环境读取配置失败时，对新收费任务返回可重试错误，不静默切成免费。
- 修改已有配置发布后无需重新构建、重启或部署。
- 所有写入式验收只使用隔离 PostgreSQL 和本地模拟供应商；不得对生产执行测试数据写入，不默认真实付费生图。
- 遵循根目录 AGENTS.md 的已有发布授权和 `scripts/deploy-release.sh` 固定版本镜像流程。产品代码通过验收后按现有约定发布，无需另行申请发布权限。

## Review Focus

1. 浏览器停留在旧报价时管理员调价：创建前给出价格更新提示，不静默多扣。测试归 Task 6/10。
2. 积分批次在长任务运行期间到期：不能部分扣减后记录全额流水；事务失败后保留结果和恢复入口。测试归 Task 4/8。
3. 同一个任务或管理员操作编号重试，但参数或操作者不同：拒绝复用，不能误认为成功重放。测试归 Task 3/4/9。
4. 开关在 A+ 审核、视频执行或任务恢复之间变化：新任务采用新配置，旧任务采用冻结或明确的兼容规则。测试归 Task 6/8。
5. 实际成本缺失、币种不同或质量降级：不能把未知成本当零、把估计当实际，或者让成本调整暗中改变固定售价。测试归 Task 2/11。

## 执行约定和迁移批次

本计划是一个计费子系统的端到端迁移，不另拆商品、账务和后台为独立部署项目。Task 1–4 建立兼容基础，Task 5–11 接入配置及现有调用点，Task 12 验收，Task 13 发布。实现过程可分批提交；配置编辑页在所有在用入口迁移完成前不得向生产开放发布，以免旧入口与新入口并行采用不同价格。

沿用当前 `codex/billing-module-design` 分支；实施前重新检查 `git status` 和 main 差异，保留其他人的变更。每个任务只提交其明确文件，不用 `git add .`。本计划中创建的路径是实施时才创建的产品文件；当前提交只有设计和计划。

执行方式待用户选择。建议 Native：由主会话依次实施，最后安排一次独立整体审查。跨任务共享报价及数据库事务接口较多，连续实施有利于保持兼容；执行过程中每批仍有相应测试与提交。

## 文件责任图

| 文件 | 责任 |
| --- | --- |
| `src/lib/billing/types.ts` | 配置、业务事实、报价、结算及接口类型 |
| `src/lib/billing/bootstrap.json` | 当前现行规则的初始化数据，不作为生产读取失败的兜底 |
| `src/lib/billing/rules/schema.ts` | 严格配置校验及规则组合检查 |
| `src/lib/billing/rules/registry.ts` | 功能标识、可用条件和支持的动作 |
| `src/lib/billing/rules/evaluate.ts` | 按功能分组、优先级选择规则 |
| `src/lib/billing/quote.ts` | 纯报价、最大授权、确定结果的结算计算 |
| `src/lib/billing/costs.ts` | 定点成本、折算及估计/实际标记 |
| `src/lib/billing/catalog.ts` | 初始化、读配置、发布/恢复版本、公开视图 |
| `src/lib/billing/schema.ts` | 兼容的新表/字段 DDL，不导入 db.ts |
| `src/lib/billing/repository.ts` | 使用调用方事务客户端的账务 SQL |
| `src/lib/billing/service.ts` | 账务流程、幂等及事务依赖注入 |
| `src/lib/billing/server.ts` | 将现有 getPool/ensureSchema 和运行环境组装到计费模块 |
| `src/lib/billing/access.ts` | 管理员鉴权、来源校验、私有响应，不依赖 BI 命名接口 |
| `src/lib/billing/request.ts` | 业务请求报价版本、操作标识与错误响应适配 |
| `src/lib/billing/client.tsx` | 浏览器共享公开配置、报价和更新处理 |
| `src/app/admin/billing/page.tsx`、`src/components/admin/billing/*` | 表单、模拟、版本记录、恢复 |
| `src/app/api/admin/billing/*` | 管理配置、模拟和历史的服务端入口 |
| `src/app/api/billing/catalog/route.ts`、`quote/route.ts` | 安全的用户价格视图与权威报价 |
| `scripts/billing-fixture.ts`、`verify-billing-*.ts` | 隔离数据库、模拟上游、单元及集成验证 |
| `docs/billing-maintenance.md`、`src/lib/billing/README.md` | 后台字段→配置标识→代码调用位置的导航 |

## 公共类型与接口合同

Task 2 创建以下类型。业务功能标识见 Task 1；`FeatureId` 是 registry 导出的字符串联合，不接受任意未经注册的功能。

```ts
type ExpiryPolicy = { unit: "days" | "months" | "years"; value: number };
type CostRate = {
  currency: "CNY" | "USD" | "credits";
  amountMicros: string; // 非负整数十进制字符串；1 单位 = 1,000,000 micros
  unit: "image" | "item" | "task";
  cnyPerUnitMicros?: string;
  source: "manual-estimate" | "legacy-credit-estimate";
};
type Pricing =
  | { mode: "fixed"; credits: number }
  | { mode: "quality-resolution"; quality: Record<string, number>; resolutionExtra: Record<string, number> }
  | { mode: "tiers"; dimension: "quantity" | "resolution" | "quality"; prices: Record<string, number> }
  | { mode: "cost-plus"; costKey: string; creditsPerCnyMicros: string; factorBps: number; rounding: "ceil" | "floor" | "nearest"; minimum: number; maximum: number };
type SettlementPolicy = {
  qualityBasis: "requested" | "executed";
  successBasis: "successful-units" | "whole-request";
  failureBps: number;
  byokBps: number;
  reserveBps: number;
  unknown: "hold" | "manual";
};
type BillingFacts = {
  feature: FeatureId; quantity: number; quality: string; resolution: string;
  providerId?: string; modelId?: string;
  metered: boolean; byok: boolean; paidFen: number; userGroup: string;
};
type RuleCondition = {
  quality?: string[]; resolution?: string[]; byok?: boolean;
  userGroup?: string[]; minQuantity?: number; maxQuantity?: number;
  minPaidFen?: number; providerId?: string[]; modelId?: string[];
};
type Rule = {
  id: string; priority: number; when: RuleCondition;
  pricing?: Pricing; settlement?: Partial<SettlementPolicy>;
};
type FeatureTariff = {
  label: string; enabled: boolean; unit: "image" | "item" | "task";
  pricing: Pricing; settlement: SettlementPolicy; rules: Rule[];
};
type BillingProduct = {
  id: string; kind: "pack" | "pro" | "plan-display";
  title: string; amountFen: number; baseCredits: number; bonusCredits: number;
  available: boolean; expiry: ExpiryPolicy;
};
type BillingConfig = {
  schemaVersion: 1;
  features: Record<FeatureId, FeatureTariff>;
  costs: Record<string, CostRate>;
  products: Record<string, BillingProduct>;
  credits: {
    signup: { amount: number; expiry: ExpiryPolicy };
    purchase: ExpiryPolicy; redeem: ExpiryPolicy; admin: ExpiryPolicy;
    debitOrder: "expires-first" | "created-first";
    staleReservationMinutes: number;
  };
  switches: { metering: "legacy-auto" | "on" | "off"; commerce: boolean; recharge: boolean };
  thresholds: { highQualityPaidFen: number; agentConfirmCredits: number };
};
type ConfigSnapshot = { version: number; config: BillingConfig };
type BillingQuote = {
  schemaVersion: 1; configVersion: number; engineVersion: 1;
  facts: BillingFacts; tariff: FeatureTariff; costRates: Record<string, CostRate>;
  requestedCredits: number; authorizedCredits: number; reserveCredits: number;
  matchedRuleId: string | null;
};
type BillingResult = {
  state: "succeeded" | "failed" | "unknown";
  items: { id: string; state: "succeeded" | "failed" | "unknown"; executedQuality?: string; platformFunded?: boolean }[];
};
type Settlement = { state: "settle" | "hold" | "manual"; charge: number; release: number };
type Tx = import("pg").PoolClient;
type OperationInput = {
  id: string; email: string; quote: BillingQuote; reason: string;
  ledgerId: string; fingerprint: string;
};
type GrantInput = {
  id: string; email: string; amount: number; source: "purchase" | "grant" | "migrate" | "admin";
  reason: string; expiry: ExpiryPolicy; orderId?: string;
  ledgerId: string; fingerprint: string; actor: string;
};
type AdjustmentInput = GrantInput & { amount: number }; // amount 可为负，普通 GrantInput 仅允许正值
type BillingService = {
  reserveTx(tx: Tx, input: OperationInput): Promise<{ replayed: boolean }>;
  settleTx(tx: Tx, input: OperationInput, result: BillingResult): Promise<{ replayed: boolean; charge: number }>;
  releaseTx(tx: Tx, input: OperationInput): Promise<{ replayed: boolean }>;
  grantTx(tx: Tx, input: GrantInput): Promise<{ replayed: boolean }>;
  adjustTx(tx: Tx, input: AdjustmentInput): Promise<{ replayed: boolean }>;
};
```

`quote(snapshot, facts): BillingQuote`、`settlementFor(quote, result): Settlement` 为纯函数。报价内的 tariff 是已合并匹配规则的有效配置，价格及成本快照不引用可变的当前配置。Task 2 还定义 `CostEstimate = { currency: "CNY" | "USD" | "credits"; amountMicros: string; source: string; actual: boolean }` 以及 `estimateCost(quote, result): CostEstimate | null`。未知成本返回 null。

`ConfigRuntime` 在 Task 3 产生：

```ts
type ConfigRuntime = {
  current(): Promise<ConfigSnapshot>;
  history(limit: number): Promise<{ version: number; actor: string; createdAt: string; reason: string }[]>;
  byVersion(version: number): Promise<ConfigSnapshot>;
  publish(input: { id: string; expectedVersion: number; config: BillingConfig; actor: string; reason: string }): Promise<ConfigSnapshot>;
  restore(input: { id: string; expectedVersion: number; targetVersion: number; actor: string; reason: string }): Promise<ConfigSnapshot>;
};
```

`BillingError` 是带 `code` 和 HTTP `status` 的 Error，code 为 `INVALID_CONFIG | CONFIG_CONFLICT | CONFIG_UNAVAILABLE | PRICE_CHANGED | INSUFFICIENT_CREDITS | OPERATION_CONFLICT | INVALID_RESULT | AUTHORIZATION_EXCEEDED`。外部错误只返回安全业务信息，不回显配置成本、SQL、连接地址或请求凭据。

## Task 1: 锁定当前规则及性能基线

**Files:** Create `docs/billing-entrypoints.md`、`scripts/fixtures/billing-baseline.json`、`scripts/verify-billing-baseline.ts`；Modify `package.json`。

**Interfaces:** Consumes 当前现有 route/db 实现；Produces `billing-baseline.json` 的 entries 数组，元素 `{feature, route, pricingMode, unit, expectedCases, reserveTiming, settlementTiming, meteringTiming, legacyIds}`。expectedCases 元素 `{quality,resolution,quantity,credits}`，冻结实际收费而非注释。

- [ ] 逐项核对以下在用功能标识及入口，记录实际函数、旧金额和不收费阶段：

| 功能标识 | 路径/职责 |
| --- | --- |
| `image.generate`、`image.suite`、`image.aplus` | generate-image、suite、aplus；A+ 母图、审核、正式生成分阶段记录 |
| `tool.cutout`、`tool.upscale`、`tool.printfile`、`tool.ipcheck` | 固定单价，目前 1/1/0/1 |
| `tool.garment`、`tool.avatar`、`tool.dewrinkle`、`tool.dewatermark`、`tool.style`、`tool.tryon` | 各 route；实际调用 imageQualityCost，不拿弃用 TOOL_COST 推断 |
| `tool.retouch`、`tool.recolor`、`tool.replicate`、`tool.inpaint`、`tool.extract` | 各 route，质量/分辨率及自定义尺寸处理 |
| `tool.garment3d`、`tool.packaging3d` | 当前实际采用 imageQualityCost，旧 3D 常量仅记录为弃用 |
| `canvas.image`、`canvas.expand`、`canvas.text-edit`、`canvas.annotate` | 持久化画布任务及三个工具接口 |
| `competitor.action` | `src/app/api/competitors/[id]/action/route.ts`，任务租约和作品写入 |
| `video.generate` | video/service、旧 video/client、video/catalog、tasks/generate 各入口 |

- [ ] 检索所有金额/数量/有效期引用，记录 Agent 的 `CONFIRM_THRESHOLD=20`、金额解锁门槛、signup_bonus、6 个积分包、旧 plan/pro 展示与历史订单、兑换码、管理员调整和账务读模型。

```powershell
rg -n 'COST|CREDITS|POINTS_PER_IMAGE|HIGH_QUALITY_MIN_PAID_CENTS|CONFIRM_THRESHOLD|RMB_|PACK_DEFS|reserveCredits|refundCredits|addLedgerEntry|addCreditBatch|fulfillOrder|twoYearsFromNow' src
```

- [ ] 添加具体基线断言，不把旧辅助函数的返回值当作自己的 expected 值：

```ts
import assert from "node:assert/strict";
import { imageBillCredits } from "../src/lib/mock-data";
assert.equal(imageBillCredits("medium", "1K"), 6);
assert.equal(imageBillCredits("high", "2K"), 12);
assert.equal(imageBillCredits("low", "5K"), 14);
```

- [ ] 增加 `verify:billing-baseline = tsx --conditions react-server scripts/verify-billing-baseline.ts`，运行该命令和 `npm run verify:credit-billing` 的隔离数据库基线。保存任务创建、工具完成、settlement 的耗时及 SQL 计数到忽略目录 `output/billing-20261003/baseline.json`，包含运行环境、请求数和错误数，不记录凭据。
- [ ] 确认当前基线通过后提交上述三个文件及 package.json，提交信息 `test: capture current billing behavior`。

## Task 2: 配置模型、规则执行和纯报价

**Files:** Create types.ts、bootstrap.json、rules/schema.ts、registry.ts、evaluate.ts、quote.ts、costs.ts（均在 `src/lib/billing/`）；Create `scripts/verify-billing-rules.ts`、`scripts/billing-unit-fixture.ts`；Modify package.json。

**Interfaces:** Produces 公共合同全部类型、`validateBillingConfig(value: unknown): BillingConfig`、`quote`、`settlementFor`、`estimateCost`、`expiryFrom(now: Date, policy: ExpiryPolicy): Date`；fixture 导出 `fixtureConfig(): BillingConfig` 和 `facts(overrides: Partial<BillingFacts> = {}): BillingFacts`。

- [ ] 先写下面的测试，运行 `npx tsx --conditions react-server scripts/verify-billing-rules.ts`，确认因新模块缺失失败：

```ts
const config = fixtureConfig();
const snap = { version: 1, config };
assert.equal(quote(snap, facts({ quality: "high", resolution: "2K" })).requestedCredits, 12);
const q = quote(snap, facts({ quantity: 2, quality: "medium" }));
assert.deepEqual(settlementFor(q, { state: "succeeded", items: [
  { id: "a", state: "succeeded", executedQuality: "medium" },
  { id: "b", state: "failed" },
] }), { state: "settle", charge: 6, release: 6 });
assert.equal(settlementFor(q, { state: "unknown", items: [] }).state, "hold");
config.features["image.generate"].pricing = { mode: "fixed", credits: 8 };
assert.equal(quote({ version: 2, config }, facts()).requestedCredits, 8);
assert.equal(q.requestedCredits, 12); // 后台对象变化不能改旧快照
assert.throws(() => validateBillingConfig({ ...config, schemaVersion: 99 }));
```

- [ ] 根据 Task 1 矩阵写完整 bootstrap.json，保留所有实际现行价格。商品原 ID 保持稳定，旧授权/套餐默认不可售。质量默认 medium，非法质量沿用现有解析；非法数量或无法定价的收费功能返回 INVALID_CONFIG/INVALID_RESULT，不能回退成免费。
- [ ] 实现 Zod strict schema，非负金额、整数积分、金额范围、精度字符串、比例与有限数量；校验 feature 注册、成本键/汇率、默认报价、规则覆盖、优先级冲突及商品 ID 唯一。规则任意脚本/SQL/未知字段直接拒绝。
- [ ] 按 feature 预分组规则，发布时排序；查价使用对象键，quote 只匹配当前功能规则。有效 tariff 和 costRates 使用不可变副本。

```ts
const tariff = structuredClone(config.features[facts.feature]);
const selected = tariff.rules.find(rule => matches(rule.when, facts));
const effective = mergeTariff(tariff, selected);
// matches/mergeTariff 在 evaluate.ts 实现并导出；merge 不允许改变 feature 身份。
```

- [ ] 实现定点 BigInt 成本运算，输出字符串以便 JSON 序列化；向钱包/订单整数转换前检查范围。报价最大授权涵盖配置允许的质量降级/失败收费，预占不足覆盖最大费用的配置拒绝发布。成本缺失返回 null，cost-plus 缺少成本/汇率时报 INVALID_CONFIG。
- [ ] 补齐实际质量收费、BYOK 比例、按任务收费、失败比例、分档、成本加价舍入/上下限及未知结果的断言；跨币种不能直接加总。`expiryFrom` 保持日/月/年日历语义，默认购买 2 年、注册赠送 30 天，不把 2 年误换为固定 730 天。

```ts
const config = fixtureConfig();
config.features["image.generate"].settlement.qualityBasis = "executed";
const q = quote({ version: 3, config }, facts({ quality: "high" }));
assert.equal(settlementFor(q, { state: "succeeded", items: [
  { id: "one", state: "succeeded", executedQuality: "medium" },
] }).charge, 6);
assert.equal(estimateCost(q, { state: "unknown", items: [] }), null);
const bad = fixtureConfig();
bad.features["image.generate"].settlement.reserveBps = 0;
assert.throws(() => validateBillingConfig(bad));
```

- [ ] 运行 rules 验证和 `npx tsc --noEmit`，提交新模块及测试，信息 `feat: add configurable billing rules and quotes`。

## Task 3: 持久化配置、初始化和并发发布

**Files:** Create `src/lib/billing/schema.ts`、catalog.ts、`scripts/verify-billing-config.ts`；Modify db.ts 的 schema 初始化接点、package.json。

**Interfaces:** Consumes Task 2 类型；Produces `createConfigRuntime(deps: { pool: Pool; ensureSchema: () => Promise<void>; initialize: (tx: Tx) => Promise<BillingConfig> }): ConfigRuntime`、`ensureBillingSchema(pool: Pool): Promise<void>`；初始化函数在 Task 5 组装。

- [ ] 新表 DDL 至少包括：

```sql
CREATE TABLE IF NOT EXISTS app_billing_config_versions (
  version bigserial PRIMARY KEY,
  operation_id text NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL,
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

当前指针为 `app_settings` 的 `billing_config_version`。增加订单和视频/画布任务的 nullable `billing_quote jsonb`，原图片任务 JSON 内保存 billingQuote；不删除或重命名旧字段。增加 `app_billing_operations`，字段见 Task 4。
- [ ] 编写隔离 DB 测试：两个相同 expectedVersion 的 publish 并发仅一个成功，失败为 CONFIG_CONFLICT；相同 id/actor/body 重放返回原版本，换 body/actor 拒绝；restore 创建新版本且旧版本内容不变。

```ts
const a = await runtime.current();
const outcomes = await Promise.allSettled([
  runtime.publish({ id: randomUUID(), expectedVersion: a.version, config: editedA, actor: "a", reason: "test A" }),
  runtime.publish({ id: randomUUID(), expectedVersion: a.version, config: editedB, actor: "b", reason: "test B" }),
]);
assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
```

- [ ] publish 使用事务级 advisory lock `hashtext('naumi-billing-config')`，先检查 operation_id/fingerprint，再锁当前指针、比较版本，严格校验完整配置，插入不可变版本和更新指针后提交。初始化采用同一锁，并发启动只建一个初始版本。
- [ ] current 使用单次 JOIN 查询当前指针及完整 config；指针不存在且未初始化才执行显式初始化，指针存在但版本缺失/数据错误/连接故障返回 CONFIG_UNAVAILABLE，不使用 bootstrap 兜底。

```sql
SELECT v.version, v.config
FROM app_settings s
JOIN app_billing_config_versions v ON v.version::text=s.v
WHERE s.k='billing_config_version';
```

本仓库 getSetting/setSetting 使用 k/v，updated_at 为更新时间；SQL 使用这一现有结构。ensureBillingSchema 仅建立表和兼容列，配置初始化在现有 ensureSchema 完成后进行，避免互相等待。
- [ ] 检查旧 image/video/canvas/order 行在新增 schema 下可读，初始化不产生积分流水；运行 config 验证及已有 credit-billing，提交 `feat: persist versioned billing configuration`。

## Task 4: 统一事务内预占、结算、释放及到账

**Files:** Create repository.ts、service.ts、`scripts/billing-fixture.ts`、`scripts/verify-billing-wallet.ts`；Modify db.ts 的账务兼容接点。

**Interfaces:** Produces `createBillingService(): BillingService`（所有方法显式接收 Tx，不自己提交外层事务）；`withBillingTransaction<T>(pool: Pool, action: (tx: Tx) => Promise<T>): Promise<T>`；fixture `createBillingFixture(): Promise<{pool: Pool; service: BillingService; user(amount: number): Promise<string>; close(): Promise<void>}>`。

- [ ] fixture 第一行校验 `NAUMI_VERIFY_ISOLATED_DB=1` 和 DATABASE_URL hostname=127.0.0.1。仅在隔离库创建唯一前缀用户及 fixture 行；close 按自己的精确 ID 清理并关闭连接。fixture.user 返回可用余额恰好为 amount 的测试用户，不依赖注册赠送默认值。
- [ ] 建立 operation 表并冻结报价/指纹；同时维护旧 reservation/cost/ledger 字段以便旧读模型兼容：

```sql
CREATE TABLE IF NOT EXISTS app_billing_operations (
  id text PRIMARY KEY, email text NOT NULL,
  feature text NOT NULL, quote jsonb NOT NULL,
  request_fingerprint text NOT NULL,
  state text NOT NULL,
  reserved_credits integer NOT NULL DEFAULT 0,
  charged_credits integer NOT NULL DEFAULT 0,
  ledger_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] 编写真实事务测试：重复 reserve/settle 各一次记账、不同指纹拒绝、失败释放、未知保留、并发余额只允许可负担任务、过期/不足全笔回滚、管理员扣减不能占用在途积分。

```ts
await withBillingTransaction(f.pool, tx => f.service.reserveTx(tx, op));
await withBillingTransaction(f.pool, tx => f.service.settleTx(tx, op, success));
await withBillingTransaction(f.pool, tx => f.service.settleTx(tx, op, success));
const { rows } = await f.pool.query("SELECT count(*)::int AS n FROM app_ledger WHERE id=$1", [op.ledgerId]);
assert.equal(rows[0].n, 1);
```

- [ ] reserve 锁 operation 并核对身份，再锁 app_users，原子检查有效批次余额减已有预占足够，插入 app_gen_reservations 并增加 credits_used。预占是占用，不记消费。
- [ ] settle 使用 settlementFor，再扣有效批次；按配置 expires-first/created-first 排序，仅用程序选择的固定 SQL 排序片段，不插入管理员文本。核对实际扣减全额后写稳定 ledger_id、释放该 operation 的预占并标记已结算。扣减不足抛错误让外层事务整体回滚。
- [ ] grant 同事务写批次、流水、余额和 operation；adjust 负值先检查可用余额，不能扣预占。identity 指纹包括用户、操作类别、金额/报价、操作者；已有任务和 BI 的 ledger ID 前缀保持不变。
- [ ] db.ts 兼容函数注入现有事务/连接，repository/service 不导入 db.ts 或 server.ts。过期及余额缓存更新归统一实现，事务关键更新失败不能吞错。
- [ ] 对扣款后插入流水前注入失败并断言所有变更回滚；Task 3/4/credit-billing 通过后提交 `refactor: centralize atomic billing ledger operations`。

## Task 5: 服务端组装、后台 API 和运行开关

**Files:** Create server.ts、access.ts、request.ts；Create `src/app/api/admin/billing/route.ts`、`simulate/route.ts`、`versions/route.ts`；Create `src/app/api/billing/catalog/route.ts`、`quote/route.ts`；Modify native-auth.ts、settings.ts、commerce.ts、`src/app/api/admin/settings/route.ts`；Create `scripts/verify-billing-api.ts`。

**Interfaces:** server.ts 导出 `getBillingRuntime(): Promise<{config: ConfigRuntime; service: BillingService}>`、`resolveBillingFacts(request: Request, input: Partial<BillingFacts> & {feature: FeatureId; quantity: number}): Promise<BillingFacts>`、`quoteForRequest(request, input): Promise<BillingQuote>`。request.ts 导出 `assertQuotedVersion(client: {version?: number; credits?: number}, current: BillingQuote): void`、`billingErrorResponse(error: unknown): Response`。缺客户端版本的旧入口只在迁移兼容期允许，客户端迁移后对收费请求强制版本及已展示金额校验。

- [ ] 初始化在 initialize(tx) 的同一事务客户端上直接读取旧 app_settings（signup_bonus、计费/充值开关），合并 VIDEO_TASK_COST 和 bootstrap 后保存完整初始版本；不调用已改为读取新配置的 getSignupBonus/getPaymentStatus/creditsMeteringOn，以免递归，也不另借池连接，以免并发启动耗尽连接池。metering 的 legacy-auto 保持原 OR 逻辑；管理员选择 on/off 后覆盖该商业计费选择，身份认证仍按原模式运行。commerce 的环境总开关保留安全约束，不因单价编辑启用购买。
- [ ] 管理 GET 返回当前完整配置及有效开关原因；POST 接受 `{id,expectedVersion,config,reason}`；版本 GET 有界分页；恢复 POST 接受 `{id,expectedVersion,targetVersion,reason}`。same-site 检查、requireAdmin、private/no-store 和 noindex 沿用现有成熟实现；审计 actor 从服务端身份取，不信任 body。
- [ ] simulate POST 接受 `{config,facts,result}`，先严格验证，返回报价、结算、估计成本和规则命中，无任务/积分/供应商副作用。公开 catalog 仅输出安全展示数据，quote 先按当前请求身份重建 metered/byok/paidFen/userGroup，不接受用户伪造的免费身份。
- [ ] 测试非管理员 404、跨站 mutation 403、无数据库 503、非法字段 400、价格更新 409、配置冲突 409、读取故障 503；不输出内部成本/操作者。后台改开关后对新报价生效，已创建任务保持原快照。

```ts
const before = await f.pool.query("SELECT count(*)::int AS n FROM app_ledger");
const res = await simulate.POST(adminRequest({ config: fixtureConfig(), facts: facts(), result: success }));
assert.equal(res.status, 200);
const after = await f.pool.query("SELECT count(*)::int AS n FROM app_ledger");
assert.equal(after.rows[0].n, before.rows[0].n);
```

- [ ] 旧 settings 中 signup/creditsMetering 的写入改为发布配置的兼容操作，禁止留下两份独立生效值。运行 API/config/rules 验证并提交 `feat: expose billing configuration and quote APIs`。

## Task 6: 普通生图、套图及 A+ 冻结报价与结算

**Files:** Modify `src/lib/image-quality-request.ts`、image-job-repository.ts、durable-image-jobs.ts、`src/app/api/generate-image/route.ts`、suite/route.ts、aplus/route.ts；Modify verify-credit-billing.ts、verify-image-job-routes.ts；Create `scripts/verify-billing-image-jobs.ts`。

**Interfaces:** Consumes quoteForRequest、BillingService、BillingQuote；图片任务 payload/snapshot 新增 `billingQuote?: BillingQuote`。DurableImageJobs.create 保持旧签名兼容，新增可选报价参数；settle 增加接受 BillingResult 的入口，旧 numeric settle 仅用于无报价的旧任务恢复。

- [ ] 用本地 mock 上游阻塞任务，先创建 high×2 的任务再改 high 价格；释放 mock 后仍按原版本收费。对混合执行质量、部分失败、BYOK 和本地超时重复原有 supplier-count 验证。

```ts
const oldJob = await createBlockedImageJob({ quality: "high", count: 2 });
await publishImagePrice(17);
await completeMockJob(oldJob.id, { success: 1, failed: 1 });
assert.equal(await chargedCredits(oldJob.id), 10);
assert.equal((await submitWithDisplayedQuote({version: oldJob.quote.configVersion, credits: 10})).status, 409);
```

测试脚本内 createBlockedImageJob/completeMockJob 用 verify-credit-billing 的 createServer+hold/release 和 POST/GET 实现；publishImagePrice 调 ConfigRuntime.publish；chargedCredits 使用 db.getImageJobChargedCredits；submitWithDisplayedQuote 提交 generate-image POST 的新增报价确认字段。实现这些 fixture 函数而非写空桩。
- [ ] 任务创建前报价并校验客户端版本，原任务创建事务调用 reserveTx；原 cost/reserved_cost 存 quote 对应金额。带报价的新路径使用 quote.facts.metered，不能由 repository 再读一次计费配置。A+ 审核完成预占使用最初冻结报价；母图/重做收费按 Task 1 的实际规则，不能额外收费。
- [ ] 完成结果转换为稳定 item id、执行质量及成功状态，调用 settleTx；旧任务缺报价时按已存成本和旧策略进入有标记的兼容处理。没有报价时绝不套新价格。

```ts
const result: BillingResult = { state: "succeeded", items: shots.map(shot => ({
  id: shot.id, state: shot.status === "done" ? "succeeded" : "failed",
  executedQuality: shot.executedQuality,
})) };
await service.settleTx(client, operation, result);
```

- [ ] 保留质量执行冻结、paidOperation 缓存和租约验证；账务变化不重发上游请求。消费提交后质量审计使用真实 settled charge，不能根据最新价重算。
- [ ] 运行 image-gateway、credit-billing、image-job-routes、billing-image-jobs；新任务关闭计费、旧任务切开关、A+ 审核跨调价和崩溃恢复均通过后提交 `refactor: freeze billing quotes for durable image jobs`。

## Task 7: 同步工具、3D 及竞品工作区全部接入

**Files:** Modify `src/app/api/{cutout,upscale,printfile,ipcheck,garment,avatar,dewrinkle,dewatermark,style,tryon,retouch,recolor,replicate,inpaint,extract,garment3d,packaging3d}/route.ts`、`src/app/api/competitors/[id]/action/route.ts`、`src/lib/db.ts` 的 finishCompetitorGeneration；Create `scripts/verify-billing-tools.ts`。

**Interfaces:** Consumes Task 5 quoteForRequest 和 Task 4 service；request.ts 增加 `operationIdFor(request: Request, explicit?: string): string`，客户端发送稳定 x-naumi-billing-operation-id，缺失时服务端创建首次请求 ID，兼容老客户端。quote 确认字段在 JSON/Multipart 都支持。

- [ ] 每个 listed route 写独立变价用例：默认价正确，后台修改对应 feature 后报价与扣费变化，修改别的 feature 不影响本功能；printfile 默认零但可配置收费，ipcheck 去掉局部 COST=1。
- [ ] 每个接口依次执行 quote→版本校验→带 operation 的预占→原供应商调用→保存结果→事务结算。使用已有 artwork/job/lease id；同步重复操作在已有 reserved/unknown 时返回处理中，在 settled 时返回可恢复的结果引用，不能再次执行供应商。没有结果引用时返回明确待恢复状态，不假造成功结果。
- [ ] 抠图、放大保持原 Replicate/现有兜底链路；3D 保持原 imageQualityCost 对应初始规则，管理员可以选择后续固定/分档报价。所有工具成功/失败金额从 quote/result 计算，旧 refundCredits 不再充当任意操作的无身份释放。
- [ ] 竞品 finishCompetitorGeneration 的租约、作品写入和 settleTx 同事务，失败整体回滚；没有独立调用结算后再标业务成功。

```ts
const q = await quoteForRequest(fixtureRequest, { feature: "tool.ipcheck", quantity: 1 });
assert.equal(q.requestedCredits, 3); // fixture 后台修改为 3
await runToolTwiceWithSameOperation("tool.ipcheck");
assert.equal(await operationLedgerCount(), 1);
assert.equal(mockSupplierRequestCount(), 1);
```

fixtureRequest 带 fixture 用户 cookie 和同源 URL。runToolTwiceWithSameOperation 在 verify-billing-tools 内对对应 route.POST 发送同一个 operation header 两次；operationLedgerCount 查询该稳定 ledger ID 的记录数；mockSupplierRequestCount 返回本地 createServer 的请求计数。每个接口所需图片使用 sharp 生成，不上传真实媒体。
- [ ] 逐个提交迁移小批：固定价工具、质量价编辑工具、分辨率/3D 工具、竞品。每批运行相关 mock 用例、verify-global-image-quality 和类型检查；完整 Task 7 通过后标记所有 feature 已接入。

## Task 8: 画布与视频冻结配置、保护持久化结果

**Files:** Modify canvas-image-tasks.ts、`src/lib/video/service.ts`、client.ts、repository.ts、db.ts 对应事务；Modify `src/app/api/canvas/{expand,text-edit,annotate}/route.ts`、`src/app/api/video/catalog/route.ts`；Modify verify-video-postgres.ts、verify-canvas-image-postgres.ts；Create `scripts/verify-billing-async-tasks.ts`。

**Interfaces:** 视频/画布创建参数增加可选 `billingQuote`，任务读模型保持旧字段并加可选快照；老 videoCost 接口改为读取有效报价，所有 await 调用点同步修改，不保留单独 env 定价。

- [ ] 先写 video/canvas 在途调价及切计费开关测试。旧无报价行沿原兼容行为完成；新行完成、失败及恢复使用冻结报价。结果 staged 后账务失败，视频/图片结果仍可恢复且不重新请求供应商。
- [ ] 创建 intent 的原事务插入 billing_quote 并调用 reserveTx；complete/fail 的原事务带业务锁调用 settleTx/releaseTx。保留 `led-video-<id>` 和 `led-canvas-image-<id>` 原 ledger 标识，BI 仍能关联。带报价的新路径从快照取计费状态，执行/结算不重新读当前配置。
- [ ] 对运行期间批次到期的任务测试全笔扣款回滚及保留结果；unknown/needs_attention 仍不被 stale sweeper 释放。sweeper 使用后台等待时间，核对领域状态后处理。

```ts
await stageFixtureResult(task.id);
await expireFixtureFunding(task.email);
await assert.rejects(() => completeFixtureTask(task.id));
assert.equal(await hasConsumeLedger(task.id), false);
assert.equal(await hasStagedResult(task.id), true);
assert.equal(await retainedReservation(task.id), task.quote.reserveCredits);
```

fixture helpers 在 async-tasks 脚本调用现有 stageVideoTaskResult/completeVideoTask 或对应画布完成函数；expireFixtureFunding 仅更新 fixture email 的批次 expires_at。
- [ ] 执行 video/canvas PostgreSQL、video-reliability、video-memory 和 billing-async-tasks；提交 `refactor: unify canvas and video billing snapshots`。

## Task 9: 商品订单、赠送、兑换码与人工调整

**Files:** Modify payments.ts、db.ts 的 order/signup/card/adjust 实现、bi/user-management.ts、settings.ts；Modify `src/app/api/payments/create/route.ts`、alipay/notify、wechat/notify、`src/app/api/redeem/route.ts`、cardkeys/route.ts、admin/settings/route.ts；Create `scripts/verify-billing-entitlements.ts`。

**Interfaces:** `resolveItem` 改为 async，从当前 ConfigSnapshot 查商品并返回原 ResolvedItem+`billingConfigVersion`/`expiry`。订单存报价/商品快照，已有 amount/credits/title 不删除。`expiryFrom`、grantTx、adjustTx 被所有到账路径调用。

- [ ] 创建积分包订单后修改价格/赠送/有效期，再模拟付款回调；原订单仍按原 amount、credits 和有效期到账。重复回调只出现一批次/流水；金额不符不到账。
- [ ] 默认仅原在售 pack 可售，plan-display/pro 历史路径不可新售；后台维护旧金额仅影响展示或支持的商品配置，不能恢复已下线订阅扣费。旧 pro 订单 fulfillment 保持原权益和幂等发 Key。
- [ ] 把订单 paid 状态、grantTx、批次和流水放同事务，现有支付验签算法和外部渠道 API 不改。signup 赠送采用 config 的数量/到期并以用户稳定身份避免并发重复赠送。
- [ ] 兑换码领取状态、积分到账和流水在同事务；已有已生成码保持自身冻结 credits/expiry，不因管理员改默认数量重算。新增码模板及默认到账有效期从配置读，已有按单批输入金额仍有审计。
- [ ] BI 管理 create/adjust 接入 grantTx/adjustTx，保留原 management log、乐观版本、用户保护规则和 ledgerId。相同 command.id 参数不同或 actor 不同拒绝，负数调整不能占用在途预占；旧 settings 人工调整成为同一服务入口。

```ts
const before = await createFixtureOrder("c-990");
await changeFixtureProduct({ amountFen: 10900, bonusCredits: 50 });
await fulfillFixtureOrder(before.id, before.amount);
await fulfillFixtureOrder(before.id, before.amount);
assert.equal(await grantedForOrder(before.id), before.credits);
assert.equal(await purchaseLedgerCount(before.id), 1);
await assert.rejects(() => replayAdjustmentWithDifferentActor());
```

fixtureOrder helpers 直接调用 payments/create 或 db.createOrder/fulfillOrder 和 fixture查询；渠道回调验证通过本地测试签名/密钥，不使用生产收款资料。
- [ ] 运行 billing-entitlements、verify-bi-management、verify-single-product、credit-billing，提交 `refactor: configure products grants and credit expiry`。

## Task 10: 用户展示、Agent 预检及后台表单

**Files:** Create `src/lib/billing/client.tsx`、`src/app/admin/billing/page.tsx`、`src/components/admin/billing/{billing-manager,price-editor,rule-editor,cost-editor,version-history,quote-simulator}.tsx`；Modify layout.tsx、image-quality-context.tsx、image-quality-control.tsx、admin-client.tsx、admin-settings.tsx、agent/runtime.ts；Modify 所有依赖旧计费常量的组件。

组件清单：`generate/generate-client.tsx`、`suite/suite-client.tsx`、`aplus/aplus-client.tsx`、`canvas/canvas-client.tsx`、`video/video-studio-client.tsx`、`garment/garment-client.tsx`、`avatar/avatar-client.tsx`、`cutout/cutout-client.tsx`、`upscale/upscale-client.tsx`、`dewrinkle/dewrinkle-client.tsx`、`dewatermark/dewatermark-client.tsx`、`style/style-client.tsx`、`tryon/tryon-client.tsx`、`retouch/retouch-client.tsx`、`recolor/recolor-client.tsx`、`replicate/replicate-client.tsx`、`inpaint/inpaint-client.tsx`、`extract/extract-client.tsx`、`garment3d/garment3d-client.tsx`、`packaging3d/packaging3d-client.tsx`、`ipcheck/ipcheck-client.tsx`、`credits/{credit-packs,recharge-modal}.tsx`、checkout/checkout-client.tsx、account/account-client.tsx、operator/cardkeys-admin.tsx，以及实际扫描出的金额文案。路径均在 src/components 下。

**Interfaces:** client.tsx 导出 `BillingProvider`、`useBilling()`，返回 `{catalog,loading,error,quote(input):Promise<PublicQuote>,refresh():Promise<void>}`；PublicQuote 为 `{version,credits,reserveCredits,feature,quantity,breakdown}`，不包含上游成本和内部规则。POST quote 权威计算，固定且公开的价格可本地预览；复杂成本价直接使用服务端结果。

- [ ] 写 Playwright 用例 `scripts/billing-ui.spec.ts`：管理员改价→模拟→发布→用户价格更新→旧报价提交409→输入保留并显示新价；非管理员页面不可访问；发布冲突、恢复新版本、配置失败和 loading 都有明确显示。

```ts
await adminPage.goto("/admin/billing");
await adminPage.getByLabel("普通生图 · medium 单价").fill("8");
await adminPage.getByRole("button", { name: "模拟报价" }).click();
await expect(adminPage.getByTestId("simulation-charge")).toHaveText("8 积分");
await adminPage.getByRole("button", { name: "发布配置" }).click();
await userPage.goto("/generate");
await expect(userPage.getByTestId("billing-estimate")).toContainText("8");
```

执行时先验证本仓库普通生图真实页面路径；若入口为其他 URL，同步修正这条测试，不创建重复页面。稳定测试标识仅用于需要交互验证的报价/模拟区域。
- [ ] 后台采用现有管理员视觉和表单交互；价格/成本/规则/商品/积分/版本/模拟清晰分区，隐藏 JSON 实现。发布前展示差异，规则表单按 schema 限定适用功能与动作，发布冲突保留草稿。
- [ ] BillingProvider 统一读取/刷新，避免每个组件各发配置请求；报价请求按完整参数+版本去重，参数改变时丢弃过期响应。发布后不自动替用户提交已涨价任务；再次明确提交使用新版本。
- [ ] Agent 工具名映射 FeatureId，从统一 quote 取得费用，继续保留原大额确认流程；确认门槛从 thresholds 读取。继续 A+ 时读取已有任务报价，不能用当前价重算。工具实际入口仍鉴权/报价，不信任 Agent 的预检结果。
- [ ] 原 admin/settings 的计费表单改为计费管理入口或同一服务的字段，不并存两套可编辑价格源。公开成本数据不得出现在 HTML、客户端 bundle 或网络响应中。
- [ ] 运行 UI 验证、类型检查、pricing-access、private-bi、single-product；对桌面及窄屏检查表单、模拟和历史显示，提交 `feat: add unified billing administration and previews`。

## Task 11: 成本审计、利润与 BI 兼容

**Files:** Modify image-quality-request.ts、db.ts 的成本记录、`src/lib/bi/repository.ts`、`src/components/admin/bi/dashboard.tsx`；Create `scripts/verify-billing-cost-audit.ts`。

**Interfaces:** Consumes estimateCost 和实际 committed charge；成本审计新增 nullable config_version、currency、amount_micros、cost_source、actual 字段。旧 billed_credits/cost_credits/margin_credits 保留，但货币成本不能直接填入积分列。

- [ ] 写测试：固定价下修改估计成本不改变用户扣费；切 cost-plus 后新任务采用对应公式；旧任务成本使用旧快照；unknown cost=null；BYOK 平台兜底只给平台支付部分估计成本；request/executed 质量分别保存。

```ts
const billed = await completeFixtureImage();
const audit = await readFixtureAudit(billed.id);
assert.equal(audit.billedCredits, billed.committedCharge);
assert.equal(audit.actual, false);
assert.equal(audit.configVersion, billed.quote.configVersion);
assert.equal(await userChargeAfterCostOnlyEdit(), billed.committedCharge);
```

helpers 用 Task 6 本地图片任务 fixture 与实际 audit 查询实现；不以客户端传入扣费值作为 committedCharge。
- [ ] 在消费提交后记录审计，审计失败不能触发生图或账务重试；记录输出的实际 billedCredits。历史积分估计继续标记 legacy-credit-estimate，不能混进人民币利润统计。
- [ ] BI 查询按同币种和相同金额单位聚合，未知成本显示「未记录」，手工估计显示「估计」。已有余额/流水/任务查询维持契约，仅增加必要字段，不重构整个 BI。
- [ ] 运行 cost-audit、private-bi、bi-management、credit-billing，提交 `feat: audit billing costs by configuration version`。

## Task 12: 清理重复来源、性能与整体验收

**Files:** Modify mock-data.ts 中过时计费定义及所有剩余引用、i18n/dict.ts 中固定金额文案、admin/pricing/page.tsx 的过时实际计费说明；Create `src/lib/billing/README.md`、`docs/billing-maintenance.md`、`scripts/verify-billing-coverage.ts`、`scripts/verify-billing-performance.ts`；Modify package.json、`.github/workflows/image-gateway.yml`。

**Interfaces:** coverage 检查 Task 1 feature registry 每个在用入口已接入统一模块；performance 输出 JSON `{environment,samples,concurrency,p50Ms,p95Ms,throughput,errorCount,configQueriesPerNewTask,configQueriesPerSettlement,ruleCandidates}`。

- [ ] 扫描并移除运行时旧价格表和局部 COST；初始化 JSON、历史冻结金额、研究资料和测试期望值保留且明确标签。旧公开 helper 若仍有兼容调用，必须要求显式配置/公开视图参数，不能继续读取一个全局固定数字。

```powershell
rg -n 'POINTS_PER_IMAGE|HIGH_QUALITY_COST|TOOL_COST|RMB_PACK_FEN|RMB_PLAN_FEN|CONFIRM_THRESHOLD|HIGH_QUALITY_MIN_PAID_CENTS|VIDEO_TASK_COST|const .*COST\s*=\s*[0-9]' src
```

- [ ] coverage 用扫描结果和实际功能矩阵核对，不仅测试「导入了 billing」。各功能默认与变价测试都必须有结果。修正文案/Agent 大额阈值/充值折扣表达不一致，折扣由商品数值计算，不保留写死「7 折」等销售数据。
- [ ] 以本地 mock、相同 DB/构建/并发条件进行前后对照；预热 50 次、测量 500 次，串行和并发 10 两组，记录失败和连接池等待。断言每个新任务完整配置查询≤1、执行/结算查询当前配置=0；旧兼容任务标记另计。只有当前 feature 的候选规则被匹配，历史版本增长不能让代码逐条扫描历史。
- [ ] 比较 Task 1 基线和改造结果，将耗时变化与配置 IO/规则/锁等待分开报告。出现明显吞吐下降或连接池排队时，先合并读取、修正查询/事务范围；确有证据才增加按版本不可变解析缓存，并继续保留每次新报价的当前版本正确性检查。
- [ ] CI 加 billing 路径触发与 verify:billing-* 命令，沿用已有 postgres 服务。全部写入式脚本校验隔离标记和本地主机；不把私钥、生产环境变量或服务配置提交 CI。
- [ ] 依次完成 `npx tsc --noEmit`、`npm run build`、新 billing 验证、credit/global-image-quality/image-gateway/image-job-routes、video/canvas PostgreSQL、private-bi/bi-management、single-product/pricing-access 及 release 协调验证。只因新增修改或失败重复测试。
- [ ] 写维护文档的真实字段名、标识、调用示例、新增功能步骤及「改配置只影响新任务」说明；提交 `test: verify configurable billing coverage and performance`。

## Task 13: 整体审查、GitHub 和生产发布

**Files:** Read AGENTS.md、`scripts/deploy-release.sh`、Dockerfile、生产部署约定；Create 发布记录 `docs/superpowers/billing-production-2026-10-03.md`（实际发布时间改变时按真实日期命名）；敏感和大体积验收产物只放 ignored output。

**Interfaces:** 消费 Task 12 验收证据、固定版本镜像及现有 SSH helper；产生 GitHub PR、合并结果、实际线上版本和受影响功能的核对结果。

- [ ] 按用户选择的执行方式完成独立整体审查，重点查报价版本、事务/锁、旧任务/订单兼容、成本隐私、所有在用引用和发布回滚。未解决账务风险不进入生产。
- [ ] push 当前 codex 分支、创建 PR 并通过 attach_artifact 关联；描述默认行为不变和配置化范围、实际验证结果。检查并保留并行 main 更新。发布无需另问；GitHub 合并按本任务授权及仓库流程处理，不借用此前 Router PR 的批准作为其他 PR 的批准。
- [ ] 连接服务器仅通过受保护临时密钥副本，不改原 key；先只读确认当前实际版本和运行配置。不要将此前 Gateway 发布版本当作当前线上版本。
- [ ] 备份 DB、配置和媒体并记录可恢复位置；用旧应用加新增 schema 的隔离副本检查回滚兼容。完成新增表/字段及当前配置初始化检查，无安全迁移方案时报告未发布。
- [ ] 使用固定镜像和 deploy-release.sh 发布，默认配置与当前实际值一致，所有入口迁移完成才开放后台发布按钮；验证版本、健康、匿名权限、管理员报价模拟、只读余额/流水及实际生图/Flow 配置主机。线上功能验证不发真实付费生图。
- [ ] 回滚测试明确区分尚未调价与已经调价：旧应用不能直接接管未认识的新配置/任务。需要暂停新收费任务及保留/处理在途结果；不能改账或重发供应商请求来凑兼容。
- [ ] 清理临时密钥副本，提交非敏感生产记录。最终报告后台入口、哪些配置立即生效、性能对照、GitHub 状态和实际部署版本；有任何步骤未完成明确说明。

## 自查结果与执行入口

- 设计的金额/成本/规则、全入口、版本、管理员管理、报价模拟、旧任务订单、交易幂等、审计及部署均有对应任务。
- 五项 Review Focus 已归入各任务的明确测试步骤。
- 类型与函数合同统一使用 BillingQuote、BillingResult、Settlement、ConfigRuntime、BillingService；跨任务不得自行重命名而不同时修改消费者。
- 只读分析与文档编写已完成；产品文件、测试脚本和迁移 SQL 的实施尚未开始。
- 用户审阅本计划并选择执行方式后，从 Task 1 开始，按选定技能推进。
