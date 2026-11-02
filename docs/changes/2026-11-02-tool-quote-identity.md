# 工具截图排查：报价身份与冻结质量一致性

## 模块、基线与责任

- 本切片由父任务分配，工作目录 `E:/Workspace/naumi-release47-main-20261101-r1`，任务分支 `codex/tool-screenshot-fixes-20261102`，基线 `ca63c76fa0f8c87ae404ad500ca65f71b064e62e`。
- 对应用户截图中的图裂变／AI 融图“本次输入与原报价不符”，并补核工具 preset 与全局质量偏好不一致的同类拒绝。历史截图没有原任务 ID、时间及具体模型配置，本地复现证明当前代码中存在相同错误路径，不据此断言截图每笔任务均由该路径导致或已扣款。
- 本切片不拥有账务结算、供应商参数映射或结果回执规则。保持原 owner/tenant/feature/model/quantity 校验、价格、冻结配置版本和已受理任务恢复身份。
- 原 `103` 模型映射实验线未引入。本子任务不 SSH、不发供应商请求、不修改生产配置，不提交或发布；父统一集中验收、回滚副本及整合。

## 确认的缺陷

### 1. 已保存报价之后，公开模型身份被再次按比例改写

`withModelRequest` 已从 owner/scope 绑定的 `app_image_billing_quotes` 读取原报价，但之后仍按实际比例 `routeImageModel()`。例如报价是 `gemini-3-pro-image-square`，提交为 `3:4`，会变为同系列 `three-four`。

随后 `/api/generate-image` 对普通工具再次调用方向路由（原先仅 canvas/preset 将已解析 scope 视为权威），把变化后的 `modelId` 传给严格报价比较，真实返回：

```text
{"code":"OPERATION_CONFLICT","error":"本次输入与原报价不符"}
HTTP 409
```

这发生在 durable job 创建和供应商提交之前。放宽严格 model 校验会掩盖错误，因此不采用。

修正：已取得有效服务器报价或内部 imagegen 冻结步骤时，不再二次选另一个公开模型；有效报价自身即为明确选择，不依赖客户端重复发送 model header。generate handler 对所有已解析 managed image scope 使用其冻结公开模型。无 managed scope 的旧路径仍保持原逻辑；没有报价的新请求仍可以在受理之前选择方向别名。

### 2. 融图与裂变预估没有声明自己的真实画幅意图

- Fuse 原预估只含 quantity/resolution，遗漏用户当前 ratio；现在传实际 ratio，原数量和质量仍由原 hook 同时解析。
- Variations 的真实表单是 `ratio=auto`，原预估却省略 ratio，可能冻结一个没有输入画幅的可执行报价。现在显式声明 `auto`，复用已有 `deferImageFrame` 契约：它只是显示报价，不产生伪造方形输入的 opaque 可执行凭据。真实输入仍由 `normalizeLegacyFrameRequest` 在模型绑定/执行报价前解析；不重解释旧任务。

### 3. preset 分支从全局旧质量 header 重新取值

`resolveConfiguredImageQuality` 的 preset 分支忽略已解析 scope：冻结请求为 low、全局旧 header 为 high 时，原函数返回 requested=high / executed=medium，再与 low 报价冲突。

修正只作用该分支：先用 `frozen.requestedParameters.quality`，其次 `frozen.facts.quality`，无冻结值才使用原 body/header。保留原 preset low/medium 执行上限；例如原 requested=high / effective=medium 仍记 high 并执行 medium，不把客户原档位重新定价。已有 qualityPolicy 分支、普通非 preset 逻辑不改。

## 实现路径

1. `src/lib/model-config/requests.ts`：有效报价的公开模型身份不二次路由，也不因缺少重复 header 退到默认模型。
2. `src/app/api/generate-image/route.ts`：已解析 image scope 对工具同样权威，仅三行附近的模型选择切片。
3. `src/lib/model-config/image-quality.ts`：preset 优先读取冻结语义质量。
4. `src/components/fuse/fuse-client.tsx`：报价携带当前比例。
5. `src/components/variations/variations-client.tsx`：显式 auto 预估契约。
6. `scripts/verify-tool-quote-identity.cjs`：实际整模块加载的定向回归。

## 集中验证与证据层级

新 runner 使用完整 11 个 TS/TSX 模块 transpile + VM 执行，不用正则抽取或改写业务函数。真实执行 `withModelRequest`、generate POST/parser/模型选择、opaque quote 读取与严格比较、preset quality，以及 React hook fixture 中组件提交的预估参数。

鉴权主体、模型配置仓库、报价行 DB、executor 装配及 durable job admission 使用内存 fixture；它不证明真实供应商效果、生产数据库或浏览器渲染。supplier/network 均为 0。逐个加载路径/hash 写入报告。

```powershell
$env:NODE_PATH='E:/Workspace/naumi-creation-media-release-prep-20261026/node_modules'
node scripts/verify-tool-quote-identity.cjs --baseline --source-root E:/Workspace/naumi-creation-media-release-prep-20261026 --output-root output/tool-screenshot-fixes-20261102/quote-baseline-final
node scripts/verify-tool-quote-identity.cjs --output-root output/tool-screenshot-fixes-20261102/quote-modified-final
```

原始摘要：

```text
TOOL_QUOTE_IDENTITY=REPRODUCED CASES=16 FAILED=8 NETWORK=0 SUPPLIER_POST=0
exit 1（预期复现；8 个反例断言，不表示 8 个独立根因）

TOOL_QUOTE_IDENTITY=PASS CASES=16 FAILED=0 NETWORK=0 SUPPLIER_POST=0
exit 0
```

覆盖两层路由、整条报价到 durable admission、新无报价方向路由、内部 imagegen step、opaque quote 不依赖重复 header、明确 ratio/quantity 冲突仍拒绝、跨 owner/tenant 拒绝、严格 model 比较未放宽、冻结 low 与 high preset 两方向质量、无 scope 兼容、Fuse ratio/count 与 Variations auto。

另集中运行原自动画幅报价回归：

```powershell
$env:CANVAS_TEST_OUT='output/tool-screenshot-fixes-20261102/quote-auto-regression'
node --conditions react-server scripts/verify-image-auto-quote.cjs
```

```text
IMAGE_AUTO_QUOTE=PASS CASES=7 FAILED=0 SUPPLIER_CALLS=0
exit 0
```

该原 runner 是既有 AST function harness，证据层级和新 runner 的整模块 VM 分开；覆盖 auto 各质量/分辨率/数量、真实零价、明确画幅冻结、错误映射/无价格、身份与旧价保护。

首次新 harness 漏注入 generate handler 的 `legacyImagegenIntent`，保留 `quote-baseline/BASELINE.json` 的 `UNEXPECTED_BASELINE`。补齐依赖后 `quote-baseline-r2` 获实际 409；最终新增缺 header 用例后形成上述 16 项最终报告，不把测试器异常算成产品复现。

## 交接状态

本切片源码与测试已完成；最终报告位于 `output/tool-screenshot-fixes-20261102/quote-{baseline,modified}-final/`，原自动报价回归在 `quote-auto-regression/`。父集中执行类型检查、整批工具验收、独立副本回滚及 Git 整合。这里不声称历史截图对应付费账务已经核对或已上线。

## 增量：Fuse／Variations 已受理 job 的读取恢复

父窄审确认：前端 POST 已得到 `jobId` 后，旧代码仅把 ID 放在当前函数局部变量。一次 GET 断流或 JSON 解析失败即退出，页面刷新同样丢 ID。原 billing POST intent 在已受理响应后清理，用户再次点击同输入可能创建另一笔收费任务。

新增 `src/lib/tool-generation-receipt.ts`，仅由这两页使用：

- 依据 owner＋workspace＋工具＋实际表单内容 SHA-256（含文件字节）＋图片模型保存小型已受理回执；不缓存图片或凭据。全局文字模型偏好不是这两个图片任务的身份，发送前删除无关文字模型 header；实际 form quality 覆盖旧全局 header。
- POST 取得有效 jobId 后立即保存 job leaf 和输入指针；即使响应到达时用户已换账号／空间，也仅保存在原 scope，不投影到新 UI。
- 回执与 billing intent 独立。再次点击相同输入先查已有 job，余额检查只在真正新建时执行；不能因为原任务预占后余额不足而拒绝读取它。
- 复用 `readCanvasGenerationReceipt`，单次 GET 的 30 秒期限包含响应体。传输中断、HTML、5xx 或非终态不创建新 POST；在原六分钟等待窗口中继续读同一 ID，窗口结束保留回执，提示再次点击只查询原任务。
- 同账号同空间刷新后，在空输入页自动读取最新已受理回执；明确 `?view=` 的历史作品页不被恢复动作覆盖。目录／报价稍后加载不会丢弃该回执。
- owner／workspace revision／草稿／选择模型代次均检查，迟到结果不回写新草稿、不更新另一账号积分。原请求 GET 结束后解除当前 busy；没有把草稿变化变成永久 loading。
- 明确 done＋合法图片或明确 terminal error 才清 job leaf；不存在／过期的原任务回执、needs_attention 继续保留。用户在明确失败后新点击仍可新建。清理只删除原 job 的独立 leaf，不删除另一个窗口可能更新的输入指针。
- 新图片输入或模型可以明确新建；再切回尚未终态的旧输入仍查旧 ID。显示积分仅采用服务器 user 回执，移除恢复成功时按当前估价再次本地减分的兜底。

更新文件：两个客户端、上述新 helper、`scripts/verify-tool-generation-recovery.cjs`，并给原报价 runner 的组件 fixture 注入新 hook 边界；本增量没有再修改 requests、generate route 或服务器结算规则。

### 真实整模块客户端控制流验证

runner 加载实际两页、receipt hook、30 秒 reader、表单 hash、workspace 与图片验证整模块。React hook 调度、时钟、auth/HTTP 在隔离边界；完整组件的 `onAction` 与结果 render-prop 实际执行。报告包含每个案例的 POST/GET 原 jobId、scope、用户更新次数和回执保留数。这不是浏览器 UI 或真实供应商证明。

```powershell
$env:NODE_PATH='E:/Workspace/naumi-creation-media-release-prep-20261026/node_modules'
node scripts/verify-tool-generation-recovery.cjs --baseline --source-root E:/Workspace/naumi-creation-media-release-prep-20261026 --output-root output/tool-screenshot-fixes-20261102/job-recovery-baseline-v3
node scripts/verify-tool-generation-recovery.cjs --output-root output/tool-screenshot-fixes-20261102/job-recovery-modified-v3
```

```text
TOOL_GENERATION_RECOVERY=REPRODUCED CASES=28 FAILED=24 NETWORK=0 SUPPLIER_POST=0
exit 1（预期；4 个原行为正控通过）

TOOL_GENERATION_RECOVERY=PASS CASES=28 FAILED=0 NETWORK=0 SUPPLIER_POST=0
exit 0
```

两页各 14 场景：响应体断流→pending→done、HTML→pending→done、超时再点且余额 0、刷新恢复、账号切换、空间切换、草稿改变、换模型新输入、刷新期间目录迟到、输入 A/B/A、missing 回执、needs_attention、明确失败后新点击、无关文字偏好变化。断流与 HTML 场景实际为 1 次 fixture POST＋3 次原 job GET；刷新／再次点击没有第二次 POST。

增量期间再次执行报价测试，`TOOL_QUOTE_IDENTITY=PASS CASES=16 FAILED=0 NETWORK=0 SUPPLIER_POST=0`，在 `quote-recovery-final/MODIFIED.json`。

测试器首轮缺 `cdnUrl`、后续缺 `URLSearchParams`、未调用 ToolShell 结果 render-prop 的失败均保留。第一轮 harness 状态分类过宽曾把缺依赖写为 REPRODUCED，该记录不计产品证据；现 runner 要求恰好 24 个预期 AssertionError 和 4 个明确正控，异常依赖为 UNEXPECTED_BASELINE／exit 2。最终 v3 结果才是本增量验收记录。
