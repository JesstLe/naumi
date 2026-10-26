# R6A：同源码集中验收入口与构建前置回归

日期2026-10-26，独立重构worktree，基线a72d47d0cfd13ee118d6e72e7ce848a65c34b735，完整4463原文件hash/归档。

## 实际边界

- `scripts/verification/refactor-cases.mjs` 只登记21个已有入口，foundation/generation/pricing/canvas/video/runtime六组；不是重写测试框架。新增completed-parent真实PG验收纳入生成组，不能只测happy path。
- `refactor-runner.mjs` 串行调用原脚本，保存literal命令、exit/signal、原始日志hash、PASS marker、NOT_RUN；失败即停，无自动重跑。记录完整文件内容摘要、HEAD、dirty、Node/平台和fixture DB身份（不保存密码）；每项前后及最后检查同源码。
- 清洁固定SHA且完整core通过才exit0/PASS；分组或allow-dirty全部通过仍PARTIAL/exit2。错SHA、dirty、非隔离PG、源码中途变化、spawn失败、缺脚本、exit0但无marker均FAIL，不把测试库存当放行。
- `--resume REPORT` 仅接受同SHA/全文件摘要/环境/组、同命令且原日志hash一致的PASS；否则拒绝或实际重跑该项。证据目录必须为新output子目录，不覆盖已封存记录。
- `verify-refactor.mjs`与npm scripts是统一CLI；`verify-refactor-image.mjs`在清洁固定SHA用真实Dockerfile构建完整Linux standalone Web+Worker+媒体runtime，校验image标签/环境source、Worker bundle hash和包内依赖。只本机构建，不发布。
- `refactor-regression.yml`复用同入口；PR触发覆盖src/services/scripts与构建配置，不再漏独立library。docker workflow在resolved固定source上先跑reusable regression，docker job needs该结果，原发布manifest流程保留。Branch protection required-check设置与GitHub真实运行结果未由本地静态检查代替。

## 实际发现与修正

1. 新主线程旧草稿保护使prepare fixture复用同actor旧draft失败，改fixture每次从当前版本用独立actor建draft，不加acceptStaleBase绕过。
2. 旧delivery fixture没准备creation owner schema，补实际ensureCreationSchema；之后发现真正缺口：completed-parent快速路径忽略child.deliveryComplete=false，把保留原图/后处理未完成写为succeeded。现投影partial，警告/原图/原6积分/账务和UNKNOWN保留；完整旧树probe复现BASELINE_FALSE_SUCCESS，实际新入口43检查通过。没有新供应商POST、结算或任务重放。
3. 图片定价verifier仍mock旧admin/runtime/context import，跟不上真实execution-services/simulation/creation-scope/access owner；改绑定当前owner且保留旧投影兼容，25场景74检查恢复，未回退取消确认。
4. workbench/video脚本硬编码一次性的fixture数据库名称，统一接受localhost上显式带fixture标识的独立库，仍要求NAUMI_VERIFY_ISOLATED_DB=1；不连接产品库。
5. 视频wire用例依赖ignored output下research输入，首次干净CI会缺文件。现从留存独立研究资料抽取模型/modes/maps到版本化fixture，记录原文SHA，不从生产能力表生成自证oracle；32模型/92模式/912wire/1254case/8251assertions保持。
6. Windows不具备POSIX SIGTERM drain语义，原子进程用例不降低断言：Windows入口在只读、network none的Linux Node容器运行原脚本，CI Linux直接执行；unit固定TAP，防Node reporter差异被误判为失败。
7. 编排首轮spawn error监听安装晚导致异常退出，已在任何await前绑定事件。原失败与首轮fixture目录保留；一次PowerShell清理命令被拒绝，未换工具重试删除。后续正常selftest会核对并清自己的临时目录。

## 集中结果与诚实口径

入口selftest覆盖真实子进程、parsed YAML接线、错误exit/无marker/错SHA/dirty/源码漂移/精确resume/篡改日志/spawn异常。旧基线仅证明原CI没有该core依赖，是静态workflow缺口，不冒充运行旧构建失败。

定向准备45、交付73、completed-parent43、图片定价25/74、Agent58、workbench13组、Canvas/text/art/history/node、video wire及frozen PG16、Worker23unit/实际Linux handoff通过。每个dirty分组仍记录PARTIAL，不拼接成一个清洁SHA PASS。最终整组clean SHA、镜像build/package、类型/lint、回滚和remote以output/refactor-r6a-20261026/DELIVERY及原始报告为准。

21项只代表已登记的核心重构回归，不等于所有历史脚本、全站浏览器、实时供应商、容量或历史用户个案全部关闭。原billing-all/image-gateway旧总入口仍保留，不把其中尚未整理的历史断言改成绿；后续R6B整包运行验收与最终候选继续。

## 可复用命令

```powershell
$sha=git rev-parse HEAD
$env:DATABASE_URL='postgresql://fixture:fixture-local-only@127.0.0.1:65479/naumi_core_fixture_r6a'
$env:NAUMI_VERIFY_ISOLATED_DB='1'
$env:SETTINGS_SECRET='r6a-isolated-fixture-secret-only-20261026'
node scripts/verify-refactor-runner.mjs
node scripts/verify-refactor.mjs --expected-sha $sha --out output/refactor-core-run
node scripts/verify-refactor-image.mjs --expected-sha $sha --out output/refactor-image-run
```

证据路径已存在则拒绝覆盖，下一次用新目录。`--list`只盘点不执行；`--group canvas`仅分组验收，不标整组PASS。

## 回滚/继续

四产物：`output/refactor-r6a-20261026/{MODIFIED_FILE.tar,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`。完整modified副本恢复全部4463hash并删除新增入口/fixture/workflow，再跑旧workflow缺口与partial父回执probe；真实worktree保持新版，task-only提交推送。原失败不删除不改PASS。

本轮为main同步后的第1模块，不合main、不部署；整体重构active。完整镜像的Web/Worker实际混合链、持续运行/内存与同版本启动、剩余外围UI和旧writer、历史benchmark真实问题与容量仍需后续闭合。
