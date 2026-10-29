# 模型映射 103 独立验证线：单次参数翻译

## 当前交付状态（2026-10-30）

**首模块已在103完成真实端到端闭环；分支持续隔离，不合main，不推广47。** 本次不是整个映射平台或全部模型的验收。

### 程序与配置

- 运行应用 source `26ecb4f62f6f73c6917fe93d840b6e3630a756d9` / build `1793281509` / Web+Worker同image `sha256:f00f1ae321858a09549ff5ef56c1c528a26f7819baea3d29bcfff0e04d86ca39`。
- 原事务 `release103-mapping-20261029-r3` 于北京时间2026-10-29 23:57:53 COMPLETE；旧Web/Worker停止且restart=no，新pair正常，最终7运行容器、canonical revision252、两锁已释放。运维后继版本 `ae3eeac5` 与运行应用版本分别记录，没有为运维脚本重建应用镜像。
- 47供应商来源固定v152/digest `51f8a49f6cc4e73415c703175e466b9e4f2633f5a6033d9f9d6aef264659e884`；仅源站只读，无跨站用户、作品、媒体、余额、账本、任务复制，也不是持续同步。
- 103供应商publication `41f9fddc-a312-4a12-835e-ab27a8757847`，v112→113，phase原值`applied`。纳入全部9供应商/95上游/50公模，9凭据经103密钥新UUID重加密、94条来源metadata；保留target-only后总计19providers/120upstreams/61publics/4pools。63视频冻结definition/profile逐条与来源一致，不等于付费视频交付通过。
- 临时QA追加2条为v114/publication `f4e52522-8b69-4973-a0d9-6d2c0f212b59`；验收后选择性移除2条为v115/publication `c52a0e16-6c40-4084-a856-da5c31ad32d2`，phase原值`applied`。最终v115配置digest `02ae77b2978c9d8312d46f5be33efca04e2b3249efee6ccecf436232c5480460` 与供应商复制后的v113完全相同；历史v114/任务/凭据留存。
- billing8原始配置完整对照不变，客户默认、售价保留；供应商来源启用/禁用按47快照复制，不把所有登记项自动启用。收费巡检显式维持关闭，policy revision2/enabled=false/dailyMaxCalls=0。

### 真实收费验收（不是fixture）

| 入口与原选 | 实际供应商参数 | 实际输出 | 原报价/结算 | 供应商回执USD |
|---|---|---|---|---|
| API QA high / 4K / 1:1 | medium / 2k | 2048×2048 PNG | 16 / 16 | 0.021136 |
| API QA medium / 4K / 1:1 | low / 2k | 2048×2048 PNG | 12 / 12 | 0.009850 |
| 真实画布现有gpt-image-2，medium / 2K / 1:1 | medium / 2k | 2048×2048 PNG | 8 / 8 | 0.021112 |

共3次新增生成、3张成功、3笔扣费36积分，供应商**回执**费用合计0.052098 USD（不是另行核过账户账单）。用户本轮无预算上限，但没有启动自动收费巡检。

- 前两例经真实Nginx入口、plan、持久父子任务、旧generate route、APIMart SDK、供应商、R2、原图下载/解码及账本；每例有唯一供应商task ID、parameterPlan.wire/effective、原始用户选择和冻结报价。
- 质量映射high→medium / medium→low各执行一次；原4K价格保留，实际2K如实记录。新版`parameterPlan.effective`为实际档位权威；旧`quote.effectiveParameters.resolution`在该显式映射样本仍保留计价原选4K，不能拿它冒充wire或实际像素。
- 临时QA公模移除后，前两例继续用原operationId取回/重复应用回执，供应商调用记录与task ID、账本精确相同，新增调用记录0、新增扣费0，剩余预占0。没有做供应商网络抓包，不把DB记录数当独立物理POST计数。
- 第三例真实UI选GPT-Image-2.5/标准/2K/1:1，前台显示8积分，plan/submit各1次；同作品主节点图片可见、naturalWidth/Height2048，刷新恢复新增提交0。其实际前端兼容轮询入口是`/api/generate-image`，父任务与作品均留存。

### 真实失败/修正记录

- r2在创建候选前因历史活动整表扫描预算ABORTED；实查101453条均finished。只对103加入nonfinished-and-prior精确采集，保留全部unknown/旧boot/原受保护ID，未删除历史、未提高预算；真实PG大样本及超预算负向通过，其他站默认SQL字节保持。
- r3首次真实before marker转交晚于600秒等待，停在CLEANUP_PENDING，未切流。沿原r3、原候选、原备份与原task snapshot一次性核对续跑，无重建候选/任务重放。执行runner为ad916…；后发修订未被误记为已执行。旧gatewaySwitched/candidatesRetained历史字段在实际COMPLETE后独立核网关ACK/哈希及旧新实例，再CAS校正事实并保留原回执/前像；canonical252。
- 旧页面跨切流真实保存HTTP200，但全对象hash断言因main新增空error字段失败；56个原节点仅去除这一新增空字段后，全部原hash相同；原旧document保存回执保留，新页面精确读回通过，非伪造旧页面重跑。
- 目录自动发现被发布浏览器测试主动阻断，模型管理页面显示Failed to fetch；配置GET与页面hydration通过不当作供应商目录刷新通过。本轮未改该UI或扫完整供应商目录。
- 第三例首次只读打开一度显示图片暂未加载，后续同图及刷新均正常，实际307→签名R2→200。保留这次观察，未据此认定持续产品缺陷。刷新后图编辑栏是下一次编辑的自适应/1K/6默认配方，不冒充历史配方UI还原验收。
- Node24 fetch忽略Host造成首个未提交plan403；改测试隧道为native HTTP保留真实103 Host/Origin，不改服务CSRF。该失败submitAttempts=0；生成未知受理没有重提。
- standalone缺zod/React server条件入口，运维bundle改为打入纯JS依赖、普通Node执行；billing原始快照与runtime默认补齐不同则分别绑定raw/normalized双CAS。均保留原失败UUID，无其publication，不降低原价保护。

### 证据与保留边界

本地 `output/model-mapping103-20261029/`：`FINAL_ACCEPTANCE.json`、`FINAL_SNAPSHOT.json`、`PUBLIC_DIRECT_FINAL.json`、三个`*-final.sidecar.private.json`、`REPLAY_VERIFICATION.json`、`ui-e2e-existing/VERIFICATION.txt`；`source-proof/`和`ops-proof/`均有四件与真实Bash独立副本回退。

远端 `/opt/naumi-staging/evidence/release103-mapping-20261029-r3/`、`supplier-copy103-41f9fddc-a312-4a12-835e-ab27a8757847/`、`qa-mapping103-f4e52522-8b69-4973-a0d9-6d2c0f212b59/`、`mapping103-final-20261030/`。源码/本地PG/真实程序发布/配置publication/真实付费/UI证据分层保存。

未逐一收费验收95个来源模型；视频、成本preset及无version历史任务没有被真实付费重放，后两类保留本地回归证据。预览嵌套参数、direct/unverified引用数门禁、后台重复入口等后续模块未捆绑改造。本分支保留，main只可单向合入，测试通过不解除隔离。

---


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
