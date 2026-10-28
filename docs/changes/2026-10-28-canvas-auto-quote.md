# 画布自动比例报价缺失修复

## 模块与职责

用户确认图片节点的积分总价和质量/清晰度选项价格同时缺失，重试不恢复。本模块修复报价展示，不调整 Redis、生成并发、供应商参数配置或已受理任务。

- 独立分支：`codex/canvas-result-placement-20261028`，报价改动基线 `16cfe4cab9d4a00e735b06f8aacfe0212fa31012`（已含旧图跳位修复与主线 dataURL 修复）。
- 47 继续暂缓发布；本轮只开发、集中验收、整合 main。

## 调研证据

2026-10-28 11:37:24（北京时间）只读绑定 nginx 当前入口 13120，Web 来源 `e2217c983fe74f4829f2cacb3f69305428af0b11`，配置 v152。现有访问日志抽样连续出现 `/api/billing/quote` 422；最近两小时的成功 `canvas.image` 报价均为已确定比例，没有 `auto`。只读取白名单配置、现有访问日志及聚合报价记录，没有发起生产报价 POST、供应商调用或生产写入。

源码与实际函数夹具复现：`ImageQualityControl` 默认传入 `ratio=auto`；展示报价在 `freezeBusinessQuote` 被送入 `compileImageParameterPlan`，适配器仅接受确定比例或像素，`auto` 导致 `IMAGE_MAPPING_INVALID` / 422。品质单价与总价共用此链路，所以重试仍失败。日志未记录原请求体，不把该抽样冒称某个用户任务的逐请求追踪。

## 公共接口、依赖与状态归属

- `/api/billing/quote` 仍负责解析、鉴权入口、报价响应。仅图片的 `ratio=auto` 展示报价启用 `deferImageFrame`。
- 计费模块继续使用真实模型、所选质量/清晰度、数量、计费规则与账号状态计算价格。计价维度不包含比例；不取旧价，不将失败显示为免费，不猜测 `1:1`。
- 展示时尚未确定参考图的实际比例，因此不编译上游 wire 参数、不发行可执行的 opaque 报价凭据。实际提交沿用现有 frame resolver，解析参考图后获取具体比例的冻结报价及执行计划。
- `deferImageFrame` 只作用于新展示上下文；已有执行 scope、冻结 bundle、accepted context、历史 quote/receipt 的规则保持。普通执行默认严格校验，错误配置、非法具体比例、缺价格继续报错。
- 无新表、迁移、价格配置、钱包或生成任务写入逻辑变更。前端产品组件无需改动。

## 本次实现

1. Quote Route 区分自动比例展示与已确定比例，自动展示不落可执行 quote row。
2. `quoteForRequest` 将内部展示选项传入业务计价；历史冻结报价的提前返回保持。
3. `freezeBusinessQuote` 在受限展示上下文中保持所选计价档位，延后实际比例映射编译；执行路径及映射编译器不放宽。

## 集中验收与证据层级

- `node --conditions react-server scripts/verify-image-auto-quote.cjs`：实际 Route/计费/映射函数；身份、配置仓库、quote-row I/O 是隔离夹具。覆盖五质量×三清晰度×三数量、零价、重试、具体比例/执行仍严格、缺价格、账号/作用域与旧报价不变。基线保留两个 422 失败反例。
- `node --conditions react-server scripts/verify-image-auto-quote-ui.cjs`：独立无头 Edge，真实 BillingProvider、品质控件、总价、生成按钮；报价请求接入上述实际函数，只有身份/配置/仓库隔离。无监听服务器、生产账号或付费生成调用；不冒称完整线上画布验收。
- 与坐标修复的实际 React 延迟提交、真实隔离 PG 并发定位、旧任务防重放及参数映射回归集中运行。最终命令、字面输出、退出码、hash 与副本回滚见 ignored 证据目录。

证据：`E:/Workspace/naumi/output/canvas-result-placement-fix-20261028/`；报价子目录 `quote/`。本地 PNG 明确使用测试价格，不是线上价格截图。main 合入与生产上线分别记录在最终交付回执；47 本轮未发布。

## 未完成项与下一步

最终集中测试、main 整合及副本回滚以 `VERIFICATION.txt` / `DELIVERY.json` 为准。线上生效需要解除 47 发布暂停并完成固定版本发布验收，本轮不执行。
