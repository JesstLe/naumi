# 图片交付六场景核查（非重构分支合并后）

## 固定版本与结论

用户要求先合并分支，再检查正常生成/编辑、异步慢任务、刷新重进、供应超时、参数/坏图、旧配置任务六类场景。本轮没有授权新的付费验收或服务器更新，执行合并、集中隔离验证及线上只读观察。

- 开始 main：`368c93e2343c57a330a0db6831ccbef01283ed6d`。之前五条分支已在该 main：pricing、quality、performance、benchmark、admin-anomaly-watch；没有重复合并。
- 本轮新增：`ef057ea39433f65d0b62ee73e98920c7df6b2b4b`、`777c68fecf5b279ad081ec845b6c9a6e5f4658f1`。包含完成回执与清理隔离、初次绑定失败释放自己的 lease、脱敏失败阶段，以及管理后台失败原因投影/UI。
- 合并方式：原 main 普通 `merge --ff-only` 到 `777c68fe`，`git push origin main` 成功，`git ls-remote --heads origin main` 相同。此次核对时，普通远端业务分支未合入数为0；core-refactor及四条rollback分支保留。modular-refactor、混入core的excluded-refactor-attempt均不是候选祖先，四条本地T3旧tip的补丁等价性已复核。
- 本文为随后单独的审计文档提交；产品验证固定在777c68fe，不将文档提交当成另一份产品构建。
- 15:54公网版本200，16:04:56 SSH只读实际身份：Web仍 `0641ce2e23c6ae5653c5a1d4c2da36782e0366c7 / 1792979563`，Worker仍af22，paused=true、phase=UNKNOWN、unresolvedTicks=1。未部署本轮main。

结论：六类场景均有部分实现/验证基础，但尚未达到六类全部线上闭环。正常交付和原任务归属有具体真实成功样本；无人值守恢复是确定的线上未完成项。测试数量不等于用户成功率，供应商HTTP200也不等于图片可读。

## 六场景覆盖矩阵

| 场景 | 当前实现与本轮验证 | 实际交付证据 | 未完成/结论 |
|---|---|---|---|
| 正常生成、参考图编辑 | 实际imagegen执行/存储/单次扣费回归通过；父收尾整模块VM25项、真实PG父通知SQL19项、SaaS作品与权限回归通过 | 保留并重开10:05三对原父收尾记录：原图GET200、完整解码、parent/creation succeeded、原账务与child不变，新增生成0/扣费0。它们是原结果补交，不是本轮新供应商生成或真实浏览器查看证明 | 主链路已有落地；不是全供应商×参数×工具组合验收，仍存在其他历史父pending案例 |
| 慢返回、异步任务 | APIMart异步53检查：任务ID锁定、GET-only恢复、通道禁用后的原任务查询、丢响应/歧义响应保留、解码等。postaccept11组142断言及真实PG18检查通过。main已含扫描单进程singleflight/每次观察新身份、完成后清理隔离8组 | 16:04旧Worker仍UNKNOWN；同一10/24 recovery-dispatch-scan活动仍unknown/finished_at=null，Web内扫描为0 | 部分实现，线上无人值守补扫尚未恢复。新扫描身份不等于旧tick七域派生执行已交接，更不自动结清任务级UNKNOWN |
| 刷新、重进画布 | 项目scope真实PG/路由31检查通过；reload recovery 32场景458断言通过，真实组件/客户端代码+hook/网络替身。sessionStorage按owner/workspace/project/action保存；显示检查原任务入口并在成功挂回后清凭据 | 10:05三笔曾404原任务通过新版原GET收尾、原媒体可读 | 原404机制已有线上修复；sessionStorage不提供跨设备/清存储恢复保证，手动检查不等于所有场景自动挂回。未新增真实生产浏览器刷新/重新登录验收 |
| 超时或断连 | accepted-read限制POST，持久任务按原task/通道/冻结身份恢复。异步53检查、postaccept142断言与parent race回归覆盖丢响应、已受理只查、不重放。当前canvas提交遇到可能受理的凭据先查原任务 | 原排查记录有ECONNRESET供应结果unknown、客户账务released/charged0；客户释放不证明供应商未受理或未计费 | 有明确防重放机制，但所有传输不确定结果尚未自动收敛；原任务UNKNOWN与费用待核查不能记作成功或肯定未收费 |
| 参数不支持、空图/坏图 | 能力/映射校验；异步53检查含HTTP200空输出、损坏像素/解码、输出数量与成本。父needs_attention投影已有charge；新增管理失败证据真实PG38项、实际组件headless fixture19项通过 | 既有供应返回输出而本地checkpoint未完成案例仍OPEN，未因输出计数改为已交付 | 参数/结果处理与账务机制已实现不少；管理原因展示777c68f未上线，未知原因仍应显示未记录，不把预占释放说成供应未收费 |
| 发布新配置后查询旧任务 | 模型/计费/凭据/候选集冻结；异步53检查覆盖旧Router冻结及禁用后原任务查询。简化报价真实PG/HTTP回归通过，原价/原回执/无重复扣费保持。model-execution先实际验证新旧模型/凭据各用原版本，再在268行旧MODEL_CHANGED断言失败 | 本轮未切真实供应配置、未新增真实付费任务 | 版本冻结已有代码和局部实际模块证据；完整旧测试未绿，未新增生产配置切换时在途任务验收 |

## 集中执行与证据层级

固定777c68f集中22个入口：20个exit0，2个exit1。后续针对性验证包括新增旧main对照、客户端与刷新恢复、副本字节/行为回滚。所有原始stdout、stderr、退出码完整保留，不把expected failure等同PASS。

主要实际结果：

- 父任务整模块VM：`IMAGEGEN_PARENT_COMPLETION=PASS CASES=25 FAILED=0 SUPPLIER_POST=0 SETTLE_CALLS=0 NETWORK=0 EXIT=0`。
- 父通知真实PG19检查；项目scope真实PG/HTTP31检查；postaccept AST/mock 11组142断言、真实PG SQL18检查。
- 异步图片53检查，模拟19次POST/30次GET/18次上传，`REAL_PAID_API_CALLS=0`；不是线上供应商调用。
- finish隔离真实PG8组；清理SQL/事务25组；后台失败证据PG38项；管理UI真实组件headless fixture19项；Worker23单测及tick receipts59检查。
- reload recovery 32场景458断言是hook/网络fixture，不是实际浏览器重载；管理UI19项仅验证后台失败投影，不冒充画布生成端到端。
- 完整TypeScript stdout/stderr为空、exit0。未重复整项目Next/Linux构建；合并前main的历史build成功记录不扩大为777c68f构建通过。

### 三个仍失败的既有测试入口

1. `verify-model-execution.ts:268`：期待旧图片模型版本触发MODEL_CHANGED，但当前合同允许使用当前报价；合并前main完整Git归档/独立CWD复现同一 `Missing expected rejection`。此前新旧模型/凭据冻结断言已执行，但268之后未执行，不记整套PASS。
2. `verify-imagegen-frozen-quote-pg.ts:274`：取消提交实际400，旧断言期待409。本轮仍失败；原905c8c完整归档已有同一失败回执；`--simplify`通过，不用它覆盖默认模式失败。
3. `verify-imagegen-client-recovery.ts:11`：期待断网后两次POST/不同ID、无GET；当前实际POST1，后续按原凭据查询。合并前368c93e2与合并后同样 `1 !== 2`。该旧期待与当前防重放语义相反；未改代码恢复两次提交，也未修改测试冒充通过。

这三项是测试合同对齐待办，不把它们笼统解释为新合并引入的出图故障，也不声称所有测试通过。

## 线上未收尾与优先级

1. 先完成旧Worker tick/扫描派生执行、领域lease、任务级UNKNOWN和未知收费结果的精确恢复协调。16:04真实旧tick仍未知，固定扫描unknown原行保留；本轮只读，没有resume/清记录/任务poll或供应重提。
2. 在当前未收尾47发布事务内评估部署清理查询优化、完成隔离及绑定lease修复；不得因main合并直接叠候选或把扫描随机身份当作跨实例接管证明。
3. 补当前用户合同下的三项旧测试，再做实际浏览器的断线/刷新/原画布挂回，以及配置切换中的原任务交付验证。已有hook/PG证据保留，不扩大等级。
4. 既有performance分支中的 `video/coordination-pool.ts:49–55` 仍将全部connect异常当acquired=false。此前main已包含，本轮未改；保持原P2，不用该测试预期通过解释为连接故障已经可观测。

15:21保存的只读巡检：最近一小时父任务60 succeeded、14 queued、9 pending、2 failed；这是任务状态快照，不是媒体/用户端验收，也不是新增独立故障总数。16:04活动表UNKNOWN属于观察记录，可同任务重复/跨scope，未按记录数推算付费失败数。

## 制品与副本回滚

本地证据目录：`output/image-delivery-acceptance-20261026-r1/`。

- `MODIFIED_FILE.zip`、`DIFF_FILE.patch`：本轮368c93e2→777c68f的24文件增量；本文审计文档不混入产品验证包。
- `SOURCE_PIN.json`：每个改动文件before/modified SHA及完整分支固定信息；`before/`原字节保留，`modified-copy/`保持变更态。
- 可执行 `ROLLBACK.sh` 只恢复本目录有marker的`rollback-copy/`，不重置Git、不改主工作树/线上/数据库。字节恢复与新增文件删除均核验；恢复副本运行同一finish verifier再次复现原清理失败→UNKNOWN/阻断原任务，exit0是复现成功。
- `VERIFICATION.txt`收录精确命令、输入、literal输出与退出码，包含main push回执、baseline/modified/rollback、真实PG边界、已保留失败和当前服务版本。
- 两个本轮独立loopback PG容器均按实际ID核验后停止/删除；未触碰他人DB容器或测试工作树。

本轮合并并推送main，不发布、不启动/调整巡检计划、不改生产配置或业务表，不新增供应调用与扣款。
