# 47 主线发布 r2：视频、分镜与协作整合

## 实际结果

- 用户指令：把最新版上线服务器；本次目标为大陆 47.105.59.142，103 未操作。
- 2026-11-02 20:34:12 北京时间完成平滑切流；20:39:07 完成最终验收。
- 实际运行 main：`806603fd12213543dd8f7122d822fd4d51c4b417`；build：`1793620641`。
- 实际 Web/Worker Image ID：`sha256:c82ccfec295800f90922c9d948b5bba627fa31f6eb154c30f27d34b1611ddaab`。OCI config digest 为 `sha256:345541c4154c60d5cfc54314e92efab8e912037088c073108999893639f88118`；归档已逐项核对 index/config/版本对应关系，不混用二者。
- Web：`naumi47-web-main-20261102-r2`，回环端口 13129；Worker：`naumi47-worker-main-20261102-r2`。
- 本轮 `reconciledMainReleases.release47-main-20261102-r2.phase=COMPLETE`，canonical revision 1471。历史根 `MIGRATED_CLEANUP_PENDING` 及前任记录保持原值。
- 当前只运行一个主 Web＋同版独立 Worker。旧 r1 Worker 先于旧 Web 正常退出，两者 exit 0、restart=no，未强杀。
- 三锁已释放，并独立重新取得/释放验证 `locksFree=3`。

## 本轮功能和归属

相对线上 `8a893c00bdee44c58814f9053af7e377b0eee1ce`，固定候选共193个变更文件：

1. 企业协作、消息、私有附件及授权原生画布分享；模块继续分别拥有身份校验、消息、共享批准和复制规则。
2. 图片/视频节点行内引用、引用上传和图片提示词持久化。
3. 视频五模式、多模态引用、原生分镜及保声合成；复用原任务、冻结参数、计费和媒体模块。
4. 对应验证与文档；本次公开公告只写视频/分镜用户可见更新，未加入协作、行内引用条目。

模型映射103实验线及 whole-project core-refactor未合入本候选。本次没有自动修改供应商地址、密钥、默认通道、价格或历史任务参数；配置版本保持152，模型/计费配置hash前后一致。新视频能力仍取决于实际发布的能力配置，不将代码发布描述为所有线上模型已升级能力。

## 执行与验证

### 构建与候选

- 固定 Git 源码归档构建 Linux 镜像，build exit 0；无网络 smoke 通过40份静态资源、版本、公开公告、Worker语法和媒体运行时检查。
- 旧槽继续服务时新增唯一候选 Web/Worker；Web draining、Worker paused启动。
- 内存预算保持 Web2560＋Worker1024＋主机1024＝4608 MiB，未降低门槛。一次读数4570未启动；后续真实读数满足才创建/启动。
- 新候选登录、项目、画布、后台、企业、用量与作品等10项HTTP全部200。
- 新协作 bootstrap、授权分享列表、视频workflow和catalog串行GET预热/读验收通过；新旧内部origin均精确核对。

### 兼容 DDL 与数据保全

- 新增16张协作/分享/图片提示词表，工作流增加 `assembly_state`、`assembly_quote`及索引；未删列、改类型或回灌数据库。
- 原有工作流15列原样保留，原workflow表实测0行。原始严格比较器仍报告这张表schema变化，未把比较器的false改成true；另存精确两列新增、原列不变、原投影不变和旧Web健康的兼容证据。
- Schema预热之后固定完整业务基线，发布后再次读取20张表、95,246行，原行缺失0、变化0，比较通过。预热前后除上述精确schema扩展外原业务行亦保持。
- 3,879条历史UNKNOWN原始行摘要保持不变；未伪造完成、重放收费任务或清历史锁。

### 切流与运行验收

- 新旧静态union包含5,257项，旧精确alias保持；候选与回切完整Nginx closure语法校验通过。
- 旧Worker停止领取且媒体排空后开放新Web，再平滑reload；旧Web排空通过两次独立采样后，先停旧Worker再停旧Web。
- 显式resume新Worker及媒体；最终16条completed tick，unknown tick0，当前新Web unknown0，pending image0，长idle事务0，锁等待0（均为20:39验收时观测）。
- 新监督manifest绑定本轮Web/Worker、版本、image、gateway与独立journal；真实systemd service输出 `RECOVERY_SUPERVISOR=PASS WEB_OPEN=YES WORKER=IDLE`，exit0，timer active/enabled。
- 公网切前/切中/切后120秒510次探测，错误0，实际覆盖新旧commit。
- 真实部署浏览器15项PASS＋协作入口/成员/申请/收起4项PASS，页面错误0。浏览器所有写方法和任务poll被拦截，不把读验收称为线上完整CRUD或收费生成验收。
- 协作SSE候选直连和真实公网均收到首包及15秒heartbeat。公网18秒探测主动超时结束，curl exit28为预设结束方式，应用首包/心跳通过。SSE会执行presence/event维护，未称数据库零写。
- 实际图片上传、HTTP/NAS回读、下载、Range206、匿名401与延迟补传队列验证通过；专用验收数据已清理，supplier调用0。

## 空间与备份

- 发布前磁盘95%、剩余约4.2GB，未删除用户媒体、待补传文件、volume或数据库。
- 七份历史备份合计8,843,562,300字节归档到本机独立ACL保护目录，每份完整SHA、大小及实际 `pg_restore --list` 通过后，服务器CAS移除重复副本并保留原位置归档索引；不是销毁历史备份。
- 当前前任r1备份和本轮r2备份仍留在服务器。本轮dump为1,213,043,596字节，SHA256 `27aa05bbcc340aee6dad4fced76861ac1d07dae6a260ca7eaf7c37ac13fdcb53`，目录读取通过，未执行restore。
- 归档完成可用11,538,894,848字节；镜像导入后10,954,481,664字节。后续业务写入会变化。
- deferred media补传成功不自动删除本地副本，媒体长期回收另需精确远端字节验证与并发写保护；本轮未借发布清用户图片。

## 回滚与证据

- 生产保留旧程序、配置、备份及旧upstream＋新旧静态union的回切closure。未在生产切回，也未恢复DB/媒体。
- 本地无`.git`副本：baseline4,611文件，modified4,758文件；later-edit测试exit73且全副本零写；真实rollback exit0，46原文件恢复、147新文件删除，完整字节回到baseline。修改副本保持候选。
- 独立副本真实 `git apply --binary --check`/`git apply --binary` exit0；补丁一条原始尾空行警告保留，未改候选字节。
- 四制品已实际创建并重开；ZIP CRC通过，ROLLBACK.sh可执行及bash语法通过。

本机证据：`E:/Workspace/naumi/output/release47-main-20261102-r2/`。
远端证据：`/opt/naumi-staging/evidence/release47-main-20261102-r2/`。
四制品：`artifact-tools/artifacts/{MODIFIED_FILE.zip,DIFF_FILE.patch,VERIFICATION.txt,ROLLBACK.sh}`。

关键结果：`POSTFLIGHT.json`、`live-evidence/FINAL_ACCEPTANCE.json`、`live-evidence/FINAL_LOCKS_RELEASED.json`、`CONTINUITY_SUMMARY.json`、`PUBLIC_FEATURE_ACCEPTANCE.json`、`browser/first-run/LIVE_READONLY_UI.json`、`browser/COLLABORATION_UI.json`、`artifact-tools/COPY_VERIFICATION.json`。

## 尚未扩大的结论

- 本轮没有线上收费生成、跨切流真实Agent长会话、Worker故障注入或真实生产回切测试；相应本地模块证据与此次部署/读验收分别登记。
- 不代表历史UNKNOWN业务结果已确认，也不代表10万活跃容量已验证。
- 本文是发布后证据记录；后续文档提交不改变实际运行commit `806603fd`。
