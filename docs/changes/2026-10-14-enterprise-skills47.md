# 47 企业共享 Skills 模板与作者花名

## 用户请求与实现

同企业员工可共用Skills模板，模板标明作者花名。仅47本轮发布；Dashboard默认入口及底部图标工具栏保持，不把参考图工作台改作首页。

- 企业关系读取Naumi现有app_enterprise_members及企业owner；普通员工不需要企业管理权限。
- 新建/导入/另存Skills，在有效企业成员UI默认“同企业共享”；仍可明确选择“仅自己”。现有个人模板不自动公开，编辑时保持原范围。
- 企业共享标签页、卡片和详情均标作者花名，使用app_users.name实时读取；不显示作者邮箱，也不接收前端伪造作者/企业ID。
- 作者更新/移除原版；同企业其他成员可使用、导出或另存副本，不修改原作者模板。作者取消共享、移除模板或修改版本后执行重新检查。
- 成员移出/换企业、账号禁用/到期、企业/入口授权关闭或到期立即失去共享读取/执行；企业负责人也可读取，不按管理层级过滤共享知识库。
- 表app_image_skills只新增nullable enterprise_id外键及索引；既有模板仍private。新schema兼容旧App/Worker回退，不回灌或删除DB/媒体。
- 修复原Skills弹窗中文IME按Escape误关草稿；取消选择/提示词保留/32px图标布局保持。

## 集中隔离验收

真实隔离Postgres：ENTERPRISE_SKILLS=PASS46项，作者花名、普通同企业/owner读取、他企/独立用户隔离、伪造企业和作者无效、他人编辑/删除拒绝、副本归属、private保留、共享撤回、成员移出/跨企、授权停用/到期/企业停用/禁用账户、实时改名、并发版本冲突/作者软删除。原Skills认证API/Postgres100项通过，供应商调用0。

## 远端与当前进度

开工origin/main86b06ac，保留本任务已验收87d23d2输入框优化及完整canvas结果布局修复。当前代码完成，准备固定Linux镜像/旁路13054、桌面/390px企业Skills浏览器、多员工API与切流/副本回退/锁释放验收；尚未发布前不写已完成。

47本轮真实只读基线：天地合大健康有效，owner北方，194企业成员；Skills自定义0。既有花名账号/积分/作品/任务及本地媒体不更改，不连接103、120、旧179或101。

## 最终服务器验收与发布

- 固定183dff86a8a8443471e5ae73245cfd414bf6f20d / image98867a026c12 / 新App13054，完整Linux Next15.5.27生产构建/类型/88页通过，既有lint警告保留。
- 旁路及公网使用真实员工逍遥、若兮：创建默认同企业共享、卡片/详情作者逍遥、同企业查看/选择到提示词、另存副本作者若兮、private副本作者隔离、他人编辑/删除409、作者取消共享后同事GET不可见；1440/390px通过，脚本异常0，供应商0。
- 实际47数据库/实际请求处理函数：同企业技能执行resolve通过；现有不属于任何企业的账号读取/resolve拒绝；普通同事PATCH/DELETE拒绝。临时模板逐个软删除后只清理本测试明确ID的已归档记录，不动用户模板。公网测试留有软删除审核记录。
- 企业隔离Postgres46项、既有Skills认证/权限/持久化100项、当前组件6项(含中文IME-Escape)和正文结构20项通过，不将此前广泛执行fixture失败称为通过。
- 持三锁、备份/读取验证、隔离Nginx语法、旁路验收后平滑reload；60次HTTP请求无错误。旧App13052/13053及Worker保留，无第二Worker、不停原参考图工作台。旧静态资源补入候选保持已打开页面资源可用；首页仍Dashboard。
- 只有nullable enterprise_id和索引的增量DDL；未迁移旧私人模板、未回灌DB/媒体、未改账户/密码/积分/组织关系或上游渠道。新授权与成员状态取实时数据库，已接受任务继续其原冻结上下文。
- MODIFIED_FILE.tar、DIFF_FILE.patch、VERIFICATION.txt、LF可执行ROLLBACK.sh双端核验；独立网关副本恢复原摘要33cf7caed6ac84dcf7fc8716b4b662511884c61df970ce218cfd8d50e1348093；线上共享模块保持。没有实际把公网切回旧版或撤销schema。
- 本轮累计第3次App发布，持锁维护检查仅清旧88失败源码副本、与交付包完全一致的重复归档和本任务旧停止apt构建容器，释放服务器199686572文件字节；本机重复归档100782080字节和自有隔离fixture删除。当前+前两个成功镜像/槽/完整可读PG备份、业务媒体和源归档保留，磁盘67%/23GiB，维护计数归零。
- 功能迭代计数本轮达到3：Dashboard入口、输入框工具栏、企业共享；按约定再次fetch并在自己的工作树普通merge origin/main，后续记录同步SHA。此Git整合不等于发布main独立fleet阶段，线上仍固定已验收183dff8。
- 证据E:/Workspace/naumi/output/naumi47-enterprise-skills-20261014；服务器/opt/naumi-staging/evidence/enterprise-skills47-20261014；测试复用scripts/verify-enterprise-skills.ts和scripts/verify-enterprise-skills47-live.ts(只对显式47企业验收)，无前端密钥。
