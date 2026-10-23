# Reference workbench 积分交互减法（2026-10-23）

## 边界与现状

- 基线 HEAD：`84fc45effa74b15785dfaaa39cd39598b19734ca`。
- 独占实现：`src/lib/reference-workbench/browser.ts`、`src/lib/reference-workbench/service.ts`。
- 新增验证：`scripts/verify-pricing-friction-workbench.ts`；只投影本模块两个源文件，其他依赖使用当前共享 checkout。
- 证据目录：`output/pricing-friction-removal-20261023/workbench/`；不修改父任务其他源文件。
- 本文记录本地实现与隔离 fixture 结果，不代表真实供应商或生产发布验收。

## 实现

1. browser 保留准备报价与原 operation ID，删除普通付费操作的积分 `window.confirm`；提交只携带 `native_quote.id`。原始接受回执、拒绝响应、报价失败、未知结果只查询 receipt、不重 POST 的流程保持。
2. accept 仍从 owner 作用域读取保存的 operation，保留 action/内容 fingerprint、账号封禁、同参考图进行中防重、聊天内容计划确认/取消检查。保存报价缺失继续拒绝。不要求客户端 confirmed/credits 回显，也不比较冻结 model/billing 与 current；但显式 `confirmed:false` 在 owner 事务内、已受理原回执返回之后、任何受理变更之前抛出 `WorkbenchError("已取消提交",400)`。省略 confirmed 正常执行，已受理任务不因 false 被撤销。
3. 同 owner/action/request ID 原 operation 永远返回原计划；`expires_at` 仅作为维护元数据，不触发重算、涨价或再次确认。并发 INSERT 使用 DO NOTHING，保留胜出 operation 及其 plan/quote，防止第二个预览覆盖已绑定身份的计划。
4. 自动模式保留既有用户选择和生成循环，仍先准备真实 child image plans，再由原生 imagegen 的真实钱包预占执行；删除 `8 × count` 内部虚构授权积分、提示文案和超 cap 静默 return。历史记录的 autoAuthorization.credits 不再参与执行门槛；保留原冻结版本对。
5. 文字计划原 tariff/quote 与非零积分继续保存并通过原服务器签名版本上下文执行；未把 text/video 的费用抹为 0，也未修改 video 文件。

## 内容确认与数量

- `task_mode=confirm` 的创作方案确认、用户取消和已处理方案保护保持。
- 本轮不增加自动多轮、重试或新的任务展开；原有 `generated.tasks × settings.count` 循环未改。
- 既有 auto 多提示词展开中 count 是每提示词张数还是全局上限，现有 contract 没有独立总张数字段。该语义留给父任务报告/产品确认，不擅自重写创作规划。集中 fixture 验证 auto 单任务、用户 count=2，恰好交付 2 张且重复查询不增加调用。

## 集中验证

验证脚本使用父任务自有隔离 PostgreSQL `127.0.0.1:65437/naumi_pricing_fixture`，每次 createModelFixture 独立随机 schema。handler、service、repository、图片保存/回执与账务走真实模块；供应商仅 loopback 模拟。

- baseline：本模块旧源投影，复现 current 误拦、客户端积分确认门槛、维护 TTL 重算、内部 auto cap 静默挂起。
- modified：原 handler 接受 current 变化后的旧冻结报价，真实保存作品和原任务回执、原价单次扣款；无客户端确认、过期原价、并发预览胜出身份、scope/内容/进行中负例、真实钱包不足、自动恰好两张、内容方案取消。
- rollback：仅在另一份本模块文件副本执行回滚，再运行 baseline 同一探针，工作区修改保留。
- 运行命令、字面输出、exit、哈希与归档路径在证据目录 `VERIFICATION.txt` 中更新。

## 封版 P1：显式取消语义修复

- 旧 verifier 曾把 `confirmed:false` 当作可执行输入，该断言有误。本轮把 current 变化后按原价交付的正例改为省略 confirmed。
- 新 false 负例经过原 handler 与 PG owner 事务，断言 HTTP 400、原 operation 仍为 preview；只比较该取消动作前后 supplier/text 调用、billing operation 总行数与 consume 行数，要求增量全部为 0，不假设整个 fixture 没有早期失败账务记录。已完成同 op 再传 false 的正例要求返回原回执，既不撤销也不增加调用/扣款。
- 保留父任务已将 verifier 本地 `module` 变量改名 `projected` 的修改。
- 本轮只集中运行一次 modified；不重跑 baseline、rollback、tsc 或 lint。旧 baseline/rollback/typecheck 结果只保留为历史证据，父任务统一刷新当前封版回退与 benchmark。
- 唯一一次 modified 为 exit 1：已通过 false HTTP 400、preview 不变、imageCalls=0、textCalls=0 的断言；随后本轮额外添加的 `app_billing_operations` 总数必须为 0 断言观测为 2，导致提前退出。总行数不等于新增消费。最终 verifier 按父指示改为取消动作前后 operation/consume/调用数增量均为 0；此断言修正后未重跑，未将本轮记为全组 PASS。原价/已受理 false 回执的后续正例等待父统一验证。
- finally 已实际完成独立 schema、query/coordination/fixture 连接池、loopback server 与临时媒体 cleanup，输出记录于本轮日志。
- 旧产物及日志保存在 `output/pricing-friction-removal-20261023/workbench/p1-confirmed-false/pre-fix/`。本轮旧/新 SHA256 与精确命令、退出状态在同目录下的 P1 交接记录更新。

## 未做

未运行全 suite、build、真实供应商、SSH/生产；未执行 Git commit/push/fetch；未启动子任务。父任务其他修改保留。本模块结果不是全项目稳定性或 10 万用户规模验收。
