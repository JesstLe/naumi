# R9N：模型覆盖验证遵循 typed 用例边界

## 实际证据与问题

基线bb7247a6，5357原始文件完整冻结。远端b7d407d2的Image41283511281已在Registered model execution and private control-plane regressions组FAIL；实际job/step/annotations已取得，但blob日志三种读取均TLS EOF，未取得远端唯一child栈，不把本地反例冒称已下载的远端根因。

对该组第一条原命令实际执行，exit1：`verify-model-config-coverage.ts`要求headless `canvas-image-tasks.ts`调用`withModelRequest`。生产用例在既有分层中已经调用`withModelOperation`；HTTP入口适配才调用HTTP API。相关原guard/Canvas字节与b7相同。该断言把传输层耦合重新强加给用例，不代表执行缺少模型上下文。

## 修改与约束

只改验证，不改生产。Canvas用例必须实际调用从`model-config/requests`导入的typed `withModelOperation`，不能仅有unused import或来自错误模块的同名函数。具名别名、namespace和等价相对路径都按实际导入绑定识别，避免对空格/拼写布局机械耦合。

补8个纯AST合同检查：实际Canvas正例＋alias/namespace/relative正例，以及unused typed import、wrong module、把HTTP适配塞回用例、构造Request四个负例。变体使用独立语法夹具，不要求产品import保留特定格式。原全src中央SDK构造、30个HTTP入口和video冻结恢复检查保留，不能把本扫描当HTTP/PG功能验收。

原11条模型组的首次集中运行进一步得到真实publication失败：前2项PASS，第3项exit1，旧actor草稿v1/currentv3。该脚本先明确断言restore不覆盖原actor草稿，却又用它准备独立的缺成本案例，导致该案例在成本验证前被stale-base拒绝。现在先补旧草稿必须拒绝的断言，再以当前恢复版本的新synthetic actor建立独立成本缺项编辑；不传acceptStaleBase，不修改生产CAS、原publication ID恢复、billing版本或原草稿保留断言。首轮2PASS/1FAIL/8NOT_RUN日志和资源清理原样保留。

新actor的缺成本提案继续使用原案例的pool拓扑。一次准备错误曾改成恢复后的合法direct route，实际返回applied而非预期failed；该失败记录保留，不把合法direct改成产品错误，也不把预期改为接受。现在显式断言pool拓扑，以隔离验证Router成本缺项的原本语义。

剩余8条集中诊断实际得到6PASS/2FAIL：admin仍期待缺管理连接时503，但生产已按发布数据保持managed模式并明确409/MODEL_CONFIG_MANAGED；候选检查精确状态/管理入口及真实settings零写入，不重新打开legacy。shared-capacity则把当前发布从1升4后仍期待旧任务把总预算永久压回1，与现行publication拥有当前账号额度的合同矛盾。候选用真实PG/回调验证direct1+pool3填满当前4、第五429、旧1档任务可使用当前4，再把当前发布降为1，保留Go原4档冻结投影，原封不动运行pinned Go的共享/释放/重启/丢ACK测试；不修改生产限额算法或Go归档，不接受超额。

## 依赖、验证和后续

验证脚本只读取当前Git源码及TypeScript AST；不加载业务初始化，不连接生产。后续集中沿原11条注册模型命令、原PG/loopback HTTP与固定Router源检查，fixture来源和实际clock保留；若有后续失败逐项记录，不将首项通过等同整组通过。

原命令/新版/类型与copy-only rollback的最终真实结果归 `output/refactor-r9n-20261101/VERIFICATION.txt` 与DELIVERY；完整219和新Image CI、main普通整合仍待实际回执。整体ACTIVE，未部署，47HOLD。

最终本机原11条注册模型组已单次11PASS/0FAIL/0NOT_RUN，真实隔离PG/loopback HTTP，Router固定源b3fc8dd6及Go1.26.7 Windows运行；未修改pinned Go文件，真实供应商0。coverage8合同、publication旧草稿拒绝/新成本失败、admin409＋零settings写入及current4→1/保留旧4投影的完整Go共享容量均实际通过。执行前后5358源码字节一致；本段为执行后的单一文档结果桥接。此结果不代替GitHub Linux的新head完整CI。
