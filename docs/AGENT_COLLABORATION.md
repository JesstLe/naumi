# Naumi 多 Agent Git 与新机发布协作

## 当前固定版本（2026-10-10）
- 最新新机业务源码82ec57084f9d7e8d05d242b4c9902ce7e55988b2，Image ID sha256:417f2b5b9bba2c80128bd9190b7a3ecf4d6650d545cadb5bc32459e8f7b27cf1，版号1791613905 / v2026.10.10-143145。分辨率显示/实际传参按供应通道映射，元数据默认与修订保护、冻结用户原始分辨率、真实JSON/multipart/Flow回退通过；合入同事9b80782工作台第二轮。用户要求沿用同事验收，仅必要构建/线上检查，付费0。模型v98/计费v8/完整配置/元数据和采购价指纹保持，锁释放、临时会话清理；证据/opt/naumi-staging/evidence/resolution-parameter-mapping-20261010。固定兼容回滚d777bf3 / sha256:c74040b5ac44b2799950441816b4c0c1a936aca3a29d45dfc6e42853d5bc9b3e，不能直接退到8cb严格旧schema。详见docs/changes/2026-10-10-resolution-parameter-mapping.md。用户随后要求自动判断接口参数名，该后续改进尚待完成。

- 最新新机业务源码8cb835fe90f170b139918ebc3000bb13ec8f9f26，APP/Worker Image ID sha256:54c1fade2b5a89bc7f6453b02b5906722bcfe677f53facd7ac22dc3017af423c，版号1791612015 / v2026.10.10-140015。合入同事workbench-tools-ui、canvas-theme-toggle、canvas-smart-layout，保留隐藏质量档位及供应商fallback。26工具普通/受管三视口、明暗键盘/偏好/手机、复杂画布真实隔离DB事务/撤销/失败回滚及供应回归通过；额外质量全链模拟提交等待未完成，不记通过。用户最新要求沿用分支验收，后续仅必要兼容与发布健康/版本/页面冒烟。模型v98、计费v8、配置/草稿和切换前最新元数据库/价格指纹保持；完整备份/固定ba84回滚/证据 /opt/naumi-staging/evidence/colleague-updates-integration-20261010，最终健康/镜像/版号/冒烟通过、锁释放、临时会话清理。80e5b87为测试定位后续，业务源码不变；详见docs/changes/2026-10-10-colleague-updates-integration.md。

- 最新新机业务源码ba84ea3e7c6d05b797338cc0de55427df8aeaaca，APP/Worker Image ID sha256:152de000953f139c39808182d41a966ecd656f33cbf42f9ab1f8c4612831ff8b，实际版号1791610783 / v2026.10.10-133943。共享质量菜单及独立生图页仅显示后台开放档位，关闭项隐藏，五档/三档/自定义名称/缓存关闭档回退与报价拒绝已验收；线上GPT五档、两款香蕉三档、画布/生图/手机通过，付费调用0。模型v98、计费v8、完整配置/草稿/元数据库和采购价格指纹保持；备份/固定95ac930回滚/证据 /opt/naumi-staging/evidence/quality-options-visibility-20261010，健康/镜像/版号核验、锁释放、临时会话清理。详见docs/changes/2026-10-10-quality-options-visibility.md；以下为历史版本，文档跟进不另发镜像。

- 最新新机业务源码95ac9306a516e61e96f5ca26636c6a4421e2fa01，APP/Worker Image ID sha256:d45b11afe9b89c19d38cd7783c9d6159f517522fa234fd92a3bf431b8c5fcad3，实际版号1791609959 / v2026.10.10-132559。供应商异常/超时/流式错误/空图坏图/下载失败在同一任务静默尝试其他兼容启用通道；单通道一次、成功只结算一次、耗尽才结束退款，供应成本unknown独立留审计。真实单参考Nano2任务Flow403→Prompt Hubs200、媒体200、唯一扣6积分通过；Pro任务Flow失败→新源超时验证耗尽/0扣费。原完整模型配置恢复（当前v98、计费v8），用户停用Pro旧Flow及7/3权重保持，原84草稿/元数据库和采购价保留。完整备份/固定f6e9回滚和证据 /opt/naumi-staging/evidence/supplier-fallback-20261010，最终健康/版号/镜像/浏览器通过、锁释放、临时会话清理。详见docs/changes/2026-10-10-supplier-fallback-fix.md；以下为历史版本，文档跟进不另发镜像。

- 最新新机运行源码f6e9c47a59ae4e9dd8214c1d19dba0e3ed5696d3，APP/Worker Image ID sha256:8ac5f7eb8598895729d7af96b0d5d4d8a8baf911d3bffb90a061ebca811ded8f，版号1791608095 / v2026.10.10-125455。GPT-Image-2.5与两个香蕉家族增加Prompt Hubs真实供应通道，持久优先级/权重分流、账号共享并发4、满载溢出/熔断恢复/未知状态不重提。三款应用真实出图/报价/媒体/结算各4积分通过，接入前生图/单参考编辑6次通过；冻结/跨进程负载与真实UI/手机/画布分辨率通过。初始原7/新3，用户随后v94停用Nano Banana Pro旧通道，保留最新设置；计费v8、旧配置字段/72草稿和人工采购资料保留。自动归档上游完整目录/公开参数/分组价格，两个适配入口各107模型/20当前密钥可访问，旧unknown资料208行补公开声明留历史，最终知识库1244行/20快照。持续接入约定见AGENTS.md。完整备份/验收证据 /opt/naumi-staging/evidence/multi-supplier-channels-20261010；固定兼容回滚ae81746fba321061adef038d62bcd9af27a50578 / sha256:980089a984613e8f9c73bd08925339db760b441d26134345f3a9aaa766865c19，禁止退回不支持supplierRouting的dc4。健康/镜像/版号/实际功能核验后锁释放，临时会话与密文清理。详见docs/changes/2026-10-10-multi-supplier-channels.md；以下为历史版本，文档跟进不另发镜像。

- 最新新机运行源码dc4c4e7de51ca422e59b117078935ad19b7d2381，Image ID sha256:aeac30a4fb4c8b7b44d8dbedfff7b8307a9ce3e7fd4c8b5b15e3b0246befb759，版号1791604344 / v2026.10.10-115224。模型管理新增家族输出分辨率多选/全选/恢复，生图/提取/服装包装3D/画布/价格表统一；关闭档位拦截、冻结历史版本保留。按用户要求Nano Banana Pro与Nano Banana 2都开启1K/2K/4K（模型v80->82，仅授权展示字段变化），计费v8、旧草稿、供应商能力/映射/元数据861与修订863/采购价完整指纹保持。原生、完整管理/画布隔离浏览器与线上两款后台刷新/生图/画布/4K报价/选择排序手机通过，付费调用0。证据/备份/兼容回滚位于/opt/naumi-staging/evidence/model-display-resolutions-20261010；必须回滚固定兼容d1efcf8d69c753c48a19b0a83076d789c6875a1b（旧UI+新后端契约），禁止直接原7099丢失字段。全程锁已释放，详见docs/changes/2026-10-10-model-display-resolutions.md。以下为历史版本；文档跟进不另发镜像。

- 最新新机运行源码7099f06959934e3a2a8145ba76f4e973d0b5cb2b，Image ID sha256:d37d28cda1eea2da592ad6587f4005148dceab1c78b3e38665372cca08a8337d，实际版号1791601939 / v2026.10.10-111219。修复混合inventory中图片家族聚合误覆盖文字/视频显示名；gpt6Astra后台标题/编辑框/刷新及前端目录均为已保存GPT-6Astra，实际hy4-preview保持。原生/完整隔离浏览器与线上文字/参数范围/库/四图片家族选择排序报价/手机通过。用户最新模型v76、计费v8、完整配置/草稿和861条元数据、863条修订、采购价格指纹保持，收费生成0。证据/备份 /opt/naumi-staging/evidence/management-text-name-20261010，固定回滚6446fab，最终健康/版号通过、锁释放。详见docs/changes/2026-10-10-management-text-display-name.md；以下为历史版本，文档跟进不另发镜像。


- 最新新机运行源码6446fab68aaccc6cccdfa8217bbaebed95d27ac9，Image ID sha256:f1c5f505d129d38b08a1aabcfb9a4d1925efd0f22a28f94fbd0348fb8d5235ca，实际版号1791600281 / v2026.10.10-104441。按用户要求完整合入canvas-toolbar-copy、model-brand-icons、image25-output-price-table、pricing-page-preview；套餐预览遵守最新公开定价关闭规则，管理员价格表只读不改扣费。集中隔离DB/浏览器/生成参数与积分通过，线上品牌/稳定模型选择/参数范围/价格筛选下载和手机通过。模型v66、价格v8、完整配置/草稿与元数据库861条、修订863条及采购价格指纹保持，收费生成0。证据/备份 /opt/naumi-staging/evidence/colleague-integration-20261010，固定回滚5cb8600，最终健康/实际版本通过、deploy.lock已释放。详见docs/changes/2026-10-10-colleague-branches-integration.md。以下为历史版本；文档跟进不另发镜像。


- 最新新机运行源码 `5cb8600f1cbe14be0dbd7fbbe4c705ce7e545f6a`，Image ID `sha256:07370677c52b6958af4ad7fc96d0e26462f9d41b97f0d2e151a4e6bf54045d75`，版本1791599031 / `v2026.10.10-102351`。正式模块命名model-management／management、导航“模型管理”，新页面/API保留原MVP入口兼容；历史ID／actor／reason指纹／锁／待处理key不迁移。原生历史模型和积分发布重试、冻结／参数／范围及浏览器旧地址查询跳转、跨路由重试、历史session恢复、接入／积分／手机通过；线上正式页面、旧API权限、参数／范围／选择／排序／报价通过。模型v66／价格v8／完整配置／草稿及元数据库861条、修订863条和采购价格完整指纹不变，收费生成0。证据 `/opt/naumi-staging/evidence/model-management-naming-20261010-r2`，锁释放；兼容回滚源码b73533d74a2b4c92761bd6d2ef5c2745668d9f64基于08e0354，仅加正式地址入口，使回滚后新书签和已加载前端可继续访问。详见 `docs/changes/2026-10-10-model-management-naming.md`；当前说明迁至 `docs/admin-model-management.md`。以下为历史版本，验收／文档跟进不另发镜像。

- 最新新机运行源码 `08e0354f9d5910b67b174b609a004848d17cd73a`，Image ID `sha256:141f5a05cf11c31c919bffa2e2cc78e8be6f140d2622ca33e67b2fb46da45ca7`，版本1791597752 / `v2026.10.10-100232`。MVP质量映射读取精确供应商元数据默认，可恢复默认与手动编辑；画布单个系统勾选、模块用途、图片／文字能力池与共享选择、Agent文字选择已上线。原生和隔离浏览器发布／冲突／冻结／A+授权及同事节点编辑回归通过；线上只读弹窗、手机、选择／刷新／排序／报价通过，模型v66／价格v8／完整配置／草稿与采购价格、元数据内容和修订保留（目录发现仅更新last_seen_at）。证据 `/opt/naumi-staging/evidence/metadata-canvas-20261010`，全程发布锁已释放。固定兼容回滚镜像855762070fa0a973f83cb3f9611b1f933cea57e6可读当前和历史systems字段；正常回滚不改配置，不回灌DB／媒体。详见 `docs/changes/2026-10-10-metadata-defaults-canvas-system.md`。以下为历史版本，验收／文档跟进不另发镜像。

- 最新新机运行源码 `365878e012d39e5137fc12217c69661f0941fb10`，Image ID `sha256:3197935bcfa180f6ef96ee57f2da31af3b433726bd3d6740eea027e4a03e6ba6`，版本1791595122 / `v2026.10.10-091842`。画布四项图片工具在范围内允许选择，MVP新增持久家族排序；原生发布/报价/范围拒绝/冻结任务与浏览器分组、排序、刷新、回退验收通过。线上生图13个分支合并为4家族，模型v66、计费v8、完整配置/草稿及用户接口/ComfyUI指纹原样保留。真实供应商调用0。证据 `/opt/naumi-staging/evidence/canvas-scoped-selection-20261010-r2`，可回滚至3610074，无新增字段或迁移；详见 `docs/changes/2026-10-10-canvas-scoped-model-selection.md`。以下为历史版本，文档跟进不另发镜像。

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
