# 文字模型通道热更新，保留前端名称

## 范围、基线与真源

用户授权将文字模型切换为 DeepSeek，并明确要求前端显示名不变。本任务仅发布 47 的模型注册表配置，沿用原 APIB 文字供应商及加密凭据，不修改 Web/Worker 程序、环境、媒体、账号、客户售价或显示名。

工作目录 `E:/workspace/naumi-deepseek-text-hotupdate-20261119`，分支 `codex/deepseek-text-hotupdate-20261119`，开工 `origin/main` 为 `5791aed134a8246d1d8e6a477ae2ce39867c7bc0`。后续已刷新 main 至 `d27ffdb2`；模型配置、计费和供应商成本模块在这段 main 差异中没有修改。整合前再刷新并普通 merge，保护其他线程改动。

模型注册表是路由真源；public ID、label、bindings 和客户定价继续使用原配置。新上游独立 ID `apib:deepseek-v4.1-flash`，已有 GLM 上游与历史版本保持，已接受/冻结执行不改写。

## 精确调用名与版本边界

2026-11-19 01:55:37 UTC 使用当前 APIB 密钥只读 GET `/v1/models`：列出了 `deepseek-v4.1-flash`，没有 `deepseek-v4.1-flash-1017`；不向未列出的型号发送生产请求。

DeepSeek 官方 [1017 更新说明](https://api-docs.deepseek.com/updates/#deepseek-v41-flash-1017-update) 和 [模型卡](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017) 声明图文、推理与工具能力。官方 API 的 `deepseek-flash` 更新说明不能独立证明 APIB 的底层权重锁定为 1017；本次实际请求和供应商返回名都是 `deepseek-v4.1-flash`，保留这一边界，不虚报固定快照。

## 修改内容与兼容

新增一个 DeepSeek 上游；以下四个已启用公开模型仅调整 target 和已启用 channel 的 upstreamId，前端 ID、label、可见性、工具范围和其他字段逐字保持：`gpt6Astra`、`hy4-preview`、`agent-vision-7c1e5ed7132de672`、`platform-reference-e33230db3dd7d2f0`。

保留七个现有绑定：agent.text、agent.vision、text.generate、text.title、text.competitor、vision.reference、vision.review。未另行新增原本未配置的 OCR 默认绑定；OCR 显式选择原公开文字模型时复用同一新通道。

新上游 generate/vision 按官方契约及本次最小验收开放，verified 保持 false；不把 GLM 的采购价或成本引用复制为 DeepSeek 采购价。客户计费快照保持相等。前端文字模型目录投影完整相等；香蕉参考图 14 张等其他配置保持。

既有 Agent 运行中的 turn 保留原执行；idle session 的 modelExecutionStamp 包含模型版本，后续新请求会按新版本重建模型上下文并保留已持久化历史。

## 验证

- `node scripts/verify-deepseek-hotupdate.mjs`：退出 0；名称/ID/原配置不变、保留旧上游、选择性回滚保留后来无关修改、字段冲突/后来依赖/重复准备拒绝。
- 完整 TypeScript、Python 编译和 diff 检查通过。初始流类型推断问题在生产探测前修正。
- 当前 APIB 通道实际发出 3 条最小、合成输入请求，maxRetries=0、每条固定 attempt ID，记录供应商成本回执；没有调用应用业务工具或重放用户任务：纯文字流式 stop、红蓝合成图识别并产生指定 tool_calls、空操作工具回执后正确 stop。均 PASS，耗时分别 2804/2541/2501 ms；usage 共 1081 tokens。这不是图片生成或全部业务输出质量验收，不能推断供应商收费为零。
- 生产 PLAN v156 通过，七个绑定均可解析到新上游，完整前端目录和客户定价保持。供应商调用限定为上述 3 条。

## 发布、回滚与资源

既有 repo draft → runtime publish → Router 确认 → markApplied 流程，独立运维 actor，不覆盖管理员草稿。发布前后共持 Naumi、Hub、参考工作台三锁，核对运行 Web/Worker 镜像和 StartedAt，保持程序生命周期文件不变。本次是注册表热发布，没有应用构建、容器重启或 Nginx 切换。

初次探测因短时锁占用在任何请求前停止；r2 执行并通过。证据/回滚包在服务器权限 0700 的 `/opt/naumi-staging/evidence/deepseek-text-hotupdate-20261119-r2/` 和容器私有同名 tmp，凭据未输出。

先保存原模型与计费快照、请求 UUID，再发布；存在请求时必须查询原 publication，禁止重放。ROLLBACK 仅恢复自有 target/channel 字段并移除仍完全由本任务拥有的新上游；保留后来前端命名和其他配置，发现后来引用或自有字段冲突则停止。

工具已普通 merge main 至 `574fa7db9bce47113883cf9177656707142c928a`。PROBE/PLAN 已通过；APPLY 与紧接的 VERIFY 在进入应用操作之前均被三锁拒绝，没有创建 APPLY_REQUEST 或改变当前模型配置。

02:05 UTC 起，`release47-central-ack-20261119-r1` 的独立发布窗口持三锁，最近完成 `02-backup`。不改它的固定模型基线，不抢锁、不终止发布。窗口结束后核对新的运行 Web；执行器支持将原 PLAN、原 UUID、探测证据和未知请求回执迁到继任 Web，不重跑供应商探测或盲目重放请求。新增的两个离线交接测试通过，覆盖已存在请求保留、禁止重做探测、bundle hash 拒绝和 PROBE→PLAN 迁移。

另一发布于 02:17:25 UTC 记录 COMPLETE，02:17:43 释放锁，公网程序切至 `02cce26857ac74b2a8dccbed59074cd3a0c2d744` / `1795053797`。继任容器的一次 exists 辅助检查遗漏清空 NODE_OPTIONS，继承 Web observer preload 后自行 exit143，发生在安装 tmp 或创建 APPLY_REQUEST 前。随后核对公网所有目录/version/health 均 200、版本未变、模型仍 v156；仅为一次性 CLI 清空 preload 并禁用 CLI release runtime，在线容器/主进程/配置不变。

当前待 APPLY/VERIFY；实际配置版本和公网读回待补。发布计数不增加应用蓝绿轮次。
