# Router 容量回调私网兼容入口

## 范围与状态

本模块修复 Router 仍引用已退役 Web 的 `127.0.0.1:13052` 容量回调入口。只增加一个 loopback Nginx exact location，将 `/api/internal/model-capacity` 转给当前 R1 Web `127.0.0.1:13114`，其他路径 404。Authorization 原样透传。应用源码固定 `5b8489d9ec989ea803eb37280c65e2f18529babb` / `1792705393`，不构建新镜像、不新增 Web、不重启 Router/Web/Worker，不新增公开更新说明。

本地实现和集中fixture验证完成；根任务已在47按以下门禁实际完成，状态COMPLETE。应用程序和公开版号保持原SaaS R1。本机mock upstream与线上安全协议探测分别记录，不冒称实际付费生成或租约写入验收。

## 门禁与故障边界

- 固定 47、R1 COMPLETE、revision 728、应用/镜像/容器身份、启动时间、2GiB Web / 1GiB Worker、模型 135 / 计费 8。保留 active R1、历史事件、原两旧槽 stopped/restart=no。
- HostTransaction 全程三锁；原 canonical 同路径 raw bytes CAS，同时保留 normal.begin 的 logical digest 约定。原始文件备份 SHA 与逻辑状态 SHA 分列记录。
- 固定 Router PID / startTicks / cmdline hash；实际网络 namespace 必须等于当前宿主。仅在内存比较 Router 与 Web 现管理 token，不输出 token。
- 原 05 八表必须先匹配不可变原 baseline，才独占建立补充 baseline；原任务、账务及 UNKNOWN 不重采样、不退款、不重投、不清理。
- 完整 nginx dump/源文件闭包 CAS；只允许新建固定 `naumi47-model-capacity-current.conf`。先独立 13952 Nginx 验证，再语法检查和平滑 reload。仅按自己 PID/startTicks/exe/config 优雅退出旁路进程。
- journal kind 为 `private-router-capacity-binding`，retired 为空、newWebInstances=0，固定 commit/buildVersion 表示所作用的既有程序。每项操作有独立 UUID、先 INTENT 后 ACK；任何不确定保留 UNKNOWN / RECOVERY_REQUIRED，现有 normal.begin 阻断下一发布。不会回切旧业务、删除可能生效入口或复活旧 Web。
- 原子写 rename 已生效、目录 fsync 却失败时，只有磁盘严格等于本次完整预期 bytes 才更新本进程 CAS，再由异常路径持久化 RECOVERY_REQUIRED；陌生并发值绝不覆盖。
- 按实际两个 reference-workbench 公网 server 生成新的受控维护闭包并真实 `nginx -t`，保留内部 13052。备份原受管 manifest，更新同路径 gateway digest；runtimeRecovery 保存新 manifest **逻辑** SHA、新维护 report 路径/hash 及 supersedes。旧历史 report 不改。既有 Supervisor.once 只读检查，无 start/control/journal 写入，不安装新 timer。
- COMPLETE 回执包含总操作 UUID、各步骤 UUID、revision、canonical 文件 SHA、精确回调配置 SHA、维护 report SHA；不包含 token、邮箱或业务内容。

## 配置与统一入口

使用 `bash scripts/deploy-release.sh --lifecycle bind47-capacity --config <reviewed-private-config.json>`。缺 config、Windows 执行、`--apply` / `--review` 均拒绝。入口分发由根任务维护。

配置键：`target`、`releaseId`、`evidenceRoot`、`date`、`expectedRevision`、`expectedCanonicalDigest`（`sha(encoded(state))`）、`expectedCanonicalFileSha256`（磁盘原始 bytes）、`operatorSource`（本运维代码提交）、`routerStartTicks`、`routerCmdlineSha256`、`preservedUnknown`。其中 preservedUnknown 仅接受既定 `baselinePath`、原 SHA `512245689fb9884732d6f9f9c7d479ca1481bfe2570b4fa4356fd947b572b041`、`allowedAdditiveColumns={}`；补充文件路径由模块固定。端口、上游、token、manifest 路径均不可通过配置覆盖。

运维源码打包：固定本模块提交后，使用 `git archive --format=tar --output=<ignored-output>/capacity-operator.tar HEAD scripts/ops scripts/deploy-release.sh`；这仅打包运维源码，不修改运行镜像或应用 metadata。

## 集中验证

本机 WSL Ubuntu / Docker：

```sh
cd scripts/ops
NAUMI_LOCAL_CAPACITY_NGINX=1 python3 -m unittest test_release47_capacity_binding -v
```

12 组通过，日志 `output/capacity-binding-local/tests.log`。覆盖 raw/logical CAS 与历史不变、精确配置限制、真实文件 rename 生效后异常、陌生并发不覆盖、原 UUID 不重放、私网 pending/UNKNOWN journal 阻断 normal.begin、维护渲染不覆盖内部 callback、只读 Supervisor、统一入口分发/无效参数。

其中实际 Nginx fixture 使用无外网 `--network none` 网络空间和标准 mock upstream，验证五组真实 HTTP：GET exact 405、匿名 POST `{}` 404、透传 fixture token 的 POST `{}` 400、其他路径 404、尾斜线 404；没有 lease acquire/release、数据库、供应商或生产连接。fixture 容器在 finally 按本次唯一名称清理。生产实际结果另由根任务记录。

同步计数：本次为独立内部维护模块，不新增应用功能模块；不触发应用镜像构建或公开版号变更。

## 47实际执行结果

运维源码固定`b7019032368cb52a5f81dc62f7d75a4a5ba232b2`（包含父提交`9df7bf60`统一入口）。仅运维源码归档SHA `3882896b77b3f63dbd35bd1ff0116294faad0eb45b75f4e81ec020563a4d4b05`，传输包SHA `c459029108fc0adf9f1a2aba2d7b603e0dd5bb227f10b2640f1eb3190e2a31ed`，固定配置SHA `b6f933d1b13ce73651db0923234e44c7cc02bc3b7fc12b5ffdf8c841e0056a37`。没有装新timer或构建应用镜像。

首次入口遇既有监督器短暂占锁，在任何原任务保护采样、journal或配置写入之前退出；canonical仍为728原SHA，原日志保留。核实无事务步骤后，同一固定配置做一次有独立审计意图的锁拒绝重试，没有重放UNKNOWN步骤。实际事务PID11366同时持有三把锁，最终释放。

2026-10-23 06:41:56 CST完成，运维总UUID `d1d3fc84-2f86-455e-b11b-e9e7e03b6488`，五项原步骤全部ACK。canonical revision743，原始文件SHA `0267e22be07d3bd75075fc926c719621c1dcb1b9af261ecb472309c8f10761bd`，activeNormalBlueGreenReleaseId仍为`release47-saas-20261023-r1`；新运维record retired=[]，newWebInstances=0。回执SHA `525cc3a25036af389a807e86fba29ea84164c6b9caeb08d69bbb3eae209d7870`。

- 实际13952旁路与13052入口均完成五HTTP组405/404/400/404/404；真实Router与宿主netns相同，原管理token在内存匹配当前Web，原进程/env前后相同。安全空对象在任何容量租约操作前400，不触发acquire/release。
- 全闭包真实Nginx语法检查与平滑reload通过；既有公开配置文件字节不变，只增加loopback精确入口，配置SHA `39377f0edde29358f30c8f6bd7e752f3997c1c336a99b1ce2a8bb73fb674be67`。13952自有旁路优雅退出，监听消失，没有全局kill。
- 六个原05保护点全部MATCH：established、before-baseline、sidecar-ready、before-private-config、after-private-switch、final。模型135/计费8保持，原R1完整record、两旧槽stopped/restart=no及历史根状态不变。
- 现Web/Worker仍为08c7751d…/4bb56aa5…，同Image db8004f1…、5b源码、1792705393版号及2GiB/1GiB预算，启动时间分别仍22:02:18/22:02:26 UTC，没有重启或叠加Web。
- 新维护report SHA `64b9e2080cc5b90f1c15cf2943431322d4d3e5e4d6f0cfd086c375a9e486a769`绑定runtimeRecovery并明确supersedes旧R1 report，旧文件不覆盖。当前完整gateway dump SHA `929a8fdb090fb69a059c9ef2e32fd70fd9a1a511351d0147ca7709f53e445bf9`与manifest一致，逻辑manifest hash匹配；只读Supervisor.once通过，无start/resume或原journal写入。
- 最终独立只读比较确认：canonical仅增加本次record、revision、批准的manifest/report指针，原manifest只改变gateway digest。公网严格TLS健康/版号200，DB健康、固定程序一致。供应商调用0、生成POST0、租约命令0；生产未实际触发受控维护。

私有服务器证据根为`/opt/naumi-staging/evidence/release47-saas-capacity-binding-20261023-r1`，包括原始备份、原锁拒绝日志、实际三锁步骤、协议探测、保护回执、维护材料与`CAPACITY_BINDING_RECEIPT.json`/`POST_ACCEPTANCE.json`。不向仓库提交业务行或token。
