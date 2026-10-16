# 包装 Skill → Agent 真实运行时 Mock E2E

脚本：`scripts/verify-packaging-agent.ts`。只新增测试，不修改产品源码；需在本轮总控已整合 stopReason 错误修复与文本任务计划的 runtime 执行。

## 运行

```powershell
# DATABASE_URL 必须是已确认的本机隔离 PostgreSQL；fixture 再创建随机 schema
$env:NAUMI_VERIFY_ISOLATED_DB='1'
npx tsx --conditions react-server scripts/verify-packaging-agent.ts
```

源材料默认 `skills/brand-packaging-strategy`；也可通过 `NAUMI_SKILL_IMPORT_SOURCE` 指定原始 Skill 文件夹。脚本将真实 SKILL.md、两个 references、agents/openai.yaml 在内存中打 ZIP，经过真实 import API 保存到随机账号，不绕过 parser 或 store。

## 覆盖

- 使用真实 Agent runtime、pi-ai OpenAI-compatible SSE解析、Agent PUT/POST 和 PostgreSQL 持久化；不 monkeypatch 成功响应。
- Mock HTTP supplier 仅监听本机随机端口。全局 fetch 额外断言只能访问 fixture origin，继承的外部 router 配置已清除；无真实模型/图片/付费工具请求。
- 不完整简报 → 三个关键问题；完整简报 → 三个不同方向、唯一推荐、风险、SKU 与渠道规则；测试验证上游收到完整 SKILL/references（多层JSON引号不影响全文核对）。
- 验证流程数据位于 UNTRUSTED_DATA，个人 Skill 账号隔离、image_skill 步骤与策略全文入库、文本任务计划不要求商品图。
- PUT/POST 成功；HTTP400、SSE `content_filter` 各覆盖 PUT/POST：真实pi-ai收敛为assistant stopReason:error，PUT必须发 error且不发空final，POST必须502，错误步骤入库。
- 每次失败仅1次HTTP请求、不自动重投；总计7次本机mock文字请求，tool_start=0。

## 验收状态

本提交仅提供测试脚本与说明，开发分支尚未整合总控 Agent stopReason 修复，不在旧 API 上把预期失败当验收。由总控锁定依赖 runtime 集中执行后记录最终 literal 输出与退出码。真实供应商测试不在此脚本内，不触发任何真实模型调用。
