# 能力误拦修复发布到103（2026-11-12）

## 模块与职责
将已完成回归的 main `3912839f859c460462d0e7995b33d82ec8bf0c02` 发布到103。用户明确要求“完成后先上线103站，极速上线”。47 HOLD保持；不修改模型配置、映射、价格或供应商凭据。

## 公共接口、依赖方向、数据与事务归属
沿用已有103 HostTransaction、Naumi/Hub双部署锁、生命周期锁、revision CAS和唯一Web/同镜像Worker蓝绿执行器。入口、后台任务、存储/媒体与数据库保持本站归属，不跨站复制，不重放付费任务。独立103模型映射实验分支不参与。

## 进行中记录
- 已实读在线基线：`13e78acd66fe908c9d8035514dd5cb0793147a7c`，Web/Worker同镜像`48c860636890…`，release lifecycle COMPLETE revision785；无未完成事务。
- 已实读模型v121：APIB Banana 2 edit=true、verified=false、maxReferenceImages=1；本轮保持这些配置值。
- 固定Linux应用及Worker构建通过，build1794468408；镜像`06154ffefb3373364a95d091914479784a8bf37bcc57d7c35bcfb6ee4342bb42`。
- 初次apt下载失败（Debian镜像连接失败），原日志保留；核对媒体sandbox和prepare源码与在线版本字节一致后，复用原固定镜像中的媒体工具链。重新构建应用/Worker，不替换为旧应用代码，不改跟踪的Dockerfile。
- 已通过15项发布控制器约束/副本回退检查；保留前任执行器task_before修复。浏览器验收改为本轮参考图能力、原有普通登录、旧文档跨切流保存和旧资源兼容，不伪造前任UI专项检查。
- 当前镜像包上传中；旧站持续服务。候选、切流、排空及最终验收以实际回执补充，不以构建成功当作上线。

证据目录：`E:/Workspace/naumi-task-evidence/capability-release103-20261112`。


## 最终上线与验收

- 2026-11-12 北京时间16:03:22，原事务 `release103-refactor-capability-fixes-20261112-r1` 完成，canonical revision828、phase COMPLETE；最终收尾命令exit0。
- 公网、完整Web、独立Worker同固定源码 `3912839f859c460462d0e7995b33d82ec8bf0c02`、build1794468408、OCI镜像`sha256:06154ffefb3373364a95d091914479784a8bf37bcc57d7c35bcfb6ee4342bb42`。原Web/Worker均自然排空停止、restart=no；新版两实例restart=unless-stopped，独立基础服务保持。
- 原生密码登录、候选/公网参考图目录、修图页与手机导航、旧画布文档跨切换保存、独立新页面读回、未发送草稿、原节点及旧JS/CSS字节保持：23项通过；最终同一浏览器跨切换探测285次全部200，pageerror0。
- APIB Banana 2的5个比例展示项均恢复supportsEdit=true、maxReferenceImages=1。原edit=true、verified=false、上限1的配置保持；模型v121、计费v8的原始指纹保持。不通过配置改写制造能力恢复。
- 真实R2上传/原图/下载/Range/匿名拒绝验证通过，测试存储已清除；原任务与账务图preservationVerified=true。未发起付费生成测试，不将目录和本地模拟上游验证写成付费供应商出图质量验收。
- `scripts/deploy-release.sh --lifecycle status` 实际回读原canonical目录成功；Naumi、Hub、lifecycle三锁取得最终核对后释放。15项控制器约束/副本回退检查、完整Nginx closure副本回退、运行态回滚材料只读检查通过；没有线上实际回切或DB回灌。
- 最终自建QA节点/项目已删除，原节点不变；浏览器与本任务SSH隧道关闭。保留原备份、镜像、控制器和失败记录。

## 中途失败如实保留

1. 首次Debian apt网络失败：保存INITIAL_FIXED_BUILD日志，验证媒体工具链源码未变后复用在线固定镜像中的工具链，重新编译应用/Worker；非旧应用替代。
2. 浏览器两次在页面仍未水合时点击导航，首次即时断言失败、第二次等待展开超时。增加真实networkidle加载完成条件后，相同手机导航及其余断言通过；没有改产品UI或放宽可见性断言。首次/第二次日志独立保存。
3. 控制器在切流前后两次acceptance写入同一不可覆盖证据文件，第二次出现FileExistsError，原controller exit1与CLEANUP_PENDING保留。新版业务已正常服务，未再创建候选、未再切流。
4. 在原事务中将验收/marker证据文件名绑定revision，并从原本实际保存的task-snapshot恢复核对上下文。首次收尾身份检查按最初Worker启动时间比较，被已ACK的冷媒体交接重启阻止；逐项核对原handoff/resume回执与当前bootId及启动时间区间后继续，同一容器ID/镜像保持。没有将未知启动冒充原始启动。
5. 最终原事务完成任务图保全、新鲜Worker tick、持久启动策略及运行态回读，exit0；没有重跑部署、恢复数据库或重放付费任务。文件命名缺陷另以真实O_EXCL文件写入复现，修改后双次验收生成两个不可变文件，独立副本回退恢复原碰撞行为。

## 证据与未完成项

- 最终证据：`FINAL_REMOTE_EVIDENCE.json`、`BROWSER_RESULT.json`、`QA_CLEANUP.json`、`FINALIZE_RESULT.json`、`final-receipts/`。
- 制品与精确BASELINE/MODIFIED/ROLLBACK命令：证据根`artifacts/`下MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh。回滚脚本只作用于独立副本，线上回滚材料检查与实际回切分开记录。
- 本轮103发布已完成；47仍HOLD、未连接。实际付费生图质量未作为本轮部署测试执行。
