# 模型映射 103 独立验证线：单次参数翻译

## 固定边界

- 用户指定独立分支 `codex/model-mapping-103-20261029`；基线 `c328f01c5a1854bce271fa53e64d324986df9329`。
- 只允许 main 合入此分支，禁止反向合 main、cherry-pick 或补丁复制进生产整合。分支持续保留，仅103测试发布，47维持现状。
- 103允许本分支固定SHA发布；数据/媒体/历史任务保留，仍按目标锁、备份、蓝绿、回滚与实际版本验收。

## 模块与职责

首模块只修应用内APIMart新参数计划中semantic quality与wire quality混用导致的二次映射。复用既有image-parameter-plan，不新增价格系统或通用框架。

## 公共接口、依赖与状态归属

`apimartExecutionParameters`读取服务端冻结的原始选择及明确阶段输入；参数编译器拥有raw→wire翻译；适配器传输拥有供应商受理身份；报价和账务模块继续拥有客户价格/预扣/结算。旧冻结任务和成本preset兼容语义保留，未知受理继续原ID恢复。

## 本次实现与迁移状态

- 已创建独立worktree，正在固化隔离规则。
- 产品修复、集中回归、固定构建、103发布及全链路验收待完成。
- 已确认缺陷：合法high→medium/medium→low映射中，quote.effectiveParameters的wire medium被重新当raw choice，最终发low而非medium。

## 验证与证据层级

本阶段仅规则/源文件检查；不将此前纯函数复现当本分支完整HTTP/PG/SDK验收。任务证据记录于ignored `output/model-mapping103-20261029/`。

## 未完成项与下一步

先补非幂等映射及报价/原ID恢复对照，再完成最小修复；103实时基线、同事占用和收费测试边界单独核对。现无本任务服务器动作或供应商调用。

## 同步与计数

功能模块计数0；开工已fetch main，固定c328f01c。文档修改不计功能迭代/发布。共享根AGENTS其他人重写未带入本分支。

## 首模块实际实现与集中验证

- 新版非preset APIMart构参只用冻结阶段semantic quality；operation与quote.effective中的wire别名不再反喂。既有resolution/ratio顺序、成本preset和无版本标记的旧任务保持。
- 同一问题还出现在clients.ts进入真实transport前调用的image-plan-runtime默认选择；已一并使用冻结facts，避免medium→low在适配器前因raw low不在显示选项而失败。业务阶段明确selected或新的冻结阶段上下文仍可编译。
- 产品范围仅 `apimart-preset.ts` 与 `image-plan-runtime.ts`，13新增/3删除。
- 定向真实模块57项/15case通过；真实本地PG→plan→child→实际SDK→APIMart异步HTTP→2048²落盘→账务52项通过。high原4K报价/预扣/结算12、实际wire medium；medium报价/结算8、实际wire low；两原ID恢复新增POST0。测试供应商仅loopback，外部调用0。
- 原文件完整链路26项复现high实际wire low而报价仍12。两源原始SHA保存在output/BASELINE.json。
- 既有异步适配器、参数计划PG及全量tsc通过。旧成本preset套件line62期待报价确认拦截，但本分支基线c328也同样失败；原失败和基线失败保留，不归因本补丁。对照副本只调整该已过时断言后再测其后续成本/账务路径，结果另入证据。

## 新增用户授权：配置与真实验收

用户要求把47所有供应商执行配置复制至103；47仅只读导出，103按本站凭据加密、版本化发布。供应商/模型/通道映射按源，103用户、作品、媒体、余额、账本、历史任务与客户计价保持，默认/业务定价依赖逐项对照。

用户最后明确取消本轮103出图预算上限；真实调用仍围绕本轮端到端验收逐笔记录，不启动自动收费巡检，不重放已接受/未知任务。原2张/1USD上限已被此最新指令覆盖。

## 现场预检（2026-10-29）

- 103只读：Web/组合Worker source ca65f973/build1793200513，同image73a91f94…，Web13106，canonical200；约5.8GiB MemAvailable/51GiB磁盘可用，观察时无目标部署锁holder。
- 47只读配置：v152，9providers/95upstreams/50publics/0pools，无在途publication；当前供应商地址均公共HTTPS。加密导出引用9凭据及94个配置模型metadata，源数据库写入0/供应商0。
- 103只读模型v112/billing8；本机Docker数据盘可用不足10GiB，构建改为103受限独立构建器，实际执行前仍复核容量与锁，不清理他人缓存。
- 以上只读预检不是部署或配置发布成功。固定构建、目标配置发布、103全链路真实验收继续进行。

## 集中收口与固定候选

- 已普通合入 main `154a7f9fc4a13726fd6b666c0d959edb6ea01c30`，含 X6 原任务有界轮询与上传解码内存修复；本分支没有反向合 main。
- 固定应用构建源码 `26ecb4f62f6f73c6917fe93d840b6e3630a756d9`；源码产品仍仅两个文件最小修复。合并后57单次翻译、52真实PG全链、53异步、25 X6、16计划PG、28复制纯函数、30发布门禁及全量tsc通过。
- 原成本preset测试两项旧期望（报价二次确认/旧草稿直接再发布）与当前main不符。仓库测试保留；output副本仅对齐两项现行规则，实际成本、预扣、结算、冻结、原ID恢复及发布回退全通过，不将原套件写成全绿。
- 基于合入main的原文件复现、修改态全链、真实Bash独立副本回退及旧行为复现均exit0，四件位于 `output/model-mapping103-20261029/source-proof/`；正式源码保持修改态。
- 供应商复制纯候选154delta：source152的9providers/95upstreams/50publics全部覆盖；103旧有专用条目保留，候选19providers/120upstreams/61publics/4pools。16项同ID公模target变化逐项列审，保留目标reverse-hub服务地址。1368组旧公模客户报价对照无差异。
- 源47追加只读采样：v152同digest，引用video definitions为0、当前版本冻结video defaults63条；凭据9与metadata94均安全封装。103 CLI以官方凭据/metadata/repo/runtime API做独立版本化publication，65项真实PG与最终bundle通过；未执行服务器配置导入。
- 真实端测QA候选仅103新增独立alias/upstream，high→medium/medium→low，4K实际2K。103 billing8默认组真实报价 high4K=16、medium4K=12；不以隔离fixture12分规则覆盖本站价。原选、原报价与实际wire分别验收。
- 首构建尝试发现103缺buildx CLI，发生在创建builder前；旧Web/Worker及网关保持。受限构建改为任务目录内校验官方checksum的独立CLI，不全局安装、不改Docker服务；构建仍不是部署。
