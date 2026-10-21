# 管理后台操作记录性能与统一47发布

## 目标与边界
- 本轮用户要求优化用户操作记录查询、整合所有开发分支并上线47。
- 独立 worktree `E:/Workspace/naumi-bi-performance-release47-20261021`，起点 `888f5e2f`。共享目录18个未提交文件原样保留。
- 排除历史 baseline/backup/rollback 分支；生产配置、历史账务和任务不重写，不重放供应商请求。

## 性能模块
- 47旧SQL仅取30条，却先展开约7800条任务JSON、相关账务子查询，再排序；用户范围还扫描11张历史表约6万行。只读 `EXPLAIN ANALYZE` 5764.141 ms。
- 改为先筛选轻量主键、稳定分页，再加载页内任务详情/计费；按记录直接筛选用户及账户元数据，保留孤立历史账号和企业授权范围。
- 模型调用证据改为只展开当前页任务的付费操作键，再精确关联调用记录，去掉按用户调用历史反复解析任务JSON。
- 不新增Redis、不缩短日期范围、不删操作记录、不修改计费/模型配置。
- 47新SQL只读执行111.853 ms（未切流时验证实际SQL，非已部署API性能）。
- 隔离PG：8000任务+8000调用，15组合前后逐字段一致。默认首屏1443→15 ms；单用户1213→16 ms；企业1479→18 ms；状态review 2206→881 ms。数据分布/缓存不同，不将本机数字冒充线上完整接口耗时。
- private BI、管理操作、模型证据链通过；供应商实际调用0。

## 整合和最终上线
- 已普通合入 c7f051a7（失败解锁与删除旧排队/待核查UI流程）、e016609a（只读诊断文档）。固定盘点351个本地/远端引用已包含，7个历史baseline/backup/rollback引用排除；18个共享未提交文件未动。
- Linux完整Next15生产build（90页）、tsc、BI/管理操作/模型证据/企业授权PG、画布失败反馈/重试/手动布局/参考图/实际生成handler容量计费回归通过；外部供应商生成0。
- 47最终事务 `release47-bi-performance-20261021-r2` 于2026-10-21 12:58:18北京时间 COMPLETE，三锁释放；固定程序source `5161ab0fc6898dc341f91ae77c4338244dcaadcc` / build `1792556298`，Web/Worker同image `dc5db8d21feb99b75d270a1aa3165fada72e1d099c2b9f78cbf69bd369e675cd`。
- Web `naumi47-web-bi-20261021-r2` / 13107；Worker同后缀直连。旧NAS Web/Worker排空停止restart=no，首次失败候选也按精确身份排空停止；保留镜像/回滚资源，7容器运行。
- 最终公网业务任务查询3轮227/178/210ms，全部返回30行/总数7803；单用户筛选222ms、第二页413ms（前候选验收），错误筛选3205ms，不承诺所有条件同速。
- 原浏览器画布跨切流和实际自动切回保持打开，旧资源3项SHA不变，文字内容不丢；同一测试节点跨版本保存/读回通过并已删除。1821次health/version/session真实浏览器采样全200，pageerror0，先前QA节点原内容保持。
- 任务保全 `preservationVerified=true`，unknownTables/violations空，原供应商绑定不变；模型配置132/账务8及配置hash保持；历史未解付费事件不重放、不改账、不声称恢复。
- 最终回滚 `--check PASS`；首次事务因发布快照超时实际自动切回成功（入口恢复、旧Worker恢复、无DB回灌/任务重放），之后新事务完成发布。

## 发布过程中修复和真实失败记录
- 28条当前boot缩略图 `media-variant` 观察记录在Promise拒绝、事务回退/连接释放后仍标unknown；归档精确原记录后仅把该观察标为failed-promise-settled，无媒体/账务/供应商变更。未把缩略图失败伪称成功。
- 旧发布快照在图关系遍历时反复复制全部历史JSON，15s单语句限制触发自动切回。改为窄字段发现图、选中任务后读取原冻结字段，并避免jsonb_each展开无关大结果；不提高超时或放宽保护比较。真实PG原/新full和proof逐字段一致，含旧快照追踪；21项快照回归、Linux43项运维验收通过。最终切前/后快照48.6/52.6秒总耗时，每条查询仍有限15s。
- 第二事务旁路启动前资源不足，未启动候选/改旧槽；按现场内存为新槽设置1792MiB、Worker128MiB，保留1024MiB主机余量，Node heap1408MiB。旧槽2GiB未改。最终MemAvailable约4.1GiB、Swap0。
- 第一轮本机Host测试因Windows缺os.O_DIRECTORY失败；改用实际Linux隔离镜像43项通过。其他初次fixture/换行与失败记录保留在验收日志，不把所有首次执行写成通过。

## 证据与恢复
- 本地：`C:/Users/13357/.t3/scratch/bi-performance-release47-20261021/`，四产物、原hash、前后PG、实际副本回退、浏览器采样及服务器回执。
- 远端：`/opt/naumi-staging/evidence/bi-performance-release47-20261021-r2`，固定配置、备份、gateway逆向hash、任务保全和PUBLICATION_RECEIPT。
- 程序构建后提交仅运维工具与本记录，src/package/Dockerfile与固定build source无差异。
- 功能迭代计数：性能模块1，开工/整合/构建/切流前已刷新main；不触发公开更新说明（管理内部优化不公开）。
