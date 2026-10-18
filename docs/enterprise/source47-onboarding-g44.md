# G44 47 来源站接入核对与真实人员映射准备

## 1. 需求及范围

用户于 2026-10-18 确认真实员工联调和天地合大健康 Naumi 来源为 47 站点。入口为 `https://47.105.59.142/admin`，产品仍采用 `http://127.0.0.1:18482/preview.html?v=4` 原企业协作界面。来源选择与产品入口、部署地点是不同配置，不将 `/admin` 替换为协作页面。

本模块把已确认站点落实为可重复的只读接入工具和真实企业目录证据，不通过管理员代理伪装员工，也不直接启用正式工作流。上一阶段提出的 M12 活跃需求变更仍待实施，未因本模块被移出总目标。

## 2. 架构决策

- 沿用已有同主干 `NaumiEnterpriseAdapter`、原生会话、企业/层级范围和工作流 BFF。远程 `/admin` 是定位来源的入口，不是机器接口或万能访问令牌。
- 最终员工请求由实际登录的 Naumi Web 执行身份检查，再以 45 秒服务端签名身份访问独立工作流 API。私有/平台用配置与企业白名单切换，不复制客户专属业务代码。
- 本机 18482 准备服务器没有远程员工会话转发能力。它不接收47的管理员 Cookie，不将所有员工共享为一个管理员，不伪造登录。
- 来源站实际配置的 `sourceInstanceId` 与主机名是不同概念。未配置时返回 null，不能用 IP、企业名称或候选别名冒充既有身份键。
- 真实资料只进入本机受保护证据目录，不入 Git；仓库仅存不含凭据的站点/企业范围配置。

## 3. 站点合同

`docs/enterprise/config/source47-site.json` 包含且只包含：

|字段|规则|
|---|---|
|version|固定 1|
|adminUrl|规范 HTTPS `/admin`，无用户名、密码、查询或片段；拒绝隐式路径/端口归一|
|enterpriseId|明确 UUID；历史开户记录提供候选，实际查询按此 ID 锁定|
|expectedEnterpriseName|精确名称复核；不匹配即停止，不按同名搜索替代企业|

这里的配置不被 Web 自动读取，不修改环境变量或已运行服务。实际核对企业为 `1095114e-6b57-429e-a954-7d663907e0c9` / 天地合大健康。

## 4. CLI 与输入/输出

```powershell
node scripts/enterprise-source-audit.mjs plan --site docs/enterprise/config/source47-site.json --output ABSOLUTE_NEW_DIRECTORY
node scripts/enterprise-source-audit.mjs probe --site docs/enterprise/config/source47-site.json --output ABSOLUTE_NEW_DIRECTORY
# 在受控来源执行环境提供 DATABASE_URL，不把连接值作为命令行参数。
node scripts/enterprise-source-audit.mjs inspect --site docs/enterprise/config/source47-site.json --output ABSOLUTE_NEW_DIRECTORY
node scripts/verify-enterprise-source-audit.mjs
```

三个模式各自必须提供新的输出目录，拒绝覆盖既有结果。`plan` 只核对合同；`probe` 只发送4个固定路径的匿名 GET；`inspect` 使用当前执行环境的源库连接和桥接设置。

- `SUMMARY.json`：站点、企业、时间、快照 hash、成员/账号数量、启用/入口状态、桥接字段有效性、源表存在性、未完成门禁。
- `IDENTITY_REVIEW.private.json`（仅 inspect）：指定企业老板及成员的稳定账号、花名、源角色/上级/版本、账号可用性。真名和工作流 subject 为 null、团队为空、mappingStatus=unreviewed。
- 源角色仅说明现有 Naumi 目录，不转换成工作流 manage/dispatch/review/execute 权限。实际功能授权、层级可见范围仍由原生接口在每次请求检查。
- 文件 POSIX 0600/目录0700；Windows 新目录撤销继承，仅当前用户和 SYSTEM 完全控制，再创建文件。CLI 只输出固定结果码，不输出名单、数据库地址、签名私钥或原始异常。
- 预检结果是某时点证据，非永久许可；正式 binding 前重新核对来源和预览，人员离职/更名/撤权均可能改变快照。

## 5. 数据获取与一致性

直接通过受控运维工具读取指定来源数据库；不调用含 `ensureSchema` 的应用初始化路径，不抓取 `/admin` DOM，不迁移用户库。

单个 `REPEATABLE READ READ ONLY` 事务，连接池上限1，连接5秒、SQL5秒、锁1秒、事务闲置15秒超时。预先核对 public 表/字段，缺失立即退出，不自动建表。每条成员查询均使用明确 enterpriseId 参数，最多2000名员工，超限整次拒绝而不是输出不完整目录。

只选择人员准备必要字段，不读取口令、余额、作品、提示词或积分流水内容。作品/图片任务/画布图片/视频/账本仅检查表存在；表存在不等于 API 可用、账单对账或归属已经成立。现有成员关系不是历史生成归属，保留 `current-membership-not-historical-ownership` 说明。

成功也以 ROLLBACK 结束只读事务，异常回滚并释放连接。集中测试在真实 PostgreSQL 中故意插入写操作，实际得到 SQLSTATE 25006，证明并非只靠代码约定“不写”。

## 6. 匿名接口检查

固定 `/admin`、`/api/version`、`/api/enterprise/workflow?action=discovery`、`/api/enterprise/integration?action=context`。不发 Cookie/Authorization，不跟随重定向，不保存 HTML、响应 Cookie 或账号响应。只接收规范版本字段，版本体积最多16KiB。单请求8秒，总共4次串行。

每项分别记录 HTTP 状态或 probe-failed。命令成功表示观察报告写出，不表示接口全部成功；200不设置 employeeReady。匿名401是已观测的鉴权边界，不是员工登录验收。

## 7. 2026-10-18 真实47核对

真实检查时间见 `SOURCE47_SUMMARY.json`，本轮初次成功快照 2026-10-18T04:34:03.537Z：

- 在线版本 `7bdcd8b644e8771646003f68055585f257df40f0` / `1792146767`。
- 目标企业精确 ID/名称匹配；194成员＋1老板，共195账号。该时点195账号均未停用/未到期，企业启用且老板入口授权有效。这不是195人实际登录验证。
- 5类来源表存在，没有读取其明细内容或收费调用。
- 来源实例配置缺失；工作流服务地址、signing kid/key配置未有效建立。私钥配对和工作流服务可达性未检查。
- 原生 workflow discovery 和 integration context 匿名均401；`/admin`200和版本API200。
- 已导出195条私人核对清单，真名、目标身份、团队与权限未填写；没有按同名/花名猜测关系或写入真实人员资料。

第一次在当前 Web 容器启动独立 Node 检查进程，继承了专属于 Web 的 HTTP observer preload，出现 `RELEASE_HTTP_OBSERVER_START_FAILED` / exit143。检查当前容器ID、Image ID和 StartedAt未变后，仅对新的一次性检查进程清空 NODE_OPTIONS并设 NAUMI_RELEASE_RUNTIME=0，避免该 CLI 绑定 Web observer端口；未修改在线容器配置/主进程/观察器。失败日志保留于受保护证据目录。

## 8. 真名—花名落地流程

1. 以导出的源账号键为准逐人确认真实姓名；同花名、改名、离职保留明确处理，不推测对应。
2. 公司明确工作流团队及各角色负责人，不照搬源企业岗位级别为新系统权限。
3. 建立稳定来源实例、目标租户及账号绑定，沿用 runtime provision-plan/provision 的预览hash与版本确认。
4. 使用原“成员与团队→人员映射→批量录入资料”录入已确认资料，再通过源行确认绑定真实 Excel 姓名。该目录草案不能直接作为已确认的导入文件。
5. 用真实试点员工的原生登录核对账号/企业/团队、撤权及跨企业拒绝；只有相应角色读取生成记录和账本，员工协作权限不附带经营数据权限。

## 9. 集中验收、回滚及后续门禁

验收覆盖严格配置/URL、匿名重定向与响应限额、密钥不泄漏、真实PG只读强制、企业精确隔离、同名其他企业排除、账号/入口撤销、缺表拒绝、人数限额、实际CLI输出/重复目录拒绝。原有基础12项回归集中复测。最终结果、提交/推送及副本回滚见本轮 VERIFICATION.txt。

没有修改原HTML或本机18482/18494进程、原Excel、真实库 schema、工作流绑定或47配置；没有发布新应用。回滚只对副本删除本模块新增文件并恢复原台账，原业务测试需再次通过；不回灌源库。

下一步：先基于公司确认的试点名单/团队制定配置与映射预览，再按完整运行组合及蓝绿门禁部署鉴权桥接，保持当前在线用户。员工登录、源记录读取/权限、源ID关联、真名映射、完整容量/蓝绿均仍待真实验收。继续实现M12活跃需求变更，完整目标ACTIVE。
