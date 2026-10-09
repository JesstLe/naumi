# Naumi 多 Agent Git 与新机发布协作

## 当前固定版本（2026-10-09）

- 新机：120.27.162.85。源码 `f859393de304725458811e75186665a1191b4ee8` 已进入main并发布，在10f03a7组合版本上新增质量下拉菜单样式修复；保留画布UI、参数组合校验、后台MVP显示名称编辑、比例弹层滚动与定位修复。
- 镜像：`ghcr.io/jesstle/naumi:f859393de304725458811e75186665a1191b4ee8`。
- Image ID：`sha256:22f4449431d22e30746d1df2f4f629a063e37cdaf52acb30d89719187c5cd714`；公网版本 `1791541892`。
- 回滚备份和证据：`/opt/naumi-staging/evidence/image-quality-dropdown-20261009-r2`；细节见 `docs/changes/2026-10-09-image-quality-dropdown.md`。旧组合证据保留，文档提交不代表新的业务镜像。
- 旧机101.133.166.67继续运行，不连接/不回传；视频与OSS仍延期。

## 分支与目录

1. 每个 agent 使用自己的 `codex/<任务名>` 分支和独立 worktree；不在别人正在使用的 checkout 上切分支、reset、clean 或 rebase。
2. 本轮交接分支：`codex/canvas-ui-alignment`；worktree：`C:\Users\13357\.codex\worktrees\canvas-ui-alignment\naumi`。UI 源码先前已完成 main 提交，本分支补充发布验收与协作记录。
3. 开工先 fetch origin，并记录 origin/main 的40位SHA。先阅读相关模块文档，再检查 git status，明确本轮文件范围。
4. 同一文件有并行任务时，先约定文件负责人；合并用提交，不用整个目录覆盖。跨分支 cherry-pick/merge 后必须核验受影响模块。
5. 选择性 add 明确路径；禁止 git add .、提交环境文件/密钥、覆盖他人未提交修改或 force push main。
6. 合并到 main 前重新 fetch；将最新 origin/main 合入任务分支，解决冲突、集中测试，再普通 fast-forward/merge 推送。普通 push 被拒绝表示别人已推进，重新整合；不要强推。

## 发布串行化和防版本倒退

- 每个发布包来自已提交的 clean 固定 SHA，记录 `BASE_COMMIT`、`CANDIDATE_COMMIT`、`EXPECTED_LIVE_IMAGE`、包hash和改动范围。
- 最终切换前再次核验 origin/main 和新机实际镜像。若运行镜像已不是本轮备份基线，立即停止这次切换，刷新基线、重新整合，不能用旧env备份覆盖别人的发布。
- 所有新机发布使用相同互斥锁 `/opt/naumi-staging/releases/deploy.lock`；锁从“读取当前版本/备份”开始持有，到健康/版本/功能检查结束才释放；不要只锁 compose up 几秒。
- 示例（在新机运行；prepare/deploy路径替换成本轮已核验脚本，不能执行历史模板）：

```bash
flock -n -E 75 /opt/naumi-staging/releases/deploy.lock \
  bash -c 'bash "$1" && bash "$2"' bash \
  /opt/naumi-staging/evidence/TASK/prepare-release.sh \
  /opt/naumi-staging/evidence/TASK/deploy-release.sh
```

- exit75表示另一个发布占锁；不绕过锁，不无期限重试。本约定需要所有发布者采用；文件存在本身不是互斥保证。历史脚本并不会自动获得锁。
- 修改范围只含新机 `NAUMI_IMAGE`；数据库、媒体、Compose、Router、公网代理均保留。prepare完成但环境基线变化时，不部署该旧包。
- 回滚也必须获取同一锁，并检查当前镜像确为本轮candidate，不能回滚另一个agent的新版本。数据库dump只是备份，不回灌测试DB。
- 交接写清源码SHA、镜像、线上版本、真实验收、未做项及回滚命令；文档提交不冒充新的业务镜像发布。

## 接手提示词

```text
阅读 AGENTS.md、docs/AGENT_COLLABORATION.md 和相关 changes 文档。
只在自己的 codex 分支/worktree 修改明确文件；fetch origin/main后记基线SHA。
保留其他agent未提交改动，不强推main，不复制目录覆盖并行工作。
发布只操作120.27.162.85，从clean commit打包；共用deploy.lock串行化，
切换前确认运行镜像仍等于本轮备份基线，否则刷新整合。验证线上实际版本和UI，
保留env/DB备份与回滚，不操作旧服务器，不把文档提交算作新的运行版本。
```
