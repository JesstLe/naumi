# 画布工具报价与提交项目上下文一致性

## 问题与证据

- 用户截图中的 AI 抠图、重构比例、扩充画面、标注改图均显示“生成未开始 / 本次报价凭据与账号或工作空间不符”。这些截图单独不足以证明所有供应商或工具本体失效。
- 调研固定基线：`3b6a5279b4364590954751e8f5b5c9d566010806`。本模块只在父任务独立工作树中修改，未连接生产服务、未改配置或账务。
- `CanvasClient.privateFetch` 把 `x-naumi-workspace` 和 `x-naumi-project-context` 固定到执行请求，但 `BillingProvider.quoteAndSubmit → getQuote` 仅调用 `authHeader`，遗漏了项目头。
- 专用企业部署对无项目请求默认使用绑定企业；真实旧个人画布则按持久项目证明使用 personal。报价因此落在 tenant，提交落在 personal，`imageBillingQuoteForRequest` 的 owner/scope 校验正确拒绝。
- 该缺陷在真实完整 `creation-context.ts`、`image-quotes.ts`、报价 Route 与实际 React `BillingProvider` 组合中稳定复现。五条受影响入口返回同一 `IMAGE_QUOTE_INVALID`；shared personal 正控通过，证明不是测试只检查新接口存在。

## 模块与职责

- 唯一产品修改：`src/lib/billing/client.tsx`。报价请求属于 BillingProvider；CanvasClient 已经拥有准确的提交上下文，不重复改其工具逻辑。
- `quoteAndSubmit` 仅从明确的提交 headers 抽取 workspace/projectContext，传入内部 getQuote；报价缓存键新增同一 scope，避免同参数不同项目复用报价。
- 报价继续独立获取当前认证 headers，不把 Authorization、执行编号、旧报价或 continuation token 纳入 scope/cache key。
- 等待认证后、等待报价后保留账号/空间 revision 校验；旧的明确 workspace 在请求前拒绝。Canvas 的 beforeSubmit 检查继续保护报价返回及哈希后、收费 POST 前的项目切换。
- 后端 owner/tenant/project 规则原样保留；不重绑旧项目、不把报价修改为客户端传价、不更换已受理任务 operationId、不新增供应商重试。

## 集中验证

脚本：`scripts/verify-canvas-tool-quote-scope.cjs`。
证据：`E:/Workspace/naumi/output/canvas-reported-issues-20261029/tool-scope`。

```text
node scripts/verify-canvas-tool-quote-scope.cjs --source-root <evidence>/before --baseline --output-root <evidence>/tests/baseline-final
CANVAS_TOOL_SCOPE=REPRODUCED CHECKS=6 SUPPLIER_CALLS=0 NETWORK=0 EXIT=1

node scripts/verify-canvas-tool-quote-scope.cjs --output-root <evidence>/tests/modified-final
CANVAS_TOOL_SCOPE=PASS CHECKS=20 SUPPLIER_CALLS=0 NETWORK=0 EXIT=0
```

- 五条入口：cutout、generate-image（重构比例的旧接口路径）、expand、annotate、text-edit。
- 包含 dedicated 旧 personal、未绑定但物理归属可验证的旧 personal、同企业项目、同 workspace 不同 project 的独立 cache key、同项目 cache 复用、multipart 上传工具。
- 反向用例：其他 owner 引用报价、个人报价用于 tenant、其他企业项目、其他账号项目，均继续被拒绝。
- 竞态：认证时切空间、报价返回时切项目、请求哈希时切项目，都不进入模拟收费执行；明确旧 workspace 在报价前拒绝。
- 完整模块加载路径与 SHA-256 记入各 JSON。SQL、身份和 membership 仍是显式 fixture 边界；测试未运行实际供应商、生产 PG 或线上生成。供应商调用 0 不扩大为模型出图质量通过。
- 副本回滚使用同一 runner 的 `--source-root <rollback-copy> --baseline` 验证旧行为；不覆盖工作树修改。完整命令、字面输出与哈希位于子模块 VERIFICATION。

## 迁移与剩余项

- 不需要数据迁移或生产配置修改。
- 此修复只解决截图中一致的报价作用域错误；模型绑定、纯文本路由、删除/撤销、上传后显示由父任务及其他子模块分别排查。
- 合 main、完整 UI 组合验证、整体类型检查及发布状态由父任务统一记录，本子模块不把局部回归当作线上验收。
