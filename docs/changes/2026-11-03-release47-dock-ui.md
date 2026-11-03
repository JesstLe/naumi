# 47 主线发布：创作栏滚动、展开与引用浮层

## 实际发布结果

- 用户授权：好了，发一次新版到服务器。目标为大陆47；103未操作。
- 2026-11-03 12:30:04北京时间完成入口切换；12:41:19完成最终运行验收。
- 固定main候选：`6eddec90a0c35df59fae77c8288b8ac7fc10cddb`。
- Build：`1793679208`；实际Web/Worker同镜像：`sha256:2bfc04cefa6baa45c2c254d892262edb70c104c8f33639c67885af83a8d281f3`。
- Web：`naumi47-web-main-20261103-r1`，回环13130；Worker：`naumi47-worker-main-20261103-r1`。
- 本轮canonical发布记录COMPLETE，revision1518；历史根phase及历史发布债务原样保留。
- 最终一个完整Web＋同版Worker；旧Worker先于旧Web正常退出，exit0、restart=no，无强杀。
- 恢复监督manifest、service、timer绑定新实例；实际service输出 `RECOVERY_SUPERVISOR=PASS WEB_OPEN=YES WORKER=IDLE`，exit0；三锁已独立重取并释放，locksFree3。

## 新增功能与模块归属

相对运行806603fd，新增业务仅d6a33456，10份产品UI/layout文件；另有验证脚本和文档，共17个候选差异文件。

- CanvasComposerShell / CSS统一正文滚动，保留固定头尾。
- canvasDockLayout / dockPlacement让图片、空图和视频编辑栏真正展开；不改画布缩放、节点位置或尺寸。
- ReferenceMentionPanel使用body portal，按光标和viewport定位；支持缩略图多列、空间不足时上翻、独立候选滚动。
- 图片/视频编辑器保留引用wire、身份、焦点和选区；CanvasClient/VideoSettingsDialog按节点接线。

本次没有API、模型映射、计费、存储或任务执行的产品差异；103隔离线及core-refactor未纳入。admin早上409精确原因及已识别的失败提示/旧重试问题未在本批修复，未写成发布收益。

本批按功能任务已有明确决定不增加站内公开公告，保留以前公告及旧页面版号上限。

## 本地集中验证与构建

- BASELINE：`DOCK_LAYOUT_BASELINE=REPRODUCED nested_scroll=3 expand_delta=0 mention_clipped=1`，exit0。
- MODIFIED：Dock12/12、图片/视频行内引用22/22、参考UI→原提交适配器通过，pageerrors0、supplier0。
- 完整CanvasClient＋隔离PG/auth/upload/copy/share：7/7通过，原生展开/唯一滚动/节点与viewport不变、提示词重载、私有缩略图覆盖。
- Next typegen、完整tsc均exit0，tsc stdout/stderr为空。
- 固定Linux构建135.37秒exit0；无网络镜像smoke40份静态资源/版本/Worker语法/媒体运行时通过。
- 镜像导出260388781bytes，SHA256 `07db4157c33933a1ffc5d6b6c31090a52f90506fc07e6562d219dc801dbf7358`；重开归档及source/version/config digest通过。

## 蓝绿执行与验收

- 三把发布锁从线上基线至主要验收全程持有；候选独立state、Web draining/Worker paused启动。
- 内存门槛保持2560＋1024＋1024=4608MiB，实测4692MiB时通过，未把swap算入预算。
- 候选10项真实HTTP200：版本、健康、会话、项目、画布、后台、企业详情/用量/历史作品。
- 新旧静态union5265项，原精确alias保持；forward与保留新静态的cutback完整closure语法通过。
- 入口切换前后120秒519次公网探测，errors=[]，实际覆盖806603fd与6eddec90。
- 原Web长连接自然结束后取得连续两次完整排空观测；旧Worker正常退出后，最后一次Web读出现瞬时非零门槛，脚本按原规则停止在retire Web之前。后续只读确认Worker确已退役，另取两次新鲜Web/DB/owner零观测，再继续旧Web正常退出及新Worker resume；未重复既成操作。
- 新Worker和媒体服务显式resume，最终paused=false、unresolvedTicks0；19个completed tick，unknown tick0、新Web unknown0、pending image0、长idle事务0、锁等待0。
- 候选及公网协作SSE真实首包和15秒heartbeat通过。公网主动18秒终止，curl28是约定探测终止，非应用失败。
- 真实上传、HTTP/NAS字节回读、下载、Range206、匿名401、延迟补传队列通过；本任务验收数据已清理，supplier调用0。

## 浏览器检查中的真实失败与独立核对

复用上轮读验收脚本跑15项，实际14项PASS、1项FAIL、pageerrors0、HTTPerrors0。唯一失败是旧脚本硬性要求本版新增公告，与本批明确不公开公告的决定相反。原始NEEDS_REVIEW/exit1保留，没有改成15项全绿。

随后独立公网HTTP检查确认本版条目缺省符合决定、此前公告保留、旧页面版本上限正确，exit0。首次该补查误把route响应version当成运行版号；读源码确认响应回显查询版号后修正断言，原错误留痕。最终汇总为14项真实浏览器通过＋1项按本批正确合同的独立HTTP通过，而非整套浏览器重跑通过。

浏览器阻断86次非读请求等，真实收费生成及CRUD写入0；不把读验收说成生产全量生图/CRUD验收。

## 数据保全与空间

- 发布前后20张业务表97399原行完整指纹比较：missing0、changed0、schemaChanged0；本次无新增schema。
- 3879条历史UNKNOWN原字节摘要保持；没有清UNKNOWN、重放收费任务、制造tick完成或恢复数据库。
- 模型152与计费配置hash前后一致。
- 发布前磁盘90%、可用约7.1GB；只移除超出保留窗口且已停止restart=no的三组旧Web/Worker及无剩余引用镜像，保留此前最近五组和当前site-control。
- 23份历史dump/镜像包/关闭日志/取证文件共4874631714bytes归档至本机ACL保护目录，全部逐字节hash重开、两份dump真实pg_restore --list通过后，才CAS移除远端重复副本并写原位置索引。
- 新本轮dump1216299483bytes，SHA256 `7128e33fab59afd727605f44a5f683d70b05f48ff929c5c1aaa9eff20a4e3e80`，真实目录可读；未restore。归档后可用12167143424bytes，镜像导入后约11.58GB。
- 未删业务媒体、活动日志、数据库volume或release-state；原始档案在保护目录保留。

## 副本回滚与制品

- 固定候选完整4766文件；恢复副本9原文件、删除8新增文件后4758文件逐字节等于806603fd。
- 原runner从真实rollback目录重新复现旧UI行为，exit0；候选副本保持修改。
- later-edit full preflight exit73且零写；Git补丁在独立无.git副本明确LF重放后与候选完整逐字节一致。
- 初次补丁命令exit0但全局autocrlf转CRLF导致字节检查失败，原反例留存；没有冒充首轮通过。
- 生产未执行回切；保留旧程序和旧upstream＋新旧静态union的cutback，不恢复DB/媒体。

证据目录：
- 本机：`E:/Workspace/naumi/output/release47-main-20261103-r1/`。
- 远端：`/opt/naumi-staging/evidence/release47-main-20261103-r1/`。
- 历史归档：`E:/Naumi-private-archives/release47-main-20261103-r1/`。
- 四制品：`local-verification/artifacts/{MODIFIED_FILE.zip,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`。

关键回执：POSTFLIGHT.json、live-evidence/FINAL_ACCEPTANCE.json、FINAL_LOCKS_RELEASED.json、CONTINUITY_SUMMARY.json、PUBLIC_ACCEPTANCE_AGGREGATE.json、PUBLIC_NOTES_POLICY.json、local-verification/FINAL.json。

本文为发布后记录；后续文档提交不改变线上固定commit6eddec90。

