# 47 隐藏抠图及已发布能力修复发布

## 模块与职责

用户于 2026-11-13 明确指令“上线47站”，仅解除本次 47 发布的既有暂停决定。目标 47.105.59.142；103 未连接或变更。应用来自固定 main `8019d68eef1ae4b841c666c9ddd3c546790c26a9`，包含 `aea143ea` 隐藏抠图默认选择、`12fd3324` 已发布能力/参数映射误拦修复及该 main 的既有整合。不包含隔离的 103 映射实验分支。

## 公共接口、依赖方向、数据/状态/事务归属

- 画布计划与模型选择沿用所属业务模块；内部默认隐藏处理器不伪装成用户显式选择，显式选择隐藏模型仍拒绝。
- 配置仍由 47 发布快照拥有。模型 v153、计费 v8；四个 `NAUMI_IMAGE_JOB_CONCURRENCY_{GENERATE,IMAGEGEN,SUITE,APLUS}` 保持 64。没有跨站复制、更新价格/凭据或发布模型配置。
- 发布事务持 Naumi、Hub、参考工作台三锁及 canonical lifecycle 锁，沿用 canonical 文件、CAS、操作 INTENT/ACK；不回灌数据库/媒体，不重放已接受或未知的付费任务。
- 当前旧 Web 以实际 ID `909bd1e8ae2ffbc758b91eedf2637d0c33a9129e68f8fafb920fd6271d85c9fe` 为准；不把昨天并发维护前的 `61a4f523...` canonical 历史指针当作实际运行实例。旧 Worker `c9f5d1cb...`。

## 本次实现与迁移状态

Linux 固定构建 exit0、127.6秒；build `1794531682`，image `sha256:d157193f9ae839275fe769d8d795cc804c0e406451684f56c6a76152c95e0b7b`。只复用字节一致、源码未变的媒体工具链；应用和 Worker 从固定 main 重新编译，未使用旧应用替换构建。

候选端口 13135，旧端口 13134。新 Web/Worker 同 image，候选 Web 初始 draining、Worker paused；内存门禁 MemAvailable4495MiB、预算4096MiB，不计 Swap。数据库备份818846436字节，实际 pg_restore --list 可读，SHA256 `18e640e5d3394320de2944d6cbf17ef97dd268b83b7c711daa3822eaeef6e1d8`。最初脚本把 backup-readable.json 的元数据收据大小312当作备份大小；已实际重开 dump 并更正本轮 release 记录，未重复备份或恢复数据库。

北京时间 09:54:58 完成 Nginx 平滑切流；新 Worker09:55:30取得完整恢复 tick 回执。旧实例于10:08:22实际自然排空后停止，两实例 restart=no；监督器实跑及锁释放已最终回读确认。

## 验证命令、结果及证据层级

本机证据 `E:/Workspace/naumi/output/release47-capability-fixes-20261113/`；服务器私有证据 `/opt/naumi-staging/evidence/release47-capability-fixes-20261113-r1/`，含秘密的 inspect/快照只在受保护材料中保留。

- 真实旧 Web `/api/imagegen/plan`：两个自有上传素材、透明背景编辑，HTTP400，原文“所选模型不可用，请刷新模型列表后重试”。
- 新候选及公网同一份47配置：透明背景计划HTTP200，首步骤内部模型 `image-cutout-verified`；普通参考图编辑HTTP200；显式选择隐藏模型HTTP409 `IMAGEGEN_MODEL_UNAVAILABLE`。仅上传/预览，不调用生成提交或付费供应商。
- 真实源码 planner、selection、preparation、quote 局部回归：PLAN_READY、1积分预览，使用47配置v153，I/O边界fixture、供应商调用0；不把预览报价写成实际扣款或图像质量验收。
- 26项真实浏览器功能检查包含旧画布文档跨切流保存、新页面读回、旧静态资源SHA保持、桌面/手机导航与原生工作台保持；34次切流HTTP采样均200。静态union6410资源，候选和回滚完整Nginx闭包语法通过。
- 过程中观察到一次React418 hydration警告。未掩盖为“全程pageerror0”：未修改的旧实例4个独立浏览器上下文中也复现1次；新版6个干净上下文复查0次。原失败记录与前后对照均保留，不为此临时改变无关产品代码。
- 候选测试实际在切流前通过。操作脚本的回执编译出现SyntaxError，后续排队的身份检查因缺回执KeyError，但身份快照已完成，切流仍执行。随后按原哈希验证已经存在的真实候选测试收据并记录顺序偏差，没有伪造测试时间或重放切流。后续步骤逐项确认结果，不继续批量排队依赖命令。

## 历史 UNKNOWN 与费用查询 fence 的窄审定

保留7条原始UNKNOWN整行，不删除/改写或按过期推断成功：6条media-mirror父子扫描及1条旧boot supplier-scan。三个素材使用本站原凭据只读远端，字节数/SHA与登记完全一致；原日志为PG_POOL_TIMEOUT，原scope/boot/parent/claim精确绑定。当前旧Web的实际boot与这些历史boot不同；当前boot未知观测0，旧instance历史未知3，全局7，分开记录。

进一步发现3条费用补查任务共用原观察者的 claim_token `eedb1be0-5dec-4ae8-9221-773a65c4603d`。三个原供应商生成均在该扫描之前 completed、delivered1、cost_status reported；费用查询链只GET原任务/用量，没有生成POST。原扫描失败，原进程已在昨日维护停止。本轮不将费用补查标done、不清lease、不重放查询或生成。每次排空精确核对原3条key/token/状态/原回执不变；raw shared-domain supplierCosts/activeFences仍保留3，不能写全局drained=true。其他执行fence、交易、锁及待退役实例的transport/background/owner仍必须为零。

第一轮通用全域排空因此等待超时；新Worker按原控制协议恢复。只有完成原身份/源码/回执审定之后，才使用本轮证据绑定的窄排空判定。全局历史债务与本轮旧执行退役严格区分，既有canonical根历史记录保持原样。

## 未完成项与下一步

本轮应用发布已完成，旧Web/Worker已实际停止；监督器检查、任务身份保全及锁释放均已回读。历史React418与费用补查fence保留为既有项，不并入本次临时修复。

### 原任务与临时预占的生命周期核对

八表身份检查首次严格对比发现两条 `app_gen_reservations` 原行消失，未直接忽略或称“所有原行都未变”。逐笔核对：原任务均done、billing_settled=true，原账号哈希、任务账号、billing账号、账本账号一致；billing为settled、reserved_credits0；同一原ledgerId只有一行，分别24/-24与6/-6，结算时间晚于切流/基线，原预占依正常结算事务删除。持久任务、原供应商绑定和原账本身份均未丢失/更换。原严格失败、原前像和两笔终态收据均保留，最终只对这两条已证明的临时预占计入正常生命周期变化，不扩大为任意缺行豁免。

本轮自建测试画布节点/项目已通过所属API删除并核对；两张128px私有测试输入按原媒体生命周期保留，预览报价不触发生成或扣款。生产用户在发布期间的正常生成/结算继续运行，不将其计作本轮测试付费调用。

### 副本回退材料

`MODIFIED_FILE.json` 为发布描述符副本，不是生产配置快照；其修改字段为 sourceCommit/version/image/webPort，队列64与配置153/8不变。原描述符SHA256 `63492cef6941d3ad06499a94e5a4e07ad645e1a0fe929bc843ca44d4a21b1d03`。`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`均在本轮本机证据目录。独立ROLLBACK_COPY恢复到原哈希，MODIFIED_FILE保持新版；Windows与47 Linux分别实跑exit0。Windows原CRLF脚本在Linux第一次执行失败，已保留前像并改LF，实际chmod0700后复验通过。该脚本只验证副本回退，不冒称已演练线上切回；真实旧镜像/旧槽/完整Nginx逆向闭包及备份另行保留。

## 最终实际发布结果

- 本轮 `release47-capability-fixes-20261113-r1` 在2026-11-13 10:15:11（北京时间）达到COMPLETE；监督器释放锁后实跑 `RECOVERY_SUPERVISOR=PASS`、systemd Result=success/ExecMainStatus=0。该实测又在四锁内ACK入canonical，最终revision2160，runtimeRecovery监督状态ACTIVE_VERIFIED。
- 新Web `9c4eed74a0c30526ef53cea587dddfe7fdbffb57eb43816bb81e870daae1803f`、新Worker `e628bc80323dcd10d7f1b25c2183374cbfc3a8f282e8fcb1ef924057074e9c34` 同image/source/build运行。Worker内部origin指向新Web，Web内部origin保持loopback3000。真实入口进程、入口文件解析及Worker到App版本/DB健康回读通过。
- 旧Web909bd1e8、旧Workerc9f5d1cb自然排空后已停止、restart=no，近轮回退镜像/旧槽/原配置/Nginx完整回切闭包与可读数据库备份保留。没有强杀用户请求、清理历史UNKNOWN、回灌数据库/媒体或重放付费任务。
- 八表原任务/供应商/账务持久身份保持，无法解释的变化0；两条临时预占按逐笔终态账本核对正常结算删除，详细收据见上文。模型v153/计费v8与配置hash不变，四项队列值64保持。当前Web未知观测0、新Worker未知tick0；最终回读完成tick50。raw历史unknown/stale仍7、费用查询fence3，未冒称全站历史债务清零。
- 公网修复计划验证3项通过；浏览器功能26项通过、切流采样34/34 HTTP200，历史React418独立记录；未提交测试付费生成。自有测试画布节点/项目已清理。
- 三把部署锁与lifecycle锁实际释放；最终四锁内的监督回执ACK事务退出后另有锁释放/公网版本回读。本轮只有47发布，103未连接，隔离103实验分支未整合。
- 发布计数沿用上一轮应用发布1，本轮为2；昨日同镜像并发维护、本文档不计应用发布。当前本机E盘约73GiB可用、服务器约20.5GiB可用，未触发3次成功发布清理；没有无筛选清理或删除用户/同事文件。

应用固定SHA仍为8019d68e；后续本文档提交/合并SHA只记录交付，不写成应用已重新发布。
