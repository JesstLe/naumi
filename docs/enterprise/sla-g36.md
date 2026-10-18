# G36 服务端定时提醒与SLA升级

状态：服务/BFF/浏览器与开发态运行组合通过；固定包/Git/回滚以本轮VERIFICATION.txt为准；唯一产品18482原页面，原schema8与Excel不迁移。总目标ACTIVE。

## 时钟与收件人

|规则|实际锚点|首轮收件人|升级|
|---|---|---|---|
|截止日期|未交付任务dueAt；含当前执行人，交付截止变更/交接产生新时钟|有效执行人，无执行人则团队manage/dispatch|团队manage/dispatch|
|需求待受理|最后submit-requirement事件；只在submitted|团队manage/dispatch|团队manage/dispatch|
|待认领/确认|最后publish/release/assign/批量指派事件；只在open/assigned|已指派本人，否则manage/dispatch|团队manage/dispatch|
|执行阻塞|最后block事件；只在blocked|本人及manage/dispatch|团队manage/dispatch|
|交付待评审/验收|最后submit-delivery事件；只在review|当前结构化评审成员；未建轮则独立review人员|团队manage/dispatch|
|交接待确认|pendingHandover.id/requestedAt|拟接收人（执行权限/工种有效）|团队manage/dispatch|

交付截止dueAt与排期planEnd是独立字段，拖动排期不隐式改交付承诺；本轮提醒以明确dueAt为准，不按排期日期猜截止。截止规则minutes表示提前分钟，阶段为临期/到期逾期/逾期升级；其他规则minutes表示等待多久后超时，之后escalateMinutes升级。使用真实经过分钟，不冒充公司工作日/考勤/节假日SLA。rule kind每团队唯一，最多6条；不允许自定义脚本。普通成员仅看自己的站内通知，不读取管理员规则/团队扫描日志。

## 规则治理

manage权限维护。每次编辑先只读preview，展示当前未结束需求总数、抽样至多50单的命中情况/最多20项明细以及无收件人提示；显式说明抽样不是全量推送数。作用范围为当前与后续全部未结束工单，不仅抽样。确认保存携带commandId、expectedVersion、asOf、previewHash、reason，预览5分钟过期。已变化的政策、样本版本、成员或评审归属使预览失效；未知提交重用原命令；历史与命令回执原子保存。

默认团队规则关闭；开启前明确预览已有积压。启动/停机恢复不补发所有历史阶段：每个业务时钟只生成当前最高阶段。政策版本变化不进入时钟唯一键，避免微调阈值重发同阶段。临期/逾期/升级各最多一次，已发高阶段后不再降级补发；规则停用后重启不会重置去重记录。

## 持久调度

025表sla_policies/sla_policy_revisions/sla_commands/sla_occurrences，notifications新增nullable reminder。团队政策持久scan_order、scan_clock、next_scan_at与last_scan_at，重启接着扫描。按到期政策公平轮询，每tick至多处理一个订单中的一个时钟（收件人上限200），结束全轮后30秒再扫。任务每单最多50条；不把HTTP请求负载样本当4核8G容量结论。规则预览/扫描超过团队200成员提示目录规模，不静默只发前200人。

Worker只有显式activate之后执行，standby不扫；调度与投递共用原独立Worker和lifecycle.work统计，排空等待本次事务完成。多Worker通过政策行FOR UPDATE SKIP LOCKED；采用order advisory try-lock及订单FOR SHARE，忙订单跳过并下一轮复核，不等待或阻塞正常任务推进。扫描指针、occurrence、站内通知、外部outbox同事务；失败回滚全部。

唯一键含企业/团队/订单/任务/规则/实际业务锚点，阶段另作唯一约束。使用原notification表及收件人绑定，不推断钉钉userid，不发送邮件/群广播。通知标题不拷贝需求正文、提示词或图像。站内通知是生成时事实，用户打开后读取当前任务；历史提醒不会被改成当前待办状态。

## 外发失效与结果未知

通知Worker在领取发送租约前，重新检查当前规则开启、业务时钟、当前阶段和收件人资格。交付截止已变化、取消、完成、交接或进入更高阶段的待发旧提醒取消；配置关闭也取消。发送开始后的业务变化不声称能撤回在途消息，已接受回执继续查原任务，不重新发送。发送结果unknown维持现有人工核实机制，扫描不绕过去重再发相同阶段；租约丢失不自动重发。

## 运行启用与回滚

slaEnabled默认false。sla-enable-plan/enable显式确认所有读写者升级，提升reader/writer25并持久sla_enabled，旧24进程业务/readyz/Worker门禁拒绝，避免旧投递器忽略reminder失效检查。新程序缺少sla配置也拒绝。reviews_enabled、demand_assets_enabled等独立flag保持，不能以抬升floor隐式启用其他功能。

本轮同时补齐G35业务入口guard使用独立demand_assets_enabled/reviews_enabled的检查，使业务门禁与readyz一致。回退保留25兼容门禁/已接受消息/occurrence，不下降floor、不回灌DB、不重发未知通知。

## 页面与接口

原“通知”页manage可见“定时提醒”；规则总开关、六类阈值、预览确认、当前扫描水位、生成记录和政策历史。浅色390px，未知结果冻结原请求，关闭/换号/换组清屏并丢弃迟到响应。

GET /v1/sla: settings/occurrences(page)/history(page)。POST: preview与save。BFF /api/enterprise/workflow/sla复用原生会话、同源校验、来源身份和请求大小/频率限制。没有对浏览器开放tick接口；隔离验收fixture tick仅在测试服务。

## 验收矩阵

六时钟锚点/分钟边界/缺事件不猜测；各阶段最高只一次/停用重启/规则微调不重发；多Worker竞争、cursor重开与多团队公平、忙订单跳过；审计/通知失败原子；改期/完成/更高阶段/撤权待发取消；unknown不重发和accepted只查询。原订单/事件/贡献/来源账本不修改。

原生BFF权限及预览/CAS/replay，原页面编辑→预览→保存→Worker生成→本人通知，390px/关闭迟到/换号。真实旧24运行门禁、standby零扫描/activate推进/排空、固定包与Next组合、实际schema8读写兼容及源码副本回滚。真实钉钉、公司正式时限/工作日暂停、预警统计和目标服务器容量仍需另验。

## 实施记录与证据（2026-10-18）

服务集中验收：六时钟及分钟边界、缺事件不推断、policy preview/hash/version/asOf、命令重放、同阶段去重、停止再开启和阈值微调不重发、最高阶段、取消/变更/更高阶段旧投递拒绝、unknown保持、accepted继续原回执、通知插入失败时occurrence/游标回滚、忙订单跨过继续扫描、跨团队范围、schema8实际兼容。业务订单/事件与来源账本不由扫描改变。

开发态运行34组：真实独立Worker standby扫描0、activate后消息生成、drain游标冻结；实际旧24进程在floor25开启后readyz/业务503，遗漏配置拒绝；独立review/需求附件flag在API业务入口验证。Next开发态28组与全源码typecheck通过，最终干净commit固定包再验以`E:/Workspace/naumi/output/enterprise-sla-g36-20261018/VERIFICATION.txt`为准。

原浏览器15项：原通知页入口、预览无写、已保存响应丢失后原命令重试只有一个政策版本、服务tick去重、390px单列编辑、样本变化拒绝、返回保留输入、生成记录≠已送达、历史版本、员工无管理入口且收到本人提醒、迟到关闭/换号清屏和关闭政策后不再生成。测试规则1分钟为合成验收数据，不是公司制度。

失败保留：首次SLA测试残留待投递记录干扰后续通知用例，增加仅该合成企业待办清理；首次原生BFF发现store与NotificationStore通过readScope重导出形成循环依赖，改用read-scope独立模块导入；测试变量sp与旧变量重名已改名。GUI第一次试图使用未在布局注册的标签作样本变更，被INVALID_SCHEDULE_TAG正确拒绝，随后按正式set-task-plan合同制造样本版本变化并验证409，没有放宽业务校验。

025持久扫描/通知元数据与原通知outbox复用，真实库保持schema8/364行292附件/0映射0需求0SLA表。18482/18494原进程不重启。未配置真实钉钉，未发送真实员工通知，不宣称正式4核8GiB容量或服务器发布完成。

后续：按全目标审计补跨团队同人容量/WIP、企业正式时限和按工作日暂停、真实组织/钉钉绑定与蓝绿试点。接续提示：读取implementation-goal与此文，保留当前入口/原表/显式身份映射，核查真实实现后继续下一个完整模块，集中测试并交付固定证据，不将本模块当全部系统完成。
