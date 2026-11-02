# 47 主线蓝绿发布完成（2026-11-02）

## 固定运行版本与状态

- 本次用户授权：上线一版服务器；沿本线程大陆47站执行，103隔离实验线不参与。
- 正式状态：`COMPLETE`；北京时间12:23:24完成网关切流，12:28完成监督服务验收，12:30重新封存精确新实例观测并验证三锁已释放。
- 运行commit：`8a893c00bdee44c58814f9053af7e377b0eee1ce`。
- BUILD_VERSION：`1793592214`。
- 镜像：`naumi:release47-main-1793592214-8a893c00`；Image ID `sha256:dc781b7f444304970abfa89dd0b7190336539ccb51abdf59ad31232c50838a51`。
- Web/Worker：`naumi47-web-main-20261102-r1`、`naumi47-worker-main-20261102-r1`，同镜像；Web内部origin指自身，Worker精确指新Web。
- 旧main-20261101 Web/Worker按Worker→Web次序排空停止，exit0、restart=no；不是先停旧站再构建。

## 本轮已上线内容

1. 画布图片原始像素尺寸显示。
2. 工具冻结报价身份/质量、原任务回执恢复、文字结果校验及相应交互修复。
3. 用户用量历史父子关系物化查询、同范围刷新保留结果、筛选切换/过期响应/读取期限与失权清除。
4. 与候选实际版号绑定的公开画布工具更新说明。

专用超分仍按用户要求暂缓；没有宣称补上未配置能力。重构和103模型映射实验线未合入。

## 真实验收

- 固定Linux构建137.67秒，exit0；无网络smoke验证页面及37个构建资源、Worker语法、媒体运行时、当前公告通过；镜像gzip归档完整重开校验通过。
- 新槽登录、DB、画布、企业资料、历史作品和用户用量HTTP通过；候选30天用量完整请求2.241秒。
- 公网跨切流连续探测495次，错误0，明确观察到旧/新两个commit。
- 真实浏览器15检查点通过、pageerror0；30天统计1502.165ms、同条件刷新1452.739ms、7天397.714ms。浏览器拦截52个非GET方法（主要报价POST），结果`PASS_READONLY_WITH_BLOCKS`，不称真实收费生成或完整工具提交验收。
- 旧+新静态union共4879资源，精确旧alias保持；forward/cutback完整nginx closure真实语法检查通过，切流采用原字节/closure CAS。
- 实际NAS上传、原图/两种变体、下载、Range206、匿名401、延迟上传队列通过；测试数据已清理，供应商调用0。
- 全20张业务表92214个原行SHA完全一致，无缺失/改变/schema变化；3879条历史UNKNOWN原行摘要保持。全行指纹不推断付费结果。
- 精确新实例最终观测：19个completed tick、worker paused=false、media draining=false、新Worker unknown0、新Web unknown0、pending图片0、长idle事务0、锁等待0。
- 新manifest、journalDir、当前运行指针和systemd ExecStart重绑；实际service输出`RECOVERY_SUPERVISOR=PASS WEB_OPEN=YES WORKER=RUNNING`，exit0，timer active/enabled。未注入crash，不称crash恢复测试通过。
- 三锁从现场基线/备份到切流及验收全程持有；实际service运行在父锁释放后，最终重新取得三锁登记COMPLETE并再次释放。

## 保全及执行记录中的异常

- 当前任务图采集器受20,000 selected rows预算约束，实际27,340超限；保留该incomplete失败记录，未提高预算或冒充通过。后续采用已验收的独立完整业务行指纹采集器，两个真实RR快照均complete并逐原行相同；历史观测另行保存，不清UNKNOWN。
- 发布备份1,193,522,131字节，pg_restore --list通过；未恢复数据库。
- 磁盘约87%时先盘点，保留所有业务媒体、数据库、7天内备份与回滚镜像。对静态资源按完整字节hash合并重复inode，82,937个路径继续存在且字节不变，逻辑重复字节减少990,997,266；历史mtime合并到优先当前union的canonical副本，旧URL未删除。新镜像/备份落盘后实际剩余约7.7GiB，本轮薄事务登记5GiB保留＋2GiB后续增长预算；此值不是normal-controller原10GiB储备门槛，不概括成所有默认门禁已通过。
- 释放本次诊断进程已落盘的大对象后，实测MemAvailable4636MiB通过原4608MiB双槽预算；没有把swap当RAM或调低候选预算。
- 初次postflight SQL误保留旧实例名称，2964是旧Worker计数；随后按实际新Web/Worker身份重新读取为19，并保留初始回执和修正原因。canonical及最终FINAL_ACCEPTANCE均为修正结果，不使用旧计数冒充新Worker证明。
- 初次本地制品存在13文件的CRLF字节差异；保留attempt1，最终从固定Git blob校验并重新封存，不与镜像源字节混写。

## 证据与回退

- 本地：`E:/Workspace/naumi/output/release47-main-20261102-r1/`。
- 远端：`/opt/naumi-staging/evidence/release47-main-20261102-r1/`。
- FINAL_ACCEPTANCE.json、FINAL_LOCKS_RELEASED.json、CONTINUITY_SUMMARY.json、browser/run-r1/LIVE_READONLY_UI.json、backup-readable.json与逐操作原始回执保留。
- 网关forward及保留新旧union的cutback closure已准备/语法检查；本轮未为演练再把真实入口切回旧版。回切只恢复兼容入口/程序，不回灌DB、不重放任务。
- 固定运行版本源增量四制品：MODIFIED_FILE.zip、DIFF_FILE.patch、VERIFICATION.txt、ROLLBACK.sh；副本回滚和patch replay的精确执行证据见VERIFICATION。
- 顶层历史`MIGRATED_CLEANUP_PENDING`与前任历史保持；COMPLETE属于本轮`reconciledMainReleases`记录，不冒充全部历史债务已消失。
