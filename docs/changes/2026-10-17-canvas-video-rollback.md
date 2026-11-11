# 画布视频固定 Linux 兼容与回滚验收

## 当前结果

应用条件已完成 34/34、55 份注册证据；这表示批准的隔离供应商范围内应用验收完成，不表示正式供应商出片或生产交付完成。业务候选仍为 e997b290b39fc9df63e4c3b6387fa008b7b0e18d / 1792200281，后续本批仅修改验收工具、索引和文档。生产发布编排、锁内备份/切换、线上验收和最终交接继续。

## 103 实时基线与连接

2026-10-17 02:08—02:10 UTC，通过交接中已有的 SSH direct-tcpip 中继读取 103；中继不执行远程命令、不修改配置。103 独立认证及两端 pinned known-host 校验保持，原私钥不改权限，临时私钥副本完成后清理。直连及本机 SOCKS 仍 SSH banner EOF，失败记录保留。

- 103 machine-id 去换行 SHA256：26721373f7ecea7a5a9173a43bb017cd362d1f7ed9864b402874576a9e4fee35。
- UI/desktop/enterprise 仍 8af8ee6 / 1791975598，13039/40/41。
- 核心 App/原 Worker 为 c05a923 / 1791911575，镜像 cd344d9164c29b8a8bf318d5af160ed3f2abda3075e3b56112e2d987963a8cd3；上传修补核心 13038 镜像 5aa9408f331996f4773743dd96c751cb0ef1df43ddc8cbbb26fa56e2ccd9691c。
- 企业旧 API 13027 为 43cccd5。Fleet 13062 保持独立。
- 38 个容器含停止实例；MemAvailable 3143296 KiB，SwapFree 1485820 KiB，磁盘约 50% / 61.6 GB 可用。两把锁当时 FREE；没有持锁、切流或部署。

完整本地私有捕获为 E:/workspace/naumi/output/canvas-video-fusion-20261013/inspect103-current.json，包含当前 Nginx 完整闭包及编译身份。发布时必须锁内刷新，不能复用该时刻作为最终 CAS 基线。

只读流式导出 103 上传修补核心镜像，未在服务器落包或停止服务。压缩包 135179736 字节、SHA256 994b0a93431b5de1b1e1eb687fda6a978eb036cfda63ac890699e2b134cf7d89。导入本机 Docker 后再次核对实际 image ID、SOURCE_COMMIT 和 BUILD_VERSION；不把 8af UI 的旧版演练冒充核心 c05 的回滚证明。

## 真正旧版数据起点与修正记录

第一批 8af 编译产物往返和恢复副本已通过，但不是实际 c05 核心。换入 103 当前核心后，使用新版种子出现 CONFIG_UNAVAILABLE：新版种子会初始化旧版不兼容的计费/能力数据。最终改用固定 c05 原版 fixture.ts、原版源码及 tsconfig 建立旧配置和账号；既有 Linux 依赖只作为工具，运行 App 始终使用导入的实际编译产物。

旧编译产物先在独立空 namespace 初始化表；在旧结构写入账号、账本、false/0 设置及已完成任务作为历史保护样本。原版种子完成后，旧 App 实际报价、生成并完成一条隔离供应商任务，再停 App；使用 PostgreSQL pg_dump 自定义格式导出、pg_restore -l 验证后恢复到另一独立标记数据库。保持进程内原测试密钥、Router 与私有对象服务，新旧 App 切换到恢复数据库，未回灌原库。

升级后旧 534 列全部保留且类型一致，新 692 列；旧行每个既有字段逐项不变。保护指纹要求每张旧表完全相同，新增表仅允许空表，不将新增合法空表当旧配置被修改；对应失败断言和原始日志保留。

## 实际通过的行为

最终回执：工作树 output/canvas-video-fusion-20261013/checkpoint-d/linux-e997b29/rollback-c05.json；原始运行 rollback-d27a18fa-5f1f-4534-8f6b-303a4242e01a，外部 run-fNfhJ9Mu。备份恢复目录 restore-0116c5a310824477b407675185908797，备份 SHA256 82d908befe9ef789a1c762a4476b3fdd6bae9852f3ad762ad2cbb6a7098a0e3d。

- UID1001、production：c05 → e997 → c05 → e997，实际版本逐次核对。
- 老任务完整冻结参数及数据不变，旧账号/积分/账本/模型/计费/密钥记录指纹保持；原始字段 false、0 与完整文字保持。
- 私有原图与原视频 SHA、Range206；匿名401、另一账号404。实际合法签名先成功，篡改403、实际到期后403；过期对象 URL 不影响重新鉴权的拥有者媒体路径。
- 旧计费版本不变时，新版真实抽帧完成、PNG 字节 SHA 和另账号404通过，费用0。
- 新版接受后回执不确定的任务保持 needs_attention；回旧版读取再升级并运行两个真实 tick，不重新提交、不重复结算。
- 媒体 Worker 排空与恢复；内核 chroot/seccomp、抽帧/裁剪/进度取消的真实固定镜像证明仍为 sandbox-20261017.json，与 SDK fixture 媒体模式分开。
- verify-video-fusion-rollback-check.py --check 在只读事务核对实际新旧 image、源码/备份哈希、fixture DB 标记、旧版能力键兼容、活动任务0及冻结表哈希不变。它是隔离演练检查器，不能用其通过冒充生产回滚脚本已安装。

正式供应商调用0、真实视频质量未验。融合安全复核脚本（已随来源标注清理移除）还复核原管理员只读、完整计费及实际发布配置/重启后的阶段冻结回执；S01闭合，CI单轮全绿不作声明。

## 新上下文复核及补强

首次 Native review 因 terminal helper 启动失败未读到源码，不作通过。后续 Node 只读完整复核四份逐行源码，实际发现四处验收缺口：冻结表 app_video_model_defaults 未纳入、任务比对缺少完整执行/计费字段、回旧版时没有真实 tick、计费汇总只看部分 PASS 文本。四项均已修正：新增单独拥有者限定的完整任务行读取，保留普通 taskPersistence 接口；旧行逐既有字段比对，held 任务全行比对；旧 runtime 实际两个 tick 后再次核对供应商与账单；计费完整终态回执 exitCode=0、命令、日志名和 SHA 全部关联。

补强后实际恢复副本往返集中验收再次 exit0，最新回执记录旧版 tick、完整任务行及冻结表三个明确标记。完整 TypeScript、Python 编译、safety 聚合和34项应用审核通过，55份注册证据。Node新上下文修正复核61150 exit0，读取445行/四文件并逐SHA匹配，结论 No actionable findings in this correction scope；回执 rollback-review-corrections-verdict.txt 保留。该审阅不替代生产验收。

## 仍需完成的生产工作

1. 现有 release_maintenance_session.py 已支持103拓扑，但授权适配仍固定为10月16日维护窗口，不能伪造日期或借用另一任务的ACK。本目标已有用户直接发布授权，应补103本目标专用入口及相应校验，无需重复询问用户。
2. 该会话尚未将新媒体 Worker 的生命周期、私有绑定、共享 scratch、额外内存预算和回滚纳入。旧 prepare-media-worker.sh 默认3 GiB，不能在当前约3 GiB可用内存时直接叠加三 Web 或把该预算漏算；需要结合已准备的明确单 Web 三 UI 拓扑与受控旧 UI 退役，保留所有旧静态及恢复材料。
3. 从最新 main/实况生成本轮静态并集与四态网关 CAS，保留 Fleet、企业/desktop API、私有媒体、上传请求体补丁和全部正式数据/配置。生产 App/Worker/媒体 Worker 同业务版本。
4. 完成控制器变更的集中验收与新上下文复核，再持两锁刷新基线、可读备份、候选及回滚检查、切换和线上受影响功能验收。当前 delivery gates 仍 pending，目标保持 active。
