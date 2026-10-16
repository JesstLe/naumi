# 后台模型链路：前端名称 → 实际请求 → 上游确认

## 本地完成，未上线
- 分支 `codex/bi-model-chain-20261016`，堆叠BI原图/结果图 `3787b75d369b0fca1e492a36565f14d30bcb8dbc`；刷新origin/main仍 `c2634fba41fd50a117f9af93e63d865e446f7394`。仅提交本任务增量，不整支覆盖同事未提交后台CSS。
- 后台模型调用、操作任务、图片执行审计增加前端显示名称、展示模型关联ID、实际请求模型、上游确认模型与证据状态；详情按物理尝试逐一配对，多个通道/尝试不被覆盖成一个模型。
- 原有接口请求值、平台解析ID和接口响应模型保留独立语义，不再把路由前别名叫作实际提交；界面不将请求参数冒充上游确认。

## 记录与关联
- 从已接受的不可变模型配置版本恢复与选择器相同的名称（图片家族使用compactImageModelOptions），在BI调用行保存名称与ID。当前配置改名不覆盖历史行。关联ID是冻结解析时的模型ID，图片比例路由可能对应家族变体；本任务不声称逐个UI点击事件已埋点。
- 不在严格校验的ExecutionModel/任务payload增加序列化字段，旧Worker/旧代码仍可读取新任务冻结配置；作用域frontendModel仅运行期元信息，恢复后按原modelVersion读取，不读取最新配置补猜历史。
- AsyncLocalStorage创建每次观测callId，supplier_calls新增nullable bi_call_id并与BI行精确关联。同一会话多次/并发调用不以时间近似或相同operationId乱配。
- app_bi_model_calls新增frontend_model_id/label默认空；supplier_calls新增bi_call_id和索引，均为追加迁移，空旧记录不伪造点击名称或底层模型。现有HTTP边界已记录实际model与响应actual_model，本次补充SSE逐块model并沿用回执解析。
- SDK异步流结束更新同一BI行的模型、usage及状态；中断/取消不写成成功，不新增POST/重试。直接Response与流适配器可依靠下层supplier_calls更新实际回执。
- 后台只返回白名单模型/通道/阶段/状态，不返回URL/密钥/原始凭据和回执。原后台二次鉴权和no-store保持。公开更新说明完全不修改，本任务属于内部功能，不加入公开记录。

## 集中验收
- 独立本机PostgreSQL16 tmpfs容器 `naumi-bi-model-chain-pg-20261016` / 回环15439；每轮独立随机schema，不连接或修改其他容器/生产DB。
- `verify-bi-model-chain.ts`：真实executor/observeOpenAI/modelAwareOpenAI/HTTP传输/supplier账本/BI查询，4次仅本机HTTP POST（两次同会话并发＋单次＋SSE）；额外两次内存fallback响应验证成对证据，不调用真实供应商。名称快照/家族展示/任务冻结恢复/并发精确callId/owner隔离/失败只1次/任务汇总/未确认通过。
- `verify-private-bi.ts`真实隔离DB/API回归：管理员边界、数据视图、日期/独立聚合、媒体/执行证据脱敏、CSV等通过。
- 完整TypeScript集中验收退出0；实际ModelChain组件桌面/390px HTML预览及效果图已检查，演示名称非用户真实记录。四件产物与精确命令在 `E:/Workspace/naumi/output/bi-model-chain-20261016/VERIFICATION.txt`。

## 边界与下一步
- 历史未记录前端名称/精确callId时显示未记录/未确认，不按当前配置或同会话时间猜测。未通过observeModelCall关联的原生Agent/视频/某些自定义传输仍可能缺底层callId；原有响应字段继续展示，不能宣称所有协议和历史记录全覆盖。
- Router尝试依靠现有只读outbox导入继承biCallId；导入尚未到达/回执没有actual_model时仍显示未确认，原执行链路只读入口保持；不为补证重发任务。
- 待统一候选真实前端选择→后台链路、公网/Worker/Router延迟恢复验收及三锁蓝绿。无SSH/锁/候选/切流/Worker进程变动，不将本地验收称线上已完成。
- 回滚只恢复代码；保留新增nullable审计列/已有记录，不删除生产审计表，不回灌数据库或重放已接受任务。原ExecutionModel字节结构保持，副本恢复原hash与旧观测字段行为，当前候选保留改动。
- 功能迭代1；提交前再次fetch main，无发布次数变化。
