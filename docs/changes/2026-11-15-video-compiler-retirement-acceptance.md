# 47旧槽退役与新版集中验收

## 模块与职责

用户明确“退役即可，然后对新版进行全链路测试，确保没问题”。本轮只处理47旧程序退役和当前固定19d/1794718498程序验收，不发布另一版、不变更模型155/计费8，不接入103隔离实验线。

公开接口、依赖、状态归属保持：Canvas草稿/输入由节点模块保存，视频输入Resolver和Profile编译器拥有最终编译规则，任务/Worker拥有冻结执行，资产和计费保留各自事务与幂等。退役由持三站点锁和lifecycle锁的运维事务按确切容器ID实施；未更改产品代码或删除校验迎合测试。

## 实际退役

- 北京时间2026-11-15 20:41:55，旧Worker `6bf08f70e59e…`、旧Web `358aa9e71205…` 都通过SIGTERM正常退出，exit0，非OOM，未升级SIGKILL，自启no；容器/镜像/兼容回退材料保留。
- 退役前旧HTTP0、agentRuns0、Worker暂停且activeTicks/未知tick0，Nginx与新内部origin无旧槽引用。用户授权结束旧后台进程，不能称原Promise自然归零。
- 原8条UNKNOWN逐项一致，旧媒体活动原行未修改，付费任务重放0、DB恢复0。canonical从2283按CAS到2287，保存授权INTENT/逐槽停止ACK/新服务复核。
- 原4957771B待补传媒体在退役前就已缺少本地原文件，remote_ready=false。本轮未称找回，未通过删除记录或更改状态清债。诊断驱动23误用localOriginalVerified常量的回执明确由24真实文件检查更正；原失败保留。
- 标准生命周期仍CLEANUP_PENDING：物理退役已完成，历史不确定性未被伪造成自然排空COMPLETE，成功发布计数不据此擅自增加。

## 实际47集中测试

1. 112项矩阵：19个文生正例、21单图、15首尾帧、11双普通图、21报价及鉴权/畸形字段/重复身份/伪造媒体/digest/零业务副作用。双普通图最初是同资产不同槽位，未冒称两个独立源图。验收器最初要求两个专用图生/参考图绑定也文生200，留下110/112原失败；26定向复测确认text应为INPUT_INTENT_NOT_MAPPABLE422、单图200，更正112/112，无产品修改。
2. 14项补充：两专用绑定正负控、原始图片HTTP字节哈希；真实Canvas根节点/同项目下游节点、重复operationId、切模型/恢复/保存刷新时提示词/参数/引用保留、stale revision409及当前项目单图预览。新增2个隔离QA节点。
3. 25项素材链路：真实上传图片/视频/音频→重复操作幂等→HTTP读回原字节哈希→原生解码→所属资产登记→幂等与冲突409→单图/视频/混合媒体编译。新增3个QA资产，原件是本地合成测试媒体，不冒充上游成片。
4. 上述期间QA任务0→0、账本2→2、预占0→0、计费操作2→2；生成提交和付费调用0。原失败、权限规则及旧数据保持。

## 同固定生产包的隔离全链路

本轮重新运行实际线上同一镜像 `sha256:0a94c8b8a6400ef44fe9c27ad4ee85fd658c92907d97d1358c31b05caf3ec5af`，不重建。完整Next/独立Worker/原生媒体/隔离PG及真实生产UI，INGRESS_UI、ADVANCED、BROWSER均exit0。

覆盖：主流程15、Agent6、预算10、RunningHub/AutoDL10、Workflow13、BYOC入口21/执行8、未来结构Workflow16、高级输入36、生产UI43。各模块有包含关系，不汇总为互斥用例数。重启后原回执恢复、UNKNOWN零重投、冻结配置与账务、成片资产/下游、草稿和模型切换均有实际本地应用证据；上游是隔离fixture，不是付费供应商证据。临时子进程/随机schema/浏览器均按各自日志清理。

验证命令：

```text
python run-step.py 24-authorized-retirement.py
python run-step.py 25c-live-acceptance.py  # 原两项错误期待保留，exit1
python run-step.py 26b-live-canvas.py     # 14/14；定向确认前矩阵112/112
python run27.py                          # 25/25实际素材链路
python run-local-acceptance.py           # 三分组exit0；隔离fixture上游
python run-step.py 28-final-postflight.py
```

命令工作目录与完整literal output/exit见本机证据根 `E:/Workspace/naumi/output/release47-video-compiler-20261115`，服务器同名release的私有证据根 `/opt/naumi-staging/evidence/release47-video-compiler-20261115-r1`；最终报告和副本四件套在本机 `retirement-e2e/`，脚本只恢复独立描述符副本，不是生产程序回退。所有复制的现场回执按原字节SHA重开核对。

## 最终复核与尚未完成

21:52:48北京：公网版本/health200，source19d/1794718498，新Web UNKNOWN0/Worker未知tick0，systemd实际恢复服务Result=success/ExecMainStatus0，旧双槽均停止且restart=no，四锁释放。

- 新3份上传在共享本地持久盘有原字节且SHA匹配；最终NAS remote_ready仍false，因此不冒称NAS补传完成。
- 历史缺失媒体原件和UNKNOWN证据未闭环；没有借退役动作删改事故。
- 真实供应商受理→成片→资产→账务→下游再次生成仍待测试预算确认。已取得站内每次20积分报价，建议总上限40积分/两次，现有验收账号和独立QA节点已就绪；付费0，不标整个架构目标完成。

下一步：确认预算后只提交两个全新幂等操作，遇UNKNOWN保留原任务并只查原回执；核验两条任务/作品/节点结果与各一笔账务及真实供应商成片，再单列完成范围。NAS补传确认和历史事故继续保留独立状态。
