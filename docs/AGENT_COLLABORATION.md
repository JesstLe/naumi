# Naumi 多 Agent Git 与新机发布协作

## 当前固定版本（2026-10-10）

- 最新新机运行源码 `3610074a4db5523798138b997a8045e365f45137`，Image ID `sha256:635b89f8e4f415a452fd8f02cd9883c4dcb80c27a50b7a4bb15fa30932432ea4`，版本1791561629 / `v2026.10.10-000029`。按用户要求完整合入 `codex/canvas-node-editing`（继承工具栏和助手侧栏），修复版号挡住属性保存按钮；隔离真实DB/完整画布与线上只读/模拟节点桌面手机验收通过。模型v58、价格v8、草稿和历史/ComfyUI保留，真实供应商调用0。证据 `/opt/naumi-staging/evidence/canvas-ui-integration-20261009`，可执行锁定回滚至8ca8329，保留新增表与媒体。详见 `docs/changes/2026-10-09-canvas-ui-integration.md`。下面为历史版本，文档跟进不另发镜像。

- 前序新机运行源码 `8ca8329aec4af8af6e526bfa9ab3824648bc1e92`，版本1791559097 / v2026.10.09-231817。MVP显示质量档位/映射已上线，模型v58 GPT五档 passthrough，计费v8；供应商仅接受、效果未验证，细节与旧镜像回滚兼容门槛见 README 第32节。此功能已包含在上述组合版本。

- 最新新机运行源码 `65cec1974646877128ed7ccc849f8647aa730c49`，Image ID `sha256:180a52a62cdd24861e32766687b7da27c04f56445da857c07782138ce41d241f`，版本1791555201 / `v2026.10.09-221321`。MVP按持久配置固定行序，前端默认/缓存模型不再置顶；实际范围关闭/重新启用/即时刷新/选中缓存已验收。原v42完整配置恢复为v48，草稿/计费v8保留，付费生成0；证据 `/opt/naumi-staging/evidence/stable-model-order-20261009`，回滚至5618bc6，详见 `docs/changes/2026-10-09-stable-model-order.md`。以下为历史版本。

- 最新新机运行源码 `5618bc6316ca1357dba00e9e6415c6a2507eebd1`，Image ID `sha256:5dddd3dd295549d315116c18b12d9bd27ad13ba15c950d00069336074f0021a7`，版本1791554146 / `v2026.10.09-215546`。按用户选择只取消用户自带图片API，账号/菜单入口和新请求关闭；ComfyUI保留，历史冻结任务恢复兼容。模型v42/草稿、计费v8、旧接口/工作流记录不变，线上验收付费调用0。证据 `/opt/naumi-staging/evidence/disable-user-image-provider-20261009-r2`，回滚至17bfa9c，详见 `docs/changes/2026-10-09-user-image-api-retirement.md`。以下为历史版本。

- 最新新机运行源码 `17bfa9c2c40f341b0bbee96f57861476389dc245`，Image ID `sha256:8726cdee58bf0ccffb49037285a2b4fcb8d5c3cd55236ce2a254b63b7e26c8ec`，版本 `1791551890` / `v2026.10.09-211810`。画布生图Dock/请求/报价统一canvas.image，四项范围切换与旧缓存/焦点/手机已验收；原v33完整配置恢复为v42、草稿和计费v8保留。证据 `/opt/naumi-staging/evidence/canvas-model-scope-20261009-r2`，回滚跳过中间138912f至稳定23abb395；见 `docs/changes/2026-10-09-canvas-model-scope.md`。用户随后要求取消用户自带接口，该后续任务尚待发布。以下为历史版本。

- 最新新机运行源码 `23abb39547c580d76608c046189187d0474982d6`，镜像同SHA，Image ID `sha256:23263cdf511480ca7f6ac3fe25f7d79ff79dba582c0003788b2c305a86262de2`，版本 `1791549148` / `v2026.10.09-203228`。供应商模型元数据/成本库增量三表与真实页面验收通过，861条记录中23条来自现有配置，未知资料不冒充实测；模型v33/草稿和计费v8保留。证据 `/opt/naumi-staging/evidence/supplier-model-metadata-20261009`，可执行回滚至支持matrix的44c9eb8，保留新增资料表与记录。见 `docs/changes/2026-10-09-supplier-model-metadata.md`。以下版本为前序发布记录，文档提交不另发镜像。

- 最新新机运行源码 `44c9eb877c004754cbf06d59ecb70c1ff471dfc4`，镜像同SHA，Image ID `sha256:3fe8c709593e81fc398d43bf0537ec5e573ece32ab3e5f1f9b158769f0e4a761`，版本 `1791546283` / `v2026.10.09-194443`。MVP质量×分辨率积分表与前端报价已验收；模型v25/草稿保留、原价格恢复为计费v8。证据 `/opt/naumi-staging/evidence/mvp-credit-pricing-20261009-r4`；matrix/MVP规则回滚兼容门槛见 `docs/changes/2026-10-09-mvp-credit-pricing.md`。以下75affea为前序发布记录。

- 新机：120.27.162.85。源码 `75affea3b69ea518ee5270e718faadc77294ab95` 已进入main并发布，新增模型家族工具范围多选和全站已加载/服务器版本比较；保留同事质量菜单、画布 UI、参数校验、后台改名和弹层修复。
- 镜像：`ghcr.io/jesstle/naumi:75affea3b69ea518ee5270e718faadc77294ab95`。
- Image ID：`sha256:6f32884606de1c78ac81e2d5711ad67ffe52b59acb02a7d9368786fd54138897`；公网版本 `1791542483`，网页 `v2026.10.09-184123`。
- 回滚备份和证据：`/opt/naumi-staging/evidence/mvp-tool-scope-version-20261009`；细节见 `docs/changes/2026-10-09-mvp-tool-scope-version.md`。范围验收后恢复原模型配置，版本25。新增 toolScope 后切回不理解该字段的旧镜像前，必须恢复兼容模型配置；回滚脚本会拒绝不兼容状态。文档提交不代表新的业务镜像。
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
