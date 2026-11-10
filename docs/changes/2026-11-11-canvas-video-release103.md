# Canvas 视频后续模块：103 固定版本蓝绿验收

日期：2026-11-11；PRD v1.19。此记录接续首页 r3 的已完成回执，记录独立后续模块发布，不重写首页发布历史。

## 模块与职责

本次交付是已整合视频／声音／辅助审片和费用显示修复的固定生产镜像、103蓝绿发布及真实普通账户入口验收。它不新增任务、账务、媒体或发布状态owner，也不以发布成功关闭模型创意／声音质量。

## 公共接口、依赖方向、状态归属

- 复用现有发布生命周期、全任务采集、Web／Worker控制、旧前端兼容和R2 ACL适配；任务／账务／媒体仍归原业务模块。
- 103独立站点配置／数据库／媒体保持，47未连接，映射独立实验分支未合入。普通账户经原生密码登录，没有签发继承cookie。
- 适配器位于 `E:/Workspace/naumi-task-evidence/video-release103-20261111/r2/controller/controlled-video-release103.py`；固定配置、前置身份与镜像字节门禁，不用于自动重放本次发布。

## 固定版本与实际发布结果

| 字段 | 已观测结果 |
| --- | --- |
| main commit | `344f83215a933042571aefe0194b5d035617df27` |
| BUILD_VERSION | `1794327098` |
| 实际OCI镜像 | `sha256:f432b3961d5fc4d8131ee277bc4f17bf6ff79203fc5023ead856f4af461ed986` |
| release | `release103-refactor-video-20261111-r2` |
| canonical | revision488，COMPLETE |
| Web | `d013a14b93597a8c9eaeac0abd84ed7554e7b550de271f5a6cfd81552f301b95`，运行／unless-stopped |
| Worker | `8e1eb131355e2d136995da5f2e8f433aa5b1d3bdb5ade26ddd5679c706b2e87a`，运行／unless-stopped |
| 首页r3旧对 | e2753fdda071…／10c19aff43d8…，排空停止／restart=no |
| 原监督进程 | PID179702，原命令exit0，所有operation ACKNOWLEDGED |
| 配置／任务 | configurationPreserved=true；全任务保全通过，无缺失／原供应商字段变化／违规 |
| 锁 | 两部署锁及生命周期锁逐把flock非阻塞取得并释放，FREE |
| 资源 | MemAvailable5992MiB，remainingPeak1986MiB、保留1024MiB；不计Swap |

完整Linux构建、同镜像SDK App／Worker精确字节、完整Canvas13＋语音12＋视觉6=31项及完整声音链14项通过。此处供应商响应为受控测试，商业模型调用0；线上另走正常密码登录、分镜读回、Agent令牌、声音目录、R2真实上传／读取／下载ACL验收。

## 旧页面跨切流真实证据

- 原生产文档nonce `b0acc1aa-e960-4f37-8a85-6a1d5aa05fed`，timeOrigin `1794327419935.3` 保持，不导航旧tab；未发送草稿保持，未点发送。
- 原节点 `text-32389f60-0d30-4ea4-9c20-38a724427fce` 的真实文字控件输入后，应用POST `/api/canvas/text-nodes` 在 `2026-11-10T16:46:53.005Z` 返回200；正式API读回精确新文。原不可见/遮挡控件自动输入超时没有保存时保留原观测，未提前标通过。
- 独立新文档timeOrigin `1794329221800.9`，真实UI及API精确读回同文；原分镜方案 `7c6cbc23-19b9-4cd8-a234-936ce01f5c3b` revision1及单镜无take保持。
- 313次每2秒版本采样全200，包含首页r3→新版本切换；11份旧JS资源200且SHA逐份保持。真实after证据先落文件并上传，再上传绑定哈希marker，原控制器验真后继续任务保全与最终收尾。
- 自有QA工程通过原生Delete project／Delete确认删除并整页重开，活动项目／文字／视频节点API列表均空，页面30积分。未触发模型或新增额度；两个任务tab及候选隧道已关闭。

## 失败保留与回退证据

- r1使用归档config摘要 `ca7d07d3…` 时，远端实际可引用OCI镜像是 `f432b396…`，故备份／导入后ABORTED。r1无候选无切流；没有改掉ABORTED、删除状态、抢锁或重放。远端App/server/BUILD_ID/Worker/manifest字节均核对后，r2以原事务的合法后继启动，实际唯一候选和唯一切流。
- 路由回退在独立副本恢复原字节并做隔离nginx语法检查；后续修改的副本全量拒绝且零写入。没有执行线上回退，没有回灌数据库／媒体或重放任务。
- COMPLETE后 `--rollback-check` 仅持锁只读核对旧／新身份、当前路由后像、原数据库备份与复制回退材料；liveFilesWritten／serviceCommandsIssued／databaseRestored／tasksReplayed均false。此检查不证明真实业务回退兼容。
- 本地回退首次重跑针对已经恢复的旧副本，哈希门禁拒绝；改用从修改包新建的独立副本后exit0。恢复行为检查先发现缺少同目录measured-collector依赖，补齐原已校验依赖后，原controller按预期以 `EXPLICIT_103_REFACTOR_AUTHORIZATION_REQUIRED` 拒绝本次配置、exit1。修改包仍保持新版。

## 验证命令与证据层

证据根 `E:/Workspace/naumi-task-evidence/video-release103-20261111`。以下均已实际执行，不是待办：

```text
python -X utf8 .../r2/complete-browser.py
BROWSER_AFTER_PASS: real old-document POST200, exact independent new-page UI/API readback, draft and storyboard unchanged; marker uploaded and reopened
exit0

python3 -B -u /opt/naumi-staging/evidence/release103-refactor-video-20261111-r2/controller/controlled-video-release103.py /opt/naumi-staging/evidence/release103-refactor-video-20261111-r2/CONFIG.json
PHASE=BACKED_UP / CANDIDATE_READY / READY / SWITCHED / PUBLIC_ACCEPTANCE / COMPLETE
exit0 (原监督进程；禁止重复执行)

python -X utf8 .../r2/verify-final.py
revision488 / phase COMPLETE / three locks FREE / operationsAcknowledged=true
exit0
```

四件套和BASELINE／MODIFIED／ROLLBACK精确命令、输入、原文输出、exit及SHA见 `VERIFICATION.txt`；`MODIFIED_FILE.zip`／`DIFF_FILE.patch`／`ROLLBACK.sh`均重开核对。运行回执：

- `r2/final-receipts/FINAL_STATUS.json`、`RUN_RESULT.json`、`FINAL_READBACK.json`
- `r2/final-receipts/task-preservation.json`、`storage-acceptance.json`
- `r2/browser-after-evidence.private.json`、`browser-after.json`（私有，不提交）
- `r2/continuity-final.json`、`r2/qa-cleanup.json`
- `IMAGE_LOAD_RECONCILIATION.json`（r1身份差异保留）

## 未完成项与下一步

- VV-01真实视频质量与VV-02真实模型完整成片仍未完成。原专用账户此前0余额／无普通密码，正常验密和正式入账仍待完成；不用首页QA赠额、不重置密码、不直写余额。
- 既定范围仍为103／video-apib-seedance-2-5／4秒480p16:9，总120积分、最多5视频＋2媒体，逐次正式报价、不自动重试／补额，UNKNOWN仅查询原任务。
- 正式TTS／ASR目录200但均available=false、models=[]；产品代码已部署不等于通道已发布或声音质量通过。配置发布与真实声音试片不混入本次视频预算。
- 发布层本轮闭环，PRD与执行台账同步；持续目标active。文档更新不重新构建／切流、不增加成功发布计数。
