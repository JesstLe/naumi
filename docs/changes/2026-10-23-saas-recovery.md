# SaaS 权限扩展的受控维护恢复

## 恢复边界

已批准 PRD 第12节允许在没有合格兼容回滚程序时，采用受控维护恢复。本轮选择该降级办法，不为通过门禁再引入一套未经验证的只读管理模式。常规发布仍必须完整蓝绿、旁路就绪、整站切流、排空和旧槽停止；本文件不授权常规发布先停站，也不复用2026-10-16一次性维护例外。

`0a572167` 及不理解新 membership、冻结企业归属、私有素材撤权语义的历史镜像只保留为历史程序/静态资产与可读材料，不能直接切到公网。不得把同镜像的另一个 tag 当成兼容回滚版本，也不得把“能启动”当成权限兼容。

本轮**没有提供兼容业务程序回滚**。R06必须明确记录这一限制；本机维护降级验证不是线上维护已经执行，不得据此把正式发布或真实Worker排空标为通过。

## 已实现工具与本机证据

- `scripts/ops/saas_recovery_gateway.py` 只盘点和渲染，不连接生产、不应用配置、不改lifecycle状态、不操作容器或任务。计划固定完整nginx dump hash、精确server块hash和显式server清单；未知/重复server、hash变化、回灌DB/重放任务均拒绝。
- 在明确审核的server rewrite阶段统一返回503，先于任何动态/静态/旧cookie/命名路由；独立503错误处理避免旧 `error_page` 转到上游。其余server、TLS、原location内容与内部Web地址保持。未审核的server级include会拒绝，必须先审查闭包，不能猜测其中的错误处理。
- 生成的bundle保留原始配置字节、前后hash和补丁材料；报告默认 `applied=false`、`allPublicEntrancesInventoried=false`、`compatibleBusinessRollback=false`、`workerDrainProven=false`。纯渲染不证明现场入口已完整识别。
- 纯CAS/选择/保护测试3组通过。真实本机Linux Nginx/TLS测试52个GET/POST/HEAD/OPTIONS组合通过，含平台、企业、旧cookie、legacy入口、RSC、私有媒体、旧静态、提交和Worker公网接口；均503、no-store、Retry-After，恶意旧error_page未转发。非目标基础服务200。
- 内部接口使用明确合成backend，未携fixture密钥401、携带后200，付费接受计数0；这仅证明入口隔离，不是真实Naumi Worker/任务恢复证据。容器资源有界、仅回环发布、专用bridge禁IP masquerade，退出后按本次唯一标签清理。
- 最后证据：`output/saas-recovery-nginx-20261023-c/result.json`。前两次 `final`/`b` 由于Docker29内部网络不发布端口而未完成HTTP验收，不能作为通过。修正为无NAT的专用bridge后通过，未因此放开任何生产入口。

## 发布前现场门槛

1. 等待其他授权发布完成，刷新47真实commit/Image ID、活动模型配置、所有运行实例、完整Nginx闭包、系统服务、公网监听/域名和旧兼容入口。不能按旧配置134覆盖供应商新配置，不能遗漏直达旧服务的公网端口。
2. 在同一canonical journal与Naumi/Hub/工作台三锁下，记录当前revision、真实基线、可读备份和恢复材料。工具不写新状态目录，不清历史事故，不伪造COMPLETE/ROLLED_BACK。
3. 由实际公网入口清单选择每个Naumi server，生成带hash的维护bundle，并用真实同版本Nginx及完整证书/include环境执行 `nginx -t`。现场有未审核server include则先审查，不能修改renderer绕过拒绝。
4. 以最终固定镜像验证内部调用图：Web直接import、INTERNAL_APP_ORIGIN、Worker NAUMI_APP_ORIGIN与任务恢复均同版，内部Worker接口真实未授权拒绝、受授权只读状态可用。不得为验证重发收费请求。
5. 将已审核维护bundle、最后兼容的新程序入口、精确hash与恢复执行步骤放入本次受保护证据目录；发布控制器不能把旧标准rollback脚本默认切回0a。任何不能安全恢复的门槛仍阻断切流。

## 故障时执行与退出

这是异常恢复路径，不能算连续可用发布成功。持三锁核对当前线上版本与nginx preimage/CAS，先阻断全部已盘点公网Naumi入口并 `nginx -t` 后平滑reload；验证旧页面/旧cookie/API/媒体均503，没有继续接受新业务。静态字节和业务数据保持原文件，维护期间不从公网读取。

保留同固定版本Web供原Worker完成已接受任务，前提是实际故障不涉及该执行内核且任务/租约归属可证明安全；如执行内核也可疑，只暂停新领取并逐项核对，不强制执行、不重启重派、不强停活跃任务。其他独立基础服务、配置、数据库、媒体、原始凭据和有效备份保持。

维护撤销只允许恢复已验证理解新权限的完整程序入口；重新取得真实就绪与受影响授权/素材/任务证据后，按精确配置CAS、nginx校验和平滑reload恢复。恢复后继续完成真实任务排空和canonical状态记录。不得通过回灌旧数据库、重放未知收费请求、切旧无权限镜像或删journal结束事故。

**当前状态：本机降级恢复验证通过；47实际闭包与固定候选内部Worker证据待发布准备阶段核验；未执行线上维护或发布。**

## 专用发布适配与失败路径复核

新增统一入口 `bash scripts/deploy-release.sh --lifecycle publish47-saas --config ...`，仍沿用原HostTransaction三锁、完整正常发布控制器、原canonical journal/revision CAS、固定镜像、备份、任务比较、真实就绪、整站切流与旧槽排空。精确本次用户授权只允许 `release47-saas-*` 与 `recoveryMode=saas-controlled-maintenance`；旧通用Controller及旧program rollback入口在主机动作前拒绝此类计划，不能因缺兼容旧程序静默走回切。

SaaS适配在切流前固定本地验收/真实公网入口盘点的hash，生成候选闭包对应维护bundle，并以现场真实Nginx在隔离配置树执行 `nginx -t`；原server哈希、监听与server_name均须吻合。候选开放私网后、切公网前，实查同Image/commit的Web与Worker、内部调用地址及未授权Worker状态拒绝/授权只读状态200。这里只GET状态，不调用tick或供应商。

独立审查发现并修复共享切流helper的P1：原helper在reload超时后会自动恢复preimage，而第一次reload可能已经生效并接受新SaaS请求。现为SaaS forward和维护切换显式使用 `failure_policy=preserve-written`；原有发布默认恢复preimage流程保持。切换回复未知时保留可能已写入的配置、原UUID/UNKNOWN和实际字节，按真实候选闭包CAS进入维护；混合或未知闭包拒绝自动覆盖。维护使用独立事务子目录，避免覆盖forward的intent与preimage。恢复状态为 `RECOVERY_REQUIRED`，继续阻断后续发布，不冒称COMPLETE/ROLLED_BACK。

本机集中回归：Controls14、SaaS8、正常发布policy34、lifecycle58、NAS后继5组通过。使用真实helper与真实原子文件写入，模拟“首次reload已应用但返回超时→维护reload”，观察到的配置依次仅为candidate、maintenance，没有旧program；原gateway-switch UNKNOWN与两份intent均保留。第二原子写失败的混合状态保持未知，不发reload。新增内部执行图和权限proof的拒绝断言；日志 `output/saas-admin-20261022/verification/ops-controls-final.log` 与 `ops-saas-final.log`。Nginx路由/HTTP的52项真实Linux验收见前述独立证据；本组HostTransaction命令为明确fixture，不能替代现场切换验收。
