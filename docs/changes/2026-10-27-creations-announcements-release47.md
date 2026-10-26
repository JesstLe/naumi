# 47 创作记录与通知公告实际发布

## 实际上线

- 用户明确四条操作要求后授权“弄好了切换”：只绑定现役或新Worker，先更新监督钉定，重新读取排空证据，新Worker必须显式resume。
- 固定main源码 `a33ed3aead88e87d617ad859a5b59ecf53dd27ed`，版本 `1793021601`，镜像 `sha256:ecc67f94fb4d9ef07f92d62447220a2b5d4ce27bc2633b5c95247979d55a5cba`。此后main只有交付文档变动，未整合重构。
- 北京时间 **2026-10-27 01:08:45** 完成Nginx整站切流；**01:10:23** 本轮记录为COMPLETE，canonical revision880。
- 新Web `naumi47-web-creations-20261027-r1`，loopback13118；新Worker `naumi47-worker-video-family-creations-20261027-r1`。两者同镜像/commit/build，Web内部回调指自身loopback，Worker目标指新Web，媒体地址指新Worker3002。
- 原当前Web `naumi47-web-anomaly-repair-20261026-r1` 与 `naumi47-worker-queue-surgery-20261026-r1` 均在排空证明后正常停止，ExitCode0、restart=no。af22旧Worker保持停止，未重新启用。

## 四条把关的落实

1. 初次新鲜检查确认现役queue-surgery Worker正常、tick持续completed；先把current recovery绑定从af22纠正为真实现役pair，最终绑定新pair。
2. 旧systemd ExecStart仍指向已归档不存在的manifest。先安装新固定程序/manifest、校验static pin与规范化manifest SHA，再daemon-reload、启用timer。01:12:46实际service执行Result=success、ExecMainStatus=0；timer active/enabled，没有拉起历史容器。
3. 领域drain-status五类fence均0，activeTransactions/advisoryLocks0；Worker真实quiescent、媒体draining且running/queued0；旧Web启动以来HTTP开始结束计数相等、当前boot背景/Agent观察0、owner记录空。最后退役前重复证明两次。原API的acceptedTasks/agentSessions null为覆盖标记，未写成假0；历史停用实例观察独立原行哈希保持，未宣称全库unknown=0。
4. 新Worker首次resume后确认真实completed tick；退役屏障暂停后再次显式resume，最终paused=false/unresolvedTicks0。新媒体服务draining=false、sandbox=true。01:13读到正在执行的tick，随后同UUID于01:13:09真实completed，不把正常运行中tick判作UNKNOWN。

## 业务与公网核验

- 公网独立客户端GET版本、health、公告、首页、canvas均200；首页SSR有通知按钮，公告23版94条。
- 图片重复展示采用真实截图对应记录做只读新查询：原6份输入合并为2组（原图与字节不同的处理图），加1份结果；蒙版/未知素材/不同作品分组行为沿前置16项PG及20项组件测试证据。
- 原输入图GET200、1,541,874 bytes、1024×1024；原结果GET200、1,592,312 bytes、1024×1024；均完整sharp解码且SHA与原记录一致。没有重新生成或结算。
- 任务保全使用原main collector的业务图、冻结参数、供应绑定及账务规则，23表完整读取；仅当前两Web的活动/session根入当前执行部分，其他历史未结束观察单独按原行集合SHA保全。比较noMissingJobs=true、noOriginalSupplierMutation=true、unknownTables空、violations空；历史观察exact=true。
- 新旧静态资源union共3,121项，候选/原closure语法检查通过；抽查4个既有静态URL HTTP200、字节SHA一致。保留完整旧静态资源，不强制刷新用户画布。
- 公网基线1,151次请求全200，观察结束01:07:11；切后30次连续200从01:08:52开始。两段中间有采样空档，**不声称连续探测覆盖切换瞬间或零中断验收全通过**。
- 平台后台已设置独立密码；普通native管理员会话访问后台API正确403。私密密码输入超时，未绕过密码或改权限；后台密码登录的生产正向检查仍未执行。已有普通登录、真实DB读取投影和原图解码、隔离真实权限/账务回归分别记录，不混称全部后台交互验收。

## 旧记录与回切

旧两次SWITCHED_CLEANUP_PENDING原记录及原失败继续保留，新增operational reconciliation指向真实退役、当前pair和新监督绑定；未补造过去缺失的完整preservation验收。本轮current release COMPLETE不等于历史事件全部解决，顶层历史MIGRATED_CLEANUP_PENDING保持。

可读数据库备份已保存，未恢复数据库。切回材料为“旧13117 upstream＋保留新旧static union”，独立两文件副本恢复与真实nginx语法通过，线上入口未回切。旧pair已退役，因此正式回切还须重新核验其就绪、当前已接受任务与媒体绑定，不直接把已停止槽位作为可用upstream。

## 原始失败与证据

- R1读取所有已完成历史活动的整表JSON摘要超时，发生在canonical变更前；修正为本次保全对象——旧未结束观察，逐行集合SHA保存，未提高查询超时或删除记录。
- R2备份、镜像导入和候选启动成功；后台API403使就绪流程退出，旧站仍服务。R3复用原候选、原备份和原task snapshot，不重复创建或重跑完成步骤；正向后台登录未完成单列。
- 远端证据 `/opt/naumi-staging/evidence/release47-creations-20261027-r1/`；本地 `E:/Workspace/naumi/output/release47-creations-20261027-r1/`。
- 四制品 `artifacts/MODIFIED_FILE.json`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`已重开。回滚脚本仅作用于标记过的独立网关副本，保留生产修改态。

本轮只更新47；原存储/模型/计费配置指纹保持，无数据库恢复、旧UNKNOWN删除、未知付费请求重放或强制kill。
