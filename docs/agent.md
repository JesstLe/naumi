# Naumi Agent 实现状态

> 更新:2026-09-13 · 状态:Pi 编排、浅色 UI、安全恢复链路和 3012 端口真实运行验收完成

## 目标

在 Naumi 站内引入 pi-agent(`@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`)
作为编排层,让用户用自然语言下达图片任务,Agent 自主调用站内工具完成并交付。

## 架构

```
浏览器 /agent 页面
   │  POST /api/agent        (一次性,兼容旧前端)
   │  PUT  /api/agent        (SSE 流式,推荐)
   │  PATCH /api/agent       (steering 插话)
   │  DELETE /api/agent      (中止)
   │  GET  /api/agent        (事件轮询,降级)
   ▼
api/agent/route.ts ──► lib/agent/runtime.ts(常驻会话管理)
   │                        │  Agent 实例按 (email, sessionId) 常驻,1h TTL
   │                        │  beforeToolCall 积分预检
   │                        │  事件环形缓冲(公开摘要)
   │                        ▼
   │                   lib/agent/naumi-tools.ts(10 个 AgentTool)
   │                        │  内部 HTTP 调站内 API(透传 cookie+authorization)
   ▼                        ▼
各工具 API(generate-image/retouch/recolor/replicate/suite/aplus/templates/account)
   → 鉴权(resolveUserEmail)、限流、积分预扣/退还、作品库归档全部复用原有逻辑
```

## 工具清单(10 个)

| 工具 | 类型 | 计费 |
|---|---|---|
| search_templates | 只读 | 0 |
| list_my_artworks | 只读 | 0 |
| get_balance | 只读 | 0 |
| verify_image_output | 视觉质检 | 0 |
| generate_image | 写 | count × 分辨率档(1K=6) |
| retouch_product | 写 | 6 |
| recolor_product | 写 | 6 |
| replicate_hot | 写 | 6 |
| generate_suite | 写 | 78 |
| generate_aplus | 写 | 模块数 × 6 |

## 已实现

- pi-agent 编排:`Agent` 类 + `AgentTool`(typebox 参数校验)+ `createProvider`
  接独立 OpenAI 兼容 Agent 通道,默认 `qwen3.8-flash`(`AGENT_MODEL` 可覆盖)
- 常驻会话:Agent 实例按 `(email, sessionId)` 常驻内存,TTL 1 小时,GC 回收
- SSE 流式:`PUT /api/agent` 推送 `open/plan/agent_start/tool_start/tool_end/assistant/agent_end/final` 事件
- Steering:`PATCH /api/agent` 向运行中会话插话(pi-agent `agent.steer()`)
- 中止:`DELETE /api/agent?sessionId=`(780s 硬超时兜底)
- 事件轮询:`GET /api/agent?sessionId=&since=`(SSE 不可用降级)
- 积分预检:`beforeToolCall` 按工具单价查余额,不足拦截并返回差额提示
- 凭证透传:工具内部请求同时携带 cookie + authorization,由目标 API 的
  `resolveUserEmail` 统一判别(兼容原生登录与 Supabase)
- 重试策略:**只读 GET 指数退避重试(3 次);收费/写请求严禁自动重试**
  (防网络断开时重复扣费),HTTP 错误一律确定性失败不重试
- 会话持久化:`app_agent_sessions` 表,主键 **(email, id)**(防跨用户猜 id 覆盖),
  `ON CONFLICT (email,id)` upsert;含旧单列主键表的自动迁移;
  `GET/POST/PATCH/DELETE /api/agent/session` 列表/读取/保存/重命名/删除
- 会话控制:Agent 页面左侧历史栏支持新建、切换、继续历史会话、修改名称和删除;
  运行中的当前会话禁止切换或删除,避免流式事件串到其他会话
- 轨迹脱敏:对外事件只暴露 `details.publicSummary`(如"产出 1 张图"),
  不含工具内部提示词与全文结果;隐藏推理不下发前端
- 可审计计划:每次任务开始先产生公开 `plan` 事件并随会话逐步落库
- 视觉闭环:图片工具完成后必须调用 `verify_image_output`,检查主体完整、裁切、变形、
  文字和版式;未通过时给出可执行重做建议
- 恢复闭环:错误按认证/积分/网络/超时/参数/模型分类,给出对应恢复动作;
  同参数连续调用 3 次会被硬阻断,收费写请求不会自动重放

## 安全设计

- 登录必需 + 20 次/10 分钟限流 + 780 秒硬超时(超时 abort 并返回中间成果)
- 工具计费/鉴权走站内 API 原逻辑,Agent 无法绕过积分扣减
- agent_sessions 主键 (email,id):消除跨用户会话覆盖漏洞
- docker-compose 的 `SETTINGS_SECRET` 保持 `${SETTINGS_SECRET:-...}` 环境变量形态,
  不提交固定密钥;`.env` 在 `.dockerignore` 中,不入镜像

## 验收记录(2026-09-13,端口 3012)

- 只读工具 ✓(`get_balance` 返回真实余额 30)
- 真实生图 ✓(纯白底红苹果,PNG 2,156,054 bytes,积分 30→24)
- 视觉质检 ✓(`qwen3.8-flash` 视觉检查 100/100;人工复核主体完整、白底、无文字)
- SSE 事件序列 ✓(`open→plan→agent_start→tool_start→tool_end→assistant→agent_end→final`)
- Steering/停止 ✓(真实浏览器触发 PATCH 200、DELETE 200,原 PUT 连接被 abort)
- 会话持久化/刷新恢复 ✓(消息、plan、工具摘要和生成图刷新后可见)
- 会话管理 ✓(历史列表、新建、切换、重命名、删除和继续对话)
- 轨迹脱敏 ✓(SSE 不含 API Key,工具摘要不回退内部全文或完整媒体 URL)

## 安全返工记录(审计四项)

- A:SETTINGS_SECRET 撤销明文,恢复 `${SETTINGS_SECRET:-...}` env 形态,git diff 无残留
- B:app_agent_sessions 主键改 (email,id),ON CONFLICT(email,id),含旧表自动迁移(information_schema 探测→重建→拷数据)
- C:写/收费请求零自动重试;只读 GET 指数退避 ≤3 次
- D:工具凭证改可变 getter,常驻会话续期即刷新 cookie+authorization;
  runtime 传 getter 引用;内部 origin=INTERNAL_APP_ORIGIN(容器内 127.0.0.1:3000)

## 二轮审计补充(同日)

- 复用矩阵:见上节(OMP compaction/snapcompact/session-manager/auto-background、
  DSH session/tools-runtime/guard/timeout-policy 源文件级评估)
- ensureModels:闭包 ApiKeyAuth(resolve 动态读独立 Agent key,DB/图片通道 key 兜底),符合 pi-ai
  `AuthResult{auth:ModelAuth}` 契约;删除未使用的 envApiKeyAuth import
- AbortSignal 全链路:工具 execute→internal fetch/sleep/urlToFile/pollJob 全部
  接收并传播;每工具独立超时预算(dsh timeout-policy 思路);SSE ReadableStream
  实现 cancel() + request.signal 监听,断连即 agent.abort() 并统一清理定时器
- urlToFile SSRF:仅 http/https、同源放行、私网地址拒绝、域名白名单
  (imgdd.cc/youmind.com)、redirect:"error" 禁跨重定向、≤12MB、image/* 类型校验
- /api/account 核查:已有 canSeePrivate(本人或管理员)鉴权,作品仅在 allowed
  时返回,无需改动(核实项)
- 前端:PUT SSE 事件驱动(tool_start/tool_end/assistant/final/error)、
  PATCH 插话输入框、DELETE 停止按钮、挂载时从 /api/agent/session 恢复最近会话

## 已知边界 / 后续

- 旧一次性 POST 仅保留兼容;当前浅色 UI 已使用 PUT SSE 主入口
- 隐藏推理(thinking 块)未启用:中转站对 reasoning 支持不稳,`reasoning: false`
- 工具写请求失败不自动重试,由 LLM 决定是否引导用户确认后重发(防重复扣费)
- 长期偏好记忆和任务后反思未实现;当前已实现单任务公开计划、逐步持久化和失败恢复

## 复用矩阵(oh-my-pi / DeepSeek Harness 源文件级评估)

参考仓库(MIT/CC 均允许复用):oh-my-pi @ main(can1357,MIT)、deepseek-harness @ master(deepseek-ai,MIT)。
结论:**两者均为编程 Agent 全量产品,不整包引入**;只移植与本站 Next.js 服务端兼容、依赖可控的机制。

| 来源文件 | 许可 | 决策 | 理由与落点 |
|---|---|---|---|
| omp `packages/agent/src/compaction/pruning.ts`(440 行)+ `compaction/`(16 文件,~5k 行) | MIT | **不采用(暂)** | 依赖 `@oh-my-pi/pi-ai` 类型与 tokenizer 体系,移植需连带拖入;当前会话上限 10 轮历史 + 硬截断足够。触发条件:单会话历史 >40 轮或上下文爆窗时,按其 `protectTokens/minimumSavings` 思路自研 |
| omp `packages/agent/src/compaction/tool-protection.ts` | MIT | **思想已移植** | "保护最近 N token 的工具结果不被裁剪"——我们以 `details.publicSummary` 常驻、全文不出前端的方式达成同等目标(轨迹脱敏) |
| omp `packages/snapcompact/src/snapcompact.ts`(2187 行) | MIT | **不采用** | 独立压缩引擎,依赖 omp 专属 wire 协议;收益仅在大上下文场景,当前无此压力 |
| omp `packages/coding-agent/src/session/session-manager.ts`(3170 行) | MIT | **思想已移植** | 不搬深度耦合的整文件;采用逐事件/逐 turn 落库,`app_agent_sessions(email,id)` 支持刷新恢复 |
| omp `packages/coding-agent/src/async/auto-background.ts`(78 行) | MIT | **不直接移植** | 站内套图/A+ 已有持久化 jobId + 轮询;当前保持 SSE 等待并支持断连 abort,避免引入第二套后台作业状态机 |
| dsh `packages/guard/timeout-policy/src/index.ts`(81 行) | MIT | **直接移植(已实现)** | "工具声明 timeoutMs → 包装执行 signal → 超时替换为结构化 TOOL_TIMEOUT 结果"。映射为每个 AgentTool 的 per-tool 超时(生图 300s/套图 480s/A+ 600s),超时返回模型可读的错误而非悬挂 |
| dsh `packages/guard/repeat-tool-reminder/src/index.ts`(233 行) | MIT | **思想已移植(简化版)** | "同参重复调用链计数 → 达阈值注入提醒打断循环"。我们在 `beforeToolCall` 记录 (tool,canonical-args) 链,同参调用 ≥3 次直接 block 并注入"不要重复相同参数"提醒;未搬其通配 include/exclude 配置面 |
| dsh `packages/core/tools/src/`(tool runtime:schema 校验/output schema/render 分离) | MIT | **不采用** | 绑定 Cordis 容器(`inject: ['tools']` 生命周期),引它=引 Cordis;pi-agent 的 typebox `parameters` + `execute` 已覆盖同能力 |
| dsh `packages/compaction/`(compaction/src/tool-pairing.ts 等) | MIT | **不采用(暂)** | 同 omp compaction:大上下文阶段的方案,当前无压力 |
| omp subagent/Agent Hub、dsh subagent | MIT | **后续评估** | 套图 13 张 fan-out 并行是天然场景;需先解决子代理的积分归属与事件聚合,列下一迭代 |
| omp memory(retain/learn/recall)、dsh `mcp-memory` 参考配置 | MIT | **后续评估** | 用户偏好记忆;dsh 文档明确 memory 引擎需外置服务,自建偏好表更轻 |

## 安全硬性约束(实现层)

- 内部调用 origin:`INTERNAL_APP_ORIGIN` env(缺省回退请求 origin / 127.0.0.1),禁止硬编码
- `urlToFile` SSRF 防护:仅 http/https、同源或 `*_media` allowlist、禁私网地址、
  禁跨重定向、≤12MB、content-type 必须 image/*
- 所有工具 `execute` 接收并传播 `AbortSignal`(fetch/sleep/pollJob 全链路),
  DELETE 中止与请求断开真实终止内部生成等待
- 收费/写请求零自动重试(防重复扣费);只读 GET 指数退避 ≤3 次
- `ensureModels` 用闭包 auth 把 `AGENT_API_KEY/AGENT_BASE_URL` 注入 pi-ai,
  未配置独立通道时才回退站内模型配置;敏感值仅在 `.env`/部署环境中保存
