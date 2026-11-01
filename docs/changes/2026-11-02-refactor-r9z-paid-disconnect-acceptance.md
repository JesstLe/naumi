# R9Z：同一付费任务的浏览器断网恢复与原生验收输入

## 职责与依赖

本轮补齐已迁移模块的真实业务链证据，不新增产品规则，不拆分原事务，不新增任务系统。Canvas 的持久付费任务、原图交付、账本仍由原 Web/Worker 应用用例负责；浏览器 pending recovery 保持显式只读“检查原任务”。验证端新增专用 `canvas-paid-disconnect-browser.mjs`，原主浏览器入口只编排。追踪端在原 fixture 中以 owner 限定读取原 parent/child、billing、ledger、artwork 和 supplier call；SQL 使用 repeatable-read / read-only，释放连接后才用原 codec 解码原结果，只输出哈希，不输出图片 base64。

原生管理 UI 的源副本、子进程、IPC、端口、退出和清理由现有 `model-management-ui-runner.mjs` 唯一负责。`NAUMI_VERIFY_ROUTER_SOURCE` 属于调用目录；先解析成绝对路径再切换子进程 cwd，不让来源路径随副本变化。经典业务浏览器首次访问 Canvas 的 Next dev 编译在现有 120 秒启动预算内完成，不延长原 30 秒浏览器导航或业务断言期限。只对经典 business profile 使用自有 member cookie 准备实际页面。

## 本轮实现

- 在原 92 项浏览器验收和实际 31 图下载场景之间加入同一真实付费操作的四项整链检查。
- 从实际 Canvas 点击保存原 operation，Worker 到达一次被暂挂的回环供应请求后，令浏览器上下文 offline；同一固定 Worker 在后台继续完成原图、作品和一次 6 积分结算。
- 联网并重新打开原项目，点击现有“待恢复任务／检查原任务”，读取真实 UI 发出的带原 scope 的 GET 响应；验证原 pending key 退休、作品可见、回执相同和下载字节 SHA 相同；再次重载不新增付费 POST、供应请求、作品或消费。
- 不将浏览器 offline 仿真声称为物理断电、服务器离线、供应商 UNKNOWN 或全部故障矩阵通过。
- 修正调用根目录下相对 Router 输入；增加两种 profile 的相对／绝对路径真实子进程检查及自有页面准备检查。
- 产品 `src/` / `services/` 不改，原浏览器和经典业务断言不删改；AST 文本盘点与完整原始字节校验单独留证。

## 当前执行与证据

证据目录：`output/refactor-r9z-20261102/`。固定完整镜像源 `61ef32cc18a6cd14948743f2c7c00bb4846b781e`，5387 文件；镜像 `sha256:f5f9eb5d89dae15b33d243febc680b8f467354a7f0c3060423a7d140fc6f0175`。后续验收脚本提交不是该镜像构建源；runtime 校验全部导入生产字节与固定镜像源相同。

已完成：原完整浏览器 92 检查／7 笔消费／42 积分 PASS；新断网选择用例四项 PASS（明确原 92 不在该选择运行中）；运行器真实子进程 122 检查 PASS（该层无 Next/PG）；5 个验收文件原 166 个断言调用 AST 文本完整保留；定向 lint 与全项目非增量 tsc exit 0。最终完整组合已单次 **96 PASS／8 consume／48 积分／exit 0**，完整原有场景与新增四项同时执行；真实经典 business 也已 exit 0：`BROWSER_ADMIN=PASS APPLY_REAL_GO_ROUTER=PASS RELOAD_PRICE=75 TOOL_CATALOG=PASS CANVAS_TEXT_CATALOG=PASS MOBILE=PASS NON_ADMIN=404 SUPPLIER_CALLS=0`；自有Canvas启动准备200、子进程和fixture全部关闭。

## 失败记录与修正

- 原 classic wrapper 使用真实 PG 和存在于原根目录的相对 Go 输入，复现 `Fixture Router build failed`，exit 1；与远端 Image annotation 的阶段／错误一致，未将它扩大为所有历史 Image 失败根因。
- 首次修正 Go 路径后真实管理发布／75 积分／garment 控件已推进，随后 Canvas 冷编译 32.2 秒超过原导航期限，exit 1。由现有启动预算负责准备，而不是放宽业务断言。
- 两次完整 modified 尝试在新增场景开始处，分别遇到先进入 31 图项目及折叠侧栏遮挡；原先 92 检查均完成，完整运行仍按 exit 1 保留。新场景改到原项目仍可访问的位置。
- 选择 debug1 误期待 reload 自动退休 pending；改用产品现有显式检查，不为 verifier 改产品。debug2 的额外裸 GET 丢失项目 scope，404；改为捕获真实 UI 恢复 GET，不放宽 scope。debug3 四项通过，所有失败与清理日志保留。

## 远端与整体剩余

旧 PR head 61ef 的 Core 实际执行 GitHub merge source `93edc0067ce2001c993e36510d4743a16723cba8`，结果 SUCCESS。API 核实两者 Git tree 同为 `2239f51121d606d0636d39ba7a41514d76b617a1`，因此树一致，但执行 SHA 不改标。该 head Image 实际 FAIL 于经典 business fixture Router build；最终新 head CI 需重新读取，不能沿用旧 Core 为新脚本全通过。

整体仍 ACTIVE。M09 只推进本轮真实同任务浏览器离线维度；M03／M04／M06、其他故障维度、全量语义耦合审阅、有效当前 CI 与候选合入 main 仍分开完成。独立重构分支已超过 48 小时，原因是整体退出证据及有效同源 CI 未闭合；不以反复拆文件延迟交付。未发布，47 HOLD。

## 封版与回退

最终四产物为完整 `MODIFIED_FILE.tar`、原始字节 `DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`。回退只允许显式独立源码副本，首写前检查完整当前哈希、原始归档与全部目标；后续独立编辑不匹配时零写入。复验旧相对 Router 行为、完整原始哈希及补丁重放，工作区保留本轮新版。最终命令、输入、字面输出、exit、文件数及固定提交归本轮 VERIFICATION / DELIVERY。
