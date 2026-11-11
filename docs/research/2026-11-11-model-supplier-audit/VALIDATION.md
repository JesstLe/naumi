# 本轮验证与证据边界

固定源码：`052665c8cc295cdba04d28a489f8c9cd727c5862`。

工作目录：`E:/Workspace/naumi-model-supplier-audit-20261111`。

原始输出：`E:/Workspace/naumi/output/model-supplier-audit-20261111/CHECKS.json`，每项同时有 `CHECK-<name>.json`。源码未修改，无产品改前/改后的对照，不伪造 BASELINE/MODIFIED/ROLLBACK 测试结果。

## 1. 本轮实际执行

四组一次集中执行。前三组使用仓库真实规则与合成fixture；第四组编译真实ModelManagement及其编辑器，不启动浏览器。没有连接真实供应商或业务DB。

### 1.1 价格来源：通过，exit 0

命令：

```powershell
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-model-credit-source.ts
```

输入：该脚本的本地 `fixtureModelConfig` / `fixtureConfig`；本次明确移除可选真实配置文件环境变量，不读线上快照。

stdout：

```text
MODEL_CREDIT_SOURCE=PASS CHECKS=6 PRECEDENCE_TESTED=MODEL_RULE>TARIFF_RULE>TARIFF QUOTE_PATH=REAL SUPPLIER_CALLS=0
```

stderr为空。证明这里覆盖的模型积分override→条件规则→默认价优先级与清除回退；不扩大为所有pricing模式/真实扣款通过。

### 1.2 参数契约：通过，exit 0

```powershell
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-image-parameter-contract.ts
```

输入：脚本合成配置、真实 compiler/routing/schema。

stdout：

```text
IMAGE_PARAMETER_CONTRACT=PASS CHECKS=35 QUALITY_EMPTY=TIER RESOLUTION_EMPTY=PROTOCOL METADATA=NON_BLOCKING STRUCTURAL=KEPT STRICT_DEFAULT=UNCHANGED PUBLISH_RULES=ENFORCED SUPPLIER_CALLS=0
```

stderr为空。真实在线型号和供应商wire未在本轮重测。

### 1.3 批量配置：旧契约失败，exit 1

```powershell
node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/verify-model-batch.ts
```

stdout为空。stderr关键原文：

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

true !== false

    at assert (E:\Workspace\naumi-model-supplier-audit-20261111\scripts\verify-model-batch.ts:22:105)
```

完整堆栈在原始JSON，本报告不删改原证据。程序停止于第22行，后续断言未执行，不能说该脚本其余部分通过。

定位：第22行要求 text-generate/video/cutout/upscale 全不兼容。用真实 `batchFeatureAvailability` 单独读取同fixture的结果：

```json
[{"feature":"tool.cutout","compatible":false,"reason":"模型能力不兼容"},{"feature":"tool.upscale","compatible":true,"reason":""},{"feature":"canvas.text-generate","compatible":false,"reason":"模型能力不兼容"},{"feature":"video.generate","compatible":false,"reason":"模型能力不兼容"}]
```

**确切冲突是 tool.upscale，不是本fixture的 tool.cutout。** 当前 `feature-model-policy.ts:10` 将 upscale/printfile 映射 image.edit；`git show 06a916d78d6aa6ab035042bf24ddeede6745d415` 确认其为已提交的工具模型选择变更。策略应保留新功能、补更新旧断言和真实执行覆盖，而不是为了让旧测试绿去禁用当前能力。

本轮为只读研究，没有修改测试或产品；该套门禁仍待修正/补验。

### 1.4 UI结构与编译：通过，exit 0

```powershell
node scripts/verify-model-management-refactor.mjs --static --source-root E:\Workspace\naumi-model-supplier-audit-20261111 --out E:/Workspace/naumi/output/model-supplier-audit-20261111/ui-static
```

stdout：

```text
MODEL_MANAGEMENT_REFACTOR=PASS MODE=STATIC CHECKS=15 TARGET_COMPILE=ACTUAL EDITOR_TRANSITIONS=ACTUAL BROWSER=NOT_RUN API=NOT_RUN PG=NOT_RUN SUPPLIER=0
MODEL_MANAGEMENT_REFACTOR_CLEANUP=PASS OWN_BROWSER_CLOSED=1 OWN_LOOPBACK_CLOSED=1
```

stderr为空。此分支并未创建浏览器或HTTP服务；cleanup文字是原runner的统一输出，**不把它当本轮浏览器验收**。

三组通过总计56项断言，另有一组失败；不是56项端到端场景，也不是全模块所有测试全绿。

## 2. 索引、文档与源稳定性

- `inventory.cjs`：Git文件枚举、TypeScript AST解析、仓内解析、正反向依赖。
- `extend-audit.cjs`：补充BI/设置/Worker等入口，递归仓内静态依赖；补 `.mjs`、docs JSON、Router archive；生成CSV/MD/JSON。
- 初始375 core，补55 related，递归静态闭包928文件；连同直接消费者等共1161个索引条目。候选脚本362、历史参考127。所有数字对应固定版本，不是“当前整个仓库源码文件总数”。
- `dynamicImports=0` 仅指本次索引范围内没有发现非字面量 `import()`，不证明无运行时动态装配、require变量、数据库配置或外部服务。
- 脚本索引按文件名/源码引用筛选，不给每个候选臆定“纯读/安全可运行”。运行前仍应读其guard、DB/网络/浏览器和输入条件。
- `AUDIT_INDEX.json.tables` 仅枚举本范围静态 `CREATE TABLE` 语句位置；SQL动态表名、ALTER与实际在线schema不据此声称完全相同。
- 最终文档验收通过 `evidence/DOC_AUDIT.json` 记录：清单每项重新hash、路径/行号引用、九类核心目录漏项检查、业务源码diff、文档重新打开。
- 收尾再次fetch，main推进到 `825a75badc2616ad9d7f6b4436849ae155dd5eea`，本工作树已普通快进纳入；差异仅为历史说明/材料清理，`src`、package与本报告索引条目均未变化。报告仍明确绑定已测试的052665c8源码，不将合入材料清理当产品复测。

## 3. 现有验证资产与下一步

| 主题 | 可复用资产举例 | 本轮状态 |
|---|---|---|
| 价格有效来源 | verify-model-credit-source.ts | 已跑，6项通过 |
| 参数编译与兼容 | verify-image-parameter-contract.ts / plan / golden | contract已跑；其他未跑 |
| 模型管理UI | verify-model-management-refactor.mjs / session.mjs | static已跑；浏览器session未跑 |
| 批量/用途 | verify-model-batch.ts / tool-scope.ts | batch失败已定位；其他未跑 |
| 新公开模型/2.6 | verify-model-onboarding-gpt26.ts / price-copy.ts | 已索引；本轮未跑 |
| 版本发布与旧草稿 | verify-model-publication.ts / model-draft-retention.ts | 已索引；本轮未跑PG |
| Billing交叉发布 | verify-billing-publication-check.ts | 已读guard；未跑PG |
| Metadata/目录/余额 | supplier-model-metadata / provider-catalog / provider-balance | 已索引；本轮未跑handler/PG |
| 供应商成本/恢复 | verify-supplier-cost.ts / business-routing 等 | 已索引；本轮未跑 |
| 健康探针 | verify-model-health.ts / regression / UI | 已索引；不执行收费探针 |
| 权限 | verify-admin-access / private-bi / route-hardening | 已索引；未重跑HTTP |

完整候选列表见 `SCRIPT_INDEX.csv`，不能将历史脚本存在当作当前通过。此前其他任务的PG、APIB真实出图或线上版本证据不纳入本轮实测计数。

## 4. 未完成项

新UI/CRUD整合、编辑器修正、旧测试修正、全模态真实HTTP/PG/浏览器、真实供应商/媒体交付、在线配置与部署核验均尚未在本轮实施。它们是 `STRATEGY.md` 的后续模块，不是本轮研究漏报后宣称已完成的内容。
