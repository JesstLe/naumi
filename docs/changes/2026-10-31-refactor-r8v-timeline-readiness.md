# R8V：完整时间线负载下的开发夹具预算校准

## 基线和实际失败

基线`19085e9c762d6f793f8767e5018f571839df42ea`，完整5322个原始raw SHA和副本保存在`output/refactor-r8v-20261031`。R8U第三轮完整门禁实际145PASS/1FAIL/59NOT_RUN、exit1：原生时间线到副本删除时，Next dev首次编译删除入口触发内存阈值重启；原浏览器POST收到ERR_CONNECTION_REFUSED，删除没有完成。原FAIL、日志和清理保留，不重放原写入。

曾尝试只在浏览器前用GET405预编译POST-only入口；首轮误列已有GET的媒体报价接口，422如实失败；纠正后七条GET405和钱包/任务/账务状态不变检查通过，但后续生成视频时Next仍重新编译并触发同一内存阈值重启。这个就绪方案没有解决问题，已留存原实现/日志/补丁并从实际浏览器脚本撤出，脚本恢复精确原始SHA；不把准备通过冒充整链通过。

## 责任与改动

继续沿现有harness的显式预算，不新增控制层或重试。只把dev App old-space预算从4096调整为6144MiB；原默认按64GiB物理RAM半数配置约32GiB的问题仍被限制在确定的开发夹具预算内。6GiB是否适合这条完整负载由原浏览器链与完整门禁实测，不把设置flag或控制通过当稳定性证明。固定Linux生产环境、Next80%重启保护、产品src/services、系统分页文件与其他进程保持不变。

现有内存verifier增加显式baseline-budget输入，用实际旧4GiB appEnv和已安装Next策略对照新6GiB，保留原未限定预算基线兼容、真实自有Node堆上限/退出回执及固定生产环境EXACT检查。原HTTP方法和所有浏览器动作/断言保持；POST/PATCH/DELETE仍只有一次，UNKNOWN继续查原operation，不增加任何总期限。

## 验证、退出和未完成项

本轮集中执行原/新内存与原HTTP控制、原失败的完整时间线浏览器链；通过后才固定源码并发起新的完整205项回归。baseline、modified、独立副本rollback、失败尝试与原始日志保存在本轮证据目录，不拼接历史144/145和单独59项。该预算是开发测试工具配置，不是生产内存需求、10万活跃容量或持续长稳结论。

整体重构仍ACTIVE；当前固定Web/Worker镜像、运行态、产品浏览器、同机性能/持续混合负载、有效CI和最终main整合按真实结果推进，47 HOLD。本轮属于验证基础设施，不增加产品功能模块计数。

## 定向实测

实际4GiB基线内存9cases16checks；6GiB修改9cases18checks、normal EXACT、fixed生产环境EXACT。实际HTTP23cases87checks通过，原写入/UNKNOWN/原90秒期限保持。原完整时间线浏览器链exit0，导入编辑保存、真实预览/输出像素、采用历史、handle/命名引用视频和副本删除撤销重做全部通过；媒体费3积分、模拟供应商创建1次、付费调用0。完整原namespace日志通过timelineNodeId及mediaJobId双身份核对保存，本次Next内存重启警告实际计数0；不外推长稳或容量。原App/Worker/PG/router/pool和凭据清理PASS；全项目类型检查exit0。

一次辅助日志取证错误使用仅含末100条记录的runtime.log解析namespace，没有找到ID；原子断言停止该取证，未修改产品或实际测试结果。外层PowerShell缺失即时exit检查，仍完成了合法TSC和提交，随后因未生成ignored driver而未启动完整core。这次准备失败保留，后续改用子命令显式检查，不冒充完整门禁已经执行。
