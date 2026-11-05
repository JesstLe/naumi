# cb2 Verify：Canvas 可见状态握手与同源 production 验收 fixture

## 原失败与两个独立问题

基线cb2e5d39cb44ce6825a3334087ad5d43855d16cf，main ca00b1f1，5703份tracked raw hashes/Git modes及完整源归档已封存；共享旧工作树独立快照不覆盖历史记录。

Verify run41676168426/job126057246531实际执行f53d15c9b6822755873402298c6231341a5c4ad0。step18在verify-business-ui.ts58等待创建新项目click30000ms超时。原日志、2.25MB官方digest一致artifact、空白PNG/HTML和HTTP失败记录已保留并真实打开。

必须拆开两条结论：DOMContentLoaded后的瞬时isVisible=false不能判定空项目；同时本次CI在16:49:33Z明确发生Next dev memory-threshold自动重启，40秒Ready、42秒原click超时。原fixture只预热/canvas HTML（34272ms），未保证hydration/native API冷编译完成。Next15.5.28在请求finally检查used_heap_size超过heap_size_limit的80%后退出77，dev CLI重启worker；父CLI未退出不等于同一worker持续服务。没有上传实际heap/机器内存值，不编造容量数字。

## 测试入口归属与可控复现

business脚本增加enterCanvasTextTool，只在原共享30000ms单调deadline内等待文字工具或项目浏览器创建按钮的visible union；hidden保留DOM不计就绪，loading不当empty。main保留原导航、创建动作、AI写作、模型选择与全部业务断言。没有sleep、reload/retry或扩大预算。

verify-business-canvas-readiness执行传入源码副本的实际旧main三语句或新helper，不以新export缺失制造基线失败。真实Playwright结合声明的gated DOM：原分支在loading时选创建，释放后真实文字工具已可见、隐藏项目浏览器仍使原click满30000ms超时/exit1；修改版loading恢复、真实empty创建、retained-hidden浏览器和context-loss不吞错四场景13检查PASS。该oracle不称Next、PG、供应商或历史内存重启复现。

## Runtime 归属与构建证据

仅调整测试fixture运行入口，不改产品与Next内存保护。business验收复用经过SOURCE、完整来源、实际build/runtime input set/hash/mode、public build environment与bundle/assets核验的production standalone；本run复制server/static/public并启动node server.js，不另起冷next dev。原PGOPTIONS、Router与私有配置仍在runtime注入。缺失、旧构建、源或public环境不匹配均为setup失败，不静默回退开发服务器。

构建capture/seal与owned runtime准备由独立production-build测试owner负责，原120秒startup和30秒browser预算保持。CI复用原完整Build步骤，不重做构建；本地真实production业务模块与构建/源/回执另有独立记录。新正式readiness与production单元case不替代完整真实业务UI。

仍需原隔离PG/真实pinned Router环境；生产构建准备命令为：

```text
node scripts/prepare-model-ui-production.mjs before-build
npm run build
node scripts/prepare-model-ui-production.mjs seal
npm run verify:business-ui
```

默认封存文件output/model-ui-production/BUILD.json，显式路径用NAUMI_MODEL_UI_PRODUCTION_MANIFEST。同一真实HEAD内只允许逐路径记录的test/doc差异，产品/build/public输入必须完全相同；提交变化后不得沿用旧seal启动新头验收。

本地Windows共享node_modules为外部junction，没有替换、安装或修补该共享目录。默认/CI必须从owned standalone内解析next/pg，不允许ambient fallback；仅显式NAUMI_MODEL_UI_LOCKED_EXTERNAL_DEPS=1允许锁定Windows外部依赖，绑定source lock、installed lock、真实路径、next/pg package和入口hash。实际808 desired/727 installed精确匹配，81缺项全optional、无extra/mismatch/nonoptional缺项；不拿外部owner根锁代替安装图。该本地模式明确selfContained=false，不称Linux embedded CI或固定镜像。

## 验证分层与待完成项

严格原5703源、原dev runner和原脚本的本地完整baseline首轮实际PASS/exit0，applied回执及generation0保留，不为制造FAIL重跑，也不把它改写为CI原失败复现。原CI失败与受控入口竞态FAIL是不同证据。production完整模块、静态、原runner、正式selected、独立窄审与最终source桥的实际结果以output/pr8-business-canvas-readiness-cb2-20261104为准。

唯一真实production build的capture/npm build/seal全部exit0，完整5708源pre/post相同，3457 build inputs固定；BuildID CCrfwh_sBXxjVbM6tSjHR，46条原构建warning保留。随后只改两份verification helper/unit关闭postcopy同tree换HEAD漏核与对象键序假漂移两项P2，明确test-only hashbridge，不重build。唯一完整modified Next/PG/Go Router业务模块PASS/exit0，production ready165ms、authenticated Canvas预热105ms；原admin/发布/价格75/catalog/Canvas/mobile/nonadmin404/supplier0全通过。独立Router receipt/state digest一致、activations1/generationRequests0；两schema、自有PG与七端口精确清理，原build与owned2151文件hash/size/mode重开不变。

最终production单元65检查与原model-ui-runner156检查通过；均为真实minimal child/process/file端口，不冒称Next/PG。独立窄审保留两项P2原报告，修正后再桥接。非增量tsc5606实际输入稳定/exit0；10路径lint0/0，额外registry selftest第11路径单独lint0/0且不属于tsc输入，未把旧lint贴给新文件。原refactor-runner selftest第一次因新增CI命令而暴露npm-only shell fixture漏Node端口，失败保留；最小补capture/seal显式端口后完整33场景440检查PASS，原npm0/7 literal/exit与failclosed断言不删，新增capture/seal失败11与不提前npm检查。

四产物全源副本回滚必须恢复原5703 raw hashes与行为，仅对独立副本操作；当前候选保留修改，先前phase全部封存。新增两条正式case使目录248，不等于248已完整执行。wholeRefactor=ACTIVE，mainMerged=false，deployed=false，47 HOLD；新头CI独立等待，旧head通过不重标。
