# 47 画布图片稳定性版本发布

## 授权与候选

- 用户本轮明确要求“上线新版本，我已命令用户暂停使用”，本轮 47 发布暂停决定解除；不扩展到其他站点。
- 开始时 origin/main 为 `7e664c7a94c4aa3bbf792cad02ca22f4cd3e9514`，包含已合入的画布图片显示修复与并发完成的性能改动；不合入重构分支。
- 使用独立工作树，保留共享目录 20 项既有修改。公开目录追加当前候选版号 `1793180474` 的五条图片显示与项目封面更新，双语/公开目录校验通过。
- 模块职责：本轮只追加发布说明与操作记录，不修改图片缓存、生成、积分、供应商、恢复或计费规则。镜像从 clean main 的固定提交构建。

## 现场进展

- 发布前读取当前仓库协议、既有 P0 发布控制器及恢复监督契约；计划保留三锁、备份、候选 draining、同镜像 Worker、实际 resume、静态 union、排空与旧槽退役验收。
- 初始 SSH 两次在握手阶段超时，TCP 22 可连接但没有 banner；HTTPS 版本接口返回响应头后正文超时，HTTP 80 仍返回 308。此时尚未取得发布锁，远程工具包未成功传入，未创建候选、未改网关或停止任何线上实例。
- 用户已暂停使用不作为任务排空证明；线上执行状态、租约、Worker 与 UNKNOWN 仍需成功连接后取得新鲜证据。
- 在排查连接期间继续准备固定版本本地镜像；构建与隔离验收不当作已上线。具体最终结果、命令和回执保存在 `E:/Workspace/naumi/output/release47-image-stability-20261028-r1/`。

## 最终固定与实际完成

- 用户随后提供已构建固定候选：main `7e664c7a94c4aa3bbf792cad02ca22f4cd3e9514`、版号 `1793175770`、镜像 `sha256:5c4f054c4cdaed64407d5c08ac3df36748ba58e1f6125dc237d8f27d22e32da3`。核验它已同时包含 `1865d01f` 性能修复与 `c0d8392a` 图片显示修复后直接复用，没有重复构建。
- 本线程追加的 `c05cd413` 只有内部记录和公开目录。用户指定镜像未包含版号 `1793180474` 的后补目录，本次实际展示的是镜像内 25 版记录；不把后补说明伪称已随本次上线。
- **北京时间 2026-10-28 18:29:05 本轮实际 COMPLETE**，canonical revision `1072`。新 Web `naumi47-web-image-stability-20261028-r1` 使用回环端口 `13121`；新 Worker `naumi47-worker-video-family-image-stability-20261028-r1` 与 Web 同镜像/commit。
- 三锁覆盖备份、创建、网关切换、Worker 交接、任务保全与旧槽退役。原 Web/Worker 均已停止且 restart=no；新 Web open，新 Worker paused=false、unresolvedTicks=0，已取得真实 completed tick，媒体端 draining=false。
- 新 Worker 的 Web origin、新 Web 自身 loopback 和媒体 origin 对齐本轮新 pair。恢复服务先更新钉定再启用；释放发布锁后 systemd 实际执行 Result=success / ExecMainStatus=0，timer active，未拉起历史 af22 实例。
- 原始数据库备份 1,345,267,399 bytes，可读目录校验通过；没有恢复数据库。任务保全 accountedPreservationVerified=true，配置/账务基线保持。
- 重启前旧 boot 的 564 条活动观察逐行/整集合哈希保持；当前新 Web unknown=0。原 Worker 的一个 503 UNKNOWN tick 没有服务端受理记录，且原进程无在途 tick、业务租约和事务；精确记录并保留原 UNKNOWN，不伪造 completed，随后由独立新 Worker 正常接管。不是删掉历史未知记录冒充排空。
- 公网探测最终 164 次均 HTTP 200；36 个新版静态资源通过，8 个既有资源字节保持。新旧静态 union 与回切 closure 均经语法/字节核验。匿名实际浏览器页面 pageerror=0，截图已打开检查；不是实际付费生成全链路验收。
- 现有账号会话、项目/画布相关 GET 与后台认证 GET 在候选验证通过。未主动提交收费测试任务，未重放付费任务、强刷用户页面或覆盖画布。

## 失败保留与回滚材料

- SSH 失败发生在服务器重启前，尚无部署修改。工具会话中断后重新取得三锁，未沿用旧锁声明。
- 首次操作稿的终端哈希抄录多了一位；原生会话 TTL 被缩短后触发 issuedAt 推导的撤销校验；新 Worker 名称未满足既有 combined-media 命名规则。这三次原始失败保留，分别校正为实际文件哈希、原生固定 TTL、既有命名格式。名称校验失败发生在 docker create 之前，已用无候选容器证据记为 REJECTED_PRECONDITION，原 UUID 保留，新操作另记 UUID；未复做已完成的备份或镜像导入。
- `MODIFIED_FILE.tar.gz` 是本次实际镜像归档，`DIFF_FILE.patch` 是 e2217c9 → 7e664c7a 的程序差异；`VERIFICATION.txt` 记录完整证据。可执行 `ROLLBACK.sh` 仅对独立副本验证回切到 13120 且保留新旧静态 union，生产保持新版。
- 实际生产回滚未执行；旧 Worker 原 UNKNOWN 保留，因此真实回切需重新证明排空与 Worker 交接，不直接 resume 原未知 Worker。原镜像、配置与数据库备份保留。
- 本地证据：`E:/Workspace/naumi/output/release47-image-stability-20261028-r1/`；服务器证据：`/opt/naumi-staging/evidence/release47-image-stability-20261028-r1/`。
