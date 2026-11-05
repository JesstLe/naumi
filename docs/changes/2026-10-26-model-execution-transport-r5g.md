# R5G：执行transport、路由组合与SDK工厂

## 基线与目标

独立工作树`E:/Workspace/naumi-refactor-20261024` / `codex/core-refactor-20261024`，完整基线`da2e85a75c267dbbaa14084b792b9dc9555895aa`，4359个原文件已归档并核对hash。开工main刷新为`368c93e2`，本轮为同步后第1模块，不合回main、不部署。

原clients同时持有SDK构造、协议/质量/分辨率映射和路由选择；channel-fetch、stage-routing反向import clients执行下一attempt，构成3文件环。

## 实现

- `execution-fetch.ts`作为唯一执行组合点，保持supplierRouting优先、business stage其次、直接provider最后；健康观察每层位置不变。
- `execution-transport.ts`归原provider协议适配及Flow翻译，移出两条路由dispatch，其余原声明正文保持。
- `channel-routing.ts`、`stage-routing-policy.ts`归原通道/阶段策略。attempt执行factory通过必填函数参数传入，不再import组合层或SDK，也不设置全局registry。
- `clients.ts`保留SDK工厂、managed multipart入口及模态派发/WeakMap/maxRetries0，executionFetch保留同函数重导出兼容。
- 老channel-fetch/stage-routing只留兼容出口；健康probe、Pi实际fetch消费者改绑新组合owner。
- 不更改priorities、权重、成本累计、冻结参数、原operation、未知收费不重POST、文本首token后不拼接新供应商、SSE租约释放及错误分类。

## 验收

| 项目 | 实际结果/边界 |
|---|---|
| 全生产声明对照 | 7191原声明保持；6迁移；仅3处明确组合改动（provider移出两dispatch，channel/stage增加必填factory参数），10个实际transport/调度/冻结/账务等算法文件原字节不变 |
| 完整源码边界 | 基线9/新版24检查：route正文、SDK三个方法、Flow和映射逐token精确一致，实际构造SDK并验证冻结连接/maxRetries0/managed标记及兼容重导出同函数 |
| emitted依赖 | 旧clients/channel-fetch/stage-routing三文件环拆除，其它所有SCC成员保持、新owner入环0、最大3→2 |
| fetch实际bundle | SDK输入145→0，全部输入1965→1821；仅为模块装配/打包依赖指标，不是延迟/内存/容量证明 |
| 完整基线/新版真实PG矩阵 | frozen execution、text supplier、多供应商、APIMart异步53检查、business routing五脚本全部通过；含真实SDK/nativeHTTP/多进程和冻价/错误/单次结算，不接真实供应商 |
| 原通道恢复脚本 | 原样基线与新版同处exit1；补齐实际父审计context并用running而非review的reconciling夹具后，同夹具完整两树均通过：禁用GET恢复、未知不POST、原任务唯一、missing pointer/租约检查 |
| 相邻PG | model-health多进程/真实HTTP、JSON/multipart供应商合同、分辨率/质量映射、live guard/accepted原通道、历史quota脚本通过。quota字面QUOTA_CASE=OPEN保留，不冒充供应商余额或客户钱包验证 |
| 工作进程/构建 | application Worker2344输入/HTTP route0，真实Linux图片Worker71检查通过；实际Next六入口20及全项目tsc/lint以最终日志为准 |
| 测试库存修正 | coverage AST含当前untracked owner、视频定位到runtime/creation；sunjiang旧断言与源码归属修正，同夹具旧/新均通过。原始失败全部保留 |

原通道恢复失败的原因：fixture一直返回reconciling，这属于明确待核查而非普通running；同时supplier账本没有绑定父job的BI operation。补齐测试准备并区分running（短timeout后按原GET续查）与原review场景，没有改生产runtime/账本/pin算法或放宽unknown重POST。两侧原始失败和中间尝试留证。

独立副本4359hash恢复、恢复后真实PG、四产物/patch重放、最终提交/remote绑定及cleanup以 `output/refactor-r5g-20261026/VERIFICATION.txt` / `DELIVERY.json` 实际记录为准。

旧sunjiang脚本的两供应商样本第一条未声明not_charged却期待fallback，与生产未知不重提冲突；完整基线已复现exit1。本轮修正该fixture收据并改为原policy的显式transport参数，另外源码位置从已拆route改到generation-runtime。原失败留存，不为旧断言恢复重复收费调用。
