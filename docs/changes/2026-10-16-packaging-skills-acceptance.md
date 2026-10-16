# 包装 Skill / 文件导入 / 独立创作页验收

## 当前交付

- 任务分支 `codex/brand-packaging-skills-20261016`；不触碰共享checkout的管理UI和canvas未提交改动；不合main、不发布服务器。
- 原附件四个规则/元信息文件逐字保存在 `skills/brand-packaging-strategy/`，入口及两份参考全文静态打包进 `official:brand-packaging-strategy`（2699字符）。`node scripts/sync-packaging-skill.mjs --check` 通过。
- Agent / canvas 共用 SkillBook 已支持点击与拖拽 `.md/.zip/.json` 后直接存入当前账号。个人Skill用既有表存储，归属来自登录身份；同定义同账号并发幂等，同名不同内容不覆盖。带本地引用的单MD明确要求完整ZIP，不静默漏引用或截断。
- 创作入口 `/tools/packaging-strategy`：八项简报、关键追问、补充回答、先出初稿、策略优化、云端项目、本机草稿、复制与Markdown下载。使用同一个Skill，文字模型沿用 `text.generate` 绑定。不依赖用户拥有Agent权限；嵌套创作页面使用独立授权。
- 新表 `app_packaging_projects` 为扩展DDL，email隔离、revision CAS、调用前claim、4分钟租约、120秒实际fetch超时，调用轮次runId关联BI；失败保留输入/有效旧结果并返回最新revision。首次生成必须先取得项目id；重复失败回答不重复追加。
- 真实验收同时修复旧Agent错误完成门：pi-ai以 `stopReason=error` 正常resolve时，PUT发error而非空final，POST返回502；文字策略计划不再显示要求商品图/调用生图。

## 本地隔离条件

- Runtime：`E:/Workspace/naumi/output/brand-packaging-runtime-20261016`；`npm ci --ignore-scripts --no-audit --no-fund` 使用repo锁定 React19.3 / Next15.5.27，未改共享node_modules（共享目录实际仍为React18/Next14）。
- 自有 PostgreSQL 容器 `naumi-packaging-skills-pg-20261016`，仅127.0.0.1:15616；脚本各自随机schema；浏览器账号使用专属本地DB的 `example.test` 身份。
- 本机Next预览3616、独立dist目录；没有连接任何生产DB、部署服务器或调用图片供应商。真实文字验收仅使用本机既有配置的密钥，未复制进源码/文档。

## 集中检查结果

| 检查 | 实际结果 |
|---|---|
| 原始ImageSkills基线 | `IMAGE_SKILLS=PASS CHECKS=100 STORAGE=POSTGRES API=AUTHENTICATED PROVIDER_CALLS=0`，exit0 |
| 新版ImageSkills | 同脚本 `CHECKS=102`，exit0 |
| Skill文件导入 | `SKILL_IMPORT=PASS CHECKS=72`，真实Postgres/API、跨账号、并发4请求只创建1条、CAS、完整原附件、坏包/越界/解压/缺引用校验，exit0 |
| Agent实际runtime＋模拟供应商 | `PACKAGING_AGENT=PASS CHECKS=64`，真实ZIP/PUT/POST/本地HTTP SSE、历史、跨账号、HTTP400和SSE错误不再空final，模拟文字7次、真实模型0，exit0 |
| 独立策略API＋模拟供应商 | `PACKAGING_STRATEGY=PASS`，追问→回答→优化、保存失效旧结果、CAS、运行租约、失败重试、托管文字路由、独立授权，模拟文字6次，exit0 |
| 页面模型边界 | `PACKAGING_PAGE_MODEL_CHECKS=32`，exit0 |
| 完整Next生产构建 | `node scripts/build-reference-workbench.mjs` 后 `NEXT_DIST_DIR=.next-packaging-build NAUMI_BUILD_CPUS=2 node node_modules/next/dist/bin/next build`，编译/类型/89页生成/trace/路由汇总完成，exit0；保留原项目lint warnings，不声称零警告 |
| 回滚副本 | modified全路径SHA→reverse patch→baseline全路径SHA通过；原ImageSkills100项重新通过exit0；候选源码保持修改状态，数据库不回灌 |

## 真实文字模型与浏览器

1. 原Agent通道（qwen3.8-flash）真实返回400 `insufficient_user_quota`，独立页也明确失败并保留输入；原通道不标通过，未修改其线上配置。随后只在隔离测试进程使用另一条已配置的 `gpt-6-luna` 文字通道，未新增密钥/全局切换。
2. `verify-packaging-live.ts`：真实附件ZIP→个人账号→Agent不完整brief→三个关键问题→补充完整brief→八部分策略、三个方向、唯一推荐、SKU与风险；两次真实文字调用、工具0/图片0、Postgres历史和跨账号不可见通过。`live-agent-evidence.json` 保存模型、会话与输出SHA（无密钥）。Agent完整输出2096总字符/1628汉字，略超默认篇幅，内容质量与事实边界已人工检查，不把篇幅检查称严格通过。
3. 独立页登录真实接口200；载入示例只填brief→真实模型生成→反馈将第三方向改品牌文化→真实优化结果1351字符→刷新恢复v7→复制提示→实际4080字节Markdown下载并重新打开。该链路2次成功模型调用；失败旧通道另记，不混算成功。
4. 真实Agent页从文件input上传原ZIP→“此Skill已在我的Skills中”，DB无重复；拖拽JSON实际触发上传→“已导入到我的Skills”，DB恰好1条新增；单原SKILL.md缺reference时显示要求ZIP的具体错误。
5. 1440和390px实测均无横向溢出。切换第二账号后项目列表0、品牌字段空、旧结果与旧项目标题不可见，切回恢复。页面生成/优化过程中采集的window error/unhandledrejection为空。
6. T3预览额外tab曾出现连接超时，回到原owned tab继续同一真实页面完成验收；没有转到用户普通Chrome。部分自动化等待使用错误文案超时已纠正并核对实际DOM，未把等待超时写成功。

## 保留的基线问题与未交付范围

- `verify-image-skills-execution.ts:123` 在本轮基线与新版均因旧fixture未建立画布项目而失败（“画布项目不存在或无权访问”）；`verify-agent-harness-runtime.ts:35` 两版均因旧fixture Router配置缺失失败。保留两版日志，本任务没有为让全套绿而改业务权限。新增模块由上表独立真实runtime/API检查覆盖，不声称旧全套回归通过。
- 当前通用ZIP导入仅允许SKILL.md、Markdown参考资料和agents/openai.yaml，不是可执行插件安装器；脚本、额外二进制和超限包拒绝，不自动执行或联网下载资料。
- 附件图片/PDF/刀模的brief素材上传、在线竞品检索、包装成品图/3D/生产文件不在本轮实现；现有Skill只交付策略文字。
- 线上账号安装/服务器蓝绿更新尚未执行；先交付UI审阅。后续发布仍按目标站真实基线、共锁、备份、蓝绿旁路验收、平滑切流、排空与回滚门槛，不自动推广其它站。

## 文件与操作证据

集成工作区 `output/brand-packaging-20261016/` 中有：`MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`、源码SHA清单、完整日志、真实文字输出、浏览器导出及桌面/移动截图。回滚脚本先验证修改态全路径SHA和reverse-check，仅作用于显式指定源码副本；不恢复数据库、不重放模型任务。

Git完成三模块后fetch/整合结果：origin/main仍`c2634fb`，Already up to date；功能同步计数归零，服务器发布次数不增加。最终提交与推送结果见交付时的Git SHA和VERIFICATION。
