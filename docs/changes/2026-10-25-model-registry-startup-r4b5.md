# R4B5 — 模型首次发现归启动／管理，发布读取不再初始化

## 基线与目标

独立工作区 `E:/Workspace/naumi-refactor-20261024`，分支 `codex/core-refactor-20261024`。基线为 `e5c337b0f7a4a1d8ebb9cb1d1a8549a03cb2e09a`；4245个原文件的实际字节与哈希保存在本轮 `output/refactor-r4b5-20261025/BASELINE_SOURCE.tar` 与 `BASELINE.json`。

R4B4已把13个基础owner和跨bundle就绪状态收敛，但`published.ts`仍在目录/执行读取遇到空库时动态加载完整管理lifecycle，隐式发现供应商资料、导入凭据和发布配置。这一条读→初始化反向依赖是本模块删除的目标，不重做前序的报价、交付或Canvas模块。

## 已落盘实现

- `published.ts`只读已发布current或指定版本，缺表/缺版本返回原`CONFIG_UNAVAILABLE`语义，不进行DDL、发现、导入或自动换版本。
- 新增模型启动组合：已发布registry只读检查，不依赖Router管理凭据；真正空白且已配置Router的registry才沿原lifecycle/import/bootstrap与repository事务导入。没有Router配置时保留legacy运行方式。
- 启动/读取遇到已有版本却丢失active pointer时不再自动导入新current；原版本保留，返回明确的配置不可用状态。原管理lifecycle兼容行为保留，没有修改发布/CAS/凭据加密/视频冻结/业务售价算法。
- 模型准备失败只返回启动诊断，不阻断登录和管理修复入口；管理端继续沿已有retryable lifecycle恢复，不增加平行恢复任务或用户确认。
- Supplier video元数据schema接入既有共享Pool/owner就绪状态，Web基础owner由13增至14；原DDL/数据读写不变。
- 首启没有任何可导入模型时，以原repository事务回滚返回`unconfigured`，不提前发布空目录；只有启动调用要求实际模型，原管理中心仍可建立空配置并编辑。原`applySetup`成功写入key后显式准备registry，向导200/二次自锁403保持，不把这件事重新塞回目录读侧。
- 复用现有Next verifier，扩展为完整源码新旧对照与可选model-registry场景；记录启动和目录请求各自的metadata GET、结构变更及写入，不把通过标准停留在直接函数调用。

## 实际集中验收

- 完整原文件基线对照：PG旧10组96检查、新10组99检查，均exit0。冷读取旧隐式导入→新只读拒缺失；首次显式启动、缺管理token但已有已发布数据、真实Router故障/PG插入trigger故障后原管理修复、orphan版本、指定缺失历史、原在途/钱包/冻结报价、无Router、原setup handler与sidecar均通过。
- 实际Next 15.5.27完整源码副本：旧23检查、新25检查，均exit0。build SQL均0；首次目录请求旧metadata GET=2/DDL=1/结构或写入SQL调用=37，新分别为0/0/0。新发现移到启动阶段GET=2；原登录/health均保持，基础owner13→14。目录使用实际`getImageModelCatalog`，由fixture Next route暴露；登录与health为实际产品handler，不冒充全产品浏览器验收。
- 旧行为复现与回滚都保留真实字段/调用顺序，不以新测试数字洗掉前轮资料。增加首启空配置矩阵前的9组PG阶段结果另留存为`*_PRE_ONBOARDING.log`，最终10组结果单列。
- 全项目tsc、11个变更代码文件lint均exit0；10项相邻验收通过，包括读8/83、执行6/71、身份8/171、基础启动7/53、原发布、准备45、钱包/配置、195真实账号登录和视频冻结来源16。
- 发布repo、原bootstrap算法、凭据、executor、billing和图片规划/派发等16个关键完整文件与基线原字节一致；Supplier video owner全部query参数保持。发布读→lifecycle动态边1→0，新启动owner无依赖环；原20/12等环仍未消除，未据此记整站解环完成。
- 独立副本回滚、4245个原文件hash、补丁/归档/Git blob、清理及远端推送结果统一见本轮`VERIFICATION.txt`/`DELIVERY.json`，工作区保留新版。

本轮改善是读路径不再隐式发起配置导入，配置准备有明确触发点。没有测量线上延迟/吞吐，不以37→0的SQL调用数推算用户容量。实际Next测试是最小路由fixture，不是完整产品/standalone镜像、整站容器或生产验收。

## 后续

这是main同步后的第2个模块，不合main、不部署。其它域ensure、视频20/图片恢复12依赖环、外围UI/CAS、Worker生命周期/执行迁移与最终完整产品build/CI/性能容量验收继续；本模块不把目录fixture通过当成全站验收，也不自动重放任何已受理或unknown收费任务。
