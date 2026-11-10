# VV-03／VV-04：生产网页、CLI、MCP接手及独立分叉恢复

日期：2026-11-11。基线main `76fb230c7aae374e9fe1186ae3edb0b0ea8da3d3`，独立分支 `codex/storyboard-live-handoff-20261111`；运行版本保持 `344f83215a933042571aefe0194b5d035617df27`／`1794327098`。承接PRD v1.20，不新增发布事务。

## 模块与职责

本轮是已发布模块的真实生产验收：网页创建的持久方案经外部CLI／MCP接手，网页再保存后CLI精确接回；独立版本参数隔离与原生分叉未知恢复。本轮没有产品代码修改，不以又一轮fixture代替生产证据。

## 公共接口、依赖方向与状态归属

- 普通账户通过原生 `/api/auth/login` 验密，使用其本人 `POST /api/account/agent-tokens` 签发的个人令牌。write／read两枚令牌每日预算均0、一天有效，本轮结束原生吊销。
- 使用公网实际下载 `/agent/naumi.mjs` 的真实CLI和stdio MCP服务；SHA256 `9a2e47c045436ae7a3a5aedce9f0ab01818bca27bed033993de73aaf4549a19f` 与固定源码逐字节一致。不是脚本内直接调用createStoryboardTools冒充外部客户端。
- 正式gateway→原工具注册表→正式storyboard/video-node owner；网页同样走原业务入口。gateway operation和业务operation分别保存，网络未知不换号。无任意内部URL替代工具契约，无数据库写入脚本。
- 生成与收费工具不在本轮执行白名单。没有生成任务或媒体job，QA赠额未用于收费；没有配置／供应商／账户入账变更，47未连接。

## 实际范围与17项核验

证据根 `E:/Workspace/naumi-task-evidence/storyboard-live-handoff-20261111`，私密登录／令牌只保存在用户保护目录，未输出或提交。

### 真实CLI／MCP 13项

1. 公网下载的实际CLI与固定源码字节一致。
2. CLI读取正式nested document工具schema。
3. CLI精确读取网页创建的正式方案。
4. 每日0积分write令牌保存方案，正式API精确读回。
5. 实际stdio MCP读取CLI保存的同一身份／修订。
6. MCP保存，CLI及正式API读回相同document。
7. 代理只在实际生产gateway已返回完整已提交回执后断开客户端：CLI exit5；status原gateway operation／MCP原业务operation／原完整请求重发结果一致，revision不再次增加。
8. 过期revision保存拒绝，现方案不被覆盖。
9. 只读令牌目录不暴露write，调用write实际exit3。
10. MCP独立分叉，同业务operation重新调用得到同一节点／方案，无重复节点。
11. 只修改独立节点prompt，原节点和原方案精确保持；新节点lastTaskId／lastResultId仍null。
12. CLI／MCP真实费用报告一致：已发生taskCount0、没有隐式添加预算；仅是无任务场景，不证明真实采购／结算。
13. 真实账户余额／占用和视频任务列表前后精确保持。

### 原生网页与清理4项

14. 浏览器重开MCP独立方案→真实控件改名称／意图→保存POST200→CLI读回同一plan revision2及完整document；源方案revision4保持。
15. 原生网页“独立版本”实际提交200后注入仅客户端收包故障，原真实response留存；页面显示“核对独立版本”，localStorage持原完整body。整页重开再核对：operation和完整body完全相同、真实200回执精确一致、节点总数保持3，pending清除，没有另建分叉。
16. 再整页重开并打开分镜，仍选中刚恢复的独立方案，标题一致、pending0／alerts空。
17. 原生项目删除确认→真实 `POST /api/canvas/nodes/delete` 200→整页重开无项目；正式API项目／文字／视频节点列表空，3自有视频节点软删除，视频任务0／媒体job0、余额30／账本1。两个人令牌spentToday0，吊销后实际CLI exit3。

本轮只有一镜、无候选方案。原节点 `vnode-60c95d14-5cce-424e-9e22-df2826e5f73a`；源方案 `6215560e-8c59-4bd8-b3ea-1b907373bfa7`；MCP独立方案 `cabb711b-53c9-4728-afdd-1429f146459c`；网页恢复分叉 `316d67d1-0c4d-4f70-9014-67c189e45fe8`。这些ID只用于本轮追溯，不用于自动重放。

## 失败与故障边界

- CLI保存断流由本地代理在真实生产已提交后丢弃响应，不修改供应商／服务器响应。浏览器分叉故障同样先保存真实200回执，再仅向应用抛客户端网络错误。两项均在已知受理状态下沿原ID恢复，不是伪造成功响应。
- 开始编辑原稿时短暂出现Unsaved changes，随后原生自动保存及正式API精确读回；未把瞬时状态当永久失败。
- 首次删除前页面仍有视频节点上下文菜单，宽泛Delete定位未完成项目删除。独立API核验确实仍有项目，检查exit1；保留 `CLEANUP_FIRST_STATE.json`。重新打开真实页面，定位项目确认框内Delete，捕获正式删除POST200后检查通过。没有为使清理断言通过而直接写库或隐藏记录。
- 清理脚本支持已吊销令牌继续只读核对，未重新签发替代令牌；两枚原令牌均验证吊销。QA工程软删除，方案及历史operation回执保留，不宣称清空数据库。

## 验证命令、结果与证据层级

```text
node E:/Workspace/naumi-task-evidence/storyboard-live-handoff-20261111/prepare.mjs
normalLoginStatus200 / two tokens dailyCreditLimit0 / secretsPrinted=false；exit0

node E:/Workspace/naumi-task-evidence/storyboard-live-handoff-20261111/live-handoff.mjs
LIVE_HANDOFF_PASS checks=13 MODEL_CALLS=0；exit0

node E:/Workspace/naumi-task-evidence/storyboard-live-handoff-20261111/live-handoff.mjs finish
PASS browser_saved_independent_plan_actual_cli_reads_exact_same_revision；exit0

node E:/Workspace/naumi-task-evidence/storyboard-live-handoff-20261111/cleanup.mjs
CLEANUP_PASS projects=0 text=0 active_video=0 own_soft_deleted=3 video_tasks=0 media_jobs=0 balance=30 ledger=1 tokens_revoked=2 revoked_cli_exit=3 supplier_calls=0
exit0
```

真实生产证据 `PREPARE.json`／`LIVE_RESULT.json`／`FINAL_HANDOFF.json`；网页 `BROWSER_HANDOFF.json`／`BROWSER_FORK_LOST.json`／`BROWSER_FORK_RECOVERED.json`／`BROWSER_FORK_REOPEN.json`；最终清理 `QA_CLEANUP.json`／`BROWSER_CLEANUP.json`／`BROWSER_CLEANUP_REOPEN.json`。浏览器已关闭，CLI／MCP／本地断流代理进程均已结束。

文档证据检查器以真实原始回执进行17项检查；BASELINE缺少本轮记录明确拒绝，MODIFIED通过，独立副本回退恢复原文精确哈希后重新拒绝。四件套／精确命令／输入／stdout／exit／主线SHA见证据根 `VERIFICATION.txt`。这是文档与证据包装回退，不是线上业务回退；修改包保持新版。

## 未完成项与下一步

- VV-03本轮关闭“无候选正式方案”的生产网页／外部CLI／MCP接手与恢复层。真实创意Agent、已采用候选的仅03镜制作接力、实际粗剪更新仍随VV-01／02验收。
- VV-04本轮关闭无候选分叉、参数隔离、再分叉与原生网页丢响应恢复层；真实候选继承、不同方向真实生成／采用／成片不以空方案代替。
- VV-07只补生产零任务费用报告一致，不把零任务归零当作真实收费精确。VV-05／06／08已有本地证据保持，实际模型质量与有素材总流程仍未关闭。
- 原120积分／5视频2媒体范围保持。原专用试片账户正常验密与正式入账仍待完成；本轮受保护后台密码卡未收到输入。正式TTS／ASR通道未发布的结论沿上轮目录观测，未擅自启用。目标active，不把缺凭据改成“已完成”。
- 本轮只更新文档、验收证据并推送main，不再发布应用、不增加发布计数，保留共享checkout及映射实验线。
