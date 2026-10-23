# G71：Naumi 真实创作与积分日志接入本机原 Demo

## 交付和边界

沿 G70 已保存的56个稳定账号键，读取47的「天地合大健康」来源记录，并在原入口 `http://127.0.0.1:18482/preview.html?v=4` 的「素材与交付 → Naumi 创作记录」展示。不是 /admin 换壳，也没有在47启动企业独立服务或发布代码。

最终来源快照时间：2026-10-23 16:43:28 +08:00。窗口：2026-09-24—2026-10-23，Asia/Shanghai首尾日期包含。

| 类别 | 来源匹配总量 | 本机采集 | 截断 |
|---|---:|---:|---|
| 图片与提示词记录 | 1789 | 1000 | 是 |
| 生成任务 | 1710 | 1000 | 是 |
| 积分流水 | 1141 | 1000 | 是 |

56个已关联账号均在此次有效成员范围内。图片记录中532条有提示词，生成任务中998条有提示词，357条生成任务有精确消费流水证据。没有退款证据的金额保留NULL。三类记录分别分页，不把它们相加当独立业务任务数，也不把已采集账务当全部账务。

本轮真实媒体采集为0。已实现受保护本机媒体端点和点击预览交互，并通过合成图片HTTP/VM测试；页面真实记录明确显示没有可预览图片，不放示例图冒充真实产物。真实生成图片下载、全量或增量日志持续同步、员工原生登录及正式绩效认定仍未完成。

## 来源归属

- G70的source tuple与personId不变，浏览器不再按花名模糊匹配。
- Naumi新版使用 `app_creation_records` 的受理冻结 `scope_kind/tenant_id`；当前目录中有95条明确personal新创作，不能因为当前员工属于企业就计为企业业务。
- 采集器按精确账号、source kind/id、output links、creation assets、原生来源记录及冻结creationScope建立过滤证据。明确个人/其他企业的作品、任务和流水排除；输入参考图不反向改变产物归属。
- 原始输出补写不全时，使用来源表已记录的精确output id，避免个人作品因二级证据缺失被当成无归属历史。删除原任务后仍可用冻结来源ID排除其固定账务引用。
- 无历史归属证据的旧记录只标 `legacy-unconfirmed`；冻结企业证据标 `frozen-tenant`。这批已采集记录均属前者，不自动补写公司归属、不作为绩效。
- 不读取或返回密码、余额、完整请求payload、供应商响应、原始错误和原始媒体URL。

## 最小实现

1. `scripts/lib/enterprise-records-snapshot.mjs`：纯pg接口 `inspectRecords(pool, registry, options)`；单个限时RR READ ONLY事务，结束ROLLBACK，无schema初始化。支持artworks、image/canvas/video任务、ledger；每类独立真实count、limit+1和稳定排序。
2. `scripts/collect-enterprise-records47.py`：读取受保护本机配置及56账号，在当前47 Web元数据定位DB网络和固定镜像；**最终实现不在Web内启动采集Node**。仅独立一次性128MiB/0.25CPU只读容器、最多一个DB连接、只继承DATABASE_URL，不挂业务目录、不开端口、不启动Worker；超时清理本次唯一容器。前后核对Web StartedAt。采集后写本机SHA256封装快照，媒体不下载。
3. `LocalSourceSnapshot`：文件型只读模型，不新建业务表。检查快照hash、登记来源、日期/集合kind/sourceKey/计数和截断一致性。每次读取按本企业、完整source tuple和enabled再次连接person_profiles，人员停用后立即从本机记录/媒体结果移除。
4. `createImportServer`增加GET `/v1/import/source-snapshot?op=context|members|records|media`，沿用既有本机token；外侧走原 `/api/enterprise/imports?action=source-snapshot` 和local-owner cookie，保留Host/Origin/Fetch-Site校验，写方法拒绝。
5. `source-data.js/source-ui.js/source.css`：原亮色页面增加真名/花名、快照时间、采集/截断提示、归属标签、金额分列、Blob大图。刷新仅重新读取当前快照，不代表实时重新访问47；无localStorage敏感内容落盘。
6. 本机PG映射端口重启变化：serve时从配置所指容器读取当前loopback映射，不改数据库、不泄露密码。配置仅增加快照路径。

后端配置：`data/enterprise-sheet-workspace/connection.json` 的 `sourceSnapshotFile` 指向私有最终快照。该文件含连接秘密，不提交Git。所有真实提示词/账号数据只存在忽略的受保护输出目录。

## 账务口径

实扣只认同账号明确consume流水（billing.ledger_id或原固定任务流水ID）；cost和冻结报价只做预估。imagegen父任务从冻结plan读取prompt/totalCredits，不把父任务技术cost=0冒充免费。退款需要精确review、实际正向流水及refund批次证据，不用review申请金额冒充退款已入账。旧grant类型但有refund批次的事件仍归类退款。管理员调整与消费分开。

账务不按“每图单价×图数”估算；任务实扣、流水delta与预占金额不重复相加。部分采集不展示虚假的全量公司积分总额。

## 集中验证

- 旧入口基线：`INVALID_ACTION`，没有本机快照显示。
- 真实PostgreSQL14组检查：冻结个人/其他企业排除、直接receipt与asset证据、输入引用忽略、删除视频后的私人流水排除、实扣6/预估9/退款2、缺失实扣NULL、截断及停用成员。
- 本机HTTP24组检查：原产品session、无会话/跨域/跨企业/外部成员拒绝、媒体hash、精确personId、撤权、错误日期/集合/来源/计数拒绝、权限0写入。
- 前端104组VM/合同检查：旧端点兼容、仅缺快照503回退、401/403不降级、identity/epoch变化、迟到响应清理、退款NULL与0、Blob点击/回收。
- 独立无头浏览器11组真实页面检查：原18482、3000条已采集集合、25条分页、人员筛选、真名花名、提示词、积分三列、390px、pageerror0、localStorage保持。T3 snapshot连续两次原错误为 `Preview automation snapshot timed out after 15000ms.`，按仓库既有工作流切独立Playwright，不连接日常Chrome/CDP。
- TypeScript、原Demo完整build、release-check通过。独立完整代码副本实际回滚14个代码/生成文件并重跑HTTP基线；正式工作树保留新版。
- 本机58人员/56来源账号/676字段/677关系/364源行/292附件，以及audit=5/commands=5/账号团队身份订单均与G70精确一致。

## 实际运行偏差与处理（不得省略）

早期图片采集尝试在正在运行的Web容器内执行临时Node/sharp。第一次缺运行时aws4fetch包而失败，随后打包尝试以137退出；Docker同刻记录2026-10-23 16:24:04 OOM、16:24:05 Web die(137)、16:24:06 start。同一个Web容器的StartedAt发生变化，故**不能声称本轮线上运行全程未受影响**，也不能凭并发其他运维事件确定唯一OOM责任。没有执行发布、主动stop/restart、业务源写入、收费重试或退款。

已停止/删除该媒体采集实现；真实媒体0，保留事件证据和失败日志。最终采集器改为独立限额只读容器并实际成功取得新快照，其前后Web StartedAt一致。公开 `/api/health` 后续HTTP200且db.ok=true。后续媒体工作必须独立进程做资源门禁与限额，不再进在线Web做图片解码。

## 证据与后续

`E:/Workspace/naumi/output/enterprise-source-records-g71-20261023/`：最终快照在 `live-final/`，验收记录、四个真实页面截图、`MODIFIED_FILE.mjs`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行`ROLLBACK.sh`及14文件原哈希清单保留。回滚只作用隔离代码副本；撤销本机接入可恢复受保护原配置，不回灌DB，不删除原表/人员对应。

Git开工基线36e53f9c，开工/收尾已刷新origin/main，未改共享根目录。G70/G71是两个功能模块；本轮刷新后远端无新待合提交，未合main或部署47。本模块只完成日志接入阶段；下步是独立、限额的真实媒体采集和明确选取来源记录关联业务任务，之后才做人效指标。
