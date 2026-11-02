# 工具截图排查：标题模型选择与结构化文字结果

## 模块与职责

- 基线：`ca63c76fa0f8c87ae404ad500ca65f71b064e62e`；父任务分支 `codex/tool-screenshot-fixes-20261102`。
- 本切片处理 `/titles` 的实际选模请求、标题结果解析/创作记录收尾，以及 `/ipcheck` 的结果契约。图片工具报价、图像回执与同步计费包装器分别由父任务其他切片处理。
- 截图中产品换色、风格转换、标题、侵权检测的页名与失败状态可以辨认；红色小字号经过原图读取仍不足以逐字可靠识别。本记录不把源码复现冒充截图所涉具体线上账号/任务的已查明根因。
- 未读取生产数据库，未 SSH，未调用真实模型、生成或改账。

## 已复现的当前问题

### 1. 标题页显示的管理模型与实际请求不一致

`TextModelSelect` 在 managed 模式显示 `canvas.text-generate` 目录的独立默认值/选择；只有用户明确点击选项时才同步全局文本偏好。旧 `TitleGenClient.generate()` 直接调用 `authHeader()`，后者读取 `naumi:text-model`，因此页面显示新模型时，未点过选择器的第一次生成仍可发送旧的全局模型。

完整旧组件和实际 `authHeader` 的隔离执行得到：`x-naumi-text-model=legacy-stale-model`，`x-naumi-feature-model` 缺失，没有读取标题页 feature 选择。不是只通过字符串搜索推断。

修正：选择器和提交共同使用 `TITLE_MODEL_FEATURE=canvas.text-generate`；提交先等待现有 `ensureFeatureModelSelection()` 取得真正已加载目录的选择，再构造实际鉴权头并写 `x-naumi-feature-model`。JSON 和 multipart 共用此头。未启用模型时在提交前结束；显式 unmanaged 模式保留全局文本偏好。没有新增收费或变更标题免费规则。

### 2. 侵权检测把坏 JSON 当成低风险成功

旧 `/api/ipcheck` 的 `JSON.parse` catch 生成“低风险／未识别到明显风险”，随后执行成功 ledger 路径；可解析的 `{}` 也直接作为有效结果返回。

修正：`parseIpCheckResult()` 验证风险枚举、非空总结、风险项目结构及建议类型；风险标签由已验证枚举生成，避免 `risk=high` 配 `riskLabel=低风险`。坏 JSON、空对象、null、数组及坏字段均返回固定 `INVALID_TOOL_TEXT_RESULT`，不返回成功结论、不执行成功 ledger。

上游已返回并不等于未受理；该错误分支不调用退款 helper、不改供应商记录、不再发模型请求，保留外层同步计费包装器既有的未知费用核对语义。本切片测试的 ledger/refund 是边界计数，不是生产账务验收。

### 3. 标题坏 JSON 没有结束已创建的创作记录

旧 route 在 `startCreation()` 后的 JSON 解析 catch 直接返回 502，没有调用 `finishCreation()`；原 null 结构还会进入泛化异常分支。

修正：统一 `parseTitleResult()`，坏 JSON、null、数组、无有效标题均走明确 `failed` 收尾并记录 `标题生成结果格式异常`。正常返回保留标题/卖点数量上限和筛选规则。外部执行异常仍保留既有 `needs_review`，不将未知执行结果误写为确定未受理。数据库写入本身失败仍不能保证回执落库，本切片没有伪造该类成功。

## 公共接口与依赖

- 新纯函数模块 `src/lib/tool-text-results.ts` 不依赖 DB、SDK 或网络；暴露 `parseIpCheckResult`、`parseTitleResult` 与固定类型错误。
- 两个 route 只在取得上游响应后调用解析器，供应商观察、身份授权和计费生命周期仍由既有模块负责。
- 兼容完整包裹的 ` ```json ... ``` ` 响应；不从任意文字中猜测 JSON，也不补造风险结论。原始上游响应不直接拼进错误提示。
- 前端复用已有 feature 目录/选择等待接口，没有增加第二套选模缓存。

## 集中验证

脚本：`scripts/verify-tool-text-results.cjs`。实际加载并执行完整 route、完整标题组件、实际 `authHeader` 与 `ensureFeatureModelSelection`，不提取/重写待验证业务函数。React 渲染/hook、HTTP、授权、供应商、存储、账务和创作持久化边界为隔离 fixture。

```powershell
$env:NODE_PATH='E:/Workspace/naumi-creation-media-release-prep-20261026/node_modules'
node scripts/verify-tool-text-results.cjs --baseline --source-root E:/Workspace/naumi/output/tool-screenshot-fixes-20261102/text-results/before --output-root E:/Workspace/naumi/output/tool-screenshot-fixes-20261102/text-results/tests/baseline-r3
node scripts/verify-tool-text-results.cjs --output-root E:/Workspace/naumi/output/tool-screenshot-fixes-20261102/text-results/tests/modified-r3
```

实际输出：

```text
TOOL_TEXT_RESULTS=REPRODUCED CASES=6 FAILED=0 NETWORK=0 PAID_SUPPLIER_REQUESTS=0 EXIT=1
TOOL_TEXT_RESULTS=PASS CASES=21 FAILED=0 NETWORK=0 PAID_SUPPLIER_REQUESTS=0 EXIT=0
```

- 基线涵盖坏侵权 JSON、空结果、标题未收尾、默认模型错用以及两项真实旧 route 正控。
- 修改态涵盖 7 类无效风险结果、6 类无效标题结果、完整 JSON fence、标签一致性、正确模型的 JSON/multipart 提交、冷目录等待前零提交、无模型零提交、unmanaged 偏好保持以及两项有效结果正控。
- 第一模块 5 项基线/17 项修改态已先通过；扩展组件测试后的 r2 曾因测试器把图标 Proxy 的虚拟 `__realModule` 字段当模块路径失败。修正为 own-property 检查后 r3 通过，r2 原报告保留，没有改产品来迎合测试器。
- 所有报告记录逐模块真实加载路径、SHA-256、原始状态和边界计数；没有真实 HTTP、付费模型请求或生产数据操作。

## 父集中收尾

本切片不提交、合并或发布，不启动完整 build。父负责集中类型检查、与同步账务/图像回执切片整合、独立副本回滚和任务制品封存。本切片的通过不代表供应商线上稳定性、真实扣费或全部 12 张截图问题已经验收。

曾提出的“managed 标题带图必然缺 vision scope”在追到 `runModelExecution(primary)` 以及 current scope 的 vision 能力回退后已撤回；未据此修改 `model-config/requests.ts` 或扩大默认供应商切换。
