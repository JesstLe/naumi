# 企业历史查询连接池与行锁互等修复

## 事故与定位

2026-10-29 47站切流到main43d46949后，实际健康/画布请求超时。数据库真实证据：后台历史读取持有企业授权范围的 `app_users FOR SHARE` 等共享锁，查询完成后停在idle in transaction；同池其他连接等待用户钱包/余额的 `FOR UPDATE`。后台 `queryBi` 在仍持有调用方事务时执行 `getPool().query(MODEL_CALL_EVIDENCE_SQL)`，第二次借连接等待池归还。现有pool max=5使这组请求形成应用层循环等待。09:00、09:40 Worker约3秒503且无受理回执与连接获取超时相符，但09:00无锁图，不能把后次根因反推为前次已证实原因。

本轮09:43仅对一个已核验的长期后台读取backend执行精确终止，未改业务行或重投任务；随后页面恢复。09:45外部操作又重启Worker，用户确认由GLM继续现场处理，要求本线程不再切换。

## 模块与职责

- `bi/repository.ts`：接到授权事务时，计数、分页、模型回执只使用同一个 `access.client`；非授权事务调用保留原getPool路径。不改查询语义、成员范围和敏感字段脱敏。
- `enterprise/creation-history.ts`：进入企业授权事务前初始化BI schema，避免在已持有授权锁的事务里再去池中排队初始化。
- `saas/legacy-creations.ts`：受授权详情复用已初始化的事务，不再嵌套调用schema初始化。
- 公共接口 `queryBi(query,{client,allowedEmails})` 保持不变；调用方负责在事务开始前ensureBiSchema。enterpriseArtworks原本即遵守，本次补齐history/list/detail/media路径。
- 数据/事务归属不变：企业模块持有一致性授权快照，BI模块只借其client读取；不拆事务、不放宽账号/撤权检查，不提高并发上限或修改报价。

## 集中验证

`node --import tsx --conditions react-server scripts/verify-bi-scoped-pool.ts baseline|modified`

隔离真实PostgreSQL；实际5连接池；一个授权事务持用户FOR SHARE，另外4个事务等待该用户FOR UPDATE。执行实际repository SQL，仅基础设施getPool绑定到同一隔离池。

- 原版：`completedWhileAllFiveClientsHeld=false`、`poolWaiters=1`，确实互等；仅fixture精确取消一个等待SQL后释放连接才能结束。
- 修正版：`completedWhileAllFiveClientsHeld=true`、`poolWaiters=0`，池全占用时仍用原client完成；无扩大池、无跳过权限。7项检查包括数据隔离、全局管理section拒绝、最终全部连接归还。
- `verify-enterprise-artworks.ts`：真实PG图片数据/CSV/分页/回收/历史全部日期/状态筛选/详情/媒体/健康/双管理员/跨企业/撤权全通过，supplier_calls=0。
- `verify-saas-enterprise.ts`：身份、子树、CAS、撤权、账务与全局账户保持通过。
- 类型检查、hash-guarded副本回滚及Git合并结果在收尾追加。

## 边界与后续

- 这是本地修复；用户明确“GLM仍在处理，先别切换”，本线程不构建/投放第二候选、不触碰运行容器或服务器业务数据。
- 首轮发布仍 `CLEANUP_PENDING`，原UNKNOWN与异常证据保留；本地PASS不替代生产验收。后续由同站唯一负责人基于固定main提交协调发布，重新验收后台并发读取＋生成结算、Worker真实completed回执、NAS与任务保留。
- 未将连接池调大作为修复，也未对所有事务机械加新框架。仍保留独立的长事务/连接池等待可观测性改进需求。
