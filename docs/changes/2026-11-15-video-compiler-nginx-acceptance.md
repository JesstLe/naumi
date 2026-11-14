# 视频编译架构：双固定包、真实 Nginx 切流与兼容回滚

## 模块与职责

本片只扩展现有本地发布验收器；产品编译、模型配置、协议、报价和数据库结构没有改动。入口 `verify_release_direct_worker.py --tasks --prior-image … --nginx-image …` 编排本地私有网络中的固定完整 Web、真实独立应用/原生媒体 Worker、PostgreSQL 和官方 Nginx。新增 `video_release_gateway_fixture.py` 是夹具适配，不是另建发布器。

## 公共接口、依赖方向、数据与事务归属

- 实际调用原 `release47_controls.clone_worker/start_worker/control_app/switch_gateway_bundle`、`worker_handoff`、`release_client_compat` 和 `release47_video_profile_guard`。只有 Docker 命令传输与 Nginx 文件系统根映射到夹具；CAS、原子配置替换、语法校验、完整 dump 哈希、reload 和格式执法仍由原所有者负责。
- 新 helper 接受窄适配接口，不被产品或发布控制器导入；不增加运行环境变量、数据库表或新能力许可。
- 旧新槽共享同一隔离 schema 和媒体挂载；任务状态、冻结计划、租约、资产与账务仍由产品维护。回滚只恢复程序与入口，不回灌数据库或媒体，不重放 UNKNOWN。
- Docker socket 只进入验收 driver，不进入产品 Web/Worker。所有容器、网络与 schema 以随机前缀隔离，结束后清理；没有站点连接或付费供应商。

## 固定包与来源

| 项目 | 旧包 | 新包 |
|---|---|---|
| main源码 | `7ce2f72926af56714b5d7ab1b40eb76cf6ee8faf` | `526148e829bd72423c157187c0b268d20519d1a3` |
| build | `1794692423` | `1794693854` |
| Image ID | `sha256:ac0aadbee385cbad48fc71159e7a834b8f2f88aa73f4c7c59f1351baedfd800c` | `sha256:07e41a45b94fcad9fce735caa6f7b0cd094f40e01a4ce09308bdd47e841644ba` |

两个包来自不同固定 main 和完整构建，非 proof overlay；这两个提交之间产品运行源码相同，仅验收器/文档增量，因此不能据此泛称跨任意应用协议版本兼容。新包577项tracked Worker输入匹配归档；Worker bundle `ebd923c898b6de94e8edf09e8d1623cbaa8a42f604b223b8365f954f78036352` 与旧包一致。完整构建、Linux Worker49项、standalone包7项/50HTTP/46JS-CSS通过，exit0。

真实 Nginx `1.28-alpine` 固定镜像 `sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236`，仅私有网络，无宿主机公开端口。

## 本次实现与集中验收

最终源运行与独立解包副本结果以四产物及各 `RESULT.json` 为准；最终源运行55项通过，涵盖：

1. 原普通/combined Worker 创建、控制、隔离、pause/resume/drain/停启验证保留。
2. 从真实旧新包采集静态资源，复用原静态并集所有者；全部645份旧资源在旧→新→旧三个阶段均经真实 Nginx HTTP读回并逐个核对SHA。
3. 旧入口预览/提交，旧Worker第一次上游创建后排空，新入口平滑切流，新Worker停启后查询原回执，原7积分/型号/素材/requested4K→effective2K→wire2k不漂移。
4. 成片进入下一Canvas任务，使用新发布型号/17积分并保持父子资产；实际鉴权读回成片SHA一致。
5. UNKNOWN显式重试409，重启与回滚后保持原状态，无重复上游创建或账务。
6. 正反切流各验证陈旧完整网关CAS拒绝、错误Nginx语法拒绝并精确恢复原文件；各60次并发HTTP请求全部200且仅返回已知版本；Nginx PID1启动时间保持，reload而非重启。
7. 旧槽停止后通过实际固定镜像只读探针读取plan1–5格式；原格式守卫读取新鲜持久任务后允许兼容回滚。
8. 回滚后历史/UNKNOWN和账务/资产不回退；旧包继续接受并完成一项新操作。最终4任务、3笔video账本、41 fixture积分，4次本地供应商POST（含一次UNKNOWN），外部付费0。
9. 7个自有槽、随机schema、网络全部清理。第一轮47项结果保留；最终增添负控/并发观测后55项通过，不擦除历史。

集中回归：controls27、direct23、静态兼容16（其中1项因未提供真实站点配置捕获而跳过；本片真实Nginx是独立夹具，不替代该站点配置验收）、格式守卫23、核心137及完整tsc通过。准确命令/原始输出/退出码见 `VERIFICATION.txt`。

## 未完成与下一步

- 本片运行真实组件所有者，不是整站 lifecycle/controller CLI 验收，不是103/47部署。
- HTTP资源/版本连续通过不代表旧浏览器React水合、RSC会话或零刷新连续性；TLS、公网路径亦未验证。
- 所有生产启用绑定/环境路径迁移审计、授权真实上游成片、完整站点蓝绿仍开放。
- A19增加固定包本地切流/回滚证据，不将A19或总目标标完成。继续按完整P0–P4/A01–A19推进；47 HOLD、生产配置迁移0、站点操作0、付费0、部署0。

证据根：`E:/Workspace/naumi/output/video-compiler-nginx-acceptance-20261115`。四产物 `MODIFIED_FILE.zip`、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh` 保存基线526148e8及四路径哈希；独立副本验收与副本代码回滚、主线集成分别记录，不回滚运行中的业务数据。
