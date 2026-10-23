# Agent 报价重复确认移除（2026-10-23）

## 范围与实现

- 基线：`84fc45effa74b15785dfaaa39cd39598b19734ca`。
- `agentBillingPrecheck` 删除报价跨轮确认、`confirm=true`、10 分钟 TTL、32 条 pending quote 容量限制、current 版本变更重确认及第二重大额确认。
- 保留服务端 `agentQuote`、冻结 imagegen/制作链 plan、session/turn/tool-call 派生 operation ID、真实 `getUser` 余额/账号检查及已受理视频任务恢复。
- 成本加成只按冻结 `quote.tariff.pricing.mode === "api-cost-plus"` 或制作链明确 `authorizationRequired` 识别；`imagePreset` 仅保留执行/预览元数据，不再把固定客户价误判为授权上限。固定 override 与无 preset 元数据同价对照，真实成本加成仍检查授权余额。
- runtime 删除报价确认专属 session 字段和 prompt ingress 文案正则判断；不改工具执行、权限、预算、原 call ID、内容确认和视频制作链阶段状态。
- 源树不存在 `src/lib/agent/quote-consent.ts`。`explicitQuoteConsent` 保留为旧验证脚本兼容导出；runtime 已无调用。`AgentBillingSession.userConfirmedQuote` 仅保留废弃类型兼容，预检不读取、不写入。
- `AgentHarness` 的普通执行预算、停止/取消、参数校验、重复 call ID 和忽略 confirm 差异的写操作防重放均保持。
- 不改 `billing/request.ts`、synchronous 外层及父任务拥有的其他文件。

## 集中验证

脚本：`scripts/verify-pricing-friction-agent.ts`。使用本轮隔离本地 PostgreSQL，由 `createModelFixture` 创建独立随机 schema。直接执行真实 `agentBillingPrecheck`、`agentQuote`、imagegen planning、余额和任务/账务函数，不替换预检实现或只做源码 grep；本地 HTTP 只接受模型配置 prepare/activate/state/publication，无供应商生成请求。

基线只投影本模块的 `billing/agent.ts`、`agent/runtime.ts`、`agent/harness.ts` 原始源码；依赖统一使用同一当前工作树，以排除父任务并行修改造成的差异。报告记录三文件 SHA-256。modified 与 rollback 使用同一脚本和测试矩阵。

覆盖：高价首次执行、旧 confirm 字段、原 call/operation 身份、冻结原价/版本、current 变更、过期报价状态、真实余额不足/账号缺失、40 次跨轮不同低价参数、A+ 原冻结报价与外人拒绝、视频源节点与已受理 receipt、视频制作链原阶段确认、原价幂等结算、用户取消、普通执行预算/参数/工具权限/防重放。

## 当前状态

实现与本地模块验证完成：基线 43 项通过（低价第 33 次被拦），modified 58 项通过（40 次低价新参数全部允许，固定 override 余额等价，真实成本加成授权余额仍检查）。定向 TypeScript 包括本模块及旧脚本直接调用者，诊断 0，exit 0。独立副本执行回滚并重新跑同一基线矩阵；真实工作树保持 modified。精确命令、exit、hash 与回滚结果见本模块输出目录 `output/pricing-friction-removal-20261023/agent/VERIFICATION.txt`。

初始 fixture 失败保留原日志：tsx 子进程未继承 react-server 条件；贫余额用户被默认 signup 赠额影响；新规则 fixture 缺必填 priority 类型字段。分别通过 `NODE_OPTIONS`、明确清零该 fixture 钱包、补齐 priority 修正，未弱化产品实现。首次 setup 失败的本任务 node 进程已退出，唯一该失败空 schema 已检查无对象后删除；成功 baseline/modified/rollback 的连接、随机 schema、HTTP server 全部由 finally 清理。其他 schema 未操作，容器统一交父任务清理。

未运行全 suite/build，未提交/推送/发布，未调用外网、真实供应商或 SSH。

旧 `verify-billing-agent`、`verify-agent-harness-runtime`、`verify-apimart-preset-entries` 等脚本仍有历史“必须等待报价确认”的断言；类型兼容保留不代表这些旧业务断言仍成立。本轮只新增独占验证脚本，未改其他测试所有者文件。
