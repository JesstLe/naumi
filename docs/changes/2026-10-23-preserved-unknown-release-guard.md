# 已跳过 UNKNOWN 费用核查的只读发布保护（2026-10-23）

## 目标与不可变权威

用户明确跳过该历史费用核查；发布必须原样保留，不退款、不重发、不清 UNKNOWN。通用任务 snapshot 允许正常进度变化，不足以保护这个特定任务。因此独立 Guard 对原任务采用更严格的原值保护，不修改任何业务表或任务。

原始私有 baseline 的文件 SHA256 固定为 `512245689fb9884732d6f9f9c7d479ca1481bfe2570b4fa4356fd947b572b041`。生产调用方负责锁定真实原文件路径及这个摘要，不能换成新采样。仓库不包含该文件、行值、账号、提示词、credential refs 或真实任务/调用标识。只程序读取过结构，测试全部使用独立 synthetic 值。

原8表为 video_tasks、billing_operations、gen_reservations、supplier_calls、supplier_variable_costs、billing_reconciliations、billing_api_cost_reviews、ledger（实际均带 app_ 前缀）。每轮按原 columns 显式投影，以原主键排序（reservation 为 job_id，其余为 id），由 PostgreSQL 计算 `COALESCE(jsonb_agg(to_jsonb(projected) ORDER BY 原主键),'[]'::jsonb)::text` 的 UTF8 SHA256，必须等于原每表 sha256；同时在 PG 内比较 JSONB 逐值。空集合新增行、删行、NULL/空字符串、进度/时间、账务任一字段变化均 HOLD。JSONB 数值相等不豁免文本差异，numeric 1→1.0 也 HOLD。

原文件用 Decimal 解码并精确编码，不使用 Python float。PG 输出补充行集为 rowsRaw 字符串，不让调用方普通 JSON adapter 先损失数值精度。原表绝不重新采样或用 SaaS 新列扩展旧 baseline。

## 接口与补充闭包

`Guard(cfg, sql, save)`；cfg 使用 baselinePath、baselineSha256、supplementalPath、allowedAdditiveColumns（默认空）。sql 沿用控制器只读 JSON-object-list 回调；save 沿用 tx.save 独占落盘。establish() 必须早于任何候选动作，只允许一次；原8表及原配置锚点先匹配，之后才建立补充私有 baseline。既存补充文件直接 HOLD，不覆盖或自动恢复。文件普通类型/非 symlink、大小有界，读取原文件每轮重验 SHA，补充同进程固定 SHA，篡改或另建 Guard 重采样均拒绝。

补充表涵盖原 task/唯一 supplier call 相关 cost_jobs、cost_adjustments、call_outputs、billing_intents、全部状态 release_activities、model_execution_stages，以及冻结供应商对应 capacity alias/shared identity 的活跃 provider leases。原 supplier call 仍由旧8表权威保护。supplier-call UUID 与 task/operation 关系必须唯一吻合。cost jobs 按 task:call、payload.callId/operation/operationId/taskId/context.operationId；intent 按 intent-operationId，并覆盖原 idempotency/source 根。补充中的现存行完整冻结，其后增删或任一值/数值 scale 变化均 HOLD。

capacity lease 没有 task 外键，按冻结 provider/baseUrl origin 的 logical alias 解析真实共享 identity，保守保护该共享身份活跃租约，不能凭凭据内容猜关联。可能因同共享账户其他活动而 HOLD；不放宽或推断这些租约与本任务无关。

model 使用当前 active_version（text）、digest、md5(config::text)；billing 必须由 app_settings.billing_config_version 当前 pointer 连接，绝不用最大版本。原 activity 保持原 unfinished 口径单独比较，补充则冻结全部相关 states，防止漏掉新 finished 活动。原采集 generationPosts=0 是声明常量，不是 SQL/HTTP 观察；回执明确 generationPostsDeclarationOnly=true。持久执行尝试由 calls/stages 的严格冻结保护，真实是否产生 HTTP POST 仍由根任务的无重放门禁和实际执行证据证明。

新增列默认零允许。若根任务逐项审核允许，格式为 `{表:{列:{pgType:精确PG类型,jsonValue:审核常量}}}`，类型和每个受保护行的新增值都单独核验；NULL、false、0、空字符串互不替代。原列继续按原 SHA 验证。配置锚点表不开放新增列豁免。

check(stage) 用唯一编号写脱敏阶段回执，只包含 MATCH/HOLD、表名、count、SHA、match/hashMatch/additiveSafe 等。SQL或save抛出的外部 Hold 也会锁存；无法保存证据仍 HOLD，不回显私有错误。曾 HOLD 后原值恢复也不清锁存。根任务在候选前、切流前、每个旧槽停止前、final、failure前后调用；权限故障时仍可安全封公网503，但不能标 COMPLETE、退款、改库或切不兼容旧程序。本模块不做封口/发布动作。

## 验证与未完成

本机 Postgres16 已有 55439 隔离 cluster，每次测试创建唯一 preserved_unknown_fixture_* 数据库，结束 DROP；不改预览库，未连接47或供应商。最终冻结文件的15项集中测试通过（14项真实PG、1项纯精度契约），日志 `output/saas-linux-release-20261023/preserved-unknown-tests.log`。约40个子场景覆盖大整数/小数精度、NULL/空/零、进度/时间变化、原8空表新增、缺表列/类型、未知新列、审核新增列安全值、各关联新增/变更、原 SHA/补充篡改/二次建立/锁存、共享 lease、当前billing pointer和无关活动。

最终同一轮15项包含真实依赖 Hold 锁存（SQL Hold 与 save Hold）、numeric 1→1.0（不只用0→0.0类比），均以同一个 preserved-unknown-tests.log 为最终证据。py_compile 与 diff --check 通过。安全审阅独立只读检查未发现新增 P1/P2；它没有执行本组测试或读取私有 baseline。

本地测试不代表原512基线在47已重新匹配，也不是线上发布通过。根任务负责正式路径/摘要绑定、阶段集成、实际只读47核验、最终固定候选和三锁蓝绿/排空/维护封口。此模块只拥有两个新脚本与本文，不改 SaaS Controller、通用 ops 或公开更新说明；未单独改 main 或服务器，最终同步与功能计数由根任务统一登记。
