# 59d Core/Verify：异步受理场景握手与业务模型入口

## 基线与失败身份

当前基线964de5cefccfd5372c2335bf8fb44b1e39700e90（main ca00b1f1），完整5699 tracked文件/raw hashes已封存。本轮只改测试与记录，产品源码不改。

通知对应59d9cdf的两条真实失败，实际CI merge source3c80e4a8b894d8c54790449bd7d50b5a768a8699：

- Core41637486017/job125922237557：18PASS/1FAIL/225NOT_RUN，main-sync-assistant-navigation89立即断言posts1而实际0。失败发生在身份切换/held answer释放之前，不证明已受理答案丢失；即时计数0不是生命周期HTTP次数0。
- Verify41637486018/job125922238293：完整业务UI在verify-business-ui.ts60等“业务文字”模型30秒超时。旧入口脚本59d→964未变；正文/AI写作拆分后模型只在AI写作模式。

原日志及job/head身份存于兄弟目录pr8-checks-59d9cdf-audit-20261103，旧失败未改写为新头状态。

## Core最小修正

产品text-task在prepare后assertView，await可选prepare即使undefined也让出执行。这是正确的异步准备/身份fence，不应为了测试同步化、跳prepare或放宽scope。

原submit fixture端口posts++后只resolve独立entered gate，测试run后等待该端口确实进入，再保留原posts1断言、切project/account/workspace身份，最后释放同一held response。Promise.race监测提前结束并给明确诊断，不用sleep或固定microtask次数。

原3类场景的scope/header/hasResult/model/保存次数/显式resume不重购断言保留；submit-port entry是声明的fixture边界，不等同真实财务受理。

当前未改脚本先真实复现相同0!==1/exit1；修后完整17场景/95检查、实际React导航hook全部PASS，浏览器/loopback清理完成。

## Verify最小修正

verify-business-ui.ts仅在创建文字节点后scoped text-node-dock点击AI写作tab，再定位原业务文字模型。原publish、reload price、模型catalog、鉴权gate、mobile、non-admin404、supplier0和30000ms预算全保留。

原入口使用真实隔离Next、自有loopback PG及仓库manifest验证的GoRouter：原baseline复现相同selector30秒失败/exit1，修改版完整PASS/exit0。Router publication确实读回applied，receipt/state projection digest一致；activations1/generationRequests0。原“错误Router目录没有go.mod”的setup失败保留，不算UI baseline。

## 复制执行与回滚证据

verify-ci59d-acceptance-contract.cjs执行传入源码副本中的实际完整main-sync harness，而不是用root新测试套旧产品。只允许原0!==1/line89/前9case作为预期baseline FAIL；依赖或setup错始终ERROR/exit2。首次仅NODE_PATH的esbuild依赖解析失败留证；最终只在源码副本临时创建依赖junction并验证exact link/realpath后非递归移除，不改共享依赖或源文件。

这条oracle的三相行为证据仅代表Core harness；business完整PG/GoRouter模块原新运行及另一副本字节回滚另行记录，未冒称第三次浏览器回滚重跑。两模块整体字节恢复由全源四产物证明。

## 验证与未完成项

最终集中静态使用非增量tsc，5606个实际解析输入前后hash不变，exit0/类型错误0；三份本轮代码路径eslint exit0/错误0/警告0。copy driver最后修正把缺源snapshot纳入ERROR分类边界，实际缺源ERROR/exit2、原完整harness FAIL/exit1、修改完整harness PASS/exit0，stderr均空，不将setup错误当原回归复现。

本阶段命令、输入、literal结果、源hash、失败、资源清理及四产物归output/pr8-ci59d-followup-20261103。正式原main-sync case保持完整，不以新增copy driver替代或缩小；source-root driver用于精确副本原/新/回滚证明。

当前CI、完整core246/R04/同case整版及main整合仍独立。wholeRefactor=ACTIVE，mainMerged=false，deployed=false，47 HOLD。没有生产发布、真实供应商调用或付费任务重放。
