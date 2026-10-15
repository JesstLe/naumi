# 通道与已配置模型健康巡检

## 已确认策略

- 只枚举当前已发布配置中启用、已配置凭据的 upstreamModels，不读供应商完整目录、草稿或禁用配置。
- 成功业务生图包含真实图片下载及解码；最近6小时有成功业务调用则不主动生图。
- 否则单目标单张巡检；全系统所有模型合计每上海自然日最多12次。失败和受理未知也占次数；手动检查不绕过限制。
- 数据库统一原子预算、全局串行租约、固定操作ID。进程中断后的受理未知不自动重发，需管理员核查；通道/模型变更不继承旧健康。
- 固定被测供应商和wire model，不走备用路由。系统巡检只进入供应商成本账，不扣用户积分、不创建用户作品。
- 供应商健康由其已配置模型聚合，区分全部健康、部分异常、全部异常、待验证；不把HTTP200/目录出现当健康。
- UI浅色布局；管理API独立管理员鉴权/同站写校验。所有列表只含状态码/受控原因，不保存提示词、密钥、原响应或签名图片URL。

## 模块进度

1. 设计/源码调查完成，费用策略已确认。目标去重/持久预算/巡检执行/业务观察/管理API已实现。
2. 数据库fixture通过：24并发竞争仅1个运行、全局12次上限、上海跨日、业务6h抑制、过期/未知不重提、失败优先于历史成功、凭据/参数变更、401/403/402/429/503、HTTP200空/损坏/下载失败、系统供应商成本与客户积分隔离。
3. 浅色管理页由 GLM-5.3 实现，6.1负责接口设计/后端/复核。真实本地Next+PostgreSQL+无头Chromium验收1440/390无横向溢出/pageerror0；独立Worker实际命中受保护tick，配置3模型只生成2张模拟图，近期业务成功模型未探测，目录请求0。均非真实供应商质量/线上验收。
4. GLM费用边界复核的本地并发误判、受理未知丢失、重复解码、人工核查入口、文本异常归类已修正。容量满在提交前跳过：不标红、不占每日12次额度，5分钟后再候选。已验收Response只用进程内WeakSet识别，不能由上游伪造响应头跳过验证。
5. 管理员核查使用受控确认+观测时间乐观锁+审计表；原任务已终止才解除暂停，至少再等6h，保留原unknown/成本记录，不重发原操作。

## 实现边界与运维接入

- 主动生图适配 openai-images（含Reverse Hub）、new-api-flow、已发布APIMart成本预设。其他协议显示仅业务观测/待验证，不猜测协议参数、不用备用通道冒充被测模型成功。文本仅接收完整有效文本/SSE的被动证据，不自动付费调用文字/视频。
- 模型指纹包含供应商ID、协议、endpoint、credentialRef、真实wire model、参数/能力/预设。完全相同配置项去重；不凭模型名称后缀猜测合并两个真实模型。密钥轮换产生新credentialRef后历史健康不继承。
- `src/lib/model-health`负责状态、预算和调度；业务图像在具体执行层完成下载/解码后更新被动健康，图像代理/DNS/内网拦截规则保留。Flow受管下载改用既有安全传输与32MiB有界读取。
- 新页面 `/admin/model-health`，管理API `/api/admin/model-health`；禁用策略同时暂停自动与手动真实巡检；手动检查一次最多取一个到期模型。
- 独立常驻入口 `node scripts/model-health-worker.mjs`，默认每60秒tick；数据库全局串行防多实例重复。App与Worker通过同一受保护环境变量 `MODEL_HEALTH_WORKER_SECRET`（至少32字符）鉴权，请求头只在内存使用。不要复用其他管理密钥，不写进仓库。
- 固定候选镜像包含worker脚本；`deploy/model-health-worker.compose.yml`可与本站compose合并，worker无公网端口。设置 NAUMI_IMAGE、NAUMI_APP_ORIGIN、MODEL_HEALTH_ENV_FILE，后者为受保护环境文件；App也要读到同一独立worker secret。未启动worker时页面明确显示尚未心跳，策略开启不等于调度已运行。
- 回滚先停健康Worker，再切回旧App；新增表为扩展式，保留预算/受理未知/供应商成本和核查审计，不drop、不回灌业务DB。源码逆向patch只在另一个隔离副本验收。

## 复验命令（独立本机PostgreSQL）

设置 `NAUMI_VERIFY_ISOLATED_DB=1`、`DATABASE_URL` 指向127.0.0.1隔离库、`NODE_OPTIONS=--conditions=react-server` 后运行：

```powershell
node node_modules/tsx/dist/cli.mjs scripts/verify-model-health.ts
node node_modules/tsx/dist/cli.mjs scripts/verify-model-health-regression.ts modified
node node_modules/tsx/dist/cli.mjs scripts/verify-model-execution.ts
node node_modules/tsx/dist/cli.mjs scripts/model-health-ui-fixture.ts
# 另一个终端移除 NODE_OPTIONS 后运行；可指定独立Chromium可执行文件。
node scripts/verify-model-health-ui.mjs
```

UI fixture独立schema，只有本地模拟供应商；固定54987端口与output元数据，停止使用元数据control的`POST /stop`。依赖应位于同一Windows盘，跨盘Next junction导致dev入口/字体解析失败；复制Next/Geist为本worktree依赖后已通过。Next自动改写的tsconfig已恢复原内容。

## 验证与发布边界

集中验证配置3个/目录数百、6h抑制、全局12次、多实例并发、上海跨日、异常输出/下载、凭据/参数变化、未知不重提、管理鉴权/CSRF、不扣用户积分。
本模块尚未发布；真实外部供应商调用0、未连接/变更生产服务器，不把Git提交或模拟供应商结果写为线上自动巡检已运行。
共享checkout保持原分支，本任务分支 codex/model-health-20261015，worktree C:/Users/13357/.codex/worktrees/model-health-20261015/naumi。
开工已fetch；累计完成3模块后再fetch，发现main新增Geeknow服务端无限并发策略及部署运维修复，需保留并整合后集中回归。上线前另核对47当前两槽和同事已部署overlay，保留原生功能，不涉及其他服务器。
