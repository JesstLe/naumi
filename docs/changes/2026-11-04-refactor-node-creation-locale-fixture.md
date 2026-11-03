# aaa Core：节点创建 fixture 的实际 locale 词法绑定

## 原失败与基线

PR #8 Core run41699153123/job126137558729，通知头aaa80dc8、实际checkout14cd38c9，162 PASS / 1 FAIL / 85 NOT_RUN。generation/activity38-182、presentation、pending、secondary、text与task-boundaries90-772已在该次CI真实通过；随后 canvas-node-creation 在 textNodeCreationPorts 报 `ReferenceError: L is not defined`、exit1。原日志保留于 output/pr8-checks-aaa80dc8-core-audit-20261104，不将新case当成旧generation修复失效，也不把前面通过当成完整Core。

当前307722f6的完整5711原始文件、逻辑mode、前阶段四产物和shared baseline在首次写前封存。未经修改的原脚本首轮同样L未定义/exit1，保留字面stdout/stderr/FAILURE，不造额外产品失败。

## 真实 owner 与最小修复

Canvas361从useI18n获得locale，384定义组件局部L；textNodeCreationPorts2089用实际L选择默认文字节点标题。原VM只提取函数声明，遗漏了该变量声明与primitive locale，在构建ports时就失败，尚未进入节点创建/保存/undo。

本轮只改 verify-canvas-node-creation.cjs 和文档，不改产品：

- AST定位唯一真实L initializer，在VM内执行该原表达式；不是手抄locale predicate、固定中文/英文返回或改用另一条t文案。记录其原TS source/hash、UTF16 span及整个Canvas原始hash。
- 显式locale默认en，匹配原recorded English t端口；zh/en另设完整矩阵。它不改变产品默认语言，也不是LocaleProvider/cookie/SSR浏览器验收。
- 原27个common cases与完整trace/--compare保持；9个新增localeCases独立报告，覆盖双语默认标题、显式标题优先、初始prompt/content、sourceIds去重上限、无项目创建、下一次创建切语言不重写已建节点、匿名/只读不写。
- history/save/append同一个node的ID、title、project和完整字段一致；记录实际adapter的document capture以及view.area第二个project参数。原focus trace形状不变；该recorder不被说成真实跨项目/ABA focus验收。
- 原位置、序号、引用、八类dispatch、权限、undo/save合同及NETWORK0/零付费保持。placeholder仍属composer，不进入节点正文。

## 集中验证与来源

原无改基线exit1。另保留明确标记的诊断副本：只为旧driver绑定实际L与locale=en、不改原27cases/断言，恢复得到27cases/29checks的参考trace；它不是unmodified baseline。修改driver执行27common+9localeCases，带原--compare完整trace EXACT，106checks/exit0。默认正式CLI无compare时少一项比较检查，不能把106误贴给默认执行。

相邻原模块集中通过：entry-models；node-operations19cases/59checks；view-navigation18normal/35checks；实际React view DOM19checks（包含真实text creation的新project/adoption及ABA）；node-history16PASS。端口层、React/本机浏览器、PG/全Next验收分开记录。本轮没有新产品/类型/package/config输入，未重复执行完整Next/PG构建。

正式目录继续249，扩展原canvas-node-creation case，不另加替代case。最终clean SHA的原case正式selected、改动文件lint、独立窄审、literal patch replay和copy-only三相四产物以 output/pr8-node-creation-locale-fixture-20261104 为准；selected外层PARTIAL/exit2不是完整Core。

## 封存与后续

四产物为MODIFIED_FILE.tar、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh。行为副本必须运行各自旧/新driver；用新common driver读旧source会提前补L，不足以复现旧fixture缺口。回滚仅对无.git祖先的独立源副本生效，必须先通过完整原/新hash/mode/archive guard；later-edit/source分别73/64零写，恢复原5711及原L错误，当前候选保持修改。共享checkout与上一billing阶段产物不变。

wholeRefactor=ACTIVE，mainMerged=false，deployed=false，47 HOLD。新头完整Core/Verify按自身通知确认，不轮询/重跑旧CI，不把此局部测试修复声明为重构完成。
