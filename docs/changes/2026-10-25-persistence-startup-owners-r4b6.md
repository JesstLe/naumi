# R4B6 — 剩余核心持久化 owner 与轻量启动组合

## 基线与本模块目标

独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。基线 `5e6f7072c5d53efafa21c20aa72abe1530704073`，4248个原文件的实际字节与哈希保存在 `output/refactor-r4b6-20261025/BASELINE_SOURCE.tar`、`BASELINE.json`。

前两模块完成14个基础owner与模型首次准备，但团队/企业、租户、BI、Canvas和媒体等仍把DDL放在业务运行时文件；为初始化表而import server、图片处理或视频执行链，且旧模块缓存跨Next bundle会重复。本模块将SQL和业务执行拆开，按实际依赖顺序在Web启动准备；不新建任务执行器、DI容器、业务限额或用户确认。

## 已落盘实现

- 33个声明/DDL片段迁入20个真实SQL owner文件。团队/企业/租户、BI、竞品、包装、Canvas存储、视频存储、后处理、审计、目录、图片/报价和素材等各自持有原SQL；原模块保留同函数兼容出口，生产named消费者改绑轻量owner。
- `application/persistence.ts`是明确的37-owner顺序组合；`application/startup.ts`只区分运行模式和组织持久化、模型准备两个阶段。构建、Edge、无DB及两个sidecar仍不运行一般应用初始化。
- 计费configuration factory与wallet/task service组装分开。启动只取原配置生命周期，不构造账务业务服务；原createConfigRuntime表达式、初始化callback与计价算法保留。
- Canvas复制原来每次直接执行CREATE TABLE，现同位置等待专属schema owner；复制本身、operation指纹、事务、归属与输出规则不变。
- 各owner继续使用原事务/锁/失败重试逻辑，按实际Pool共享就绪。共享容器只增加泛型类型支持，前后编译出的运行时代码字节一致。

## 静态对照

33个迁移声明/片段中的46次query调用参数保持，三个既有轻量owner中的16次query参数也保持；6838个非目标生产声明AST保持。原billing configuration factory表达式一致；复制用例只替换原DDL语句。共享readiness前后编译的运行时JS字节一致。

完整源码静态图中，startup直接依赖16→3，含动态import的传递可达模块215→132。新的persistence组合传递可达40个模块，没有业务server/runtime/service/execution/dispatch/client依赖；20个新schema文件及两个组合文件均不进入依赖环。原有静态20/3/2等环、含动态20/12/3/2等环的组件集合保持，未将它们记为已关闭。这些是字面import图，不是bundle大小或运行时耗时测量。

## 集中验收方法

- 完整旧源码与新版实际Web启动；33个SQL owner的新旧PG schema列/约束/索引对照、并发初始化、真实SQL故障重试、warm调用以及原钱包/unknown/在途工作逐行保留。
- 六个旧私有initializer只做原缓存声明、常量和函数体的语法投影，依赖ensure/getPool仍从真实原源码加载；公开owner、startup与业务回归使用实际完整模块，不把这些私有SQL投影当成公开HTTP验收。
- 实际Next以26个原公开兼容函数经fixture route调用，另保留实际login/health与原14-owner探针；不是全部产品页面/接口验收。构建SQL/外部请求和请求DDL阶段分开记录。
- 完整模块后集中做原业务/相邻回归、tsc/lint、依赖环、独立副本回滚与补丁重放，再选择性提交和推送。

## 集中验收实测

全部数据库操作使用本轮自有回环PG，外部供应商和付费调用为0；相邻业务中的回环fixture POST按各原始日志记录，不冒充零HTTP。

| 验证 | 完整旧版 | 新版 |
|---|---|---|
| 核心持久化PG | 3组/35检查，exit0 | 3组/36检查，exit0 |
| PG启动/首次owner/warm DDL query调用 | 16 / 25 / 1 | 41 / 0 / 0 |
| 实际Next定向fixture | 22检查，exit0 | 24检查，exit0 |
| Next构建DB query / 首次登录DDL | 0 / 0 | 0 / 0 |
| Next原26公开兼容函数首次DDL / mutation query调用 | 20 / 20 | 0 / 0 |
| schema完整比对 | 134表、1208列、255约束、241索引 | 全部一致 |

DDL数字表示含结构SQL的query调用，不是单条SQL语句计数。新版启动主动做41次DDL query，换来上述业务入口首次及warm路径不再重复初始化，并不是删表或删字段。

PG矩阵覆盖8次并发启动、真实event-trigger故障与重试、完整schema对照、原钱包100/在途预占12/unknown operation及3条保留任务逐行不变。保留任务部分字段为opaque/poison fixture，用于发现意外扫描；不将其当成有效完整工作流执行验收。

21个相邻脚本集中执行全部exit0：租户、团队授权、BI管理与模型链、Canvas节点复制/删除/撤销、后处理/R2故障续交、包装策略、供应商成本与元数据、模型只读8/83、执行6/71、身份8/171、Web启动7/53、registry启动10/99、模型发布、图片准备45、钱包与配置、195实际登录、platform PG29及冻结来源双入口16。完整命令、输入、literal和退出码见`ADJACENT_INDEX.json`与各原始日志。

全项目`tsc --noEmit --incremental false`和本轮99个代码文件eslint最终exit0。Next为实际Next15.5.27的定向fixture，实际login/health handler和26个原公开函数；它跳过fixture内置类型/lint，另由完整checkout集中检查。不是完整产品build、浏览器验收、standalone镜像或容量达标。

## 失败修正与源码绑定

- 初次共享cache变换遗漏supplier-models最后的setter，真实PG、tsc和已复制旧错版的Next捕获`ready is not defined`；已改`state.pending=task`。全部失败日志保留，未改成PASS。
- verifier的泛型结果类型与Next lint保留变量名冲突分别修正；后者仅将脚本局部`module`变量改名。类型与lint集中收尾通过。
- 静态比较首次把类型泛化判为业务变化；先证明运行时JS字节一致，再收窄例外。原比较失败日志保留。
- Next通过后只发生两个验证脚本局部命名修正、一个生产文件尾部空行清理及本轮文档更新。最终绑定同时保存精确哈希及生产emitted-JS相等证明；不把字节不同的文件声称完全同hash。

## 交付与接续

完整原文件4248个，任务变更102个（93生产、6脚本、3文档）。最终`MODIFIED_FILE.tar`、`DIFF_FILE.patch`、`VERIFICATION.txt`和可执行`ROLLBACK.sh`统一位于`output/refactor-r4b6-20261025/`。回滚只在独立副本执行，逐文件恢复完整原hash，并运行旧PG与旧Next行为；实际工作树保留新版。封存、回滚与patch replay的最终字面证据和提交/远端SHA，以`VERIFICATION.txt`和`DELIVERY.json`为准。

## 明确保留的初始化职责

原42个DDL源文件中，Fleet两个角色schema、release-runtime store/worker-tick-receipts和BI显式CONCURRENTLY索引计划保持原字节。它们不是普通Web业务schema：Fleet独立角色不能借一般启动迁移；release/Worker协调池及接管放在R5；BI索引明确只由原维护入口执行，不塞入请求或启动事务。清单见本轮`DDL_SOURCE_FILES.txt`与`BUSINESS_COMPARE.json`。

这是main同步后第3模块；完成后刷新并普通整合origin/main、计数归零，不把重构分支合入main或部署。R5 Worker执行/恢复、残留20/12等环、外围UI/CAS、R6完整产品build/CI/容量和最终交付仍继续。
