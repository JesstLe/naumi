# 迁移合同与模块记录索引

本文维护迁移方法、兼容条件与模块记录，不复制当前运行状态；当前源码、验收和下一步见 [工作区快照](../REFACTOR_WORKSPACE.md) 与 [退出审计](REFACTOR_EXIT_AUDIT.md)。

## 已迁移职责的核对入口

| 工作包 | 当前实现/记录入口 | 仍需持续保持 |
|---|---|---|
| R0 原功能基线 | 原质量/Canvas 修复与历次普通 main 整合 | 不回退用户已明确保留的修复，不覆盖共享工作树 |
| R1A/R1B 图片执行与准备 | imagegen typed 用例、model-config image-preparation、imagegen quotes | 公共入口复用、原价/权限/输入归属、无重复确认 |
| R2 交付与恢复 | 原 checkpoint / storage / artwork / settlement 链 | 原图可续交，不重放付费 POST；历史事故不自动关闭 |
| R3 Canvas 分域 | 文档/任务/交互/投影 owners，React adapters | 当前视图与持久任务区分；CAS/undo/草稿/导航不跨身份 |
| R4A/R4B 数据与配置 | platform DB、各 repository/schema、published reads、显式启动 | Tx 贯穿单连接；兼容入口只 re-export 原 owner；热路径不做管理初始化 |
| R5 适配与 Worker | 协议小合同/registry、媒体独立引擎、唯一 scheduling 与同版本 Worker | 原 wire、lease/fencing、排空、UNKNOWN 和冻结来源 |
| R6 验收及外围 | admin/workbench 具体 owner、完整 core、固定原生 SDK | 不改业务断言换绿；源码/镜像/日志/退出码一致 |

“已迁移职责”不等于整项目完成；剩余门槛由退出审计逐项列出。Canvas 薄事件/DOM adapter 是否保留按职责判断，不按剩余行数继续机械拆分。

## 原始路线和验收合同

下列阶段表是原始工作包定义与长期合同，固定基线数字属于 2026-10-24，不是当前未完成数量；原先“第一轮推荐”已退出当前指令，全文在 Git 历史保留。

## 1. 迁移总原则

每轮只完成一个闭合职责，采用“新实现取代旧实现”，不长期双套业务：

1. 固定已整合源码和行为对照。
2. 提取单一用例/数据owner，原入口接同一实现。
3. 集中跑该模块现有测试和最小新增反例。
4. 删被替代判断/旧副本；只留有调用者的协议兼容壳。
5. 留回退提交与冻结历史读取证明，再推进下一模块。

第一阶段不改表名、operation身份算法、公开URL或客户端协议；后续结构变动与业务降级策略分提交记录。不会要求用户再确认一次积分。

## 2. 分阶段工作包

| 阶段 | 可执行改动/主要文件 | 沿用与删除 | 集中验收与退出条件 | 回退 |
|---|---|---|---|---|
| R0 基线与协作 | 固定main及已完成功能提交；整合 `9fc2845`/quality/Canvas修复；登记实际调用方、旧任务格式 | 复用 benchmark runner/catalog，保留历史失败和PARTIAL | 质量回退、指定模型报价、原价receipt和取消正负例绑定整合SHA；未关闭历史case继续单列 | 仅撤本轮整合提交，不回退已明确保留的修复 |
| R1A 图片执行边界 | 从 `generate-image/route.ts` 抽出typed `execute-image-step`/提交与读取用例；generation-core/adapters直接调用 | 复用现有 paidOperation、任务repository、协议实现；删除内部HTTP/FormData再解析和用户cookie伪装 | 旧HTTP、新imagegen、Agent调用同一实现；owner/scope、显式取消、重复operation、unknown不重POST保持；2条生产lib→app归零 | 旧route adapter可恢复到原实现；无DB模式变更；已有任务仍由原ID恢复 |
| R1B 方案与价格一次准备 | 从 requests/plan/billing-model 的重复选择中确定唯一resolver；UI/Agent/workbench只消费Prepared计划 | 沿原quote/plan与冻结版本读；迁入已完质量/Canvas修复；删除重复current比较和重复参数决策 | 同输入各入口effective参数和报价语义一致；目录读取不靠可执行default；真实余额正负例；没有新增确认弹窗或隐性换价 | 在提交前恢复旧adapter映射；已保存计划不重算，不批量重写旧报价 |
| R2 原图交付与恢复 | 抽 `complete-image-delivery`，runJob和stored-delivery共用；统一receipt错误/质量提示投影 | 沿checkpoint、存储adapter、artwork API、settle原ID；删除双份处理/落库/异常映射 | 供应完成后写入失败、后处理失败、对象存储失败、父回执失败均可按已知checkpoint续交；无供应商重复生成/重复扣款；账务pending不冒充settled | 保留原始字节与历史字段；回退只恢复解释代码；不回灌媒体/DB |
| R3 Canvas分域 | 先图片生成controller；再document/history/persistence；最后renderer/interaction；复用video stores | 保留现有API、布局、selection、clipboard、history、账号缓存；删除主组件对应闭包，不另起mega-hook | 同账号/跨账号、项目切换、刷新、弱网、undo/redo、拖动、多任务和报价控件集中浏览器验收；无非本项目回写 | 按controller分批回退；存储键兼容，保留草稿与任务receipt |
| R4A 基础DB与数据owner | 从db拆纯Pool/Tx；按identity/billing/assets/canvas/agent迁query；跨表用窄Tx接口 | 保留锁顺序和事务；旧db暂re-export；删除重复SQL副本 | 平台DB不import业务；迁出domain消费者对db大出口引用归零；并发扣款/任务/历史写入事务一致 | 表结构先不变，re-export可撤；无数据迁移回滚 |
| R4B 配置与DDL | composition组装models+billing；snapshot reader和admin发布分离；ensure逐模块迁移 | 沿现有model版本、CAS、frozen sources；DDL搬迁顺序与旧库兼容 | 执行只读启动不进行DDL/bootstrap管理调用；新库/旧库升级通过；该批跨域SCC消失 | expand-only；旧代码兼容窗口内保留旧列；收缩另次发布 |
| R5 适配器与Worker | 拆wire注册/helpers环、endpoint环、素材授权环；runtime脱离scripts；任务用例在Worker内运行 | 沿已有媒体Worker、lease、receipt、同版本部署；旧tick作有期限adapter | 全profile wire对照一致；单条任务仅一个owner；镜像内imports完整；Web/Worker资源隔离有测量 | 暂停新scanner后恢复旧所有者；不并跑、不重放unknown |
| R6 外围整理 | 工作台资产源、enterprise纯合同、admin大面板；tests/scripts/docs按用途整理 | 有消费者的命令/服务保留；基于调用证据逐项退休旧代码 | 同模块变动只涉及约定owner/adapter；build inputs与CI触发一致；旧路径删除清单为零债务 | 目录移动与行为变更分提交；兼容CLI可恢复 |

**建议顺序：R0 → R1A → R1B → R2 → R3。** R4A中的纯Pool/Tx如果是R1的实际阻塞，可先做最小切片；不要求先迁走242个db调用者才改善用户创作。R5解小环可在对应模块工作时顺手完成；Worker迁执行是独立部署行为，不与UI拆分混一起上线。

## 4. 测试资产复用与补例

不是每改一个函数就跑全套。阶段内以类型/局部静态检查辅助，模块闭合后一次集中回归；仅当失败需要定位时运行针对性用例。

| 类别 | 沿用资产/方向 | 验收事实 |
|---|---|---|
| 历史图片失败 | `scripts/verify-imagegen-history-benchmark.cjs` 与 `docs/benchmarks/imagegen-history-20261023.json` | 保留baseline复现、captured/执行/业务关闭分类；10/10且PARTIAL仍是PARTIAL |
| 定价减法 | `scripts/verify-pricing-friction-image.ts`、`scripts/verify-pricing-friction-agent.ts`、`scripts/verify-pricing-friction-workbench.ts` | 报价冻结/显式取消/current漂移、原operation、足额与不足额；按投影文件范围解释baseline |
| 新Canvas/quality修复 | 从已完成功能提交沿用对应verifier，不改回旧拦截预期 | supplierRouting单primary、catalog-default解耦、精确单价/总价、quality标签回退 |
| HTTP与客户端 | 现有scope/receipt、billing client、真实route fixture | 实际入口调用新用例，非只测试纯helper；unknown不自动POST；取消不生成不扣款 |
| 真实PG | 现有随机schema、wallet/job/quote/recovery fixture | 同任务一次consume、作用域不混、任务与账务一致、cleanup完成 |
| 视频 | 现有能力wire fixture、frozen source真实PG入口 | 完整旧profile不变；新字段/roles/来源不丢；不把image改造扩成video重写 |
| 浏览器 | Canvas已有fixture/Playwright：加载/编辑/保存/生成/刷新/恢复 | UI真实请求、操作号、回执、截图一致；弱网和切账号/项目不污染 |
| 性能 | 在固定机器/固定数据上建立对照，记录CPU/内存/事件循环/请求与供应耗时 | 以真实尾延迟和持续资源占用判断，不能从文件数推吞吐 |

最小故障矩阵：准备失败；真实余额不足；供应明确未受理；供应受理未知；供应已完成→checkpoint故障；对象写失败；作品写失败；结算未完成；客户端断线。每例都检查供应商提交数、原operation、字节/作品、用户提示和账务，不只检查HTTP状态。

## 5. 可量化退出标准

下面是建议的验收目标，不是已经达到的性能承诺。

| 维度 | 固定基线 | 阶段完成目标 |
|---|---|---|
| 生产业务lib→app反向调用 | 2条 | R1结束为0；2条release fixture不混算 |
| 模块运行依赖环 | 最大54；视频20 | 每个迁完边界SCC=0；旧图剩余按owner登记，不用改分组掩盖环 |
| 纯DB基础层业务import | 当前db混合 | R4A新Pool/Tx业务import=0 |
| 客户方案/报价 | 多入口载体，调用次数未测 | 每个新operation仅一个权威prepared合同；重复/恢复不重算价；prepare幂等命中率和读取次数可测 |
| 供应商/账务重复 | 本轮未运行 | 同op并发/恢复用例供应新submit不超过原冻结数量；consume每账务operation最多1笔 |
| HTTP route职责 | generate-image1269行 | 仅传输/鉴权/调用/呈现；150行作为复查提示，不是按行数强拆硬门禁 |
| Canvas复杂度 | 12422行、120依赖、137state/reducer调用 | 主Shell不再持有报价/任务执行/持久化算法；约600行作为组织目标，不设全仓绝对行数封禁 |
| 改动扩散 | 未测真实变更历史中位数 | 质量别名只改规则模块+测试；新增codec只改对应codec/注册和fixture，不改Canvas/wallet |
| UI响应 | 待同机对照 | 首轮约定fixture规模后测p95；建议同场景无超过10%回退，超差查原因，不套用线上SLO |
| 服务端额外延迟 | 待同机对照 | 比较排除供应耗时的准备/入队p95、PG查询和峰值RSS；建议无超过10%回退；低噪声重复样本后判断 |
| 数据与旧任务 | 既有schema/冻结格式 | 老quote、已受理任务、原结果续交兼容；字段扩展可读；供应POST=0的本地恢复可证 |

不把“10万活跃用户”换算成单个并发数字。容量模型和运行SLO仍在 `docs/PRODUCT_READINESS_100K.md` 维护，本方案只改善测量与隔离条件。

## 6. CI和依赖检查：渐进，不新增用户护栏

- 迁移初期用现有TS/ESLint加一个只读边界脚本即可；不引入Nx/Turborepo迁移。
- 新模块禁止业务→app、browser→server、跨模块深层import；旧债务列表固定到具体边和owner，新增违规才阻断。
- 依赖检查计入类型擦除后图，并区分fixture和运行代码；动态/HTTP/SQL边另登记。
- 路径触发覆盖实际build inputs：`services/reference-workbench/static`、enterprise共享合同、引用的design资源等。
- 将相应模块verifier并入同SHA的候选验证链；已有PG/账务/浏览器CI保留。required checks需仓库设置真实核对，本轮未操作。
- 一个模块验收完成后不保留同名旧/新两个“生产默认”实现；适配壳登记调用方、owner和删除条件。

## 7. 回退与上线分开

此工作树不持发布锁、不启动候选或重试发布。代码提交/推送不是上线。实际部署方式和窗口由当次发布负责人按最新明确授权执行，不与其他线程抢锁。

应用回退依赖兼容任务/quote/schema和原字节，不依赖恢复旧DB。迁移时先扩展、验证读写、后收缩；每一步保留原输入、来源、operation与账务ID。切Worker所有者按现有lease/排空交接，不通过更换operation启动新收费请求。

## 8. 可复用实施任务模板

```text
目标：只实施 REFACTOR_MIGRATION.md 中的阶段 <Rxx>，一个闭合职责。
基线：<完整SHA>；已保留功能提交：<SHA列表>。
读取：REFACTOR_ARCHITECTURE、证据Axx、模块文档、实际AGENTS。
旧调用方：<route / Agent / workbench / worker / tests>。
新owner与公共API：<模块、函数、DTO、Tx边界>。
必须保持：owner/workspace、完整冻结方案与原价、原operation/回执、
          显式取消、真实余额、单次结算、unknown不重放、原字节可恢复。
交付：业务实现 + 调用方切换 + 删除旧副本清单 + 模块文档。
验证：先固定baseline；完整模块后集中跑既有受影响suite与最小故障反例；
      输出同SHA命令、literal、exit、未执行项和独立副本回退。
不做：新增用户确认/限额、全站搬迁、新事件总线、另建benchmark、发布现场操作。
```


## 模块记录索引

每条记录只代表其绑定源码与验收层级。历史 FAIL / PARTIAL、未执行、部署与 fixture 边界保留在原记录，不以新的当前快照覆盖。

- [2026-10-24-account-owners-r4a3.md](../changes/2026-10-24-account-owners-r4a3.md)
- [2026-10-24-artwork-observation-owners-r4a4.md](../changes/2026-10-24-artwork-observation-owners-r4a4.md)
- [2026-10-24-canvas-artwork-document-r3b3.md](../changes/2026-10-24-canvas-artwork-document-r3b3.md)
- [2026-10-24-canvas-composers-r3e.md](../changes/2026-10-24-canvas-composers-r3e.md)
- [2026-10-24-canvas-history-r3b1.md](../changes/2026-10-24-canvas-history-r3b1.md)
- [2026-10-24-canvas-image-task-r3a.md](../changes/2026-10-24-canvas-image-task-r3a.md)
- [2026-10-24-canvas-interactions-r3c2.md](../changes/2026-10-24-canvas-interactions-r3c2.md)
- [2026-10-24-canvas-node-operations-r3c3.md](../changes/2026-10-24-canvas-node-operations-r3c3.md)
- [2026-10-24-canvas-scene-r3c1.md](../changes/2026-10-24-canvas-scene-r3c1.md)
- [2026-10-24-canvas-task-boundaries-r3b4.md](../changes/2026-10-24-canvas-task-boundaries-r3b4.md)
- [2026-10-24-canvas-text-document-r3b2.md](../changes/2026-10-24-canvas-text-document-r3b2.md)
- [2026-10-24-canvas-text-tasks-r3d.md](../changes/2026-10-24-canvas-text-tasks-r3d.md)
- [2026-10-24-content-session-owners-r4a6.md](../changes/2026-10-24-content-session-owners-r4a6.md)
- [2026-10-24-cutout-billing-boundary-r1a2.md](../changes/2026-10-24-cutout-billing-boundary-r1a2.md)
- [2026-10-24-durable-task-owners-r4a5.md](../changes/2026-10-24-durable-task-owners-r4a5.md)
- [2026-10-24-image-delivery-r2.md](../changes/2026-10-24-image-delivery-r2.md)
- [2026-10-24-image-generation-boundary-r1a.md](../changes/2026-10-24-image-generation-boundary-r1a.md)
- [2026-10-24-image-preparation-r1b.md](../changes/2026-10-24-image-preparation-r1b.md)
- [2026-10-24-persistence-owners-r4a2.md](../changes/2026-10-24-persistence-owners-r4a2.md)
- [2026-10-24-platform-db-r4a1.md](../changes/2026-10-24-platform-db-r4a1.md)
- [2026-10-25-commercial-admin-owners-r4a7.md](../changes/2026-10-25-commercial-admin-owners-r4a7.md)
- [2026-10-25-execution-assembly-r4b3.md](../changes/2026-10-25-execution-assembly-r4b3.md)
- [2026-10-25-identity-creation-boundaries-r4b2.md](../changes/2026-10-25-identity-creation-boundaries-r4b2.md)
- [2026-10-25-model-read-boundary-r4b1.md](../changes/2026-10-25-model-read-boundary-r4b1.md)
- [2026-10-25-model-registry-startup-r4b5.md](../changes/2026-10-25-model-registry-startup-r4b5.md)
- [2026-10-25-persistence-startup-owners-r4b6.md](../changes/2026-10-25-persistence-startup-owners-r4b6.md)
- [2026-10-25-web-startup-r4b4.md](../changes/2026-10-25-web-startup-r4b4.md)
- [2026-10-26-canvas-artwork-concurrency-r5p.md](../changes/2026-10-26-canvas-artwork-concurrency-r5p.md)
- [2026-10-26-canvas-assistant-session-r5m.md](../changes/2026-10-26-canvas-assistant-session-r5m.md)
- [2026-10-26-canvas-image-imports-r5l.md](../changes/2026-10-26-canvas-image-imports-r5l.md)
- [2026-10-26-canvas-image-text-r5n.md](../changes/2026-10-26-canvas-image-text-r5n.md)
- [2026-10-26-canvas-text-concurrency-r5o.md](../changes/2026-10-26-canvas-text-concurrency-r5o.md)
- [2026-10-26-canvas-workspace-pages-r5k.md](../changes/2026-10-26-canvas-workspace-pages-r5k.md)
- [2026-10-26-direct-application-worker-r5b.md](../changes/2026-10-26-direct-application-worker-r5b.md)
- [2026-10-26-feature-model-policy-r5h.md](../changes/2026-10-26-feature-model-policy-r5h.md)
- [2026-10-26-image-worker-ownership-r5c.md](../changes/2026-10-26-image-worker-ownership-r5c.md)
- [2026-10-26-leaf-owner-boundaries-r5i.md](../changes/2026-10-26-leaf-owner-boundaries-r5i.md)
- [2026-10-26-media-runtime-boundary-r5f.md](../changes/2026-10-26-media-runtime-boundary-r5f.md)
- [2026-10-26-model-execution-transport-r5g.md](../changes/2026-10-26-model-execution-transport-r5g.md)
- [2026-10-26-parent-receipt-integration-r5j.md](../changes/2026-10-26-parent-receipt-integration-r5j.md)
- [2026-10-26-refactor-acceptance-r6a.md](../changes/2026-10-26-refactor-acceptance-r6a.md)
- [2026-10-26-refactor-main-sync-r5c.md](../changes/2026-10-26-refactor-main-sync-r5c.md)
- [2026-10-26-refactor-main-sync-r5i.md](../changes/2026-10-26-refactor-main-sync-r5i.md)
- [2026-10-26-refactor-main-sync-r5m.md](../changes/2026-10-26-refactor-main-sync-r5m.md)
- [2026-10-26-refactor-main-sync-r5p.md](../changes/2026-10-26-refactor-main-sync-r5p.md)
- [2026-10-26-refactor-runtime-r6b.md](../changes/2026-10-26-refactor-runtime-r6b.md)
- [2026-10-26-video-wire-boundaries-r5d.md](../changes/2026-10-26-video-wire-boundaries-r5d.md)
- [2026-10-26-video-worker-ownership-r5e.md](../changes/2026-10-26-video-worker-ownership-r5e.md)
- [2026-10-26-worker-recovery-boundary-r5a.md](../changes/2026-10-26-worker-recovery-boundary-r5a.md)
- [2026-10-27-canvas-clipboard-r6n.md](../changes/2026-10-27-canvas-clipboard-r6n.md)
- [2026-10-27-canvas-image-creation-r6p.md](../changes/2026-10-27-canvas-image-creation-r6p.md)
- [2026-10-27-canvas-input-controls-r6m.md](../changes/2026-10-27-canvas-input-controls-r6m.md)
- [2026-10-27-canvas-native-integration-r6s.md](../changes/2026-10-27-canvas-native-integration-r6s.md)
- [2026-10-27-canvas-project-catalog-r6l.md](../changes/2026-10-27-canvas-project-catalog-r6l.md)
- [2026-10-27-canvas-request-workflow-r6q.md](../changes/2026-10-27-canvas-request-workflow-r6q.md)
- [2026-10-27-main-owner-integration-r6o.md](../changes/2026-10-27-main-owner-integration-r6o.md)
- [2026-10-27-refactor-admin-settings-r6g.md](../changes/2026-10-27-refactor-admin-settings-r6g.md)
- [2026-10-27-refactor-admin-usage-r6f.md](../changes/2026-10-27-refactor-admin-usage-r6f.md)
- [2026-10-27-refactor-canvas-artwork-writer-r6d.md](../changes/2026-10-27-refactor-canvas-artwork-writer-r6d.md)
- [2026-10-27-refactor-dependencies-r6k.md](../changes/2026-10-27-refactor-dependencies-r6k.md)
- [2026-10-27-refactor-model-management-r6h.md](../changes/2026-10-27-refactor-model-management-r6h.md)
- [2026-10-27-refactor-model-ui-runner-r6j.md](../changes/2026-10-27-refactor-model-ui-runner-r6j.md)
- [2026-10-27-refactor-product-browser-r6c.md](../changes/2026-10-27-refactor-product-browser-r6c.md)
- [2026-10-27-refactor-supplier-library-r6i.md](../changes/2026-10-27-refactor-supplier-library-r6i.md)
- [2026-10-27-refactor-workbench-assets-r6e.md](../changes/2026-10-27-refactor-workbench-assets-r6e.md)
- [2026-10-27-worker-media-integration-r6r.md](../changes/2026-10-27-worker-media-integration-r6r.md)
- [2026-10-28-admin-entry-ownership-r6t.md](../changes/2026-10-28-admin-entry-ownership-r6t.md)
- [2026-10-28-character-owner-integration-r6u.md](../changes/2026-10-28-character-owner-integration-r6u.md)
- [2026-10-28-image-version-owner-integration-r6w.md](../changes/2026-10-28-image-version-owner-integration-r6w.md)
- [2026-10-28-refactor-r6x-native-audio-integration.md](../changes/2026-10-28-refactor-r6x-native-audio-integration.md)
- [2026-10-28-refactor-r6y-timeline-integration.md](../changes/2026-10-28-refactor-r6y-timeline-integration.md)
- [2026-10-28-refactor-r6z-main-performance-integration.md](../changes/2026-10-28-refactor-r6z-main-performance-integration.md)
- [2026-10-28-refactor-r7a-import-ownership.md](../changes/2026-10-28-refactor-r7a-import-ownership.md)
- [2026-10-28-scene-owner-integration-r6v.md](../changes/2026-10-28-scene-owner-integration-r6v.md)
- [2026-10-29-refactor-r7b-native-lifecycle.md](../changes/2026-10-29-refactor-r7b-native-lifecycle.md)
- [2026-10-29-refactor-r7c-native-documents.md](../changes/2026-10-29-refactor-r7c-native-documents.md)
- [2026-10-29-refactor-r7d-generation-activity.md](../changes/2026-10-29-refactor-r7d-generation-activity.md)
- [2026-10-29-refactor-r7e-media-state.md](../changes/2026-10-29-refactor-r7e-media-state.md)
- [2026-10-29-refactor-r7f-generation-presentation.md](../changes/2026-10-29-refactor-r7f-generation-presentation.md)
- [2026-10-29-refactor-r7g-owner-integration.md](../changes/2026-10-29-refactor-r7g-owner-integration.md)
- [2026-10-29-refactor-r7h-pending-presentation.md](../changes/2026-10-29-refactor-r7h-pending-presentation.md)
- [2026-10-29-refactor-r7i-generation-applications.md](../changes/2026-10-29-refactor-r7i-generation-applications.md)
- [2026-10-29-refactor-r7j-native-actions.md](../changes/2026-10-29-refactor-r7j-native-actions.md)
- [2026-10-29-refactor-r7k-integration-acceptance.md](../changes/2026-10-29-refactor-r7k-integration-acceptance.md)
- [2026-10-29-refactor-r7l-main-integration.md](../changes/2026-10-29-refactor-r7l-main-integration.md)
- [2026-10-29-refactor-r7m-composer-responsive.md](../changes/2026-10-29-refactor-r7m-composer-responsive.md)
- [2026-10-29-refactor-r7n-branch-ci.md](../changes/2026-10-29-refactor-r7n-branch-ci.md)
- [2026-10-29-refactor-r7o-primary-generation.md](../changes/2026-10-29-refactor-r7o-primary-generation.md)
- [2026-10-30-refactor-r7p-text-image-runs.md](../changes/2026-10-30-refactor-r7p-text-image-runs.md)
- [2026-10-30-refactor-r7q-local-image-edits.md](../changes/2026-10-30-refactor-r7q-local-image-edits.md)
- [2026-10-30-refactor-r7r-main-owner-integration.md](../changes/2026-10-30-refactor-r7r-main-owner-integration.md)
- [2026-10-30-refactor-r7s-viewport-appearance.md](../changes/2026-10-30-refactor-r7s-viewport-appearance.md)
- [2026-10-30-refactor-r7t-overlay-ownership.md](../changes/2026-10-30-refactor-r7t-overlay-ownership.md)
- [2026-10-30-refactor-r7u-arrange-application.md](../changes/2026-10-30-refactor-r7u-arrange-application.md)
- [2026-10-30-refactor-r7v-video-follow.md](../changes/2026-10-30-refactor-r7v-video-follow.md)
- [2026-10-30-refactor-r7w-billing-presentation.md](../changes/2026-10-30-refactor-r7w-billing-presentation.md)
- [2026-10-30-refactor-r8a-text-editing.md](../changes/2026-10-30-refactor-r8a-text-editing.md)
- [2026-10-30-refactor-r8b-request-schema-startup.md](../changes/2026-10-30-refactor-r8b-request-schema-startup.md)
- [2026-10-30-refactor-r8c-canvas-stitch.md](../changes/2026-10-30-refactor-r8c-canvas-stitch.md)
- [2026-10-31-refactor-r8d-performance.md](../changes/2026-10-31-refactor-r8d-performance.md)
- [2026-10-31-refactor-r8e-rendering.md](../changes/2026-10-31-refactor-r8e-rendering.md)
- [2026-10-31-refactor-r8f-downloads.md](../changes/2026-10-31-refactor-r8f-downloads.md)
- [2026-10-31-refactor-r8g-node-preferences.md](../changes/2026-10-31-refactor-r8g-node-preferences.md)
- [2026-10-31-refactor-r8h-artwork-picker.md](../changes/2026-10-31-refactor-r8h-artwork-picker.md)
- [2026-10-31-refactor-r8i-native-editors.md](../changes/2026-10-31-refactor-r8i-native-editors.md)
- [2026-10-31-refactor-r8j-mixed-load.md](../changes/2026-10-31-refactor-r8j-mixed-load.md)
- [2026-10-31-refactor-r8k-node-creation.md](../changes/2026-10-31-refactor-r8k-node-creation.md)
- [2026-10-31-refactor-r8l-view-navigation.md](../changes/2026-10-31-refactor-r8l-view-navigation.md)
- [2026-10-31-refactor-r8m-image-model-selection.md](../changes/2026-10-31-refactor-r8m-image-model-selection.md)
- [2026-10-31-refactor-r8n-feature-catalog.md](../changes/2026-10-31-refactor-r8n-feature-catalog.md)
- [2026-10-31-refactor-r8o-image-scheduling.md](../changes/2026-10-31-refactor-r8o-image-scheduling.md)
- [2026-10-31-refactor-r8p-native-fixture-lifecycle.md](../changes/2026-10-31-refactor-r8p-native-fixture-lifecycle.md)
- [2026-10-31-refactor-r8q-canvas-io-boundaries.md](../changes/2026-10-31-refactor-r8q-canvas-io-boundaries.md)
- [2026-10-31-refactor-r8r-selection-projection.md](../changes/2026-10-31-refactor-r8r-selection-projection.md)
- [2026-10-31-refactor-r8s-saved-text-results.md](../changes/2026-10-31-refactor-r8s-saved-text-results.md)
- [2026-10-31-refactor-r8t-enterprise-source-onboarding.md](../changes/2026-10-31-refactor-r8t-enterprise-source-onboarding.md)
- [2026-10-31-refactor-r8u-whole-core.md](../changes/2026-10-31-refactor-r8u-whole-core.md)
- [2026-10-31-refactor-r8v-timeline-readiness.md](../changes/2026-10-31-refactor-r8v-timeline-readiness.md)
- [2026-10-31-refactor-r8w-fixed-native-acceptance.md](../changes/2026-10-31-refactor-r8w-fixed-native-acceptance.md)
- [2026-10-31-refactor-r8x-current-performance.md](../changes/2026-10-31-refactor-r8x-current-performance.md)

## 历史入口

[收敛前的完整迁移流水](https://github.com/JesstLe/naumi/blob/82729161200f166fe587b98bceb756a44999840c/docs/architecture/REFACTOR_MIGRATION.md)保留。文档类改动不增加产品模块计数；后续代码每完成三模块普通同步主线，仍遵从 AGENTS。
