# 47 原生聊天生图：无图计划解析修复（2026-10-15）

## 根因与保护边界
- 截图“生成小猫”对应 operation `9fcf45b7-b9d8-4364-b7d5-aa6a01cd5059`，原会话 `f0213842-5a38-4ead-9c48-1b604e066ff1`。
- 输入图片为0；上游文字200成功，原结果已持久化，文字账务settled且charged/reserved均0。模型返回合法生成计划但 `image_indices:[0]`。
- 原本地解析因不存在图片0抛错；外层catch把已成功结果的本地异常误标成maybe_submitted。不是供应商未确认。

## 实现
- `chat-plan.ts` 抽出纯解析/动态提示词/错误阶段分类：无图片时非负整数索引规范化为空，有图仍严格校验；无图示例明确[]。
- `executeText` 把请求准备放入try；prepare和已收到结果后的解析失败为failed，真正未知保持maybe_submitted和禁止重提；原Billing/路由/权限/冻结/报价/幂等不改。
- 保留service的parseChatPlan导出，兼容已有调用者。
- 不增加自动恢复扫描。原任务只从已settled原结果定向恢复；必须原owner、operation/message/session、revision2、inputs0、task_mode confirm、原失败状态全部匹配，行锁+事务+CAS；不重新请求文字模型，不自动确认生图，不修改账务。

## 集中验收
- 源码离线解析/错误阶段测试通过，模型调用0。
- 原线上chunk提取实际parse/execute函数：baseline纯文字[0]复现引用无效；修改后归一化[]、有图越界拒绝、JSON失败分类、请求准备失败、上游未知、明确拒绝、settled重放0调用全部通过。
- Linux独立PostgreSQL命名卷、内网、无业务DB/media挂载：原生工作台18组API/DB回归通过（模拟图7、模拟文4、账本11；真实供应商0）；fixture已停止。
- 独立副本ROLLBACK.sh实际执行并恢复原SHA和原失败行为；MODIFIED_FILE保持修改后。

## 发布计划与Git
- 本任务独立worktree/分支 `codex/chat-plan-failure-47-20261015`，基线origin/main `daf72b27456f723a48c44b4c8dd21cee8aeed6cf`；已刷新全部远端分支。
- 在线运行c952f4a镜像+模型列表静态overlay保留。仅从实际运行chunk替换parseChatPlan和executeText两个函数，以同一依赖和原配置构建固定派生镜像，不把main未上线全站模块混入。
- 仅 `/api/reference-workbench/` 平滑切入新槽；其他页面/API/登录13063/旧独立工作台17847全部原样。三把锁覆盖基线/备份/切换/原会话恢复/浏览器最终验收。
- 同事upload-limit分支4148119存在独立框架修复候选；本任务不覆盖其文件、运行槽或未经其验收声称其已发布；切流前网关hash变化立即中止重核。
- 发布与原生浏览器结果待补，不将本节计划冒充已上线；仅47，103/120/179/101均未连接。
- 功能迭代计数1（本模块）；当前main未前进，后续达到3次再按约定同步。维护次数依47现有记录续记，本轮不删业务或他人制品。

本机证据：`E:/Workspace/naumi/output/chat-plan-failure47-20261015/`（不提交凭据或原用户完整数据）。

## 实际发布与收尾（14:41后复核）
- 源码 `3b1643b` 已推送本任务分支。真实上线为最小派生镜像 `sha256:407f017c804bd74634644655f91f7d94972b668a6efdc79f702ce7815e2466c4`，候选容器 `naumi47-chat-plan-r4-20261015` / 127.0.0.1:13066，仅原生工作台API切入；未全站换入main。
- chunk原SHA `03564a21c8042ed8aa8fd34cb059a92bdd7ecaa8b07b58bb9aa4563b1a2d49c3`；修改SHA `fc4014d2bbf6ec853e1138fe5455c86fb6784b7a2ff4a3482c33c2ddecfa90fb`。其余原bundle内容保持，保留原Skill/模型列表overlay与登录分流。
- 用户在维修期间又发了一次相同请求，chat revision从2变4；过期revision guard正确拒绝，未覆盖新消息。核查第二个operation `e65754a4-b02a-4c6e-8792-6202372aef2a`同样文字200/settled/0积分/无图[0]后，只对白名单两条原操作分别行锁+CAS恢复；所有原消息保留，均为plan_pending。没有自动确认生图、再次调用文字或新增扣费。
- 早期恢复helper的node stdin全局crypto变量冲突、旧revision失败都触发网关实际回退，DB不回灌；另一次端口碰撞未切流。最终r4正确完成，不能把早期失败当成功。失败的两个本任务候选已停止并取消restart；真正旧App保留。
- 三锁从备份到原生浏览器验收一直持有；可读pg_dump、模型v114完整指纹保持、旧容器不重启、切换采样11次/错误0。最终三锁FREE。
- 原会话真实浏览器1440/390、刷新恢复、pageerror0、写请求0通过，实际截图已打开检查；手机保留既有窄布局，不宣称移动UI重设计。原消息状态已由失败变“等待确认”，由用户选择其中一条确认以免重复生图。
- 本次没有提交新的真实生图供应商请求，因此不把计划恢复写成已生成小猫成品。18组隔离API/DB回归包含模拟计划确认与图像结果；原线上账务保持。
- 四制品与逐条命令/输入/原样输出/exit/回滚记录：`E:/Workspace/naumi/output/chat-plan-failure47-20261015/VERIFICATION.txt`；服务器可执行网关回退 `/opt/naumi-staging/evidence/chat-plan-failure47-20261015-r4/LIVE_ROLLBACK.sh`，不恢复DB。模块独立副本ROLLBACK.sh已真实执行。
- 成功发布增量+1，原累计来源尚未统一不虚填总数；服务器52%/32GiB可用，无需提前清空间，未删他人文件/镜像/用户数据。功能迭代1，远端main仍daf72b2；本轮未合并任务分支到共享main。
