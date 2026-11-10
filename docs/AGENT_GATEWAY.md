# 外部 Agent 网关（CLI / MCP / HTTP）

[2026-11-10 Agent 全链路审计](changes/2026-11-10-agent-chain-audit.md) A08–A15 已完成源码修复和本机隔离验收，见 [修复记录](changes/2026-11-10-agent-chain-fixes.md)：只读上传、未知结果恢复、产物回执、A+预算、质检状态及幂等摘要均有回归。真实 PG、实际 CLI/MCP 断连恢复已验证；未发布服务器，不能推算生产供应商或容量验收。

面向 Agent 的完整创作产品目标、功能缺口与阶段验收见 [Agent 创作平台 PRD](prd/2026-11-10-agent-creation-platform.md) 和 [实施台账](prd/2026-11-10-agent-creation-platform-execution.md)。本文仍只描述已实现的网关契约；PRD中的目标接口不视为当前可调用能力。

外部 agent（Claude Code、Codex、Cursor、自建脚本等）用**个人 API 令牌**调用 Naumi 的创作工具。它和站内 Agent 用的是同一套工具与规则，只是"出主意的模型"换成了外部 agent。

## 用户怎么接入

1. 账号中心 → **Agent 接入**（`/account/agent`）创建令牌。可以设置以下几项：
   - **允许收费任务**：关闭后令牌只能调用查询类工具（只读）。
   - **每日积分上限**：上限内的报价自动确认，超出的任务不会提交。
   - **有效期**：30 天、90 天、1 年或长期。
   - 令牌只在创建时显示一次。
2. 下载 CLI（需要 Node.js 18+，零依赖单文件）：
   ```bash
   curl -fsSL https://<站点>/agent/naumi.mjs -o naumi.mjs
   node naumi.mjs login --site https://<站点> --token nmk_...
   ```
3. 调用：
   ```bash
   node naumi.mjs tools                                   # 工具目录（含参数 schema）
   node naumi.mjs tools generate_image                    # 单个工具的完整 schema
   node naumi.mjs quote generate_image prompt="白底主图" ratio=1:1 resolution=1K count=1
   node naumi.mjs call generate_image prompt="白底主图" ratio=1:1 resolution=1K count=1 --out ./out
   node naumi.mjs call inspect_images image_urls=@./商品.png question="图里有什么文字"
   node naumi.mjs status <operationId>
   ```
4. MCP：`claude mcp add naumi -- node /绝对路径/naumi.mjs mcp`（Codex：`codex mcp add naumi -- node /绝对路径/naumi.mjs mcp`）。
   - MCP 模式提供与 CLI 相同的工具。
   - 另有三个辅助工具：`naumi_upload_image`、`naumi_download_media`、`naumi_call_status`。
5. 给 agent 的使用说明见 [`skills/naumi-cli/SKILL.md`](../skills/naumi-cli/SKILL.md)。

**CLI 约定**：
- 所有命令都在 stdout 输出 JSON，进度信息写到 stderr。
- 退出码：0 成功；1 工具失败；2 参数错误；3 鉴权或权限；4 预算或余额不足；5 结果未知或网络中断。
- 收费任务遇到退出码 5 时，先用 `status` 查询，不要换编号重提。

## HTTP 接口（`/api/agent-gateway/v1`）

鉴权：`Authorization: Bearer nmk_...`。企业创作在请求头 `x-naumi-workspace: <企业ID>` 中指定；缺省为个人空间，企业专属站固定为本企业。

| 方法与路径 | 说明 |
|---|---|
| `GET /api/agent-gateway/v1` | 公开发现文档（无需令牌） |
| `GET /me` | 账号、余额、令牌权限、今日预算 |
| `GET /tools` | 工具目录：`name / description / parameters(JSON Schema) / write / billed / timeoutMs / available` |
| `POST /quote {tool, arguments}` | 只报价：`credits / balance / budget / allowed / refusal` |
| `POST /calls {tool, arguments, operationId, request?}` | 执行，详见下文 |
| `GET /calls/{operationId}` | 任务状态与结果 |
| `POST /uploads`（multipart `file`） | 上传参考图（png/jpg/webp，≤12MB），返回可传给工具的地址；同时出现在作品库，标题为"Agent 上传" |
| `GET /media?url=` | 下载本账号的结果媒体 |

**`POST /calls` 的响应**：
- 拒绝时直接返回 JSON 状态码，此时一定没有提交任何东西。拒绝情形包括：鉴权、权限、参数、报价、预算、编号冲突、站点排空。
- 受理后返回 `application/x-ndjson` 流：先是 `accepted`（含报价积分），然后是若干 `progress` 和每 15 秒一次的 `heartbeat`，最后是 `result`（完整任务视图）。
- 客户端断开连接不影响执行，结果可以用 `GET /calls/{operationId}` 取回。

**任务状态**：

| 状态 | 含义 |
|---|---|
| `succeeded` | 成功 |
| `failed` | 失败。`error.submitted` 为 `false` 表示没有提交，为 `"unknown"` 时以作品库和账单为准 |
| `rejected` | 在供应商之前就被拒绝，不扣费 |
| `running` | 执行中 |
| `unknown` | 执行进程中断且没有记录结果 |

错误码：`UNAUTHORIZED / TOKEN_REVOKED / TOKEN_EXPIRED / SCOPE_DENIED / FEATURE_DENIED / SITE_DISABLED / TOOL_NOT_FOUND / ARGUMENT_INVALID / BUDGET_EXCEEDED / INSUFFICIENT_CREDITS / QUOTE_UNAVAILABLE / OPERATION_CONFLICT / OPERATION_NOT_FOUND / RATE_LIMITED / MEDIA_NOT_FOUND / MEDIA_INVALID / UNAVAILABLE / INTERNAL`。

## 规则与不变量

- **同一套工具**：网关用 `createNaumiTools`，不带画布上下文，与站内工作台 Agent 相同；隐藏的只有 `list_agent_tools`。每次调用依次经过：
  - 账号与企业功能权限：`assertAgentToolAccess`，企业空间还要过 `assertCreationFeature`；
  - 严格参数校验，错误信息会指出具体字段；
  - 服务端报价并冻结计费：`agentBillingPrecheck`，与站内 Agent 完全一致；
  - 执行边界：`AgentHarness` 的超时、输出脱敏和防重放。
- **没有二次确认**：令牌每日预算替代逐次确认。报价（按上限）计入当日预算，`rejected` 不计入。预算和"同一令牌最多 4 个并发任务"都在令牌行锁内判定，并发不能绕过。
- **幂等**：`operationId` 由客户端生成。
  - 同一编号、同样参数：返回原结果，不会再调供应商，也不再扣费。
  - 同一编号、不同参数：返回 409。
  - 收费编号同时派生下游的计费操作编号，与站内 Agent 的冻结报价和防重放机制一致。
- **媒体归属**：图片参数里出现的本站媒体地址（相对路径、绝对路径或 CDN 地址）必须属于令牌所有者（`canReadMedia`），否则返回 404。下载同样只能下载本人的媒体。
- **凭证**：
  - 令牌只存 SHA-256。
  - 账号被封禁、到期，或管理员重置登录凭证（`auth_revoked_before` 晚于令牌创建时间）后，令牌立即失效。
  - 令牌不能管理令牌：管理接口只接受浏览器会话，并校验同源。
  - 工具内部调用站内接口使用服务端临时签发的会话凭证，该凭证不出进程，并注册为脱敏密钥。
- **发布与排空**：
  - 每次受理的调用都按账号登记为 `accepted-work`（`release-runtime/account-work.ts`），蓝绿排空会等它完成。
  - 排空中的槽位在提交前就拒绝新调用（503 `UNAVAILABLE`，`submitted:false`）。
  - 结果无法落账时保留 unknown，不会冒充完成。
- **创作记录**：每次调用写一条 `agent-turn` 创作记录（`gw-<令牌>-<空间>:<operationId>`），下游任务通过续接签名挂在它下面。
- **限流**：每个令牌每分钟 120 次请求；每个账号最多 20 个有效令牌。

## 模块与依赖

```text
src/lib/agent-gateway/
  tokens.ts        令牌：创建/列出/吊销/鉴权（拥有 app_agent_tokens）
  calls.ts         调用台账：幂等、预算、并发上限、结果（拥有 app_agent_gateway_calls）
  tool-session.ts  无模型 Agent 会话：复用 createNaumiTools + AgentHarness + 计费会话
  executor.ts      权限 → 参数 → 报价 → 排空登记 → 预算占用 → 执行 → 创作记录 → 落账
  media.ts         参考图归属校验、上传（画布原图通道）、受控下载（serveMedia）
  http.ts          令牌鉴权、账号状态、限流、请求观测、创作空间、NDJSON
src/app/api/agent-gateway/v1/*     薄路由
src/app/api/account/agent-tokens   令牌管理（浏览器会话）
src/components/account/agent-access-client.tsx  账号中心页面
public/agent/naumi.mjs             CLI + MCP（零依赖）
```

依赖方向是 路由 → `agent-gateway` → 现有模块（agent 工具、计费、feature-access、release-runtime、saas 创作、媒体）。网关不直接改其他模块的数据表；计费仍由计费模块和各工具的下游接口负责。

## 验证

`scripts/agent-gateway-smoke.ts` 是端到端验收，运行环境是真实 Next 服务、隔离的 PostgreSQL schema、已发布的模型配置和假供应商。验收全部通过 CLI 和 MCP 进行，`NAUMI_SMOKE_RELEASE_RUNTIME=1` 时同时开启发布运行时：

```bash
NAUMI_SMOKE_PROD=1 NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=postgres://postgres@127.0.0.1:<port>/<db> NAUMI_SMOKE_RELEASE_RUNTIME=1 \
  NODE_OPTIONS=--conditions=react-server node node_modules/tsx/dist/cli.mjs --conditions react-server scripts/agent-gateway-smoke.ts
```
