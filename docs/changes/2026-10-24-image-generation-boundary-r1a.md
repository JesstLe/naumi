# R1A1：生图执行边界重构

日期：2026-10-24。工作树 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。本轮是首个图片执行切片，不是全项目重构完成；不操作发布现场。

## 基线与范围

- 原架构方案提交：`91d845ab136fd8eabee21e312aa2ef3855bb6880`。
- 开工刷新 `origin/main=905c8c635e41ff3f4443d43db9776d1db3aab469`。
- 普通合入 `9fc284514aeaed740cdf55cc49b611445676b517`，保留质量回退、supplierRouting报价、catalog与Canvas价格修复。
- **重构基线：`4478cdca88a6e52b5db186d30ace4ef8724263c7`**。完整原始源归档在 `output/refactor-r1a-20261024/BASELINE_SOURCE.tar`，SHA256 `badaadcf31c031915def07d2a4fc0b76b0b7933fc7d65b7f94fbba96cba3b1bb`。
- 本阶段只完成生图 typed 执行/旧HTTP共用实现。抠图仍使用独立兼容桥，生产业务→route 从2条剩1条；不把 cutout 标成完成。

## 实际改动

| 归属 | 文件 | 改动 |
|---|---|---|
| HTTP适配 | `src/app/api/generate-image/route.ts` | 保留解析、来源/身份、legacy frame、原回执、GET呈现和Worker入口，提交调用同一 `submitGeneration` |
| 公开数据类型 | `src/lib/imagegen/generation-types.ts` | `GeneratedImage / GenParams / GenerationResult`；浏览器组件不再从route导入类型 |
| typed步骤 | `generation-core.ts`、`generation-operation.ts` | 已授权素材直接传字节/参数，移除生图的内部Request/FormData/cookie和route import；返回typed结果 |
| 提交用例 | `generation-submission.ts` | 统一验证、冻结计价输入、任务创建；身份/报价通过窄函数传入；不解析HTTP |
| 任务执行 | `generation-runtime.ts` | 原JOBS、runJob、恢复入口；原lease/checkpoint/settle保留 |
| Provider | `generation-provider.ts` | 原generate/edit/Flow/归一化实现原语义迁出 |
| 图片处理 | `generation-output.ts`、`generation-prompt.ts` | 原画幅/尺寸/放大/存储与prompt函数迁出；13个函数去export后打印语义对照一致 |
| 原回执 | `billing/intent.ts`、`billing/submission-identity.ts` | HTTP与typed路径共用claim/save；沿原表、原ID和原fingerprint，不新增任务系统 |
| 冻结价 | `billing/server.ts` | 提取 `quoteForImagegenStep`，HTTP/typed共用完整原报价校验，不重算current |
| 模型事实 | `model-config/requests.ts` | HTTP解析与 `withModelOperation` 事实入口分离，底部同一个resolve实现，质量回退逻辑未重写 |
| 身份 | `native-auth.ts` | 从原cookie路径提出相同账号有效性查询，trusted actor无需伪造cookie仍保留不存在/封禁/过期拒绝 |
| 兼容 | `legacy-cutout-request.ts`、`operation-id.ts`、`adapters.ts` | 旧抠图桥明确隔离；原step ID算法原样保留；parent读取typed body |

这次没有先创建空 `modules/*` 目录。利用已有 `lib/imagegen` 领域归属完成真实调用切换，后续整目录迁移时不再改业务语义。`JOBS`的HTTP查询呈现仍在旧route，统一read用例后续完成。

### 关键兼容点

- multipart会把字段里的换行标准化为CRLF。新typed路径显式保留这项历史指纹/参数语义，避免旧intent在升级后冲突；不是按原始LF字符串重新算身份。
- scalar字段、重复图片顺序、mask独立字段、原文件名/字节、model header以及step ID保持一致。6个场景与旧真实parser及旧multipart身份对照。
- 旧内部HTTP原来隐含初始化创作表。typed入口在原无context的路径显式初始化并建立personal上下文；已有tenant/workspace上下文原样继承。
- 错误投影从HTTP Response提取为 `billingFailure`，HTTP依旧包装相同响应；已明确拒绝按原逻辑删除claim，未知/5xx保留原claim。
- 13个provider/processing/runtime函数保持原逻辑。正常与stored-delivery共用continuation属于R2，本轮没有假定已完成。

## 验证与已知差异

所有PG运行均指向本任务独占 loopback PostgreSQL，随机schema；供应商为loopback真实PNG fixture，未调用外部供应商。

### 核心A/B

- `verify-imagegen-execution.ts`：完整基线与修改实现均通过；覆盖透明生成、蒙版、旧HTTP、新imagegen、未知结果不重提、完整计价及Agent本地处理。
- `verify-image-generation-boundary.cjs`：baseline 6检查；modified 41检查/6场景，旧multipart指纹与实际parser结果相等，13个迁出函数语义一致。
- `verify-image-generation-receipts.ts`：完整基线与修改均22检查通过；旧回执复用、unknown不POST、冲突owner/输入、缺账号/封禁/过期、并发一个child、真实发布current模型/价格后保留完整原quote、一笔consume、零剩余预占。

### 沿用回归

- 图片batch/Agent batch/取消行锁/部分成功账务：通过。
- 定价减法：25 cases / 74 checks，通过；fixture补上合入Canvas修复已需要的workspace revision API。
- Canvas真实PG：23检查；routing：35 cases；catalog/client：22组，通过。该catalog verifier需要原固定Canvas文件，本轮从905c8c6读出并核对其原SHA，而非伪造空fixture。
- 交付重试：4故障点；source frame：70检查；admission：53检查；auto ratio：133检查；billing coverage：30入口；比例warning与quality标签5场景均通过。
- source/AST verifier迁到读取实际新文件，不复制产品实现。历史固定SHA的APIB发布材料不改写。
- TypeScript全项目检查通过；lint及最终回滚结果见本轮 `VERIFICATION.txt`。

**保留的旧测试差异：**`verify-imagegen-frozen-quote-pg.ts --simplify` 在完整4478基线和修改版都于第226行失败，literal `200 !== 409`。它仍期待过期报价被拒，与已经合入的去TTL误拦规则冲突。原日志未覆盖，业务代码没有为旧断言恢复TTL；本轮未把该脚本记为通过。原价/TTL/权限由当前25/74定向verifier以及本轮真实PG回执测试覆盖，不将旧失败删除或升级成绿色。

`verify-model-execution.ts` 在完整基线和修改版同样于第268行失败：仍期待图像旧版本报价抛 `MODEL_CHANGED`，实际未拒绝。保留两份exit1日志，不改回业务旧门槛；该脚本后半段未运行，不标成全覆盖。独立 `verify-billing-intents.ts` 的未知/重复异步提交检查已通过。

结构复扫：旧route从1269行/46内部依赖变为219行/20依赖；生图业务反向route import已移除。最大静态环仍54文件，视频20文件环未动；动态恢复环因职责提取从7文件分量变为9文件，尚未解决，不用文件数下降冒充全仓低耦合完成。

初始失败也保留：TypeScript抽取遗漏prompt常量/导入；typed入口缺creation schema初始化；测试发现multipart CRLF差异；少量AST/VM fixture未追随调用/导出拆分。修正后只集中补跑受影响模块，不重复全家族suite。

## 交付和回退

本轮四产物位于 `output/refactor-r1a-20261024/`：

- `MODIFIED_FILE.tar`：本任务最终源文件和模块文档。
- `DIFF_FILE.patch`：相对4478固定基线。
- `VERIFICATION.txt`：命令、输入、literal、exit、哈希及失败记录。
- `ROLLBACK.sh`：只对明确目标副本、且修改后哈希匹配时恢复原文件；新增文件逐个移除。实际工作树保留新版。

独立副本验证恢复原hash和原调用行为，再运行原源码PG测试；不涉及业务库/媒体/服务回退。

## 后续

1. R1A2：将cutout同步账务与步骤调用从HTTP桥收敛到typed用例；同样保留原receipt。
2. R1B：准备/参数/价格决策的唯一归属，不在这次搬迁里改变计价策略。
3. R2：正常与原字节恢复共用交付continuation。
4. 全项目54文件核心环、Canvas状态拆分、DB所有权和Worker执行位置仍在后续台账；本轮不声称解决。

功能迭代计数：首个闭合切片完成后计1；文档/工具修补不另计。服务器发布与其他重构线保持独立。
