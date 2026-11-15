# 最新 main 固定程序与不同源码版本集中验收

## 模块与职责

本轮固定主线 `19d983853d90154b9c5e9efdecac0806b53a2ceb`，补齐6037 Canvas新提交入口清理后的完整程序证据。既有Dockerfile、生产Web/独立Worker/native媒体、原发布owner/CAS/lifecycle/浏览器驱动保持，不新增发布器或模型校验层。

## 固定包与依赖归属

- 完整原Dockerfile构建exit0，版号 `1794718498`。
- 实际镜像 `sha256:0a94c8b8a6400ef44fe9c27ad4ee85fd658c92907d97d1358c31b05caf3ec5af`，tag `naumi:video-main-19d98385-20261115`。
- Next15.5.28，真实BUILD_ID `JM8bj2x9PRczgDp7xC9uJ`；原生deploymentId包含实际19d源码/版号/standard，未改写BUILD_ID或RSC b。
- Worker578个tracked源输入逐项匹配固定git archive；原依赖闭包与格式描述检查由完整构建执行，LinuxWorker49通过。该次业务改动在Web提交入口，Worker bundle SHA保持原值是正常事实，不伪造新的Worker差异。
- 实际Server Action manifest条目0，不将只读RSC验收泛化到未来Action。
- 完整源码归档位于 `C:/Users/13357/.t3/scratch/naumi-video-main-source-19d98385-20261115.tar`，SHA256 `94bbd9f8e1066ee8b13650d4f7667a1e6973c181e3c329cfb98d4f59df14bfc4`；构建上下文C、Docker WSL在D，E不再增加全量源码tar。

## 不同业务源码切流与回滚

旧完整包6685D/1794714127 → 新完整main19d/1794718498 → 回旧。相对旧包，实际产品源码差异为node-submission的重复输入编排退出（9增/46删），而非仅相同源码换build号。

源运行已通过81项实际Nginx/原创建器/Worker/PG/native/lifecycle及11项严格Edge检查。两个原始浏览器上下文窗口内各1份文档，升级0、pageerror0、旧资源404为0；原生deploymentId与实际renderer身份匹配。API与双向草稿保存走当前槽；真实期限GET fallback200，剪除过期路由再退役。UNKNOWN不重发，回滚不回灌资产/账务，4次fixture创建、3笔视频账本41 fixture积分；7槽/schema/network/browser清理。

这是固定版本对、四个审查页面和兼容窗口的本地真实执行，不推导任意业务版本、无身份旧客户端、其他页面或Server Actions均零刷新。源/独立副本与完整组合最终命令、数量及exit以 `E:/Workspace/naumi/output/video-main-package-20261115/VERIFICATION.txt` 为准；尚在执行的组合不先写成通过。

## 全入口集中组合

同一不可变生产程序运行原全入口/预算/Agent/ComfyUI/RunningHub/AutoDL/Workflow/高级输入/未来元素组模块，并通过owned session接工作台、历史、分镜、三媒体路径和草稿恢复。原源码、HTTP、组件和React状态不被成功响应替换；供应商仅本地fixture。完整结果在本记录末尾追加，不能用底座计数代表所有模块。

## 构建资源与实际站点

构建前C/D/E均大于10GiB余量，但利用率超过80%。本任务对旧失败fixture副本/镜像的清理命令在创建进程前被工具拒绝，实际删除0，未换工具/脚本重试删除，未执行prune或删volume。保留原归档、失败/成功镜像、运行服务及回滚引用；使用C/D现有余量并限制2构建CPU，结果与实际空间分别记录，不声称释放空间。

默认103只读复核仍SSH255（连接关闭）、匿名版本HTTP52（空响应）；没有取得当前在线版本/绑定/env-only目录，也不据此断言站点离线。47 HOLD，其他站点未连接。完整固定包/本地切流不等于实际站点发布；实际Binding迁移、全业务collector/既有Agent与Worker归属、容量/锁、授权上游与目标站蓝绿继续开放。生产配置写入/付费/部署0，总目标ACTIVE。

## 最终集中结果

源与独立归档副本的不同源码版本切流各81项实际运行＋11项严格Edge通过，0文档升级、真实到期回当前、回滚后新操作仍可受理；各7槽/schema/network/browser清理。13路径包在副本真实回退后，旧缺Binding输入路径再次复现、原core137保持，源码/ZIP保留修改版。

首次FULL把所有模块压到同一fixture actor的10分钟窗口，实际命中生成30/10min限流，整轮exit1保留；其UI43通过不算整轮成功。最终INGRESS_UI覆盖全部入口/预算/Agent/远程Workflow/BYOC/结构Workflow及UI43，ADVANCED独立覆盖高级输入36＋底座15，两个命令各exit0；联合覆盖原全部模块，没有修改产品限流、清空限流状态、改时钟、重放真实用户任务或删除失败日志。

INGRESS_UI精确计数：{"baseProcessChecks": 15, "modules": {"AGENT_PROCESS_RESULT.json": 6, "BUDGET_PROCESS_RESULT.json": 10, "BYOC_INGRESS_PROCESS_RESULT.json": 21, "BYOC_PROCESS_RESULT.json": 8, "INPUT_EQUIVALENCE_RESULT.json": 21, "PRODUCTION_UI_RESULT.json": 43, "REMOTE_WORKFLOW_PROCESS_RESULT.json": 10, "STORYBOARD_BROWSER_RESULT.json": 10, "STRUCTURED_WORKFLOW_RESULT.json": 16, "WORKFLOW_PROCESS_RESULT.json": 13}, "ledger": {"n": 39, "amount": 653}, "supplierJsonPosts": 40, "downloads": 42, "browserChecks": 43}。ADVANCED精确计数：{"baseProcessChecks": 15, "modules": {"ADVANCED_INPUT_RESULT.json": 36}, "ledger": {"n": 13, "amount": 211}, "supplierJsonPosts": 14, "downloads": 13}。模块子计数可能属于UI43等上层组合，不把重复子项再相加；完整JSON/路径/命令见SUMMARY和VERIFICATION。

Worker49与578源哈希、源码归档/镜像身份、版本及真实无Action事实保持。当前新包真实LinuxWeb/独立Worker/native媒体/PG和生产UI证据，不是付费上游或站点发布。103运输复核仍未取得配置；总目标ACTIVE，47 HOLD，生产配置/付费/部署0。
